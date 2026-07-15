import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import ListItem from "@/components/base/listItem";
import ThemeText from "@/components/base/themeText";
import Divider from "@/components/base/divider";
import FastImage from "@/components/base/fastImage";
import { IIconName } from "@/components/base/icon.tsx";
import { ImgAsset } from "@/constants/assetsConst";
import { iconSizeConst } from "@/constants/uiConst";
import { useI18N } from "@/core/i18n";
import { useCurrentMusic } from "@/core/trackPlayer";
import { isSameMediaItem } from "@/utils/mediaUtils";
import {
    associateLocalArtwork,
    hasAssociatedArtwork,
    resolveArtwork,
    unassociateArtwork,
} from "@/utils/artwork";
import { useMediaExtraProperty } from "@/utils/mediaExtra";
import Toast from "@/utils/toast";
import { errorLog } from "@/utils/log";
import { saveToGallery } from "@/utils/fileUtils";
import { FlatList } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PanelBase from "../base/panelBase";
import { hidePanel, showPanel } from "../usePanel";

interface ICoverOptionsProps {
    musicItem: IMusic.IMusicItem;
}

const ITEM_HEIGHT = rpx(96);

interface IOption {
    icon: IIconName;
    title: string;
    onPress?: () => void;
    show?: boolean;
}

export default function CoverOptions(props: ICoverOptionsProps) {
    const { musicItem: propsMusicItem } = props ?? {};
    const { t } = useI18N();
    const safeAreaInsets = useSafeAreaInsets();

    const currentMusic = useCurrentMusic();
    const musicItem =
        currentMusic && isSameMediaItem(currentMusic, propsMusicItem)
            ? currentMusic
            : propsMusicItem;

    // Subscribe so header preview updates after association
    useMediaExtraProperty(musicItem, "associatedArtwork");
    const artwork = resolveArtwork(musicItem);
    const associated = hasAssociatedArtwork(musicItem);

    const options: IOption[] = useMemo(
        () => [
            {
                icon: "album-outline",
                title: t("panel.coverOptions.viewImage"),
                show: !!artwork,
                onPress: () => {
                    if (!artwork) {
                        return;
                    }
                    showPanel("ImageViewer", {
                        url: artwork,
                    });
                },
            },
            {
                icon: "arrow-down-tray",
                title: t("panel.coverOptions.saveImage"),
                show: !!artwork,
                onPress: () => {
                    if (!artwork) {
                        return;
                    }
                    saveToGallery(artwork)
                        .then(resultPath => {
                            Toast.success(
                                t("panel.imageViewer.saveImageSuccess", {
                                    path: resultPath,
                                }),
                            );
                            hidePanel();
                        })
                        .catch(e => {
                            errorLog("Save failed", e?.message ?? e);
                            Toast.warn(
                                t("panel.imageViewer.saveImageFail", {
                                    reason: e?.message ?? e,
                                }),
                            );
                        });
                },
            },
            {
                icon: "magnifying-glass",
                title: t("panel.coverOptions.searchCover"),
                onPress: () => {
                    showPanel("SearchCover", {
                        musicItem,
                    });
                },
            },
            {
                icon: "folder-plus",
                title: t("panel.coverOptions.pickFromGallery"),
                onPress: async () => {
                    try {
                        const ok = await associateLocalArtwork(musicItem);
                        if (ok) {
                            Toast.success(
                                t("panel.coverOptions.toast.associateSuccess"),
                            );
                            hidePanel();
                        }
                    } catch (e: any) {
                        errorLog("本地关联封面失败", e?.message ?? e);
                        Toast.warn(
                            t("panel.coverOptions.toast.associateFail"),
                        );
                    }
                },
            },
            {
                icon: "arrow-uturn-left",
                title: t("panel.coverOptions.restoreDefault"),
                show: associated,
                onPress: async () => {
                    try {
                        await unassociateArtwork(musicItem);
                        Toast.success(
                            t("panel.coverOptions.toast.restoreSuccess"),
                        );
                        hidePanel();
                    } catch (e: any) {
                        errorLog("恢复封面失败", e?.message ?? e);
                        Toast.warn(t("panel.coverOptions.toast.restoreFail"));
                    }
                },
            },
        ],
        [artwork, associated, musicItem, t],
    );

    const visibleOptions = options.filter(o => o.show !== false);

    return (
        <PanelBase
            height={rpx(750)}
            renderBody={() => (
                <View style={styles.body}>
                    <View style={styles.header}>
                        <View collapsable={false}>
                            <FastImage
                                key={artwork ?? "default"}
                                style={styles.artwork}
                                source={artwork}
                                placeholderSource={ImgAsset.albumDefault}
                            />
                        </View>
                        <View style={styles.content}>
                            <ThemeText numberOfLines={2} style={styles.title}>
                                {musicItem?.title}
                            </ThemeText>
                            <ThemeText
                                fontColor="textSecondary"
                                numberOfLines={2}
                                fontSize="description">
                                {musicItem?.artist}
                                {musicItem?.album
                                    ? ` - ${musicItem.album}`
                                    : ""}
                            </ThemeText>
                            {associated ? (
                                <ThemeText
                                    fontColor="primary"
                                    fontSize="description"
                                    style={styles.associatedHint}>
                                    {t("panel.coverOptions.associatedHint")}
                                </ThemeText>
                            ) : null}
                        </View>
                    </View>
                    <Divider />
                    <View style={styles.wrapper}>
                        <FlatList
                            data={visibleOptions}
                            getItemLayout={(_, index) => ({
                                length: ITEM_HEIGHT,
                                offset: ITEM_HEIGHT * index,
                                index,
                            })}
                            ListFooterComponent={
                                <View
                                    style={{
                                        height: safeAreaInsets.bottom,
                                    }}
                                />
                            }
                            keyExtractor={item => item.title}
                            renderItem={({ item }) => (
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
                            )}
                        />
                    </View>
                </View>
            )}
        />
    );
}

const styles = StyleSheet.create({
    body: {
        width: rpx(750),
        flex: 1,
    },
    header: {
        width: rpx(750),
        height: rpx(200),
        flexDirection: "row",
        padding: rpx(24),
    },
    artwork: {
        width: rpx(140),
        height: rpx(140),
        borderRadius: rpx(12),
    },
    content: {
        marginLeft: rpx(24),
        flex: 1,
        height: rpx(140),
        justifyContent: "space-around",
    },
    title: {
        paddingRight: rpx(24),
    },
    associatedHint: {
        marginTop: rpx(4),
    },
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
});
