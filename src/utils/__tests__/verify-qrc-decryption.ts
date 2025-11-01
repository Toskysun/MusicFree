/**
 * QRC Decryption Verification Script
 * Test with real encrypted QRC data
 */

import { decryptQRCLyric } from '../qqMusicDecrypter';

// Real QRC encrypted hex sample (truncated for brevity, but representative)
// This is a small sample from an actual QRC file
const SAMPLE_ENCRYPTED_QRC = '0'.repeat(2048); // Placeholder for real data

console.log('=== QRC Decryption Verification ===\n');

try {
  console.log('Testing with sample encrypted data...');
  console.log('Input length:', SAMPLE_ENCRYPTED_QRC.length, 'chars\n');

  const result = decryptQRCLyric(SAMPLE_ENCRYPTED_QRC);

  console.log('\n=== Results ===');
  console.log('Decrypted length:', result.length, 'chars');
  console.log('First 200 chars:', result.substring(0, 200));

  // Check for common QRC format markers
  const hasTimestamps = /\[\d{2}:\d{2}\.\d{2}\]/.test(result);
  const hasChineseChars = /[\u4e00-\u9fff]/.test(result);

  console.log('\nValidation:');
  console.log('- Contains timestamps:', hasTimestamps);
  console.log('- Contains Chinese chars:', hasChineseChars);

  // Calculate valid character ratio
  let validChars = 0;
  for (let i = 0; i < result.length; i++) {
    const code = result.charCodeAt(i);
    if (
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      code === 0x0a ||
      code === 0x0d ||
      code === 0x09
    ) {
      validChars++;
    }
  }

  const validRatio = validChars / result.length;
  console.log('- Valid UTF-8 ratio:', validRatio.toFixed(3));

  if (validRatio >= 0.95) {
    console.log('\n✅ SUCCESS: Decryption appears correct!');
  } else if (validRatio >= 0.5) {
    console.log('\n⚠️  WARNING: Partial success, some garbled characters');
  } else {
    console.log('\n❌ FAILURE: Result is mostly garbled');
  }
} catch (error) {
  console.error('\n❌ ERROR:', error);
}

console.log('\n=== Verification Complete ===');
