import { NativeModules } from 'react-native';

/**
 * 文本对齐方式枚举
 */
export enum NativeTextAlignment {
  // 左对齐
  LEFT = 3,
  // 右对齐
  RIGHT = 5,
  // 居中
  CENTER = 17,
}

// 获取原生LyricUtil模块
const { LyricUtil: NativeLyricUtil } = NativeModules;

/**
 * LyricUtil工具类
 * 提供歌词解密和桌面歌词显示功能
 */
class LyricUtilManager {
  private nativeModule = NativeLyricUtil;

  /**
   * 检查系统悬浮窗权限
   */
  async checkSystemAlertPermission(): Promise<boolean> {
    return this.nativeModule.checkSystemAlertPermission();
  }

  /**
   * 请求系统悬浮窗权限
   */
  async requestSystemAlertPermission(): Promise<boolean> {
    return this.nativeModule.requestSystemAlertPermission();
  }

  /**
   * 显示桌面歌词
   */
  async showStatusBarLyric(
    initLyric?: string | null,
    options?: {
      topPercent?: number;
      leftPercent?: number;
      align?: number;
      color?: string;
      backgroundColor?: string;
      widthPercent?: number;
      fontSize?: number;
    }
  ): Promise<boolean> {
    return this.nativeModule.showStatusBarLyric(initLyric || null, options || null);
  }

  /**
   * 隐藏桌面歌词
   */
  async hideStatusBarLyric(): Promise<boolean> {
    return this.nativeModule.hideStatusBarLyric();
  }

  /**
   * 设置桌面歌词文本
   */
  async setStatusBarLyricText(lyric: string): Promise<boolean> {
    return this.nativeModule.setStatusBarLyricText(lyric);
  }

  /**
   * 设置桌面歌词对齐方式
   */
  async setStatusBarLyricAlign(alignment: number): Promise<boolean> {
    return this.nativeModule.setStatusBarLyricAlign(alignment);
  }

  /**
   * 设置桌面歌词顶部位置
   */
  async setStatusBarLyricTop(pct: number): Promise<boolean> {
    return this.nativeModule.setStatusBarLyricTop(pct);
  }

  /**
   * 设置桌面歌词左侧位置
   */
  async setStatusBarLyricLeft(pct: number): Promise<boolean> {
    return this.nativeModule.setStatusBarLyricLeft(pct);
  }

  /**
   * 设置桌面歌词宽度
   */
  async setStatusBarLyricWidth(pct: number): Promise<boolean> {
    return this.nativeModule.setStatusBarLyricWidth(pct);
  }

  /**
   * 设置桌面歌词字体大小
   */
  async setStatusBarLyricFontSize(fontSize: number): Promise<boolean> {
    return this.nativeModule.setStatusBarLyricFontSize(fontSize);
  }

  /**
   * 设置桌面歌词颜色
   */
  async setStatusBarColors(textColor?: string | null, backgroundColor?: string | null): Promise<boolean> {
    return this.nativeModule.setStatusBarColors(textColor || null, backgroundColor || null);
  }

  /**
   * 解密酷我音乐歌词
   * @param lrcBase64 - Base64编码的加密歌词数据
   * @param isGetLyricx - 是否获取逐字歌词（需要额外XOR解密）
   * @returns 解密后的歌词文本
   */
  async decryptKuwoLyric(lrcBase64: string, isGetLyricx: boolean = true): Promise<string> {
    if (!this.nativeModule?.decryptKuwoLyric) {
      throw new Error('decryptKuwoLyric not available in native module');
    }
    return this.nativeModule.decryptKuwoLyric(lrcBase64, isGetLyricx);
  }

  /**
   * 解密QQ音乐QRC歌词
   * @param encryptedHex - 十六进制编码的加密歌词数据
   * @returns 解密后的歌词文本
   */
  async decryptQRCLyric(encryptedHex: string): Promise<string> {
    if (!this.nativeModule?.decryptQRCLyric) {
      throw new Error('decryptQRCLyric not available in native module');
    }
    return this.nativeModule.decryptQRCLyric(encryptedHex);
  }

  /**
   * 解密酷我音乐歌词
   * @param lrcBase64 - Base64编码的加密歌词数据
   * @param isGetLyricx - 是否获取逐字歌词（需要额外XOR解密）
   * @returns 解密后的歌词文本
   */
  async decryptKuwoLyric(lrcBase64: string, isGetLyricx: boolean = true): Promise<string> {
    if (!this.nativeModule?.decryptKuwoLyric) {
      throw new Error('decryptKuwoLyric not available in native module');
    }
    return this.nativeModule.decryptKuwoLyric(lrcBase64, isGetLyricx);
  }

  /**
   * 解密QQ音乐QRC歌词
   * @param encryptedHex - 十六进制编码的加密歌词数据
   * @returns 解密后的歌词文本
   */
  async decryptQRCLyric(encryptedHex: string): Promise<string> {
    if (!this.nativeModule?.decryptQRCLyric) {
      throw new Error('decryptQRCLyric not available in native module');
    }
    return this.nativeModule.decryptQRCLyric(encryptedHex);
  }

  /**
   * 检查原生模块是否可用
   */
  isAvailable(): boolean {
    return !!this.nativeModule;
  }
}

// 导出单例实例
export const LyricUtil = new LyricUtilManager();
export default LyricUtil;
