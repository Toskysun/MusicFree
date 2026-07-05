import { getCurrentDialog, showDialog } from "@/components/dialogs/useDialog";
import {
    internalFakeSoundKey,
    sortIndexSymbol,
    timeStampSymbol,
} from "@/constants/commonConst";
import { MusicRepeatMode } from "@/constants/repeatModeConst";
import delay from "@/utils/delay";
import getUrlExt from "@/utils/getUrlExt";
import { appendStartupBreadcrumb, errorLog, trace, devLog } from "@/utils/log";
import { createMediaIndexMap } from "@/utils/mediaIndexMap";
import {
    getLocalPath,
    isSameMediaItem,
} from "@/utils/mediaUtils";
import Toast from "@/utils/toast";
import { getQualityText } from "@/utils/qualities";
import i18n from "@/core/i18n";
import Network from "@/utils/network";
import PersistStatus from "@/utils/persistStatus";
import { getQualityOrder, getSmartQuality } from "@/utils/qualities";
import { musicIsPaused } from "@/utils/trackUtils";
import EventEmitter from "eventemitter3";
import { produce } from "immer";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import shuffle from "lodash.shuffle";
import ReactNativeTrackPlayer, {
    Event,
    State,
    Track,
    TrackMetadataBase,
    usePlaybackState,
    useProgress,
} from "react-native-track-player";
import { Platform } from "react-native";
import LocalMusicSheet from "../localMusicSheet";

import { TrackPlayerEvents } from "@/core.defination/trackPlayer";
import type { IAppConfig } from "@/types/core/config";
import type { IMusicHistory } from "@/types/core/musicHistory";
import { ITrackPlayer } from "@/types/core/trackPlayer/index";
import minDistance from "@/utils/minDistance";
import { IPluginManager } from "@/types/core/pluginManager";
import { ImgAsset } from "@/constants/assetsConst";
import { resolveImportedAssetOrPath } from "@/utils/fileUtils";



const currentMusicAtom = atom<IMusic.IMusicItem | null>(null);
const repeatModeAtom = atom<MusicRepeatMode>(MusicRepeatMode.QUEUE);
const qualityAtom = atom<IMusic.IQualityKey>("320k");
const playListAtom = atom<IMusic.IMusicItem[]>([]);

function isLoopbackHttpUrl(url?: string) {
    if (!url) {
        return false;
    }

    try {
        const parsed = new URL(url);
        return (
            (parsed.protocol === "http:" || parsed.protocol === "https:") &&
            (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1")
        );
    } catch {
        return false;
    }
}


class TrackPlayer extends EventEmitter<{
    [TrackPlayerEvents.PlayEnd]: () => void;
    [TrackPlayerEvents.CurrentMusicChanged]: (musicItem: IMusic.IMusicItem | null) => void;
    [TrackPlayerEvents.ProgressChanged]: (progress: {
        position: number;
        duration: number;
    }) => void;
}> implements ITrackPlayer {
    // 依赖
    private configService!: IAppConfig;
    private musicHistoryService!: IMusicHistory;
    private pluginManagerService!: IPluginManager;

    // 当前播放的音乐下标
    private currentIndex = -1;
    // 音乐播放器服务是否启动
    private serviceInited = false;
    // 播放队列索引map
    private playListIndexMap = createMediaIndexMap([] as IMusic.IMusicItem[]);


    private static maxMusicQueueLength = 10000;
    private static halfMaxMusicQueueLength = 5000;
    private static toggleRepeatMapping = {
        [MusicRepeatMode.SHUFFLE]: MusicRepeatMode.SINGLE,
        [MusicRepeatMode.SINGLE]: MusicRepeatMode.QUEUE,
        [MusicRepeatMode.QUEUE]: MusicRepeatMode.SHUFFLE,
    };
    private static fakeAudioUrl = "musicfree://fake-audio";
    private static proposedAudioUrl = "musicfree://proposed-audio";

    constructor() {
        super();
    }

    public get previousMusic() {
        const currentMusic = this.currentMusic;
        if (!currentMusic) {
            return null;
        }

        return this.getPlayListMusicAt(this.currentIndex - 1);
    }

    public get currentMusic() {
        return getDefaultStore().get(currentMusicAtom);
    }

    public get nextMusic() {
        const currentMusic = this.currentMusic;
        if (!currentMusic) {
            return null;
        }

        return this.getPlayListMusicAt(this.currentIndex + 1);
    }

    public get repeatMode() {
        return getDefaultStore().get(repeatModeAtom);
    }

    public get quality() {
        return getDefaultStore().get(qualityAtom);
    }

    public get playList() {
        return getDefaultStore().get(playListAtom);
    }


    injectDependencies(configService: IAppConfig, musicHistoryService: IMusicHistory, pluginManager: IPluginManager): void {
        this.configService = configService;
        this.musicHistoryService = musicHistoryService;
        this.pluginManagerService = pluginManager;
    }


    async setupTrackPlayer() {
        const rate = PersistStatus.get("music.rate");
        const musicQueue = PersistStatus.get("music.playList");
        const repeatMode = PersistStatus.get("music.repeatMode");
        const progress = PersistStatus.get("music.progress");
        const track = PersistStatus.get("music.musicItem");
        // 偏好音质：优先用户设置的默认播放音质，回退到 master。
        // 不要直接使用 PersistStatus 里的 music.quality —— 它是上一首歌经
        // getSmartQuality 降级后的实际音质，若上一首只支持到 320k(HQ)，会把恢复的
        // 第一首歌也强制用 320k 请求音源，造成真实降级。改为对当前恢复歌曲自身的
        // 可用音质智能选择，行为与 play() 保持一致。
        const preferredQuality =
            (this.configService.getConfig("basic.defaultPlayQuality") ||
                "master") as IMusic.IQualityKey;
        const restorePlugin = track
            ? this.pluginManagerService.getByMedia(track)
            : undefined;
        const quality: IMusic.IQualityKey =
            track && (track.qualities || track.source)
                ? getSmartQuality(
                      preferredQuality,
                      (track.qualities || track.source) as
                          | IMusic.IQuality
                          | undefined,
                      restorePlugin?.supportedQualities,
                  )
                : preferredQuality;

        // 状态恢复
        if (rate) {
            ReactNativeTrackPlayer.setRate(+rate / 100);
        }
        if (repeatMode) {
            getDefaultStore().set(repeatModeAtom, repeatMode as MusicRepeatMode);
        }

        if (musicQueue && Array.isArray(musicQueue)) {
            this.addAll(
                musicQueue,
                undefined,
                repeatMode === MusicRepeatMode.SHUFFLE,
            );
        }

        if (track && this.isInPlayList(track)) {
            const shouldAutoPlayOnStartup = !!this.configService.getConfig("basic.autoPlayWhenAppStart");
            void appendStartupBreadcrumb("trackplayer-restore-found", {
                title: track.title,
                hasUrl: !!track.url,
                autoPlay: shouldAutoPlayOnStartup,
                platform: Platform.OS,
            });

            if (Platform.OS === "ios" && isLoopbackHttpUrl(track.url)) {
                void appendStartupBreadcrumb("trackplayer-restore-clear-loopback", {
                    title: track.title,
                    url: track.url,
                });
                devLog("warn", "[TrackPlayer] Clearing stale loopback URL on iOS restore", {
                    url: track.url,
                    title: track.title,
                });
                delete track.url;
                delete track.headers;
            }

            if (!shouldAutoPlayOnStartup) {
                track.isInit = true;
            }

            this.setCurrentMusic(track);
            // 同步本次智能选择的音质，保证音质标签与实际请求的音源一致
            this.setQuality(quality);
            void appendStartupBreadcrumb("trackplayer-restore-current-set", {
                title: track.title,
            });

            if (Platform.OS === "ios" && !shouldAutoPlayOnStartup) {
                void appendStartupBreadcrumb("trackplayer-restore-skip-preload-ios", {
                    title: track.title,
                });
                devLog("info", "[TrackPlayer] Skipping iOS startup source preload", {
                    title: track.title,
                });
            } else {
                void appendStartupBreadcrumb("trackplayer-restore-fetch-source", {
                    title: track.title,
                });
                this.pluginManagerService.getByMedia(track)
                    ?.methods.getMediaSource(track, quality)
                    .then(async newSource => {
                        try {
                            const { getLocalStreamUrlIfNeeded } = require("@/service/mflac/proxy");
                            const localUrl = await getLocalStreamUrlIfNeeded(newSource?.url, (newSource as any)?.ekey, newSource?.headers, (newSource as any)?.cek);
                            if (localUrl) {
                                track.url = localUrl;
                                track.headers = undefined;
                            } else {
                                track.url = newSource?.url || track.url;
                                track.headers = newSource?.headers || track.headers;
                            }
                        } catch {
                            track.url = newSource?.url || track.url;
                            track.headers = newSource?.headers || track.headers;
                        }

                        if (isSameMediaItem(this.currentMusic, track)) {
                            void appendStartupBreadcrumb("trackplayer-restore-apply-source", {
                                title: track.title,
                                hasSourceUrl: !!newSource?.url,
                            });
                            await this.setTrackSource(track as Track, false);
                            if (progress) {
                                void appendStartupBreadcrumb("trackplayer-restore-seek", {
                                    title: track.title,
                                    progress: Number(progress) || 0,
                                });
                                await this.seekTo(Number(progress) || 0);
                            }
                        }
                    })
                    .catch(error => {
                        void appendStartupBreadcrumb("trackplayer-restore-error", {
                            title: track.title,
                            message: error instanceof Error ? error.message : String(error),
                        });
                        errorLog("恢复播放音源失败", {
                            title: track.title,
                            platform: track.platform,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    });
            }
        }

        if (!this.serviceInited) {

            /**
             * 此事件可能会被触发多次（比如直接替换queue） 参考代码：https://github.com/doublesymmetry/KotlinAudio
             */
            ReactNativeTrackPlayer.addEventListener(
                Event.PlaybackActiveTrackChanged,
                async evt => {
                    if (
                        evt.index === 1 &&
                        evt.lastIndex === 0 &&
                        evt.track?.url === TrackPlayer.fakeAudioUrl
                    ) {
                        trace("queue reached fake next track");
                        this.emit(TrackPlayerEvents.PlayEnd);
                        if (
                            this.repeatMode ===
                            MusicRepeatMode.SINGLE
                        ) {
                            await this.play(null, true);
                        } else {
                            // 当前生效的歌曲是下一曲的标记
                            await this.skipToNext();
                        }
                    }
                },
            );

            ReactNativeTrackPlayer.addEventListener(
                Event.PlaybackError,
                async e => {
                    void appendStartupBreadcrumb("trackplayer-playback-error", {
                        message: e.message,
                        code: e.code,
                    });
                    errorLog("播放出错", e.message);
                    // WARNING: 不稳定，报错的时候有可能track已经变到下一首歌去了
                    const currentTrack =
                        await ReactNativeTrackPlayer.getActiveTrack();
                    if (currentTrack?.isInit) {
                        // HACK: 避免初始失败的情况
                        ReactNativeTrackPlayer.updateMetadataForTrack(0, {
                            ...currentTrack,
                            // @ts-ignore
                            isInit: undefined,
                        });
                        return;
                    }

                    if (
                        currentTrack?.url !== TrackPlayer.fakeAudioUrl && currentTrack?.url !== TrackPlayer.proposedAudioUrl &&
                        (await ReactNativeTrackPlayer.getActiveTrackIndex()) === 0 &&
                        e.message &&
                        e.message !== "android-io-file-not-found"
                    ) {
                        trace("播放出错", {
                            message: e.message,
                            code: e.code,
                        });

                        this.handlePlayFail();
                    }
                },
            );

            this.serviceInited = true;
        }
    }

    /**************** 播放队列 ******************/
    getMusicIndexInPlayList(musicItem?: IMusic.IMusicItem | null) {
        if (!musicItem) {
            return -1;
        }
        return this.playListIndexMap.getIndex(musicItem);
    }

    isInPlayList(musicItem?: IMusic.IMusicItem | null) {
        if (!musicItem) {
            return false;
        }

        return this.playListIndexMap.has(musicItem);
    }

    getPlayListMusicAt(index: number): IMusic.IMusicItem | null {
        const playList = this.playList;
        const len = playList.length;
        if (len === 0) {
            return null;
        }
        return playList[(index + len) % len];
    }

    isPlayListEmpty() {
        return this.playList.length === 0;
    }

    /****** 播放逻辑 *****/
    addAll(
        musicItems: Array<IMusic.IMusicItem>,
        beforeIndex?: number,
        shouldShuffle?: boolean,
    ): void {
        const now = Date.now();
        let newPlayList: IMusic.IMusicItem[] = [];
        let currentPlayList = this.playList;
        musicItems.forEach((item, index) => {
            item[timeStampSymbol] = now;
            item[sortIndexSymbol] = index;
        });

        if (beforeIndex === undefined || beforeIndex < 0) {
            // 1.1. 添加到歌单末尾，并过滤掉已有的歌曲
            newPlayList = currentPlayList.concat(
                musicItems.filter(item => !this.isInPlayList(item)),
            );
        } else {
            // 1.2. 新的播放列表，插入
            const indexMap = createMediaIndexMap(musicItems);
            const beforeDraft = currentPlayList
                .slice(0, beforeIndex)
                .filter(item => !indexMap.has(item));
            const afterDraft = currentPlayList
                .slice(beforeIndex)
                .filter(item => !indexMap.has(item));

            newPlayList = [...beforeDraft, ...musicItems, ...afterDraft];
        }

        // 如果太长了
        if (newPlayList.length > TrackPlayer.maxMusicQueueLength) {
            newPlayList = this.shrinkPlayListToSize(
                newPlayList,
                beforeIndex ?? newPlayList.length - 1,
            );
        }

        // 2. 如果需要随机
        if (shouldShuffle) {
            newPlayList = shuffle(newPlayList);
        }
        // 3. 设置播放列表
        this.setPlayList(newPlayList);
    }

    add(
        musicItem: IMusic.IMusicItem | IMusic.IMusicItem[],
        beforeIndex?: number,
    ): void {
        this.addAll(
            Array.isArray(musicItem) ? musicItem : [musicItem],
            beforeIndex,
        );
    }

    addNext(musicItem: IMusic.IMusicItem | IMusic.IMusicItem[]): void {
        const shouldAutoPlay = this.isPlayListEmpty() || !this.currentMusic;

        this.add(musicItem, this.currentIndex + 1);

        if (shouldAutoPlay) {
            this.play(Array.isArray(musicItem) ? musicItem[0] : musicItem);
        }
    }

    async remove(musicItem: IMusic.IMusicItem): Promise<void> {
        const playList = this.playList;

        let newPlayList: IMusic.IMusicItem[] = [];
        let currentMusic: IMusic.IMusicItem | null = this.currentMusic;
        const targetIndex = this.getMusicIndexInPlayList(musicItem);
        let shouldPlayCurrent: boolean | null = null;
        if (targetIndex === -1) {
            // 1. 这种情况应该是出错了
            return;
        }
        // 2. 移除的是当前项
        if (this.currentIndex === targetIndex) {
            // 2.1 停止播放，移除当前项
            newPlayList = produce(playList, draft => {
                draft.splice(targetIndex, 1);
            });
            // 2.2 设置新的播放列表，并更新当前音乐
            if (newPlayList.length === 0) {
                currentMusic = null;
                shouldPlayCurrent = false;
            } else {
                currentMusic = newPlayList[this.currentIndex % newPlayList.length];
                try {
                    const state = (
                        await ReactNativeTrackPlayer.getPlaybackState()
                    ).state;
                    shouldPlayCurrent = !musicIsPaused(state);
                } catch {
                    shouldPlayCurrent = false;
                }
            }
            this.setCurrentMusic(currentMusic);
        } else {
            // 3. 删除
            newPlayList = produce(playList, draft => {
                draft.splice(targetIndex, 1);
            });
        }

        this.setPlayList(newPlayList);
        if (shouldPlayCurrent === true) {
            await this.play(currentMusic, true);
        } else if (shouldPlayCurrent === false) {
            await ReactNativeTrackPlayer.reset();
        }
    }

    isCurrentMusic(musicItem?: IMusic.IMusicItem | null) {
        return isSameMediaItem(musicItem, this.currentMusic);
    }

    async play(
        musicItem?: IMusic.IMusicItem | null,
        forcePlay?: boolean,
    ): Promise<void> {
        const playStartTime = Date.now();
        void appendStartupBreadcrumb("trackplayer-play-invoked", {
            title: musicItem?.title ?? this.currentMusic?.title ?? "",
            platform: musicItem?.platform ?? this.currentMusic?.platform ?? "",
            forcePlay: !!forcePlay,
        });
        devLog('info', '[TrackPlayer] Play method called', {
            title: musicItem?.title,
            forcePlay,
            timestamp: playStartTime
        });

        try {
            // 如果不传参，默认是播放当前音乐
            if (!musicItem) {
                musicItem = this.currentMusic;
            }
            if (!musicItem) {
                throw new Error(PlayFailReason.PLAY_LIST_IS_EMPTY);
            }
            // 1. 移动网络禁止播放
            const localPath = getLocalPath(musicItem);
            if (
                Network.isCellular &&
                !this.configService.getConfig("basic.useCelluarNetworkPlay") &&
                !LocalMusicSheet.isLocalMusic(musicItem) &&
                !localPath
            ) {
                await ReactNativeTrackPlayer.reset();
                throw new Error(PlayFailReason.FORBID_CELLUAR_NETWORK_PLAY);
            }

            // 2. 如果是当前正在播放的音频
            if (this.isCurrentMusic(musicItem)) {
                // 获取底层播放器中的track
                const currentTrack = await ReactNativeTrackPlayer.getTrack(0);
                // 2.1 如果当前有源
                if (
                    currentTrack?.url &&
                    isSameMediaItem(
                        musicItem,
                        currentTrack as IMusic.IMusicItem,
                    )
                ) {
                    const currentActiveIndex =
                        await ReactNativeTrackPlayer.getActiveTrackIndex();
                    if (currentActiveIndex !== 0) {
                        await ReactNativeTrackPlayer.skip(0);
                    }
                    if (forcePlay) {
                        // 2.1.1 强制重新开始
                        await this.seekTo(0);
                    }
                    const currentState = (
                        await ReactNativeTrackPlayer.getPlaybackState()
                    ).state;
                    if (currentState === State.Stopped) {
                        await this.setTrackSource(currentTrack);
                    }
                    if (currentState !== State.Playing) {
                        // 2.1.2 恢复播放
                        await ReactNativeTrackPlayer.play();
                    }
                    // 这种情况下，播放队列和当前歌曲都不需要变化
                    return;
                }
                // 2.2 其他情况：重新获取源
            }

            // 3. 如果没有在播放列表中，添加到队尾；同时更新列表状态
            const inPlayList = this.isInPlayList(musicItem);
            if (!inPlayList) {
                this.add(musicItem);
            }

            // 4. 更新列表状态和当前音乐
            devLog('info', '[TrackPlayer] Setting current music and emitting event', {
                title: musicItem.title,
                timestamp: Date.now(),
                elapsed: Date.now() - playStartTime
            });

            this.setCurrentMusic(musicItem);

            devLog('info', '[TrackPlayer] Current music set, initializing queue', {
                timestamp: Date.now(),
                elapsed: Date.now() - playStartTime
            });

            void appendStartupBreadcrumb("trackplayer-set-proposed-queue", {
                title: musicItem.title,
            });
            await ReactNativeTrackPlayer.setQueue([{
                ...musicItem,
                url: TrackPlayer.proposedAudioUrl,
                artwork: resolveImportedAssetOrPath(musicItem.artwork?.trim?.()?.length ? musicItem.artwork : ImgAsset.albumDefault) as unknown as any,
            }, this.getFakeNextTrack()]);

            devLog('info', '[TrackPlayer] Queue initialized, fetching media source', {
                timestamp: Date.now(),
                elapsed: Date.now() - playStartTime
            });

            // 5. 获取音源
            let track: IMusic.IMusicItem;

            // 5.1 通过插件获取音源
            const plugin = this.pluginManagerService.getByName(musicItem.platform);
            
            // 5.2 智能音质选择
            const preferredQuality = this.configService.getConfig("basic.defaultPlayQuality") ?? "master";
            let selectedQuality: IMusic.IQualityKey;
            
            // 如果音乐项包含音质信息，使用智能选择
            if (musicItem.qualities || musicItem.source) {
                selectedQuality = getSmartQuality(
                    preferredQuality,
                    (musicItem.qualities || musicItem.source) as IMusic.IQuality | undefined,
                    plugin?.supportedQualities // 假设插件提供支持的音质列表
                );
            } else {
                // 回退到传统的音质排序方法
                selectedQuality = preferredQuality;
            }
            
            // 5.3 获取音质排序作为后备
            const qualityOrder = getQualityOrder(
                selectedQuality,
                this.configService.getConfig("basic.playQualityOrder") ?? "asc",
            );
            
            // 5.4 插件返回音源
            let source: IPlugin.IMediaSourceResult | null = null;
            
            // 首先尝试智能选择的音质
            if (this.isCurrentMusic(musicItem)) {
                source = (await plugin?.methods?.getMediaSource(
                    musicItem,
                    selectedQuality,
                )) ?? null;
                
                if (source) {
                    void appendStartupBreadcrumb("trackplayer-source-selected", {
                        title: musicItem.title,
                        quality: selectedQuality,
                        url: source.url,
                    });
                    try {
                        const { getLocalStreamUrlIfNeeded } = require("@/service/mflac/proxy");
                        const localUrl = await getLocalStreamUrlIfNeeded(source.url, (source as any)?.ekey, source.headers, (source as any)?.cek);
                        if (localUrl) {
                            source.url = localUrl;
                            source.headers = undefined;
                        }
                    } catch {}
                    this.setQuality(selectedQuality);
                } else {
                    // 智能选择失败，回退到遍历所有音质
                    let fallbackQuality: IMusic.IQualityKey | null = null;
                    
                    for (let quality of qualityOrder) {
                        if (this.isCurrentMusic(musicItem)) {
                            source = (await plugin?.methods?.getMediaSource(
                                musicItem,
                                quality,
                            )) ?? null;
                            // 5.4.1 获取到真实源
                            if (source) {
                                try {
                                    const { getLocalStreamUrlIfNeeded } = require("@/service/mflac/proxy");
                                    const localUrl = await getLocalStreamUrlIfNeeded(source.url, (source as any)?.ekey, source.headers, (source as any)?.cek);
                                    if (localUrl) {
                                        source.url = localUrl;
                                        source.headers = undefined;
                                    }
                                } catch {}
                                this.setQuality(quality);
                                fallbackQuality = quality;
                                break;
                            }
                        } else {
                            // 5.4.2 已经切换到其他歌曲了，
                            return;
                        }
                    }
                    
                    // 显示音质不支持提示，包含降级结果
                    this.showQualityNotSupportedToast(selectedQuality, musicItem, fallbackQuality);
                }
            }

            if (!this.isCurrentMusic(musicItem)) {
                void appendStartupBreadcrumb("trackplayer-play-aborted-current-changed", {
                    title: musicItem.title,
                });
                return;
            }
            if (!source) {
                // 如果有source
                if (musicItem.source) {
                    for (let quality of qualityOrder) {
                        if (musicItem.source[quality]?.url) {
                            source = musicItem.source[quality]!;
                            this.setQuality(quality);

                            break;
                        }
                    }
                }
                // 5.4 没有返回源
                if (!source && !musicItem.url) {
                    // 插件失效的情况
                    if (this.configService.getConfig("basic.tryChangeSourceWhenPlayFail")) {
                        // 重试
                        const similarMusic = await this.getSimilarMusic(
                            musicItem,
                            "music",
                            () => !this.isCurrentMusic(musicItem),
                        );

                        if (similarMusic) {
                            const similarMusicPlugin =
                                this.pluginManagerService.getByMedia(similarMusic);

                            for (let quality of qualityOrder) {
                                if (this.isCurrentMusic(musicItem)) {
                                    source =
                                        (await similarMusicPlugin?.methods?.getMediaSource(
                                            similarMusic,
                                            quality,
                                        )) ?? null;
                                    // 5.4.1 获取到真实源
                                    if (source) {
                                        try {
                                            const { getLocalStreamUrlIfNeeded } = require("@/service/mflac/proxy");
                                            devLog('info', '🎵[trackPlayer] 尝试处理mflac', {
                                                url: source.url,
                                                hasEkey: !!source.ekey,
                                                ekeyLength: source.ekey?.length
                                            });
                                            const localUrl = await getLocalStreamUrlIfNeeded(source.url, source.ekey, source.headers, source.cek);
                                            if (localUrl) {
                                                devLog('info', '✅[trackPlayer] mflac代理URL生成成功', { localUrl });
                                                source.url = localUrl;
                                                source.headers = undefined;
                                            } else {
                                                devLog('warn', '⚠️[trackPlayer] mflac代理URL生成失败');
                                            }
                                        } catch (error: any) {
                                            devLog('error', '❌[trackPlayer] mflac处理异常', error);
                                        }
                                        this.setQuality(quality);
                                        break;
                                    }
                                } else {
                                    // 5.4.2 已经切换到其他歌曲了，
                                    return;
                                }
                            }
                        }

                        if (!source) {
                            throw new Error(PlayFailReason.INVALID_SOURCE);
                        }
                    } else {
                        throw new Error(PlayFailReason.INVALID_SOURCE);
                    }
                } else {
                    source = {
                        url: musicItem.url,
                    };
                    // 使用用户设置的默认音质，而不是硬编码
                    this.setQuality(preferredQuality);
                }
            }

            // 6. 特殊类型源
            if (getUrlExt(source.url) === ".m3u8") {
                // @ts-ignore
                source.type = "hls";
            }
            // 7. 合并结果
            track = this.mergeTrackSource(musicItem, source) as IMusic.IMusicItem;

            // 8. 新增历史记录
            this.musicHistoryService.addMusic(musicItem);

            devLog('info', '[TrackPlayer] Media source obtained, starting playback', {
                timestamp: Date.now(),
                elapsed: Date.now() - playStartTime,
                hasUrl: !!track.url
            });

            trace("获取音源成功", track);

            // 9. 设置音源并立即开始播放 - CRITICAL: 不等待任何其他操作
            await this.setTrackSource(track as Track);

            devLog('info', '[TrackPlayer] Playback started successfully', {
                timestamp: Date.now(),
                elapsed: Date.now() - playStartTime
            });

            // 10. 异步获取补充信息 - 完全后台执行，绝对不阻塞播放
            // CRITICAL FIX: Use setTimeout(0) to push to end of event queue after playback starts
            setTimeout(() => {
                (async () => {
                    try {
                        const info = (await plugin?.methods?.getMusicInfo?.(musicItem)) ?? null;
                        if (info) {
                            if (
                                (typeof info.url === "string" && info.url.trim() === "") ||
                                (info.url && typeof info.url !== "string")
                            ) {
                                delete info.url;
                            }

                            // 11. 设置补充信息
                            if (this.isCurrentMusic(musicItem)) {
                                const mergedTrack = this.mergeTrackSource(track, info);
                                getDefaultStore().set(currentMusicAtom, mergedTrack as IMusic.IMusicItem);
                                await ReactNativeTrackPlayer.updateMetadataForTrack(
                                    0,
                                    mergedTrack as TrackMetadataBase,
                                );
                            }
                        }
                    } catch (err) {
                        devLog('warn', '[TrackPlayer] Failed to fetch additional music info', err);
                    }
                })();
            }, 0);
        } catch (e: any) {
            void appendStartupBreadcrumb("trackplayer-play-catch", {
                title: musicItem?.title ?? this.currentMusic?.title ?? "",
                message: e?.message,
                name: e?.name,
            });
            const message = e?.message;
            if (
                message ===
                "The player is not initialized. Call setupPlayer first."
            ) {
                await ReactNativeTrackPlayer.setupPlayer();
                this.play(musicItem, forcePlay);
            } else if (message === PlayFailReason.FORBID_CELLUAR_NETWORK_PLAY) {
                if (getCurrentDialog()?.name !== "SimpleDialog") {
                    showDialog("SimpleDialog", {
                        title: "流量提醒",
                        content:
                            "Current connection is not Wi-Fi. Enable cellular playback in settings to continue.",
                    });
                }
            } else if (message === PlayFailReason.INVALID_SOURCE) {
                trace("playback failed because source is empty");
                await this.handlePlayFail();
            } else if (message === PlayFailReason.PLAY_LIST_IS_EMPTY) {
                // 队列是空的，不应该出现这种情况
            }
        }
    }

    async pause(): Promise<void> {
        await ReactNativeTrackPlayer.pause();
    }

    toggleRepeatMode(): void {
        this.setRepeatMode(TrackPlayer.toggleRepeatMapping[this.repeatMode]);
    }

    // 清空播放队列
    async clearPlayList(): Promise<void> {
        this.setPlayList([]);
        this.setCurrentMusic(null);

        await ReactNativeTrackPlayer.reset();
        PersistStatus.set("music.musicItem", undefined);
        PersistStatus.set("music.progress", 0);
    }

    async skipToNext(): Promise<void> {
        if (this.isPlayListEmpty()) {
            this.setCurrentMusic(null);
            return;
        }

        await this.play(this.getPlayListMusicAt(this.currentIndex + 1), true);
    }

    async skipToPrevious(): Promise<void> {
        if (this.isPlayListEmpty()) {
            this.setCurrentMusic(null);
            return;
        }

        await this.play(
            this.getPlayListMusicAt(this.currentIndex === -1 ? 0 : this.currentIndex - 1),
            true,
        );
    }

    async changeQuality(newQuality: IMusic.IQualityKey): Promise<boolean> {
        // 获取当前的音乐和进度
        if (newQuality === this.quality) {
            return true;
        }

        // 获取当前歌曲
        const musicItem = this.currentMusic;
        if (!musicItem) {
            return false;
        }
        try {
            const progress = await ReactNativeTrackPlayer.getProgress();
            const plugin = this.pluginManagerService.getByMedia(musicItem);
            const newSource = await plugin?.methods?.getMediaSource(
                musicItem,
                newQuality,
            );
            if (!newSource?.url) {
                throw new Error(PlayFailReason.INVALID_SOURCE);
            }
            if (this.isCurrentMusic(musicItem)) {
                const playingState = (
                    await ReactNativeTrackPlayer.getPlaybackState()
                ).state;
                try {
                    const { getLocalStreamUrlIfNeeded } = require("@/service/mflac/proxy");
                    const localUrl = await getLocalStreamUrlIfNeeded(newSource.url, (newSource as any)?.ekey, newSource.headers, (newSource as any)?.cek);
                    const adapted = localUrl ? { ...newSource, url: localUrl, headers: undefined } : newSource;
                    await this.setTrackSource(
                        this.mergeTrackSource(musicItem, adapted) as unknown as Track,
                        !musicIsPaused(playingState),
                    );
                } catch {
                    await this.setTrackSource(
                        this.mergeTrackSource(musicItem, newSource) as unknown as Track,
                        !musicIsPaused(playingState),
                    );
                }

                await this.seekTo(progress.position ?? 0);
                this.setQuality(newQuality);
            }
            return true;
        } catch {
            // 修改失败
            return false;
        }
    }

    async playWithReplacePlayList(
        musicItem: IMusic.IMusicItem,
        newPlayList: IMusic.IMusicItem[],
    ): Promise<void> {
        if (newPlayList.length !== 0) {
            const now = Date.now();
            if (newPlayList.length > TrackPlayer.maxMusicQueueLength) {
                newPlayList = this.shrinkPlayListToSize(
                    newPlayList,
                    newPlayList.findIndex(it => isSameMediaItem(it, musicItem)),
                );
            }

            newPlayList.forEach((it, index) => {
                it[timeStampSymbol] = now;
                it[sortIndexSymbol] = index;
            });

            this.setPlayList(
                this.repeatMode === MusicRepeatMode.SHUFFLE
                    ? shuffle(newPlayList)
                    : newPlayList,
            );
            await this.play(musicItem, true);
        }
    }

    async seekTo(progress: number) {
        PersistStatus.set("music.progress", progress);
        return ReactNativeTrackPlayer.seekTo(progress);
    }

    getProgress = ReactNativeTrackPlayer.getProgress;
    getRate = ReactNativeTrackPlayer.getRate;
    setRate = ReactNativeTrackPlayer.setRate;
    reset = ReactNativeTrackPlayer.reset;


    /**************** 辅助函数 -- 设置内部状态 ****************/

    private setCurrentMusic(musicItem?: IMusic.IMusicItem | null) {
        // 设置UI内部状态的musicitem
        if (!musicItem) {
            this.currentIndex = -1;
            getDefaultStore().set(currentMusicAtom, null);
            PersistStatus.set("music.musicItem", undefined);
            PersistStatus.set("music.progress", 0);

            this.emit(TrackPlayerEvents.CurrentMusicChanged, null);
            return;
        }
        if (typeof musicItem.artwork !== "string") {
            musicItem.artwork = ImgAsset.albumDefault;
        }
        this.currentIndex = this.getMusicIndexInPlayList(musicItem);
        getDefaultStore().set(currentMusicAtom, musicItem);

        this.emit(TrackPlayerEvents.CurrentMusicChanged, musicItem);
    }

    private setRepeatMode(mode: MusicRepeatMode) {
        const playList = this.playList;
        let newPlayList: IMusic.IMusicItem[];
        const prevMode = getDefaultStore().get(repeatModeAtom);
        if (
            (prevMode === MusicRepeatMode.SHUFFLE &&
                mode !== MusicRepeatMode.SHUFFLE) ||
            (mode === MusicRepeatMode.SHUFFLE &&
                prevMode !== MusicRepeatMode.SHUFFLE)
        ) {
            if (mode === MusicRepeatMode.SHUFFLE) {
                newPlayList = shuffle(playList);
            } else {
                newPlayList = this.sortByTimestampAndIndex(playList, true);
            }
            this.setPlayList(newPlayList);
        }

        getDefaultStore().set(repeatModeAtom, mode);
        // 更新下一首歌的信息
        ReactNativeTrackPlayer.updateMetadataForTrack(
            1,
            this.getFakeNextTrack(),
        );
        // 记录
        PersistStatus.set("music.repeatMode", mode);
    }

    private setQuality(quality: IMusic.IQualityKey) {
        getDefaultStore().set(qualityAtom, quality);
        PersistStatus.set("music.quality", quality);
    }

    // 设置音源
    private async setTrackSource(track: Track, autoPlay = true) {
        const clonedTrack = this.patchMediaArtwork(track);
        if (!clonedTrack) {
            void appendStartupBreadcrumb("trackplayer-set-source-skipped", {
                reason: "patch-media-artwork-returned-null",
            });
            return;
        }
        void appendStartupBreadcrumb("trackplayer-set-source", {
            title: (track as IMusic.IMusicItem)?.title ?? "",
            url: clonedTrack.url,
            autoPlay,
        });
        await ReactNativeTrackPlayer.setQueue([clonedTrack, this.getFakeNextTrack()]);
        PersistStatus.set("music.musicItem", track as IMusic.IMusicItem);
        PersistStatus.set("music.progress", 0);
        if (autoPlay) {
            void appendStartupBreadcrumb("trackplayer-native-play", {
                title: (track as IMusic.IMusicItem)?.title ?? "",
            });
            await ReactNativeTrackPlayer.play();
        }
    }

    /**
     * 设置播放队列
     * @param newPlayList 播放队列
     * @param persist 是否持久化
     */
    private setPlayList(newPlayList: IMusic.IMusicItem[], persist = true) {
        getDefaultStore().set(playListAtom, newPlayList);

        this.playListIndexMap = createMediaIndexMap(newPlayList);

        if (persist) {
            PersistStatus.set("music.playList", newPlayList);
        }

        this.currentIndex = this.getMusicIndexInPlayList(this.currentMusic);
    }


    /**************** 辅助函数 -- 工具方法 ****************/
    private shrinkPlayListToSize = (
        queue: IMusic.IMusicItem[],
        targetIndex = this.currentIndex,
    ) => {
        // 播放列表上限，太多无法缓存状态
        if (queue.length > TrackPlayer.maxMusicQueueLength) {
            if (targetIndex < TrackPlayer.halfMaxMusicQueueLength) {
                queue = queue.slice(0, TrackPlayer.maxMusicQueueLength);
            } else {
                const right = Math.min(
                    queue.length,
                    targetIndex + TrackPlayer.halfMaxMusicQueueLength,
                );
                const left = Math.max(0, right - TrackPlayer.maxMusicQueueLength);
                queue = queue.slice(left, right);
            }
        }
        return queue;
    };

    private mergeTrackSource(
        mediaItem: ICommon.IMediaBase,
        props: Record<string, any> | undefined,
    ) {
        return props
            ? {
                ...mediaItem,
                ...props,
                id: mediaItem.id,
                platform: mediaItem.platform,
            }
            : mediaItem;
    }

    private sortByTimestampAndIndex(array: any[], newArray = false) {
        if (newArray) {
            array = [...array];
        }
        return array.sort((a, b) => {
            const ts = a[timeStampSymbol] - b[timeStampSymbol];
            if (ts !== 0) {
                return ts;
            }
            return a[sortIndexSymbol] - b[sortIndexSymbol];
        });
    }

    private getFakeNextTrack() {
        let track: Track | undefined;
        const repeatMode = this.repeatMode;
        if (repeatMode === MusicRepeatMode.SINGLE) {
            // 单曲循环
            track = this.getPlayListMusicAt(this.currentIndex) as Track;
        } else {
            // 下一曲
            track = this.getPlayListMusicAt(this.currentIndex + 1) as Track;
        }

        if (track) {
            return produce(track, _ => {
                _.url = TrackPlayer.fakeAudioUrl;
                _.$ = internalFakeSoundKey;
                _.artwork = resolveImportedAssetOrPath(ImgAsset.albumDefault) as unknown as any;
            });
        } else {
            // 只有列表长度为0时才会出现的特殊情况
            return {
                url: TrackPlayer.fakeAudioUrl,
                $: internalFakeSoundKey,
            } as Track;
        }
    }

    private showQualityNotSupportedToast(
        requestedQuality: IMusic.IQualityKey,
        musicItem: IMusic.IMusicItem,
        fallbackQuality?: IMusic.IQualityKey | null,
    ) {
        // 获取用户自定义的音质翻译设置
        const customQualityTranslations = this.configService.getConfig("basic.qualityTranslations");
        const languageData = i18n.getLanguage().languageData;
        const qualityTextI18n = getQualityText(languageData, customQualityTranslations);
        
        const requestedDisplayName = qualityTextI18n[requestedQuality];
        const platformPrefix = musicItem.platform ? `[${musicItem.platform}] ` : "";
        
        let message: string;
        if (fallbackQuality) {
            const fallbackDisplayName = qualityTextI18n[fallbackQuality];
            message = `${platformPrefix}歌曲不支持${requestedDisplayName}，已降级至${fallbackDisplayName}`;
        } else {
            message = `${platformPrefix}歌曲不支持${requestedDisplayName}，无法播放该音质`;
        }
        
        // 显示Toast提示
        Toast.warn(message);
    }


    private async handlePlayFail() {
        // 如果自动跳转下一曲, 500s后自动跳转
        if (!this.configService.getConfig("basic.autoStopWhenError")) {
            await delay(500);
            await this.skipToNext();
        }
    }

    /**
 *
 * @param musicItem 音乐类型
 * @param type 媒体类型
 * @param abortFunction 如果函数为true，则中断
 * @returns
 */
    private async getSimilarMusic<T extends ICommon.SupportMediaType>(
        musicItem: IMusic.IMusicItem,
        type: T = "music" as T,
        abortFunction?: () => boolean,
    ): Promise<ICommon.SupportMediaItemBase[T] | null> {
        const keyword = musicItem.alias || musicItem.title;
        const plugins = this.pluginManagerService.getSearchablePlugins(type);

        let distance = Infinity;
        let minDistanceMusicItem;
        let targetPlugin;

        const startTime = Date.now();

        for (let plugin of plugins) {
            // 超时时间：8s
            if (abortFunction?.() || Date.now() - startTime > 8000) {
                break;
            }
            if (plugin.name === musicItem.platform) {
                continue;
            }
            const results = await plugin.methods
                .search(keyword, 1, type)
                .catch(() => null);

            // 取前两个
            const firstTwo = results?.data?.slice(0, 2) || [];

            for (let item of firstTwo) {
                if (item.title === keyword && item.artist === musicItem.artist) {
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
            return minDistanceMusicItem as ICommon.SupportMediaItemBase[T];
        }

        return null;
    }


    private patchMediaArtwork(track: Track) {
        // Bug: React native track player 在设置音频时，artwork不能为null，并且部分情况下artwork不能为ImageSource类型
        if (!track) {
            return null;
        }
        return {
            ...track,
            artwork: resolveImportedAssetOrPath(
                track.artwork?.trim?.()?.length ? track.artwork : ImgAsset.albumDefault,
            ) as unknown as any,
        };
    }

}

export const usePlayList = () => useAtomValue(playListAtom);
export const useCurrentMusic = () => useAtomValue(currentMusicAtom);
export const useRepeatMode = () => useAtomValue(repeatModeAtom);
export const useMusicQuality = () => useAtomValue(qualityAtom);
export function useMusicState() {
    const playbackState = usePlaybackState();

    return playbackState.state;
}
export { State as MusicState, useProgress };

enum PlayFailReason {
    /** 禁止移动网络播放 */
    FORBID_CELLUAR_NETWORK_PLAY = "FORBID_CELLUAR_NETWORK_PLAY",
    /** 播放列表为空 */
    PLAY_LIST_IS_EMPTY = "PLAY_LIST_IS_EMPTY",
    /** 无效源 */
    INVALID_SOURCE = "INVALID_SOURCE",
    /** 非当前音乐 */
}

const trackPlayer = new TrackPlayer();
export default trackPlayer;

