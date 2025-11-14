declare namespace IAnnouncement {
    interface IAnnouncementItem {
        /** 公告唯一标识 */
        id: string;
        /** 公告标题 */
        title: string;
        /** 公告内容 (字符串数组，每个元素为一行) */
        content: string[];
        /** 优先级 (数字越小优先级越高) */
        priority?: number;
        /** 最小版本要求 */
        minVersion?: string;
        /** 最大版本要求 */
        maxVersion?: string;
        /** 过期时间 */
        expireTime?: string;
        /** 是否只显示一次 */
        showOnce?: boolean;
        /** 创建时间 */
        createTime?: string;
        /** 公告类型 */
        type?: 'info' | 'warning' | 'success' | 'error';
    }

    interface IAnnouncementResponse {
        /** 公告列表 */
        announcements: IAnnouncementItem[];
        /** 响应时间 */
        timestamp?: string;
    }

    interface IAnnouncementStorage {
        /** 已读公告ID列表 */
        readIds: string[];
        /** 最后检查时间 */
        lastCheckTime: number;
        /** 已忽略的公告ID列表 (不再显示) */
        ignoredIds: string[];
    }
}