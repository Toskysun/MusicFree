import React, { memo, useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import { CircularProgressBase } from "react-native-circular-progress-indicator";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showPanel } from "../panels/usePanel";
import useColors from "@/hooks/useColors";
import TrackPlayer, {
    useCurrentMusic,
    useMusicState,
    useProgress,
} from "@/core/trackPlayer";
import { musicIsPaused } from "@/utils/trackUtils";
import MusicInfo from "./musicInfo";
import Icon from "@/components/base/icon.tsx";
import { iconSizeConst } from "@/constants/uiConst";

/** Single control: ring + icon share the same box and stay concentric. */
const PLAY_RADIUS = rpx(28);
const PLAY_STROKE = rpx(3);
const PLAY_SIZE = PLAY_RADIUS * 2;
const PLAY_ICON_SIZE = iconSizeConst.normal;
const PLAYLIST_ICON_SIZE = rpx(48);
const BAR_HEIGHT = rpx(112);

function CircularPlayBtn() {
    const progress = useProgress();
    const musicState = useMusicState();
    const colors = useColors();

    const isPaused = musicIsPaused(musicState);
    const progressValue = progress?.duration
        ? Math.min(100, Math.max(0, (100 * progress.position) / progress.duration))
        : 0;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={"播放或暂停歌曲"}
            hitSlop={10}
            onPress={async () => {
                if (isPaused) {
                    await TrackPlayer.play();
                } else {
                    await TrackPlayer.pause();
                }
            }}
            style={style.playBtn}>
            {/* Layer 1: progress ring — same box, same center */}
            <View style={style.playLayer} pointerEvents="none">
                <CircularProgressBase
                    activeStrokeWidth={PLAY_STROKE}
                    inActiveStrokeWidth={rpx(2)}
                    inActiveStrokeOpacity={0.25}
                    value={progressValue}
                    duration={100}
                    radius={PLAY_RADIUS}
                    activeStrokeColor={colors.primary}
                    inActiveStrokeColor={colors.textSecondary}
                />
            </View>
            {/* Layer 2: icon — same box, same center (not a sibling in flow) */}
            <View style={style.playLayer} pointerEvents="none">
                <Icon
                    name={isPaused ? "play" : "pause"}
                    size={PLAY_ICON_SIZE}
                    color={colors.musicBarText}
                    style={isPaused ? style.playIconNudge : undefined}
                />
            </View>
        </Pressable>
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
                        style.wrapperOuter,
                        {
                            shadowColor: colors.shadow,
                            marginLeft: rpx(18) + safeAreaInsets.left,
                            marginRight: rpx(18) + safeAreaInsets.right,
                        },
                    ]}>
                    <View
                        style={[
                            style.wrapperInner,
                            {
                                backgroundColor: colors.musicBar,
                                borderColor: colors.border,
                            },
                        ]}
                        accessible
                        accessibilityLabel={`歌曲: ${musicItem.title} 歌手: ${musicItem.artist}`}>
                        <MusicInfo musicItem={musicItem} />
                        <View style={style.actionGroup}>
                            <CircularPlayBtn />
                            <Icon
                                accessible
                                accessibilityLabel="播放列表"
                                name="playlist"
                                size={PLAYLIST_ICON_SIZE}
                                onPress={() => {
                                    showPanel("PlayList");
                                }}
                                color={colors.musicBarText}
                                style={style.actionIcon}
                            />
                        </View>
                    </View>
                </View>
            )}
        </>
    );
}

export default memo(MusicBar, () => true);

const style = StyleSheet.create({
    wrapperOuter: {
        marginBottom: rpx(12),
        borderRadius: rpx(24),
        shadowOffset: { width: 0, height: rpx(8) },
        shadowOpacity: 0.18,
        shadowRadius: rpx(16),
        elevation: 8,
        backgroundColor: "transparent",
    },
    wrapperInner: {
        height: BAR_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: rpx(24),
        overflow: "hidden",
        paddingRight: rpx(16),
    },
    actionGroup: {
        height: "100%",
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: rpx(4),
    },
    /**
     * One fixed square. Both ring and icon are absolute-filled layers so they
     * share the exact same geometry (no flow siblings that can drift apart).
     */
    playBtn: {
        width: PLAY_SIZE,
        height: PLAY_SIZE,
        position: "relative",
    },
    playLayer: {
        position: "absolute",
        top: 0,
        left: 0,
        width: PLAY_SIZE,
        height: PLAY_SIZE,
        alignItems: "center",
        justifyContent: "center",
    },
    playIconNudge: {
        // Play triangle reads slightly left-of-center optically.
        marginLeft: rpx(2),
    },
    actionIcon: {
        marginLeft: rpx(18),
    },
});
