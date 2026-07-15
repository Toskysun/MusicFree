import { RequestStateCode } from "@/constants/commonConst";
import PluginManager, { Plugin } from "@/core/pluginManager";
import { devLog, errorLog } from "@/utils/log";
import { produce } from "immer";
import { useCallback, useRef } from "react";
import searchResultStore from "./searchResultStore";

export default function useSearchCover() {
    const currentQueryRef = useRef<string>("");

    const search = useCallback(async function (
        query?: string,
        queryPage?: number,
        pluginHash?: string,
    ) {
        devLog("info", "🔍[搜索封面] 开始搜索", { query, queryPage });
        let plugins: Plugin[] = [];
        if (pluginHash) {
            const tgtPlugin = PluginManager.getByHash(pluginHash);
            tgtPlugin && (plugins = [tgtPlugin]);
        } else {
            plugins = PluginManager.getSearchablePlugins("music");
        }
        if (plugins.length === 0) {
            searchResultStore.setValue(
                produce(draft => {
                    draft.data = {};
                }),
            );
            return;
        }

        plugins.forEach(async plugin => {
            const _platform = plugin.instance.platform;
            const _hash = plugin.hash;
            if (!_platform || !_hash) {
                searchResultStore.setValue(
                    produce(draft => {
                        draft.data = {};
                    }),
                );
                return;
            }

            const prevPluginResult =
                searchResultStore.getValue().data[plugin.hash];
            if (
                (prevPluginResult?.state ===
                    RequestStateCode.PENDING_FIRST_PAGE ||
                    prevPluginResult?.state ===
                        RequestStateCode.PENDING_REST_PAGE ||
                    prevPluginResult?.state === RequestStateCode.FINISHED) &&
                undefined === query
            ) {
                return;
            }

            const newSearch =
                query ||
                prevPluginResult?.page === undefined ||
                queryPage === 1;

            currentQueryRef.current = query =
                query ?? searchResultStore.getValue().query ?? "";

            const page =
                queryPage ?? newSearch ? 1 : (prevPluginResult?.page ?? 0) + 1;
            try {
                searchResultStore.setValue(
                    produce(draft => {
                        const prevMediaResult = draft.data;
                        prevMediaResult[_hash] = {
                            state: newSearch
                                ? RequestStateCode.PENDING_FIRST_PAGE
                                : RequestStateCode.PENDING_REST_PAGE,
                            data: newSearch
                                ? []
                                : prevMediaResult[_hash]?.data ?? [],
                            page,
                        };
                    }),
                );
                const result = await plugin?.methods?.search?.(
                    query,
                    page,
                    "music",
                );
                if (currentQueryRef.current !== query) {
                    return;
                }
                if (!result) {
                    throw new Error("搜索结果为空");
                }
                searchResultStore.setValue(
                    produce(draft => {
                        const prevMediaResult = draft.data;
                        const currPluginResult: any = prevMediaResult[
                            _hash
                        ] ?? {
                            data: [],
                        };
                        const currResult = result.data ?? [];

                        prevMediaResult[_hash] = {
                            state: RequestStateCode.FINISHED,
                            page,
                            data: newSearch
                                ? currResult
                                : (currPluginResult.data ?? []).concat(
                                    currResult,
                                ),
                        };
                        return draft;
                    }),
                );
            } catch (e: any) {
                errorLog("搜索封面失败", e?.message);
                devLog(
                    "error",
                    "搜索封面失败",
                    `Plugin: ${plugin.name} Query: ${query} Page: ${page}`,
                    e,
                    e?.message,
                );
                if (currentQueryRef.current !== query) {
                    return;
                }
                searchResultStore.setValue(
                    produce(draft => {
                        const prevMediaResult = draft.data;
                        const currentPluginResult = prevMediaResult[_hash] ?? {
                            data: [],
                        };

                        currentPluginResult.state = RequestStateCode.FINISHED;
                        return draft;
                    }),
                );
            }
        });
    },
    []);

    return search;
}
