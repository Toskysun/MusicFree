import React, { Component, ReactNode, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import useColors from "@/hooks/useColors";
import rpx, { fontRpx } from "@/utils/rpx";
import LinkText from "@/components/base/linkText";
import { ImgAsset } from "@/constants/assetsConst";
import ThemeText from "@/components/base/themeText";
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

    return (
        <View style={[styles.deviceInfoBox, { backgroundColor: colors.card, borderColor: colors.divider }]}>
            <ThemeText 
                fontSize="subTitle" 
                fontWeight="bold" 
                style={[styles.deviceInfoTitle, { color: colors.text }]}
            >
                📱 设备信息
            </ThemeText>
            <View style={styles.deviceInfoList}>
                <View style={styles.deviceInfoRow}>
                    <Text style={[styles.deviceInfoLabel, { color: colors.textSecondary }]}>应用版本:</Text>
                    <Text style={[styles.deviceInfoValue, { color: colors.text }]}>{deviceInfo.appVersion} ({deviceInfo.buildNumber})</Text>
                </View>
                <View style={styles.deviceInfoRow}>
                    <Text style={[styles.deviceInfoLabel, { color: colors.textSecondary }]}>系统版本:</Text>
                    <Text style={[styles.deviceInfoValue, { color: colors.text }]}>{systemDisplayName} {deviceInfo.systemVersion}</Text>
                </View>
                <View style={styles.deviceInfoRow}>
                    <Text style={[styles.deviceInfoLabel, { color: colors.textSecondary }]}>设备型号:</Text>
                    <Text style={[styles.deviceInfoValue, { color: colors.text }]}>{deviceInfo.deviceBrand} {deviceInfo.deviceModel}</Text>
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
    const colors = useColors();

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView 
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* 错误标题 */}
                <View style={styles.header}>
                    <ThemeText 
                        fontSize="title" 
                        fontWeight="bold" 
                        style={[styles.title, { color: colors.text }]}
                    >
                        🙈 哎呀，程序崩了...
                    </ThemeText>
                </View>

                {/* 设备信息 */}
                <DeviceInfoSection colors={colors} />

                {/* 错误详情 */}
                <View style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.divider }]}>
                    <ThemeText 
                        fontSize="subTitle" 
                        fontWeight="bold" 
                        style={[styles.errorTitle, { color: colors.text }]}
                    >
                        🐛 错误详情
                    </ThemeText>
                    <Text style={[styles.errorText, { color: colors.textSecondary }]}>
                        {error?.message || "未知错误"}
                    </Text>
                    {error?.stack && (
                        <ScrollView 
                            style={styles.stackContainer}
                            showsVerticalScrollIndicator={true}
                            nestedScrollEnabled={true}
                        >
                            <Text style={[styles.stackText, { color: colors.textSecondary }]}>
                                {error.stack}
                            </Text>
                        </ScrollView>
                    )}
                </View>

                {/* 组件堆栈信息 */}
                {errorInfo?.componentStack && (
                    <View style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.divider }]}>
                        <ThemeText 
                            fontSize="subTitle" 
                            fontWeight="bold" 
                            style={[styles.errorTitle, { color: colors.text }]}
                        >
                            📍 组件堆栈
                        </ThemeText>
                        <ScrollView 
                            style={styles.stackContainer}
                            showsVerticalScrollIndicator={true}
                            nestedScrollEnabled={true}
                        >
                            <Text style={[styles.stackText, { color: colors.textSecondary }]}>
                                {errorInfo.componentStack}
                            </Text>
                        </ScrollView>
                    </View>
                )}

                {/* 反馈建议 */}
                <View style={styles.feedbackSection}>
                    <ThemeText 
                        fontSize="subTitle" 
                        fontWeight="bold" 
                        style={[styles.feedbackTitle, { color: colors.text }]}
                    >
                        💌 请帮忙反馈一下这个问题吧
                    </ThemeText>
                    
                    <View style={styles.feedbackOptions}>
                        {/* GitHub Issue */}
                        <View style={[styles.feedbackItem, { backgroundColor: colors.card, borderColor: colors.divider }]}>
                            <ThemeText 
                                fontSize="content" 
                                fontWeight="medium"
                                style={[styles.feedbackLabel, { color: colors.text }]}
                            >
                                📝 GitHub Issues (推荐):
                            </ThemeText>
                            <LinkText 
                                fontSize="content"
                                linkTo="https://github.com/Toskysun/MusicFree/issues"
                                style={styles.link}
                            >
                                https://github.com/Toskysun/MusicFree/issues
                            </LinkText>
                            <ThemeText 
                                fontSize="description" 
                                style={[styles.feedbackHint, { color: colors.textSecondary }]}
                            >
                                点击链接或复制粘贴到浏览器打开
                            </ThemeText>
                        </View>

                        {/* 微信公众号 */}
                        <View style={[styles.feedbackItem, { backgroundColor: colors.card, borderColor: colors.divider }]}>
                            <ThemeText 
                                fontSize="content" 
                                fontWeight="medium"
                                style={[styles.feedbackLabel, { color: colors.text }]}
                            >
                                💬 微信公众号【一只猫头猫】:
                            </ThemeText>
                            <View style={styles.qrCodeContainer}>
                                <Image 
                                    source={ImgAsset.wechatChannel} 
                                    style={styles.qrCode}
                                    resizeMode="contain"
                                />
                                <ThemeText 
                                    fontSize="description" 
                                    style={[styles.qrCodeHint, { color: colors.textSecondary }]}
                                >
                                    扫描二维码关注公众号反馈
                                </ThemeText>
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
