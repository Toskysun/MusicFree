import { internalSerializeKey, supportLocalMediaType } from "@/constants/commonConst";
import pathConst from "@/constants/pathConst";
import { IAppConfig } from "@/types/core/config";
import { IInjectable } from "@/types/infra";
import { escapeCharacter, mkdirR, removeFileScheme } from "@/utils/fileUtils";
import { errorLog, devLog } from "@/utils/log";
import { patchMediaExtra } from "@/utils/mediaExtra";
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
import { exists, unlink } from "react-native-fs";
import Mp3Util, {
    INativeDownloadTaskParams,
    INativeDownloadTaskStatus,
    NativeDownloadEmitter,
} from "@/native/mp3Util";
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
    [DownloaderEvent.DownloadQueueCompleted]: () => void;
}

class Downloader extends EventEmitter<IEvents> implements IInjectable {
    private configService!: IAppConfig;
    private pluginManagerService!: IPluginManager;
    private nativeEventBound = false;

    private prepareQueue: IPrepareTask[] = [];
    private activePrepareCount = 0;
    private readonly maxPrepareConcurrency = 3;

    private queueBusy = false;

    private runtimeInfoByTaskId = new Map<string, IDownloadRuntimeInfo>();

    injectDependencies(configService: IAppConfig, pluginManager: IPluginManager): void {
        this.configService = configService;
        this.pluginManagerService = pluginManager;

        musicMetadataManager.injectPluginManager(pluginManager);
        this.bindNativeEvents();
        this.syncNativeConcurrency();
        void this.hydrateNativeTasks();
    }

    private bindNativeEvents() {
        if (this.nativeEventBound || !NativeDownloadEmitter) {
            if (!NativeDownloadEmitter) {
                devLog("warn", "⚠️[下载器] NativeDownloadEmitter 不可用，无法启用 Native 队列");
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

    private async hydrateNativeTasks() {
        try {
            const nativeTasks = await Mp3Util.getAllDownloadTasks();
            if (!Array.isArray(nativeTasks) || nativeTasks.length === 0) {
                return;
            }

            const queueItems: IMusic.IMusicItem[] = [];
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

                const mappedStatus = this.mapNativeStatus(nativeTask.status);
                if (nativeTask.status === "COMPLETED" || nativeTask.status === "CANCELED") {
                    await Mp3Util.removeDownloadTask(nativeTask.taskId).catch(() => {});
                    continue;
                }

                const task: IDownloadTaskInfo = {
                    status: mappedStatus,
                    filename: extra.filename ?? this.generateFilename(extra.musicItem, extra.quality),
                    quality: extra.quality,
                    fileSize: nativeTask.total > 0 ? nativeTask.total : undefined,
                    downloadedSize: nativeTask.downloaded > 0 ? nativeTask.downloaded : undefined,
                    progressText: nativeTask.progressText ?? undefined,
                    musicItem: extra.musicItem,
                    errorReason: nativeTask.status === "ERROR"
                        ? this.mapNativeErrorToReason(nativeTask.error)
                        : undefined,
                };

                downloadTasks.set(key, task);
                this.runtimeInfoByTaskId.set(key, extra.runtimeInfo ?? {
                    taskId: key,
                    targetDownloadPath: nativeTask.destinationPath ?? "",
                    tempEncryptedPath: nativeTask.destinationPath ?? "",
                    willDownloadEncrypted: false,
                    extension: this.getExtensionName(nativeTask.url ?? ""),
                    encryptedExtension: "mflac",
                });

                queueItems.push(extra.musicItem);
            }

            if (queueItems.length > 0) {
                getDefaultStore().set(downloadQueueAtom, queueItems);
                this.queueBusy = true;
            }
        } catch (error) {
            devLog("warn", "⚠️[下载器] 恢复 Native 任务失败", String(error));
        }
    }

    private syncNativeConcurrency() {
        const max = Math.max(1, Math.min(+(this.configService.getConfig("basic.maxDownload") || 3), 10));
        Mp3Util.setDownloadMaxConcurrency(max).catch(error => {
            devLog("warn", "⚠️[下载器] 设置 Native 并发失败", String(error));
        });
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
        const regResult = url.match(
            /^https?\:\/\/.+\.([^\?\.]+?$)|(?:([^\.]+?)\?.+$)/,
        );
        if (regResult) {
            return regResult[1] ?? regResult[2] ?? "mp3";
        } else {
            return "mp3";
        }
    }

    private getDownloadPath(fileName: string) {
        const dlPath = this.configService.getConfig("basic.downloadPath") ?? pathConst.downloadMusicPath;
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
        const match = size.match(/^([\d.]+)\s*(B|KB|MB|GB)$/i);
        if (!match) {
            return 0;
        }
        const value = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        switch (unit) {
            case "B":
                return value;
            case "KB":
                return value * 1024;
            case "MB":
                return value * 1024 * 1024;
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
            this.emit(DownloaderEvent.DownloadQueueCompleted);
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
            void this.prepareAndSubmitNativeTask(next.musicItem, next.quality).finally(() => {
                this.activePrepareCount--;
                this.pumpPrepareQueue();
                this.maybeEmitQueueCompleted();
            });
        }
    }

    private async prepareAndSubmitNativeTask(musicItem: IMusic.IMusicItem, quality?: IMusic.IQualityKey) {
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

        const extraPayload: IExtraPayload = {
            musicItem,
            quality: resolved.quality,
            filename: task.filename,
            runtimeInfo: resolved.runtimeInfo,
        };
        resolved.nativeParams.extraJson = JSON.stringify(extraPayload);

        this.runtimeInfoByTaskId.set(key, resolved.runtimeInfo);
        const nativeAdded = await Mp3Util.addDownloadTask(resolved.nativeParams).catch(error => {
            devLog("error", "❌[下载器] 添加 Native 任务失败", error);
            return false;
        });

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

    private async resolveTaskForNative(
        musicItem: IMusic.IMusicItem,
        quality?: IMusic.IQualityKey,
    ): Promise<IResolveTaskResult> {
        let url = musicItem.url;
        let headers = musicItem.headers;
        let mflacEkey: string | undefined;
        let actualQuality = quality ??
            this.configService.getConfig("basic.defaultDownloadQuality") ??
            "master";

        const plugin = this.pluginManagerService.getByName(musicItem.platform);
        if (plugin) {
            const qualityOrder = getQualityOrder(
                actualQuality,
                this.configService.getConfig("basic.downloadQualityOrder") ?? "desc",
            );

            let data: IPlugin.IMediaSourceResult | null = null;
            for (const currentQuality of qualityOrder) {
                try {
                    data = await plugin.methods.getMediaSource(
                        musicItem,
                        currentQuality,
                        1,
                        true,
                    );
                    if (!data?.url) {
                        continue;
                    }
                    url = data.url;
                    headers = data.headers;
                    mflacEkey = data.ekey as string | undefined;
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

        const qualityInfo = musicItem.qualities?.[actualQuality];
        const expectedFileSize = this.parseQualityFileSize(qualityInfo?.size);

        const urlLower = url.toLowerCase().split("?")[0];
        let extension = "mp3";
        if (urlLower.endsWith(".mgg")) {
            extension = "ogg";
        } else if (urlLower.endsWith(".mmp4")) {
            extension = "mp4";
        } else if (urlLower.endsWith(".mflac")) {
            extension = "flac";
        } else if (
            actualQuality === "128k" ||
            actualQuality === "320k" ||
            actualQuality === "192k" ||
            (actualQuality as string) === "96k"
        ) {
            const urlExtension = this.getExtensionName(url);
            extension = supportLocalMediaType.some(item => item === ("." + urlExtension))
                ? urlExtension
                : "mp3";
        } else {
            extension = "flac";
        }

        const generatedFilename = this.generateFilename(musicItem, actualQuality);
        const targetDownloadPath = this.getDownloadPath(`${generatedFilename}.${extension}`);
        const willDownloadEncrypted = !!mflacEkey || isMflacUrl(url);

        let encryptedExtension = "mflac";
        if (urlLower.endsWith(".mgg")) {
            encryptedExtension = "mgg";
        } else if (urlLower.endsWith(".mmp4")) {
            encryptedExtension = "mmp4";
        }

        const tempEncryptedPath = willDownloadEncrypted
            ? this.getDownloadPath(`${generatedFilename}.${encryptedExtension}`)
            : targetDownloadPath;

        try {
            const folder = path.dirname(targetDownloadPath);
            const folderExists = await exists(folder);
            if (!folderExists) {
                await mkdirR(folder);
            }
        } catch {
            return { failReason: DownloadFailReason.NoWritePermission };
        }

        const taskId = getMediaUniqueKey(musicItem);
        const runtimeInfo: IDownloadRuntimeInfo = {
            taskId,
            targetDownloadPath,
            tempEncryptedPath,
            willDownloadEncrypted,
            mflacEkey,
            extension,
            encryptedExtension,
        };

        const nativeParams: INativeDownloadTaskParams = {
            taskId,
            url,
            destinationPath: removeFileScheme(tempEncryptedPath),
            headers: headers ?? {},
            title: generatedFilename,
            description: "正在下载音乐文件...",
            coverUrl: typeof (musicItem as any)?.artwork === "string" ? (musicItem as any).artwork : null,
        };

        return {
            runtimeInfo,
            nativeParams,
            quality: actualQuality,
            expectedFileSize,
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
                    errorReason: rawTask.status === "ERROR" ? this.mapNativeErrorToReason(rawTask.error) : undefined,
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
                await this.completeTaskAfterNativeDownload(taskId);
                break;
            default:
                break;
        }

        this.maybeEmitQueueCompleted();
    }

    private async completeTaskAfterNativeDownload(taskId: string) {
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
                const cleaned = normalizeEkey(runtimeInfo.mflacEkey);
                if (!cleaned) {
                    throw new Error("missing ekey for encrypted media");
                }
                await Mp3Util.decryptMflacToFlac(
                    removeFileScheme(runtimeInfo.tempEncryptedPath),
                    removeFileScheme(runtimeInfo.targetDownloadPath),
                    cleaned,
                );
                if (runtimeInfo.tempEncryptedPath !== runtimeInfo.targetDownloadPath) {
                    try {
                        await unlink(removeFileScheme(runtimeInfo.tempEncryptedPath));
                    } catch {
                    }
                }
            }

            this.writeMetadataToFile(task.musicItem, runtimeInfo.targetDownloadPath).catch(err => {
                errorLog("元数据写入失败，但不影响下载完成", {
                    musicItem: task.musicItem.title,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
            this.downloadLyricFile(task.musicItem, runtimeInfo.targetDownloadPath).catch(err => {
                errorLog("歌词文件下载失败，但不影响下载完成", {
                    musicItem: task.musicItem.title,
                    error: err instanceof Error ? err.message : String(err),
                });
            });

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
            this.updateDownloadTask(task.musicItem, {
                status: DownloadStatus.Error,
                errorReason: DownloadFailReason.Unknown,
            });
            this.emit(DownloaderEvent.DownloadTaskError, DownloadFailReason.Unknown, task.musicItem, error as Error);
            return;
        } finally {
            await Mp3Util.removeDownloadTask(taskId).catch(() => {});
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
            if (downloadTasks.has(key)) {
                continue;
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
        getDefaultStore().set(downloadQueueAtom, [...queue, ...accepted]);

        for (const item of accepted) {
            this.pushPrepareTask({ musicItem: item, quality });
        }
    }

    remove(musicItem: IMusic.IMusicItem) {
        const key = getMediaUniqueKey(musicItem);
        const task = downloadTasks.get(key);
        if (!task) {
            return false;
        }

        this.prepareQueue = this.prepareQueue.filter(item => !isSameMediaItem(item.musicItem, musicItem));
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
