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
}

const LINE_HEIGHT = rpx(40);
const SECONDARY_LINE_HEIGHT = rpx(28);
const GROUP_SPACING = rpx(4);

export default function MiniLyric(props: IMiniLyricProps) {
    const { onPress, disableMaskedView } = props;
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
        ["original", "translation", "romanization"],
    );

    const translateY = useSharedValue(0);
    const lastIndex = useRef(-1);

    const currentIndex = currentLyricItem?.index ?? -1;

    // Calculate group height (first visible line uses large font, others use small font)
    const getGroupHeight = () => {
        // Determine which types are visible
        const visibleTypes: string[] = [];
        for (const type of lyricOrder) {
            if (type === "original") {
                visibleTypes.push(type);
            } else if (type === "romanization" && showRomanization && hasRomanization) {
                visibleTypes.push(type);
            } else if (type === "translation" && showTranslation && hasTranslation) {
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

    const containerHeight = rpx(220);

    const dynamicContainerStyle = useMemo(() => ({
        paddingHorizontal: getCoverLeftMargin(coverStyle),
    }), [coverStyle]);

    // Handle position updates
    useEffect(() => {
        if (currentIndex >= 0 && lyrics.length > 0) {
            const groupHeight = getGroupHeight();
            // Center the current line in container
            const targetY = -currentIndex * groupHeight + (containerHeight - groupHeight) / 2;

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
    }, [currentIndex, lyrics.length, showTranslation, showRomanization, lyricOrder]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const tap = Gesture.Tap()
        .onStart(() => {
            onPress?.();
        })
        .runOnJS(true);

    const FADE_HEIGHT = rpx(60);

    const maskElement = useMemo(() => (
        <View style={styles.maskContainer}>
            <LinearGradient
                colors={["transparent", "black"]}
                style={{ height: FADE_HEIGHT }}
            />
            <View style={{ flex: 1, backgroundColor: "black" }} />
            <LinearGradient
                colors={["black", "transparent"]}
                style={{ height: FADE_HEIGHT }}
            />
        </View>
    ), []);

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
                            const firstVisibleType = lyricOrder.find((type) => {
                                if (type === "original") return true;
                                if (type === "romanization") return showRomanization && hasRomanization;
                                if (type === "translation") return showTranslation && hasTranslation;
                                return false;
                            });

                            return lyricOrder.map((type) => {
                                const isPrimary = type === firstVisibleType;
                                const textStyle = isPrimary ? styles.lyricLine : styles.secondaryLine;

                                if (type === "original") {
                                    if (isEmptyLyric) {
                                        // Only show breathing dots if enabled
                                        if (!enableBreathingDots) {
                                            return <View key="original" style={styles.dotsContainer} />;
                                        }
                                        return (
                                            <View key="original" style={styles.dotsContainer}>
                                                <BreathingDots
                                                    color={isActive ? colors.primary : "white"}
                                                    align="left"
                                                    highlight={isActive}
                                                />
                                            </View>
                                        );
                                    }
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
                                if (type === "romanization" && showRomanization && hasRomanization) {
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
                                if (type === "translation" && showTranslation && hasTranslation) {
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
            <View style={[styles.container, dynamicContainerStyle, { height: containerHeight }]}>
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
        marginTop: rpx(24),
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
