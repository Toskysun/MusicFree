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
    style?: StyleProp<ViewStyle>;
}

export default function TopListItem(props: ITopListResultsProps) {
    const { pluginHash, topListItem, style } = props;
    const navigate = useNavigate();
    const colors = useColors();
    const description = `${topListItem.description ?? ""}`.trim();

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
                                .alpha(0.12)
                                .toString(),
                        },
                    ]}
                />
            </View>
            <View style={styles.content}>
                <ThemeText
                    fontSize="subTitle"
                    fontWeight="bold"
                    numberOfLines={2}
                    style={styles.title}>
                    {topListItem.title}
                </ThemeText>
                {description ? (
                    <ThemeText
                        fontSize="description"
                        fontColor="textSecondary"
                        numberOfLines={4}
                        style={styles.description}>
                        {description}
                    </ThemeText>
                ) : null}
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        width: "100%",
        borderRadius: rpx(24),
        borderWidth: StyleSheet.hairlineWidth,
        overflow: "hidden",
    },
    coverFrame: {
        width: "100%",
        aspectRatio: 1,
        position: "relative",
    },
    cover: {
        width: "100%",
        height: "100%",
    },
    coverShade: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        paddingHorizontal: rpx(18),
        paddingTop: rpx(18),
        paddingBottom: rpx(20),
    },
    title: {
        lineHeight: rpx(34),
    },
    description: {
        marginTop: rpx(10),
        lineHeight: rpx(32),
    },
});
