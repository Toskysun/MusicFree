import Mp3Util from '@/native/mp3Util';
import { errorLog, devLog } from '@/utils/log';
import { removeFileScheme } from '@/utils/fileUtils';
import lyricManager from '@/core/lyricManager';
import type { 
  IMusicMetadata, 
  IDownloadMetadataConfig, 
  IDownloadTaskMetadata 
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
   */
  private async getCoverUrl(musicItem: IMusic.IMusicItem): Promise<string | undefined> {
    try {
      // 如果音乐项目已经有封面URL，直接返回
      if (musicItem.artwork) {
        return musicItem.artwork;
      }

      // ❌ 注意：插件的getMediaSource不是用来获取封面的
      // getMediaSource是获取播放链接，不会更新封面信息
      // 封面信息通常在搜索音乐时就已经包含在musicItem中了
      
      return musicItem.artwork || undefined;
    } catch (error) {
      errorLog('获取音乐封面失败', error);
      return undefined;
    }
  }

  /**
   * 获取歌词内容
   */
  private async getLyricContent(musicItem: IMusic.IMusicItem): Promise<string | undefined> {
    try {
      // 方法1: 检查当前歌词管理器中是否有歌词（如果当前正在播放这首歌）
      if (lyricManager.lyricState && !lyricManager.lyricState.loading) {
        const lyrics = lyricManager.lyricState.lyrics;
        if (lyrics && lyrics.length > 0) {
          // 将解析后的歌词重新组合成LRC格式
          return lyrics.map(item => `[${this.formatTime(item.time)}]${item.lrc}`).join('\n');
        }
      }

      // 方法2: 通过插件直接获取歌词
      if (this.pluginManager) {
        const plugin = this.pluginManager.getByMedia(musicItem);
        if (plugin?.methods?.getLyric) {
          try {
            const lyricSource = await plugin.methods.getLyric(musicItem);
            if (lyricSource) {
              // 🎯 关键修复：处理插件返回的不同格式
              // 优先使用 rawLrc (标准LRC格式)
              if (lyricSource.rawLrc) {
                return lyricSource.rawLrc;
              }
              // 备选使用 lrc 字段 (可能是URL或内容)
              if (lyricSource.lrc) {
                // 如果是URL，需要额外下载（暂时跳过URL下载）
                if (!lyricSource.lrc.startsWith('http')) {
                  return lyricSource.lrc;
                }
              }
            }
          } catch (error) {
            errorLog('通过插件获取歌词失败', error);
          }
        }
      }

      return undefined;
    } catch (error) {
      errorLog('获取歌词失败', error);
      return undefined;
    }
  }

  /**
   * 将时间（秒）格式化为LRC时间格式 [mm:ss.xx]
   */
  private formatTime(timeInSeconds: number): string {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    const centiseconds = Math.floor((timeInSeconds % 1) * 100);
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
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
        const lyricContent = await this.getLyricContent(taskInfo.musicItem);
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