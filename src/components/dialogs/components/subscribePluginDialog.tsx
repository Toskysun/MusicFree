import React, { useState } from "react";
import rpx, { fontRpx } from "@/utils/rpx";
import { StyleSheet, View } from "react-native";
import ThemeText from "@/components/base/themeText";
import { hideDialog } from "../useDialog";
import Dialog from "./base";
import Input from "@/components/base/input";
import useColors from "@/hooks/useColors";
import useHasCustomBackground from "@/hooks/useHasCustomBackground";
import { useI18N } from "@/core/i18n";

interface ISubscribeItem {
    name: string;
    url: string;
}
interface ISubscribePluginDialogProps {
    subscribeItem?: ISubscribeItem;
    onSubmit: (
        subscribeItem: ISubscribeItem,
        hideDialog: () => void,
        editingIndex?: number,
    ) => void;
    editingIndex?: number;
    onDelete?: (editingIndex: number, hideDialog: () => void) => void;
}

export default function SubscribePluginDialog(
    props: ISubscribePluginDialogProps,
) {
    const { subscribeItem, onSubmit, editingIndex, onDelete } = props;
    const [name, setName] = useState(subscribeItem?.name ?? "");
    const [url, setUrl] = useState(subscribeItem?.url ?? "");

    const colors = useColors();
    const hasCustomBackground = useHasCustomBackground();
    const { t } = useI18N();

    // Do NOT paint Content with colors.backdrop — on custom wallpaper
    // backdrop is rgba(0,0,0,0.62) and reads as a big black box inside the
    // already semi-transparent surfaceElevated dialog shell.
    const inputShellStyle = {
        borderColor: hasCustomBackground ? "transparent" : colors.divider,
        borderWidth: hasCustomBackground ? 0 : rpx(2),
        backgroundColor: hasCustomBackground
            ? colors.surface
            : colors.card,
        elevation: hasCustomBackground ? 0 : 2,
        shadowOpacity: hasCustomBackground ? 0 : 0.1,
        shadowColor: hasCustomBackground ? "transparent" : "#000",
    };

    return (
        <Dialog onDismiss={hideDialog}>
            <Dialog.Title>{t("dialog.subscriptionPluginDialog.title")}</Dialog.Title>
            <Dialog.Content style={style.dialogContent}>
                <View style={style.inputSection}>
                    <View style={style.labelContainer}>
                        <ThemeText style={style.label}>{t("common.name")}</ThemeText>
                    </View>
                    <View style={[style.inputContainer, inputShellStyle]}>
                        <Input
                            hasHorizontalPadding={false}
                            style={[
                                style.textInput,
                                {
                                    backgroundColor: "transparent",
                                    color: colors.text,
                                },
                            ]}
                            value={name}
                            onChangeText={text => {
                                setName(text);
                            }}
                            placeholder={t("common.name")}
                            placeholderTextColor={colors.textSecondary}
                        />
                    </View>
                </View>
                
                <View style={style.inputSection}>
                    <View style={style.labelContainer}>
                        <ThemeText style={style.label}>URL</ThemeText>
                    </View>
                    <View style={[style.inputContainer, inputShellStyle]}>
                        <Input
                            hasHorizontalPadding={false}
                            style={[
                                style.textInput,
                                {
                                    backgroundColor: "transparent",
                                    color: colors.text,
                                },
                            ]}
                            value={url}
                            onChangeText={text => {
                                setUrl(text);
                            }}
                        />
                    </View>
                </View>
            </Dialog.Content>
            <Dialog.Actions
                actions={[
                    {
                        type: "normal",
                        title: t("common.delete"),
                        show: editingIndex !== undefined,
                        onPress() {
                            onDelete?.(editingIndex!, hideDialog);
                        },
                    },
                    {
                        type: "primary",
                        title: t("common.save"),
                        onPress() {
                            onSubmit(
                                {
                                    name,
                                    url,
                                },
                                hideDialog,
                                editingIndex,
                            );
                        },
                    },
                ]}
            />
        </Dialog>
    );
}

const style = StyleSheet.create({
    dialogContent: {
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(16),
        borderRadius: rpx(12),
    },
    inputSection: {
        marginBottom: rpx(24),
    },
    labelContainer: {
        marginBottom: rpx(8),
    },
    label: {
        fontSize: fontRpx(28),
        fontWeight: "500",
        opacity: 0.9,
    },
    inputContainer: {
        borderRadius: rpx(8),
        paddingHorizontal: rpx(16),
        paddingVertical: rpx(4),
        minHeight: rpx(72),
        justifyContent: "center",
        shadowOffset: {
            width: 0,
            height: rpx(2),
        },
        shadowRadius: rpx(4),
    },
    textInput: {
        fontSize: fontRpx(28),
        includeFontPadding: false,
        paddingVertical: rpx(12),
        borderWidth: 0,
        backgroundColor: "transparent",
    },
    headerWrapper: {
        flexDirection: "row",
        alignItems: "center",
        height: rpx(92),
    },
});
