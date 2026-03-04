import { NativeModules, NativeEventEmitter } from 'react-native';
import { devLog } from '@/utils/log';
import type { IMp3Util } from '@/types/metadata';

// Phase 2: 批量进度事件类型定义
export interface IMp3UtilProgressItem {
  id: string;
  downloaded: number;
  total: number;
  percent: number;
  progressText: string;
}

export interface IMp3UtilDownloadProgressBatch {
  items: IMp3UtilProgressItem[];
}

export interface INativeDownloadTaskStatus {
  taskId: string;
  status: "PENDING" | "PREPARING" | "DOWNLOADING" | "PAUSED" | "COMPLETED" | "CANCELED" | "ERROR";
  downloaded: number;
  total: number;
  progressText?: string;
  error?: string | null;
  url?: string;
  destinationPath?: string;
  title?: string;
  description?: string;
  coverUrl?: string | null;
  extraJson?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface INativeDownloadTaskParams {
  taskId: string;
  url: string;
  destinationPath: string;
  headers?: Record<string, string>;
  title?: string;
  description?: string;
  coverUrl?: string | null;
  extraJson?: string | null;
}

export interface INativeDownloadProgressItem {
  taskId: string;
  downloaded: number;
  total: number;
  percent: number;
  progressText: string;
}

// 获取原生Mp3Util模块
const { Mp3Util: NativeMp3Util } = NativeModules;
const { NativeDownload: NativeDownloadModule } = NativeModules;
export const Mp3UtilEmitter = new NativeEventEmitter(NativeMp3Util);
export const NativeDownloadEmitter = NativeDownloadModule
  ? new NativeEventEmitter(NativeDownloadModule)
  : null;

// 监听原生日志输出并转发到devLog系统
if (NativeMp3Util && __DEV__) {
  // 监听adb logcat输出，将Mp3UtilModule的日志转发到devLog
  const originalConsoleLog = console.log;
  console.log = (...args) => {
    const message = args.join(' ');
    // 检查是否是Mp3UtilModule的日志
    if (message.includes('Mp3UtilModule')) {
      // 解析日志级别和内容
      if (message.includes('🎵[FLAC封面]')) {
        devLog('info', message);
      } else if (message.includes('Failed') || message.includes('Error')) {
        devLog('error', message);
      } else if (message.includes('Successfully')) {
        devLog('info', message);
      } else {
        devLog('info', message);
      }
    }
    // 调用原始console.log
    originalConsoleLog.apply(console, args);
  };
}

/**
 * Mp3Util工具类
 * 提供音乐文件元数据读写功能
 */
class Mp3UtilManager implements IMp3Util {
  private nativeModule = NativeMp3Util;
  private nativeDownloadModule = NativeDownloadModule;

  async getBasicMeta(filePath: string) {
    return this.nativeModule.getBasicMeta(filePath);
  }

  async getMediaMeta(filePaths: string[]) {
    return this.nativeModule.getMediaMeta(filePaths);
  }

  async getMediaCoverImg(filePath: string) {
    return this.nativeModule.getMediaCoverImg(filePath);
  }

  async getLyric(filePath: string) {
    return this.nativeModule.getLyric(filePath);
  }

  async setMediaTag(filePath: string, meta: import('@/types/metadata').IMusicMetadata) {
    devLog('info', '🔧[Mp3Util] 调用 setMediaTag', {
      filePath,
      metadataKeys: Object.keys(meta)
    });
    try {
      const result = await this.nativeModule.setMediaTag(filePath, meta);
      devLog('info', '✅[Mp3Util] setMediaTag 成功', result);
      return result;
    } catch (error) {
      devLog('error', '❌[Mp3Util] setMediaTag 失败', error);
      throw error;
    }
  }

  async getMediaTag(filePath: string) {
    return this.nativeModule.getMediaTag(filePath);
  }

  async setMediaCover(filePath: string, coverPath: string) {
    return this.nativeModule.setMediaCover(filePath, coverPath);
  }

  async setMediaTagWithCover(
    filePath: string, 
    meta: import('@/types/metadata').IMusicMetadata, 
    coverPath?: string
  ) {
    devLog('info', '🎨[Mp3Util] 调用 setMediaTagWithCover', {
      filePath,
      metadataKeys: Object.keys(meta),
      coverPath
    });
    try {
      const result = await this.nativeModule.setMediaTagWithCover(filePath, meta, coverPath || null);
      devLog('info', '✅[Mp3Util] setMediaTagWithCover 成功', result);
      return result;
    } catch (error) {
      devLog('error', '❌[Mp3Util] setMediaTagWithCover 失败', error);
      throw error;
    }
  }

  /**
   * 检查原生模块是否可用
   */
  isAvailable(): boolean {
    const available = !!this.nativeModule;
    devLog('info', '🔍[Mp3Util] 原生模块可用性检查', {
      nativeModuleExists: !!this.nativeModule,
      moduleKeys: this.nativeModule ? Object.keys(this.nativeModule) : [],
      available
    });
    return available;
  }

  /**
   * 使用系统下载管理器下载文件
   */
  async downloadWithSystemManager(
    url: string,
    destinationPath: string,
    title: string,
    description: string,
    headers?: Record<string, string>
  ): Promise<string> {
    devLog('info', '📥[Mp3Util] 调用系统下载管理器', {
      url,
      destinationPath,
      title,
      headers
    });

    try {
      const downloadId = await this.nativeModule.downloadWithSystemManager(
        url,
        destinationPath,
        title,
        description,
        headers || null
      );
      devLog('info', '✅[Mp3Util] 系统下载任务创建成功', { downloadId });
      return downloadId;
    } catch (error) {
      devLog('error', '❌[Mp3Util] 系统下载任务创建失败', error);
      throw error;
    }
  }

  /**
   * 使用内置HTTP下载器下载文件，并显示原生通知（可选）
   */
  async downloadWithHttp(options: {
    url: string;
    destinationPath: string;
    title: string;
    description: string;
    headers?: Record<string, string> | null;
    showNotification?: boolean;
    coverUrl?: string | null;
  }): Promise<string> {
    devLog('info', '📥[Mp3Util] 调用内置HTTP下载器', {
      url: options?.url,
      destinationPath: options?.destinationPath,
      title: options?.title,
      showNotification: options?.showNotification,
    });
    if (!this.nativeModule?.downloadWithHttp) {
      throw new Error('downloadWithHttp not available');
    }
    try {
      const id = await this.nativeModule.downloadWithHttp({
        url: options.url,
        destinationPath: options.destinationPath,
        title: options.title,
        description: options.description,
        headers: options.headers ?? null,
        showNotification: options.showNotification ?? true,
        coverUrl: options.coverUrl ?? null,
      });
      devLog('info', '✅[Mp3Util] 内置HTTP下载任务完成', { id });
      return id;
    } catch (error) {
      devLog('error', '❌[Mp3Util] 内置HTTP下载任务失败', error);
      throw error;
    }
  }

  /**
   * Decrypt an encrypted .mflac file to .flac using native decoder.
   */
  async decryptMflacToFlac(inputPath: string, outputPath: string, ekey: string): Promise<boolean> {
    if (!this.nativeModule?.decryptMflacToFlac) {
      throw new Error('decryptMflacToFlac not available');
    }
    return this.nativeModule.decryptMflacToFlac(inputPath, outputPath, ekey);
  }

  async cancelHttpDownload(id: string): Promise<boolean> {
    if (!this.nativeModule?.cancelHttpDownload) return false;
    return this.nativeModule.cancelHttpDownload(id);
  }

  async cancelSystemDownload(id: string): Promise<boolean> {
    if (!this.nativeModule?.cancelSystemDownload) return false;
    return this.nativeModule.cancelSystemDownload(id);
  }

  /**
   * Start local mflac proxy server (idempotent). Returns base URL.
   */
  async startMflacProxy(): Promise<string> {
    if (!this.nativeModule?.startMflacProxy) {
      throw new Error('startMflacProxy not available');
    }
    return this.nativeModule.startMflacProxy();
  }

  /**
   * Register a streaming session and return local URL.
   */
  async registerMflacStream(src: string, ekey: string, headers?: Record<string, string> | null): Promise<string> {
    if (!this.nativeModule?.registerMflacStream) {
      throw new Error('registerMflacStream not available');
    }
    return this.nativeModule.registerMflacStream(src, ekey, headers ?? null);
  }

  async addDownloadTask(params: INativeDownloadTaskParams): Promise<boolean> {
    if (!this.nativeDownloadModule?.addDownloadTask) {
      throw new Error("NativeDownload.addDownloadTask not available");
    }
    return this.nativeDownloadModule.addDownloadTask({
      taskId: params.taskId,
      url: params.url,
      destinationPath: params.destinationPath,
      headers: params.headers ?? {},
      title: params.title ?? "MusicFree",
      description: params.description ?? "正在下载音乐文件...",
      coverUrl: params.coverUrl ?? null,
      extraJson: params.extraJson ?? null,
    });
  }

  async pauseDownloadTask(taskId: string): Promise<boolean> {
    if (!this.nativeDownloadModule?.pauseDownloadTask) {
      return false;
    }
    return this.nativeDownloadModule.pauseDownloadTask(taskId);
  }

  async resumeDownloadTask(taskId: string): Promise<boolean> {
    if (!this.nativeDownloadModule?.resumeDownloadTask) {
      return false;
    }
    return this.nativeDownloadModule.resumeDownloadTask(taskId);
  }

  async cancelDownloadTask(taskId: string): Promise<boolean> {
    if (!this.nativeDownloadModule?.cancelDownloadTask) {
      return false;
    }
    return this.nativeDownloadModule.cancelDownloadTask(taskId);
  }

  async removeDownloadTask(taskId: string): Promise<boolean> {
    if (!this.nativeDownloadModule?.removeDownloadTask) {
      return false;
    }
    return this.nativeDownloadModule.removeDownloadTask(taskId);
  }

  async getDownloadTaskStatus(taskId: string): Promise<INativeDownloadTaskStatus | null> {
    if (!this.nativeDownloadModule?.getDownloadTaskStatus) {
      return null;
    }
    return this.nativeDownloadModule.getDownloadTaskStatus(taskId);
  }

  async getAllDownloadTasks(): Promise<INativeDownloadTaskStatus[]> {
    if (!this.nativeDownloadModule?.getAllDownloadTasks) {
      return [];
    }
    return this.nativeDownloadModule.getAllDownloadTasks();
  }

  async setDownloadMaxConcurrency(max: number): Promise<boolean> {
    if (!this.nativeDownloadModule?.setDownloadMaxConcurrency) {
      return false;
    }
    return this.nativeDownloadModule.setDownloadMaxConcurrency(max);
  }
}

// 导出单例实例
export const Mp3Util = new Mp3UtilManager();
export default Mp3Util;
