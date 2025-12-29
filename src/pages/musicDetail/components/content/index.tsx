import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, View, LayoutAnimation, Platform, UIManager } from "react-native";
import AlbumCover from "./albumCover";
import Lyric from "./lyric";
import useOrientation from "@/hooks/useOrientation";
import Config from "@/core/appConfig";
import globalStyle from "@/constants/globalStyle";

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function Content() {
    const [tab, selectTab] = useState<"album" | "lyric">(
        Config.getConfig("basic.musicDetailDefault") || "album",
    );
    const orientation = useOrientation();
    const prevOrientation = useRef(orientation);

    // Smooth layout transition when orientation changes
    useEffect(() => {
        if (prevOrientation.current !== orientation) {
            LayoutAnimation.configureNext(
                LayoutAnimation.create(
                    200,
                    LayoutAnimation.Types.easeInEaseOut,
                    LayoutAnimation.Properties.opacity
                )
            );
            prevOrientation.current = orientation;
        }
    }, [orientation]);

    const showAlbumCover = tab === "album" || orientation === "horizontal";
    const showLyric = tab === "lyric" && orientation !== "horizontal";

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
            {/* Keep AlbumCover mounted to preserve mini lyric state, use display to hide */}
            <View style={[
                globalStyle.fwflex1,
                !showAlbumCover && styles.hidden,
            ]}>
                <AlbumCover onTurnPageClick={onTurnPageClick} />
            </View>
            {/* Keep Lyric mounted to preserve scroll position, use display to hide */}
            <View style={[
                globalStyle.fwflex1,
                !showLyric && styles.hidden,
            ]}>
                <Lyric onTurnPageClick={onTurnPageClick} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    hidden: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0,
        pointerEvents: 'none',
    },
});
