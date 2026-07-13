import {
    internalSerializeKey,
    localPluginPlatform,
} from "@/constants/commonConst";
import { getMediaExtraProperty } from "./mediaExtra";

/**
 * 获取媒体资源的唯一key
 * @param mediaItem
 * @returns
 */
export function getMediaUniqueKey(mediaItem: ICommon.IMediaBase) {
    return `${mediaItem.platform}@${mediaItem.id}`;
}

/**
 * 获取平台实际使用的ID标识
 * @param mediaItem
 * @returns
 */
export function getPlatformMediaId(mediaItem: ICommon.IMediaBase): string {
    const musicItem = mediaItem as any;
    const platform = mediaItem.platform?.toLowerCase() || "";

    // QQ音乐：如果同时存在id和songmid，都显示
    if (platform.includes("qq") || mediaItem.platform === "QQ音乐") {
        const id = mediaItem.id;
        const songmid = musicItem.songmid;

        if (id && songmid && id !== songmid) {
            return `id:${id},mid:${songmid}`;
        }
        return songmid || id;
    }

    // 酷狗音乐：显示所有存在的hash字段
    if (platform.includes("kg") || platform.includes("酷狗")) {
        const ids: string[] = [];

        // 主hash（id字段）
        if (mediaItem.id) {
            ids.push(`hash:${mediaItem.id}`);
        }

        // 320k hash
        if (musicItem["320hash"]) {
            ids.push(`320hash:${musicItem["320hash"]}`);
        }

        // 无损hash
        if (musicItem.sqhash) {
            ids.push(`sqhash:${musicItem.sqhash}`);
        }

        // 高品质hash
        if (musicItem.ResFileHash) {
            ids.push(`ResFileHash:${musicItem.ResFileHash}`);
        }

        return ids.length > 0 ? ids.join(",") : mediaItem.id;
    }

    // 其他平台直接返回id
    return mediaItem.id;
}

/**
 * Host-side fallback for song share/detail URLs when the plugin
 * returns empty or getMusicDetailPageUrl is missing.
 * Matches common baka-plugins / MusicFree platform field shapes.
 */
export function buildFallbackMusicDetailUrl(
    musicItem: ICommon.IMediaBase | null | undefined,
): string {
    if (!musicItem) {
        return "";
    }
    const item = musicItem as any;
    const platform = String(musicItem.platform ?? "");
    const p = platform.toLowerCase();

    const pick = (...vals: unknown[]) => {
        for (const v of vals) {
            if (v == null) {
                continue;
            }
            const s = String(v).trim();
            if (s) {
                return s;
            }
        }
        return "";
    };

    // QQ 音乐 — prefer mid; numeric songid is last resort
    if (p.includes("qq") || platform.includes("QQ")) {
        const mid = pick(
            item.songmid,
            item.mid,
            item.songMid,
            item.media_mid,
            item.mediaMid,
            typeof item.id === "string" && /^[0-9A-Za-z]{10,14}$/.test(item.id)
                ? item.id
                : "",
        );
        if (mid) {
            return `https://y.qq.com/n/ryqq/songDetail/${mid}`;
        }
        const songid = pick(item.songid, item.songId, item.id);
        return songid
            ? `https://i.y.qq.com/v8/playsong.html?songid=${songid}`
            : "";
    }

    // 酷我
    if (platform.includes("酷我") || p.includes("kuwo")) {
        let rid = pick(item.songmid, item.mid, item.rid, item.musicrid, item.id);
        rid = rid.replace(/^MUSIC_/i, "");
        return rid ? `https://www.kuwo.cn/play_detail/${rid}` : "";
    }

    // 酷狗
    if (platform.includes("酷狗") || p.includes("kugou")) {
        const hash = pick(item.hash, item.FileHash, item.fileHash, item.id);
        if (!hash) {
            return "";
        }
        const albumId =
            pick(item.albumId, item.album_id, item.albumid, item.AlbumID) ||
            "0";
        return `https://www.kugou.com/song/#hash=${hash}&album_id=${albumId}`;
    }

    // 咪咕
    if (platform.includes("咪咕") || p.includes("migu")) {
        const cid = pick(
            item.copyrightId,
            item.copyright_id,
            item.contentId,
            item.content_id,
            item.id,
        );
        return cid ? `https://music.migu.cn/v3/music/song/${cid}` : "";
    }

    // 网易云
    if (
        platform.includes("网易") ||
        p.includes("netease") ||
        p.includes("163")
    ) {
        const sid = pick(item.songmid, item.mid, item.songId, item.id);
        return sid ? `https://music.163.com/#/song?id=${sid}` : "";
    }

    // 汽水
    if (platform.includes("汽水") || p.includes("qishui")) {
        const sid = pick(
            item.id,
            item.item_id,
            item.itemId,
            item.track_id,
            item.trackId,
        );
        return sid
            ? `https://music.douyin.com/qishui/share/track?track_id=${sid}&hybrid_sdk_version=bullet&auto_play_bgm=1`
            : "";
    }

    // bilibili
    if (p.includes("bili")) {
        const bili = item._bilibiliData || {};
        const bvid = pick(
            item.bvid,
            bili.bvid,
            typeof item.id === "string" && String(item.id).startsWith("BV")
                ? item.id
                : "",
        );
        if (bvid) {
            return `https://www.bilibili.com/video/${bvid}`;
        }
        const aid = pick(
            item.aid,
            bili.aid,
            item.id != null && /^\d+$/.test(String(item.id)) ? item.id : "",
        );
        return aid ? `https://www.bilibili.com/video/av${aid}` : "";
    }

    return "";
}

/**
 * 解析媒体资源的唯一key
 * @param key 
 * @returns 
 */
export function parseMediaUniqueKey(key: string): ICommon.IMediaBase {
    try {
        const str = JSON.parse(key.trim());
        let platform, id;
        if (typeof str === "string") {
            [platform, id] = str.split("@");
        } else {
            platform = str?.platform;
            id = str?.id;
        }
        if (!platform || !id) {
            throw new Error("mediakey不完整");
        }
        return {
            platform,
            id,
        };
    } catch (e: any) {
        throw e;
    }
}

/**
 * 比较两个媒体资源是否相同
 * @param a 
 * @param b 
 * @returns 
 */
export function isSameMediaItem(
    a: ICommon.IMediaBase | null | undefined,
    b: ICommon.IMediaBase | null | undefined,
) {
    // eslint-disable-next-line eqeqeq
    return !!(a && b && a.id == b.id && a.platform === b.platform);
}


/** 获取复位的mediaItem */
export function resetMediaItem<T extends ICommon.IMediaBase>(
    mediaItem: T,
    platform?: string,
    newObj?: boolean,
): T {
    // 本地音乐不做处理
    if (
        mediaItem.platform === localPluginPlatform ||
        platform === localPluginPlatform
    ) {
        return newObj ? { ...mediaItem } : mediaItem;
    }
    if (!newObj) {
        // Prefer in-place when extensible; otherwise clone (immer-frozen / Hermes).
        if (Object.isExtensible(mediaItem)) {
            try {
                mediaItem.platform = platform ?? mediaItem.platform;
                mediaItem[internalSerializeKey] = undefined;
                return mediaItem;
            } catch {
                // fall through to clone
            }
        }
        return {
            ...mediaItem,
            platform: platform ?? mediaItem.platform,
            [internalSerializeKey]: undefined,
        };
    } else {
        return {
            ...mediaItem,
            platform: platform ?? mediaItem.platform,
            [internalSerializeKey]: undefined,
        };
    }
}

/**
 * 获取媒体资源的本地路径，如果本地路径不存在，则返回null
 * @param mediaItem 
 * @returns 
 */
export function getLocalPath(mediaItem: ICommon.IMediaBase) {
    if (!mediaItem) {
        return null;
    }

    // 如果本身就是一个内部音乐
    if (mediaItem.url && (mediaItem.url.startsWith("file://") || mediaItem.url.startsWith("content://"))) {
        return mediaItem.url;
    }

    // 尝试从内部数据中获取 -- legacy logic
    const legacyLocalPath = mediaItem?.[internalSerializeKey]?.localPath;
    if (legacyLocalPath && typeof legacyLocalPath === "string") {
        return legacyLocalPath;
    }

    // 从附加信息中获取
    const localPathInMediaExtra = getMediaExtraProperty(mediaItem, "localPath");

    return localPathInMediaExtra ?? null;
}