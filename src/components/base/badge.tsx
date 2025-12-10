import React, { memo, useMemo } from "react";
import { StyleSheet, Text, View, StyleProp, ViewStyle } from "react-native";
import rpx from "@/utils/rpx";
import Color from "color";

export type BadgeType = "quality" | "vip" | "source" | "hires" | "master" | "atmos" | "flac24bit";

interface IBadgeProps {
    type?: BadgeType;
    children: string;
    style?: StyleProp<ViewStyle>;
}

function Badge(props: IBadgeProps) {
    const { type = "quality", children, style } = props;

    const badgeColors = useMemo(() => {
        let baseColor: string;
        switch (type) {
            case "vip":
                baseColor = "#d64541"; // 红色 VIP
                break;
            case "hires":
            case "master":
            case "atmos":
                baseColor = "#e6a23c"; // 金色高品质
                break;
            case "flac24bit":
                baseColor = "#409eff"; // 蓝色 CD/CD+
                break;
            case "quality":
                baseColor = "#67c23a"; // 绿色音质
                break;
            default:
                baseColor = "#909399";
        }
        return {
            textColor: baseColor,
            borderColor: baseColor,
            backgroundColor: Color(baseColor).alpha(0.15).toString(),
        };
    }, [type]);

    return (
        <View
            style={[
                styles.badge,
                {
                    borderColor: badgeColors.borderColor,
                    backgroundColor: badgeColors.backgroundColor,
                },
                style,
            ]}>
            <Text style={[styles.text, { color: badgeColors.textColor }]}>
                {children}
            </Text>
        </View>
    );
}

export default memo(Badge);

const styles = StyleSheet.create({
    badge: {
        paddingHorizontal: rpx(6),
        paddingVertical: rpx(1),
        borderRadius: rpx(4),
        borderWidth: 0.5,
        marginRight: rpx(6),
        justifyContent: "center",
        alignItems: "center",
    },
    text: {
        fontSize: rpx(16),
        fontWeight: "500",
    },
});
