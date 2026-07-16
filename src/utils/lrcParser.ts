import { devLog } from '@/utils/log';

const timeReg = /\[[\d:.]+\]/g;
const metaReg = /\[(.+):(.+)\]/g;
// 逐字歌词格式1: [92260,4740](0,500,0)歌(500,300,0)词
const LINE_TIME_PATTERN = /^\[(\d+),(\d+)\](.*)$/;
// 逐字歌词格式2: [00:01.181]<00:01.181>文字<00:01.339>文字...
const ANGLE_BRACKET_TIME_PATTERN = /<([\d:.]+)>/g;
const HAS_ANGLE_BRACKET_PATTERN = /\[[\d:.]+\]\s*<[\d:.]+>/;
const INLINE_WORD_TIME_PATTERN = /^\[[\d:.]+\][^\r\n]*\(\d+,\d+(?:,\d+)?\)/;

// Time tolerance for matching translation/romanization lines (in seconds)
// Allows matching when timestamps differ by up to 120ms (0.12 seconds)
// This enables precise matching for word-by-word lyrics with slight timing variations
// Example: QQ sometimes emits translation-only lines 50-70ms before the original line
const TIME_MATCH_TOLERANCE = 0.12;
const PARALLEL_LINE_EPSILON = 0.03;
const NEARBY_PARALLEL_LINE_EPSILON = 0.12;
const HAN_REG = /[\u3400-\u9fff\uf900-\ufaff]/;
const KANA_REG = /[\u3040-\u30ff\u31f0-\u31ff]/;
const HANGUL_REG = /[\uac00-\ud7af]/;
const LATIN_REG = /[A-Za-z\u00c0-\u024f]/;
const CREDIT_LINE_REG = /^(?:(?:作)?词|(?:作)?詞|曲|作曲|编曲|編曲|词曲|詞曲|原唱|演唱|歌手|vocal|lyrics?|lyricist|composer|music|arrange(?:r|ment)?)\s*[:：]/i;
const ROMANIZATION_HINT_REG = /(?:shi|chi|tsu|kyo|kyu|kya|ryo|ryu|rya|sho|shu|sha|cho|chu|cha|jyo|jyu|jya|dzu|desu|boku|kimi|kono|sono|ano|yume|sora|kokoro|namida|hikari|kaze|hana|machi|sekai|mirai|hoshi|koe|uta|sarang|hae)/i;
const CREDIT_ROMANIZATION_PREFIXES = new Set([
    "shi",
    "ci",
    "zuo ci",
    "saku shi",
    "sakushi",
    "kyo ku",
    "kyoku",
    "qu",
    "zuo qu",
    "sa kyo ku",
    "sa k kyo ku",
    "sa kkyoku",
    "sakkyoku",
    "he n kyo ku",
    "he n kyoku",
    "hen kyo ku",
    "henkyoku",
    "bian qu",
]);
const COMMON_ENGLISH_WORDS = new Set([
    "a",
    "an",
    "and",
    "are",
    "be",
    "but",
    "for",
    "from",
    "hello",
    "i",
    "in",
    "is",
    "it",
    "love",
    "me",
    "my",
    "of",
    "on",
    "that",
    "the",
    "this",
    "to",
    "we",
    "with",
    "world",
    "you",
    "your",
]);
const PINYIN_INITIAL_REG = /^(?:b|p|m|f|d|t|n|l|g|k|h|j|q|x|zh|ch|sh|r|z|c|s)?/;
const PINYIN_FINALS = new Set([
    "a",
    "o",
    "e",
    "ai",
    "ei",
    "ao",
    "ou",
    "an",
    "en",
    "ang",
    "eng",
    "ong",
    "i",
    "ia",
    "ie",
    "iao",
    "iu",
    "ian",
    "in",
    "iang",
    "ing",
    "iong",
    "u",
    "ua",
    "uo",
    "uai",
    "ui",
    "uan",
    "un",
    "uang",
    "ue",
    "ve",
    "er",
]);
const PINYIN_SPECIAL_SYLLABLES = new Set([
    "zhi",
    "chi",
    "shi",
    "ri",
    "zi",
    "ci",
    "si",
    "yi",
    "yin",
    "ying",
    "wu",
    "yu",
    "yue",
    "yuan",
    "yun",
    "ye",
    "yao",
    "you",
    "yang",
    "yong",
    "wa",
    "wai",
    "wan",
    "wang",
    "wei",
    "wen",
    "weng",
    "wo",
]);

interface ITextScriptStats {
    han: number;
    kana: number;
    hangul: number;
    latin: number;
    script: number;
}

interface ICollapseParallelResult {
    items: IParsedLrcItem[];
    hasTranslation: boolean;
    hasRomanization: boolean;
}

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

function normalizeRawLyricText(raw: string) {
    return raw
        .replace(/\r/g, "")
        .replace(/\\r\\n|\\n|\\r/g, "\n");
}

function createTimedWord(
    text: string,
    startTime: number,
    duration: number,
    index: number,
): ILyric.IWordData {
    return {
        text,
        startTime,
        duration: Math.max(duration, 50),
        space: !text.trim(),
    };
}

function parsePrefixedTimedWords(body: string): ILyric.IWordData[] {
    const words: ILyric.IWordData[] = [];
    const wordRegex = /([^()]*)\((\d+),(\d+)(?:,\d+)?\)/g;
    let wordMatch: RegExpExecArray | null;

    while ((wordMatch = wordRegex.exec(body)) !== null) {
        const text = wordMatch[1];
        if (!text) {
            continue;
        }

        words.push(createTimedWord(
            text,
            parseInt(wordMatch[2], 10),
            parseInt(wordMatch[3], 10),
            words.length,
        ));
    }

    return words;
}

function parsePostfixedTimedWords(body: string): ILyric.IWordData[] {
    const words: ILyric.IWordData[] = [];
    const wordRegex = /\((\d+),(\d+)(?:,\d+)?\)([^()]*)/g;
    let wordMatch: RegExpExecArray | null;

    while ((wordMatch = wordRegex.exec(body)) !== null) {
        const text = wordMatch[3];
        if (!text) {
            continue;
        }

        words.push(createTimedWord(
            text,
            parseInt(wordMatch[1], 10),
            parseInt(wordMatch[2], 10),
            words.length,
        ));
    }

    return words;
}

function joinWordText(words: ILyric.IWordData[]) {
    return words.map(word => word.text).join("");
}

function adjustRelativeWordTimes(words: ILyric.IWordData[], lineStartMs: number) {
    if (!words.length || lineStartMs <= 0) {
        return words;
    }

    const firstStart = words[0].startTime;
    const lastStart = words[words.length - 1].startTime;
    const shouldAdjust = firstStart <= 10
        || (
            firstStart < lineStartMs - 500
            && lastStart < lineStartMs + 500
        );

    if (!shouldAdjust) {
        return words;
    }

    return words.map(word => ({
        ...word,
        startTime: word.startTime + lineStartMs,
    }));
}

function markWordSpaces(words: ILyric.IWordData[], fullText: string) {
    let currentPos = 0;
    return words.map(word => {
        const wordIndex = fullText.indexOf(word.text, currentPos);
        if (wordIndex === -1) {
            return word;
        }

        const wordEndPos = wordIndex + word.text.length;
        currentPos = wordEndPos;
        return {
            ...word,
            space: wordEndPos < fullText.length && fullText[wordEndPos] === " ",
        };
    });
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

    // 解析逐字时间: 字(start_ms,duration_ms) 或 (offset_ms,duration_ms,0)字
    const words = adjustRelativeWordTimes(
        contentAfterTiming.trim().startsWith("(")
            ? parsePostfixedTimedWords(contentAfterTiming)
            : parsePrefixedTimedWords(contentAfterTiming),
        lineStartMs,
    );
    const formattedWords = words.map(word => `<${msToTimestamp(word.startTime)}>${word.text}`);

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
    const lines = normalizeRawLyricText(qrcContent).split('\n');
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
    /** 翻译伪逐字歌词数据 */
    translationWords?: ILyric.IWordData[];
    /** 翻译是否有伪逐字歌词 */
    hasTranslationWordByWord?: boolean;
    /** 翻译行持续时间（毫秒） */
    translationDuration?: number;
    /** 罗马音是否为伪逐字（非真正的逐字数据） */
    isRomanizationPseudo?: boolean;
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
    const order = lyricOrder || ["romanization", "original", "translation"];

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

/**
 * Generate pseudo word-by-word timestamps for translation text
 * Distributes the line duration evenly across all characters
 *
 * @param text Translation text
 * @param lineStartTimeMs Line start time in milliseconds
 * @param lineDurationMs Line duration in milliseconds
 * @returns Array of word data with pseudo timestamps
 */
function generatePseudoWordTimestamps(
    text: string,
    lineStartTimeMs: number,
    lineDurationMs: number,
): ILyric.IWordData[] {
    if (!text || text.trim().length === 0 || lineDurationMs <= 0) {
        return [];
    }

    const words: ILyric.IWordData[] = [];
    const chars = text.split('');
    const charCount = chars.length;

    if (charCount === 0) {
        return [];
    }

    // Calculate duration per character
    const durationPerChar = lineDurationMs / charCount;

    for (let i = 0; i < charCount; i++) {
        const char = chars[i];
        const startTime = lineStartTimeMs + i * durationPerChar;
        const duration = durationPerChar;

        // Check if next char is a space
        const isNextSpace = i < charCount - 1 && chars[i + 1] === ' ';

        words.push({
            text: char,
            startTime: Math.round(startTime),
            duration: Math.round(duration),
            space: isNextSpace,
        });
    }

    return words;
}

function getTextScriptStats(text: string): ITextScriptStats {
    const stats: ITextScriptStats = {
        han: 0,
        kana: 0,
        hangul: 0,
        latin: 0,
        script: 0,
    };

    for (const char of Array.from(text)) {
        if (HAN_REG.test(char)) {
            stats.han++;
            stats.script++;
        } else if (KANA_REG.test(char)) {
            stats.kana++;
            stats.script++;
        } else if (HANGUL_REG.test(char)) {
            stats.hangul++;
            stats.script++;
        } else if (LATIN_REG.test(char)) {
            stats.latin++;
            stats.script++;
        }
    }

    return stats;
}

function hasEastAsianScript(stats: ITextScriptStats) {
    return stats.han > 0 || stats.kana > 0 || stats.hangul > 0;
}

function isMostlyLatin(stats: ITextScriptStats) {
    return stats.latin > 0 && stats.latin / Math.max(1, stats.script) >= 0.65;
}

function hasKanaOrHangul(stats: ITextScriptStats) {
    return stats.kana > 0 || stats.hangul > 0;
}

function isLyricCreditLine(text: string) {
    return CREDIT_LINE_REG.test(text.trim());
}

function normalizeCreditRomanizationPrefix(text: string) {
    const words = getLatinWords(text);
    return words.join(" ");
}

function isCreditRomanizationLine(text: string) {
    const trimmed = text.trim();
    if (!/[:：]/.test(trimmed) || isLyricCreditLine(trimmed)) {
        return false;
    }

    const prefix = trimmed.split(/[:：]/)[0];
    return CREDIT_ROMANIZATION_PREFIXES.has(normalizeCreditRomanizationPrefix(prefix));
}

function isCreditSideLine(text: string) {
    return isLyricCreditLine(text) || isCreditRomanizationLine(text);
}

function isMeaningfulSecondaryLine(item: IParsedLrcItem) {
    const text = item.lrc?.trim();
    return !!text && text !== "//";
}

function isMergeableSecondaryLine(item: IParsedLrcItem) {
    return isMeaningfulSecondaryLine(item) && !isCreditSideLine(item.lrc);
}

function canReceiveLyricField(item: IParsedLrcItem) {
    return !!item.lrc?.trim() && !isCreditSideLine(item.lrc);
}

function getLatinWords(text: string) {
    return text
        .toLowerCase()
        .match(/[a-z\u00c0-\u024f]+/g) ?? [];
}

function isPinyinSyllable(word: string) {
    if (PINYIN_SPECIAL_SYLLABLES.has(word)) {
        return true;
    }

    const match = word.match(PINYIN_INITIAL_REG);
    const rest = word.slice(match?.[0].length ?? 0);
    return !!rest && PINYIN_FINALS.has(rest);
}

function looksLikeRomanizationText(text: string) {
    const words = getLatinWords(text);
    if (!words.length) {
        return false;
    }

    const englishWords = words.filter(word => COMMON_ENGLISH_WORDS.has(word)).length;
    if (englishWords >= Math.max(1, Math.ceil(words.length * 0.35))) {
        return false;
    }

    const pinyinWords = words.filter(isPinyinSyllable).length;
    if (pinyinWords / words.length >= 0.75) {
        return true;
    }

    return ROMANIZATION_HINT_REG.test(text);
}

function chooseParallelMainIndex(group: IParsedLrcItem[]) {
    const firstNonEmptyIndex = group.findIndex(item => !!item.lrc?.trim());

    if (firstNonEmptyIndex === -1) {
        return 0;
    }

    const firstNonEmpty = group[firstNonEmptyIndex];
    const firstNonEmptyStats = getTextScriptStats(firstNonEmpty.lrc);
    const hasBlankTimingMarker = group.some(item => !item.lrc?.trim());

    // For Japanese/Korean songs, prefer the kana/hangul line as the primary lyric.
    // This also handles QQ-style groups where a blank + Chinese translation line is
    // timestamped a few milliseconds before the romanization/original pair.
    const kanaOrHangulIndex = group.findIndex(item =>
        hasKanaOrHangul(getTextScriptStats(item.lrc)),
    );

    if (
        kanaOrHangulIndex !== -1 &&
        (
            kanaOrHangulIndex === firstNonEmptyIndex ||
            hasBlankTimingMarker ||
            looksLikeRomanizationText(firstNonEmpty.lrc) ||
            (
                hasEastAsianScript(firstNonEmptyStats) &&
                !hasKanaOrHangul(firstNonEmptyStats)
            )
        )
    ) {
        return kanaOrHangulIndex;
    }

    if (group.length >= 3 && looksLikeRomanizationText(firstNonEmpty.lrc)) {
        const eastAsianIndex = group.findIndex((item, index) =>
            index > firstNonEmptyIndex && hasEastAsianScript(getTextScriptStats(item.lrc)),
        );

        if (eastAsianIndex > firstNonEmptyIndex) {
            return eastAsianIndex;
        }
    }

    if (group.length >= 3 && looksLikeRomanizationText(group[0].lrc)) {
        const kanaOrHangulIndex = group.findIndex((item, index) =>
            index > 0 && hasKanaOrHangul(getTextScriptStats(item.lrc)),
        );

        if (kanaOrHangulIndex > 0) {
            return kanaOrHangulIndex;
        }
    }

    if (
        group.length >= 3 &&
        looksLikeRomanizationText(group[0].lrc) &&
        hasEastAsianScript(getTextScriptStats(group[1].lrc))
    ) {
        return 1;
    }

    return firstNonEmptyIndex;
}

function cloneParsedLrcItem(item: IParsedLrcItem): IParsedLrcItem {
    return {
        ...item,
        words: item.words ? [...item.words] : undefined,
    };
}

function cloneCreditItemWithRomanization(
    creditItem: IParsedLrcItem,
    romanizationItem: IParsedLrcItem,
) {
    const cloned = cloneParsedLrcItem(creditItem);
    appendLyricField(cloned, "romanization", romanizationItem.lrc);
    if (romanizationItem.words?.length) {
        cloned.romanizationWords = romanizationItem.words;
        cloned.hasRomanizationWordByWord = romanizationItem.hasWordByWord;
        cloned.romanizationDuration = romanizationItem.duration;
    }
    return cloned;
}

function appendLyricField(
    item: IParsedLrcItem,
    field: "translation" | "romanization",
    text: string,
) {
    const normalized = text.trim();
    if (!normalized) {
        return;
    }

    if (!item[field]?.trim()) {
        item[field] = normalized;
        return;
    }

    if (item[field] !== normalized) {
        item[field] = `${item[field]}\n${normalized}`;
    }
}

function stripDuplicatedTranslationSuffix(
    baseItem: IParsedLrcItem,
    translationText: string,
) {
    const baseText = baseItem.lrc?.trim();
    const normalizedTranslation = translationText.trim();
    if (
        !baseText
        || !normalizedTranslation
        || baseText.length <= normalizedTranslation.length
        || !baseText.endsWith(normalizedTranslation)
    ) {
        return;
    }

    const possibleMainText = baseText.slice(0, -normalizedTranslation.length).trim();
    if (!possibleMainText) {
        return;
    }

    const mainStats = getTextScriptStats(possibleMainText);
    const translationStats = getTextScriptStats(normalizedTranslation);
    if (hasKanaOrHangul(mainStats) && translationStats.han > 0) {
        baseItem.lrc = possibleMainText;
    }
}

function assignParallelSecondaryLine(
    base: IParsedLrcItem,
    source: IParsedLrcItem,
) {
    const baseStats = getTextScriptStats(base.lrc);
    const sourceStats = getTextScriptStats(source.lrc);
    const sourceIsRomanization =
        hasEastAsianScript(baseStats) &&
        isMostlyLatin(sourceStats) &&
        (source.hasWordByWord || looksLikeRomanizationText(source.lrc));

    if (!sourceIsRomanization) {
        stripDuplicatedTranslationSuffix(base, source.lrc);
        appendLyricField(base, "translation", source.lrc);
        return;
    }

    appendLyricField(base, "romanization", source.lrc);
    if (source.words?.length) {
        base.romanizationWords = source.words;
        base.hasRomanizationWordByWord = source.hasWordByWord;
        base.romanizationDuration = source.duration;
    }
}

function collapseParallelContentGroup(group: IParsedLrcItem[]): ICollapseParallelResult {
    if (group.length === 1) {
        return {
            items: [group[0]],
            hasTranslation: false,
            hasRomanization: false,
        };
    }

    const mainIndex = chooseParallelMainIndex(group);
    const main = group[mainIndex];
    const collapsed = cloneParsedLrcItem(main);
    let hasTranslation = false;
    let hasRomanization = false;

    group.forEach((item, groupIndex) => {
        if (groupIndex === mainIndex) {
            return;
        }
        assignParallelSecondaryLine(collapsed, item);
    });

    hasTranslation = !!collapsed.translation?.trim();
    hasRomanization = !!collapsed.romanization?.trim();

    return {
        items: [collapsed],
        hasTranslation,
        hasRomanization,
    };
}

function collapseParallelGroup(group: IParsedLrcItem[]): ICollapseParallelResult {
    const lyricItems: IParsedLrcItem[] = [];
    const sequence: Array<{
        type: "item" | "lyric";
        item: IParsedLrcItem;
    }> = [];

    for (let index = 0; index < group.length; index++) {
        const item = group[index];
        const next = group[index + 1];

        if (
            next
            && isCreditRomanizationLine(item.lrc)
            && isLyricCreditLine(next.lrc)
        ) {
            sequence.push({
                type: "item",
                item: cloneCreditItemWithRomanization(next, item),
            });
            index++;
            continue;
        }

        if (
            next
            && isLyricCreditLine(item.lrc)
            && isCreditRomanizationLine(next.lrc)
        ) {
            sequence.push({
                type: "item",
                item: cloneCreditItemWithRomanization(item, next),
            });
            index++;
            continue;
        }

        if (isCreditSideLine(item.lrc)) {
            sequence.push({
                type: "item",
                item,
            });
            continue;
        }

        lyricItems.push(item);
        sequence.push({
            type: "lyric",
            item,
        });
    }

    if (lyricItems.length === group.length) {
        return collapseParallelContentGroup(group);
    }

    if (lyricItems.length <= 1) {
        return {
            items: sequence.map(entry => entry.item),
            hasTranslation: false,
            hasRomanization: sequence.some(entry => !!entry.item.romanization?.trim()),
        };
    }

    const mainLyricItem = lyricItems[chooseParallelMainIndex(lyricItems)];
    const collapsed = collapseParallelContentGroup(lyricItems);
    const mergedItems: IParsedLrcItem[] = [];
    let insertedMergedLyric = false;

    sequence.forEach(entry => {
        if (entry.type === "item") {
            mergedItems.push(entry.item);
            return;
        }

        if (entry.item === mainLyricItem && !insertedMergedLyric) {
            mergedItems.push(collapsed.items[0]);
            insertedMergedLyric = true;
        }
    });

    if (!insertedMergedLyric) {
        mergedItems.push(collapsed.items[0]);
    }

    return {
        items: mergedItems,
        hasTranslation: collapsed.hasTranslation,
        hasRomanization: collapsed.hasRomanization
            || sequence.some(entry => !!entry.item.romanization?.trim()),
    };
}

function collapseParallelLyricItems(items: IParsedLrcItem[]): ICollapseParallelResult {
    const collapsedItems: IParsedLrcItem[] = [];
    let hasTranslation = false;
    let hasRomanization = false;

    for (let index = 0; index < items.length;) {
        const group = [items[index]];
        let nextIndex = index + 1;
        while (
            nextIndex < items.length &&
            shouldMergeParallelGroupLine(group, items[nextIndex])
        ) {
            group.push(items[nextIndex]);
            nextIndex++;
        }

        const collapsed = collapseParallelGroup(group);
        hasTranslation = hasTranslation || collapsed.hasTranslation;
        hasRomanization = hasRomanization || collapsed.hasRomanization;
        collapsedItems.push(...collapsed.items);
        index = nextIndex;
    }

    collapsedItems.forEach((item, index) => {
        item.index = index;
    });

    return {
        items: collapsedItems,
        hasTranslation,
        hasRomanization,
    };
}

function shouldMergeParallelGroupLine(
    group: IParsedLrcItem[],
    nextItem: IParsedLrcItem,
) {
    const diff = Math.abs(nextItem.time - group[0].time);
    if (diff <= PARALLEL_LINE_EPSILON) {
        return true;
    }

    if (diff > NEARBY_PARALLEL_LINE_EPSILON) {
        return false;
    }

    const hasBlankTimingMarker = group.some(item => !item.lrc?.trim()) || !nextItem.lrc?.trim();
    if (hasBlankTimingMarker) {
        return true;
    }

    const hasKanaOrHangulLine = group.some(item => hasKanaOrHangul(getTextScriptStats(item.lrc)))
        || hasKanaOrHangul(getTextScriptStats(nextItem.lrc));
    const hasRomanizationLine = group.some(item => looksLikeRomanizationText(item.lrc))
        || looksLikeRomanizationText(nextItem.lrc);

    return hasKanaOrHangulLine && hasRomanizationLine;
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

        const { lrcItems: parsedLrcItems, meta } = this.parseLyricImpl(raw);
        const {
            items: lrcItems,
            hasTranslation,
            hasRomanization,
        } = collapseParallelLyricItems(parsedLrcItems);
        if (this.extra.offset) {
            meta.offset = (meta.offset ?? 0) + this.extra.offset;
        }
        this.meta = meta;
        this.lrcItems = lrcItems;
        this.hasTranslation = hasTranslation;
        this.hasRomanization = hasRomanization;

        if (translation) {
            const transLrcItems = this.parseLyricImpl(translation).lrcItems
                .filter(isMergeableSecondaryLine);

            // 如果翻译歌词为空，跳过处理
            if (transLrcItems.length !== 0) {
                this.hasTranslation = true;
                // 2 pointer with tolerance matching
                let p1 = 0;
                let p2 = 0;
                const matchedTransIndices = new Set<number>();

                while (p1 < this.lrcItems.length) {
                    const lrcItem = this.lrcItems[p1];
                    if (!canReceiveLyricField(lrcItem)) {
                        ++p1;
                        continue;
                    }

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
                        stripDuplicatedTranslationSuffix(lrcItem, transLrcItems[p2].lrc);
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

                // Generate pseudo word-by-word timestamps for translations
                for (let i = 0; i < this.lrcItems.length; i++) {
                    const item = this.lrcItems[i];
                    if (!item.translation || item.translation.trim().length === 0) {
                        continue;
                    }

                    // Calculate line duration: use original line's duration if available,
                    // otherwise calculate from next line's start time
                    let lineDurationMs: number;
                    if (item.duration && item.duration > 0) {
                        lineDurationMs = item.duration;
                    } else if (i < this.lrcItems.length - 1) {
                        // Use next line's start time to calculate duration
                        const nextItemTime = this.lrcItems[i + 1].time;
                        lineDurationMs = (nextItemTime - item.time) * 1000;
                    } else {
                        // Last line: use default duration of 3 seconds
                        lineDurationMs = 3000;
                    }

                    // Ensure minimum duration of 500ms
                    lineDurationMs = Math.max(lineDurationMs, 500);

                    const lineStartTimeMs = item.time * 1000;
                    const translationWords = generatePseudoWordTimestamps(
                        item.translation,
                        lineStartTimeMs,
                        lineDurationMs,
                    );

                    if (translationWords.length > 0) {
                        item.translationWords = translationWords;
                        item.hasTranslationWordByWord = true;
                        item.translationDuration = lineDurationMs;
                    }
                }
            }
        }

        if (romanization) {
            const romaLrcItems = this.parseLyricImpl(romanization).lrcItems
                .filter(isMergeableSecondaryLine);

            // 如果罗马音歌词为空，跳过处理
            if (romaLrcItems.length !== 0) {
                this.hasRomanization = true;
                // 2 pointer with tolerance matching - 同时提取文本和逐字数据
                let p1 = 0;
                let p2 = 0;
                const matchedRomaIndices = new Set<number>();

                while (p1 < this.lrcItems.length) {
                    const lrcItem = this.lrcItems[p1];
                    if (!canReceiveLyricField(lrcItem)) {
                        ++p1;
                        continue;
                    }

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

                // Generate pseudo word-by-word timestamps for romanization without real word data
                for (let i = 0; i < this.lrcItems.length; i++) {
                    const item = this.lrcItems[i];
                    // Skip if no romanization or already has word-by-word data
                    if (!item.romanization || item.romanization.trim().length === 0 || item.hasRomanizationWordByWord) {
                        continue;
                    }

                    // Calculate line duration: use original line's duration if available,
                    // otherwise calculate from next line's start time
                    let lineDurationMs: number;
                    if (item.duration && item.duration > 0) {
                        lineDurationMs = item.duration;
                    } else if (i < this.lrcItems.length - 1) {
                        const nextItemTime = this.lrcItems[i + 1].time;
                        lineDurationMs = (nextItemTime - item.time) * 1000;
                    } else {
                        lineDurationMs = 3000;
                    }

                    lineDurationMs = Math.max(lineDurationMs, 500);

                    const lineStartTimeMs = item.time * 1000;
                    const romanizationWords = generatePseudoWordTimestamps(
                        item.romanization,
                        lineStartTimeMs,
                        lineDurationMs,
                    );

                    if (romanizationWords.length > 0) {
                        item.romanizationWords = romanizationWords;
                        item.hasRomanizationWordByWord = true;
                        item.romanizationDuration = lineDurationMs;
                        item.isRomanizationPseudo = true;
                    }
                }
            }
        }
    }

    getPosition(position: number): IParsedLrcItem | null {
        position = position - (this.meta?.offset ?? 0);
        const itemCount = this.lrcItems.length;

        if (!itemCount || position < this.lrcItems[0].time) {
            this.lastSearchIndex = 0;
            return null;
        }

        let left = 0;
        let right = itemCount - 1;
        while (left < right) {
            const mid = (left + right + 1) >>> 1;
            if (this.lrcItems[mid].time <= position) {
                left = mid;
            } else {
                right = mid - 1;
            }
        }

        this.lastSearchIndex = left;
        return this.lrcItems[left];
    }

    getLyricItems() {
        return this.lrcItems;
    }

    setExtraOffset(offset: number) {
        const previousOffset = Number(this.extra.offset) || 0;
        const nextOffset = Number.isFinite(offset) ? offset : 0;

        this.extra = {
            ...this.extra,
            offset: nextOffset,
        };
        this.meta = {
            ...this.meta,
            offset: (Number(this.meta.offset) || 0) - previousOffset + nextOffset,
        };
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

        const adjustedTimePositions = adjustRelativeWordTimes(
            timePositions.map((entry, index) => createTimedWord("", entry.time, 0, index)),
            lineStartTime * 1000,
        );
        adjustedTimePositions.forEach((word, index) => {
            timePositions[index].time = word.startTime;
        });

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

    /** 解析行内逐字格式: [00:01.181]文(0,200)字(200,200) */
    private parseInlineWordTimeLine(line: string): IParsedLrcItem | null {
        const lineTimeMatch = line.match(/^\[([\d:.]+)\]/);
        if (!lineTimeMatch) return null;

        const lineStartTime = this.parseTime(`[${lineTimeMatch[1]}]`);
        const lineStartMs = lineStartTime * 1000;
        const content = line.substring(lineTimeMatch[0].length);
        const words = adjustRelativeWordTimes(
            parsePrefixedTimedWords(content),
            lineStartMs,
        );
        const fullText = joinWordText(words).trim();

        if (!fullText) {
            return null;
        }

        const spacedWords = markWordSpaces(words, fullText);
        const lastWord = spacedWords[spacedWords.length - 1];
        const lineEndMs = lastWord
            ? lastWord.startTime + lastWord.duration
            : lineStartMs + 3000;

        return {
            time: lineStartTime,
            lrc: fullText,
            index: 0,
            hasWordByWord: spacedWords.length > 0,
            words: spacedWords.length > 0 ? spacedWords : undefined,
            duration: Math.max(lineEndMs - lineStartMs, 0),
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

        raw = normalizeRawLyricText(raw).trim();
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

                const parsedWords = content.trim().startsWith("(")
                    ? parsePostfixedTimedWords(content)
                    : parsePrefixedTimedWords(content);
                const words = adjustRelativeWordTimes(parsedWords, startTimeMs);
                const fullText = joinWordText(words).trim();
                const spacedWords = markWordSpaces(words, fullText);

                rawLrcItems.push({
                    time: startTimeMs / 1000, // 转为秒
                    lrc: fullText,
                    index: rawLrcItems.length,
                    hasWordByWord: spacedWords.length > 0,
                    words: spacedWords.length > 0 ? spacedWords : undefined,
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

            // 检查是否是行内逐字格式: [00:01.181]文(0,200)字(200,200)
            if (INLINE_WORD_TIME_PATTERN.test(trimmedLine)) {
                const parsedItem = this.parseInlineWordTimeLine(trimmedLine);
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
