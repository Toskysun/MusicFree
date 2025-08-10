declare namespace IDownloadNotification {
  interface DownloadProgress {
    /** 已下载字节数 */
    downloadedSize: number;
    /** 文件总大小 */
    fileSize: number;
    /** 下载进度 (0-100) */
    progress: number;
    /** 下载速度 (bytes/s) */
    speed?: number;
  }

  interface IDownloadNotificationManager {
    /** 显示下载开始通知 */
    showDownloadNotification(taskId: string, musicItem: IMusic.IMusicItem): Promise<void>;
    
    /** 更新下载进度 */
    updateProgress(taskId: string, progress: DownloadProgress): Promise<void>;
    
    /** 显示下载完成通知 */
    showCompleted(taskId: string, musicItem: IMusic.IMusicItem, filePath: string): Promise<void>;
    
    /** 显示下载错误通知 */
    showError(taskId: string, error: string): Promise<void>;
    
    /** 取消通知 */
    cancelNotification(taskId: string): Promise<void>;
    
    /** 初始化通知管理器 */
    initialize(): Promise<void>;
  }

  interface NotificationTask {
    taskId: string;
    musicItem: IMusic.IMusicItem;
    notificationId: string;
    lastUpdateTime: number;
    lastDownloadedSize: number;
  }
}