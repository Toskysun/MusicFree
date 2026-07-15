import React from "react";
import { Platform, Share, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import ListItem from "@/components/base/listItem";
import ThemeText from "@/components/base/themeText";
import { ImgAsset } from "@/constants/assetsConst";
import Clipboard from "@react-native-clipboard/clipboard";

import {
    buildFallbackMusicDetailUrl,
    getPlatformMediaId,
    isSameMediaItem,
} from "@/utils/mediaUtils";
import FastImage from "@/components/base/fastImage";
import Toast from "@/utils/toast";
import { devLog } from "@/utils/log";
import LocalMusicSheet from "@/core/localMusicSheet";
import { localMusicSheetId, musicHistorySheetId } from "@/constants/commonConst";
import { ROUTE_PATH } from "@/core/router";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import PanelBase from "../base/panelBase";
import { FlatList } from "react-native-gesture-handler";
import musicHistory from "@/core/musicHistory";
import { showDialog, hideDialog } from "@/components/dialogs/useDialog";
import { hidePanel, showPanel } from "../usePanel";
import Divider from "@/components/base/divider";
import { iconSizeConst } from "@/constants/uiConst";
import Config from "@/core/appConfig";
import TrackPlayer, { useCurrentMusic } from "@/core/trackPlayer";
import mediaCache from "@/core/mediaCache";
import { IIconName } from "@/components/base/icon.tsx";
import MusicSheet from "@/core/musicSheet";
import downloader from "@/core/downloader";
import { getMediaExtraProperty } from "@/utils/mediaExtra";
import { hasAssociatedArtwork, resolveArtwork } from "@/utils/artwork";
import lyricManager from "@/core/lyricManager";
import { useI18N } from "@/core/i18n";
import pluginManager from "@/core/pluginManager";
import { musicItemHasQualitySizes } from "@/utils/qualities";

interface IMusicItemOptionsProps {
    /** 歌曲信息 */
    musicItem: IMusic.IMusicItem;
    /** 歌曲所在歌单 */
    musicSheet?: IMusic.IMusicSheetItem;
    /** 来源 */
    from?: string;
}

const ITEM_HEIGHT = rpx(96);

interface IOption {
    icon: IIconName;
    title: string;
    onPress?: () => void;
    show?: boolean;
}

const getAlbumIds = (musicItem: IMusic.IMusicItem) => {
    const item = musicItem as any;
    const albumId = item.albumid || item.albumId || item.album_id;
    const albumMid = item.albummid || item.albumMid;

    if (musicItem.album && !albumId && !albumMid) {
        devLog("warn", "[专辑ID] 未找到专辑ID字段", {
            platform: musicItem.platform,
            album: musicItem.album,
            keys: Object.keys(item).filter(k => k.toLowerCase().includes("album")),
        });
    }

    return { albumId, albumMid };
};

const formatMusicSharePayload = async (musicItem: IMusic.IMusicItem) => {
    const title = musicItem.title?.toString().trim();
    const artist = musicItem.artist?.toString().trim();
    // Keep spaces in title for readability; do not strip newlines from URL line.
    const musicTitle =
        title && artist
            ? `${title} - ${artist}`
            : title ||
              artist ||
              getPlatformMediaId(musicItem) ||
              String(musicItem.id ?? "");

    let detailUrl = "";
    try {
        const plugin = pluginManager.getByMedia(musicItem);
        // PluginMethodsWrapper always exposes this method; it mounts lazy plugins.
        if (plugin?.methods?.getMusicDetailPageUrl) {
            detailUrl =
                (await plugin.methods.getMusicDetailPageUrl(musicItem)) || "";
        }
    } catch (e) {
        devLog("warn", "获取分享链接失败", e);
    }

    // No plugin / plugin returned empty → host platform fallback.
    if (!detailUrl) {
        detailUrl = buildFallbackMusicDetailUrl(musicItem);
    }

    detailUrl = (detailUrl || "").trim();
    // Always put URL in message (Android ignores ShareContent.url).
    const message = detailUrl ? `${musicTitle}\n${detailUrl}` : musicTitle;
    return { message, url: detailUrl || undefined, musicTitle };
};

/** True when Share rejected because the user dismissed the sheet. */
const isShareDismissError = (e: unknown) => {
    const msg = String((e as any)?.message ?? e ?? "");
    return /cancel|dismiss|User did not share|Share is dismissed/i.test(msg);
};

export default function MusicItemOptions(props: IMusicItemOptionsProps) {
    const { musicItem: propseMusicItem, musicSheet, from } = props ?? {};
    const { t } = useI18N();

    // If this is the currently playing music, use the latest state from TrackPlayer
    const currentMusic = useCurrentMusic();
    const musicItem = (currentMusic && isSameMediaItem(currentMusic, propseMusicItem))
        ? currentMusic
        : propseMusicItem;

    const safeAreaInsets = useSafeAreaInsets();

    const downloaded = LocalMusicSheet.isLocalMusic(musicItem);
    const associatedLrc = getMediaExtraProperty(musicItem, "associatedLrc");
    const associatedCover = hasAssociatedArtwork(musicItem);
    const displayArtwork = resolveArtwork(musicItem);

    const options: IOption[] = [
        {
            icon: "identification",
            title: (() => {
                const songId = musicItem.id;
                const songMid = musicItem.songmid || musicItem.mid;

                const ids: string[] = [];
                if (songId) ids.push(`id: ${songId}`);
                if (songMid) ids.push(`mid: ${songMid}`);

                if (ids.length > 0) {
                    return `ID: ${musicItem.platform} (${ids.join(", ")})`;
                }
                return `ID: ${musicItem.platform} ${getPlatformMediaId(musicItem)}`;
            })(),
            onPress: () => {
                mediaCache.setMediaCache(musicItem);
                const copyData: any = {
                    platform: musicItem.platform,
                    id: musicItem.id,
                };
                if (musicItem.songmid || musicItem.mid) {
                    copyData.songmid = musicItem.songmid || musicItem.mid;
                }
                Clipboard.setString(
                    JSON.stringify(copyData, null, ""),
                );
                Toast.success(t("toast.copiedToClipboard"));
            },
        },
        {
            icon: "user",
            title: t("panel.musicItemOptions.author", { artist: musicItem.artist }),
            onPress: () => {
                try {
                    Clipboard.setString(musicItem.artist.toString());
                    Toast.success(t("toast.copiedToClipboard"));
                } catch {
                    Toast.warn(t("toast.copiedToClipboardFailed"));
                }
            },
        },
        {
            icon: "album-outline",
            show: !!musicItem.album,
            title: (() => {
                const { albumId, albumMid } = getAlbumIds(musicItem);
                const albumText = musicItem.album;

                const ids: string[] = [];
                if (albumId) ids.push(`id: ${albumId}`);
                if (albumMid) ids.push(`mid: ${albumMid}`);

                if (ids.length > 0) {
                    return `${t("panel.musicItemOptions.album", { album: albumText })} (${ids.join(", ")})`;
                }
                return t("panel.musicItemOptions.album", { album: albumText });
            })(),
            onPress: () => {
                try {
                    const { albumId, albumMid } = getAlbumIds(musicItem);
                    let copyText = musicItem.album.toString();

                    if (albumId || albumMid) {
                        const copyData: any = {
                            platform: musicItem.platform,
                            album: musicItem.album,
                        };
                        if (albumId) copyData.albumId = albumId;
                        if (albumMid) copyData.albumMid = albumMid;

                        copyText = JSON.stringify(copyData, null, "");
                    }

                    Clipboard.setString(copyText);
                    Toast.success(t("toast.copiedToClipboard"));
                } catch {
                    Toast.warn(t("toast.copiedToClipboardFailed"));
                }
            },
        },
        {
            icon: "share",
            title: t("panel.musicItemOptions.share"),
            onPress: async () => {
                // Close options panel first so the system share sheet is not
                // blocked by the high-zIndex panel overlay on some devices.
                hidePanel();
                try {
                    const { message, url } =
                        await formatMusicSharePayload(musicItem);
                    if (!message) {
                        Toast.warn(t("toast.failToShareMusic"));
                        return;
                    }
                    const content: { title: string; message: string; url?: string } = {
                        title: t("panel.musicItemOptions.shareTitle"),
                        message,
                    };
                    // url is iOS-only; Android already has the link in message.
                    if (url && Platform.OS === "ios") {
                        content.url = url;
                    }
                    const result = await Share.share(content, {
                        dialogTitle: t(
                            "panel.musicItemOptions.shareDialogTitle",
                            {
                                title:
                                    musicItem.title ||
                                    t("panel.musicItemOptions.shareTitle"),
                            },
                        ),
                        subject: t("panel.musicItemOptions.shareTitle"),
                    });
                    if (result?.action === Share.dismissedAction) {
                        return;
                    }
                } catch (e) {
                    if (isShareDismissError(e)) {
                        return;
                    }
                    // Last resort: copy share text so the user still gets the link.
                    try {
                        const { message } =
                            await formatMusicSharePayload(musicItem);
                        if (message) {
                            Clipboard.setString(message);
                            Toast.success(t("toast.copiedToClipboard"));
                            return;
                        }
                    } catch {
                        // ignore
                    }
                    devLog("warn", "分享歌曲失败", e);
                    Toast.warn(t("toast.failToShareMusic"));
                }
            },
        },
        {
            icon: "motion-play",
            title: t("musicListEditor.addToNextPlay"),
            onPress: () => {
                TrackPlayer.addNext(musicItem);
                hidePanel();
            },
        },
        {
            icon: "folder-plus",
            title: t("musicListEditor.addToSheet"),
            onPress: () => {
                showPanel("AddToMusicSheet", { musicItem });
            },
        },
        {
            icon: "arrow-down-tray",
            title: downloaded ? t("panel.musicItemOptions.redownload") : t("common.download"),
            show: true,
            onPress: async () => {
                // 显示加载状态
                showDialog("LoadingDialog", {
                    title: t("downloading.downloadStatus.preparing"),
                });

                try {
                    // 获取插件实例
                    const plugin = pluginManager.getByName(musicItem.platform);
                    let enhancedMusicItem = musicItem;
                    
                    // Fetch full quality/size when missing or sizes are empty.
                    if (
                        plugin?.methods?.getMusicInfo &&
                        (!musicItem.qualities || !musicItemHasQualitySizes(musicItem))
                    ) {
                        const additionalInfo = await plugin.methods.getMusicInfo(musicItem);
                        if (additionalInfo) {
                            enhancedMusicItem = {
                                ...musicItem,
                                ...additionalInfo,
                                qualities:
                                    additionalInfo.qualities ?? musicItem.qualities,
                                // 保持原有的基本信息不被覆盖
                                id: musicItem.id,
                                platform: musicItem.platform,
                            };
                        }
                    }

                    // 隐藏加载对话框
                    hideDialog();

                    // 显示音质选择面板
                    showPanel("MusicQuality", {
                        musicItem: enhancedMusicItem,
                        type: "download",
                        async onQualityPress(quality) {
                            downloader.download(enhancedMusicItem, quality);
                        },
                    });
                } catch {
                    // 隐藏加载对话框
                    hideDialog();
                    
                    // 出错时使用原始音乐信息
                    showPanel("MusicQuality", {
                        musicItem,
                        type: "download",
                        async onQualityPress(quality) {
                            downloader.download(musicItem, quality);
                        },
                    });
                }
            },
        },
        {
            icon: "trash-outline",
            title: t("common.delete"),
            show: !!musicSheet,
            onPress: async () => {
                if (musicSheet?.id === localMusicSheetId) {
                    await LocalMusicSheet.removeMusic(musicItem);
                } else if (musicSheet?.id === musicHistorySheetId) {
                    await musicHistory.removeMusic(musicItem);
                } else {
                    await MusicSheet.removeMusic(musicSheet!.id, musicItem);
                }
                Toast.success(t("toast.deleteSuccess"));
                hidePanel();
            },
        },
        {
            icon: "trash-outline",
            title: t("panel.musicItemOptions.deleteLocalDownload"),
            show: !!downloaded,
            onPress: () => {
                showDialog("SimpleDialog", {
                    title: t("panel.musicItemOptions.deleteLocalDownload"),
                    content: t("panel.musicItemOptions.deleteLocalDownloadConfirm"),
                    async onOk() {
                        try {
                            await LocalMusicSheet.removeMusic(musicItem, true);
                            Toast.success(t("toast.deleteSuccess"));
                        } catch (e: any) {
                            Toast.warn(`${t("panel.musicItemOptions.deleteFailed")} ${e?.message ?? e}`);
                        }
                    },
                });
                hidePanel();
            },
        },
        {
            icon: "chat-bubble-oval-left-ellipsis",
            title: t("panel.musicItemOptions.readComment"),
            show: !!pluginManager.getByMedia(musicItem)?.supportedMethods.has("getMusicComments"),
            onPress: () => {
                if (!musicItem) {
                    return;
                }
                showPanel("MusicComment", {
                    musicItem: musicItem,
                });
            },
        },
        {
            icon: "link",
            title: associatedLrc
                ? t("panel.musicItemOptions.associatedLyric", { platform: associatedLrc.platform, id: associatedLrc.id })
                : t("panel.musicItemOptions.associateLyric"),
            onPress: async () => {
                if (
                    Config.getConfig("basic.associateLyricType") === "input"
                ) {
                    showPanel("AssociateLrc", {
                        musicItem,
                    });
                } else {
                    showPanel("SearchLrc", {
                        musicItem,
                    });
                }
            },
        },
        {
            icon: "link-slash",
            title: t("panel.musicItemOptions.unassociateLyric"),
            show: !!associatedLrc,
            onPress: async () => {
                lyricManager.unassociateLyric(musicItem);
                Toast.success(t("panel.musicItemOptions.unassociateLyricSuccess"));
                hidePanel();
            },
        },
        {
            icon: "album-outline",
            title: associatedCover
                ? t("panel.musicItemOptions.associatedCover")
                : t("panel.musicItemOptions.manageCover"),
            onPress: () => {
                showPanel("CoverOptions", {
                    musicItem,
                });
            },
        },
        {
            icon: "alarm-outline",
            title: t("panel.musicItemOptions.timingClose"),
            show: from === ROUTE_PATH.MUSIC_DETAIL,
            onPress: () => {
                showPanel("TimingClose");
            },
        },
        {
            icon: "archive-box-x-mark",
            title: t("panel.musicItemOptions.clearPluginCache"),
            onPress: () => {
                mediaCache.removeMediaCache(musicItem);
                Toast.success(t("panel.musicItemOptions.cacheCleared"));
            },
        },
    ];

    return (
        <PanelBase
            renderBody={() => (
                <>
                    <View style={style.header}>
                        <FastImage
                            style={style.artwork}
                            source={displayArtwork}
                            placeholderSource={ImgAsset.albumDefault}
                        />
                        <View style={style.content}>
                            <ThemeText numberOfLines={2} style={style.title}>
                                {musicItem?.title}
                            </ThemeText>
                            <ThemeText
                                fontColor="textSecondary"
                                numberOfLines={2}
                                fontSize="description">
                                {musicItem?.artist}{" "}
                                {musicItem?.album ? `- ${musicItem.album}` : ""}
                            </ThemeText>
                        </View>
                    </View>
                    <Divider />
                    <View style={style.wrapper}>
                        <FlatList
                            data={options}
                            getItemLayout={(_, index) => ({
                                length: ITEM_HEIGHT,
                                offset: ITEM_HEIGHT * index,
                                index,
                            })}
                            ListFooterComponent={<View style={style.footer} />}
                            style={[
                                style.listWrapper,
                                {
                                    marginBottom: safeAreaInsets.bottom,
                                },
                            ]}
                            keyExtractor={_ => _.title}
                            renderItem={({ item }) =>
                                item.show !== false ? (
                                    <ListItem
                                        withHorizontalPadding
                                        heightType="small"
                                        onPress={item.onPress}>
                                        <ListItem.ListItemIcon
                                            width={rpx(48)}
                                            icon={item.icon}
                                            iconSize={iconSizeConst.light}
                                        />
                                        <ListItem.Content title={item.title} />
                                    </ListItem>
                                ) : null
                            }
                        />
                    </View>
                </>
            )}
        />
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    header: {
        width: rpx(750),
        height: rpx(200),
        flexDirection: "row",
        padding: rpx(24),
    },
    listWrapper: {
        paddingTop: rpx(12),
    },
    artwork: {
        width: rpx(140),
        height: rpx(140),
        borderRadius: rpx(16),
    },
    content: {
        marginLeft: rpx(36),
        width: rpx(526),
        height: rpx(140),
        justifyContent: "space-around",
    },
    title: {
        paddingRight: rpx(24),
    },
    footer: {
        width: rpx(750),
        height: rpx(30),
    },
});
