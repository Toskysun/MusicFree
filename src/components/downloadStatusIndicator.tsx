import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useDownloadTask } from "@/core/downloader";
import { DownloadStatus } from "@/core/downloader";

interface DownloadStatusIndicatorProps {
  musicItem: IMusic.IMusicItem;
}

/**
 * 下载状态指示器组件
 * 展示单个音乐项目的下载状态
 */
export const DownloadStatusIndicator: React.FC<DownloadStatusIndicatorProps> = ({ 
    musicItem, 
}) => {
    const downloadTask = useDownloadTask(musicItem);

    if (!downloadTask) {
        return null; // 没有下载任务
    }

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
    };

    const getStatusText = () => {
        switch (downloadTask.status) {
        case DownloadStatus.Pending:
            return "等待下载";
        case DownloadStatus.Preparing:
            return "准备下载";
        case DownloadStatus.Downloading:
            if (downloadTask.fileSize && downloadTask.downloadedSize) {
                const progress = Math.round((downloadTask.downloadedSize / downloadTask.fileSize) * 100);
                const downloaded = formatFileSize(downloadTask.downloadedSize);
                const total = formatFileSize(downloadTask.fileSize);
                return `下载中 ${progress}% (${downloaded}/${total})`;
            }
            return "下载中...";
        case DownloadStatus.Completed:
            return "下载完成";
        case DownloadStatus.Error:
            return `下载失败: ${downloadTask.errorReason || "未知错误"}`;
        default:
            return "";
        }
    };

    const getStatusColor = () => {
        switch (downloadTask.status) {
        case DownloadStatus.Pending:
            return "#666";
        case DownloadStatus.Preparing:
        case DownloadStatus.Downloading:
            return "#007AFF";
        case DownloadStatus.Completed:
            return "#34C759";
        case DownloadStatus.Error:
            return "#FF3B30";
        default:
            return "#666";
        }
    };

    return (
        <View style={styles.container}>
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
                {getStatusText()}
            </Text>
      
            {downloadTask.status === DownloadStatus.Downloading && (
                <View style={styles.progressContainer}>
                    <View style={styles.progressBackground}>
                        <View 
                            style={[
                                styles.progressFill,
                                {
                                    width: `${downloadTask.fileSize && downloadTask.downloadedSize 
                                        ? Math.round((downloadTask.downloadedSize / downloadTask.fileSize) * 100) 
                                        : 0}%`,
                                },
                            ]} 
                        />
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 8,
    },
    statusText: {
        fontSize: 12,
        fontWeight: "500",
    },
    progressContainer: {
        marginTop: 4,
    },
    progressBackground: {
        height: 4,
        backgroundColor: "#E5E5E7",
        borderRadius: 2,
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        backgroundColor: "#007AFF",
        borderRadius: 2,
    },
});

export default DownloadStatusIndicator;