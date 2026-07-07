import { internalSerializeKey, supportLocalMediaType } from "@/constants/commonConst";
import pathConst from "@/constants/pathConst";
import { IAppConfig } from "@/types/core/config";
import { IInjectable } from "@/types/infra";
import { escapeCharacter, mkdirR, removeFileScheme } from "@/utils/fileUtils";
import { errorLog, devLog } from "@/utils/log";
import { getMediaExtraProperty, patchMediaExtra } from "@/utils/mediaExtra";
import { getMediaUniqueKey, isSameMediaItem } from "@/utils/mediaUtils";
import network from "@/utils/network";
import { getQualityOrder } from "@/utils/qualities";
import { generateFileNameFromConfig, DEFAULT_FILE_NAMING_CONFIG } from "@/utils/fileNamingFormatter";
import { formatLyricsByTimestamp } from "@/utils/lrcParser";
import { isMflacUrl, normalizeEkey } from "@/utils/mflac";
import EventEmitter from "eventemitter3";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import path from "path-browserify";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { downloadFile, exists, moveFile, stopDownload, unlink } from "react-native-fs";
import Mp3Util, {
    INativeDownloadTaskParams,
    INativeDownloadTaskStatus,
    NativeDownloadEmitter,
} from "@/native/mp3Util";
import Cenc from "@/native/cenc";
import LocalMusicSheet from "./localMusicSheet";
import { IPluginManager } from "@/types/core/pluginManager";
import musicMetadataManager from "./musicMetadataManager";
import type { IDownloadMetadataConfig, IDownloadTaskMetadata } from "@/types/metadata";
import { autoDecryptLyric } from "@/utils/musicDecrypter";

export enum DownloadStatus {
    Pending,
    Preparing,
    Downloading,
    Completed,
    Error,
}

export enum DownloaderEvent {
    DownloadError = "download-error",
    DownloadTaskUpdate = "download-task-update",
    DownloadTaskError = "download-task-error",
    DownloadQueueCompleted = "download-queue-completed",
}

export enum DownloadFailReason {
    NetworkOffline = "network-offline",
    NotAllowToDownloadInCellular = "not-allow-to-download-in-cellular",
    FailToFetchSource = "no-valid-source",
    NoWritePermission = "no-write-permission",
    Unknown = "unknown",
}

interface IDownloadTaskInfo {
    status: DownloadStatus;
    filename: string;
    quality?: IMusic.IQualityKey;
    fileSize?: number;
    downloadedSize?: number;
    progressText?: string;
    musicItem: IMusic.IMusicItem;
    errorReason?: DownloadFailReason;
}

interface IDownloadRuntimeInfo {
    taskId: string;
    targetDownloadPath: string;
    tempEncryptedPath: string;
    willDownloadEncrypted: boolean;
    mflacEkey?: string;
    cencCek?: string;
    extension: string;
    encryptedExtension: string;
}

interface IPrepareTask {
    musicItem: IMusic.IMusicItem;
    quality?: IMusic.IQualityKey;
}

interface IResolveTaskResult {
    runtimeInfo?: IDownloadRuntimeInfo;
    nativeParams?: INativeDownloadTaskParams;
    localFilePath?: string;
    quality?: IMusic.IQualityKey;
    expectedFileSize?: number;
    filename?: string;
    failReason?: DownloadFailReason;
}

interface IExtraPayload {
    musicItem: IMusic.IMusicItem;
    quality?: IMusic.IQualityKey;
    filename: string;
    runtimeInfo?: IDownloadRuntimeInfo;
}

const downloadQueueAtom = atom<IMusic.IMusicItem[]>([]);
const downloadTasks = new Map<string, IDownloadTaskInfo>();

interface IEvents {
    [DownloaderEvent.DownloadError]: (reason: DownloadFailReason, error?: Error) => void;
    [DownloaderEvent.DownloadTaskError]: (reason: DownloadFailReason, mediaItem: IMusic.IMusicItem, error?: Error) => void;
    [DownloaderEvent.DownloadTaskUpdate]: (task: IDownloadTaskInfo) => void;
    [DownloaderEvent.DownloadQueueCompleted]: (errorCount: number) => void;
}

class Downloader extends EventEmitter<IEvents> implements IInjectable {
    private configService!: IAppConfig;
    private pluginManagerService!: IPluginManager;
    private nativeEventBound = false;

    private prepareQueue: IPrepareTask[] = [];
    private activePrepareCount = 0;

    private queueBusy = false;

    // 有原生队列时，准备阶段（解析音源）并发固定为 3，真正的下载并发由原生按 basic.maxDownload 控制；
    // 无原生队列（JS 回退下载）时，准备阶段即下载阶段，并发跟随 basic.maxDownload 配置。
    private get maxPrepareConcurrency(): number {
        if (this.hasNativeDownloadQueue()) {
            return 3;
        }
        const numeric = Number(this.configService?.getConfig("basic.maxDownload"));
        return Number.isFinite(numeric) && numeric > 0
            ? Math.max(1, Math.min(Math.floor(numeric), 10))
            : 3;
    }

    private runtimeInfoByTaskId = new Map<string, IDownloadRuntimeInfo>();
    private jsDownloadJobs = new Map<string, number>();

    injectDependencies(configService: IAppConfig, pluginManager: IPluginManager): void {
        this.configService = configService;
        this.pluginManagerService = pluginManager;

        musicMetadataManager.injectPluginManager(pluginManager);
        try {
            this.bindNativeEvents();
        } catch (error) {
            devLog("warn", "⚠️[下载器] 绑定 Native 事件失败", String(error));
        }
        this.syncNativeConcurrency();
        void this.hydrateNativeTasks();
    }

    private bindNativeEvents() {
        if (this.nativeEventBound || !NativeDownloadEmitter) {
            if (!NativeDownloadEmitter) {
                devLog("info", "⚠️[下载器] NativeDownloadEmitter 不可用，将使用 JS 下载队列");
            }
            return;
        }

        NativeDownloadEmitter.addListener("NativeDownloadProgressBatch", (event: any) => {
            this.handleNativeProgressBatch(event);
        });
        NativeDownloadEmitter.addListener("NativeDownloadTaskStatusChanged", (event: any) => {
            void this.handleNativeTaskStatusChanged(event);
        });
        NativeDownloadEmitter.addListener("NativeDownloadQueueDrained", () => {
            this.maybeEmitQueueCompleted();
        });
        this.nativeEventBound = true;
    }

    private hasNativeDownloadQueue() {
        return !!NativeDownloadEmitter;
    }

    private async hydrateNativeTasks() {
        if (!this.hasNativeDownloadQueue()) {
            return;
        }

        try {
            const nativeTasks = await Mp3Util.getAllDownloadTasks();
            if (!Array.isArray(nativeTasks) || nativeTasks.length === 0) {
                return;
            }

            // 上一会话解析出的音源 URL 大概率已过期，恢复的任务一律移除原生记录，
            // 重新走 resolveTaskForNative 获取新 URL 后再入队。
            const restoredTasks: IPrepareTask[] = [];
            for (const nativeTask of nativeTasks) {
                const extra = this.parseExtraPayload(nativeTask.extraJson);
                if (!extra?.musicItem) {
                    await Mp3Util.removeDownloadTask(nativeTask.taskId).catch(() => {});
                    continue;
                }

                const key = getMediaUniqueKey(extra.musicItem);
                if (key !== nativeTask.taskId) {
                    await Mp3Util.removeDownloadTask(nativeTask.taskId).catch(() => {});
                    continue;
                }

                if (nativeTask.status === "COMPLETED" || nativeTask.status === "CANCELED") {
                    await Mp3Util.removeDownloadTask(nativeTask.taskId).catch(() => {});
                    continue;
                }

                // 本会话已重新发起同一任务时，直接丢弃旧的原生记录
                if (downloadTasks.has(key)) {
                    await Mp3Util.removeDownloadTask(nativeTask.taskId).catch(() => {});
                    continue;
                }

                await Mp3Util.removeDownloadTask(nativeTask.taskId).catch(() => {});

                const networkBlockedReason = this.getNetworkBlockedReason();
                const task: IDownloadTaskInfo = {
                    status: networkBlockedReason ? DownloadStatus.Error : DownloadStatus.Pending,
                    filename: extra.filename ?? this.generateFilename(extra.musicItem, extra.quality),
                    quality: extra.quality,
                    musicItem: extra.musicItem,
                    errorReason: networkBlockedReason,
                };
                downloadTasks.set(key, task);
                this.emit(DownloaderEvent.DownloadTaskUpdate, task);

                if (!networkBlockedReason) {
                    restoredTasks.push({ musicItem: extra.musicItem, quality: extra.quality });
                }
            }

            const restoredItems = Array.from(downloadTasks.values()).map(task => task.musicItem);
            if (restoredItems.length > 0) {
                // 与现有队列合并去重，避免覆盖本会话已加入的任务
                const queue = getDefaultStore().get(downloadQueueAtom);
                const appended = restoredItems.filter(
                    item => !queue.some(queued => isSameMediaItem(queued, item)),
                );
                if (appended.length > 0) {
                    getDefaultStore().set(downloadQueueAtom, [...queue, ...appended]);
                }
                this.queueBusy = true;
            }

            for (const task of restoredTasks) {
                this.pushPrepareTask(task);
            }
        } catch (error) {
            devLog("warn", "⚠️[下载器] 恢复 Native 任务失败", String(error));
        }
    }

    private getNetworkBlockedReason(): DownloadFailReason | undefined {
        if (network.isOffline) {
            return DownloadFailReason.NetworkOffline;
        }
        if (network.isCellular && !this.configService.getConfig("basic.useCelluarNetworkDownload")) {
            return DownloadFailReason.NotAllowToDownloadInCellular;
        }
        return undefined;
    }

    private syncNativeConcurrency() {
        if (!this.hasNativeDownloadQueue()) {
            return;
        }

        try {
            const rawMax = this.configService.getConfig("basic.maxDownload");
            const numeric = Number(rawMax);
            const max = Number.isFinite(numeric) && numeric > 0
                ? Math.max(1, Math.min(numeric, 10))
                : 3;
            Mp3Util.setDownloadMaxConcurrency(max).catch(error => {
                devLog("warn", "⚠️[下载器] 设置 Native 并发失败", String(error));
            });
        } catch (error) {
            devLog("warn", "⚠️[下载器] 读取下载并发配置失败，使用默认值 3", String(error));
            Mp3Util.setDownloadMaxConcurrency(3).catch(() => {
            });
        }
    }

    private generateFilename(musicItem: IMusic.IMusicItem, quality?: IMusic.IQualityKey): string {
        const config: IFileNaming.IFileNamingConfig = {
            type: this.configService.getConfig("basic.fileNamingType") ?? DEFAULT_FILE_NAMING_CONFIG.type,
            preset: this.configService.getConfig("basic.fileNamingPreset") ?? DEFAULT_FILE_NAMING_CONFIG.preset,
            custom: this.configService.getConfig("basic.fileNamingCustom") ?? DEFAULT_FILE_NAMING_CONFIG.custom,
            showQuality: this.configService.getConfig("basic.fileNamingShowQuality") ?? DEFAULT_FILE_NAMING_CONFIG.showQuality,
            maxLength: this.configService.getConfig("basic.fileNamingMaxLength") ?? DEFAULT_FILE_NAMING_CONFIG.maxLength,
            keepExtension: DEFAULT_FILE_NAMING_CONFIG.keepExtension,
        };

        const result = generateFileNameFromConfig(musicItem, config, quality);
        let filename: string;
        if (!result.filename) {
            filename = `${escapeCharacter(musicItem.platform)}@${escapeCharacter(
                musicItem.id,
            )}@${escapeCharacter(musicItem.title)}@${escapeCharacter(
                musicItem.artist,
            )}`.slice(0, 200);
        } else {
            filename = result.filename;
        }

        return escapeCharacter(filename);
    }

    private mapNativeStatus(status?: string): DownloadStatus {
        switch (status) {
            case "PENDING":
                return DownloadStatus.Pending;
            case "PREPARING":
                return DownloadStatus.Preparing;
            case "DOWNLOADING":
                return DownloadStatus.Downloading;
            case "PAUSED":
                return DownloadStatus.Pending;
            case "COMPLETED":
                return DownloadStatus.Completed;
            case "ERROR":
                return DownloadStatus.Error;
            case "CANCELED":
                return DownloadStatus.Error;
            default:
                return DownloadStatus.Error;
        }
    }

    private updateDownloadTask(musicItem: IMusic.IMusicItem, patch: Partial<IDownloadTaskInfo>) {
        const key = getMediaUniqueKey(musicItem);
        const newValue = {
            ...downloadTasks.get(key),
            ...patch,
        } as IDownloadTaskInfo;
        downloadTasks.set(key, newValue);
        this.emit(DownloaderEvent.DownloadTaskUpdate, newValue);
        return newValue;
    }

    private getExtensionName(url: string) {
        try {
            const pathname = url.split(/[?#]/)[0];
            const lastSegment = pathname.split("/").pop() ?? "";
            const dotIndex = lastSegment.lastIndexOf(".");
            if (dotIndex > 0 && dotIndex < lastSegment.length - 1) {
                const extension = lastSegment.slice(dotIndex + 1).toLowerCase();
                if (/^[a-z0-9]{1,5}$/.test(extension)) {
                    return extension;
                }
            }
        } catch {
        }
        return "mp3";
    }

    private getDownloadPath(fileName: string) {
        const dlPath = removeFileScheme(
            this.configService.getConfig("basic.downloadPath") ?? pathConst.downloadMusicPath,
        );
        if (!dlPath.endsWith("/")) {
            return `${dlPath}/${fileName ?? ""}`;
        }
        return fileName ? dlPath + fileName : dlPath;
    }

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

    private async writeMetadataToFile(musicItem: IMusic.IMusicItem, filePath: string): Promise<void> {
        const config = this.getMetadataConfig();
        if (!config.enabled) {
            return;
        }

        if (!musicMetadataManager.isAvailable()) {
            return;
        }

        try {
            const taskMetadata: IDownloadTaskMetadata = {
                musicItem,
                filePath,
                coverUrl: typeof musicItem.artwork === "string" ? musicItem.artwork : undefined,
            };

            await musicMetadataManager.writeMetadataForDownloadTask(taskMetadata, config);
        } catch (error) {
            errorLog("音乐元数据写入失败", {
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

    private async downloadLyricFile(musicItem: IMusic.IMusicItem, musicFilePath: string): Promise<void> {
        const downloadLyricFile = this.configService.getConfig("basic.downloadLyricFile") ?? false;
        if (!downloadLyricFile) {
            return;
        }

        const lyricFileFormat = this.configService.getConfig("basic.lyricFileFormat") ?? "lrc";
        const lyricOrder = this.configService.getConfig("basic.lyricOrder") ?? ["romanization", "original", "translation"];
        const enableWordByWord = this.configService.getConfig("basic.enableWordByWordLyric") ?? false;

        try {
            const plugin = this.pluginManagerService.getByName(musicItem.platform);
            if (!plugin) {
                return;
            }

            const lyricSource = await plugin.methods.getLyric(musicItem);
            if (!lyricSource) {
                return;
            }

            const rawLrc = lyricSource.rawLrc ? await autoDecryptLyric(lyricSource.rawLrc, enableWordByWord) : undefined;
            const translation = lyricSource.translation ? await autoDecryptLyric(lyricSource.translation, enableWordByWord) : undefined;
            const romanization = lyricSource.romanization ? await autoDecryptLyric(lyricSource.romanization, enableWordByWord) : undefined;

            if (!rawLrc) {
                return;
            }

            const lyricContent = formatLyricsByTimestamp(
                rawLrc,
                translation,
                romanization,
                lyricOrder,
                { enableWordByWord },
            );

            if (!lyricContent) {
                return;
            }

            const lyricFilePath = `${musicFilePath.replace(/\.[^.]+$/, "")}.${lyricFileFormat}`;
            const { writeFile } = require("react-native-fs");
            await writeFile(removeFileScheme(lyricFilePath), lyricContent, "utf8");
        } catch (error) {
            errorLog("歌词文件下载失败", {
                musicItem: musicItem.title,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private parseQualityFileSize(size: unknown): number {
        if (typeof size === "number") {
            return size;
        }
        if (typeof size !== "string" || size === "N/A") {
            return 0;
        }
        const match = size.trim().match(/^([\d.]+)\s*(b|kb|k|mb|m|gb|g)?$/i);
        if (!match) {
            return 0;
        }
        const value = parseFloat(match[1]);
        if (!Number.isFinite(value)) {
            return 0;
        }
        const unit = (match[2] ?? "B").toUpperCase();
        switch (unit) {
            case "B":
                return value;
            case "K":
            case "KB":
                return value * 1024;
            case "M":
            case "MB":
                return value * 1024 * 1024;
            case "G":
            case "GB":
                return value * 1024 * 1024 * 1024;
            default:
                return 0;
        }
    }

    private mapNativeErrorToReason(error?: string | null): DownloadFailReason {
        if (!error) {
            return DownloadFailReason.Unknown;
        }
        const normalized = error.toLowerCase();
        if (normalized.includes("permission") || normalized.includes("parent directory")) {
            return DownloadFailReason.NoWritePermission;
        }
        if (normalized.includes("source") || normalized.includes("url")) {
            return DownloadFailReason.FailToFetchSource;
        }
        return DownloadFailReason.Unknown;
    }

    private parseExtraPayload(extraJson?: string | null): IExtraPayload | null {
        if (!extraJson) {
            return null;
        }
        try {
            const parsed = JSON.parse(extraJson);
            if (!parsed || !parsed.musicItem) {
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    }

    private maybeEmitQueueCompleted() {
        const hasProcessing = Array.from(downloadTasks.values()).some(task =>
            task.status === DownloadStatus.Pending ||
            task.status === DownloadStatus.Preparing ||
            task.status === DownloadStatus.Downloading,
        );
        if (!hasProcessing && this.activePrepareCount === 0 && this.prepareQueue.length === 0 && this.queueBusy) {
            this.queueBusy = false;
            const errorCount = Array.from(downloadTasks.values()).filter(
                task => task.status === DownloadStatus.Error,
            ).length;
            this.emit(DownloaderEvent.DownloadQueueCompleted, errorCount);
        }
    }

    private pushPrepareTask(task: IPrepareTask) {
        this.prepareQueue.push(task);
        this.queueBusy = true;
        this.pumpPrepareQueue();
    }

    private pumpPrepareQueue() {
        while (this.activePrepareCount < this.maxPrepareConcurrency && this.prepareQueue.length > 0) {
            const next = this.prepareQueue.shift();
            if (!next) {
                break;
            }
            this.activePrepareCount++;
            void this.prepareAndStartTask(next.musicItem, next.quality).finally(() => {
                this.activePrepareCount--;
                this.pumpPrepareQueue();
                this.maybeEmitQueueCompleted();
            });
        }
    }

    private async prepareAndStartTask(musicItem: IMusic.IMusicItem, quality?: IMusic.IQualityKey) {
        const key = getMediaUniqueKey(musicItem);
        const task = downloadTasks.get(key);
        if (!task) {
            return;
        }

        this.updateDownloadTask(musicItem, {
            status: DownloadStatus.Preparing,
            errorReason: undefined,
        });

        let resolved: IResolveTaskResult;
        try {
            resolved = await this.resolveTaskForNative(musicItem, quality);
        } catch (error) {
            const reason = DownloadFailReason.Unknown;
            this.updateDownloadTask(musicItem, {
                status: DownloadStatus.Error,
                errorReason: reason,
            });
            this.emit(DownloaderEvent.DownloadTaskError, reason, musicItem, error as Error);
            return;
        }

        if (resolved.failReason) {
            this.updateDownloadTask(musicItem, {
                status: DownloadStatus.Error,
                errorReason: resolved.failReason,
            });
            this.emit(DownloaderEvent.DownloadTaskError, resolved.failReason, musicItem);
            return;
        }

        // The task may be removed by user while source resolving is still in progress.
        if (!downloadTasks.has(key)) {
            return;
        }

        if (resolved.localFilePath) {
            LocalMusicSheet.addMusic({
                ...musicItem,
                [internalSerializeKey]: {
                    localPath: resolved.localFilePath,
                },
            });
            patchMediaExtra(musicItem, {
                downloaded: true,
                localPath: resolved.localFilePath,
            });

            this.updateDownloadTask(musicItem, {
                status: DownloadStatus.Completed,
                quality: resolved.quality,
            });
            this.cleanupTaskStateByKey(key, false);
            this.maybeEmitQueueCompleted();
            return;
        }

        if (!resolved.nativeParams || !resolved.runtimeInfo) {
            this.updateDownloadTask(musicItem, {
                status: DownloadStatus.Error,
                errorReason: DownloadFailReason.Unknown,
            });
            this.emit(DownloaderEvent.DownloadTaskError, DownloadFailReason.Unknown, musicItem);
            return;
        }

        // 落盘文件名以解析结果为准（音质可能降级、路径可能加了去重后缀）
        const resolvedFilename = resolved.filename ?? task.filename;
        if (resolvedFilename !== task.filename) {
            this.updateDownloadTask(musicItem, { filename: resolvedFilename });
        }

        const extraPayload: IExtraPayload = {
            musicItem,
            quality: resolved.quality,
            filename: resolvedFilename,
            runtimeInfo: resolved.runtimeInfo,
        };
        resolved.nativeParams.extraJson = JSON.stringify(extraPayload);

        this.runtimeInfoByTaskId.set(key, resolved.runtimeInfo);

        if (!this.hasNativeDownloadQueue()) {
            await this.runJsDownloadTask(
                key,
                resolved.nativeParams,
                resolved.runtimeInfo,
                resolved.quality,
                resolved.expectedFileSize,
            );
            return;
        }

        const nativeAdded = await Mp3Util.addDownloadTask(resolved.nativeParams).catch(error => {
            devLog("error", "❌[下载器] 添加 Native 任务失败", error);
            return false;
        });

        // 解析/添加期间任务可能被用户删除，此时要把刚加入的原生任务撤掉，避免产生幽灵下载
        if (!downloadTasks.has(key)) {
            if (nativeAdded) {
                void Mp3Util.cancelDownloadTask(key).catch(() => {});
                void Mp3Util.removeDownloadTask(key).catch(() => {});
            }
            this.runtimeInfoByTaskId.delete(key);
            return;
        }

        if (!nativeAdded) {
            this.updateDownloadTask(musicItem, {
                status: DownloadStatus.Error,
                errorReason: DownloadFailReason.Unknown,
            });
            this.emit(DownloaderEvent.DownloadTaskError, DownloadFailReason.Unknown, musicItem);
            return;
        }

        this.updateDownloadTask(musicItem, {
            status: DownloadStatus.Preparing,
            quality: resolved.quality,
            fileSize: resolved.expectedFileSize,
        });
    }

    private formatFileSize(bytes?: number) {
        if (!bytes || bytes <= 0) {
            return "0 B";
        }
        const units = ["B", "KB", "MB", "GB"];
        let value = bytes;
        let unitIndex = 0;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex += 1;
        }
        return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }

    private async runJsDownloadTask(
        taskId: string,
        nativeParams: INativeDownloadTaskParams,
        runtimeInfo: IDownloadRuntimeInfo,
        quality?: IMusic.IQualityKey,
        expectedFileSize?: number,
    ) {
        const task = downloadTasks.get(taskId);
        if (!task) {
            return;
        }

        this.updateDownloadTask(task.musicItem, {
            status: DownloadStatus.Downloading,
            quality,
            fileSize: expectedFileSize,
            downloadedSize: 0,
            progressText: expectedFileSize ? `0 B / ${this.formatFileSize(expectedFileSize)}` : undefined,
        });

        try {
            const download = downloadFile({
                fromUrl: nativeParams.url,
                toFile: removeFileScheme(nativeParams.destinationPath),
                headers: nativeParams.headers ?? {},
                background: Platform.OS === "ios",
                progressInterval: 500,
                progressDivider: 1,
                begin: res => {
                    const currentTask = downloadTasks.get(taskId);
                    if (!currentTask) {
                        return;
                    }
                    const total = res.contentLength > 0
                        ? res.contentLength
                        : expectedFileSize;
                    this.updateDownloadTask(currentTask.musicItem, {
                        status: DownloadStatus.Downloading,
                        fileSize: total,
                        progressText: total ? `0 B / ${this.formatFileSize(total)}` : undefined,
                    });
                },
                progress: res => {
                    const currentTask = downloadTasks.get(taskId);
                    if (!currentTask) {
                        return;
                    }
                    const total = res.contentLength > 0
                        ? res.contentLength
                        : currentTask.fileSize;
                    this.updateDownloadTask(currentTask.musicItem, {
                        status: DownloadStatus.Downloading,
                        downloadedSize: res.bytesWritten,
                        fileSize: total,
                        progressText: total
                            ? `${this.formatFileSize(res.bytesWritten)} / ${this.formatFileSize(total)}`
                            : `已下载 ${this.formatFileSize(res.bytesWritten)}`,
                    });
                },
            });

            this.jsDownloadJobs.set(taskId, download.jobId);
            const result = await download.promise;
            if (!downloadTasks.has(taskId)) {
                return;
            }

            if (result.statusCode < 200 || result.statusCode >= 300) {
                throw new Error(`download failed with status ${result.statusCode}`);
            }

            await this.completeTaskAfterDownload(taskId, false);
        } catch (error) {
            const currentTask = downloadTasks.get(taskId);
            if (!currentTask) {
                return;
            }
            await unlink(removeFileScheme(nativeParams.destinationPath)).catch(() => {});
            this.updateDownloadTask(currentTask.musicItem, {
                status: DownloadStatus.Error,
                errorReason: DownloadFailReason.Unknown,
            });
            this.emit(DownloaderEvent.DownloadTaskError, DownloadFailReason.Unknown, currentTask.musicItem, error as Error);
        } finally {
            this.jsDownloadJobs.delete(taskId);
        }
    }

    /** 判断某个路径是否已经属于另一首歌曲的本地文件 */
    private isPathOwnedByOtherMusic(filePath: string, musicItem: IMusic.IMusicItem): boolean {
        const normalized = removeFileScheme(filePath);
        for (const item of LocalMusicSheet.getMusicList()) {
            if (isSameMediaItem(item, musicItem)) {
                continue;
            }
            const localPath = (item as any)?.[internalSerializeKey]?.localPath ??
                getMediaExtraProperty(item, "localPath");
            if (typeof localPath === "string" && removeFileScheme(localPath) === normalized) {
                return true;
            }
        }
        return false;
    }

    /**
     * 计算不与其他任务/其他歌曲文件冲突的下载路径。
     * 冲突时追加 " (n)" 后缀；属于本歌曲自己的旧文件允许复用（下载成功后覆盖）。
     */
    private async resolveUniqueDownloadPaths(
        taskId: string,
        musicItem: IMusic.IMusicItem,
        baseFilename: string,
        extension: string,
        willDownloadEncrypted: boolean,
        encryptedExtension: string,
    ): Promise<{ targetDownloadPath: string; tempEncryptedPath: string; filename: string }> {
        const activePaths = new Set<string>();
        for (const [id, info] of this.runtimeInfoByTaskId) {
            if (id === taskId) {
                continue;
            }
            activePaths.add(removeFileScheme(info.targetDownloadPath));
            activePaths.add(removeFileScheme(info.tempEncryptedPath));
        }

        for (let suffix = 0; ; ++suffix) {
            const filename = suffix === 0 ? baseFilename : `${baseFilename} (${suffix})`;
            const target = this.getDownloadPath(`${filename}.${extension}`);
            // 未加密的下载也先写入 .part 临时文件，成功后再移动到目标路径，
            // 避免下载失败破坏已有文件，也避免原生 Range 续传误续到旧文件上。
            const temp = willDownloadEncrypted
                ? this.getDownloadPath(`${filename}.${encryptedExtension}`)
                : `${target}.part`;

            if (activePaths.has(target) || activePaths.has(temp)) {
                continue;
            }

            const targetExists = await exists(target).catch(() => false);
            if (targetExists && this.isPathOwnedByOtherMusic(target, musicItem)) {
                continue;
            }

            // 清理上次残留的临时文件，确保全新下载（残片可能来自不同 URL/音质，续传会污染文件）
            try {
                if (await exists(temp)) {
                    await unlink(temp);
                }
            } catch {
            }

            return { targetDownloadPath: target, tempEncryptedPath: temp, filename };
        }
    }

    private async resolveTaskForNative(
        musicItem: IMusic.IMusicItem,
        quality?: IMusic.IQualityKey,
    ): Promise<IResolveTaskResult> {
        let url = musicItem.url;
        let headers = musicItem.headers;
        let mflacEkey: string | undefined;
        let cencCek: string | undefined;
        let actualQuality = quality ??
            this.configService.getConfig("basic.defaultDownloadQuality") ??
            "master";

        const mflacDecryptSupported = Mp3Util.isMflacDecryptAvailable();
        const cencDecryptSupported = Cenc.isAvailable();

        const plugin = this.pluginManagerService.getByName(musicItem.platform);
        if (plugin) {
            const qualityOrder = getQualityOrder(
                actualQuality,
                this.configService.getConfig("basic.downloadQualityOrder") ?? "desc",
            );

            for (const currentQuality of qualityOrder) {
                try {
                    // 最后一个参数绕过本地文件与 URL 缓存：下载必须拿最新的远程源，
                    // 否则已下载过的歌曲会被本地路径短路，「重新下载」永远不生效
                    const data: IPlugin.IMediaSourceResult | null = await plugin.methods.getMediaSource(
                        musicItem,
                        currentQuality,
                        1,
                        true,
                        true,
                    );
                    if (!data?.url) {
                        continue;
                    }

                    const candidateCek = data.cek;
                    const candidateEkey = normalizeEkey(data.ekey as string | undefined) || undefined;
                    const encrypted = !!candidateCek || !!candidateEkey || isMflacUrl(data.url);
                    if (encrypted) {
                        // 加密源必须具备密钥且当前平台支持解密，否则下载完也无法解密，
                        // 提前跳过该音质，尝试下一档
                        if (candidateCek && !cencDecryptSupported) {
                            continue;
                        }
                        if (!candidateCek && (!candidateEkey || !mflacDecryptSupported)) {
                            continue;
                        }
                    }

                    url = data.url;
                    headers = data.headers;
                    const userAgent = data.userAgent ?? data.headers?.["user-agent"];
                    if (userAgent && !headers?.["User-Agent"] && !headers?.["user-agent"]) {
                        headers = { ...(headers ?? {}), "User-Agent": userAgent };
                    }
                    mflacEkey = candidateEkey;
                    cencCek = candidateCek;
                    actualQuality = currentQuality;
                    break;
                } catch {
                    continue;
                }
            }
        }

        if (!url) {
            return { failReason: DownloadFailReason.FailToFetchSource };
        }

        if (url.startsWith("file://") || url.startsWith("/")) {
            return {
                localFilePath: removeFileScheme(url),
                quality: actualQuality,
            };
        }

        // 兜底 URL（musicItem.url）同样要过加密源校验
        const fallbackEncrypted = !!cencCek || !!mflacEkey || isMflacUrl(url);
        if (fallbackEncrypted) {
            if (cencCek && !cencDecryptSupported) {
                return { failReason: DownloadFailReason.FailToFetchSource };
            }
            if (!cencCek && (!mflacEkey || !mflacDecryptSupported)) {
                return { failReason: DownloadFailReason.FailToFetchSource };
            }
        }

        const qualityInfo = musicItem.qualities?.[actualQuality];
        const expectedFileSize = this.parseQualityFileSize(qualityInfo?.size);

        const urlLower = url.toLowerCase().split("?")[0];
        let extension: string;
        if (cencCek) {
            extension = "m4a";
        } else if (urlLower.endsWith(".mgg")) {
            extension = "ogg";
        } else if (urlLower.endsWith(".mmp4")) {
            extension = "mp4";
        } else if (urlLower.endsWith(".mflac") || urlLower.endsWith(".mflac0")) {
            extension = "flac";
        } else {
            // 优先信任 URL 的实际后缀（无损源也可能是 m4a/ape 等容器），再按音质兜底
            const urlExtension = this.getExtensionName(url);
            if (supportLocalMediaType.some(item => item === ("." + urlExtension))) {
                extension = urlExtension;
            } else if (
                actualQuality === "128k" ||
                actualQuality === "320k" ||
                actualQuality === "192k" ||
                (actualQuality as string) === "96k"
            ) {
                extension = "mp3";
            } else {
                extension = "flac";
            }
        }

        const willDownloadEncrypted = !!cencCek || !!mflacEkey || isMflacUrl(url);

        let encryptedExtension = cencCek ? "cenc" : "mflac";
        if (!cencCek && urlLower.endsWith(".mgg")) {
            encryptedExtension = "mgg";
        } else if (!cencCek && urlLower.endsWith(".mmp4")) {
            encryptedExtension = "mmp4";
        }

        const generatedFilename = this.generateFilename(musicItem, actualQuality);
        const taskId = getMediaUniqueKey(musicItem);

        try {
            const folder = path.dirname(this.getDownloadPath(`${generatedFilename}.${extension}`));
            const folderExists = await exists(folder);
            if (!folderExists) {
                await mkdirR(folder);
            }
        } catch {
            return { failReason: DownloadFailReason.NoWritePermission };
        }

        const { targetDownloadPath, tempEncryptedPath, filename } = await this.resolveUniqueDownloadPaths(
            taskId,
            musicItem,
            generatedFilename,
            extension,
            willDownloadEncrypted,
            encryptedExtension,
        );

        const runtimeInfo: IDownloadRuntimeInfo = {
            taskId,
            targetDownloadPath,
            tempEncryptedPath,
            willDownloadEncrypted,
            mflacEkey,
            cencCek,
            extension,
            encryptedExtension,
        };

        const nativeParams: INativeDownloadTaskParams = {
            taskId,
            url,
            destinationPath: removeFileScheme(tempEncryptedPath),
            headers: headers ?? {},
            title: filename,
            description: "正在下载音乐文件...",
            coverUrl: typeof (musicItem as any)?.artwork === "string" ? (musicItem as any).artwork : null,
        };

        return {
            runtimeInfo,
            nativeParams,
            quality: actualQuality,
            expectedFileSize,
            filename,
        };
    }

    private handleNativeProgressBatch(event: any) {
        const items = Array.isArray(event?.items) ? event.items : [];
        if (items.length === 0) {
            return;
        }

        for (const item of items) {
            const taskId = item?.taskId;
            if (!taskId || !downloadTasks.has(taskId)) {
                continue;
            }
            const task = downloadTasks.get(taskId);
            if (!task) {
                continue;
            }

            if (task.status === DownloadStatus.Pending || task.status === DownloadStatus.Preparing || task.status === DownloadStatus.Downloading) {
                this.updateDownloadTask(task.musicItem, {
                    status: DownloadStatus.Downloading,
                    downloadedSize: typeof item.downloaded === "number" ? item.downloaded : task.downloadedSize,
                    fileSize: typeof item.total === "number" && item.total > 0 ? item.total : task.fileSize,
                    progressText: typeof item.progressText === "string" ? item.progressText : task.progressText,
                });
            }
        }
    }

    private async handleNativeTaskStatusChanged(rawTask: INativeDownloadTaskStatus) {
        if (!rawTask?.taskId) {
            return;
        }
        const taskId = rawTask.taskId;
        let taskInfo = downloadTasks.get(taskId);

        if (!taskInfo) {
            // 终态事件对应的任务已被本地删除时，只做原生侧清理，不再复活任务
            if (rawTask.status === "ERROR" || rawTask.status === "CANCELED") {
                void Mp3Util.removeDownloadTask(taskId).catch(() => {});
                return;
            }
            const extra = this.parseExtraPayload(rawTask.extraJson);
            if (extra?.musicItem) {
                taskInfo = {
                    status: this.mapNativeStatus(rawTask.status),
                    filename: extra.filename ?? this.generateFilename(extra.musicItem, extra.quality),
                    quality: extra.quality,
                    fileSize: rawTask.total > 0 ? rawTask.total : undefined,
                    downloadedSize: rawTask.downloaded > 0 ? rawTask.downloaded : undefined,
                    progressText: rawTask.progressText ?? undefined,
                    musicItem: extra.musicItem,
                    // 上方守卫已排除 ERROR/CANCELED，此处不会是错误状态
                    errorReason: undefined,
                };
                downloadTasks.set(taskId, taskInfo);
                this.runtimeInfoByTaskId.set(taskId, extra.runtimeInfo ?? {
                    taskId,
                    targetDownloadPath: rawTask.destinationPath ?? "",
                    tempEncryptedPath: rawTask.destinationPath ?? "",
                    willDownloadEncrypted: false,
                    extension: this.getExtensionName(rawTask.url ?? ""),
                    encryptedExtension: "mflac",
                });

                const queue = getDefaultStore().get(downloadQueueAtom);
                if (!queue.some(item => isSameMediaItem(item, extra.musicItem))) {
                    getDefaultStore().set(downloadQueueAtom, [...queue, extra.musicItem]);
                }
            }
        }

        taskInfo = downloadTasks.get(taskId);
        if (!taskInfo) {
            return;
        }

        const musicItem = taskInfo.musicItem;
        switch (rawTask.status) {
            case "PENDING":
                this.updateDownloadTask(musicItem, {
                    status: DownloadStatus.Pending,
                    downloadedSize: rawTask.downloaded > 0 ? rawTask.downloaded : taskInfo.downloadedSize,
                    fileSize: rawTask.total > 0 ? rawTask.total : taskInfo.fileSize,
                    progressText: rawTask.progressText ?? taskInfo.progressText,
                });
                break;
            case "PREPARING":
                this.updateDownloadTask(musicItem, {
                    status: DownloadStatus.Preparing,
                    progressText: rawTask.progressText ?? taskInfo.progressText,
                });
                break;
            case "DOWNLOADING":
                this.updateDownloadTask(musicItem, {
                    status: DownloadStatus.Downloading,
                    downloadedSize: rawTask.downloaded > 0 ? rawTask.downloaded : taskInfo.downloadedSize,
                    fileSize: rawTask.total > 0 ? rawTask.total : taskInfo.fileSize,
                    progressText: rawTask.progressText ?? taskInfo.progressText,
                });
                break;
            case "PAUSED":
                this.updateDownloadTask(musicItem, {
                    status: DownloadStatus.Pending,
                    downloadedSize: rawTask.downloaded > 0 ? rawTask.downloaded : taskInfo.downloadedSize,
                    fileSize: rawTask.total > 0 ? rawTask.total : taskInfo.fileSize,
                    progressText: rawTask.progressText ?? taskInfo.progressText,
                });
                break;
            case "ERROR": {
                const reason = this.mapNativeErrorToReason(rawTask.error);
                this.updateDownloadTask(musicItem, {
                    status: DownloadStatus.Error,
                    errorReason: reason,
                    progressText: rawTask.progressText ?? taskInfo.progressText,
                });
                this.emit(DownloaderEvent.DownloadTaskError, reason, musicItem);
                break;
            }
            case "CANCELED":
                this.cleanupTaskStateByKey(taskId, false);
                break;
            case "COMPLETED":
                await this.completeTaskAfterDownload(taskId, true);
                break;
            default:
                break;
        }

        this.maybeEmitQueueCompleted();
    }

    private async completeTaskAfterDownload(taskId: string, removeNativeTask: boolean) {
        const task = downloadTasks.get(taskId);
        if (!task) {
            return;
        }

        const runtimeInfo = this.runtimeInfoByTaskId.get(taskId);
        if (!runtimeInfo) {
            this.updateDownloadTask(task.musicItem, {
                status: DownloadStatus.Error,
                errorReason: DownloadFailReason.Unknown,
            });
            return;
        }

        try {
            if (runtimeInfo.willDownloadEncrypted) {
                // 解密输出前清掉旧目标文件（重新下载场景），避免解密实现对已存在文件行为不确定
                try {
                    const decryptTarget = removeFileScheme(runtimeInfo.targetDownloadPath);
                    if (await exists(decryptTarget)) {
                        await unlink(decryptTarget);
                    }
                } catch {
                }
                if (runtimeInfo.cencCek) {
                    await Cenc.decryptFile(
                        removeFileScheme(runtimeInfo.tempEncryptedPath),
                        removeFileScheme(runtimeInfo.targetDownloadPath),
                        runtimeInfo.cencCek,
                    );
                } else {
                    const cleaned = normalizeEkey(runtimeInfo.mflacEkey);
                    if (!cleaned) {
                        throw new Error("missing ekey for encrypted media");
                    }
                    await Mp3Util.decryptMflacToFlac(
                        removeFileScheme(runtimeInfo.tempEncryptedPath),
                        removeFileScheme(runtimeInfo.targetDownloadPath),
                        cleaned,
                    );
                }
                if (runtimeInfo.tempEncryptedPath !== runtimeInfo.targetDownloadPath) {
                    try {
                        await unlink(removeFileScheme(runtimeInfo.tempEncryptedPath));
                    } catch {
                    }
                }
            } else if (runtimeInfo.tempEncryptedPath !== runtimeInfo.targetDownloadPath) {
                // 未加密下载写入的是 .part 临时文件，成功后移动到目标路径
                const target = removeFileScheme(runtimeInfo.targetDownloadPath);
                try {
                    if (await exists(target)) {
                        await unlink(target);
                    }
                } catch {
                }
                await moveFile(removeFileScheme(runtimeInfo.tempEncryptedPath), target);
            }

            await this.writeMetadataToFile(task.musicItem, runtimeInfo.targetDownloadPath);
            await this.downloadLyricFile(task.musicItem, runtimeInfo.targetDownloadPath);

            LocalMusicSheet.addMusic({
                ...task.musicItem,
                [internalSerializeKey]: {
                    localPath: runtimeInfo.targetDownloadPath,
                },
            });

            patchMediaExtra(task.musicItem, {
                downloaded: true,
                localPath: runtimeInfo.targetDownloadPath,
            });

            this.updateDownloadTask(task.musicItem, {
                status: DownloadStatus.Completed,
                downloadedSize: task.fileSize,
                fileSize: task.fileSize,
                progressText: task.progressText,
            });
        } catch (error) {
            // 解密/移动失败时清理残留：临时文件一定是垃圾；
            // 加密流程中目标文件可能是不完整的解密产物，一并删除
            if (runtimeInfo.tempEncryptedPath !== runtimeInfo.targetDownloadPath) {
                void unlink(removeFileScheme(runtimeInfo.tempEncryptedPath)).catch(() => {});
                if (runtimeInfo.willDownloadEncrypted) {
                    void unlink(removeFileScheme(runtimeInfo.targetDownloadPath)).catch(() => {});
                }
            }
            this.updateDownloadTask(task.musicItem, {
                status: DownloadStatus.Error,
                errorReason: DownloadFailReason.Unknown,
            });
            this.emit(DownloaderEvent.DownloadTaskError, DownloadFailReason.Unknown, task.musicItem, error as Error);
            return;
        } finally {
            if (removeNativeTask) {
                await Mp3Util.removeDownloadTask(taskId).catch(() => {});
            }
        }

        this.cleanupTaskStateByKey(taskId, false);
    }

    private cleanupTaskStateByKey(taskId: string, removeNativeTask: boolean) {
        const task = downloadTasks.get(taskId);
        if (!task) {
            return;
        }

        downloadTasks.delete(taskId);
        this.runtimeInfoByTaskId.delete(taskId);
        const queue = getDefaultStore().get(downloadQueueAtom);
        getDefaultStore().set(
            downloadQueueAtom,
            queue.filter(item => !isSameMediaItem(item, task.musicItem)),
        );

        if (removeNativeTask) {
            void Mp3Util.removeDownloadTask(taskId).catch(() => {});
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

        this.syncNativeConcurrency();

        const normalized = Array.isArray(musicItems) ? musicItems : [musicItems];
        const accepted: IMusic.IMusicItem[] = [];
        for (const musicItem of normalized) {
            const key = getMediaUniqueKey(musicItem);
            const existing = downloadTasks.get(key);
            if (existing) {
                // 失败的任务允许重新发起（重置后重试），进行中的任务跳过
                if (existing.status !== DownloadStatus.Error) {
                    continue;
                }
                void Mp3Util.removeDownloadTask(key).catch(() => {});
                this.runtimeInfoByTaskId.delete(key);
            }

            const task: IDownloadTaskInfo = {
                status: DownloadStatus.Pending,
                filename: this.generateFilename(musicItem, quality),
                quality,
                musicItem,
            };
            downloadTasks.set(key, task);
            this.emit(DownloaderEvent.DownloadTaskUpdate, task);
            accepted.push(musicItem);
        }

        if (accepted.length === 0) {
            return;
        }

        this.queueBusy = true;
        const queue = getDefaultStore().get(downloadQueueAtom);
        const appended = accepted.filter(
            item => !queue.some(queued => isSameMediaItem(queued, item)),
        );
        if (appended.length > 0) {
            getDefaultStore().set(downloadQueueAtom, [...queue, ...appended]);
        }

        for (const item of accepted) {
            this.pushPrepareTask({ musicItem: item, quality });
        }
    }

    /** 清除所有失败任务，返回清除数量 */
    removeErrorTasks(): number {
        const errorItems = Array.from(downloadTasks.values())
            .filter(task => task.status === DownloadStatus.Error)
            .map(task => task.musicItem);
        let removed = 0;
        for (const item of errorItems) {
            if (this.remove(item)) {
                removed++;
            }
        }
        return removed;
    }

    remove(musicItem: IMusic.IMusicItem) {
        const key = getMediaUniqueKey(musicItem);
        const task = downloadTasks.get(key);
        if (!task) {
            return false;
        }

        this.prepareQueue = this.prepareQueue.filter(item => !isSameMediaItem(item.musicItem, musicItem));
        const jsJobId = this.jsDownloadJobs.get(key);
        if (jsJobId !== undefined) {
            try {
                stopDownload(jsJobId);
            } catch {
            }
            this.jsDownloadJobs.delete(key);
        }
        // 无论 JS 还是原生下载，删除任务都清理临时文件（目标文件只在下载成功后才会写入，不动）
        const runtimeInfo = this.runtimeInfoByTaskId.get(key);
        if (runtimeInfo && runtimeInfo.tempEncryptedPath !== runtimeInfo.targetDownloadPath) {
            void unlink(removeFileScheme(runtimeInfo.tempEncryptedPath)).catch(() => {});
        }
        void Mp3Util.cancelDownloadTask(key).catch(() => {});
        void Mp3Util.removeDownloadTask(key).catch(() => {});
        this.cleanupTaskStateByKey(key, false);
        this.maybeEmitQueueCompleted();
        return true;
    }
}

const downloader = new Downloader();
export default downloader;

export function useDownloadTask(musicItem: IMusic.IMusicItem) {
    const [downloadStatus, setDownloadStatus] = useState(downloadTasks.get(getMediaUniqueKey(musicItem)) ?? null);

    useEffect(() => {
        // musicItem 变化（如列表复用）时重新同步当前任务状态，避免展示上一个条目的状态
        setDownloadStatus(downloadTasks.get(getMediaUniqueKey(musicItem)) ?? null);

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
