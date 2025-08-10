import React from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import rpx from "@/utils/rpx";
import ListItem from "@/components/base/listItem";
import { sizeFormatter } from "@/utils/fileUtils";
import { DownloadFailReason, DownloadStatus, useDownloadQueue, useDownloadTask } from "@/core/downloader";
import { FlashList } from "@shopify/flash-list";
import { useI18N } from "@/core/i18n";
import Icon from "@/components/base/icon";
import downloader from "@/core/downloader";
import Toast from "@/utils/toast";
import { iconSizeConst } from "@/constants/uiConst";


interface DownloadingListItemProps {
    musicItem: IMusic.IMusicItem;
}
function DownloadingListItem(props: DownloadingListItemProps) {
    const { musicItem } = props;
    const taskInfo = useDownloadTask(musicItem);
    const { t } = useI18N();

    const status = taskInfo?.status ?? DownloadStatus.Error;

    let description = "";

    if (status === DownloadStatus.Error) {
        const reason = taskInfo?.errorReason;

        if (reason === DownloadFailReason.NoWritePermission) {
            description = t("downloading.downloadFailReason.noWritePermission");
        } else if (reason === DownloadFailReason.FailToFetchSource) {
            description = t("downloading.downloadFailReason.failToFetchSource");
        } else {
            description = t("downloading.downloadFailReason.unknown");
        }
    } else if (status === DownloadStatus.Completed) {
        description = t("downloading.downloadStatus.completed");
    } else if (status === DownloadStatus.Downloading) {
        const progress = taskInfo?.downloadedSize ? sizeFormatter(taskInfo.downloadedSize) : "-";
        const totalSize = taskInfo?.fileSize ? sizeFormatter(taskInfo.fileSize) : "-";

        description = t("downloading.downloadStatus.downloadProgress", {
            progress,
            totalSize,
        });
    } else if (status === DownloadStatus.Pending) {
        description = t("downloading.downloadStatus.pending");
    } else if (status === DownloadStatus.Preparing) {
        description = t("downloading.downloadStatus.preparing");
    }

    // 只有错误或正在下载的任务才能删除
    const canDelete = status === DownloadStatus.Error || 
                      status === DownloadStatus.Downloading || 
                      status === DownloadStatus.Pending ||
                      status === DownloadStatus.Preparing;

    const handleDelete = () => {
        const success = downloader.remove(musicItem);
        if (success) {
            Toast.success(t("toast.deleteSuccess"));
        } else {
            Toast.warn(t("toast.deleteFailed"));
        }
    };

    return <ListItem withHorizontalPadding>
        <ListItem.Content
            title={musicItem.title}
            description={description}
        />
        {canDelete && (
            <TouchableOpacity onPress={handleDelete} style={style.deleteButton}>
                <Icon 
                    name="trash-outline" 
                    size={iconSizeConst.normal} 
                    color="#ff4444"
                />
            </TouchableOpacity>
        )}
    </ListItem>;

}

export default function DownloadingList() {
    const downloadQueue = useDownloadQueue();


    return (
        <View style={style.wrapper}>
            <FlashList
                style={style.downloading}
                data={downloadQueue}
                keyExtractor={_ => `dl${_.platform}.${_.id}`}
                renderItem={({ item }) => {
                    return <DownloadingListItem musicItem={item} />;
                }}
            />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    downloading: {
        flexGrow: 0,
    },
    deleteButton: {
        padding: rpx(16),
        justifyContent: "center",
        alignItems: "center",
    },
});
