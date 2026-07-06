import {
    StorageKeys,
    internalSerializeKey,
    supportLocalMediaType,
} from "@/constants/commonConst";
import pathConst from "@/constants/pathConst";
import mp3Util from "@/native/mp3Util";
import {
    addFileScheme,
    getFileName,
    removeFileScheme,
} from "@/utils/fileUtils.ts";
import {
    getLocalPath,
    isSameMediaItem,
} from "@/utils/mediaUtils";
import StateMapper from "@/utils/stateMapper";
import { getStorage, setStorage } from "@/utils/storage";
import CryptoJs from "crypto-js";
import { nanoid } from "@/utils/nanoid";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { ReadDirItem, exists, readDir, unlink } from "react-native-fs";

let localSheet: IMusic.IMusicItem[] = [];
const localSheetStateMapper = new StateMapper(() => localSheet);

const iosDocumentsMarker = "/Documents/";
const artworkHydrateGroupNum = 8;
let artworkHydrateToken = 0;

function getLocalPathCandidates(localPath: string) {
    const rawPath = removeFileScheme(localPath);
    const candidates = [rawPath];

    if (Platform.OS === "ios") {
        const documentIndex = rawPath.indexOf(iosDocumentsMarker);
        if (documentIndex !== -1) {
            const relativePath = rawPath.slice(
                documentIndex + iosDocumentsMarker.length,
            );
            candidates.push(`${pathConst.basePath}/${relativePath}`);
        }
    }

    return [...new Set(candidates)];
}

async function getExistingLocalPath(localPath: string) {
    const candidates = getLocalPathCandidates(localPath);
    for (let candidate of candidates) {
        if (await exists(candidate)) {
            return candidate;
        }
    }
    return null;
}

function isFileNotFoundError(error: any) {
    const message = `${error?.message ?? error}`.toLowerCase();
    return (
        message.includes("enoent") ||
        message.includes("no such file or directory") ||
        message.includes("file does not exist")
    );
}

function hasArtwork(musicItem: IMusic.IMusicItem) {
    return (
        typeof musicItem.artwork === "string" &&
        musicItem.artwork.trim().length > 0
    );
}

async function hydrateLocalArtwork(musicItems: IMusic.IMusicItem[] = localSheet) {
    const token = ++artworkHydrateToken;
    const candidates = musicItems.filter(
        musicItem => !hasArtwork(musicItem) && !!getLocalPath(musicItem),
    );

    for (let i = 0; i < candidates.length; i += artworkHydrateGroupNum) {
        if (token !== artworkHydrateToken) {
            return;
        }

        const group = candidates.slice(i, i + artworkHydrateGroupNum);
        const hydratedGroup = await Promise.all(
            group.map(async musicItem => {
                const localPath = getLocalPath(musicItem);
                if (!localPath) {
                    return null;
                }

                try {
                    const artwork = await mp3Util.getMediaCoverImg(
                        removeFileScheme(localPath),
                    );
                    return typeof artwork === "string" && artwork.trim()
                        ? { musicItem, artwork }
                        : null;
                } catch {
                    return null;
                }
            }),
        );

        if (token !== artworkHydrateToken) {
            return;
        }

        let nextSheet = localSheet;
        let hasChanged = false;
        hydratedGroup.forEach(hydrated => {
            if (!hydrated) {
                return;
            }
            const targetIndex = nextSheet.findIndex(musicItem =>
                isSameMediaItem(musicItem, hydrated.musicItem),
            );
            if (targetIndex === -1 || hasArtwork(nextSheet[targetIndex])) {
                return;
            }
            if (!hasChanged) {
                nextSheet = [...localSheet];
                hasChanged = true;
            }
            nextSheet[targetIndex] = {
                ...nextSheet[targetIndex],
                artwork: hydrated.artwork,
            };
        });

        if (hasChanged) {
            localSheet = nextSheet;
            localSheetStateMapper.notify();
            await saveLocalSheet();
        }
    }
}

export async function setup() {
    const sheet = await getStorage(StorageKeys.LocalMusicSheet);
    if (sheet) {
        let validSheet: IMusic.IMusicItem[] = [];
        let hasChanged = false;
        for (let musicItem of sheet) {
            const localPath = getLocalPath(musicItem);
            if (localPath) {
                const existingPath = await getExistingLocalPath(localPath);
                if (existingPath) {
                    hasChanged = hasChanged || existingPath !== removeFileScheme(localPath);
                    validSheet.push({
                        ...musicItem,
                        [internalSerializeKey]: {
                            ...(musicItem[internalSerializeKey] ?? {}),
                            localPath: existingPath,
                        },
                    });
                } else {
                    hasChanged = true;
                }
            } else {
                hasChanged = true;
            }
        }
        if (hasChanged) {
            await setStorage(StorageKeys.LocalMusicSheet, validSheet);
        }
        localSheet = validSheet;
    } else {
        await setStorage(StorageKeys.LocalMusicSheet, []);
    }
    localSheetStateMapper.notify();
}

export async function addMusic(
    musicItem: IMusic.IMusicItem | IMusic.IMusicItem[],
) {
    if (!Array.isArray(musicItem)) {
        musicItem = [musicItem];
    }
    let newSheet = [...localSheet];
    musicItem.forEach(mi => {
        if (localSheet.findIndex(_ => isSameMediaItem(mi, _)) === -1) {
            newSheet.push(mi);
        }
    });
    await setStorage(StorageKeys.LocalMusicSheet, newSheet);
    localSheet = newSheet;
    localSheetStateMapper.notify();
    void hydrateLocalArtwork(musicItem);
}

function addMusicDraft(musicItem: IMusic.IMusicItem | IMusic.IMusicItem[]) {
    if (!Array.isArray(musicItem)) {
        musicItem = [musicItem];
    }
    let newSheet = [...localSheet];
    musicItem.forEach(mi => {
        if (localSheet.findIndex(_ => isSameMediaItem(mi, _)) === -1) {
            newSheet.push(mi);
        }
    });
    localSheet = newSheet;
    localSheetStateMapper.notify();
}

async function saveLocalSheet() {
    await setStorage(StorageKeys.LocalMusicSheet, localSheet);
}

export async function removeMusic(
    musicItem: IMusic.IMusicItem,
    deleteOriginalFile = false,
) {
    const idx = localSheet.findIndex(_ => isSameMediaItem(_, musicItem));
    let newSheet = [...localSheet];
    if (idx !== -1) {
        const localMusicItem = localSheet[idx];
        newSheet.splice(idx, 1);
        const localPath =
            getLocalPath(localMusicItem) ??
            getLocalPath(musicItem);
        if (deleteOriginalFile && localPath) {
            try {
                const existingPath = await getExistingLocalPath(localPath);
                if (existingPath) {
                    await unlink(existingPath);
                }
            } catch (e: any) {
                if (!isFileNotFoundError(e)) {
                    throw e;
                }
            }
        }
    }
    localSheet = newSheet;
    localSheetStateMapper.notify();
    saveLocalSheet();
}

function parseFilename(fn: string): Partial<IMusic.IMusicItem> | null {
    const data = fn.slice(0, fn.lastIndexOf(".")).split("@");
    const [platform, id, title, artist] = data;
    if (!platform || !id) {
        return null;
    }
    return {
        id,
        platform: platform,
        title: title ?? "",
        artist: artist ?? "",
    };
}

function localMediaFilter(filename: string) {
    return supportLocalMediaType.some(ext => filename.toLowerCase().endsWith(ext));
}

let importToken: string | null = null;
// 获取本地的文件列表
async function getMusicStats(folderPaths: string[]) {
    const _importToken = nanoid();
    importToken = _importToken;
    const musicList: string[] = [];
    let peek: string | undefined;
    let dirFiles: ReadDirItem[] = [];
    while (folderPaths.length !== 0) {
        if (importToken !== _importToken) {
            throw new Error("Import Broken");
        }
        peek = folderPaths.shift() as string;
        try {
            dirFiles = await readDir(peek);
        } catch {
            dirFiles = [];
        }

        dirFiles.forEach(item => {
            if (item.isDirectory() && !folderPaths.includes(item.path)) {
                folderPaths.push(item.path);
            } else if (localMediaFilter(item.path)) {
                musicList.push(item.path);
            }
        });
    }

    return { musicList, token: _importToken };
}

function cancelImportLocal() {
    importToken = null;
}

// 导入本地音乐
const groupNum = 25;
async function importLocal(_folderPaths: string[]) {
    const folderPaths = [..._folderPaths.map(it => addFileScheme(it))];
    const { musicList, token } = await getMusicStats(folderPaths);
    if (token !== importToken) {
        throw new Error("Import Broken");
    }
    // 分组请求，不然序列化可能出问题
    let metas: any[] = [];
    const groups = Math.ceil(musicList.length / groupNum);
    for (let i = 0; i < groups; ++i) {
        metas = metas.concat(
            await mp3Util.getMediaMeta(
                musicList.slice(i * groupNum, (i + 1) * groupNum),
            ),
        );
    }
    if (token !== importToken) {
        throw new Error("Import Broken");
    }
    const musicItems: IMusic.IMusicItem[] = await Promise.all(
        musicList.map(async (musicPath, index) => {
            let { platform, id, title, artist } =
                parseFilename(getFileName(musicPath, true)) ?? {};
            const meta = metas[index];
            if (!platform || !id) {
                platform = "本地";
                id = CryptoJs.MD5(musicPath).toString(CryptoJs.enc.Hex);
            }
            return {
                id,
                platform,
                title: title ?? meta?.title ?? getFileName(musicPath),
                artist: artist ?? meta?.artist ?? "未知歌手",
                duration: parseInt(meta?.duration ?? "0", 10) / 1000,
                album: meta?.album ?? "未知专辑",
                artwork: "",
                [internalSerializeKey]: {
                    localPath: musicPath,
                },
            } as IMusic.IMusicItem;
        }),
    );
    if (token !== importToken) {
        throw new Error("Import Broken");
    }
    await addMusic(musicItems);
}

/** 是否为本地音乐 */
function isLocalMusic(
    musicItem: ICommon.IMediaBase | null,
): IMusic.IMusicItem | undefined {
    return musicItem
        ? localSheet.find(_ => isSameMediaItem(_, musicItem))
        : undefined;
}

/** 状态-是否为本地音乐 */
function useIsLocal(musicItem: IMusic.IMusicItem | null) {
    const localMusicState = localSheetStateMapper.useMappedState();
    const [isLocal, setIsLocal] = useState<boolean>(!!isLocalMusic(musicItem));
    useEffect(() => {
        if (!musicItem) {
            setIsLocal(false);
        } else {
            setIsLocal(!!isLocalMusic(musicItem));
        }
    }, [localMusicState, musicItem]);
    return isLocal;
}

function getMusicList() {
    return localSheet;
}

async function updateMusicList(newSheet: IMusic.IMusicItem[]) {
    const _localSheet = [...newSheet];
    try {
        await setStorage(StorageKeys.LocalMusicSheet, _localSheet);
        localSheet = _localSheet;
        localSheetStateMapper.notify();
        void hydrateLocalArtwork(_localSheet);
    } catch {}
}

const LocalMusicSheet = {
    setup,
    addMusic,
    removeMusic,
    addMusicDraft,
    saveLocalSheet,
    importLocal,
    cancelImportLocal,
    isLocalMusic,
    useIsLocal,
    getMusicList,
    hydrateArtwork: hydrateLocalArtwork,
    useMusicList: localSheetStateMapper.useMappedState,
    updateMusicList,
};

export default LocalMusicSheet;
