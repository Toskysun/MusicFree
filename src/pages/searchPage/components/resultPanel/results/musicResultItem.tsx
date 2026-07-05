import React from "react";
import MusicItem from "@/components/mediaItem/musicItem";
import Config from "@/core/appConfig";
import { ISearchResult } from "@/pages/searchPage/store/atoms";
import TrackPlayer from "@/core/trackPlayer";
import timeformat from "@/utils/timeformat";
import { View, StyleSheet } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import useCardStyle from "@/hooks/useCardStyle";

interface IMusicResultsProps {
    item: IMusic.IMusicItem;
    index: number;
    pluginSearchResultRef: React.MutableRefObject<ISearchResult<"music">>;
}

export default function MusicResultItem(props: IMusicResultsProps) {
    const { item: musicItem, pluginSearchResultRef } = props;
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
                musicItem={musicItem}
                titleTagSubText={
                    typeof musicItem.duration === "number"
                        ? timeformat(musicItem.duration)
                        : undefined
                }
                onItemPress={() => {
                    const clickBehavior = Config.getConfig(
                        "basic.clickMusicInSearch",
                    );
                    if (clickBehavior === "playMusicAndReplace") {
                        TrackPlayer.playWithReplacePlayList(
                            musicItem,
                            (pluginSearchResultRef?.current?.data ?? [
                                musicItem,
                            ]) as IMusic.IMusicItem[],
                        );
                    } else {
                        TrackPlayer.play(musicItem);
                    }
                }}
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
