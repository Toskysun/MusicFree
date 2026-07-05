import { RequestStateCode } from "@/constants/commonConst";
import TrackPlayer from "@/core/trackPlayer";
import rpx from "@/utils/rpx";
import timeformat from "@/utils/timeformat";
import { FlashList } from "@shopify/flash-list";
import React, { useRef, useCallback, useState, useEffect } from "react";
import { FlatListProps, Pressable, StyleSheet, View, StyleProp, ViewStyle } from "react-native";
import ListEmpty from "../base/listEmpty";
import ListFooter from "../base/listFooter";
import MusicItem from "../mediaItem/musicItem";
import { isSameMediaItem } from "@/utils/mediaUtils";
import Icon from "../base/icon";
import { iconSizeConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import useCardStyle from "@/hooks/useCardStyle";

interface IMusicListProps {
    /** 顶部 */
    Header?: FlatListProps<IMusic.IMusicItem>["ListHeaderComponent"];
    /** 音乐列表 */
    musicList?: IMusic.IMusicItem[];
    /** 所在歌单 */
    musicSheet?: IMusic.IMusicSheetItem;
    /** 是否展示序号 */
    showIndex?: boolean;
    /** 点击 */
    onItemPress?: (
        musicItem: IMusic.IMusicItem,
        musicList?: IMusic.IMusicItem[],
    ) => void;
    // 状态
    state: RequestStateCode;
    /** 高亮的音乐 */
    highlightMusicItem?: IMusic.IMusicItem | null;
    onRetry?: () => void;
    onLoadMore?: () => void;
    /** 展示模式 */
    variant?: "default" | "compact" | "card";
    /** 是否显示封面 */
    showCover?: boolean;
    /** 项目间距（卡片模式使用） */
    itemSpacing?: number;
    /** 卡片自定义样式 */
    cardStyle?: StyleProp<ViewStyle>;
}
const ITEM_HEIGHT = rpx(120);
const COMPACT_ITEM_HEIGHT = rpx(88);
const CARD_ITEM_HEIGHT = rpx(132);

/** 音乐列表 */
export default function MusicList(props: IMusicListProps) {
    const {
        Header,
        musicList,
        musicSheet,
        showIndex,
        onItemPress,
        state,
        onRetry,
        onLoadMore,
        highlightMusicItem,
        variant = "default",
        itemSpacing = 0,
        cardStyle: customCardStyle,
    } = props;
    const colors = useColors();
    const cardShadowStyle = useCardStyle({
        borderWidth: 0,
        elevation: 3,
    });
    const flashListRef = useRef<FlashList<IMusic.IMusicItem>>(null);
    const [showBadge, setShowBadge] = useState(false);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // 根据模式计算行高
    const itemHeight = variant === "compact"
        ? COMPACT_ITEM_HEIGHT
        : variant === "card"
        ? CARD_ITEM_HEIGHT
        : ITEM_HEIGHT;

    // 查找高亮项的索引
    const highlightIndex = React.useMemo(() => {
        if (!highlightMusicItem || !musicList) return -1;
        return musicList.findIndex(item => isSameMediaItem(item, highlightMusicItem));
    }, [highlightMusicItem, musicList]);    
    
    // 处理滚动开始
    const handleScrollBegin = useCallback(() => {
        if (highlightIndex !== -1) {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
            setShowBadge(true);
        }
    }, [highlightIndex]);
    
    // 处理滚动结束
    const handleScrollEnd = useCallback(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
        }
        // 5秒后直接隐藏
        hideTimeoutRef.current = setTimeout(() => {
            setShowBadge(false);
        }, 5000);
    }, []);    
    
    // 滚动到高亮项
    const scrollToHighlight = useCallback(() => {
        if (highlightIndex !== -1 && flashListRef.current) {
            flashListRef.current.scrollToIndex({
                index: highlightIndex,
                animated: false,
                viewPosition: 0,
            });
            // 立即隐藏角标
            setShowBadge(false);
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        }
    }, [highlightIndex]);    
    
    // 清理定时器
    useEffect(() => {
        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, []);    
    
    return (
        <View style={styles.container}>
            <FlashList
                ref={flashListRef}
                ListHeaderComponent={Header}
                ListEmptyComponent={<ListEmpty state={state} onRetry={onRetry} />}
                ListFooterComponent={
                    musicList?.length ? <ListFooter state={state} onRetry={onRetry} /> : null
                }
                extraData={highlightMusicItem}
                data={musicList ?? []}
                estimatedItemSize={itemHeight}
                onScrollBeginDrag={handleScrollBegin}
                onScrollEndDrag={handleScrollEnd}
                onMomentumScrollEnd={handleScrollEnd}
                renderItem={({ index, item: musicItem }) => {
                    const itemContent = (
                        <MusicItem
                            musicItem={musicItem}
                            index={showIndex ? index + 1 : undefined}
                            titleTagSubText={
                                typeof musicItem.duration === "number"
                                    ? timeformat(musicItem.duration)
                                    : undefined
                            }
                            onItemPress={() => {
                                if (onItemPress) {
                                    onItemPress(musicItem, musicList);
                                } else {
                                    TrackPlayer.playWithReplacePlayList(
                                        musicItem,
                                        musicList ?? [musicItem],
                                    );
                                }
                            }}
                            musicSheet={musicSheet}
                            highlight={isSameMediaItem(musicItem, highlightMusicItem)}
                        />
                    );

                    if (variant === "card") {
                        return (
                            <View
                                style={[
                                    styles.cardWrapper,
                                    {
                                        backgroundColor: colors.surface,
                                        marginHorizontal: rpx(12),
                                        marginVertical: itemSpacing / 2,
                                    },
                                    cardShadowStyle,
                                    customCardStyle,
                                ]}>
                                {itemContent}
                            </View>
                        );
                    }

                    return itemContent;
                }}
                onEndReached={() => {
                    if (state === RequestStateCode.IDLE || state === RequestStateCode.PARTLY_DONE) {
                        onLoadMore?.();
                    }
                }}
                onEndReachedThreshold={0.1}
            />              
            {showBadge && (
                <View style={styles.badge} pointerEvents="box-none">
                    <Pressable
                        style={[styles.badgeButton, { backgroundColor: colors.notification }]}
                        onPress={scrollToHighlight}
                    >
                        <Icon
                            name="crosshair"
                            size={iconSizeConst.normal}
                            color={colors.text}
                        />
                    </Pressable>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    cardWrapper: {
        borderRadius: rpx(12),
        overflow: "hidden",
        shadowOffset: {
            width: 0,
            height: rpx(2),
        },
        shadowRadius: rpx(4),
    },
    badge: {
        position: "absolute",
        bottom: rpx(80),
        right: rpx(84),
        zIndex: 1000,
    },
    badgeButton: {
        width: rpx(64),
        height: rpx(64),
        borderRadius: rpx(32),
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
});
