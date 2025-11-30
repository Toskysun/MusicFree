declare namespace ILyric {
    export interface ILyricItem extends IMusic.IMusicItem {
        /** 歌词（无时间戳） */
        rawLrcTxt?: string;
    }

    export interface ILyricSource {
        /** @deprecated 歌词url */
        lrc?: string;
        /** 纯文本格式歌词 */
        rawLrc?: string;
        /** 纯文本格式的翻译 */
        translation?: string;
        /** 纯文本格式的罗马音 */
        romanization?: string;
    }

    /** 逐字歌词单词数据 */
    export interface IWordData {
        /** 单词文本内容 */
        text: string;
        /** 开始时间（毫秒） */
        startTime: number;
        /** 持续时间（毫秒） */
        duration: number;
        /** 该单词后是否有空格 */
        space?: boolean;
    }

    export interface IParsedLrcItem {
        /** 时间 s */
        time: number;
        /** 歌词 */
        lrc: string;
        /** 下标 */
        index?: number;
        /** 翻译 */
        translation?: string;
        /** 罗马音 */
        romanization?: string;
        /** 是否有逐字歌词 */
        hasWordByWord?: boolean;
        /** 逐字歌词数据（毫秒） */
        words?: IWordData[];
        /** 行持续时间（毫秒） */
        duration?: number;
        /** 罗马音逐字歌词数据（毫秒） */
        romanizationWords?: IWordData[];
        /** 罗马音是否有逐字歌词 */
        hasRomanizationWordByWord?: boolean;
        /** 罗马音行持续时间（毫秒） */
        romanizationDuration?: number;
    }

    export type IParsedLrc = IParsedLrcItem[];
}
