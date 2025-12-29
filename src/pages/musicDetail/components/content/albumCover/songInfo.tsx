import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import rpx from "@/utils/rpx";
import { useCurrentMusic } from "@/core/trackPlayer";
import { fontSizeConst, fontWeightConst } from "@/constants/uiConst";
import useOrientation from "@/hooks/useOrientation";
import { useAppConfig } from "@/core/appConfig";
import Tag from "@/components/base/tag";
import { getCoverLeftMargin } from "./index";

export default function SongInfo() {
    const musicItem = useCurrentMusic();
    const orientation = useOrientation();
    const isHorizontal = orientation === "horizontal";
    const coverStyle = useAppConfig("theme.coverStyle") ?? "square";

    const containerStyle = useMemo(() => ({
        paddingHorizontal: getCoverLeftMargin(coverStyle),
    }), [coverStyle]);

    return (
        <View style={[styles.container, containerStyle, isHorizontal && styles.hidden]}>
            <Text numberOfLines={2} style={styles.title}>
                {musicItem?.title ?? "--"}
            </Text>
            <View style={styles.artistRow}>
                <Text numberOfLines={1} style={styles.artist}>
                    {musicItem?.artist ?? "--"}
                </Text>
                {musicItem?.platform ? (
                    <Tag
                        tagName={musicItem.platform}
                        containerStyle={styles.tagBg}
                        style={styles.tagText}
                    />
                ) : null}
            </View>
            {musicItem?.album ? (
                <Text numberOfLines={1} style={styles.album}>
                    {musicItem.album}
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        paddingVertical: rpx(24),
        alignItems: "flex-start",
        marginTop: rpx(20),
    },
    title: {
        color: "white",
        fontSize: fontSizeConst.title,
        fontWeight: fontWeightConst.semibold,
        includeFontPadding: false,
        textAlign: "left",
        marginBottom: rpx(20),
        width: "100%",
    },
    artistRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: rpx(4),
    },
    artist: {
        color: "white",
        fontSize: fontSizeConst.subTitle,
        includeFontPadding: false,
        textAlign: "left",
        opacity: 0.9,
        flexShrink: 1,
    },
    tagBg: {
        backgroundColor: "rgba(255, 255, 255, 0.2)",
        marginLeft: rpx(12),
    },
    tagText: {
        color: "white",
    },
    album: {
        color: "white",
        fontSize: fontSizeConst.content,
        includeFontPadding: false,
        textAlign: "left",
        opacity: 0.7,
        width: "100%",
    },
    hidden: {
        opacity: 0,
        height: 0,
        overflow: "hidden",
    },
});
