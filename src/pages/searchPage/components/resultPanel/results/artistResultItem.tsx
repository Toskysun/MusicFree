import React from "react";
import ListItem from "@/components/base/listItem";
import { ImgAsset } from "@/constants/assetsConst";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import TitleAndTag from "@/components/mediaItem/titleAndTag";
import { useI18N } from "@/core/i18n";
import { View, StyleSheet } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";

interface IArtistResultsProps {
    item: IArtist.IArtistItem;
    index: number;
    pluginHash: string;
}
export default function ArtistResultItem(props: IArtistResultsProps) {
    const { item: artistItem, pluginHash } = props;
    const navigate = useNavigate();
    const { t } = useI18N();
    const colors = useColors();

    return (
        <View
            style={[
                styles.cardWrapper,
                {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                },
            ]}>
            <ListItem
                withHorizontalPadding
                heightType="big"
                onPress={() => {
                    navigate(ROUTE_PATH.ARTIST_DETAIL, {
                        artistItem: artistItem,
                        pluginHash,
                    });
                }}>
                <ListItem.ListItemImage
                    uri={artistItem.avatar}
                    fallbackImg={ImgAsset.albumDefault}
                />
                <ListItem.Content
                    description={
                        artistItem.desc
                            ? artistItem.desc
                            : `${artistItem.worksNum
                                ? t("searchPage.artistResultWorksNum", {
                                    count: artistItem.worksNum,
                                })
                                : ""
                            }    ${artistItem.description ?? ""}`
                    }
                    title={
                        <TitleAndTag
                            title={artistItem.name}
                            tag={artistItem.platform}
                        />
                    }
                />
            </ListItem>
        </View>
    );
}

const styles = StyleSheet.create({
    cardWrapper: {
        marginHorizontal: rpx(16),
        marginVertical: rpx(6),
        borderRadius: rpx(12),
        borderWidth: rpx(1),
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: rpx(2),
        },
        shadowOpacity: 0.08,
        shadowRadius: rpx(4),
        elevation: 2,
    },
});
