import React, { useState } from "react";
import { hideDialog } from "../useDialog";
import Dialog from "./base";
import { useI18N } from "@/core/i18n";
import rpx, { vh } from "@/utils/rpx";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import announcementService from "@/services/announcementService";
import ThemeText from "@/components/base/themeText";
import { devLog } from "@/utils/log";
import Checkbox from "@/components/base/checkbox";
import Button from "@/components/base/textButton";
import openUrl from "@/utils/openUrl";
import useColors from "@/hooks/useColors";

interface IAnnouncementDialogProps {
    announcement: IAnnouncement.IAnnouncementItem;
}

export default function AnnouncementDialog(props: IAnnouncementDialogProps) {
    const { announcement } = props;
    const [dontShowAgain, setDontShowAgain] = useState(false);
    const { t } = useI18N();
    const colors = useColors();

    const handleDismiss = () => {
        // 标记为已读
        announcementService.markAsRead(announcement.id);

        // 如果选择了"不再显示"，标记为忽略
        if (dontShowAgain) {
            announcementService.markAsIgnored(announcement.id);
            devLog('info', `公告 ${announcement.id} 已标记为不再显示`);
        }

        hideDialog();
    };

    // 根据公告类型获取标题图标
    const getTitleIcon = () => {
        switch (announcement.type) {
            case 'warning': return '⚠️';
            case 'success': return '✅';
            case 'error': return '❌';
            case 'info':
            default: return '📢';
        }
    };

    // 判断是否为URL
    const isUrl = (text: string) => {
        return text.startsWith('http://') || text.startsWith('https://');
    };

    return (
        <Dialog onDismiss={handleDismiss}>
            <Dialog.Title stringContent>
                {getTitleIcon()} {announcement.title}
            </Dialog.Title>
            <ScrollView style={styles.scrollView}>
                {announcement.content?.map?.((line, index) => {
                    const isLink = isUrl(line);
                    return isLink ? (
                        <TouchableOpacity
                            key={index}
                            onPress={() => openUrl(line)}
                            activeOpacity={0.7}>
                            <ThemeText
                                style={[styles.item, { color: colors.primary }]}
                                numberOfLines={1}>
                                {line}
                            </ThemeText>
                        </TouchableOpacity>
                    ) : (
                        <ThemeText key={index} style={styles.item}>
                            {line}
                        </ThemeText>
                    );
                })}
            </ScrollView>
            <Dialog.Actions style={styles.dialogActions}>
                {!announcement.showOnce && (
                    <TouchableOpacity
                        onPress={() => setDontShowAgain(state => !state)}>
                        <View style={styles.checkboxGroup}>
                            <Checkbox checked={dontShowAgain} />
                            <ThemeText style={styles.checkboxHint}>
                                {t("dialog.dontShowAgain")}
                            </ThemeText>
                        </View>
                    </TouchableOpacity>
                )}
                <View style={styles.buttonGroup}>
                    <Button
                        style={styles.button}
                        onPress={handleDismiss}>
                        {t("common.confirm")}
                    </Button>
                </View>
            </Dialog.Actions>
        </Dialog>
    );
}

const styles = StyleSheet.create({
    scrollView: {
        maxHeight: vh(40),
        paddingHorizontal: rpx(26),
    },
    item: {
        marginBottom: rpx(20),
        lineHeight: rpx(36),
    },
    dialogActions: {
        marginTop: rpx(24),
        minHeight: rpx(80),
        marginBottom: rpx(12),
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "space-between",
    },
    checkboxGroup: {
        flexDirection: "row",
        alignItems: "center",
    },
    checkboxHint: {
        marginLeft: rpx(12),
    },
    buttonGroup: {
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        justifyContent: "flex-end",
    },
    button: {
        paddingLeft: rpx(28),
        paddingVertical: rpx(14),
        marginLeft: rpx(16),
        alignItems: "flex-end",
    },
});