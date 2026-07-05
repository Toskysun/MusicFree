import { useMusicHistory } from "@/core/musicHistory";
import MusicSheet, { useSheetsBase, useStarredSheets } from "@/core/musicSheet";
import PluginManager, { useSortedPlugins } from "@/core/pluginManager";
import { useCurrentMusic } from "@/core/trackPlayer";
import { isSameMediaItem } from "@/utils/mediaUtils";
import { useMemo } from "react";

export default function useHomeOverview() {
    const sortedPlugins = useSortedPlugins();
    const currentMusic = useCurrentMusic();
    const history = useMusicHistory();
    const sheets = useSheetsBase();
    const starredSheets = useStarredSheets();

    const enabledPlugins = useMemo(
        () =>
            sortedPlugins.filter(plugin =>
                PluginManager.isPluginEnabled(plugin),
            ),
        [sortedPlugins],
    );

    const topListPlugins = useMemo(
        () =>
            enabledPlugins.filter(plugin =>
                plugin.supportedMethods.has("getTopLists"),
            ),
        [enabledPlugins],
    );

    const featuredMusic = currentMusic ?? history[0] ?? null;

    const recentMusics = useMemo(
        () =>
            history
                .filter(item =>
                    currentMusic ? !isSameMediaItem(item, currentMusic) : true,
                )
                .slice(0, 3),
        [currentMusic, history],
    );

    const favoriteSheet = useMemo(
        () =>
            sheets.find(sheet => sheet.id === MusicSheet.defaultSheet.id) ??
            sheets[0] ??
            null,
        [sheets],
    );

    const userSheets = useMemo(
        () =>
            sheets.filter(sheet => sheet.id !== MusicSheet.defaultSheet.id),
        [sheets],
    );

    return {
        currentMusic,
        featuredMusic,
        recentMusics,
        topListPlugins,
        sheets,
        starredSheets,
        favoriteSheet,
        userSheets,
    };
}
