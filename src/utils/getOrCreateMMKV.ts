import pathConst from "@/constants/pathConst";
import { createMMKV, type MMKV } from "react-native-mmkv";

const _mmkvCache: Record<string, MMKV> = {};

// @ts-ignore;
global.mmkv = _mmkvCache;

// Internal Method
const getOrCreateMMKV = (dbName: string, cachePath = false) => {
    if (_mmkvCache[dbName]) {
        return _mmkvCache[dbName];
    }

    const newStore = createMMKV({
        id: dbName,
        path: cachePath ? pathConst.mmkvCachePath : pathConst.mmkvPath,
    });

    _mmkvCache[dbName] = newStore;
    return newStore;
};

export default getOrCreateMMKV;
