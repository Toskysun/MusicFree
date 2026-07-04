/**
 * 搜索结果面板 一级页
 */
import React, { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import rpx, { vw } from "@/utils/rpx";
import { SceneMap, TabView } from "react-native-tab-view";
import ResultSubPanel from "./resultSubPanel";
import results from "./results";
import { fontWeightConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import { useI18N } from "@/core/i18n";

const routes = results;

const getRouterScene = (
    routeList: Array<{ key: ICommon.SupportMediaType; title: string }>,
) => {
    const scene: Record<string, React.ComponentType<any>> = {};
    routeList.forEach(r => {
        scene[r.key] = () => <ResultSubPanel tab={r.key} />;
    });
    return SceneMap(scene);
};

const renderScene = getRouterScene(routes);

function ResultPanel() {
    const [index, setIndex] = useState(0);
    const colors = useColors();
    const { t } = useI18N();

    return (
        <View style={styles.container}>
            <View
                style={[
                    styles.primaryTabs,
                    {
                        borderBottomColor: colors.divider,
                    },
                ]}>
                {routes.map((route, routeIndex) => {
                    const focused = routeIndex === index;

                    return (
                        <Pressable
                            key={route.key}
                            style={styles.primaryTabItem}
                            onPress={() => setIndex(routeIndex)}>
                            <Text
                                numberOfLines={1}
                                style={{
                                    fontSize: rpx(28),
                                    fontWeight: focused
                                        ? fontWeightConst.bolder
                                        : fontWeightConst.medium,
                                    color: focused
                                        ? colors.primary
                                        : colors.textSecondary ?? colors.text,
                                    textAlign: "center",
                                }}>
                                {route.i18nKey
                                    ? t(route.i18nKey as any)
                                    : route.title}
                            </Text>
                            <View
                                style={[
                                    styles.primaryTabIndicator,
                                    {
                                        backgroundColor: focused
                                            ? colors.primary
                                            : "transparent",
                                    },
                                ]}
                            />
                        </Pressable>
                    );
                })}
            </View>
            <TabView
                lazy
                navigationState={{
                    index,
                    routes,
                }}
                renderTabBar={() => null}
                renderScene={renderScene}
                onIndexChange={setIndex}
                initialLayout={{ width: vw(100) }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    primaryTabs: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: rpx(20),
        paddingTop: rpx(4),
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    primaryTabItem: {
        flex: 1,
        alignItems: "center",
        paddingHorizontal: rpx(8),
        paddingTop: rpx(12),
        paddingBottom: rpx(10),
    },
    primaryTabIndicator: {
        width: rpx(40),
        height: rpx(6),
        borderRadius: rpx(999),
        marginTop: rpx(10),
    },
});

export default memo(ResultPanel);
