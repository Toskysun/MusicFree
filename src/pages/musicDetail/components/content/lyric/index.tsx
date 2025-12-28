import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutRectangle, StyleSheet, Text, View } from "react-native";
import rpx from "@/utils/rpx";
import useDelayFalsy from "@/hooks/useDelayFalsy";
import { FlatList, Gesture, GestureDetector, TapGestureHandler } from "react-native-gesture-handler";
import { fontSizeConst } from "@/constants/uiConst";
import Loading from "@/components/base/loading";
import globalStyle from "@/constants/globalStyle";
import { showPanel } from "@/components/panels/usePanel";
import TrackPlayer, { useCurrentMusic, useMusicState } from "@/core/trackPlayer";
import { musicIsPaused } from "@/utils/trackUtils";
import delay from "@/utils/delay";
import DraggingTime from "./draggingTime";
import LyricItemComponent from "./lyricItem";
import PersistStatus from "@/utils/persistStatus";
import LyricOperations from "./lyricOperations";
import { IParsedLrcItem } from "@/utils/lrcParser";
import { IconButtonWithGesture } from "@/components/base/iconButton.tsx";
import { getMediaExtraProperty } from "@/utils/mediaExtra";
import lyricManager, { useCurrentLyricItem, useLyricState } from "@/core/lyricManager";
import { useI18N } from "@/core/i18n";
import { useAppConfig } from "@/core/appConfig";
import { devLog } from "@/utils/log";

// Smooth scroll animation duration (ms)
const SCROLL_ANIMATION_DURATION = 400;

const ITEM_HEIGHT = rpx(92);

interface IItemHeights {
    blankHeight?: number;
    [k: number]: number;
}

interface IProps {
    onTurnPageClick?: () => void;
}

const fontSizeMap = {
    0: rpx(24),
    1: rpx(30),
    2: rpx(36),
    3: rpx(42),
} as Record<number, number>;

export default function Lyric(props: IProps) {
    const { onTurnPageClick } = props;

    const { loading, meta, lyrics, hasTranslation, hasRomanization } =
        useLyricState();
    const currentLrcItem = useCurrentLyricItem();
    const showTranslation = PersistStatus.useValue(
        "lyric.showTranslation",
        false,
    );
    const showRomanization = PersistStatus.useValue(
        "lyric.showRomanization",
        false,
    );
    const lyricOrder = PersistStatus.useValue(
        "lyric.lyricOrder",
        ["original", "translation", "romanization"],
    );
    const fontSizeKey = useAppConfig("lyric.detailFontSize") ?? 1;
    devLog("Lyric detail page font size:", fontSizeKey);
    const fontSizeStyle = useMemo(
        () => ({
            fontSize: fontSizeMap[fontSizeKey],
        }),
        [fontSizeKey],
    );
    const lyricAlign = useAppConfig("lyric.detailAlign") ?? "center";

    const [draggingIndex, setDraggingIndex, setDraggingIndexImmi] =
        useDelayFalsy<number | undefined>(undefined, 2000);
    const musicState = useMusicState();
    const { t } = useI18N();

    const [layout, setLayout] = useState<LayoutRectangle>();

    const listRef = useRef<FlatList<IParsedLrcItem> | null>();

    const currentMusicItem = useCurrentMusic();
    const associateMusicItem = getMediaExtraProperty(currentMusicItem, "associatedLrc");

    // Dragging state
    const dragShownRef = useRef(false);

    // Component mounted state
    const isMountedRef = useRef(true);

    // Height cache
    const itemHeightsRef = useRef<IItemHeights>({});

    // Track last scroll index to avoid unnecessary scrolling
    const lastScrollIndexRef = useRef<number>(-1);

    // Whether auto-scrolling is in progress
    const isAutoScrolling = useRef(false);

    // Whether it's initial positioning (no animation needed)
    const isInitialPositioning = useRef(true);

    // Track if list is ready to show (positioned correctly)
    const [isListReady, setIsListReady] = useState(false);

    // Calculate initial content offset
    const initialContentOffset = useMemo(() => {
        const currentLyricItem = lyricManager.currentLyricItem;
        const targetIndex = currentLyricItem?.index ?? 0;

        if (targetIndex <= 0 || !lyrics.length) {
            return undefined;
        }

        // Estimate offset based on ITEM_HEIGHT
        // This is approximate but prevents visible scroll from top
        const estimatedOffset = targetIndex * ITEM_HEIGHT;
        return { x: 0, y: Math.max(0, estimatedOffset) };
    }, [lyrics]);

    // 设置空白组件，获取组件高度
    const blankComponent = useMemo(() => {
        return (
            <View
                style={styles.empty}
                onLayout={evt => {
                    itemHeightsRef.current.blankHeight =
                        evt.nativeEvent.layout.height;
                }}
            />
        );
    }, []);

    const handleLyricItemLayout = useCallback(
        (index: number, height: number) => {
            itemHeightsRef.current[index] = height;
        },
        [],
    );

    // Smooth scroll to current lyric item
    const scrollToCurrentLrcItem = useCallback((animated: boolean = true) => {
        if (!listRef.current || !layout?.height) {
            return;
        }
        const currentLyricItem = lyricManager.currentLyricItem;
        const currentLyrics = lyricManager.lyricState?.lyrics;

        let targetIndex = 0;
        if (currentLyricItem?.index !== -1 && currentLyricItem) {
            targetIndex = Math.min(currentLyricItem.index ?? 0, (currentLyrics?.length ?? 1) - 1);
        }

        // Avoid scrolling to same position
        if (lastScrollIndexRef.current === targetIndex) {
            return;
        }
        lastScrollIndexRef.current = targetIndex;

        // Use scrollToIndex
        isAutoScrolling.current = true;
        listRef.current?.scrollToIndex({
            index: targetIndex,
            viewPosition: 0.5,
            animated,
        });

        // Reset auto-scrolling flag after animation
        setTimeout(() => {
            isAutoScrolling.current = false;
        }, animated ? SCROLL_ANIMATION_DURATION : 50);
    }, [layout?.height]);

    const delayedScrollToCurrentLrcItem = useMemo(() => {
        let sto: ReturnType<typeof setTimeout>;

        return () => {
            if (sto) {
                clearTimeout(sto);
            }
            sto = setTimeout(() => {
                if (isMountedRef.current) {
                    scrollToCurrentLrcItem();
                }
            }, 150);
        };
    }, [scrollToCurrentLrcItem]);

    // Main scroll effect - only triggers when lyric line changes
    useEffect(() => {
        // Skip if no lyrics or dragging or paused
        if (
            lyrics.length === 0 ||
            draggingIndex !== undefined ||
            (draggingIndex === undefined && musicIsPaused(musicState)) ||
            lyrics[lyrics.length - 1].time < 1
        ) {
            return;
        }

        const targetIndex = currentLrcItem?.index ?? -1;

        // Only scroll when line actually changes (not during word-by-word updates)
        if (targetIndex === lastScrollIndexRef.current) {
            return;
        }

        if (targetIndex === -1 || !currentLrcItem) {
            lastScrollIndexRef.current = 0;
            listRef.current?.scrollToIndex({
                index: 0,
                viewPosition: 0.5,
                animated: true,
            });
        } else {
            lastScrollIndexRef.current = targetIndex;
            listRef.current?.scrollToIndex({
                index: Math.min(targetIndex, lyrics.length - 1),
                viewPosition: 0.5,
                animated: true,
            });
        }
    }, [currentLrcItem?.index, lyrics.length, draggingIndex]);

    useEffect(() => {
        // Reset last scroll index when lyrics change
        lastScrollIndexRef.current = -1;
        isInitialPositioning.current = true;
        setIsListReady(false);
        return () => {
            isMountedRef.current = false;
        };
    }, [lyrics]);

    // Handle content ready - scroll to current position without animation
    const onContentSizeChange = useCallback(() => {
        if (isInitialPositioning.current && listRef.current) {
            const currentLyricItem = lyricManager.currentLyricItem;
            const targetIndex = currentLyricItem?.index ?? -1;

            if (targetIndex > 0 && targetIndex < lyrics.length) {
                lastScrollIndexRef.current = targetIndex;
                listRef.current.scrollToIndex({
                    index: targetIndex,
                    viewPosition: 0.5,
                    animated: false,
                });
            }

            // Mark as ready and initial positioning done
            setIsListReady(true);
            isInitialPositioning.current = false;
        }
    }, [lyrics.length]);

    // Reset scroll index when song changes
    useEffect(() => {
        lastScrollIndexRef.current = -1;
        isInitialPositioning.current = true;
    }, [currentMusicItem?.id]);

    // Scroll handlers
    const onScrollBeginDrag = () => {
        dragShownRef.current = true;
        // Interrupt auto-scrolling when user starts dragging
        isAutoScrolling.current = false;
    };

    const onScrollEndDrag = async () => {
        if (draggingIndex !== undefined) {
            setDraggingIndex(undefined);
        }
        dragShownRef.current = false;
        // Reset last scroll index to allow re-scrolling to current position
        lastScrollIndexRef.current = -1;
    };

    const onScroll = useCallback((e: any) => {
        if (dragShownRef.current && !isAutoScrolling.current) {
            const offset =
                e.nativeEvent.contentOffset.y +
                e.nativeEvent.layoutMeasurement.height / 2;

            const itemHeights = itemHeightsRef.current;
            let height = itemHeights.blankHeight || 0;
            if (offset <= height) {
                setDraggingIndex(0);
                return;
            }
            for (let i = 0; i < lyrics.length; ++i) {
                height += itemHeights[i] || ITEM_HEIGHT;
                if (height > offset) {
                    setDraggingIndex(i);
                    return;
                }
            }
        }
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

    return (
        <>
            <GestureDetector gesture={tapGesture}>
                <View style={globalStyle.fwflex1}>
                    {loading ? (
                        <Loading color="white" />
                    ) : lyrics?.length ? (
                        <FlatList
                            ref={_ => {
                                listRef.current = _;
                            }}
                            onLayout={e => {
                                setLayout(e.nativeEvent.layout);
                            }}
                            // Start at approximate position to prevent visible scroll
                            contentOffset={initialContentOffset}
                            viewabilityConfig={{
                                itemVisiblePercentThreshold: 100,
                            }}
                            onScrollToIndexFailed={({ index }) => {
                                delay(120).then(() => {
                                    listRef.current?.scrollToIndex({
                                        index: Math.min(
                                            index ?? 0,
                                            lyrics.length - 1,
                                        ),
                                        viewPosition: 0.5,
                                        animated: false,
                                    });
                                    setIsListReady(true);
                                });
                            }}
                            fadingEdgeLength={120}
                            // Initial position without animation
                            onContentSizeChange={onContentSizeChange}
                            // Load all lyrics at once for instant positioning
                            initialNumToRender={lyrics.length}
                            windowSize={21}
                            maxToRenderPerBatch={lyrics.length}
                            updateCellsBatchingPeriod={50}
                            removeClippedSubviews={false}
                            maintainVisibleContentPosition={{
                                minIndexForVisible: 0,
                            }}
                            ListHeaderComponent={
                                <>
                                    {blankComponent}
                                    <View style={styles.lyricMeta}>
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
                            style={[styles.wrapper, { opacity: isListReady ? 1 : 0 }]}
                            data={lyrics}
                            overScrollMode="never"
                            extraData={currentLrcItem?.index}
                            renderItem={({ item, index }) => {
                                const isHighlighted = currentLrcItem?.index === index;

                                const order = lyricOrder ?? ["original", "romanization", "translation"];

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
                                            showRomanization &&
                                            hasRomanization &&
                                            item.hasRomanizationWordByWord
                                        }
                                        isRomanizationPseudo={item.isRomanizationPseudo}
                                        translation={translationText}
                                        translationWords={
                                            showTranslation && hasTranslation
                                                ? item.translationWords
                                                : undefined
                                        }
                                        hasTranslationWordByWord={
                                            showTranslation &&
                                            hasTranslation &&
                                            item.hasTranslationWordByWord
                                        }
                                        lyricOrder={order}
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
                scrollToCurrentLrcItem={delayedScrollToCurrentLrcItem}
            />
        </>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        width: "100%",
        marginVertical: rpx(48),
        flex: 1,
    },
    empty: {
        paddingTop: "70%",
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
    draggingTimeText: {
        color: "#dddddd",
        fontSize: fontSizeConst.description,
        width: rpx(90),
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
