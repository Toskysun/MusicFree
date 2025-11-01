/**
 * Standalone QRC Decrypter Tests
 * Tests crypto conversion logic without dependencies
 */

import CryptoJS from 'crypto-js';

/**
 * Convert Uint8Array to CryptoJS WordArray (big-endian)
 */
function uint8ArrayToWordArray(uint8Array: Uint8Array): CryptoJS.lib.WordArray {
  const words: number[] = [];

  // Convert 4 bytes at a time to a 32-bit word (big-endian)
  for (let i = 0; i < uint8Array.length; i += 4) {
    const byte0 = i < uint8Array.length ? uint8Array[i] : 0;
    const byte1 = i + 1 < uint8Array.length ? uint8Array[i + 1] : 0;
    const byte2 = i + 2 < uint8Array.length ? uint8Array[i + 2] : 0;
    const byte3 = i + 3 < uint8Array.length ? uint8Array[i + 3] : 0;

    // Big-endian: most significant byte first
    words.push(
      (byte0 << 24) |
      (byte1 << 16) |
      (byte2 << 8) |
      byte3
    );
  }

  return CryptoJS.lib.WordArray.create(words, uint8Array.length);
}

/**
 * Convert CryptoJS WordArray to Uint8Array
 */
function wordArrayToUint8Array(wordArray: CryptoJS.lib.WordArray): Uint8Array {
  const words = wordArray.words;
  const sigBytes = wordArray.sigBytes;
  const result = new Uint8Array(sigBytes);

  for (let i = 0; i < sigBytes; i++) {
    result[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }

  return result;
}

describe('QRC Decrypter Crypto Conversion', () => {
  describe('uint8ArrayToWordArray', () => {
    it('should convert simple byte arrays correctly', () => {
      const input = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
      const wordArray = uint8ArrayToWordArray(input);

      expect(wordArray.words.length).toBe(1);
      expect(wordArray.sigBytes).toBe(4);
      // Big-endian: 0x12345678
      expect(wordArray.words[0]).toBe(0x12345678);
    });

    it('should handle non-aligned lengths', () => {
      const input = new Uint8Array([0x12, 0x34, 0x56]);
      const wordArray = uint8ArrayToWordArray(input);

      expect(wordArray.words.length).toBe(1);
      expect(wordArray.sigBytes).toBe(3);
      // Big-endian: 0x12345600 (padded with zero)
      expect(wordArray.words[0]).toBe(0x12345600);
    });

    it('should handle 8-byte blocks', () => {
      const input = new Uint8Array([
        0x11, 0x22, 0x33, 0x44,
        0x55, 0x66, 0x77, 0x88
      ]);
      const wordArray = uint8ArrayToWordArray(input);

      expect(wordArray.words.length).toBe(2);
      expect(wordArray.sigBytes).toBe(8);
      expect(wordArray.words[0]).toBe(0x11223344);
      expect(wordArray.words[1]).toBe(0x55667788);
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve data in round-trip', () => {
      const original = new Uint8Array([
        0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f,
        0x72, 0x6c, 0x64, 0x21
      ]); // "Hello World!"

      const wordArray = uint8ArrayToWordArray(original);
      const converted = wordArrayToUint8Array(wordArray);

      expect(converted.length).toBe(original.length);
      expect(Array.from(converted)).toEqual(Array.from(original));
    });
  });

  describe('DES encryption/decryption', () => {
    it('should work with proper conversion', () => {
      const plaintext = new Uint8Array([
        0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x20, 0x20
      ]); // "Hello   " (8 bytes for DES)

      const key = CryptoJS.enc.Utf8.parse('12345678');

      // Encrypt
      const plaintextWA = uint8ArrayToWordArray(plaintext);
      const encrypted = CryptoJS.DES.encrypt(plaintextWA, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.NoPadding,
      });

      // Decrypt
      const decrypted = CryptoJS.DES.decrypt(encrypted, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.NoPadding,
      });

      const result = wordArrayToUint8Array(decrypted);

      expect(Array.from(result)).toEqual(Array.from(plaintext));
    });
  });
});
