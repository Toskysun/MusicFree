import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { useAtomValue } from "jotai";
import { scrollToTopAtom } from "../store/atoms";
import ThemeText from "@/components/base/themeText";
import Tag from "@/components/base/tag";
import { useParams } from "@/core/router";
import Image from "@/components/base/image";
import { ImgAsset } from "@/constants/assetsConst";
import { useI18N } from "@/core/i18n";
import useColors from "@/hooks/useColors";
import Color from "color";

const headerHeight = rpx(350);

interface IHeaderProps {
    neverFold?: boolean;
}

export default function Header(props: IHeaderProps) {
    const { neverFold } = props;

    const { artistItem } = useParams<"artist-detail">();

    const heightValue = useSharedValue(headerHeight);
    const opacityValue = useSharedValue(1);
    const scrollToTopState = useAtomValue(scrollToTopAtom);

    const { t } = useI18N();
    const colors = useColors();
    const accentBackground = Color(colors.primary).alpha(0.1).toString();
    const detailBackground = Color(colors.surfaceElevated ?? colors.card)
        .alpha(0.9)
        .toString();

    const heightStyle = useAnimatedStyle(() => {
        return {
            height: heightValue.value,
            opacity: opacityValue.value,
        };
    });

    const avatar = artistItem.avatar?.startsWith("//")
        ? `https:${artistItem.avatar}`
        : artistItem.avatar;

    /** 折叠 */
    useEffect(() => {
        if (neverFold) {
            heightValue.value = withTiming(headerHeight);
            opacityValue.value = withTiming(1);
            return;
        }
        if (scrollToTopState) {
            heightValue.value = withTiming(headerHeight);
            opacityValue.value = withTiming(1);
        } else {
            heightValue.value = withTiming(0);
            opacityValue.value = withTiming(0);
        }
    }, [scrollToTopState, neverFold, heightValue, opacityValue]);

    return (
        <Animated.View style={[styles.wrapper, heightStyle]}>
            <View
                style={[
                    styles.infoCard,
                    {
                        backgroundColor: colors.surface,
                        shadowColor: colors.shadow,
                    },
                ]}>
                <View style={styles.headerWrapper}>
                    <View
                        style={[
                            styles.artistShell,
                            {
                                backgroundColor: detailBackground,
                            },
                        ]}>
                        <Image
                            emptySrc={ImgAsset.albumDefault}
                            uri={avatar}
                            style={styles.artist}
                        />
                    </View>
                    <View style={styles.info}>
                        <View style={styles.metaRow}>
                            <View
                                style={[
                                    styles.typeBadge,
                                    {
                                        backgroundColor: accentBackground,
                                    },
                                ]}>
                                <ThemeText
                                    color={colors.primary}
                                    fontSize="caption"
                                    fontWeight="bold">
                                    {t("common.artist")}
                                </ThemeText>
                            </View>
                            {artistItem.platform ? (
                                <Tag tagName={artistItem.platform} />
                            ) : null}
                        </View>
                        <ThemeText
                            fontSize="title"
                            fontWeight="bold"
                            style={styles.titleText}
                            numberOfLines={2}
                            ellipsizeMode="tail">
                            {artistItem?.name ?? ""}
                        </ThemeText>

                        {artistItem.fans ? (
                            <ThemeText
                                fontSize="subTitle"
                                fontColor="textSecondary">
                                {t("artistDetail.fansCount", {
                                    count: artistItem.fans,
                                })}
                            </ThemeText>
                        ) : null}
                    </View>
                </View>

                <View
                    style={[
                        styles.descriptionCard,
                        {
                            backgroundColor: detailBackground,
                        },
                    ]}>
                    <ThemeText
                        numberOfLines={2}
                        ellipsizeMode="tail"
                        fontColor="textSecondary"
                        fontSize="description">
                        {artistItem?.description ?? ""}
                    </ThemeText>
                </View>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        height: headerHeight,
        zIndex: 1,
        paddingHorizontal: rpx(12),
        paddingTop: rpx(12),
    },
    infoCard: {
        borderRadius: rpx(22),
        padding: rpx(22),
        shadowOffset: {
            width: 0,
            height: rpx(2),
        },
        shadowOpacity: 0.08,
        shadowRadius: rpx(4),
        elevation: 3,
    },
    artist: {
        width: "100%",
        height: "100%",
        borderRadius: rpx(24),
    },
    artistShell: {
        width: rpx(176),
        height: rpx(176),
        borderRadius: rpx(28),
        padding: rpx(14),
        marginRight: rpx(22),
    },
    headerWrapper: {
        flexDirection: "row",
        alignItems: "flex-start",
    },
    info: {
        flex: 1,
        minHeight: rpx(176),
        justifyContent: "space-between",
    },
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: rpx(14),
    },
    typeBadge: {
        minHeight: rpx(36),
        paddingHorizontal: rpx(14),
        borderRadius: rpx(18),
        justifyContent: "center",
        alignItems: "center",
    },
    titleText: {
        marginBottom: rpx(14),
    },
    descriptionCard: {
        marginTop: rpx(20),
        paddingHorizontal: rpx(18),
        paddingVertical: rpx(16),
        borderRadius: rpx(18),
    },
});
