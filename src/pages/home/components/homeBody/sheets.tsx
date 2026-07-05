import Empty from "@/components/base/empty";
import IconButton from "@/components/base/iconButton";
import ListItem from "@/components/base/listItem";
import ThemeText from "@/components/base/themeText";
import { showDialog } from "@/components/dialogs/useDialog";
import { showPanel } from "@/components/panels/usePanel";
import { ImgAsset } from "@/constants/assetsConst";
import { localPluginPlatform } from "@/constants/commonConst";
import { useI18N } from "@/core/i18n";
import MusicSheet, { useSheetsBase, useStarredSheets } from "@/core/musicSheet";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import useColors from "@/hooks/useColors";
import rpx, { fontRpx } from "@/utils/rpx";
import Toast from "@/utils/toast";
import { FlashList } from "@shopify/flash-list";
import React, { ReactNode, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

interface ISheetsProps {
    header?: ReactNode;
}

export default function Sheets(props: ISheetsProps) {
    const { header } = props;
    const [index, setIndex] = useState(0);
    const colors = useColors();
    const navigate = useNavigate();

    const allSheets = useSheetsBase();
    const staredSheets = useStarredSheets();
    const { t } = useI18N();

    const selectedTabTextStyle = useMemo(() => {
        return [styles.selectTabText, { color: colors.text }];
    }, [colors]);

    return (
        <FlashList
            ListHeaderComponent={
                <>
                    {header}
                    <View style={styles.subTitleContainer}>
                        <Pressable
                            style={styles.tabContainer}
                            accessible
                            accessibilityLabel={t(
                                "home.myPlaylistsCount.a11y",
                                {
                                    count: allSheets.length,
                                },
                            )}
                            onPress={() => {
                                setIndex(0);
                            }}>
                            <ThemeText
                                accessible={false}
                                fontSize={index === 0 ? "section" : "title"}
                                style={[
                                    styles.tabText,
                                    index === 0 ? selectedTabTextStyle : null,
                                ]}>
                                {t("home.myPlaylists")}
                            </ThemeText>
                            <ThemeText
                                accessible={false}
                                fontColor="textSecondary"
                                fontSize="subTitle"
                                style={styles.countText}>
                                {String(allSheets.length).padStart(2, "0")}
                            </ThemeText>
                        </Pressable>
                        <Pressable
                            style={styles.tabContainer}
                            accessible
                            accessibilityLabel={t(
                                "home.starredPlaylistsCount.a11y",
                                {
                                    count: allSheets.length,
                                },
                            )}
                            onPress={() => {
                                setIndex(1);
                            }}>
                            <ThemeText
                                fontSize={index === 1 ? "section" : "title"}
                                accessible={false}
                                style={[
                                    styles.tabText,
                                    index === 1 ? selectedTabTextStyle : null,
                                ]}>
                                {t("home.starredPlaylists")}
                            </ThemeText>
                            <ThemeText
                                fontColor="textSecondary"
                                fontSize="subTitle"
                                accessible={false}
                                style={styles.countText}>
                                {String(staredSheets.length).padStart(2, "0")}
                            </ThemeText>
                        </Pressable>
                        <View style={styles.more}>
                            <IconButton
                                name="id"
                                style={styles.newSheetButton}
                                sizeType="normal"
                                accessibilityLabel={t("home.playById.a11y")}
                                onPress={() => {
                                    showPanel("PlayById");
                                }}
                            />
                            <IconButton
                                name="plus"
                                style={styles.newSheetButton}
                                sizeType="normal"
                                accessibilityLabel={t("home.newPlaylist.a11y")}
                                onPress={() => {
                                    showPanel("CreateMusicSheet");
                                }}
                            />
                            <IconButton
                                name="inbox-arrow-down"
                                sizeType="normal"
                                accessibilityLabel={t(
                                    "home.importPlaylist.a11y",
                                )}
                                onPress={() => {
                                    showPanel("ImportMusicSheet");
                                }}
                            />
                        </View>
                    </View>
                    <View
                        style={[
                            styles.sectionRule,
                            { backgroundColor: colors.border },
                        ]}
                    />
                </>
            }
            ListEmptyComponent={<Empty />}
            extraData={{ t, index, colors }}
            data={(index === 0 ? allSheets : staredSheets) ?? []}
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
                            key={`${sheet.id}`}
                            heightType="big"
                            withHorizontalPadding
                            leftPadding={rpx(14)}
                            rightPadding={rpx(12)}
                            onPress={() => {
                                if (isLocalSheet) {
                                    navigate(ROUTE_PATH.LOCAL_SHEET_DETAIL, {
                                        id: sheet.id,
                                    });
                                } else {
                                    navigate(ROUTE_PATH.PLUGIN_SHEET_DETAIL, {
                                        sheetInfo: sheet,
                                    });
                                }
                            }}>
                            <ListItem.ListItemImage
                                uri={sheet.coverImg ?? sheet.artwork}
                                fallbackImg={ImgAsset.albumDefault}
                                maskIcon={
                                    sheet.id === MusicSheet.defaultSheet.id
                                        ? "heart"
                                        : null
                                }
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
                            {sheet.id !== MusicSheet.defaultSheet.id ? (
                                <ListItem.ListItemIcon
                                    position="right"
                                    icon="trash-outline"
                                    onPress={() => {
                                        showDialog("SimpleDialog", {
                                            title: t("dialog.deleteSheetTitle"),
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
                                                        t("toast.hasUnstarred"),
                                                    );
                                                }
                                            },
                                        });
                                    }}
                                />
                            ) : null}
                        </ListItem>
                    </View>
                );
            }}
        />
    );
}

const styles = StyleSheet.create({
    subTitleContainer: {
        paddingHorizontal: rpx(24),
        flexDirection: "row",
        alignItems: "center",
        marginTop: rpx(22),
        marginBottom: rpx(8),
    },
    tabContainer: {
        flexDirection: "row",
        alignItems: "baseline",
        marginRight: rpx(26),
    },

    tabText: {
        lineHeight: fontRpx(58),
    },
    selectTabText: {
        fontWeight: "bold",
    },
    countText: {
        marginLeft: rpx(8),
        letterSpacing: rpx(1),
    },
    more: {
        height: rpx(58),
        flexGrow: 1,
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    newSheetButton: {
        marginRight: rpx(18),
    },
    sectionRule: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: rpx(24),
        marginBottom: rpx(8),
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
