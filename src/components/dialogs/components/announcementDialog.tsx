import React, { useState } from "react";
import { hideDialog } from "../useDialog";
import Dialog from "./base";
import i18n, { useI18N } from "@/core/i18n";
import { WebView } from "react-native-webview";
import rpx, { vh } from "@/utils/rpx";
import { StyleSheet, View, TouchableOpacity, Text } from "react-native";
import { Marked } from "marked";
import Loading from "@/components/base/loading";
import useColors from "@/hooks/useColors";
import { sanitizeHtml } from "@/utils/htmlUtil";
import announcementService from "@/services/announcementService";
import ThemeText from "@/components/base/themeText";
import { devLog } from "@/utils/log";
import Checkbox from "@/components/base/checkbox";

interface IAnnouncementDialogProps {
    announcement: IAnnouncement.IAnnouncementItem;
}

export default function AnnouncementDialog(props: IAnnouncementDialogProps) {
    const { announcement } = props;
    const [loading, setLoading] = useState(true);
    const [dontShowAgain, setDontShowAgain] = useState(false);
    const { t } = useI18N();
    const colors = useColors();
    const marked = new Marked();

    const handleDismiss = () => {
        // 标记为已读
        announcementService.markAsRead(announcement.id);

        // 如果选择了"不再显示"，标记为忽略
        if (dontShowAgain) {
            announcementService.markAsIgnored(announcement.id);
            devLog('info', `📌 公告 ${announcement.id} 已标记为不再显示`);
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

    // 将 Markdown 转换为 HTML
    const htmlContent = React.useMemo(() => {
        const html = marked.parse(announcement.content || '', { async: false });
        const safeHtml = typeof html === 'string' ? sanitizeHtml(html) : '';
        const currentLanguage = i18n.getLanguage();

        return `
<!DOCTYPE html>
<html lang="${currentLanguage?.locale || 'zh-CN'}">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport"
            content="width=device-width,initial-scale=1.0,user-scalable=no,maximum-scale=1.0,minimum-scale=1.0,viewport-fit=cover" />
        <meta http-equiv="Pragma" content="no-cache" />
        <meta http-equiv="Cache-control" content="no-cache" />
        <meta http-equiv="Cache" content="no-cache" />
        <meta http-equiv="window-target" content="_top" />
        <meta name="format-detection" content="telephone=no" />
        <title>${announcement.title}</title>
        <style>
            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
                -webkit-tap-highlight-color: transparent;
            }

            html, body {
                background-color: transparent;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                font-size: 16px;
                line-height: 1.6;
                color: ${colors.text};
                -webkit-text-size-adjust: 100%;
                text-rendering: optimizeLegibility;
            }

            body {
                padding: 16px;
                word-wrap: break-word;
                overflow-wrap: break-word;
            }

            h1, h2, h3, h4, h5, h6 {
                margin: 20px 0 12px 0;
                font-weight: 600;
                line-height: 1.3;
                color: ${colors.text};
            }

            h1 { font-size: 24px; }
            h2 { font-size: 20px; }
            h3 { font-size: 18px; }
            h4 { font-size: 16px; }
            h5 { font-size: 15px; }
            h6 { font-size: 14px; }

            p {
                margin: 0 0 12px 0;
            }

            ul, ol {
                margin: 0 0 12px 0;
                padding-left: 24px;
            }

            li {
                margin: 4px 0;
            }

            a {
                color: ${colors.primary};
                text-decoration: none;
                word-break: break-all;
            }

            a:active {
                opacity: 0.7;
            }

            code {
                background-color: ${colors.backdrop};
                padding: 2px 6px;
                border-radius: 3px;
                font-family: 'Courier New', monospace;
                font-size: 14px;
            }

            pre {
                background-color: ${colors.backdrop};
                padding: 12px;
                border-radius: 4px;
                overflow-x: auto;
                margin: 0 0 12px 0;
            }

            pre code {
                background-color: transparent;
                padding: 0;
            }

            blockquote {
                border-left: 4px solid ${colors.primary};
                padding-left: 16px;
                margin: 0 0 12px 0;
                color: ${colors.textSecondary};
            }

            hr {
                border: none;
                border-top: 1px solid ${colors.divider};
                margin: 20px 0;
            }

            table {
                width: 100%;
                border-collapse: collapse;
                margin: 0 0 12px 0;
            }

            th, td {
                border: 1px solid ${colors.divider};
                padding: 8px 12px;
                text-align: left;
            }

            th {
                background-color: ${colors.backdrop};
                font-weight: 600;
            }

            img {
                max-width: 100%;
                height: auto;
                display: block;
                margin: 12px 0;
            }

            strong {
                font-weight: 600;
                color: ${colors.text};
            }

            em {
                font-style: italic;
            }
        </style>
    </head>
    <body>
        ${safeHtml}
    </body>
</html>
        `;
    }, [announcement.content, colors]);

    return (
        <Dialog onDismiss={handleDismiss}>
            <Dialog.Title withDivider>
                <View style={styles.titleContainer}>
                    <ThemeText fontSize="title" fontWeight="bold" numberOfLines={1}>
                        {getTitleIcon()} {announcement.title}
                    </ThemeText>
                </View>
            </Dialog.Title>
            <Dialog.Content style={styles.dialogContent}>
                <View style={styles.webViewContainer}>
                    {loading && (
                        <View style={styles.loadingContainer}>
                            <Loading />
                        </View>
                    )}
                    <WebView
                        source={{ html: htmlContent }}
                        style={[
                            styles.webView,
                            { opacity: loading ? 0 : 1 }
                        ]}
                        onLoadEnd={() => setLoading(false)}
                        scrollEnabled={true}
                        showsVerticalScrollIndicator={true}
                        bounces={true}
                        originWhitelist={['*']}
                        javaScriptEnabled={false}
                        scalesPageToFit={false}
                        startInLoadingState={false}
                        onShouldStartLoadWithRequest={(request) => {
                            // 拦截链接点击，使用应用内浏览器打开
                            if (request.url !== 'about:blank') {
                                devLog('info', '🔗 打开链接:', request.url);
                                // 这里可以调用 openUrl 工具打开链接
                                return false;
                            }
                            return true;
                        }}
                    />
                </View>
                {!announcement.showOnce && (
                    <TouchableOpacity
                        style={styles.checkboxContainer}
                        activeOpacity={0.7}
                        onPress={() => setDontShowAgain(!dontShowAgain)}>
                        <Checkbox checked={dontShowAgain} />
                        <Text style={[styles.checkboxLabel, { color: colors.text }]}>
                            {t("dialog.dontShowAgain") || "不再显示此公告"}
                        </Text>
                    </TouchableOpacity>
                )}
            </Dialog.Content>
            <View style={styles.actionsContainer}>
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleDismiss}
                    style={[
                        styles.confirmButton,
                        {
                            backgroundColor: colors.primary,
                            shadowColor: colors.primary,
                        }
                    ]}>
                    <ThemeText
                        fontSize="title"
                        fontWeight="bold"
                        color="white"
                        style={styles.confirmButtonText}>
                        {t("common.confirm")}
                    </ThemeText>
                </TouchableOpacity>
            </View>
        </Dialog>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: rpx(8),
    },
    dialogContent: {
        paddingHorizontal: 0,
    },
    webViewContainer: {
        height: vh(40),
        minHeight: rpx(300),
        maxHeight: vh(60),
        position: 'relative',
    },
    webView: {
        backgroundColor: 'transparent',
        flex: 1,
    },
    loadingContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: rpx(24),
        paddingTop: rpx(12),
        paddingBottom: rpx(8),
        gap: rpx(12),
    },
    checkboxLabel: {
        flex: 1,
        marginLeft: rpx(8),
        fontSize: rpx(28),
    },
    actionsContainer: {
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(16),
        borderTopWidth: 1,
        borderTopColor: 'rgba(0, 0, 0, 0.05)',
    },
    confirmButton: {
        height: rpx(88),
        borderRadius: rpx(44),
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.25,
        shadowRadius: 8,
    },
    confirmButtonText: {
        letterSpacing: rpx(2),
        fontSize: rpx(32),
    },
});