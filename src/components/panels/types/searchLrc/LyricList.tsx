import Loading from "@/components/base/loading";
import LyricItem from "@/components/mediaItem/LyricItem";
import { RequestStateCode } from "@/constants/commonConst";
import lyricManager from "@/core/lyricManager";
import TrackPlayer from "@/core/trackPlayer";
import rpx from "@/utils/rpx";
import Toast from "@/utils/toast";
import React, { memo } from "react";
import { hidePanel } from "../../usePanel";
import searchResultStore, { ISearchLyricResult } from "./searchResultStore";
import ListEmpty from "@/components/base/listEmpty";
import ListFooter from "@/components/base/listFooter";
import { FlashList } from "@shopify/flash-list";
import { useI18N } from "@/core/i18n";
import useColors from "@/hooks/useColors";
import { StyleSheet, View } from "react-native";

interface ILyricListWrapperProps {
    route: {
        key: string;
        title: string;
    };
}
export default function LyricListWrapper(props: ILyricListWrapperProps) {
    const hash = props.route.key;
    const dataStore = searchResultStore.useValue();
    return <LyricList data={dataStore.data[hash]} />;
}

interface ILyricListProps {
    data: ISearchLyricResult;
}

const ITEM_HEIGHT = rpx(120);
function LyricListImpl(props: ILyricListProps) {
    const data = props.data;
    const searchState = data?.state ?? RequestStateCode.IDLE;
    const colors = useColors();
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
                            borderColor: colors.border,
                            shadowColor: colors.shadow,
                        },
                    ]}>
                    <LyricItem
                        lyricItem={item}
                        onPress={async () => {
                            try {
                                const currentMusic = TrackPlayer.currentMusic;
                                if (!currentMusic) {
                                    return;
                                }

                                lyricManager.associateLyric(currentMusic, item);
                                Toast.success(t("panel.searchLrc.toast.settingSuccess"));
                                hidePanel();
                                // 触发刷新歌词
                            } catch {
                                Toast.warn(t("panel.searchLrc.toast.failToSearch"));
                            }
                        }}
                    />
                </View>
            )}
            ListEmptyComponent={
                <View
                    style={[
                        styles.emptyCard,
                        {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                            shadowColor: colors.shadow,
                        },
                    ]}>
                    <ListEmpty state={searchState} />
                </View>
            }
            ListFooterComponent={data?.data?.length ? <ListFooter state={searchState} /> : null}
            data={data?.data}
            contentContainerStyle={styles.contentContainer}
        />
    );
}

const LyricList = memo(LyricListImpl, (prev, curr) => prev.data === curr.data);

const styles = StyleSheet.create({
    contentContainer: {
        paddingTop: rpx(2),
        paddingBottom: rpx(20),
    },
    cardWrapper: {
        marginHorizontal: rpx(12),
        marginVertical: rpx(6),
        borderRadius: rpx(22),
        borderWidth: StyleSheet.hairlineWidth,
        overflow: "hidden",
        shadowOffset: {
            width: 0,
            height: rpx(2),
        },
        shadowOpacity: 0.08,
        shadowRadius: rpx(4),
        elevation: 3,
    },
    emptyCard: {
        marginHorizontal: rpx(12),
        marginTop: rpx(8),
        borderRadius: rpx(22),
        borderWidth: StyleSheet.hairlineWidth,
        minHeight: rpx(260),
        justifyContent: "center",
        shadowOffset: {
            width: 0,
            height: rpx(2),
        },
        shadowOpacity: 0.08,
        shadowRadius: rpx(4),
        elevation: 3,
    },
});
