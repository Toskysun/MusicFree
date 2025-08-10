import { NativeModules } from 'react-native';
import type { IMp3Util } from '@/types/metadata';

// 获取原生Mp3Util模块
const { Mp3Util: NativeMp3Util } = NativeModules;

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
    return this.nativeModule.setMediaTag(filePath, meta);
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
    return this.nativeModule.setMediaTagWithCover(filePath, meta, coverPath || null);
  }

  /**
   * 检查原生模块是否可用
   */
  isAvailable(): boolean {
    return !!this.nativeModule;
  }
}

// 导出单例实例
export const Mp3Util = new Mp3UtilManager();
export default Mp3Util;