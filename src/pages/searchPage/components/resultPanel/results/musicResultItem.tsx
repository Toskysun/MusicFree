import React from "react";
import MusicItem from "@/components/mediaItem/musicItem";
import Config from "@/core/appConfig";
import { ISearchResult } from "@/pages/searchPage/store/atoms";
import TrackPlayer from "@/core/trackPlayer";
import timeformat from "@/utils/timeformat";
import { View, StyleSheet } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";

interface IMusicResultsProps {
    item: IMusic.IMusicItem;
    index: number;
    pluginSearchResultRef: React.MutableRefObject<ISearchResult<"music">>;
}

export default function MusicResultItem(props: IMusicResultsProps) {
    const { item: musicItem, pluginSearchResultRef } = props;
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
