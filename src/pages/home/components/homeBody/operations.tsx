import { useI18N } from "@/core/i18n";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import rpx from "@/utils/rpx";
import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import ActionButton from "../ActionButton";
import useColors from "@/hooks/useColors";

const HORIZONTAL_PADDING = rpx(24);
const BUTTON_GAP = rpx(14);

export default function Operations() {
    const navigate = useNavigate();
    const { t } = useI18N();
    const colors = useColors();
    const [containerWidth, setContainerWidth] = useState(0);

    const actionButtons = [
        {
            iconName: "fire",
            accentColor: colors.accentWarm,
            title: t("home.recommendSheet"),
            action() {
                navigate(ROUTE_PATH.RECOMMEND_SHEETS);
            },
        },
        {
            iconName: "trophy",
            accentColor: colors.accentCool,
            title: t("home.topList"),
            action() {
                navigate(ROUTE_PATH.TOP_LIST);
            },
        },
        {
            iconName: "clock-outline",
            accentColor: colors.info,
            title: t("home.playHistory"),
            action() {
                navigate(ROUTE_PATH.HISTORY);
            },
        },
        {
            iconName: "folder-music-outline",
            accentColor: colors.success,
            title: t("home.localMusic"),
            action() {
                navigate(ROUTE_PATH.LOCAL);
            },
        },
    ] as const;

    const buttonWidth = useMemo(() => {
        if (!containerWidth) return undefined;
        const contentWidth = Math.max(0, containerWidth - HORIZONTAL_PADDING * 2);
        return Math.max(0, (contentWidth - BUTTON_GAP) / 2);
    }, [containerWidth]);

    return (
        <View
            style={styles.container}
            onLayout={e => {
                const nextWidth = e.nativeEvent.layout.width;
                setContainerWidth(prev =>
                    Math.abs(prev - nextWidth) < 0.5 ? prev : nextWidth,
                );
            }}>
            {actionButtons.map(action => (
                <View
                    key={action.title}
                    style={[
                        styles.actionButtonItem,
                        buttonWidth !== undefined ? { width: buttonWidth } : null,
                    ]}>
                    <ActionButton
                        style={styles.actionButtonStyle}
                        {...action}
                    />
                </View>
                
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        paddingHorizontal: HORIZONTAL_PADDING,
        marginTop: rpx(20),
        marginBottom: rpx(12),
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
    },
    actionButtonItem: {
        marginBottom: BUTTON_GAP,
    },
    actionButtonStyle: {
        width: "100%",
        flexGrow: 0,
    },
});
