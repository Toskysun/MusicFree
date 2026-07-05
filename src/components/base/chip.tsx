import React, { ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, ViewStyle } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "./themeText";
import useColors from "@/hooks/useColors";
import IconButton from "./iconButton";
import useCardStyle from "@/hooks/useCardStyle";

interface IChipProps {
    containerStyle?: StyleProp<ViewStyle>;
    children?: ReactNode;
    onPress?: () => void;
    onClose?: () => void;
}
export default function Chip(props: IChipProps) {
    const { containerStyle, children, onPress, onClose } = props;
    const colors = useColors();
    const cardStyle = useCardStyle({
        borderWidth: StyleSheet.hairlineWidth,
        elevation: 1,
        shadowOpacity: 0.06,
    });

    return (
        <Pressable
            onPress={onPress}
            style={[
                styles.container,
                {
                    backgroundColor: colors.surface,
                },
                cardStyle,
                containerStyle,
            ]}>
            {typeof children === "string" ? (
                <ThemeText fontSize="subTitle" numberOfLines={1}>
                    {children}
                </ThemeText>
            ) : (
                children
            )}
            <IconButton
                onPress={onClose}
                name="x-mark"
                sizeType="small"
                style={styles.icon}
            />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        height: rpx(56),
        paddingHorizontal: rpx(18),
        borderRadius: rpx(28),
        borderWidth: StyleSheet.hairlineWidth,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        shadowOffset: {
            width: 0,
            height: rpx(1),
        },
        shadowRadius: rpx(3),
    },
    icon: {
        marginLeft: rpx(8),
    },
});
