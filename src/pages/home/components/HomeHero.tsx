import FastImage from "@/components/base/fastImage";
import Image from "@/components/base/image";
import ThemeText from "@/components/base/themeText";
import { ImgAsset } from "@/constants/assetsConst";
import { useI18N } from "@/core/i18n";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import { useCurrentMusic } from "@/core/trackPlayer";
import useColors from "@/hooks/useColors";
import rpx from "@/utils/rpx";
import Color from "color";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

/**
 * A+C visual system: editorial hierarchy on top of an album-driven ambient field.
 * The current track is the only artwork source; no decorative or invented content.
 */
export default function HomeHero() {
    const currentMusic = useCurrentMusic();
    const colors = useColors();
    const navigate = useNavigate();
    const { t } = useI18N();
    const artwork =
        typeof currentMusic?.artwork === "string"
            ? currentMusic.artwork
            : undefined;

    return (
        <Pressable
            disabled={!currentMusic}
            accessibilityRole={currentMusic ? "button" : undefined}
            accessibilityLabel={currentMusic?.title}
            onPress={() => navigate(ROUTE_PATH.MUSIC_DETAIL)}
            style={[
                styles.wrapper,
                {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                },
            ]}>
            {artwork ? (
                <Image
                    uri={artwork}
                    blurRadius={rpx(34)}
                    style={styles.ambientArtwork}
                />
            ) : null}
            <View
                style={[
                    styles.ambientMask,
                    {
                        backgroundColor: Color(colors.background)
                            .alpha(artwork ? 0.76 : 0.18)
                            .toString(),
                    },
                ]}
            />
            <View style={styles.copy}>
                <View
                    style={[
                        styles.eyebrowRule,
                        { backgroundColor: colors.accentWarm },
                    ]}
                />
                <ThemeText
                    fontSize="caption"
                    fontWeight="bold"
                    color={colors.accentWarm}
                    style={styles.eyebrow}>
                    {currentMusic
                        ? t("home.continueListening")
                        : "MUSICFREE / LIBRARY"}
                </ThemeText>
                <ThemeText
                    fontSize="hero"
                    fontWeight="bold"
                    numberOfLines={2}
                    style={styles.title}>
                    {currentMusic?.title ?? t("home.welcomeTitle")}
                </ThemeText>
                <ThemeText
                    fontSize="subTitle"
                    fontColor="textSecondary"
                    numberOfLines={2}
                    style={styles.subtitle}>
                    {currentMusic?.artist || t("home.welcomeSubtitle")}
                </ThemeText>
            </View>
            <View style={styles.artworkFrame}>
                <FastImage
                    style={styles.artwork}
                    source={currentMusic?.artwork}
                    placeholderSource={ImgAsset.albumDefault}
                />
                <View
                    style={[
                        styles.artworkAccent,
                        { backgroundColor: colors.accentWarm },
                    ]}
                />
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        minHeight: rpx(286),
        marginHorizontal: rpx(24),
        marginTop: rpx(12),
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: rpx(30),
        overflow: "hidden",
        flexDirection: "row",
        alignItems: "flex-end",
        padding: rpx(28),
    },
    ambientArtwork: {
        position: "absolute",
        top: rpx(-70),
        right: rpx(-20),
        width: rpx(430),
        height: rpx(430),
        opacity: 0.54,
    },
    ambientMask: {
        ...StyleSheet.absoluteFillObject,
    },
    copy: {
        flex: 1,
        zIndex: 1,
        paddingRight: rpx(20),
    },
    eyebrowRule: {
        width: rpx(34),
        height: rpx(5),
        borderRadius: rpx(3),
        marginBottom: rpx(12),
    },
    eyebrow: {
        letterSpacing: rpx(2.2),
        textTransform: "uppercase",
    },
    title: {
        lineHeight: rpx(60),
        letterSpacing: rpx(-1.4),
        marginTop: rpx(10),
    },
    subtitle: {
        lineHeight: rpx(36),
        marginTop: rpx(12),
    },
    artworkFrame: {
        width: rpx(166),
        height: rpx(206),
        zIndex: 1,
        alignSelf: "center",
    },
    artwork: {
        width: "100%",
        height: rpx(192),
        borderRadius: rpx(83),
    },
    artworkAccent: {
        position: "absolute",
        left: rpx(22),
        right: rpx(22),
        bottom: 0,
        height: rpx(8),
        borderRadius: rpx(4),
    },
});
