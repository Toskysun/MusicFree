import React, { memo, useState, useCallback, useEffect, useMemo } from "react";
import { StyleSheet, Text, View, LayoutChangeEvent } from "react-native";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from "react-native-reanimated";
import MaskedView from "@react-native-masked-view/masked-view";
import LinearGradient from "react-native-linear-gradient";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import { fontSizeConst } from "@/constants/uiConst";
import { useCurrentPositionMs } from "@/core/lyricManager";

interface ILyricItemComponentProps {
    index?: number;
    light?: boolean;
    highlight?: boolean;
    text?: string;
    fontSize?: number;
    words?: ILyric.IWordData[];
    hasWordByWord?: boolean;
    romanizationWords?: ILyric.IWordData[];
    hasRomanizationWordByWord?: boolean;
    translation?: string;
    swapRomanizationAndTranslation?: boolean;
    onLayout?: (index: number, height: number) => void;
}

// Long duration threshold (1.5 seconds) for enhanced glow effect
const LONG_DURATION_MS = 1500;

// Animation timing configs
const SCALE_TIMING_CONFIG = {
    duration: 350,
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};

// Gradient edge width for smooth transition (percentage)
const GRADIENT_EDGE_WIDTH = 0.15;

// Font size ratios for secondary lines (1.0 = same as primary)
const ROMANIZATION_FONT_RATIO = 1.0;
const TRANSLATION_FONT_RATIO = 1.0;

// Individual word component with smooth gradient fill animation
const KaraokeWord = memo(({
    word,
    currentTimeMs,
    primaryColor,
    highlightColor,
    fontSize,
    isCurrentLine,
}: {
    word: ILyric.IWordData;
    currentTimeMs: number;
    primaryColor: string;
    highlightColor: string;
    fontSize: number;
    isCurrentLine: boolean;
}) => {
    const { startTime, duration, text, space } = word;
    const endTime = startTime + duration;
    const [wordSize, setWordSize] = useState({ width: 0, height: 0 });

    // Calculate raw progress (0 to 1)
    const progress = useMemo(() => {
        if (!isCurrentLine) return 0;
        if (currentTimeMs >= endTime) return 1;
        if (currentTimeMs <= startTime) return 0;
        return Math.min(1, Math.max(0, (currentTimeMs - startTime) / duration));
    }, [currentTimeMs, startTime, endTime, duration, isCurrentLine]);

    // Animation states
    const isCompleted = progress >= 1;
    const isPending = progress === 0;

    // Long duration word has enhanced glow effect
    const isLongDuration = duration >= LONG_DURATION_MS;

    // Handle text size measurement
    const handleLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
            setWordSize({ width, height });
        }
    }, []);

    // Calculate gradient locations for smooth edge transition
    const gradientConfig = useMemo(() => {
        const edgeStart = Math.max(0, progress - GRADIENT_EDGE_WIDTH);
        const edgeEnd = Math.min(1, progress + GRADIENT_EDGE_WIDTH);

        return {
            colors: [
                highlightColor,
                highlightColor,
                'rgba(255, 255, 255, 0.35)',
                'rgba(255, 255, 255, 0.35)',
            ],
            locations: [0, edgeStart, edgeEnd, 1],
        };
    }, [progress, highlightColor]);

    // For non-current lines: simple text
    if (!isCurrentLine) {
        return (
            <Text
                style={[
                    styles.wordText,
                    {
                        fontSize,
                        color: primaryColor,
                        opacity: 0.5,
                    },
                ]}
            >
                {text}
                {space ? ' ' : ''}
            </Text>
        );
    }

    // For pending words (not yet started)
    if (isPending) {
        return (
            <Text
                onLayout={handleLayout}
                style={[
                    styles.wordText,
                    {
                        fontSize,
                        color: primaryColor,
                        opacity: 0.4,
                    },
                ]}
            >
                {text}
                {space ? ' ' : ''}
            </Text>
        );
    }

    // For completed words - full highlight with glow
    if (isCompleted) {
        return (
            <View style={styles.wordWrapper}>
                <Text
                    onLayout={handleLayout}
                    style={[
                        styles.wordText,
                        {
                            fontSize,
                            color: highlightColor,
                            opacity: 1,
                            textShadowColor: highlightColor,
                            textShadowOffset: { width: 0, height: 0 },
                            textShadowRadius: 6,
                        },
                    ]}
                >
                    {text}
                    {space ? ' ' : ''}
                </Text>
            </View>
        );
    }

    // Active word: Use MaskedView with LinearGradient for smooth left-to-right fill
    const glowRadius = isLongDuration ? 18 : 12;
    const glowOpacity = isLongDuration ? 0.5 * progress : 0.3 * progress;

    return (
        <View style={styles.wordWrapper}>
            {/* Measure text size with invisible text */}
            <Text
                onLayout={handleLayout}
                style={[
                    styles.wordText,
                    styles.measureText,
                    { fontSize },
                ]}
            >
                {text}
                {space ? ' ' : ''}
            </Text>

            {/* Gradient-filled text using MaskedView */}
            {wordSize.width > 0 && (
                <MaskedView
                    style={[styles.maskedContainer, { width: wordSize.width, height: wordSize.height }]}
                    maskElement={
                        <Text
                            style={[
                                styles.wordText,
                                styles.maskText,
                                { fontSize },
                            ]}
                        >
                            {text}
                            {space ? ' ' : ''}
                        </Text>
                    }
                >
                    <LinearGradient
                        colors={gradientConfig.colors}
                        locations={gradientConfig.locations}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={[styles.gradient, { width: wordSize.width, height: wordSize.height }]}
                    />
                </MaskedView>
            )}

            {/* Enhanced glow effect for long duration words */}
            {isLongDuration && progress > 0.2 && (
                <Text
                    style={[
                        styles.wordText,
                        styles.glowText,
                        {
                            fontSize,
                            color: highlightColor,
                            opacity: glowOpacity,
                            textShadowColor: highlightColor,
                            textShadowOffset: { width: 0, height: 0 },
                            textShadowRadius: glowRadius,
                        },
                    ]}
                >
                    {text}
                    {space ? ' ' : ''}
                </Text>
            )}
        </View>
    );
});

// Translation line with smooth gradient fill effect (same as karaoke words)
const FollowingTranslationLine = memo(({
    text,
    progress,
    fontSize,
    highlightColor,
}: {
    text: string;
    progress: number;
    fontSize: number;
    highlightColor: string;
}) => {
    const [textSize, setTextSize] = useState({ width: 0, height: 0 });

    // Handle text size measurement
    const handleLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
            setTextSize({ width, height });
        }
    }, []);

    // Calculate gradient locations for smooth edge transition (same as KaraokeWord)
    const gradientConfig = useMemo(() => {
        const edgeStart = Math.max(0, progress - GRADIENT_EDGE_WIDTH);
        const edgeEnd = Math.min(1, progress + GRADIENT_EDGE_WIDTH);

        return {
            colors: [
                highlightColor,
                highlightColor,
                'rgba(255, 255, 255, 0.35)',
                'rgba(255, 255, 255, 0.35)',
            ],
            locations: [0, edgeStart, edgeEnd, 1],
        };
    }, [progress, highlightColor]);

    return (
        <View style={styles.translationLineContainer}>
            {/* Measure text size with invisible text */}
            <Text
                onLayout={handleLayout}
                style={[
                    styles.wordText,
                    styles.measureText,
                    { fontSize },
                ]}
            >
                {text}
            </Text>

            {/* Gradient-filled text using MaskedView */}
            {textSize.width > 0 && (
                <MaskedView
                    style={[styles.maskedContainer, { width: textSize.width, height: textSize.height }]}
                    maskElement={
                        <Text
                            style={[
                                styles.wordText,
                                styles.maskText,
                                { fontSize },
                            ]}
                        >
                            {text}
                        </Text>
                    }
                >
                    <LinearGradient
                        colors={gradientConfig.colors}
                        locations={gradientConfig.locations}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={[styles.gradient, { width: textSize.width, height: textSize.height }]}
                    />
                </MaskedView>
            )}
        </View>
    );
});

// Word-by-word lyric line with scale animation - supports 3 lines
interface IWordByWordLyricProps {
    words: ILyric.IWordData[];
    romanizationWords?: ILyric.IWordData[];
    translation?: string;
    swapRomanizationAndTranslation?: boolean;
    fontSize: number;
    highlightColor: string;
    index?: number;
    onLayout?: (index: number, height: number) => void;
}

function WordByWordLyricLine({
    words,
    romanizationWords,
    translation,
    swapRomanizationAndTranslation,
    fontSize,
    highlightColor,
    index,
    onLayout,
}: IWordByWordLyricProps) {
    const currentPositionMs = useCurrentPositionMs();

    // Animated scale for current line emphasis
    const scale = useSharedValue(0.88);
    const opacity = useSharedValue(0.6);

    useEffect(() => {
        scale.value = withTiming(1, SCALE_TIMING_CONFIG);
        opacity.value = withTiming(1, { duration: 280 });
    }, []);

    const animatedContainerStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    // Calculate overall progress for translation following
    const overallProgress = useMemo(() => {
        if (!words?.length) return 0;
        const lineStart = words[0].startTime;
        const lastWord = words[words.length - 1];
        const lineEnd = lastWord.startTime + lastWord.duration;
        if (lineEnd <= lineStart) return 0;
        return Math.min(1, Math.max(0, (currentPositionMs - lineStart) / (lineEnd - lineStart)));
    }, [currentPositionMs, words]);

    const romanizationFontSize = fontSize * ROMANIZATION_FONT_RATIO;
    const translationFontSize = fontSize * TRANSLATION_FONT_RATIO;

    // Romanization line component
    const romanizationLine = romanizationWords && romanizationWords.length > 0 && (
        <View style={[lyricStyles.wordByWordLine, lyricStyles.secondaryLine]}>
            {romanizationWords.map((word, wordIndex) => (
                <KaraokeWord
                    key={wordIndex}
                    word={word}
                    currentTimeMs={currentPositionMs}
                    primaryColor="white"
                    highlightColor={highlightColor}
                    fontSize={romanizationFontSize}
                    isCurrentLine={true}
                />
            ))}
        </View>
    );

    // Translation line component
    const translationLine = translation && (
        <View style={lyricStyles.secondaryLine}>
            <FollowingTranslationLine
                text={translation}
                progress={overallProgress}
                fontSize={translationFontSize}
                highlightColor={highlightColor}
            />
        </View>
    );

    return (
        <Animated.View
            onLayout={({ nativeEvent }) => {
                if (index !== undefined) {
                    onLayout?.(index, nativeEvent.layout.height);
                }
            }}
            style={[
                lyricStyles.item,
                lyricStyles.multiLineContainer,
                animatedContainerStyle,
            ]}
        >
            {/* Primary line: Original lyrics with word-by-word effect */}
            <View style={lyricStyles.wordByWordLine}>
                {words.map((word, wordIndex) => (
                    <KaraokeWord
                        key={wordIndex}
                        word={word}
                        currentTimeMs={currentPositionMs}
                        primaryColor="white"
                        highlightColor={highlightColor}
                        fontSize={fontSize}
                        isCurrentLine={true}
                    />
                ))}
            </View>

            {/* Secondary lines: Romanization and Translation (order based on setting) */}
            {swapRomanizationAndTranslation ? (
                <>
                    {translationLine}
                    {romanizationLine}
                </>
            ) : (
                <>
                    {romanizationLine}
                    {translationLine}
                </>
            )}
        </Animated.View>
    );
}

// Regular lyric line with smooth scale animation
function RegularLyricLine({
    text,
    fontSize,
    highlight,
    light,
    index,
    onLayout,
    primaryColor,
}: {
    text: string;
    fontSize: number;
    highlight: boolean;
    light: boolean;
    index?: number;
    onLayout?: (index: number, height: number) => void;
    primaryColor: string;
}) {
    const scale = useSharedValue(highlight ? 0.88 : 0.95);
    const textOpacity = useSharedValue(highlight ? 0.6 : 0.6);

    useEffect(() => {
        if (highlight) {
            scale.value = withTiming(1, SCALE_TIMING_CONFIG);
            textOpacity.value = withTiming(1, { duration: 280 });
        } else {
            scale.value = withTiming(0.95, SCALE_TIMING_CONFIG);
            textOpacity.value = withTiming(0.6, { duration: 280 });
        }
    }, [highlight]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: textOpacity.value,
    }));

    return (
        <Animated.Text
            onLayout={({ nativeEvent }) => {
                if (index !== undefined) {
                    onLayout?.(index, nativeEvent.layout.height);
                }
            }}
            style={[
                lyricStyles.item,
                { fontSize },
                animatedStyle,
                highlight ? [lyricStyles.highlightItem, { color: primaryColor }] : null,
                light ? lyricStyles.draggingItem : null,
            ]}
        >
            {text}
        </Animated.Text>
    );
}

function _LyricItemComponent(props: ILyricItemComponentProps) {
    const {
        light,
        highlight,
        text,
        onLayout,
        index,
        fontSize,
        words,
        hasWordByWord,
        romanizationWords,
        hasRomanizationWordByWord,
        translation,
        swapRomanizationAndTranslation,
    } = props;

    const colors = useColors();
    const actualFontSize = fontSize || fontSizeConst.content;

    // Render karaoke-style word-by-word lyrics for highlighted lines
    if (highlight && hasWordByWord && words && words.length > 0) {
        return (
            <WordByWordLyricLine
                words={words}
                romanizationWords={hasRomanizationWordByWord ? romanizationWords : undefined}
                translation={translation}
                swapRomanizationAndTranslation={swapRomanizationAndTranslation}
                fontSize={actualFontSize}
                highlightColor={colors.primary}
                index={index}
                onLayout={onLayout}
            />
        );
    }

    // Regular lyric rendering with scale animation
    return (
        <RegularLyricLine
            text={text || ''}
            fontSize={actualFontSize}
            highlight={!!highlight}
            light={!!light}
            index={index}
            onLayout={onLayout}
            primaryColor={colors.primary}
        />
    );
}

const LyricItemComponent = memo(
    _LyricItemComponent,
    (prev, curr) =>
        prev.light === curr.light &&
        prev.highlight === curr.highlight &&
        prev.text === curr.text &&
        prev.index === curr.index &&
        prev.fontSize === curr.fontSize &&
        prev.hasWordByWord === curr.hasWordByWord &&
        prev.hasRomanizationWordByWord === curr.hasRomanizationWordByWord &&
        prev.translation === curr.translation &&
        prev.swapRomanizationAndTranslation === curr.swapRomanizationAndTranslation,
);

export default LyricItemComponent;

const styles = StyleSheet.create({
    wordWrapper: {
        position: 'relative',
    },
    wordText: {
        fontWeight: '600',
    },
    measureText: {
        opacity: 0,
    },
    maskedContainer: {
        position: 'absolute',
        left: 0,
        top: 0,
    },
    maskText: {
        color: 'black',
        backgroundColor: 'transparent',
    },
    gradient: {
        flex: 1,
    },
    glowText: {
        position: 'absolute',
        left: 0,
        top: 0,
    },
    translationLineContainer: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
});

const lyricStyles = StyleSheet.create({
    highlightItem: {
        opacity: 1,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 6,
    },
    item: {
        color: "white",
        opacity: 0.6,
        paddingHorizontal: rpx(64),
        paddingVertical: rpx(24),
        width: "100%",
        textAlign: "center",
        textAlignVertical: "center",
    },
    multiLineContainer: {
        flexDirection: 'column',
        alignItems: 'center',
    },
    wordByWordLine: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
    },
    secondaryLine: {
        marginTop: rpx(12),
    },
    draggingItem: {
        opacity: 0.9,
        color: "white",
    },
});
