/**
 * 简化的下载通知管理器
 * 现在使用RNFetchBlob + Android系统下载管理器，不需要自定义通知
 * 此文件保留是为了兼容性，防止其他地方的引用报错
 */

import { Platform } from "react-native";
import { devLog } from "@/utils/log";

interface NotificationTask {
  taskId: string;
  musicItem: IMusic.IMusicItem;
  notificationId: string;
  lastUpdateTime: number;
  lastDownloadedSize: number;
}

class DownloadNotificationManager implements IDownloadNotification.IDownloadNotificationManager {
    private isInitialized = false;
    private activeTasks = new Map<string, NotificationTask>();

    async initialize(): Promise<void> {
        devLog('info', '🏠[通知管理器] 使用系统下载管理器，跳过自定义通知管理器初始化');
        this.isInitialized = true;
    }

    async showDownloadNotification(taskId: string, musicItem: IMusic.IMusicItem): Promise<void> {
        devLog('info', '📢[通知管理器] 系统下载管理器将自动显示通知', { musicTitle: musicItem.title });
        // 系统下载管理器会自动处理通知
    }

    async updateProgress(taskId: string, progress: IDownloadNotification.DownloadProgress): Promise<void> {
        devLog('info', '📈[通知管理器] 系统下载管理器将自动更新进度', { 
            progress: `${progress.progress}%`,
            taskId 
        });
        // 系统下载管理器会自动处理进度更新
    }

    async showCompleted(taskId: string, musicItem: IMusic.IMusicItem, filePath: string): Promise<void> {
        devLog('info', '✅[通知管理器] 系统下载管理器将自动显示完成通知', { 
            musicTitle: musicItem.title,
            filePath 
        });
        // 系统下载管理器会自动处理完成通知
    }

    async showError(taskId: string, error: string): Promise<void> {
        devLog('info', '❌[通知管理器] 系统下载管理器将自动显示错误通知', { 
            error,
            taskId 
        });
        // 系统下载管理器会自动处理错误通知
    }

    async cancelNotification(taskId: string): Promise<void> {
        devLog('info', '🗑[通知管理器] 系统下载管理器将自动取消通知', { taskId });
        // 系统下载管理器会自动处理取消通知
        this.activeTasks.delete(taskId);
    }

    /** 清理所有下载通知 */
    async clearAllNotifications(): Promise<void> {
        devLog('info', '🧩[通知管理器] 清理所有通知记录');
        this.activeTasks.clear();
    }

    /** 获取当前活跃的下载通知数量 */
    getActiveTaskCount(): number {
        return this.activeTasks.size;
    }

    /** 请求通知权限（显式请求，带用户提示） */
    async requestNotificationPermission(): Promise<boolean> {
        devLog('info', '🔒[通知管理器] 系统下载管理器不需要额外的通知权限');
        return true; // 系统下载管理器有自己的权限管理
    }

    /** 检查通知权限状态 */
    async checkNotificationPermission(): Promise<boolean> {
        return true; // 系统下载管理器有自己的权限管理
    }

    /** 获取权限状态描述 */
    async getPermissionStatusDescription(): Promise<string> {
        return "使用系统下载管理器，由系统自动处理通知权限";
    }
}

// 单例模式
const downloadNotificationManager = new DownloadNotificationManager();
export default downloadNotificationManager;