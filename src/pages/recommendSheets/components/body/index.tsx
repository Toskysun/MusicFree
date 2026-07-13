import NoPlugin from "@/components/base/noPlugin";
import PillTabBar from "@/components/base/pillTabBar";
import { useI18N } from "@/core/i18n";
import PluginManager from "@/core/pluginManager";
import { vw } from "@/utils/rpx";
import React, { useState } from "react";
import { TabView } from "react-native-tab-view";
import SheetBody from "./sheetBody";

export default function Body() {
    const [index, setIndex] = useState(0);
    const routes = PluginManager.getSortedPluginsWithAbility(
        "getRecommendSheetsByTag",
    ).map(_ => ({
        key: _.hash,
        title: _.name,
    }));
    const { t } = useI18N();

    if (!routes?.length) {
        return <NoPlugin notSupportType={t("recommendSheet.title")} />;
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
                    getTitle={route =>
                        route.title ?? `(${t("common.unknownName")})`
                    }
                />
            )}
            renderScene={props => {
                return <SheetBody hash={props.route.key} />;
            }}
            onIndexChange={setIndex}
            initialLayout={{ width: vw(100) }}
        />
    );
}
