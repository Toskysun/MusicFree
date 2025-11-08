/**
 * QRC XML to Standard LRC Converter
 * Converts QQ Music's decrypted QRC XML format to standard LRC format
 */

/**
 * Parse QRC XML and extract lyric content
 * Uses more robust regex to handle multi-line content and special characters
 */
function extractLyricContent(xmlString: string): string | null {
  try {
    // Match LyricContent attribute value, allowing for any characters including newlines
    // Use [\s\S]*? for non-greedy match of any character including newlines
    const contentMatch = xmlString.match(/LyricContent="([\s\S]*?)"/);
    if (!contentMatch) {
      return null;
    }

    // Decode XML entities
    const content = contentMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'");

    return content;
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
 * Convert QRC enhanced timing format to standard LRC
 * Input format: [startTime,duration]text with word(time,duration)
 * Output format: [mm:ss.xx]text
 */
function convertQrcLineToLrc(line: string): string {
  const qrcMatch = line.match(/^\[(\d+),\d+\](.+)$/);

  if (!qrcMatch) {
    return line;
  }

  const startTime = parseInt(qrcMatch[1], 10);
  const textWithWordTiming = qrcMatch[2];

  const textOnly = textWithWordTiming.replace(/\([^)]+\)/g, '');

  const lrcTimestamp = msToLrcTime(startTime);

  return `${lrcTimestamp}${textOnly}`;
}

/**
 * Check if lyrics represent instrumental music (no vocals)
 */
function isInstrumentalMusic(lrcLines: string[]): boolean {
  // Filter out metadata tags
  const contentLines = lrcLines.filter(line => {
    const trimmed = line.trim();
    return !trimmed.startsWith('[ti:') &&
           !trimmed.startsWith('[ar:') &&
           !trimmed.startsWith('[al:') &&
           !trimmed.startsWith('[by:') &&
           !trimmed.startsWith('[offset:') &&
           !trimmed.startsWith('[kana:');
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

    // Preserve metadata tags and special tags
    if (trimmedLine.startsWith('[ti:') ||
        trimmedLine.startsWith('[ar:') ||
        trimmedLine.startsWith('[al:') ||
        trimmedLine.startsWith('[by:') ||
        trimmedLine.startsWith('[offset:') ||
        trimmedLine.startsWith('[kana:')) {
      lrcLines.push(trimmedLine);
      continue;
    }

    const convertedLine = convertQrcLineToLrc(trimmedLine);
    lrcLines.push(convertedLine);
  }

  // Check if this is instrumental music
  if (isInstrumentalMusic(lrcLines)) {
    // Return metadata with instrumental indicator
    const metadata = lrcLines.filter(line =>
      line.startsWith('[ti:') ||
      line.startsWith('[ar:') ||
      line.startsWith('[al:') ||
      line.startsWith('[by:') ||
      line.startsWith('[offset:')
    );

    return [...metadata, '[00:00.00]纯音乐，请欣赏'].join('\n');
  }

  return lrcLines.join('\n');
}

/**
 * Check if content is QRC XML format
 */
export function isQrcXml(content: string): boolean {
  return content.includes('<?xml') &&
         content.includes('<QrcInfos>') &&
         content.includes('LyricContent=');
}
