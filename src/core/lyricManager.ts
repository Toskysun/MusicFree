import { IAppConfig } from "@/types/core/config";
import { ITrackPlayer } from "@/types/core/trackPlayer";
import { IInjectable } from "@/types/infra";
import LyricParser, { IParsedLrcItem } from "@/utils/lrcParser";
import { getMediaExtraProperty, patchMediaExtra } from "@/utils/mediaExtra";
import { isSameMediaItem } from "@/utils/mediaUtils";
import minDistance from "@/utils/minDistance";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { Plugin } from "./pluginManager";

import pathConst from "@/constants/pathConst";
import LyricUtil from "@/native/lyricUtil";
import { checkAndCreateDir } from "@/utils/fileUtils";
import PersistStatus from "@/utils/persistStatus";
import CryptoJs from "crypto-js";
import { unlink, writeFile } from "react-native-fs";
import RNTrackPlayer, { Event, State } from "react-native-track-player";
import { TrackPlayerEvents } from "@/core.defination/trackPlayer";
import { IPluginManager } from "@/types/core/pluginManager";
import { autoDecryptLyric } from "@/utils/qqMusicDecrypter";
import { devLog } from "@/utils/log";


interface ILyricState {
    loading: boolean;
    lyrics: IParsedLrcItem[];
    hasTranslation: boolean;
    hasRomanization: boolean;
    meta?: Record<string, string>;
}

const defaultLyricState = {
    loading: true,
    lyrics: [],
    hasTranslation: false,
    hasRomanization: false,
};

const lyricStateAtom = atom<ILyricState>(defaultLyricState);
const currentLyricItemAtom = atom<IParsedLrcItem | null>(null);
// 当前播放位置（毫秒），用于逐字歌词效果
const currentPositionMsAtom = atom<number>(0);

// Throttle interval for position updates (ms)
// 16ms = 60fps, provides buttery smooth animation
const POSITION_UPDATE_THROTTLE = 16;


class LyricManager implements IInjectable {

    private trackPlayer!: ITrackPlayer;
    private appConfig!: IAppConfig;
    private pluginManager!: IPluginManager;

    private lyricParser: LyricParser | null = null;

    // Throttle state for position updates
    private lastPositionUpdateTime: number = 0;
    private pendingPositionMs: number = 0;
    private positionUpdateTimer: ReturnType<typeof setTimeout> | null = null;


    get currentLyricItem() {
        return getDefaultStore().get(currentLyricItemAtom);
    }

    get lyricState() {
        return getDefaultStore().get(lyricStateAtom);
    }

    injectDependencies(trackPlayerService: ITrackPlayer, appConfigService: IAppConfig, pluginManager: IPluginManager): void {
        this.trackPlayer = trackPlayerService;
        this.appConfig = appConfigService;
        this.pluginManager = pluginManager;
    }

    setup() {
        // 更新歌词 - 延迟异步执行，完全不阻塞播放
        this.trackPlayer.on(TrackPlayerEvents.CurrentMusicChanged, (musicItem) => {
            devLog('info', '[LyricManager] Music changed event triggered', {
                title: musicItem?.title,
                timestamp: Date.now()
            });

            // CRITICAL FIX: Delay lyric loading to ensure playback starts immediately
            // Use setTimeout to push lyric loading to end of event queue
            setTimeout(() => {
                devLog('info', '[LyricManager] Starting delayed lyric load', {
                    title: musicItem?.title,
                    timestamp: Date.now()
                });

                this.refreshLyric(true, true).catch(err => {
                    devLog('warn', 'Lyric loading failed but playback continues', err);
                });
            }, 0);

            if (this.appConfig.getConfig("lyric.showStatusBarLyric")) {
                if (musicItem) {
                    LyricUtil.setStatusBarLyricText(
                        `${musicItem.title} - ${musicItem.artist}`,);
                } else {
                    LyricUtil.setStatusBarLyricText("MusicFree");
                }
            }
        });

        RNTrackPlayer.addEventListener(Event.PlaybackProgressUpdated, evt => {
            const parser = this.lyricParser;
            const positionMs = evt.position * 1000;

            // Throttled position update for smooth animation without JS thread overload
            const now = Date.now();
            this.pendingPositionMs = positionMs;

            if (now - this.lastPositionUpdateTime >= POSITION_UPDATE_THROTTLE) {
                // Enough time has passed, update immediately
                this.lastPositionUpdateTime = now;
                getDefaultStore().set(currentPositionMsAtom, positionMs);

                // Clear any pending timer
                if (this.positionUpdateTimer) {
                    clearTimeout(this.positionUpdateTimer);
                    this.positionUpdateTimer = null;
                }
            } else if (!this.positionUpdateTimer) {
                // Schedule an update to ensure we don't miss the final position
                const delay = POSITION_UPDATE_THROTTLE - (now - this.lastPositionUpdateTime);
                this.positionUpdateTimer = setTimeout(() => {
                    this.lastPositionUpdateTime = Date.now();
                    getDefaultStore().set(currentPositionMsAtom, this.pendingPositionMs);
                    this.positionUpdateTimer = null;
                }, delay);
            }

            if (!parser || !this.trackPlayer.isCurrentMusic(parser.musicItem)) {
                return;
            }

            const currentLyricItem = getDefaultStore().get(currentLyricItemAtom);
            const newLyricItem = parser.getPosition(evt.position);


            if (currentLyricItem?.lrc !== newLyricItem?.lrc) {
                // 更新当前歌词状态
                getDefaultStore().set(currentLyricItemAtom, newLyricItem ?? null);

                // 更新状态栏歌词
                if (this.appConfig.getConfig("lyric.showStatusBarLyric")) {
                    this.updateDesktopLyricDisplay(newLyricItem);
                }
            }
        });

        // Listen to playback state changes for desktop lyric visibility control
        RNTrackPlayer.addEventListener(Event.PlaybackState, async (state) => {
            const showStatusBarLyric = this.appConfig.getConfig("lyric.showStatusBarLyric");

            if (!showStatusBarLyric) {
                return;
            }

            const hideWhenPaused = this.appConfig.getConfig("lyric.hideDesktopLyricWhenPaused");
            const isPaused = state.state === State.Paused;
            const isPlaying = state.state === State.Playing;
            const currentMusic = this.trackPlayer.currentMusic;

            if (isPlaying) {
                // Always show desktop lyric when playing
                const statusBarLyricConfig = {
                    topPercent: this.appConfig.getConfig("lyric.topPercent"),
                    leftPercent: this.appConfig.getConfig("lyric.leftPercent"),
                    align: this.appConfig.getConfig("lyric.align"),
                    color: this.appConfig.getConfig("lyric.color"),
                    backgroundColor: this.appConfig.getConfig("lyric.backgroundColor"),
                    widthPercent: this.appConfig.getConfig("lyric.widthPercent"),
                    fontSize: this.appConfig.getConfig("lyric.fontSize"),
                };
                LyricUtil.showStatusBarLyric(
                    currentMusic ? `${currentMusic.title} - ${currentMusic.artist}` : "MusicFree",
                    statusBarLyricConfig ?? {}
                );

                // Update to current lyric if available
                const currentLyricItem = this.currentLyricItem;
                if (currentLyricItem) {
                    this.updateDesktopLyricDisplay(currentLyricItem);
                }

                devLog('info', '[LyricManager] Desktop lyric shown after play');
            } else if (isPaused && hideWhenPaused === true) {
                // Hide desktop lyric when paused (only if hideWhenPaused is explicitly enabled)
                LyricUtil.hideStatusBarLyric();
                devLog('info', '[LyricManager] Desktop lyric hidden due to pause');
            }
        });


        // Hide desktop lyric on app startup to prevent showing stale content
        // Desktop lyric will be shown automatically when playback starts (via PlaybackState event)
        LyricUtil.hideStatusBarLyric();
        devLog('info', '[LyricManager] Desktop lyric hidden on startup');

        // Initial async lyric load - non-blocking
        this.refreshLyric(true).catch(err => {
            devLog('warn', 'Initial lyric load failed', err);
        });
    }

    private updateDesktopLyricDisplay(lyricItem: IParsedLrcItem | null) {
        const desktopShowTranslation = this.appConfig.getConfig("lyric.desktopShowTranslation") ?? false;
        const desktopShowRomanization = this.appConfig.getConfig("lyric.desktopShowRomanization") ?? false;
        const lyricOrder = PersistStatus.get("lyric.lyricOrder") ?? ["original", "translation", "romanization"];

        const original = lyricItem?.lrc ?? "";
        const translation = desktopShowTranslation ? (lyricItem?.translation ?? "") : "";
        const romanization = desktopShowRomanization ? (lyricItem?.romanization ?? "") : "";

        // Build lines according to lyric order
        const lines: string[] = [];
        for (const type of lyricOrder) {
            if (type === "original" && original) {
                lines.push(original);
            } else if (type === "translation" && translation) {
                lines.push(translation);
            } else if (type === "romanization" && romanization) {
                lines.push(romanization);
            }
        }

        LyricUtil.setStatusBarLyricText(lines.join("\n"));
    }

    associateLyric(musicItem: IMusic.IMusicItem, linkToMusicItem: ICommon.IMediaBase) {
        if (!musicItem || !linkToMusicItem) {
            return false;
        }

        // 如果当前音乐项和关联的音乐项相同，则不需要重新关联
        if (isSameMediaItem(musicItem, linkToMusicItem)) {
            patchMediaExtra(musicItem, {
                associatedLrc: undefined,
            });
            return false;
        } else {
            patchMediaExtra(musicItem, {
                associatedLrc: linkToMusicItem,
            });
            if (this.trackPlayer.isCurrentMusic(musicItem)) {
                // Async refresh, non-blocking
                this.refreshLyric(false).catch(err => {
                    devLog('warn', 'Lyric refresh after association failed', err);
                });
            }
            return true;
        }
    }

    unassociateLyric(musicItem: IMusic.IMusicItem) {
        if (!musicItem) {
            return;
        }

        patchMediaExtra(musicItem, {
            associatedLrc: undefined,
        });

        if (this.trackPlayer.isCurrentMusic(musicItem)) {
            // Async refresh, non-blocking
            this.refreshLyric(false).catch(err => {
                devLog('warn', 'Lyric refresh after unassociation failed', err);
            });
        }
    }

    async uploadLocalLyric(musicItem: IMusic.IMusicItem, lyricContent: string, type: "raw" | "translation" | "romanization" = "raw") {
        if (!musicItem) {
            return;
        }

        const platformHash = CryptoJs.MD5(musicItem.platform).toString(
            CryptoJs.enc.Hex,
        );
        const idHash: string = CryptoJs.MD5(musicItem.id).toString(
            CryptoJs.enc.Hex,
        );

        // 检查是否缓存文件夹存在
        await checkAndCreateDir(pathConst.localLrcPath + platformHash);
        await writeFile(pathConst.localLrcPath +
            platformHash +
            "/" +
            idHash +
            (type === "raw" ? "" : type === "translation" ? ".tran" : ".roma") +
            ".lrc", lyricContent, "utf8");

        if (this.trackPlayer.isCurrentMusic(musicItem)) {
            // Async refresh, non-blocking
            this.refreshLyric(false, false).catch(err => {
                devLog('warn', 'Lyric refresh after upload failed', err);
            });
        }
    }

    async removeLocalLyric(musicItem: IMusic.IMusicItem) {
        if (!musicItem) {
            return;
        }

        const platformHash = CryptoJs.MD5(musicItem.platform).toString(
            CryptoJs.enc.Hex,
        );
        const idHash: string = CryptoJs.MD5(musicItem.id).toString(
            CryptoJs.enc.Hex,
        );

        const basePath =
            pathConst.localLrcPath + platformHash + "/" + idHash;

        await unlink(basePath + ".lrc").catch(() => { });
        await unlink(basePath + ".tran.lrc").catch(() => { });
        await unlink(basePath + ".roma.lrc").catch(() => { });

        if (this.trackPlayer.isCurrentMusic(musicItem)) {
            // Async refresh, non-blocking
            this.refreshLyric(false, false).catch(err => {
                devLog('warn', 'Lyric refresh after removal failed', err);
            });
        }

    }

    // Force reload current lyric (used when config changes like enableWordByWord)
    reloadCurrentLyric() {
        this.refreshLyric(false, false).catch(err => {
            devLog('warn', 'Lyric reload failed', err);
        });
    }


    updateLyricOffset(musicItem: IMusic.IMusicItem, offset: number) {
        if (!musicItem) {
            return;
        }

        // 更新歌词偏移
        patchMediaExtra(musicItem, {
            lyricOffset: offset,
        });

        if (this.trackPlayer.isCurrentMusic(musicItem)) {
            // Async refresh, non-blocking
            this.refreshLyric(true, false).catch(err => {
                devLog('warn', 'Lyric refresh after offset update failed', err);
            });
        }
    }

    private setLyricAsLoadingState() {
        getDefaultStore().set(lyricStateAtom, {
            loading: true,
            lyrics: [],
            hasTranslation: false,
            hasRomanization: false,
        });
        getDefaultStore().set(currentLyricItemAtom, null);
    }

    private setLyricAsNoLyricState() {
        getDefaultStore().set(lyricStateAtom, {
            loading: false,
            lyrics: [],
            hasTranslation: false,
            hasRomanization: false,
        });
        getDefaultStore().set(currentLyricItemAtom, null);
        if (this.appConfig.getConfig("lyric.showStatusBarLyric")) {
            const musicItem = this.trackPlayer.currentMusic;
            LyricUtil.setStatusBarLyricText(musicItem ? `${musicItem.title} - ${musicItem.artist}` : "MusicFree");
        }
    }

    private async refreshLyric(skipFetchLyricSourceIfSame: boolean = true, ignoreProgress: boolean = false) {
        const currentMusicItem = this.trackPlayer.currentMusic;

        devLog('info', 'Lyric refresh started', {
            hasMusic: !!currentMusicItem,
            title: currentMusicItem?.title,
            skipFetchLyricSourceIfSame,
            ignoreProgress
        });

        // 如果没有当前音乐项，重置歌词状态
        if (!currentMusicItem) {
            this.setLyricAsNoLyricState();
            return;
        }

        try {
            let lrcSource: ILyric.ILyricSource | null;

            if (skipFetchLyricSourceIfSame && this.lyricParser && this.trackPlayer.isCurrentMusic(this.lyricParser.musicItem)) {
                lrcSource = this.lyricParser.lyricSource ?? null;
                devLog('info', 'Using cached lyric source', { hasSource: !!lrcSource });
            } else {
                // 重置歌词状态
                this.setLyricAsLoadingState();

                devLog('info', 'Fetching lyric from plugin', { platform: currentMusicItem.platform });
                const fetchStartTime = Date.now();

                lrcSource = (await this.pluginManager.getByMedia(currentMusicItem)?.methods?.getLyric(currentMusicItem)) ?? null;

                const fetchDuration = Date.now() - fetchStartTime;
                devLog('info', 'Plugin lyric fetch completed', {
                    duration: fetchDuration,
                    hasSource: !!lrcSource,
                    hasRawLrc: !!lrcSource?.rawLrc
                });
            }

            // 切换到其他歌曲了, 直接返回
            if (!this.trackPlayer.isCurrentMusic(currentMusicItem)) {
                devLog('info', 'Music changed during lyric fetch, aborting');
                return;
            }

            // 如果歌词源不存在，并且开启自动搜索歌词
            if (!lrcSource && this.appConfig.getConfig("lyric.autoSearchLyric")) {
                // 重置歌词状态
                this.setLyricAsLoadingState();

                devLog('info', 'Auto-searching similar lyric');
                lrcSource = await this.searchSimilarLyric(currentMusicItem);
            }

            // 切换到其他歌曲了, 直接返回
            if (!this.trackPlayer.isCurrentMusic(currentMusicItem)) {
                devLog('info', 'Music changed during lyric search, aborting');
                return;
            }

            // 如果源不存在，恢复默认设置
            if (!lrcSource) {
                devLog('info', 'No lyric source found, setting no-lyric state');
                this.setLyricAsNoLyricState();
                this.lyricParser = null;
                return;
            }

            // CRITICAL FIX: Defer CPU-intensive decryption to prevent blocking playback
            // QRC decryption involves Triple-DES + Zlib which can take 100-500ms+ synchronously
            devLog('info', 'Processing lyric data', {
                hasRawLrc: !!lrcSource.rawLrc,
                hasTranslation: !!lrcSource.translation,
                hasRomanization: !!lrcSource.romanization
            });

            // Defer decryption to next event loop cycle to allow playback to start
            await new Promise(resolve => setTimeout(resolve, 0));

            const decryptStartTime = Date.now();

            // Get word-by-word setting from config
            const enableWordByWord = this.appConfig.getConfig("lyric.enableWordByWord") ?? true;
            devLog('info', '[Lyric] Word-by-word config', { enableWordByWord });

            // Native async decryption (non-blocking, ~10ms)
            // Pass enableWordByWord to preserve word-level timing for QRC lyrics
            const rawLrc = lrcSource.rawLrc ? await autoDecryptLyric(lrcSource.rawLrc, enableWordByWord) : lrcSource.rawLrc;
            const translation = lrcSource.translation ? await autoDecryptLyric(lrcSource.translation, enableWordByWord) : lrcSource.translation;
            const romanization = lrcSource.romanization ? await autoDecryptLyric(lrcSource.romanization, enableWordByWord) : lrcSource.romanization;

            const decryptDuration = Date.now() - decryptStartTime;
            devLog('info', 'Lyric decryption completed', {
                duration: decryptDuration,
                rawLrcLength: rawLrc?.length,
                translationLength: translation?.length,
                romanizationLength: romanization?.length
            });

            this.lyricParser = new LyricParser(rawLrc!, {
                extra: {
                    offset: (getMediaExtraProperty(currentMusicItem, "lyricOffset") || 0) * -1,
                },
                musicItem: currentMusicItem,
                lyricSource: lrcSource,
                translation,
                romanization,
            });

            getDefaultStore().set(lyricStateAtom, {
                loading: false,
                lyrics: this.lyricParser.getLyricItems(),
                hasTranslation: !!lrcSource.translation,
                hasRomanization: !!lrcSource.romanization,
                meta: this.lyricParser.getMeta(),
            });

            const currentLyric = ignoreProgress ? (this.lyricParser.getLyricItems()?.[0] ?? null) : this.lyricParser.getPosition((await this.trackPlayer.getProgress()).position);
            getDefaultStore().set(currentLyricItemAtom, currentLyric || null);

            devLog('info', 'Lyric refresh completed successfully', {
                lyricCount: this.lyricParser.getLyricItems().length,
                hasTranslation: !!lrcSource.translation,
                hasRomanization: !!lrcSource.romanization
            });

            if (this.appConfig.getConfig("lyric.showStatusBarLyric")) {
                if (currentLyric) {
                    this.updateDesktopLyricDisplay(currentLyric);
                } else {
                    const musicItem = this.trackPlayer.currentMusic;
                    LyricUtil.setStatusBarLyricText(musicItem ? `${musicItem.title} - ${musicItem.artist}` : "MusicFree");
                }
            }
        } catch (err) {
            devLog('error', 'Lyric refresh failed', err);
            if (this.trackPlayer.isCurrentMusic(currentMusicItem)) {
                this.lyricParser = null;
                this.setLyricAsNoLyricState();
            }
        }
    }

    /**
     * 检索最接近的歌词
     * @param musicItem 
     * @returns 
     */
    private async searchSimilarLyric(musicItem: IMusic.IMusicItem) {
        const keyword = musicItem.alias || musicItem.title;
        const plugins = this.pluginManager.getSearchablePlugins("lyric");

        let distance = Infinity;
        let minDistanceMusicItem;
        let targetPlugin: Plugin | null = null;

        for (let plugin of plugins) {
            // 如果插件不是当前音乐的插件，或者当前音乐不是正在播放的音乐，则跳过
            if (
                !this.trackPlayer.isCurrentMusic(musicItem)
            ) {
                return null;
            }

            if (plugin.name === musicItem.platform) {
                // 如果插件是当前音乐的插件，则跳过
                continue;
            }

            const results = await plugin.methods
                .search(keyword, 1, "lyric")
                .catch(() => null);

            // 取前两个
            const firstTwo = results?.data?.slice(0, 2) || [];

            for (let item of firstTwo) {
                if (
                    item.title === keyword &&
                    item.artist === musicItem.artist
                ) {
                    distance = 0;
                    minDistanceMusicItem = item;
                    targetPlugin = plugin;
                    break;
                } else {
                    const dist =
                        minDistance(keyword, musicItem.title) +
                        minDistance(item.artist, musicItem.artist);
                    if (dist < distance) {
                        distance = dist;
                        minDistanceMusicItem = item;
                        targetPlugin = plugin;
                    }
                }
            }

            if (distance === 0) {
                break;
            }
        }

        if (minDistanceMusicItem && targetPlugin) {
            return await targetPlugin.methods
                .getLyric(minDistanceMusicItem)
                .catch(() => null);
        }

        return null;
    }

}

const lyricManager = new LyricManager();
export default lyricManager;


export const useLyricState = () => useAtomValue(lyricStateAtom);
export const useCurrentLyricItem = () => useAtomValue(currentLyricItemAtom);
// 当前播放位置（毫秒），用于逐字歌词效果
export const useCurrentPositionMs = () => useAtomValue(currentPositionMsAtom);