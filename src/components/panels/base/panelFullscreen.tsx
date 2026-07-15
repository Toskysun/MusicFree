import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
    BackHandler,
    DeviceEventEmitter,
    Modal,
    NativeEventSubscription,
    StyleSheet,
    TouchableWithoutFeedback,
    View,
    ViewStyle,
} from "react-native";

import Animated, {
    Easing,
    EasingFunction,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import useColors from "@/hooks/useColors";
import { panelInfoStore } from "../usePanel";
import { vh } from "@/utils/rpx.ts";

const ANIMATION_EASING: EasingFunction = Easing.out(Easing.exp);
const ANIMATION_DURATION = 250;

const timingConfig = {
    duration: ANIMATION_DURATION,
    easing: ANIMATION_EASING,
};

interface IPanelFullScreenProps {
    hasMask?: boolean;
    children?: React.ReactNode;
    containerStyle?: ViewStyle;
    animationType?: "SlideToTop" | "Scale";
}

/**
 * Fullscreen panel rendered in its own Modal window.  Keeping the panel out of
 * the native-stack sibling tree is what makes native scrolling and controls
 * receive the same hit tests as the pixels drawn on screen on Android/Fabric.
 */
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
    const closingRef = useRef(false);

    const windowHeight = useMemo(() => vh(100), []);

    const unmountPanel = useCallback(() => {
        closingRef.current = false;
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

    const closePanel = useCallback(() => {
        if (closingRef.current) {
            return;
        }
        closingRef.current = true;
        snapPoint.value = withTiming(0, timingConfig, finished => {
            if (finished) {
                runOnJS(unmountPanel)();
            } else {
                closingRef.current = false;
            }
        });
    }, [snapPoint, unmountPanel]);

    useEffect(() => {
        closingRef.current = false;
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

    const panelAnimated = useAnimatedStyle(() => {
        if (animationType === "SlideToTop") {
            return {
                transform: [
                    {
                        translateY: (1 - snapPoint.value) * windowHeight,
                    },
                ],
            };
        }
        return {
            transform: [
                {
                    scale: 0.3 + snapPoint.value * 0.7,
                },
            ],
            opacity: snapPoint.value,
        };
    });

    const maskAnimated = useAnimatedStyle(() => ({
        opacity: snapPoint.value * 0.5,
    }));

    return (
        <Modal
            visible
            transparent
            animationType="none"
            statusBarTranslucent
            presentationStyle="overFullScreen"
            onRequestClose={closePanel}>
            <View style={style.rootHost} collapsable={false}>
                {hasMask ? (
                    <TouchableWithoutFeedback
                        accessibilityRole="button"
                        accessibilityLabel="关闭面板"
                        onPress={closePanel}>
                        <Animated.View
                            collapsable={false}
                            style={[style.mask, maskAnimated]}
                        />
                    </TouchableWithoutFeedback>
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
            </View>
        </Modal>
    );
}

const style = StyleSheet.create({
    rootHost: {
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
    },
    mask: {
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "#000",
        zIndex: 0,
    },
    wrapper: {
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        zIndex: 1,
        elevation: 16,
        flexDirection: "column",
    },
});
