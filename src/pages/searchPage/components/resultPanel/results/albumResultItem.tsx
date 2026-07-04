import React from "react";
import AlbumItem from "@/components/mediaItem/albumItem";
import { View, StyleSheet } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";

interface IAlbumResultsProps {
    item: IAlbum.IAlbumItem;
    index: number;
}

export default function AlbumResultItem(props: IAlbumResultsProps) {
    const { item: albumItem } = props;
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
            <AlbumItem albumItem={albumItem} />
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
