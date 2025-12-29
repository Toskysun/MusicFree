import React, { useEffect, useMemo, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from "react-native-reanimated";
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
}

const LINE_HEIGHT = rpx(40);
const SECONDARY_LINE_HEIGHT = rpx(28);
const GROUP_SPACING = rpx(4);

export default function MiniLyric(props: IMiniLyricProps) {
    const { onPress } = props;
    const colors = useColors();
    const currentLyricItem = useCurrentLyricItem();
    const { lyrics, loading, hasTranslation, hasRomanization } = useLyricState();
    const orientation = useOrientation();
    const coverStyle = useAppConfig("theme.coverStyle") ?? "square";

    const showTranslation = PersistStatus.useValue(
        "lyric.showTranslation",
        false,
    );
    const showRomanization = PersistStatus.useValue(
        "lyric.showRomanization",
        false,
    );

    const translateY = useSharedValue(0);
    const lastIndex = useRef(-1);

    const currentIndex = currentLyricItem?.index ?? -1;

    // Calculate group height (one line includes original + romanization + translation)
    const getGroupHeight = () => {
        let height = LINE_HEIGHT; // Original lyric

        if (showRomanization && hasRomanization) {
            height += SECONDARY_LINE_HEIGHT;
        }
        if (showTranslation && hasTranslation) {
            height += SECONDARY_LINE_HEIGHT;
        }

        return height + GROUP_SPACING;
    };

    // Dynamic container height based on content
    const containerHeight = useMemo(() => {
        const hasExtra = (showTranslation && hasTranslation) || (showRomanization && hasRomanization);
        return hasExtra ? rpx(220) : rpx(140);
    }, [showTranslation, hasTranslation, showRomanization, hasRomanization]);

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
    }, [currentIndex, lyrics.length, showTranslation, showRomanization, containerHeight]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const tap = Gesture.Tap()
        .onStart(() => {
            onPress?.();
        })
        .runOnJS(true);

    // Don't show when no lyrics, loading, or horizontal orientation
    const isHidden = !lyrics.length || loading || orientation === "horizontal";

    // Calculate opacity based on distance from current line
    const getLineOpacity = (index: number) => {
        if (currentIndex < 0) return 0.5;
        const distance = Math.abs(index - currentIndex);
        if (distance === 0) return 1;
        if (distance === 1) return 0.6;
        if (distance === 2) return 0.4;
        return 0.25;
    };

    return (
        <GestureDetector gesture={tap}>
            <View style={[styles.container, dynamicContainerStyle, { height: containerHeight }, isHidden && styles.hidden]}>
                <ScrollView
                    style={styles.contentContainer}
                    scrollEnabled={false}
                    fadingEdgeLength={100}
                    showsVerticalScrollIndicator={false}
                >
                    <Animated.View style={[styles.lyricsWrapper, animatedStyle]}>
                        {lyrics.map((lyric, index) => {
                            const isActive = index === currentIndex;
                            const isEmptyLyric = !lyric.lrc || lyric.lrc.trim() === '';
                            const lineOpacity = getLineOpacity(index);

                            return (
                                <View key={index} style={[styles.lyricGroup, { opacity: lineOpacity }]}>
                                    {isEmptyLyric ? (
                                        <View style={styles.dotsContainer}>
                                            <BreathingDots
                                                color={isActive ? colors.primary : "white"}
                                                align="left"
                                                highlight={isActive}
                                            />
                                        </View>
                                    ) : (
                                        <Text
                                            style={[
                                                styles.lyricLine,
                                                { color: isActive ? colors.primary : "white" },
                                            ]}
                                            numberOfLines={1}>
                                            {lyric.lrc}
                                        </Text>
                                    )}
                                    {showRomanization && hasRomanization && (
                                        <Text
                                            style={[
                                                styles.secondaryLine,
                                                { color: isActive ? colors.primary : "white" },
                                            ]}
                                            numberOfLines={1}>
                                            {lyric.romanization || " "}
                                        </Text>
                                    )}
                                    {showTranslation && hasTranslation && (
                                        <Text
                                            style={[
                                                styles.secondaryLine,
                                                { color: isActive ? colors.primary : "white" },
                                            ]}
                                            numberOfLines={1}>
                                            {lyric.translation || " "}
                                        </Text>
                                    )}
                                </View>
                            );
                        })}
                    </Animated.View>
                </ScrollView>
            </View>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: rpx(48),
    },
    contentContainer: {
        width: "100%",
        height: "100%",
        overflow: "hidden",
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
    hidden: {
        opacity: 0,
        height: 0,
        overflow: "hidden",
        marginBottom: 0,
    },
});
