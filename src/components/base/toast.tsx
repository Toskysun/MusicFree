import { fontSizeConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import rpx from "@/utils/rpx";
import { GlobalState } from "@/utils/stateMapper";
import { nanoid } from "@/utils/nanoid";
import React, { useCallback, useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
    Directions,
    Gesture,
    GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
    cancelAnimation,
    Easing,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";
import Icon from "@/components/base/icon.tsx";

export interface IToastConfig {
    /** 类型 */
    type: "success" | "warn";
    /** 消息内容 */
    message?: string;
    /** 行动点 */
    actionText?: string;
    /** 行动点按钮行为 */
    onActionClick?: () => void;
    /** 展示时间 */
    duration?: number;
}

type IToastConfigInner = IToastConfig & {
    id: string;
};

const toastQueue: IToastConfigInner[] = [];

const fixedTop = rpx(250);

const activeToastStore = new GlobalState<IToastConfigInner | null>(null);

const typeConfig = {
    success: {
        name: "check-circle",
        color: "#457236",
    },
    warn: {
        name: "exclamation-circle",
        color: "#de7622",
    },
} as const;

/** Plain config — avoid sharing non-worklet Easing from commonConst into Reanimated. */
const TOAST_IN = { duration: 280, easing: Easing.out(Easing.cubic) };
const TOAST_OUT = { duration: 220, easing: Easing.in(Easing.cubic) };

export function ToastBaseComponent() {
    const activeToast = activeToastStore.useValue();
    const colors = useColors();
    // Track which toast id the current animation belongs to (avoid double-fire).
    const animatingIdRef = useRef<string | null>(null);

    const toastAnim = useSharedValue(0);

    const setNextToast = useCallback(() => {
        animatingIdRef.current = null;
        activeToastStore.setValue(toastQueue.shift() || null);
    }, []);

    useEffect(() => {
        if (!activeToast) {
            cancelAnimation(toastAnim);
            toastAnim.value = 0;
            animatingIdRef.current = null;
            return;
        }

        // Same toast already animating — do not restart (prevents re-entrancy).
        if (animatingIdRef.current === activeToast.id) {
            return;
        }
        animatingIdRef.current = activeToast.id;

        const holdMs = Math.max(400, activeToast.duration ?? 1200);

        cancelAnimation(toastAnim);
        // Reset without animation so the next withTiming always has a clean start.
        toastAnim.value = 0;
        toastAnim.value = withTiming(1, TOAST_IN, finishedIn => {
            "worklet";
            if (!finishedIn) {
                return;
            }
            toastAnim.value = withDelay(
                holdMs,
                withTiming(0, TOAST_OUT, finishedOut => {
                    "worklet";
                    if (finishedOut) {
                        runOnJS(setNextToast)();
                    }
                }),
            );
        });
        // Depend only on toast id — never on toastAnim (SharedValue identity churn).
        // eslint-disable-next-line react-hooks/exhaustive-deps -- toastAnim is stable SV
    }, [activeToast?.id, setNextToast]);

    const dismissCurrentToast = useCallback(() => {
        cancelAnimation(toastAnim);
        toastAnim.value = withTiming(0, TOAST_OUT, finished => {
            "worklet";
            if (finished) {
                runOnJS(setNextToast)();
            }
        });
    }, [setNextToast, toastAnim]);

    const flingGesture = Gesture.Fling()
        .direction(Directions.UP)
        .onEnd(() => {
            dismissCurrentToast();
        })
        .runOnJS(true);

    const toastAnimStyle = useAnimatedStyle(() => {
        return {
            transform: [
                {
                    translateY: (toastAnim.value - 1) * fixedTop,
                },
            ],
            opacity: toastAnim.value,
        };
    });

    if (!activeToast) {
        return null;
    }

    return (
        <GestureDetector gesture={flingGesture}>
            <View style={styles.container} pointerEvents="box-none">
                <Animated.View
                    style={[
                        styles.contentContainer,
                        {
                            backgroundColor: colors.notification,
                            // No elevation/shadow: avoids dark rings under wallpaper
                            // and skips extra native shadow updates during anim.
                            shadowColor: "transparent",
                            shadowOpacity: 0,
                            elevation: 0,
                        },
                        toastAnimStyle,
                    ]}>
                    <Icon
                        size={fontSizeConst.appbar}
                        name={typeConfig[activeToast.type].name}
                        color={typeConfig[activeToast.type].color}
                    />
                    <Text
                        numberOfLines={2}
                        style={[styles.text, { color: colors.text }]}>
                        {activeToast.message}
                    </Text>
                    {activeToast.actionText && activeToast.onActionClick ? (
                        <Pressable
                            style={[
                                styles.actionTextContainer,
                                { backgroundColor: colors.primary },
                            ]}
                            onPress={activeToast.onActionClick}>
                            <Text style={styles.actionText} numberOfLines={1}>
                                {activeToast.actionText}
                            </Text>
                        </Pressable>
                    ) : null}
                </Animated.View>
            </View>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    container: {
        position: "absolute",
        top: rpx(128),
        width: "100%",
        alignItems: "center",
        height: rpx(100),
        zIndex: 20000,
    },
    contentContainer: {
        width: rpx(688),
        height: "100%",
        borderRadius: rpx(12),
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: rpx(24),
        shadowOffset: {
            width: 0,
            height: 0,
        },
        shadowRadius: 0,
    },
    text: {
        fontSize: fontSizeConst.content,
        includeFontPadding: false,
        flex: 1,
        marginLeft: rpx(24),
    },
    actionText: {
        fontSize: fontSizeConst.content,
        includeFontPadding: false,
        color: "white",
    },
    actionTextContainer: {
        marginLeft: rpx(24),
        width: rpx(120),
        paddingHorizontal: rpx(12),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: rpx(30),
        height: rpx(58),
    },
});

export function showToast(config: IToastConfig) {
    const id = nanoid();
    const _config = {
        ...config,
        id,
    };
    const activeToast = activeToastStore.getValue();
    if (!activeToast) {
        activeToastStore.setValue(_config);
    } else {
        toastQueue.push(_config);
    }

    return id;
}
