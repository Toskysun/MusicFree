import React, { useCallback, useEffect, useMemo, useRef } from "react";
import rpx from "@/utils/rpx";
import { ImgAsset } from "@/constants/assetsConst";
import FastImage from "@/components/base/fastImage";
import useOrientation from "@/hooks/useOrientation";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useCurrentMusic, useMusicState, MusicState } from "@/core/trackPlayer";
import globalStyle from "@/constants/globalStyle";
import { Animated, Easing, View } from "react-native";
import Operations from "./operations";
import { showPanel } from "@/components/panels/usePanel.ts";
import { useAppConfig } from "@/core/appConfig";

const ROTATION_DURATION = 25000; // 25秒转一圈

interface IProps {
    onTurnPageClick?: () => void;
}

export default function AlbumCover(props: IProps) {
    const { onTurnPageClick } = props;

    const musicItem = useCurrentMusic();
    const orientation = useOrientation();
    const coverStyle = useAppConfig("theme.coverStyle") ?? "square";
    const musicState = useMusicState();
    const isPlaying = musicState === MusicState.Playing;
    const isCircle = coverStyle === "circle";

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
            const size = isCircle ? rpx(600) : rpx(500);
            return {
                width: size,
                height: size,
                borderRadius: isCircle ? size / 2 : rpx(16),
            };
        } else {
            const size = isCircle ? rpx(320) : rpx(260);
            return {
                width: size,
                height: size,
                borderRadius: isCircle ? size / 2 : rpx(12),
            };
        }
    }, [orientation, isCircle]);

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

    return (
        <>
            <GestureDetector gesture={combineGesture}>
                <View style={globalStyle.fullCenter}>
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
                </View>
            </GestureDetector>
            <Operations />
        </>
    );
}
