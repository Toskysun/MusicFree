// 音乐元数据类型定义

/**
 * 基础音乐元数据接口
 */
export interface IMusicMetadata {
  /** 音乐标题 */
  title?: string;
  /** 艺术家 */
  artist?: string;
  /** 专辑名称 */
  album?: string;
  /** 歌词 */
  lyric?: string;
  /** 评论 */
  comment?: string;
  /** 专辑艺术家 */
  albumArtist?: string;
  /** 作曲者 */
  composer?: string;
  /** 年份 */
  year?: string;
  /** 音乐流派 */
  genre?: string;
  /** 音轨号 */
  trackNumber?: string;
  /** 总音轨数 */
  totalTracks?: string;
  /** 光盘号 */
  discNumber?: string;
  /** 总光盘数 */
  totalDiscs?: string;
  /** ISRC编码 */
  isrc?: string;
  /** 语言 */
  language?: string;
  /** 编码器信息 */
  encoder?: string;
  /** 每分钟节拍数 */
  bpm?: string;
  /** 情绪 */
  mood?: string;
  /** 评分 */
  rating?: string;
  /** 发行商 */
  publisher?: string;
  /** 原始艺术家 */
  originalArtist?: string;
  /** 原始专辑 */
  originalAlbum?: string;
  /** 原始年份 */
  originalYear?: string;
  /** 官方网站URL */
  url?: string;
  /** 是否为合辑 */
  compilation?: boolean;
}

/**
 * 音乐基础信息（通过MediaMetadataRetriever获取）
 */
export interface IMusicBasicMeta {
  /** 时长（毫秒） */
  duration?: string;
  /** 比特率 */
  bitrate?: string;
  /** 艺术家 */
  artist?: string;
  /** 作者 */
  author?: string;
  /** 专辑 */
  album?: string;
  /** 标题 */
  title?: string;
  /** 日期 */
  date?: string;
  /** 年份 */
  year?: string;
}

/**
 * Mp3Util原生模块接口声明
 */
export interface IMp3Util {
  /**
   * 获取音频文件基础元数据
   * @param filePath 文件路径
   */
  getBasicMeta(filePath: string): Promise<IMusicBasicMeta>;

  /**
   * 批量获取音频文件基础元数据
   * @param filePaths 文件路径数组
   */
  getMediaMeta(filePaths: string[]): Promise<(IMusicBasicMeta | null)[]>;

  /**
   * 获取音频文件封面图片
   * @param filePath 文件路径
   */
  getMediaCoverImg(filePath: string): Promise<string | null>;

  /**
   * 获取音频文件歌词
   * @param filePath 文件路径
   */
  getLyric(filePath: string): Promise<string>;

  /**
   * 设置音频文件元数据标签
   * @param filePath 文件路径
   * @param meta 元数据对象
   */
  setMediaTag(filePath: string, meta: IMusicMetadata): Promise<boolean>;

  /**
   * 获取音频文件元数据标签
   * @param filePath 文件路径
   */
  getMediaTag(filePath: string): Promise<IMusicMetadata>;

  /**
   * 设置音频文件封面
   * @param filePath 音频文件路径
   * @param coverPath 封面路径（本地文件或网络URL）
   */
  setMediaCover(filePath: string, coverPath: string): Promise<boolean>;

  /**
   * 同时设置音频文件元数据和封面
   * @param filePath 音频文件路径
   * @param meta 元数据对象
   * @param coverPath 封面路径（可选）
   */
  setMediaTagWithCover(filePath: string, meta: IMusicMetadata, coverPath?: string): Promise<boolean>;

  /** 使用系统下载管理器下载（Android） */
  downloadWithSystemManager(
    url: string,
    destinationPath: string,
    title: string,
    description: string,
    headers?: Record<string, string> | null
  ): Promise<string>;

  /** 使用内置HTTP下载器下载，并可显示原生通知（Android） */
  downloadWithHttp(options: {
    url: string;
    destinationPath: string;
    title?: string;
    description?: string;
    headers?: Record<string, string> | null;
    showNotification?: boolean;
    coverUrl?: string | null;
  }): Promise<string>;

  /** 取消内置HTTP下载 */
  cancelHttpDownload(id: string): Promise<boolean>;
  /** 取消系统下载 */
  cancelSystemDownload(id: string): Promise<boolean>;

  /** 解密mflac到flac（Android） */
  decryptMflacToFlac(inputPath: string, outputPath: string, ekey: string): Promise<boolean>;

  /** 启动本地mflac代理（Android） */
  startMflacProxy(): Promise<string>;
  /** 注册mflac流并返回本地URL（Android） */
  registerMflacStream(src: string, ekey: string, headers?: Record<string, string> | null): Promise<string>;
}

/**
 * 下载音乐元数据写入配置
 */
export interface IDownloadMetadataConfig {
  /** 是否启用元数据写入 */
  enabled: boolean;
  /** 是否写入封面 */
  writeCover: boolean;
  /** 是否写入歌词 */
  writeLyric: boolean;
  /** 是否从插件获取扩展信息 */
  fetchExtendedInfo: boolean;
}

/**
 * 下载任务元数据信息
 */
export interface IDownloadTaskMetadata {
  /** 音乐信息 */
  musicItem: IMusic.IMusicItem;
  /** 文件路径 */
  filePath: string;
  /** 封面URL */
  coverUrl?: string;
  /** 歌词信息 */
  lyricInfo?: ILyric.ILyricItem;
  /** 额外元数据 */
  metadata?: IMusicMetadata;
}

// 全局模块声明
declare global {
  const Mp3Util: IMp3Util;
}
