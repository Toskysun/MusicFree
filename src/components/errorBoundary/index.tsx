import React, { Component, ReactNode, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import Theme from "@/core/theme";
import type { CustomizedColors } from "@/hooks/useColors";
import rpx, { fontRpx } from "@/utils/rpx";
import { ImgAsset } from "@/constants/assetsConst";
import { fontSizeConst, fontWeightConst } from "@/constants/uiConst";
import openUrl from "@/utils/openUrl";
import { devLog } from "@/utils/log";

interface DeviceInfoProps {
    colors: any;
}

function DeviceInfoSection({ colors }: DeviceInfoProps) {
    const [deviceInfo, setDeviceInfo] = useState({
        appVersion: "获取中...",
        buildNumber: "获取中...",
        systemName: Platform.OS,
        systemVersion: "获取中...",
        deviceModel: "获取中...",
        deviceBrand: "获取中...",
    });

    useEffect(() => {
        const getDeviceInfo = async () => {
            try {
                const [
                    appVersion,
                    buildNumber,
                    systemVersion,
                    deviceModel,
                    brand,
                ] = await Promise.all([
                    DeviceInfo.getVersion(),
                    DeviceInfo.getBuildNumber(),
                    DeviceInfo.getSystemVersion(),
                    DeviceInfo.getModel(),
                    DeviceInfo.getBrand(),
                ]);

                setDeviceInfo({
                    appVersion,
                    buildNumber,
                    systemName: Platform.OS,
                    systemVersion,
                    deviceModel,
                    deviceBrand: brand,
                });
            } catch (error) {
                devLog("warn", "📱[错误边界] 获取设备信息失败", error);
            }
        };

        getDeviceInfo();
    }, []);    const systemDisplayName = Platform.OS === "ios" ? "iOS" : "Android";

    const text = colors?.text ?? "#F5F2EB";
    const textSecondary = colors?.textSecondary ?? "rgba(245,242,235,0.64)";
    const card = colors?.card ?? "#192028";
    const divider = colors?.divider ?? "rgba(245,242,235,0.11)";

    return (
        <View
            style={[
                styles.deviceInfoBox,
                { backgroundColor: card, borderColor: divider },
            ]}>
            <Text
                style={[
                    styles.deviceInfoTitle,
                    {
                        color: text,
                        fontSize: fontSizeConst.subTitle,
                        fontWeight: fontWeightConst.bold,
                    },
                ]}>
                📱 设备信息
            </Text>
            <View style={styles.deviceInfoList}>
                <View style={styles.deviceInfoRow}>
                    <Text style={[styles.deviceInfoLabel, { color: textSecondary }]}>
                        应用版本:
                    </Text>
                    <Text style={[styles.deviceInfoValue, { color: text }]}>
                        {deviceInfo.appVersion} ({deviceInfo.buildNumber})
                    </Text>
                </View>
                <View style={styles.deviceInfoRow}>
                    <Text style={[styles.deviceInfoLabel, { color: textSecondary }]}>
                        系统版本:
                    </Text>
                    <Text style={[styles.deviceInfoValue, { color: text }]}>
                        {systemDisplayName} {deviceInfo.systemVersion}
                    </Text>
                </View>
                <View style={styles.deviceInfoRow}>
                    <Text style={[styles.deviceInfoLabel, { color: textSecondary }]}>
                        设备型号:
                    </Text>
                    <Text style={[styles.deviceInfoValue, { color: text }]}>
                        {deviceInfo.deviceBrand} {deviceInfo.deviceModel}
                    </Text>
                </View>
            </View>
        </View>
    );
}

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return {
            hasError: true,
            error,
        };
    }

    componentDidCatch(error: Error, errorInfo: any) {
        this.setState({
            error,
            errorInfo,
        });
        
        // 这里可以添加错误日志上报
        devLog("error", "🛑[错误边界] 捕获到应用错误", { error: error.message, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return <ErrorFallback error={this.state.error} errorInfo={this.state.errorInfo} />;
        }

        return this.props.children;
    }
}

interface ErrorFallbackProps {
    error: Error | null;
    errorInfo: any;
}

function ErrorFallback({ error, errorInfo }: ErrorFallbackProps) {
    // Use app Theme store — NOT react-navigation useTheme / useColors —
    // so this screen still works if NavigationContainer is unmounted.
    const theme = Theme.useTheme();
    const colors = (theme.colors ?? {}) as CustomizedColors;
    const text = colors.text ?? "#F5F2EB";
    const textSecondary = colors.textSecondary ?? "rgba(245,242,235,0.64)";
    const card = colors.card ?? "#192028";
    const divider = colors.divider ?? "rgba(245,242,235,0.11)";
    const background =
        colors.pageBackground ?? colors.background ?? "#101419";

    return (
        <View style={[styles.container, { backgroundColor: background }]}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <Text
                        style={[
                            styles.title,
                            {
                                color: text,
                                fontSize: fontSizeConst.title,
                                fontWeight: fontWeightConst.bold,
                            },
                        ]}>
                        🙈 哎呀，程序崩了...
                    </Text>
                </View>

                <DeviceInfoSection colors={colors} />

                <View
                    style={[
                        styles.errorBox,
                        { backgroundColor: card, borderColor: divider },
                    ]}>
                    <Text
                        style={[
                            styles.errorTitle,
                            {
                                color: text,
                                fontSize: fontSizeConst.subTitle,
                                fontWeight: fontWeightConst.bold,
                            },
                        ]}>
                        🐛 错误详情
                    </Text>
                    <Text style={[styles.errorText, { color: textSecondary }]}>
                        {error?.message || "未知错误"}
                    </Text>
                    {error?.stack ? (
                        <ScrollView
                            style={styles.stackContainer}
                            showsVerticalScrollIndicator
                            nestedScrollEnabled>
                            <Text
                                style={[
                                    styles.stackText,
                                    { color: textSecondary },
                                ]}>
                                {error.stack}
                            </Text>
                        </ScrollView>
                    ) : null}
                </View>

                {errorInfo?.componentStack ? (
                    <View
                        style={[
                            styles.errorBox,
                            { backgroundColor: card, borderColor: divider },
                        ]}>
                        <Text
                            style={[
                                styles.errorTitle,
                                {
                                    color: text,
                                    fontSize: fontSizeConst.subTitle,
                                    fontWeight: fontWeightConst.bold,
                                },
                            ]}>
                            📍 组件堆栈
                        </Text>
                        <ScrollView
                            style={styles.stackContainer}
                            showsVerticalScrollIndicator
                            nestedScrollEnabled>
                            <Text
                                style={[
                                    styles.stackText,
                                    { color: textSecondary },
                                ]}>
                                {errorInfo.componentStack}
                            </Text>
                        </ScrollView>
                    </View>
                ) : null}

                <View style={styles.feedbackSection}>
                    <Text
                        style={[
                            styles.feedbackTitle,
                            {
                                color: text,
                                fontSize: fontSizeConst.subTitle,
                                fontWeight: fontWeightConst.bold,
                            },
                        ]}>
                        💌 请帮忙反馈一下这个问题吧
                    </Text>

                    <View style={styles.feedbackOptions}>
                        <View
                            style={[
                                styles.feedbackItem,
                                { backgroundColor: card, borderColor: divider },
                            ]}>
                            <Text
                                style={[
                                    styles.feedbackLabel,
                                    {
                                        color: text,
                                        fontSize: fontSizeConst.content,
                                        fontWeight: fontWeightConst.medium,
                                    },
                                ]}>
                                📝 GitHub Issues (推荐):
                            </Text>
                            <Text
                                style={[
                                    styles.link,
                                    { fontSize: fontSizeConst.content },
                                ]}
                                onPress={() => {
                                    openUrl(
                                        "https://github.com/Toskysun/MusicFree/issues",
                                    );
                                }}>
                                https://github.com/Toskysun/MusicFree/issues
                            </Text>
                            <Text
                                style={[
                                    styles.feedbackHint,
                                    {
                                        color: textSecondary,
                                        fontSize: fontSizeConst.description,
                                    },
                                ]}>
                                点击链接或复制粘贴到浏览器打开
                            </Text>
                        </View>

                        <View
                            style={[
                                styles.feedbackItem,
                                { backgroundColor: card, borderColor: divider },
                            ]}>
                            <Text
                                style={[
                                    styles.feedbackLabel,
                                    {
                                        color: text,
                                        fontSize: fontSizeConst.content,
                                        fontWeight: fontWeightConst.medium,
                                    },
                                ]}>
                                💬 微信公众号【一只猫头猫】:
                            </Text>
                            <View style={styles.qrCodeContainer}>
                                <Image
                                    source={ImgAsset.wechatChannel}
                                    style={styles.qrCode}
                                    resizeMode="contain"
                                />
                                <Text
                                    style={[
                                        styles.qrCodeHint,
                                        {
                                            color: textSecondary,
                                            fontSize:
                                                fontSizeConst.description,
                                        },
                                    ]}>
                                    扫描二维码关注公众号反馈
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: rpx(32),
        paddingBottom: rpx(60),
    },
    header: {
        alignItems: "center",
        marginBottom: rpx(48),
        paddingTop: rpx(40),
    },
    title: {
        textAlign: "center",
        marginBottom: rpx(16),
    },
    subtitle: {
        textAlign: "center",
        lineHeight: fontRpx(40),
    },
    deviceInfoBox: {
        borderRadius: rpx(16),
        borderWidth: rpx(2),
        padding: rpx(24),
        marginBottom: rpx(24),
    },
    deviceInfoTitle: {
        marginBottom: rpx(16),
    },
    deviceInfoList: {
        gap: rpx(12),
    },
    deviceInfoRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    deviceInfoLabel: {
        fontSize: fontRpx(28),
        flex: 1,
    },
    deviceInfoValue: {
        fontSize: fontRpx(28),
        flex: 2,
        textAlign: "right",
        fontWeight: "500",
    },
    errorBox: {
        borderRadius: rpx(16),
        borderWidth: rpx(2),
        padding: rpx(24),
        marginBottom: rpx(24),
    },
    errorTitle: {
        marginBottom: rpx(16),
    },
    errorText: {
        lineHeight: fontRpx(36),
        marginBottom: rpx(16),
    },
    stackContainer: {
        maxHeight: rpx(300),
        borderRadius: rpx(8),
        backgroundColor: "rgba(0, 0, 0, 0.05)",
        padding: rpx(16),
    },
    stackText: {
        fontSize: fontRpx(24),
        fontFamily: "monospace",
        lineHeight: fontRpx(32),
    },
    feedbackSection: {
        marginBottom: rpx(48),
    },
    feedbackTitle: {
        marginBottom: rpx(24),
        textAlign: "center",
    },
    feedbackOptions: {
        gap: rpx(24),
    },
    feedbackItem: {
        borderRadius: rpx(16),
        borderWidth: rpx(2),
        padding: rpx(24),
    },
    feedbackLabel: {
        marginBottom: rpx(16),
    },
    feedbackHint: {
        marginTop: rpx(12),
        fontStyle: "italic",
    },
    link: {
        lineHeight: fontRpx(36),
    },
    qrCodeContainer: {
        alignItems: "center",
        gap: rpx(16),
    },
    qrCode: {
        width: rpx(300),
        height: rpx(300),
        borderRadius: rpx(12),
    },
    qrCodeHint: {
        textAlign: "center",
    },
    bottomTip: {
        alignItems: "center",
        paddingVertical: rpx(24),
    },
    tipText: {
        textAlign: "center",
        fontStyle: "italic",
    },
});

export default ErrorBoundary;
