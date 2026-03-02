import { NativeEventEmitter, NativeModules } from 'react-native';

/**
 * 文本对齐方式枚举
 */
export enum NativeTextAlignment {
  LEFT = 3,
  RIGHT = 5,
  CENTER = 17,
}

/** 桌面歌词预设颜色方案 */
export interface ILyricColorPreset {
  name: string;
  unsungColor: string;
  sungColor: string;
  backgroundColor: string;
}

export const LYRIC_COLOR_PRESETS: ILyricColorPreset[] = [
  { name: '烈焰红',   unsungColor: '#FFFFFFB3', sungColor: '#FF2D55FF', backgroundColor: '#00000000' },
  { name: '海洋蓝',   unsungColor: '#E6E6E6CC', sungColor: '#2979FFFF', backgroundColor: '#00000099' },
  { name: '翡翠绿',   unsungColor: '#F2F2F2B3', sungColor: '#00C853FF', backgroundColor: '#001A1A99' },
  { name: '落日橙',   unsungColor: '#FFFFFF99', sungColor: '#FF6D00FF', backgroundColor: '#00000066' },
  { name: '幻紫',     unsungColor: '#E0E0E0CC', sungColor: '#AA00FFFF', backgroundColor: '#12001899' },
  { name: '琥珀金',   unsungColor: '#D9D9D9CC', sungColor: '#FFD600FF', backgroundColor: '#00000099' },
];

/** 桌面逐字歌词行数据 */
export interface IDesktopLyricLineData {
  lineId: string;
  primaryText: string;
  primaryWords?: Array<{
    text: string;
    startTime: number;
    duration: number;
    space?: boolean;
  }> | null;
  secondaryLines?: Array<{
    type: 'translation' | 'romanization' | 'original';
    text: string;
  }>;
  lineStartMs: number;
  lineDurationMs?: number | null;
}

/** 播放状态同步数据 */
export interface IPlaybackSyncData {
  status: 'playing' | 'paused' | 'stopped';
  positionMs: number;
  speed?: number;
  isSeek?: boolean;
}

const { LyricUtil: NativeLyricUtil } = NativeModules;

class LyricUtilManager {
  private nativeModule = NativeLyricUtil;
  private emitter = NativeLyricUtil ? new NativeEventEmitter(NativeLyricUtil) : null;

  async checkSystemAlertPermission(): Promise<boolean> {
    return this.nativeModule.checkSystemAlertPermission();
  }

  async requestSystemAlertPermission(): Promise<boolean> {
    return this.nativeModule.requestSystemAlertPermission();
  }

  async showStatusBarLyric(
    initLyric?: string | null,
    options?: {
      topPercent?: number;
      leftPercent?: number;
      align?: number;
      color?: string;
      backgroundColor?: string;
      sungColor?: string;
      widthPercent?: number;
      fontSize?: number;
      presetIndex?: number;
      presets?: ILyricColorPreset[];
      secondaryFontRatio?: number;
      secondaryAlphaRatio?: number;
    }
  ): Promise<boolean> {
    return this.nativeModule.showStatusBarLyric(initLyric || null, options || null);
  }

  async hideStatusBarLyric(): Promise<boolean> {
    return this.nativeModule.hideStatusBarLyric();
  }

  async setStatusBarLyricText(lyric: string): Promise<boolean> {
    return this.nativeModule.setStatusBarLyricText(lyric);
  }

  async setDesktopLyricLine(data: IDesktopLyricLineData): Promise<boolean> {
    return this.nativeModule.setDesktopLyricLine(data);
  }

  async syncPlaybackState(state: IPlaybackSyncData): Promise<boolean> {
    return this.nativeModule.syncPlaybackState(state);
  }

  async setSungColor(color: string): Promise<boolean> {
    return this.nativeModule.setSungColor(color);
  }

  async setStatusBarLyricAlign(alignment: number): Promise<boolean> {
    return this.nativeModule.setStatusBarLyricAlign(alignment);
  }

  async setStatusBarLyricTop(pct: number): Promise<boolean> {
    return this.nativeModule.setStatusBarLyricTop(pct);
  }

  async setStatusBarLyricLeft(pct: number): Promise<boolean> {
    return this.nativeModule.setStatusBarLyricLeft(pct);
  }

  async setStatusBarLyricWidth(pct: number): Promise<boolean> {
    return this.nativeModule.setStatusBarLyricWidth(pct);
  }

  async setStatusBarLyricFontSize(fontSize: number): Promise<boolean> {
    return this.nativeModule.setStatusBarLyricFontSize(fontSize);
  }

  async setSecondaryFontRatio(ratio: number): Promise<boolean> {
    return this.nativeModule.setSecondaryFontRatio(ratio);
  }

  async setSecondaryAlphaRatio(ratio: number): Promise<boolean> {
    return this.nativeModule.setSecondaryAlphaRatio(ratio);
  }

  async setStatusBarColors(textColor?: string | null, backgroundColor?: string | null): Promise<boolean> {
    return this.nativeModule.setStatusBarColors(textColor || null, backgroundColor || null);
  }

  /** 锁定桌面歌词（触摸穿透） */
  async lockDesktopLyric(): Promise<boolean> {
    return this.nativeModule.lockDesktopLyric();
  }

  /** 解锁桌面歌词（可拖拽/点击） */
  async unlockDesktopLyric(): Promise<boolean> {
    return this.nativeModule.unlockDesktopLyric();
  }

  /** 切换预设颜色方案 */
  async setColorPreset(index: number): Promise<boolean> {
    return this.nativeModule.setColorPreset(index);
  }

  /** 监听原生事件（锁定状态/预设/字号/位置变化） */
  addListener(
    event: 'LyricUtil:onLockStateChanged' | 'LyricUtil:onPresetChanged' | 'LyricUtil:onFontSizeChanged' | 'LyricUtil:onPositionChanged' | 'LyricUtil:onClose' | 'LyricUtil:onPresetLongPress',
    handler: (payload: any) => void,
  ): { remove: () => void } {
    const sub = this.emitter?.addListener(event, handler);
    return sub ?? { remove: () => {} };
  }

  async decryptKuwoLyric(lrcBase64: string, isGetLyricx: boolean = true): Promise<string> {
    if (!this.nativeModule?.decryptKuwoLyric) {
      throw new Error('decryptKuwoLyric not available in native module');
    }
    return this.nativeModule.decryptKuwoLyric(lrcBase64, isGetLyricx);
  }

  async decryptQRCLyric(encryptedHex: string): Promise<string> {
    if (!this.nativeModule?.decryptQRCLyric) {
      throw new Error('decryptQRCLyric not available in native module');
    }
    return this.nativeModule.decryptQRCLyric(encryptedHex);
  }

  isAvailable(): boolean {
    return !!this.nativeModule;
  }
}

export const LyricUtil = new LyricUtilManager();
export default LyricUtil;
