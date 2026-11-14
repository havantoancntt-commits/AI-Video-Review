import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SAIGON_VOICE_POLICY,
  SAIGON_TTS_MODELS,
  SAIGON_AUDIO_DIRECTIVE,
  SAIGON_VOICE_SPECS,
  SAIGON_SAMPLE_SCRIPT,
  adaptVietnameseTextForSaigonSpeech,
  buildTtsCacheKey,
  isCacheKeyValidForPolicy,
  resolveVoiceConfiguration,
  computeDeterministicScriptHash,
} from '../src/saigonVoicePolicy';
import {
  ensureWavBuffer,
  inspectWavAudioMetrics,
  TTS_SAMPLES_DIR,
} from '../server/saigonTtsEngine';
import { correctVietnameseSpelling } from '../src/utils';
import { TTS_VOICES } from '../src/types';

export function runTtsAudioTests() {
  console.log('🧪 [TEST SUITE 4] Southern Saigon TTS Policy, WAV Metrics & Provenance Tests...');

  // 1. Policy Locking Assertions
  assert.equal(SAIGON_VOICE_POLICY.VIETNAMESE_LANGUAGE, 'vi-VN');
  assert.equal(SAIGON_VOICE_POLICY.VIETNAMESE_ACCENT, 'Southern Vietnamese');
  assert.equal(SAIGON_VOICE_POLICY.REGIONAL_VARIANT, 'Saigon Vietnamese');
  assert.equal(SAIGON_VOICE_POLICY.ACCENT_POLICY, 'STRICT_SOUTHERN_ONLY');
  assert.equal(SAIGON_VOICE_POLICY.FORBIDDEN_ACCENT, 'Northern Vietnamese');
  assert.equal(SAIGON_VOICE_POLICY.DEFAULT_VOICE, 'Kore');
  assert.equal(SAIGON_VOICE_POLICY.ALLOW_NORTHERN_FALLBACK, false);
  assert.equal(SAIGON_VOICE_POLICY.ALLOW_BROWSER_SPEECH_SYNTHESIS_VIETNAMESE, false);

  // 2. Voice Resolution Guardrails (Never fall back to Northern/unknown voice for vi-VN; preserve English _EN)
  const defaultVi = resolveVoiceConfiguration(undefined, 'vi');
  assert.equal(defaultVi.voiceId, 'Kore');
  assert.equal(defaultVi.language, 'vi-VN');
  assert.equal(defaultVi.accent, 'Southern Vietnamese');
  assert.ok(defaultVi.speechStylePrompt.includes('Ho Chi Minh City'));
  assert.ok(defaultVi.speechStylePrompt.includes(SAIGON_AUDIO_DIRECTIVE));

  const tamperedVoice = resolveVoiceConfiguration('Northern_Hanoi_Default', 'vi');
  assert.equal(tamperedVoice.voiceId, 'Kore', 'Unknown/Northern voice override must strictly clamp to approved Saigon default');
  assert.equal(tamperedVoice.accent, 'Southern Vietnamese');

  for (const spec of SAIGON_VOICE_SPECS) {
    const resolved = resolveVoiceConfiguration(spec.id, 'vi');
    assert.equal(resolved.voiceId, spec.id);
    assert.equal(resolved.isEnglish, false);
    assert.equal(resolved.accent, 'Southern Vietnamese');
    assert.equal(resolved.regionalVariant, 'Saigon Vietnamese');
    assert.ok(TTS_VOICES.some((v) => v.id === spec.id && v.language === 'vi' && v.accent === 'Southern Vietnamese'));
  }

  const enResolved = resolveVoiceConfiguration('Aoede_EN', 'en');
  assert.equal(enResolved.isEnglish, true);
  assert.equal(enResolved.language, 'en-US');
  assert.equal(enResolved.geminiVoiceName, 'Aoede');

  // 3. Cache Key Versioning & Legacy Cache Invalidation
  assert.equal(
    isCacheKeyValidForPolicy('v19_tts:Kore:std:hello', { voiceId: 'Kore', language: 'vi-VN' }),
    false,
    'Legacy v19_tts cache keys must be strictly rejected'
  );

  const keyKore = buildTtsCacheKey({
    voiceId: 'Kore',
    language: 'vi-VN',
    accent: SAIGON_VOICE_POLICY.VIETNAMESE_ACCENT,
    ttsModelVersion: SAIGON_TTS_MODELS.VIETNAMESE,
    scriptText: SAIGON_SAMPLE_SCRIPT,
  });
  const keyFenrir = buildTtsCacheKey({
    voiceId: 'Fenrir',
    language: 'vi-VN',
    accent: SAIGON_VOICE_POLICY.VIETNAMESE_ACCENT,
    ttsModelVersion: SAIGON_TTS_MODELS.VIETNAMESE,
    scriptText: SAIGON_SAMPLE_SCRIPT,
  });
  assert.notEqual(keyKore, keyFenrir, 'Switching voice must never collide cache keys');
  assert.equal(
    isCacheKeyValidForPolicy(keyKore, {
      voiceId: 'Kore',
      language: 'vi-VN',
      ttsModelVersion: SAIGON_TTS_MODELS.VIETNAMESE,
    }),
    true
  );
  assert.equal(
    isCacheKeyValidForPolicy(keyKore, {
      voiceId: 'Fenrir',
      language: 'vi-VN',
      ttsModelVersion: SAIGON_TTS_MODELS.VIETNAMESE,
    }),
    false,
    'Cache lookup for Fenrir must reject Kore cache entry'
  );
  assert.notEqual(
    computeDeterministicScriptHash('Dạ chào cả nhà nha.'),
    computeDeterministicScriptHash('Dạ chào cả nhà nhé.')
  );

  // 4. Northern Phonetic / Lexical Scrubbing in Saigon TTS Mode + Unicode Boundary Safety
  const northernInput = 'Vâng, các bạn hãy xem thử cái bát và thìa thế này nhé!';
  const saigonAdapted = correctVietnameseSpelling(northernInput, { adaptSouthernDialect: true }).correctedText.toLowerCase();
  assert.ok(saigonAdapted.includes('dạ'), 'Should map vâng -> dạ');
  assert.ok(saigonAdapted.includes('coi thử'), 'Should map xem thử -> coi thử');
  assert.ok(saigonAdapted.includes('chén'), 'Should map bát -> chén');
  assert.ok(saigonAdapted.includes('muỗng'), 'Should map thìa -> muỗng');
  assert.ok(saigonAdapted.includes('như vầy nha'), 'Should map thế này nhé -> như vầy nha');

  const unicodeRegressionInput =
    'Hôm nay bạn tạo kết quả tất cả màn hình bảo hành thế giới, cảm ơn các bạn luôn đồng hành nhé!';
  const unicodeSanitized = adaptVietnameseTextForSaigonSpeech(unicodeRegressionInput, true);
  assert.ok(unicodeSanitized.includes('Hôm nay'), `Must NOT corrupt "Hôm nay" -> got: ${unicodeSanitized}`);
  assert.ok(unicodeSanitized.includes('bạn tạo'), `Must NOT corrupt "bạn tạo" -> got: ${unicodeSanitized}`);
  assert.ok(unicodeSanitized.includes('kết quả'), `Must NOT corrupt "kết quả" -> got: ${unicodeSanitized}`);
  assert.ok(unicodeSanitized.includes('tất cả'), `Must NOT corrupt "tất cả" -> got: ${unicodeSanitized}`);
  assert.ok(unicodeSanitized.includes('màn hình'), `Must NOT corrupt "màn hình" -> got: ${unicodeSanitized}`);
  assert.ok(unicodeSanitized.includes('bảo hành'), `Must NOT corrupt "bảo hành" -> got: ${unicodeSanitized}`);
  assert.ok(unicodeSanitized.includes('thế giới'), `Must NOT corrupt "thế giới" -> got: ${unicodeSanitized}`);
  assert.ok(unicodeSanitized.includes('luôn đồng hành nha'), `Must preserve "luôn" and convert "nhé" -> "nha": ${unicodeSanitized}`);

  const fullSanitizedSample = adaptVietnameseTextForSaigonSpeech(SAIGON_SAMPLE_SCRIPT, true);
  assert.ok(fullSanitizedSample.includes('Hôm nay'), 'Benchmark script must keep Hôm nay intact');
  assert.ok(fullSanitizedSample.includes('luôn đồng hành'), 'Benchmark script must keep luôn đồng hành intact');
  assert.ok(!fullSanitizedSample.includes('Hdùm') && !fullSanitizedSample.includes('ludùn'), 'Must never produce ASCII \\b vowel artifacts');

  // 5. Real WAV Synthesis & Silent-Audio Rejection Check
  const sampleRate = 24000;
  const durationSec = 0.5;
  const numSamples = Math.floor(sampleRate * durationSec);
  const pcmBuffer = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin(2 * Math.PI * 440 * (i / sampleRate));
    pcmBuffer.writeInt16LE(Math.floor(sample * 32767), i * 2);
  }

  const wavBuffer = ensureWavBuffer(pcmBuffer, sampleRate);
  assert.equal(wavBuffer.length, 44 + pcmBuffer.length);
  assert.equal(wavBuffer.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wavBuffer.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(wavBuffer.readUInt16LE(20), 1);
  assert.equal(wavBuffer.readUInt16LE(22), 1);
  assert.equal(wavBuffer.readUInt32LE(24), 24000);
  assert.equal(wavBuffer.readUInt16LE(34), 16);

  const realMetrics = inspectWavAudioMetrics(wavBuffer);
  assert.equal(realMetrics.isValidRiffWav, true);
  assert.equal(realMetrics.isSilent, false);
  assert.ok(realMetrics.rmsDb > -10);

  // Silent PCM buffer MUST be flagged isSilent = true (reject fake silence substitution)
  const silentPcm = Buffer.alloc(numSamples * 2);
  const silentMetrics = inspectWavAudioMetrics(ensureWavBuffer(silentPcm, sampleRate));
  assert.equal(silentMetrics.isSilent, true, 'Silent WAV must be strictly detected & rejected');

  // Idempotent RIFF bypass
  assert.equal(ensureWavBuffer(wavBuffer, sampleRate).length, wavBuffer.length);

  // 6. Verify all 6 Live-Synthesized Saigon Sample WAVs on Disk
  for (const spec of SAIGON_VOICE_SPECS) {
    const sampleFile = path.join(TTS_SAMPLES_DIR, `sample_${spec.id}_${SAIGON_TTS_MODELS.VIETNAMESE}.wav`);
    assert.ok(fs.existsSync(sampleFile), `Verified live Saigon WAV sample must exist for ${spec.id}: ${sampleFile}`);
    const fileBuf = fs.readFileSync(sampleFile);
    const metrics = inspectWavAudioMetrics(fileBuf);
    assert.equal(metrics.isValidRiffWav, true, `${spec.id} WAV must have valid RIFF/WAVE header`);
    assert.equal(metrics.isSilent, false, `${spec.id} WAV must contain real non-silent audio`);
    assert.equal(metrics.sampleRate, 24000, `${spec.id} WAV sample rate must be 24000Hz`);
    assert.ok(metrics.durationSec > 5, `${spec.id} sample WAV duration (${metrics.durationSec}s) should contain full benchmark script`);
  }

  console.log('✅ [PASSED] Southern Saigon TTS Policy, WAV Metrics & Live Sample Verification Tests passed!\n');
}

