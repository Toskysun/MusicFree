/**
 * 音质相关的所有工具代码
 */
import { ILanguageData } from "@/types/core/i18n";

export const qualityKeys: IMusic.IQualityKey[] = [
    "128k",
    "320k", 
    "flac",
    "flac24bit",
    "hires",
    "atmos",
    "atmos_plus",
    "master",
];

// 音质尝试顺序
export const TRY_QUALITYS_LIST: IMusic.IQualityKey[] = [
    "master", "atmos_plus", "atmos", "hires", "flac24bit", "flac", "320k", "128k",
] as const;

// 保留原有硬编码翻译作为后备
export const qualityText = {
    "128k": "普通音质 128K",
    "320k": "高清音质 320K",
    flac: "高清音质 FLAC",
    flac24bit: "无损音质 FLAC Hires",
    hires: "无损音质 Hires",
    atmos: "无损音质 Atmos",
    atmos_plus: "无损音质 Atmos 2.0",
    master: "无损音质 Master",
};

/** 获取国际化的音质文本映射 */
export function getQualityText(i18nData: ILanguageData, customTranslations?: Record<IMusic.IQualityKey, string>): Record<IMusic.IQualityKey, string> {
    // 如果有自定义翻译，优先使用自定义翻译
    if (customTranslations) {
        return {
            "128k": customTranslations["128k"] || i18nData["quality.128k"] || qualityText["128k"],
            "320k": customTranslations["320k"] || i18nData["quality.320k"] || qualityText["320k"],
            flac: customTranslations.flac || i18nData["quality.flac"] || qualityText.flac,
            flac24bit: customTranslations.flac24bit || i18nData["quality.flac24bit"] || qualityText.flac24bit,
            hires: customTranslations.hires || i18nData["quality.hires"] || qualityText.hires,
            atmos: customTranslations.atmos || i18nData["quality.atmos"] || qualityText.atmos,
            atmos_plus: customTranslations.atmos_plus || i18nData["quality.atmos_plus"] || qualityText.atmos_plus,
            master: customTranslations.master || i18nData["quality.master"] || qualityText.master,
        };
    }
    
    // 没有自定义翻译时，使用i18n数据
    return {
        "128k": i18nData["quality.128k"] || qualityText["128k"],
        "320k": i18nData["quality.320k"] || qualityText["320k"],
        flac: i18nData["quality.flac"] || qualityText.flac,
        flac24bit: i18nData["quality.flac24bit"] || qualityText.flac24bit,
        hires: i18nData["quality.hires"] || qualityText.hires,
        atmos: i18nData["quality.atmos"] || qualityText.atmos,
        atmos_plus: i18nData["quality.atmos_plus"] || qualityText.atmos_plus,
        master: i18nData["quality.master"] || qualityText.master,
    };
}

/** 智能音质选择 */
export function getSmartQuality(
    preferredQuality: IMusic.IQualityKey,
    availableQualities: IMusic.IQuality | undefined,
    platformSupportedQualities?: IMusic.IQualityKey[]
): IMusic.IQualityKey {
    // 如果没有音质信息，返回偏好音质
    if (!availableQualities) return preferredQuality;
    
    // 从偏好音质开始，向下搜索可用音质
    const preferredIndex = TRY_QUALITYS_LIST.indexOf(preferredQuality);
    if (preferredIndex === -1) return "320k"; // 如果偏好音质不在列表中，返回320k
    
    // 从偏好音质开始向下搜索
    for (let i = preferredIndex; i < TRY_QUALITYS_LIST.length; i++) {
        const quality = TRY_QUALITYS_LIST[i];
        // 修复：只要存在该音质的键，就认为可用（不管是否有url）
        const hasQuality = availableQualities[quality] !== undefined && 
                          availableQualities[quality] !== null;
        
        // 检查平台是否支持该音质
        const platformSupported = !platformSupportedQualities || 
                                 platformSupportedQualities.includes(quality);
        
        if (hasQuality && platformSupported) {
            return quality;
        }
    }
    
    // 如果向下没找到，向上搜索
    for (let i = preferredIndex - 1; i >= 0; i--) {
        const quality = TRY_QUALITYS_LIST[i];
        // 修复：只要存在该音质的键，就认为可用（不管是否有url）
        const hasQuality = availableQualities[quality] !== undefined && 
                          availableQualities[quality] !== null;
        
        const platformSupported = !platformSupportedQualities || 
                                 platformSupportedQualities.includes(quality);
        
        if (hasQuality && platformSupported) {
            return quality;
        }
    }
    
    // 最后回退到128k
    return "128k";
}

/** 获取音质顺序 */
export function getQualityOrder(
    qualityKey: IMusic.IQualityKey,
    sort: "asc" | "desc",
) {
    const idx = qualityKeys.indexOf(qualityKey);
    const left = qualityKeys.slice(0, idx);
    const right = qualityKeys.slice(idx + 1);
    if (sort === "asc") {
        /** 优先高音质 */
        return [qualityKey, ...right, ...left.reverse()];
    } else {
        /** 优先低音质 */
        return [qualityKey, ...left.reverse(), ...right];
    }
}

/** 音质文本到标准键的映射表 */
const qualityTextToKeyMap: Record<string, IMusic.IQualityKey> = {
    // 网易云音乐音质映射
    "臻品母带": "master",
    "臻品全景声2.0": "atmos_plus", 
    "臻品全景声": "atmos",
    "Hires无损24-Bit": "hires",
    "FLAC": "flac",
    "320K": "320k",
    "128K": "128k",
    
    // QQ音乐音质映射和标准键直接映射
    "flac24bit": "flac24bit",
    "flac": "flac",
    "320k": "320k",
    "128k": "128k",
    "master": "master",
    "atmos": "atmos",
    "atmos_plus": "atmos_plus",
    "hires": "hires",
    
    // 通用音质映射
    "无损": "flac",
    "高品质": "320k",
    "标准": "128k",
    "超高品质": "hires",
    "母带": "master",
};

/** 将API返回的音质信息转换为标准的qualities格式 */
export function convertApiQualityToQualities(apiQuality?: {
    target?: string;
    result?: string;
    size?: string | number; // 添加文件大小支持
    [key: string]: any;
}): IMusic.IQuality | undefined {
    if (!apiQuality?.result) {
        return undefined;
    }

    // 从API返回的质量文本中提取标准键
    const qualityKey = qualityTextToKeyMap[apiQuality.result];
    if (!qualityKey) {
        console.warn("未知的音质类型:", apiQuality.result);
        return undefined;
    }

    // 构建qualities对象，表示该音质可用
    return {
        [qualityKey]: {
            url: undefined, // 将由插件的getMediaSource方法提供
            size: apiQuality.size, // 使用API返回的文件大小
        },
    };
}

/** 解析音质文本，返回对应的标准键 */
export function parseQualityText(inputQualityText: string): IMusic.IQualityKey | null {
    return qualityTextToKeyMap[inputQualityText] || null;
}

/**
 * 辅助函数：将插件API返回的原始音乐数据转换为包含正确qualities字段的IMusicItem
 * 这个函数主要供插件开发者使用，用于处理API返回的音质信息
 * 
 * @param rawMusicItem 插件API返回的原始音乐数据
 * @param apiQualityData API返回的音质数据，格式如: {target: "臻品母带", result: "臻品母带"}
 * @returns 包含正确qualities字段的音乐项
 */
export function transformMusicItemWithQuality<T extends Partial<IMusic.IMusicItem>>(
    rawMusicItem: T,
    apiQualityData?: { target?: string; result?: string; [key: string]: any }
): T & { qualities?: IMusic.IQuality } {
    const convertedQualities = convertApiQualityToQualities(apiQualityData);
    
    return {
        ...rawMusicItem,
        qualities: convertedQualities,
    };
}

/**
 * 增强音质信息提取 - 从多个音质选项中构建完整的qualities对象
 */
export function buildQualitiesFromArray(qualityArray: Array<{
    type: string;
    size?: string | number;
    url?: string;
    [key: string]: any;
}>): IMusic.IQuality {
    const qualities: IMusic.IQuality = {};
    
    for (const qualityInfo of qualityArray) {
        const qualityKey = qualityTextToKeyMap[qualityInfo.type];
        if (qualityKey) {
            qualities[qualityKey] = {
                url: qualityInfo.url,
                size: qualityInfo.size,
            };
        }
    }
    
    return qualities;
}

/**
 * 获取可用音质列表 - 增强版本
 * 支持从插件supportedQualities、qualities和source字段获取音质信息
 * 精确到歌曲级别，只显示该歌曲实际支持的音质
 */
export function getAvailableQualities(
    musicItem: IMusic.IMusicItem, 
    plugin?: { supportedQualities?: IMusic.IQualityKey[] }
): IMusic.IQualityKey[] {
    const availableQualities: IMusic.IQualityKey[] = [];
    
    // 第一优先级：从歌曲的qualities字段获取实际支持的音质
    if (musicItem.qualities) {
        // 按照插件声明的音质顺序检查，保证显示顺序一致
        if (plugin?.supportedQualities) {
            for (const quality of plugin.supportedQualities) {
                if (musicItem.qualities[quality] !== undefined) {
                    availableQualities.push(quality);
                }
            }
        } else {
            // 如果没有插件信息，按照标准顺序检查
            for (const quality of qualityKeys) {
                if (musicItem.qualities[quality] !== undefined) {
                    availableQualities.push(quality);
                }
            }
        }
    }
    
    // 第二优先级：从歌曲的source字段获取
    if (availableQualities.length === 0 && musicItem.source) {
        for (const quality of qualityKeys) {
            if (musicItem.source[quality] && 
                (musicItem.source[quality]!.url || 
                 musicItem.source[quality]!.size !== undefined)) {
                availableQualities.push(quality);
            }
        }
    }
    
    // 最后手段：如果歌曲没有任何音质信息，显示插件支持的全部音质
    if (availableQualities.length === 0) {
        // 优先返回插件声明的支持音质
        if (plugin?.supportedQualities && plugin.supportedQualities.length > 0) {
            return plugin.supportedQualities;
        }
        // 如果没有插件信息，提供基础默认音质
        return ["128k", "320k", "flac"];
    }
    
    return availableQualities;
}

/**
 * 获取音质文件大小 - 支持多源获取
 */
export function getQualitySize(
    musicItem: IMusic.IMusicItem, 
    quality: IMusic.IQualityKey
): string | number | undefined {
    // 优先从qualities获取
    if (musicItem.qualities?.[quality]?.size) {
        return musicItem.qualities[quality]!.size;
    }
    
    // 其次从source获取
    if (musicItem.source?.[quality]?.size) {
        return musicItem.source[quality]!.size;
    }
    
    return undefined;
}

/**
 * 统一音质信息标准化处理函数
 * 将不同插件返回的音质信息转换为MusicFree标准格式
 */
export function normalizePluginQualityInfo(
    musicItem: any,
    pluginQualityMapping?: Record<string, IMusic.IQualityKey>
): IMusic.IQuality | undefined {
    // 如果已经有标准的qualities格式，直接返回
    if (musicItem.qualities && typeof musicItem.qualities === "object") {
        return musicItem.qualities as IMusic.IQuality;
    }
    
    const qualities: IMusic.IQuality = {};
    
    // 处理网易云音乐风格的音质信息 (低音质l, 中音质m, 高音质h, 超高音质sq)
    if (musicItem.l || musicItem.m || musicItem.h || musicItem.sq) {
        if (musicItem.l?.size) qualities["128k"] = { size: musicItem.l.size };
        if (musicItem.m?.size) qualities["320k"] = { size: musicItem.m.size };
        if (musicItem.h?.size) qualities.flac = { size: musicItem.h.size };
        if (musicItem.sq?.size) qualities.hires = { size: musicItem.sq.size };
    }
    
    // 处理QQ音乐/酷狗风格的音质数组
    if (Array.isArray(musicItem.qualityList)) {
        for (const qualityInfo of musicItem.qualityList) {
            const standardKey = qualityTextToKeyMap[qualityInfo.type] || 
                               pluginQualityMapping?.[qualityInfo.type];
            if (standardKey) {
                qualities[standardKey] = {
                    url: qualityInfo.url,
                    size: qualityInfo.size || qualityInfo.fileSize,
                };
            }
        }
    }
    
    // 处理命名键值对格式 (如 {low: {size: 123}, standard: {size: 456}})
    const namedQualityKeys = ["low", "standard", "high", "super"];
    for (const key of namedQualityKeys) {
        if (musicItem[key] && typeof musicItem[key] === "object") {
            const standardKey = qualityTextToKeyMap[key];
            if (standardKey && musicItem[key].size) {
                qualities[standardKey] = {
                    size: musicItem[key].size,
                    url: musicItem[key].url,
                };
            }
        }
    }
    
    return Object.keys(qualities).length > 0 ? qualities : undefined;
}

/**
 * 插件音乐项标准化处理
 * 确保插件返回的音乐项包含正确的qualities字段
 */
export function normalizePluginMusicItem<T extends Partial<IMusic.IMusicItem>>(
    rawMusicItem: T,
    pluginQualityMapping?: Record<string, IMusic.IQualityKey>
): T & { qualities?: IMusic.IQuality } {
    const normalizedQualities = normalizePluginQualityInfo(rawMusicItem, pluginQualityMapping);
    
    return {
        ...rawMusicItem,
        qualities: normalizedQualities,
    };
}
