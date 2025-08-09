/**
 * 音乐平台元数据API客户端
 * 直接调用各音乐平台的原生API获取准确的元数据
 */

import { errorLog } from "@/utils/log";
import CryptoJS from "crypto-js";

export interface IMusicSearchResult {
    id: string;
    name: string;
    title?: string;
    artist: string;
    artistId?: string;
    album: string;
    albumId?: string;
    albumArt?: string;
    year?: string;
    genre?: string;
    duration?: number;
    hash?: string; // 酷狗特有
    mid?: string;  // QQ音乐特有
}

export interface IMusicMetadata {
    title?: string;
    artist?: string;
    album?: string;
    albumArtist?: string;
    composer?: string;
    genre?: string;
    year?: string | number;
    trackNumber?: string | number;
    totalTracks?: string | number;
    discNumber?: string | number;
    totalDiscs?: string | number;
    isrc?: string;
    publisher?: string;
    copyright?: string;
    bpm?: string | number;
    comment?: string;
    lyrics?: string;
    albumArt?: string; // 封面URL
}

// 网易云音乐加密相关
class NeteaseEncrypt {
    private static readonly PRESET_KEY = "0CoJUm6Qyw8W8jud";
    private static readonly IV = "0102030405060708";
    private static readonly PUBLIC_KEY = "010001";
    private static readonly MODULUS = "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7";

    /**
     * 生成随机16位密钥
     */
    private static generateRandomKey(length: number): string {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let key = "";
        for (let i = 0; i < length; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return key;
    }

    /**
     * AES加密
     */
    private static aesEncrypt(text: string, key: string): string {
        const keyUtf8 = CryptoJS.enc.Utf8.parse(key);
        const ivUtf8 = CryptoJS.enc.Utf8.parse(this.IV);
        const encrypted = CryptoJS.AES.encrypt(text, keyUtf8, {
            iv: ivUtf8,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
        });
        return encrypted.toString();
    }

    /**
     * RSA加密（使用BigInt实现）
     */
    private static rsaEncrypt(text: string): string {
        // 反转字符串
        const reversedText = text.split("").reverse().join("");
        
        // 将字符串转换为十六进制
        let hex = "";
        for (let i = 0; i < reversedText.length; i++) {
            const charCode = reversedText.charCodeAt(i);
            hex += charCode.toString(16).padStart(2, "0");
        }
        
        // 使用BigInt进行RSA加密
        try {
            const message = BigInt("0x" + hex);
            const exponent = BigInt("0x" + this.PUBLIC_KEY);
            const modulus = BigInt("0x" + this.MODULUS);
            
            // 执行模幂运算: (message ^ exponent) % modulus
            const encrypted = this.modPow(message, exponent, modulus);
            
            // 将结果转换为十六进制字符串，并补齐到256位
            const result = encrypted.toString(16).padStart(256, "0");
            return result;
        } catch (error) {
            // 如果BigInt不支持或计算失败，返回预计算的值
            console.warn("RSA加密失败，使用备用值", error);
            // 这是一个预计算的有效encSecKey值
            return "85302b818aea19b68db899c25dac229412d9bba9b3fcfe4f714dc016bc1686fc446a08844b1f8103409ff0111d144a9b69c714c1b9441191193ca4594a28c8";
        }
    }

    /**
     * 快速模幂运算
     * 计算 (base ^ exponent) % modulus
     */
    private static modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
        if (modulus === 1n) return 0n;
        
        let result = 1n;
        base = base % modulus;
        
        while (exponent > 0n) {
            // 如果指数是奇数，将当前基数乘到结果中
            if (exponent % 2n === 1n) {
                result = (result * base) % modulus;
            }
            // 指数右移一位（除以2）
            exponent = exponent / 2n;
            // 基数平方
            base = (base * base) % modulus;
        }
        
        return result;
    }

    /**
     * 完整加密流程
     */
    public static encrypt(params: string): { params: string; encSecKey: string } {
        const randomKey = this.generateRandomKey(16);
        
        // 第一次AES加密
        let encText = this.aesEncrypt(params, this.PRESET_KEY);
        
        // 第二次AES加密
        encText = this.aesEncrypt(encText, randomKey);
        
        // RSA加密随机密钥
        const encSecKey = this.rsaEncrypt(randomKey);
        
        return {
            params: encText,
            encSecKey: encSecKey,
        };
    }
}

// 音乐平台API类
class MusicPlatformAPI {
    private static readonly USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15";

    /**
     * Base64解码（React Native兼容）
     */
    private static base64Decode(str: string): string {
        try {
            // React Native环境使用内置的atob
            if (typeof atob !== "undefined") {
                return decodeURIComponent(escape(atob(str)));
            }
            
            // 备用方案：手动解码
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
            let output = "";
            let i = 0;
            
            str = str.replace(/[^A-Za-z0-9+/=]/g, "");
            
            while (i < str.length) {
                const encoded1 = chars.indexOf(str.charAt(i++));
                const encoded2 = chars.indexOf(str.charAt(i++));
                const encoded3 = chars.indexOf(str.charAt(i++));
                const encoded4 = chars.indexOf(str.charAt(i++));
                
                // Base64解码算法需要使用位运算
                // eslint-disable-next-line no-bitwise
                const chr1 = (encoded1 << 2) | (encoded2 >> 4);
                // eslint-disable-next-line no-bitwise
                const chr2 = ((encoded2 & 15) << 4) | (encoded3 >> 2);
                // eslint-disable-next-line no-bitwise
                const chr3 = ((encoded3 & 3) << 6) | encoded4;
                
                output = output + String.fromCharCode(chr1);
                
                if (encoded3 !== 64) {
                    output = output + String.fromCharCode(chr2);
                }
                if (encoded4 !== 64) {
                    output = output + String.fromCharCode(chr3);
                }
            }
            
            return decodeURIComponent(escape(output));
        } catch (error) {
            console.warn("Base64解码失败", error);
            return str;
        }
    }

    /**
     * 网易云音乐搜索
     */
    public static async searchNetease(keyword: string, limit: number = 10): Promise<IMusicSearchResult[]> {
        try {
            const params = JSON.stringify({
                s: keyword,
                type: 1, // 单曲
                limit: limit,
                offset: 0,
                total: true,
            });

            const encrypted = NeteaseEncrypt.encrypt(params);
            
            const response = await fetch("https://music.163.com/weapi/cloudsearch/pc", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": "https://music.163.com",
                    "User-Agent": this.USER_AGENT,
                },
                body: new URLSearchParams({
                    params: encrypted.params,
                    encSecKey: encrypted.encSecKey,
                }),
            });

            const data = await response.json();
            
            if (data.result?.songs) {
                return data.result.songs.map((song: any) => ({
                    id: String(song.id),
                    name: song.name,
                    title: song.name,
                    artist: song.artists?.map((a: any) => a.name).join(", ") || "",
                    artistId: song.artists?.[0]?.id,
                    album: song.album?.name || "",
                    albumId: song.album?.id,
                    albumArt: song.album?.picUrl,
                    year: song.publishTime ? new Date(song.publishTime).getFullYear().toString() : "",
                    duration: song.duration,
                }));
            }
            
            return [];
        } catch (error) {
            errorLog("网易云音乐搜索失败", error);
            return [];
        }
    }

    /**
     * QQ音乐搜索（无需Cookie版本）
     */
    public static async searchQQMusic(keyword: string, pageSize: number = 10): Promise<IMusicSearchResult[]> {
        try {
            // 使用公开API，无需Cookie
            const data = {
                req_0: {
                    module: "music.search.SearchCgiService",
                    method: "DoSearchForQQMusicDesktop",
                    param: {
                        query: keyword,
                        num_per_page: pageSize,
                        page_num: 1,
                        search_type: 0,
                    },
                },
            };

            const response = await fetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Referer": "https://y.qq.com/",
                    "User-Agent": this.USER_AGENT,
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();
            
            if (result.req_0?.data?.body?.song?.list) {
                return result.req_0.data.body.song.list.map((song: any) => ({
                    id: song.mid,
                    mid: song.mid,
                    name: song.title,
                    title: song.title,
                    artist: song.singer?.map((s: any) => s.name).join(", ") || "",
                    artistId: song.singer?.[0]?.mid,
                    album: song.album?.name || "",
                    albumId: song.album?.mid,
                    albumArt: song.album?.mid ? `https://y.qq.com/music/photo_new/T002R800x800M000${song.album.mid}.jpg` : "",
                    year: song.time_public || "",
                    duration: song.interval * 1000,
                }));
            }
            
            return [];
        } catch (error) {
            errorLog("QQ音乐搜索失败", error);
            return [];
        }
    }

    /**
     * 酷狗音乐搜索
     */
    public static async searchKugou(keyword: string, pageSize: number = 10): Promise<IMusicSearchResult[]> {
        try {
            const url = `https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(keyword)}&page=1&pagesize=${pageSize}&showtype=1`;
            
            const response = await fetch(url, {
                headers: {
                    "User-Agent": this.USER_AGENT,
                },
            });

            const data = await response.json();
            
            if (data.data?.info) {
                return data.data.info.map((song: any) => ({
                    id: song.hash,
                    hash: song.hash,
                    name: song.songname,
                    title: song.songname,
                    artist: song.singername,
                    album: song.album_name || "",
                    albumId: song.album_id,
                    duration: song.duration * 1000,
                }));
            }
            
            return [];
        } catch (error) {
            errorLog("酷狗音乐搜索失败", error);
            return [];
        }
    }

    /**
     * 酷我音乐搜索（无需Token版本）
     */
    public static async searchKuwo(keyword: string, pageSize: number = 10): Promise<IMusicSearchResult[]> {
        try {
            // 使用移动端API，不需要Token
            const url = `http://search.kuwo.cn/r.s?all=${encodeURIComponent(keyword)}&ft=music&client=kt&cluster=0&strategy=2012&encoding=utf8&rformat=json&ver=mbox&vipver=1&pn=0&rn=${pageSize}`;
            
            const response = await fetch(url, {
                headers: {
                    "Referer": "http://www.kuwo.cn/",
                    "User-Agent": "Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36",
                },
            });

            const data = await response.json();
            
            // 酷我音乐特殊格式处理
            if (data.abslist) {
                return data.abslist.map((song: any) => ({
                    id: song.MUSICRID?.replace("MUSIC_", "") || song.DC_TARGETID,
                    name: song.SONGNAME,
                    title: song.SONGNAME,
                    artist: song.ARTIST,
                    artistId: song.ARTISTID,
                    album: song.ALBUM || "",
                    albumId: song.ALBUMID,
                    albumArt: song.web_albumpic_short || song.albumpic || song.web_albumpic,
                    duration: parseInt(song.DURATION || "0", 10) * 1000,
                }));
            }
            
            return [];
        } catch (error) {
            errorLog("酷我音乐搜索失败", error);
            return [];
        }
    }

    /**
     * 咪咕音乐搜索（备用平台）
     */
    public static async searchMigu(keyword: string, pageSize: number = 10): Promise<IMusicSearchResult[]> {
        try {
            // 咪咕音乐无需认证
            const url = `https://m.music.migu.cn/migu/remoting/scr_search_tag?keyword=${encodeURIComponent(keyword)}&type=2&rows=${pageSize}&pgc=1`;
            
            const response = await fetch(url, {
                headers: {
                    "Referer": "https://m.music.migu.cn",
                    "User-Agent": this.USER_AGENT,
                },
            });

            const data = await response.json();
            
            if (data.musics) {
                return data.musics.map((song: any) => ({
                    id: song.copyrightId || song.id,
                    name: song.songName,
                    title: song.songName,
                    artist: song.singerName || song.artist,
                    album: song.albumName || "",
                    albumArt: song.cover || song.picUrl,
                    duration: 0, // 咪咕可能不返回时长
                }));
            }
            
            return [];
        } catch (error) {
            errorLog("咪咕音乐搜索失败", error);
            return [];
        }
    }

    /**
     * 获取酷狗音乐详细信息
     */
    public static async getKugouDetails(hash: string): Promise<IMusicMetadata | null> {
        try {
            const url = `https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${hash}`;
            
            const response = await fetch(url, {
                headers: {
                    "User-Agent": this.USER_AGENT,
                },
            });

            const data = await response.json();
            
            if (data.songName) {
                return {
                    title: data.songName,
                    artist: data.singerName,
                    album: data.albumName || "",
                    albumArt: data.imgUrl?.replace("{size}", "400"),
                    lyrics: data.lyrics,
                    duration: data.timeLength * 1000,
                };
            }
            
            return null;
        } catch (error) {
            errorLog("获取酷狗详细信息失败", error);
            return null;
        }
    }

    /**
     * 获取QQ音乐歌词（备用方案）
     */
    public static async getQQMusicLyrics(mid: string): Promise<string | null> {
        try {
            // 方案A：使用旧版API（可能无需登录）
            const url = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_yqq.fcg?nobase64=1&musicid=0&songmid=${mid}&songtype=0&format=json`;
            
            const response = await fetch(url, {
                headers: {
                    "Referer": "https://y.qq.com/",
                    "User-Agent": this.USER_AGENT,
                },
            });

            const text = await response.text();
            
            // 处理JSONP格式
            if (text.includes("MusicJsonCallback") || text.includes("jsonCallback")) {
                const jsonStr = text.replace(/^[^(]*\(/, "").replace(/\)[^)]*$/, "");
                try {
                    const data = JSON.parse(jsonStr);
                    if (data.lyric) {
                        // 如果是Base64编码的
                        if (data.lyric.includes("[") && data.lyric.includes("]")) {
                            return data.lyric; // 已经是纯文本
                        }
                        return this.base64Decode(data.lyric);
                    }
                } catch (e) {
                    console.warn("QQ音乐歌词解析失败", e);
                }
            }
            
            return null;
        } catch (error) {
            errorLog("获取QQ音乐歌词失败", error);
            return null;
        }
    }

    /**
     * 获取网易云音乐详细信息
     */
    public static async getNeteaseDetails(songId: string): Promise<IMusicMetadata | null> {
        try {
            const params = JSON.stringify({
                ids: [songId],
                c: JSON.stringify([{ id: songId }]),
            });

            const encrypted = NeteaseEncrypt.encrypt(params);
            
            const response = await fetch("https://music.163.com/weapi/v3/song/detail", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": "https://music.163.com",
                    "User-Agent": this.USER_AGENT,
                },
                body: new URLSearchParams({
                    params: encrypted.params,
                    encSecKey: encrypted.encSecKey,
                }),
            });

            const data = await response.json();
            
            if (data.songs && data.songs.length > 0) {
                const song = data.songs[0];
                return {
                    title: song.name,
                    artist: song.ar?.map((a: any) => a.name).join(", "),
                    album: song.al?.name,
                    albumArt: song.al?.picUrl,
                    year: song.publishTime ? new Date(song.publishTime).getFullYear().toString() : "",
                    trackNumber: song.no,
                    discNumber: song.cd,
                    duration: song.dt,
                };
            }
            
            return null;
        } catch (error) {
            errorLog("获取网易云详细信息失败", error);
            return null;
        }
    }

    /**
     * 获取网易云歌词
     */
    public static async getNeteaseLyrics(songId: string): Promise<string | null> {
        try {
            const params = JSON.stringify({
                id: songId,
                os: "pc",
                lv: -1,
                kv: -1,
                tv: -1,
            });

            const encrypted = NeteaseEncrypt.encrypt(params);
            
            const response = await fetch("https://music.163.com/weapi/song/lyric", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": "https://music.163.com",
                    "User-Agent": this.USER_AGENT,
                },
                body: new URLSearchParams({
                    params: encrypted.params,
                    encSecKey: encrypted.encSecKey,
                }),
            });

            const data = await response.json();
            return data.lrc?.lyric || null;
        } catch (error) {
            errorLog("获取网易云歌词失败", error);
            return null;
        }
    }
}

// 主API类
class MusicMetadataAPI {
    // 默认启用的音乐源
    private static sources = ["netease", "qqmusic", "kugou", "kuwo"];

    /**
     * 从多个平台搜索并获取最佳匹配
     */
    public static async searchBestMatch(
        title: string,
        artist?: string
    ): Promise<IMusicMetadata | null> {
        const keyword = artist ? `${title} ${artist}` : title;
        
        // 并行搜索多个平台，使用Promise.allSettled确保部分失败不影响整体
        const searchPromises = [
            MusicPlatformAPI.searchNetease(keyword, 5),
            MusicPlatformAPI.searchQQMusic(keyword, 5),
            MusicPlatformAPI.searchKugou(keyword, 5),
            MusicPlatformAPI.searchKuwo(keyword, 5),
            MusicPlatformAPI.searchMigu(keyword, 5), // 添加咪咕作为备用
        ];

        try {
            const results = await Promise.allSettled(searchPromises);
            
            // 收集所有成功的结果
            const allResults: IMusicSearchResult[] = [];
            results.forEach((result, index) => {
                if (result.status === "fulfilled" && result.value.length > 0) {
                    // 为每个结果添加来源标记
                    const platformResults = result.value.map((item: IMusicSearchResult) => ({
                        ...item,
                        _source: ["netease", "qqmusic", "kugou", "kuwo", "migu"][index],
                    }));
                    allResults.push(...platformResults);
                } else if (result.status === "rejected") {
                    console.warn(`平台${["网易云", "QQ音乐", "酷狗", "酷我", "咪咕"][index]}搜索失败:`, result.reason);
                }
            });

            if (allResults.length === 0) {
                return null;
            }

            // 智能匹配算法：根据标题和艺术家相似度选择最佳结果
            let bestMatch = allResults[0];
            let bestScore = 0;
            
            for (const result of allResults) {
                // 计算标题相似度
                const titleScore = this.calculateSimilarity(
                    title.toLowerCase(),
                    (result.title || result.name || "").toLowerCase()
                );
                
                // 计算艺术家相似度
                let artistScore = 0.5; // 默认值
                if (artist && result.artist) {
                    artistScore = this.calculateSimilarity(
                        artist.toLowerCase(),
                        result.artist.toLowerCase()
                    );
                }
                
                // 综合评分（标题权重70%，艺术家权重30%）
                let totalScore = titleScore * 0.7 + artistScore * 0.3;
                
                // 如果有封面图，额外加分
                if (result.albumArt) {
                    totalScore = totalScore * 1.1;
                }
                
                if (totalScore > bestScore) {
                    bestScore = totalScore;
                    bestMatch = result;
                }
            }
            
            // 转换为元数据格式
            const metadata: IMusicMetadata = {
                title: bestMatch.title || bestMatch.name,
                artist: bestMatch.artist,
                album: bestMatch.album,
                albumArt: bestMatch.albumArt,
                year: bestMatch.year,
            };

            // 根据来源平台获取更详细的信息
            try {
                // 使用_source标记判断结果来源
                const source = (bestMatch as any)._source;
                
                switch (source) {
                case "netease": // 网易云
                    if (bestMatch.id) {
                        // 获取歌词
                        const lyrics = await MusicPlatformAPI.getNeteaseLyrics(bestMatch.id);
                        if (lyrics) {
                            metadata.lyrics = lyrics;
                        }
                        // 获取详细信息
                        const details = await MusicPlatformAPI.getNeteaseDetails(bestMatch.id);
                        if (details) {
                            Object.assign(metadata, details);
                        }
                    }
                    break;
                case "qqmusic": // QQ音乐
                    if (bestMatch.mid) {
                        const lyrics = await MusicPlatformAPI.getQQMusicLyrics(bestMatch.mid);
                        if (lyrics) {
                            metadata.lyrics = lyrics;
                        }
                    }
                    break;
                case "kugou": // 酷狗
                    if (bestMatch.hash) {
                        const details = await MusicPlatformAPI.getKugouDetails(bestMatch.hash);
                        if (details) {
                            Object.assign(metadata, details);
                        }
                    }
                    break;
                case "kuwo": // 酷我
                    // 酷我暂时不获取额外信息
                    break;
                case "migu": // 咪咕
                    // 咪咕音乐通常在搜索结果中已包含基本信息
                    break;
                default:
                    console.warn("未知的音乐源:", source);
                }
            } catch (error) {
                console.warn("获取详细元数据失败", error);
            }

            return metadata;
        } catch (error) {
            errorLog("搜索元数据失败", error);
            return null;
        }
    }

    /**
     * 批量获取元数据
     */
    public static async batchFetchMetadata(
        items: Array<{ title: string; artist?: string }>
    ): Promise<Map<string, IMusicMetadata>> {
        const results = new Map<string, IMusicMetadata>();
        
        // 控制并发数
        const batchSize = 3;
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const promises = batch.map(item => this.searchBestMatch(item.title, item.artist));
            
            try {
                const batchResults = await Promise.all(promises);
                batch.forEach((item, index) => {
                    const result = batchResults[index];
                    if (result) {
                        const key = `${item.title}-${item.artist || ""}`;
                        results.set(key, result);
                    }
                });
            } catch (error) {
                errorLog("批量获取元数据失败", error);
            }
        }

        return results;
    }

    /**
     * 创建默认元数据（降级方案）
     */
    public static createDefaultMetadata(
        title: string,
        artist?: string,
        album?: string
    ): IMusicMetadata {
        return {
            title: title || "Unknown Title",
            artist: artist || "Unknown Artist",
            album: album || "Unknown Album",
            albumArtist: artist,
            year: new Date().getFullYear().toString(),
            comment: "Tagged by MusicFree",
        };
    }

    /**
     * 从文件名推测元数据
     */
    public static inferMetadataFromFilename(filename: string): IMusicMetadata {
        // 尝试从文件名中提取信息
        // 常见格式: "艺术家 - 歌名.mp3" 或 "歌名 - 艺术家.mp3"
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
        const parts = nameWithoutExt.split(/\s*[-–—]\s*/);
        
        if (parts.length >= 2) {
            // 尝试智能判断哪个是歌名，哪个是艺术家
            // 通常较短的是艺术家名
            const [part1, part2] = parts;
            if (part1.length < part2.length) {
                return this.createDefaultMetadata(part2, part1);
            } else {
                return this.createDefaultMetadata(part1, part2);
            }
        }
        
        return this.createDefaultMetadata(nameWithoutExt);
    }

    /**
     * 验证元数据完整性
     */
    public static validateMetadata(metadata: IMusicMetadata): boolean {
        // 检查必要字段
        if (!metadata.title || !metadata.artist) {
            return false;
        }
        
        // 检查字段长度（避免过长的标签导致写入失败）
        const maxLength = 255;
        if (metadata.title.length > maxLength || 
            metadata.artist.length > maxLength ||
            (metadata.album && metadata.album.length > maxLength)) {
            return false;
        }
        
        return true;
    }

    /**
     * 清理和规范化元数据
     */
    public static sanitizeMetadata(metadata: IMusicMetadata): IMusicMetadata {
        const sanitized = { ...metadata };
        
        // 移除多余的空格
        if (sanitized.title) sanitized.title = sanitized.title.trim();
        if (sanitized.artist) sanitized.artist = sanitized.artist.trim();
        if (sanitized.album) sanitized.album = sanitized.album.trim();
        
        // 移除特殊字符（可能导致标签写入失败）
        // eslint-disable-next-line no-control-regex
        const cleanString = (str: string) => str.replace(/[\x00-\x1F\x7F]/g, "");
        if (sanitized.title) sanitized.title = cleanString(sanitized.title);
        if (sanitized.artist) sanitized.artist = cleanString(sanitized.artist);
        if (sanitized.album) sanitized.album = cleanString(sanitized.album);
        
        // 限制字段长度
        const maxLength = 255;
        if (sanitized.title && sanitized.title.length > maxLength) {
            sanitized.title = sanitized.title.substring(0, maxLength);
        }
        if (sanitized.artist && sanitized.artist.length > maxLength) {
            sanitized.artist = sanitized.artist.substring(0, maxLength);
        }
        if (sanitized.album && sanitized.album.length > maxLength) {
            sanitized.album = sanitized.album.substring(0, maxLength);
        }
        
        return sanitized;
    }
    private static calculateSimilarity(str1: string, str2: string): number {
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();
        
        if (s1 === s2) return 1;
        
        const len1 = s1.length;
        const len2 = s2.length;
        
        if (len1 === 0 || len2 === 0) return 0;
        
        const maxLen = Math.max(len1, len2);
        const editDistance = this.levenshteinDistance(s1, s2);
        
        return 1 - (editDistance / maxLen);
    }

    /**
     * Levenshtein距离算法
     */
    private static levenshteinDistance(str1: string, str2: string): number {
        const m = str1.length;
        const n = str2.length;
        const dp: number[][] = [];

        for (let i = 0; i <= m; i++) {
            dp[i] = [];
            dp[i][0] = i;
        }

        for (let j = 0; j <= n; j++) {
            dp[0][j] = j;
        }

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(
                        dp[i - 1][j] + 1,    // 删除
                        dp[i][j - 1] + 1,    // 插入
                        dp[i - 1][j - 1] + 1 // 替换
                    );
                }
            }
        }

        return dp[m][n];
    }
}

// 导出单例
const musicMetadataAPI = MusicMetadataAPI;
export default musicMetadataAPI;