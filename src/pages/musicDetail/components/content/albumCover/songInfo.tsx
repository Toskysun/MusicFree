import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import rpx from "@/utils/rpx";
import { useCurrentMusic } from "@/core/trackPlayer";
import { fontSizeConst, fontWeightConst, iconSizeConst } from "@/constants/uiConst";
import useOrientation from "@/hooks/useOrientation";
import { useAppConfig } from "@/core/appConfig";
import Tag from "@/components/base/tag";
import { getCoverLeftMargin } from "./index";
import Icon from "@/components/base/icon.tsx";
import MusicSheet, { useFavorite } from "@/core/musicSheet";

interface ISongInfoProps {
    showHeart?: boolean;
}

export default function SongInfo(props: ISongInfoProps) {
    const { showHeart = false } = props;
    const musicItem = useCurrentMusic();
    const orientation = useOrientation();
    const isHorizontal = orientation === "horizontal";
    const coverStyle = useAppConfig("theme.coverStyle") ?? "square";
    const isFavorite = useFavorite(musicItem);

    const containerStyle = useMemo(() => ({
        paddingHorizontal: getCoverLeftMargin(coverStyle),
    }), [coverStyle]);

    return (
        <View style={[styles.container, containerStyle, isHorizontal && styles.hidden]}>
            <View style={styles.titleRow}>
                <Text numberOfLines={2} style={styles.title}>
                    {musicItem?.title ?? "--"}
                </Text>
                {showHeart && (
                    <Icon
                        name={isFavorite ? "heart" : "heart-outline"}
                        size={iconSizeConst.normal}
                        color={isFavorite ? "red" : "white"}
                        onPress={() => {
                            if (!musicItem) {
                                return;
                            }
                            if (isFavorite) {
                                MusicSheet.removeMusic(MusicSheet.defaultSheet.id, musicItem);
                            } else {
                                MusicSheet.addMusic(MusicSheet.defaultSheet.id, musicItem);
                            }
                        }}
                    />
                )}
            </View>
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
    titleRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        width: "100%",
        marginBottom: rpx(20),
    },
    title: {
        color: "white",
        fontSize: fontSizeConst.title,
        fontWeight: fontWeightConst.semibold,
        includeFontPadding: false,
        textAlign: "left",
        flex: 1,
        marginRight: rpx(16),
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
