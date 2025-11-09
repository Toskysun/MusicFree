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
    // Match LyricContent attribute value, allowing for any characters including newlines
    // Use [\s\S]*? for non-greedy match of any character including newlines
    const contentMatch = xmlString.match(/LyricContent="([\s\S]*?)"/);
    if (!contentMatch) {
      return null;
    }

    let content = contentMatch[1];

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
