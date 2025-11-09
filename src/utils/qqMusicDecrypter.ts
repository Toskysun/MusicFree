/**
 * QQ Music QRC Lyric Decrypter
 * Uses Android Native implementation for high-performance decryption
 * 
 * Native Implementation:
 * - Location: android/app/src/main/java/fun/upup/musicfree/lyricUtil/LyricUtilModule.kt
 * - Algorithm: Triple-DES + Zlib decompression
 * - Performance: ~10ms (vs 100-500ms in JS)
 * 
 * Migration Note:
 * - Old JS implementation moved to @deprecated customDES.ts (kept for reference)
 * - All decryption now delegated to Native module for better performance
 */

import LyricUtil from '@/native/lyricUtil';
import {devLog} from '@/utils/log';
import {convertQrcXmlToLrc, isQrcXml} from '@/utils/qrcXmlToLrc';

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
 * @returns Promise<string> - Decrypted lyrics text (may be XML or LRC format)
 * @throws Error with user-friendly Chinese message on decryption failure
 */
export async function decryptQRCLyric(encryptedHex: string): Promise<string> {
  try {
    const startTime = Date.now();
    
    devLog('info', '[QRC Native] 开始解密', {
      inputLength: encryptedHex.length,
      isValidLength: encryptedHex.length % 16 === 0
    });

    // Call Native decryption (Triple-DES + Zlib)
    const decrypted = await LyricUtil.decryptQRCLyric(encryptedHex);
    
    const duration = Date.now() - startTime;
    devLog('info', `[QRC Native] 解密完成 (${duration}ms)`, {
      outputLength: decrypted.length,
      preview: decrypted.substring(0, 100)
    });

    // Convert XML to LRC format if needed (lightweight JS operation)
    if (isQrcXml(decrypted)) {
      const lrc = convertQrcXmlToLrc(decrypted);
      devLog('info', '[QRC Native] XML转LRC完成', {
        lrcLength: lrc.length,
        preview: lrc.substring(0, 100)
      });
      return lrc;
    }

    return decrypted;
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
 * Auto-decrypt lyrics if encrypted (async)
 * 
 * Automatically detects QRC encryption and decrypts if needed.
 * Falls back to original text on decryption failure.
 * 
 * @param lyrics - Potentially encrypted lyrics text
 * @returns Promise<string> - Decrypted lyrics or original text
 */
export async function autoDecryptLyric(lyrics: string): Promise<string> {
  if (!lyrics) {
    return '';
  }

  if (isQRCEncrypted(lyrics)) {
    try {
      return await decryptQRCLyric(lyrics);
    } catch (error) {
      devLog('warn', '[QRC Native] 自动解密失败，返回原始内容', error);
      return lyrics;
    }
  }

  return lyrics;
}
