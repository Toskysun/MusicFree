import React, { useCallback, useState } from "react";
import rpx from "@/utils/rpx";
import PluginManager from "@/core/pluginManager";
import { TabView } from "react-native-tab-view";
import BoardPanelWrapper from "./boardPanelWrapper";
import NoPlugin from "@/components/base/noPlugin";
import i18n from "@/core/i18n";
import PillTabBar from "@/components/base/pillTabBar";

export default function TopListBody() {
    const routes = PluginManager.getSortedPluginsWithAbility("getTopLists").map(
        _ => ({
            key: _.hash,
            title: _.name,
        }),
    );
    const [index, setIndex] = useState(0);

    const renderScene = useCallback(
        (props: { route: { key: string } }) => (
            <BoardPanelWrapper hash={props?.route?.key} />
        ),
        [],
    );

    if (!routes?.length) {
        return <NoPlugin notSupportType={i18n.t("topList.title")} />;
    }

    const safeIndex = Math.min(index, routes.length - 1);

    return (
        <TabView
            lazy
            navigationState={{
                index: safeIndex,
                routes,
            }}
            renderTabBar={() => (
                <PillTabBar
                    routes={routes}
                    index={safeIndex}
                    onIndexChange={setIndex}
                    variant="underline"
                />
            )}
            renderScene={renderScene}
            onIndexChange={setIndex}
            initialLayout={{ width: rpx(750) }}
        />
    );
}
