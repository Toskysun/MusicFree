/**
 * 下载通知管理器（JS 兼容层）
 * 真实下载通知由原生 NativeDownload 队列负责，这里主要维护权限能力接口。
 */

import { devLog } from "@/utils/log";
import notificationPermissionManager from "@/core/notificationPermissionManager";

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
        devLog("info", "🏠[通知管理器] 使用原生下载队列通知");
        try {
            await notificationPermissionManager.silentRequestPermission();
        } catch {
            // ignore permission bootstrap errors
        }
        this.isInitialized = true;
    }

    async showDownloadNotification(taskId: string, musicItem: IMusic.IMusicItem): Promise<void> {
        this.activeTasks.set(taskId, {
            taskId,
            musicItem,
            notificationId: taskId,
            lastUpdateTime: Date.now(),
            lastDownloadedSize: 0,
        });
        devLog("info", "📢[通知管理器] 原生下载器将显示通知", { musicTitle: musicItem.title });
    }

    async updateProgress(taskId: string, progress: IDownloadNotification.DownloadProgress): Promise<void> {
        const task = this.activeTasks.get(taskId);
        if (task) {
            task.lastUpdateTime = Date.now();
            task.lastDownloadedSize = progress.downloadedSize;
        }
        devLog("info", "📈[通知管理器] 原生下载器将更新进度通知", {
            progress: `${progress.progress}%`,
            taskId,
        });
    }

    async showCompleted(taskId: string, musicItem: IMusic.IMusicItem, filePath: string): Promise<void> {
        this.activeTasks.delete(taskId);
        devLog("info", "✅[通知管理器] 原生下载器将显示完成通知", {
            musicTitle: musicItem.title,
            filePath,
        });
    }

    async showError(taskId: string, error: string): Promise<void> {
        this.activeTasks.delete(taskId);
        devLog("info", "❌[通知管理器] 原生下载器将显示错误通知", {
            error,
            taskId,
        });
    }

    async cancelNotification(taskId: string): Promise<void> {
        devLog("info", "🗑[通知管理器] 取消任务通知记录", { taskId });
        this.activeTasks.delete(taskId);
    }

    /** 清理所有下载通知 */
    async clearAllNotifications(): Promise<void> {
        devLog("info", "🧩[通知管理器] 清理所有通知记录");
        this.activeTasks.clear();
    }

    /** 获取当前活跃的下载通知数量 */
    getActiveTaskCount(): number {
        return this.activeTasks.size;
    }

    /** 请求通知权限（显式请求，带用户提示） */
    async requestNotificationPermission(): Promise<boolean> {
        devLog("info", "🔒[通知管理器] 请求通知权限");
        return notificationPermissionManager.requestPermission(true);
    }

    /** 检查通知权限状态 */
    async checkNotificationPermission(): Promise<boolean> {
        return notificationPermissionManager.checkPermission();
    }

    /** 获取权限状态描述 */
    async getPermissionStatusDescription(): Promise<string> {
        return notificationPermissionManager.getPermissionStatusDescription();
    }
}

// 单例模式
const downloadNotificationManager = new DownloadNotificationManager();
export default downloadNotificationManager;
