import React from "react";
import { StyleSheet, View } from "react-native";
import AlbumCover from "./albumCover";
import Lyric from "./lyric";
import useOrientation from "@/hooks/useOrientation";
import globalStyle from "@/constants/globalStyle";

export type MusicDetailContentTab = "album" | "lyric";

interface IContentProps {
    keepAlbumCoverMounted?: boolean;
    tab: MusicDetailContentTab;
    selectTab: React.Dispatch<React.SetStateAction<MusicDetailContentTab>>;
    /** Leave page — hide mini lyric before transition to avoid surface flash */
    isExiting?: boolean;
}

export default function Content(props: IContentProps) {
    const {
        keepAlbumCoverMounted = true,
        tab,
        selectTab,
        isExiting = false,
    } = props;
    const orientation = useOrientation();

    const showAlbumCover = tab === "album" || orientation === "horizontal";
    const showLyric = tab === "lyric" && orientation !== "horizontal";
    const shouldRenderAlbumCover = showAlbumCover || keepAlbumCoverMounted;

    const onTurnPageClick = () => {
        if (orientation === "horizontal") {
            return;
        }
        if (tab === "album") {
            selectTab("lyric");
        } else {
            selectTab("album");
        }
    };

    return (
        <View style={globalStyle.fwflex1}>
            {shouldRenderAlbumCover ? (
                <View style={[
                    globalStyle.fwflex1,
                    !showAlbumCover && styles.hidden,
                ]}>
                    <AlbumCover
                        onTurnPageClick={onTurnPageClick}
                        isExiting={isExiting}
                        isActive={showAlbumCover}
                    />
                </View>
            ) : null}
            {/* Keep Lyric mounted to preserve state; re-center when tab becomes active. */}
            <View style={[
                globalStyle.fwflex1,
                !showLyric && styles.hidden,
            ]}>
                <Lyric
                    onTurnPageClick={onTurnPageClick}
                    isActive={showLyric}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    hidden: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0,
        pointerEvents: "none",
        transform: [{ translateX: 10000 }],
    },
});
