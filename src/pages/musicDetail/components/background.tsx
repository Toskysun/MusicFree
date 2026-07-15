import React, { useEffect, useMemo } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { ImgAsset } from "@/constants/assetsConst";
import { useCurrentMusic } from "@/core/trackPlayer";
import MaskedView from "@react-native-masked-view/masked-view";
import LinearGradient from "react-native-linear-gradient";
import {
    getImmersiveCoverHeight,
    IMMERSIVE_CLEAR_VISIBLE_RATIO,
} from "./immersiveCover";
import { resolveArtwork } from "@/utils/artwork";
import { useMediaExtraProperty } from "@/utils/mediaExtra";

interface IBackgroundProps {
    immersiveCoverEnabled?: boolean;
    renderImmersiveCover?: boolean;
    showImmersiveCover?: boolean;
}

export default function Background(props: IBackgroundProps) {
    const {
        immersiveCoverEnabled = false,
        renderImmersiveCover,
        showImmersiveCover = false,
    } = props;
    const musicItem = useCurrentMusic();
    const associatedArtwork = useMediaExtraProperty(
        musicItem,
        "associatedArtwork",
    );
    const { width: windowWidth } = useWindowDimensions();

    const resolvedArtwork = resolveArtwork(musicItem);

    // associatedArtwork forces refresh when mediaExtra changes (resolvedArtwork
    // string may be identical when switching back after unassociate in edge cases)
    const artworkSource = useMemo(() => {
        if (!resolvedArtwork) {
            return ImgAsset.albumDefault;
        }

        if (typeof resolvedArtwork === "string") {
            return {
                uri: resolvedArtwork,
            };
        }
        return resolvedArtwork;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedArtwork, associatedArtwork]);

    useEffect(() => {
        if (!immersiveCoverEnabled || typeof resolvedArtwork !== "string") {
            return;
        }
        Image.prefetch(resolvedArtwork);
    }, [immersiveCoverEnabled, resolvedArtwork]);

    const immersiveCoverHeight = getImmersiveCoverHeight(windowWidth);
    const immersiveClearHeight =
        immersiveCoverHeight * IMMERSIVE_CLEAR_VISIBLE_RATIO;
    const immersiveFadeHeight = immersiveCoverHeight - immersiveClearHeight;
    const immersiveBlurSolidHeight = immersiveCoverHeight * 0.82;
    const immersiveBlurFadeHeight =
        immersiveCoverHeight - immersiveBlurSolidHeight;
    const shouldRenderImmersiveCover =
        immersiveCoverEnabled && (renderImmersiveCover ?? showImmersiveCover);

    return (
        <>
            <View style={style.background} />
            <Image
                fadeDuration={0}
                style={style.blur}
                blurRadius={50}
                resizeMode="cover"
                source={artworkSource}
            />
            {shouldRenderImmersiveCover ? (
                <Image
                    fadeDuration={0}
                    style={[style.blur, style.immersiveBaseBlur]}
                    blurRadius={50}
                    resizeMode="stretch"
                    source={artworkSource}
                />
            ) : null}
            {shouldRenderImmersiveCover ? (
                <View
                    pointerEvents="none"
                    renderToHardwareTextureAndroid
                    shouldRasterizeIOS
                    style={style.immersiveLayer}>
                    <MaskedView
                        style={[
                            style.immersiveArtworkMask,
                            {
                                width: immersiveCoverHeight,
                                height: immersiveCoverHeight,
                            },
                        ]}
                        androidRenderingMode="hardware"
                        collapsable={false}
                        renderToHardwareTextureAndroid
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
                            fadeDuration={0}
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
                        androidRenderingMode="hardware"
                        collapsable={false}
                        renderToHardwareTextureAndroid
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
                            fadeDuration={0}
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
