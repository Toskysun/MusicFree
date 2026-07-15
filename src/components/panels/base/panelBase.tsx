import useColors from "@/hooks/useColors";
import useOrientation from "@/hooks/useOrientation";
import rpx, { vh } from "@/utils/rpx";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Config from "@/core/appConfig";
import {
    BackHandler,
    DeviceEventEmitter,
    Dimensions,
    Keyboard,
    Modal,
    NativeEventSubscription,
    Platform,
    StyleSheet,
    TouchableWithoutFeedback,
    View,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { panelInfoStore } from "../usePanel";

const ANIMATION_EASING: EasingFunction = Easing.out(Easing.exp);
const ANIMATION_DURATION = 250;

const timingConfig = {
    duration: ANIMATION_DURATION,
    easing: ANIMATION_EASING,
};

interface IPanelBaseProps {
    keyboardAvoidBehavior?: "height" | "padding" | "position" | "none";
    height?: number;
    // 定位方式
    positionMethod?: "top" | "bottom";
    renderBody: (loading: boolean) => React.ReactNode;
}

/**
 * Bottom sheet panel.
 *
 * Panels are rendered in a Modal rather than as a sibling of native-stack.  A
 * native-stack screen is a native window on Android/Fabric; an absolute React
 * sibling can therefore be painted above it while still losing the hit test.
 * Modal gives the panel its own Dialog window, so the dimmer and native
 * controls (notably Slider and TextInput) share the same touch surface.
 */
export default function (props: IPanelBaseProps) {
    const {
        height = vh(60),
        renderBody,
        keyboardAvoidBehavior,
        positionMethod = "bottom",
    } = props;
    const keyboardAvoidMode =
        Config.getConfig("basic.keyboardAvoidMode") ?? "auto";
    const snapPoint = useSharedValue(0);
    const keyboardHeight = useSharedValue(0);

    const colors = useColors();
    const [loading, setLoading] = useState(true);
    const timerRef = useRef<any>(null);
    const safeAreaInsets = useSafeAreaInsets();
    const orientation = useOrientation();
    const useAnimatedBase = useMemo(
        () => (orientation === "horizontal" ? rpx(750) : height),
        [orientation, height],
    );

    const backHandlerRef = useRef<NativeEventSubscription | null>(null);
    const hideCallbackRef = useRef<Function[]>([]);
    const closingRef = useRef(false);

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
                // Animation interrupted — allow another close attempt.
                closingRef.current = false;
            }
        });
    }, [snapPoint, unmountPanel]);

    useEffect(() => {
        closingRef.current = false;
        snapPoint.value = withTiming(1, timingConfig);

        timerRef.current = setTimeout(() => {
            if (loading) {
                setLoading(false);
            }
        }, 400);

        if (backHandlerRef.current) {
            backHandlerRef.current.remove();
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

        const keyboardShowEvent =
            Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const keyboardHideEvent =
            Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

        const keyboardShowListener = Keyboard.addListener(
            keyboardShowEvent,
            e => {
                if (keyboardAvoidBehavior !== "none") {
                    if (keyboardAvoidMode === "off") {
                        keyboardHeight.value = withTiming(0, {
                            duration: Platform.OS === "ios" ? 250 : 150,
                        });
                        return;
                    }
                    const windowHeight = Dimensions.get("window").height;
                    const keyboardTopY =
                        typeof e.endCoordinates.screenY === "number"
                            ? e.endCoordinates.screenY
                            : windowHeight - e.endCoordinates.height;
                    const effectiveKeyboardHeight = Math.max(
                        0,
                        windowHeight - keyboardTopY,
                    );
                    const targetHeight =
                        keyboardAvoidMode === "manual"
                            ? e.endCoordinates.height
                            : Math.min(
                                e.endCoordinates.height,
                                effectiveKeyboardHeight,
                            );
                    keyboardHeight.value = withTiming(targetHeight, {
                        duration: Platform.OS === "ios" ? 250 : 150,
                    });
                }
            },
        );

        const keyboardHideListener = Keyboard.addListener(
            keyboardHideEvent,
            () => {
                keyboardHeight.value = withTiming(0, {
                    duration: Platform.OS === "ios" ? 250 : 150,
                });
            },
        );

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            if (backHandlerRef.current) {
                backHandlerRef.current?.remove();
                backHandlerRef.current = null;
            }
            listenerSubscription.remove();
            keyboardShowListener.remove();
            keyboardHideListener.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const panelAnimated = useAnimatedStyle(() => {
        const baseTransform =
            orientation === "vertical"
                ? { translateY: (1 - snapPoint.value) * useAnimatedBase }
                : { translateX: (1 - snapPoint.value) * useAnimatedBase };

        return {
            transform: [baseTransform, { translateY: -keyboardHeight.value }],
        };
    }, [orientation, useAnimatedBase]);

    const maskAnimated = useAnimatedStyle(() => ({
        // Keep the mask opaque for hit testing and animate only its opacity.
        // This is the same structure used by Dialog and avoids stacking a
        // static 0.5 opacity with an animated value.
        opacity: snapPoint.value * 0.5,
    }));

    const mountPanel = useCallback(() => {
        setLoading(false);
    }, []);

    useAnimatedReaction(
        () => snapPoint.value,
        (result, prevResult) => {
            if (
                ((prevResult !== null && result > prevResult) ||
                    prevResult === null) &&
                result > 0.8
            ) {
                runOnJS(mountPanel)();
            }
        },
        [],
    );

    const windowHeight = Dimensions.get("window").height;
    const verticalPositionStyle =
        positionMethod === "top"
            ? {
                top: Math.max(
                    safeAreaInsets.top,
                    windowHeight - height - safeAreaInsets.bottom,
                ),
                height,
            }
            : {
                bottom: 0,
                height,
            };

    return (
        <Modal
            visible
            transparent
            animationType="none"
            statusBarTranslucent
            presentationStyle="overFullScreen"
            onRequestClose={closePanel}>
            <View style={style.rootHost} collapsable={false}>
                <TouchableWithoutFeedback
                    accessibilityRole="button"
                    accessibilityLabel="关闭面板"
                    onPress={closePanel}>
                    <Animated.View
                        collapsable={false}
                        style={[style.mask, maskAnimated]}
                    />
                </TouchableWithoutFeedback>

                <Animated.View
                    pointerEvents="auto"
                    collapsable={false}
                    style={[
                        style.wrapper,
                        orientation === "horizontal"
                            ? {
                                height: vh(100) - safeAreaInsets.top,
                                ...style.bottomPosition,
                            }
                            : verticalPositionStyle,
                        {
                            backgroundColor: colors.backdrop,
                        },
                        panelAnimated,
                    ]}>
                    <View style={style.sheetBody} pointerEvents="auto">
                        {renderBody(loading)}
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const style = StyleSheet.create({
    // Match dialog backContainer: full-window host in the app overlay tree.
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
        width: rpx(750),
        right: 0,
        borderTopLeftRadius: rpx(28),
        borderTopRightRadius: rpx(28),
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 1,
        elevation: 16,
    },
    sheetBody: {
        flex: 1,
        width: "100%",
    },
    bottomPosition: {
        bottom: 0,
    },
    bottomPositionDynamic: {
        bottom: 0,
    },
});
