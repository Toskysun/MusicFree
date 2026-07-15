import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import rpx from "@/utils/rpx";
import { ImgAsset } from "@/constants/assetsConst";
import FastImage from "@/components/base/fastImage";
import useOrientation from "@/hooks/useOrientation";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useCurrentMusic, useMusicState, MusicState } from "@/core/trackPlayer";
import { Animated, Easing, useWindowDimensions, View } from "react-native";
import Operations from "./operations";
import { showPanel } from "@/components/panels/usePanel.ts";
import { useAppConfig } from "@/core/appConfig";
import MiniLyric from "./miniLyric";
import SongInfo from "./songInfo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NAV_BAR_HEIGHT } from "../../navBar";
import {
    getImmersiveCoverHeight,
    IMMERSIVE_CONTENT_TOP_GAP,
} from "../../immersiveCover";
import { resolveArtwork } from "@/utils/artwork";
import { useMediaExtraProperty } from "@/utils/mediaExtra";

const ROTATION_DURATION = 25000; // 25秒转一圈
export const COVER_SIZE = rpx(600); // 大封面尺寸
export const COVER_MARGIN = (rpx(750) - COVER_SIZE) / 2; // 封面左右边距

// 根据封面样式计算实际左边距
export function getCoverLeftMargin(coverStyle: string) {
    const size = coverStyle === "circle" ? COVER_SIZE : COVER_SIZE - rpx(30);
    return (rpx(750) - size) / 2;
}

interface IProps {
    onTurnPageClick?: () => void;
    /** Only true when leaving music-detail — keep mini lyric mounted across cover/lyric tabs */
    isExiting?: boolean;
    /** Hidden album tab stays mounted, but expensive animations are suspended. */
    isActive?: boolean;
}

export default function AlbumCover(props: IProps) {
    const { onTurnPageClick, isExiting = false, isActive = true } = props;

    const musicItem = useCurrentMusic();
    // React to associated cover changes
    useMediaExtraProperty(musicItem, "associatedArtwork");
    const displayArtwork = resolveArtwork(musicItem);
    const orientation = useOrientation();
    const { height: windowHeight, width: windowWidth } = useWindowDimensions();
    const safeAreaInsets = useSafeAreaInsets();
    const coverStyle = useAppConfig("theme.coverStyle") ?? "square";
    const musicDetailCoverStyle =
        useAppConfig("theme.musicDetailCoverStyle") ?? "classic";
    const musicState = useMusicState();
    const isPlaying = musicState === MusicState.Playing;
    const isCircle = coverStyle === "circle";
    const useImmersiveCover =
        orientation === "vertical" &&
        coverStyle === "square" &&
        musicDetailCoverStyle === "immersive";

    const [containerHeight, setContainerHeight] = useState<number | null>(null);
    const [operationsBottom, setOperationsBottom] = useState<number | null>(null);
    // Keep latest measurements in refs so layout handlers never call setState
    // synchronously during React's commit/render (RN onLayout can re-enter).
    const containerHeightRef = useRef<number | null>(null);
    const operationsBottomRef = useRef<number | null>(null);
    const pendingContainerRef = useRef<number | null>(null);
    const pendingOpsBottomRef = useRef<number | null>(null);
    const layoutRafRef = useRef<number | null>(null);

    const usableWindowHeight = windowHeight - safeAreaInsets.top - safeAreaInsets.bottom;
    const usableAspectRatio = usableWindowHeight / Math.max(1, windowWidth);
    const baseMiniLyricLayout = useMemo(() => {
        if (orientation !== "vertical") {
            return "normal" as const;
        }
        return usableAspectRatio < 1.9 ? ("compact" as const) : ("normal" as const);
    }, [orientation, usableAspectRatio]);
    const [miniLyricLayout, setMiniLyricLayout] = useState<"normal" | "compact" | "hidden">(baseMiniLyricLayout);

    const flushLayoutState = useCallback(() => {
        layoutRafRef.current = null;
        const nextContainer = pendingContainerRef.current;
        const nextOpsBottom = pendingOpsBottomRef.current;
        pendingContainerRef.current = null;
        pendingOpsBottomRef.current = null;

        if (
            nextContainer != null &&
            Math.abs((containerHeightRef.current ?? -1) - nextContainer) > 0.5
        ) {
            containerHeightRef.current = nextContainer;
            setContainerHeight(nextContainer);
        }
        if (
            nextOpsBottom != null &&
            Math.abs((operationsBottomRef.current ?? -1) - nextOpsBottom) > 0.5
        ) {
            operationsBottomRef.current = nextOpsBottom;
            setOperationsBottom(nextOpsBottom);
        }
    }, []);

    const scheduleLayoutState = useCallback(
        (nextContainer?: number, nextOpsBottom?: number) => {
            if (typeof nextContainer === "number") {
                pendingContainerRef.current = nextContainer;
            }
            if (typeof nextOpsBottom === "number") {
                pendingOpsBottomRef.current = nextOpsBottom;
            }
            if (layoutRafRef.current == null) {
                layoutRafRef.current = requestAnimationFrame(flushLayoutState);
            }
        },
        [flushLayoutState],
    );

    const onRootLayout = useCallback(
        (event: { nativeEvent: { layout: { height: number } } }) => {
            scheduleLayoutState(event.nativeEvent.layout.height);
        },
        [scheduleLayoutState],
    );

    const onOperationsLayout = useCallback(
        (event: { nativeEvent: { layout: { y: number; height: number } } }) => {
            const layout = event.nativeEvent.layout;
            scheduleLayoutState(undefined, layout.y + layout.height);
        },
        [scheduleLayoutState],
    );
    useEffect(() => {
        setMiniLyricLayout(baseMiniLyricLayout);
        operationsBottomRef.current = null;
        setOperationsBottom(null);
    }, [baseMiniLyricLayout, windowHeight, windowWidth, safeAreaInsets.bottom, safeAreaInsets.top]);

    useEffect(() => {
        if (orientation !== "vertical") {
            return;
        }
        if (containerHeight === null || operationsBottom === null) {
            return;
        }
        if (operationsBottom > containerHeight + rpx(2)) {
            // Shrink mini lyric until operations fit; reset ops measurement for next pass.
            operationsBottomRef.current = null;
            setOperationsBottom(null);
            setMiniLyricLayout(current => {
                if (current === "normal") return "compact";
                if (current === "compact") return "hidden";
                return "hidden";
            });
        }
    }, [containerHeight, operationsBottom, orientation]);

    useEffect(() => {
        return () => {
            if (layoutRafRef.current != null) {
                cancelAnimationFrame(layoutRafRef.current);
            }
        };
    }, []);
    // 旋转动画
    const spinValue = useRef(new Animated.Value(0)).current;
    const animationRef = useRef<Animated.CompositeAnimation | null>(null);
    const isAnimatingRef = useRef(false);
    const lastAnimatedMusicIdRef = useRef(musicItem?.id);

    const createAnimation = useCallback(
        (fromValue: number) => {
            return Animated.timing(spinValue, {
                toValue: 1,
                duration: ROTATION_DURATION * (1 - fromValue),
                easing: Easing.linear,
                useNativeDriver: true,
            });
        },
        [spinValue]
    );

    const startAnimation = useCallback(() => {
        if (isAnimatingRef.current || !isCircle) return;
        isAnimatingRef.current = true;
        spinValue.stopAnimation(value => {
            animationRef.current = createAnimation(value);
            animationRef.current.start(({ finished }) => {
                if (finished && isAnimatingRef.current) {
                    spinValue.setValue(0);
                    isAnimatingRef.current = false;
                    startAnimation();
                }
            });
        });
    }, [spinValue, createAnimation, isCircle]);

    const stopAnimation = useCallback(() => {
        if (!isAnimatingRef.current) return;
        isAnimatingRef.current = false;
        animationRef.current?.stop();
        animationRef.current = null;
        spinValue.stopAnimation();
    }, [spinValue]);

    // 控制播放/暂停时的动画
    useEffect(() => {
        if (isActive && isPlaying && isCircle) {
            startAnimation();
        } else {
            stopAnimation();
        }
    }, [isActive, isPlaying, isCircle, startAnimation, stopAnimation]);

    // 切换歌曲时重置
    useEffect(() => {
        if (lastAnimatedMusicIdRef.current === musicItem?.id) {
            return;
        }
        lastAnimatedMusicIdRef.current = musicItem?.id;
        stopAnimation();
        spinValue.setValue(0);
        if (isActive && isPlaying && isCircle) {
            startAnimation();
        }
    }, [
        isActive,
        isCircle,
        isPlaying,
        musicItem?.id,
        spinValue,
        startAnimation,
        stopAnimation,
    ]);

    const spin = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
    });

    const immersiveCoverHeight = useMemo(
        () => getImmersiveCoverHeight(windowWidth),
        [windowWidth],
    );
    const immersiveGestureHeight = Math.max(
        0,
        immersiveCoverHeight - safeAreaInsets.top - NAV_BAR_HEIGHT,
    );
    const immersiveContentPaddingTop = Math.max(
        rpx(160),
        immersiveCoverHeight -
            safeAreaInsets.top -
            NAV_BAR_HEIGHT +
            IMMERSIVE_CONTENT_TOP_GAP,
    );

    const artworkStyle = useMemo(() => {
        if (orientation === "vertical") {
            const size = isCircle ? COVER_SIZE : COVER_SIZE - rpx(30);
            return {
                width: size,
                height: size,
                borderRadius: isCircle ? size / 2 : rpx(16),
            };
        } else {
            const size = isCircle ? rpx(285) : rpx(260);
            return {
                width: size,
                height: size,
                borderRadius: isCircle ? size / 2 : rpx(12),
            };
        }
    }, [orientation, isCircle]);

    const containerStyle = useMemo(() => {
        return {
            width: "100%" as const,
            alignItems: "center" as const,
            marginTop: orientation === "vertical" ? rpx(16) : rpx(40),
        };
    }, [orientation]);

    const longPress = Gesture.LongPress()
        .onStart(() => {
            if (musicItem) {
                showPanel("CoverOptions", {
                    musicItem,
                });
            }
        })
        .runOnJS(true);

    const tap = Gesture.Tap()
        .onStart(() => {
            onTurnPageClick?.();
        })
        .runOnJS(true);

    const combineGesture = Gesture.Race(tap, longPress);

    if (orientation === "horizontal") {
        return (
            <View style={styles.horizontalRoot}>
                <View style={styles.horizontalCoverArea}>
                    <GestureDetector gesture={combineGesture}>
                        <Animated.View
                            collapsable={false}
                            style={[
                                styles.horizontalCoverWrapper,
                                isCircle ? { transform: [{ rotate: spin }] } : null,
                            ]}>
                            <FastImage
                                key={displayArtwork ?? "default"}
                                style={artworkStyle}
                                source={displayArtwork}
                                placeholderSource={ImgAsset.albumDefault}
                            />
                        </Animated.View>
                    </GestureDetector>
                </View>
                <View style={styles.horizontalOperations}>
                    <Operations />
                </View>
            </View>
        );
    }

    if (useImmersiveCover) {
        return (
            <View style={styles.verticalRoot} onLayout={onRootLayout}>
                <GestureDetector gesture={combineGesture}>
                    <Animated.View
                        style={[
                            styles.immersiveGestureArea,
                            { height: immersiveGestureHeight },
                        ]}
                    />
                </GestureDetector>
                <View
                    pointerEvents="box-none"
                    style={[
                        styles.immersiveForeground,
                        {
                            paddingTop: immersiveContentPaddingTop,
                        },
                    ]}>
                    <SongInfo showHeart immersive />
                    <View style={miniLyricLayout === "hidden" ? styles.hidden : null}>
                        <MiniLyric
                            onPress={onTurnPageClick}
                            layout={miniLyricLayout === "compact" ? "compact" : "normal"}
                            immersive
                            hidden={isExiting || !isActive}
                        />
                    </View>
                    <View style={{ flex: 1 }} />
                    <View onLayout={onOperationsLayout}>
                        <Operations />
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.verticalRoot} onLayout={onRootLayout}>
            <View style={containerStyle}>
                <GestureDetector gesture={combineGesture}>
                    <Animated.View
                        collapsable={false}
                        style={
                            isCircle
                                ? { transform: [{ rotate: spin }] }
                                : undefined
                        }>
                        <FastImage
                            key={displayArtwork ?? "default"}
                            style={artworkStyle}
                            source={displayArtwork}
                            placeholderSource={ImgAsset.albumDefault}
                        />
                    </Animated.View>
                </GestureDetector>
            </View>
            <SongInfo showHeart />
            <View style={miniLyricLayout === "hidden" ? styles.hidden : null}>
                <MiniLyric
                    onPress={onTurnPageClick}
                    layout={miniLyricLayout === "compact" ? "compact" : "normal"}
                    hidden={isExiting || !isActive}
                />
            </View>
            <View style={{ flex: 1 }} />
            <View onLayout={onOperationsLayout}>
                <Operations />
            </View>
        </View>
    );
}

const styles = {
    verticalRoot: {
        width: "100%" as const,
        flex: 1,
    },
    horizontalRoot: {
        width: "100%" as const,
        flex: 1,
    },
    horizontalCoverArea: {
        width: "100%" as const,
        flex: 1,
        justifyContent: "center" as const,
        alignItems: "center" as const,
        paddingHorizontal: rpx(24),
    },
    horizontalCoverWrapper: {
        justifyContent: "center" as const,
        alignItems: "center" as const,
    },
    horizontalOperations: {
        paddingHorizontal: rpx(12),
    },
    hidden: {
        display: "none" as const,
    },
    immersiveGestureArea: {
        position: "absolute" as const,
        top: 0,
        left: 0,
        right: 0,
        zIndex: 0,
    },
    immersiveForeground: {
        width: "100%" as const,
        flex: 1,
        zIndex: 1,
    },
} as const;
