import React, { memo, useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withRepeat,
    useDerivedValue,
    interpolateColor,
    Easing,
    type SharedValue,
} from "react-native-reanimated";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import { fontSizeConst } from "@/constants/uiConst";
import { getCurrentPositionMsShared } from "@/core/lyricManager";
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

// Font size ratio for secondary lines (smaller than primary/first line)
const SECONDARY_FONT_RATIO = 0.75;
const TRANSLATION_HIGHLIGHT_OPACITY = 0.72;

// AMll motion constants, ported from amll-core/lyric-player/dom/lyric-line.ts.
const AMLL_MIN_DURATION_MS = 1000;
const AMLL_WORD_FLOAT_EM = 0.05;
const AMLL_EMPHASIS_STAGGER_RATIO = 2.5;
const AMLL_EMPHASIS_FLOAT_DURATION_RATIO = 1.4;
const AMLL_EMPHASIS_FLOAT_LEAD_MS = 400;

type AmllEmphasisTiming = {
    startTime: number;
    duration: number;
    amount: number;
    blur: number;
    offsetFactor: number;
};

function isCjkCodePoint(codePoint: number) {
    return (
        (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
        (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7af)
    );
}

function isFloatSeparator(codePoint: number) {
    return (
        codePoint <= 0x002f ||
        (codePoint >= 0x003a && codePoint <= 0x0040) ||
        (codePoint >= 0x005b && codePoint <= 0x0060) ||
        (codePoint >= 0x007b && codePoint <= 0x007e) ||
        (codePoint >= 0x2000 && codePoint <= 0x206f) ||
        (codePoint >= 0x3000 && codePoint <= 0x303f) ||
        (codePoint >= 0xff00 && codePoint <= 0xff65)
    );
}

function isCjkText(text: string) {
    const chars = [...text];
    return chars.length > 0 && chars.every(char => isCjkCodePoint(char.codePointAt(0) ?? 0));
}

function shouldAmllEmphasize(text: string, duration: number) {
    if (isCjkText(text)) return duration >= AMLL_MIN_DURATION_MS;
    const length = [...text.trim()].length;
    return duration >= AMLL_MIN_DURATION_MS && length > 1 && length <= 7;
}

type TimedCharacter = {
    char: string;
    wordIndex: number;
    charIndex: number;
    startTime: number;
    endTime: number;
};

function buildAmllEmphasisTimings(words: ILyric.IWordData[]): Array<Array<AmllEmphasisTiming | undefined>> {
    const result = words.map(word => new Array<AmllEmphasisTiming | undefined>(
        Math.max(1, [...word.text].length),
    ));
    const characters: TimedCharacter[] = [];

    words.forEach((word, wordIndex) => {
        const chars = [...word.text];
        const charDuration = chars.length > 0 ? Math.max(0, word.duration) / chars.length : 0;
        chars.forEach((char, charIndex) => {
            characters.push({
                char,
                wordIndex,
                charIndex,
                startTime: word.startTime + charDuration * charIndex,
                endTime: word.startTime + charDuration * (charIndex + 1),
            });
        });
        if (word.space && !word.text.endsWith(" ")) {
            characters.push({
                char: " ",
                wordIndex: -1,
                charIndex: -1,
                startTime: word.startTime + Math.max(0, word.duration),
                endTime: word.startTime + Math.max(0, word.duration),
            });
        }
    });

    const fullText = characters.map(character => character.char).join("");
    type SegmenterLike = {
        segment: (text: string) => Iterable<{ segment: string }>;
    };
    type SegmenterConstructor = new (
        locale?: string,
        options?: { granularity: "word" },
    ) => SegmenterLike;
    const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
    const segments = Segmenter
        ? Array.from(new Segmenter(undefined, { granularity: "word" }).segment(fullText), item => item.segment)
        : words.map(word => `${word.text}${word.space ? " " : ""}`);
    let characterOffset = 0;
    const lastWordIndex = words.length - 1;

    for (const segment of segments) {
        const segmentLength = [...segment].length;
        const segmentCharacters = characters.slice(characterOffset, characterOffset + segmentLength);
        characterOffset += segmentLength;
        const visibleCharacters = segmentCharacters.filter(character =>
            character.wordIndex >= 0 && !isFloatSeparator(character.char.codePointAt(0) ?? 0),
        );
        if (visibleCharacters.length === 0) continue;

        const segmentText = visibleCharacters.map(character => character.char).join("");
        const startTime = Math.min(...visibleCharacters.map(character => character.startTime));
        const endTime = Math.max(...visibleCharacters.map(character => character.endTime));
        const rawDuration = Math.max(0, endTime - startTime);
        const sourceWordIndices = [...new Set(visibleCharacters.map(character => character.wordIndex))];
        const sourceEmphasizes = sourceWordIndices.some(wordIndex => {
            const sourceWord = words[wordIndex];
            const sourceDuration = Math.max(0, sourceWord.duration);
            if (isCjkText(sourceWord.text)) {
                const sourceCharCount = Math.max(1, [...sourceWord.text].length);
                return sourceDuration / sourceCharCount >= AMLL_MIN_DURATION_MS;
            }
            return shouldAmllEmphasize(sourceWord.text, sourceDuration);
        });
        const shouldEmphasize = sourceEmphasizes ||
            (!isCjkText(segmentText) && shouldAmllEmphasize(segmentText, rawDuration));
        if (!shouldEmphasize) continue;

        let duration = Math.max(AMLL_MIN_DURATION_MS, rawDuration);
        let amount = duration / 2000;
        amount = amount > 1 ? Math.sqrt(amount) : amount ** 3;
        let blur = duration / 3000;
        blur = blur > 1 ? Math.sqrt(blur) : blur ** 3;
        amount *= 0.6;
        blur *= 0.5;

        if (sourceWordIndices.includes(lastWordIndex)) {
            amount *= 1.6;
            blur *= 1.5;
            duration *= 1.2;
        }
        amount = Math.min(1.2, amount);
        blur = Math.min(0.8, blur);

        visibleCharacters.forEach((character, index) => {
            result[character.wordIndex][character.charIndex] = {
                startTime: startTime +
                    (duration / AMLL_EMPHASIS_STAGGER_RATIO / visibleCharacters.length) * index,
                duration,
                amount,
                blur,
                offsetFactor: visibleCharacters.length / 2 - index,
            };
        });
    }

    return result;
}

function cubicBezier(value: number, x1: number, y1: number, x2: number, y2: number) {
    "worklet";
    const progress = Math.max(0, Math.min(1, value));
    if (progress === 0 || progress === 1) return progress;

    let parameter = progress;
    for (let iteration = 0; iteration < 5; iteration += 1) {
        const inverse = 1 - parameter;
        const currentX = 3 * inverse * inverse * parameter * x1 +
            3 * inverse * parameter * parameter * x2 + parameter ** 3;
        const derivative = 3 * inverse * inverse * x1 +
            6 * inverse * parameter * (x2 - x1) +
            3 * parameter * parameter * (1 - x2);
        if (Math.abs(derivative) < 0.0001) break;
        parameter = Math.max(0, Math.min(1, parameter - (currentX - progress) / derivative));
    }

    const inverse = 1 - parameter;
    return 3 * inverse * inverse * parameter * y1 +
        3 * inverse * parameter * parameter * y2 + parameter ** 3;
}

function amllEmphasisEasing(value: number) {
    "worklet";
    return value < 0.5
        ? cubicBezier(value * 2, 0.2, 0.4, 0.58, 1)
        : 1 - cubicBezier((value - 0.5) * 2, 0.3, 0, 0.58, 1);
}

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
function useCurrentPositionShared() {
    return useMemo(() => getCurrentPositionMsShared(), []);
}

function useLineActiveState(flatTimings: { startTime: number; endTime: number }[]) {
    const currentPositionMsShared = useCurrentPositionShared();
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
    emphasisTimings,
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
    emphasisTimings: Array<AmllEmphasisTiming | undefined>;
}) => {
    const subWords = useMemo(() => splitWordToChars(word), [word]);
    const currentPositionMsShared = useCurrentPositionShared();
    const wordFloatStyle = useAnimatedStyle(() => {
        "worklet";
        if (!enableFloat || isPseudo || !isCurrentLine) {
            return { transform: [{ translateY: 0 }] };
        }

        const duration = Math.max(AMLL_MIN_DURATION_MS, Math.max(0, word.duration));
        const rawProgress = (currentPositionMsShared.value - word.startTime) / duration;
        const progress = Math.max(0, Math.min(1, rawProgress));
        const easedProgress = cubicBezier(progress, 0, 0, 0.58, 1);

        return {
            transform: [{ translateY: -fontSize * AMLL_WORD_FLOAT_EM * easedProgress }],
        };
    }, [
        enableFloat,
        isPseudo,
        isCurrentLine,
        word.startTime,
        word.duration,
        fontSize,
    ]);

    // AMll applies the base float to the whole timed word. Per-character motion
    // is reserved for long emphasis words only.
    if (subWords.length === 1) {
        return (
            <Animated.View
                collapsable={false}
                renderToHardwareTextureAndroid={enableFloat && isCurrentLine}
                shouldRasterizeIOS={enableFloat && isCurrentLine}
                style={wordFloatStyle}>
                <KaraokeWord
                    word={subWords[0]}
                    primaryColor={primaryColor}
                    highlightColor={highlightColor}
                    fontSize={fontSize}
                    isCurrentLine={isCurrentLine}
                    noSpace={noSpace}
                    charFlatIndex={charFlatOffset}
                    activeCharIndex={activeCharIndex}
                    activeCharProgress={activeCharProgress}
                    emphasisTiming={isPseudo ? undefined : emphasisTimings[0]}
                />
            </Animated.View>
        );
    }

    // Multi-character words keep a single base transform while AMll emphasis
    // can add staggered motion to their character layers.
    const groupTrailingSpace = !noSpace && word.space ? ' ' : '';
    return (
        <Animated.View
            collapsable={false}
            renderToHardwareTextureAndroid={enableFloat && isCurrentLine}
            shouldRasterizeIOS={enableFloat && isCurrentLine}
            style={[lyricStyles.charGroupRow, wordFloatStyle]}>
            {subWords.map((charWord, i) => (
                <KaraokeWord
                    key={i}
                    word={charWord}
                    primaryColor={primaryColor}
                    highlightColor={highlightColor}
                    fontSize={fontSize}
                    isCurrentLine={isCurrentLine}
                    noSpace={true}
                    charFlatIndex={charFlatOffset + i}
                    activeCharIndex={activeCharIndex}
                    activeCharProgress={activeCharProgress}
                    emphasisTiming={isPseudo ? undefined : emphasisTimings[i]}
                />
            ))}
            {groupTrailingSpace ? (
                <Text style={{ fontSize, color: 'transparent' }}>{' '}</Text>
            ) : null}
        </Animated.View>
    );
});

const AmllEmphasisWrapper = memo(({
    timing,
    fontSize,
    children,
}: {
    timing: AmllEmphasisTiming;
    fontSize: number;
    children: React.ReactNode;
}) => {
    const currentPositionMsShared = useCurrentPositionShared();
    const emphasisTransformStyle = useAnimatedStyle(() => {
        "worklet";
        const currentTime = currentPositionMsShared.value;
        const progress = Math.max(0, Math.min(
            1,
            (currentTime - timing.startTime) / timing.duration,
        ));
        const emphasis = amllEmphasisEasing(progress);
        const floatStartTime = timing.startTime - AMLL_EMPHASIS_FLOAT_LEAD_MS;
        const floatDuration = timing.duration * AMLL_EMPHASIS_FLOAT_DURATION_RATIO;
        const floatProgress = Math.max(0, Math.min(
            1,
            (currentTime - floatStartTime) / floatDuration,
        ));
        const floatOffset = Math.sin(floatProgress * Math.PI) * AMLL_WORD_FLOAT_EM;

        const translateX = -emphasis * 0.03 * timing.amount *
            timing.offsetFactor * fontSize;
        const translateY = -fontSize *
            (emphasis * 0.025 * timing.amount + floatOffset);
        const scale = 1 + emphasis * 0.1 * timing.amount;

        // AMll uses matrix3d specifically to avoid glyph-edge jitter while
        // scaling and translating. Keep the same single-matrix composition.
        return {
            transform: [{
                matrix: [
                    scale, 0, 0, 0,
                    0, scale, 0, 0,
                    0, 0, 1, 0,
                    translateX, translateY, 0, 1,
                ],
            }],
        };
    }, [timing, fontSize]);

    return (
        <Animated.View
            collapsable={false}
            renderToHardwareTextureAndroid
            shouldRasterizeIOS
            style={emphasisTransformStyle}>
            {children}
        </Animated.View>
    );
});

type AmllGlowTextProps = {
    timing: AmllEmphasisTiming;
    fontSize: number;
    color: string;
    text: string;
    onLayout: React.ComponentProps<typeof Text>["onLayout"];
};

const AmllAnimatedGlowText = memo(({
    timing,
    fontSize,
    color,
    text,
    onLayout,
}: AmllGlowTextProps) => {
    const currentPositionMsShared = useCurrentPositionShared();
    const emphasisGlowStyle = useAnimatedStyle(() => {
        "worklet";
        const progress = Math.max(0, Math.min(
            1,
            (currentPositionMsShared.value - timing.startTime) / timing.duration,
        ));
        const glowLevel = amllEmphasisEasing(progress) * timing.blur;
        return {
            textShadowColor: interpolateColor(
                glowLevel,
                [0, 0.8],
                ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.8)"],
            ),
            textShadowRadius: fontSize * Math.min(0.3, timing.blur * 0.3),
        };
    }, [timing, fontSize]);

    return (
        <Animated.Text
            onLayout={onLayout}
            style={[
                styles.wordText,
                emphasisGlowStyle,
                {
                    fontSize,
                    color,
                    opacity: 0.48,
                    textShadowOffset: { width: 0, height: 0 },
                },
            ]}>
            {text}
        </Animated.Text>
    );
});

const AmllGlowText = memo((props: AmllGlowTextProps) => {
    // Animated textShadow forces Android to rerasterize glyphs every frame and
    // defeats the hardware texture used for subpixel movement. AMll's motion is
    // substantially smoother there without the costly shadow layer.
    if (Platform.OS === "android") {
        return (
            <Text
                onLayout={props.onLayout}
                style={[
                    styles.wordText,
                    { fontSize: props.fontSize, color: props.color, opacity: 0.48 },
                ]}>
                {props.text}
            </Text>
        );
    }

    return <AmllAnimatedGlowText {...props} />;
});

// Individual glyph: continuous fill plus AMll's optional long-word emphasis.
// All progress is evaluated from the smooth UI-thread playback clock.
const KaraokeWord = memo(({
    word,
    primaryColor,
    highlightColor,
    fontSize,
    isCurrentLine,
    noSpace = false,
    charFlatIndex,
    activeCharIndex,
    activeCharProgress,
    emphasisTiming,
}: {
    word: ILyric.IWordData;
    primaryColor: string;
    highlightColor: string;
    fontSize: number;
    isCurrentLine: boolean;
    noSpace?: boolean;
    charFlatIndex: number;
    activeCharIndex: SharedValue<number>;
    activeCharProgress: SharedValue<number>;
    emphasisTiming?: AmllEmphasisTiming;
}) => {
    const { text, space } = word;
    const [textWidth, setTextWidth] = useState(0);

    // Trailing space as text (matches non-playing line text wrapping)
    const trailingSpace = !noSpace && space ? ' ' : '';

    // True karaoke fill: completed characters are fully filled while the active
    // character is clipped continuously from left to right. This avoids changing
    // the brightness of an entire glyph at once and remains stable after wrapping.
    const fillProgress = useDerivedValue(() => {
        'worklet';
        if (!isCurrentLine) return 0;

        const idx = activeCharIndex.value;
        if (charFlatIndex < idx) return 1;
        if (charFlatIndex > idx) return 0;
        return activeCharProgress.value;
    }, [isCurrentLine, charFlatIndex]);

    const fillMaskStyle = useAnimatedStyle(() => {
        'worklet';
        return { width: fillProgress.value * textWidth };
    }, [textWidth]);

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

    const handleTextLayout: React.ComponentProps<typeof Text>["onLayout"] = event => {
        const width = event.nativeEvent.layout.width;
        if (width > 0 && Math.abs(width - textWidth) > 0.5) {
            setTextWidth(width);
        }
    };
    const baseText = emphasisTiming ? (
        <AmllGlowText
            timing={emphasisTiming}
            fontSize={fontSize}
            color={primaryColor}
            text={`${text}${trailingSpace}`}
            onLayout={handleTextLayout}
        />
    ) : (
        <Text
            onLayout={handleTextLayout}
            style={[
                styles.wordText,
                { fontSize, color: primaryColor, opacity: 0.48 },
            ]}>
            {text}{trailingSpace}
        </Text>
    );
    const content = (
        <View style={styles.wordWrapper}>
            {baseText}
            <Animated.View
                pointerEvents="none"
                style={[styles.wordFillOverlay, fillMaskStyle]}>
                <Text
                    numberOfLines={1}
                    style={[
                        styles.wordText,
                        {
                            width: textWidth || undefined,
                            fontSize,
                            color: highlightColor,
                            opacity: 0.98,
                        },
                    ]}>
                    {text}{trailingSpace}
                </Text>
            </Animated.View>
        </View>
    );

    // The highlighted copy is masked instead of recoloring the complete glyph.
    // Both copies use identical text metrics, keeping the sweep pixel-aligned.
    return emphasisTiming ? (
        <AmllEmphasisWrapper timing={emphasisTiming} fontSize={fontSize}>
            {content}
        </AmllEmphasisWrapper>
    ) : content;
});

const TranslationTextLine = memo(({
    text,
    fontSize,
    highlightColor,
    highlight = false,
    inactiveOpacity = 0.5,
    align = "center",
}: {
    text: string;
    fontSize: number;
    highlightColor: string;
    highlight?: boolean;
    inactiveOpacity?: number;
    align?: LyricAlign;
}) => {
    return (
        <View style={[
            styles.translationLineContainer,
            { alignItems: align === "left" ? "flex-start" : "center" },
        ]}>
            <Text
                style={[
                    styles.wordText,
                    {
                        fontSize,
                        textAlign: align,
                        color: highlight ? highlightColor : "white",
                        opacity: highlight ? TRANSLATION_HIGHLIGHT_OPACITY : inactiveOpacity,
                    },
                ]}
            >
                {text}
            </Text>
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
                    <View
                        key="translation"
                        style={[{ width: "100%" }, !isFirst && lyricStyles.secondaryLine]}
                    >
                        <TranslationTextLine
                            text={translation}
                            fontSize={getLineFontSize(isFirst)}
                            highlightColor="white"
                            inactiveOpacity={1}
                            align={align}
                        />
                    </View>
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
    const originalEmphasisTimings = useMemo(
        () => buildAmllEmphasisTimings(normalizedWords),
        [normalizedWords],
    );
    const romanizationEmphasisTimings = useMemo(
        () => normalizedRomanizationWords
            ? buildAmllEmphasisTimings(normalizedRomanizationWords)
            : [],
        [normalizedRomanizationWords],
    );

    // Build flat timing arrays and char offset maps for each word list
    const originalFlatTimings = useMemo(() => buildFlatTimings(normalizedWords), [normalizedWords]);
    const romanizationFlatTimings = useMemo(
        () => normalizedRomanizationWords ? buildFlatTimings(normalizedRomanizationWords) : [],
        [normalizedRomanizationWords],
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

    // Line-level active state tracking — ONE useDerivedValue per word list reads currentPositionMsShared
    const originalActive = useLineActiveState(originalFlatTimings);
    const romanizationActive = useLineActiveState(romanizationFlatTimings);

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
                    emphasisTimings={originalEmphasisTimings[wordIndex]}
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
                    emphasisTimings={romanizationEmphasisTimings[wordIndex]}
                />
            ))}
        </View>
    );

    // Translation line component
    const translationLine = (isFirst: boolean) => translation && (
        <View style={[{ width: '100%' }, !isFirst && lyricStyles.secondaryLine]} key="translation">
            <TranslationTextLine
                text={translation}
                fontSize={getLineFontSize(isFirst)}
                highlightColor={highlightColor}
                highlight={isCurrentLine}
                align={align}
            />
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
        <View key="translation" style={[{ width: "100%" }, !isFirst && lyricStyles.secondaryLine]}>
            <TranslationTextLine
                text={translation}
                fontSize={getLineFontSize(isFirst)}
                highlightColor={primaryColor}
                highlight={highlight}
                inactiveOpacity={1}
                align={align}
            />
        </View>
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
    wordFillOverlay: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        overflow: "hidden",
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
