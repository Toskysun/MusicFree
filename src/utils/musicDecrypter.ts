/**
 * QQ Music QRC & Kuwo Lyric Decrypter
 * Uses Android Native implementation for high-performance decryption
 *
 * Native Implementation:
 * - Location: android/app/src/main/java/fun/upup/musicfree/lyricUtil/LyricUtilModule.kt
 * - QQ Music: Triple-DES + Zlib decompression
 * - Kuwo: Zlib inflate + GB18030 decode (with optional XOR decryption)
 * - Performance: ~10ms (vs 100-500ms in JS)
 *
 * Migration Note:
 * - Old JS implementation moved to @deprecated customDES.ts (kept for reference)
 * - All decryption now delegated to Native module for better performance
 */

import LyricUtil from '@/native/lyricUtil';
import {devLog} from '@/utils/log';
import {convertQrcXmlToLrc, convertQrcXmlToWordByWord, isQrcXml} from '@/utils/qrcXmlToLrc';

/**
 * Normalize non-standard LRC timestamps [mm:ss:cc] -> [mm:ss.ccc]
 * QRC decrypted lyrics may use colon instead of dot for centiseconds
 * Example: [00:13:71] => [00:13.710], [01:02:64] => [01:02.640]
 */
function normalizeColonTimeTag(lrcContent: string): string {
  if (!lrcContent) return lrcContent;

  const timeTagPattern = /\[(\d+):([0-5]?\d):(\d{1,3})\]/g;
  if (!timeTagPattern.test(lrcContent)) return lrcContent;

  return lrcContent.replace(timeTagPattern, (_, min, sec, frac) => {
    let ms = frac;
    if (ms.length === 1) ms = `${ms}00`;
    else if (ms.length === 2) ms = `${ms}0`;
    else if (ms.length > 3) ms = ms.slice(0, 3);
    return `[${min}:${sec}.${ms}]`;
  });
}

/**
 * Decrypt QQ Music QRC encrypted lyrics using Native implementation (async)
 *
 * Performance:
 * - Old JS implementation: 100-500ms (blocking UI thread)
 * - New Native implementation: <10ms (non-blocking)
 *
 * Algorithm (implemented in Kotlin):
 * 1. Triple-DES decryption (KEY1 decrypt → KEY2 encrypt → KEY3 decrypt)
 * 2. Zlib decompression
 * 3. UTF-8 decoding
 *
 * @param encryptedHex - QRC encrypted lyrics in hex string format
 * @param enableWordByWord - Whether to preserve word-by-word timing (default: false)
 * @returns Promise<string> - Decrypted lyrics text (may be XML or LRC format)
 * @throws Error with user-friendly Chinese message on decryption failure
 */
export async function decryptQRCLyric(encryptedHex: string, enableWordByWord: boolean = false): Promise<string> {
  try {
    const startTime = Date.now();

    devLog('info', '[QRC Native] 开始解密', {
      inputLength: encryptedHex.length,
      isValidLength: encryptedHex.length % 16 === 0,
      enableWordByWord
    });

    // Call Native decryption (Triple-DES + Zlib)
    const decrypted = await LyricUtil.decryptQRCLyric(encryptedHex);

    const duration = Date.now() - startTime;
    devLog('info', `[QRC Native] 解密完成 (${duration}ms)`, {
      outputLength: decrypted.length,
      preview: decrypted.substring(0, 100)
    });

    // Convert XML to LRC format if needed
    if (isQrcXml(decrypted)) {
      // Use word-by-word format if enabled, otherwise standard LRC
      const lrc = enableWordByWord
        ? convertQrcXmlToWordByWord(decrypted)
        : convertQrcXmlToLrc(decrypted);
      devLog('info', `[QRC Native] XML转${enableWordByWord ? '逐字' : 'LRC'}完成`, {
        lrcLength: lrc.length,
        preview: lrc.substring(0, 100)
      });
      return lrc;
    }

    // Non-XML decrypted lyrics may have non-standard [mm:ss:cc] timestamps
    return normalizeColonTimeTag(decrypted);
  } catch (error: any) {
    devLog('error', '[QRC Native] 解密失败', {
      error: error?.message,
      code: error?.code,
      hexLength: encryptedHex?.length
    });

    // Provide user-friendly error messages
    if (error?.code === 'QRC_INVALID_HEX') {
      throw new Error('QRC解密失败：无效的十六进制格式');
    } else if (error?.code === 'QRC_INFLATE_ERROR') {
      throw new Error('QRC解密失败：数据解压错误');
    } else if (error?.code === 'QRC_DECODE_ERROR') {
      throw new Error('QRC解密失败：DES解密错误');
    } else {
      throw new Error(`QRC解密失败: ${error?.message || 'Unknown error'}`);
    }
  }
}

/**
 * Decrypt Kuwo encrypted lyrics using Native implementation (async)
 *
 * Performance:
 * - Native implementation: <10ms (non-blocking)
 *
 * Algorithm (implemented in Kotlin):
 * 1. Base64 decode
 * 2. Check "tp=content" header
 * 3. Strip HTTP-like header (\r\n\r\n)
 * 4. Zlib inflate (decompress)
 * 5. Optional XOR decryption with "yeelion" key (for lyricx format)
 * 6. GB18030 decode (Chinese encoding)
 *
 * @param lrcBase64 - Kuwo encrypted lyrics in base64 format
 * @param isGetLyricx - Whether to apply XOR decryption (default: true)
 * @returns Promise<string> - Decrypted lyrics text
 * @throws Error with user-friendly Chinese message on decryption failure
 */
export async function decryptKuwoLyric(lrcBase64: string, isGetLyricx: boolean = true): Promise<string> {
  try {
    const startTime = Date.now();

    devLog('info', '[Kuwo Native] 开始解密', {
      inputLength: lrcBase64.length,
      isGetLyricx
    });

    // Call Native decryption (Zlib + GB18030 + optional XOR)
    const decrypted = await LyricUtil.decryptKuwoLyric(lrcBase64, isGetLyricx);

    const duration = Date.now() - startTime;
    devLog('info', `[Kuwo Native] 解密完成 (${duration}ms)`, {
      outputLength: decrypted.length,
      preview: decrypted.substring(0, 100)
    });

    return decrypted;
  } catch (error: any) {
    devLog('error', '[Kuwo Native] 解密失败', {
      error: error?.message,
      code: error?.code,
      base64Length: lrcBase64?.length
    });

    // Provide user-friendly error messages
    if (error?.code === 'KW_INVALID_FORMAT') {
      throw new Error('酷我歌词解密失败：无效的数据格式');
    } else if (error?.code === 'KW_DECRYPT_ERROR') {
      throw new Error('酷我歌词解密失败：解密错误');
    } else {
      throw new Error(`酷我歌词解密失败: ${error?.message || 'Unknown error'}`);
    }
  }
}

/**
 * Check if lyrics are encrypted (QRC format)
 *
 * QRC encrypted lyrics characteristics:
 * - Hex strings (pure hexadecimal 0-9A-Fa-f)
 * - Length must be multiple of 16 (DES block size is 8 bytes = 16 hex chars)
 * - No Base64 special chars (+/=)
 * - No LRC timestamp format ([00:00.00])
 * - Minimum reasonable length: 32 chars (at least 2 DES blocks)
 */
export function isQRCEncrypted(lyrics: string): boolean {
  if (!lyrics) return false;

  const trimmed = lyrics.trim();

  // Minimum length check: at least 2 DES blocks (32 hex chars)
  if (trimmed.length < 32) return false;

  // Must be multiple of 16 (DES block size: 8 bytes = 16 hex chars)
  if (trimmed.length % 16 !== 0) return false;

  // Must be pure hexadecimal (no Base64 chars like +/=)
  if (!/^[0-9A-Fa-f]+$/.test(trimmed)) return false;

  // Should NOT contain LRC timestamp patterns
  if (/\[\d{2}:\d{2}\.\d{2}\]/.test(trimmed)) return false;

  // Should NOT contain Base64 padding or common text chars
  if (trimmed.includes('=') || trimmed.includes(' ') || trimmed.includes('\n')) {
    return false;
  }

  return true;
}

/**
 * Check if lyrics are Kuwo encrypted format
 *
 * Kuwo encrypted lyrics are base64 encoded data that starts with "tp=content" after decoding
 * - Usually very long base64 string (>50 chars)
 * - Valid base64 format (alphanumeric + + / =)
 * - Decodes to data starting with "tp=content" header
 * - No LRC timestamp patterns
 */
export function isKuwoEncrypted(lyrics: string): boolean {
  if (!lyrics) return false;

  const trimmed = lyrics.trim();

  // Minimum length check: at least 50 chars for a base64 encrypted lyric
  if (trimmed.length < 50) return false;

  // Should NOT contain LRC timestamp patterns
  if (/\[\d{2}:\d{2}\.\d{2}\]/.test(trimmed)) return false;

  // Should be valid base64 format (alphanumeric + + / =)
  // But not pure hex (which would be QRC)
  const isValidBase64 = /^[A-Za-z0-9+/=]+$/.test(trimmed);
  const notPureHex = !/^[0-9A-Fa-f]+$/.test(trimmed);

  if (!isValidBase64 || !notPureHex) return false;

  // Try to decode and check for "tp=" header (React Native compatible)
  try {
    // Use atob if available (browser/React Native), otherwise Buffer
    let decoded: string;
    if (typeof atob !== 'undefined') {
      // Browser/React Native environment
      decoded = atob(trimmed.substring(0, 20)); // Only decode first 20 base64 chars
    } else if (typeof Buffer !== 'undefined') {
      // Node.js environment
      decoded = Buffer.from(trimmed, 'base64').toString('utf8', 0, 20);
    } else {
      // Fallback: manual base64 decode (simplified, just check first few chars)
      return true; // Assume it's Kuwo format if we can't decode
    }

    return decoded.startsWith('tp=');
  } catch {
    // If decode fails, assume not Kuwo format
    return false;
  }
}

/**
 * Auto-decrypt lyrics if encrypted (async)
 *
 * Automatically detects QRC or Kuwo encryption and decrypts if needed.
 * Also handles decrypted QRC XML format to convert to word-by-word LRC.
 * Falls back to original text on decryption failure.
 *
 * @param lyrics - Potentially encrypted lyrics text
 * @param enableWordByWord - Whether to preserve word-by-word timing for QRC (default: false)
 * @returns Promise<string> - Decrypted lyrics or original text
 */
export async function autoDecryptLyric(lyrics: string, enableWordByWord: boolean = false): Promise<string> {
  if (!lyrics) {
    return '';
  }

  // Try QRC decryption first (QQ Music encrypted hex)
  if (isQRCEncrypted(lyrics)) {
    try {
      return await decryptQRCLyric(lyrics, enableWordByWord);
    } catch (error) {
      devLog('warn', '[QRC Native] 自动解密失败，返回原始内容', error);
      return lyrics;
    }
  }

  // Try Kuwo decryption (普通歌词模式: isGetLyricx=false)
  if (isKuwoEncrypted(lyrics)) {
    try {
      // 插件使用 lrcx=0 (普通歌词)，所以不需要 XOR 解密
      return await decryptKuwoLyric(lyrics, false);
    } catch (error) {
      devLog('warn', '[Kuwo Native] 自动解密失败，返回原始内容', error);
      return lyrics;
    }
  }

  // Handle already decrypted QRC XML format (not encrypted, but needs format conversion)
  if (isQrcXml(lyrics)) {
    devLog('info', '[QRC] 检测到已解密的QRC XML格式，进行格式转换', { enableWordByWord });
    const lrc = enableWordByWord
      ? convertQrcXmlToWordByWord(lyrics)
      : convertQrcXmlToLrc(lyrics);
    return lrc;
  }

  return lyrics;
}
