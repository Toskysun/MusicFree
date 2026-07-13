/**
 * Custom tab bar for use with react-native-tab-view v4+.
 *
 * TabBar no longer supports top-level `renderLabel`; its dual-opacity
 * label stack also breaks pill backgrounds. Use this component via
 * `renderTabBar={() => <PillTabBar ... />}` instead.
 */
import React, { memo } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from "react-native";
import Color from "color";
import rpx, { fontRpx } from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import { fontWeightConst } from "@/constants/uiConst";

export type PillTabRoute = {
    key: string;
    title?: string;
};

export type PillTabBarVariant = "pill" | "underline";

interface IPillTabBarProps {
    routes: PillTabRoute[];
    index: number;
    onIndexChange: (index: number) => void;
    /** pill = capsule chip; underline = text + bottom bar (default: pill) */
    variant?: PillTabBarVariant;
    getTitle?: (route: PillTabRoute, index: number) => string;
    style?: StyleProp<ViewStyle>;
    contentContainerStyle?: StyleProp<ViewStyle>;
}

function PillTabBar(props: IPillTabBarProps) {
    const {
        routes,
        index,
        onIndexChange,
        variant = "pill",
        getTitle,
        style,
        contentContainerStyle,
    } = props;
    const colors = useColors();
    const activeBg = Color(colors.primary).alpha(0.2).toString();
    const activeBorder = Color(colors.primary).alpha(0.5).toString();

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.bar, style]}
            contentContainerStyle={[styles.barContent, contentContainerStyle]}>
            {routes.map((route, routeIndex) => {
                const focused = routeIndex === index;
                const title =
                    getTitle?.(route, routeIndex) ?? route.title ?? route.key;

                if (variant === "underline") {
                    return (
                        <Pressable
                            key={route.key}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: focused }}
                            onPress={() => onIndexChange(routeIndex)}
                            style={styles.underlineItem}>
                            <Text
                                numberOfLines={1}
                                style={[
                                    styles.underlineLabel,
                                    {
                                        fontWeight: focused
                                            ? fontWeightConst.bolder
                                            : fontWeightConst.medium,
                                        color: focused
                                            ? colors.primary
                                            : colors.textSecondary ??
                                              colors.text,
                                    },
                                ]}>
                                {title}
                            </Text>
                            <View
                                style={[
                                    styles.underlineIndicator,
                                    {
                                        backgroundColor: focused
                                            ? colors.primary
                                            : "transparent",
                                    },
                                ]}
                            />
                        </Pressable>
                    );
                }

                return (
                    <Pressable
                        key={route.key}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: focused }}
                        onPress={() => onIndexChange(routeIndex)}
                        style={[
                            styles.pillItem,
                            focused && {
                                backgroundColor: activeBg,
                                borderColor: activeBorder,
                            },
                        ]}>
                        <Text
                            numberOfLines={1}
                            style={[
                                styles.pillLabel,
                                {
                                    fontWeight: focused
                                        ? fontWeightConst.bolder
                                        : fontWeightConst.medium,
                                    color: focused
                                        ? colors.primary
                                        : colors.textSecondary ?? colors.text,
                                },
                            ]}>
                            {title}
                        </Text>
                    </Pressable>
                );
            })}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    bar: {
        flexGrow: 0,
        flexShrink: 0,
        backgroundColor: "transparent",
    },
    barContent: {
        paddingHorizontal: rpx(16),
        paddingTop: rpx(10),
        paddingBottom: rpx(6),
        alignItems: "center",
    },
    pillItem: {
        marginHorizontal: rpx(4),
        paddingVertical: rpx(8),
        paddingHorizontal: rpx(16),
        borderRadius: rpx(16),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "transparent",
        maxWidth: rpx(220),
    },
    pillLabel: {
        fontSize: fontRpx(26),
        textAlign: "center",
    },
    underlineItem: {
        minWidth: rpx(120),
        maxWidth: rpx(200),
        paddingHorizontal: rpx(12),
        paddingTop: rpx(12),
        paddingBottom: rpx(8),
        alignItems: "center",
    },
    underlineLabel: {
        fontSize: fontRpx(28),
        textAlign: "center",
    },
    underlineIndicator: {
        width: rpx(40),
        height: rpx(6),
        borderRadius: rpx(999),
        marginTop: rpx(10),
    },
});

export default memo(PillTabBar);
