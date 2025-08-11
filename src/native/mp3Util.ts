import { NativeModules, NativeEventEmitter } from 'react-native';
import { devLog } from '@/utils/log';
import type { IMp3Util } from '@/types/metadata';

// 获取原生Mp3Util模块
const { Mp3Util: NativeMp3Util } = NativeModules;

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
}

// 导出单例实例
export const Mp3Util = new Mp3UtilManager();
export default Mp3Util;