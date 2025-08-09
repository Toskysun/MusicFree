import { internalSerializeKey, supportLocalMediaType } from "@/constants/commonConst";
import pathConst from "@/constants/pathConst";
import { IAppConfig } from "@/types/core/config";
import { IInjectable } from "@/types/infra";
import { addFileScheme, escapeCharacter, mkdirR } from "@/utils/fileUtils";
import { errorLog } from "@/utils/log";
import { patchMediaExtra } from "@/utils/mediaExtra";
import { getMediaUniqueKey, isSameMediaItem } from "@/utils/mediaUtils";
import network from "@/utils/network";
import { getQualityOrder } from "@/utils/qualities";
import { generateFileNameFromConfig, DEFAULT_FILE_NAMING_CONFIG } from "@/utils/fileNamingFormatter";
import EventEmitter from "eventemitter3";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { nanoid } from "nanoid";
import path from "path-browserify";
import { useEffect, useState } from "react";
import { copyFile, downloadFile, exists, unlink, stopDownload } from "react-native-fs";
import LocalMusicSheet from "./localMusicSheet";
import { IPluginManager } from "@/types/core/pluginManager";
import downloadNotificationManager from "./downloadNotificationManager";
import Mp3Util from "@/native/mp3Util";
import musicMetadataAPI from "@/api/musicMetadata";


export enum DownloadStatus {
    // 等待下载
    Pending,
    // 准备下载链接
    Preparing,
    // 下载中
    Downloading,
    // 下载完成
    Completed,
    // 下载失败
    Error
}


export enum DownloaderEvent {
    // 某次下载行为出错
    DownloadError = "download-error",

    // 下载任务更新
    DownloadTaskUpdate = "download-task-update",

    // 下载某个音乐时出错
    DownloadTaskError = "download-task-error",

    // 下载完成
    DownloadQueueCompleted = "download-queue-completed",
}

export enum DownloadFailReason {
    /** 无网络 */
    NetworkOffline = "network-offline",
    /** 设置-禁止在移动网络下下载 */
    NotAllowToDownloadInCellular = "not-allow-to-download-in-cellular",
    /** 无法获取到媒体源 */
    FailToFetchSource = "no-valid-source",
    /** 没有文件写入的权限 */
    NoWritePermission = "no-write-permission",
    Unknown = "unknown",
}

interface IDownloadTaskInfo {
    // 状态
    status: DownloadStatus;
    // 目标文件名
    filename: string;
    // 下载id
    jobId?: number;
    // 下载音质
    quality?: IMusic.IQualityKey;
    // 文件大小
    fileSize?: number;
    // 已下载大小
    downloadedSize?: number;
    // 音乐信息
    musicItem: IMusic.IMusicItem;
    // 如果下载失败，下载失败的原因
    errorReason?: DownloadFailReason;
}


const downloadQueueAtom = atom<IMusic.IMusicItem[]>([]);
const downloadTasks = new Map<string, IDownloadTaskInfo>();


interface IEvents {
    /** 某次下载行为出现报错 */
    [DownloaderEvent.DownloadError]: (reason: DownloadFailReason, error?: Error) => void;
    /** 下载某个媒体时报错 */
    [DownloaderEvent.DownloadTaskError]: (reason: DownloadFailReason, mediaItem: IMusic.IMusicItem, error?: Error) => void;
    /** 下载任务更新 */
    [DownloaderEvent.DownloadTaskUpdate]: (task: IDownloadTaskInfo) => void;
    /** 下载队列清空 */
    [DownloaderEvent.DownloadQueueCompleted]: () => void;
}

class Downloader extends EventEmitter<IEvents> implements IInjectable {
    private configService!: IAppConfig;
    private pluginManagerService!: IPluginManager;

    private downloadingCount = 0;
    private notificationManagerInitialized = false;

    private generateFilename(musicItem: IMusic.IMusicItem, quality?: IMusic.IQualityKey): string {
        // 获取文件命名配置
        const config: IFileNaming.IFileNamingConfig = {
            type: this.configService.getConfig("basic.fileNamingType") ?? DEFAULT_FILE_NAMING_CONFIG.type,
            preset: this.configService.getConfig("basic.fileNamingPreset") ?? DEFAULT_FILE_NAMING_CONFIG.preset,
            custom: this.configService.getConfig("basic.fileNamingCustom") ?? DEFAULT_FILE_NAMING_CONFIG.custom,
            showQuality: this.configService.getConfig("basic.fileNamingShowQuality") ?? DEFAULT_FILE_NAMING_CONFIG.showQuality,
            maxLength: this.configService.getConfig("basic.fileNamingMaxLength") ?? DEFAULT_FILE_NAMING_CONFIG.maxLength,
            keepExtension: DEFAULT_FILE_NAMING_CONFIG.keepExtension,
        };

        // 使用新的文件命名格式化函数
        const result = generateFileNameFromConfig(musicItem, config, quality);
        
        // 如果格式化失败，回退到旧的命名方式
        if (!result.filename) {
            return `${escapeCharacter(musicItem.platform)}@${escapeCharacter(
                musicItem.id,
            )}@${escapeCharacter(musicItem.title)}@${escapeCharacter(
                musicItem.artist,
            )}`.slice(0, 200);
        }
        
        return result.filename;
    }


    injectDependencies(configService: IAppConfig, pluginManager: IPluginManager): void {
        this.configService = configService;
        this.pluginManagerService = pluginManager;
        
        // 初始化下载通知管理器
        this.initializeNotificationManager();
    }
    
    private async initializeNotificationManager(): Promise<void> {
        if (this.notificationManagerInitialized) {
            return;
        }
        try {
            await downloadNotificationManager.initialize();
            this.notificationManagerInitialized = true;
        } catch (error) {
            errorLog("Failed to initialize download notification manager", error);
        }
    }

    private updateDownloadTask(musicItem: IMusic.IMusicItem, patch: Partial<IDownloadTaskInfo>) {
        const newValue = {
            ...downloadTasks.get(getMediaUniqueKey(musicItem)),
            ...patch,
        } as IDownloadTaskInfo;
        downloadTasks.set(getMediaUniqueKey(musicItem), newValue);
        this.emit(DownloaderEvent.DownloadTaskUpdate, newValue);
        return newValue;
    }

    // 开始下载
    private markTaskAsStarted(musicItem: IMusic.IMusicItem) {
        this.downloadingCount++;
        this.updateDownloadTask(musicItem, {
            status: DownloadStatus.Preparing,
        });
        
        // 显示下载开始通知
        const taskId = getMediaUniqueKey(musicItem);
        downloadNotificationManager.showDownloadNotification(taskId, musicItem).catch(error => {
            errorLog("Failed to show download notification", error);
        });
    }

    /** 内嵌音乐标签数据 */
    private async embedMusicTags(filePath: string, musicItem: IMusic.IMusicItem): Promise<void> {
        try {
            // 获取配置
            const tagConfig = {
                enabled: this.configService.getConfig("musicTag.enabled") ?? true,
                source: this.configService.getConfig("musicTag.source") ?? "plugin", // plugin or api
                writeOptions: {
                    tags: this.configService.getConfig("musicTag.write.tags") ?? true,
                    lyrics: this.configService.getConfig("musicTag.write.lyrics") ?? true,
                    cover: this.configService.getConfig("musicTag.write.cover") ?? true,
                },
                apiSources: this.configService.getConfig("musicTag.apiSources") ?? ["netease", "qqmusic", "kugou", "kuwo"],
                platformMapping: {
                    autoMap: this.configService.getConfig("musicTag.platformMapping.autoMap") ?? true,
                    mapping: this.configService.getConfig("musicTag.platformMapping.mapping") ?? {
                        "qq": "qqmusic",
                        "wy": "netease",
                        "kg": "kugou",
                        "kw": "kuwo",
                        "mg": "migu",
                    },
                },
                fields: {
                    basic: this.configService.getConfig("musicTag.fields.basic") ?? true,
                    extended: this.configService.getConfig("musicTag.fields.extended") ?? true,
                    technical: this.configService.getConfig("musicTag.fields.technical") ?? false,
                },
                advanced: {
                    overwriteExisting: this.configService.getConfig("musicTag.advanced.overwriteExisting") ?? true,
                    autoRetry: this.configService.getConfig("musicTag.advanced.autoRetry") ?? true,
                    retryCount: this.configService.getConfig("musicTag.advanced.retryCount") ?? 3,
                },
            };

            // 如果禁用了，直接返回
            if (!tagConfig.enabled) {
                return;
            }
            
            // 准备要写入的标签数据
            const meta: any = {};
            
            // 根据来源选择获取元数据的方式
            let enrichedData: any = null;
            
            if (tagConfig.source === "api") {
                // API源：从音乐平台API获取更准确的元数据
                
                // 如果开启了平台自动映射，根据插件平台选择对应的API
                if (tagConfig.platformMapping.autoMap && musicItem.platform) {
                    const platformMapping = tagConfig.platformMapping.mapping;
                    const mappedPlatform = platformMapping[musicItem.platform];
                    if (mappedPlatform) {
                        errorLog(`平台映射: ${musicItem.platform} -> ${mappedPlatform}`);
                    }
                }
                
                // 根据配置的数据源顺序尝试获取
                if (tagConfig.advanced.autoRetry) {
                    let retryCount = 0;
                    while (!enrichedData && retryCount < tagConfig.advanced.retryCount) {
                        try {
                            enrichedData = await musicMetadataAPI.searchBestMatch(
                                musicItem.title || "",
                                musicItem.artist || ""
                            );
                            if (enrichedData) break;
                        } catch (error) {
                            retryCount++;
                            if (retryCount >= tagConfig.advanced.retryCount) {
                                errorLog(`从音乐平台API获取元数据失败(重试${retryCount}次)`, error);
                            }
                        }
                    }
                } else {
                    try {
                        enrichedData = await musicMetadataAPI.searchBestMatch(
                            musicItem.title || "",
                            musicItem.artist || ""
                        );
                    } catch (error) {
                        errorLog("从音乐平台API获取元数据失败", error);
                    }
                }
                
                if (enrichedData) {
                    errorLog("从音乐平台API获取到元数据", {
                        title: enrichedData.title,
                        artist: enrichedData.artist,
                        album: enrichedData.album,
                        hasLyrics: !!enrichedData.lyrics,
                        hasCover: !!enrichedData.albumArt,
                    });
                }
            } else {
                // 插件源：通过调用插件方法获取完整元数据
                errorLog("使用插件源，开始获取完整元数据");
                
                // 获取插件实例
                const plugin = this.pluginManagerService.getByName(musicItem.platform);
                
                if (plugin) {
                    try {
                        enrichedData = {};
                        
                        // 1. 尝试获取详细音乐信息（如果插件支持）
                        if (plugin.methods.getMusicInfo) {
                            try {
                                const detailedInfo = await plugin.methods.getMusicInfo({
                                    id: musicItem.id,
                                    platform: musicItem.platform,
                                });
                                
                                if (detailedInfo) {
                                    Object.assign(enrichedData, {
                                        title: detailedInfo.title || musicItem.title,
                                        artist: detailedInfo.artist || musicItem.artist,
                                        album: detailedInfo.album || musicItem.album,
                                        albumArtist: detailedInfo.albumArtist,
                                        composer: detailedInfo.composer,
                                        genre: detailedInfo.genre,
                                        year: detailedInfo.year || detailedInfo.publishTime,
                                        trackNumber: detailedInfo.trackNumber || detailedInfo.track,
                                        totalTracks: detailedInfo.totalTracks,
                                        discNumber: detailedInfo.discNumber || detailedInfo.disc,
                                        totalDiscs: detailedInfo.totalDiscs,
                                        duration: detailedInfo.duration,
                                        isrc: detailedInfo.isrc,
                                        language: detailedInfo.language,
                                        copyright: detailedInfo.copyright,
                                        publisher: detailedInfo.publisher || detailedInfo.label,
                                        bpm: detailedInfo.bpm,
                                        mood: detailedInfo.mood,
                                        rating: detailedInfo.rating,
                                    });
                                }
                            } catch (error) {
                                errorLog("插件getMusicInfo失败", error);
                            }
                        }
                        
                        // 2. 获取歌词
                        if (plugin.methods.getLyric && tagConfig.writeOptions.lyrics) {
                            try {
                                const lyricData = await plugin.methods.getLyric(musicItem);
                                
                                if (lyricData) {
                                    if (typeof lyricData === "string") {
                                        enrichedData.lyrics = lyricData;
                                    } else if (lyricData.rawLrc) {
                                        enrichedData.lyrics = lyricData.rawLrc;
                                        if (lyricData.translation) {
                                            // 合并原歌词和翻译
                                            enrichedData.lyricsWithTranslation = this.mergeLyrics(
                                                lyricData.rawLrc,
                                                lyricData.translation
                                            );
                                        }
                                    }
                                }
                            } catch (error) {
                                errorLog("插件getLyric失败", error);
                            }
                        }
                        
                        // 3. 获取高清封面
                        if (tagConfig.writeOptions.cover) {
                            // 优先使用artwork字段
                            if (musicItem.artwork) {
                                enrichedData.albumArt = musicItem.artwork;
                                // 尝试获取高清版本
                                enrichedData.albumArtHD = this.getHighQualityImageUrl(musicItem.artwork);
                            }
                            
                            // 如果插件有专门的getPic方法
                            if (!enrichedData.albumArt && plugin.methods.getPic) {
                                try {
                                    const picUrl = await plugin.methods.getPic(musicItem);
                                    if (picUrl) {
                                        enrichedData.albumArt = picUrl;
                                        enrichedData.albumArtHD = this.getHighQualityImageUrl(picUrl);
                                    }
                                } catch (error) {
                                    errorLog("插件getPic失败", error);
                                }
                            }
                        }
                        
                        // 4. 从专辑信息补充元数据
                        if (plugin.methods.getAlbumInfo && musicItem.albumId && !enrichedData.album) {
                            try {
                                const albumInfo = await plugin.methods.getAlbumInfo(
                                    { 
                                        id: musicItem.albumId,
                                        platform: musicItem.platform, 
                                    },
                                    1
                                );
                                
                                if (albumInfo?.albumItem) {
                                    enrichedData.album = enrichedData.album || albumInfo.albumItem.name || albumInfo.albumItem.title;
                                    enrichedData.albumArtist = enrichedData.albumArtist || albumInfo.albumItem.artist;
                                    enrichedData.year = enrichedData.year || albumInfo.albumItem.publishTime;
                                    enrichedData.genre = enrichedData.genre || albumInfo.albumItem.genre;
                                    enrichedData.publisher = enrichedData.publisher || albumInfo.albumItem.label;
                                    
                                    if (!enrichedData.albumArt && albumInfo.albumItem.artwork) {
                                        enrichedData.albumArt = albumInfo.albumItem.artwork;
                                        enrichedData.albumArtHD = this.getHighQualityImageUrl(albumInfo.albumItem.artwork);
                                    }
                                }
                            } catch (error) {
                                errorLog("插件getAlbumInfo失败", error);
                            }
                        }
                        
                        // 5. 使用原始数据填充缺失字段
                        enrichedData.title = enrichedData.title || musicItem.title;
                        enrichedData.artist = enrichedData.artist || musicItem.artist;
                        enrichedData.album = enrichedData.album || musicItem.album;
                        
                        if (enrichedData) {
                            errorLog("插件源完整元数据获取成功", {
                                title: enrichedData.title,
                                artist: enrichedData.artist,
                                album: enrichedData.album,
                                hasLyrics: !!enrichedData.lyrics,
                                hasTranslatedLyrics: !!enrichedData.lyricsWithTranslation,
                                hasCover: !!enrichedData.albumArt,
                                hasHDCover: !!enrichedData.albumArtHD,
                                extendedFields: Object.keys(enrichedData).filter(k => enrichedData[k]).length,
                            });
                            
                            // 如果有翻译歌词且用户偏好翻译版本
                            if (tagConfig.lyric?.preferTranslated && enrichedData.lyricsWithTranslation) {
                                enrichedData.lyrics = enrichedData.lyricsWithTranslation;
                            }
                        }
                    } catch (error) {
                        errorLog("插件源处理出错，使用原始数据", error);
                        enrichedData = null;
                    }
                } else {
                    errorLog("未找到对应插件，使用原始数据");
                }
            }
            
            // 基本信息（根据配置决定是否写入）
            if (tagConfig.writeOptions.tags && tagConfig.fields.basic) {
                if (enrichedData?.title || musicItem.title) {
                    meta.title = enrichedData?.title || musicItem.title;
                }
                if (enrichedData?.artist || musicItem.artist) {
                    meta.artist = enrichedData?.artist || musicItem.artist;
                }
                if (enrichedData?.album || musicItem.album) {
                    meta.album = enrichedData?.album || musicItem.album;
                }
            }
            
            // 扩展字段（根据配置决定是否写入）
            if (tagConfig.writeOptions.tags && tagConfig.fields.extended) {
                if (enrichedData?.albumArtist || musicItem.albumArtist) {
                    meta.albumArtist = enrichedData?.albumArtist || musicItem.albumArtist;
                }
                if (enrichedData?.composer || musicItem.composer) {
                    meta.composer = enrichedData?.composer || musicItem.composer;
                }
                if (enrichedData?.year || musicItem.year) {
                    meta.year = String(enrichedData?.year || musicItem.year);
                }
                if (enrichedData?.genre || musicItem.genre) {
                    meta.genre = enrichedData?.genre || musicItem.genre;
                }
                if (enrichedData?.trackNumber || musicItem.trackNumber) {
                    meta.trackNumber = String(enrichedData?.trackNumber || musicItem.trackNumber);
                }
                if (enrichedData?.totalTracks || musicItem.totalTracks) {
                    meta.totalTracks = String(enrichedData?.totalTracks || musicItem.totalTracks);
                }
                if (enrichedData?.discNumber || musicItem.discNumber) {
                    meta.discNumber = String(enrichedData?.discNumber || musicItem.discNumber);
                }
                if (enrichedData?.totalDiscs || musicItem.totalDiscs) {
                    meta.totalDiscs = String(enrichedData?.totalDiscs || musicItem.totalDiscs);
                }
                if (enrichedData?.isrc || musicItem.isrc) {
                    meta.isrc = enrichedData?.isrc || musicItem.isrc;
                }
                if (musicItem.language) {
                    meta.language = musicItem.language;
                }
                if (enrichedData?.copyright || musicItem.copyright) {
                    meta.copyright = enrichedData?.copyright || musicItem.copyright;
                }
                if (enrichedData?.bpm || musicItem.bpm) {
                    meta.bpm = String(enrichedData?.bpm || musicItem.bpm);
                }
                if (musicItem.mood) {
                    meta.mood = musicItem.mood;
                }
                if (musicItem.rating) {
                    meta.rating = String(musicItem.rating);
                }
                if (enrichedData?.publisher || musicItem.publisher) {
                    meta.publisher = enrichedData?.publisher || musicItem.publisher;
                }
                if (musicItem.originalArtist) {
                    meta.originalArtist = musicItem.originalArtist;
                }
                if (musicItem.originalAlbum) {
                    meta.originalAlbum = musicItem.originalAlbum;
                }
                if (musicItem.originalYear) {
                    meta.originalYear = String(musicItem.originalYear);
                }
                if (musicItem.compilation !== undefined) {
                    meta.compilation = musicItem.compilation;
                }
            }
            
            // 歌词信息（根据配置决定是否写入）
            if (tagConfig.writeOptions.lyrics) {
                // const lyricPreferTranslated = this.configService.getConfig("musicTag.lyric.preferTranslated") ?? false;
                const lyricEmbedTimestamp = this.configService.getConfig("musicTag.lyric.embedTimestamp") ?? true;
                
                if (enrichedData?.lyrics) {
                    meta.lyric = enrichedData.lyrics;
                } else if (musicItem.rawLrc) {
                    meta.lyric = musicItem.rawLrc;
                } else if (musicItem.lyric?.lrc) {
                    meta.lyric = musicItem.lyric.lrc;
                }
                
                // 处理歌词时间戳
                if (meta.lyric && !lyricEmbedTimestamp) {
                    // 移除时间戳
                    meta.lyric = meta.lyric.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, "");
                }
            }
            
            // 技术信息（根据配置决定是否写入）
            if (tagConfig.writeOptions.tags && tagConfig.fields.technical) {
                // 评论信息（添加来源和下载时间信息）
                const downloadTime = new Date().toISOString().split("T")[0];
                const platformName = musicItem.platform || "MusicFree";
                meta.comment = `Downloaded from ${platformName} on ${downloadTime}`;
                
                // 如果有别名，可以加入评论
                if (musicItem.alias) {
                    meta.comment += `\nAlias: ${musicItem.alias}`;
                }
                
                // 添加编码器信息
                meta.encoder = "MusicFree";
                
                // 如果有官方URL
                if (musicItem.url && (musicItem.url.startsWith("http://") || musicItem.url.startsWith("https://"))) {
                    meta.url = musicItem.url;
                }
            }
            
            // 封面图片处理（根据配置决定是否写入）
            let coverPath: string | undefined;
            if (tagConfig.writeOptions.cover) {
                // 优先使用完整元数据的高清封面
                let coverSource = enrichedData?.albumArtHD || enrichedData?.albumArt || musicItem.artwork;
                const coverQuality = this.configService.getConfig("musicTag.coverQuality") ?? "high";
                
                if (coverSource) {
                    try {
                        // 如果是网络图片URL
                        if (coverSource.startsWith("http://") || coverSource.startsWith("https://")) {
                            // 根据质量设置调整URL（如果可能）
                            if (coverQuality === "medium" && !enrichedData?.albumArtHD) {
                                // 尝试调整为中等质量
                                coverSource = coverSource
                                    .replace("800x800", "500x500")
                                    .replace("/800/", "/500/")
                                    .replace("_800_", "_500_");
                            } else if (coverQuality === "low" && !enrichedData?.albumArtHD) {
                                // 尝试调整为低质量
                                coverSource = coverSource
                                    .replace("800x800", "300x300")
                                    .replace("/800/", "/300/")
                                    .replace("_800_", "_300_");
                            }
                            
                            // 如果启用了封面缓存
                            if (this.configService.getConfig("musicTag.cacheCovers") ?? true) {
                                // 尝试缓存封面到本地
                                const cachedPath = await this.cacheAlbumArt(coverSource, musicItem);
                                coverPath = cachedPath || coverSource;
                            } else {
                                coverPath = coverSource;
                            }
                        } else if (coverSource.startsWith("file://") || coverSource.startsWith("/")) {
                            // 本地文件路径
                            coverPath = coverSource;
                        } else if (coverSource.startsWith("data:image")) {
                            // Base64图片数据，需要先保存为临时文件
                            errorLog("暂不支持Base64格式的封面");
                        }
                    } catch (error) {
                        // 封面处理失败不影响其他标签
                        errorLog("封面处理失败", error);
                    }
                }
            }
            
            // 调用原生模块写入标签和封面
            // 检查是否有内容需要写入
            const hasTagsToWrite = Object.keys(meta).length > 0;
            const hasCoverToWrite = !!coverPath;
            
            if (!hasTagsToWrite && !hasCoverToWrite) {
                errorLog("没有需要写入的标签或封面");
                return;
            }
            
            if (hasCoverToWrite && hasTagsToWrite) {
                await Mp3Util.setMediaTagWithCover(filePath, meta, coverPath);
                errorLog("音乐标签和封面已成功内嵌", {
                    source: tagConfig.source,
                    file: path.basename(filePath),
                    title: meta.title,
                    artist: meta.artist,
                    album: meta.album,
                    hasLyric: !!meta.lyric,
                    hasCover: true,
                    extendedFields: Object.keys(meta).length,
                });
            } else if (hasTagsToWrite) {
                // 没有封面，只写入标签
                await Mp3Util.setMediaTag(filePath, meta);
                errorLog("音乐标签已成功内嵌", {
                    source: tagConfig.source,
                    file: path.basename(filePath),
                    title: meta.title,
                    artist: meta.artist,
                    album: meta.album,
                    hasLyric: !!meta.lyric,
                    hasCover: false,
                    extendedFields: Object.keys(meta).length,
                });
            } else if (hasCoverToWrite) {
                // 只写入封面（如果原生模块支持）
                await Mp3Util.setMediaCover?.(filePath, coverPath);
                errorLog("封面已成功内嵌", {
                    source: tagConfig.source,
                    file: path.basename(filePath),
                    hasCover: true,
                });
            }
        } catch (error) {
            // 标签写入失败不影响下载成功
            errorLog("写入音乐标签失败", {
                file: path.basename(filePath),
                error: error.message || error,
            });
        }
    }

    private markTaskAsCompleted(musicItem: IMusic.IMusicItem, filePath?: string) {
        this.downloadingCount--;
        this.updateDownloadTask(musicItem, {
            status: DownloadStatus.Completed,
        });
        
        // 显示下载完成通知
        const taskId = getMediaUniqueKey(musicItem);
        if (filePath) {
            downloadNotificationManager.showCompleted(taskId, musicItem, filePath).catch(error => {
                errorLog("Failed to show completion notification", error);
            });
        }
    }

    private markTaskAsError(musicItem: IMusic.IMusicItem, reason: DownloadFailReason, error?: Error) {
        this.downloadingCount--;
        this.updateDownloadTask(musicItem, {
            status: DownloadStatus.Error,
            errorReason: reason,
        });
        this.emit(DownloaderEvent.DownloadTaskError, reason, musicItem, error);
        
        // 显示下载错误通知
        const taskId = getMediaUniqueKey(musicItem);
        const errorMessage = this.getErrorMessage(reason);
        downloadNotificationManager.showError(taskId, errorMessage).catch(err => {
            errorLog("Failed to show error notification", err);
        });
    }

    /** 获取错误信息的友好提示 */
    private getErrorMessage(reason: DownloadFailReason): string {
        switch (reason) {
        case DownloadFailReason.NetworkOffline:
            return "网络连接已断开";
        case DownloadFailReason.NotAllowToDownloadInCellular:
            return "移动网络下禁止下载";
        case DownloadFailReason.FailToFetchSource:
            return "无法获取音乐源";
        case DownloadFailReason.NoWritePermission:
            return "没有存储写入权限";
        case DownloadFailReason.Unknown:
        default:
            return "下载失败";
        }
    }

    /** 合并原歌词和翻译 */
    private mergeLyrics(original: string, translation: string): string {
        if (!original || !translation) {
            return original || translation || "";
        }

        // 解析原歌词
        const originalLines = original.split("\n");
        const translationLines = translation.split("\n");
        
        // 创建时间戳到歌词的映射
        const originalMap = new Map<string, string>();
        const translationMap = new Map<string, string>();
        
        const timeRegex = /^\[(\d{2}:\d{2}\.\d{2,3})\]/;
        
        originalLines.forEach(line => {
            const match = line.match(timeRegex);
            if (match) {
                const time = match[1];
                const text = line.replace(timeRegex, "").trim();
                originalMap.set(time, text);
            }
        });
        
        translationLines.forEach(line => {
            const match = line.match(timeRegex);
            if (match) {
                const time = match[1];
                const text = line.replace(timeRegex, "").trim();
                translationMap.set(time, text);
            }
        });
        
        // 合并歌词
        const mergedLines: string[] = [];
        const allTimes = new Set([...originalMap.keys(), ...translationMap.keys()]);
        const sortedTimes = Array.from(allTimes).sort();
        
        sortedTimes.forEach(time => {
            const originalText = originalMap.get(time) || "";
            const translationText = translationMap.get(time) || "";
            
            if (originalText && translationText) {
                mergedLines.push(`[${time}]${originalText} / ${translationText}`);
            } else if (originalText) {
                mergedLines.push(`[${time}]${originalText}`);
            } else if (translationText) {
                mergedLines.push(`[${time}]${translationText}`);
            }
        });
        
        return mergedLines.join("\n");
    }

    /** 获取高质量图片URL */
    private getHighQualityImageUrl(url: string): string {
        if (!url || typeof url !== "string") {
            return url;
        }
        
        // 网易云音乐
        if (url.includes("music.126.net") || url.includes("netease")) {
            return url
                .replace(/\?param=\d+y\d+/, "?param=800y800")
                .replace(/thumbnail=\d+y\d+/, "thumbnail=800y800");
        }
        
        // QQ音乐
        if (url.includes("qq.com") || url.includes("qqmusic")) {
            return url
                .replace(/\/T\d+R\d+x\d+M\d+/, "/T002R800x800M000")
                .replace(/\/\d+\//, "/800/");
        }
        
        // 酷狗音乐
        if (url.includes("kugou.com")) {
            return url
                .replace(/\{size\}/, "800")
                .replace(/\/\d+\//, "/800/");
        }
        
        // 酷我音乐
        if (url.includes("kuwo.cn")) {
            return url
                .replace(/\/\d+\//, "/800/")
                .replace(/_\d+\./, "_800.");
        }
        
        // 咪咕音乐
        if (url.includes("migu.cn")) {
            return url
                .replace(/\/\d+x\d+/, "/800x800")
                .replace(/_\d+_\d+\./, "_800_800.");
        }
        
        // 默认返回原URL
        return url;
    }

    /** 缓存专辑封面 */
    private async cacheAlbumArt(url: string, musicItem: IMusic.IMusicItem): Promise<string | null> {
        try {
            if (!url || !url.startsWith("http")) {
                return null;
            }
            
            // 创建缓存目录
            const cacheDir = `${pathConst.cachePath}covers/`;
            const folderExists = await exists(cacheDir);
            if (!folderExists) {
                await mkdirR(cacheDir);
            }
            
            // 生成缓存文件名
            const ext = url.includes(".png") ? "png" : "jpg";
            const fileName = `${musicItem.platform}_${musicItem.id}.${ext}`;
            const filePath = `${cacheDir}${fileName}`;
            
            // 检查缓存是否存在
            if (await exists(filePath)) {
                return addFileScheme(filePath);
            }
            
            // 下载封面
            const downloadResult = await downloadFile({
                fromUrl: url,
                toFile: filePath,
                background: true,
            });
            
            await downloadResult.promise;
            return addFileScheme(filePath);
        } catch (error) {
            errorLog("缓存封面失败", error);
            return null;
        }
    }

    /** 匹配文件后缀 */
    private getExtensionName(url: string) {
        const regResult = url.match(
            // eslint-disable-next-line no-useless-escape
            /^https?\:\/\/.+\.([^\?\.]+?$)|(?:([^\.]+?)\?.+$)/,
        );
        if (regResult) {
            return regResult[1] ?? regResult[2] ?? "mp3";
        } else {
            return "mp3";
        }
    };

    /** 获取下载路径 */
    private getDownloadPath(fileName: string) {
        const dlPath =
            this.configService.getConfig("basic.downloadPath") ?? pathConst.downloadMusicPath;
        if (!dlPath.endsWith("/")) {
            return `${dlPath}/${fileName ?? ""}`;
        }
        return fileName ? dlPath + fileName : dlPath;
    };

    /** 获取缓存的下载路径 */
    private getCacheDownloadPath(fileName: string) {
        const cachePath = pathConst.downloadCachePath;
        if (!cachePath.endsWith("/")) {
            return `${cachePath}/${fileName ?? ""}`;
        }
        return fileName ? cachePath + fileName : cachePath;
    }


    private async downloadNextPendingTask() {
        // 确保通知管理器已初始化
        await this.initializeNotificationManager();
        
        const maxDownloadCount = Math.max(1, Math.min(+(this.configService.getConfig("basic.maxDownload") || 3), 10));
        const downloadQueue = getDefaultStore().get(downloadQueueAtom);

        // 如果超过最大下载数量，或者没有下载任务，则不执行
        if (this.downloadingCount >= maxDownloadCount || this.downloadingCount >= downloadQueue.length) {
            return;
        }

        // 寻找下一个pending task
        let nextTask: IDownloadTaskInfo | null = null;
        for (let i = 0; i < downloadQueue.length; i++) {
            const musicItem = downloadQueue[i];
            const key = getMediaUniqueKey(musicItem);
            const task = downloadTasks.get(key);
            if (task && task.status === DownloadStatus.Pending) {
                nextTask = task;
                break;
            }
        }

        // 没有下一个任务了
        if (!nextTask) {
            if (this.downloadingCount === 0) {
                this.emit(DownloaderEvent.DownloadQueueCompleted);
            }
            return;
        }

        const musicItem = nextTask.musicItem;
        // 更新下载状态
        this.markTaskAsStarted(musicItem);

        let url = musicItem.url;
        let headers = musicItem.headers;

        const plugin = this.pluginManagerService.getByName(musicItem.platform);

        try {
            if (plugin) {
                const qualityOrder = getQualityOrder(
                    nextTask.quality ??
                    this.configService.getConfig("basic.defaultDownloadQuality") ??
                    "320k",
                    this.configService.getConfig("basic.downloadQualityOrder") ?? "asc",
                );
                let data: IPlugin.IMediaSourceResult | null = null;
                for (let quality of qualityOrder) {
                    try {
                        data = await plugin.methods.getMediaSource(
                            musicItem,
                            quality,
                            1,
                            true,
                        );
                        if (!data?.url) {
                            continue;
                        }
                        break;
                    } catch { }
                }
                url = data?.url ?? url;
                headers = data?.headers;
            }
            if (!url) {
                throw new Error(DownloadFailReason.FailToFetchSource);
            }
        } catch (e: any) {
            /** 无法下载，跳过 */
            errorLog("下载失败-无法获取下载链接", {
                item: {
                    id: musicItem.id,
                    title: musicItem.title,
                    platform: musicItem.platform,
                    quality: nextTask.quality,
                },
                reason: e?.message ?? e,
            });

            if (e.message === DownloadFailReason.FailToFetchSource) {
                this.markTaskAsError(musicItem, DownloadFailReason.FailToFetchSource, e);
            } else {
                this.markTaskAsError(musicItem, DownloadFailReason.Unknown, e);
            }
            return;
        }

        // 预处理完成，可以开始处理下一个任务
        this.downloadNextPendingTask();

        // 下载逻辑
        // 识别文件后缀
        let extension = this.getExtensionName(url);
        if (supportLocalMediaType.every(item => item !== ("." + extension))) {
            extension = "mp3";
        }

        // 缓存下载地址
        const cacheDownloadPath = addFileScheme(
            this.getCacheDownloadPath(`${nanoid()}.${extension}`),
        );

        // 真实下载地址
        const targetDownloadPath = addFileScheme(
            this.getDownloadPath(`${nextTask.filename}.${extension}`),
        );

        // 检测下载位置是否存在
        try {
            const folder = path.dirname(targetDownloadPath);
            const folderExists = await exists(folder);
            if (!folderExists) {
                await mkdirR(folder);
            }
        } catch (e: any) {
            this.emit(DownloaderEvent.DownloadTaskError, DownloadFailReason.NoWritePermission, musicItem, e);
            return;
        }

        // 下载
        const taskId = getMediaUniqueKey(musicItem);
        const downloadResult = downloadFile({
            fromUrl: url ?? "",
            toFile: cacheDownloadPath,
            headers: headers,
            background: true,
            begin: (res) => {
                this.updateDownloadTask(musicItem, {
                    status: DownloadStatus.Downloading,
                    downloadedSize: 0,
                    fileSize: res.contentLength,
                    jobId: res.jobId,
                });
            },
            progress: (res) => {
                this.updateDownloadTask(musicItem, {
                    status: DownloadStatus.Downloading,
                    downloadedSize: res.bytesWritten,
                    fileSize: res.contentLength,
                    jobId: res.jobId,
                });
                
                // 更新通知进度
                if (res.contentLength > 0) {
                    const progress = Math.round((res.bytesWritten / res.contentLength) * 100);
                    downloadNotificationManager.updateProgress(taskId, {
                        downloadedSize: res.bytesWritten,
                        fileSize: res.contentLength,
                        progress: progress,
                    }).catch(error => {
                        errorLog("Failed to update notification progress", error);
                    });
                }
            },
        });
        
        // 保存jobId以便取消下载
        this.updateDownloadTask(musicItem, {
            jobId: downloadResult.jobId,
        });

        try {
            await downloadResult.promise;
            // 下载完成，移动文件
            await copyFile(cacheDownloadPath, targetDownloadPath);

            // 内嵌音乐标签数据（如果启用）
            const embedTags = this.configService.getConfig("musicTag.enabled") !== false; // 默认启用
            if (embedTags) {
                await this.embedMusicTags(targetDownloadPath, musicItem);
            }

            LocalMusicSheet.addMusic({
                ...musicItem,
                [internalSerializeKey]: {
                    localPath: targetDownloadPath,
                },
            });

            patchMediaExtra(musicItem, {
                downloaded: true,
                localPath: targetDownloadPath,
            });

            this.markTaskAsCompleted(musicItem, targetDownloadPath);
        } catch (e: any) {
            this.markTaskAsError(musicItem, DownloadFailReason.Unknown, e);
        }

        // 清理工作
        await unlink(cacheDownloadPath);
        this.downloadNextPendingTask();

        // 如果任务状态是完成，则从队列中移除
        const key = getMediaUniqueKey(musicItem);
        if (downloadTasks.get(key)?.status === DownloadStatus.Completed) {
            downloadTasks.delete(key);
            const currentQueue = getDefaultStore().get(downloadQueueAtom);
            const newDownloadQueue = currentQueue.filter(item => !isSameMediaItem(item, musicItem));
            getDefaultStore().set(downloadQueueAtom, newDownloadQueue);
        }
    }

    download(musicItems: IMusic.IMusicItem | IMusic.IMusicItem[], quality?: IMusic.IQualityKey) {
        if (network.isOffline) {
            this.emit(DownloaderEvent.DownloadError, DownloadFailReason.NetworkOffline);
            return;
        }

        if (network.isCellular && !this.configService.getConfig("basic.useCelluarNetworkDownload")) {
            this.emit(DownloaderEvent.DownloadError, DownloadFailReason.NotAllowToDownloadInCellular);
            return;
        }

        // 整理成数组
        if (!Array.isArray(musicItems)) {
            musicItems = [musicItems];
        }

        // 防止重复下载
        musicItems = musicItems.filter(m => {
            const key = getMediaUniqueKey(m);
            // 如果存在下载任务
            if (downloadTasks.has(key)) {
                return false;
            }

            // 设置下载任务
            downloadTasks.set(getMediaUniqueKey(m), {
                status: DownloadStatus.Pending,
                filename: this.generateFilename(m, quality),
                quality: quality,
                musicItem: m,
            });

            return true;
        });

        if (!musicItems.length) {
            return;
        }

        // 添加进任务队列
        const downloadQueue = getDefaultStore().get(downloadQueueAtom);
        const newDownloadQueue = [...downloadQueue, ...musicItems];
        getDefaultStore().set(downloadQueueAtom, newDownloadQueue);

        this.downloadNextPendingTask();
    }

    remove(musicItem: IMusic.IMusicItem) {
        // 删除下载任务
        const key = getMediaUniqueKey(musicItem);
        const task = downloadTasks.get(key);
        if (!task) {
            return false;
        }
        
        // 可以删除等待中、错误和正在下载的任务
        if (task.status === DownloadStatus.Pending || 
            task.status === DownloadStatus.Error ||
            task.status === DownloadStatus.Preparing ||
            task.status === DownloadStatus.Downloading) {
            
            // 如果正在下载，先停止下载
            if (task.status === DownloadStatus.Downloading && task.jobId) {
                try {
                    stopDownload(task.jobId);
                } catch (error) {
                    errorLog("Failed to stop download", error);
                }
            }
            
            // 如果正在下载，需要减少下载计数
            if (task.status === DownloadStatus.Downloading || task.status === DownloadStatus.Preparing) {
                this.downloadingCount--;
            }
            
            // 删除任务
            downloadTasks.delete(key);
            const downloadQueue = getDefaultStore().get(downloadQueueAtom);
            const newDownloadQueue = downloadQueue.filter(item => !isSameMediaItem(item, musicItem));
            getDefaultStore().set(downloadQueueAtom, newDownloadQueue);
            
            // 取消通知
            downloadNotificationManager.cancelNotification(key).catch(error => {
                errorLog("Failed to cancel notification", error);
            });
            
            // 触发下一个任务
            this.downloadNextPendingTask();
            
            return true;
        }
        return false;
    }
}


const downloader = new Downloader();
export default downloader;

export function useDownloadTask(musicItem: IMusic.IMusicItem) {
    const [downloadStatus, setDownloadStatus] = useState(downloadTasks.get(getMediaUniqueKey(musicItem)) ?? null);

    useEffect(() => {
        const callback = (task: IDownloadTaskInfo) => {
            if (isSameMediaItem(task?.musicItem, musicItem)) {
                setDownloadStatus(task);
            }
        };
        downloader.on(DownloaderEvent.DownloadTaskUpdate, callback);

        return () => {
            downloader.off(DownloaderEvent.DownloadTaskUpdate, callback);
        };
    }, [musicItem]);

    return downloadStatus;
}

export const useDownloadQueue = () => useAtomValue(downloadQueueAtom);