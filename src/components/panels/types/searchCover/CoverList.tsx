import Loading from "@/components/base/loading";
import ListItem from "@/components/base/listItem";
import TitleAndTag from "@/components/mediaItem/titleAndTag";
import { ImgAsset } from "@/constants/assetsConst";
import { RequestStateCode } from "@/constants/commonConst";
import PluginManager from "@/core/pluginManager";
import TrackPlayer from "@/core/trackPlayer";
import rpx from "@/utils/rpx";
import Toast from "@/utils/toast";
import React, { memo } from "react";
import { hidePanel } from "../../usePanel";
import searchResultStore, { ISearchCoverResult } from "./searchResultStore";
import ListEmpty from "@/components/base/listEmpty";
import ListFooter from "@/components/base/listFooter";
import { FlashList } from "@shopify/flash-list";
import { useI18N } from "@/core/i18n";
import useColors from "@/hooks/useColors";
import useCardStyle from "@/hooks/useCardStyle";
import { StyleSheet, View } from "react-native";
import { associateArtwork } from "@/utils/artwork";
import { errorLog } from "@/utils/log";

interface ICoverListWrapperProps {
    route: {
        key: string;
        title: string;
    };
    targetMusicItem?: IMusic.IMusicItem | null;
}

export default function CoverListWrapper(props: ICoverListWrapperProps) {
    const hash = props.route.key;
    const dataStore = searchResultStore.useValue();
    return (
        <CoverList
            data={dataStore.data[hash]}
            targetMusicItem={props.targetMusicItem}
        />
    );
}

interface ICoverListProps {
    data: ISearchCoverResult;
    targetMusicItem?: IMusic.IMusicItem | null;
}

const ITEM_HEIGHT = rpx(120);

async function resolveItemArtwork(
    item: IMusic.IMusicItem,
): Promise<string | undefined> {
    if (typeof item.artwork === "string" && item.artwork.trim()) {
        return item.artwork.trim();
    }
    try {
        const plugin = PluginManager.getByMedia(item);
        const info = await plugin?.methods?.getMusicInfo?.(item);
        if (typeof info?.artwork === "string" && info.artwork.trim()) {
            return info.artwork.trim();
        }
    } catch (e) {
        errorLog("获取歌曲封面失败", e);
    }
    return undefined;
}

function CoverListImpl(props: ICoverListProps) {
    const data = props.data;
    const targetMusicItem = props.targetMusicItem;
    const searchState = data?.state ?? RequestStateCode.IDLE;
    const colors = useColors();
    const cardStyle = useCardStyle({
        borderWidth: StyleSheet.hairlineWidth,
        elevation: 3,
    });
    const { t } = useI18N();

    return searchState === RequestStateCode.PENDING_FIRST_PAGE ? (
        <Loading />
    ) : (
        <FlashList
            estimatedItemSize={ITEM_HEIGHT}
            renderItem={({ item }) => (
                <View
                    style={[
                        styles.cardWrapper,
                        {
                            backgroundColor: colors.surface,
                        },
                        cardStyle,
                    ]}>
                    <ListItem
                        heightType="big"
                        withHorizontalPadding
                        onPress={async () => {
                            try {
                                const bindTo =
                                    targetMusicItem ||
                                    TrackPlayer.currentMusic;
                                if (!bindTo) {
                                    Toast.warn(
                                        t("panel.searchCover.toast.noCurrentMusic"),
                                    );
                                    return;
                                }

                                const artworkUrl = await resolveItemArtwork(
                                    item as IMusic.IMusicItem,
                                );
                                if (!artworkUrl) {
                                    Toast.warn(
                                        t("panel.searchCover.toast.noArtwork"),
                                    );
                                    return;
                                }

                                await associateArtwork(bindTo, artworkUrl);
                                Toast.success(
                                    t("panel.searchCover.toast.settingSuccess"),
                                );
                                hidePanel();
                            } catch {
                                Toast.warn(
                                    t("panel.searchCover.toast.failToSearch"),
                                );
                            }
                        }}>
                        <ListItem.ListItemImage
                            uri={(item as IMusic.IMusicItem).artwork}
                            fallbackImg={ImgAsset.albumDefault}
                        />
                        <ListItem.Content
                            description={
                                (item as IMusic.IMusicItem).artist ?? ""
                            }
                            title={
                                <TitleAndTag
                                    title={(item as IMusic.IMusicItem).title}
                                    tag={(item as IMusic.IMusicItem).platform}
                                />
                            }
                        />
                    </ListItem>
                </View>
            )}
            ListEmptyComponent={
                <View
                    style={[
                        styles.emptyCard,
                        {
                            backgroundColor: colors.surface,
                        },
                        cardStyle,
                    ]}>
                    <ListEmpty state={searchState as any} />
                </View>
            }
            ListFooterComponent={
                data?.data?.length ? (
                    <ListFooter state={searchState as any} />
                ) : null
            }
            data={data?.data}
            contentContainerStyle={styles.contentContainer}
        />
    );
}

const CoverList = memo(
    CoverListImpl,
    (prev, curr) =>
        prev.data === curr.data &&
        prev.targetMusicItem === curr.targetMusicItem,
);

const styles = StyleSheet.create({
    contentContainer: {
        paddingTop: rpx(2),
        paddingBottom: rpx(20),
    },
    cardWrapper: {
        marginHorizontal: rpx(12),
        marginVertical: rpx(6),
        borderRadius: rpx(22),
        overflow: "hidden",
        shadowOffset: {
            width: 0,
            height: rpx(2),
        },
        shadowRadius: rpx(4),
    },
    emptyCard: {
        marginHorizontal: rpx(12),
        marginTop: rpx(8),
        borderRadius: rpx(22),
        minHeight: rpx(260),
        justifyContent: "center",
        shadowOffset: {
            width: 0,
            height: rpx(2),
        },
        shadowRadius: rpx(4),
    },
});
