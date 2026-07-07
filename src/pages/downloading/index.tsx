import React from "react";
import StatusBar from "@/components/base/statusBar";
import DownloadingList from "./downloadingList";
import MusicBar from "@/components/musicBar";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import globalStyle from "@/constants/globalStyle";
import AppBar from "@/components/base/appBar";
import { useI18N } from "@/core/i18n";
import downloader from "@/core/downloader";
import Toast from "@/utils/toast";

export default function Downloading() {
    const { t } = useI18N();

    // 清除所有错误任务（只清除失败的，不影响等待中/下载中的任务）
    const clearErrorTasks = () => {
        const clearedCount = downloader.removeErrorTasks();

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
