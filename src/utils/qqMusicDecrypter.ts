/**
 * QQ Music QRC Lyric Decrypter
 * Decrypts QRC format lyrics using correct DES + XOR algorithm
 *
 * Algorithm (based on official QQ Music client reverse engineering):
 * 1. XOR preprocessing with KEY_PRE
 * 2. DES decryption (ECB mode) with KEY_MAIN
 * 3. XOR postprocessing with KEY_POST
 * 4. Remove trailing null bytes
 *
 * CRITICAL FIX: Using native DES implementation instead of crypto-js
 * crypto-js DES implementation has compatibility issues with standard DES
 */

import {devLog} from '@/utils/log';
import NativeUtils from '@/native/utils';

// Three critical keys extracted from QQ Music client
const KEY_MAIN = '123ZXC!@#)(*$%^&'; // Main DES decryption key
const KEY_PRE = '!@#)(NHLiuy*$%^&'; // XOR preprocessing key
const KEY_POST = '!@#)(*$%^&abcDEF'; // XOR postprocessing key

/**
 * DES decrypt data using ECB mode (native implementation)
 * @param data - Encrypted data as Uint8Array
 * @param key - DES key (8 bytes used)
 * @returns Promise<Uint8Array> - Decrypted data
 */
async function desDecrypt(
  data: Uint8Array,
  key: string,
): Promise<Uint8Array> {
  devLog('info', '[DES解密] 输入数据长度:', data.length);
  devLog('info', '[DES解密] 前32字节:', Array.from(data.slice(0, 32)));

  // Convert Uint8Array to number array for native module
  const dataArray = Array.from(data);

  // Call native DES decrypt
  const decryptedArray = await NativeUtils.desDecrypt(dataArray, key);

  // Convert back to Uint8Array
  const result = new Uint8Array(decryptedArray);

  devLog('info', '[DES解密] 输出数据长度:', result.length);
  devLog('info', '[DES解密] 前32字节:', Array.from(result.slice(0, 32)));

  return result;
}

/**
 * DES encrypt zero buffer to generate XOR key block (native implementation)
 * @param key - DES key (8 bytes used)
 * @returns Promise<Uint8Array> - Encrypted 8-byte block
 */
async function desEncrypt(key: string): Promise<Uint8Array> {
  devLog('info', '[DES加密零缓冲区] 密钥:', key.slice(0, 8));

  // Call native DES encrypt zero block
  const encryptedArray = await NativeUtils.desEncryptZeroBlock(key);

  // Convert to Uint8Array
  const result = new Uint8Array(encryptedArray);

  devLog('info', '[DES加密零缓冲区] 结果:', Array.from(result));

  return result;
}

/**
 * XOR transform data with DES-encrypted key block
 * @param data - Data to transform
 * @param key - DES key used to generate XOR block
 * @returns Promise<Uint8Array> - XOR transformed data
 */
async function xorTransform(
  data: Uint8Array,
  key: string,
): Promise<Uint8Array> {
  const result = new Uint8Array(data);
  const keyBlock = await desEncrypt(key);

  // XOR every 8-byte block with the keyBlock
  for (let i = 0; i < data.length; i += 8) {
    for (let j = 0; j < 8 && i + j < result.length; j++) {
      result[i + j] ^= keyBlock[j];
    }
  }

  return result;
}

/**
 * Remove trailing null bytes (0x00) from decrypted data
 */
function removePadding(data: Uint8Array): Uint8Array {
  let length = data.length;
  while (length > 0 && data[length - 1] === 0) {
    length--;
  }
  return data.slice(0, length);
}

/**
 * Decrypt QQ Music QRC encrypted lyrics
 * @param encryptedHex - Encrypted lyrics in hex string format
 * @returns Promise<string> - Decrypted lyrics text in UTF-8
 */
export async function decryptQRCLyric(encryptedHex: string): Promise<string> {
  try {
    devLog('info', '[QRC解密] 开始解密，输入长度:', encryptedHex.length);
    devLog('info', '[QRC解密] 完整Hex字符串:', encryptedHex);

    // Step 1: Hex string to Uint8Array
    const encryptedBytes = hexToUint8Array(encryptedHex);
    devLog(
      'info',
      '[QRC解密] Step 1: Hex转字节完成，长度:',
      encryptedBytes.length,
    );
    devLog(
      'info',
      '[QRC解密] 前32字节:',
      Array.from(encryptedBytes.slice(0, 32)),
    );
    devLog('info', '[QRC解密] 后8字节:', Array.from(encryptedBytes.slice(-8)));

    // Step 2: XOR preprocessing with KEY_PRE
    let data = await xorTransform(encryptedBytes, KEY_PRE);
    devLog('info', '[QRC解密] Step 2: XOR预处理完成');
    devLog('info', '[QRC解密] 前32字节:', Array.from(data.slice(0, 32)));

    // Step 3: DES decryption with KEY_MAIN
    data = await desDecrypt(data, KEY_MAIN);
    devLog('info', '[QRC解密] Step 3: DES解密完成');
    devLog('info', '[QRC解密] 前32字节:', Array.from(data.slice(0, 32)));

    // Step 4: XOR postprocessing with KEY_POST
    data = await xorTransform(data, KEY_POST);
    devLog('info', '[QRC解密] Step 4: XOR后处理完成');
    devLog('info', '[QRC解密] 前32字节:', Array.from(data.slice(0, 32)));

    // Step 5: Remove trailing null bytes
    data = removePadding(data);
    devLog('info', '[QRC解密] Step 5: 移除填充完成，最终长度:', data.length);

    // Step 6: UTF-8 decode with error recovery
    const result = new TextDecoder('utf-8', {fatal: false}).decode(data);
    devLog('info', '[QRC解密] Step 6: UTF-8解码完成，结果长度:', result.length);
    devLog('info', '[QRC解密] 前100字符:', result.substring(0, 100));

    // Validate result is not garbled
    const validUtf8Ratio = calculateValidUtf8Ratio(result);
    devLog(
      'info',
      '[QRC解密] 有效UTF-8字符比例:',
      validUtf8Ratio.toFixed(2),
    );

    if (validUtf8Ratio < 0.5) {
      devLog(
        'warn',
        '[QRC解密] 警告: 解密结果可能包含乱码，有效字符比例过低',
      );
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
 * Calculate the ratio of valid UTF-8 characters in the string
 * Used to detect potential decryption failures
 */
function calculateValidUtf8Ratio(text: string): number {
  if (text.length === 0) return 0;

  let validChars = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Valid printable characters, CJK characters, or common whitespace
    if (
      (code >= 0x20 && code <= 0x7e) || // ASCII printable
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      code === 0x0a || // Line feed
      code === 0x0d || // Carriage return
      code === 0x09 // Tab
    ) {
      validChars++;
    }
  }

  return validChars / text.length;
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
 * - Very long hex strings (typically 2000+ chars)
 * - Only contains 0-9A-F characters
 * - No Base64 special chars (+/=)
 * - No LRC timestamp format ([00:00.00])
 */
export function isQRCEncrypted(lyrics: string): boolean {
  if (!lyrics) return false;

  const trimmed = lyrics.trim();

  // Must be very long (encrypted lyrics are typically 2000+ chars)
  if (trimmed.length < 1000) return false;

  // Must be even length (hex pairs)
  if (trimmed.length % 2 !== 0) return false;

  // Must be pure hexadecimal (no Base64 chars like +/=, no uppercase/lowercase mix)
  if (!/^[0-9A-Fa-f]+$/.test(trimmed)) return false;

  // Should NOT contain LRC timestamp patterns
  if (/\[\d{2}:\d{2}\.\d{2}\]/.test(trimmed)) return false;

  // Should NOT contain Base64 padding
  if (trimmed.includes('=')) return false;

  return true;
}

/**
 * Auto-decrypt lyrics if needed
 */
export async function autoDecryptLyric(lyrics: string): Promise<string> {
  if (isQRCEncrypted(lyrics)) {
    try {
      return await decryptQRCLyric(lyrics);
    } catch (error) {
      devLog('warn', '[QRC解密] 自动解密失败，返回原始内容:', error);
      return lyrics;
    }
  }
  return lyrics;
}
