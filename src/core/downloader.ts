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
        this.updateDownloadTask(musicItem, {
            status: DownloadStatus.Preparing,
        });
        
        // 系统下载管理器会自动处理通知
    }

    private markTaskAsCompleted(musicItem: IMusic.IMusicItem, filePath?: string) {
        this.downloadingCount--;
        this.updateDownloadTask(musicItem, {
            status: DownloadStatus.Completed,
        });
        
        // 系统下载管理器会自动处理通知
    }

    private markTaskAsError(musicItem: IMusic.IMusicItem, reason: DownloadFailReason, error?: Error) {
        this.downloadingCount--;
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
                coverUrl: musicItem.artwork?.toString(),
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


    private async downloadNextPendingTask() {
        // 移除自定义通知管理器初始化
        // await this.initializeNotificationManager();
        
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
                    "master",
                    this.configService.getConfig("basic.downloadQualityOrder") ?? "desc",
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
        
        // 从musicItem.qualities中获取预期文件大小
        let expectedFileSize = 0;
        let qualityInfo = null;
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
        // 根据音质类型确定文件扩展名
        let extension = "mp3"; // 默认扩展名
        
        // 根据音质类型设置正确的扩展名
        if (taskQuality === "128k" || taskQuality === "320k") {
            // 128k 和 320k 是 MP3 格式，尝试从URL推断扩展名，默认为mp3
            const urlExtension = this.getExtensionName(url);
            if (supportLocalMediaType.some(item => item === ("." + urlExtension))) {
                extension = urlExtension;
            } else {
                extension = "mp3";
            }
        } else {
            // 其他所有音质（flac, hires, 等）都是 FLAC 格式
            extension = "flac";
        }
        
        devLog('info', '📁[下载器] 确定文件扩展名', {
            quality: taskQuality,
            extension: extension,
            urlExtension: this.getExtensionName(url)
        });

        // 真实下载地址
        const targetDownloadPath = this.getDownloadPath(`${nextTask.filename}.${extension}`);

        // 检测下载位置是否存在
        try {
            const folder = path.dirname(targetDownloadPath);
            const folderExists = await exists(folder);
            if (!folderExists) {
                const { mkdirR } = require("@/utils/fileUtils");
                await mkdirR(folder);
            }
        } catch (e: any) {
            this.emit(DownloaderEvent.DownloadTaskError, DownloadFailReason.NoWritePermission, musicItem, e);
            return;
        }

        // 使用系统下载管理器进行下载
        try {
            devLog('info', '📥[下载器] 开始使用系统下载管理器下载 (两阶段流程)', {
                title: musicItem.title,
                artist: musicItem.artist,
                targetPath: targetDownloadPath
            });
            
            const downloadInfo = await Mp3Util.downloadWithSystemManager(
                url,
                targetDownloadPath.replace('file://', ''),
                `${musicItem.title} - ${musicItem.artist}`,
                '正在下载音乐文件...',
                headers
            );
            
            devLog('info', '✅[下载器] 系统下载任务创建成功', {
                downloadId: downloadInfo.downloadId,
                tempPath: downloadInfo.tempPath,
                finalPath: downloadInfo.finalPath,
                title: musicItem.title
            });
            
            // 保存下载信息
            this.updateDownloadTask(musicItem, {
                status: DownloadStatus.Downloading,
                jobId: parseInt(downloadInfo.downloadId, 10),
            });

            // 基于插件提供的文件大小进行准确的下载完成检测
            const checkDownloadStatus = async () => {
                return new Promise<{tempPath: string, finalPath: string}>((resolve, reject) => {
                    let lastFileSize = 0;
                    let sameSizeCount = 0;
                    let checkCount = 0;
                    let isResolved = false; // 防止多次resolve
                    
                    // 设置最小文件大小和完成阈值
                    const minFileSize = expectedFileSize > 0 ? expectedFileSize * 0.1 : 50 * 1024; // 至少10%或50KB
                    const completeThreshold = expectedFileSize > 0 ? expectedFileSize * 0.98 : 100 * 1024; // 98%完成或100KB
                    
                    devLog('info', '📊[下载器] 开始文件大小监控 (临时路径)', {
                        tempPath: downloadInfo.tempPath,
                        expectedSize: expectedFileSize,
                        minSize: minFileSize,
                        completeThreshold: completeThreshold,
                        hasExpectedSize: expectedFileSize > 0
                    });
                    
                    const safeResolve = (result: {tempPath: string, finalPath: string}) => {
                        if (!isResolved) {
                            isResolved = true;
                            resolve(result);
                        }
                    };
                    
                    const checkFile = async () => {
                        if (isResolved) return; // 已经完成，不再检查
                        
                        try {
                            checkCount++;
                            const tempFilePath = downloadInfo.tempPath;
                            
                            devLog('info', '📊[下载器] 执行第' + checkCount + '次检查', {
                                tempPath: tempFilePath,
                                checkCount
                            });
                            
                            // 强制超时机制：检查次数超过90次（3分钟）直接完成
                            if (checkCount > 90) {
                                devLog('warn', '⏰[下载器] 监控超时，强制完成下载', {
                                    checkCount,
                                    tempPath: tempFilePath,
                                    expectedSize: expectedFileSize
                                });
                                safeResolve({
                                    tempPath: downloadInfo.tempPath,
                                    finalPath: downloadInfo.finalPath
                                });
                                return;
                            }
                            
                            // 使用react-native-fs检查文件
                            const { exists } = require('react-native-fs');
                            let fileExists = false;
                            try {
                                fileExists = await exists(tempFilePath);
                            } catch (existsError) {
                                devLog('warn', '⚠️[下载器] exists检查失败，等待重试', {
                                    error: existsError?.message || 'exists error',
                                    checkCount,
                                    tempPath: tempFilePath
                                });
                                // 如果exists失败，2秒后重试
                                if (!isResolved) {
                                    setTimeout(checkFile, 2000);
                                }
                                return;
                            }
                            
                            if (!fileExists) {
                                // 文件还未创建，继续等待
                                devLog('info', '📊[下载器] 临时文件不存在，继续等待', {
                                    checkCount,
                                    tempPath: tempFilePath
                                });
                                if (!isResolved) {
                                    setTimeout(checkFile, 2000);
                                }
                                return;
                            }
                            
                            // 获取文件大小
                            let currentSize = 0;
                            try {
                                const { stat } = require('react-native-fs');
                                const fileStats = await stat(tempFilePath);
                                currentSize = fileStats.size;
                            } catch (statError) {
                                devLog('warn', '⚠️[下载器] stat获取文件大小失败', {
                                    error: statError?.message || 'stat error',
                                    checkCount,
                                    tempPath: tempFilePath
                                });
                                // stat失败时，使用备选方案：假设文件至少有一定大小
                                if (checkCount > 30) {  // 1分钟后如果还是stat失败，就认为下载可能已完成
                                    devLog('warn', '⏰[下载器] stat持续失败，使用降级策略强制完成', {
                                        checkCount,
                                        tempPath: tempFilePath
                                    });
                                    safeResolve({
                                        tempPath: downloadInfo.tempPath,
                                        finalPath: downloadInfo.finalPath
                                    });
                                    return;
                                } else {
                                    // 继续重试
                                    if (!isResolved) {
                                        setTimeout(checkFile, 2000);
                                    }
                                    return;
                                }
                            }
                            
                            devLog('info', '📊[下载器] 检查下载进度 (临时文件)', {
                                tempPath: tempFilePath,
                                currentSize,
                                expectedSize: expectedFileSize,
                                progress: expectedFileSize > 0 ? (currentSize / expectedFileSize * 100).toFixed(1) + '%' : 'N/A',
                                lastSize: lastFileSize,
                                sameSizeCount,
                                checkCount
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
                                    devLog('info', '✅[下载器] 达到预期大小且文件稳定，下载完成', {
                                        finalSize: currentSize,
                                        expectedSize: expectedFileSize,
                                        completionRate: (currentSize / expectedFileSize * 100).toFixed(1) + '%',
                                        checkCount
                                    });
                                    safeResolve({
                                        tempPath: downloadInfo.tempPath,
                                        finalPath: downloadInfo.finalPath
                                    });
                                    return;
                                }
                                
                                // 如果没有预期大小，文件大小连续6次检查没有变化且超过最小大小，认为完成
                                if (expectedFileSize === 0 && sameSizeCount >= 6 && currentSize >= minFileSize) {
                                    devLog('info', '✅[下载器] 无预期大小，文件大小稳定且达到最小要求，下载完成', {
                                        finalSize: currentSize,
                                        stableChecks: sameSizeCount,
                                        checkCount
                                    });
                                    safeResolve({
                                        tempPath: downloadInfo.tempPath,
                                        finalPath: downloadInfo.finalPath
                                    });
                                    return;
                                }
                            } else {
                                // 文件还在增长
                                lastFileSize = currentSize;
                                sameSizeCount = 0;
                                
                                // 如果文件大小已经超过预期大小的105%，可能是估算错误，直接完成
                                if (expectedFileSize > 0 && currentSize > expectedFileSize * 1.05) {
                                    devLog('info', '✅[下载器] 文件大小超过预期，直接完成', {
                                        currentSize,
                                        expectedSize: expectedFileSize,
                                        overageRate: (currentSize / expectedFileSize * 100).toFixed(1) + '%',
                                        checkCount
                                    });
                                    safeResolve({
                                        tempPath: downloadInfo.tempPath,
                                        finalPath: downloadInfo.finalPath
                                    });
                                    return;
                                }
                            }
                            
                            // 继续下次检查
                            if (!isResolved) {
                                setTimeout(checkFile, 2000);
                            }
                            
                        } catch (error) {
                            devLog('error', '❌[下载器] 文件监控异常', {
                                error: error?.message || String(error),
                                checkCount,
                                tempPath: downloadInfo.tempPath
                            });
                            
                            // 如果监控异常持续超过1分钟，强制完成
                            if (checkCount > 30) {
                                devLog('warn', '⏰[下载器] 监控异常过多，强制完成下载', {
                                    checkCount,
                                    error: error?.message || String(error)
                                });
                                safeResolve({
                                    tempPath: downloadInfo.tempPath,
                                    finalPath: downloadInfo.finalPath
                                });
                            } else {
                                // 继续重试
                                if (!isResolved) {
                                    setTimeout(checkFile, 2000);
                                }
                            }
                        }
                    };
                    
                    // 开始第一次检查
                    checkFile();
                    
                    // 全局超时保护：5分钟强制完成
                    setTimeout(() => {
                        if (!isResolved) {
                            devLog('warn', '⏰[下载器] 全局超时，强制完成下载', {
                                timeout: '5 minutes',
                                tempPath: downloadInfo.tempPath,
                                checkCount
                            });
                            safeResolve({
                                tempPath: downloadInfo.tempPath,
                                finalPath: downloadInfo.finalPath
                            });
                        }
                    }, 5 * 60 * 1000);
                });
            };
            
            const {tempPath, finalPath} = await checkDownloadStatus();
            devLog('info', '🎉[下载器] 系统下载完成，开始移动文件', {
                tempPath,
                finalPath,
                title: musicItem.title
            });

            // 移动文件到最终路径
            try {
                const movedPath = await Mp3Util.moveDownloadedFile(tempPath, finalPath);
                devLog('info', '✅[下载器] 文件移动成功', {
                    movedPath,
                    title: musicItem.title
                });
                
                // 使用最终路径作为下载路径
                const finalDownloadPath = `file://${movedPath}`;

                // 异步写入音乐元数据（标签、歌词、封面）- 不阻塞下载完成
                this.writeMetadataToFile(musicItem, finalDownloadPath).catch(error => {
                    errorLog('元数据写入失败，但不影响下载完成', {
                        musicItem: musicItem.title,
                        error: error.message
                    });
                });

                LocalMusicSheet.addMusic({
                    ...musicItem,
                    [internalSerializeKey]: {
                        localPath: finalDownloadPath,
                    },
                });

                patchMediaExtra(musicItem, {
                    downloaded: true,
                    localPath: finalDownloadPath,
                });

                this.markTaskAsCompleted(musicItem, finalDownloadPath);
                
            } catch (moveError) {
                devLog('error', '❌[下载器] 文件移动失败', {
                    error: moveError?.message || String(moveError),
                    tempPath,
                    finalPath,
                    title: musicItem.title
                });
                // 如果移动失败，可以考虑使用临时路径或者标记为错误
                this.markTaskAsError(musicItem, DownloadFailReason.Unknown, moveError);
                return;
            }
            
        } catch (e: any) {
            devLog('error', '❌[下载器] 系统下载失败', {
                error: e?.message || String(e),
                title: musicItem.title
            });
            this.markTaskAsError(musicItem, DownloadFailReason.Unknown, e);
        }

        // 继续处理下一个任务
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
            
            // 调用简化版通知管理器取消通知（空实现，仅用于兼容性）
            downloadNotificationManager.cancelNotification(key).catch(error => {
                // 简化版本中此调用不会产生实际效果
                devLog('info', '📢[下载器] 取消通知调用（简化版本）', error);
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