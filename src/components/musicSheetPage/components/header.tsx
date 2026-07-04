import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "@/components/base/themeText";
import { ImgAsset } from "@/constants/assetsConst";
import FastImage from "@/components/base/fastImage";
import PlayAllBar from "@/components/base/playAllBar";
import useColors from "@/hooks/useColors";
import { useI18N } from "@/core/i18n";
import Tag from "@/components/base/tag";
import Color from "color";

interface IHeaderProps {
    musicSheet: IMusic.IMusicSheetItem | null;
    musicList: IMusic.IMusicItem[] | null;
    canStar?: boolean;
}
export default function Header(props: IHeaderProps) {
    const { musicSheet, musicList, canStar } = props;
    const colors = useColors();
    const { t } = useI18N();

    const [maxLines, setMaxLines] = useState<number | undefined>(6);
    const count = musicSheet?.worksNum ?? (musicList ? musicList.length ?? 0 : 0);
    const platformTag =
        musicSheet?.platform && musicSheet.platform !== "local"
            ? musicSheet.platform
            : null;
    const accentBackground = Color(colors.primary).alpha(0.1).toString();
    const detailBackground = Color(colors.surfaceElevated ?? colors.card)
        .alpha(0.9)
        .toString();

    const toggleShowMore = () => {
        if (maxLines) {
            setMaxLines(undefined);
        } else {
            setMaxLines(6);
        }
    };

    return (
        <View style={style.wrapper}>
            <View
                style={[
                    style.infoCard,
                    {
                        backgroundColor: colors.surface,
                        shadowColor: colors.shadow,
                    },
                ]}>
                <View style={style.content}>
                    <View
                        style={[
                            style.coverShell,
                            {
                                backgroundColor: detailBackground,
                            },
                        ]}>
                        <FastImage
                            style={style.coverImg}
                            source={musicSheet?.artwork ?? musicSheet?.coverImg}
                            placeholderSource={ImgAsset.albumDefault}
                        />
                    </View>
                    <View style={style.details}>
                        <View style={style.metaRow}>
                            <View
                                style={[
                                    style.typeBadge,
                                    {
                                        backgroundColor: accentBackground,
                                    },
                                ]}>
                                <ThemeText
                                    color={colors.primary}
                                    fontSize="caption"
                                    fontWeight="bold">
                                    {t("common.sheet")}
                                </ThemeText>
                            </View>
                            {platformTag ? (
                                <Tag tagName={platformTag} />
                            ) : null}
                        </View>
                        <ThemeText
                            fontSize="title"
                            fontWeight="bold"
                            numberOfLines={3}>
                            {musicSheet?.title ?? t("common.unknownName")}
                        </ThemeText>
                        <View style={style.summaryRow}>
                            <ThemeText
                                fontColor="textSecondary"
                                fontSize="subTitle">
                                {t("sheetDetail.totalMusicCount", {
                                    count,
                                })}
                            </ThemeText>
                            {musicSheet?.artist ? (
                                <ThemeText
                                    fontColor="textSecondary"
                                    fontSize="subTitle"
                                    numberOfLines={1}
                                    style={style.artistText}>
                                    {musicSheet.artist}
                                </ThemeText>
                            ) : null}
                        </View>
                    </View>
                </View>
                {musicSheet?.description ? (
                    <Pressable onPress={toggleShowMore}>
                        <View
                            style={[
                                style.albumDesc,
                                {
                                    backgroundColor: detailBackground,
                                },
                            ]}>
                            <ThemeText
                                fontColor="textSecondary"
                                fontSize="description"
                                numberOfLines={maxLines}>
                                {musicSheet.description}
                            </ThemeText>
                        </View>
                    </Pressable>
                ) : null}
            </View>
            <View
                style={[
                    style.actionCard,
                    {
                        backgroundColor: colors.surface,
                        shadowColor: colors.shadow,
                    },
                ]}>
                <PlayAllBar
                    canStar={canStar}
                    musicList={musicList}
                    musicSheet={musicSheet}
                />
            </View>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        paddingHorizontal: rpx(12),
        paddingTop: rpx(12),
        paddingBottom: rpx(8),
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
    content: {
        flexDirection: "row",
        alignItems: "flex-start",
    },
    coverShell: {
        width: rpx(238),
        height: rpx(238),
        borderRadius: rpx(28),
        padding: rpx(14),
        marginRight: rpx(22),
    },
    coverImg: {
        width: "100%",
        height: "100%",
        borderRadius: rpx(24),
    },
    details: {
        flex: 1,
        minHeight: rpx(238),
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
    summaryRow: {
        marginTop: rpx(18),
        gap: rpx(8),
    },
    artistText: {
        lineHeight: rpx(34),
    },
    albumDesc: {
        width: "100%",
        marginTop: rpx(20),
        paddingHorizontal: rpx(18),
        paddingVertical: rpx(16),
        borderRadius: rpx(18),
    },
    actionCard: {
        marginTop: rpx(12),
        borderRadius: rpx(22),
        shadowOffset: {
            width: 0,
            height: rpx(2),
        },
        shadowOpacity: 0.08,
        shadowRadius: rpx(4),
        elevation: 3,
    },
});
