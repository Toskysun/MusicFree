import { NativeModules } from "react-native";

export interface IBasicMeta {
    album?: string;
    artist?: string;
    author?: string;
    duration?: string;
    title?: string;
}

export interface IWritableMeta extends IBasicMeta {
    lyric?: string;
    comment?: string;
    year?: string;
    genre?: string;
    // 扩展元数据字段
    albumArtist?: string;      // 专辑艺术家
    composer?: string;          // 作曲家
    trackNumber?: string;       // 音轨编号
    totalTracks?: string;       // 总音轨数
    discNumber?: string;        // 光盘编号
    totalDiscs?: string;        // 总光盘数
    isrc?: string;             // 国际标准录音编码
    language?: string;          // 语言
    copyright?: string;         // 版权
    encoder?: string;           // 编码器
    bpm?: string;              // 节拍 (Beats Per Minute)
    mood?: string;             // 心情/情绪
    rating?: string;           // 评分
    publisher?: string;        // 发行商/唱片公司
    originalArtist?: string;   // 原唱艺术家
    originalAlbum?: string;    // 原专辑
    originalYear?: string;     // 原发行年份
    url?: string;              // 官方发布网站URL
    compilation?: boolean;     // 是否为合辑
}

export interface IExtendedMeta extends IWritableMeta {
    // 只读字段（从文件信息获取）
    bitrate?: string;          // 比特率
    codec?: string;            // 编解码器
    sampleRate?: string;       // 采样率
    channels?: string;         // 声道数
    fileSize?: number;         // 文件大小
}

interface IMp3Util {
    getBasicMeta: (fileName: string) => Promise<IBasicMeta>;
    getMediaMeta: (fileNames: string[]) => Promise<IBasicMeta[]>;
    getMediaCoverImg: (mediaPath: string) => Promise<string>;
    /** 读取内嵌歌词 */
    getLyric: (mediaPath: string) => Promise<string>;
    /** 写入meta信息 */
    setMediaTag: (filePath: string, meta: IWritableMeta) => Promise<void>;
    /** 读取完整meta信息 */
    getMediaTag: (filePath: string) => Promise<IWritableMeta>;
    /** 设置封面图片 */
    setMediaCover: (filePath: string, coverPath: string) => Promise<void>;
    /** 同时设置标签和封面 */
    setMediaTagWithCover: (filePath: string, meta: IWritableMeta, coverPath?: string) => Promise<void>;
}

const Mp3Util = NativeModules.Mp3Util;

export default Mp3Util as IMp3Util;
