import React, { memo, useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withRepeat,
    useDerivedValue,
    Easing,
    interpolate,
    interpolateColor,
    type SharedValue,
} from "react-native-reanimated";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import { fontSizeConst } from "@/constants/uiConst";
import { currentPositionMsShared } from "@/core/lyricManager";
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
const DOTS_ROW_WIDTH = DOTS_CONFIG.number * DOTS_CONFIG.size + (DOTS_CONFIG.number - 1) * DOTS_CONFIG.margin;

// Breathing dots component for empty lyric lines
export const BreathingDots = memo(({
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
        const finalScale = highlight ? scale * HIGHLIGHT_SCALE : scale;
        const translateX = align === "left" ? (DOTS_ROW_WIDTH * (finalScale - 1)) / 2 : 0;
        return {
            transform: [
                { scale: finalScale },
                { translateX },
            ],
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

// Scale factor for highlighted line (1 = no scale)
const HIGHLIGHT_SCALE = 1;

// Gradient edge width for smooth transition (percentage)
const GRADIENT_EDGE_WIDTH = 0.12;

// Font size ratio for secondary lines (smaller than primary/first line)
const SECONDARY_FONT_RATIO = 0.75;

// Wave animation config — Apple Music-style progressive wave float
// Subtle breathing motion: chars gently rise and settle like a soft wave washing over text.
// The effect should be barely perceptible — felt more than seen.

// Duration range for dynamic amplitude calculation (ms)
const WAVE_DURATION_MIN = 100;
const WAVE_DURATION_MAX = 800;
// Max upward offset in em units — visible but not exaggerated
const WAVE_MAX_TRANSLATE_EM = 0.14;

// Wide asymmetric radii spread the motion across more chars, making it feel fluid rather than jumpy
const WAVE_LEAD_RADIUS = 3;    // chars ahead: gentle anticipation
const WAVE_TRAIL_RADIUS = 6;   // chars behind: long graceful settle

// Active char micro-scale — subtle pop effect
const ACTIVE_CHAR_SCALE = 1.06;
// Scale wave radii (tighter than translate wave for focused effect)
const SCALE_WAVE_LEAD = 2;
const SCALE_WAVE_TRAIL = 3;

// Color sweep gradient edge width (in character units).
// Controls how many chars the color transition spans — larger = softer edge.
const COLOR_SWEEP_EDGE = 2.5;

// Normalize word space flags to prevent double spaces.
// Handles two redundancy patterns in lyric data:
// 1. word.text ends with ' ' AND word.space=true → clear space flag
// 2. word.space=true AND next word.text starts with ' ' → clear space flag
function normalizeWordSpaces(words: ILyric.IWordData[]): ILyric.IWordData[] {
    return words.map((word, i) => {
        if (!word.space) return word;
        const nextWord = words[i + 1];
        if (word.text.endsWith(' ') || (nextWord && nextWord.text.startsWith(' '))) {
            return { ...word, space: false };
        }
        return word;
    });
}

// Split a multi-character word into per-character sub-words with evenly distributed timing.
// Chinese/Japanese single chars pass through unchanged. English words like "Hello" (500ms)
// become H(100ms) e(100ms) l(100ms) l(100ms) o(100ms) — each letter animates independently.
function splitWordToChars(word: ILyric.IWordData): ILyric.IWordData[] {
    const { text, startTime, duration, space } = word;
    // Single char or empty: no split needed
    if (text.length <= 1) return [word];

    const chars = [...text]; // handle unicode properly
    const charCount = chars.length;
    const durationPerChar = duration / charCount;

    return chars.map((char, i) => ({
        text: char,
        startTime: startTime + i * durationPerChar,
        duration: durationPerChar,
        // Only the last char inherits the trailing space
        space: i === charCount - 1 ? space : false,
    }));
}

// Line-level active state tracking hook.
// Computes activeCharIndex + activeCharProgress from a flat timing array using ONE useDerivedValue.
// Each KaraokeWord compares its flat index to activeCharIndex — only the active char reads activeCharProgress.
// Reanimated's dependency tracking ensures completed/pending chars' worklets DON'T re-evaluate per frame.
// Result: ~400 worklet evals/frame → ~5 worklet evals/frame (80x improvement).
function useLineActiveState(flatTimings: { startTime: number; endTime: number }[]) {
    const activeCharIndex = useSharedValue(-1);
    const activeCharProgress = useSharedValue(0);

    useDerivedValue(() => {
        'worklet';
        const t = currentPositionMsShared.value;
        const len = flatTimings.length;

        // Fast path: before first char
        if (len === 0 || t <= flatTimings[0].startTime) {
            activeCharIndex.value = -1;
            activeCharProgress.value = 0;
            return;
        }

        // Fast path: after last char
        const last = flatTimings[len - 1];
        if (t >= last.endTime) {
            activeCharIndex.value = len;
            activeCharProgress.value = 1;
            return;
        }

        // Binary search for active char
        let lo = 0, hi = len - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            if (t < flatTimings[mid].startTime) {
                hi = mid - 1;
            } else if (t >= flatTimings[mid].endTime) {
                lo = mid + 1;
            } else {
                // Found active char
                const timing = flatTimings[mid];
                const dur = timing.endTime - timing.startTime;
                activeCharIndex.value = mid;
                activeCharProgress.value = dur > 0
                    ? Math.min(1, Math.max(0, (t - timing.startTime) / dur))
                    : 1;
                return;
            }
        }

        // Between chars (gap) — snap to the completed side
        activeCharIndex.value = lo;
        activeCharProgress.value = 0;
    }, [flatTimings]);

    return { activeCharIndex, activeCharProgress };
}

// Build flat timing array from normalized words (after splitWordToChars).
// Returns a stable array of {startTime, endTime} for each character in order.
function buildFlatTimings(words: ILyric.IWordData[]): { startTime: number; endTime: number }[] {
    const result: { startTime: number; endTime: number }[] = [];
    for (const word of words) {
        const chars = splitWordToChars(word);
        for (const c of chars) {
            result.push({ startTime: c.startTime, endTime: c.startTime + c.duration });
        }
    }
    return result;
}

// Wrapper: renders a word as multiple per-character KaraokeWords for true per-letter animation
const KaraokeWordSplit = memo(({
    word,
    primaryColor,
    highlightColor,
    fontSize,
    isCurrentLine,
    enableFloat = true,
    isPseudo = false,
    noSpace = false,
    charFlatOffset,
    activeCharIndex,
    activeCharProgress,
}: {
    word: ILyric.IWordData;
    primaryColor: string;
    highlightColor: string;
    fontSize: number;
    isCurrentLine: boolean;
    enableFloat?: boolean;
    isPseudo?: boolean;
    noSpace?: boolean;
    charFlatOffset: number;
    activeCharIndex: SharedValue<number>;
    activeCharProgress: SharedValue<number>;
}) => {
    const subWords = useMemo(() => splitWordToChars(word), [word]);

    // Single char (Chinese etc.) — render directly, no extra wrapper
    if (subWords.length === 1) {
        return (
            <KaraokeWord
                word={subWords[0]}
                primaryColor={primaryColor}
                highlightColor={highlightColor}
                fontSize={fontSize}
                isCurrentLine={isCurrentLine}
                enableFloat={enableFloat}

                isPseudo={isPseudo}
                noSpace={noSpace}
                charFlatIndex={charFlatOffset}
                activeCharIndex={activeCharIndex}
                activeCharProgress={activeCharProgress}
            />
        );
    }

    // Multi-char: render each letter as independent KaraokeWord in a row
    const groupTrailingSpace = !noSpace && word.space ? ' ' : '';
    return (
        <View style={lyricStyles.charGroupRow}>
            {subWords.map((charWord, i) => (
                <KaraokeWord
                    key={i}
                    word={charWord}
                    primaryColor={primaryColor}
                    highlightColor={highlightColor}
                    fontSize={fontSize}
                    isCurrentLine={isCurrentLine}
                    enableFloat={enableFloat}
    
                    isPseudo={isPseudo}
                    noSpace={true}
                    charFlatIndex={charFlatOffset + i}
                    activeCharIndex={activeCharIndex}
                    activeCharProgress={activeCharProgress}
                />
            ))}
            {groupTrailingSpace ? (
                <Text style={{ fontSize, color: 'transparent' }}>{' '}</Text>
            ) : null}
        </View>
    );
});

// Individual word component with smooth native-driven animation.
// PERFORMANCE: Uses line-level activeCharIndex/activeCharProgress instead of reading currentPositionMsShared directly.
// Only the ACTIVE character's worklets read activeCharProgress (changes every frame).
// Completed/pending characters use index comparison only (changes infrequently) — their worklets skip re-evaluation.
//
// WAVE ANIMATION (Apple Music-style):
// Instead of only the active char rising, we compute a "wave influence" based on distance to the active char.
// Chars within WAVE_RADIUS of the active index are pulled up proportionally (cosine falloff),
// creating a smooth traveling wave that propagates across the line as playback advances.
const KaraokeWord = memo(({
    word,
    primaryColor,
    highlightColor,
    fontSize,
    isCurrentLine,
    enableFloat = true,
    isPseudo = false,
    noSpace = false,
    charFlatIndex,
    activeCharIndex,
    activeCharProgress,
}: {
    word: ILyric.IWordData;
    primaryColor: string;
    highlightColor: string;
    fontSize: number;
    isCurrentLine: boolean;
    enableFloat?: boolean;
    isPseudo?: boolean;
    noSpace?: boolean;
    charFlatIndex: number;
    activeCharIndex: SharedValue<number>;
    activeCharProgress: SharedValue<number>;
}) => {
    const { duration, text, space } = word;

    // Trailing space as text (matches non-playing line text wrapping)
    const trailingSpace = !noSpace && space ? ' ' : '';

    // Wave amplitude pre-computed once (based on char duration)
    const maxWaveTranslate = useMemo(() => {
        if (isPseudo) return 0;
        const clamped = Math.max(WAVE_DURATION_MIN, Math.min(duration, WAVE_DURATION_MAX));
        const factor = (clamped - WAVE_DURATION_MIN) / (WAVE_DURATION_MAX - WAVE_DURATION_MIN);
        return -fontSize * WAVE_MAX_TRANSLATE_EM * factor;
    }, [duration, fontSize, isPseudo]);

    // Smooth color sweep progress — instead of hard 0/1 per-char switching,
    // chars near the active position get a gradient transition based on distance.
    // This creates a smooth "light wave" sweeping across the line like the original width-clip,
    // but rendered per-character with color interpolation.
    const animatedProgress = useDerivedValue(() => {
        'worklet';
        if (!isCurrentLine) return 0;

        const idx = activeCharIndex.value;
        const progress = activeCharProgress.value;
        const waveCenter = idx + progress;

        // Distance from this char to the sweep front
        const dist = charFlatIndex - waveCenter;

        if (dist <= -COLOR_SWEEP_EDGE) return 1;   // fully completed (behind the edge)
        if (dist >= 0) return 0;                     // fully pending (ahead of sweep)

        // Within the gradient edge: smooth transition
        // dist is in range [-COLOR_SWEEP_EDGE, 0), map to [1, 0]
        const t = -dist / COLOR_SWEEP_EDGE;          // 0 at front → 1 at back
        return t * t * (3 - 2 * t);                  // smoothstep for soft edge
    }, [isCurrentLine, charFlatIndex]);

    // Wave float style + scale wave — continuous asymmetric bell curve.
    // The wave is ONE smooth curve peaking at the active char. Asymmetry comes solely from
    // different radii (leading=shorter, trailing=longer), NOT from amplitude scaling.
    //
    // PERFORMANCE: First reads activeCharIndex (changes infrequently). Only chars within the
    // wide asymmetric radius proceed to read activeCharProgress. Far chars exit early.
    const floatStyle = useAnimatedStyle(() => {
        'worklet';
        if (!enableFloat || isPseudo || !isCurrentLine) return {};

        const idx = activeCharIndex.value;

        // Fast exit: chars far from active index don't read activeCharProgress at all.
        const maxRadius = Math.max(WAVE_LEAD_RADIUS, SCALE_WAVE_LEAD) + 1;
        const maxTrail = Math.max(WAVE_TRAIL_RADIUS, SCALE_WAVE_TRAIL) + 1;
        const intDist = charFlatIndex - idx;
        if (intDist > maxRadius || intDist < -maxTrail) {
            return { transform: [{ translateY: 0 }, { scale: 1 }] };
        }

        const progress = activeCharProgress.value;
        const waveCenter = idx + progress;
        const dist = charFlatIndex - waveCenter;

        // --- translateY wave (enhanced amplitude) ---
        let translateY = 0;
        const tRadius = dist >= 0 ? WAVE_LEAD_RADIUS : WAVE_TRAIL_RADIUS;
        const tAbsDist = dist >= 0 ? dist : -dist;
        if (tAbsDist < tRadius) {
            const t = 1 - tAbsDist / tRadius;
            translateY = maxWaveTranslate * t * t * (3 - 2 * t);
        }

        // --- scale wave (tighter radii for focused pop) ---
        let scale = 1;
        const sRadius = dist >= 0 ? SCALE_WAVE_LEAD : SCALE_WAVE_TRAIL;
        const sAbsDist = dist >= 0 ? dist : -dist;
        if (sAbsDist < sRadius) {
            const s = 1 - sAbsDist / sRadius;
            const influence = s * s * (3 - 2 * s);
            scale = 1 + (ACTIVE_CHAR_SCALE - 1) * influence;
        }

        return {
            transform: [{ translateY }, { scale }],
        };
    }, [enableFloat, isPseudo, isCurrentLine, charFlatIndex, maxWaveTranslate]);

    // Per-character color + opacity interpolation (replaces width-clip overlay)
    const charStyle = useAnimatedStyle(() => {
        'worklet';
        const progress = animatedProgress.value;

        // Color interpolation: base → highlight
        const color = interpolateColor(
            progress,
            [0, 1],
            [primaryColor, highlightColor],
        );

        // Opacity gradient: dim → bright
        const opacity = interpolate(
            progress,
            [0, 0.3, 1],
            [0.5, 0.75, 0.95],
        );

        return { color, opacity };
    }, [primaryColor, highlightColor]);

    // For non-current lines: same View wrapper structure for consistent flex layout
    if (!isCurrentLine) {
        return (
            <View style={styles.wordWrapper}>
                <Text
                    style={[
                        styles.wordText,
                        { fontSize, color: primaryColor, opacity: 0.5 },
                    ]}
                >
                    {text}{trailingSpace}
                </Text>
            </View>
        );
    }

    // Single Animated.Text — color driven by worklet (no dual-layer overlay)
    return (
        <Animated.View style={[styles.wordWrapper, floatStyle]}>
            <Animated.Text
                style={[
                    styles.wordText,
                    { fontSize },
                    charStyle,
                ]}
            >
                {text}{trailingSpace}
            </Animated.Text>
        </Animated.View>
    );
});

// Translation line with smooth native-driven animation
// Reads currentPositionMsShared directly for zero-JS-overhead progress tracking
const FollowingTranslationLine = memo(({
    text,
    lineStart,
    lineDuration,
    fontSize,
    highlightColor,
    align = "center",
}: {
    text: string;
    lineStart: number;
    lineDuration: number;
    fontSize: number;
    highlightColor: string;
    align?: LyricAlign;
}) => {
    // Animated style for color + opacity interpolation — derived from SharedValue on UI thread
    const overlayStyle = useAnimatedStyle(() => {
        'worklet';
        if (lineDuration <= 0) return { opacity: 0 };
        const t = currentPositionMsShared.value;
        const progress = Math.min(1, Math.max(0, (t - lineStart) / lineDuration));

        const color = interpolateColor(
            progress,
            [0, 1],
            ['white', highlightColor],
        );
        const opacity = interpolate(
            progress,
            [0, 0.1, 1],
            [0.35, 0.5, 0.95],
        );

        return { color, opacity };
    }, [lineStart, lineDuration, highlightColor]);

    return (
        <View style={[
            styles.translationLineContainer,
            { alignItems: align === "left" ? "flex-start" : "center" },
        ]}>
            <Animated.Text
                style={[
                    styles.wordText,
                    { fontSize },
                    overlayStyle,
                ]}
            >
                {text}
            </Animated.Text>
        </View>
    );
});

// Static word-by-word layout for non-current lines.
// Uses identical View + flexWrap structure as WordByWordLyricLine
// but does NOT subscribe to useCurrentPositionMs() — zero per-frame cost.
function StaticWordByWordLine({
    words,
    romanizationWords,
    isRomanizationPseudo,
    translation,
    lyricOrder = ["romanization", "original", "translation"],
    fontSize,
    index,
    onLayout,
    align = "center",
}: {
    words: ILyric.IWordData[];
    romanizationWords?: ILyric.IWordData[];
    isRomanizationPseudo?: boolean;
    translation?: string;
    lyricOrder?: ("original" | "translation" | "romanization")[];
    fontSize: number;
    index?: number;
    onLayout?: (index: number, height: number) => void;
    align?: LyricAlign;
}) {
    const getLineFontSize = (isFirst: boolean) => isFirst ? fontSize : fontSize * SECONDARY_FONT_RATIO;
    const justifyContent = align === "left" ? "flex-start" as const : "center" as const;

    // Render a static word row using IDENTICAL View structure as the playing line
    // (View + flexWrap with per-word/per-char Views) to guarantee identical line-breaking.
    // Only difference: no animated wrappers, static opacity.
    const renderWordRow = (wordList: ILyric.IWordData[], lineFontSize: number, isFirst: boolean, key: string, noSpace?: boolean) => {
        const normalized = normalizeWordSpaces(wordList);
        return (
            <View style={[lyricStyles.wordByWordLine, { justifyContent }, !isFirst && lyricStyles.secondaryLine]} key={key}>
                {normalized.map((word, i) => {
                    const subWords = splitWordToChars(word);
                    // Single char — same as KaraokeWord non-current path
                    if (subWords.length === 1) {
                        const sw = subWords[0];
                        const trailing = !noSpace && sw.space ? ' ' : '';
                        return (
                            <View style={styles.wordWrapper} key={i}>
                                <Text style={[styles.wordText, { fontSize: lineFontSize, color: 'white' }]}>
                                    {sw.text}{trailing}
                                </Text>
                            </View>
                        );
                    }
                    // Multi-char — same charGroupRow + per-char Views as KaraokeWordSplit
                    const groupTrailingSpace = !noSpace && word.space ? ' ' : '';
                    return (
                        <View style={lyricStyles.charGroupRow} key={i}>
                            {subWords.map((sw, ci) => (
                                <View style={styles.wordWrapper} key={ci}>
                                    <Text style={[styles.wordText, { fontSize: lineFontSize, color: 'white' }]}>
                                        {sw.text}
                                    </Text>
                                </View>
                            ))}
                            {groupTrailingSpace ? (
                                <Text style={{ fontSize: lineFontSize, color: 'transparent' }}>{' '}</Text>
                            ) : null}
                        </View>
                    );
                })}
            </View>
        );
    };

    const existingLines = lyricOrder.filter(type => {
        if (type === "original") return true;
        if (type === "romanization") return romanizationWords && romanizationWords.length > 0;
        if (type === "translation") return !!translation;
        return false;
    });

    const renderLine = (type: string, isFirst: boolean) => {
        switch (type) {
            case "original":
                return renderWordRow(words, getLineFontSize(isFirst), isFirst, "original");
            case "romanization":
                return romanizationWords && romanizationWords.length > 0
                    ? renderWordRow(romanizationWords, getLineFontSize(isFirst), isFirst, "romanization", isRomanizationPseudo)
                    : null;
            case "translation":
                return translation ? (
                    <Text
                        key="translation"
                        style={[
                            lyricStyles.compactItem,
                            { fontSize: getLineFontSize(isFirst), textAlign: align },
                            !isFirst && lyricStyles.secondaryLine,
                        ]}
                    >
                        {translation}
                    </Text>
                ) : null;
            default:
                return null;
        }
    };

    return (
        <View
            onLayout={({ nativeEvent }) => {
                if (index !== undefined) {
                    onLayout?.(index, nativeEvent.layout.height);
                }
            }}
            style={[
                lyricStyles.multiLineContainer,
                { alignItems: align === "left" ? "flex-start" : "center", opacity: 0.5 },
            ]}
        >
            {lyricOrder.map((type) => {
                const isFirstExisting = existingLines.indexOf(type) === 0;
                return renderLine(type, isFirstExisting);
            })}
        </View>
    );
}

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
    enableFloat?: boolean;
    align?: LyricAlign;
    isCurrentLine?: boolean;
}

function WordByWordLyricLine({
    words,
    romanizationWords,
    isRomanizationPseudo,
    translation,
    translationWords,
    hasTranslationWordByWord,
    lyricOrder = ["romanization", "original", "translation"],
    fontSize,
    highlightColor,
    index,
    onLayout,
    enableFloat = true,
    align = "center",
    isCurrentLine = true,
}: IWordByWordLyricProps) {
    // Normalize space flags to prevent double spaces in all word lists
    const normalizedWords = useMemo(() => normalizeWordSpaces(words), [words]);
    const normalizedRomanizationWords = useMemo(
        () => romanizationWords ? normalizeWordSpaces(romanizationWords) : undefined,
        [romanizationWords],
    );
    const normalizedTranslationWords = useMemo(
        () => translationWords ? normalizeWordSpaces(translationWords) : undefined,
        [translationWords],
    );

    // Build flat timing arrays and char offset maps for each word list
    const originalFlatTimings = useMemo(() => buildFlatTimings(normalizedWords), [normalizedWords]);
    const romanizationFlatTimings = useMemo(
        () => normalizedRomanizationWords ? buildFlatTimings(normalizedRomanizationWords) : [],
        [normalizedRomanizationWords],
    );
    const translationFlatTimings = useMemo(
        () => normalizedTranslationWords ? buildFlatTimings(normalizedTranslationWords) : [],
        [normalizedTranslationWords],
    );

    // Compute per-word char offsets (cumulative char count before each word)
    const originalCharOffsets = useMemo(() => {
        const offsets: number[] = [];
        let acc = 0;
        for (const w of normalizedWords) {
            offsets.push(acc);
            acc += splitWordToChars(w).length;
        }
        return offsets;
    }, [normalizedWords]);

    const romanizationCharOffsets = useMemo(() => {
        if (!normalizedRomanizationWords) return [];
        const offsets: number[] = [];
        let acc = 0;
        for (const w of normalizedRomanizationWords) {
            offsets.push(acc);
            acc += splitWordToChars(w).length;
        }
        return offsets;
    }, [normalizedRomanizationWords]);

    const translationCharOffsets = useMemo(() => {
        if (!normalizedTranslationWords) return [];
        const offsets: number[] = [];
        let acc = 0;
        for (const w of normalizedTranslationWords) {
            offsets.push(acc);
            acc += splitWordToChars(w).length;
        }
        return offsets;
    }, [normalizedTranslationWords]);

    // Line-level active state tracking — ONE useDerivedValue per word list reads currentPositionMsShared
    const originalActive = useLineActiveState(originalFlatTimings);
    const romanizationActive = useLineActiveState(romanizationFlatTimings);
    const translationActive = useLineActiveState(translationFlatTimings);

    // Line timing for translation progress (passed to FollowingTranslationLine)
    const lineStart = normalizedWords?.[0]?.startTime ?? 0;
    const lastWord = normalizedWords?.[normalizedWords.length - 1];
    const lineEnd = lastWord ? lastWord.startTime + lastWord.duration : 0;
    const lineDuration = lineEnd - lineStart;

    // Font size based on order: first line uses full fontSize, others use smaller
    const getLineFontSize = (isFirst: boolean) => isFirst ? fontSize : fontSize * SECONDARY_FONT_RATIO;
    const justifyContent = align === "left" ? "flex-start" as const : "center" as const;

    // Original line component (word-by-word)
    const originalLine = (isFirst: boolean) => (
        <View style={[lyricStyles.wordByWordLine, { justifyContent }, !isFirst && lyricStyles.secondaryLine]} key="original">
            {normalizedWords.map((word, wordIndex) => (
                <KaraokeWordSplit
                    key={wordIndex}
                    word={word}
                    primaryColor="white"
                    highlightColor={highlightColor}
                    fontSize={getLineFontSize(isFirst)}
                    isCurrentLine={isCurrentLine}
                    enableFloat={enableFloat}
    
                    charFlatOffset={originalCharOffsets[wordIndex]}
                    activeCharIndex={originalActive.activeCharIndex}
                    activeCharProgress={originalActive.activeCharProgress}
                />
            ))}
        </View>
    );

    // Romanization line component
    const romanizationLine = (isFirst: boolean) => normalizedRomanizationWords && normalizedRomanizationWords.length > 0 && (
        <View style={[lyricStyles.wordByWordLine, { justifyContent }, !isFirst && lyricStyles.secondaryLine]} key="romanization">
            {normalizedRomanizationWords.map((word, wordIndex) => (
                <KaraokeWordSplit
                    key={wordIndex}
                    word={word}
                    primaryColor="white"
                    highlightColor={highlightColor}
                    fontSize={getLineFontSize(isFirst)}
                    isCurrentLine={isCurrentLine}
                    enableFloat={enableFloat}
    
                    isPseudo={isRomanizationPseudo}
                    noSpace={true}
                    charFlatOffset={romanizationCharOffsets[wordIndex]}
                    activeCharIndex={romanizationActive.activeCharIndex}
                    activeCharProgress={romanizationActive.activeCharProgress}
                />
            ))}
        </View>
    );

    // Translation line component
    const translationLine = (isFirst: boolean) => translation && (
        <View style={[{ width: '100%' }, !isFirst && lyricStyles.secondaryLine]} key="translation">
            {hasTranslationWordByWord && normalizedTranslationWords && normalizedTranslationWords.length > 0 ? (
                <View style={[lyricStyles.wordByWordLine, { justifyContent }]}>
                    {normalizedTranslationWords.map((word, wordIndex) => (
                        <KaraokeWordSplit
                            key={wordIndex}
                            word={word}
                            primaryColor="white"
                            highlightColor={highlightColor}
                            fontSize={getLineFontSize(isFirst)}
                            isCurrentLine={isCurrentLine}
                            enableFloat={enableFloat}
            
                            isPseudo={true}
                            charFlatOffset={translationCharOffsets[wordIndex]}
                            activeCharIndex={translationActive.activeCharIndex}
                            activeCharProgress={translationActive.activeCharProgress}
                        />
                    ))}
                </View>
            ) : (
                <FollowingTranslationLine
                    text={translation}
                    lineStart={lineStart}
                    lineDuration={lineDuration}
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
            {/* Render lines in configured order, first existing line gets large font */}
            {lyricOrder.map((type, idx) => {
                const isFirstExisting = existingLines.indexOf(type) === 0;
                return renderLine(type, isFirstExisting);
            })}
        </View>
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
    const textOpacity = useSharedValue(highlight ? 0.5 : 0.5);
    const textScale = useSharedValue(highlight ? 1 : 1);

    useEffect(() => {
        if (highlight) {
            textOpacity.value = withTiming(1, { duration: 280 });
            textScale.value = withTiming(HIGHLIGHT_SCALE, SCALE_TIMING_CONFIG);
        } else {
            textOpacity.value = withTiming(0.5, { duration: 280 });
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
    romanizationWords,
    translation,
    lyricOrder = ["romanization", "original", "translation"],
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
    romanizationWords?: ILyric.IWordData[];
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
    const containerOpacity = useSharedValue(highlight ? 0.5 : 0.5);

    useEffect(() => {
        if (highlight) {
            containerScale.value = withTiming(HIGHLIGHT_SCALE, SCALE_TIMING_CONFIG);
            containerOpacity.value = withTiming(1, { duration: 280 });
        } else {
            containerScale.value = withTiming(1, SCALE_TIMING_CONFIG);
            containerOpacity.value = withTiming(0.5, { duration: 280 });
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

    // Romanization line component - use flex layout when words available for consistent spacing
    const justifyContent = align === "left" ? "flex-start" : "center";
    const romanizationLine = (isFirst: boolean) => {
        if (!romanizationText && (!romanizationWords || romanizationWords.length === 0)) return null;

        // Use word-by-word flex layout to match highlighted line spacing
        if (romanizationWords && romanizationWords.length > 0) {
            return (
                <View
                    key="romanization"
                    style={[
                        lyricStyles.wordByWordLine,
                        { justifyContent },
                        !isFirst && lyricStyles.secondaryLine,
                    ]}
                >
                    {romanizationWords.map((word, wordIndex) => (
                        <Text
                            key={wordIndex}
                            style={[
                                styles.wordText,
                                {
                                    fontSize: getLineFontSize(isFirst),
                                    color: highlight ? primaryColor : 'white',
                                    opacity: highlight ? 1 : 0.5,
                                },
                                highlight && lyricStyles.highlightItem,
                                light && lyricStyles.draggingItem,
                            ]}
                        >
                            {word.text}
                        </Text>
                    ))}
                </View>
            );
        }

        // Fallback to single text when no word data
        return (
            <Text key="romanization" style={getLineStyle(isFirst)}>
                {romanizationText}
            </Text>
        );
    };

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
        if (type === "romanization") return !!romanizationText || (romanizationWords && romanizationWords.length > 0);
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
    const enableFloat = useAppConfig("lyric.enableWordByWordFloat") ?? true;
    const pureWhiteMode = useAppConfig("lyric.pureWhiteMode") ?? true;
    const enableBreathingDots = useAppConfig("lyric.enableBreathingDots") ?? true;

    const effectiveHighlightColor = pureWhiteMode ? 'white' : colors.primary;

    // Render word-by-word layout for ALL lines with word data (both playing and non-playing)
    // This ensures identical flex-wrap line-breaking behavior
    // Non-current lines use StaticWordByWordLine (no useCurrentPositionMs subscription)
    if (hasWordByWord && words && words.length > 0) {
        if (!highlight) {
            // Static layout: same View + flexWrap structure, zero per-frame cost
            return (
                <StaticWordByWordLine
                    words={words}
                    romanizationWords={hasRomanizationWordByWord ? romanizationWords : undefined}
                    isRomanizationPseudo={isRomanizationPseudo}
                    translation={translation}
                    lyricOrder={lyricOrder}
                    fontSize={actualFontSize}
                    index={index}
                    onLayout={onLayout}
                    align={align}
                />
            );
        }
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
                highlightColor={effectiveHighlightColor}
                index={index}
                onLayout={onLayout}
                enableFloat={enableFloat}
                align={align}
                isCurrentLine={true}
            />
        );
    }

    // Check if lyric text is empty (empty string or only whitespace)
    const isEmptyLyric = !text || text.trim() === '';

    // Render breathing dots ONLY for current playing empty line (highlight=true)
    if (isEmptyLyric && enableBreathingDots && highlight) {
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
                    color={effectiveHighlightColor}
                    align={align}
                    highlight={true}
                />
            </View>
        );
    }

    // If breathing dots disabled, render empty space for empty lyrics
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
            />
        );
    }

    // Check if we have multi-line content (translation or romanization)
    const hasMultiLine = !!(translation || romanization || (romanizationWords && romanizationWords.length > 0));

    // Use multi-line component for lines with multi-line content
    if (hasMultiLine) {
        return (
            <MultiLineRegularLyric
                text={text || ''}
                romanizationText={romanization}
                romanizationWords={romanizationWords}
                translation={translation}
                lyricOrder={lyricOrder}
                fontSize={actualFontSize}
                highlight={!!highlight}
                light={!!light}
                primaryColor={effectiveHighlightColor}
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
            primaryColor={effectiveHighlightColor}
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
        prev.romanizationWords === curr.romanizationWords &&
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
    translationLineContainer: {
        position: 'relative',
        width: '100%',
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
        opacity: 0.5,
        paddingHorizontal: rpx(64),
        paddingVertical: rpx(24),
        width: "100%",
        textAlign: "center",
        textAlignVertical: "center",
    },
    // Compact item for multi-line groups (no padding, container handles it)
    compactItem: {
        color: "white",
        opacity: 0.5,
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
        alignItems: "baseline",
        width: "100%",
    },
    charGroupRow: {
        flexDirection: "row",
        alignItems: "baseline",
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
