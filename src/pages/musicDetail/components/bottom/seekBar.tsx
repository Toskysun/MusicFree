import React, { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import rpx from "@/utils/rpx";
import Slider from "@react-native-community/slider";
import timeformat from "@/utils/timeformat";
import { fontSizeConst } from "@/constants/uiConst";
import TrackPlayer, { useProgress } from "@/core/trackPlayer";

interface ITimeLabelProps {
    time: number;
}

function TimeLabel(props: ITimeLabelProps) {
    return (
        <Text style={style.text}>{timeformat(Math.max(props.time, 0))}</Text>
    );
}

export default function SeekBar() {
    const progress = useProgress(1000);
    const [tmpProgress, setTmpProgress] = useState<number | null>(null);
    const slidingRef = useRef(false);

    return (
        <View style={style.wrapper}>
            <Slider
                style={style.slider}
                minimumTrackTintColor={"#cccccc"}
                maximumTrackTintColor={"#999999"}
                thumbTintColor={"#dddddd"}
                minimumValue={0}
                maximumValue={progress.duration}
                onSlidingStart={() => {
                    slidingRef.current = true;
                }}
                onValueChange={val => {
                    if (slidingRef.current) {
                        setTmpProgress(val);
                    }
                }}
                onSlidingComplete={val => {
                    slidingRef.current = false;
                    setTmpProgress(null);
                    if (val >= progress.duration - 2) {
                        val = progress.duration - 2;
                    }
                    TrackPlayer.seekTo(val);
                }}
                value={progress.position}
            />
            <View style={style.timeRow}>
                <TimeLabel time={tmpProgress ?? progress.position} />
                <TimeLabel time={progress.duration} />
            </View>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        paddingHorizontal: rpx(36),
    },
    slider: {
        width: "100%",
        height: rpx(40),
    },
    timeRow: {
        width: "100%",
        flexDirection: "row",
        justifyContent: "space-between",
        paddingHorizontal: rpx(24),
    },
    text: {
        fontSize: fontSizeConst.description,
        includeFontPadding: false,
        color: "#cccccc",
    },
});
