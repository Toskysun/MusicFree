import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import rpx, { vmax, vw } from "@/utils/rpx";

import { fontSizeConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import PanelBase from "../../base/panelBase";
import { TextInput } from "react-native-gesture-handler";
import useSearchCover from "./useSearchCover";
import PluginManager from "@/core/pluginManager";
import { TabView } from "react-native-tab-view";
import PillTabBar from "@/components/base/pillTabBar";
import CoverList from "./CoverList";
import globalStyle from "@/constants/globalStyle";
import NoPlugin from "@/components/base/noPlugin";
import { useI18N } from "@/core/i18n";
import ThemeText from "@/components/base/themeText";
import Color from "color";
import useCardStyle from "@/hooks/useCardStyle";
import useHasCustomBackground from "@/hooks/useHasCustomBackground";

interface ISearchCoverProps {
    musicItem?: IMusic.IMusicItem | null;
}

export default function SearchCover(props: ISearchCoverProps) {
    const { musicItem } = props;
    const [input, setInput] = useState(() => {
        if (musicItem?.alias) {
            return `${musicItem.alias}`;
        }
        if (musicItem?.title) {
            return musicItem.artist
                ? `${musicItem.title} ${musicItem.artist}`
                : musicItem.title;
        }
        return "";
    });
    const colors = useColors();
    const hasCustomBackground = useHasCustomBackground();
    const cardStyle = useCardStyle({
        borderWidth: 0,
        elevation: 3,
    });
    const { t } = useI18N();
    const activeButtonColor = Color(colors.primary).alpha(0.14).toString();

    const searchCover = useSearchCover();

    useEffect(() => {
        if (musicItem) {
            const q =
                musicItem.alias ||
                (musicItem.artist
                    ? `${musicItem.title} ${musicItem.artist}`
                    : musicItem.title);
            searchCover(q, 1);
        }
    }, [musicItem, searchCover]);

    return (
        <PanelBase
            keyboardAvoidBehavior="none"
            height={vmax(80)}
            positionMethod="top"
            renderBody={() => (
                <View style={style.wrapper}>
                    <View
                        style={[
                            style.searchCard,
                            {
                                backgroundColor: colors.surface,
                            },
                            cardStyle,
                        ]}>
                        <View style={style.headerTextRow}>
                            <View style={style.headerTextBlock}>
                                <ThemeText fontSize="title" fontWeight="bold">
                                    {t("panel.searchCover.title")}
                                </ThemeText>
                                <ThemeText
                                    fontColor="textSecondary"
                                    fontSize="description"
                                    numberOfLines={1}>
                                    {musicItem?.title ??
                                        t("panel.searchCover.inputPlaceholder")}
                                </ThemeText>
                            </View>
                            <Pressable
                                onPress={() => {
                                    searchCover(input, 1);
                                }}
                                style={[
                                    style.searchAction,
                                    {
                                        backgroundColor: activeButtonColor,
                                    },
                                ]}>
                                <ThemeText
                                    color={colors.primary}
                                    fontWeight="bold">
                                    {t("common.search")}
                                </ThemeText>
                            </Pressable>
                        </View>
                        <TextInput
                            value={input}
                            onChangeText={_ => {
                                setInput(_);
                            }}
                            onSubmitEditing={() => {
                                searchCover(input, 1);
                            }}
                            style={[
                                style.input,
                                {
                                    color: colors.text,
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: hasCustomBackground
                                        ? "transparent"
                                        : colors.border,
                                    borderWidth: hasCustomBackground
                                        ? 0
                                        : StyleSheet.hairlineWidth,
                                },
                            ]}
                            placeholderTextColor={colors.textSecondary}
                            placeholder={t(
                                "panel.searchCover.inputPlaceholder",
                            )}
                            maxLength={80}
                        />
                    </View>
                    <CoverResultBodyWrapper musicItem={musicItem} />
                </View>
            )}
        />
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        paddingTop: rpx(24),
        paddingBottom: rpx(12),
        flex: 1,
    },
    searchCard: {
        marginHorizontal: rpx(12),
        marginBottom: rpx(10),
        padding: rpx(22),
        borderRadius: rpx(22),
        shadowOffset: {
            width: 0,
            height: rpx(2),
        },
        shadowRadius: rpx(4),
    },
    headerTextRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: rpx(18),
    },
    headerTextBlock: {
        flex: 1,
        marginRight: rpx(16),
    },
    input: {
        borderRadius: rpx(18),
        fontSize: fontSizeConst.content,
        lineHeight: fontSizeConst.content * 1.5,
        paddingHorizontal: rpx(18),
        paddingVertical: rpx(14),
    },
    searchAction: {
        minWidth: rpx(132),
        height: rpx(68),
        paddingHorizontal: rpx(24),
        borderRadius: rpx(20),
        justifyContent: "center",
        alignItems: "center",
        flexShrink: 0,
    },
    pluginSectionCard: {
        flex: 1,
        marginHorizontal: rpx(12),
        marginBottom: rpx(8),
        paddingTop: rpx(18),
        paddingHorizontal: rpx(18),
        borderRadius: rpx(22),
        shadowOffset: {
            width: 0,
            height: rpx(2),
        },
        shadowRadius: rpx(4),
    },
    pluginSectionTitle: {
        marginBottom: rpx(8),
        marginLeft: rpx(4),
    },
    emptyStateCard: {
        justifyContent: "center",
        alignItems: "center",
    },
});

function CoverResultBodyWrapper(props: {
    musicItem?: IMusic.IMusicItem | null;
}) {
    const { musicItem } = props;
    const [index, setIndex] = useState(0);
    const { t } = useI18N();
    const colors = useColors();
    const cardStyle = useCardStyle({
        borderWidth: 0,
        elevation: 3,
    });

    const routes = useMemo(
        () =>
            PluginManager.getSortedSearchablePlugins("music")?.map?.(
                _ => ({
                    key: _.hash,
                    title: _.name,
                }),
            ) ?? [],
        [],
    );

    return routes?.length ? (
        <View style={globalStyle.fwflex1}>
            <View
                style={[
                    style.pluginSectionCard,
                    {
                        backgroundColor: colors.card,
                    },
                    cardStyle,
                ]}>
                <ThemeText
                    fontSize="caption"
                    fontWeight="bold"
                    fontColor="textSecondary"
                    style={style.pluginSectionTitle}>
                    {t("panel.playById.currentPlugin")}
                </ThemeText>
                <TabView
                    style={globalStyle.fwflex1}
                    lazy
                    navigationState={{
                        index,
                        routes,
                    }}
                    renderTabBar={() => (
                        <PillTabBar
                            routes={routes}
                            index={index}
                            onIndexChange={setIndex}
                            variant="pill"
                            getTitle={route =>
                                route.title ?? t("panel.searchCover.unnamed")
                            }
                        />
                    )}
                    renderScene={({ route }) => (
                        <CoverList
                            route={route}
                            targetMusicItem={musicItem}
                        />
                    )}
                    onIndexChange={setIndex}
                    initialLayout={{ width: vw(100) }}
                />
            </View>
        </View>
    ) : (
        <View
            style={[
                style.pluginSectionCard,
                style.emptyStateCard,
                {
                    backgroundColor: colors.card,
                },
                cardStyle,
            ]}>
            <NoPlugin notSupportType={t("panel.searchCover.notSupported")} />
        </View>
    );
}
