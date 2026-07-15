/**
 * 封面解析与关联
 */
import pathConst from "@/constants/pathConst";
import {
    addFileScheme,
    addRandomHash,
    removeFileScheme,
    resolveImportedAssetOrPath,
} from "@/utils/fileUtils";
import { isSameMediaItem } from "@/utils/mediaUtils";
import {
    getMediaExtraProperty,
    patchMediaExtra,
} from "@/utils/mediaExtra";
import { devLog, errorLog } from "@/utils/log";
import { readAsStringAsync } from "expo-file-system/legacy";
import { launchImageLibrary } from "react-native-image-picker";
import { exists, unlink, writeFile } from "react-native-fs";
import { ImgAsset } from "@/constants/assetsConst";

/**
 * 解析最终展示/播放使用的封面
 * 优先级：关联封面 > 原 artwork
 */
export function resolveArtwork(
    musicItem?: IMusic.IMusicItem | ICommon.IMediaBase | null,
): string | undefined {
    if (!musicItem) {
        return undefined;
    }
    const associated = getMediaExtraProperty(
        musicItem,
        "associatedArtwork",
    );
    if (typeof associated === "string" && associated.trim().length > 0) {
        return associated.trim();
    }
    const artwork = (musicItem as IMusic.IMusicItem).artwork;
    if (typeof artwork === "string" && artwork.trim().length > 0) {
        return artwork.trim();
    }
    return undefined;
}

export function hasAssociatedArtwork(
    musicItem?: ICommon.IMediaBase | null,
): boolean {
    if (!musicItem) {
        return false;
    }
    const associated = getMediaExtraProperty(musicItem, "associatedArtwork");
    return typeof associated === "string" && associated.trim().length > 0;
}

/**
 * 若当前正在播放该歌曲，刷新通知栏/系统媒体封面
 * 动态 require 避免与 trackPlayer 循环依赖
 */
async function refreshPlayerArtworkIfCurrent(
    musicItem: IMusic.IMusicItem,
): Promise<void> {
    try {
        const TrackPlayer = require("@/core/trackPlayer").default;
        const ReactNativeTrackPlayer =
            require("react-native-track-player").default;
        const current = TrackPlayer.currentMusic;
        if (!current || !isSameMediaItem(current, musicItem)) {
            return;
        }
        const artwork =
            resolveArtwork(musicItem) ||
            (resolveImportedAssetOrPath(ImgAsset.albumDefault) as string);
        await ReactNativeTrackPlayer.updateMetadataForTrack(0, {
            title: current.title,
            artist: current.artist,
            album: current.album,
            artwork: resolveImportedAssetOrPath(artwork) as any,
        });
    } catch (e) {
        devLog("warn", "刷新播放器封面失败", e);
    }
}

/**
 * 关联封面（网络 URL 或本地路径）
 */
export async function associateArtwork(
    musicItem: IMusic.IMusicItem,
    artworkUrl: string,
): Promise<boolean> {
    if (!musicItem?.platform || !musicItem?.id || !artworkUrl?.trim()) {
        return false;
    }
    const url = artworkUrl.trim();
    patchMediaExtra(musicItem, {
        associatedArtwork: url,
    });
    await refreshPlayerArtworkIfCurrent(musicItem);
    return true;
}

/**
 * 解除关联封面；可选清理本地缓存文件
 */
export async function unassociateArtwork(
    musicItem: IMusic.IMusicItem,
): Promise<void> {
    if (!musicItem?.platform || !musicItem?.id) {
        return;
    }
    const prev = getMediaExtraProperty(musicItem, "associatedArtwork");
    patchMediaExtra(musicItem, {
        associatedArtwork: undefined,
    });

    // 仅删除本应用写入的本地封面文件
    if (typeof prev === "string" && prev.includes(`${pathConst.dataPath}cover_`)) {
        try {
            const path = removeFileScheme(prev.split("#")[0]);
            if (await exists(path)) {
                await unlink(path);
            }
        } catch (e) {
            devLog("warn", "删除本地关联封面失败", e);
        }
    }

    await refreshPlayerArtworkIfCurrent(musicItem);
}

/**
 * 从相册选择并关联本地封面
 */
export async function associateLocalArtwork(
    musicItem: IMusic.IMusicItem,
): Promise<boolean> {
    if (!musicItem?.platform || !musicItem?.id) {
        return false;
    }
    try {
        const result = await launchImageLibrary({
            mediaType: "photo",
            selectionLimit: 1,
        });
        if (result.didCancel) {
            return false;
        }
        const uri = result.assets?.[0]?.uri;
        if (!uri) {
            return false;
        }

        const extMatch = uri.match(/\.[a-zA-Z0-9]+(?:\?.*)?$/);
        const ext = extMatch
            ? extMatch[0].split("?")[0].toLowerCase()
            : ".jpg";
        const safePlatform = String(musicItem.platform).replace(
            /[/\\?%*:|"<>]/g,
            "_",
        );
        const safeId = String(musicItem.id).replace(/[/\\?%*:|"<>]/g, "_");
        const destPath = `${pathConst.dataPath}cover_${safePlatform}_${safeId}${ext}`;
        const destWithScheme = addFileScheme(destPath);

        try {
            if (await exists(destPath)) {
                await unlink(destPath);
            }
            const rawImage = await readAsStringAsync(uri, {
                encoding: "base64",
            });
            await writeFile(destPath, rawImage, "base64");
        } catch (e) {
            errorLog("写入本地关联封面失败", e);
            // 回退：直接使用选择器返回的 uri
            await associateArtwork(musicItem, addRandomHash(uri));
            return true;
        }

        await associateArtwork(musicItem, addRandomHash(destWithScheme));
        return true;
    } catch (e) {
        errorLog("选择本地封面失败", e);
        return false;
    }
}
