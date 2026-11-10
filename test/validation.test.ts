import assert from 'node:assert/strict';

// Helper function from server signature validation logic
function validateBase64FileSignature(base64Data: string, allowedTypes: 'video' | 'image'): boolean {
  if (!base64Data || typeof base64Data !== 'string') return false;
  const commaIdx = base64Data.indexOf(',');
  const cleanBase64 = commaIdx >= 0 ? base64Data.substring(commaIdx + 1) : base64Data;
  const binaryPrefix = Buffer.from(cleanBase64.substring(0, 128), 'base64');
  if (binaryPrefix.length < 8) return false;

  const hex = binaryPrefix.toString('hex').toUpperCase();

  if (allowedTypes === 'video') {
    const isMp4 = hex.includes('66747970'); // 'ftyp'
    const isWebm = hex.startsWith('1A45DFA3'); // EBML header
    return isMp4 || isWebm;
  }

  if (allowedTypes === 'image') {
    const isJpeg = hex.startsWith('FFD8FF');
    const isPng = hex.startsWith('89504E470D0A1A0A');
    const isWebp = hex.startsWith('52494646') && hex.includes('57454250'); // 'RIFF' + 'WEBP'
    const isGif = hex.startsWith('47494638'); // 'GIF8'
    return isJpeg || isPng || isWebp || isGif;
  }

  return false;
}

export function runValidationTests() {
  console.log('🧪 [TEST SUITE 1] File Validation & Magic Signature Tests...');

  // Test 1: Real MP4 ftyp signature
  const mp4Header = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6D, 0x70, 0x34, 0x32]);
  const mp4Base64 = 'data:video/mp4;base64,' + mp4Header.toString('base64');
  assert.equal(validateBase64FileSignature(mp4Base64, 'video'), true, 'Should accept valid MP4 signature');

  // Test 2: Real WebM EBML signature
  const webmHeader = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81]);
  const webmBase64 = webmHeader.toString('base64');
  assert.equal(validateBase64FileSignature(webmBase64, 'video'), true, 'Should accept valid WebM signature');

  // Test 3: Spoofed MIME type with fake payload
  const fakeVideoBase64 = 'data:video/mp4;base64,' + Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
  assert.equal(validateBase64FileSignature(fakeVideoBase64, 'video'), false, 'Should reject spoofed video payload');

  // Test 4: Real JPEG signature
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
  const jpegBase64 = 'data:image/jpeg;base64,' + jpegHeader.toString('base64');
  assert.equal(validateBase64FileSignature(jpegBase64, 'image'), true, 'Should accept valid JPEG signature');

  // Test 5: Real PNG signature
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
  const pngBase64 = pngHeader.toString('base64');
  assert.equal(validateBase64FileSignature(pngBase64, 'image'), true, 'Should accept valid PNG signature');

  // Test 6: Empty or short string
  assert.equal(validateBase64FileSignature('', 'video'), false, 'Should reject empty string');
  assert.equal(validateBase64FileSignature('abc', 'video'), false, 'Should reject too short string');

  console.log('✅ [PASSED] 6/6 File Signature Validation Tests successfully passed!\n');
}
