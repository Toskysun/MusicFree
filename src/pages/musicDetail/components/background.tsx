import React, { useMemo } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { ImgAsset } from "@/constants/assetsConst";
import { useCurrentMusic } from "@/core/trackPlayer";
import { getImmersiveCoverHeight } from "./immersiveCover";

interface IBackgroundProps {
    showImmersiveCover?: boolean;
}

export default function Background(props: IBackgroundProps) {
    const { showImmersiveCover = false } = props;
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

    return (
        <>
            <View style={style.background} />
            <Image
                style={[
                    style.blur,
                    showImmersiveCover ? style.immersiveBaseBlur : null,
                ]}
                blurRadius={50}
                resizeMode="cover"
                source={artworkSource}
            />
            {showImmersiveCover ? (
                <View pointerEvents="none" style={style.immersiveLayer}>
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
    immersiveArtwork: {
        position: "absolute",
        top: 0,
    },
});
