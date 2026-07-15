import React from "react";
import {
    StyleProp,
    StyleSheet,
    TouchableOpacity,
    View,
    ViewStyle,
} from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "@/components/base/themeText";
import Divider from "@/components/base/divider";
import i18n from "@/core/i18n";

interface IPanelHeaderProps {
    title: string;
    cancelText?: string;
    okText?: string;
    onCancel?: () => void;
    onOk?: () => void;
    hideButtons?: boolean;
    hideDivider?: boolean;
    style?: StyleProp<ViewStyle>;
    loading?: boolean;
}

// PanelBase is hosted by a native Modal. Keep its command buttons on React
// Native's responder system: RNGH's legacy touchables can render in the Modal
// while their Android gesture root remains in the Activity window.
export default function PanelHeader(props: IPanelHeaderProps) {
    const {
        title,
        cancelText,
        okText,
        onOk,
        onCancel,
        hideButtons,
        hideDivider,
        style,
    } = props;

    return (
        <>
            <View style={[styles.header, style]}>
                {hideButtons ? null : (
                    <TouchableOpacity style={styles.button} onPress={onCancel}>
                        <ThemeText fontWeight="medium">
                            {cancelText || i18n.t("common.cancel")}
                        </ThemeText>
                    </TouchableOpacity>
                )}
                <ThemeText
                    style={styles.title}
                    fontWeight="bold"
                    fontSize="title"
                    numberOfLines={1}>
                    {title}
                </ThemeText>
                {hideButtons ? null : (
                    <TouchableOpacity
                        style={[styles.button, styles.rightButton]}
                        onPress={onOk}>
                        <ThemeText fontWeight="medium" fontColor="primary">
                            {okText || i18n.t("common.confirm")}
                        </ThemeText>
                    </TouchableOpacity>
                )}
            </View>
            {hideDivider ? null : <Divider />}
        </>
    );
}

const styles = StyleSheet.create({
    header: {
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: rpx(24),
        height: rpx(100),
    },
    button: {
        width: rpx(120),
        height: "100%",
        justifyContent: "center",
    },
    rightButton: {
        alignItems: "flex-end",
    },
    title: {
        flex: 1,
        textAlign: "center",
    },
});
