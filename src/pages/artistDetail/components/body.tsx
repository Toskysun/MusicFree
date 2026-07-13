import React, { useState } from "react";
import { StyleSheet } from "react-native";
import rpx from "@/utils/rpx";
import { SceneMap, TabView } from "react-native-tab-view";
import ResultList from "./resultList";
import { useAtomValue } from "jotai";
import { queryResultAtom } from "../store/atoms";
import content from "./content";
import { useI18N } from "@/core/i18n";
import PillTabBar from "@/components/base/pillTabBar";

const sceneMap: Record<string, React.FC> = {
    album: BodyContentWrapper,
    music: BodyContentWrapper,
};

const routes = [
    {
        key: "music",
        i18nKey: "common.singleMusic",
        title: "单曲",
    },
    {
        key: "album",
        i18nKey: "common.album",
        title: "专辑",
    },
];

export default function Body() {
    const [index, setIndex] = useState(0);
    const { t } = useI18N();

    return (
        <TabView
            lazy
            style={style.wrapper}
            navigationState={{
                index,
                routes,
            }}
            renderTabBar={() => (
                <PillTabBar
                    routes={routes}
                    index={index}
                    onIndexChange={setIndex}
                    variant="underline"
                    getTitle={route =>
                        t((route as (typeof routes)[number]).i18nKey as any) ??
                        route.title ??
                        route.key
                    }
                />
            )}
            renderScene={SceneMap(sceneMap)}
            onIndexChange={setIndex}
            initialLayout={{ width: rpx(750) }}
        />
    );
}

export function BodyContentWrapper(props: any) {
    const tab: IArtist.ArtistMediaType = props.route.key;
    const queryResult = useAtomValue(queryResultAtom);

    const Component = content[tab];
    const renderItem = ({ item, index }: any) => (
        <Component item={item} index={index} />
    );

    return (
        <ResultList tab={tab} data={queryResult[tab]} renderItem={renderItem} />
    );
}

const style = StyleSheet.create({
    wrapper: {
        zIndex: 100,
    },
});
