import { useI18N } from "@/core/i18n";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import rpx from "@/utils/rpx";
import React from "react";
import { StyleSheet, View } from "react-native";
import ActionButton from "../ActionButton";
import useColors from "@/hooks/useColors";

export default function Operations() {
    const navigate = useNavigate();
    const { t } = useI18N();
    const colors = useColors();

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

    return (
        <View style={styles.container}>
            {actionButtons.map(action => (
                <ActionButton
                    style={styles.actionButtonStyle}
                    key={action.title}
                    {...action}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        paddingHorizontal: rpx(24),
        marginTop: rpx(20),
        marginBottom: rpx(12),
        flexDirection: "row",
        flexWrap: "wrap",
        gap: rpx(14),
    },
    actionButtonStyle: {
        width: rpx(344),
    },
});
