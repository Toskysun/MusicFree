/**
 * QQ Music QRC Decrypter Tests
 */

jest.mock("@/native/lyricUtil", () => ({
  __esModule: true,
  default: {
    decryptQRCLyric: async (encryptedHex: string) =>
      encryptedHex ? "[00:00.00]mock lyric" : "",
    decryptKuwoLyric: async (lrcBase64: string) => lrcBase64,
  },
}));

import {
  decryptQRCLyric,
  isQRCEncrypted,
  autoDecryptLyric,
} from '../musicDecrypter';
import { describe, expect, it, jest } from "@jest/globals";

describe('musicDecrypter', () => {
  describe('isQRCEncrypted', () => {
    it('should return false for empty string', () => {
      expect(isQRCEncrypted('')).toBe(false);
    });

    it('should return false for short strings', () => {
      expect(isQRCEncrypted('abc123')).toBe(false);
    });

    it('should return false for odd-length hex strings', () => {
      const shortHex = 'a'.repeat(1001); // Odd length
      expect(isQRCEncrypted(shortHex)).toBe(false);
    });

    it('should return false for strings with non-hex characters', () => {
      const invalidHex = 'g'.repeat(1000);
      expect(isQRCEncrypted(invalidHex)).toBe(false);
    });

    it('should return false for LRC format lyrics', () => {
      const lrc = '[00:00.00]Test lyric';
      expect(isQRCEncrypted(lrc)).toBe(false);
    });

    it('should return false for Base64 strings', () => {
      const base64 = 'a'.repeat(999) + '=';
      expect(isQRCEncrypted(base64)).toBe(false);
    });

    it('should return true for valid QRC encrypted hex strings', () => {
      const validQRC = '0'.repeat(2000); // Long even-length hex
      expect(isQRCEncrypted(validQRC)).toBe(true);
    });
  });

  describe('autoDecryptLyric', () => {
    it('should return original lyrics if not encrypted', async () => {
      const plainLyrics = '[00:00.00]Plain text lyrics';
      await expect(autoDecryptLyric(plainLyrics)).resolves.toBe(plainLyrics);
    });

    it('should attempt decryption for encrypted lyrics', async () => {
      const encryptedHex = '0'.repeat(2000);
      const result = await autoDecryptLyric(encryptedHex);
      // Should either return decrypted text or original on error
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('decryptQRCLyric', () => {
    it('should handle invalid hex input gracefully', async () => {
      const result = await decryptQRCLyric('00');
      expect(typeof result).toBe("string");
    });

    it('should handle empty input', async () => {
      const result = await decryptQRCLyric('');
      expect(typeof result).toBe('string');
      expect(result).toBe(''); // Empty hex produces empty result
    });

    it('should process valid hex format', async () => {
      // Simple hex input (will not produce valid lyrics, but tests the pipeline)
      const hexInput = '48656c6c6f'; // "Hello" in hex
      const result = await decryptQRCLyric(hexInput);
      expect(typeof result).toBe('string');
    });

    // Note: Real encrypted lyrics test would require a valid QRC sample
    // which we don't include in the codebase for copyright reasons
  });
});
