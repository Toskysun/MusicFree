import { RequestStateCode } from "@/constants/commonConst";
import type { Plugin } from "@/core/pluginManager";
import type { IPluginTopListResult } from "@/pages/topList/store/atoms";
import { pluginsTopListAtom } from "@/pages/topList/store/atoms";
import { produce } from "immer";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";

export interface IHomeDiscoveryPreview {
    topListPluginHash?: string;
    topListPluginName?: string;
    topLists: IMusic.IMusicSheetItemBase[];
    loading: boolean;
    hasError: boolean;
}

const defaultState: IHomeDiscoveryPreview = {
    topLists: [],
    loading: false,
    hasError: false,
};

const HOME_DISCOVERY_PREVIEW_LIMIT = 6;

function flattenTopLists(groups: IMusic.IMusicSheetGroupItem[]) {
    return groups.flatMap(group => group.data ?? []);
}

function getPreviewTopLists(topListData?: IPluginTopListResult) {
    return flattenTopLists(topListData?.data ?? []).slice(
        0,
        HOME_DISCOVERY_PREVIEW_LIMIT,
    );
}

function getPreviewState(
    topListPluginHash: string | undefined,
    topListPluginName: string | undefined,
    topLists: IMusic.IMusicSheetItemBase[],
    loading = false,
    hasError = false,
): IHomeDiscoveryPreview {
    return {
        topListPluginHash,
        topListPluginName,
        topLists,
        loading,
        hasError,
    };
}

export default function useHomeDiscovery(topListPlugins: Plugin[]) {
    const topListPlugin = topListPlugins[0] ?? null;
    const topListPluginHash = topListPlugin?.hash;
    const topListPluginName = topListPlugin?.name;
    const pluginsTopList = useAtomValue(pluginsTopListAtom);
    const setPluginsTopList = useSetAtom(pluginsTopListAtom);
    const cachedTopListData = topListPluginHash
        ? pluginsTopList[topListPluginHash]
        : undefined;

    const [state, setState] = useState<IHomeDiscoveryPreview>(defaultState);

    useEffect(() => {
        let canceled = false;

        if (!topListPlugin || !topListPluginHash) {
            setState(defaultState);
            return () => {
                canceled = true;
            };
        }

        const cachedTopLists = getPreviewTopLists(cachedTopListData);
        const hasCachedTopLists = cachedTopLists.length > 0;
        const cacheIsLoaded =
            cachedTopListData?.state === RequestStateCode.FINISHED;

        if (hasCachedTopLists || cacheIsLoaded) {
            setState(
                getPreviewState(
                    topListPluginHash,
                    topListPluginName,
                    cachedTopLists,
                ),
            );
        } else {
            setState(
                getPreviewState(
                    topListPluginHash,
                    topListPluginName,
                    [],
                    true,
                ),
            );
        }

        if (hasCachedTopLists) {
            return () => {
                canceled = true;
            };
        }

        async function query() {
            let topLists: IMusic.IMusicSheetItemBase[] = [];
            let hasError = false;

            if (topListPlugin) {
                try {
                    const result = await Promise.resolve(
                        topListPlugin.methods.getTopLists(),
                    );

                    topLists = flattenTopLists(result ?? []).slice(
                        0,
                        HOME_DISCOVERY_PREVIEW_LIMIT,
                    );
                    setPluginsTopList(
                        produce(draft => {
                            draft[topListPluginHash] = {
                                data: result ?? [],
                                state: RequestStateCode.FINISHED,
                            };
                        }),
                    );
                } catch {
                    topLists = cachedTopLists;
                    hasError = true;
                }
            }

            if (!canceled) {
                setState(
                    getPreviewState(
                        topListPluginHash,
                        topListPluginName,
                        topLists,
                        false,
                        hasError,
                    ),
                );
            }
        }

        query();

        return () => {
            canceled = true;
        };
    }, [
        cachedTopListData,
        setPluginsTopList,
        topListPlugin,
        topListPluginHash,
        topListPluginName,
    ]);

    return useMemo(() => state, [state]);
}
