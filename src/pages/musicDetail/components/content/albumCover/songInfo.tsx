import React, { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import rpx from "@/utils/rpx";
import { useCurrentMusic } from "@/core/trackPlayer";
import { fontSizeConst, fontWeightConst, iconSizeConst } from "@/constants/uiConst";
import useOrientation from "@/hooks/useOrientation";
import { useAppConfig } from "@/core/appConfig";
import Tag from "@/components/base/tag";
import { getCoverLeftMargin } from "./index";
import Icon from "@/components/base/icon.tsx";
import MusicSheet, { useFavorite } from "@/core/musicSheet";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import { showPanel } from "@/components/panels/usePanel";
import pluginManager from "@/core/pluginManager";

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
    const navigate = useNavigate();

    const containerStyle = useMemo(() => {
        if (isHorizontal) {
            return {
                paddingHorizontal: rpx(24),
            };
        }
        return {
            paddingHorizontal: getCoverLeftMargin(coverStyle),
        };
    }, [coverStyle, isHorizontal]);

    // 处理歌手点击
    // 使用 musicItem.singerList 获取完整的歌手信息（包含 id/mid）
    const handleArtistPress = useCallback(() => {
        if (!musicItem?.artist || !musicItem?.platform) {
            return;
        }

        const plugin = pluginManager.getByMedia(musicItem);
        if (!plugin) {
            return;
        }

        // 获取歌手列表（插件修改后会包含 singerList）
        const item = musicItem as any;
        const singerList: Array<{id: number | string; mid?: string; name: string; avatar?: string}> = item.singerList || [];

        if (singerList.length === 0) {
            return;
        }

        if (singerList.length === 1) {
            // 单歌手，直接跳转
            const singer = singerList[0];
            const artistItem: IArtist.IArtistItem = {
                id: singer.id,
                singerMID: singer.mid,  // QQ音乐有mid，其他插件可能没有
                name: singer.name,
                platform: musicItem.platform,
                avatar: singer.avatar || "",
                worksNum: 0,
            };

            navigate(ROUTE_PATH.ARTIST_DETAIL, {
                artistItem,
                pluginHash: plugin.hash ?? "",
            });
        } else {
            // 多歌手，显示选择面板
            showPanel("ArtistSelectPanel", {
                singerList,
                platform: musicItem.platform,
            });
        }
    }, [musicItem, navigate]);

    // 处理专辑点击
    const handleAlbumPress = useCallback(() => {
        if (!musicItem?.album || !musicItem?.platform) {
            return;
        }

        const plugin = pluginManager.getByMedia(musicItem);
        if (!plugin) {
            return;
        }

        // 从 musicItem 中获取专辑相关字段
        // QQ音乐等插件会在 musicItem 中包含 albummid、albumid 等字段
        const item = musicItem as any;
        const albumMID = item.albummid || item.albumMID || item.album_mid;
        const albumId = item.albumid || item.albumId || item.album_id;

        // 构造 albumItem，包含插件需要的字段
        const albumItem: IAlbum.IAlbumItem = {
            id: albumId || musicItem.album,
            albumMID: albumMID,
            title: musicItem.album,
            platform: musicItem.platform,
            artwork: musicItem.artwork,
            artist: musicItem.artist,
            description: "",
        };

        navigate(ROUTE_PATH.ALBUM_DETAIL, {
            albumItem,
        });
    }, [musicItem, navigate]);

    return (
        <View style={[
            styles.container,
            containerStyle,
            isHorizontal ? styles.horizontalContainer : null,
        ]}>
            <View style={[styles.titleRow, isHorizontal ? styles.titleRowHorizontal : null]}>
                <Text
                    numberOfLines={isHorizontal ? 1 : 2}
                    style={[styles.title, isHorizontal ? styles.horizontalTitle : null]}>
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
            <View style={[styles.artistRow, isHorizontal ? styles.artistRowHorizontal : null]}>
                <Pressable
                    onPress={handleArtistPress}
                    style={({ pressed }) => [
                        styles.clickableContainer,
                        pressed && styles.pressed,
                    ]}>
                    <Text numberOfLines={1} style={styles.artist}>
                        {musicItem?.artist ?? "--"}
                    </Text>
                </Pressable>
                {musicItem?.platform ? (
                    <Tag
                        tagName={musicItem.platform}
                        containerStyle={styles.tagBg}
                        style={styles.tagText}
                    />
                ) : null}
            </View>
            {!isHorizontal && musicItem?.album ? (
                <Pressable
                    onPress={handleAlbumPress}
                    style={({ pressed }) => [
                        styles.clickableContainer,
                        pressed && styles.pressed,
                    ]}>
                    <Text numberOfLines={1} style={styles.album}>
                        {musicItem.album}
                    </Text>
                </Pressable>
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
    titleRowHorizontal: {
        alignItems: "center",
        marginBottom: rpx(10),
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
    artistRowHorizontal: {
        marginBottom: 0,
    },
    artist: {
        color: "white",
        fontSize: fontSizeConst.subTitle,
        includeFontPadding: false,
        textAlign: "left",
        opacity: 0.9,
        flexShrink: 1,
    },
    clickableContainer: {
        flexShrink: 1,
    },
    pressed: {
        opacity: 0.6,
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
    horizontalContainer: {
        marginTop: 0,
        paddingVertical: rpx(12),
    },
    horizontalTitle: {
        fontSize: fontSizeConst.appbar,
    },
});
