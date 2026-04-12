import React from "react";
import MusicItem from "@/components/mediaItem/musicItem";
import timeformat from "@/utils/timeformat";

interface IMusicContentProps {
    item: IMusic.IMusicItem;
}
export default function MusicContentItem(props: IMusicContentProps) {
    const { item } = props;
    return (
        <MusicItem
            musicItem={item}
            titleTagSubText={
                typeof item.duration === "number"
                    ? timeformat(item.duration)
                    : undefined
            }
        />
    );
}
