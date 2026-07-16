import React from "react";
import {
    StyleProp,
    StyleSheet,
    TouchableOpacity,
    ViewStyle,
} from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "./themeText";
import { iconSizeConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import Icon, { IIconName } from "@/components/base/icon.tsx";

interface IProps {
    icon: IIconName;
    onPress?: () => void;
    containerStyle?: StyleProp<ViewStyle>;
    children?: string;
}

// Playlist actions render inside PanelBase's native Modal. Use React Native's
// responder touchable so Android does not depend on the Activity's RNGH root.
export default function (props: IProps) {
    const { icon, children, onPress, containerStyle } = props;
    const colors = useColors();

    return (
        <TouchableOpacity
            activeOpacity={0.7}
            style={[style.container, containerStyle]}
            onPress={onPress}>
            <Icon name={icon} size={iconSizeConst.light} color={colors.text} />
            <ThemeText style={style.text} fontSize={"content"}>
                {children}
            </ThemeText>
        </TouchableOpacity>
    );
}

const style = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: rpx(16),
        paddingVertical: rpx(8),
    },
    text: {
        marginLeft: rpx(8),
    },
});
