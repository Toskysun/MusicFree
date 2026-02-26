import { internalSerializeKey, supportLocalMediaType } from "@/constants/commonConst";
import pathConst from "@/constants/pathConst";
import { IAppConfig } from "@/types/core/config";
import { IInjectable } from "@/types/infra";
import { escapeCharacter } from "@/utils/fileUtils";
import { errorLog, devLog } from "@/utils/log";
import { patchMediaExtra } from "@/utils/mediaExtra";
import { getMediaUniqueKey, isSameMediaItem } from "@/utils/mediaUtils";
import network from "@/utils/network";
import { getQualityOrder } from "@/utils/qualities";
import { generateFileNameFromConfig, DEFAULT_FILE_NAMING_CONFIG } from "@/utils/fileNamingFormatter";
import { formatLyricsByTimestamp } from "@/utils/lrcParser";
import EventEmitter from "eventemitter3";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import path from "path-browserify";
import { useEffect, useState } from "react";
import { exists, stopDownload } from "react-native-fs";
import Mp3Util from "@/native/mp3Util";
import LocalMusicSheet from "./localMusicSheet";
import { IPluginManager } from "@/types/core/pluginManager";
import downloadNotificationManager from "./downloadNotificationManager"; // 保留兼容性，但现在是简化版本
import musicMetadataManager from "./musicMetadataManager";
import type { IDownloadMetadataConfig, IDownloadTaskMetadata } from "@/types/metadata";
import { autoDecryptLyric } from "@/utils/musicDecrypter";


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
    // 内置下载任务id（如 http:123）
    internalTaskId?: string;
    // 下载引擎
    engine?: 'internal' | 'system';
    // 下载音质
    quality?: IMusic.IQualityKey;
    // 文件大小
    fileSize?: number;
    // 已下载大小
    downloadedSize?: number;
    // 原生通知生成的进度文案（与通知完全一致）
    progressText?: string;
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
    private nativeEventBound = false;
    private internalIdToKey = new Map<string, string>();
    // Lock to prevent race condition in downloadNextPendingTask
    private isSchedulingTask = false;
    // 移除自定义通知管理器状态
    // private notificationManagerInitialized = false;

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
        
        let filename: string;
        // 如果格式化失败，回退到旧的命名方式
        if (!result.filename) {
            filename = `${escapeCharacter(musicItem.platform)}@${escapeCharacter(
                musicItem.id,
            )}@${escapeCharacter(musicItem.title)}@${escapeCharacter(
                musicItem.artist,
            )}`.slice(0, 200);
        } else {
            filename = result.filename;
        }
        
        // 额外的安全处理：确保文件名不包含路径分隔符和特殊字符
        filename = escapeCharacter(filename);
        
        devLog('info', '📝[下载器] 生成文件名', {
            originalTitle: musicItem.title,
            originalArtist: musicItem.artist,
            platform: musicItem.platform,
            quality: quality,
            generatedFilename: filename
        });
        
        return filename;
    }


    injectDependencies(configService: IAppConfig, pluginManager: IPluginManager): void {
        this.configService = configService;
        this.pluginManagerService = pluginManager;
        
        // 注入插件管理器到音乐元数据管理器
        musicMetadataManager.injectPluginManager(pluginManager);
        
        // 移除自定义通知管理器初始化
        // this.initializeNotificationManager();

        // 绑定原生下载进度事件（只绑定一次）
        if (!this.nativeEventBound) {
            try {
                const { Mp3UtilEmitter } = require('@/native/mp3Util');
                Mp3UtilEmitter.addListener('Mp3UtilDownloadProgress', (e: any) => {
                    const key = this.internalIdToKey.get(e?.id);
                    if (!key) return;
                    const task = downloadTasks.get(key);
                    if (!task) return;
                    this.updateDownloadTask(task.musicItem, {
                        downloadedSize: typeof e?.downloaded === 'number' ? e.downloaded : undefined,
                        fileSize: typeof e?.total === 'number' && e.total > 0 ? e.total : task.fileSize,
                        progressText: typeof e?.progressText === 'string' ? e.progressText : task.progressText,
                    });
                });
                Mp3UtilEmitter.addListener('Mp3UtilDownloadCancelled', (e: any) => {
                    const key = this.internalIdToKey.get(e?.id);
                    if (!key) return;
                    const task = downloadTasks.get(key);
                    if (!task) return;
                    this.updateDownloadTask(task.musicItem, { status: DownloadStatus.Error });
                    this.internalIdToKey.delete(e?.id);
                });
                Mp3UtilEmitter.addListener('Mp3UtilDownloadError', (e: any) => {
                    const key = this.internalIdToKey.get(e?.id);
                    if (!key) return;
                    const task = downloadTasks.get(key);
                    if (!task) return;
                    this.updateDownloadTask(task.musicItem, { status: DownloadStatus.Error });
                    this.internalIdToKey.delete(e?.id);
                });
                // Completed 事件在下载返回后也会处理，但提前更新不会有坏处
                Mp3UtilEmitter.addListener('Mp3UtilDownloadCompleted', (e: any) => {
                    const key = this.internalIdToKey.get(e?.id);
                    if (key) {
                        this.internalIdToKey.delete(e?.id);
                    }
                });
                this.nativeEventBound = true;
            } catch (err) {
                devLog('warn', '⚠️[下载器] 绑定原生下载事件失败', String(err));
            }
        }
    }
    
    // 移除自定义通知管理器初始化方法
    // private async initializeNotificationManager(): Promise<void> { ... }

    private updateDownloadTask(musicItem: IMusic.IMusicItem, patch: Partial<IDownloadTaskInfo>) {
        const newValue = {
            ...downloadTasks.get(getMediaUniqueKey(musicItem)),
            ...patch,
        } as IDownloadTaskInfo;
        downloadTasks.set(getMediaUniqueKey(musicItem), newValue);
        
        devLog('info', '🔄[下载器] 触发下载任务更新事件', {
            status: newValue.status,
            musicTitle: newValue.musicItem?.title,
            downloadedSize: newValue.downloadedSize,
            fileSize: newValue.fileSize,
            hasListeners: this.listenerCount(DownloaderEvent.DownloadTaskUpdate)
        });
        
        this.emit(DownloaderEvent.DownloadTaskUpdate, newValue);
        return newValue;
    }

    // 开始下载
    private markTaskAsStarted(musicItem: IMusic.IMusicItem) {
        this.downloadingCount++;
        devLog('info', '▶️[下载器] 任务开始', {
            title: musicItem.title,
            downloadingCount: this.downloadingCount
        });
        this.updateDownloadTask(musicItem, {
            status: DownloadStatus.Preparing,
        });

        // 系统下载管理器会自动处理通知
    }

    private markTaskAsCompleted(musicItem: IMusic.IMusicItem, filePath?: string) {
        this.downloadingCount--;
        devLog('info', '✅[下载器] 任务完成', {
            title: musicItem.title,
            downloadingCount: this.downloadingCount,
            filePath
        });
        this.updateDownloadTask(musicItem, {
            status: DownloadStatus.Completed,
        });

        // 系统下载管理器会自动处理通知
    }

    private markTaskAsError(musicItem: IMusic.IMusicItem, reason: DownloadFailReason, error?: Error) {
        this.downloadingCount--;
        devLog('info', '❌[下载器] 任务失败', {
            title: musicItem.title,
            downloadingCount: this.downloadingCount,
            reason,
            error: error?.message
        });
        this.updateDownloadTask(musicItem, {
            status: DownloadStatus.Error,
            errorReason: reason,
        });
        this.emit(DownloaderEvent.DownloadTaskError, reason, musicItem, error);

        // 系统下载管理器会自动处理通知
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
        const dlPath = this.configService.getConfig("basic.downloadPath") ?? pathConst.downloadMusicPath;
        
        devLog('info', '📁[下载器] 获取下载路径', {
            fileName,
            configPath: this.configService.getConfig("basic.downloadPath"),
            defaultPath: pathConst.downloadMusicPath,
            finalPath: dlPath
        });
        
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

    /** 获取元数据写入配置 */
    private getMetadataConfig(): IDownloadMetadataConfig {
        return {
            enabled: this.configService.getConfig("basic.writeMetadata") ?? false,
            writeCover: this.configService.getConfig("basic.writeMetadataCover") ?? true,
            writeLyric: this.configService.getConfig("basic.writeMetadataLyric") ?? true,
            fetchExtendedInfo: this.configService.getConfig("basic.writeMetadataExtended") ?? false,
            lyricOrder: this.configService.getConfig("basic.lyricOrder") ?? ["romanization", "original", "translation"],
            enableWordByWord: this.configService.getConfig("basic.enableWordByWordLyric") ?? false,
        };
    }

    /** 写入音乐元数据到文件 */
    private async writeMetadataToFile(musicItem: IMusic.IMusicItem, filePath: string): Promise<void> {
        const config = this.getMetadataConfig();
        devLog('info', '🔧[下载器] 元数据写入配置检查', {
            enabled: config.enabled,
            writeCover: config.writeCover,
            writeLyric: config.writeLyric,
            isAvailable: musicMetadataManager.isAvailable(),
            musicTitle: musicItem.title,
            filePath
        });
        
        if (!config.enabled) {
            devLog('warn', '⚠️[下载器] 元数据写入功能未启用，请在设置中开启「音乐标签设置」');
            return;
        }
        
        if (!musicMetadataManager.isAvailable()) {
            devLog('error', '❌[下载器] 元数据管理器不可用');
            return;
        }

        try {
            const taskMetadata: IDownloadTaskMetadata = {
                musicItem,
                filePath,
                coverUrl: typeof musicItem.artwork === 'string' ? musicItem.artwork : undefined,
            };

            const success = await musicMetadataManager.writeMetadataForDownloadTask(taskMetadata, config);
            
            if (success) {
                errorLog('音乐元数据写入成功', {
                    title: musicItem.title,
                    artist: musicItem.artist,
                    filePath,
                });
            }
        } catch (error) {
            // 元数据写入失败不影响下载任务完成
            errorLog('音乐元数据写入失败', {
                musicItem: {
                    id: musicItem.id,
                    title: musicItem.title,
                    artist: musicItem.artist,
                    platform: musicItem.platform,
                },
                filePath,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /** 下载歌词文件到与音乐文件同目录 */
    private async downloadLyricFile(musicItem: IMusic.IMusicItem, musicFilePath: string): Promise<void> {
        const downloadLyricFile = this.configService.getConfig("basic.downloadLyricFile") ?? false;
        if (!downloadLyricFile) {
            return;
        }

        const lyricFileFormat = this.configService.getConfig("basic.lyricFileFormat") ?? "lrc";
        const lyricOrder = this.configService.getConfig("basic.lyricOrder") ?? ["romanization", "original", "translation"];
        const enableWordByWord = this.configService.getConfig("basic.enableWordByWordLyric") ?? false;

        devLog('info', '[下载器] 开始下载歌词文件', {
            musicTitle: musicItem.title,
            format: lyricFileFormat,
            order: lyricOrder,
            enableWordByWord
        });

        try {
            const plugin = this.pluginManagerService.getByName(musicItem.platform);
            if (!plugin) {
                devLog('warn', '[下载器] 无法获取插件，跳过歌词下载');
                return;
            }

            // 获取歌词
            const lyricSource = await plugin.methods.getLyric(musicItem);
            if (!lyricSource) {
                devLog('warn', '[下载器] 无法获取歌词，跳过歌词文件下载');
                return;
            }

            // 解密歌词（QRC格式自动解密，支持逐字歌词）
            const rawLrc = lyricSource.rawLrc ? await autoDecryptLyric(lyricSource.rawLrc, enableWordByWord) : undefined;
            const translation = lyricSource.translation ? await autoDecryptLyric(lyricSource.translation, enableWordByWord) : undefined;
            const romanization = lyricSource.romanization ? await autoDecryptLyric(lyricSource.romanization, enableWordByWord) : undefined;

            if (!rawLrc) {
                devLog('warn', '[下载器] 没有可用的原始歌词，跳过歌词文件下载');
                return;
            }

            // 使用 formatLyricsByTimestamp 格式化歌词（与播放时一致）
            const lyricContent = formatLyricsByTimestamp(
                rawLrc,
                translation,
                romanization,
                lyricOrder,
                { enableWordByWord }
            );

            if (!lyricContent) {
                devLog('warn', '[下载器] 格式化后的歌词为空，跳过歌词文件下载');
                return;
            }

            // 生成歌词文件路径（与音乐文件同名，不同后缀）
            const musicFilePathWithoutExt = musicFilePath.replace(/\.[^.]+$/, '');
            const lyricFilePath = `${musicFilePathWithoutExt}.${lyricFileFormat}`;

            // 写入歌词文件
            const { writeFile } = require('react-native-fs');
            await writeFile(lyricFilePath.replace('file://', ''), lyricContent, 'utf8');

            devLog('info', '[下载器] 歌词文件下载成功', {
                path: lyricFilePath,
                musicTitle: musicItem.title,
                format: lyricFileFormat,
                contentLength: lyricContent.length
            });

        } catch (error) {
            // 歌词文件下载失败不影响主下载任务
            errorLog('歌词文件下载失败', {
                musicItem: musicItem.title,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }


    private async downloadNextPendingTask() {
        // Prevent race condition: use lock to ensure atomic check-and-increment
        if (this.isSchedulingTask) {
            devLog('info', '🔒[下载器] 调度锁生效，跳过本次调度');
            return;
        }
        this.isSchedulingTask = true;

        const maxDownloadCount = Math.max(1, Math.min(+(this.configService.getConfig("basic.maxDownload") || 3), 10));
        const downloadQueue = getDefaultStore().get(downloadQueueAtom);

        devLog('info', '📋[下载器] 调度检查', {
            downloadingCount: this.downloadingCount,
            maxDownloadCount,
            queueLength: downloadQueue.length,
            pendingTasks: Array.from(downloadTasks.values()).filter(t => t.status === DownloadStatus.Pending).length
        });

        // 如果超过最大下载数量，或者没有下载任务，则不执行
        if (this.downloadingCount >= maxDownloadCount || this.downloadingCount >= downloadQueue.length) {
            this.isSchedulingTask = false;
            devLog('info', '⏸️[下载器] 达到并发上限或队列已满，等待中', {
                downloadingCount: this.downloadingCount,
                maxDownloadCount,
                queueLength: downloadQueue.length
            });
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
            this.isSchedulingTask = false;
            if (this.downloadingCount === 0) {
                this.emit(DownloaderEvent.DownloadQueueCompleted);
            }
            return;
        }

        const musicItem = nextTask.musicItem;
        // 更新下载状态 - increment downloadingCount before releasing lock
        this.markTaskAsStarted(musicItem);

        // Release lock after downloadingCount is incremented
        this.isSchedulingTask = false;

        let url = musicItem.url;
        let headers = musicItem.headers;
        let mflacEkey: string | undefined;

        const plugin = this.pluginManagerService.getByName(musicItem.platform);

        try {
            if (plugin) {
                const qualityOrder = getQualityOrder(
                    nextTask.quality ??
                    this.configService.getConfig("basic.defaultDownloadQuality") ??
                    "master",
                    this.configService.getConfig("basic.downloadQualityOrder") ?? "desc",
                );
                let data: IPlugin.IMediaSourceResult | null = null;
                const requestedQuality = nextTask.quality ?? 
                    this.configService.getConfig("basic.defaultDownloadQuality") ?? 
                    "master";
                let actualQuality: IMusic.IQualityKey | null = null;
                
                devLog('info', '📥[下载器] 开始音质获取', {
                    requestedQuality,
                    qualityOrder,
                    title: musicItem.title,
                    platform: musicItem.platform
                });
                
                for (let quality of qualityOrder) {
                    try {
                        devLog('info', '📥[下载器] 尝试获取音质', {
                            currentQuality: quality,
                            title: musicItem.title,
                            platform: musicItem.platform
                        });
                        
                        data = await plugin.methods.getMediaSource(
                            musicItem,
                            quality,
                            1,
                            true,
                        );
                        
                        if (!data?.url) {
                            devLog('warn', '⚠️[下载器] 音质获取失败 - 无URL', {
                                quality,
                                title: musicItem.title,
                                platform: musicItem.platform
                            });
                            continue; // 尝试下一个音质
                        }
                        
                        // 获取成功
                        actualQuality = quality;
                        break; // 成功获取，跳出循环
                        
                    } catch (error: any) {
                        devLog('warn', '⚠️[下载器] 音质获取异常', {
                            quality,
                            error: error?.message || String(error),
                            title: musicItem.title,
                            platform: musicItem.platform
                        });
                        // 继续尝试下一个音质
                    }
                }
                
                // 检查是否发生了音质降级
                if (actualQuality && actualQuality !== requestedQuality) {
                    devLog('warn', '🔄[下载器] 音质降级', {
                        requestedQuality,
                        actualQuality,
                        title: musicItem.title,
                        platform: musicItem.platform,
                        message: `用户请求${requestedQuality}音质，但插件只能提供${actualQuality}音质`
                    });
                    
                    // 更新任务的实际音质
                    nextTask.quality = actualQuality;
                } else if (actualQuality) {
                    devLog('info', '✅[下载器] 音质获取成功', {
                        quality: actualQuality,
                        title: musicItem.title,
                        platform: musicItem.platform
                    });
                }

                url = data?.url ?? url;
                headers = data?.headers;
                // plugin may provide ekey for encrypted mflac
                if (data?.ekey) {
                    // raw ekey may include leading digits; normalize later
                    // store for post-download decryption
                    mflacEkey = data.ekey as string;
                    devLog('info', '🔑[下载器] 从插件获取到 ekey', {
                        ekeyLength: mflacEkey.length,
                        platform: musicItem.platform,
                        quality: nextTask.quality
                    });
                } else {
                    devLog('warn', '⚠️[下载器] 未从插件获取到 ekey', {
                        platform: musicItem.platform,
                        quality: nextTask.quality,
                        dataKeys: data ? Object.keys(data) : []
                    });
                }
            }
            if (!url) {
                throw new Error(DownloadFailReason.FailToFetchSource);
            }

            // 检查是否是本地文件URL（已下载的歌曲）
            if (url.startsWith('file://') || url.startsWith('/')) {
                devLog('warn', '⚠️[下载器] 检测到本地文件URL，歌曲可能已下载', {
                    url,
                    title: musicItem.title
                });
                // 本地文件不需要下载，标记为已完成
                this.markTaskAsCompleted(musicItem, url.replace('file://', ''));
                setTimeout(() => this.downloadNextPendingTask(), 0);
                return;
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
            // Trigger next task after error
            setTimeout(() => this.downloadNextPendingTask(), 0);
            return;
        }

        // 预处理完成，可以开始处理下一个任务
        // Use setTimeout to ensure lock is released before next call
        setTimeout(() => this.downloadNextPendingTask(), 0);
        
        // 从musicItem.qualities中获取预期文件大小
        let expectedFileSize = 0;
        let qualityInfo: { url?: string; size?: string | number } | null = null;
        const taskQuality = nextTask.quality ?? 
            this.configService.getConfig("basic.defaultDownloadQuality") ?? 
            "320k";
        
        if (musicItem.qualities && musicItem.qualities[taskQuality]) {
            qualityInfo = musicItem.qualities[taskQuality];
            // 如果插件提供了size信息且是数字，直接使用
            if (typeof qualityInfo.size === 'number') {
                expectedFileSize = qualityInfo.size;
            } else if (typeof qualityInfo.size === 'string' && qualityInfo.size !== 'N/A') {
                // 解析size字符串，如"3.2MB", "1024KB"等
                const sizeStr = qualityInfo.size;
                const match = sizeStr.match(/^([\d.]+)\s*(B|KB|MB|GB)$/i);
                if (match) {
                    const value = parseFloat(match[1]);
                    const unit = match[2].toUpperCase();
                    switch (unit) {
                        case 'B':
                            expectedFileSize = value;
                            break;
                        case 'KB':
                            expectedFileSize = value * 1024;
                            break;
                        case 'MB':
                            expectedFileSize = value * 1024 * 1024;
                            break;
                        case 'GB':
                            expectedFileSize = value * 1024 * 1024 * 1024;
                            break;
                    }
                }
            }
            
            devLog('info', '📊[下载器] 从插件音质信息获取文件大小', {
                quality: taskQuality,
                sizeFromPlugin: qualityInfo.size,
                parsedSize: expectedFileSize,
                unit: 'bytes'
            });
        }

        // 下载逻辑 - 使用RNFetchBlob
        // 根据URL和音质类型确定文件扩展名
        let extension = "mp3"; // 默认扩展名

        // 首先检查URL是否是加密格式，根据加密格式确定解密后的扩展名
        const urlLower = url.toLowerCase().split('?')[0];
        if (urlLower.endsWith('.mgg')) {
            // mgg 解密后是 ogg
            extension = "ogg";
        } else if (urlLower.endsWith('.mmp4')) {
            // mmp4 解密后是 mp4
            extension = "mp4";
        } else if (urlLower.endsWith('.mflac')) {
            // mflac 解密后是 flac
            extension = "flac";
        } else if (taskQuality === "128k" || taskQuality === "320k" || taskQuality === "192k" || taskQuality === "96k") {
            // 128k/192k/320k/96k 是 MP3/OGG 格式，尝试从URL推断扩展名
            const urlExtension = this.getExtensionName(url);
            if (supportLocalMediaType.some(item => item === ("." + urlExtension))) {
                extension = urlExtension;
            } else {
                extension = "mp3";
            }
        } else {
            // 其他所有音质（flac, hires, dolby, atmos 等）默认是 FLAC 格式
            extension = "flac";
        }
        
        devLog('info', '📁[下载器] 确定文件扩展名', {
            quality: taskQuality,
            extension: extension,
            urlExtension: this.getExtensionName(url)
        });

        // 真实下载地址
        const targetDownloadPath = this.getDownloadPath(`${nextTask.filename}.${extension}`);
        // detect encrypted mflac/mgg/mmp4 and route to temp file for post-decrypt
        const { isMflacUrl, normalizeEkey } = require("@/utils/mflac");
        const willDownloadEncrypted = !!mflacEkey || isMflacUrl(url);

        // 根据URL确定加密文件的临时扩展名
        let encryptedExtension = "mflac";
        if (urlLower.endsWith('.mgg')) {
            encryptedExtension = "mgg";
        } else if (urlLower.endsWith('.mmp4')) {
            encryptedExtension = "mmp4";
        }

        devLog('info', '📋[下载器] 下载路径规划', {
            targetPath: targetDownloadPath,
            willDecrypt: willDownloadEncrypted,
            hasMflacEkey: !!mflacEkey,
            isMflacUrl: isMflacUrl(url),
            extension,
            encryptedExtension,
            url: url?.substring(0, 100) + '...'
        });

        const tempEncryptedPath = willDownloadEncrypted
            ? this.getDownloadPath(`${nextTask.filename}.${encryptedExtension}`)
            : targetDownloadPath;

        // 检测下载位置是否存在
        try {
            const folder = path.dirname(targetDownloadPath);
            const folderExists = await exists(folder);
            if (!folderExists) {
                const { mkdirR } = require("@/utils/fileUtils");
                await mkdirR(folder);
            }
        } catch (e: any) {
            this.markTaskAsError(musicItem, DownloadFailReason.NoWritePermission, e);
            setTimeout(() => this.downloadNextPendingTask(), 0);
            return;
        }

        // 使用系统下载管理器或内置HTTP下载器进行下载
        try {
            const useInternal = true; // 统一使用内置HTTP下载器与原生通知
            devLog('info', useInternal ? '📥[下载器] 开始使用内置HTTP下载器' : '📥[下载器] 开始使用系统下载管理器下载', {
                title: musicItem.title,
                artist: musicItem.artist,
                targetPath: targetDownloadPath
            });
            
            const destPath = tempEncryptedPath.replace('file://', '');
            const downloadId = useInternal
                ? await Mp3Util.downloadWithHttp({
                    url,
                    destinationPath: destPath,
                    // 标题遵循文件命名设置（不含扩展名）
                    title: nextTask.filename,
                    description: '正在下载音乐文件...',
                    headers,
                    showNotification: true,
                    coverUrl: typeof (musicItem as any)?.artwork === 'string' ? (musicItem as any).artwork : null,
                  })
                : await Mp3Util.downloadWithSystemManager(
                    url,
                    destPath,
                    `${musicItem.title} - ${musicItem.artist}`,
                    '正在下载音乐文件...',
                    headers
                  );
            
            devLog('info', useInternal ? '✅[下载器] 内置下载任务创建成功' : '✅[下载器] 系统下载任务创建成功', {
                downloadId,
                title: musicItem.title
            });
            
            // 保存downloadId以便取消下载
            const numericId = Number.parseInt(String(downloadId), 10);
            const updated = this.updateDownloadTask(musicItem, {
                status: DownloadStatus.Downloading,
                jobId: Number.isFinite(numericId) ? numericId : undefined,
                internalTaskId: !Number.isFinite(numericId) ? String(downloadId) : undefined,
                engine: useInternal ? 'internal' : 'system',
            });
            // 记录 internal id -> key 映射
            if (updated.internalTaskId) {
                this.internalIdToKey.set(updated.internalTaskId, getMediaUniqueKey(musicItem));
            }

            // 基于插件提供的文件大小进行准确的下载完成检测
            const checkDownloadStatus = async () => {
                return new Promise<boolean>((resolve, reject) => {
                    let lastFileSize = 0;
                    let sameSizeCount = 0;
                    
                    // 设置最小文件大小和完成阈值
                    const minFileSize = expectedFileSize > 0 ? expectedFileSize * 0.1 : 50 * 1024; // 至少10%或50KB
                    const completeThreshold = expectedFileSize > 0 ? expectedFileSize * 0.98 : 100 * 1024; // 98%完成或100KB
                    
                    devLog('info', '📊[下载器] 开始文件大小监控', {
                        expectedSize: expectedFileSize,
                        minSize: minFileSize,
                        completeThreshold: completeThreshold,
                        hasExpectedSize: expectedFileSize > 0
                    });
                    
                    const checkInterval = setInterval(async () => {
                        try {
                            // 检查实际下载的文件（可能是临时的.mflac文件）
                            const filePath = tempEncryptedPath.replace('file://', '');
                            const fileExists = await exists(filePath);

                            if (!fileExists) {
                                // 文件还未创建，继续等待
                                return;
                            }

                            // 使用stat获取准确的文件大小
                            const { stat } = require('react-native-fs');
                            try {
                                const fileStats = await stat(filePath);
                                const currentSize = fileStats.size;
                                
                                devLog('info', '📊[下载器] 检查下载进度', {
                                    currentSize,
                                    expectedSize: expectedFileSize,
                                    progress: expectedFileSize > 0 ? (currentSize / expectedFileSize * 100).toFixed(1) + '%' : 'N/A',
                                    lastSize: lastFileSize,
                                    sameSizeCount,
                                    filePath: filePath,
                                    isEncrypted: willDownloadEncrypted
                                });
                                
                                // 更新下载进度
                                this.updateDownloadTask(musicItem, {
                                    downloadedSize: currentSize,
                                    fileSize: expectedFileSize || currentSize
                                });
                                
                                // 检查文件大小变化
                                if (currentSize === lastFileSize) {
                                    sameSizeCount++;
                                    
                                    // 如果有准确的预期大小，当达到98%且文件大小稳定时认为完成
                                    if (expectedFileSize > 0 && currentSize >= completeThreshold && sameSizeCount >= 3) {
                                        clearInterval(checkInterval);
                                        devLog('info', '✅[下载器] 达到预期大小且文件稳定，下载完成', {
                                            finalSize: currentSize,
                                            expectedSize: expectedFileSize,
                                            completionRate: (currentSize / expectedFileSize * 100).toFixed(1) + '%'
                                        });
                                        resolve(true);
                                        return;
                                    }
                                    
                                    // 如果没有预期大小，文件大小连续6次检查没有变化且超过最小大小，认为完成
                                    if (expectedFileSize === 0 && sameSizeCount >= 6 && currentSize >= minFileSize) {
                                        clearInterval(checkInterval);
                                        devLog('info', '✅[下载器] 无预期大小，文件大小稳定且达到最小要求，下载完成', {
                                            finalSize: currentSize,
                                            stableChecks: sameSizeCount
                                        });
                                        resolve(true);
                                        return;
                                    }
                                } else {
                                    // 文件还在增长
                                    lastFileSize = currentSize;
                                    sameSizeCount = 0;
                                    
                                    // 如果文件大小已经超过预期大小的105%，可能是估算错误，直接完成
                                    if (expectedFileSize > 0 && currentSize > expectedFileSize * 1.05) {
                                        clearInterval(checkInterval);
                                        devLog('info', '✅[下载器] 文件大小超过预期，直接完成', {
                                            currentSize,
                                            expectedSize: expectedFileSize,
                                            overageRate: (currentSize / expectedFileSize * 100).toFixed(1) + '%'
                                        });
                                        resolve(true);
                                        return;
                                    }
                                }
                                
                            } catch (statError: any) {
                                // 文件可能正在写入或不可访问
                                devLog('warn', '⚠️[下载器] 获取文件状态失败，可能正在写入', statError?.message);
                            }
                        } catch (error) {
                            clearInterval(checkInterval);
                            reject(error);
                        }
                    }, 2000); // 每2秒检查一次
                    
                    // 30分钟超时
                    setTimeout(() => {
                        clearInterval(checkInterval);
                        reject(new Error('Download timeout - 30 minutes exceeded'));
                    }, 30 * 60 * 1000);
                });
            };

            if (!useInternal) {
                await checkDownloadStatus();
            }
            if (willDownloadEncrypted) {
                try {
                    const cleaned = normalizeEkey(mflacEkey);
                    devLog('info', '🔐[下载器] 开始解密加密文件', {
                        input: tempEncryptedPath,
                        output: targetDownloadPath,
                        encryptedExtension,
                        targetExtension: extension,
                        hasEkey: !!cleaned,
                        ekeyLength: cleaned?.length
                    });
                    await Mp3Util.decryptMflacToFlac(
                        (require('@/utils/fileUtils').removeFileScheme(tempEncryptedPath)),
                        (require('@/utils/fileUtils').removeFileScheme(targetDownloadPath)),
                        cleaned,
                    );
                    devLog('info', '✅[下载器] 解密成功', {
                        output: targetDownloadPath,
                        title: musicItem.title
                    });
                    // 删除临时加密文件
                    try {
                        const { unlink } = require('react-native-fs');
                        await unlink(require('@/utils/fileUtils').removeFileScheme(tempEncryptedPath));
                        devLog('info', '🗑️[下载器] 已删除临时加密文件', {
                            path: tempEncryptedPath
                        });
                    } catch (deleteError) {
                        devLog('warn', '⚠️[下载器] 删除临时文件失败', deleteError);
                    }
                } catch (e: any) {
                    devLog('error', '❌[下载器] mflac 解密失败', {
                        error: e.message,
                        input: tempEncryptedPath,
                        output: targetDownloadPath
                    });
                    this.markTaskAsError(musicItem, DownloadFailReason.Unknown, e);
                    setTimeout(() => this.downloadNextPendingTask(), 0);
                    return;
                }
            }
            devLog('info', '🎉[下载器] 系统下载完成', {
                path: targetDownloadPath,
                title: musicItem.title
            });

            // 异步写入音乐元数据（标签、歌词、封面）- 不阻塞下载完成
            this.writeMetadataToFile(musicItem, targetDownloadPath).catch(error => {
                errorLog('元数据写入失败，但不影响下载完成', {
                    musicItem: musicItem.title,
                    error: error.message
                });
            });

            // 异步下载歌词文件 - 不阻塞下载完成
            this.downloadLyricFile(musicItem, targetDownloadPath).catch(error => {
                errorLog('歌词文件下载失败，但不影响下载完成', {
                    musicItem: musicItem.title,
                    error: error.message
                });
            });

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
            devLog('error', '❌[下载器] 系统下载失败', {
                error: e?.message || String(e),
                title: musicItem.title
            });
            
            // 检查是否是路径不支持错误，提供友好的用户提示
            if (e?.code === 'UnsupportedPath') {
                // 显示用户友好的提示
                devLog('warn', '🚨[下载器] 路径不支持提示', {
                    currentPath: this.configService.getConfig("basic.downloadPath") ?? pathConst.downloadMusicPath,
                    suggestion: '请在设置中更改为系统支持的路径（如Music目录）'
                });
                this.markTaskAsError(musicItem, DownloadFailReason.NoWritePermission, e);
            } else {
                this.markTaskAsError(musicItem, DownloadFailReason.Unknown, e);
            }
        }

        // 继续处理下一个任务 - use setTimeout to ensure proper scheduling
        setTimeout(() => this.downloadNextPendingTask(), 0);

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

        // Start multiple concurrent downloads up to maxDownload limit
        const maxDownloadCount = Math.max(1, Math.min(+(this.configService.getConfig("basic.maxDownload") || 3), 10));
        const tasksToStart = Math.min(maxDownloadCount, musicItems.length);
        for (let i = 0; i < tasksToStart; i++) {
            // Use setTimeout to ensure lock is released between calls
            setTimeout(() => this.downloadNextPendingTask(), i * 10);
        }
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
            if (task.status === DownloadStatus.Downloading) {
                if (task.engine === 'system' && task.jobId) {
                    try { stopDownload(task.jobId); } catch (error) { errorLog("Failed to stop system download", error); }
                } else if (task.engine === 'internal' && task.internalTaskId) {
                    Mp3Util.cancelHttpDownload(task.internalTaskId).catch((error: any) => errorLog("Failed to cancel internal download", error));
                }
            }
            
            // 如果正在下载，需要减少下载计数
            if (task.status === DownloadStatus.Downloading || task.status === DownloadStatus.Preparing) {
                this.downloadingCount--;
            }
            
            // 删除任务
            downloadTasks.delete(key);
            // 清理映射
            if (task.internalTaskId) this.internalIdToKey.delete(task.internalTaskId);
            const downloadQueue = getDefaultStore().get(downloadQueueAtom);
            const newDownloadQueue = downloadQueue.filter(item => !isSameMediaItem(item, musicItem));
            getDefaultStore().set(downloadQueueAtom, newDownloadQueue);
            
            // 调用简化版通知管理器取消通知（空实现，仅用于兼容性）
            downloadNotificationManager.cancelNotification(key).catch(error => {
                // 简化版本中此调用不会产生实际效果
                devLog('info', '📢[下载器] 取消通知调用（简化版本）', error);
            });

            // 触发下一个任务 - use setTimeout to ensure proper scheduling
            setTimeout(() => this.downloadNextPendingTask(), 0);
            
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
