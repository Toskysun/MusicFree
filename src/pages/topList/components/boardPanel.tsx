import React, { memo, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import { IPluginTopListResult } from "../store/atoms";
import { RequestStateCode } from "@/constants/commonConst";
import Loading from "@/components/base/loading";
import TopListItem from "@/components/mediaItem/topListItem";
import ThemeText from "@/components/base/themeText";
import ListEmpty from "@/components/base/listEmpty";
import useOrientation from "@/hooks/useOrientation";

const COLUMN_GAP = rpx(16);

function estimateItemWeight(item: IMusic.IMusicSheetItemBase) {
    const titleWeight = Math.max(1, Math.ceil((item.title?.length ?? 0) / 10));
    const descriptionWeight = Math.max(
        0,
        Math.min(4, Math.ceil((item.description?.length ?? 0) / 22)),
    );
    return 100 + titleWeight * 18 + descriptionWeight * 24;
}

function buildWaterfallColumns(
    items: IMusic.IMusicSheetItemBase[],
    columnCount: number,
) {
    const columns = Array.from({ length: columnCount }, () => [] as IMusic.IMusicSheetItemBase[]);
    const heights = new Array(columnCount).fill(0);

    items.forEach(item => {
        let targetColumn = 0;
        for (let i = 1; i < columnCount; i += 1) {
            if (heights[i] < heights[targetColumn]) {
                targetColumn = i;
            }
        }

        columns[targetColumn].push(item);
        heights[targetColumn] += estimateItemWeight(item);
    });

    return columns;
}

interface IBoardPanelProps {
    hash: string;
    topListData: IPluginTopListResult;
}
function BoardPanel(props: IBoardPanelProps) {
    const { hash, topListData } = props ?? {};
    const orientation = useOrientation();
    const columnCount = orientation === "horizontal" ? 3 : 2;
    const sections = topListData?.data || [];
    const sectionColumns = useMemo(
        () =>
            sections.map(section => ({
                ...section,
                columns: buildWaterfallColumns(section.data ?? [], columnCount),
            })),
        [columnCount, sections],
    );

    return topListData?.state !== RequestStateCode.FINISHED ? (
        <Loading />
    ) : !sections.length ? (
        <ListEmpty state={topListData?.state} />
    ) : (
        <ScrollView
            contentContainerStyle={style.contentContainer}
            showsVerticalScrollIndicator={false}>
            {sectionColumns.map(section => (
                <View key={section.title} style={style.section}>
                    <View style={style.sectionHeader}>
                        <ThemeText fontWeight="bold" fontSize="title">
                            {section.title}
                        </ThemeText>
                    </View>
                    <View style={style.columns}>
                        {section.columns.map((columnItems, columnIndex) => (
                            <View
                                key={`${section.title}-${columnIndex}`}
                                style={[
                                    style.column,
                                    columnIndex < section.columns.length - 1
                                        ? style.columnGap
                                        : null,
                                ]}>
                                {columnItems.map(item => (
                                    <TopListItem
                                        key={`${item.platform}-${item.id}-${item.title}`}
                                        topListItem={item}
                                        pluginHash={hash}
                                        style={style.cardItem}
                                    />
                                ))}
                            </View>
                        ))}
                    </View>
                </View>
            ))}
        </ScrollView>
    );
}

export default memo(
    BoardPanel,
    (prev, curr) => prev.topListData === curr.topListData,
);

const style = StyleSheet.create({
    contentContainer: {
        paddingHorizontal: rpx(24),
        paddingTop: rpx(8),
        paddingBottom: rpx(36),
    },
    sectionHeader: {
        marginTop: rpx(28),
        marginBottom: rpx(20),
    },
    section: {
        width: "100%",
    },
    columns: {
        width: "100%",
        flexDirection: "row",
        alignItems: "flex-start",
    },
    column: {
        flex: 1,
    },
    columnGap: {
        marginRight: COLUMN_GAP,
    },
    cardItem: {
        marginBottom: COLUMN_GAP,
    },
});
