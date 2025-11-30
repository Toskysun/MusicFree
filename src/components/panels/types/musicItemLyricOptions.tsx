import FastImage from "@/components/base/fastImage";
import ListItem from "@/components/base/listItem";
import ThemeText from "@/components/base/themeText";
import { ImgAsset } from "@/constants/assetsConst";
import { getMediaUniqueKey, isSameMediaItem } from "@/utils/mediaUtils";
import rpx from "@/utils/rpx";
import Toast from "@/utils/toast";
import { devLog } from "@/utils/log";
import Clipboard from "@react-native-clipboard/clipboard";
import React from "react";
import { StyleSheet, View } from "react-native";

import Divider from "@/components/base/divider";
import { IIconName } from "@/components/base/icon.tsx";
import { hidePanel } from "@/components/panels/usePanel.ts";
import { iconSizeConst } from "@/constants/uiConst";
import Config from "@/core/appConfig";
import lyricManager from "@/core/lyricManager";
import mediaCache from "@/core/mediaCache";
import LyricUtil from "@/native/lyricUtil";
import { getDocumentAsync } from "expo-document-picker";
import { readAsStringAsync } from "expo-file-system";
import { FlatList } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PanelBase from "../base/panelBase";
import { useI18N } from "@/core/i18n";
import PersistStatus from "@/utils/persistStatus";
import { useCurrentMusic } from "@/core/trackPlayer";
import PluginManager from "@/core/pluginManager";
import { autoDecryptLyric } from "@/utils/qqMusicDecrypter";
import { writeFile } from "react-native-fs";
import { escapeCharacter } from "@/utils/fileUtils";
import pathConst from "@/constants/pathConst";
import { formatLyricsByTimestamp } from "@/utils/lrcParser";

interface IMusicItemLyricOptionsProps {
    /** 歌曲信息 */
    musicItem: IMusic.IMusicItem;
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
    return { albumId, albumMid };
};

export default function MusicItemLyricOptions(
    props: IMusicItemLyricOptionsProps,
) {
    const { musicItem: propsMusicItem } = props ?? {};

    // If this is the currently playing music, use the latest state from TrackPlayer
    const currentMusic = useCurrentMusic();
    const musicItem = (currentMusic && isSameMediaItem(currentMusic, propsMusicItem))
        ? currentMusic
        : propsMusicItem;

    const safeAreaInsets = useSafeAreaInsets();
    const { t } = useI18N();

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
                return `ID: ${getMediaUniqueKey(musicItem)}`;
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
            title: t("panel.musicItemLyricOptions.author", { artist: musicItem.artist }),
            onPress: () => {
                try {
                    Clipboard.setString(musicItem.artist.toString());
                    Toast.success(t("toast.copiedToClipboard"));
                } catch {
                    Toast.success(t("toast.copiedToClipboardFailed"));
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
                    return `${t("panel.musicItemLyricOptions.album", { album: albumText })} (${ids.join(", ")})`;
                }
                return t("panel.musicItemLyricOptions.album", { album: albumText });
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
                    Toast.success(t("toast.copiedToClipboardFailed"));
                }
            },
        },
        {
            icon: "lyric", title: t("panel.musicItemLyricOptions.toggleDesktopLyric", {
                status: Config.getConfig("lyric.showStatusBarLyric")
                    ? t("panel.musicItemLyricOptions.disableDesktopLyric")
                    : t("panel.musicItemLyricOptions.enableDesktopLyric"),
            }),
            async onPress() {
                const showStatusBarLyric = Config.getConfig("lyric.showStatusBarLyric");
                if (!showStatusBarLyric) {
                    const hasPermission =
                        await LyricUtil.checkSystemAlertPermission();

                    if (hasPermission) {
                        const statusBarLyricConfig = {
                            topPercent: Config.getConfig("lyric.topPercent"),
                            leftPercent: Config.getConfig("lyric.leftPercent"),
                            align: Config.getConfig("lyric.align"),
                            color: Config.getConfig("lyric.color"),
                            backgroundColor: Config.getConfig("lyric.backgroundColor"),
                            widthPercent: Config.getConfig("lyric.widthPercent"),
                            fontSize: Config.getConfig("lyric.fontSize"),
                        };
                        LyricUtil.showStatusBarLyric(
                            "MusicFree",
                            statusBarLyricConfig ?? {}
                        );
                        Config.setConfig("lyric.showStatusBarLyric", true);
                    } else {
                        LyricUtil.requestSystemAlertPermission().finally(() => {
                            Toast.warn(t("panel.musicItemLyricOptions.desktopLyricPermissionError"));
                        });
                    }
                } else {
                    LyricUtil.hideStatusBarLyric();
                    Config.setConfig("lyric.showStatusBarLyric", false);
                }
                hidePanel();
            },
        },
        {
            icon: "font-size",
            title: t("panel.musicItemLyricOptions.toggleWordByWord", {
                status: Config.getConfig("lyric.enableWordByWord")
                    ? t("panel.musicItemLyricOptions.disableWordByWord")
                    : t("panel.musicItemLyricOptions.enableWordByWord"),
            }),
            onPress: () => {
                const current = Config.getConfig("lyric.enableWordByWord") ?? false;
                Config.setConfig("lyric.enableWordByWord", !current);
                // Reload lyric to apply new setting
                lyricManager.reloadCurrentLyric();
                Toast.success(!current
                    ? t("panel.musicItemLyricOptions.wordByWordEnabled")
                    : t("panel.musicItemLyricOptions.wordByWordDisabled")
                );
                hidePanel();
            },
        },
        {
            icon: "arrow-down-tray",
            title: t("panel.musicItemLyricOptions.downloadLyricFile"),
            async onPress() {
                try {
                    const plugin = PluginManager.getByMedia(musicItem);
                    if (!plugin?.methods?.getLyric) {
                        Toast.warn(t("panel.musicItemLyricOptions.lyricNotSupported"));
                        return;
                    }

                    const lyricSource = await plugin.methods.getLyric(musicItem);
                    if (!lyricSource) {
                        Toast.warn(t("panel.musicItemLyricOptions.lyricNotFound"));
                        return;
                    }

                    // Get config from settings
                    const lyricFileFormat = Config.getConfig("basic.lyricFileFormat") ?? "lrc";
                    const lyricOrder = Config.getConfig("basic.lyricOrder") ?? ["original", "romanization", "translation"];
                    const enableWordByWord = Config.getConfig("lyric.enableWordByWord") ?? false;
                    const downloadPath = Config.getConfig("basic.downloadPath") ?? pathConst.downloadMusicPath;

                    devLog('info', '[歌词下载] 配置信息', {
                        format: lyricFileFormat,
                        order: lyricOrder,
                        enableWordByWord,
                        downloadPath
                    });

                    // Decrypt lyrics (auto-decrypt QRC format)
                    const rawLrc = lyricSource.rawLrc ? await autoDecryptLyric(lyricSource.rawLrc, enableWordByWord) : undefined;
                    const translation = lyricSource.translation ? await autoDecryptLyric(lyricSource.translation, enableWordByWord) : undefined;
                    const romanization = lyricSource.romanization ? await autoDecryptLyric(lyricSource.romanization, enableWordByWord) : undefined;

                    if (!rawLrc) {
                        Toast.warn(t("panel.musicItemLyricOptions.lyricNotFound"));
                        return;
                    }

                    // Format lyrics by timestamp (align original, translation, romanization)
                    const lyricContent = formatLyricsByTimestamp(
                        rawLrc,
                        translation,
                        romanization,
                        lyricOrder,
                        { enableWordByWord }
                    );

                    if (!lyricContent || lyricContent.trim().length === 0) {
                        Toast.warn(t("panel.musicItemLyricOptions.lyricNotFound"));
                        return;
                    }

                    // Generate filename and path
                    const safeTitle = escapeCharacter(musicItem.title || "unknown");
                    const safeArtist = escapeCharacter(musicItem.artist || "unknown");
                    const filename = `${safeTitle} - ${safeArtist}.${lyricFileFormat}`;
                    const basePath = downloadPath.endsWith('/') ? downloadPath : `${downloadPath}/`;
                    const filePath = `${basePath}${filename}`;

                    // Write file
                    await writeFile(filePath, lyricContent, 'utf8');

                    devLog('info', '[歌词下载] 保存成功', {
                        path: filePath,
                        size: lyricContent.length
                    });

                    Toast.success(t("panel.musicItemLyricOptions.lyricSaved"));
                    hidePanel();
                } catch (e: any) {
                    devLog("warn", "[歌词下载] 下载歌词文件失败", e);
                    Toast.warn(t("panel.musicItemLyricOptions.downloadLyricFailed", {
                        reason: e?.message,
                    }));
                }
            },
        },
        {
            icon: "arrow-up-tray",
            title: t("panel.musicItemLyricOptions.uploadLocalLyric"),
            async onPress() {
                try {
                    const result = await getDocumentAsync({
                        copyToCacheDirectory: true,
                    });
                    if (result.canceled) {
                        return;
                    }
                    const pickedDoc = result.assets[0].uri;
                    const lyricContent = await readAsStringAsync(pickedDoc, {
                        encoding: "utf8",
                    });                    await lyricManager.uploadLocalLyric(musicItem, lyricContent);
                    Toast.success(t("toast.settingSuccess"));
                    hidePanel();
                } catch (e: any) {
                    devLog("warn", "🎤[歌词选项] 上传本地歌词失败", e);
                    Toast.warn(t("panel.musicItemLyricOptions.settingFail", {
                        reason: e?.message,
                    }));
                }
            },
        },
        {
            icon: "arrow-up-tray",
            title: t("panel.musicItemLyricOptions.uploadLocalLyricTranslation"),
            async onPress() {
                try {
                    const result = await getDocumentAsync({
                        copyToCacheDirectory: true,
                    });
                    if (result.canceled) {
                        return;
                    }
                    const pickedDoc = result.assets[0].uri;
                    const lyricContent = await readAsStringAsync(pickedDoc, {
                        encoding: "utf8",
                    });                    await lyricManager.uploadLocalLyric(musicItem, lyricContent, "translation");
                    Toast.success(t("toast.settingSuccess"));
                    hidePanel();
                } catch (e: any) {
                    devLog("warn", "🎤[歌词选项] 上传翻译歌词失败", e);
                    Toast.warn(t("panel.musicItemLyricOptions.settingFail", {
                        reason: e?.message,
                    }));
                }
            },
        },
        {
            icon: "arrow-up-tray",
            title: "上传罗马音歌词",
            async onPress() {
                try {
                    const result = await getDocumentAsync({
                        copyToCacheDirectory: true,
                    });
                    if (result.canceled) {
                        return;
                    }
                    const pickedDoc = result.assets[0].uri;
                    const lyricContent = await readAsStringAsync(pickedDoc, {
                        encoding: "utf8",
                    });
                    await lyricManager.uploadLocalLyric(musicItem, lyricContent, "romanization");
                    Toast.success(t("toast.settingSuccess"));
                    hidePanel();
                } catch (e: any) {
                    devLog("warn", "🎤[歌词选项] 上传罗马音歌词失败", e);
                    Toast.warn(t("panel.musicItemLyricOptions.settingFail", {
                        reason: e?.message,
                    }));
                }
            },
        },
        {
            icon: "arrows-left-right",
            title: (() => {
                const order = PersistStatus.get("lyric.lyricOrder") ?? ["original", "romanization", "translation"];
                const orderLabels: Record<string, string> = {
                    original: "原",
                    translation: "译",
                    romanization: "罗",
                };
                const orderText = order.map(o => orderLabels[o] || o).join(" → ");
                return `歌词顺序: ${orderText}`;
            })(),
            onPress: () => {
                const allOrders: ("original" | "translation" | "romanization")[][] = [
                    ["original", "romanization", "translation"],
                    ["original", "translation", "romanization"],
                    ["romanization", "original", "translation"],
                    ["romanization", "translation", "original"],
                ];
                const orderLabels: Record<string, string> = {
                    original: "原文",
                    translation: "翻译",
                    romanization: "罗马音",
                };
                const currentOrder = PersistStatus.get("lyric.lyricOrder") ?? ["original", "romanization", "translation"];
                const currentIndex = allOrders.findIndex(
                    o => o[0] === currentOrder[0] && o[1] === currentOrder[1] && o[2] === currentOrder[2]
                );
                const nextIndex = (currentIndex + 1) % allOrders.length;
                const nextOrder = allOrders[nextIndex];
                PersistStatus.set("lyric.lyricOrder", nextOrder);
                const orderText = nextOrder.map(o => orderLabels[o]).join(" → ");
                Toast.success(`歌词顺序: ${orderText}`);
                hidePanel();
            },
        },
        {
            icon: "trash-outline",
            title: t("panel.musicItemLyricOptions.deleteLocalLyric"),
            async onPress() {
                try {
                    lyricManager.removeLocalLyric(musicItem);
                    hidePanel();
                } catch (e: any) {
                    devLog("warn", "🎤[歌词选项] 删除本地歌词失败", e);
                    Toast.warn(t("panel.musicItemLyricOptions.deleteFail", {
                        reason: e?.message,
                    }));
                }
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
                            source={musicItem?.artwork}
                            placeholderSource={ImgAsset.albumDefault}
                        />
                        <View style={style.content}>
                            <ThemeText numberOfLines={2} style={style.title}>
                                {musicItem?.title}
                            </ThemeText>
                            <ThemeText
                                fontColor="textSecondary"
                                fontSize="description"
                                numberOfLines={2}>
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
