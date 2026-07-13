import Empty from "@/components/base/empty";
import PillTabBar from "@/components/base/pillTabBar";
import PluginManager from "@/core/pluginManager";
import { vw } from "@/utils/rpx";
import { useAtomValue } from "jotai";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { SceneMap, TabView } from "react-native-tab-view";
import { searchResultsAtom } from "../../store/atoms";
import { renderMap } from "./results";
import DefaultResults from "./results/defaultResults";
import ResultWrapper from "./resultWrapper";

interface IResultSubPanelProps {
    tab: ICommon.SupportMediaType;
}

// 展示结果的视图
function getResultComponent(
    tab: ICommon.SupportMediaType,
    pluginHash: string,
    pluginName: string,
) {
    return tab in renderMap
        ? memo(
            () => {
                const searchResults = useAtomValue(searchResultsAtom);
                const pluginSearchResult = searchResults[tab][pluginHash];
                const pluginSearchResultRef = useRef(pluginSearchResult);

                useEffect(() => {
                    pluginSearchResultRef.current = pluginSearchResult;
                }, [pluginSearchResult]);

                return (
                    <ResultWrapper
                        tab={tab}
                        searchResult={pluginSearchResult}
                        pluginHash={pluginHash}
                        pluginName={pluginName}
                        pluginSearchResultRef={pluginSearchResultRef}
                    />
                );
            },
            () => true,
        )
        : () => <DefaultResults />;
}

/** 结果 scene */
function getSubRouterScene(
    tab: ICommon.SupportMediaType,
    routes: Array<{ key: string; title: string }>,
) {
    const scene: Record<string, React.FC> = {};
    routes.forEach(r => {
        scene[r.key] = getResultComponent(tab, r.key, r.title);
    });
    return SceneMap(scene);
}

function ResultSubPanel(props: IResultSubPanelProps) {
    const [index, setIndex] = useState(0);
    // Do not over-memoize: plugins can load/enable after mount.
    const routes = PluginManager.getSortedSearchablePlugins(props.tab).map(
        _ => ({
            key: _.hash,
            title: _.name,
        }),
    );
    const routeKey = routes.map(r => r.key).join("|");
    const renderScene = useMemo(
        () => getSubRouterScene(props.tab, routes),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild when plugin set changes
        [props.tab, routeKey],
    );

    const safeIndex = routes.length
        ? Math.min(index, routes.length - 1)
        : 0;

    if (!routes.length) {
        return <Empty />;
    }

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
                    variant="pill"
                />
            )}
            renderScene={renderScene}
            onIndexChange={setIndex}
            initialLayout={{ width: vw(100) }}
        />
    );
}

// 不然会一直重新渲染
export default memo(ResultSubPanel);
