import React, { useEffect, useMemo, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from "react-native-reanimated";
import MaskedView from "@react-native-masked-view/masked-view";
import LinearGradient from "react-native-linear-gradient";
import rpx from "@/utils/rpx";
import { useCurrentLyricItem, useLyricState } from "@/core/lyricManager";
import useColors from "@/hooks/useColors";
import { fontSizeConst } from "@/constants/uiConst";
import useOrientation from "@/hooks/useOrientation";
import PersistStatus from "@/utils/persistStatus";
import { useAppConfig } from "@/core/appConfig";
import { BreathingDots } from "../lyric/lyricItem";
import { getCoverLeftMargin } from "./index";

interface IMiniLyricProps {
    onPress?: () => void;
    disableMaskedView?: boolean;
    layout?: "normal" | "compact";
}

const LINE_HEIGHT = rpx(40);
const SECONDARY_LINE_HEIGHT = rpx(28);
const GROUP_SPACING = rpx(4);
const DEFAULT_CONTAINER_HEIGHT = rpx(220);
const COMPACT_CONTAINER_HEIGHT = rpx(130);
const DEFAULT_FADE_HEIGHT = rpx(60);
const COMPACT_FADE_HEIGHT = rpx(30);
const DEFAULT_CONTAINER_MARGIN_TOP = rpx(24);
const COMPACT_CONTAINER_MARGIN_TOP = rpx(12);

export default function MiniLyric(props: IMiniLyricProps) {
    const { onPress, disableMaskedView } = props;
    const layout = props.layout ?? "normal";
    const colors = useColors();
    const currentLyricItem = useCurrentLyricItem();
    const { lyrics, loading, hasTranslation, hasRomanization } = useLyricState();
    const orientation = useOrientation();
    const coverStyle = useAppConfig("theme.coverStyle") ?? "square";
    const enableBreathingDots = useAppConfig("lyric.enableBreathingDots") ?? true;

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
        ["original", "romanization", "translation"],
    );

    const effectiveLyricOrder = useMemo(
        () => (layout === "compact" ? ["original"] : lyricOrder),
        [layout, lyricOrder],
    );
    const effectiveShowTranslation = layout === "compact" ? false : showTranslation;
    const effectiveShowRomanization = layout === "compact" ? false : showRomanization;

    const translateY = useSharedValue(0);
    const lastIndex = useRef(-1);

    const currentIndex = currentLyricItem?.index ?? -1;

    // Calculate height for a single lyric line
    const getLineHeight = (lyric: typeof lyrics[0]) => {
        const isEmptyLyric = !lyric.lrc || lyric.lrc.trim() === "";

        // Empty lyrics only show one line
        if (isEmptyLyric) {
            return LINE_HEIGHT + GROUP_SPACING;
        }

        // Determine which types are visible
        const visibleTypes: string[] = [];
        for (const type of effectiveLyricOrder) {
            if (type === "original") {
                visibleTypes.push(type);
            } else if (type === "romanization" && effectiveShowRomanization && hasRomanization) {
                visibleTypes.push(type);
            } else if (type === "translation" && effectiveShowTranslation && hasTranslation) {
                visibleTypes.push(type);
            }
        }

        if (visibleTypes.length === 0) {
            return LINE_HEIGHT + GROUP_SPACING;
        }

        // First visible uses large font, others use small font
        let height = LINE_HEIGHT; // First line
        height += (visibleTypes.length - 1) * SECONDARY_LINE_HEIGHT; // Remaining lines

        return height + GROUP_SPACING;
    };

    // Calculate cumulative offset for a given index
    const getCumulativeOffset = (targetIndex: number) => {
        let offset = 0;
        for (let i = 0; i < targetIndex; i++) {
            offset += getLineHeight(lyrics[i]);
        }
        return offset;
    };

    const containerHeight = layout === "compact" ? COMPACT_CONTAINER_HEIGHT : DEFAULT_CONTAINER_HEIGHT;

    const dynamicContainerStyle = useMemo(() => ({
        paddingHorizontal: getCoverLeftMargin(coverStyle),
    }), [coverStyle]);

    // Handle position updates
    useEffect(() => {
        if (currentIndex >= 0 && lyrics.length > 0) {
            const currentLineHeight = getLineHeight(lyrics[currentIndex]);
            const cumulativeOffset = getCumulativeOffset(currentIndex);
            // Center the current line in container
            const targetY = -cumulativeOffset + (containerHeight - currentLineHeight) / 2;

            if (lastIndex.current === -1) {
                // First time: set position directly without animation
                translateY.value = targetY;
            } else if (lastIndex.current !== currentIndex) {
                // Subsequent: animate
                translateY.value = withTiming(targetY, {
                    duration: 400,
                    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
                });
            }
            lastIndex.current = currentIndex;
        }
    }, [
        containerHeight,
        currentIndex,
        effectiveLyricOrder,
        effectiveShowRomanization,
        effectiveShowTranslation,
        lyrics.length,
    ]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const tap = Gesture.Tap()
        .onStart(() => {
            onPress?.();
        })
        .runOnJS(true);

    const fadeHeight = layout === "compact" ? COMPACT_FADE_HEIGHT : DEFAULT_FADE_HEIGHT;

    // 使用 rgba 替代 transparent 避免 Android 渲染伪影
    const maskElement = useMemo(() => (
        <View style={styles.maskContainer}>
            <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,1)"]}
                style={{ height: fadeHeight }}
            />
            <View style={{ flex: 1, backgroundColor: "black" }} />
            <LinearGradient
                colors={["rgba(0,0,0,1)", "rgba(0,0,0,0)"]}
                style={{ height: fadeHeight }}
            />
        </View>
    ), [fadeHeight]);

    // Don't show when no lyrics, loading, or horizontal orientation
    const isHidden = !lyrics.length || loading || orientation === "horizontal";

    // Early return when hidden to avoid MaskedView height caching issues
    if (isHidden) {
        return null;
    }

    // Calculate opacity based on distance from current line
    const getLineOpacity = (index: number) => {
        if (currentIndex < 0) return 0.5;
        const distance = Math.abs(index - currentIndex);
        if (distance === 0) return 1;
        if (distance === 1) return 0.6;
        if (distance === 2) return 0.4;
        return 0.25;
    };

    const shouldUseMask = Platform.OS !== "android" || !disableMaskedView;

    const lyricsContent = (
        <View style={styles.contentContainer}>
            <Animated.View style={[styles.lyricsWrapper, animatedStyle]}>
            {lyrics.map((lyric, index) => {
                const isActive = index === currentIndex;
                const isEmptyLyric = !lyric.lrc || lyric.lrc.trim() === "";
                const lineOpacity = getLineOpacity(index);

                return (
                    <View key={index} style={[styles.lyricGroup, { opacity: lineOpacity }]}>
                        {(() => {
                            // Find first visible type
                            const firstVisibleType = effectiveLyricOrder.find((type) => {
                                if (type === "original") return true;
                                if (type === "romanization") return effectiveShowRomanization && hasRomanization;
                                if (type === "translation") return effectiveShowTranslation && hasTranslation;
                                return false;
                            });

                            // Empty lyrics only show original line
                            if (isEmptyLyric) {
                                if (!enableBreathingDots || !isActive) {
                                    return <View key="original" style={styles.dotsContainer} />;
                                }
                                return (
                                    <View key="original" style={styles.dotsContainer}>
                                        <BreathingDots
                                            color={colors.primary}
                                            align="left"
                                            highlight={true}
                                        />
                                    </View>
                                );
                            }

                            return effectiveLyricOrder.map((type) => {
                                const isPrimary = type === firstVisibleType;
                                const textStyle = isPrimary ? styles.lyricLine : styles.secondaryLine;

                                if (type === "original") {
                                    return (
                                        <Text
                                            key="original"
                                            style={[
                                                textStyle,
                                                { color: isActive ? colors.primary : "white" },
                                            ]}
                                            numberOfLines={1}>
                                            {lyric.lrc}
                                        </Text>
                                    );
                                }
                                if (type === "romanization" && effectiveShowRomanization && hasRomanization) {
                                    return (
                                        <Text
                                            key="romanization"
                                            style={[
                                                textStyle,
                                                { color: isActive ? colors.primary : "white" },
                                            ]}
                                            numberOfLines={1}>
                                            {lyric.romanization || " "}
                                        </Text>
                                    );
                                }
                                if (type === "translation" && effectiveShowTranslation && hasTranslation) {
                                    return (
                                        <Text
                                            key="translation"
                                            style={[
                                                textStyle,
                                                { color: isActive ? colors.primary : "white" },
                                            ]}
                                            numberOfLines={1}>
                                            {lyric.translation || " "}
                                        </Text>
                                    );
                                }
                                return null;
                            });
                        })()}
                    </View>
                );
            })}
            </Animated.View>
        </View>
    );

    return (
        <GestureDetector gesture={tap}>
            <View
                style={[
                    styles.container,
                    dynamicContainerStyle,
                    {
                        height: containerHeight,
                        marginTop: layout === "compact" ? COMPACT_CONTAINER_MARGIN_TOP : DEFAULT_CONTAINER_MARGIN_TOP,
                    },
                ]}>
                {shouldUseMask ? (
                    <MaskedView
                        style={styles.maskedView}
                        maskElement={maskElement}
                        androidRenderingMode={
                            Platform.OS === "android" ? "software" : undefined
                        }
                        collapsable={false}
                    >
                        {lyricsContent}
                    </MaskedView>
                ) : (
                    lyricsContent
                )}
            </View>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
        marginTop: DEFAULT_CONTAINER_MARGIN_TOP,
    },
    maskContainer: {
        flex: 1,
        width: "100%",
    },
    contentContainer: {
        width: "100%",
        height: "100%",
        overflow: "hidden",
    },
    maskedView: {
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "transparent",
    },
    lyricsWrapper: {
        width: "100%",
    },
    lyricGroup: {
        width: "100%",
        marginBottom: GROUP_SPACING,
    },
    dotsContainer: {
        height: LINE_HEIGHT,
        justifyContent: "center",
        overflow: "hidden",
    },
    lyricLine: {
        width: "100%",
        fontSize: fontSizeConst.content,
        fontWeight: "600",
        textAlign: "left",
        lineHeight: LINE_HEIGHT,
        height: LINE_HEIGHT,
    },
    secondaryLine: {
        width: "100%",
        fontSize: fontSizeConst.description,
        fontWeight: "400",
        textAlign: "left",
        lineHeight: SECONDARY_LINE_HEIGHT,
        height: SECONDARY_LINE_HEIGHT,
    },
});
