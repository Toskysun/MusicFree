import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutRectangle, StyleSheet, Text, View } from "react-native";
import rpx from "@/utils/rpx";
import useDelayFalsy from "@/hooks/useDelayFalsy";
import { FlatList, Gesture, GestureDetector, TapGestureHandler } from "react-native-gesture-handler";
import Loading from "@/components/base/loading";
import globalStyle from "@/constants/globalStyle";
import { showPanel } from "@/components/panels/usePanel";
import TrackPlayer, { useCurrentMusic, useMusicState } from "@/core/trackPlayer";
import { musicIsPaused } from "@/utils/trackUtils";
import DraggingTime from "./draggingTime";
import LyricItemComponent from "./lyricItem";
import PersistStatus from "@/utils/persistStatus";
import LyricOperations from "./lyricOperations";
import { IParsedLrcItem } from "@/utils/lrcParser";
import { IconButtonWithGesture } from "@/components/base/iconButton.tsx";
import { getMediaExtraProperty } from "@/utils/mediaExtra";
import lyricManager, {
    useCurrentLyricItem,
    useCurrentPositionMs,
    useLyricState,
} from "@/core/lyricManager";
import { useI18N } from "@/core/i18n";
import { useAppConfig } from "@/core/appConfig";
import { devLog } from "@/utils/log";
import SongInfo from "../albumCover/songInfo";
import useOrientation from "@/hooks/useOrientation";

const ITEM_HEIGHT = rpx(92);
const AUTO_FOLLOW_RESTORE_DELAY_MS = 120;
const SCROLL_FOLLOW_LEAD_MS = 120;
const DEFAULT_LYRIC_ORDER = ["romanization", "original", "translation"] as const;

/** Scroll state machine */
const enum ScrollPhase {
    /** Waiting for first content layout */
    WaitingForContent,
    /** Performing initial jump (no animation) */
    InitialPositioning,
    /** Normal auto-scroll following playback */
    Tracking,
    /** User is dragging */
    UserDragging,
}

/**
 * Prefix-sum cache for O(1) getItemLayout and O(log n) hit-test.
 * prefixSums[i] = total offset from top to the START of item i (excluding header).
 * headerHeight is stored separately and added in queries.
 */
class LayoutCache {
    private heights: number[];
    private prefixSums: number[];
    private headerHeight = 0;
    private dirty = false;

    constructor(capacity: number) {
        this.heights = new Array(capacity).fill(ITEM_HEIGHT);
        this.prefixSums = new Array(capacity + 1).fill(0);
        this.rebuild();
    }

    reset(count: number) {
        this.heights = new Array(count).fill(ITEM_HEIGHT);
        this.prefixSums = new Array(count + 1).fill(0);
        this.headerHeight = 0;
        this.rebuild();
    }

    setHeaderHeight(h: number) {
        if (this.headerHeight !== h) {
            this.headerHeight = h;
            return true;
        }

        return false;
    }

    setItemHeight(index: number, height: number) {
        if (index >= 0 && index < this.heights.length && this.heights[index] !== height) {
            this.heights[index] = height;
            this.dirty = true;
            return true;
        }

        return false;
    }

    /** Rebuild prefix sums. Call before querying if dirty. */
    private rebuild() {
        const n = this.heights.length;
        this.prefixSums[0] = 0;
        for (let i = 0; i < n; i++) {
            this.prefixSums[i + 1] = this.prefixSums[i] + this.heights[i];
        }
        this.dirty = false;
    }

    private ensureClean() {
        if (this.dirty) this.rebuild();
    }

    /** For FlatList getItemLayout */
    getItemLayout(index: number) {
        this.ensureClean();
        const safeIndex = this.clampIndex(index);

        return {
            length: this.heights[safeIndex] ?? ITEM_HEIGHT,
            offset: this.headerHeight + (this.prefixSums[safeIndex] ?? 0),
            index: safeIndex,
        };
    }

    /** Binary search: given a scroll offset (relative to content top), find item index */
    findIndexAtOffset(contentOffset: number): number {
        this.ensureClean();
        if (!this.heights.length) return -1;

        const target = contentOffset - this.headerHeight;
        if (target <= 0) return 0;

        // Binary search on prefixSums
        let lo = 0;
        let hi = this.heights.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >>> 1;
            if (this.prefixSums[mid] <= target) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        return lo;
    }

    private clampIndex(index: number) {
        if (!this.heights.length) return 0;

        return Math.max(0, Math.min(index, this.heights.length - 1));
    }
}

interface IProps {
    onTurnPageClick?: () => void;
}

function getLyricIndexAtPosition(
    lyrics: IParsedLrcItem[],
    positionMs: number,
    offsetSeconds: number,
) {
    if (!lyrics.length) return -1;

    const targetSeconds =
        positionMs / 1000 + SCROLL_FOLLOW_LEAD_MS / 1000 - offsetSeconds;
    if (targetSeconds < lyrics[0].time) {
        return 0;
    }

    let left = 0;
    let right = lyrics.length - 1;
    while (left < right) {
        const mid = (left + right + 1) >>> 1;
        if (lyrics[mid].time <= targetSeconds) {
            left = mid;
        } else {
            right = mid - 1;
        }
    }

    return left;
}

const fontSizeMap = {
    0: rpx(24),
    1: rpx(30),
    2: rpx(36),
    3: rpx(42),
} as Record<number, number>;

export default function Lyric(props: IProps) {
    const { onTurnPageClick } = props;
    const orientation = useOrientation();
    const isHorizontal = orientation === "horizontal";

    const { loading, meta, lyrics, hasTranslation, hasRomanization } =
        useLyricState();
    const currentLrcItem = useCurrentLyricItem();
    const currentPositionMs = useCurrentPositionMs();
    const showTranslation = PersistStatus.useValue(
        "lyric.showTranslation",
        true,
    );
    const showRomanization = PersistStatus.useValue(
        "lyric.showRomanization",
        true,
    );
    const lyricOrder = PersistStatus.useValue(
        "lyric.lyricOrder",
        [...DEFAULT_LYRIC_ORDER],
    );
    const resolvedLyricOrder = lyricOrder ?? [...DEFAULT_LYRIC_ORDER];
    const lyricOrderKey = resolvedLyricOrder.join("|");
    const fontSizeKey = useAppConfig("lyric.detailFontSize") ?? 1;
    devLog("log", "Lyric detail page font size:", fontSizeKey);
    const fontSizeStyle = useMemo(
        () => ({
            fontSize: fontSizeMap[fontSizeKey],
        }),
        [fontSizeKey],
    );
    const lyricAlign = useAppConfig("lyric.detailAlign") ?? "left";
    const lyricOffsetSecondsRaw = Number(meta?.offset ?? 0);
    const lyricOffsetSeconds = Number.isFinite(lyricOffsetSecondsRaw)
        ? lyricOffsetSecondsRaw
        : 0;

    const [draggingIndex, setDraggingIndex, setDraggingIndexImmi] =
        useDelayFalsy<number | undefined>(undefined, 2000);
    const musicState = useMusicState();
    const { t } = useI18N();

    const [layout, setLayout] = useState<LayoutRectangle>();

    const listRef = useRef<FlatList<IParsedLrcItem> | null>(null);

    const currentMusicItem = useCurrentMusic();
    const associateMusicItem = getMediaExtraProperty(currentMusicItem, "associatedLrc");

    // --- Scroll state machine ---
    const scrollPhaseRef = useRef<ScrollPhase>(ScrollPhase.WaitingForContent);
    const lastScrollIndexRef = useRef(-1);
    const initialPositionFrameRef = useRef<number | null>(null);
    const restoreTrackingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMomentumScrollingRef = useRef(false);
    const activeLyricIndex = currentLrcItem?.index ?? lyricManager.currentLyricItem?.index ?? -1;
    const scrollTargetIndex = useMemo(() => {
        return getLyricIndexAtPosition(lyrics, currentPositionMs, lyricOffsetSeconds);
    }, [currentPositionMs, lyricOffsetSeconds, lyrics]);
    const activeLyricIndexRef = useRef(activeLyricIndex);
    activeLyricIndexRef.current = activeLyricIndex;
    const lyricsIdentity = `${currentMusicItem?.platform ?? ""}:${currentMusicItem?.id ?? ""}:${lyrics.length}:${lyrics[0]?.time ?? ""}:${lyrics[lyrics.length - 1]?.time ?? ""}`;
    const initialContentOffsetRef = useRef<{
        key: string;
        value?: { x: number; y: number };
    }>({
        key: "",
        value: undefined,
    });
    if (initialContentOffsetRef.current.key !== lyricsIdentity) {
        const targetIndex = activeLyricIndex === -1 ? 0 : activeLyricIndex;
        initialContentOffsetRef.current = {
            key: lyricsIdentity,
            value: targetIndex > 0 && lyrics.length
                ? { x: 0, y: Math.max(0, targetIndex * ITEM_HEIGHT) }
                : undefined,
        };
    }

    // Layout cache (prefix-sum based)
    const layoutCacheRef = useRef(new LayoutCache(lyrics.length));

    // Track if list is ready to show (positioned correctly)
    const [isListReady, setIsListReady] = useState(false);
    const setListReadyState = useCallback((ready: boolean) => {
        setIsListReady(ready);
    }, []);

    const cancelInitialPositionFrame = useCallback(() => {
        if (initialPositionFrameRef.current !== null) {
            cancelAnimationFrame(initialPositionFrameRef.current);
            initialPositionFrameRef.current = null;
        }
    }, []);

    const clearTrackingRestoreTimer = useCallback(() => {
        if (restoreTrackingTimerRef.current) {
            clearTimeout(restoreTrackingTimerRef.current);
            restoreTrackingTimerRef.current = null;
        }
    }, []);

    const getActiveLyricIndex = useCallback(() => {
        if (!lyrics.length) return -1;

        const index = activeLyricIndexRef.current;
        return Math.max(0, Math.min(index === -1 ? 0 : index, lyrics.length - 1));
    }, [lyrics.length]);

    /** Scroll list to a given lyric index */
    const scrollToIndex = useCallback((index: number, animated: boolean, force = false) => {
        if (!listRef.current || !lyrics.length) return;

        const safeIndex = Math.max(0, Math.min(index, lyrics.length - 1));
        if (!force && safeIndex === lastScrollIndexRef.current) return;

        listRef.current.scrollToIndex({
            index: safeIndex,
            viewPosition: 0.5,
            animated,
        });
        lastScrollIndexRef.current = safeIndex;
    }, [lyrics.length]);

    const finishInitialPositioning = useCallback(() => {
        initialPositionFrameRef.current = null;

        if (!listRef.current || !lyrics.length) {
            setListReadyState(true);
            scrollPhaseRef.current = ScrollPhase.Tracking;
            return;
        }

        const targetIndex = getActiveLyricIndex();
        if (targetIndex !== -1) {
            scrollToIndex(targetIndex, false, true);
        }

        setListReadyState(true);
        scrollPhaseRef.current = ScrollPhase.Tracking;
    }, [getActiveLyricIndex, lyrics.length, scrollToIndex, setListReadyState]);

    const scheduleInitialPositioning = useCallback(() => {
        cancelInitialPositionFrame();
        initialPositionFrameRef.current = requestAnimationFrame(finishInitialPositioning);
    }, [cancelInitialPositionFrame, finishInitialPositioning]);

    const layoutAffectingKey = useMemo(() => [
        fontSizeKey,
        isHorizontal ? "horizontal" : "vertical",
        showTranslation && hasTranslation ? "translation" : "no-translation",
        showRomanization && hasRomanization ? "romanization" : "no-romanization",
        lyricOrderKey,
    ].join("|"), [
        fontSizeKey,
        hasRomanization,
        hasTranslation,
        isHorizontal,
        lyricOrderKey,
        showRomanization,
        showTranslation,
    ]);

    // Reset when song changes before the new lyric payload arrives.
    useEffect(() => {
        scrollPhaseRef.current = ScrollPhase.WaitingForContent;
        lastScrollIndexRef.current = -1;
        setListReadyState(false);
    }, [currentMusicItem?.id, setListReadyState]);

    // Reset layout cache when lyrics or visible line layout changes.
    useEffect(() => {
        layoutCacheRef.current.reset(lyrics.length);
        scrollPhaseRef.current = ScrollPhase.InitialPositioning;
        lastScrollIndexRef.current = -1;
        setListReadyState(false);
        scheduleInitialPositioning();
    }, [layoutAffectingKey, lyrics, scheduleInitialPositioning, setListReadyState]);

    useEffect(() => {
        return () => {
            cancelInitialPositionFrame();
            clearTrackingRestoreTimer();
        };
    }, [cancelInitialPositionFrame, clearTrackingRestoreTimer]);

    // Approximate initial offset to prevent visible scroll-from-top flash.
    // Keep it stable for the current lyric payload; changing this every line
    // makes FlatList jump before auto-follow centers the active line.
    const initialContentOffset = initialContentOffsetRef.current.value;

    // 设置空白组件，获取组件高度
    const blankComponent = useMemo(() => {
        return (
            <View
                style={[styles.empty, isHorizontal ? styles.emptyHorizontal : null]}
                onLayout={evt => {
                    const didChange = layoutCacheRef.current.setHeaderHeight(
                        evt.nativeEvent.layout.height,
                    );
                    if (didChange && scrollPhaseRef.current === ScrollPhase.InitialPositioning) {
                        scheduleInitialPositioning();
                    }
                }}
            />
        );
    }, [isHorizontal, scheduleInitialPositioning]);

    const handleLyricItemLayout = useCallback(
        (index: number, height: number) => {
            const didChange = layoutCacheRef.current.setItemHeight(index, height);
            if (didChange && scrollPhaseRef.current === ScrollPhase.InitialPositioning) {
                scheduleInitialPositioning();
            }
        },
        [scheduleInitialPositioning],
    );

    // O(1) getItemLayout via prefix-sum cache
    const getItemLayout = useCallback((_data: any, index: number) => {
        return layoutCacheRef.current.getItemLayout(index);
    }, []);

    /** Called by LyricOperations to re-center on current line */
    const scrollToCurrentLrcItem = useCallback(() => {
        const safeIndex = getActiveLyricIndex();
        if (safeIndex === -1) return;

        scrollToIndex(safeIndex, true, true);
        scrollPhaseRef.current = ScrollPhase.Tracking;
    }, [getActiveLyricIndex, scrollToIndex]);

    // Handle content ready — initial positioning without animation
    const onContentSizeChange = useCallback(() => {
        if (!listRef.current || !lyrics.length) {
            return;
        }

        if (scrollPhaseRef.current === ScrollPhase.WaitingForContent) {
            scrollPhaseRef.current = ScrollPhase.InitialPositioning;
            lastScrollIndexRef.current = -1;
        }

        if (scrollPhaseRef.current === ScrollPhase.InitialPositioning) {
            scheduleInitialPositioning();
        }
    }, [lyrics.length, scheduleInitialPositioning]);

    // Main scroll effect — triggers when current lyric line changes
    useEffect(() => {
        // Only scroll in Tracking phase
        if (scrollPhaseRef.current !== ScrollPhase.Tracking) return;

        // Skip if no lyrics, or paused, or all-zero timestamps
        if (
            lyrics.length === 0 ||
            draggingIndex !== undefined ||
            musicIsPaused(musicState) ||
            lyrics[lyrics.length - 1].time < 1
        ) {
            return;
        }

        const targetIndex =
            scrollTargetIndex === -1 ? getActiveLyricIndex() : scrollTargetIndex;
        if (targetIndex === -1) return;

        scrollToIndex(targetIndex, true);
    }, [
        draggingIndex,
        getActiveLyricIndex,
        lyrics,
        musicState,
        scrollTargetIndex,
        scrollToIndex,
    ]);

    // --- Drag handlers ---
    const onScrollBeginDrag = useCallback(() => {
        cancelInitialPositionFrame();
        clearTrackingRestoreTimer();
        isMomentumScrollingRef.current = false;
        scrollPhaseRef.current = ScrollPhase.UserDragging;
    }, [cancelInitialPositionFrame, clearTrackingRestoreTimer]);

    const restoreTrackingAfterDrag = useCallback(() => {
        clearTrackingRestoreTimer();
        restoreTrackingTimerRef.current = setTimeout(() => {
            restoreTrackingTimerRef.current = null;
            if (isMomentumScrollingRef.current) return;

            lastScrollIndexRef.current = -1;
            scrollPhaseRef.current = ScrollPhase.Tracking;
        }, AUTO_FOLLOW_RESTORE_DELAY_MS);
    }, [clearTrackingRestoreTimer]);

    const releaseDraggingIndex = useCallback(() => {
        if (draggingIndex !== undefined) {
            setDraggingIndex(undefined);
        }
    }, [draggingIndex, setDraggingIndex]);

    const onMomentumScrollBegin = useCallback(() => {
        if (scrollPhaseRef.current !== ScrollPhase.UserDragging) return;

        clearTrackingRestoreTimer();
        isMomentumScrollingRef.current = true;
    }, [clearTrackingRestoreTimer]);

    const onScrollEndDrag = useCallback(() => {
        releaseDraggingIndex();
        restoreTrackingAfterDrag();
    }, [releaseDraggingIndex, restoreTrackingAfterDrag]);

    const onMomentumScrollEnd = useCallback(() => {
        isMomentumScrollingRef.current = false;
        releaseDraggingIndex();
        restoreTrackingAfterDrag();
    }, [releaseDraggingIndex, restoreTrackingAfterDrag]);

    // O(log n) drag index lookup via binary search
    const onScroll = useCallback((e: any) => {
        if (scrollPhaseRef.current !== ScrollPhase.UserDragging) return;

        const centerOffset =
            e.nativeEvent.contentOffset.y +
            e.nativeEvent.layoutMeasurement.height / 2;

        const index = layoutCacheRef.current.findIndexAtOffset(centerOffset);
        if (index !== -1) {
            setDraggingIndex(Math.min(index, lyrics.length - 1));
        }
    }, [lyrics.length, setDraggingIndex]);

    const onLyricSeekPress = async () => {
        if (draggingIndex !== undefined) {
            const time = lyrics[draggingIndex].time + +(meta?.offset ?? 0);
            if (time !== undefined && !isNaN(time)) {
                await TrackPlayer.seekTo(time);
                await TrackPlayer.play();
                setDraggingIndexImmi(undefined);
                scrollPhaseRef.current = ScrollPhase.Tracking;
                scrollToIndex(draggingIndex, true, true);
            }
        }
    };

    const tapGesture = Gesture.Tap()
        .onStart(() => {
            onTurnPageClick?.();
        })
        .runOnJS(true);

    const unlinkTapGesture = Gesture.Tap()
        .onStart(() => {
            if (currentMusicItem) {
                lyricManager.unassociateLyric(currentMusicItem);
            }
        })
        .runOnJS(true);

    const listExtraData = useMemo(() => [
        currentLrcItem?.index ?? -1,
        draggingIndex ?? -1,
        layoutAffectingKey,
        lyricAlign,
    ].join("|"), [
        currentLrcItem?.index,
        draggingIndex,
        layoutAffectingKey,
        lyricAlign,
    ]);

    return (
        <>
            <GestureDetector gesture={tapGesture}>
                <View style={globalStyle.fwflex1}>
                    {isHorizontal ? (
                        <View style={styles.horizontalHeader}>
                            <SongInfo />
                        </View>
                    ) : null}
                    {loading ? (
                        <Loading color="white" />
                    ) : lyrics?.length ? (
                        <FlatList
                            ref={_ => {
                                listRef.current = _;
                            }}
                            onLayout={e => {
                                const nextLayout = e.nativeEvent.layout;
                                setLayout(prev => {
                                    if (
                                        prev?.height === nextLayout.height &&
                                        prev?.width === nextLayout.width
                                    ) {
                                        return prev;
                                    }

                                    return nextLayout;
                                });
                            }}
                            // Start at approximate position to prevent visible scroll
                            contentOffset={initialContentOffset}
                            onScrollToIndexFailed={({ index }) => {
                                requestAnimationFrame(() => {
                                    scrollToIndex(index, false, true);
                                    setListReadyState(true);
                                });
                            }}
                            fadingEdgeLength={isHorizontal ? 80 : 120}
                            // Initial position without animation
                            onContentSizeChange={onContentSizeChange}
                            // Virtualization: only render nearby items, not all lyrics
                            initialNumToRender={30}
                            windowSize={7}
                            maxToRenderPerBatch={10}
                            updateCellsBatchingPeriod={50}
                            removeClippedSubviews={false}
                            getItemLayout={getItemLayout}
                            ListHeaderComponent={
                                <>
                                    {blankComponent}
                                    <View
                                        style={[
                                            styles.lyricMeta,
                                            isHorizontal ? styles.lyricMetaHorizontal : null,
                                        ]}>
                                        {associateMusicItem ? (
                                            <>
                                                <Text
                                                    style={[
                                                        styles.lyricMetaText,
                                                        fontSizeStyle,
                                                    ]}
                                                    ellipsizeMode="middle"
                                                    numberOfLines={1}>
                                                    {t("lyric.lyricLinkedFrom", {
                                                        platform: associateMusicItem.platform,
                                                        title: associateMusicItem.title || "",
                                                    })}

                                                </Text>

                                                <GestureDetector
                                                    gesture={unlinkTapGesture}>
                                                    <Text
                                                        style={[
                                                            styles.linkText,
                                                            fontSizeStyle,
                                                        ]}>
                                                        {t("lyric.unlinkLyric")}
                                                    </Text>
                                                </GestureDetector>
                                            </>
                                        ) : null}
                                    </View>
                                </>
                            }
                            ListFooterComponent={blankComponent}
                            onScrollBeginDrag={onScrollBeginDrag}
                            onScrollEndDrag={onScrollEndDrag}
                            onMomentumScrollBegin={onMomentumScrollBegin}
                            onMomentumScrollEnd={onMomentumScrollEnd}
                            onScroll={onScroll}
                            scrollEventThrottle={16}
                            style={[
                                styles.wrapper,
                                isHorizontal ? styles.wrapperHorizontal : null,
                                { opacity: isHorizontal ? 1 : isListReady ? 1 : 0 },
                            ]}
                            data={lyrics}
                            overScrollMode="never"
                            extraData={listExtraData}
                            renderItem={({ item, index }) => {
                                const isHighlighted = currentLrcItem?.index === index;

                                // Get romanization text for multi-line display
                                const romanizationText = showRomanization && hasRomanization ? item.romanization : undefined;
                                const translationText = showTranslation && hasTranslation ? item.translation : undefined;

                                return (
                                    <LyricItemComponent
                                        index={index}
                                        text={item.lrc}
                                        fontSize={fontSizeStyle.fontSize}
                                        onLayout={handleLyricItemLayout}
                                        light={draggingIndex === index}
                                        highlight={isHighlighted}
                                        words={item.words}
                                        hasWordByWord={item.hasWordByWord}
                                        romanizationWords={
                                            showRomanization && hasRomanization
                                                ? item.romanizationWords
                                                : undefined
                                        }
                                        romanization={romanizationText}
                                        hasRomanizationWordByWord={
                                            showRomanization === true &&
                                            hasRomanization === true &&
                                            item.hasRomanizationWordByWord === true
                                                ? true
                                                : undefined
                                        }
                                        isRomanizationPseudo={item.isRomanizationPseudo}
                                        translation={translationText}
                                        translationWords={
                                            showTranslation && hasTranslation
                                                ? item.translationWords
                                                : undefined
                                        }
                                        hasTranslationWordByWord={
                                            showTranslation === true &&
                                            hasTranslation === true &&
                                            item.hasTranslationWordByWord === true
                                                ? true
                                                : undefined
                                        }
                                        lyricOrder={resolvedLyricOrder}
                                        align={lyricAlign}
                                    />
                                );
                            }}
                        />
                    ) : (
                        <View style={globalStyle.fullCenter}>
                            <Text style={[styles.white, fontSizeStyle]}>
                                {t("lyric.noLyric")}
                            </Text>
                            <TapGestureHandler
                                onActivated={() => {
                                    showPanel("SearchLrc", {
                                        musicItem:
                                            TrackPlayer.currentMusic,
                                    });
                                }}>
                                <Text
                                    style={[styles.searchLyric, fontSizeStyle]}>
                                    {t("lyric.searchLyric")}
                                </Text>
                            </TapGestureHandler>
                        </View>
                    )}
                    {draggingIndex !== undefined && (
                        <View
                            style={[
                                styles.draggingTime,
                                isHorizontal ? styles.draggingTimeHorizontal : null,
                                layout?.height
                                    ? {
                                        top:
                                            (layout.height - ITEM_HEIGHT) / 2,
                                    }
                                    : null,
                            ]}>
                            <DraggingTime
                                time={
                                    (lyrics[draggingIndex]?.time ?? 0) +
                                    +(meta?.offset ?? 0)
                                }
                            />
                            <View style={styles.singleLine} />

                            <IconButtonWithGesture
                                style={styles.playIcon}
                                sizeType='normal'
                                name="play"
                                onPress={onLyricSeekPress}
                            />
                        </View>
                    )}
                </View>
            </GestureDetector>
            <LyricOperations
                scrollToCurrentLrcItem={scrollToCurrentLrcItem}
            />
        </>
    );
}

const styles = StyleSheet.create({
    horizontalHeader: {
        width: "100%",
        marginTop: rpx(18),
        marginBottom: rpx(6),
    },
    wrapper: {
        width: "100%",
        marginVertical: rpx(48),
        flex: 1,
    },
    wrapperHorizontal: {
        marginVertical: rpx(18),
    },
    empty: {
        paddingTop: "70%",
    },
    emptyHorizontal: {
        paddingTop: "40%",
    },
    white: {
        color: "white",
    },
    lyricMeta: {
        position: "absolute",
        width: "100%",
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        left: 0,
        paddingHorizontal: rpx(48),
        bottom: rpx(48),
    },
    lyricMetaHorizontal: {
        paddingHorizontal: rpx(24),
        bottom: rpx(18),
    },
    lyricMetaText: {
        color: "white",
        opacity: 0.8,
        maxWidth: "80%",
    },
    linkText: {
        color: "#66ccff",
        textDecorationLine: "underline",
    },
    draggingTime: {
        position: "absolute",
        width: "100%",
        height: ITEM_HEIGHT,
        top: "40%",
        marginTop: rpx(48),
        paddingHorizontal: rpx(18),
        right: 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    draggingTimeHorizontal: {
        marginTop: rpx(18),
    },
    singleLine: {
        width: "67%",
        height: 1,
        backgroundColor: "#cccccc",
        opacity: 0.4,
    },
    playIcon: {
        width: rpx(100),
        textAlign: "right",
        color: "white",
    },
    searchLyric: {
        width: rpx(180),
        marginTop: rpx(14),
        paddingVertical: rpx(10),
        textAlign: "center",
        alignSelf: "center",
        color: "#66eeff",
        textDecorationLine: "underline",
    },
});
