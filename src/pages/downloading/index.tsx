import React from "react";
import StatusBar from "@/components/base/statusBar";
import DownloadingList from "./downloadingList";
import MusicBar from "@/components/musicBar";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import globalStyle from "@/constants/globalStyle";
import AppBar from "@/components/base/appBar";
import { useI18N } from "@/core/i18n";
import downloader, { useDownloadQueue } from "@/core/downloader";
import Toast from "@/utils/toast";

export default function Downloading() {
    const { t } = useI18N();
    const downloadQueue = useDownloadQueue();

    // 清除所有错误任务
    const clearErrorTasks = () => {
        let clearedCount = 0;
        downloadQueue.forEach(musicItem => {
            // 尝试删除错误任务
            const success = downloader.remove(musicItem);
            if (success) {
                clearedCount++;
            }
        });
        
        if (clearedCount > 0) {
            Toast.success(t("downloading.clearErrorSuccess", { count: clearedCount }));
        } else {
            Toast.warn(t("downloading.noErrorTasksToClear"));
        }
    };

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <AppBar 
                menu={[
                    {
                        icon: "trash-outline",
                        title: t("downloading.clearErrorTasks"),
                        onPress: clearErrorTasks,
                    },
                ]}
            >
                {t("downloading.title")}
            </AppBar>
            <DownloadingList />
            <MusicBar />
        </VerticalSafeAreaView>
    );
}
