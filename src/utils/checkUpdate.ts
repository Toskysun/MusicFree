import axios from "axios";
import { compare } from "compare-versions";
import DeviceInfo from "react-native-device-info";
import { devLog } from "@/utils/log";

const updateList = [
    "https://raw.githubusercontent.com/Toskysun/MusicFree/master/release/version.json",
    "https://cdn.jsdelivr.net/gh/Toskysun/MusicFree@master/release/version.json",
];

// GitHub API备选方案
const GITHUB_API_URL = "https://api.github.com/repos/Toskysun/MusicFree/releases/latest";

interface IUpdateInfo {
    needUpdate: boolean;
    data: {
        version: string;
        changeLog: string[];
        download: string[];
    };
}

interface GitHubRelease {
    tag_name: string;
    name: string;
    body: string;
    assets: Array<{
        name: string;
        browser_download_url: string;
    }>;
}

export default async function checkUpdate(): Promise<IUpdateInfo | undefined> {
    const currentVersion = DeviceInfo.getVersion();
    devLog('info', '📱[版本检查] 开始检查更新', { 
        currentVersion,
        updateSources: updateList.length + 1
    });
    
    // 方案1: 尝试从version.json文件获取
    for (let i = 0; i < updateList.length; ++i) {
        try {
            devLog('info', '🔍[版本检查] 尝试从version.json获取', { 
                source: updateList[i],
                attempt: i + 1
            });
            
            const rawInfo = (await axios.get(updateList[i], {
                timeout: 10000
            })).data;
            
            devLog('info', '✅[版本检查] version.json获取成功', {
                source: updateList[i],
                latestVersion: rawInfo.version,
                currentVersion
            });
            
            if (compare(rawInfo.version, currentVersion, ">")) {
                devLog('info', '🎉[版本检查] 发现新版本', {
                    currentVersion,
                    latestVersion: rawInfo.version,
                    source: 'version.json'
                });
                return {
                    needUpdate: true,
                    data: rawInfo,
                };
            }
            
            devLog('info', '✨[版本检查] 当前已是最新版本', {
                currentVersion,
                latestVersion: rawInfo.version
            });
            return {
                needUpdate: false,
                data: rawInfo,
            };
        } catch (error: any) {
            devLog('warn', '⚠️[版本检查] version.json获取失败', {
                source: updateList[i],
                error: error?.message || String(error)
            });
        }
    }
    
    // 方案2: 从GitHub API获取最新Release信息
    try {
        devLog('info', '🔍[版本检查] 尝试从GitHub API获取', { 
            apiUrl: GITHUB_API_URL
        });
        
        const response = await axios.get(GITHUB_API_URL, {
            timeout: 15000,
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MusicFree-App'
            }
        });
        
        const release: GitHubRelease = response.data;
        const latestVersion = release.tag_name.replace(/^v/, ''); // 移除v前缀
        
        devLog('info', '✅[版本检查] GitHub API获取成功', {
            latestVersion,
            currentVersion,
            releaseName: release.name
        });
        
        if (compare(latestVersion, currentVersion, ">")) {
            // 解析更新日志
            const changeLog = release.body 
                ? release.body.split('\n').filter(line => line.trim()).slice(0, 10) // 最多10行
                : [`版本 ${latestVersion} 更新`];
            
            // 获取下载链接 - 优先ARM64版本
            const downloadUrls: string[] = [];
            const arm64Asset = release.assets.find(asset => 
                asset.name.includes('arm64-v8a-release.apk')
            );
            const universalAsset = release.assets.find(asset => 
                asset.name.includes('universal-release.apk')
            );
            
            if (arm64Asset) {
                downloadUrls.push(arm64Asset.browser_download_url);
            }
            if (universalAsset) {
                downloadUrls.push(universalAsset.browser_download_url);
            }
            
            // 如果没找到预期的APK，使用所有APK文件
            if (downloadUrls.length === 0) {
                release.assets
                    .filter(asset => asset.name.endsWith('.apk'))
                    .forEach(asset => downloadUrls.push(asset.browser_download_url));
            }
            
            devLog('info', '🎉[版本检查] GitHub发现新版本', {
                currentVersion,
                latestVersion,
                downloadUrls: downloadUrls.length,
                source: 'GitHub API'
            });
            
            return {
                needUpdate: true,
                data: {
                    version: latestVersion,
                    changeLog,
                    download: downloadUrls
                }
            };
        }
        
        devLog('info', '✨[版本检查] GitHub显示当前已是最新版本', {
            currentVersion,
            latestVersion
        });
        
        return {
            needUpdate: false,
            data: {
                version: latestVersion,
                changeLog: ['当前已是最新版本'],
                download: []
            }
        };
        
    } catch (error: any) {
        devLog('error', '❌[版本检查] GitHub API获取失败', {
            apiUrl: GITHUB_API_URL,
            error: error?.message || String(error)
        });
    }
    
    devLog('error', '❌[版本检查] 所有更新源都失败');
    return undefined;
}
