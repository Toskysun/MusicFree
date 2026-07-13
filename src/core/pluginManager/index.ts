import {
    emptyFunction,
    localPluginHash,
    localPluginPlatform,
} from "@/constants/commonConst";
import pathConst from "@/constants/pathConst";
import {
    IInstallPluginConfig,
    IInstallPluginResult,
    IPluginManager,
} from "@/types/core/pluginManager";
import { removeAllMediaExtra } from "@/utils/mediaExtra";
import axios from "axios";
import { compare } from "compare-versions";
import EventEmitter from "eventemitter3";
import { readAsStringAsync } from "expo-file-system";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { nanoid } from "@/utils/nanoid";
import { useEffect, useState } from "react";
import { ToastAndroid } from "react-native";
import { copyFile, readDir, readFile, unlink, writeFile } from "react-native-fs";
import { errorLog } from "../../utils/log";
import pluginMeta from "./meta";
import { localFilePlugin, Plugin, PluginState } from "./plugin";
import i18n from "../i18n";
import getOrCreateMMKV from "@/utils/getOrCreateMMKV";
import { safeParse } from "@/utils/jsonUtil";
import { IInjectable } from "@/types/infra";
import { IAppConfig } from "@/types/core/config";
import delay from "@/utils/delay";

const pluginsAtom = atom<Plugin[]>([]);
const pluginCacheStore = getOrCreateMMKV("plugin.cache");

const ee = new EventEmitter<{
    "order-updated": () => void;
    "enabled-updated": (pluginName: string, enabled: boolean) => void;
}>();

class PluginManager implements IPluginManager, IInjectable {
    private appConfigService!: IAppConfig;

    injectDependencies(config: IAppConfig): void {
        this.appConfigService = config;
    }

    /**
     * 获取当前存储的插件列表
     * @returns 插件实例数组
     */
    private getPlugins() {
        return getDefaultStore().get(pluginsAtom);
    }

    /**
     * 更新存储中的插件列表
     * @param plugins - 要设置的插件实例数组
     */
    private setPlugins(plugins: Plugin[]) {
        getDefaultStore().set(pluginsAtom, plugins);

        // 清理缓存中已卸载的插件
        const cachedKeys = pluginCacheStore.getAllKeys();
        cachedKeys.forEach(key => {
            if (!plugins.find(it => it.path === key)) {
                pluginCacheStore.remove(key);
            }
        });

        plugins.forEach(it => {
            this.updatePluginCache(it);
        });
    }

    private updatePluginCache(plugin: Plugin) {
        if (plugin.path && plugin.state === PluginState.Mounted) {
            // Never cache live functions — JSON drops them and left a stub
            // that looked "mounted" without getMusicDetailPageUrl etc.
            const serializableInstance: Record<string, unknown> = {
                platform: plugin.instance.platform,
                version: plugin.instance.version,
                author: plugin.instance.author,
                srcUrl: plugin.instance.srcUrl,
                primaryKey: plugin.instance.primaryKey,
                supportedSearchType: plugin.instance.supportedSearchType,
                supportedQualities: plugin.instance.supportedQualities,
                cacheControl: plugin.instance.cacheControl,
                description: plugin.instance.description,
                hints: plugin.instance.hints,
            };
            pluginCacheStore.set(
                plugin.path,
                JSON.stringify({
                    name: plugin.name,
                    hash: plugin.hash,
                    path: plugin.path,
                    instance: serializableInstance,
                    supportedMethods: [...plugin.supportedMethods],
                }),
            );
        }
    }

    /** Lazy-load plugins by default (faster cold start). */
    private isLazyLoadPluginEnabled(): boolean {
        return this.appConfigService.getConfig("basic.lazyLoadPlugin") ?? true;
    }

    /**
     * 初始化插件管理器，从文件系统加载所有插件
     * 读取插件目录中的所有.js文件并创建插件实例
     * @throws 如果插件初始化失败则抛出异常
     */
    async setup() {
        try {
            await pluginMeta.migratePluginMeta();
            const pluginsFileItems = await readDir(pathConst.pluginPath);
            const jsFiles = pluginsFileItems.filter(
                item =>
                    item.isFile() &&
                    (item.name?.endsWith?.(".js") ||
                        item.path?.endsWith?.(".js")),
            );

            const lazyEnabled = this.isLazyLoadPluginEnabled();
            const allPlugins: Array<Plugin> = [];
            let fullMountCount = 0;

            // Phase 1: build stubs (lazy) or read code. I/O for uncached plugins
            // can run in parallel; Hermes Function compile stays sequential below.
            type LoadPlan =
                | { kind: "lazy"; path: string; lazyProps: any }
                | { kind: "full"; path: string; code: string }
                | { kind: "skip" };

            const plans = await Promise.all(
                jsFiles.map(async (pluginFileItem): Promise<LoadPlan> => {
                    try {
                        if (
                            lazyEnabled &&
                            pluginCacheStore.contains(pluginFileItem.path)
                        ) {
                            const lazyProps = safeParse(
                                pluginCacheStore.getString(pluginFileItem.path),
                            );
                            if (lazyProps?.name && lazyProps?.hash) {
                                lazyProps.loadFuncCode = async () =>
                                    await readFile(pluginFileItem.path, "utf8");
                                lazyProps.path = pluginFileItem.path;
                                return {
                                    kind: "lazy",
                                    path: pluginFileItem.path,
                                    lazyProps,
                                };
                            }
                        }
                        const code = await readFile(
                            pluginFileItem.path,
                            "utf8",
                        );
                        return {
                            kind: "full",
                            path: pluginFileItem.path,
                            code,
                        };
                    } catch (pluginError: any) {
                        errorLog("单个插件加载失败", {
                            path: pluginFileItem.path,
                            message: pluginError?.message ?? pluginError,
                        });
                        return { kind: "skip" };
                    }
                }),
            );

            // Phase 2: construct Plugin instances (lazy is cheap; full mounts compile).
            for (let i = 0; i < plans.length; ++i) {
                const plan = plans[i];
                if (plan.kind === "skip") {
                    continue;
                }

                let plugin: Plugin;
                let isLazyLoad = false;
                try {
                    if (plan.kind === "lazy") {
                        isLazyLoad = true;
                        plugin = new Plugin(null, plan.path, plan.lazyProps);
                    } else {
                        plugin = new Plugin(plan.code, plan.path);
                        fullMountCount += 1;
                        // Yield only when compiling real plugin sandboxes.
                        if (fullMountCount > 0 && fullMountCount % 2 === 0) {
                            await delay(0, true);
                        }
                    }
                } catch (pluginError: any) {
                    errorLog("单个插件实例化失败", {
                        path: plan.path,
                        message: pluginError?.message ?? pluginError,
                    });
                    continue;
                }

                const _pluginIndex = allPlugins.findIndex(
                    p => p.hash === plugin.hash,
                );
                if (_pluginIndex !== -1) {
                    continue;
                }
                if (plugin.state === PluginState.Mounted || isLazyLoad) {
                    allPlugins.push(plugin);
                }
            }

            this.setPlugins(allPlugins);

            // Warm up lazy plugins in the background (enabled first).
            // Shorter delay than 10s so first search/play is less cold, without
            // blocking the splash screen.
            void this.warmUpLazyPlugins(allPlugins);
        } catch (e: any) {
            ToastAndroid.show(
                `插件初始化失败:${e?.message ?? e}`,
                ToastAndroid.LONG,
            );
            errorLog("插件初始化失败", e?.message);
            throw e;
        }

        Plugin.injectDependencies(this);
    }

    /** Mount lazy plugins after UI is up; prefer enabled plugins. */
    private async warmUpLazyPlugins(allPlugins: Plugin[]) {
        try {
            await delay(2_000, true);
            const pending = allPlugins.filter(
                p => p.state === PluginState.Initializing,
            );
            if (!pending.length) {
                return;
            }
            // Enabled plugins first so search tabs / play restore hit hot path.
            pending.sort((a, b) => {
                const ae = pluginMeta.isPluginEnabled(a.name) ? 0 : 1;
                const be = pluginMeta.isPluginEnabled(b.name) ? 0 : 1;
                return ae - be;
            });
            for (let i = 0; i < pending.length; ++i) {
                const plugin = pending[i];
                if (plugin.state !== PluginState.Initializing) {
                    continue;
                }
                try {
                    await plugin.ensureMounted();
                    this.updatePluginCache(plugin);
                } catch (e: any) {
                    errorLog("插件后台预热失败", {
                        name: plugin.name,
                        message: e?.message ?? e,
                    });
                }
                // Keep UI responsive between large sandboxes.
                if (i < pending.length - 1) {
                    await delay(50, true);
                }
            }
        } catch (e: any) {
            errorLog("插件后台预热异常", e?.message ?? e);
        }
    }

    /**
     * 从本地文件安装插件
     * @param pluginPath - 插件文件路径
     * @param config - 安装配置选项
     * @param config.notCheckVersion - 为true时跳过版本检查
     * @param config.useExpoFs - 为true时使用Expo文件系统代替React Native的文件系统
     * @returns 安装结果，包含成功状态和相关信息
     */
    async installPluginFromLocalFile(
        pluginPath: string,
        config?: IInstallPluginConfig & {
            useExpoFs?: boolean;
        },
    ): Promise<IInstallPluginResult> {
        let funcCode: string;
        if (config?.useExpoFs) {
            funcCode = await readAsStringAsync(pluginPath);
        } else {
            funcCode = await readFile(pluginPath, "utf8");
        }

        if (funcCode) {
            const plugin = new Plugin(funcCode, pluginPath);
            let allPlugins = [...this.getPlugins()];

            const _pluginIndex = allPlugins.findIndex(
                p => p.hash === plugin.hash,
            );
            if (_pluginIndex !== -1) {
                // 静默忽略
                return {
                    success: true,
                    message: "插件已安装",
                    pluginName: plugin.name,
                    pluginHash: plugin.hash,
                };
            }
            const oldVersionPlugin = allPlugins.find(
                p => p.name === plugin.name,
            );
            if (oldVersionPlugin && !config?.notCheckVersion) {
                if (
                    compare(
                        oldVersionPlugin.instance.version ?? "",
                        plugin.instance.version ?? "",
                        ">",
                    )
                ) {
                    return {
                        success: false,
                        message: "已安装更新版本的插件",
                        pluginName: plugin.name,
                        pluginHash: plugin.hash,
                    };
                }
            }

            if (plugin.state === PluginState.Mounted) {
                const fn = nanoid();
                if (oldVersionPlugin) {
                    allPlugins = allPlugins.filter(
                        _ => _.hash !== oldVersionPlugin.hash,
                    );
                    try {
                        await unlink(oldVersionPlugin.path);
                    } catch {}
                }
                const _pluginPath = `${pathConst.pluginPath}${fn}.js`;
                await copyFile(pluginPath, _pluginPath);
                plugin.path = _pluginPath;
                allPlugins = allPlugins.concat(plugin);
                this.setPlugins(allPlugins);

                return {
                    success: true,
                    pluginName: plugin.name,
                    pluginHash: plugin.hash,
                };
            }
            return {
                success: false,
                message: "插件无法解析",
            };
        }
        return {
            success: false,
            message: "插件无法识别",
        };
    }

    /**
     * 从URL安装插件
     * @param url - 下载插件的URL
     * @param config - 安装配置选项
     * @param config.notCheckVersion - 为true时跳过版本检查
     * @returns 安装结果，包含成功状态和相关信息
     */
    async installPluginFromUrl(
        url: string,
        config?: IInstallPluginConfig,
    ): Promise<IInstallPluginResult> {
        try {
            const funcCode = (
                await axios.get(url, {
                    headers: {
                        "Cache-Control": "no-cache",
                        Pragma: "no-cache",
                        Expires: "0",
                    },
                })
            ).data;
            if (funcCode) {
                const plugin = new Plugin(funcCode, "");
                let allPlugins = [...this.getPlugins()];
                const pluginIndex = allPlugins.findIndex(
                    p => p.hash === plugin.hash,
                );
                if (pluginIndex !== -1) {
                    // 静默忽略
                    return {
                        success: true,
                        message: "插件已安装",
                        pluginName: plugin.name,
                        pluginHash: plugin.hash,
                        pluginUrl: url,
                    };
                }
                const oldVersionPlugin = allPlugins.find(
                    p => p.name === plugin.name,
                );
                if (oldVersionPlugin && !config?.notCheckVersion) {
                    if (
                        compare(
                            oldVersionPlugin.instance.version ?? "",
                            plugin.instance.version ?? "",
                            ">",
                        )
                    ) {
                        return {
                            success: false,
                            message: "已安装更新版本的插件",
                            pluginName: plugin.name,
                            pluginHash: plugin.hash,
                            pluginUrl: url,
                        };
                    }
                }

                if (plugin.hash !== "") {
                    const fn = nanoid();
                    const _pluginPath = `${pathConst.pluginPath}${fn}.js`;
                    await writeFile(_pluginPath, funcCode, "utf8");
                    plugin.path = _pluginPath;
                    allPlugins = allPlugins.concat(plugin);
                    if (oldVersionPlugin) {
                        allPlugins = allPlugins.filter(
                            _ => _.hash !== oldVersionPlugin.hash,
                        );
                        try {
                            await unlink(oldVersionPlugin.path);
                        } catch {}
                    }
                    this.setPlugins(allPlugins);
                    return {
                        success: true,
                        pluginName: plugin.name,
                        pluginHash: plugin.hash,
                        pluginUrl: url,
                    };
                }
                return {
                    success: false,
                    message: "插件无法解析",
                    pluginUrl: url,
                };
            } else {
                return {
                    success: false,
                    message: "插件无法识别",
                    pluginUrl: url,
                };
            }
        } catch (e: any) {
            devLog("error", "URL安装插件失败", e, e?.message);
            errorLog("URL安装插件失败", e);

            if (e?.response?.statusCode === 404) {
                return {
                    success: false,
                    message: "插件不存在，请联系插件作者",
                    pluginUrl: url,
                };
            } else {
                return {
                    success: false,
                    message: e?.message ?? "",
                    pluginUrl: url,
                };
            }
        }
    }

    /**
     * 通过哈希值卸载插件
     * @param hash - 要卸载的插件哈希值
     */
    async uninstallPlugin(hash: string) {
        let plugins = [...this.getPlugins()];
        const targetIndex = plugins.findIndex(_ => _.hash === hash);
        devLog("info", "📤[插件管理器] 卸载插件", { targetIndex, hash });
        if (targetIndex !== -1) {
            try {
                const pluginName = plugins[targetIndex].name;
                await unlink(plugins[targetIndex].path);
                plugins = plugins.filter(_ => _.hash !== hash);
                this.setPlugins(plugins);
                // 防止其他重名
                if (plugins.every(_ => _.name !== pluginName)) {
                    removeAllMediaExtra(pluginName);
                }
            } catch {}
        }
    }

    /**
     * 卸载系统中的所有插件
     * 同时清理媒体额外数据并删除插件文件
     */
    async uninstallAllPlugins() {
        await Promise.all(
            this.getPlugins().map(async plugin => {
                try {
                    const pluginName = plugin.name;
                    await unlink(plugin.path);
                    removeAllMediaExtra(pluginName);
                } catch {}
            }),
        );
        this.setPlugins([]);

        /** 清除空余文件，异步做就可以了 */
        readDir(pathConst.pluginPath)
            .then(fns => {
                fns.forEach(fn => {
                    unlink(fn.path).catch(emptyFunction);
                });
            })
            .catch(emptyFunction);
    }

    /**
     * 使用插件的源URL更新插件
     * @param plugin - 要更新的插件实例
     * @throws 如果插件没有源URL或更新失败时抛出错误
     */
    async updatePlugin(plugin: Plugin) {
        const updateUrl = plugin.instance.srcUrl;
        if (!updateUrl) {
            throw new Error("没有更新源");
        }
        try {
            await this.installPluginFromUrl(updateUrl);
        } catch (e: any) {
            if (e.message === "插件已安装") {
                throw new Error(i18n.t("checkUpdate.error.latestVersion"));
            } else {
                throw e;
            }
        }
    }

    /**
     * 通过媒体项的平台信息获取对应的插件
     * @param mediaItem - 包含平台信息的媒体项
     * @returns 与媒体平台匹配的插件实例或undefined
     */
    getByMedia(mediaItem: ICommon.IMediaBase) {
        return this.getByName(mediaItem?.platform);
    }

    /**
     * 通过名称获取插件
     * @param name - 要查找的插件名称
     * @returns 匹配名称的插件实例或本地文件插件
     */
    getByName(name: string) {
        return name === localPluginPlatform
            ? localFilePlugin
            : this.getPlugins().find(_ => _.name === name);
    }

    /**
     * 通过哈希值获取插件
     * @param hash - 要查找的插件哈希值
     * @returns 匹配哈希的插件实例或本地文件插件
     */
    getByHash(hash: string) {
        return hash === localPluginHash
            ? localFilePlugin
            : this.getPlugins().find(_ => _.hash === hash);
    }

    /**
     * 获取所有已启用的插件
     * @returns 已启用的插件实例数组
     */
    getEnabledPlugins() {
        return this.getPlugins().filter(it =>
            pluginMeta.isPluginEnabled(it.name),
        );
    }

    /**
     * 获取按顺序排序的所有插件
     * @returns 按定义顺序排序的插件实例数组
     */
    getSortedPlugins() {
        const order = pluginMeta.getPluginOrder();
        return [...this.getPlugins()].sort((a, b) =>
            (order[a.name] ?? Infinity) - (order[b.name] ?? Infinity) < 0
                ? -1
                : 1,
        );
    }

    /**
     * 获取所有支持搜索功能的已启用插件
     * @param supportedSearchType - 可选的搜索媒体类型过滤器
     * @returns 可搜索的插件实例数组
     */
    getSearchablePlugins(supportedSearchType?: ICommon.SupportMediaType) {
        return this.getPlugins().filter(
            it =>
                pluginMeta.isPluginEnabled(it.name) &&
                it.supportedMethods.has("search") &&
                (supportedSearchType && it.instance.supportedSearchType
                    ? it.instance.supportedSearchType.includes(
                        supportedSearchType,
                    )
                    : true),
        );
    }

    /**
     * 获取所有支持搜索功能的已启用插件，并按顺序排序
     * @param supportedSearchType - 可选的搜索媒体类型过滤器
     * @returns 按顺序排序的可搜索插件实例数组
     */
    getSortedSearchablePlugins(supportedSearchType?: ICommon.SupportMediaType) {
        const order = pluginMeta.getPluginOrder();
        return [...this.getSearchablePlugins(supportedSearchType)].sort(
            (a, b) =>
                (order[a.name] ?? Infinity) - (order[b.name] ?? Infinity) < 0
                    ? -1
                    : 1,
        );
    }

    /**
     * 获取所有实现特定功能的已启用插件
     * @param ability - 要检查的方法/功能名称
     * @returns 具有指定功能的插件实例数组
     */
    getPluginsWithAbility(ability: keyof IPlugin.IPluginInstanceMethods) {
        return this.getPlugins().filter(
            it =>
                pluginMeta.isPluginEnabled(it.name) &&
                it.supportedMethods.has(ability),
        );
    }

    /**
     * 获取所有实现特定功能的已启用插件，并按顺序排序
     * @param ability - 要检查的方法/功能名称
     * @returns 按顺序排序的具有指定功能的插件实例数组
     */
    getSortedPluginsWithAbility(ability: keyof IPlugin.IPluginInstanceMethods) {
        const order = pluginMeta.getPluginOrder();
        return [...this.getPluginsWithAbility(ability)].sort((a, b) =>
            (order[a.name] ?? Infinity) - (order[b.name] ?? Infinity) < 0
                ? -1
                : 1,
        );
    }

    /**
     * 设置插件的启用状态并发送事件通知
     * @param plugin - 要修改的插件实例
     * @param enabled - 是否启用插件
     */
    setPluginEnabled(plugin: Plugin, enabled: boolean) {
        ee.emit("enabled-updated", plugin.name, enabled);
        pluginMeta.setPluginEnabled(plugin.name, enabled);
    }

    /**
     * 检查插件是否已启用
     * @param plugin - 要检查的插件实例
     * @returns 表示插件是否启用的布尔值
     */
    isPluginEnabled(plugin: Plugin) {
        return pluginMeta.isPluginEnabled(plugin.name);
    }

    /**
     * 设置插件的排序顺序并发送顺序更新事件
     * @param sortedPlugins - 按期望顺序排列的插件实例数组
     */
    setPluginOrder(sortedPlugins: Plugin[]) {
        const orderMap: Record<string, number> = {};
        sortedPlugins.forEach((plugin, index) => {
            orderMap[plugin.name] = index;
        });
        pluginMeta.setPluginOrder(orderMap);
        ee.emit("order-updated");
    }

    setUserVariables(plugin: Plugin, userVariables: Record<string, string>) {
        pluginMeta.setUserVariables(plugin.name, userVariables);
    }

    getUserVariables(plugin: Plugin) {
        return pluginMeta.getUserVariables(plugin.name);
    }

    setAlternativePluginName(plugin: Plugin, alternativePluginName: string) {
        pluginMeta.setAlternativePlugin(plugin.name, alternativePluginName);
    }

    getAlternativePluginName(plugin: Plugin) {
        return pluginMeta.getAlternativePlugin(plugin.name);
    }

    getAlternativePlugin(plugin: Plugin) {
        const alternativePluginName = this.getAlternativePluginName(plugin);
        if (alternativePluginName) {
            return this.getByName(alternativePluginName);
        }
        return null;
    }
}

const pluginManager = new PluginManager();

export const usePlugins = () => useAtomValue(pluginsAtom);

export function useSortedPlugins() {
    const plugins = useAtomValue(pluginsAtom);
    const [sortedPlugins, setSortedPlugins] = useState<Plugin[]>(
        pluginManager.getSortedPlugins(),
    );

    useEffect(() => {
        const callback = () => {
            const order = pluginMeta.getPluginOrder();
            setSortedPlugins(
                [...plugins].sort((a, b) =>
                    (order[a.name] ?? Infinity) - (order[b.name] ?? Infinity) <
                    0
                        ? -1
                        : 1,
                ),
            );
        };

        ee.on("order-updated", callback);
        callback();
        return () => {
            ee.off("order-updated", callback);
        };
    }, [plugins]);

    return sortedPlugins;
}

export function usePluginEnabled(plugin: Plugin) {
    const [enabled, setEnabled] = useState(
        pluginManager.isPluginEnabled(plugin),
    );

    useEffect(() => {
        const callback = (pluginName: string, _enabled: boolean) => {
            if (pluginName === plugin?.name) {
                setEnabled(_enabled);
            }
        };

        ee.on("enabled-updated", callback);
        return () => {
            ee.off("enabled-updated", callback);
        };
    }, [plugin]);

    return enabled;
}

export default pluginManager;
export { Plugin };
