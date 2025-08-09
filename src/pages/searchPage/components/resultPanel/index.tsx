/**
 * 搜索结果面板 一级页
 */
import React, { memo, useState } from "react";
import { Text } from "react-native";
import rpx, { vw } from "@/utils/rpx";
import { SceneMap, TabBar, TabView } from "react-native-tab-view";
import ResultSubPanel from "./resultSubPanel";
import results from "./results";
import { fontWeightConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import { useI18N } from "@/core/i18n";

const routes = results;

const getRouterScene = (
    routeList: Array<{ key: ICommon.SupportMediaType; title: string }>,
) => {
    const scene: Record<string, () => JSX.Element> = {};
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
        <TabView
            lazy
            navigationState={{
                index,
                routes,
            }}
            renderTabBar={props => (
                <TabBar
                    {...props}
                    scrollEnabled
                    // eslint-disable-next-line react-native/no-inline-styles -- Dynamic transparent styles for tab appearance
                    style={{
                        backgroundColor: colors.tabBar,
                         
                        shadowColor: "transparent",
                        borderColor: "transparent",
                    }}
                    inactiveColor={colors.text}
                    activeColor={colors.primary}
                    // eslint-disable-next-line react-native/no-inline-styles -- Dynamic width for tab flexibility
                    tabStyle={{
                         
                        width: "auto",
                    }}
                    renderLabel={({ route, focused, color }) => (
                        <Text
                            numberOfLines={1}
                            // eslint-disable-next-line react-native/no-inline-styles -- Dynamic focused state styles
                            style={{
                                width: rpx(160),
                                fontWeight: focused
                                    ? fontWeightConst.bolder
                                    : fontWeightConst.medium,
                                color,
                                 
                                textAlign: "center",
                            }}>
                            {route.i18nKey ? t(route.i18nKey as any) : route.title}
                        </Text>
                    )}
                    indicatorStyle={{
                        backgroundColor: colors.primary,
                        height: rpx(4),
                    }}
                />
            )}
            renderScene={renderScene}
            onIndexChange={setIndex}
            initialLayout={{ width: vw(100) }}
        />
    );
}

export default memo(ResultPanel);
