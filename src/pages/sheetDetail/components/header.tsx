import FastImage from "@/components/base/fastImage";
import PlayAllBar from "@/components/base/playAllBar";
import ThemeText from "@/components/base/themeText";
import Tag from "@/components/base/tag";
import { ImgAsset } from "@/constants/assetsConst";
import { useI18N } from "@/core/i18n";
import { useSheetItem } from "@/core/musicSheet";
import { useParams } from "@/core/router";
import useColors from "@/hooks/useColors";
import useCardStyle from "@/hooks/useCardStyle";
import useHasCustomBackground from "@/hooks/useHasCustomBackground";
import Color from "color";
import rpx from "@/utils/rpx";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

export default function Header() {
    const { id = "favorite" } = useParams<"local-sheet-detail">();
    const sheet = useSheetItem(id);
    const colors = useColors();
    const cardStyle = useCardStyle({
        borderWidth: 0,
        elevation: 3,
    });
    const hasCustomBackground = useHasCustomBackground();
    const { t } = useI18N();
    const [maxLines, setMaxLines] = useState<number | undefined>(6);
    const accentBackground = Color(colors.primary).alpha(0.1).toString();
    const detailBackground = colors.surfaceElevated ?? colors.card;
    const coverBackground = hasCustomBackground
        ? colors.surface
        : detailBackground;
    const count = sheet?.musicList?.length ?? 0;

    return (
        <View style={style.wrapper}>
            <View
                style={[
                    style.infoCard,
                    {
                        backgroundColor: colors.surface,
                    },
                    cardStyle,
                ]}>
                <View style={style.content}>
                    <View
                        style={[
                            style.coverShell,
                            {
                                backgroundColor: coverBackground,
                            },
                        ]}>
                        <FastImage
                            style={style.coverImg}
                            source={sheet?.coverImg}
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
                            <Tag tagName={t("common.local")} />
                        </View>
                        <ThemeText
                            fontSize="title"
                            fontWeight="bold"
                            numberOfLines={3}>
                            {sheet?.title ?? t("common.unknownName")}
                        </ThemeText>
                        <View style={style.summaryRow}>
                            <ThemeText
                                fontColor="textSecondary"
                                fontSize="subTitle">
                                {t("sheetDetail.totalMusicCount", {
                                    count,
                                })}
                            </ThemeText>
                        </View>
                    </View>
                </View>
                {sheet?.description ? (
                    <Pressable
                        onPress={() => {
                            setMaxLines(prev => (prev ? undefined : 6));
                        }}>
                        <View
                            style={[
                                style.descriptionCard,
                                {
                                    backgroundColor: detailBackground,
                                },
                            ]}>
                            <ThemeText
                                fontColor="textSecondary"
                                fontSize="description"
                                numberOfLines={maxLines}>
                                {sheet.description}
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
                    },
                    cardStyle,
                ]}>
                <PlayAllBar musicList={sheet?.musicList} musicSheet={sheet} />
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
        shadowRadius: rpx(4),
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
    descriptionCard: {
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
        shadowRadius: rpx(4),
    },
});
