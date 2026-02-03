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
    NativeEventSubscription,
    Platform,
    Pressable,
    StyleSheet,
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
import NativeUtils from "@/native/utils";

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
    renderBody: (loading: boolean) => JSX.Element;
}

export default function (props: IPanelBaseProps) {
    const { 
        height = vh(60),
        renderBody,
        keyboardAvoidBehavior,
        positionMethod = "bottom",
    } = props;
    const keyboardAvoidMode = Config.getConfig("basic.keyboardAvoidMode") ?? "auto";
    const snapPoint = useSharedValue(0);
    const keyboardHeight = useSharedValue(0);

    const colors = useColors();
    const [loading, setLoading] = useState(true); // 是否处于弹出状态
    const timerRef = useRef<any>();
    const safeAreaInsets = useSafeAreaInsets();
    const orientation = useOrientation();
    const useAnimatedBase = useMemo(
        () => (orientation === "horizontal" ? rpx(750) : height),
        [orientation, height],
    );

    const backHandlerRef = useRef<NativeEventSubscription>();

    const hideCallbackRef = useRef<Function[]>([]);

    useEffect(() => {
        snapPoint.value = withTiming(1, timingConfig);

        timerRef.current = setTimeout(() => {
            if (loading) {
                // 兜底
                setLoading(false);
            }
        }, 400);
        if (backHandlerRef.current) {
            backHandlerRef.current.remove();
            backHandlerRef.current = undefined;
        }
        backHandlerRef.current = BackHandler.addEventListener(
            "hardwareBackPress",
            () => {
                snapPoint.value = withTiming(0, timingConfig);
                return true;
            },
        );

        const listenerSubscription = DeviceEventEmitter.addListener(
            "hidePanel",
            (callback?: () => void) => {
                if (callback) {
                    hideCallbackRef.current.push(callback);
                }
                snapPoint.value = withTiming(0, timingConfig);
            },
        );

        // 监听键盘事件
        const keyboardShowEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const keyboardHideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

        const keyboardShowListener = Keyboard.addListener(keyboardShowEvent, (e) => {
            if (keyboardAvoidBehavior !== "none") {
                if (keyboardAvoidMode === "off") {
                    keyboardHeight.value = withTiming(0, {
                        duration: Platform.OS === "ios" ? 250 : 150,
                    });
                    return;
                }
                const windowHeight = Dimensions.get("window").height;
                const keyboardTopY = typeof e.endCoordinates.screenY === "number"
                    ? e.endCoordinates.screenY
                    : windowHeight - e.endCoordinates.height;
                const effectiveKeyboardHeight = Math.max(0, windowHeight - keyboardTopY);
                const targetHeight = keyboardAvoidMode === "manual"
                    ? e.endCoordinates.height
                    : Math.min(e.endCoordinates.height, effectiveKeyboardHeight);
                keyboardHeight.value = withTiming(targetHeight, {
                    duration: Platform.OS === "ios" ? 250 : 150,
                });
            }
        });

        const keyboardHideListener = Keyboard.addListener(keyboardHideEvent, () => {
            keyboardHeight.value = withTiming(0, {
                duration: Platform.OS === "ios" ? 250 : 150,
            });
        });

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            if (backHandlerRef.current) {
                backHandlerRef.current?.remove();
                backHandlerRef.current = undefined;
            }
            listenerSubscription.remove();
            keyboardShowListener.remove();
            keyboardHideListener.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const maskAnimated = useAnimatedStyle(() => {
        return {
            opacity: snapPoint.value * 0.5,
        };
    });

    const panelAnimated = useAnimatedStyle(() => {
        const baseTransform = orientation === "vertical"
            ? { translateY: (1 - snapPoint.value) * useAnimatedBase }
            : { translateX: (1 - snapPoint.value) * useAnimatedBase };

        return {
            transform: [
                baseTransform,
                { translateY: -keyboardHeight.value },
            ],
        };
    }, [orientation]);

    const mountPanel = useCallback(() => {
        setLoading(false);
    }, []);

    const unmountPanel = useCallback(() => {
        panelInfoStore.setValue({
            name: null,
            payload: null,
        });
        hideCallbackRef.current.forEach(cb => cb?.());
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

            if (prevResult && result < prevResult && result === 0) {
                runOnJS(unmountPanel)();
            }
        },
        [],
    );

    const panelBody = (
        <Animated.View
            style={[
                style.wrapper,
                orientation === "horizontal" ? {
                    height: vh(100) - safeAreaInsets.top,
                    ...style.bottomPosition,
                } : {
                    top: positionMethod === "top" ? (NativeUtils.getWindowDimensions().height + safeAreaInsets.top) - height - safeAreaInsets.bottom : undefined,

                    bottom: positionMethod === "bottom" ? 0 : undefined,
                    height: height,
                },
                {
                    backgroundColor: colors.backdrop,
                },
                panelAnimated,
            ]}>
            {renderBody(loading)}
        </Animated.View>
    );

    return (
        <>
            <Pressable
                style={style.maskWrapper}
                onPress={() => {
                    snapPoint.value = withTiming(0, timingConfig);
                }}>
                <Animated.View
                    style={[style.maskWrapper, style.mask, maskAnimated]}
                />
            </Pressable>
            {panelBody}
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
        backgroundColor: "#000",
        opacity: 0.5,
    },
    wrapper: {
        position: "absolute",
        width: rpx(750),
        right: 0,
        borderTopLeftRadius: rpx(28),
        borderTopRightRadius: rpx(28),
        zIndex: 15010,
    },
    bottomPosition: {
        bottom: 0,
    },
    bottomPositionDynamic: {
        bottom: 0,
    },
});
