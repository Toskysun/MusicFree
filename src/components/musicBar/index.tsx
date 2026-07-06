import React, { memo, useEffect, useState } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import { CircularProgressBase } from "react-native-circular-progress-indicator";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showPanel } from "../panels/usePanel";
import useColors from "@/hooks/useColors";
import IconButton from "../base/iconButton";
import TrackPlayer, {
    useCurrentMusic,
    useMusicState,
    useProgress,
} from "@/core/trackPlayer";
import { musicIsPaused } from "@/utils/trackUtils";
import MusicInfo from "./musicInfo";
import Icon from "@/components/base/icon.tsx";

function CircularPlayBtn() {
    const progress = useProgress();
    const musicState = useMusicState();
    const colors = useColors();

    const isPaused = musicIsPaused(musicState);

    return (
        <CircularProgressBase
            activeStrokeWidth={rpx(5)}
            inActiveStrokeWidth={rpx(3)}
            inActiveStrokeOpacity={0.2}
            value={
                progress?.duration
                    ? (100 * progress.position) / progress.duration
                    : 0
            }
            duration={100}
            radius={rpx(31)}
            activeStrokeColor={colors.primary}
            inActiveStrokeColor={colors.textSecondary}>
            <IconButton
                accessibilityLabel={"播放或暂停歌曲"}
                name={isPaused ? "play" : "pause"}
                sizeType={"normal"}
                hitSlop={{
                    top: 10,
                    left: 10,
                    right: 10,
                    bottom: 10,
                }}
                color={colors.musicBarText}
                onPress={async () => {
                    if (isPaused) {
                        await TrackPlayer.play();
                    } else {
                        await TrackPlayer.pause();
                    }
                }}
            />
        </CircularProgressBase>
    );
}
function MusicBar() {
    const musicItem = useCurrentMusic();

    const [showKeyboard, setKeyboardStatus] = useState(false);

    const colors = useColors();
    const safeAreaInsets = useSafeAreaInsets();

    useEffect(() => {
        const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
            setKeyboardStatus(true);
        });
        const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
            setKeyboardStatus(false);
        });

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    return (
        <>
            {musicItem && !showKeyboard && (
                <View
                    style={[
                        style.wrapper,
                        {
                            backgroundColor: colors.musicBar,
                            borderColor: colors.border,
                            shadowColor: colors.shadow,
                            paddingLeft: safeAreaInsets.left,
                            paddingRight: safeAreaInsets.right + rpx(18),
                        },
                    ]}
                    accessible
                    accessibilityLabel={`歌曲: ${musicItem.title} 歌手: ${musicItem.artist}`}
                    // onPress={() => {
                    //     navigate(ROUTE_PATH.MUSIC_DETAIL);
                    // }}
                >
                    <MusicInfo musicItem={musicItem} />
                    <View style={style.actionGroup}>
                        <CircularPlayBtn />
                        <Icon
                            accessible
                            accessibilityLabel="播放列表"
                            name="playlist"
                            size={rpx(56)}
                            onPress={() => {
                                showPanel("PlayList");
                            }}
                            color={colors.musicBarText}
                            style={[style.actionIcon]}
                        />
                    </View>
                </View>
            )}
        </>
    );
}

export default memo(MusicBar, () => true);

const style = StyleSheet.create({
    wrapper: {
        height: rpx(112),
        flexDirection: "row",
        alignItems: "center",
        marginHorizontal: rpx(18),
        marginBottom: rpx(12),
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: rpx(24),
        overflow: "hidden",
        shadowOffset: { width: 0, height: rpx(8) },
        shadowOpacity: 0.18,
        shadowRadius: rpx(16),
        elevation: 8,
    },
    actionGroup: {
        width: rpx(164),
        justifyContent: "flex-end",
        flexDirection: "row",
        alignItems: "center",
    },
    actionIcon: {
        marginLeft: rpx(28),
    },
});
