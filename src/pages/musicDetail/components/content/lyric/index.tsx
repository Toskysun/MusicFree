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
    useLyricState,
} from "@/core/lyricManager";
import { useI18N } from "@/core/i18n";
import { useAppConfig } from "@/core/appConfig";
import { devLog } from "@/utils/log";
import SongInfo from "../albumCover/songInfo";
import useOrientation from "@/hooks/useOrientation";

const ITEM_HEIGHT = rpx(92);
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
            const mid = Math.floor((lo + hi + 1) / 2);
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
    /**
     * Whether the lyric page is the active (visible) tab.
     * When false, list may still mount off-screen; when it becomes true we
     * re-center so the user never lands at the top until the next line.
     */
    isActive?: boolean;
}

const fontSizeMap = {
    0: rpx(24),
    1: rpx(30),
    2: rpx(36),
    3: rpx(42),
} as Record<number, number>;

export default function Lyric(props: IProps) {
    const { onTurnPageClick, isActive = true } = props;
    const orientation = useOrientation();
    const isHorizontal = orientation === "horizontal";

    const { loading, meta, lyrics, hasTranslation, hasRomanization } =
        useLyricState();
    const currentLrcItem = useCurrentLyricItem();
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
    const wasActiveRef = useRef(isActive);
    const recenterTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
    /** FlatList viewport height — used for accurate center offset math */
    const listHeightRef = useRef(0);
    /** Coalesce layout-driven re-centers into one rAF */
    const layoutRecenterRafRef = useRef<number | null>(null);

    // Layout cache (prefix-sum based)
    const layoutCacheRef = useRef(new LayoutCache(lyrics.length));

    // Track if list is ready to show (positioned correctly)
    const [isListReady, setIsListReady] = useState(false);

    const clearRecenterTimers = useCallback(() => {
        recenterTimersRef.current.forEach(clearTimeout);
        recenterTimersRef.current = [];
    }, []);

    /**
     * Scroll list to a given lyric index (center in viewport).
     * Prefer scrollToOffset + LayoutCache prefix sums over scrollToIndex:
     * line-by-line / multi-line rows are often taller than the default
     * ITEM_HEIGHT, so scrollToIndex(viewPosition:0.5) under-scrolls and the
     * current line ends up below the viewport. Word-by-word rows are closer to
     * the estimate, which is why they look fine.
     */
    const scrollToIndex = useCallback((index: number, animated: boolean) => {
        if (!listRef.current || lyrics.length === 0) {
            return false;
        }
        const safeIndex = Math.max(0, Math.min(index, lyrics.length - 1));
        try {
            const itemLayout = layoutCacheRef.current.getItemLayout(safeIndex);
            const listHeight = listHeightRef.current;
            if (listHeight > 0) {
                const targetOffset = Math.max(
                    0,
                    itemLayout.offset - (listHeight - itemLayout.length) * 0.5,
                );
                listRef.current.scrollToOffset({
                    offset: targetOffset,
                    animated,
                });
                lastScrollIndexRef.current = safeIndex;
                return true;
            }
            // Viewport height unknown yet — fall back to scrollToIndex.
            listRef.current.scrollToIndex({
                index: safeIndex,
                viewPosition: 0.5,
                animated,
            });
            lastScrollIndexRef.current = safeIndex;
            return true;
        } catch {
            // FlatList not ready / index not measured yet
            return false;
        }
    }, [lyrics.length]);

    /** Jump to the currently playing lyric line (uses manager, not just React state). */
    const jumpToCurrentLine = useCallback((animated: boolean) => {
        if (!listRef.current || lyrics.length === 0) {
            return false;
        }
        const idx =
            lyricManager.currentLyricItem?.index ??
            currentLrcItem?.index ??
            0;
        const safeIndex = Math.max(0, Math.min(idx, lyrics.length - 1));
        return scrollToIndex(safeIndex, animated);
    }, [currentLrcItem?.index, lyrics.length, scrollToIndex]);

    /**
     * Multi-pass re-center: FlatList often reports content ready before real
     * item heights (multi-line / translation) are measured. One immediate jump
     * + short delayed corrections lands on the right line without waiting for
     * the next lyric tick.
     */
    const scheduleRecenter = useCallback((options?: {
        animated?: boolean;
        markReady?: boolean;
        reason?: string;
    }) => {
        const animated = options?.animated ?? false;
        const markReady = options?.markReady ?? true;

        clearRecenterTimers();

        const run = (pass: number) => {
            if (scrollPhaseRef.current === ScrollPhase.UserDragging) {
                return;
            }
            if (!listRef.current || lyrics.length === 0) {
                return;
            }
            scrollPhaseRef.current = ScrollPhase.InitialPositioning;
            // Force scroll even if last index matches (position may be wrong).
            lastScrollIndexRef.current = -1;
            const ok = jumpToCurrentLine(pass === 0 ? animated : false);
            if (ok || pass > 0) {
                scrollPhaseRef.current = ScrollPhase.Tracking;
                if (markReady) {
                    setIsListReady(true);
                }
            }
            if (__DEV__ && options?.reason) {
                devLog("log", "[Lyric] recenter", {
                    reason: options.reason,
                    pass,
                    ok,
                    index: lyricManager.currentLyricItem?.index,
                });
            }
        };

        // Immediate + rAF + delayed passes for height stabilization.
        run(0);
        requestAnimationFrame(() => run(1));
        recenterTimersRef.current.push(
            setTimeout(() => run(2), 48),
            setTimeout(() => run(3), 160),
            setTimeout(() => run(4), 320),
        );
    }, [clearRecenterTimers, jumpToCurrentLine, lyrics.length]);

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

    // Reset layout cache when lyrics change
    useEffect(() => {
        layoutCacheRef.current.reset(lyrics.length);
        scrollPhaseRef.current = ScrollPhase.WaitingForContent;
        lastScrollIndexRef.current = -1;
        setIsListReady(false);
        clearRecenterTimers();
    }, [clearRecenterTimers, lyrics]);

    // Reset when song changes
    useEffect(() => {
        scrollPhaseRef.current = ScrollPhase.WaitingForContent;
        lastScrollIndexRef.current = -1;
        setIsListReady(false);
        clearRecenterTimers();
    }, [clearRecenterTimers, currentMusicItem?.id]);

    useEffect(() => () => {
        clearRecenterTimers();
        if (layoutRecenterRafRef.current != null) {
            cancelAnimationFrame(layoutRecenterRafRef.current);
            layoutRecenterRafRef.current = null;
        }
    }, [clearRecenterTimers]);

    // When user opens the lyric tab, re-center immediately (list often sat at top
    // after mounting off-screen, and Tracking waits for the *next* line change).
    useEffect(() => {
        const becameActive = isActive && !wasActiveRef.current;
        wasActiveRef.current = isActive;
        if (!isActive || lyrics.length === 0 || loading) {
            return;
        }
        if (becameActive || !isListReady) {
            scheduleRecenter({
                animated: false,
                markReady: true,
                reason: becameActive ? "tab-active" : "first-ready",
            });
        }
    }, [isActive, isListReady, loading, lyrics.length, scheduleRecenter]);

    // Layout-affecting toggles (font / translation / order) — re-center quietly.
    useEffect(() => {
        if (!isActive || !isListReady || lyrics.length === 0) {
            return;
        }
        scheduleRecenter({
            animated: false,
            markReady: true,
            reason: "layout-key",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only when layout key changes
    }, [layoutAffectingKey]);

    // Approximate initial offset (header ~70% of viewport is unknown; use
    // conservative item estimate so first paint is closer than y=0).
    const initialContentOffset = useMemo(() => {
        const targetIndex = lyricManager.currentLyricItem?.index ?? 0;
        if (targetIndex <= 0 || !lyrics.length) {
            return undefined;
        }
        // Header is large (paddingTop 70%); without real height, keep a modest
        // offset — scheduleRecenter will correct after layout.
        return { x: 0, y: Math.max(0, targetIndex * ITEM_HEIGHT) };
    }, [lyrics]);

    /**
     * After real item/header heights land, re-center the current line.
     * Virtualized rows above the playhead often keep the default ITEM_HEIGHT
     * until measured; without a re-scroll the playhead drifts downward.
     */
    const scheduleLayoutRecenter = useCallback(() => {
        if (scrollPhaseRef.current === ScrollPhase.UserDragging) {
            return;
        }
        if (scrollPhaseRef.current === ScrollPhase.WaitingForContent) {
            return;
        }
        if (layoutRecenterRafRef.current != null) {
            return;
        }
        layoutRecenterRafRef.current = requestAnimationFrame(() => {
            layoutRecenterRafRef.current = null;
            if (scrollPhaseRef.current === ScrollPhase.UserDragging) {
                return;
            }
            if (!listRef.current || lyrics.length === 0) {
                return;
            }
            const idx =
                lyricManager.currentLyricItem?.index ??
                lastScrollIndexRef.current;
            if (idx < 0) {
                return;
            }
            // Allow re-scroll even when index is unchanged (offset was wrong).
            lastScrollIndexRef.current = -1;
            scrollToIndex(idx, false);
            lastScrollIndexRef.current = Math.max(
                0,
                Math.min(idx, lyrics.length - 1),
            );
            scrollPhaseRef.current = ScrollPhase.Tracking;
        });
    }, [lyrics.length, scrollToIndex]);

    // 设置空白组件，获取组件高度
    const blankComponent = useMemo(() => {
        return (
            <View
                style={[styles.empty, isHorizontal ? styles.emptyHorizontal : null]}
                onLayout={evt => {
                    const changed = layoutCacheRef.current.setHeaderHeight(
                        evt.nativeEvent.layout.height,
                    );
                    if (changed) {
                        scheduleLayoutRecenter();
                    }
                }}
            />
        );
    }, [isHorizontal, scheduleLayoutRecenter]);

    const handleLyricItemLayout = useCallback(
        (index: number, height: number) => {
            const changed = layoutCacheRef.current.setItemHeight(index, height);
            if (!changed) {
                return;
            }
            // Only heights at/before the current line affect its center offset.
            const currentIndex =
                lyricManager.currentLyricItem?.index ??
                lastScrollIndexRef.current;
            if (currentIndex >= 0 && index <= currentIndex) {
                scheduleLayoutRecenter();
            }
        },
        [scheduleLayoutRecenter],
    );

    // O(1) getItemLayout via prefix-sum cache
    const getItemLayout = useCallback((_data: any, index: number) => {
        return layoutCacheRef.current.getItemLayout(index);
    }, []);

    /** Called by LyricOperations to re-center on current line */
    const scrollToCurrentLrcItem = useCallback(() => {
        if (!listRef.current) return;
        scheduleRecenter({
            animated: true,
            markReady: true,
            reason: "user-ops",
        });
        scrollPhaseRef.current = ScrollPhase.Tracking;
    }, [scheduleRecenter]);

    // Handle content ready — initial positioning without animation
    const onContentSizeChange = useCallback(() => {
        if (
            scrollPhaseRef.current !== ScrollPhase.WaitingForContent ||
            !listRef.current
        ) {
            return;
        }
        scheduleRecenter({
            animated: false,
            markReady: true,
            reason: "content-size",
        });
    }, [scheduleRecenter]);

    // Main scroll effect — triggers when current lyric line changes
    useEffect(() => {
        // Only auto-follow in Tracking phase (not while user drags / first jump).
        if (scrollPhaseRef.current !== ScrollPhase.Tracking) return;
        // While lyric tab is hidden, still keep scroll index updated so the next
        // reveal is close; skip animated follow to save work.
        if (
            lyrics.length === 0 ||
            draggingIndex !== undefined ||
            lyrics[lyrics.length - 1].time < 1
        ) {
            return;
        }

        // When paused: still allow one-shot center if we have never scrolled
        // to this line (opening lyric page while paused).
        const targetIndex = currentLrcItem?.index ?? -1;
        const safeTarget = targetIndex === -1 ? 0 : targetIndex;
        if (safeTarget === lastScrollIndexRef.current) return;

        if (musicIsPaused(musicState) && lastScrollIndexRef.current !== -1) {
            // Paused mid-song after already centered — don't keep chasing.
            return;
        }

        scrollToIndex(safeTarget, isActive);
    }, [
        currentLrcItem?.index,
        draggingIndex,
        isActive,
        lyrics,
        musicState,
        scrollToIndex,
    ]);

    // --- Drag handlers ---
    const onScrollBeginDrag = useCallback(() => {
        scrollPhaseRef.current = ScrollPhase.UserDragging;
    }, []);

    const onScrollEndDrag = useCallback(() => {
        if (draggingIndex !== undefined) {
            setDraggingIndex(undefined);
        }
        lastScrollIndexRef.current = -1;
        scrollPhaseRef.current = ScrollPhase.Tracking;
    }, [draggingIndex, setDraggingIndex]);

    // O(log n) drag index lookup via binary search
    const onScroll = useCallback((e: any) => {
        if (scrollPhaseRef.current !== ScrollPhase.UserDragging) return;

        const centerOffset =
            e.nativeEvent.contentOffset.y +
            e.nativeEvent.layoutMeasurement.height / 2;

        const index = layoutCacheRef.current.findIndexAtOffset(centerOffset);
        setDraggingIndex(Math.min(index, lyrics.length - 1));
    }, [lyrics.length, setDraggingIndex]);

    const onLyricSeekPress = async () => {
        if (draggingIndex !== undefined) {
            const time = lyrics[draggingIndex].time + +(meta?.offset ?? 0);
            if (time !== undefined && !isNaN(time)) {
                await TrackPlayer.seekTo(time);
                await TrackPlayer.play();
                setDraggingIndexImmi(undefined);
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

    const listExtraData = useMemo(
        () => [currentLrcItem?.index ?? -1, layoutAffectingKey, lyricAlign].join("|"),
        [currentLrcItem?.index, layoutAffectingKey, lyricAlign],
    );

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
                                const next = e.nativeEvent.layout;
                                const heightChanged =
                                    listHeightRef.current !== next.height;
                                listHeightRef.current = next.height;
                                // Defer: RN can fire onLayout during commit; setState then
                                // trips "Cannot update during an existing state transition".
                                requestAnimationFrame(() => {
                                    setLayout(prev => {
                                        if (
                                            prev &&
                                            prev.width === next.width &&
                                            prev.height === next.height &&
                                            prev.x === next.x &&
                                            prev.y === next.y
                                        ) {
                                            return prev;
                                        }
                                        return next;
                                    });
                                    // First real viewport height → re-center with offset math.
                                    if (heightChanged && next.height > 0) {
                                        scheduleLayoutRecenter();
                                    }
                                });
                            }}
                            contentOffset={initialContentOffset}
                            viewabilityConfig={{
                                itemVisiblePercentThreshold: 100,
                            }}
                            onScrollToIndexFailed={({ index }) => {
                                // Measure/virtualization not ready — retry with backoff.
                                const retry = (attempt: number) => {
                                    requestAnimationFrame(() => {
                                        const ok = scrollToIndex(index, false);
                                        if (!ok && attempt < 4) {
                                            setTimeout(
                                                () => retry(attempt + 1),
                                                40 * (attempt + 1),
                                            );
                                            return;
                                        }
                                        setIsListReady(true);
                                        scrollPhaseRef.current =
                                            ScrollPhase.Tracking;
                                    });
                                };
                                retry(0);
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
                            // Do NOT use maintainVisibleContentPosition — it fights
                            // intentional center-on-current-line jumps when headers
                            // / multi-line heights settle, often yanking to the top.
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
                            onMomentumScrollEnd={onScrollEndDrag}
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
                                const lyricOffsetSeconds = +(meta?.offset ?? 0);
                                const interludeStartTimeMs =
                                    (item.time + lyricOffsetSeconds) * 1000;
                                const nextLyric = lyrics[index + 1];
                                const interludeEndTimeMs = nextLyric
                                    ? Math.max(
                                        interludeStartTimeMs,
                                        (nextLyric.time + lyricOffsetSeconds) *
                                            1000 -
                                            250,
                                    )
                                    : item.duration
                                        ? interludeStartTimeMs + item.duration
                                        : undefined;

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
                                        interludeStartTimeMs={interludeStartTimeMs}
                                        interludeEndTimeMs={interludeEndTimeMs}
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
