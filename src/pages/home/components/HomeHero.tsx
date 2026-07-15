import FastImage from "@/components/base/fastImage";
import Icon from "@/components/base/icon.tsx";
import ThemeText from "@/components/base/themeText";
import { ImgAsset } from "@/constants/assetsConst";
import { useI18N } from "@/core/i18n";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import TrackPlayer, {
    useCurrentMusic,
    useMusicState,
    useProgress,
} from "@/core/trackPlayer";
import useColors from "@/hooks/useColors";
import rpx, { fontRpx } from "@/utils/rpx";
import { musicIsPaused } from "@/utils/trackUtils";
import { resolveArtwork } from "@/utils/artwork";
import { useMediaExtraProperty } from "@/utils/mediaExtra";
import Color from "color";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { DimensionValue } from "react-native";
import ImageColors from "react-native-image-colors";
import LinearGradient from "react-native-linear-gradient";

interface IHeroPalette {
    base: string;
    accent: string;
}

function formatTime(value?: number) {
    const seconds = Math.max(0, Math.floor(value ?? 0));
    const minute = Math.floor(seconds / 60);
    const second = seconds % 60;
    return `${minute}:${String(second).padStart(2, "0")}`;
}

function getProgressPercent(
    position?: number,
    duration?: number,
): DimensionValue {
    if (!position || !duration || duration <= 0) {
        return "0%";
    }
    return `${Math.min(
        100,
        Math.max(0, (position / duration) * 100),
    )}%` as DimensionValue;
}

function getPaletteFromImageColors(result: any, fallback: string): IHeroPalette {
    if (result?.platform === "android") {
        return {
            base: result.dominant ?? fallback,
            accent: result.vibrant ?? result.average ?? fallback,
        };
    }
    if (result?.platform === "ios") {
        return {
            base: result.primary ?? fallback,
            accent: result.secondary ?? result.detail ?? fallback,
        };
    }
    return {
        base: result?.vibrant ?? result?.dominant ?? fallback,
        accent: result?.muted ?? result?.darkVibrant ?? fallback,
    };
}

function buildGradientColors(palette: IHeroPalette, fallbackSurface: string) {
    try {
        const base = Color(palette.base);
        const accent = Color(palette.accent);
        return [
            base.darken(0.52).saturate(0.14).hex(),
            accent.darken(0.34).saturate(0.22).hex(),
            Color(fallbackSurface).mix(base, 0.22).darken(0.1).hex(),
        ];
    } catch {
        return [fallbackSurface, fallbackSurface, fallbackSurface];
    }
}

export default function HomeHero() {
    const currentMusic = useCurrentMusic();
    const musicState = useMusicState();
    const { position, duration } = useProgress();
    const colors = useColors();
    const navigate = useNavigate();
    const { t } = useI18N();
    const primaryColor = colors.primary ?? "#D94B32";
    const accentColor = colors.accentCool ?? colors.primary ?? "#3F899B";
    const cardColor = colors.card ?? colors.surface ?? "#202730";
    const [palette, setPalette] = useState<IHeroPalette>({
        base: primaryColor,
        accent: accentColor,
    });
    useMediaExtraProperty(currentMusic, "associatedArtwork");
    const artwork = resolveArtwork(currentMusic);
    const progressDuration = duration || currentMusic?.duration;
    const isPlaying = currentMusic && !musicIsPaused(musicState);

    useEffect(() => {
        let canceled = false;

        if (!artwork) {
            setPalette({
                base: primaryColor,
                accent: accentColor,
            });
            return () => {
                canceled = true;
            };
        }

        ImageColors.getColors(artwork, {
            fallback: primaryColor,
            cache: true,
        })
            .then(result => {
                if (!canceled) {
                    setPalette(getPaletteFromImageColors(result, primaryColor));
                }
            })
            .catch(() => {
                if (!canceled) {
                    setPalette({
                        base: primaryColor,
                        accent: accentColor,
                    });
                }
            });

        return () => {
            canceled = true;
        };
    }, [accentColor, artwork, primaryColor]);

    const gradientColors = useMemo(
        () => buildGradientColors(palette, cardColor),
        [cardColor, palette],
    );
    const foreground = "#FFFFFF";
    const mutedForeground = Color(foreground).alpha(0.72).toString();

    return (
        <Pressable
            disabled={!currentMusic}
            accessibilityRole={currentMusic ? "button" : undefined}
            accessibilityLabel={currentMusic?.title}
            onPress={() => navigate(ROUTE_PATH.MUSIC_DETAIL)}
            style={[
                styles.card,
                {
                    borderColor: Color(foreground).alpha(0.12).toString(),
                    shadowColor: colors.shadow,
                },
            ]}>
            <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <View
                style={[
                    styles.flowBand,
                    {
                        backgroundColor: Color(palette.accent)
                            .alpha(0.18)
                            .toString(),
                    },
                ]}
            />
            <View style={styles.content}>
                <View style={styles.kickerRow}>
                    <View
                        style={[
                            styles.kickerLine,
                            {
                                backgroundColor: Color(foreground)
                                    .alpha(0.82)
                                    .toString(),
                            },
                        ]}
                    />
                    <ThemeText
                        fontSize="caption"
                        fontWeight="bold"
                        color={mutedForeground}
                        style={styles.kickerText}>
                        {currentMusic
                            ? t("home.continueListening")
                            : "MUSICFREE / LIBRARY"}
                    </ThemeText>
                </View>
                <View style={styles.titleRow}>
                    <ThemeText
                        numberOfLines={2}
                        fontSize="section"
                        fontWeight="bold"
                        color={foreground}
                        style={styles.title}>
                        {currentMusic?.title ?? t("home.welcomeTitle")}
                    </ThemeText>
                    <View
                        style={[
                            styles.platformBadge,
                            {
                                backgroundColor: Color(foreground)
                                    .alpha(0.14)
                                    .toString(),
                            },
                        ]}>
                        <ThemeText fontSize="tag" color={foreground}>
                            {currentMusic?.platform ?? "MusicFree"}
                        </ThemeText>
                    </View>
                </View>
                <ThemeText
                    numberOfLines={1}
                    fontSize="subTitle"
                    color={mutedForeground}
                    style={styles.desc}>
                    {currentMusic?.artist || t("home.welcomeSubtitle")}
                </ThemeText>
                <View style={styles.bottomRow}>
                    <View style={styles.progressBlock}>
                        <View style={styles.progressTimeRow}>
                            <ThemeText fontSize="tag" color={mutedForeground}>
                                {formatTime(currentMusic ? position : 0)}
                            </ThemeText>
                            <ThemeText fontSize="tag" color={mutedForeground}>
                                {formatTime(progressDuration)}
                            </ThemeText>
                        </View>
                        <View
                            style={[
                                styles.progressTrack,
                                {
                                    backgroundColor: Color(foreground)
                                        .alpha(0.18)
                                        .toString(),
                                },
                            ]}>
                            <View
                                style={[
                                    styles.progressFill,
                                    {
                                        backgroundColor: foreground,
                                        width: getProgressPercent(
                                            currentMusic ? position : 0,
                                            progressDuration,
                                        ),
                                    },
                                ]}
                            />
                        </View>
                    </View>
                    {currentMusic ? (
                        <Pressable
                            style={[
                                styles.playButton,
                                {
                                    backgroundColor: Color(foreground)
                                        .alpha(0.17)
                                        .toString(),
                                },
                            ]}
                            onPress={evt => {
                                evt.stopPropagation();
                                if (isPlaying) {
                                    TrackPlayer.pause();
                                } else {
                                    TrackPlayer.play(currentMusic);
                                }
                            }}>
                            <Icon
                                name={isPlaying ? "pause" : "play"}
                                size={rpx(38)}
                                color={foreground}
                            />
                        </Pressable>
                    ) : null}
                </View>
            </View>
            <View
                style={[
                    styles.coverFrame,
                    {
                        backgroundColor: Color(foreground)
                            .alpha(0.12)
                            .toString(),
                        borderColor: Color(foreground).alpha(0.16).toString(),
                    },
                ]}>
                <FastImage
                    source={artwork}
                    placeholderSource={ImgAsset.albumDefault}
                    style={styles.cover}
                />
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        minHeight: rpx(268),
        marginHorizontal: rpx(24),
        marginTop: rpx(12),
        borderRadius: rpx(24),
        borderWidth: StyleSheet.hairlineWidth,
        overflow: "hidden",
        flexDirection: "row",
        alignItems: "center",
        padding: rpx(24),
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.18,
        shadowRadius: rpx(18),
        elevation: 3,
    },
    flowBand: {
        position: "absolute",
        right: rpx(-40),
        top: rpx(-90),
        width: rpx(290),
        height: rpx(430),
        borderRadius: rpx(140),
        transform: [{ rotate: "18deg" }],
    },
    content: {
        flex: 1,
        minWidth: 0,
        zIndex: 1,
        paddingRight: rpx(22),
    },
    kickerRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    kickerLine: {
        width: rpx(32),
        height: rpx(4),
        borderRadius: rpx(2),
        marginRight: rpx(10),
    },
    kickerText: {
        letterSpacing: rpx(1.6),
        textTransform: "uppercase",
    },
    titleRow: {
        marginTop: rpx(18),
        flexDirection: "row",
        alignItems: "flex-start",
    },
    title: {
        flex: 1,
        minWidth: 0,
        lineHeight: fontRpx(48),
    },
    platformBadge: {
        minHeight: rpx(34),
        paddingHorizontal: rpx(12),
        borderRadius: rpx(17),
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        marginLeft: rpx(12),
        marginTop: rpx(5),
    },
    desc: {
        marginTop: rpx(12),
        lineHeight: fontRpx(36),
    },
    bottomRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: rpx(28),
    },
    progressBlock: {
        flex: 1,
        minWidth: 0,
    },
    progressTimeRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: rpx(9),
    },
    progressTrack: {
        height: rpx(7),
        borderRadius: rpx(4),
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        borderRadius: rpx(4),
    },
    playButton: {
        width: rpx(68),
        height: rpx(68),
        borderRadius: rpx(34),
        marginLeft: rpx(18),
        alignItems: "center",
        justifyContent: "center",
    },
    coverFrame: {
        width: rpx(162),
        height: rpx(162),
        zIndex: 1,
        borderRadius: rpx(22),
        borderWidth: StyleSheet.hairlineWidth,
        padding: rpx(8),
    },
    cover: {
        width: "100%",
        height: "100%",
        borderRadius: rpx(16),
    },
});
