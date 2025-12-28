import { devLog } from '@/utils/log';

const timeReg = /\[[\d:.]+\]/g;
const metaReg = /\[(.+):(.+)\]/g;
// 逐字歌词格式1: [92260,4740](0,500,0)歌(500,300,0)词
const LINE_TIME_PATTERN = /^\[(\d+),(\d+)\](.+)$/;
const WORD_PATTERN = /\((\d+),(\d+),\d+\)([^(]*?)(?=\(|$)/g;
// 逐字歌词格式2: [00:01.181]<00:01.181>文字<00:01.339>文字...
const ANGLE_BRACKET_TIME_PATTERN = /<([\d:.]+)>/g;
const HAS_ANGLE_BRACKET_PATTERN = /\[[\d:.]+\]<[\d:.]+>/;

// QRC 格式逐字歌词正则：字(ms,duration)
// Uses negative lookahead to match any character until a timestamp pattern (digits,digits)
// This correctly handles spaces, parentheses, and special characters
// Pattern reference: LDDC project
const QRC_WORD_PATTERN = /((?:(?!\(\d+,\d+\)).)*)\((\d+),\d+\)/g;

// Time tolerance for matching translation/romanization lines (in seconds)
// Allows matching when timestamps differ by up to 50ms (0.05 seconds)
// This enables precise matching for word-by-word lyrics with slight timing variations
// Example: [00:21.783] and [00:21.784] will be matched together
const TIME_MATCH_TOLERANCE = 0.05;

/**
 * 将毫秒转换为 MM:SS.mmm 格式
 * @param ms 毫秒
 * @returns 格式化的时间字符串
 */
function msToTimestamp(ms: number): string {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
}

/**
 * 将 QRC 格式的逐字歌词行转换为尖括号格式
 *
 * 输入格式: [21783,3850]凉(21783,220)风(22003,260)轻(22263,260)...
 * 输出格式: [00:21.783]<00:21.783>凉<00:22.003>风<00:22.263>轻...
 *
 * @param qrcLine QRC 格式的歌词行
 * @returns 尖括号格式的歌词行，如果解析失败返回空字符串
 */
export function formatQrcToAngleBracket(qrcLine: string): string {
    // 提取行起始时间 [start_ms, duration_ms]
    const lineTimingMatch = qrcLine.match(/^\[(\d+),\d+\]/);
    if (!lineTimingMatch) {
        return '';
    }

    const lineStartMs = parseInt(lineTimingMatch[1], 10);
    const lineTimestamp = msToTimestamp(lineStartMs);

    // 移除 [timestamp,duration] 前缀获取逐字内容
    const contentAfterTiming = qrcLine.replace(/^\[\d+,\d+\]/, '');

    // 解析逐字时间: 字(start_ms,duration_ms)
    QRC_WORD_PATTERN.lastIndex = 0;
    const formattedWords: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = QRC_WORD_PATTERN.exec(contentAfterTiming)) !== null) {
        const word = match[1];
        const wordStartMs = parseInt(match[2], 10);
        const wordTimestamp = msToTimestamp(wordStartMs);
        formattedWords.push(`<${wordTimestamp}>${word}`);
    }

    // 如果没有解析到任何单词，返回空
    if (formattedWords.length === 0) {
        return '';
    }

    // 组合行时间戳与逐字时间戳
    return `[${lineTimestamp}]${formattedWords.join('')}`;
}

/**
 * 批量转换 QRC 格式歌词为尖括号格式
 * @param qrcContent QRC 格式的完整歌词内容
 * @returns 尖括号格式的完整歌词内容
 */
export function formatQrcContentToAngleBracket(qrcContent: string): string {
    const lines = qrcContent.split('\n');
    const formattedLines: string[] = [];
    let filteredCount = 0;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Filter out comment lines in both LRC and QRC formats:
        // LRC format: [00:00.75]//
        // QRC format: [750,1000]//
        if (/^\[[\d:.]+\]\/\//.test(trimmedLine) || /^\[\d+,\d+\]\/\//.test(trimmedLine)) {
            filteredCount++;
            continue;
        }

        // 检查是否是元数据标签 [tag:value]
        if (/^\[[a-zA-Z]+:/.test(trimmedLine)) {
            formattedLines.push(trimmedLine);
            continue;
        }

        // 检查是否是 QRC 时间格式 [ms,duration]
        if (/^\[\d+,\d+\]/.test(trimmedLine)) {
            const formatted = formatQrcToAngleBracket(trimmedLine);
            if (formatted) {
                formattedLines.push(formatted);
            }
            continue;
        }

        // 其他格式保持原样
        formattedLines.push(trimmedLine);
    }

    if (filteredCount > 0) {
        devLog('info', '[歌词格式化] 过滤掉注释行', { count: filteredCount });
    }

    return formattedLines.join('\n');
}

type LyricMeta = Record<string, any>;

interface IOptions {
    musicItem?: IMusic.IMusicItem;
    lyricSource?: ILyric.ILyricSource;
    translation?: string;
    romanization?: string;
    extra?: Record<string, any>;
}

export interface IParsedLrcItem {
    /** 时间 s */
    time: number;
    /** 歌词 */
    lrc: string;
    /** 翻译 */
    translation?: string;
    /** 罗马音 */
    romanization?: string;
    /** 位置 */
    index: number;
    /** 是否有逐字歌词 */
    hasWordByWord?: boolean;
    /** 逐字歌词数据 */
    words?: ILyric.IWordData[];
    /** 行持续时间（毫秒） */
    duration?: number;
    /** 罗马音逐字歌词数据 */
    romanizationWords?: ILyric.IWordData[];
    /** 罗马音是否有逐字歌词 */
    hasRomanizationWordByWord?: boolean;
    /** 罗马音行持续时间（毫秒） */
    romanizationDuration?: number;
}

/**
 * 按时间戳格式化歌词，将原文、翻译、罗马音按行对齐
 * 参考 LDDC 项目的实现方式，按时间戳组织不同语言的歌词
 *
 * @param rawLrc 原文歌词
 * @param translation 翻译歌词（可选）
 * @param romanization 罗马音歌词（可选）
 * @param lyricOrder 歌词顺序，如 ["original", "translation", "romanization"]
 * @param options 其他选项
 * @returns 格式化后的歌词字符串
 */
export function formatLyricsByTimestamp(
    rawLrc: string,
    translation?: string,
    romanization?: string,
    lyricOrder?: Array<"original" | "translation" | "romanization">,
    options?: {
        enableWordByWord?: boolean;
    }
): string {
    const { enableWordByWord = false } = options || {};
    const order = lyricOrder || ["original", "translation", "romanization"];

    // Parse all lyrics using LyricParser
    const parser = new LyricParser(rawLrc, {
        translation,
        romanization,
    });

    const lrcItems = parser.getLyricItems();
    const meta = parser.getMeta();

    if (lrcItems.length === 0) {
        devLog('warn', '[歌词格式化] 解析后的歌词项为空', {
            hasRawLrc: !!rawLrc,
            hasTranslation: !!translation,
            hasRomanization: !!romanization,
        });
        return '';
    }

    // Build header tags (metadata)
    let result = '';
    const metaTags = ['ti', 'ar', 'al', 'by', 'offset'];
    for (const tag of metaTags) {
        if (meta[tag]) {
            result += `[${tag}:${meta[tag]}]\n`;
        }
    }
    if (result) {
        result += '\n';
    }

    // Process each timestamp group
    for (let i = 0; i < lrcItems.length; i++) {
        const item = lrcItems[i];
        const timestampGroups: string[] = [];

        // Build lines according to lyricOrder
        for (const langType of order) {
            let line = '';
            let content = '';

            switch (langType) {
                case "original":
                    content = item.lrc;
                    if (enableWordByWord && item.hasWordByWord && item.words) {
                        line = formatWordByWordLine(item.time, content, item.words, item.duration);
                    }
                    break;
                case "translation":
                    // Use == null to only skip undefined/null, allow empty string (breaks)
                    if (!parser.hasTranslation || item.translation == null) {
                        continue;
                    }
                    content = item.translation;
                    break;
                case "romanization":
                    // Use == null to only skip undefined/null, allow empty string (breaks)
                    if (!parser.hasRomanization || item.romanization == null) {
                        continue;
                    }
                    content = item.romanization;
                    if (enableWordByWord && item.hasRomanizationWordByWord && item.romanizationWords) {
                        line = formatWordByWordLine(item.time, content, item.romanizationWords, item.romanizationDuration);
                    }
                    break;
            }

            // For empty content: only output timestamp for original lyrics (breaks/pauses)
            // Skip empty translation/romanization to avoid duplicate empty lines
            if (!content.trim()) {
                if (langType === "original") {
                    const timestamp = timeToLrcTime(item.time);
                    timestampGroups.push(timestamp);
                }
                continue;
            }

            // Build line with timestamp
            if (!line) {
                const timestamp = timeToLrcTime(item.time);
                line = `${timestamp}${content}`;
            }

            timestampGroups.push(line);
        }

        // Join lines for this timestamp
        if (timestampGroups.length > 0) {
            result += timestampGroups.join('\n') + '\n';
        }
    }

    const finalResult = result.trim();

    devLog('info', '[歌词格式化] 格式化完成', {
        lyricsCount: lrcItems.length,
        hasTranslation: parser.hasTranslation,
        hasRomanization: parser.hasRomanization,
        enableWordByWord,
        resultLength: finalResult.length,
    });

    return finalResult;
}

/**
 * Format word-by-word lyric line using angle bracket notation
 * Output format: [00:21.783]<00:21.783>凉<00:22.003>风...<00:25.633>
 *
 * @param lineTime Line start time in seconds
 * @param text Plain text content
 * @param words Word timing data
 * @param lineDuration Optional line duration in milliseconds
 * @returns Formatted line with word-by-word timestamps and end timestamp
 */
function formatWordByWordLine(lineTime: number, text: string, words: ILyric.IWordData[], lineDuration?: number): string {
    // If no words data, return empty (will fallback to regular format)
    if (!words || words.length === 0) {
        return '';
    }

    const lineTimestamp = timeToLrcTime(lineTime);
    let result = lineTimestamp;
    let lastEndTimeMs = lineTime * 1000;

    for (const word of words) {
        const wordTimestamp = msToTimestamp(word.startTime);
        result += `<${wordTimestamp}>${word.text}`;
        lastEndTimeMs = word.startTime + (word.duration || 0);
    }

    // Add end timestamp
    const endTimeMs = lastEndTimeMs > lineTime * 1000 ? lastEndTimeMs : (lineTime * 1000 + (lineDuration || 0));
    const endTimestamp = msToTimestamp(endTimeMs);
    result += `<${endTimestamp}>`;

    return result;
}

/**
 * Convert seconds to [MM:SS.mmm] format with 3-digit milliseconds
 * @param sec Time in seconds
 * @returns LRC timestamp format (e.g., [00:21.783])
 */
function timeToLrcTime(sec: number): string {
    const min = Math.floor(sec / 60);
    sec = sec - min * 60;
    const secInt = Math.floor(sec);
    const secFloat = sec - secInt;
    return `[${min.toFixed(0).padStart(2, "0")}:${secInt
        .toString()
        .padStart(2, "0")}.${secFloat.toFixed(3).slice(2)}]`;
}

export default class LyricParser {
    private _musicItem?: IMusic.IMusicItem;

    private meta: LyricMeta;
    private lrcItems: Array<IParsedLrcItem>;

    private extra: Record<string, any>;

    private lastSearchIndex = 0;

    public hasTranslation = false;
    public hasRomanization = false;
    public lyricSource?: ILyric.ILyricSource;

    get musicItem() {
        return this._musicItem;
    }

    constructor(raw: string, options?: IOptions) {
        // init
        this._musicItem = options?.musicItem;
        this.extra = options?.extra || {};
        this.lyricSource = options?.lyricSource;

        let translation = options?.translation;
        let romanization = options?.romanization;
        if (!raw && translation) {
            raw = translation;
            translation = undefined;
        }

        const { lrcItems, meta } = this.parseLyricImpl(raw);
        if (this.extra.offset) {
            meta.offset = (meta.offset ?? 0) + this.extra.offset;
        }
        this.meta = meta;
        this.lrcItems = lrcItems;

        if (translation) {
            this.hasTranslation = true;
            const transLrcItems = this.parseLyricImpl(translation).lrcItems;

            // 如果翻译歌词为空，跳过处理
            if (transLrcItems.length === 0) {
                this.hasTranslation = false;
            } else {
                // 2 pointer with tolerance matching
                let p1 = 0;
                let p2 = 0;
                const matchedTransIndices = new Set<number>();

                while (p1 < this.lrcItems.length) {
                    const lrcItem = this.lrcItems[p1];
                    // Move p2 forward while translation time is too far behind
                    while (
                        transLrcItems[p2].time < lrcItem.time - TIME_MATCH_TOLERANCE &&
                        p2 < transLrcItems.length - 1
                    ) {
                        ++p2;
                    }
                    // Check if times match within tolerance
                    const timeDiff = Math.abs(transLrcItems[p2].time - lrcItem.time);
                    if (timeDiff <= TIME_MATCH_TOLERANCE) {
                        lrcItem.translation = transLrcItems[p2].lrc;
                        matchedTransIndices.add(p2);
                    } else {
                        lrcItem.translation = "";
                    }

                    ++p1;
                }

                // Add unmatched translation items (including empty lines/breaks)
                // This preserves timestamps that only exist in translation
                for (let i = 0; i < transLrcItems.length; i++) {
                    if (!matchedTransIndices.has(i)) {
                        this.lrcItems.push({
                            time: transLrcItems[i].time,
                            lrc: "",
                            translation: transLrcItems[i].lrc,
                            index: this.lrcItems.length,
                        });
                    }
                }

                // Re-sort after adding new items
                this.lrcItems.sort((a, b) => a.time - b.time);
                this.lrcItems.forEach((item, index) => {
                    item.index = index;
                });
            }
        }

        if (romanization) {
            this.hasRomanization = true;
            const romaLrcItems = this.parseLyricImpl(romanization).lrcItems;

            // 如果罗马音歌词为空，跳过处理
            if (romaLrcItems.length === 0) {
                this.hasRomanization = false;
            } else {
                // 2 pointer with tolerance matching - 同时提取文本和逐字数据
                let p1 = 0;
                let p2 = 0;
                const matchedRomaIndices = new Set<number>();

                while (p1 < this.lrcItems.length) {
                    const lrcItem = this.lrcItems[p1];
                    // Move p2 forward while romanization time is too far behind
                    while (
                        romaLrcItems[p2].time < lrcItem.time - TIME_MATCH_TOLERANCE &&
                        p2 < romaLrcItems.length - 1
                    ) {
                        ++p2;
                    }
                    // Check if times match within tolerance
                    const timeDiff = Math.abs(romaLrcItems[p2].time - lrcItem.time);
                    if (timeDiff <= TIME_MATCH_TOLERANCE) {
                        lrcItem.romanization = romaLrcItems[p2].lrc;
                        matchedRomaIndices.add(p2);
                        // 提取罗马音逐字数据
                        if (romaLrcItems[p2].hasWordByWord && romaLrcItems[p2].words) {
                            lrcItem.romanizationWords = romaLrcItems[p2].words;
                            lrcItem.hasRomanizationWordByWord = true;
                            lrcItem.romanizationDuration = romaLrcItems[p2].duration;
                        }
                    } else {
                        lrcItem.romanization = "";
                    }

                    ++p1;
                }

                // Add unmatched romanization items (including empty lines/breaks)
                // This preserves timestamps that only exist in romanization
                for (let i = 0; i < romaLrcItems.length; i++) {
                    if (!matchedRomaIndices.has(i)) {
                        this.lrcItems.push({
                            time: romaLrcItems[i].time,
                            lrc: "",
                            romanization: romaLrcItems[i].lrc,
                            index: this.lrcItems.length,
                            // Include word-by-word data if available
                            ...(romaLrcItems[i].hasWordByWord && romaLrcItems[i].words ? {
                                romanizationWords: romaLrcItems[i].words,
                                hasRomanizationWordByWord: true,
                                romanizationDuration: romaLrcItems[i].duration,
                            } : {}),
                        });
                    }
                }

                // Re-sort after adding new items
                this.lrcItems.sort((a, b) => a.time - b.time);
                this.lrcItems.forEach((item, index) => {
                    item.index = index;
                });
            }
        }
    }

    getPosition(position: number): IParsedLrcItem | null {
        position = position - (this.meta?.offset ?? 0);
        let index;
        /** 最前面 */
        if (!this.lrcItems[0] || position < this.lrcItems[0].time) {
            this.lastSearchIndex = 0;
            return null;
        }
        for (
            index = this.lastSearchIndex;
            index < this.lrcItems.length - 1;
            ++index
        ) {
            if (
                position >= this.lrcItems[index].time &&
                position < this.lrcItems[index + 1].time
            ) {
                this.lastSearchIndex = index;
                return this.lrcItems[index];
            }
        }

        for (index = 0; index < this.lastSearchIndex; ++index) {
            if (
                position >= this.lrcItems[index].time &&
                position < this.lrcItems[index + 1].time
            ) {
                this.lastSearchIndex = index;
                return this.lrcItems[index];
            }
        }

        index = this.lrcItems.length - 1;
        this.lastSearchIndex = index;
        return this.lrcItems[index];
    }

    getLyricItems() {
        return this.lrcItems;
    }

    getMeta() {
        return this.meta;
    }

    toString(options?: {
        withTimestamp?: boolean;
        type?: "raw" | "translation" | "romanization";
    }) {
        const { type = "raw", withTimestamp = true } = options || {};

        if (withTimestamp) {
            return this.lrcItems
                .map(
                    item =>
                        `${this.timeToLrctime(item.time)} ${
                            type === "raw"
                                ? item.lrc
                                : type === "translation"
                                ? item.translation
                                : item.romanization
                        }`,
                )
                .join("\r\n");
        } else {
            return this.lrcItems
                .map(item =>
                    type === "raw"
                        ? item.lrc
                        : type === "translation"
                        ? item.translation
                        : item.romanization
                )
                .join("\r\n");
        }
    }

    /** [xx:xx.xx] => x s */
    private parseTime(timeStr: string): number {
        let result = 0;
        const nums = timeStr.slice(1, timeStr.length - 1).split(":");
        for (let i = 0; i < nums.length; ++i) {
            result = result * 60 + +nums[i];
        }
        return result;
    }
    /** x s => [xx:xx.xxx] with 3-digit milliseconds */
    private timeToLrctime(sec: number) {
        const min = Math.floor(sec / 60);
        sec = sec - min * 60;
        const secInt = Math.floor(sec);
        const secFloat = sec - secInt;
        return `[${min.toFixed(0).padStart(2, "0")}:${secInt
            .toString()
            .padStart(2, "0")}.${secFloat.toFixed(3).slice(2)}]`;
    }

    private parseMetaImpl(metaStr: string) {
        if (metaStr === "") {
            return {};
        }
        const metaArr = metaStr.match(metaReg) ?? [];
        const meta: any = {};
        let k, v;
        for (const m of metaArr) {
            k = m.substring(1, m.indexOf(":"));
            v = m.substring(k.length + 2, m.length - 1);
            if (k === "offset") {
                meta[k] = +v / 1000;
            } else {
                meta[k] = v;
            }
        }
        return meta;
    }

    /** 解析尖括号逐字歌词格式: [00:01.181]<00:01.181>文字<00:01.339>文字... */
    private parseAngleBracketLine(line: string): IParsedLrcItem | null {
        // 提取行开始时间 [mm:ss.xxx]
        const lineTimeMatch = line.match(/^\[([\d:.]+)\]/);
        if (!lineTimeMatch) return null;

        const lineStartTime = this.parseTime(`[${lineTimeMatch[1]}]`);
        const content = line.substring(lineTimeMatch[0].length);

        // 解析所有 <时间>文字 对
        const words: ILyric.IWordData[] = [];
        const textParts: string[] = [];

        ANGLE_BRACKET_TIME_PATTERN.lastIndex = 0;
        let match: RegExpExecArray | null;
        const timePositions: { time: number; index: number }[] = [];

        // 首先找到所有时间标记的位置
        while ((match = ANGLE_BRACKET_TIME_PATTERN.exec(content)) !== null) {
            const timeStr = match[1];
            const timeInSeconds = this.parseAngleBracketTime(timeStr);
            timePositions.push({
                time: timeInSeconds * 1000, // 转为毫秒
                index: match.index + match[0].length,
            });
        }

        // 然后提取每个时间标记后的文字
        for (let i = 0; i < timePositions.length; i++) {
            const startIdx = timePositions[i].index;
            const endIdx =
                i < timePositions.length - 1
                    ? content.indexOf('<', startIdx)
                    : content.length;

            if (endIdx > startIdx) {
                const text = content.substring(startIdx, endIdx);
                // Only filter out truly empty text, preserve spaces as they have their own timestamps
                if (text) {
                    const nextTime =
                        i < timePositions.length - 1
                            ? timePositions[i + 1].time
                            : timePositions[i].time + 500; // 默认 500ms
                    const duration = nextTime - timePositions[i].time;

                    words.push({
                        text: text,
                        startTime: timePositions[i].time,
                        duration: Math.max(duration, 50), // 最小持续 50ms
                        space: text.endsWith(' '),
                    });
                    textParts.push(text);
                }
            }
        }

        // Fix: For lines with only time markers and no actual text, return empty lyric line
        // This prevents fallback to standard LRC parser which would show time markers as text
        if (words.length === 0 && timePositions.length > 0) {
            return {
                time: lineStartTime,
                lrc: '',
                index: 0,
                hasWordByWord: false,
                words: undefined,
                duration: undefined,
            };
        }

        if (words.length === 0) return null;

        // 计算行持续时间
        const lastWord = words[words.length - 1];
        const lineDuration = lastWord.startTime + lastWord.duration - words[0].startTime;

        return {
            time: lineStartTime,
            lrc: textParts.join('').trim(),
            index: 0,
            hasWordByWord: true,
            words: words,
            duration: lineDuration,
        };
    }

    /** 解析 mm:ss.xxx 或 mm:ss 格式的时间为秒 */
    private parseAngleBracketTime(timeStr: string): number {
        const parts = timeStr.split(':');
        if (parts.length === 2) {
            const minutes = parseFloat(parts[0]);
            const seconds = parseFloat(parts[1]);
            return minutes * 60 + seconds;
        }
        return parseFloat(timeStr);
    }

    private parseLyricImpl(raw: string) {
        // 处理 null/undefined/空字符串
        if (!raw) {
            return {
                lrcItems: [],
                meta: {},
            };
        }

        raw = raw.trim();
        const lines = raw.split('\n');
        const rawLrcItems: Array<IParsedLrcItem> = [];
        let meta: any = {};
        let isFirstLine = true;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            // Filter out comment lines in both LRC and QRC formats:
            // LRC format: [00:00.75]//
            // QRC format: [750,1000]//
            if (/^\[[\d:.]+\]\/\//.test(trimmedLine) || /^\[\d+,\d+\]\/\//.test(trimmedLine)) {
                continue;
            }

            // 尝试解析 QRC 逐字歌词格式: [21783,3850]凉(21783,220)风(22003,260)轻(22263,260)...
            const lineTimeMatch = trimmedLine.match(LINE_TIME_PATTERN);
            if (lineTimeMatch) {
                const startTimeMs = parseInt(lineTimeMatch[1], 10);
                const durationMs = parseInt(lineTimeMatch[2], 10);
                const content = lineTimeMatch[3];

                // 使用 QRC_WORD_PATTERN 解析逐字内容: 文字(时间,时长)
                QRC_WORD_PATTERN.lastIndex = 0;
                const words: ILyric.IWordData[] = [];
                const rawTextParts: string[] = [];
                let match: RegExpExecArray | null;

                while ((match = QRC_WORD_PATTERN.exec(content)) !== null) {
                    const rawWordText = match[1] || '';
                    const wordStartTime = parseInt(match[2], 10);
                    // Don't trim - preserve space characters with their own timestamps
                    const wordText = rawWordText;

                    if (wordText) {
                        // 计算持续时间：如果有下一个词，用下一个词的开始时间减去当前开始时间
                        // 这里先添加，后面再计算 duration
                        words.push({
                            text: wordText,
                            startTime: wordStartTime,
                            duration: 0, // 暂时设为0，后面计算
                        });
                        rawTextParts.push(rawWordText);
                    }
                }

                // 计算每个词的持续时间
                for (let i = 0; i < words.length; i++) {
                    if (i < words.length - 1) {
                        words[i].duration = words[i + 1].startTime - words[i].startTime;
                    } else {
                        // 最后一个词，使用行持续时间减去相对时间
                        words[i].duration = (startTimeMs + durationMs) - words[i].startTime;
                    }
                    // 确保持续时间不小于50ms
                    words[i].duration = Math.max(words[i].duration, 50);
                }

                // 构建完整文本并检测空格
                const fullText = rawTextParts.join('').trim();
                let currentPos = 0;
                for (let i = 0; i < words.length; i++) {
                    const word = words[i];
                    const wordIndex = fullText.indexOf(word.text, currentPos);
                    if (wordIndex !== -1) {
                        const wordEndPos = wordIndex + word.text.length;
                        words[i] = {
                            ...word,
                            space: wordEndPos < fullText.length && fullText[wordEndPos] === ' '
                        };
                        currentPos = wordEndPos;
                    }
                }

                rawLrcItems.push({
                    time: startTimeMs / 1000, // 转为秒
                    lrc: fullText,
                    index: rawLrcItems.length,
                    hasWordByWord: words.length > 0,
                    words: words.length > 0 ? words : undefined,
                    duration: durationMs,
                });
                continue;
            }

            // 检查是否是尖括号逐字格式: [00:01.181]<00:01.181>文字<00:01.339>文字...
            if (HAS_ANGLE_BRACKET_PATTERN.test(trimmedLine)) {
                const parsedItem = this.parseAngleBracketLine(trimmedLine);
                if (parsedItem) {
                    parsedItem.index = rawLrcItems.length;
                    rawLrcItems.push(parsedItem);
                    continue;
                }
            }

            // 标准 LRC 格式解析
            const timeMatches = trimmedLine.match(timeReg);
            if (timeMatches) {
                // 处理元数据（第一行）
                if (isFirstLine) {
                    const firstPart = trimmedLine.split(timeReg)[0];
                    meta = this.parseMetaImpl(firstPart.trim());
                    isFirstLine = false;
                }

                // 提取歌词内容
                const lrcContent = trimmedLine.replace(timeReg, '').trim();

                // 为每个时间标记创建歌词项
                for (const timeStr of timeMatches) {
                    rawLrcItems.push({
                        time: this.parseTime(timeStr),
                        lrc: lrcContent,
                        index: rawLrcItems.length,
                    });
                }
            }
        }

        // 排序并重新索引
        let lrcItems = rawLrcItems.sort((a, b) => a.time - b.time);
        lrcItems.forEach((item, index) => {
            item.index = index;
        });

        // 如果没有解析到任何歌词，将原文本按行处理
        if (lrcItems.length === 0 && raw.length) {
            lrcItems = raw.split("\n").map((_, index) => ({
                time: 0,
                lrc: _,
                index,
            }));
        }

        return {
            lrcItems,
            meta,
        };
    }
}
