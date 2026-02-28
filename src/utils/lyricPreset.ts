import { ILyricColorPreset, LYRIC_COLOR_PRESETS } from '@/native/lyricUtil';
import Config from '@/core/appConfig';

/**
 * 解析最终预设列表（合并内置 + 自定义 + 颜色反转）
 * 单一真相源，供 lyricManager / basicSetting / musicItemLyricOptions 共用
 */
export function resolveLyricPresets(): ILyricColorPreset[] {
    const customPresets = Config.getConfig('lyric.customPresets') as Array<{
        unsungColor: string;
        sungColor: string;
        backgroundColor: string;
    } | null> | undefined;
    const invertColors = Config.getConfig('lyric.invertColors') ?? false;

    return LYRIC_COLOR_PRESETS.map((base, i) => {
        const custom = customPresets?.[i];
        const preset = custom
            ? { ...base, unsungColor: custom.unsungColor, sungColor: custom.sungColor, backgroundColor: custom.backgroundColor }
            : { ...base };

        if (invertColors) {
            const tmp = preset.unsungColor;
            preset.unsungColor = preset.sungColor;
            preset.sungColor = tmp;
        }

        return preset;
    });
}
