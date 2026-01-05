/**
 * QRC XML to Standard LRC Converter
 * Converts QQ Music's decrypted QRC XML format to standard LRC format
 */

/**
 * Parse QRC XML and extract lyric content
 * Uses more robust regex to handle multi-line content and special characters
 *
 * Enhanced to handle malformed XML with embedded tags in content
 */
function extractLyricContent(xmlString: string): string | null {
  try {
    // Find LyricContent attribute start position
    const startMarker = 'LyricContent="';
    const startIndex = xmlString.indexOf(startMarker);
    if (startIndex === -1) {
      return null;
    }

    const contentStart = startIndex + startMarker.length;

    // Find the real end quote - it should be followed by space+attribute, /> or >
    // This handles embedded quotes like "my darling" in lyrics
    let endIndex = -1;
    let searchPos = contentStart;

    while (searchPos < xmlString.length) {
      const quotePos = xmlString.indexOf('"', searchPos);
      if (quotePos === -1) {
        break;
      }

      // Check what follows the quote
      const afterQuote = xmlString.substring(quotePos + 1, quotePos + 20).trimStart();

      // Valid endings: /> or > or space+attribute_name= or end of string
      if (
        afterQuote.startsWith('/>') ||
        afterQuote.startsWith('>') ||
        /^[a-zA-Z_][a-zA-Z0-9_]*\s*=/.test(afterQuote) ||
        quotePos === xmlString.length - 1
      ) {
        endIndex = quotePos;
        break;
      }

      // This quote is embedded in content, continue searching
      searchPos = quotePos + 1;
    }

    if (endIndex === -1) {
      // Fallback: use simple regex match
      const contentMatch = xmlString.match(/LyricContent="([\s\S]*?)"/);
      if (!contentMatch) {
        return null;
      }
      return contentMatch[1];
    }

    let content = xmlString.substring(contentStart, endIndex);

    // Decode XML entities (both named and numeric)
    content = content
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'");

    // Decode numeric character references (e.g., &#65288; for （)
    content = content.replace(/&#(\d+);/g, (match, dec) => {
      return String.fromCharCode(parseInt(dec, 10));
    });

    // Decode hexadecimal character references (e.g., &#xFF08; for （)
    content = content.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    // CRITICAL FIX: Remove embedded XML tags that appear in malformed content
    // Pattern: <QrcInfos>\n//\n appears between actual lyric lines
    content = content.replace(/<QrcInfos>\s*\/\/\s*/g, '');

    // Also remove standalone XML tags that might appear
    content = content.replace(/<\/?QrcInfos>/g, '');
    content = content.replace(/<\/?QrcHeadInfo[^>]*>/g, '');
    content = content.replace(/<\/?LyricInfo[^>]*>/g, '');

    return content.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Convert milliseconds to LRC timestamp format [mm:ss.xx]
 */
function msToLrcTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);

  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}]`;
}

/**
 * Convert milliseconds to angle bracket timestamp format <mm:ss.mmm>
 */
function msToAngleBracketTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
}

/**
 * Check if line is a metadata tag
 */
function isMetadataTag(text: string): boolean {
  const metadataPrefixes = ['[ti:', '[ar:', '[al:', '[by:', '[offset:'];
  return metadataPrefixes.some(prefix => text.startsWith(prefix));
}

/**
 * Remove word-level timing information (English parentheses only)
 * Safely handles mixed Chinese and English parentheses
 * @param text Text potentially containing timing info like: text(123,456)more
 * @returns Cleaned text with timing removed: textmore
 */
function removeWordTiming(text: string): string {
  // Only match English parentheses with number patterns inside (word timing format)
  // Pattern: (digits,digits) or (digits) - typical word timing format
  // This avoids accidentally matching meaningful content in parentheses
  return text.replace(/\(\d+(?:,\d+)?\)/g, '');
}

/**
 * Convert QRC enhanced timing format to standard LRC
 * Input format: [startTime,duration]text with word(time,duration)
 * Output format: [mm:ss.xx]text
 *
 * Special handling for [kana:] romanization tags:
 * [startTime,duration][kana:text] -> [mm:ss.xx]text (without [kana:] prefix)
 */
function convertQrcLineToLrc(line: string): string {
  const qrcMatch = line.match(/^\[(\d+),\d+\](.+)$/);

  if (!qrcMatch) {
    return line;
  }

  const startTime = parseInt(qrcMatch[1], 10);
  let textWithWordTiming = qrcMatch[2];

  // Handle metadata tags with QRC timestamp prefix
  // e.g., [1234,567][ti:标题(0,100)] -> [ti:标题]
  if (isMetadataTag(textWithWordTiming)) {
    // Clean word-level timing from metadata content
    // Extract tag name and value: [ti:content] -> ti, content
    const metaMatch = textWithWordTiming.match(/^\[([^:]+):(.+)\]$/);
    if (metaMatch) {
      const tagName = metaMatch[1];
      const tagValue = metaMatch[2];
      // Remove word-level timing safely
      const cleanValue = removeWordTiming(tagValue);
      return `[${tagName}:${cleanValue}]`;
    }
    return textWithWordTiming;
  }

  // Handle [kana:] romanization tags
  // e.g., [1234,567][kana:romaji text] -> [mm:ss.xx]romaji text
  const kanaMatch = textWithWordTiming.match(/^\[kana:(.+)\]$/);
  if (kanaMatch) {
    textWithWordTiming = kanaMatch[1];
  }

  // Remove word-level timing information
  const textOnly = removeWordTiming(textWithWordTiming);

  const lrcTimestamp = msToLrcTime(startTime);

  return `${lrcTimestamp}${textOnly}`;
}

/**
 * Check if lyrics represent instrumental music (no vocals)
 */
function isInstrumentalMusic(lrcLines: string[]): boolean {
  // Filter out metadata tags (kana is no longer a metadata tag)
  const contentLines = lrcLines.filter(line => {
    const trimmed = line.trim();
    return !isMetadataTag(trimmed);
  });

  // No content lines = instrumental
  if (contentLines.length === 0) {
    return true;
  }

  // Extract actual lyrics text (remove timestamps)
  const lyricsText = contentLines
    .map(line => line.replace(/^\[\d+:\d+\.\d+\]/g, '').trim())
    .filter(text => text.length > 0);

  // No lyrics text = instrumental
  if (lyricsText.length === 0) {
    return true;
  }

  // Common instrumental indicators in Chinese
  const instrumentalPatterns = [
    /^纯音乐/,
    /^此歌曲为纯音乐/,
    /请.*欣赏$/,
    /^instrumental/i,
    /^no\s*lyrics/i,
  ];

  // Check if all lyrics match instrumental patterns
  const allInstrumental = lyricsText.every(text =>
    instrumentalPatterns.some(pattern => pattern.test(text))
  );

  return allInstrumental;
}

/**
 * Convert QRC XML format to standard LRC format
 */
export function convertQrcXmlToLrc(xmlString: string): string {
  const lyricContent = extractLyricContent(xmlString);

  if (!lyricContent) {
    return xmlString;
  }

  const lines = lyricContent.split('\n');
  const lrcLines: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      continue;
    }

    // Preserve metadata tags (but not [kana:] which is now handled in conversion)
    if (isMetadataTag(trimmedLine)) {
      lrcLines.push(trimmedLine);
      continue;
    }

    // Convert QRC format line to standard LRC
    // This now handles [kana:] tags properly by converting them to timestamped lyrics
    const convertedLine = convertQrcLineToLrc(trimmedLine);
    lrcLines.push(convertedLine);
  }

  // Check if this is instrumental music
  if (isInstrumentalMusic(lrcLines)) {
    // Return metadata with instrumental indicator
    const metadata = lrcLines.filter(line => isMetadataTag(line));

    return [...metadata, '[00:00.00]纯音乐，请欣赏'].join('\n');
  }

  return lrcLines.join('\n');
}

/**
 * Check if content is QRC XML format
 *
 * QRC XML may or may not have XML declaration (<?xml...?>)
 * Key identifiers:
 * - Must contain <QrcInfos> or <LyricInfo> tags
 * - Must contain LyricContent= attribute
 */
export function isQrcXml(content: string): boolean {
  // Check for QRC XML tags (case-insensitive)
  const hasQrcTag = content.includes('<QrcInfos>') ||
                    content.includes('<QrcInfo>') ||
                    content.includes('<LyricInfo');

  // Check for lyric content attribute
  const hasLyricContent = content.includes('LyricContent=');

  return hasQrcTag && hasLyricContent;
}

/**
 * Convert QRC line to word-by-word format with angle bracket timestamps
 * Input format: [21783,3850]凉(21783,220)风(22003,260)轻(22263,260)...
 * Output format: [00:21.783]<00:21.783>凉<00:22.003>风<00:22.263>轻...<00:25.633>
 *
 * Enhanced to:
 * 1. Preserve spaces with their own timestamps (e.g., " (214,72)" -> "<00:00.214> ")
 * 2. Add end timestamp at line end (last word start + duration)
 */
function convertQrcLineToWordByWord(line: string): string {
  const qrcMatch = line.match(/^\[(\d+),(\d+)\](.+)$/);

  if (!qrcMatch) {
    return line;
  }

  const startTimeMs = parseInt(qrcMatch[1], 10);
  const lineDurationMs = parseInt(qrcMatch[2], 10);
  let textWithWordTiming = qrcMatch[3];

  // Handle metadata tags
  if (isMetadataTag(textWithWordTiming)) {
    const metaMatch = textWithWordTiming.match(/^\[([^:]+):(.+)\]$/);
    if (metaMatch) {
      const tagName = metaMatch[1];
      const tagValue = metaMatch[2];
      const cleanValue = removeWordTiming(tagValue);
      return `[${tagName}:${cleanValue}]`;
    }
    return textWithWordTiming;
  }

  // Handle [kana:] romanization tags
  const kanaMatch = textWithWordTiming.match(/^\[kana:(.+)\]$/);
  if (kanaMatch) {
    textWithWordTiming = kanaMatch[1];
  }

  // Extract word-by-word timing: 字(start_ms,duration_ms)
  // Use negative lookahead to match content until we hit a timestamp pattern (digits,digits)
  // This correctly handles spaces, parentheses, and any other characters
  // Pattern from LDDC project: (?:(?!\(\d+,\d+\)).)*
  const wordPattern = /((?:(?!\(\d+,\d+\)).)*)?\((\d+),(\d+)\)/g;
  const formattedWords: string[] = [];
  let match: RegExpExecArray | null;
  let lastEndTimeMs = startTimeMs;

  while ((match = wordPattern.exec(textWithWordTiming)) !== null) {
    const word = match[1] || '';
    const wordStartMs = parseInt(match[2], 10);
    const wordDurationMs = parseInt(match[3], 10);
    // Skip empty content (pure timestamp without character)
    if (word === '') {
      lastEndTimeMs = wordStartMs + wordDurationMs;
      continue;
    }
    const wordTimestamp = msToAngleBracketTime(wordStartMs);
    formattedWords.push(`<${wordTimestamp}>${word}`);
    lastEndTimeMs = wordStartMs + wordDurationMs;
  }

  // If no words were extracted, fall back to standard LRC
  if (formattedWords.length === 0) {
    const textOnly = removeWordTiming(textWithWordTiming);
    return `${msToLrcTime(startTimeMs)}${textOnly}`;
  }

  // Calculate end timestamp: use last word's end time, or line start + duration
  const endTimeMs = lastEndTimeMs > startTimeMs ? lastEndTimeMs : startTimeMs + lineDurationMs;
  const endTimestamp = msToAngleBracketTime(endTimeMs);

  // Combine line timestamp with word timestamps and end timestamp
  const lineTimestamp = msToAngleBracketTime(startTimeMs);
  return `[${lineTimestamp}]${formattedWords.join('')}<${endTimestamp}>`;
}

/**
 * Convert QRC XML format to word-by-word LRC format
 * Output format: [00:21.783]<00:21.783>凉<00:22.003>风<00:22.263>轻...
 */
export function convertQrcXmlToWordByWord(xmlString: string): string {
  const lyricContent = extractLyricContent(xmlString);

  if (!lyricContent) {
    return xmlString;
  }

  const lines = lyricContent.split('\n');
  const lrcLines: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      continue;
    }

    // Preserve metadata tags
    if (isMetadataTag(trimmedLine)) {
      lrcLines.push(trimmedLine);
      continue;
    }

    // Convert QRC format line to word-by-word format
    const convertedLine = convertQrcLineToWordByWord(trimmedLine);
    lrcLines.push(convertedLine);
  }

  // Check if this is instrumental music
  if (isInstrumentalMusic(lrcLines)) {
    const metadata = lrcLines.filter(line => isMetadataTag(line));
    return [...metadata, '[00:00.00]纯音乐，请欣赏'].join('\n');
  }

  return lrcLines.join('\n');
}
