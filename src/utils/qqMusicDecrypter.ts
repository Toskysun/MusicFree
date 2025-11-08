/**
 * QQ Music QRC Lyric Decrypter
 * Decrypts QRC format lyrics using triple-DES algorithm
 *
 * Algorithm:
 * 1. DES Decrypt with KEY1
 * 2. DES Encrypt with KEY2
 * 3. DES Decrypt with KEY3
 * 4. Zlib decompress the result
 */

import {devLog} from '@/utils/log';
import pako from 'pako';
import {lyricDecode as customDESLyricDecode} from '@/utils/customDES';
import {convertQrcXmlToLrc, isQrcXml} from '@/utils/qrcXmlToLrc';

/**
 * Core QRC decryption function (matches Python lyric_decode)
 * Uses custom DES implementation to match QQ Music's encryption
 * @param data - Encrypted QRC data
 * @returns Uint8Array - Decrypted compressed data
 */
function lyricDecode(data: Uint8Array): Uint8Array {
  devLog('info', '[QRC解密] 输入数据长度:', data.length);
  devLog('info', '[QRC解密] 是否为8的倍数:', data.length % 8 === 0);

  // Use custom DES implementation (not standard DES!)
  const result = customDESLyricDecode(data);

  devLog('info', '[QRC解密] 三重DES解密完成，长度:', result.length);
  return result;
}

/**
 * Decrypt QQ Music QRC encrypted lyrics
 * @param encryptedHex - Encrypted lyrics in hex string format
 * @returns string - Decrypted lyrics text (XML format)
 */
export function decryptQRCLyric(encryptedHex: string): string {
  try {
    devLog('info', '[QRC解密] 开始解密，输入长度:', encryptedHex.length);

    // Step 1: Convert hex string to Uint8Array
    const encryptedBytes = hexToUint8Array(encryptedHex);
    devLog(
      'info',
      '[QRC解密] Hex转字节完成，长度:',
      encryptedBytes.length,
    );
    devLog(
      'info',
      '[QRC解密] 前16字节:',
      Array.from(encryptedBytes.slice(0, 16)),
    );

    // Step 2: Triple-DES decryption
    const decrypted = lyricDecode(encryptedBytes);
    devLog('info', '[QRC解密] 三重DES解密完成，长度:', decrypted.length);
    devLog('info', '[QRC解密] 前16字节:', Array.from(decrypted.slice(0, 16)));

    // Step 3: Zlib decompress
    let decompressed: Uint8Array;
    try {
      devLog('info', '[QRC解密] 准备解压，数据前16字节:', Array.from(decrypted.slice(0, 16)));
      devLog('info', '[QRC解密] Zlib魔数检查 (应为0x78):', decrypted[0]);

      decompressed = pako.inflate(decrypted);
      devLog('info', '[QRC解密] Zlib解压完成，长度:', decompressed.length);
    } catch (error) {
      devLog('error', '[QRC解密] Zlib解压失败:', error);
      throw new Error('Failed to decompress QRC data - invalid zlib format');
    }

    // Step 4: UTF-8 decode
    const result = new TextDecoder('utf-8', {fatal: false}).decode(
      decompressed,
    );
    devLog('info', '[QRC解密] UTF-8解码完成，结果长度:', result.length);
    devLog('info', '[QRC解密] 前200字符:', result.substring(0, 200));

    // Step 5: Convert XML to standard LRC if needed
    if (isQrcXml(result)) {
      devLog('info', '[QRC解密] 检测到QRC XML格式，转换为标准LRC');
      const lrcResult = convertQrcXmlToLrc(result);
      devLog('info', '[QRC解密] 转换完成，LRC长度:', lrcResult.length);
      devLog('info', '[QRC解密] LRC前200字符:', lrcResult.substring(0, 200));
      return lrcResult;
    }

    return result;
  } catch (error) {
    devLog('error', '[QRC解密] 解密失败:', error);
    throw new Error(
      `QRC decryption failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Convert hex string to Uint8Array
 */
function hexToUint8Array(hexString: string): Uint8Array {
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
  }
  return bytes;
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
  // This allows short encrypted lyrics (like instrumental music)
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
 * Auto-decrypt lyrics if needed
 */
export function autoDecryptLyric(lyrics: string): string {
  if (isQRCEncrypted(lyrics)) {
    try {
      return decryptQRCLyric(lyrics);
    } catch (error) {
      devLog('warn', '[QRC解密] 自动解密失败，返回原始内容:', error);
      return lyrics;
    }
  }
  return lyrics;
}
