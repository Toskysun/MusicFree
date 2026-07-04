import React, { memo, useMemo } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import rpx from "@/utils/rpx";
import { IPluginTopListResult } from "../store/atoms";
import { RequestStateCode } from "@/constants/commonConst";
import Loading from "@/components/base/loading";
import TopListItem from "@/components/mediaItem/topListItem";
import ThemeText from "@/components/base/themeText";
import ListEmpty from "@/components/base/listEmpty";
import useOrientation from "@/hooks/useOrientation";
import useColors from "@/hooks/useColors";
import Color from "color";

const COLUMN_GAP = rpx(14);
const MIN_CARD_WIDTH = 140;
const HORIZONTAL_PADDING = rpx(24);

function getColumnCount(width: number, orientation: "vertical" | "horizontal") {
    const minColumns = orientation === "horizontal" ? 3 : 2;
    const maxColumns = orientation === "horizontal" ? 5 : 4;
    const estimatedColumns = Math.floor(
        (width + COLUMN_GAP) / (MIN_CARD_WIDTH + COLUMN_GAP),
    );

    return Math.max(minColumns, Math.min(maxColumns, estimatedColumns || minColumns));
}

interface IBoardPanelProps {
    hash: string;
    topListData: IPluginTopListResult;
}
function BoardPanel(props: IBoardPanelProps) {
    const { hash, topListData } = props ?? {};
    const orientation = useOrientation();
    const colors = useColors();
    const { width: windowWidth } = useWindowDimensions();
    const sections = topListData?.data || [];
    const availableWidth = useMemo(
        () => Math.max(windowWidth - HORIZONTAL_PADDING * 2, 0),
        [windowWidth],
    );
    const columnCount = useMemo(
        () => getColumnCount(availableWidth, orientation),
        [availableWidth, orientation],
    );

    const unitWidth = useMemo(() => {
        return (
            (availableWidth - COLUMN_GAP * Math.max(columnCount - 1, 0)) /
            columnCount
        );
    }, [availableWidth, columnCount]);

    const sectionCards = useMemo(
        () =>
            sections.map(section => ({
                ...section,
                cards: (section.data ?? []).map((item, index) => {
                    return {
                        item,
                        rank: index + 1,
                    };
                }),
            })),
        [sections],
    );

    return topListData?.state !== RequestStateCode.FINISHED ? (
        <Loading />
    ) : !sectionCards.length ? (
        <ListEmpty state={topListData?.state} />
    ) : (
        <ScrollView
            contentContainerStyle={style.contentContainer}
            showsVerticalScrollIndicator={false}>
            <View style={style.contentInner}>
                {sectionCards.map(section => (
                    <View key={section.title} style={style.section}>
                        <View style={style.sectionHeader}>
                            <ThemeText fontWeight="bold" fontSize="title">
                                {section.title}
                            </ThemeText>
                            <View
                                style={[
                                    style.sectionBadge,
                                    {
                                        backgroundColor: Color(colors.primary)
                                            .alpha(0.12)
                                            .toString(),
                                    },
                                ]}>
                                <ThemeText
                                    fontSize="tag"
                                    fontWeight="bold"
                                    color={colors.primary}>
                                    {section.cards.length}
                                </ThemeText>
                            </View>
                        </View>
                        <View
                            style={[
                                style.sectionDivider,
                                {
                                    backgroundColor: Color(colors.text)
                                        .alpha(0.08)
                                        .toString(),
                                },
                            ]}
                        />
                        <View style={style.grid}>
                            {section.cards.map(({ item, rank }, index) => (
                                <View
                                    key={`${item.platform}-${item.id}-${item.title}`}
                                    style={[
                                        style.cardItemWrapper,
                                        {
                                            width: unitWidth,
                                            marginRight:
                                                (index + 1) % columnCount === 0
                                                    ? 0
                                                    : COLUMN_GAP,
                                        },
                                    ]}>
                                    <TopListItem
                                        topListItem={item}
                                        pluginHash={hash}
                                        rank={rank}
                                        style={style.cardItem}
                                    />
                                </View>
                            ))}
                        </View>
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}

export default memo(
    BoardPanel,
    (prev, curr) => prev.topListData === curr.topListData,
);

const style = StyleSheet.create({
    contentContainer: {
        paddingHorizontal: HORIZONTAL_PADDING,
        paddingTop: rpx(8),
        paddingBottom: rpx(36),
    },
    contentInner: {
        width: "100%",
    },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: rpx(28),
        marginBottom: rpx(12),
    },
    section: {
        width: "100%",
    },
    sectionBadge: {
        minWidth: rpx(56),
        height: rpx(40),
        borderRadius: rpx(20),
        paddingHorizontal: rpx(14),
        alignItems: "center",
        justifyContent: "center",
    },
    sectionDivider: {
        width: "100%",
        height: StyleSheet.hairlineWidth,
        marginBottom: rpx(16),
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "flex-start",
        justifyContent: "flex-start",
    },
    cardItemWrapper: {
        marginBottom: COLUMN_GAP,
        flexShrink: 0,
    },
    cardItem: {
        width: "100%",
    },
});
