import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
    BackHandler,
    DeviceEventEmitter,
    NativeEventSubscription,
    Pressable,
    StyleSheet,
    ViewStyle,
} from "react-native";

import Animated, {
    Easing,
    EasingFunction,
    runOnJS,
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import useColors from "@/hooks/useColors";
import { panelInfoStore } from "../usePanel";
import { vh } from "@/utils/rpx.ts";

const ANIMATION_EASING: EasingFunction = Easing.out(Easing.exp);
const ANIMATION_DURATION = 250;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const timingConfig = {
    duration: ANIMATION_DURATION,
    easing: ANIMATION_EASING,
};

interface IPanelFullScreenProps {
    // 有遮罩
    hasMask?: boolean;
    // 内容
    children?: React.ReactNode;
    // 内容区样式
    containerStyle?: ViewStyle;

    animationType?: "SlideToTop" | "Scale";
}

export default function (props: IPanelFullScreenProps) {
    const {
        hasMask,
        containerStyle,
        children,
        animationType = "SlideToTop",
    } = props;
    const snapPoint = useSharedValue(0);

    const colors = useColors();

    const backHandlerRef = useRef<NativeEventSubscription | null>(null);

    const hideCallbackRef = useRef<Function[]>([]);

    const windowHeight = useMemo(() => vh(100), []);

    const closePanel = useCallback(() => {
        snapPoint.value = withTiming(0, timingConfig);
    }, [snapPoint]);

    useEffect(() => {
        // Drive open animation via shared value; styles read it directly
        // (avoid withTiming inside useAnimatedStyle which can stall).
        snapPoint.value = withTiming(1, timingConfig);

        if (backHandlerRef.current) {
            backHandlerRef.current?.remove();
            backHandlerRef.current = null;
        }
        backHandlerRef.current = BackHandler.addEventListener(
            "hardwareBackPress",
            () => {
                closePanel();
                return true;
            },
        );

        const listenerSubscription = DeviceEventEmitter.addListener(
            "hidePanel",
            (callback?: () => void) => {
                if (callback) {
                    hideCallbackRef.current.push(callback);
                }
                closePanel();
            },
        );

        return () => {
            if (backHandlerRef.current) {
                backHandlerRef.current?.remove();
                backHandlerRef.current = null;
            }
            listenerSubscription.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const maskAnimated = useAnimatedStyle(() => {
        return {
            opacity: snapPoint.value * 0.5,
        };
    });

    const panelAnimated = useAnimatedStyle(() => {
        if (animationType === "SlideToTop") {
            return {
                transform: [
                    {
                        translateY: (1 - snapPoint.value) * windowHeight,
                    },
                ],
            };
        } else {
            return {
                transform: [
                    {
                        scale: 0.3 + snapPoint.value * 0.7,
                    },
                ],
                opacity: snapPoint.value,
            };
        }
    });

    const unmountPanel = useCallback(() => {
        // Prefer direct panel-to-panel switch over null intermediate state.
        // Fabric can crash on rapid remove/insert of non-ViewGroup hosts.
        const callbacks = hideCallbackRef.current.slice();
        hideCallbackRef.current = [];
        if (callbacks.length > 0) {
            callbacks.forEach(cb => cb?.());
            return;
        }
        panelInfoStore.setValue({
            name: null,
            payload: null,
        });
    }, []);

    useAnimatedReaction(
        () => snapPoint.value,
        (result, prevResult) => {
            if (
                prevResult !== null &&
                prevResult !== undefined &&
                result < prevResult &&
                result === 0
            ) {
                runOnJS(unmountPanel)();
            }
        },
        [],
    );
    return (
        <>
            {hasMask ? (
                <AnimatedPressable
                    accessibilityRole="button"
                    accessibilityLabel="关闭面板"
                    style={[style.maskWrapper, style.mask, maskAnimated]}
                    onPress={closePanel}
                />
            ) : null}
            <Animated.View
                collapsable={false}
                pointerEvents="auto"
                style={[
                    style.wrapper,
                    !hasMask
                        ? {
                            backgroundColor: colors.background,
                        }
                        : null,
                    panelAnimated,
                    containerStyle,
                ]}>
                {children}
            </Animated.View>
        </>
    );
}

const style = StyleSheet.create({
    maskWrapper: {
        position: "absolute",
        width: "100%",
        height: "100%",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 15000,
    },
    mask: {
        // Opaque fill; opacity animated via maskAnimated (iOS needs non-clear hit target)
        backgroundColor: "#000",
    },
    wrapper: {
        position: "absolute",
        width: "100%",
        height: "100%",
        bottom: 0,
        right: 0,
        zIndex: 15010,
        flexDirection: "column",
    },
    kbContainer: {
        zIndex: 15010,
    },
});
