import React, { memo, useState, useCallback, useEffect, useMemo } from "react";
import { StyleSheet, Text, View, LayoutChangeEvent } from "react-native";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withRepeat,
    Easing,
} from "react-native-reanimated";
import MaskedView from "@react-native-masked-view/masked-view";
import LinearGradient from "react-native-linear-gradient";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import { fontSizeConst } from "@/constants/uiConst";
import { useCurrentPositionMs } from "@/core/lyricManager";
import { useAppConfig } from "@/core/appConfig";

type LyricAlign = "left" | "center";

// Breathing dots animation config
const DOTS_CONFIG = {
    number: 3,
    size: 16,
    margin: 12,
    breathingAmplitude: 0.1,
    breathingCenter: 0.9,
    breathingCycleDuration: 3000,
    dotAlphaMin: 0.4,
    dotAlphaMax: 1.0,
};

// Breathing dots component for empty lyric lines
const BreathingDots = memo(({
    color,
    align = "center",
    highlight = false,
}: {
    color: string;
    align?: LyricAlign;
    highlight?: boolean;
}) => {
    const breathingProgress = useSharedValue(0);
    const dotAlpha1 = useSharedValue(DOTS_CONFIG.dotAlphaMin);
    const dotAlpha2 = useSharedValue(DOTS_CONFIG.dotAlphaMin);
    const dotAlpha3 = useSharedValue(DOTS_CONFIG.dotAlphaMin);

    useEffect(() => {
        // Breathing scale animation (sine wave)
        breathingProgress.value = withRepeat(
            withTiming(1, {
                duration: DOTS_CONFIG.breathingCycleDuration,
                easing: Easing.linear,
            }),
            -1,
            false,
        );

        // Sequential alpha animations for each dot
        // Each dot cycles from min to max alpha in a staggered pattern
        const dotDuration = DOTS_CONFIG.breathingCycleDuration / DOTS_CONFIG.number;

        // Start first dot animation immediately
        dotAlpha1.value = DOTS_CONFIG.dotAlphaMin;
        dotAlpha1.value = withRepeat(
            withTiming(DOTS_CONFIG.dotAlphaMax, {
                duration: dotDuration,
                easing: Easing.inOut(Easing.ease),
            }),
            -1,
            true, // Reverse animation to create smooth cycle
        );

        // Start second dot after delay
        setTimeout(() => {
            dotAlpha2.value = withRepeat(
                withTiming(DOTS_CONFIG.dotAlphaMax, {
                    duration: dotDuration,
                    easing: Easing.inOut(Easing.ease),
                }),
                -1,
                true,
            );
        }, dotDuration);

        // Start third dot after longer delay
        setTimeout(() => {
            dotAlpha3.value = withRepeat(
                withTiming(DOTS_CONFIG.dotAlphaMax, {
                    duration: dotDuration,
                    easing: Easing.inOut(Easing.ease),
                }),
                -1,
                true,
            );
        }, dotDuration * 2);
    }, []);

    // Calculate breathing scale based on sine wave
    const containerStyle = useAnimatedStyle(() => {
        const angle = breathingProgress.value * 2 * Math.PI - Math.PI / 2;
        const scale = DOTS_CONFIG.breathingCenter + DOTS_CONFIG.breathingAmplitude * Math.sin(angle);
        return {
            transform: [{ scale: highlight ? scale * HIGHLIGHT_SCALE : scale }],
        };
    });

    const dot1Style = useAnimatedStyle(() => ({
        opacity: dotAlpha1.value,
    }));

    const dot2Style = useAnimatedStyle(() => ({
        opacity: dotAlpha2.value,
    }));

    const dot3Style = useAnimatedStyle(() => ({
        opacity: dotAlpha3.value,
    }));

    const dotBaseStyle = {
        width: DOTS_CONFIG.size,
        height: DOTS_CONFIG.size,
        borderRadius: DOTS_CONFIG.size / 2,
        backgroundColor: color,
    };

    return (
        <View style={[
            dotsStyles.container,
            { alignItems: align === "left" ? "flex-start" : "center" },
        ]}>
            <Animated.View style={[dotsStyles.dotsRow, containerStyle]}>
                <Animated.View style={[dotBaseStyle, dot1Style]} />
                <View style={{ width: DOTS_CONFIG.margin }} />
                <Animated.View style={[dotBaseStyle, dot2Style]} />
                <View style={{ width: DOTS_CONFIG.margin }} />
                <Animated.View style={[dotBaseStyle, dot3Style]} />
            </Animated.View>
        </View>
    );
});

interface ILyricItemComponentProps {
    index?: number;
    light?: boolean;
    highlight?: boolean;
    text?: string;
    fontSize?: number;
    words?: ILyric.IWordData[];
    hasWordByWord?: boolean;
    romanizationWords?: ILyric.IWordData[];
    romanization?: string;
    hasRomanizationWordByWord?: boolean;
    isRomanizationPseudo?: boolean;
    translation?: string;
    translationWords?: ILyric.IWordData[];
    hasTranslationWordByWord?: boolean;
    lyricOrder?: ("original" | "translation" | "romanization")[];
    onLayout?: (index: number, height: number) => void;
    align?: LyricAlign;
}

// Long duration threshold (1.5 seconds) for enhanced glow effect
const LONG_DURATION_MS = 1500;

// Animation timing configs
const SCALE_TIMING_CONFIG = {
    duration: 350,
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};

// Scale factor for highlighted line
const HIGHLIGHT_SCALE = 1.05;

// Scale factor for word-by-word lyrics (larger for better visibility)
const WORD_BY_WORD_SCALE = 1.12;

// Gradient edge width for smooth transition (percentage)
const GRADIENT_EDGE_WIDTH = 0.12;

// Font size ratio for secondary lines (smaller than primary/first line)
const SECONDARY_FONT_RATIO = 0.75;

// Float animation config - Apple Music style smooth rise
const FLOAT_OFFSET_EM = 0.06; // em units relative to font size

// Smooth easing function for natural float animation
// Based on Apple Music lyrics style - gentle rise as word is sung
function smoothRise(t: number): number {
    // Use smooth cubic easing for natural feel
    // Starts slow, accelerates in middle, slows at end
    return t * t * (3 - 2 * t);
}

// Individual word component with smooth gradient fill animation
const KaraokeWord = memo(({
    word,
    currentTimeMs,
    primaryColor,
    highlightColor,
    fontSize,
    isCurrentLine,
    enableGlow,
    isPseudo = false,
}: {
    word: ILyric.IWordData;
    currentTimeMs: number;
    primaryColor: string;
    highlightColor: string;
    fontSize: number;
    isCurrentLine: boolean;
    enableGlow: boolean;
    isPseudo?: boolean;
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

    // Handle text size measurement
    const handleLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
            setWordSize({ width, height });
        }
    }, []);

    // Calculate gradient locations for smooth edge transition
    const gradientConfig = useMemo(() => {
        // Smoother gradient with wider transition zone
        const edgeStart = Math.max(0, progress - GRADIENT_EDGE_WIDTH);
        const edgeEnd = Math.min(1, progress + GRADIENT_EDGE_WIDTH * 0.5);

        return {
            colors: [
                highlightColor,
                highlightColor,
                'rgba(255, 255, 255, 0.5)',
                'rgba(255, 255, 255, 0.5)',
            ],
            locations: [0, edgeStart, edgeEnd, 1],
        };
    }, [progress, highlightColor]);

    // For non-current lines: simple text with better visibility
    if (!isCurrentLine) {
        return (
            <Text
                style={[
                    styles.wordText,
                    {
                        fontSize,
                        color: primaryColor,
                        opacity: 0.6,
                    },
                ]}
            >
                {text}
                {space ? ' ' : ''}
            </Text>
        );
    }

    // For pending words (not yet started) - slightly brighter than non-current
    if (isPending) {
        return (
            <Text
                onLayout={handleLayout}
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

    // For completed words - full highlight with float up effect (glow only when enabled)
    // Disable float for pseudo word-by-word lyrics
    if (isCompleted) {
        const floatOffset = isPseudo ? 0 : -fontSize * FLOAT_OFFSET_EM;
        return (
            <View style={[styles.wordWrapper, { transform: [{ translateY: floatOffset }] }]}>
                <Text
                    onLayout={handleLayout}
                    style={[
                        styles.wordText,
                        {
                            fontSize,
                            color: highlightColor,
                            opacity: 1,
                            ...(enableGlow ? {
                                textShadowColor: highlightColor,
                                textShadowOffset: { width: 0, height: 0 },
                                textShadowRadius: 6,
                            } : {}),
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
    // Calculate float offset based on progress (smooth rise effect)
    // Disable float for pseudo word-by-word lyrics
    const floatProgress = smoothRise(progress);
    const currentFloatOffset = isPseudo ? 0 : -fontSize * FLOAT_OFFSET_EM * floatProgress;

    // Long duration word has enhanced glow effect (only when glow is enabled)
    const isLongDuration = duration >= LONG_DURATION_MS;
    const glowRadius = isLongDuration ? 18 : 12;
    const glowOpacity = isLongDuration ? 0.5 * progress : 0.3 * progress;

    return (
        <View style={[styles.wordWrapper, { transform: [{ translateY: currentFloatOffset }] }]}>
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

            {/* Enhanced glow effect for long duration words (only when enabled) */}
            {enableGlow && isLongDuration && progress > 0.2 && (
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
    align = "center",
}: {
    text: string;
    progress: number;
    fontSize: number;
    highlightColor: string;
    align?: LyricAlign;
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
        <View style={[
            styles.translationLineContainer,
            { alignItems: align === "left" ? "flex-start" : "center" },
        ]}>
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
    isRomanizationPseudo?: boolean;
    translation?: string;
    translationWords?: ILyric.IWordData[];
    hasTranslationWordByWord?: boolean;
    lyricOrder?: ("original" | "translation" | "romanization")[];
    fontSize: number;
    highlightColor: string;
    index?: number;
    onLayout?: (index: number, height: number) => void;
    enableGlow: boolean;
    align?: LyricAlign;
}

function WordByWordLyricLine({
    words,
    romanizationWords,
    isRomanizationPseudo,
    translation,
    translationWords,
    hasTranslationWordByWord,
    lyricOrder = ["original", "translation", "romanization"],
    fontSize,
    highlightColor,
    index,
    onLayout,
    enableGlow,
    align = "center",
}: IWordByWordLyricProps) {
    const currentPositionMs = useCurrentPositionMs();

    // Start with highlight scale (no animation needed since this component only renders when highlighted)
    const opacity = useSharedValue(1);
    const scale = useSharedValue(HIGHLIGHT_SCALE);

    const animatedContainerStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    // Transform origin based on alignment
    const transformOriginStyle = align === "left" ? { transformOrigin: 'left center' as const } : {};

    // Calculate overall progress for translation following
    const overallProgress = useMemo(() => {
        if (!words?.length) return 0;
        const lineStart = words[0].startTime;
        const lastWord = words[words.length - 1];
        const lineEnd = lastWord.startTime + lastWord.duration;
        if (lineEnd <= lineStart) return 0;
        return Math.min(1, Math.max(0, (currentPositionMs - lineStart) / (lineEnd - lineStart)));
    }, [currentPositionMs, words]);

    // Font size based on order: first line uses full fontSize, others use smaller
    const getLineFontSize = (isFirst: boolean) => isFirst ? fontSize : fontSize * SECONDARY_FONT_RATIO;

    const justifyContent = align === "left" ? "flex-start" : "center";

    // Original line component (word-by-word)
    const originalLine = (isFirst: boolean) => (
        <View style={[lyricStyles.wordByWordLine, { justifyContent }, !isFirst && lyricStyles.secondaryLine]} key="original">
            {words.map((word, wordIndex) => (
                <KaraokeWord
                    key={wordIndex}
                    word={word}
                    currentTimeMs={currentPositionMs}
                    primaryColor="white"
                    highlightColor={highlightColor}
                    fontSize={getLineFontSize(isFirst)}
                    isCurrentLine={true}
                    enableGlow={enableGlow}
                />
            ))}
        </View>
    );

    // Romanization line component
    const romanizationLine = (isFirst: boolean) => romanizationWords && romanizationWords.length > 0 && (
        <View style={[lyricStyles.wordByWordLine, { justifyContent }, !isFirst && lyricStyles.secondaryLine]} key="romanization">
            {romanizationWords.map((word, wordIndex) => (
                <KaraokeWord
                    key={wordIndex}
                    word={word}
                    currentTimeMs={currentPositionMs}
                    primaryColor="white"
                    highlightColor={highlightColor}
                    fontSize={getLineFontSize(isFirst)}
                    isCurrentLine={true}
                    enableGlow={enableGlow}
                    isPseudo={isRomanizationPseudo}
                />
            ))}
        </View>
    );

    // Translation line component - use KaraokeWord when translationWords available
    // Translations always use pseudo word-by-word, so isPseudo is always true
    const translationLine = (isFirst: boolean) => translation && (
        <View style={[!isFirst && lyricStyles.secondaryLine]} key="translation">
            {hasTranslationWordByWord && translationWords && translationWords.length > 0 ? (
                <View style={[lyricStyles.wordByWordLine, { justifyContent }]}>
                    {translationWords.map((word, wordIndex) => (
                        <KaraokeWord
                            key={wordIndex}
                            word={word}
                            currentTimeMs={currentPositionMs}
                            primaryColor="white"
                            highlightColor={highlightColor}
                            fontSize={getLineFontSize(isFirst)}
                            isCurrentLine={true}
                            enableGlow={enableGlow}
                            isPseudo={true}
                        />
                    ))}
                </View>
            ) : (
                <FollowingTranslationLine
                    text={translation}
                    progress={overallProgress}
                    fontSize={getLineFontSize(isFirst)}
                    highlightColor={highlightColor}
                    align={align}
                />
            )}
        </View>
    );

    // Render lines based on order
    const renderLine = (type: string, isFirst: boolean) => {
        switch (type) {
            case "original":
                return originalLine(isFirst);
            case "romanization":
                return romanizationLine(isFirst);
            case "translation":
                return translationLine(isFirst);
            default:
                return null;
        }
    };

    // Determine which lines actually exist
    const existingLines = lyricOrder.filter(type => {
        if (type === "original") return true; // Original always exists
        if (type === "romanization") return romanizationWords && romanizationWords.length > 0;
        if (type === "translation") return translation;
        return false;
    });

    return (
        <Animated.View
            onLayout={({ nativeEvent }) => {
                if (index !== undefined) {
                    onLayout?.(index, nativeEvent.layout.height);
                }
            }}
            style={[
                lyricStyles.multiLineContainer,
                { alignItems: align === "left" ? "flex-start" : "center" },
                transformOriginStyle,
                animatedContainerStyle,
            ]}
        >
            {/* Render lines in configured order, first existing line gets large font */}
            {lyricOrder.map((type, idx) => {
                const isFirstExisting = existingLines.indexOf(type) === 0;
                return renderLine(type, isFirstExisting);
            })}
        </Animated.View>
    );
}

// Regular lyric line - with scale animation for highlighted line
function RegularLyricLine({
    text,
    fontSize,
    highlight,
    light,
    index,
    onLayout,
    primaryColor,
    align = "center",
}: {
    text: string;
    fontSize: number;
    highlight: boolean;
    light: boolean;
    index?: number;
    onLayout?: (index: number, height: number) => void;
    primaryColor: string;
    align?: LyricAlign;
}) {
    const textOpacity = useSharedValue(highlight ? 0.6 : 0.6);
    const textScale = useSharedValue(highlight ? 1 : 1);

    useEffect(() => {
        if (highlight) {
            textOpacity.value = withTiming(1, { duration: 280 });
            textScale.value = withTiming(HIGHLIGHT_SCALE, SCALE_TIMING_CONFIG);
        } else {
            textOpacity.value = withTiming(0.6, { duration: 280 });
            textScale.value = withTiming(1, SCALE_TIMING_CONFIG);
        }
    }, [highlight]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: textOpacity.value,
        transform: [{ scale: textScale.value }],
    }));

    // Transform origin based on alignment
    const transformOriginStyle = align === "left" ? { transformOrigin: 'left center' as const } : {};

    return (
        <Animated.Text
            onLayout={({ nativeEvent }) => {
                if (index !== undefined) {
                    onLayout?.(index, nativeEvent.layout.height);
                }
            }}
            style={[
                lyricStyles.item,
                { fontSize, textAlign: align },
                transformOriginStyle,
                animatedStyle,
                highlight ? [lyricStyles.highlightItem, { color: primaryColor }] : null,
                light ? lyricStyles.draggingItem : null,
            ]}
        >
            {text}
        </Animated.Text>
    );
}

// Multi-line regular lyric with font size based on order and scale animation
function MultiLineRegularLyric({
    text,
    romanizationText,
    translation,
    lyricOrder = ["original", "translation", "romanization"],
    fontSize,
    highlight,
    light,
    primaryColor,
    index,
    onLayout,
    align = "center",
}: {
    text: string;
    romanizationText?: string;
    translation?: string;
    lyricOrder?: ("original" | "translation" | "romanization")[];
    fontSize: number;
    highlight: boolean;
    light: boolean;
    primaryColor: string;
    index?: number;
    onLayout?: (index: number, height: number) => void;
    align?: LyricAlign;
}) {
    // Scale animation for highlight effect
    const containerScale = useSharedValue(highlight ? 1 : 1);
    const containerOpacity = useSharedValue(highlight ? 0.6 : 0.6);

    useEffect(() => {
        if (highlight) {
            containerScale.value = withTiming(HIGHLIGHT_SCALE, SCALE_TIMING_CONFIG);
            containerOpacity.value = withTiming(1, { duration: 280 });
        } else {
            containerScale.value = withTiming(1, SCALE_TIMING_CONFIG);
            containerOpacity.value = withTiming(0.6, { duration: 280 });
        }
    }, [highlight]);

    const animatedContainerStyle = useAnimatedStyle(() => ({
        transform: [{ scale: containerScale.value }],
        opacity: containerOpacity.value,
    }));

    // Transform origin based on alignment
    const transformOriginStyle = align === "left" ? { transformOrigin: 'left center' as const } : {};

    // Font size based on order: first line uses full fontSize, others use smaller
    const getLineFontSize = (isFirst: boolean) => isFirst ? fontSize : fontSize * SECONDARY_FONT_RATIO;

    const textAlign = align;

    // Get style based on highlight state
    const getLineStyle = (isFirst: boolean) => [
        lyricStyles.compactItem,
        { fontSize: getLineFontSize(isFirst), textAlign },
        !isFirst && lyricStyles.secondaryLine,
        highlight && [lyricStyles.highlightItem, { color: primaryColor }],
        light && lyricStyles.draggingItem,
    ];

    // Original line component (use compactItem for tight spacing within group)
    const originalLine = (isFirst: boolean) => text && (
        <Text key="original" style={getLineStyle(isFirst)}>
            {text}
        </Text>
    );

    // Romanization line component
    const romanizationLine = (isFirst: boolean) => romanizationText && (
        <Text key="romanization" style={getLineStyle(isFirst)}>
            {romanizationText}
        </Text>
    );

    // Translation line component
    const translationLine = (isFirst: boolean) => translation && (
        <Text key="translation" style={getLineStyle(isFirst)}>
            {translation}
        </Text>
    );

    // Render line based on type
    const renderLine = (type: string, isFirst: boolean) => {
        switch (type) {
            case "original":
                return originalLine(isFirst);
            case "romanization":
                return romanizationLine(isFirst);
            case "translation":
                return translationLine(isFirst);
            default:
                return null;
        }
    };

    // Determine which lines actually exist
    const existingLines = lyricOrder.filter(type => {
        if (type === "original") return !!text;
        if (type === "romanization") return !!romanizationText;
        if (type === "translation") return !!translation;
        return false;
    });

    return (
        <Animated.View
            onLayout={({ nativeEvent }) => {
                if (index !== undefined) {
                    onLayout?.(index, nativeEvent.layout.height);
                }
            }}
            style={[
                lyricStyles.multiLineContainer,
                { alignItems: align === "left" ? "flex-start" : "center" },
                transformOriginStyle,
                animatedContainerStyle,
            ]}
        >
            {/* Render lines in configured order, first existing line gets large font */}
            {lyricOrder.map((type, idx) => {
                const isFirstExisting = existingLines.indexOf(type) === 0;
                return renderLine(type, isFirstExisting);
            })}
        </Animated.View>
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
        romanization,
        hasRomanizationWordByWord,
        isRomanizationPseudo,
        translation,
        translationWords,
        hasTranslationWordByWord,
        lyricOrder,
        align,
    } = props;

    const colors = useColors();
    const actualFontSize = fontSize || fontSizeConst.content;
    const enableGlow = useAppConfig("lyric.enableWordByWordGlow") ?? false;

    // Check if lyric text is empty (empty string or only whitespace)
    const isEmptyLyric = !text || text.trim() === '';

    // Render breathing dots for empty lyric lines
    if (isEmptyLyric) {
        return (
            <View
                onLayout={({ nativeEvent }) => {
                    if (index !== undefined) {
                        onLayout?.(index, nativeEvent.layout.height);
                    }
                }}
                style={[
                    lyricStyles.multiLineContainer,
                    { alignItems: align === "left" ? "flex-start" : "center" },
                ]}
            >
                <BreathingDots
                    color={colors.primary}
                    align={align}
                    highlight={!!highlight}
                />
            </View>
        );
    }

    // Render karaoke-style word-by-word lyrics for highlighted lines
    if (highlight && hasWordByWord && words && words.length > 0) {
        return (
            <WordByWordLyricLine
                words={words}
                romanizationWords={hasRomanizationWordByWord ? romanizationWords : undefined}
                isRomanizationPseudo={isRomanizationPseudo}
                translation={translation}
                translationWords={hasTranslationWordByWord ? translationWords : undefined}
                hasTranslationWordByWord={hasTranslationWordByWord}
                lyricOrder={lyricOrder}
                fontSize={actualFontSize}
                highlightColor={colors.primary}
                index={index}
                onLayout={onLayout}
                enableGlow={enableGlow}
                align={align}
            />
        );
    }

    // Check if we have multi-line content (translation or romanization)
    const hasMultiLine = !!(translation || romanization);

    // Use multi-line component for lines with multi-line content
    if (hasMultiLine) {
        return (
            <MultiLineRegularLyric
                text={text || ''}
                romanizationText={romanization}
                translation={translation}
                lyricOrder={lyricOrder}
                fontSize={actualFontSize}
                highlight={!!highlight}
                light={!!light}
                primaryColor={colors.primary}
                index={index}
                onLayout={onLayout}
                align={align}
            />
        );
    }

    // Single line regular lyric rendering
    return (
        <RegularLyricLine
            text={text || ''}
            fontSize={actualFontSize}
            highlight={!!highlight}
            light={!!light}
            index={index}
            onLayout={onLayout}
            primaryColor={colors.primary}
            align={align}
        />
    );
}

const arraysEqual = (a?: any[], b?: any[]) => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

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
        prev.isRomanizationPseudo === curr.isRomanizationPseudo &&
        prev.hasTranslationWordByWord === curr.hasTranslationWordByWord &&
        prev.romanization === curr.romanization &&
        prev.translation === curr.translation &&
        prev.align === curr.align &&
        arraysEqual(prev.lyricOrder, curr.lyricOrder),
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
    // Compact item for multi-line groups (no padding, container handles it)
    compactItem: {
        color: "white",
        opacity: 0.6,
        width: "100%",
        textAlign: "center",
        textAlignVertical: "center",
    },
    multiLineContainer: {
        flexDirection: 'column',
        alignItems: 'center',
        paddingHorizontal: rpx(64),
        paddingVertical: rpx(24),
        width: "100%",
    },
    wordByWordLine: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
    },
    secondaryLine: {
        marginTop: rpx(8),
    },
    draggingItem: {
        opacity: 0.9,
        color: "white",
    },
});

const dotsStyles = StyleSheet.create({
    container: {
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: rpx(12),
    },
    dotsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
});
