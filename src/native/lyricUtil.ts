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
  { name: '默认透明', unsungColor: '#E0E0E0FF', sungColor: '#FFFFFFFF', backgroundColor: '#00000000' },
  { name: '纯暗',     unsungColor: '#FFFFFF80', sungColor: '#FFFFFFFF', backgroundColor: '#00000099' },
  { name: '纯亮',     unsungColor: '#00000080', sungColor: '#000000FF', backgroundColor: '#FFFFFF99' },
  { name: '护眼绿',   unsungColor: '#A5D6A7FF', sungColor: '#4CAF50FF', backgroundColor: '#000000CC' },
  { name: '卡拉OK金', unsungColor: '#FFE082FF', sungColor: '#FFD54FFF', backgroundColor: '#00000000' },
  { name: '赛博蓝',   unsungColor: '#80DEAEFF', sungColor: '#00BCD4FF', backgroundColor: '#001020CC' },
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
    type: 'translation' | 'romanization';
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
    event: 'LyricUtil:onLockStateChanged' | 'LyricUtil:onPresetChanged' | 'LyricUtil:onFontSizeChanged' | 'LyricUtil:onPositionChanged' | 'LyricUtil:onClose',
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
