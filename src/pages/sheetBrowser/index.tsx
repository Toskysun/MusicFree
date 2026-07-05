import Empty from "@/components/base/empty";
import AppBar from "@/components/base/appBar";
import ListItem from "@/components/base/listItem";
import StatusBar from "@/components/base/statusBar";
import ThemeText from "@/components/base/themeText";
import { showDialog } from "@/components/dialogs/useDialog";
import { showPanel } from "@/components/panels/usePanel";
import MusicBar from "@/components/musicBar";
import { ImgAsset } from "@/constants/assetsConst";
import { localPluginPlatform } from "@/constants/commonConst";
import globalStyle from "@/constants/globalStyle";
import { useI18N } from "@/core/i18n";
import MusicSheet, { useSheetsBase, useStarredSheets } from "@/core/musicSheet";
import { ROUTE_PATH, useNavigate, useParams } from "@/core/router";
import useColors from "@/hooks/useColors";
import rpx from "@/utils/rpx";
import Toast from "@/utils/toast";
import { FlashList } from "@shopify/flash-list";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import HorizontalSafeAreaView from "@/components/base/horizontalSafeAreaView.tsx";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";

type SheetBrowserType = "local" | "starred";

export default function SheetBrowser() {
    const params = useParams<typeof ROUTE_PATH.SHEET_BROWSER>();
    const [sheetType, setSheetType] = useState<SheetBrowserType>(
        params?.sheetType ?? "local",
    );
    const { t } = useI18N();
    const colors = useColors();
    const navigate = useNavigate();
    const allSheets = useSheetsBase();
    const starredSheets = useStarredSheets();

    const localSheets = useMemo(
        () => allSheets.filter(sheet => sheet.id !== MusicSheet.defaultSheet.id),
        [allSheets],
    );
    const currentSheets = sheetType === "local" ? localSheets : starredSheets;
    const title =
        sheetType === "local" ? t("home.myPlaylists") : t("home.starredPlaylists");

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <AppBar
                actions={[
                    {
                        icon: "plus",
                        onPress: () => showPanel("CreateMusicSheet"),
                    },
                    {
                        icon: "inbox-arrow-down",
                        onPress: () => showPanel("ImportMusicSheet"),
                    },
                ]}>
                {title}
            </AppBar>
            <HorizontalSafeAreaView style={globalStyle.flex1}>
                <FlashList
                    ListHeaderComponent={
                        <View style={styles.tabsWrapper}>
                            <TabButton
                                title={t("home.myPlaylists")}
                                count={localSheets.length}
                                selected={sheetType === "local"}
                                onPress={() => setSheetType("local")}
                            />
                            <TabButton
                                title={t("home.starredPlaylists")}
                                count={starredSheets.length}
                                selected={sheetType === "starred"}
                                onPress={() => setSheetType("starred")}
                            />
                        </View>
                    }
                    ListEmptyComponent={<Empty />}
                    data={currentSheets}
                    extraData={{ colors, sheetType, t }}
                    estimatedItemSize={rpx(142)}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item: sheet }) => {
                        const isLocalSheet = !(
                            sheet.platform && sheet.platform !== localPluginPlatform
                        );

                        return (
                            <View
                                style={[
                                    styles.sheetFrame,
                                    {
                                        backgroundColor: colors.surface,
                                        borderColor: colors.border,
                                    },
                                ]}>
                                <ListItem
                                    heightType="big"
                                    withHorizontalPadding
                                    leftPadding={rpx(14)}
                                    rightPadding={rpx(12)}
                                    onPress={() => {
                                        if (isLocalSheet) {
                                            navigate(
                                                ROUTE_PATH.LOCAL_SHEET_DETAIL,
                                                {
                                                    id: sheet.id,
                                                },
                                            );
                                        } else {
                                            navigate(
                                                ROUTE_PATH.PLUGIN_SHEET_DETAIL,
                                                {
                                                    sheetInfo: sheet,
                                                },
                                            );
                                        }
                                    }}>
                                    <ListItem.ListItemImage
                                        uri={sheet.coverImg ?? sheet.artwork}
                                        fallbackImg={ImgAsset.albumDefault}
                                    />
                                    <ListItem.Content
                                        title={sheet.title}
                                        description={
                                            isLocalSheet
                                                ? t("home.songCount", {
                                                      count: sheet.worksNum,
                                                  })
                                                : `${sheet.artist ?? ""}`
                                        }
                                    />
                                    <ListItem.ListItemIcon
                                        position="right"
                                        icon="trash-outline"
                                        onPress={() => {
                                            showDialog("SimpleDialog", {
                                                title: t(
                                                    "dialog.deleteSheetTitle",
                                                ),
                                                content: t(
                                                    "dialog.deleteSheetContent",
                                                    {
                                                        name: sheet.title,
                                                    },
                                                ),
                                                onOk: async () => {
                                                    if (isLocalSheet) {
                                                        await MusicSheet.removeSheet(
                                                            sheet.id,
                                                        );
                                                        Toast.success(
                                                            t(
                                                                "toast.deleteSuccess",
                                                            ),
                                                        );
                                                    } else {
                                                        await MusicSheet.unstarMusicSheet(
                                                            sheet,
                                                        );
                                                        Toast.success(
                                                            t(
                                                                "toast.hasUnstarred",
                                                            ),
                                                        );
                                                    }
                                                },
                                            });
                                        }}
                                    />
                                </ListItem>
                            </View>
                        );
                    }}
                />
            </HorizontalSafeAreaView>
            <MusicBar />
        </VerticalSafeAreaView>
    );
}

function TabButton(props: {
    title: string;
    count: number;
    selected: boolean;
    onPress: () => void;
}) {
    const { title, count, selected, onPress } = props;
    const colors = useColors();

    return (
        <Pressable
            style={[
                styles.tabButton,
                {
                    backgroundColor: selected ? colors.surface : "transparent",
                    borderColor: selected ? colors.border : "transparent",
                },
            ]}
            onPress={onPress}>
            <ThemeText
                numberOfLines={1}
                fontWeight={selected ? "bold" : "regular"}
                color={selected ? colors.text : colors.textSecondary}>
                {title}
            </ThemeText>
            <ThemeText
                fontSize="description"
                color={selected ? colors.primary : colors.textSecondary}
                style={styles.tabCount}>
                {String(count).padStart(2, "0")}
            </ThemeText>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    tabsWrapper: {
        flexDirection: "row",
        paddingHorizontal: rpx(24),
        paddingTop: rpx(24),
        paddingBottom: rpx(10),
    },
    tabButton: {
        minWidth: rpx(190),
        height: rpx(64),
        borderRadius: rpx(18),
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: rpx(18),
        marginRight: rpx(14),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    tabCount: {
        marginLeft: rpx(8),
    },
    sheetFrame: {
        marginHorizontal: rpx(24),
        marginVertical: rpx(7),
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: rpx(22),
        overflow: "hidden",
    },
    listContent: {
        paddingBottom: rpx(24),
    },
});
