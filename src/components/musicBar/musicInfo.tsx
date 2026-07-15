import React, { memo, useLayoutEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import FastImage from "../base/fastImage";
import { ImgAsset } from "@/constants/assetsConst";
import Color from "color";
import ThemeText from "../base/themeText";
import useColors from "@/hooks/useColors";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import TrackPlayer from "@/core/trackPlayer";
import Animated, {
    SharedValue,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { timingConfig } from "@/constants/commonConst";
import { resolveArtwork } from "@/utils/artwork";
import { useMediaExtraProperty } from "@/utils/mediaExtra";

interface IBarMusicItemProps {
    musicItem: IMusic.IMusicItem | null;
    activeIndex: number; // 当前展示的是0/1/2
    transformSharedValue: SharedValue<number>;
}
function BarMusicItemView(props: IBarMusicItemProps) {
    const { musicItem, activeIndex, transformSharedValue } = props;
    const colors = useColors();
    // Subscribe so minibar updates when cover is associated/restored
    useMediaExtraProperty(musicItem, "associatedArtwork");
    const displayArtwork = resolveArtwork(musicItem);

    const animatedStyles = useAnimatedStyle(() => {
        return {
            left: `${(transformSharedValue.value + activeIndex) * 100}%`,
        };
    }, [activeIndex]);

    if (!musicItem) {
        return null;
    }

    return (
        <Animated.View
            style={[
                styles.container,
                // Parent MusicBar already applies horizontal safe-area margins.
                // Do not add safeAreaInsets.left again or text/controls drift apart.
                styles.containerPadding,
                animatedStyles,
            ]}>
            <View collapsable={false}>
                <FastImage
                    key={displayArtwork ?? "default"}
                    style={styles.artworkImg}
                    source={displayArtwork}
                    placeholderSource={ImgAsset.albumDefault}
                />
            </View>
            <View accessible={false} style={styles.textWrapper}>
                <ThemeText
                    fontSize="subTitle"
                    fontWeight="semibold"
                    fontColor="musicBarText"
                    numberOfLines={1}>
                    {musicItem?.title}
                </ThemeText>
                {musicItem?.artist && (
                    <ThemeText
                        fontSize="description"
                        numberOfLines={1}
                        style={styles.artist}
                        color={Color(colors.musicBarText)
                            .alpha(0.62)
                            .toString()}>
                        {musicItem.artist}
                    </ThemeText>
                )}
            </View>
        </Animated.View>
    );
}

const BarMusicItem = memo(
    BarMusicItemView,
    (prev, curr) =>
        prev.musicItem === curr.musicItem &&
        prev.activeIndex === curr.activeIndex,
);

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        width: "100%",
        alignItems: "center",
        position: "absolute",
    },
    containerPadding: {
        paddingLeft: rpx(24),
        paddingRight: rpx(12),
    },
    textWrapper: {
        flex: 1,
        flexShrink: 1,
        justifyContent: "center",
        // Leave room so long titles don't paint under the play controls.
        minWidth: 0,
    },
    artworkImg: {
        width: rpx(76),
        height: rpx(76),
        borderRadius: rpx(16),
        marginRight: rpx(18),
        flexShrink: 0,
    },
    artist: {
        marginTop: rpx(7),
    },
});

interface IMusicInfoProps {
    musicItem: IMusic.IMusicItem | null;
    paddingLeft?: number;
}

function skipMusicItem(direction: number) {
    if (direction === -1) {
        TrackPlayer.skipToNext();
    } else if (direction === 1) {
        TrackPlayer.skipToPrevious();
    }
}

export default function MusicInfo(props: IMusicInfoProps) {
    const { musicItem } = props;
    const navigate = useNavigate();
    const siblingMusicItems = useMemo(() => {
        if (!musicItem) {
            return {
                prev: null,
                next: null,
            };
        }
        return {
            prev: TrackPlayer.previousMusic,
            next: TrackPlayer.nextMusic,
        };
    }, [musicItem]);

    // +- 1
    const transformSharedValue = useSharedValue(0);

    const musicItemWidthValue = useSharedValue(0);

    const tapGesture = Gesture.Tap()
        .onStart(() => {
            navigate(ROUTE_PATH.MUSIC_DETAIL);
        })
        .runOnJS(true);

    useLayoutEffect(() => {
        transformSharedValue.value = 0;
    }, [musicItem, transformSharedValue]);

    const panGesture = Gesture.Pan()
        .minPointers(1)
        .maxPointers(1)
        .onUpdate(e => {
            if (musicItemWidthValue.value) {
                transformSharedValue.value =
                    e.translationX / musicItemWidthValue.value;
            }
        })
        .onEnd((e, success) => {
            if (!success) {
                // 还原到原始位置
                transformSharedValue.value = withTiming(
                    0,
                    timingConfig.animationFast,
                );
            } else {
                // fling
                const deltaX = e.translationX;
                const vX = e.velocityX;

                let skip = 0;
                if (musicItemWidthValue.value) {
                    const rate = deltaX / musicItemWidthValue.value;

                    if (Math.abs(rate) > 0.3) {
                        // 先判断距离
                        skip = vX > 0 ? 1 : -1;
                        transformSharedValue.value = withTiming(
                            skip,
                            timingConfig.animationFast,
                            () => {
                                runOnJS(skipMusicItem)(skip);
                            },
                        );
                    } else if (Math.abs(vX) > 1500) {
                        // 再判断速度
                        skip = vX > 0 ? 1 : -1;
                        transformSharedValue.value = skip;
                        runOnJS(skipMusicItem)(skip);
                    } else {
                        transformSharedValue.value = withTiming(
                            0,
                            timingConfig.animationFast,
                        );
                    }
                } else {
                    transformSharedValue.value = 0;
                }
            }
        });

    const gesture = Gesture.Race(panGesture, tapGesture);

    return (
        <GestureDetector gesture={gesture}>
            <View
                style={musicInfoStyles.infoContainer}
                onLayout={e => {
                    musicItemWidthValue.value = e.nativeEvent.layout.width;
                }}>
                <BarMusicItem
                    transformSharedValue={transformSharedValue}
                    musicItem={siblingMusicItems.prev}
                    activeIndex={-1}
                />
                <BarMusicItem
                    transformSharedValue={transformSharedValue}
                    musicItem={musicItem}
                    activeIndex={0}
                />
                <BarMusicItem
                    transformSharedValue={transformSharedValue}
                    musicItem={siblingMusicItems.next}
                    activeIndex={1}
                />
            </View>
        </GestureDetector>
    );
}

const musicInfoStyles = StyleSheet.create({
    infoContainer: {
        flex: 1,
        height: "100%",
        alignItems: "center",
        flexDirection: "row",
        overflow: "hidden",
    },
});
