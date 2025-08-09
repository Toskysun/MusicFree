import React from "react";
import {
    Image,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import rpx from "@/utils/rpx";
import { ImgAsset } from "@/constants/assetsConst";
import ThemeText from "@/components/base/themeText";
import LinkText from "@/components/base/linkText";
import useCheckUpdate from "@/hooks/useCheckUpdate.ts";
import useOrientation from "@/hooks/useOrientation";
import Divider from "@/components/base/divider";
import Theme from "@/core/theme";
import DeviceInfo from "react-native-device-info";
import buildInfo from "@/constants/buildInfo";

export default function AboutSetting() {
    const checkAndShowResult = useCheckUpdate();
    const orientation = useOrientation();
    const {colors} = Theme.useTheme();
    const version = DeviceInfo.getVersion(); // 从 package.json 获取版本号
    const buildTime = buildInfo.buildTime; // 从构建信息文件获取构建时间

    return (
        <View
            style={[
                style.wrapper,
                orientation === "horizontal"
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
                
                <View style={[style.infoCard, {backgroundColor: colors.card}]}>
                    <ThemeText fontSize="subTitle" style={style.cardTitle}>原作者</ThemeText>
                    <ThemeText style={style.cardContent}>猫头猫</ThemeText>
                </View>

                <View style={[style.infoCard, {backgroundColor: colors.card}]}>
                    <ThemeText fontSize="subTitle" style={style.cardTitle}>原仓库</ThemeText>
                    <LinkText linkTo="https://github.com/maotoumao/MusicFree">
                        https://github.com/maotoumao/MusicFree
                    </LinkText>
                </View>

                <View style={[style.infoCard, {backgroundColor: colors.card}]}>
                    <ThemeText fontSize="subTitle" style={style.cardTitle}>本作者</ThemeText>
                    <ThemeText style={style.cardContent}>Toskysun</ThemeText>
                </View>

                <View style={[style.infoCard, {backgroundColor: colors.card}]}>
                    <ThemeText fontSize="subTitle" style={style.cardTitle}>本仓库</ThemeText>
                    <LinkText linkTo="https://github.com/Toskysun/MusicFree">
                        https://github.com/Toskysun/MusicFree
                    </LinkText>
                </View>

                <Divider style={style.divider} />
                
                <ThemeText fontSize="title">关于本软件</ThemeText>
                <ThemeText style={style.content}>
                    本软件基于 AGPL3.0 协议开源，完全免费。
                </ThemeText>
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
        height: rpx(300),
        justifyContent: "center",
        alignItems: "center",
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
        opacity: 0.6,
        fontSize: rpx(24),
    },
    margin: {
        marginTop: rpx(24),
    },
    content: {
        marginTop: rpx(24),
        lineHeight: rpx(48),
    },
    scrollView: {
        flex: 1,
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(24),
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
    divider: {
        marginVertical: rpx(32),
    },
});
