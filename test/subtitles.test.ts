import assert from 'node:assert/strict';
import { correctVietnameseSpelling, auditAndFixSubtitlesSpelling, wrapSubtitleIntoLines } from '../src/utils';

export function runSubtitleTests() {
  console.log('🧪 [TEST SUITE 3] Vietnamese Subtitle Engine & Dialect-Neutral Spelling Tests...');

  // 1A. Default mode MUST preserve Northern/Central words while fixing real spelling errors
  const testNeutral = correctVietnameseSpelling("Nhé cả nhà, các bạn hãy xem thử sản phẫm xịn xò này nhé.");
  assert.ok(testNeutral.correctedText.includes("Nhé cả nhà"), "Default spelling check must NOT overwrite 'Nhé cả nhà' to Southern dialect");
  assert.ok(testNeutral.correctedText.includes("xem thử"), "Default spelling check must preserve 'xem thử'");
  assert.ok(testNeutral.correctedText.includes("sản phẩm"), "Must fix real typo 'sản phẫm' -> 'sản phẩm'");
  assert.ok(testNeutral.correctedText.includes("xịn sò"), "Must fix real typo 'xịn xò' -> 'xịn sò'");

  // 1B. Explicit Southern dialect adaptation mode (adaptSouthernDialect: true)
  const testSouth = correctVietnameseSpelling("Nhé cả nhà, các bạn hãy xem thử sản phẫm này thế này nhé.", { adaptSouthernDialect: true });
  assert.ok(testSouth.correctedText.toLowerCase().includes("nha cả nhà"), "With adaptSouthernDialect=true, should convert 'nhé cả nhà' to 'nha cả nhà'");
  assert.ok(testSouth.correctedText.includes("coi thử"), "With adaptSouthernDialect=true, should convert 'xem thử' to 'coi thử'");
  assert.ok(testSouth.correctedText.includes("như vầy nha"), "With adaptSouthernDialect=true, should convert 'thế này nhé' to 'như vầy nha'");

  // 2. Test Cooking & Crispy terminology (orthography works regardless of dialect)
  const test2 = correctVietnameseSpelling("Bánh chuối chiên zòn rụm, vàng dòn thơm phứt, đun lửa liu r.u");
  assert.ok(test2.correctedText.includes("chiên giòn"), "Should convert 'chiên zòn' to 'chiên giòn'");
  assert.ok(test2.correctedText.includes("giòn rụm"), "Should convert 'zòn rụm' to 'giòn rụm'");
  assert.ok(test2.correctedText.includes("vàng giòn"), "Should convert 'vàng dòn' to 'vàng giòn'");
  assert.ok(test2.correctedText.includes("thơm phức"), "Should convert 'thơm phứt' to 'thơm phức'");
  assert.ok(test2.correctedText.includes("liu riu"), "Should convert 'liu r.u' to 'liu riu'");

  // 3. Test OCR artifact & broken syllables
  const test3 = correctVietnameseSpelling("LIU R.U MĐÓM IẾNG CHUỐI NAM", { adaptSouthernDialect: true });
  assert.ok(test3.correctedText.includes("LIU RIU") || test3.correctedText.includes("Liu riu"), "Should fix OCR broken liu r.u");
  assert.ok(test3.correctedText.toLowerCase().includes("chuối xiêm"), "Should convert 'chuối nam' to 'chuối xiêm' when Southern adaptation enabled");

  // 4. Test Subtitle Timing & Array Auditing (Dialect-neutral by default)
  const sampleSubtitles = [
    { start: 0, end: 3.5, text: "sản phẫm này rất xịn xò nhé mọi người." },
    { start: 3.5, end: 6.8, text: "trãi nghiệm chiên zòn thơm phứt." }
  ];

  const auditResult = auditAndFixSubtitlesSpelling(sampleSubtitles);
  assert.equal(auditResult.fixedSubtitles.length, 2, "Must preserve exact count of subtitle frames");
  assert.equal(auditResult.fixedSubtitles[0].start, 0);
  assert.ok(auditResult.fixedSubtitles[0].text.startsWith("Sản phẩm"), "Must correct 'sản phẫm' to 'Sản phẩm' with first char capitalized");
  assert.ok(auditResult.fixedSubtitles[0].text.includes("xịn sò"), "Must correct 'xịn xò' to 'xịn sò'");
  assert.ok(auditResult.fixedSubtitles[0].text.includes("nhé mọi người"), "Must preserve original dialect 'nhé mọi người' by default");
  assert.ok(auditResult.fixedSubtitles[1].text.startsWith("Trải nghiệm"), "Must correct 'trãi nghiệm' and capitalize first char");

  // 5. Test wrapSubtitleIntoLines
  const longText = "Chiếc nồi chiên không dầu dung tích sáu lít đa năng cho gia đình hiện đại";
  const wrapped = wrapSubtitleIntoLines(longText, 25);
  assert.ok(wrapped.length >= 2, "Long line should be wrapped into multiple lines");
  for (const line of wrapped) {
    assert.ok(line.length <= 32, "Each line must fit within character boundary");
  }

  console.log('✅ [PASSED] Vietnamese Subtitle Engine & Dialect-Neutral Spelling Tests passed!\n');
}
