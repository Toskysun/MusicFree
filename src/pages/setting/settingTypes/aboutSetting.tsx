import React, { useEffect, useRef } from "react";
import {
    Image,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
    Animated,
    Easing,
} from "react-native";
import rpx from "@/utils/rpx";
import { ImgAsset } from "@/constants/assetsConst";
import ThemeText from "@/components/base/themeText";
import LinkText from "@/components/base/linkText";
import useCheckUpdate from "@/hooks/useCheckUpdate.ts";
import useOrientation from "@/hooks/useOrientation";
import Theme from "@/core/theme";
import DeviceInfo from "react-native-device-info";
import buildInfo from "@/constants/buildInfo";
import { showDialog } from "@/components/dialogs/useDialog";

export default function AboutSetting() {
    const checkAndShowResult = useCheckUpdate();
    const orientation = useOrientation();
    const { colors } = Theme.useTheme();
    const version = DeviceInfo.getVersion(); // 从 package.json 获取版本号
    const buildTime = buildInfo.buildTime; // 从构建信息文件获取构建时间

    // 动画值
    const fadeAnim1 = useRef(new Animated.Value(0)).current;
    const fadeAnim2 = useRef(new Animated.Value(0)).current;
    const fadeAnim3 = useRef(new Animated.Value(0)).current;
    const fadeAnim4 = useRef(new Animated.Value(0)).current;
    const fadeAnim5 = useRef(new Animated.Value(0)).current;
    const scaleAnim1 = useRef(new Animated.Value(0.8)).current;
    const scaleAnim2 = useRef(new Animated.Value(0.8)).current;
    const scaleAnim3 = useRef(new Animated.Value(0.8)).current;
    const scaleAnim4 = useRef(new Animated.Value(0.8)).current;
    const scaleAnim5 = useRef(new Animated.Value(0.8)).current;

    useEffect(() => {
        // 创建动画序列
        Animated.stagger(150, [
            Animated.parallel([
                Animated.timing(fadeAnim1, {
                    toValue: 1,
                    duration: 600,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim1, {
                    toValue: 1,
                    friction: 4,
                    tension: 40,
                    useNativeDriver: true,
                }),
            ]),
            Animated.parallel([
                Animated.timing(fadeAnim2, {
                    toValue: 1,
                    duration: 600,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim2, {
                    toValue: 1,
                    friction: 4,
                    tension: 40,
                    useNativeDriver: true,
                }),
            ]),
            Animated.parallel([
                Animated.timing(fadeAnim3, {
                    toValue: 1,
                    duration: 600,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim3, {
                    toValue: 1,
                    friction: 4,
                    tension: 40,
                    useNativeDriver: true,
                }),
            ]),
            Animated.parallel([
                Animated.timing(fadeAnim4, {
                    toValue: 1,
                    duration: 600,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim4, {
                    toValue: 1,
                    friction: 4,
                    tension: 40,
                    useNativeDriver: true,
                }),
            ]),
            Animated.parallel([
                Animated.timing(fadeAnim5, {
                    toValue: 1,
                    duration: 600,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim5, {
                    toValue: 1,
                    friction: 4,
                    tension: 40,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    }, []);

    return (
        <View
            style={[
                style.wrapper,
                orientation === "horizontal"
                    // eslint-disable-next-line react-native/no-inline-styles -- Dynamic orientation layout
                    ? {
                         
                        flexDirection: "row",
                    }
                    : null,
            ]}>
            <View
                style={[
                    style.header,
                    orientation === "horizontal" ? style.horizontalSize : null,
                ]}>
                <TouchableOpacity
                    onPress={() => {
                        checkAndShowResult(true);
                    }}>
                    <Image
                        source={ImgAsset.author}
                        style={style.image}
                        resizeMode="contain"
                    />
                </TouchableOpacity>
                <ThemeText fontSize="title" style={style.appTitle}>MusicFree</ThemeText>
                <ThemeText style={style.versionText}>版本 {version}</ThemeText>
                <ThemeText style={style.buildText}>构建时间: {buildTime}</ThemeText>
            </View>
            <ScrollView
                contentContainerStyle={style.scrollViewContainer}
                style={style.scrollView}>

                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                        Animated.sequence([
                            Animated.spring(scaleAnim1, {
                                toValue: 0.95,
                                friction: 3,
                                tension: 100,
                                useNativeDriver: true,
                            }),
                            Animated.spring(scaleAnim1, {
                                toValue: 1,
                                friction: 3,
                                tension: 100,
                                useNativeDriver: true,
                            }),
                        ]).start();
                        showDialog("PactDialog");
                    }}>
                    <Animated.View
                        style={[
                            style.infoCard,
                            { backgroundColor: colors.card },
                            {
                                opacity: fadeAnim1,
                                transform: [{ scale: scaleAnim1 }],
                            },
                        ]}>
                        <ThemeText fontSize="subTitle" style={style.cardTitle}>许可协议</ThemeText>
                        <ThemeText style={style.cardContent}>点击查看许可协议与免责声明</ThemeText>
                    </Animated.View>
                </TouchableOpacity>

                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                        // 点击效果动画
                        Animated.sequence([
                            Animated.spring(scaleAnim2, {
                                toValue: 0.95,
                                friction: 3,
                                tension: 100,
                                useNativeDriver: true,
                            }),
                            Animated.spring(scaleAnim2, {
                                toValue: 1,
                                friction: 3,
                                tension: 100,
                                useNativeDriver: true,
                            }),
                        ]).start();
                    }}>
                    <Animated.View
                        style={[
                            style.infoCard,
                            { backgroundColor: colors.card },
                            {
                                opacity: fadeAnim2,
                                transform: [{ scale: scaleAnim2 }],
                            },
                        ]}>
                        <ThemeText fontSize="subTitle" style={style.cardTitle}>原作者</ThemeText>
                        <ThemeText style={style.cardContent}>猫头猫</ThemeText>
                    </Animated.View>
                </TouchableOpacity>

                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                        Animated.sequence([
                            Animated.spring(scaleAnim3, {
                                toValue: 0.95,
                                friction: 3,
                                tension: 100,
                                useNativeDriver: true,
                            }),
                            Animated.spring(scaleAnim3, {
                                toValue: 1,
                                friction: 3,
                                tension: 100,
                                useNativeDriver: true,
                            }),
                        ]).start();
                    }}>
                    <Animated.View
                        style={[
                            style.infoCard,
                            { backgroundColor: colors.card },
                            {
                                opacity: fadeAnim3,
                                transform: [{ scale: scaleAnim3 }],
                            },
                        ]}>
                        <ThemeText fontSize="subTitle" style={style.cardTitle}>原仓库</ThemeText>
                        <LinkText linkTo="https://github.com/maotoumao/MusicFree">
                            https://github.com/maotoumao/MusicFree
                        </LinkText>
                    </Animated.View>
                </TouchableOpacity>

                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                        Animated.sequence([
                            Animated.spring(scaleAnim4, {
                                toValue: 0.95,
                                friction: 3,
                                tension: 100,
                                useNativeDriver: true,
                            }),
                            Animated.spring(scaleAnim4, {
                                toValue: 1,
                                friction: 3,
                                tension: 100,
                                useNativeDriver: true,
                            }),
                        ]).start();
                    }}>
                    <Animated.View
                        style={[
                            style.infoCard,
                            { backgroundColor: colors.card },
                            {
                                opacity: fadeAnim4,
                                transform: [{ scale: scaleAnim4 }],
                            },
                        ]}>
                        <ThemeText fontSize="subTitle" style={style.cardTitle}>本作者</ThemeText>
                        <ThemeText style={style.cardContent}>Toskysun</ThemeText>
                    </Animated.View>
                </TouchableOpacity>

                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                        Animated.sequence([
                            Animated.spring(scaleAnim5, {
                                toValue: 0.95,
                                friction: 3,
                                tension: 100,
                                useNativeDriver: true,
                            }),
                            Animated.spring(scaleAnim5, {
                                toValue: 1,
                                friction: 3,
                                tension: 100,
                                useNativeDriver: true,
                            }),
                        ]).start();
                    }}>
                    <Animated.View
                        style={[
                            style.infoCard,
                            { backgroundColor: colors.card },
                            {
                                opacity: fadeAnim5,
                                transform: [{ scale: scaleAnim5 }],
                            },
                        ]}>
                        <ThemeText fontSize="subTitle" style={style.cardTitle}>本仓库</ThemeText>
                        <LinkText linkTo="https://github.com/Toskysun/MusicFree">
                            https://github.com/Toskysun/MusicFree
                        </LinkText>
                    </Animated.View>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        flex: 1,
    },
    header: {
        width: rpx(750),
        height: rpx(400),
        justifyContent: "center",
        alignItems: "center",
        marginBottom: rpx(40),
    },
    horizontalSize: {
        width: rpx(600),
        height: "100%",
    },
    image: {
        width: rpx(150),
        height: rpx(150),
        borderRadius: rpx(28),
    },
    appTitle: {
        marginTop: rpx(24),
    },
    versionText: {
        marginTop: rpx(12),
        opacity: 0.8,
    },
    buildText: {
        marginTop: rpx(8),
        marginBottom: rpx(32),
        opacity: 0.6,
        fontSize: rpx(24),
    },
    scrollView: {
        flex: 1,
        paddingHorizontal: rpx(24),
        paddingTop: rpx(12),
    },
    scrollViewContainer: {
        paddingBottom: rpx(96),
    },
    infoCard: {
        padding: rpx(24),
        borderRadius: rpx(16),
        marginBottom: rpx(16),
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
    },
    cardTitle: {
        marginBottom: rpx(12),
        opacity: 0.7,
    },
    cardContent: {
        fontSize: rpx(28),
    },
});
