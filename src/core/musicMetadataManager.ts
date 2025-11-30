import Mp3Util from '@/native/mp3Util';
import { errorLog, devLog } from '@/utils/log';
import { removeFileScheme } from '@/utils/fileUtils';
import lyricManager from '@/core/lyricManager';
import type {
  IMusicMetadata,
  IDownloadMetadataConfig,
  IDownloadTaskMetadata,
  LyricOrderItem
} from '@/types/metadata';
import type { IPluginManager } from '@/types/core/pluginManager';

/**
 * 音乐元数据管理器
 * 负责处理下载时的音乐标签、歌词和封面写入
 */
class MusicMetadataManager {
  private pluginManager: IPluginManager | null = null;

  /**
   * 注入插件管理器依赖
   */
  injectPluginManager(pluginManager: IPluginManager) {
    this.pluginManager = pluginManager;
  }
  /**
   * 从音乐项目构建元数据对象
   */
  private buildMetadataFromMusicItem(musicItem: IMusic.IMusicItem): IMusicMetadata {
    const metadata: IMusicMetadata = {
      // 基本信息
      title: musicItem.title,
      artist: musicItem.artist,
      album: musicItem.album,
    };

    // 处理可选字段
    if (musicItem.alias) {
      metadata.comment = `别名: ${musicItem.alias}`;
    }

    // 如果时长信息存在，转换为分:秒格式作为注释的一部分
    if (musicItem.duration) {
      const minutes = Math.floor(musicItem.duration / 60);
      const seconds = Math.floor(musicItem.duration % 60);
      const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      metadata.comment = metadata.comment 
        ? `${metadata.comment} | 时长: ${durationStr}`
        : `时长: ${durationStr}`;
    }

    return metadata;
  }

  /**
   * 获取音乐封面URL
   *
   * 策略：
   * 1. 优先使用 musicItem.artwork（搜索时已包含）
   * 2. 如果为空，尝试通过插件的 getMusicInfo 重新获取完整信息
   * 3. 如果仍然为空，返回 undefined
   */
  private async getCoverUrl(musicItem: IMusic.IMusicItem): Promise<string | undefined> {
    try {
      // 策略1：如果音乐项目已经有封面URL，直接返回
      if (musicItem.artwork && musicItem.artwork.trim()) {
        devLog('info', '🖼️[元数据管理器] 使用现有封面URL', { url: musicItem.artwork });
        return musicItem.artwork;
      }

      // 策略2：尝试通过插件重新获取音乐信息（可能包含封面）
      if (!this.pluginManager) {
        devLog('warn', '⚠️[元数据管理器] pluginManager未注入，无法获取封面');
        return undefined;
      }

      const plugin = this.pluginManager.getByMedia(musicItem);
      if (!plugin?.methods?.getMusicInfo) {
        devLog('warn', '⚠️[元数据管理器] 插件不支持getMusicInfo，无法获取封面', {
          platform: musicItem.platform
        });
        return undefined;
      }

      devLog('info', '🔍[元数据管理器] 通过插件重新获取音乐信息以获取封面', {
        title: musicItem.title,
        platform: musicItem.platform
      });

      const fullMusicInfo = await plugin.methods.getMusicInfo(musicItem);
      if (fullMusicInfo?.artwork && fullMusicInfo.artwork.trim()) {
        devLog('info', '✅[元数据管理器] 成功获取封面URL', { url: fullMusicInfo.artwork });
        return fullMusicInfo.artwork;
      }

      devLog('warn', '⚠️[元数据管理器] 插件返回的音乐信息中无封面');
      return undefined;
    } catch (error) {
      errorLog('获取音乐封面失败', error);
      return undefined;
    }
  }

  /**
   * 获取歌词内容（增强型LRC格式，包含翻译和罗马音）
   *
   * 设计说明：
   * - 根据 lyricOrder 配置决定歌词内容和顺序
   * - 生成增强型LRC格式，适用于支持多行歌词的本地播放器
   */
  private async getLyricContent(
    musicItem: IMusic.IMusicItem,
    config?: IDownloadMetadataConfig
  ): Promise<string | undefined> {
    try {
      // Fix: 直接通过插件获取对应歌曲的歌词，不从lyricManager获取
      // 原因：lyricManager中的歌词是当前播放歌曲的，可能与要下载的歌曲不一致
      if (!this.pluginManager) {
        return undefined;
      }

      const plugin = this.pluginManager.getByMedia(musicItem);
      if (!plugin?.methods?.getLyric) {
        return undefined;
      }

      try {
        const lyricSource = await plugin.methods.getLyric(musicItem);
        if (!lyricSource) {
          return undefined;
        }

        devLog('info', '[元数据管理器] 插件返回的歌词数据', {
          有rawLrc: !!lyricSource.rawLrc,
          有translation: !!lyricSource.translation,
          有romanization: !!lyricSource.romanization,
          有lrc: !!lyricSource.lrc,
          rawLrc长度: lyricSource.rawLrc?.length,
          translation长度: lyricSource.translation?.length,
          romanization长度: lyricSource.romanization?.length,
          歌曲: musicItem.title
        });

        // Fix: 加密歌词自动解密（QQ音乐QRC格式 - Native异步解密）
        const { autoDecryptLyric } = require('@/utils/qqMusicDecrypter');
        const enableWordByWord = config?.enableWordByWord ?? false;
        const rawLrc = lyricSource.rawLrc ? await autoDecryptLyric(lyricSource.rawLrc, enableWordByWord) : lyricSource.rawLrc;
        const translation = lyricSource.translation ? await autoDecryptLyric(lyricSource.translation, enableWordByWord) : lyricSource.translation;
        const romanization = lyricSource.romanization ? await autoDecryptLyric(lyricSource.romanization, enableWordByWord) : lyricSource.romanization;

        devLog('info', '[元数据管理器] 解密后的歌词数据', {
          rawLrc长度: rawLrc?.length,
          translation长度: translation?.length,
          romanization长度: romanization?.length,
          romanization前200字符: romanization?.substring(0, 200),
          enableWordByWord
        });

        // 如果没有原始歌词，尝试使用旧的lrc字段
        if (!rawLrc) {
          if (lyricSource.lrc && !lyricSource.lrc.startsWith('http')) {
            return await autoDecryptLyric(lyricSource.lrc, enableWordByWord);
          }
          return undefined;
        }

        // Get lyric order from config
        const lyricOrder = config?.lyricOrder ?? ['original', 'romanization', 'translation'];

        devLog('info', '[元数据管理器] 歌词写入配置', {
          歌词顺序: lyricOrder
        });

        // If order is empty, return undefined
        if (lyricOrder.length === 0) {
          devLog('info', '[元数据管理器] 歌词顺序为空，不写入歌词');
          return undefined;
        }

        // Build lyric content map
        const lyricContentMap: Record<LyricOrderItem, string | undefined> = {
          original: rawLrc,
          translation: translation,
          romanization: romanization
        };

        // Filter available lyric content based on order
        const availableLyrics: Array<{type: LyricOrderItem, content: string}> = [];
        for (const orderItem of lyricOrder) {
          const content = lyricContentMap[orderItem];
          if (content && content.trim()) {
            availableLyrics.push({ type: orderItem, content });
          }
        }

        if (availableLyrics.length === 0) {
          devLog('warn', '[元数据管理器] 没有可用的歌词内容');
          return undefined;
        }

        // If only one type of lyric, return it directly
        if (availableLyrics.length === 1) {
          devLog('info', '[元数据管理器] 返回单一类型歌词', {
            类型: availableLyrics[0].type,
            歌词长度: availableLyrics[0].content.length,
            歌曲: musicItem.title
          });
          return availableLyrics[0].content;
        }

        // Merge lyrics based on order
        const mergedLrc = this.mergeEnhancedLyricWithOrder(availableLyrics);

        devLog('info', '[元数据管理器] 增强型歌词合并完成', {
          合并的歌词类型: availableLyrics.map(l => l.type),
          合并后长度: mergedLrc.length,
          歌曲: musicItem.title
        });

        return mergedLrc;
      } catch (error) {
        errorLog('通过插件获取歌词失败', error);
        return undefined;
      }
    } catch (error) {
      errorLog('获取歌词失败', error);
      return undefined;
    }
  }

  /**
   * 合并多种歌词内容（简单顺序拼接）
   *
   * 按配置顺序依次拼接完整的歌词内容
   */
  private mergeEnhancedLyricWithOrder(
    lyrics: Array<{type: LyricOrderItem, content: string}>
  ): string {
    if (lyrics.length === 0) {
      return '';
    }

    // Simply concatenate all lyrics in order
    const result: string[] = [];
    for (const lyric of lyrics) {
      result.push(lyric.content);
    }

    devLog('info', '[元数据管理器] 歌词拼接完成', {
      歌词类型: lyrics.map(l => l.type),
      各部分行数: lyrics.map(l => l.content.split('\n').length)
    });

    return result.join('\n\n');
  }

  /**
   * 合并原始歌词、翻译和罗马音为增强型LRC格式（LRCv2标准）
   * @deprecated 使用 mergeEnhancedLyricWithOrder 替代
   *
   * 格式说明（可切换显示的多语言格式）：
   * [00:12.34]原始歌词
   * [00:12.34]Translation text
   * [00:12.34]Romanization text
   */
  private mergeEnhancedLyric(
    rawLrc: string,
    translation?: string,
    romanization?: string
  ): string {
    const rawLines = this.parseLrcLines(rawLrc);
    const translationLines = translation ? this.parseLrcLines(translation) : [];
    const romanizationLines = romanization ? this.parseLrcLines(romanization) : [];

    devLog('info', '🔍[元数据管理器] 歌词解析结果', {
      原始歌词行数: rawLines.length,
      翻译行数: translationLines.length,
      罗马音行数: romanizationLines.length,
      原始前3行: rawLines.slice(0, 3),
      翻译前3行: translationLines.slice(0, 3),
      罗马音前3行: romanizationLines.slice(0, 3)
    });

    // 构建翻译和罗马音的时间戳索引（标准化时间戳作为key）
    const translationMap = new Map<string, string>();
    const romanizationMap = new Map<string, string>();

    for (const line of translationLines) {
      const normalizedTime = this.normalizeTimestamp(line.time);
      translationMap.set(normalizedTime, line.content);
    }

    for (const line of romanizationLines) {
      const normalizedTime = this.normalizeTimestamp(line.time);
      romanizationMap.set(normalizedTime, line.content);
    }

    const result: string[] = [];
    let translationCount = 0;
    let romanizationCount = 0;

    // 遍历原始歌词，使用LRCv2格式：相同时间戳，多行不同语言
    for (const line of rawLines) {
      // 添加原始歌词
      result.push(`${line.time}${line.content}`);

      const normalizedTime = this.normalizeTimestamp(line.time);

      // 添加翻译（如果存在且不为空）- 使用相同时间戳
      const trans = translationMap.get(normalizedTime);
      if (trans && trans.trim()) {
        result.push(`${line.time}${trans}`);
        translationCount++;
      }

      // 添加罗马音（如果存在且不为空）- 使用相同时间戳
      const roma = romanizationMap.get(normalizedTime);
      if (roma && roma.trim()) {
        result.push(`${line.time}${roma}`);
        romanizationCount++;
      }
    }

    devLog('info', '✅[元数据管理器] 歌词合并统计', {
      写入翻译行数: translationCount,
      写入罗马音行数: romanizationCount,
      总行数: result.length
    });

    return result.join('\n');
  }

  /**
   * 标准化LRC时间戳，忽略小数位数差异
   * [00:12.34] 和 [00:12.340] 应该被视为相同
   */
  private normalizeTimestamp(timestamp: string): string {
    // 提取 [mm:ss.xxx] 格式中的数字部分
    const match = timestamp.match(/\[(\d+):(\d+)\.(\d+)\]/);
    if (!match) {
      return timestamp;
    }

    const minutes = match[1];
    const seconds = match[2];
    const milliseconds = match[3].padEnd(3, '0').substring(0, 3); // 统一为3位小数

    return `[${minutes}:${seconds}.${milliseconds}]`;
  }

  /**
   * 解析LRC格式歌词，提取时间戳和内容
   */
  private parseLrcLines(lrc: string): Array<{time: string, content: string}> {
    const lines: Array<{time: string, content: string}> = [];
    const lrcLines = lrc.split('\n');

    for (const line of lrcLines) {
      // 匹配时间戳格式 [mm:ss.xx] 或 [mm:ss.xxx]
      const match = line.match(/^(\[\d+:\d+\.\d+\])(.*)/);
      if (match) {
        lines.push({
          time: match[1],
          content: match[2]  // 不使用 trim()，保留原始内容
        });
      }
    }

    return lines;
  }

  /**
   * 为下载任务写入音乐元数据
   * @param taskInfo 下载任务信息
   * @param config 元数据配置
   */
  async writeMetadataForDownloadTask(
    taskInfo: IDownloadTaskMetadata,
    config: IDownloadMetadataConfig
  ): Promise<boolean> {
    devLog('info', '🔧[元数据管理器] 开始写入元数据', {
      enabled: config.enabled,
      Mp3UtilAvailable: Mp3Util.isAvailable(),
      musicTitle: taskInfo.musicItem.title,
      filePath: taskInfo.filePath
    });
    
    if (!config.enabled) {
      devLog('warn', '⚠️[元数据管理器] 元数据写入功能未启用，请在设置→基础设置→音乐标签设置中开启');
      return false;
    }
    
    if (!Mp3Util.isAvailable()) {
      devLog('error', '❌[元数据管理器] Mp3Util原生模块不可用，请检查构建配置');
      return false;
    }

    try {
      // 移除file://前缀，确保路径格式正确
      const cleanFilePath = removeFileScheme(taskInfo.filePath);
      devLog('info', '📁[元数据管理器] 处理文件路径', {
        原始路径: taskInfo.filePath,
        清理后路径: cleanFilePath
      });
      
      // 构建基础元数据
      const metadata = this.buildMetadataFromMusicItem(taskInfo.musicItem);
      devLog('info', '📝[元数据管理器] 构建基础元数据', metadata);

      // 如果启用歌词写入，获取歌词
      if (config.writeLyric) {
        devLog('info', '🎵[元数据管理器] 开始获取歌词');
        const lyricContent = await this.getLyricContent(taskInfo.musicItem, config);
        if (lyricContent) {
          metadata.lyric = lyricContent;
          devLog('info', '✅[元数据管理器] 歌词获取成功', { 长度: lyricContent.length });
        } else {
          devLog('warn', '⚠️[元数据管理器] 未获取到歌词');
        }
      }

      // 合并额外的元数据
      if (taskInfo.metadata) {
        Object.assign(metadata, taskInfo.metadata);
      }

      // 如果启用封面写入，获取封面URL
      let coverUrl: string | undefined;
      if (config.writeCover) {
        devLog('info', '🖼️[元数据管理器] 开始获取封面URL');
        coverUrl = taskInfo.coverUrl || await this.getCoverUrl(taskInfo.musicItem);
        devLog('info', '🖼️[元数据管理器] 封面URL获取结果', { url: coverUrl });
      }

      // 写入元数据和封面
      devLog('info', '💾[元数据管理器] 开始调用原生模块写入元数据', {
        是否包含封面: !!coverUrl,
        元数据字段数: Object.keys(metadata).length
      });
      
      if (coverUrl) {
        devLog('info', '🎯[元数据管理器] 调用 setMediaTagWithCover');
        await Mp3Util.setMediaTagWithCover(cleanFilePath, metadata, coverUrl);
      } else {
        devLog('info', '🎯[元数据管理器] 调用 setMediaTag');
        await Mp3Util.setMediaTag(cleanFilePath, metadata);
      }
      
      devLog('info', '✅[元数据管理器] 元数据写入成功!');
      return true;
    } catch (error) {
      devLog('error', '❌[元数据管理器] 元数据写入失败', error);
      errorLog('写入音乐元数据失败', {
        filePath: taskInfo.filePath,
        musicItem: {
          title: taskInfo.musicItem.title,
          artist: taskInfo.musicItem.artist,
          platform: taskInfo.musicItem.platform
        },
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return false;
    }
  }

  /**
   * 单独写入音乐封面
   */
  async writeCoverOnly(filePath: string, coverUrl: string): Promise<boolean> {
    if (!Mp3Util.isAvailable()) {
      return false;
    }

    try {
      // 移除file://前缀，确保路径格式正确
      const cleanFilePath = removeFileScheme(filePath);
      await Mp3Util.setMediaCover(cleanFilePath, coverUrl);
      return true;
    } catch (error) {
      errorLog('写入音乐封面失败', { filePath, coverUrl, error });
      return false;
    }
  }

  /**
   * 单独写入歌词
   */
  async writeLyricOnly(filePath: string, lyricContent: string): Promise<boolean> {
    if (!Mp3Util.isAvailable()) {
      return false;
    }

    try {
      // 移除file://前缀，确保路径格式正确
      const cleanFilePath = removeFileScheme(filePath);
      await Mp3Util.setMediaTag(cleanFilePath, { lyric: lyricContent });
      return true;
    } catch (error) {
      errorLog('写入歌词失败', { filePath, error });
      return false;
    }
  }

  /**
   * 读取音乐文件的元数据
   */
  async readMetadata(filePath: string): Promise<IMusicMetadata | null> {
    if (!Mp3Util.isAvailable()) {
      return null;
    }

    try {
      // 移除file://前缀，确保路径格式正确
      const cleanFilePath = removeFileScheme(filePath);
      return await Mp3Util.getMediaTag(cleanFilePath);
    } catch (error) {
      errorLog('读取音乐元数据失败', { filePath, error });
      return null;
    }
  }

  /**
   * 检查功能是否可用
   */
  isAvailable(): boolean {
    return Mp3Util.isAvailable();
  }
}

// 导出单例实例
export const musicMetadataManager = new MusicMetadataManager();
export default musicMetadataManager;