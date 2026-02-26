import axios from 'axios';
import { devLog, errorLog } from '@/utils/log';
import PersistStatus from '@/utils/persistStatus';
import getOrCreateMMKV from '@/utils/getOrCreateMMKV';
import { version } from '../../package.json';
import { safeParse } from '@/utils/jsonUtil';

const ANNOUNCEMENT_SOURCES = [
    // 主要源 - GitHub
    'https://raw.githubusercontent.com/Toskysun/MusicFree/master/release/announcements.json',
    // 备用源 - CDN 加速
    'https://cdn.jsdelivr.net/gh/Toskysun/MusicFree@master/release/announcements.json',
];

// 检查间隔: 24小时
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;

class AnnouncementService {
    private mmkv = getOrCreateMMKV('announcements');

    /**
     * 获取存储的公告数据
     */
    private getStorageData(): IAnnouncement.IAnnouncementStorage {
        const raw = this.mmkv.getString('data');
        if (raw) {
            const parsed = safeParse(raw);
            if (parsed) {
                return parsed as IAnnouncement.IAnnouncementStorage;
            }
        }
        return {
            readIds: [],
            lastCheckTime: 0,
            ignoredIds: []
        };
    }

    /**
     * 保存公告数据
     */
    private saveStorageData(data: IAnnouncement.IAnnouncementStorage) {
        this.mmkv.set('data', JSON.stringify(data));
    }

    /**
     * 标记公告为已读
     */
    public markAsRead(announcementId: string) {
        const data = this.getStorageData();
        if (!data.readIds.includes(announcementId)) {
            data.readIds.push(announcementId);
            this.saveStorageData(data);
        }
    }

    /**
     * 标记公告为忽略（不再显示）
     */
    public markAsIgnored(announcementId: string) {
        const data = this.getStorageData();
        if (!data.ignoredIds.includes(announcementId)) {
            data.ignoredIds.push(announcementId);
            this.saveStorageData(data);
        }
    }

    /**
     * 检查公告是否应该显示
     */
    private shouldShowAnnouncement(
        announcement: IAnnouncement.IAnnouncementItem,
        storageData: IAnnouncement.IAnnouncementStorage
    ): boolean {
        // 检查是否已忽略
        if (storageData.ignoredIds.includes(announcement.id)) {
            return false;
        }

        // 检查是否已读且只显示一次
        if (announcement.showOnce && storageData.readIds.includes(announcement.id)) {
            return false;
        }

        // 检查版本要求
        const currentVersion = version;
        if (announcement.minVersion && this.compareVersions(currentVersion, announcement.minVersion) < 0) {
            return false;
        }
        if (announcement.maxVersion && this.compareVersions(currentVersion, announcement.maxVersion) > 0) {
            return false;
        }

        // 检查是否过期
        if (announcement.expireTime) {
            const expireDate = new Date(announcement.expireTime);
            if (expireDate < new Date()) {
                return false;
            }
        }

        return true;
    }

    /**
     * 版本比较
     * @returns -1: v1 < v2, 0: v1 = v2, 1: v1 > v2
     */
    private compareVersions(v1: string, v2: string): number {
        const parts1 = v1.split('.').map(n => parseInt(n, 10));
        const parts2 = v2.split('.').map(n => parseInt(n, 10));

        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const part1 = parts1[i] || 0;
            const part2 = parts2[i] || 0;

            if (part1 < part2) return -1;
            if (part1 > part2) return 1;
        }

        return 0;
    }

    /**
     * 从远程获取公告
     */
    private async fetchAnnouncements(): Promise<IAnnouncement.IAnnouncementResponse | null> {
        for (const source of ANNOUNCEMENT_SOURCES) {
            try {
                devLog('info', `📢 正在从 ${source} 获取公告...`);
                const response = await axios.get<IAnnouncement.IAnnouncementResponse>(
                    source,
                    {
                        timeout: 10000,
                        headers: {
                            'Accept': 'application/json',
                            'Cache-Control': 'no-cache'
                        }
                    }
                );

                if (response.data && response.data.announcements) {
                    devLog('info', `✅ 成功获取 ${response.data.announcements.length} 条公告`);
                    return response.data;
                }
            } catch (error) {
                devLog('warn', `⚠️ 从 ${source} 获取公告失败:`, error);
                continue;
            }
        }

        errorLog('获取公告失败，所有源都不可用', null);
        return null;
    }

    /**
     * 获取缓存的公告
     */
    private getCachedAnnouncements(): IAnnouncement.IAnnouncementResponse | null {
        const cached = this.mmkv.getString('cached_announcements');
        if (cached) {
            const parsed = safeParse(cached);
            if (parsed) {
                return parsed as IAnnouncement.IAnnouncementResponse;
            }
        }
        return null;
    }

    /**
     * 缓存公告数据
     */
    private cacheAnnouncements(data: IAnnouncement.IAnnouncementResponse) {
        this.mmkv.set('cached_announcements', JSON.stringify(data));
    }

    /**
     * 检查并获取需要显示的公告
     */
    public async checkAnnouncements(force: boolean = false): Promise<IAnnouncement.IAnnouncementItem | null> {
        try {
            const storageData = this.getStorageData();
            const now = Date.now();

            // 检查是否需要获取新公告
            const shouldFetch = force || (now - storageData.lastCheckTime) > CHECK_INTERVAL;

            let announcementData: IAnnouncement.IAnnouncementResponse | null = null;

            if (shouldFetch) {
                devLog('info', '🔄 开始检查在线公告...');
                announcementData = await this.fetchAnnouncements();

                if (announcementData) {
                    // 缓存公告数据
                    this.cacheAnnouncements(announcementData);
                    // 更新最后检查时间
                    storageData.lastCheckTime = now;
                    this.saveStorageData(storageData);
                } else {
                    // 如果获取失败，使用缓存
                    announcementData = this.getCachedAnnouncements();
                }
            } else {
                // 使用缓存的公告
                announcementData = this.getCachedAnnouncements();
            }

            if (!announcementData || !announcementData.announcements) {
                return null;
            }

            // 按优先级排序（priority 小的优先）
            const sortedAnnouncements = [...announcementData.announcements].sort(
                (a, b) => (a.priority || 999) - (b.priority || 999)
            );

            // 找出第一个应该显示的公告
            for (const announcement of sortedAnnouncements) {
                if (this.shouldShowAnnouncement(announcement, storageData)) {
                    devLog('info', `📌 找到待显示公告: ${announcement.title}`);
                    return announcement;
                }
            }

            devLog('info', '✅ 没有需要显示的新公告');
            return null;
        } catch (error) {
            errorLog('检查公告时出错', error);
            return null;
        }
    }

    /**
     * 清除公告历史记录
     */
    public clearHistory() {
        this.saveStorageData({
            readIds: [],
            lastCheckTime: 0,
            ignoredIds: []
        });
        this.mmkv.delete('cached_announcements');
        devLog('info', '🗑️ 公告历史记录已清除');
    }

    /**
     * 获取所有缓存的公告（用于调试）
     */
    public getAllCachedAnnouncements(): IAnnouncement.IAnnouncementItem[] {
        const cached = this.getCachedAnnouncements();
        return cached?.announcements || [];
    }
}

const announcementService = new AnnouncementService();
export default announcementService;