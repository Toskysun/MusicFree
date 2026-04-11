import React from "react";
import MusicItem from "@/components/mediaItem/musicItem";
import Config from "@/core/appConfig";
import { ISearchResult } from "@/pages/searchPage/store/atoms";
import TrackPlayer from "@/core/trackPlayer";
import timeformat from "@/utils/timeformat";

interface IMusicResultsProps {
    item: IMusic.IMusicItem;
    index: number;
    pluginSearchResultRef: React.MutableRefObject<ISearchResult<"music">>;
}

export default function MusicResultItem(props: IMusicResultsProps) {
    const { item: musicItem, pluginSearchResultRef } = props;

    return (
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
    );
}
