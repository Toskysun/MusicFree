import React from "react";
import MusicItem from "@/components/mediaItem/musicItem";
import timeformat from "@/utils/timeformat";
import { View, StyleSheet } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";

interface IMusicContentProps {
    item: IMusic.IMusicItem;
}
export default function MusicContentItem(props: IMusicContentProps) {
    const { item } = props;
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
