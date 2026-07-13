import "react-native-get-random-values";

import { getCurrentDialog, showDialog } from "@/components/dialogs/useDialog.ts";
import { ImgAsset } from "@/constants/assetsConst";
import { emptyFunction, localPluginHash, supportLocalMediaType } from "@/constants/commonConst";
import pathConst from "@/constants/pathConst";
import Config from "@/core/appConfig";
import downloader, { DownloadFailReason, DownloaderEvent } from "@/core/downloader";
import downloadNotificationManager from "@/core/downloadNotificationManager";
import LocalMusicSheet from "@/core/localMusicSheet";
import lyricManager from "@/core/lyricManager";
import musicHistory from "@/core/musicHistory";
import MusicSheet from "@/core/musicSheet";
import PluginManager from "@/core/pluginManager";
import Theme from "@/core/theme";
import TrackPlayer from "@/core/trackPlayer";
import NativeUtils from "@/native/utils";
import { checkAndCreateDir } from "@/utils/fileUtils";
import { appendStartupBreadcrumb, errorLog, markStartupSession, trace, devLog } from "@/utils/log";
import { IPerfLogger, perfLogger } from "@/utils/perfLogger";
import PersistStatus from "@/utils/persistStatus";
import Toast from "@/utils/toast";
import * as SplashScreen from "expo-splash-screen";
import {  Linking, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { PERMISSIONS, check, request } from "react-native-permissions";
import RNTrackPlayer, { AppKilledPlaybackBehavior, Capability } from "react-native-track-player";
import i18n from "@/core/i18n";
import bootstrapAtom from "./bootstrap.atom";
import { getDefaultStore } from "jotai";
import announcementService from "@/services/announcementService";


// 依赖管理
PluginManager.injectDependencies(Config);
musicHistory.injectDependencies(Config);
TrackPlayer.injectDependencies(Config, musicHistory, PluginManager);
downloader.injectDependencies(Config, PluginManager);
lyricManager.injectDependencies(TrackPlayer, Config, PluginManager);
MusicSheet.injectDependencies(Config);

devLog("info", "🚀[Bootstrap] 所有依赖注入完成");

function registerEarlyGlobalErrorHandlers() {
    try {
        ErrorUtils.setGlobalHandler((error, isFatal) => {
            void appendStartupBreadcrumb("global-error", {
                isFatal,
                message: error?.message,
                name: error?.name,
            });
            errorLog("未捕获的错误", {
                isFatal,
                message: error?.message,
                stack: error?.stack,
                name: error?.name,
            });
        });
    } catch {
    }
}


async function bootstrapImpl() {
    await appendStartupBreadcrumb("bootstrap-start");
    registerEarlyGlobalErrorHandlers();
    await appendStartupBreadcrumb("global-handler-registered");

    await SplashScreen.preventAutoHideAsync()
        .then(result =>
            devLog("info", "✅[Bootstrap] SplashScreen防自动隐藏成功", { result }),
        )
        .catch((error) => devLog("warn", "⚠️[Bootstrap] SplashScreen防自动隐藏失败", error)); // it's good to explicitly catch and inspect any error
    await appendStartupBreadcrumb("splashscreen-prevented");
    const logger = perfLogger();
    // 1. 检查权限
    if (Platform.OS === "android") {
        if (Platform.Version >= 30) {
            const hasPermission = await NativeUtils.checkStoragePermission();
            if (
                !hasPermission &&
                !PersistStatus.get("app.skipBootstrapStorageDialog")
            ) {
                showDialog("CheckStorage");
            }
        } else {
            const [readStoragePermission, writeStoragePermission] =
                await Promise.all([
                    check(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE),
                    check(PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE),
                ]);
            if (
                !(
                    readStoragePermission === "granted" &&
                    writeStoragePermission === "granted"
                )
            ) {
                await request(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
                await request(PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE);
            }
        }
    }
    await appendStartupBreadcrumb("permissions-checked", { platform: Platform.OS });
    logger.mark("权限检查完成");

    // 2. 数据初始化
    /** 初始化路径 */
    await setupFolder();
    await appendStartupBreadcrumb("folders-ready");
    trace("文件夹初始化完成");
    logger.mark("文件夹初始化完成");



    // 加载配置
    await Promise.all([
        Config.setup().then(() => {
            logger.mark("Config");
        }),
        MusicSheet.setup().then(() => {
            logger.mark("MusicSheet");
        }),
        musicHistory.setup().then(() => {
            logger.mark("musicHistory");
        }),
    ]);
    await appendStartupBreadcrumb("config-loaded");
    trace("配置初始化完成");
    logger.mark("配置初始化完成");

    // 检查用户协议
    if (!Config.getConfig("common.isAgreePact")) {
        devLog("info", "📜[Bootstrap] 用户尚未同意协议，显示许可协议");
        showDialog("PactDialog");
    }
    logger.mark("协议检查完成");

    // Theme + i18n before heavy media work so first paint tokens are ready.
    Theme.setup();
    logger.mark("主题初始化完成");
    i18n.setup();
    await appendStartupBreadcrumb("i18n-ready");
    logger.mark("语言模块初始化完成");

    // 加载插件（默认懒加载：有缓存时不编译沙箱，启动显著更快）
    await PluginManager.setup();
    await appendStartupBreadcrumb("plugins-ready");
    logger.mark("插件初始化完成");
    trace("插件初始化完成");

    await appendStartupBreadcrumb("trackplayer-init-start");
    try {
        await initTrackPlayer(logger);
        await appendStartupBreadcrumb("trackplayer-init-finished");
    } catch (err: any) {
        await appendStartupBreadcrumb("trackplayer-setup-error", {
            message: err?.message,
            name: err?.name,
        });
        // Initialize player later if startup restore fails.
        const bootstrapState = getDefaultStore().get(bootstrapAtom);

        if (bootstrapState.state === "Loading") {
            getDefaultStore().set(bootstrapAtom, {
                state: "TrackPlayerError",
                reason: err,
            });
        }
    }

    // Non-critical work must NOT block splash hide:
    // local scan, download notifications, plugin auto-update, announcements.
    void schedulePostBootstrapWork(logger).catch((error: any) => {
        void appendStartupBreadcrumb("post-bootstrap-error", {
            message: error?.message,
            name: error?.name,
        });
        errorLog("post-bootstrap work failed", error);
    });
    await appendStartupBreadcrumb("post-bootstrap-scheduled");

    await appendStartupBreadcrumb("bootstrap-impl-finished");
}

/**
 * Work that used to block cold start (local file validation, network wait for
 * announcements, download channel setup). Runs after critical path so splash
 * can hide ASAP.
 */
async function schedulePostBootstrapWork(logger: IPerfLogger) {
    // Yield once so bootstrap Done / SplashScreen.hide can run first.
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    try {
        await LocalMusicSheet.setup();
        trace("本地音乐初始化完成");
        logger.mark("本地音乐初始化完成");
        await appendStartupBreadcrumb("local-music-ready");
    } catch (error: any) {
        await appendStartupBreadcrumb("local-music-error", {
            message: error?.message,
            name: error?.name,
        });
        errorLog("local music setup failed", error);
    }

    try {
        await downloadNotificationManager.initialize();
        await appendStartupBreadcrumb("download-notification-ready");
        logger.mark("下载通知管理器初始化完成");
    } catch (error: any) {
        await appendStartupBreadcrumb("download-notification-error", {
            message: error?.message,
            name: error?.name,
        });
        errorLog(
            "Failed to initialize download notification manager",
            error,
        );
    }

    void extraMakeup().catch((error: any) => {
        void appendStartupBreadcrumb("extra-makeup-error", {
            message: error?.message,
            name: error?.name,
        });
        errorLog("extra makeup failed", error);
    });

    // Announcements: do not wait up to 7s for network on the critical path.
    void checkAnnouncementsInBackground().catch((error: any) => {
        devLog("warn", "⚠️[Bootstrap] 公告检查失败", error);
    });
}

function showAnnouncementSafely(
    announcement: IAnnouncement.IAnnouncementItem,
) {
    const tryShow = () => {
        const current = getCurrentDialog();
        if (!current?.name) {
            showDialog("AnnouncementDialog", { announcement });
            return true;
        }
        return false;
    };

    if (tryShow()) {
        return;
    }
    let attempts = 0;
    const maxAttempts = 40; // ~20s
    const timer = setInterval(() => {
        attempts += 1;
        if (tryShow() || attempts >= maxAttempts) {
            clearInterval(timer);
        }
    }, 500);
}

async function waitForConnectivity(timeoutMs = 5000) {
    try {
        const first = await NetInfo.fetch();
        if (first.isConnected && (first.isInternetReachable ?? true)) {
            return;
        }
    } catch {
        // ignore
    }
    await new Promise<void>(resolve => {
        let resolved = false;
        let unsubscribe: (() => void) | undefined;
        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                unsubscribe?.();
                resolve();
            }
        }, timeoutMs);
        unsubscribe = NetInfo.addEventListener(state => {
            if (
                !resolved &&
                state.isConnected &&
                (state.isInternetReachable ?? true)
            ) {
                resolved = true;
                clearTimeout(timer);
                unsubscribe?.();
                resolve();
            }
        });
    });
}

async function checkAnnouncementsInBackground() {
    devLog("info", "📢[Bootstrap] 后台检查在线公告", {
        platform: Platform.OS,
    });
    await waitForConnectivity(5000);
    const announcement = await announcementService.checkAnnouncements();
    if (announcement) {
        setTimeout(() => {
            showAnnouncementSafely(announcement);
        }, 1500);
    } else {
        setTimeout(async () => {
            try {
                const retryAnnouncement =
                    await announcementService.checkAnnouncements(true);
                if (retryAnnouncement) {
                    showAnnouncementSafely(retryAnnouncement);
                    devLog("info", "✅[Bootstrap] 二次公告检查命中");
                }
            } catch (e) {
                devLog("warn", "⚠️[Bootstrap] 二次公告检查失败", e);
            }
        }, 8000);
    }
    devLog("info", "✅[Bootstrap] 公告检查完成");
}

/** 初始化 */
async function setupFolder() {
    await Promise.all([
        checkAndCreateDir(pathConst.dataPath),
        checkAndCreateDir(pathConst.logPath),
        checkAndCreateDir(pathConst.cachePath),
        checkAndCreateDir(pathConst.pluginPath),
        checkAndCreateDir(pathConst.lrcCachePath),
        checkAndCreateDir(pathConst.downloadCachePath),
        checkAndCreateDir(pathConst.localLrcPath),
        checkAndCreateDir(pathConst.downloadPath).then(() => {
            checkAndCreateDir(pathConst.downloadMusicPath);
        }),
    ]);
}

export async function initTrackPlayer(logger?: IPerfLogger) {
    try {
        await RNTrackPlayer.setupPlayer({
            maxCacheSize:
                Config.getConfig("basic.maxCacheSize") ?? 1024 * 1024 * 512,
        });
    } catch (e: any) {
        if (
            e?.message !==
            "The player has already been initialized via setupPlayer."
        ) {
            throw e;
        }
    }
    logger?.mark("加载播放器");

    const capabilities = Config.getConfig("basic.showExitOnNotification")
        ? [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.Stop,
        ]
        : [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
        ];
    await RNTrackPlayer.updateOptions({
        icon: ImgAsset.logoTransparent,
        // Frequent updates for smooth word-by-word lyric animation (100ms interval)
        progressUpdateEventInterval: 0.1,
        android: {
            alwaysPauseOnInterruption: true,
            appKilledPlaybackBehavior:
                AppKilledPlaybackBehavior.ContinuePlayback,
        },
        capabilities: capabilities,
        compactCapabilities: capabilities,
        notificationCapabilities: [...capabilities, Capability.SeekTo],
    });
    logger?.mark("播放器初始化完成");
    trace("播放器初始化完成");

    await TrackPlayer.setupTrackPlayer();
    trace("播放列表初始化完成");
    logger?.mark("播放列表初始化完成");

    await lyricManager.setup();

    logger?.mark("歌词初始化完成");
}


/** 不需要阻塞的 */
async function extraMakeup() {
    // 自动更新
    try {
        if (Config.getConfig("basic.autoUpdatePlugin")) {
            const lastUpdated = PersistStatus.get("app.pluginUpdateTime") || 0;
            const now = Date.now();
            if (Math.abs(now - lastUpdated) > 86400000) {
                PersistStatus.set("app.pluginUpdateTime", now);
                const plugins = PluginManager.getEnabledPlugins();
                devLog("info", "🔄[Bootstrap] 插件自动更新", {
                    platform: Platform.OS,
                    count: plugins.length,
                });
                for (let i = 0; i < plugins.length; ++i) {
                    const srcUrl = plugins[i].instance.srcUrl;
                    if (srcUrl) {
                        // 静默失败
                        await PluginManager.installPluginFromUrl(srcUrl).catch(emptyFunction);
                    }
                }
            }
        }
    } catch { }

    async function handleLinkingUrl(url: string) {
        // 插件
        try {
            if (url.startsWith("musicfree://install/")) {
                const plugins = url
                    .slice(20)
                    .split(",")
                    .map(decodeURIComponent);
                await Promise.all(
                    plugins.map(it =>
                        PluginManager.installPluginFromUrl(it).catch(emptyFunction),
                    ),
                );
                Toast.success("安装成功~");
            } else if (url.endsWith(".js")) {
                PluginManager.installPluginFromLocalFile(url, {
                    notCheckVersion: Config.getConfig(
                        "basic.notCheckPluginVersion",
                    ),
                })
                    .then(res => {
                        if (res.success) {
                            Toast.success(`插件「${res.pluginName}」安装成功~`);
                        } else {
                            Toast.warn("安装失败: " + res.message);
                        }
                    })
                    .catch(e => {
                        devLog("warn", "⚠️[Bootstrap] 插件安装失败", e);
                        Toast.warn(e?.message ?? "无法识别此插件");
                    });
            } else if (supportLocalMediaType.some(it => url.endsWith(it))) {
                // 本地播放
                const musicItem = await PluginManager.getByHash(
                    localPluginHash,
                )?.instance?.importMusicItem?.(url);
                devLog("info", "🎵[Bootstrap] 导入本地音乐项目", musicItem);
                if (musicItem) {
                    TrackPlayer.play(musicItem);
                }
            }
        } catch { }
    }

    // 开启监听
    Linking.addEventListener("url", data => {
        if (data.url) {
            handleLinkingUrl(data.url);
        }
    });
    const initUrl = await Linking.getInitialURL();
    if (initUrl) {
        handleLinkingUrl(initUrl);
    }

    if (Config.getConfig("basic.autoPlayWhenAppStart")) {
        TrackPlayer.play();
    }
}


function bindEvents() {
    // 下载事件
    downloader.on(DownloaderEvent.DownloadError, (reason) => {
        if (reason === DownloadFailReason.NetworkOffline) {
            Toast.warn("当前无网络连接，请等待网络恢复后重试");
        } else if (reason === DownloadFailReason.NotAllowToDownloadInCellular) {
            if (getCurrentDialog()?.name !== "SimpleDialog") {
                showDialog("SimpleDialog", {
                    title: "流量提醒",
                    content: "当前非WIFI环境，为节省流量，请到侧边栏设置中打开【使用移动网络下载】功能后方可继续下载",
                });
            }
        }
    });

    downloader.on(DownloaderEvent.DownloadQueueCompleted, (errorCount) => {
        if (errorCount > 0) {
            Toast.warn(`下载队列结束，${errorCount} 个任务失败`);
        } else {
            Toast.success("下载任务已完成");
        }
    });
}

export default async function () {
    await markStartupSession("bootstrap-entry");

    try {
        getDefaultStore().set(bootstrapAtom, {
            "state": "Loading",
        });
        await bootstrapImpl();
        bindEvents();
        await appendStartupBreadcrumb("bootstrap-bind-events");
        getDefaultStore().set(bootstrapAtom, {
            "state": "Done",
        });
        await appendStartupBreadcrumb("bootstrap-done");
    } catch (e: any) {
        await appendStartupBreadcrumb("bootstrap-fatal", {
            message: e?.message,
            name: e?.name,
        });
        errorLog("初始化出错", e);
        if (getDefaultStore().get(bootstrapAtom).state === "Loading") {
            getDefaultStore().set(bootstrapAtom, {
                state: "Fatal",
                reason: e,
            });
        }
    }
    // 隐藏开屏动画
    devLog("info", "🎯[Bootstrap] 隐藏启动屏幕");
    await appendStartupBreadcrumb("splashscreen-hide");
    await SplashScreen.hideAsync();
}
