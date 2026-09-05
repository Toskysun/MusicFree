import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    StatusBar,
    Text,
    View,
} from "react-native";
import Slider from "@react-native-community/slider";
import Video, { type VideoRef } from "react-native-video";
import * as NavigationBar from "expo-navigation-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import PanelFullscreen from "../base/panelFullscreen";
import { hideMvPlayer } from "@/components/mvPlayer/useMvPlayer";
import TrackPlayer from "@/core/trackPlayer";
import pluginManager from "@/core/pluginManager";
import Toast from "@/utils/toast";
import { useI18N } from "@/core/i18n";
import rpx from "@/utils/rpx";
import Icon from "@/components/base/icon";

interface IMvPlayerProps {
    musicItem: IMusic.IMusicItem;
    initialSource?: IPlugin.IVideoSourceResult;
    onClosed?: () => void;
}

interface IVideoSource {
    uri: string;
    headers?: Record<string, string>;
    backupUrls?: string[];
}

type VideoQualityOption = IPlugin.IVideoQualityOption;

function getVideoHeaders(source: IPlugin.IVideoSourceResult) {
    const headers = { ...(source.headers ?? {}) };
    if (source.userAgent) {
        const userAgentKey = Object.keys(headers).find(
            key => key.toLowerCase() === "user-agent",
        );
        headers[userAgentKey ?? "User-Agent"] = source.userAgent;
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
}

function normalizeQualityOption(
    option: string | VideoQualityOption,
): VideoQualityOption | null {
    if (typeof option === "string") {
        const key = option.trim();
        return key ? { key, label: key } : null;
    }
    const key = option.key?.trim();
    return key ? { ...option, key } : null;
}

function qualityHeight(option: VideoQualityOption) {
    if (option.height) return option.height;
    const name = `${option.key} ${option.label ?? ""}`;
    if (/8k/i.test(name)) return 4320;
    if (/4k/i.test(name)) return 2160;
    return Number.parseInt(
        name.match(/(?:^|[^0-9])(\d{3,4})p?/i)?.[1] ?? "0",
        10,
    );
}

function isDolbyVision(option: VideoQualityOption) {
    return (
        option.dynamicRange === "dolby-vision" ||
        /dolby[\s_-]*vision|dovi|dvhe|dvh1|杜比视界/i.test(
            `${option.key} ${option.label ?? ""} ${option.codec ?? ""}`,
        )
    );
}

function getDynamicRange(
    option: VideoQualityOption,
): IPlugin.VideoDynamicRange | undefined {
    if (option.dynamicRange) return option.dynamicRange;
    return isDolbyVision(option) ? "dolby-vision" : undefined;
}

/** 画质排序权重：动态范围 > 分辨率 > 高帧率。 */
function getQualityRank(option: VideoQualityOption) {
    const rangeRank = getDynamicRange(option) === "dolby-vision"
        ? 3
        : getDynamicRange(option) === "hdr10"
            ? 2
            : getDynamicRange(option) === "sdr"
                ? 1
                : 0;
    const hfrRank = /hfr|high[\s_-]*frame|高帧/i.test(
        `${option.key} ${option.label ?? ""}`,
    )
        ? 1
        : 0;
    return rangeRank * 100_000 + qualityHeight(option) * 10 + hfrRank;
}

/** 仅保留已定义字段，避免 undefined 覆盖已有的画质信息。 */
function definedFields<T extends object>(value: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(value).filter(([, v]) => v !== undefined),
    ) as Partial<T>;
}

function mergeQualityOptions(
    ...groups: Array<Array<string | VideoQualityOption> | undefined>
) {
    const merged = new Map<string, VideoQualityOption>();
    groups.flatMap(group => group ?? []).forEach(raw => {
        const option = normalizeQualityOption(raw);
        if (!option) return;
        const previous = merged.get(option.key);
        merged.set(option.key, {
            ...previous,
            ...definedFields(option),
        });
    });
    return [...merged.values()].sort((left, right) => {
        return (
            getQualityRank(right) - getQualityRank(left) ||
            (right.width ?? 0) - (left.width ?? 0) ||
            (right.bitrate ?? 0) - (left.bitrate ?? 0) ||
            right.key.localeCompare(left.key)
        );
    });
}

function sourceQualityOption(
    source: IPlugin.IVideoSourceResult,
    fallbackKey?: string,
) {
    const key = source.videoQuality || fallbackKey;
    if (!key) return undefined;
    return {
        key,
        label: source.videoQuality || fallbackKey,
        width: source.width,
        height: source.height,
        bitrate: source.bitrate,
        size: source.size,
        codec: source.codec,
        mimeType: source.mimeType,
        dynamicRange: source.dynamicRange,
    } satisfies VideoQualityOption;
}

function getQualityLabel(option: VideoQualityOption) {
    return option.label || (option.height ? `${option.height}p` : option.key);
}

function formatQualityDetails(option: VideoQualityOption) {
    const details: string[] = [];
    if (option.width && option.height) {
        details.push(`${option.width}x${option.height}`);
    } else if (option.height) {
        details.push(`${option.height}p`);
    }
    if (option.bitrate) {
        details.push(formatBitrate(option.bitrate));
    }
    if (option.size !== undefined && option.size !== null && option.size !== "") {
        details.push(formatFileSize(option.size));
    }
    const range = option.dynamicRange === "dolby-vision"
        ? "Dolby Vision"
        : option.dynamicRange === "hdr10"
            ? "HDR10"
            : undefined;
    if (range) details.push(range);
    if (option.codec) details.push(option.codec);
    return details.join(" · ");
}

/**
 * 后台并发预取各画质的真实信息（分辨率/码率/大小/编码/动态范围），
 * 用于补全画质菜单。最多同时发起 3 个请求，单个失败不影响整体。
 */
async function hydrateQualityOptions(
    getSource: (
        musicItem: IMusic.IMusicItemBase,
        videoQuality?: string,
    ) => Promise<IPlugin.IVideoSourceResult | null>,
    musicItem: IMusic.IMusicItem,
    baseOptions: VideoQualityOption[],
    activeKey: string,
): Promise<VideoQualityOption[]> {
    const enriched = baseOptions.map(option => ({ ...option }));
    const candidates = enriched.filter(
        option =>
            option.key !== activeKey &&
            option.height === undefined &&
            option.width === undefined &&
            option.codec === undefined,
    );
    if (candidates.length === 0) return enriched;

    let nextIndex = 0;
    const hydrate = async () => {
        while (nextIndex < candidates.length) {
            const candidate = candidates[nextIndex++];
            const target = enriched.find(option => option.key === candidate.key);
            if (!target) continue;
            try {
                const result = await getSource(musicItem, candidate.key);
                if (!result?.url) continue;
                const meta = sourceQualityOption(result, candidate.key);
                if (!meta) continue;
                target.label = meta.label || target.label;
                if (meta.width) target.width = meta.width;
                if (meta.height) target.height = meta.height;
                if (meta.bitrate) target.bitrate = meta.bitrate;
                if (meta.size !== undefined && meta.size !== null && meta.size !== "") {
                    target.size = meta.size;
                }
                if (meta.codec) target.codec = meta.codec;
                if (meta.mimeType) target.mimeType = meta.mimeType;
                if (meta.dynamicRange) target.dynamicRange = meta.dynamicRange;
            } catch {
                // 单个画质拉取失败不影响其余候选
            }
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(3, candidates.length) }, () => hydrate()),
    );
    return enriched;
}

function formatBitrate(value: number) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mbps`;
    if (value >= 1_000) return `${Math.round(value / 1_000)} kbps`;
    return `${value} bps`;
}

function formatFileSize(value: number | string) {
    if (typeof value === "string") return value;
    if (value >= 1024 * 1024 * 1024) {
        return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    if (value >= 1024) return `${Math.round(value / 1024)} KB`;
    return `${value} B`;
}

function lockVideoOrientation(width?: number, height?: number) {
    if (!width || !height) return;
    const lock = width >= height
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT;
    ScreenOrientation.lockAsync(lock).catch(() => undefined);
}

function hideSystemBars() {
    if (typeof StatusBar?.setHidden === "function") {
        try {
            StatusBar.setHidden(true, "none");
        } catch {
            // The status bar bridge may be unavailable while a stale debug build is running.
        }
    }
    if (
        Platform.OS === "android" &&
        typeof NavigationBar?.setHidden === "function"
    ) {
        try {
            const result = NavigationBar.setHidden(true);
            if (result && typeof (result as Promise<void>).catch === "function") {
                (result as Promise<void>).catch(() => undefined);
            }
        } catch {
            // expo-navigation-bar can be present in JS before its native module is linked.
        }
    }
}

function restoreSystemBars() {
    if (typeof StatusBar?.setHidden === "function") {
        try {
            StatusBar.setHidden(false, "none");
        } catch {
            // The status bar bridge may be unavailable while a stale debug build is running.
        }
    }
    if (
        Platform.OS === "android" &&
        typeof NavigationBar?.setHidden === "function"
    ) {
        try {
            const result = NavigationBar.setHidden(false);
            if (result && typeof (result as Promise<void>).catch === "function") {
                (result as Promise<void>).catch(() => undefined);
            }
        } catch {
            // expo-navigation-bar can be present in JS before its native module is linked.
        }
    }
}

export default function MvPlayer({
    musicItem,
    initialSource,
    onClosed,
}: IMvPlayerProps) {
    const { t } = useI18N();
    const [source, setSource] = useState<IVideoSource | null>(null);
    const [quality, setQuality] = useState("");
    const [qualityOptions, setQualityOptions] = useState<VideoQualityOption[]>([]);
    const [qualityMenuVisible, setQualityMenuVisible] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [duration, setDuration] = useState(0);
    const [position, setPosition] = useState(0);
    const [backupIndex, setBackupIndex] = useState(0);
    const [sourceVersion, setSourceVersion] = useState(0);
    const videoRef = useRef<VideoRef>(null);
    const pendingSeekRef = useRef<number | null>(null);
    const [paused, setPaused] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const plugin = useMemo(
        () => pluginManager.getByMedia(musicItem),
        [musicItem],
    );

    const showControls = () => {
        setControlsVisible(true);
        hideSystemBars();
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => {
            if (!qualityMenuVisible && !loading && !error) {
                setControlsVisible(false);
            }
        }, 4200);
    };

    useEffect(() => {
        hideSystemBars();
        showControls();
        return () => {
            if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
            restoreSystemBars();
        };
        // The timer should only be initialized once per mounted player.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        let canceled = false;
        let suspended = false;

        const openVideo = async () => {
            await TrackPlayer.suspendForVideo();
            suspended = true;
            if (canceled) {
                await TrackPlayer.restoreAfterVideo();
                return;
            }

            const declaredQualities = plugin?.instance?.supportedVideoQualities;
            const declaredOptions = mergeQualityOptions(declaredQualities);
            // 优先用户上次选的画质，其次声明中的最高档，最后回退 1080p。
            const initialQuality =
                musicItem.videoQuality ||
                declaredOptions[0]?.key ||
                "1080p";
            const result =
                initialSource ??
                (await plugin?.methods?.getMvSource(musicItem, initialQuality));
            if (!result?.url) {
                throw new Error(t("panel.mvPlayer.sourceUnavailable"));
            }
            if (canceled) {
                return;
            }

            const baseOptions = mergeQualityOptions(
                declaredQualities,
                result.availableVideoQualities,
                sourceQualityOption(result, initialQuality) && [
                    sourceQualityOption(result, initialQuality)!,
                ],
                musicItem.videoQuality ? [musicItem.videoQuality] : undefined,
            );
            setQualityOptions(baseOptions);
            setQuality(result.videoQuality || initialQuality || "");
            lockVideoOrientation(result.width, result.height);
            setBackupIndex(0);
            setSource({
                uri: result.url,
                headers: getVideoHeaders(result),
                backupUrls: result.backupUrls,
            });
            setSourceVersion(version => version + 1);
            setLoading(false);

            // 后台补全其它画质的真实信息（分辨率/码率/大小/编码/动态范围），
            // 避免画质菜单只显示档位名而缺少细节。
            if (plugin?.methods?.getMvSource) {
                const getSource = (
                    item: IMusic.IMusicItemBase,
                    videoQuality?: string,
                ) => plugin.methods!.getMvSource(item, videoQuality);
                hydrateQualityOptions(
                    getSource,
                    musicItem,
                    baseOptions,
                    result.videoQuality || initialQuality || "",
                )
                    .then(enriched => {
                        if (!canceled) setQualityOptions(enriched);
                    })
                    .catch(() => undefined);
            }
        };

        openVideo().catch(reason => {
            if (canceled) {
                return;
            }
            setLoading(false);
            setError(true);
            Toast.warn(
                reason instanceof Error
                    ? reason.message
                    : t("panel.mvPlayer.loadFailed"),
            );
        });

        return () => {
            canceled = true;
            ScreenOrientation.unlockAsync().catch(() => undefined);
            if (suspended) {
                TrackPlayer.restoreAfterVideo().catch(() => undefined);
            }
        };
    }, [initialSource, musicItem, plugin, t]);

    const switchQuality = async (nextQuality: string) => {
        if (!plugin?.methods?.getMvSource || (nextQuality === quality && !error)) {
            setQualityMenuVisible(false);
            return;
        }
        setQualityMenuVisible(false);
        const hadError = error;
        const resumePosition = Math.max(0, position);
        setLoading(true);
        pendingSeekRef.current = resumePosition > 0 ? resumePosition : null;
        setError(false);
        try {
            const result = await plugin.methods.getMvSource(
                musicItem,
                nextQuality,
            );
            if (!result?.url) {
                throw new Error(t("panel.mvPlayer.sourceUnavailable"));
            }
            setQualityOptions(current =>
                mergeQualityOptions(
                    current,
                    result.availableVideoQualities,
                    sourceQualityOption(result, nextQuality) && [
                        sourceQualityOption(result, nextQuality)!,
                    ],
                ),
            );
            setQuality(result.videoQuality || nextQuality);
            lockVideoOrientation(result.width, result.height);
            setSource({
                uri: result.url,
                headers: getVideoHeaders(result),
                backupUrls: result.backupUrls,
            });
            setSourceVersion(version => version + 1);
            setBackupIndex(0);
        } catch (reason) {
            pendingSeekRef.current = null;
            setLoading(false);
            setError(hadError);
            Toast.warn(
                reason instanceof Error
                    ? reason.message
                    : t("panel.mvPlayer.loadFailed"),
            );
        }
    };

    const seekBy = (offset: number) => {
        const nextPosition = Math.min(
            Math.max(0, position + offset),
            duration || Number.MAX_SAFE_INTEGER,
        );
        videoRef.current?.seek(nextPosition);
        setPosition(nextPosition);
        showControls();
    };

    return (
        <PanelFullscreen
            hasMask
            animationType="Scale"
            containerStyle={styles.container}
            fullscreenTapHandler={showControls}
            fullscreenTapDisabled={controlsVisible || error}
            closeEventName="hideMvPlayer"
            onClosed={onClosed}>
            <View style={styles.stage}>
                <View pointerEvents="none" style={styles.videoLayer}>
                    {source ? (
                        <Video
                            ref={videoRef}
                            key={`${source.uri}:${quality}:${sourceVersion}`}
                            source={{ uri: source.uri, headers: source.headers }}
                            style={styles.video}
                            pointerEvents="none"
                            controls={false}
                            focusable={false}
                            paused={paused}
                            useTextureView
                            resizeMode="contain"
                            onLoadStart={() => setLoading(true)}
                            onLoad={data => {
                                setDuration(data.duration || 0);
                                lockVideoOrientation(
                                    data.naturalSize?.width,
                                    data.naturalSize?.height,
                                );
                                if (pendingSeekRef.current !== null) {
                                    videoRef.current?.seek(pendingSeekRef.current);
                                    pendingSeekRef.current = null;
                                }
                                setLoading(false);
                            }}
                            onProgress={data => setPosition(data.currentTime)}
                            onBuffer={({ isBuffering }) => setLoading(isBuffering)}
                            onEnd={() => {
                                setPaused(true);
                                showControls();
                            }}
                            onError={() => {
                                if (source.backupUrls?.[backupIndex]) {
                                    setSource(current =>
                                        current
                                            ? {
                                                ...current,
                                                uri: source.backupUrls![
                                                    backupIndex
                                                ],
                                            }
                                            : current,
                                    );
                                    setSourceVersion(version => version + 1);
                                    setBackupIndex(index => index + 1);
                                    setLoading(true);
                                    return;
                                }
                                setLoading(false);
                                setError(true);
                            }}
                        />
                    ) : null}
                </View>
                <View
                    pointerEvents={controlsVisible ? "box-none" : "none"}
                    style={styles.overlay}>
                    {controlsVisible ? (
                        <>
                            <View style={styles.header}>
                                <View style={styles.titleBlock}>
                                    <Text numberOfLines={1} style={styles.title}>
                                        {musicItem.title}
                                    </Text>
                                    <Text numberOfLines={1} style={styles.artist}>
                                        {musicItem.artist}
                                    </Text>
                                </View>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={t("panel.mvPlayer.close")}
                                    onPress={hideMvPlayer}
                                    style={styles.closeButton}>
                                    <Text style={styles.closeText}>×</Text>
                                </Pressable>
                            </View>

                            <View style={styles.bottomBar}>
                                <Slider
                                    style={styles.progressSlider}
                                    minimumValue={0}
                                    maximumValue={Math.max(duration, 0.01)}
                                    value={Math.min(position, duration || 0)}
                                    minimumTrackTintColor="#fff"
                                    maximumTrackTintColor="rgba(255,255,255,0.38)"
                                    thumbTintColor="#fff"
                                    onSlidingStart={showControls}
                                    onSlidingComplete={value => {
                                        videoRef.current?.seek(value);
                                        setPosition(value);
                                        showControls();
                                    }}
                                />
                                <View style={styles.controlRow}>
                                    <View style={styles.leftControls}>
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel={paused ? "播放视频" : "暂停视频"}
                                            onPress={() => {
                                                setPaused(value => !value);
                                                showControls();
                                            }}
                                            style={styles.controlButton}>
                                            <Icon
                                                name={paused ? "play" : "pause"}
                                                color="#fff"
                                                size={rpx(38)}
                                            />
                                        </Pressable>
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel="后退十秒"
                                            onPress={() => seekBy(-10)}
                                            style={styles.seekButton}>
                                            <Text style={styles.seekText}>-10</Text>
                                        </Pressable>
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel="前进十秒"
                                            onPress={() => seekBy(10)}
                                            style={styles.seekButton}>
                                            <Text style={styles.seekText}>+10</Text>
                                        </Pressable>
                                        <Text style={styles.timeText}>
                                            {formatTime(position)} / {formatTime(duration)}
                                        </Text>
                                    </View>
                                    {qualityOptions.length > 0 ? (
                                        <View>
                                            <Pressable
                                                accessibilityRole="button"
                                                onPress={() => {
                                                    setQualityMenuVisible(value => !value);
                                                    showControls();
                                                }}
                                                style={styles.qualityButton}>
                                                <Text style={styles.qualityText}>
                                                    {getQualityLabel(
                                                        qualityOptions.find(
                                                            item => item.key === quality,
                                                        ) ?? { key: quality, label: quality },
                                                    ) || t("panel.mvPlayer.quality")}
                                                </Text>
                                            </Pressable>
                                            {qualityMenuVisible ? (
                                                <ScrollView style={styles.qualityMenu}>
                                                    {qualityOptions.map(option => (
                                                        <Pressable
                                                            key={option.key}
                                                            onPress={() =>
                                                                switchQuality(option.key).catch(
                                                                    () => undefined,
                                                                )
                                                            }
                                                            style={[
                                                                styles.qualityItem,
                                                                option.key === quality &&
                                                                    styles.qualityItemActive,
                                                            ]}>
                                                            <Text style={styles.qualityItemText}>
                                                                {getQualityLabel(option)}
                                                            </Text>
                                                            {formatQualityDetails(option) ? (
                                                                <Text style={styles.qualityDetailsText}>
                                                                    {formatQualityDetails(option)}
                                                                </Text>
                                                            ) : null}
                                                        </Pressable>
                                                    ))}
                                                </ScrollView>
                                            ) : null}
                                        </View>
                                    ) : null}
                                </View>
                            </View>
                        </>
                    ) : null}
                </View>

                {loading ? (
                    <View pointerEvents="none" style={styles.loading}>
                        <ActivityIndicator color="#fff" size="large" />
                    </View>
                ) : null}
                {error ? (
                    <View style={styles.error}>
                        <Text style={styles.errorText}>
                            {t("panel.mvPlayer.loadFailed")}
                        </Text>
                        <Pressable
                            onPress={() => {
                                switchQuality(quality).catch(() => undefined);
                            }}
                            style={styles.retryButton}>
                            <Text style={styles.retryText}>
                                {t("panel.mvPlayer.retry")}
                            </Text>
                        </Pressable>
                    </View>
                ) : null}
            </View>
        </PanelFullscreen>
    );
}

function formatTime(value: number) {
    const seconds = Math.max(0, Math.floor(value || 0));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: "#000",
    },
    stage: {
        flex: 1,
        width: "100%",
        height: "100%",
        backgroundColor: "#000",
        overflow: "hidden",
    },
    videoLayer: {
        ...StyleSheet.absoluteFillObject,
        // 视频是原生 TextureView/SurfaceView，禁用整层触摸，避免它吞掉全屏点击。
        zIndex: 0,
    },
    video: {
        ...StyleSheet.absoluteFillObject,
        width: "100%",
        height: "100%",
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "space-between",
        zIndex: 1,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: rpx(28),
        paddingTop: rpx(30),
        paddingBottom: rpx(20),
        backgroundColor: "transparent",
    },
    titleBlock: {
        flex: 1,
        marginRight: rpx(20),
    },
    title: {
        color: "#fff",
        fontSize: rpx(30),
        fontWeight: "700",
    },
    artist: {
        color: "rgba(255,255,255,0.72)",
        fontSize: rpx(22),
        marginTop: rpx(6),
    },
    closeButton: {
        width: rpx(72),
        height: rpx(72),
        alignItems: "center",
        justifyContent: "center",
    },
    closeText: {
        color: "#fff",
        fontSize: rpx(54),
        lineHeight: rpx(58),
        fontWeight: "300",
    },
    bottomBar: {
        paddingHorizontal: rpx(28),
        paddingBottom: rpx(28),
        paddingTop: rpx(54),
        backgroundColor: "transparent",
    },
    progressSlider: {
        width: "100%",
        height: rpx(30),
        marginBottom: rpx(8),
    },
    controlRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    leftControls: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },
    controlButton: {
        width: rpx(52),
        height: rpx(52),
        alignItems: "center",
        justifyContent: "center",
        marginRight: rpx(16),
    },
    seekButton: {
        minWidth: rpx(48),
        height: rpx(42),
        alignItems: "center",
        justifyContent: "center",
        marginRight: rpx(12),
    },
    seekText: {
        color: "rgba(255,255,255,0.92)",
        fontSize: rpx(17),
        fontWeight: "600",
    },
    timeText: {
        color: "rgba(255,255,255,0.86)",
        fontSize: rpx(19),
        marginLeft: rpx(8),
    },
    qualityButton: {
        minWidth: rpx(120),
        paddingHorizontal: rpx(18),
        paddingVertical: rpx(11),
        borderRadius: rpx(20),
        backgroundColor: "rgba(255,255,255,0.22)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(255,255,255,0.32)",
        alignItems: "center",
    },
    qualityText: {
        color: "#fff",
        fontSize: rpx(22),
    },
    qualityMenu: {
        position: "absolute",
        right: 0,
        bottom: rpx(64),
        maxHeight: rpx(300),
        minWidth: rpx(160),
        backgroundColor: "rgba(20,20,20,0.96)",
        borderRadius: rpx(8),
    },
    qualityItem: {
        paddingHorizontal: rpx(22),
        paddingVertical: rpx(18),
    },
    qualityItemActive: {
        backgroundColor: "rgba(255,255,255,0.16)",
    },
    qualityItemText: {
        color: "#fff",
        fontSize: rpx(22),
    },
    qualityDetailsText: {
        color: "rgba(255,255,255,0.58)",
        fontSize: rpx(18),
        marginTop: rpx(5),
    },
    loading: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    error: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.72)",
    },
    errorText: {
        color: "#fff",
        fontSize: rpx(26),
        marginBottom: rpx(20),
    },
    retryButton: {
        paddingHorizontal: rpx(28),
        paddingVertical: rpx(14),
        borderRadius: rpx(8),
        backgroundColor: "rgba(255,255,255,0.2)",
    },
    retryText: {
        color: "#fff",
        fontSize: rpx(22),
    },
});
