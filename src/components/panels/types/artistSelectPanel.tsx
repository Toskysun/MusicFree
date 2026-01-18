import React from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import ListItem from "@/components/base/listItem";
import ThemeText from "@/components/base/themeText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PanelBase from "../base/panelBase";
import { FlatList } from "react-native-gesture-handler";
import { hidePanel } from "../usePanel";
import Divider from "@/components/base/divider";
import { iconSizeConst } from "@/constants/uiConst";
import { useI18N } from "@/core/i18n";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import pluginManager from "@/core/pluginManager";

/** 歌手信息 */
interface ISingerInfo {
    id: number | string;
    mid?: string;  // QQ音乐有mid，其他插件可能没有
    name: string;
    avatar?: string;  // 歌手头像
}

interface IArtistSelectPanelProps {
    /** 歌手信息列表（包含 id、name，mid可选） */
    singerList: ISingerInfo[];
    /** 音乐平台 */
    platform: string;
}

const ITEM_HEIGHT = rpx(96);

export default function ArtistSelectPanel(props: IArtistSelectPanelProps) {
    const { singerList, platform } = props ?? {};
    const { t } = useI18N();
    const safeAreaInsets = useSafeAreaInsets();
    const navigate = useNavigate();

    const handleArtistPress = (singer: ISingerInfo) => {
        // 构造 artistItem，包含完整的歌手信息
        const artistItem: IArtist.IArtistItem = {
            id: singer.id,
            singerMID: singer.mid,
            name: singer.name,
            platform: platform,
            avatar: singer.avatar || "",
            worksNum: 0,
        };

        // 获取插件 hash
        const plugin = pluginManager.getByName(platform);
        const pluginHash = plugin?.hash ?? "";

        hidePanel();

        // 延迟导航以确保面板关闭动画完成
        setTimeout(() => {
            navigate(ROUTE_PATH.ARTIST_DETAIL, {
                artistItem,
                pluginHash,
            });
        }, 100);
    };

    return (
        <PanelBase
            height={rpx(Math.min(singerList.length * ITEM_HEIGHT + 200, 800))}
            renderBody={() => (
                <>
                    <View style={styles.header}>
                        <ThemeText style={styles.title}>
                            {t("panel.artistSelect.title")}
                        </ThemeText>
                        <ThemeText
                            fontColor="textSecondary"
                            fontSize="description">
                            {t("panel.artistSelect.description")}
                        </ThemeText>
                    </View>
                    <Divider />
                    <View style={styles.wrapper}>
                        <FlatList
                            data={singerList}
                            getItemLayout={(_, index) => ({
                                length: ITEM_HEIGHT,
                                offset: ITEM_HEIGHT * index,
                                index,
                            })}
                            ListFooterComponent={<View style={styles.footer} />}
                            style={[
                                styles.listWrapper,
                                {
                                    marginBottom: safeAreaInsets.bottom,
                                },
                            ]}
                            keyExtractor={(item, index) => `${item.mid}-${index}`}
                            renderItem={({ item }) => (
                                <ListItem
                                    withHorizontalPadding
                                    heightType="small"
                                    onPress={() => handleArtistPress(item)}>
                                    <ListItem.ListItemIcon
                                        width={rpx(48)}
                                        icon="user"
                                        iconSize={iconSizeConst.light}
                                    />
                                    <ListItem.Content title={item.name} />
                                </ListItem>
                            )}
                        />
                    </View>
                </>
            )}
        />
    );
}

const styles = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    header: {
        width: rpx(750),
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(24),
    },
    title: {
        marginBottom: rpx(8),
    },
    listWrapper: {
        paddingTop: rpx(12),
    },
    footer: {
        width: rpx(750),
        height: rpx(30),
    },
});
