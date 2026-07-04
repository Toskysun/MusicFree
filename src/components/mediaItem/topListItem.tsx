import React from "react";
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { ImgAsset } from "@/constants/assetsConst";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import FastImage from "@/components/base/fastImage";
import ThemeText from "@/components/base/themeText";
import useColors from "@/hooks/useColors";
import rpx from "@/utils/rpx";
import Color from "color";

interface ITopListResultsProps {
    pluginHash: string;
    topListItem: IMusic.IMusicSheetItemBase;
    rank: number;
    style?: StyleProp<ViewStyle>;
}

export default function TopListItem(props: ITopListResultsProps) {
    const { pluginHash, topListItem, rank, style } = props;
    const navigate = useNavigate();
    const colors = useColors();
    const rankBackgroundColor = Color(colors.background).alpha(0.86).toString();

    return (
        <Pressable
            onPress={() => {
                navigate(ROUTE_PATH.TOP_LIST_DETAIL, {
                    pluginHash: pluginHash,
                    topList: topListItem,
                });
            }}
            style={({ pressed }) => [
                styles.wrapper,
                {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.88 : 1,
                },
                style,
            ]}>
            <View style={styles.coverFrame}>
                <FastImage
                    style={styles.cover}
                    source={topListItem?.coverImg}
                    placeholderSource={ImgAsset.albumDefault}
                />
                <View
                    style={[
                        styles.coverShade,
                        {
                            backgroundColor: Color(colors.background)
                                .alpha(0.1)
                                .toString(),
                        },
                    ]}
                />
                <View
                    style={[
                        styles.rankBadge,
                        {
                            backgroundColor: rankBackgroundColor,
                            borderColor: Color(colors.text)
                                .alpha(0.08)
                                .toString(),
                        },
                    ]}>
                    <ThemeText
                        fontSize="tag"
                        fontWeight="bold"
                        color={colors.primary}>
                        {`${rank}`.padStart(2, "0")}
                    </ThemeText>
                </View>
            </View>
            <View style={styles.content}>
                <ThemeText
                    fontSize="description"
                    fontWeight="bold"
                    numberOfLines={2}
                    style={styles.title}>
                    {topListItem.title}
                </ThemeText>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        width: "100%",
        borderRadius: rpx(20),
        borderWidth: StyleSheet.hairlineWidth,
        overflow: "hidden",
    },
    coverFrame: {
        width: "100%",
        aspectRatio: 1,
        position: "relative",
        overflow: "hidden",
    },
    cover: {
        width: "100%",
        height: "100%",
    },
    coverShade: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        paddingHorizontal: rpx(12),
        paddingTop: rpx(10),
        paddingBottom: rpx(12),
    },
    title: {
        lineHeight: rpx(28),
    },
    rankBadge: {
        position: "absolute",
        top: rpx(8),
        left: rpx(8),
        minWidth: rpx(42),
        height: rpx(32),
        borderRadius: rpx(16),
        paddingHorizontal: rpx(10),
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: "center",
        justifyContent: "center",
    },
});
