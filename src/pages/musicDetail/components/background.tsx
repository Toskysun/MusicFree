import React, { useMemo } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { ImgAsset } from "@/constants/assetsConst";
import { useCurrentMusic } from "@/core/trackPlayer";
import MaskedView from "@react-native-masked-view/masked-view";
import LinearGradient from "react-native-linear-gradient";
import {
    getImmersiveCoverHeight,
    IMMERSIVE_CLEAR_VISIBLE_RATIO,
} from "./immersiveCover";

interface IBackgroundProps {
    immersiveCoverEnabled?: boolean;
    showImmersiveCover?: boolean;
}

export default function Background(props: IBackgroundProps) {
    const {
        immersiveCoverEnabled = false,
        showImmersiveCover = false,
    } = props;
    const musicItem = useCurrentMusic();
    const { width: windowWidth } = useWindowDimensions();

    const artworkSource = useMemo(() => {
        if (!musicItem?.artwork) {
            return ImgAsset.albumDefault;
        }

        if(typeof musicItem.artwork === "string") {
            return {
                uri: musicItem.artwork,
            };
        }
        return musicItem.artwork;

    }, [musicItem?.artwork]);
    const immersiveCoverHeight = getImmersiveCoverHeight(windowWidth);
    const immersiveClearHeight =
        immersiveCoverHeight * IMMERSIVE_CLEAR_VISIBLE_RATIO;
    const immersiveFadeHeight = immersiveCoverHeight - immersiveClearHeight;
    const immersiveBlurSolidHeight = immersiveCoverHeight * 0.82;
    const immersiveBlurFadeHeight =
        immersiveCoverHeight - immersiveBlurSolidHeight;

    return (
        <>
            <View style={style.background} />
            <Image
                style={style.blur}
                blurRadius={50}
                resizeMode="cover"
                source={artworkSource}
            />
            {immersiveCoverEnabled ? (
                <Image
                    style={[
                        style.blur,
                        style.immersiveBaseBlur,
                        !showImmersiveCover ? style.hiddenLayer : null,
                    ]}
                    blurRadius={50}
                    resizeMode="stretch"
                    source={artworkSource}
                />
            ) : null}
            {immersiveCoverEnabled ? (
                <View
                    pointerEvents="none"
                    style={[
                        style.immersiveLayer,
                        !showImmersiveCover ? style.hiddenLayer : null,
                    ]}>
                    <MaskedView
                        style={[
                            style.immersiveArtworkMask,
                            {
                                width: immersiveCoverHeight,
                                height: immersiveCoverHeight,
                            },
                        ]}
                        androidRenderingMode="software"
                        maskElement={
                            <View style={style.immersiveMask}>
                                <View
                                    style={[
                                        style.immersiveMaskSolid,
                                        { height: immersiveBlurSolidHeight },
                                    ]}
                                />
                                <LinearGradient
                                    colors={[
                                        "rgba(0,0,0,1)",
                                        "rgba(0,0,0,0)",
                                    ]}
                                    style={{ height: immersiveBlurFadeHeight }}
                                />
                            </View>
                        }>
                        <Image
                            blurRadius={34}
                            resizeMode="contain"
                            style={style.immersiveArtwork}
                            source={artworkSource}
                        />
                    </MaskedView>
                    <MaskedView
                        style={[
                            style.immersiveArtworkMask,
                            {
                                width: immersiveCoverHeight,
                                height: immersiveCoverHeight,
                            },
                        ]}
                        androidRenderingMode="software"
                        maskElement={
                            <View style={style.immersiveMask}>
                                <View
                                    style={[
                                        style.immersiveMaskSolid,
                                        { height: immersiveClearHeight },
                                    ]}
                                />
                                <LinearGradient
                                    colors={[
                                        "rgba(0,0,0,1)",
                                        "rgba(0,0,0,0)",
                                    ]}
                                    style={{ height: immersiveFadeHeight }}
                                />
                            </View>
                        }>
                        <Image
                            style={[
                                style.immersiveArtwork,
                                {
                                    width: immersiveCoverHeight,
                                    height: immersiveCoverHeight,
                                },
                            ]}
                            resizeMode="contain"
                            source={artworkSource}
                        />
                    </MaskedView>
                </View>
            ) : null}
        </>
    );
}

const style = StyleSheet.create({
    background: {
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "#000",
    },
    blur: {
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.5,
    },
    immersiveBaseBlur: {
        opacity: 0.5,
    },
    hiddenLayer: {
        opacity: 0,
    },
    immersiveLayer: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
    },
    immersiveArtworkMask: {
        position: "absolute",
        top: 0,
    },
    immersiveMask: {
        width: "100%",
        height: "100%",
    },
    immersiveMaskSolid: {
        width: "100%",
        backgroundColor: "black",
    },
    immersiveArtwork: {
        width: "100%",
        height: "100%",
    },
});
