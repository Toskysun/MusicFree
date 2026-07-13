import Config from "@/core/appConfig";
import Toast from "@/utils/toast";
import { NativeModule, NativeModules, Platform } from "react-native";
import { errorLog } from "@/utils/log.ts";

export enum NativeTextAlignment {
    // 左对齐
    LEFT = 3,
    // 右对齐
    RIGHT = 5,
    // 居中
    CENTER = 17,
}

// 状态栏歌词的工具
interface ILyricUtil extends NativeModule {
    /** 显示状态栏歌词 */
    showStatusBarLyric: (
        initLyric?: string,
        config?: Record<string, any>,
    ) => Promise<void>;
    /** 隐藏状态栏歌词 */
    hideStatusBarLyric: () => Promise<void>;
    /** 设置歌词文本 */
    setStatusBarLyricText: (lyric: string) => Promise<void>;
    /** 设置距离顶部的距离 */
    setStatusBarLyricTop: (percent: number) => Promise<void>;
    /** 设置距离左部的距离（内部使用，保存拖拽位置） */
    setStatusBarLyricLeft: (percent: number) => Promise<void>;
    /** 设置宽度 */
    setStatusBarLyricWidth: (percent: number) => Promise<void>;
    /** 设置字体 */
    setStatusBarLyricFontSize: (fontSize: number) => Promise<void>;
    /** 设置对齐 */
    setStatusBarLyricAlign: (alignment: NativeTextAlignment) => Promise<void>;
    /** 设置颜色 */
    setStatusBarColors: (
        textColor: string | null,
        backgroundColor: string | null,
    ) => Promise<void>;
    /** 检查权限 */
    checkSystemAlertPermission: () => Promise<boolean>;
    /** 请求悬浮窗 */
    requestSystemAlertPermission: () => Promise<boolean>;
    /**
     * 解密QRC加密歌词（Native实现）
     * 使用Triple-DES + Zlib解压算法
     * @param encryptedHex - QRC加密的十六进制字符串
     * @returns 解密后的原始文本（可能是XML格式）
     */
    decryptQRCLyric: (encryptedHex: string) => Promise<string>;
    lockDesktopLyric?: () => Promise<void>;
    unlockDesktopLyric?: () => Promise<void>;
    syncPlaybackState?: (state: Record<string, any>) => Promise<void>;
    setDesktopLyricLine?: (payload: Record<string, any>) => Promise<void>;
    setSungColor?: (color: string) => Promise<void>;
    setColorPreset?: (index: number) => Promise<void>;
    setSecondaryFontRatio?: (ratio: number) => Promise<void>;
    addListener?: (event: string, handler: (payload: any) => void) => { remove: () => void };
}

const rawLyricUtil = NativeModules.LyricUtil as ILyricUtil | undefined;

const iosDesktopNoop = async () => {};

const wrapDesktopCall = <T extends (...args: any[]) => Promise<any>>(
    fn: T | undefined,
    androidOnly = false,
): T => {
    const wrapped = (async (...args: any[]) => {
        if (Platform.OS === "ios" && androidOnly) {
            return;
        }
        if (typeof fn !== "function") {
            return;
        }
        try {
            return await fn(...args);
        } catch (e) {
            // Soft-fail desktop lyric APIs; never crash the JS runtime.
            errorLog("LyricUtil call failed", e);
        }
    }) as T;
    return wrapped;
};

const LyricUtil = (rawLyricUtil ?? ({} as ILyricUtil)) as ILyricUtil;

const originalShowStatusBarLyric = rawLyricUtil?.showStatusBarLyric?.bind(rawLyricUtil);

const showStatusBarLyric: ILyricUtil["showStatusBarLyric"] = async (
    initLyric,
    config,
) => {
    // iOS has no floating/desktop lyric window.
    if (Platform.OS === "ios") {
        return;
    }
    if (!originalShowStatusBarLyric) {
        return;
    }
    try {
        await originalShowStatusBarLyric(initLyric, config);
    } catch (e) {
        errorLog("状态栏歌词开启失败", e);
        Toast.warn("状态栏歌词开启失败，请到手机系统设置打开悬浮窗权限");
        Config.setConfig("lyric.showStatusBarLyric", false);
    }
};

LyricUtil.showStatusBarLyric = showStatusBarLyric;
LyricUtil.hideStatusBarLyric = wrapDesktopCall(
    rawLyricUtil?.hideStatusBarLyric?.bind(rawLyricUtil),
);
LyricUtil.setStatusBarLyricText = wrapDesktopCall(
    rawLyricUtil?.setStatusBarLyricText?.bind(rawLyricUtil),
);
LyricUtil.setStatusBarLyricTop = wrapDesktopCall(
    rawLyricUtil?.setStatusBarLyricTop?.bind(rawLyricUtil),
);
LyricUtil.setStatusBarLyricLeft = wrapDesktopCall(
    rawLyricUtil?.setStatusBarLyricLeft?.bind(rawLyricUtil),
);
LyricUtil.setStatusBarLyricWidth = wrapDesktopCall(
    rawLyricUtil?.setStatusBarLyricWidth?.bind(rawLyricUtil),
);
LyricUtil.setStatusBarLyricFontSize = wrapDesktopCall(
    rawLyricUtil?.setStatusBarLyricFontSize?.bind(rawLyricUtil),
);
LyricUtil.setStatusBarLyricAlign = wrapDesktopCall(
    rawLyricUtil?.setStatusBarLyricAlign?.bind(rawLyricUtil),
);
LyricUtil.setStatusBarColors = wrapDesktopCall(
    rawLyricUtil?.setStatusBarColors?.bind(rawLyricUtil),
);
LyricUtil.lockDesktopLyric = wrapDesktopCall(
    rawLyricUtil?.lockDesktopLyric?.bind(rawLyricUtil) ?? iosDesktopNoop,
);
LyricUtil.unlockDesktopLyric = wrapDesktopCall(
    rawLyricUtil?.unlockDesktopLyric?.bind(rawLyricUtil) ?? iosDesktopNoop,
);
LyricUtil.syncPlaybackState = wrapDesktopCall(
    rawLyricUtil?.syncPlaybackState?.bind(rawLyricUtil) ?? iosDesktopNoop,
);
LyricUtil.setDesktopLyricLine = wrapDesktopCall(
    rawLyricUtil?.setDesktopLyricLine?.bind(rawLyricUtil) ?? iosDesktopNoop,
);
LyricUtil.checkSystemAlertPermission =
    rawLyricUtil?.checkSystemAlertPermission?.bind(rawLyricUtil) ??
    (async () => Platform.OS === "android");
LyricUtil.requestSystemAlertPermission =
    rawLyricUtil?.requestSystemAlertPermission?.bind(rawLyricUtil) ??
    (async () => false);
LyricUtil.decryptQRCLyric =
    rawLyricUtil?.decryptQRCLyric?.bind(rawLyricUtil) ??
    (async () => {
        throw new Error("decryptQRCLyric is not available");
    });
LyricUtil.addListener =
    rawLyricUtil?.addListener?.bind(rawLyricUtil) ??
    ((() => ({ remove: () => undefined })) as any);

export default LyricUtil;
