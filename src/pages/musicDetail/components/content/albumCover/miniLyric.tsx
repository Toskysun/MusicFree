/**
 * Mini lyrics: current line only, staggered handoff (low ghosting).
 *
 * Adjacent lines use direction-aware staggered motion. Seeks use a shorter
 * fade-only handoff, while an interrupted handoff snaps to the latest line so
 * an invisible intermediate lyric can never flash at full opacity.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    Easing,
    Extrapolation,
    cancelAnimation,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import rpx from "@/utils/rpx";
import { useCurrentLyricItem, useLyricState } from "@/core/lyricManager";
import { fontSizeConst } from "@/constants/uiConst";
import useOrientation from "@/hooks/useOrientation";
import PersistStatus from "@/utils/persistStatus";
import { useAppConfig } from "@/core/appConfig";
import { getCoverLeftMargin } from "./index";
import { IMMERSIVE_CONTENT_HORIZONTAL_PADDING } from "../../immersiveCover";
import LyricItemComponent from "../lyric/lyricItem";
import type { IParsedLrcItem } from "@/utils/lrcParser";

interface IMiniLyricProps {
    onPress?: () => void;
    layout?: "normal" | "compact";
    immersive?: boolean;
    /** Suspend visual work while the album tab is hidden or the page exits. */
    hidden?: boolean;
}

type LyricOrder = ("romanization" | "original" | "translation")[];

const VIEWPORT_H_NORMAL = rpx(160);
const VIEWPORT_H_COMPACT = rpx(100);
const MARGIN_TOP_NORMAL = rpx(24);
const MARGIN_TOP_COMPACT = rpx(12);

const MINI_ITEM_CONTAINER_STYLE = {
    paddingHorizontal: 0,
    paddingVertical: rpx(4),
};

const MINI_WORD_FLOAT_EM = 0.05;

/** Small travel — large slide + dual opacity = heavy ghosting */
const SLIDE_OUT = rpx(12);
const SLIDE_IN = rpx(16);

const HANDOFF_TIMING = {
    duration: 260,
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};

const SEEK_HANDOFF_TIMING = {
    duration: 140,
    easing: Easing.out(Easing.quad),
};

function MiniLyricLine(props: {
    lyric: IParsedLrcItem;
    index: number;
    fontSize: number;
    order: LyricOrder;
    showTr: boolean;
    showRo: boolean;
    hasTr: boolean;
    hasRo: boolean;
    align: "left" | "center";
    /** Active karaoke only on the incoming/settled line */
    highlight: boolean;
    interludeStartTimeMs?: number;
    interludeEndTimeMs?: number;
}) {
    const {
        lyric,
        index,
        fontSize,
        order,
        showTr,
        showRo,
        hasTr,
        hasRo,
        align,
        highlight,
        interludeStartTimeMs,
        interludeEndTimeMs,
    } = props;

    return (
        <LyricItemComponent
            index={index}
            text={lyric.lrc}
            fontSize={fontSize}
            highlight={highlight}
            words={lyric.words}
            hasWordByWord={lyric.hasWordByWord}
            romanizationWords={
                showRo && hasRo ? lyric.romanizationWords : undefined
            }
            romanization={showRo && hasRo ? lyric.romanization : undefined}
            hasRomanizationWordByWord={
                showRo && hasRo && lyric.hasRomanizationWordByWord
                    ? true
                    : undefined
            }
            isRomanizationPseudo={lyric.isRomanizationPseudo}
            translation={showTr && hasTr ? lyric.translation : undefined}
            translationWords={
                showTr && hasTr ? lyric.translationWords : undefined
            }
            hasTranslationWordByWord={
                showTr && hasTr && lyric.hasTranslationWordByWord
                    ? true
                    : undefined
            }
            lyricOrder={order}
            align={align}
            interludeStartTimeMs={interludeStartTimeMs}
            interludeEndTimeMs={interludeEndTimeMs}
            containerStyle={MINI_ITEM_CONTAINER_STYLE}
            wordFloatEm={MINI_WORD_FLOAT_EM}
        />
    );
}

function getInterludeTiming(
    lyrics: IParsedLrcItem[],
    index: number,
    offsetSeconds: number,
): { startTimeMs?: number; endTimeMs?: number } {
    const lyric = lyrics[index];
    if (!lyric) {
        return {};
    }
    const startTimeMs = (lyric.time + offsetSeconds) * 1000;
    const nextLyric = lyrics[index + 1];
    const endTimeMs = nextLyric
        ? Math.max(
            startTimeMs,
            (nextLyric.time + offsetSeconds) * 1000 - 250,
        )
        : lyric.duration
            ? startTimeMs + lyric.duration
            : undefined;
    return { startTimeMs, endTimeMs };
}

export default function MiniLyric(props: IMiniLyricProps) {
    const { onPress, hidden = false } = props;
    const layout = props.layout ?? "normal";
    const immersive = props.immersive ?? false;
    const compact = layout === "compact";

    const currentLyricItem = useCurrentLyricItem();
    const { lyrics, loading, hasTranslation, hasRomanization, meta } =
        useLyricState();
    const orientation = useOrientation();
    const coverStyle = useAppConfig("theme.coverStyle") ?? "square";
    const fontKey = useAppConfig("lyric.detailFontSize") ?? 1;

    const fontSize = useMemo(() => {
        const map: Record<number, number> = {
            0: rpx(22),
            1: rpx(28),
            2: rpx(32),
            3: rpx(36),
        };
        return map[fontKey] ?? fontSizeConst.content;
    }, [fontKey]);

    const showTranslation = PersistStatus.useValue(
        "lyric.showTranslation",
        true,
    );
    const showRomanization = PersistStatus.useValue(
        "lyric.showRomanization",
        true,
    );
    const lyricOrder = PersistStatus.useValue("lyric.lyricOrder", [
        "romanization",
        "original",
        "translation",
    ]) as LyricOrder;

    const order = useMemo<LyricOrder>(() => {
        if (compact) {
            return ["original"];
        }
        return lyricOrder ?? ["original"];
    }, [compact, lyricOrder]);

    const showTr = compact ? false : showTranslation;
    const showRo = compact ? false : showRomanization;

    const detailAlign =
        (useAppConfig("lyric.detailAlign") as "left" | "center") ?? "left";
    const align = detailAlign === "center" ? "center" : "left";

    const currentIndex = currentLyricItem?.index ?? -1;
    const targetIndex = currentIndex;

    // Displayed "incoming" line index; outgoing is the previous one mid-transition.
    const [activeIndex, setActiveIndex] = useState(targetIndex);
    const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null);
    const activeIndexRef = useRef(activeIndex);
    const transitionIdRef = useRef(0);
    const transitionRunningRef = useRef(false);

    // 0 = start of handoff (outgoing full / incoming below), 1 = settled
    const handoff = useSharedValue(1);
    // 1/-1 = next/previous direction; slideMotion=0 disables travel for seeks.
    const direction = useSharedValue(1);
    const slideMotion = useSharedValue(1);

    const finishTransition = useCallback((transitionId: number) => {
        if (transitionId !== transitionIdRef.current) {
            return;
        }
        transitionRunningRef.current = false;
        setOutgoingIndex(null);
    }, []);

    // A new lyric array means a new song/source. Reset before the target-index
    // effect runs, preventing an old line index from animating into the new song.
    useEffect(() => {
        transitionIdRef.current += 1;
        transitionRunningRef.current = false;
        cancelAnimation(handoff);
        activeIndexRef.current = targetIndex;
        setOutgoingIndex(null);
        setActiveIndex(targetIndex);
        handoff.value = 1;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lyrics]);

    useEffect(() => () => {
        transitionIdRef.current += 1;
        transitionRunningRef.current = false;
        cancelAnimation(handoff);
    }, [handoff]);

    useEffect(() => {
        if (hidden) {
            transitionIdRef.current += 1;
            transitionRunningRef.current = false;
            cancelAnimation(handoff);
            activeIndexRef.current = targetIndex;
            setOutgoingIndex(null);
            setActiveIndex(targetIndex);
            handoff.value = 1;
            return;
        }
        const prev = activeIndexRef.current;
        if (prev === targetIndex) {
            return;
        }

        transitionIdRef.current += 1;
        const transitionId = transitionIdRef.current;
        cancelAnimation(handoff);

        // First paint, no current line, or a second update before the previous
        // handoff settled: latest state wins without flashing an intermediate.
        if (
            targetIndex < 0 ||
            prev < 0 ||
            !lyrics[prev] ||
            !lyrics[targetIndex] ||
            transitionRunningRef.current
        ) {
            transitionRunningRef.current = false;
            activeIndexRef.current = targetIndex;
            setActiveIndex(targetIndex);
            setOutgoingIndex(null);
            handoff.value = 1;
            return;
        }

        const delta = targetIndex - prev;
        const isAdjacent = Math.abs(delta) === 1;
        direction.value = delta >= 0 ? 1 : -1;
        slideMotion.value = isAdjacent ? 1 : 0;
        transitionRunningRef.current = true;
        activeIndexRef.current = targetIndex;
        setOutgoingIndex(prev);
        setActiveIndex(targetIndex);
        handoff.value = 0;
        handoff.value = withTiming(
            1,
            isAdjacent ? HANDOFF_TIMING : SEEK_HANDOFF_TIMING,
            finished => {
                if (finished) {
                    runOnJS(finishTransition)(transitionId);
                }
            },
        );
    }, [
        direction,
        finishTransition,
        handoff,
        hidden,
        lyrics,
        slideMotion,
        targetIndex,
    ]);

    // Staggered curves: old line nearly gone before new is solid → less residual double image
    const outgoingStyle = useAnimatedStyle(() => {
        const p = handoff.value;
        return {
            opacity: interpolate(
                p,
                [0, 0.4, 1],
                [1, 0, 0],
                Extrapolation.CLAMP,
            ),
            transform: [
                {
                    translateY: -direction.value * slideMotion.value * interpolate(
                        p,
                        [0, 0.4, 1],
                        [0, SLIDE_OUT, SLIDE_OUT],
                        Extrapolation.CLAMP,
                    ),
                },
            ],
        };
    });

    const incomingStyle = useAnimatedStyle(() => {
        const p = handoff.value;
        return {
            opacity: interpolate(
                p,
                [0, 0.25, 0.8, 1],
                [0, 0, 1, 1],
                Extrapolation.CLAMP,
            ),
            transform: [
                {
                    translateY: direction.value * slideMotion.value * interpolate(
                        p,
                        [0, 0.25, 1],
                        [SLIDE_IN, SLIDE_IN, 0],
                        Extrapolation.CLAMP,
                    ),
                },
            ],
        };
    });

    const viewportH = compact ? VIEWPORT_H_COMPACT : VIEWPORT_H_NORMAL;

    const outerStyle = useMemo(
        () => ({
            paddingHorizontal: immersive
                ? IMMERSIVE_CONTENT_HORIZONTAL_PADDING
                : getCoverLeftMargin(coverStyle),
            marginTop: compact ? MARGIN_TOP_COMPACT : MARGIN_TOP_NORMAL,
            minHeight: viewportH,
        }),
        [compact, coverStyle, immersive, viewportH],
    );

    const tap = Gesture.Tap()
        .onStart(() => {
            onPress?.();
        })
        .runOnJS(true);

    const activeLyric =
        activeIndex >= 0 && activeIndex < lyrics.length
            ? lyrics[activeIndex]
            : null;
    const outgoingLyric =
        outgoingIndex != null &&
        outgoingIndex >= 0 &&
        outgoingIndex < lyrics.length
            ? lyrics[outgoingIndex]
            : null;
    const lyricOffsetSeconds = +(meta?.offset ?? 0);
    const activeInterlude = getInterludeTiming(
        lyrics,
        activeIndex,
        lyricOffsetSeconds,
    );
    const outgoingInterlude = outgoingIndex == null
        ? {}
        : getInterludeTiming(lyrics, outgoingIndex, lyricOffsetSeconds);

    if (
        hidden ||
        !lyrics.length ||
        loading ||
        orientation === "horizontal" ||
        !activeLyric
    ) {
        return null;
    }

    const lineProps = {
        fontSize,
        order,
        showTr,
        showRo,
        hasTr: hasTranslation,
        hasRo: hasRomanization,
        align: align as "left" | "center",
    };

    return (
        <GestureDetector gesture={tap}>
            <View style={[styles.outer, outerStyle]}>
                <View style={styles.stage}>
                    {outgoingLyric && outgoingIndex != null ? (
                        <Animated.View
                            style={[styles.layer, outgoingStyle]}
                            pointerEvents="none">
                            <MiniLyricLine
                                lyric={outgoingLyric}
                                index={outgoingIndex}
                                highlight
                                interludeStartTimeMs={outgoingInterlude.startTimeMs}
                                interludeEndTimeMs={outgoingInterlude.endTimeMs}
                                {...lineProps}
                            />
                        </Animated.View>
                    ) : null}
                    <Animated.View
                        style={[
                            styles.incomingLayer,
                            { minHeight: viewportH },
                            incomingStyle,
                        ]}
                        pointerEvents="none">
                        <MiniLyricLine
                            key={`in-${activeIndex}`}
                            lyric={activeLyric}
                            index={activeIndex}
                            highlight
                            interludeStartTimeMs={activeInterlude.startTimeMs}
                            interludeEndTimeMs={activeInterlude.endTimeMs}
                            {...lineProps}
                        />
                    </Animated.View>
                </View>
            </View>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    outer: {
        width: "100%",
        flexShrink: 0,
        justifyContent: "center",
        backgroundColor: "transparent",
    },
    /** The active line defines height; overflow stays visible during handoff. */
    stage: {
        width: "100%",
        flexShrink: 0,
        position: "relative",
        overflow: "visible",
    },
    layer: {
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        width: "100%",
        justifyContent: "center",
    },
    incomingLayer: {
        width: "100%",
        flexShrink: 0,
        justifyContent: "center",
    },
});
