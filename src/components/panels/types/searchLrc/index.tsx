import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import rpx, { vmax, vw } from "@/utils/rpx";

import { fontSizeConst, fontWeightConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import PanelBase from "../../base/panelBase";
import { TextInput } from "react-native-gesture-handler";
import useSearchLrc from "./useSearchLrc";
import PluginManager from "@/core/pluginManager";
import { SceneMap, TabBar, TabView } from "react-native-tab-view";
import LyricList from "./LyricList";
import globalStyle from "@/constants/globalStyle";
import NoPlugin from "@/components/base/noPlugin";
import { useI18N } from "@/core/i18n";
import ThemeText from "@/components/base/themeText";
import Color from "color";
import useCardStyle from "@/hooks/useCardStyle";

interface INewMusicSheetProps {
    musicItem?: IMusic.IMusicItem | null;
}

export default function SearchLrc(props: INewMusicSheetProps) {
    const { musicItem } = props;
    const [input, setInput] = useState(
        musicItem?.alias ?? musicItem?.title ?? "",
    );
    const colors = useColors();
    const cardStyle = useCardStyle({
        borderWidth: 0,
        elevation: 3,
    });
    const { t } = useI18N();
    const activeButtonColor = Color(colors.primary).alpha(0.14).toString();

    const searchLrc = useSearchLrc();

    useEffect(() => {
        if (musicItem) {
            searchLrc(musicItem.alias || musicItem.title, 1);
        }
    }, [musicItem, searchLrc]);

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
                                    {t("common.search")}
                                </ThemeText>
                                <ThemeText
                                    fontColor="textSecondary"
                                    fontSize="description"
                                    numberOfLines={1}>
                                    {musicItem?.title ??
                                        t("panel.searchLrc.inputPlaceholder")}
                                </ThemeText>
                            </View>
                            <Pressable
                                onPress={() => {
                                    searchLrc(input, 1);
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
                                searchLrc(input, 1);
                            }}
                            style={[
                                style.input,
                                {
                                    color: colors.text,
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: colors.border,
                                },
                            ]}
                            placeholderTextColor={colors.textSecondary}
                            placeholder={t("panel.searchLrc.inputPlaceholder")}
                            maxLength={80}
                        />
                    </View>
                    <LyricResultBodyWrapper />
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
        borderWidth: StyleSheet.hairlineWidth,
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

function LyricResultBodyWrapper() {
    const [index, setIndex] = useState(0);
    const { t } = useI18N();
    const colors = useColors();
    const cardStyle = useCardStyle({
        borderWidth: 0,
        elevation: 3,
    });

    const routes = useMemo(() => PluginManager.getSortedSearchablePlugins("lyric")?.map?.(
        _ => ({
            key: _.hash,
            title: _.name,
        }),
    ) ?? [], []);

    const sceneMap = useMemo(() => {
        const scene: Record<string, any> = {};
        routes.forEach(r => {
            scene[r.key] = LyricList;
        });
        return SceneMap(scene);

    }, [routes]);


    const activeTabBackground = Color(colors.primary).alpha(0.12).toString();
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
                    renderTabBar={_ => (
                        <TabBar
                            {..._}
                            scrollEnabled
                            // eslint-disable-next-line react-native/no-inline-styles -- Dynamic transparent styles for tab appearance
                            style={{
                                backgroundColor: "transparent",
                                shadowColor: "transparent",
                                borderColor: "transparent",
                                paddingHorizontal: 0,
                                paddingTop: rpx(2),
                                paddingBottom: rpx(8),
                            }}
                            // eslint-disable-next-line react-native/no-inline-styles -- Dynamic width for tab flexibility
                            tabStyle={{
                                width: "auto",
                                paddingHorizontal: rpx(4),
                            }}
                            renderIndicator={() => null}
                            pressColor="transparent"
                            inactiveColor={colors.text}
                            activeColor={colors.primary}
                            renderLabel={({ route, focused }) => (
                                <Text
                                    numberOfLines={1}
                                    // eslint-disable-next-line react-native/no-inline-styles -- Dynamic focused state styles
                                    style={{
                                        maxWidth: rpx(180),
                                        fontWeight: focused
                                            ? fontWeightConst.bolder
                                            : fontWeightConst.medium,
                                        color: focused
                                            ? colors.primary
                                            : colors.textSecondary ?? colors.text,
                                        textAlign: "center",
                                        paddingVertical: rpx(8),
                                        paddingHorizontal: rpx(16),
                                        borderRadius: rpx(16),
                                        backgroundColor: focused
                                            ? activeTabBackground
                                            : "transparent",
                                    }}>
                                    {route.title ?? t("panel.searchLrc.unnamed")}
                                </Text>
                            )}
                        />
                    )}
                    renderScene={sceneMap}
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
            <NoPlugin notSupportType={t("panel.searchLrc.notSupported")} />
        </View>
    );
}
