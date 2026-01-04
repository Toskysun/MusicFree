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
    disableMaskedView?: boolean;
}

export default function AlbumCover(props: IProps) {
    const { onTurnPageClick, disableMaskedView } = props;

    const musicItem = useCurrentMusic();
    const orientation = useOrientation();
    const { height: windowHeight, width: windowWidth } = useWindowDimensions();
    const safeAreaInsets = useSafeAreaInsets();
    const coverStyle = useAppConfig("theme.coverStyle") ?? "square";
    const musicState = useMusicState();
    const isPlaying = musicState === MusicState.Playing;
    const isCircle = coverStyle === "circle";

    const [containerHeight, setContainerHeight] = useState<number | null>(null);
    const [operationsBottom, setOperationsBottom] = useState<number | null>(null);

    const usableWindowHeight = windowHeight - safeAreaInsets.top - safeAreaInsets.bottom;
    const usableAspectRatio = usableWindowHeight / Math.max(1, windowWidth);
    const baseMiniLyricLayout = useMemo(() => {
        if (orientation !== "vertical") {
            return "normal" as const;
        }
        return usableAspectRatio < 1.9 ? ("compact" as const) : ("normal" as const);
    }, [orientation, usableAspectRatio]);
    const [miniLyricLayout, setMiniLyricLayout] = useState<"normal" | "compact" | "hidden">(baseMiniLyricLayout);

    useEffect(() => {
        setMiniLyricLayout(baseMiniLyricLayout);
    }, [baseMiniLyricLayout, windowHeight, windowWidth, safeAreaInsets.bottom, safeAreaInsets.top]);

    useEffect(() => {
        if (orientation !== "vertical") {
            return;
        }
        if (containerHeight === null || operationsBottom === null) {
            return;
        }
        if (operationsBottom > containerHeight + rpx(2)) {
            setOperationsBottom(null);
            setMiniLyricLayout((current) => {
                if (current === "normal") return "compact";
                if (current === "compact") return "hidden";
                return "hidden";
            });
        }
    }, [
        containerHeight,
        operationsBottom,
        orientation,
    ]);

    // 旋转动画
    const spinValue = useRef(new Animated.Value(0)).current;
    const animationRef = useRef<Animated.CompositeAnimation | null>(null);
    const isAnimatingRef = useRef(false);

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
        if (isPlaying && isCircle) {
            startAnimation();
        } else {
            stopAnimation();
        }
    }, [isPlaying, isCircle, startAnimation, stopAnimation]);

    // 切换歌曲时重置
    useEffect(() => {
        stopAnimation();
        spinValue.setValue(0);
        if (isPlaying && isCircle) {
            startAnimation();
        }
    }, [musicItem?.id]);

    const spin = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
    });

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
            if (musicItem?.artwork) {
                showPanel("ImageViewer", {
                    url: musicItem.artwork,
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
                            style={[
                                styles.horizontalCoverWrapper,
                                isCircle ? { transform: [{ rotate: spin }] } : null,
                            ]}>
                            <FastImage
                                style={artworkStyle}
                                source={musicItem?.artwork}
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

    return (
        <View
            style={styles.verticalRoot}
            onLayout={(event) => {
                setContainerHeight(event.nativeEvent.layout.height);
            }}>
            <View style={containerStyle}>
                <GestureDetector gesture={combineGesture}>
                    <Animated.View
                        style={
                            isCircle
                                ? { transform: [{ rotate: spin }] }
                                : undefined
                        }>
                        <FastImage
                            style={artworkStyle}
                            source={musicItem?.artwork}
                            placeholderSource={ImgAsset.albumDefault}
                        />
                    </Animated.View>
                </GestureDetector>
            </View>
            <SongInfo showHeart />
            <View style={miniLyricLayout === "hidden" ? styles.hidden : null}>
                <MiniLyric
                    onPress={onTurnPageClick}
                    disableMaskedView={disableMaskedView}
                    layout={miniLyricLayout === "compact" ? "compact" : "normal"}
                />
            </View>
            <View style={{ flex: 1 }} />
            <View
                onLayout={(event) => {
                    const layout = event.nativeEvent.layout;
                    setOperationsBottom(layout.y + layout.height);
                }}>
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
} as const;
