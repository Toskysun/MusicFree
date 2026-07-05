import React from "react";
import AlbumItem from "@/components/mediaItem/albumItem";
import { View, StyleSheet } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import useCardStyle from "@/hooks/useCardStyle";

interface IAlbumResultsProps {
    item: IAlbum.IAlbumItem;
    index: number;
}

export default function AlbumResultItem(props: IAlbumResultsProps) {
    const { item: albumItem } = props;
    const colors = useColors();
    const cardStyle = useCardStyle({
        borderWidth: rpx(1),
        elevation: 2,
    });

    return (
        <View
            style={[
                styles.cardWrapper,
                {
                    backgroundColor: colors.surface,
                },
                cardStyle,
            ]}>
            <AlbumItem albumItem={albumItem} />
        </View>
    );
}

const styles = StyleSheet.create({
    cardWrapper: {
        marginHorizontal: rpx(16),
        marginVertical: rpx(6),
        borderRadius: rpx(12),
        overflow: "hidden",
        shadowOffset: {
            width: 0,
            height: rpx(2),
        },
        shadowRadius: rpx(4),
    },
});
