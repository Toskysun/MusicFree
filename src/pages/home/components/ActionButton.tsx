import ThemeText from "@/components/base/themeText";
import useColors from "@/hooks/useColors";
import rpx from "@/utils/rpx";
import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import Icon, { IIconName } from "@/components/base/icon.tsx";
import Color from "color";

interface IActionButtonProps {
    iconName: IIconName;
    iconColor?: string;
    accentColor?: string;
    title: string;
    action?: () => void;
    style?: StyleProp<ViewStyle>;
}

export default function ActionButton(props: IActionButtonProps) {
    const { iconName, iconColor, accentColor, title, action, style } = props;
    const colors = useColors();
    const accent = accentColor ?? colors.accentWarm ?? colors.primary;
    return (
        <TouchableOpacity
            activeOpacity={0.72}
            onPress={action}
            style={[
                styles.wrapper,
                {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                },
                style,
            ]}>
            <View
                style={[
                    styles.iconFrame,
                    { backgroundColor: Color(accent).alpha(0.16).toString() },
                ]}>
                <Icon
                    accessible={false}
                    name={iconName}
                    color={iconColor ?? accent}
                    size={rpx(40)}
                />
            </View>
            <ThemeText
                accessible={false}
                fontSize="subTitle"
                fontWeight="semibold"
                numberOfLines={1}
                style={styles.text}>
                {title}
            </ThemeText>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        minHeight: rpx(104),
        borderRadius: rpx(20),
        borderWidth: StyleSheet.hairlineWidth,
        flexGrow: 1,
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: rpx(18),
    },
    text: {
        flex: 1,
        marginLeft: rpx(14),
    },
    iconFrame: {
        width: rpx(62),
        height: rpx(62),
        borderRadius: rpx(31),
        alignItems: "center",
        justifyContent: "center",
    },
});
