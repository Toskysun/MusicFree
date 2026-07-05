import React from "react";
import AlbumItem from "@/components/mediaItem/albumItem";
import { View, StyleSheet } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import useCardStyle from "@/hooks/useCardStyle";

interface IAlbumContentProps {
    item: IAlbum.IAlbumItem;
}
export default function AlbumContentItem(props: IAlbumContentProps) {
    const { item } = props;
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
            <AlbumItem albumItem={item} />
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
