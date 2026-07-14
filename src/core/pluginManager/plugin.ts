import {
    CacheControl,
    internalSerializeKey,
    localPluginPlatform,
} from "@/constants/commonConst";
import pathConst from "@/constants/pathConst";
import Mp3Util from "@/native/mp3Util";
import Base64 from "@/utils/base64";
import delay from "@/utils/delay";
import { addFileScheme, getFileName, removeFileScheme } from "@/utils/fileUtils";
import { getMediaExtraProperty, patchMediaExtra } from "@/utils/mediaExtra";
import {
    buildFallbackMusicDetailUrl,
    getLocalPath,
    isSameMediaItem,
    resetMediaItem,
} from "@/utils/mediaUtils";
import notImplementedFunction from "@/utils/notImplementedFunction.ts";
import type { IPluginManager } from "@/types/core/pluginManager";
import axios from "axios";
import bigInt from "big-integer";
import * as cheerio from "cheerio";
import { satisfies } from "compare-versions";
import CryptoJs from "crypto-js";
import dayjs from "dayjs";
import he from "he";
import { produce } from "immer";
import { nanoid } from "@/utils/nanoid";
import objectPath from "object-path";
import qs from "qs";
import { Platform } from "react-native";
import { default as DeviceInfo, default as deviceInfoModule } from "react-native-device-info";
import RNFS, { exists, readFile, stat, writeFile } from "react-native-fs";
import { URL } from "react-native-url-polyfill";
import * as webdav from "webdav";
import * as pako from "pako";
import { Buffer } from "buffer";
import iconvLite from "iconv-lite";
import { devLog, errorLog, trace } from "../../utils/log";
import Network from "../../utils/network";
import MediaCache from "../mediaCache";
import _internalPluginMeta from "./meta";
import { normalizePluginMusicItem } from "@/utils/qualities";


axios.defaults.timeout = 2000;
axios.interceptors.response.use((response) => {
    // 统一 set-cookie 格式。AxiosHeaders 在部分环境下不可扩展，必须 try/catch。
    try {
        const headers: any = response.headers;
        const setCookie =
            headers?.["set-cookie"] ??
            (typeof headers?.get === "function" ? headers.get("set-cookie") : undefined);
        if (setCookie && Array.isArray(setCookie) && setCookie.length === 1) {
            const splitedCookie = String(setCookie[0]).split(",");
            if (typeof headers?.set === "function") {
                headers.set("set-cookie", splitedCookie);
                headers.set("x-set-cookie", setCookie);
            } else {
                headers["set-cookie"] = splitedCookie;
                headers["x-set-cookie"] = setCookie;
            }
        }
    } catch {
        // ignore header normalization failures
    }

    return response;
});

const sha256 = CryptoJs.SHA256;

function normalizeLyricText<T extends string | null | undefined>(text: T): T {
    if (!text) {
        return text;
    }

    return text
        .replace(/\r/g, "")
        .replace(/\\r\\n|\\n|\\r/g, "\n") as T;
}

const deprecatedCookieManager = {
    get: notImplementedFunction,
    set: notImplementedFunction,
    flush: notImplementedFunction,
};

const packages: Record<string, any> = {
    cheerio,
    "crypto-js": CryptoJs,
    axios,
    dayjs,
    "big-integer": bigInt,
    qs,
    he,
    "@react-native-cookies/cookies": deprecatedCookieManager,
    webdav,
    pako,
    buffer: Object.assign({ Buffer }, { default: { Buffer } }),
    "iconv-lite": iconvLite,
};

const _require = (packageName: string) => {
    const pkg = packages[packageName];
    if (!pkg) {
        throw new Error(`Cannot find module '${packageName}'`);
    }
    // Provide CJS `default` without mutating frozen Metro/Hermes module namespace objects.
    if (pkg && (typeof pkg === "object" || typeof pkg === "function")) {
        if ((pkg as any).default !== undefined) {
            return pkg;
        }
        try {
            if (Object.isExtensible(pkg)) {
                (pkg as any).default = pkg;
                return pkg;
            }
        } catch {
            // fall through to wrapper
        }
        // Non-extensible package (common with import * as ns): return a thin view.
        return new Proxy(pkg as object, {
            get(target, prop, receiver) {
                if (prop === "default") {
                    return target;
                }
                return Reflect.get(target, prop, receiver);
            },
            has(target, prop) {
                return prop === "default" || Reflect.has(target, prop);
            },
        });
    }
    return pkg;
};

const nativeTextDecoder = globalThis.TextDecoder;
const nativeTextEncoder = globalThis.TextEncoder;

/** Chinese encodings Hermes/native TextDecoder does not support. */
const GB_ENCODINGS = new Set(["gb18030", "gbk", "gb2312", "cp936"]);

function normalizeEncodingLabel(label?: string) {
    return String(label ?? "utf-8")
        .toLowerCase()
        .replace(/[-_\s]/g, "");
}

function bufferFromTextDecoderInput(
    input?: ArrayBuffer | ArrayBufferView | null,
) {
    if (!input) {
        return Buffer.alloc(0);
    }
    if (input instanceof ArrayBuffer) {
        return Buffer.from(new Uint8Array(input));
    }
    // TypedArray / DataView — only the relevant slice.
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

/**
 * Plugin-facing TextDecoder.
 * Native RN/Hermes TextDecoder exists but lacks gb18030/gbk; plugins (e.g. KW
 * lyrics) call `new TextDecoder("gb18030")` and get mojibake unless we wrap.
 */
class PluginTextDecoder {
    private decoder?: any;
    private encoding: string;
    private fatal: boolean;

    constructor(label: string = "utf-8", options?: any) {
        this.encoding = normalizeEncodingLabel(label);
        this.fatal = !!options?.fatal;

        // Always route Chinese encodings through iconv-lite.
        if (GB_ENCODINGS.has(this.encoding)) {
            this.decoder = undefined;
            return;
        }

        if (nativeTextDecoder) {
            try {
                this.decoder = new nativeTextDecoder(label, options);
            } catch {
                this.decoder = undefined;
            }
        }
    }

    decode(
        input?: ArrayBuffer | ArrayBufferView | null,
        _options?: { stream?: boolean },
    ) {
        if (this.decoder) {
            return this.decoder.decode(input as any);
        }

        const buffer = bufferFromTextDecoderInput(input);
        if (GB_ENCODINGS.has(this.encoding)) {
            try {
                // gbk / gb2312 / cp936 map to gb18030 in iconv-lite.
                return iconvLite.decode(buffer, "gb18030");
            } catch (error) {
                if (this.fatal) {
                    throw error;
                }
                // Non-fatal: best-effort utf8 rather than throw.
            }
        }

        try {
            return buffer.toString("utf8");
        } catch {
            return "";
        }
    }
}

const _consoleBind = function (
    method: "log" | "error" | "info" | "warn",
    ...args: any
) {
    const fn = console[method];
    if (fn) {
        fn(...args);
        devLog(method, ...args);
    }
};

const _console = {
    log: _consoleBind.bind(null, "log"),
    warn: _consoleBind.bind(null, "warn"),
    info: _consoleBind.bind(null, "info"),
    error: _consoleBind.bind(null, "error"),
};

const appVersion = deviceInfoModule.getVersion();

function formatAuthUrl(url: string) {
    const urlObj = new URL(url);

    try {
        if (urlObj.username && urlObj.password) {
            const auth = `Basic ${Base64.btoa(
                `${decodeURIComponent(urlObj.username)}:${decodeURIComponent(
                    urlObj.password,
                )}`,
            )}`;
            urlObj.username = "";
            urlObj.password = "";

            return {
                url: urlObj.toString(),
                auth,
            };
        }
    } catch {
        return {
            url,
        };
    }
    return {
        url,
    };
}

export enum PluginState {
    // 初始化
    Initializing,
    // 加载中
    Loading,
    // 已加载
    Mounted,
    // 出现错误
    Error
}

/** Normalize plugin share / detail URLs (trim, protocol-relative, etc.). */
export function normalizePluginShareUrl(raw: unknown): string {
    if (raw == null) {
        return "";
    }
    const text = String(raw).trim();
    if (!text) {
        return "";
    }
    if (/^https?:\/\//i.test(text)) {
        return text;
    }
    // Protocol-relative
    if (text.startsWith("//")) {
        return `https:${text}`;
    }
    return "";
}

export enum PluginErrorReason {
    // 版本不匹配
    VersionNotMatch,
    // 无法解析
    CannotParse,
}


export interface ILazyProps {
    name: string;
    hash: string;
    path: string;
    supportedMethods?: string[];
    loadFuncCode?: () => Promise<string>;
    instance?: IPlugin.IPluginDefine;
}

class PluginMethodsWrapper implements IPlugin.IPluginInstanceMethods {
    private plugin: Plugin;
    private ensurePluginIsMounted: () => Promise<void>;

    constructor(plugin: Plugin, ensurePluginIsMounted: () => Promise<void>) {
        this.plugin = plugin;
        // Re-bind this plugin's env/process onto global free-vars before every
        // method call. Sandbox injects env via globalThis (not Function params)
        // so multi-plugin mounts would otherwise leave a stale env and break
        // env.getUserVariables() / env.userVariables for other plugins.
        this.ensurePluginIsMounted = async () => {
            await ensurePluginIsMounted();
            this.plugin.activateSandboxGlobals();
        };
    }


    /** 搜索 */
    async search<T extends ICommon.SupportMediaType>(
        query: string,
        page: number,
        type: T,
    ): Promise<IPlugin.ISearchResult<T>> {
        await this.ensurePluginIsMounted();
        if (!this.plugin.instance.search) {
            return {
                isEnd: true,
                data: [],
            };
        }

        const result =
            (await this.plugin.instance.search(query, page, type)) ?? {};
        if (Array.isArray(result.data)) {
            // Always clone: plugin/immer items may be non-extensible on Hermes.
            result.data = result.data.map(item => {
                const normalized = normalizePluginMusicItem(item);
                return resetMediaItem(
                    { ...item, ...normalized },
                    this.plugin.name,
                    true,
                );
            });
            return {
                isEnd: result.isEnd ?? true,
                data: result.data,
            };
        }
        return {
            isEnd: true,
            data: [],
        };
    }

    /** 获取真实源 */
    async getMediaSource(
        musicItem: IMusic.IMusicItemBase,
        quality: IMusic.IQualityKey = "320k",
        retryCount = 1,
        notUpdateCache = false,
        bypassLocalAndCache = false,
    ): Promise<IPlugin.IMediaSourceResult | null> {
        await this.ensurePluginIsMounted();
        // 1. 本地搜索 其实直接读mediameta就好了
        // 下载场景（bypassLocalAndCache）必须拿最新远程源，跳过本地文件短路
        const localPathInMediaExtra = getMediaExtraProperty(musicItem, "localPath");
        const localPath = getLocalPath(musicItem);
        if (!bypassLocalAndCache) {
            if (localPath && (await exists(localPath))) {
                trace("本地播放", localPath);
                if (localPathInMediaExtra !== localPath) {
                    // 修正一下本地数据
                    patchMediaExtra(musicItem, {
                        localPath,
                    });

                }
                return {
                    url: addFileScheme(localPath),
                };
            } else if (localPathInMediaExtra) {
                patchMediaExtra(musicItem, {
                    localPath: undefined,
                });
            }
        }

        if (musicItem.platform === localPluginPlatform) {
            throw new Error("本地音乐不存在");
        }
        // 2. 缓存播放
        const mediaCache = MediaCache.getMediaCache(
            musicItem,
        ) as IMusic.IMusicItem | null;
        const pluginCacheControl =
            this.plugin.instance.cacheControl ?? "no-cache";
        if (
            !bypassLocalAndCache &&
            mediaCache &&
            mediaCache?.source?.[quality]?.url &&
            (pluginCacheControl === CacheControl.Cache ||
                (pluginCacheControl === CacheControl.NoCache &&
                    Network.isOffline))
        ) {
            trace("播放", "缓存播放");
            const qualityInfo = mediaCache.source[quality];
            return {
                url: qualityInfo!.url,
                headers: mediaCache.headers,
                userAgent:
                    mediaCache.userAgent ?? mediaCache.headers?.["user-agent"],
            };
        }
        // 3. 替代插件
        const alternativePlugin = Plugin.pluginManager?.getAlternativePlugin(this.plugin) as Plugin | null;
        const parserPlugin = alternativePlugin?.instance?.getMediaSource ? alternativePlugin : this.plugin;

        if (alternativePlugin) {
            devLog("info", "设置了替代插件，实际使用的插件为", parserPlugin.name);
        }

        // 4. 插件解析
        if (!parserPlugin.instance.getMediaSource) {
            const { url, auth } = formatAuthUrl(
                musicItem?.qualities?.[quality]?.url ?? musicItem.url,
            );
            return {
                url: url,
                headers: auth
                    ? {
                        Authorization: auth,
                    }
                    : undefined,
            };
        }
        try {
            const mediaSourceResult = (await parserPlugin.instance.getMediaSource(
                musicItem,
                quality,
            )) ?? { url: musicItem?.qualities?.[quality]?.url };
            const { url, headers, ekey, cek } = mediaSourceResult as any;
            if (!url) {
                throw new Error("NOT RETRY");
            }
            trace("播放", "插件播放");
            const result = {
                url,
                headers,
                userAgent: headers?.["user-agent"],
                ekey, // 传递 ekey 用于 mflac 解密
                cek, // 传递 cek 用于 CENC 流式解密
            } as IPlugin.IMediaSourceResult;
            const authFormattedResult = formatAuthUrl(result.url!);
            if (authFormattedResult.auth) {
                result.url = authFormattedResult.url;
                result.headers = {
                    ...(result.headers ?? {}),
                    Authorization: authFormattedResult.auth,
                };
            }

            if (
                pluginCacheControl !== CacheControl.NoStore &&
                !notUpdateCache
            ) {
                // 更新缓存
                const cacheSource = {
                    headers: result.headers,
                    userAgent: result.userAgent,
                    url,
                };
                let realMusicItem = {
                    ...musicItem,
                    ...(mediaCache || {}),
                };
                realMusicItem.source = {
                    ...(realMusicItem.source || {}),
                    [quality]: cacheSource,
                };

                MediaCache.setMediaCache(realMusicItem);
            }
            return result;
        } catch (e: any) {
            if (retryCount > 0 && e?.message !== "NOT RETRY") {
                await delay(150);
                return this.getMediaSource(musicItem, quality, --retryCount, notUpdateCache, bypassLocalAndCache);
            }
            errorLog("获取真实源失败", e?.message);
            devLog("error", "获取真实源失败", e, e?.message);
            return null;
        }
    }

    /** 获取音乐详情 */
    async getMusicInfo(
        musicItem: ICommon.IMediaBase,
    ): Promise<Partial<IMusic.IMusicItem> | null> {
        await this.ensurePluginIsMounted();
        if (!this.plugin.instance.getMusicInfo) {
            return null;
        }
        try {
            // Must await: without it we normalize a Promise and drop qualities/size.
            const result =
                (await this.plugin.instance.getMusicInfo(
                    resetMediaItem(musicItem, undefined, true),
                )) ?? null;

            if (result && typeof result === "object") {
                const normalized = normalizePluginMusicItem(result);
                return {
                    ...result,
                    ...normalized,
                    // Prefer normalized qualities when present; never wipe with undefined.
                    qualities:
                        normalized.qualities ??
                        (result as IMusic.IMusicItem).qualities,
                };
            }

            return result;
        } catch (e: any) {
            devLog("error", "获取音乐详情失败", e, e?.message);
            return null;
        }
    }

    /** 获取音乐详情页 URL（插件优先，宿主按平台字段兜底） */
    async getMusicDetailPageUrl(
        musicItem: IMusic.IMusicItemBase,
    ): Promise<string> {
        await this.ensurePluginIsMounted();

        // Pass a plain clone so plugins always see full fields (not immer-frozen).
        const safeItem = resetMediaItem(musicItem, undefined, true);

        if (typeof this.plugin.instance.getMusicDetailPageUrl === "function") {
            try {
                const raw = await this.plugin.instance.getMusicDetailPageUrl(
                    safeItem,
                );
                const fromPlugin = normalizePluginShareUrl(raw);
                if (fromPlugin) {
                    return fromPlugin;
                }
            } catch (e: any) {
                devLog("error", "获取音乐详情页URL失败", e, e?.message);
            }
        }

        // Plugin missing method / empty result / throw → host fallback.
        const fallback = normalizePluginShareUrl(
            buildFallbackMusicDetailUrl(safeItem),
        );
        if (!fallback) {
            devLog("warn", "分享链接为空", {
                platform: musicItem?.platform,
                id: musicItem?.id,
                keys: musicItem ? Object.keys(musicItem as object) : [],
            });
        }
        return fallback;
    }

    /**
     *
     * getLyric(musicItem) => {
     *      lyric: string;
     *      trans: string;
     * }
     *
     */
    /** 获取歌词 */
    async getLyric(
        originalMusicItem: IMusic.IMusicItemBase,
    ): Promise<ILyric.ILyricSource | null> {
        await this.ensurePluginIsMounted();
        // 1.额外存储的meta信息（关联歌词）
        const associatedLrc = getMediaExtraProperty(originalMusicItem, "associatedLrc");
        let musicItem: IMusic.IMusicItem;
        if (associatedLrc) {
            musicItem = associatedLrc as IMusic.IMusicItem;
        } else {
            musicItem = originalMusicItem as IMusic.IMusicItem;
        }

        const musicItemCache = MediaCache.getMediaCache(
            musicItem,
        ) as IMusic.IMusicItemCache | null;

        /** 原始歌词文本 */
        let rawLrc: string | null = musicItem.rawLrc || null;
        let translation: string | null = null;
        let romanization: string | null = null;
        rawLrc = normalizeLyricText(rawLrc);

        // 2. 本地手动设置的歌词
        const platformHash = CryptoJs.MD5(musicItem.platform).toString(
            CryptoJs.enc.Hex,
        );
        const idHash = CryptoJs.MD5(musicItem.id).toString(CryptoJs.enc.Hex);
        if (
            await RNFS.exists(
                pathConst.localLrcPath + platformHash + "/" + idHash + ".lrc",
            )
        ) {
            rawLrc = normalizeLyricText(await RNFS.readFile(
                pathConst.localLrcPath + platformHash + "/" + idHash + ".lrc",
                "utf8",
            ));

            if (
                await RNFS.exists(
                    pathConst.localLrcPath +
                    platformHash +
                    "/" +
                    idHash +
                    ".tran.lrc",
                )
            ) {
                translation =
                    normalizeLyricText((await RNFS.readFile(
                        pathConst.localLrcPath +
                        platformHash +
                        "/" +
                        idHash +
                        ".tran.lrc",
                        "utf8",
                    )) || null);
            }

            if (
                await RNFS.exists(
                    pathConst.localLrcPath +
                    platformHash +
                    "/" +
                    idHash +
                    ".roma.lrc",
                )
            ) {
                romanization =
                    normalizeLyricText((await RNFS.readFile(
                        pathConst.localLrcPath +
                        platformHash +
                        "/" +
                        idHash +
                        ".roma.lrc",
                        "utf8",
                    )) || null);
            }

            return {
                rawLrc,
                translation: translation || undefined,
                romanization: romanization || undefined,
            };
        }

        // 2. 缓存歌词 / 对象上本身的歌词
        if (musicItemCache?.lyric) {
            // 缓存的远程结果
            let cacheLyric: ILyric.ILyricSource | null =
                musicItemCache.lyric || null;
            // 缓存的本地结果
            let localLyric: ILyric.ILyricSource | null =
                musicItemCache.$localLyric || null;

            // 优先用缓存的结果
            if (cacheLyric.rawLrc || cacheLyric.translation || cacheLyric.romanization) {
                return {
                    rawLrc: normalizeLyricText(cacheLyric.rawLrc),
                    translation: normalizeLyricText(cacheLyric.translation),
                    romanization: normalizeLyricText(cacheLyric.romanization),
                };
            }

            // 本地其实是缓存的路径
            if (localLyric) {
                let needRefetch = false;
                if (localLyric.rawLrc && (await exists(localLyric.rawLrc))) {
                    rawLrc = normalizeLyricText(await readFile(localLyric.rawLrc, "utf8"));
                } else if (localLyric.rawLrc) {
                    needRefetch = true;
                }
                if (
                    localLyric.translation &&
                    (await exists(localLyric.translation))
                ) {
                    translation = normalizeLyricText(await readFile(
                        localLyric.translation,
                        "utf8",
                    ));
                } else if (localLyric.translation) {
                    needRefetch = true;
                }
                if (
                    localLyric.romanization &&
                    (await exists(localLyric.romanization))
                ) {
                    romanization = normalizeLyricText(await readFile(
                        localLyric.romanization,
                        "utf8",
                    ));
                } else if (localLyric.romanization) {
                    needRefetch = true;
                }

                if (!needRefetch && (rawLrc || translation || romanization)) {
                    return {
                        rawLrc: rawLrc || undefined,
                        translation: translation || undefined,
                        romanization: romanization || undefined,
                    };
                }
            }
        }

        // 3. 无缓存歌词/无自带歌词/无本地歌词
        let lrcSource: ILyric.ILyricSource | null;
        if (isSameMediaItem(originalMusicItem, musicItem)) {
            lrcSource =
                (await this.plugin.instance
                    ?.getLyric?.(resetMediaItem(musicItem, undefined, true))
                    ?.catch(() => null)) || null;
        } else {
            lrcSource =
                (await Plugin.pluginManager?.getByMedia(musicItem)
                    ?.instance?.getLyric?.(
                        resetMediaItem(musicItem, undefined, true),
                    )
                    ?.catch(() => null)) || null;
        }

        if (lrcSource) {
            rawLrc = normalizeLyricText(lrcSource?.rawLrc || rawLrc);
            translation = normalizeLyricText(lrcSource?.translation || null);
            romanization = normalizeLyricText(lrcSource?.romanization || null);

            const deprecatedLrcUrl = lrcSource?.lrc || musicItem.lrc;

            // 本地的文件名
            let filename: string | undefined = `${pathConst.lrcCachePath
            }${nanoid()}.lrc`;
            let filenameTrans: string | undefined = `${pathConst.lrcCachePath
            }${nanoid()}.lrc`;
            let filenameRoma: string | undefined = `${pathConst.lrcCachePath
            }${nanoid()}.lrc`;

            // 旧版本兼容
            if (!(rawLrc || translation || romanization)) {
                if (deprecatedLrcUrl) {
                    rawLrc = (
                        await axios
                            .get(deprecatedLrcUrl, { timeout: 3000 })
                            .catch(() => null)
                    )?.data;
                } else if (musicItem.rawLrc) {
                    rawLrc = musicItem.rawLrc;
                }
                rawLrc = normalizeLyricText(rawLrc);
            }

            if (rawLrc) {
                await writeFile(filename, rawLrc, "utf8");
            } else {
                filename = undefined;
            }
            if (translation) {
                await writeFile(filenameTrans, translation, "utf8");
            } else {
                filenameTrans = undefined;
            }
            if (romanization) {
                await writeFile(filenameRoma, romanization, "utf8");
            } else {
                filenameRoma = undefined;
            }

            if (rawLrc || translation || romanization) {
                MediaCache.setMediaCache(
                    produce(musicItemCache || musicItem, draft => {
                        musicItemCache?.$localLyric?.rawLrc;
                        objectPath.set(draft, "$localLyric.rawLrc", filename);
                        objectPath.set(
                            draft,
                            "$localLyric.translation",
                            filenameTrans,
                        );
                        objectPath.set(
                            draft,
                            "$localLyric.romanization",
                            filenameRoma,
                        );
                        return draft;
                    }),
                );
                return {
                    rawLrc: rawLrc || undefined,
                    translation: translation || undefined,
                    romanization: romanization || undefined,
                };
            }
        }

        // 6. 如果是本地文件
        const localFilePath = getLocalPath(originalMusicItem);
        if (
            originalMusicItem.platform !== localPluginPlatform &&
            localFilePath
        ) {
            const res = await localFilePluginDefine!.getLyric!(originalMusicItem);
            devLog("info", "本地文件歌词");

            if (res) {
                return res;
            }
        }
        devLog("warn", "无歌词");

        return null;
    }

    /** 获取逐字歌词 */
    async getWordByWordLyric(
        originalMusicItem: IMusic.IMusicItemBase,
    ): Promise<ILyric.ILyricSource | null> {
        await this.ensurePluginIsMounted();

        // 1. 额外存储的meta信息（关联歌词）
        const associatedLrc = getMediaExtraProperty(originalMusicItem, "associatedLrc");
        let musicItem: IMusic.IMusicItem;
        if (associatedLrc) {
            musicItem = associatedLrc as IMusic.IMusicItem;
        } else {
            musicItem = originalMusicItem as IMusic.IMusicItem;
        }

        // 2. 检查插件是否支持逐字歌词
        if (!this.plugin.instance.getWordByWordLyric) {
            devLog("info", "插件不支持逐字歌词");
            return null;
        }

        try {
            const lrcSource = await this.plugin.instance.getWordByWordLyric(
                resetMediaItem(musicItem, undefined, true),
            );

            if (lrcSource?.rawLrc) {
                devLog("info", "获取逐字歌词成功");
                return lrcSource;
            }
        } catch (e: any) {
            devLog("error", "获取逐字歌词失败", e, e?.message);
        }

        return null;
    }


    /** 获取专辑信息 */
    async getAlbumInfo(
        albumItem: IAlbum.IAlbumItemBase,
        page: number = 1,
    ): Promise<IPlugin.IAlbumInfoResult | null> {
        await this.ensurePluginIsMounted();
        if (!this.plugin.instance.getAlbumInfo) {
            return {
                albumItem,
                musicList: (albumItem?.musicList ?? []).map(
                    resetMediaItem,
                    this.plugin.name,
                    true,
                ),
                isEnd: true,
            };
        }
        try {
            const result = await this.plugin.instance.getAlbumInfo(
                resetMediaItem(albumItem, undefined, true),
                page,
            );
            if (!result) {
                throw new Error();
            }
            result.musicList = (result.musicList ?? []).map(item => {
                const normalized = normalizePluginMusicItem(item);
                const next = resetMediaItem(
                    { ...item, ...normalized },
                    this.plugin.name,
                    true,
                );
                next.album = albumItem.title;
                return next;
            });

            if (page <= 1) {
                // 合并信息
                return {
                    albumItem: { ...albumItem, ...(result?.albumItem ?? {}) },
                    isEnd: result.isEnd === false ? false : true,
                    musicList: result.musicList,
                };
            } else {
                return {
                    isEnd: result.isEnd === false ? false : true,
                    musicList: result.musicList,
                };
            }
        } catch (e: any) {
            trace("获取专辑信息失败", e?.message);
            devLog("error", "获取专辑信息失败", e, e?.message);

            return null;
        }
    }

    /** 获取歌单信息 */
    async getMusicSheetInfo(
        sheetItem: IMusic.IMusicSheetItem,
        page: number = 1,
    ): Promise<IPlugin.ISheetInfoResult | null> {
        await this.ensurePluginIsMounted();
        if (!this.plugin.instance.getMusicSheetInfo) {
            return {
                sheetItem,
                musicList: sheetItem?.musicList ?? [],
                isEnd: true,
            };
        }
        try {
            const result = await this.plugin.instance?.getMusicSheetInfo?.(
                resetMediaItem(sheetItem, undefined, true),
                page,
            );
            if (!result) {
                throw new Error();
            }
            result.musicList = (result.musicList ?? []).map(item => {
                const normalized = normalizePluginMusicItem(item);
                return resetMediaItem(
                    { ...item, ...normalized },
                    this.plugin.name,
                    true,
                );
            });

            if (page <= 1) {
                // 合并信息
                return {
                    sheetItem: { ...sheetItem, ...(result?.sheetItem ?? {}) },
                    isEnd: result.isEnd === false ? false : true,
                    musicList: result.musicList,
                };
            } else {
                return {
                    isEnd: result.isEnd === false ? false : true,
                    musicList: result.musicList,
                };
            }
        } catch (e: any) {
            trace("获取歌单信息失败", e, e?.message);
            devLog("error", "获取歌单信息失败", e, e?.message);

            return null;
        }
    }

    /** 查询作者信息 */
    async getArtistWorks<T extends IArtist.ArtistMediaType>(
        artistItem: IArtist.IArtistItem,
        page: number,
        type: T,
    ): Promise<IPlugin.ISearchResult<T>> {
        await this.ensurePluginIsMounted();
        if (!this.plugin.instance.getArtistWorks) {
            return {
                isEnd: true,
                data: [],
            };
        }
        try {
            const result = await this.plugin.instance.getArtistWorks(
                artistItem,
                page,
                type,
            );
            if (!result.data) {
                return {
                    isEnd: true,
                    data: [],
                };
            }
            result.data = (result.data ?? []).map(item => {
                const normalized = normalizePluginMusicItem(item);
                return resetMediaItem(
                    { ...item, ...normalized },
                    this.plugin.name,
                    true,
                );
            });
            return {
                isEnd: result.isEnd ?? true,
                data: result.data,
            };
        } catch (e: any) {
            trace("查询作者信息失败", e?.message);
            devLog("error", "查询作者信息失败", e, e?.message);

            throw e;
        }
    }

    /** 导入歌单 */
    async importMusicSheet(urlLike: string): Promise<IMusic.IMusicItem[]> {
        await this.ensurePluginIsMounted();
        try {
            const result =
                (await this.plugin.instance?.importMusicSheet?.(urlLike)) ?? [];
            return result.map(item => {
                const normalized = normalizePluginMusicItem(item);
                return resetMediaItem(
                    { ...item, ...normalized },
                    this.plugin.name,
                    true,
                );
            });
        } catch (e: any) {
            devLog("warn", "导入歌单异常", e);
            devLog("error", "导入歌单失败", e, e?.message);

            return [];
        }
    }

    /** 导入单曲 */
    async importMusicItem(urlLike: string): Promise<IMusic.IMusicItem | null> {
        await this.ensurePluginIsMounted();
        try {
            const result = await this.plugin.instance?.importMusicItem?.(
                urlLike,
            );
            if (!result) {
                throw new Error();
            }
            
            const normalized = normalizePluginMusicItem(result);
            return resetMediaItem(
                { ...result, ...normalized },
                this.plugin.name,
                true,
            );
        } catch (e: any) {
            devLog("error", "导入单曲失败", e, e?.message);

            return null;
        }
    }

    /** 获取榜单 */
    async getTopLists(): Promise<IMusic.IMusicSheetGroupItem[]> {
        await this.ensurePluginIsMounted();
        try {
            const result = await this.plugin.instance?.getTopLists?.();
            if (!result) {
                throw new Error();
            }
            return result;
        } catch (e: any) {
            devLog("error", "获取榜单失败", e, e?.message);
            return [];
        }
    }

    /** 获取榜单详情 */
    async getTopListDetail(
        topListItem: IMusic.IMusicSheetItemBase,
        page: number,
    ): Promise<IPlugin.ITopListInfoResult> {
        await this.ensurePluginIsMounted();
        const result = await this.plugin.instance?.getTopListDetail?.(
            topListItem,
            page,
        );
        if (!result) {
            throw new Error();
        }
        if (result.musicList) {
            result.musicList = result.musicList.map(item => {
                const normalized = normalizePluginMusicItem(item);
                return resetMediaItem(
                    { ...item, ...normalized },
                    this.plugin.name,
                    true,
                );
            });
        } else {
            result.musicList = [];
        }
        if (result.isEnd !== false) {
            result.isEnd = true;
        }
        return result;
    }

    /** 获取推荐歌单的tag */
    async getRecommendSheetTags(): Promise<IPlugin.IGetRecommendSheetTagsResult> {
        await this.ensurePluginIsMounted();
        try {
            const result =
                await this.plugin.instance?.getRecommendSheetTags?.();
            if (!result) {
                throw new Error();
            }
            return result;
        } catch (e: any) {
            devLog("error", "获取推荐歌单失败", e, e?.message);
            return {
                data: [],
            };
        }
    }

    /** 获取某个tag的推荐歌单 */
    async getRecommendSheetsByTag(
        tagItem: ICommon.IUnique,
        page?: number,
    ): Promise<ICommon.PaginationResponse<IMusic.IMusicSheetItemBase>> {
        await this.ensurePluginIsMounted();
        try {
            const result =
                await this.plugin.instance?.getRecommendSheetsByTag?.(
                    tagItem,
                    page ?? 1,
                );
            if (!result) {
                throw new Error();
            }
            if (result.isEnd !== false) {
                result.isEnd = true;
            }
            if (!result.data) {
                result.data = [];
            }
            result.data.forEach(item => resetMediaItem(item, this.plugin.name));

            return result;
        } catch (e: any) {
            devLog("error", "获取推荐歌单详情失败", e, e?.message);
            return {
                isEnd: true,
                data: [],
            };
        }
    }

    async getMusicComments(
        musicItem: IMusic.IMusicItem,
        page?: number
    ): Promise<ICommon.PaginationResponse<IMedia.IComment>> {
        await this.ensurePluginIsMounted();
        const result = await this.plugin.instance?.getMusicComments?.(
            musicItem,
            page ?? 1
        );
        if (!result) {
            throw new Error();
        }
        if (result.isEnd !== false) {
            result.isEnd = true;
        }
        if (!result.data) {
            result.data = [];
        }

        return result;
    }
}

//#region 插件类
export class Plugin {
    /** 插件名 */
    public name: string = "";
    /** 插件的hash，作为唯一id */
    public hash: string = "";
    /** 插件状态：激活、关闭、错误 */
    public state: PluginState = PluginState.Initializing;
    /** 插件出错时的原因 */
    public errorReason?: PluginErrorReason;
    /** 插件的实例 */
    public instance: IPlugin.IPluginDefine = { platform: "" };
    /** 插件路径 */
    public path: string = "";
    /** 插件方法，内部进行标准化和校验 */
    public methods!: IPlugin.IPluginInstanceMethods;

    public supportedMethods: Set<keyof IPlugin.IPluginInstanceMethods> = new Set();

    private lazyProps: ILazyProps | null = null;
    /** Dedup concurrent ensureMounted() so callers wait for the same load. */
    private mountPromise: Promise<void> | null = null;
    /** Per-plugin sandbox env (userVariables etc.), rebound before method calls. */
    private sandboxEnv: {
        getUserVariables: () => Record<string, string>;
        readonly userVariables: Record<string, string>;
        appVersion: string;
        os: string;
        lang: string;
    } | null = null;
    private sandboxProcess: {
        platform: string;
        version: string;
        env: NonNullable<Plugin["sandboxEnv"]>;
    } | null = null;

    static pluginManager: IPluginManager;

    static injectDependencies(
        pluginManager: IPluginManager,
    ) {
        Plugin.pluginManager = pluginManager;
    }

    constructor(
        funcCode: string | (() => IPlugin.IPluginDefine) | null,
        pluginPath: string,
        lazyProps: ILazyProps | null = null
    ) {
        this.lazyProps = lazyProps;
        if (!lazyProps) {
            // 如果没有懒加载，直接挂载并初始化
            this.mountPlugin(funcCode!, pluginPath);
            this.methods = new PluginMethodsWrapper(this, async () => {});
        } else {
            // 使用懒加载参数初始化
            this.name = lazyProps.name;
            this.hash = lazyProps.hash;
            this.path = lazyProps.path;
            // Cache only stores plain JSON (no functions). Keep a stub until mount.
            this.instance = {
                ...(lazyProps.instance && typeof lazyProps.instance === "object"
                    ? Object.fromEntries(
                        Object.entries(lazyProps.instance).filter(
                            ([, v]) => typeof v !== "function",
                        ),
                    )
                    : {}),
                platform: lazyProps.name,
            } as IPlugin.IPluginDefine;
            this.supportedMethods = new Set((lazyProps.supportedMethods ?? []) as any);
            // 初始化方法，但实际调用时会先挂载插件
            this.methods = new PluginMethodsWrapper(this, this.ensureMounted.bind(this));
        }
    }

    async ensureMounted() {
        // Already usable
        if (this.state === PluginState.Mounted || this.state === PluginState.Error) {
            this.activateSandboxGlobals();
            return;
        }
        // Coalesce concurrent mounts (was a race: 2nd caller skipped await)
        if (this.mountPromise) {
            return this.mountPromise;
        }
        if (!this.lazyProps) {
            this.activateSandboxGlobals();
            return;
        }

        this.mountPromise = (async () => {
            this.state = PluginState.Loading;
            const loadFuncCode = this.lazyProps!.loadFuncCode ?? (async () => "");
            try {
                const funcCode = await loadFuncCode();
                this.mountPlugin(funcCode, this.lazyProps!.path);
            } catch {
                this.state = PluginState.Error;
                this.errorReason =
                    this.errorReason ?? PluginErrorReason.CannotParse;
            } finally {
                this.mountPromise = null;
            }
        })();

        return this.mountPromise;
    }

    /**
     * Bind this plugin's sandbox env/process to global free identifiers.
     * Plugin code resolves bare `env` / `process` via globalThis, so every
     * mount and method call must refresh these bindings for the active plugin.
     */
    activateSandboxGlobals() {
        if (!this.sandboxEnv) {
            return;
        }
        const targets: any[] = [];
        try {
            if (typeof globalThis !== "undefined") {
                targets.push(globalThis);
            }
        } catch {
            // ignore
        }
        try {
            // Hermes may expose a distinct `global`
            if (typeof global !== "undefined" && global !== globalThis) {
                targets.push(global);
            }
        } catch {
            // ignore
        }
        for (const g of targets) {
            try {
                g.env = this.sandboxEnv;
            } catch {
                // ignore non-configurable
            }
            try {
                g.process = this.sandboxProcess;
            } catch {
                // ignore non-configurable
            }
        }
    }

    private mountPlugin(
        funcCode: string | (() => IPlugin.IPluginDefine),
        pluginPath: string) {
        this.state = PluginState.Loading;
        let _instance: IPlugin.IPluginDefine;

        const _module: any = { exports: {} };
        try {
            if (typeof funcCode === "string") {
                // 插件的环境变量
                const env = {
                    getUserVariables: () => {
                        // Prefer live name; fall back to instance.platform during mount.
                        const platform =
                            this.name ||
                            this.instance?.platform ||
                            "";
                        return _internalPluginMeta.getUserVariables(platform);
                    },
                    get userVariables() {
                        return this.getUserVariables() ?? {};
                    },
                    appVersion,
                    os: Platform.OS,
                    lang: "zh-CN",
                };
                const _process = {
                    platform: Platform.OS,
                    version: appVersion,
                    env,
                };
                this.sandboxEnv = env;
                this.sandboxProcess = _process;

                // Sandbox free names must NOT be function parameters/local bindings.
                // Plugins often redeclare them under Hermes ("Identifier already declared").
                // Expose via globalThis so free identifiers (env/process/Buffer/...) resolve.
                // Use classic Function(params..., body) + string concat — nested
                // Function(`return function(){ ${code} }`)() can hang Hermes on large plugins.
                //
                // ALWAYS refresh env/process per plugin mount (not "if undefined").
                // Leaving a previous plugin's env on globalThis makes
                // env.getUserVariables() read the wrong platform's stored vars.
                // eslint-disable-next-line no-new-func
                const sandboxBody =
                    "'use strict';\n" +
                    "var g = (typeof globalThis !== 'undefined')" +
                    " ? globalThis" +
                    " : ((typeof global !== 'undefined') ? global : this);\n" +
                    "if (g) {\n" +
                    "  try { if (typeof g.Buffer === 'undefined') g.Buffer = __mfBuffer; } catch (_e0) {}\n" +
                    "  try { g.env = __mfEnv; } catch (_e1) {}\n" +
                    "  try { g.process = __mfProcess; } catch (_e2) {}\n" +
                    "  try { if (typeof g.URL === 'undefined') g.URL = __mfURL; } catch (_e3) {}\n" +
                    // ALWAYS inject TextDecoder: Hermes ships a native one that
                    // does not support gb18030/gbk, so "if undefined" leaves KW
                    // lyrics broken (mojibake). Our wrapper uses iconv-lite.
                    "  try { g.TextDecoder = __mfTextDecoder; } catch (_e4) {}\n" +
                    "  try { if (typeof g.TextEncoder === 'undefined') g.TextEncoder = __mfTextEncoder; } catch (_e5) {}\n" +
                    "  try { if (typeof g.console === 'undefined') g.console = __mfConsole; } catch (_e6) {}\n" +
                    "}\n" +
                    // Mirror onto distinct Hermes `global` when present.
                    "try {\n" +
                    "  if (typeof global !== 'undefined' && global !== g) {\n" +
                    "    try { global.env = __mfEnv; } catch (_e7) {}\n" +
                    "    try { global.process = __mfProcess; } catch (_e8) {}\n" +
                    "  }\n" +
                    "} catch (_e9) {}\n" +
                    // Do NOT declare local `var env/process` here: some plugins
                    // redeclare them with let/const and Hermes throws
                    // "Identifier already declared". Per-call activateSandboxGlobals()
                    // keeps free-var lookup pointed at the active plugin.
                    funcCode;

                // Plugin sandbox must compile classic script; Function is intentional.
                // eslint-disable-next-line no-new-func -- plugin isolation runner
                const pluginRunner = Function(
                    "require",
                    "__musicfree_require",
                    "module",
                    "exports",
                    "__mfConsole",
                    "__mfEnv",
                    "__mfURL",
                    "__mfProcess",
                    "__mfTextDecoder",
                    "__mfTextEncoder",
                    "__mfBuffer",
                    sandboxBody,
                );

                pluginRunner(
                    _require,
                    _require,
                    _module,
                    _module.exports,
                    _console,
                    env,
                    URL,
                    _process,
                    PluginTextDecoder,
                    nativeTextEncoder,
                    Buffer,
                );
                if (_module.exports.default) {
                    _instance = _module.exports
                        .default as IPlugin.IPluginInstance;
                } else {
                    _instance = _module.exports as IPlugin.IPluginInstance;
                }
            } else {
                _instance = funcCode();
            }
            // 插件初始化后的一些操作
            if (Array.isArray(_instance.userVariables)) {
                _instance.userVariables = _instance.userVariables.filter(
                    it => it?.key,
                );
            }
            this.checkValid(_instance);
        } catch (e: any) {
            this.state = PluginState.Error;
            this.errorReason = e?.errorReason ?? PluginErrorReason.CannotParse;

            errorLog(`${pluginPath}插件无法解析 `, {
                errorReason: this.errorReason,
                message: e?.message,
                stack: e?.stack,
            });
            _instance = e?.instance ?? {
                platform: "",
                appVersion: "",
                async getMediaSource() {
                    return null;
                },
                async search() {
                    return {};
                },
                async getAlbumInfo() {
                    return null;
                },
            };
        }

        this.instance = _instance;
        this.path = pluginPath;
        this.name = _instance.platform;
        this.supportedMethods = new Set(Object.keys(_instance).filter(
            key => typeof (_instance[key]) === "function",
        ) as any);

        // 检测name & 计算hash
        if (
            this.name === "" ||
            !this.name
        ) {
            this.hash = "";
            this.state = PluginState.Error;
            this.errorReason = this.errorReason ?? PluginErrorReason.CannotParse;
        } else {
            if (typeof funcCode === "string") {
                this.hash = sha256(funcCode).toString();
            } else {
                this.hash = sha256(pluginPath + "@" + appVersion).toString();
            }
        }


        if (this.state !== PluginState.Error) {
            this.state = PluginState.Mounted;
        }
    }

    private checkValid(_instance: IPlugin.IPluginDefine) {
        /** 版本号校验 */
        if (
            _instance.appVersion &&
            !satisfies(DeviceInfo.getVersion(), _instance.appVersion)
        ) {
            throw {
                instance: _instance,
                state: PluginState.Error,
                errorReason: PluginErrorReason.VersionNotMatch,
            };
        }
        return true;
    }
}


const localFilePluginDefine: IPlugin.IPluginDefine = {
    platform: localPluginPlatform,
    async getMusicInfo(musicBase) {
        const localPath = getLocalPath(musicBase);
        if (localPath) {
            const coverImg = await Mp3Util.getMediaCoverImg(
                removeFileScheme(localPath),
            );
            return {
                artwork: coverImg,
            };
        }
        return null;
    },
    async getLyric(musicBase) {
        const localPath = getLocalPath(musicBase);
        let rawLrc: string | null = null;
        let translation: string | null = null;
        let romanization: string | null = null;
        if (localPath) {
            const normalizedLocalPath = removeFileScheme(localPath);
            // 读取内嵌歌词
            try {
                rawLrc = normalizeLyricText(await Mp3Util.getLyric(normalizedLocalPath));
            } catch (e) {
                devLog("warn", "读取内嵌歌词失败", e);
            }

            const lastDot = normalizedLocalPath.lastIndexOf(".");
            const basePath = lastDot === -1
                ? normalizedLocalPath
                : normalizedLocalPath.slice(0, lastDot);
            const lyricExts = [".lrc", ".LRC", ".txt", ".TXT"];
            const readLocalLyric = async (basePaths: string[]) => {
                for (const base of basePaths) {
                    for (const ext of lyricExts) {
                        const filePath = base + ext;
                        try {
                            const fileStat = await stat(filePath);
                            if (!fileStat.isFile()) {
                                continue;
                            }
                            const content = normalizeLyricText(await readFile(filePath, "utf8"));
                            if (content.trim()) {
                                return content;
                            }
                        } catch {
                            // Try the next companion lyric file.
                        }
                    }
                }
                return null;
            };

            if (!rawLrc) {
                rawLrc = await readLocalLyric([basePath]);
            }

            translation = await readLocalLyric([
                `${basePath}-tr`,
                `${basePath}.tran`,
            ]);
            romanization = await readLocalLyric([
                `${basePath}.roma`,
                `${basePath}-roma`,
            ]);
        }

        return rawLrc || translation || romanization
            ? {
                rawLrc: rawLrc || undefined,
                translation: translation || undefined,
                romanization: romanization || undefined,
            }
            : null;
    },
    async importMusicItem(urlLike) { // 绝对路径
        let meta: any = {};
        let id: string;

        try {
            meta = await Mp3Util.getBasicMeta(urlLike);
            const fileStat = await stat(urlLike);
            id =
                CryptoJs.MD5(fileStat.originalFilepath).toString(
                    CryptoJs.enc.Hex,
                ) || nanoid();
        } catch {
            id = nanoid();
        }

        return {
            id: id,
            platform: localPluginPlatform,
            title: meta?.title ?? getFileName(urlLike),
            artist: meta?.artist ?? "未知歌手",
            duration: parseInt(meta?.duration ?? "0", 10) / 1000,
            album: meta?.album ?? "未知专辑",
            artwork: "",
            [internalSerializeKey]: {
                localPath: urlLike,
            },
            url: urlLike,
        };
    },
    async getMediaSource(musicItem, quality) {
        if (quality === "320k") {
            return {
                url: addFileScheme(musicItem.$?.localPath || musicItem.url),
            };
        }
        return null;
    },

};

export const localFilePlugin = new Plugin(function () {
    return localFilePluginDefine;
}, "internal-plugin://local-file-plugin");

