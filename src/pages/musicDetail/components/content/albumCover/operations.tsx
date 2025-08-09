import React, { useMemo } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";

import LocalMusicSheet from "@/core/localMusicSheet";
import { ROUTE_PATH } from "@/core/router";
import { ImgAsset } from "@/constants/assetsConst";
import Toast from "@/utils/toast";
import toast from "@/utils/toast";
import useOrientation from "@/hooks/useOrientation";
import { showPanel } from "@/components/panels/usePanel";
import { showDialog, hideDialog } from "@/components/dialogs/useDialog";
import TrackPlayer, { useCurrentMusic } from "@/core/trackPlayer";
import { iconSizeConst } from "@/constants/uiConst";
import PersistStatus from "@/utils/persistStatus";
import HeartIcon from "../heartIcon";
import Icon from "@/components/base/icon.tsx";
import PluginManager from "@/core/pluginManager";
import downloader from "@/core/downloader";
import i18n from "@/core/i18n";

export default function Operations() {
    const musicItem = useCurrentMusic();
    // const currentQuality = useMusicQuality();
    const isDownloaded = LocalMusicSheet.useIsLocal(musicItem);

    const rate = PersistStatus.useValue("music.rate", 100);
    const orientation = useOrientation();

    const supportComment = useMemo(() => {
        return !musicItem
            ? false
            : !!PluginManager.getByMedia(musicItem)?.instance?.getMusicComments;
    }, [musicItem]);

    return (
        <View
            style={[
                styles.wrapper,
                orientation === "horizontal" ? styles.horizontalWrapper : null,
            ]}>
            <HeartIcon />
            <Icon
                name="quality-button"
                size={iconSizeConst.normal}
                color="white"
                onPress={() => {
                    if (!musicItem) {
                        return;
                    }
                    showPanel("MusicQuality", {
                        musicItem,
                        async onQualityPress(quality) {
                            const changeResult =
                                await TrackPlayer.changeQuality(quality);
                            if (!changeResult) {
                                Toast.warn(i18n.t("toast.currentQualityNotAvailableForCurrentMusic"));
                            }
                        },
                    });
                }}
            />
            <Icon
                name={isDownloaded ? "check-circle-outline" : "arrow-down-tray"}
                size={iconSizeConst.normal}
                color="white"
                onPress={async () => {
                    if (musicItem && !isDownloaded) {
                        // 显示加载状态
                        showDialog("LoadingDialog", {
                            title: i18n.t("downloading.downloadStatus.preparing"),
                        });

                        try {
                            // 获取插件实例
                            const plugin = PluginManager.getPlugin(musicItem.platform);
                            let enhancedMusicItem = musicItem;
                            
                            // 如果插件支持getMusicInfo且当前音乐没有qualities信息，则获取完整信息
                            if (plugin?.methods?.getMusicInfo && !musicItem.qualities) {
                                const additionalInfo = await plugin.methods.getMusicInfo(musicItem);
                                if (additionalInfo) {
                                    enhancedMusicItem = {
                                        ...musicItem,
                                        ...additionalInfo,
                                        // 保持原有的基本信息不被覆盖
                                        id: musicItem.id,
                                        platform: musicItem.platform,
                                    };
                                }
                            }

                            // 隐藏加载对话框
                            hideDialog("LoadingDialog");

                            // 显示音质选择面板
                            showPanel("MusicQuality", {
                                type: "download",
                                musicItem: enhancedMusicItem,
                                async onQualityPress(quality) {
                                    downloader.download(enhancedMusicItem, quality);
                                },
                            });
                        } catch (error) {
                            // 隐藏加载对话框
                            hideDialog("LoadingDialog");
                            
                            // 出错时使用原始音乐信息
                            showPanel("MusicQuality", {
                                type: "download",
                                musicItem,
                                async onQualityPress(quality) {
                                    downloader.download(musicItem, quality);
                                },
                            });
                        }
                    }
                }}
            />
            <Pressable
                onPress={() => {
                    if (!musicItem) {
                        return;
                    }
                    showPanel("PlayRate", {
                        async onRatePress(newRate) {
                            if (rate !== newRate) {
                                try {
                                    await TrackPlayer.setRate(newRate / 100);
                                    PersistStatus.set("music.rate", newRate);
                                } catch { }
                            }
                        },
                    });
                }}>
                <Image source={ImgAsset.rate[rate!]} style={styles.quality} />
            </Pressable>
            <Icon
                name="chat-bubble-oval-left-ellipsis"
                size={iconSizeConst.normal}
                color="white"
                opacity={supportComment ? 1 : 0.2}
                onPress={() => {
                    if (!supportComment) {
                        toast.warn(i18n.t("toast.commmentNotAvaliableForCurrentMusic"));
                        return;
                    }
                    if (musicItem) {
                        showPanel("MusicComment", {
                            musicItem,
                        });
                    }
                }}
            />
            <Icon
                name="ellipsis-vertical"
                size={iconSizeConst.normal}
                color="white"
                onPress={() => {
                    if (musicItem) {
                        showPanel("MusicItemOptions", {
                            musicItem: musicItem,
                            from: ROUTE_PATH.MUSIC_DETAIL,
                        });
                    }
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        width: "100%",
        height: rpx(80),
        marginBottom: rpx(24),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-around",
    },
    horizontalWrapper: {
        marginBottom: 0,
    },
    quality: {
        width: rpx(52),
        height: rpx(52),
    },
});
