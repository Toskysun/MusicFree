import React from "react";
import MusicItem from "@/components/mediaItem/musicItem";
import timeformat from "@/utils/timeformat";
import { View, StyleSheet } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import useCardStyle from "@/hooks/useCardStyle";

interface IMusicContentProps {
    item: IMusic.IMusicItem;
}
export default function MusicContentItem(props: IMusicContentProps) {
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
            <MusicItem
                musicItem={item}
                titleTagSubText={
                    typeof item.duration === "number"
                        ? timeformat(item.duration)
                        : undefined
                }
            />
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
