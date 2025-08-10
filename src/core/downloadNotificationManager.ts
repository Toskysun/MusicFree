import notifee, { 
    AndroidCategory,
    AndroidImportance,
    AndroidStyle,
    AndroidColor,
    AndroidVisibility,
    EventType,
} from "@notifee/react-native";
import { Platform } from "react-native";
import notificationPermissionManager from "./notificationPermissionManager";
import { errorLog } from "@/utils/log";
import Toast from "@/utils/toast";
import downloader, { DownloaderEvent, DownloadStatus, IDownloadTaskInfo } from "./downloader";
import { getMediaUniqueKey } from "@/utils/mediaUtils";
import { sizeFormatter } from "@/utils/fileUtils";

interface NotificationTask {
  taskId: string;
  musicItem: IMusic.IMusicItem;
  notificationId: string;
  lastUpdateTime: number;
  lastDownloadedSize: number;
}

class DownloadNotificationManager implements IDownloadNotification.IDownloadNotificationManager {
    private readonly CHANNEL_ID = "download-progress";
    private readonly UPDATE_THROTTLE = 500; // 限制通知更新频率，避免卡顿
  
    private activeTasks = new Map<string, NotificationTask>();
    private isInitialized = false;
    private initializePromise: Promise<void> | null = null;
    private initializeAttempts = 0;
    private readonly MAX_INIT_ATTEMPTS = 3;
    private hasShownPermissionWarning = false; // 避免重复提示
    private isEventListenerSetup = false; // 追踪事件监听器状态

    async initialize(): Promise<void> {
        if (this.isInitialized || Platform.OS !== "android") {
            return;
        }

        // 如果正在初始化，返回现有的Promise
        if (this.initializePromise) {
            return this.initializePromise;
        }

        // 创建新的初始化Promise
        this.initializePromise = this.doInitialize();
        return this.initializePromise;
    }

    private async doInitialize(): Promise<void> {
        try {
            // 静默请求通知权限
            const hasPermission = await notificationPermissionManager.silentRequestPermission();
      
            if (!hasPermission) {
                console.warn("Notification permission not granted, notifications will be disabled");
                // 即使没有权限也标记为已初始化，这样其他功能不会受到影响
                this.isInitialized = true;
                this.initializeAttempts = 0;
                this.initializePromise = null;
                
                // 在首次拒绝时给出提示
                if (!this.hasShownPermissionWarning) {
                    this.hasShownPermissionWarning = true;
                    Toast.info("下载通知已关闭，下载仍可正常进行");
                }
                return;
            }

            // 创建通知渠道
            await notifee.createChannel({
                id: this.CHANNEL_ID,
                name: "下载进度",
                description: "音乐下载进度通知",
                importance: AndroidImportance.LOW, // 低重要性，避免过度打扰
                sound: undefined, // 不播放声音
                vibration: false,
            });

            // 监听通知交互事件
            notifee.onForegroundEvent(({ type, detail }) => {
                if (type === EventType.ACTION_PRESS && detail.pressAction?.id === "cancel") {
                    // 处理取消下载操作
                    const notificationId = detail.notification?.id;
                    if (notificationId) {
                        this.handleCancelDownload(notificationId);
                    }
                }
            });

            this.isInitialized = true;
            this.initializeAttempts = 0; // 重置尝试次数
            this.initializePromise = null;
            
            // 设置事件监听器
            this.setupEventListeners();
        } catch (error) {
            console.error("Failed to initialize download notification manager:", error);
            errorLog("Failed to initialize download notification manager", error);
            
            // 增加尝试次数
            this.initializeAttempts++;
            
            // 清空Promise以允许重试
            this.initializePromise = null;
            
            // 如果未超过最大尝试次数，抛出错误以便上层处理
            if (this.initializeAttempts < this.MAX_INIT_ATTEMPTS) {
                throw error;
            }
        }
    }
    
    /**
     * 尝试重新初始化
     */
    private async tryReinitialize(): Promise<boolean> {
        if (this.isInitialized) {
            return true;
        }
        
        if (this.initializeAttempts >= this.MAX_INIT_ATTEMPTS) {
            return false;
        }
        
        try {
            await this.initialize();
            return this.isInitialized;
        } catch (error) {
            console.error("Failed to reinitialize:", error);
            return false;
        }
    }
    
    /**
     * 设置事件监听器，监听下载任务更新
     */
    private setupEventListeners(): void {
        if (this.isEventListenerSetup) {
            return;
        }
        
        // 监听下载任务更新事件
        downloader.on(DownloaderEvent.DownloadTaskUpdate, this.handleDownloadTaskUpdate.bind(this));
        
        this.isEventListenerSetup = true;
        console.log("[通知管理器] 事件监听器已设置");
    }
    
    /**
     * 处理下载任务更新事件
     */
    private handleDownloadTaskUpdate(taskInfo: IDownloadTaskInfo): void {
        if (!taskInfo || !taskInfo.musicItem) {
            return;
        }
        
        const taskId = getMediaUniqueKey(taskInfo.musicItem);
        
        // 处理不同的下载状态
        switch (taskInfo.status) {
            case DownloadStatus.Downloading:
                if (taskInfo.downloadedSize !== undefined && taskInfo.fileSize !== undefined) {
                    // 开始下载或更新进度
                    if (taskInfo.downloadedSize === 0) {
                        // 开始下载
                        this.showDownloadNotification(taskId, taskInfo.musicItem).catch(error => {
                            errorLog("Failed to start notification from event", error);
                        });
                    } else if (taskInfo.fileSize > 0) {
                        // 更新进度
                        const progress = Math.round((taskInfo.downloadedSize / taskInfo.fileSize) * 100);
                        this.updateProgress(taskId, {
                            downloadedSize: taskInfo.downloadedSize,
                            fileSize: taskInfo.fileSize,
                            progress: progress,
                        }).catch(error => {
                            errorLog("Failed to update notification progress from event", error);
                        });
                    }
                }
                break;
                
            case DownloadStatus.Completed:
                this.showCompleted(taskId, taskInfo.musicItem, "").catch(error => {
                    errorLog("Failed to show completion notification from event", error);
                });
                break;
                
            case DownloadStatus.Error:
                if (taskInfo.errorReason) {
                    const errorMessage = this.getErrorMessage(taskInfo.errorReason);
                    this.showError(taskId, errorMessage).catch(error => {
                        errorLog("Failed to show error notification from event", error);
                    });
                }
                break;
        }
    }
    
    /** 获取错误信息的友好提示 */
    private getErrorMessage(reason: string): string {
        switch (reason) {
        case "NetworkOffline":
            return "网络连接已断开";
        case "NotAllowToDownloadInCellular":
            return "移动网络下禁止下载";
        case "FailToFetchSource":
            return "无法获取音乐源";
        case "NoWritePermission":
            return "没有存储写入权限";
        case "Unknown":
        default:
            return "下载失败";
        }
    }

    private async handleCancelDownload(notificationId: string): Promise<void> {
    // 查找对应的任务
        for (const [taskId, task] of this.activeTasks) {
            if (task.notificationId === notificationId) {
                this.activeTasks.delete(taskId);
                await notifee.cancelNotification(notificationId);
                // TODO: 可以在这里发送取消下载事件给下载器
                break;
            }
        }
    }

    private generateNotificationId(taskId: string): string {
        return `download_${taskId}`;
    }

    private formatSpeed(bytesPerSecond: number): string {
        return sizeFormatter(bytesPerSecond) + "/s";
    }

    private calculateSpeed(task: NotificationTask, currentDownloaded: number): number {
        const now = Date.now();
        const timeDiff = now - task.lastUpdateTime;
    
        if (timeDiff > 0) {
            const sizeDiff = currentDownloaded - task.lastDownloadedSize;
            return Math.round((sizeDiff / timeDiff) * 1000); // bytes/s
        }
    
        return 0;
    }

    async showDownloadNotification(taskId: string, musicItem: IMusic.IMusicItem): Promise<void> {
        if (Platform.OS !== "android") {
            return;
        }
        
        // 如果未初始化，尝试重新初始化
        if (!this.isInitialized) {
            const initialized = await this.tryReinitialize();
            if (!initialized) {
                console.warn("Notification manager not initialized, skipping notification");
                return;
            }
        }

        // 检查权限
        const hasPermission = await notificationPermissionManager.checkPermission();
        if (!hasPermission) {
            return;
        }

        const notificationId = this.generateNotificationId(taskId);
    
        // 只记录任务信息，不显示通知
        // 仅在实际开始下载时（updateProgress调用时）才显示通知
        this.activeTasks.set(taskId, {
            taskId,
            musicItem,
            notificationId,
            lastUpdateTime: Date.now(),
            lastDownloadedSize: 0,
        });
    }

    async updateProgress(taskId: string, progress: IDownloadNotification.DownloadProgress): Promise<void> {
        if (Platform.OS !== "android") {
            return;
        }
        
        // 如果未初始化，尝试重新初始化
        if (!this.isInitialized) {
            const initialized = await this.tryReinitialize();
            if (!initialized) {
                return;
            }
        }

        // 检查权限
        const hasPermission = await notificationPermissionManager.checkPermission();
        if (!hasPermission) {
            return;
        }

        const task = this.activeTasks.get(taskId);
        if (!task) {
            return;
        }

        const now = Date.now();
    
        // 检查是否为首次显示通知（刚开始下载）
        const isFirstDisplay = task.lastDownloadedSize === 0 && progress.downloadedSize > 0;
    
        // 限制更新频率，避免过度更新导致性能问题
        // 首次显示或进度变化较大时（>= 5%）立即更新
        const progressDiff = Math.abs(progress.progress - (task.lastDownloadedSize / progress.fileSize * 100));
        if (!isFirstDisplay && progressDiff < 5 && now - task.lastUpdateTime < this.UPDATE_THROTTLE) {
            return;
        }

        // 计算下载速度
        const speed = this.calculateSpeed(task, progress.downloadedSize);
    
        // 更新任务状态
        task.lastUpdateTime = now;
        task.lastDownloadedSize = progress.downloadedSize;

        const progressPercent = Math.round(progress.progress);
        const downloadedFormatted = sizeFormatter(progress.downloadedSize);
        const totalFormatted = sizeFormatter(progress.fileSize);
        const speedFormatted = speed > 0 ? this.formatSpeed(speed) : "";

        let bodyText = `${downloadedFormatted}/${totalFormatted}`;
        if (speedFormatted) {
            bodyText += ` (${speedFormatted})`;
        }

        // 根据进度显示不同的标题
        let title = `下载中 ${progressPercent}%`;
        if (isFirstDisplay) {
            title = `开始下载 ${progressPercent}%`;
        }

        try {
            await notifee.displayNotification({
                id: task.notificationId,
                title,
                body: `${task.musicItem.title} - ${task.musicItem.artist}\n${bodyText}`,
                android: {
                    channelId: this.CHANNEL_ID,
                    category: AndroidCategory.PROGRESS,
                    importance: AndroidImportance.LOW,
                    visibility: AndroidVisibility.PUBLIC,
                    ongoing: true,
                    autoCancel: false,
                    progress: {
                        max: 100,
                        current: progressPercent,
                        indeterminate: false,
                    },
                    actions: [
                        {
                            title: "取消",
                            pressAction: {
                                id: "cancel",
                            },
                        },
                    ],
                    color: AndroidColor.BLUE,
                    smallIcon: "ic_launcher",
                    largeIcon: task.musicItem.artwork,
                    style: {
                        type: AndroidStyle.BIGTEXT,
                        text: bodyText,
                    },
                },
            });
        } catch (error) {
            console.error("Failed to update download progress:", error);
        }
    }

    async showCompleted(taskId: string, musicItem: IMusic.IMusicItem, _filePath: string): Promise<void> {
        if (Platform.OS !== "android") {
            return;
        }
        
        // 如果未初始化，尝试重新初始化
        if (!this.isInitialized) {
            const initialized = await this.tryReinitialize();
            if (!initialized) {
                return;
            }
        }

        // 检查权限
        const hasPermission = await notificationPermissionManager.checkPermission();
        if (!hasPermission) {
            return;
        }

        const task = this.activeTasks.get(taskId);
        if (!task) {
            return;
        }

        try {
            await notifee.displayNotification({
                id: task.notificationId,
                title: "下载完成",
                body: `${musicItem.title} - ${musicItem.artist}`,
                android: {
                    channelId: this.CHANNEL_ID,
                    category: AndroidCategory.STATUS,
                    importance: AndroidImportance.DEFAULT,
                    visibility: AndroidVisibility.PUBLIC,
                    ongoing: false,
                    autoCancel: true,
                    color: AndroidColor.GREEN,
                    smallIcon: "ic_launcher",
                    largeIcon: musicItem.artwork,
                    actions: [
                        {
                            title: "打开文件",
                            pressAction: {
                                id: "open",
                                // TODO: 可以实现点击打开文件的功能
                            },
                        },
                    ],
                },
            });

            // 清理任务记录
            this.activeTasks.delete(taskId);
        } catch (error) {
            console.error("Failed to show completion notification:", error);
        }
    }

    async showError(taskId: string, error: string): Promise<void> {
        if (Platform.OS !== "android") {
            return;
        }
        
        // 如果未初始化，尝试重新初始化
        if (!this.isInitialized) {
            const initialized = await this.tryReinitialize();
            if (!initialized) {
                return;
            }
        }

        // 检查权限
        const hasPermission = await notificationPermissionManager.checkPermission();
        if (!hasPermission) {
            return;
        }

        const task = this.activeTasks.get(taskId);
        if (!task) {
            return;
        }

        try {
            await notifee.displayNotification({
                id: task.notificationId,
                title: "下载失败",
                body: `${task.musicItem.title} - ${task.musicItem.artist}\n${error}`,
                android: {
                    channelId: this.CHANNEL_ID,
                    category: AndroidCategory.ERROR,
                    importance: AndroidImportance.DEFAULT,
                    visibility: AndroidVisibility.PUBLIC,
                    ongoing: false,
                    autoCancel: true,
                    color: AndroidColor.RED,
                    smallIcon: "ic_launcher",
                    largeIcon: task.musicItem.artwork,
                    style: {
                        type: AndroidStyle.BIGTEXT,
                        text: error,
                    },
                },
            });

            // 清理任务记录
            this.activeTasks.delete(taskId);
        } catch (notificationError) {
            console.error("Failed to show error notification:", notificationError);
        }
    }

    async cancelNotification(taskId: string): Promise<void> {
        if (Platform.OS !== "android" || !this.isInitialized) {
            return;
        }

        const task = this.activeTasks.get(taskId);
        if (!task) {
            return;
        }

        try {
            await notifee.cancelNotification(task.notificationId);
            this.activeTasks.delete(taskId);
        } catch (error) {
            console.error("Failed to cancel notification:", error);
        }
    }

    /** 清理所有下载通知 */
    async clearAllNotifications(): Promise<void> {
        if (Platform.OS !== "android" || !this.isInitialized) {
            return;
        }

        try {
            // 取消所有下载相关的通知
            for (const task of this.activeTasks.values()) {
                await notifee.cancelNotification(task.notificationId);
            }
            this.activeTasks.clear();
        } catch (error) {
            console.error("Failed to clear all notifications:", error);
        }
    }

    /** 获取当前活跃的下载通知数量 */
    getActiveTaskCount(): number {
        return this.activeTasks.size;
    }

    /** 请求通知权限（显式请求，带用户提示） */
    async requestNotificationPermission(): Promise<boolean> {
        if (Platform.OS !== "android") {
            return true;
        }

        return await notificationPermissionManager.requestPermission(true);
    }

    /** 检查通知权限状态 */
    async checkNotificationPermission(): Promise<boolean> {
        if (Platform.OS !== "android") {
            return true;
        }

        return await notificationPermissionManager.checkPermission();
    }

    /** 获取权限状态描述 */
    async getPermissionStatusDescription(): Promise<string> {
        return await notificationPermissionManager.getPermissionStatusDescription();
    }
}

// 单例模式
const downloadNotificationManager = new DownloadNotificationManager();
export default downloadNotificationManager;