import fs from 'fs';
import path from 'path';
import type { GoogleGenAI } from '@google/genai';
import {
  SAIGON_VOICE_POLICY,
  SAIGON_TTS_MODELS,
  SAIGON_SAMPLE_SCRIPT,
  TtsAudioProvenance,
  buildTtsCacheKey,
  computeDeterministicScriptHash,
  resolveVoiceConfiguration,
} from '../src/saigonVoicePolicy';

export const PRIMARY_TTS_LITE_MODEL = SAIGON_TTS_MODELS.ENGLISH;
export const VOICE_DESIGN_TTS_MODEL = SAIGON_TTS_MODELS.VIETNAMESE;

export const TTS_SAMPLES_DIR = path.join(process.cwd(), 'public', 'samples', 'tts');

export interface WavAudioMetrics {
  isValidRiffWav: boolean;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  byteLength: number;
  dataByteLength: number;
  durationSec: number;
  peakAmplitude: number;
  rmsDb: number;
  isSilent: boolean;
}

/**
 * Wraps raw 16-bit LE mono PCM in a 44-byte RIFF/WAVE header if not already RIFF/WAVE.
 */
export function ensureWavBuffer(rawOrWav: Buffer, defaultSampleRate = 24000): Buffer {
  if (
    rawOrWav.length >= 44 &&
    rawOrWav.subarray(0, 4).toString('ascii') === 'RIFF' &&
    rawOrWav.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return rawOrWav;
  }

  const dataLen = rawOrWav.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataLen, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // Linear PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(defaultSampleRate, 24);
  header.writeUInt32LE(defaultSampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataLen, 40);
  return Buffer.concat([header, rawOrWav]);
}

/**
 * Inspects real audio waveform samples from WAV buffer.
 * Detects corrupt files, silent tracks, or invalid headers.
 */
export function inspectWavAudioMetrics(input: Buffer | string): WavAudioMetrics {
  const raw = typeof input === 'string' ? Buffer.from(input, 'base64') : input;
  const wav = ensureWavBuffer(raw);

  if (wav.length < 44) {
    return {
      isValidRiffWav: false,
      sampleRate: 0,
      channels: 0,
      bitsPerSample: 0,
      byteLength: wav.length,
      dataByteLength: 0,
      durationSec: 0,
      peakAmplitude: 0,
      rmsDb: -100,
      isSilent: true,
    };
  }

  const isRiff = wav.subarray(0, 4).toString('ascii') === 'RIFF';
  const isWave = wav.subarray(8, 12).toString('ascii') === 'WAVE';
  const channels = wav.readUInt16LE(22) || 1;
  const sampleRate = wav.readUInt32LE(24) || 24000;
  const bitsPerSample = wav.readUInt16LE(34) || 16;

  // Locate 'data' chunk robustly
  let dataOffset = 12;
  let dataSize = 0;
  while (dataOffset + 8 <= wav.length) {
    const chunkId = wav.subarray(dataOffset, dataOffset + 4).toString('ascii');
    const chunkSize = wav.readUInt32LE(dataOffset + 4);
    if (chunkId === 'data') {
      dataOffset += 8;
      dataSize = Math.min(chunkSize, wav.length - dataOffset);
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  if (dataSize <= 0) {
    dataOffset = 44;
    dataSize = Math.max(0, wav.length - 44);
  }

  const bytesPerSample = Math.max(1, bitsPerSample / 8);
  const totalSamples = Math.floor(dataSize / bytesPerSample);
  const durationSec = sampleRate > 0 ? Number((totalSamples / channels / sampleRate).toFixed(3)) : 0;

  let peak = 0;
  let sumSq = 0;
  let counted = 0;

  if (bitsPerSample === 16) {
    for (let i = 0; i < totalSamples; i++) {
      const bytePos = dataOffset + i * 2;
      if (bytePos + 2 > wav.length) break;
      const sample = wav.readInt16LE(bytePos) / 32768;
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;
      sumSq += sample * sample;
      counted++;
    }
  }

  const rms = counted > 0 ? Math.sqrt(sumSq / counted) : 0;
  const rmsDb = rms > 1e-7 ? Number((20 * Math.log10(rms)).toFixed(2)) : -100;
  const isSilent = !isRiff || !isWave || counted === 0 || peak < 0.005 || rmsDb < -55;

  return {
    isValidRiffWav: isRiff && isWave && dataSize > 0,
    sampleRate,
    channels,
    bitsPerSample,
    byteLength: wav.length,
    dataByteLength: dataSize,
    durationSec,
    peakAmplitude: Number(peak.toFixed(4)),
    rmsDb,
    isSilent,
  };
}

export interface SaigonAcousticAuditResult {
  voiceId: string;
  modelUsed: string;
  testScript: string;
  wavMetrics: WavAudioMetrics;
  sampleSavedPath: string;
  samplePublicUrl: string;
  detectedAccentCategory: 'SOUTHERN_SAIGON' | 'NORTHERN_HANOI' | 'MIXED_OR_NEUTRAL' | 'UNKNOWN';
  phoneticScores: {
    saigonIntonation: number;
    voiceTimbre: number;
    vowelRealization: number;
    finalConsonants: number;
    sentenceRhythm: number;
    toneMarking: number;
    naturalness: number;
    clarity: number;
  };
  observedMarkers: string[];
  northernLeaksDetected: string[];
  auditSummary: string;
  humanListeningRequired: true;
  humanListeningInstruction: string;
}

/**
 * Evaluates a synthesized WAV sample objectively using Gemini audio perception.
 * Never infers dialect from input text—analyzes only the acoustic waveform & specifies human audition is mandatory.
 */
export async function auditWavDialectWithGemini(params: {
  aiStd: GoogleGenAI;
  wavBuffer: Buffer;
  voiceId: string;
  modelUsed: string;
  testScript: string;
  sampleSavedPath: string;
  samplePublicUrl: string;
}): Promise<SaigonAcousticAuditResult> {
  const { aiStd, wavBuffer, voiceId, modelUsed, testScript, sampleSavedPath, samplePublicUrl } = params;
  const wavMetrics = inspectWavAudioMetrics(wavBuffer);
  const wavBase64 = wavBuffer.toString('base64');

  const auditPrompt = `
You are an expert Vietnamese Acoustic Phonetician and Dialectologist.
Listen VERY CAREFULLY and OBJECTIVELY to the attached audio recording.
CRITICAL HONESTY RULE: Do NOT assume Southern Vietnamese just because the words sound Southern in script. Judge ONLY the actual spoken phonology, pitch contour, vowel/consonant realization, and prosody you HEAR in the audio!

Evaluate these exact criteria (1 to 10 scale) and return strictly valid JSON:
- detectedAccentCategory: MUST be one of "SOUTHERN_SAIGON", "NORTHERN_HANOI", "MIXED_OR_NEUTRAL", "UNKNOWN".
  * Distinguish Northern vs Southern phonology strictly:
    - Northern/Hanoi characteristics: sharp broken thanh ngã (glottal creak [ˀ]), merged tr/ch -> [tɕ], r/gi/d -> [z], s/x -> [s], final -n/-ng [-n/-ŋ], closed vowels.
    - Southern/Saigon characteristics: merged thanh hỏi & thanh ngã (low-dipping rising contour [214]), r -> [ʐ/ɾ], d/gi/v -> [j], final -n -> [-ŋ] after front/back vowels in colloquial rhythm, open relaxed Southern vowels, rising melodic Saigon cadence.
- phoneticScores: integer/number scores 1..10 for:
  * saigonIntonation (Ngữ điệu Sài Gòn)
  * voiceTimbre (Âm sắc giọng)
  * vowelRealization (Phát âm nguyên âm)
  * finalConsonants (Phụ âm cuối)
  * sentenceRhythm (Nhịp điệu câu)
  * toneMarking (Cách nhấn thanh điệu hỏi/ngã/huyền/nặng)
  * naturalness (Độ tự nhiên, không máy móc)
  * clarity (Độ rõ ràng, không mất chữ)
- observedMarkers: list of specific phonetic traits actually heard in the audio (in Vietnamese)
- northernLeaksDetected: list of any Northern/Hanoi accent traits heard (empty array ONLY if truly none heard)
- auditSummary: honest 1-2 sentence assessment in Vietnamese.
`;

  let response: any;
  try {
    response = await aiStd.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          { inlineData: { mimeType: 'audio/wav', data: wavBase64 } },
          { text: auditPrompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (err?.status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('503')) {
      response = await aiStd.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: {
          parts: [
            { inlineData: { mimeType: 'audio/wav', data: wavBase64 } },
            { text: auditPrompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
        },
      });
    } else {
      throw err;
    }
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch {
    parsed = {};
  }

  return {
    voiceId,
    modelUsed,
    testScript,
    wavMetrics,
    sampleSavedPath,
    samplePublicUrl,
    detectedAccentCategory:
      parsed.detectedAccentCategory === 'SOUTHERN_SAIGON' ||
      parsed.detectedAccentCategory === 'NORTHERN_HANOI' ||
      parsed.detectedAccentCategory === 'MIXED_OR_NEUTRAL'
        ? parsed.detectedAccentCategory
        : 'UNKNOWN',
    phoneticScores: {
      saigonIntonation: Number(parsed?.phoneticScores?.saigonIntonation || 0),
      voiceTimbre: Number(parsed?.phoneticScores?.voiceTimbre || 0),
      vowelRealization: Number(parsed?.phoneticScores?.vowelRealization || 0),
      finalConsonants: Number(parsed?.phoneticScores?.finalConsonants || 0),
      sentenceRhythm: Number(parsed?.phoneticScores?.sentenceRhythm || 0),
      toneMarking: Number(parsed?.phoneticScores?.toneMarking || 0),
      naturalness: Number(parsed?.phoneticScores?.naturalness || 0),
      clarity: Number(parsed?.phoneticScores?.clarity || 0),
    },
    observedMarkers: Array.isArray(parsed.observedMarkers) ? parsed.observedMarkers : [],
    northernLeaksDetected: Array.isArray(parsed.northernLeaksDetected) ? parsed.northernLeaksDetected : [],
    auditSummary:
      typeof parsed.auditSummary === 'string' && parsed.auditSummary.trim()
        ? parsed.auditSummary.trim()
        : 'Đã thu thập tệp WAV thực tế. Vui lòng nghe trực tiếp mẫu âm thanh để xác nhận chuẩn chất giọng Sài Gòn.',
    humanListeningRequired: true,
    humanListeningInstruction:
      'Chỉ công nhận "Giọng Sài Gòn chuẩn" sau khi đã bấm Nghe Thử tệp âm thanh WAV thực tế và xác nhận không còn âm sắc/ngữ điệu miền Bắc.',
  };
}

export function saveSampleWavFile(voiceId: string, modelName: string, wavBuffer: Buffer): {
  filePath: string;
  publicUrl: string;
} {
  fs.mkdirSync(TTS_SAMPLES_DIR, { recursive: true });
  const safeVoice = voiceId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeModel = modelName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `sample_${safeVoice}_${safeModel}.wav`;
  const filePath = path.join(TTS_SAMPLES_DIR, fileName);
  fs.writeFileSync(filePath, wavBuffer);
  return {
    filePath,
    publicUrl: `/samples/tts/${fileName}`,
  };
}

export async function synthesizeGeminiTtsStrict(params: {
  aiBeta: GoogleGenAI;
  text: string;
  requestedVoiceId?: string;
  languageHint?: 'vi' | 'en';
  ttsModelOverride?: string;
  cacheMap: Map<string, { audioBase64: string; provenance: TtsAudioProvenance }>;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<{
  audioBase64: string;
  wavBuffer: Buffer;
  metrics: WavAudioMetrics;
  provenance: TtsAudioProvenance;
}> {
  const {
    aiBeta,
    text,
    requestedVoiceId,
    languageHint,
    ttsModelOverride,
    cacheMap,
    timeoutMs = 45000,
    maxRetries = 3,
  } = params;

  const resolved = resolveVoiceConfiguration(requestedVoiceId, languageHint);
  // Use flagship Voice Design model (gemini-3.8-flash-tts) for Vietnamese so Southern Saigon phonetic persona cues are strictly adhered to;
  // allow English or explicit override to use lite model if desired.
  const ttsModel =
    ttsModelOverride === VOICE_DESIGN_TTS_MODEL || ttsModelOverride === PRIMARY_TTS_LITE_MODEL
      ? ttsModelOverride
      : resolved.isEnglish
      ? PRIMARY_TTS_LITE_MODEL
      : VOICE_DESIGN_TTS_MODEL;

  const cacheKey = buildTtsCacheKey({
    voiceId: resolved.voiceId,
    language: resolved.language,
    accent: resolved.accent,
    voiceConfigVersion: SAIGON_VOICE_POLICY.VOICE_CONFIG_VERSION,
    ttsModelVersion: ttsModel,
    scriptText: text,
  });

  // Strict provenance-verified cache lookup
  const cachedEntry = cacheMap.get(cacheKey);
  if (
    cachedEntry &&
    cachedEntry.audioBase64.length > 100 &&
    cachedEntry.provenance.voiceId === resolved.voiceId &&
    cachedEntry.provenance.language === resolved.language &&
    cachedEntry.provenance.voiceConfigVersion === SAIGON_VOICE_POLICY.VOICE_CONFIG_VERSION &&
    cachedEntry.provenance.ttsModelVersion === ttsModel
  ) {
    const wavBuffer = ensureWavBuffer(Buffer.from(cachedEntry.audioBase64, 'base64'));
    const metrics = inspectWavAudioMetrics(wavBuffer);
    if (!metrics.isSilent && metrics.isValidRiffWav) {
      return {
        audioBase64: wavBuffer.toString('base64'),
        wavBuffer,
        metrics,
        provenance: {
          ...cachedEntry.provenance,
          cacheHit: true,
        },
      };
    }
    cacheMap.delete(cacheKey);
  }

  let lastError: any = null;
  let delayMs = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.info(
        `[SAIGON-TTS] Model=${ttsModel} | Voice=${resolved.voiceId} (${resolved.geminiVoiceName}) | Lang=${resolved.language} | Policy=${SAIGON_VOICE_POLICY.ACCENT_POLICY} | Attempt=${attempt}/${maxRetries}`
      );

      // Build explicit audio request with strict Southern Saigon persona metadata for Vietnamese.
      // Retries MUST keep the EXACT same verified voice & accent — zero fallback to Northern/OS voices!
      const response: any = await Promise.race([
        aiBeta.models.generateContent({
          model: ttsModel,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text,
                  speechMetadata: {
                    style: resolved.speechStylePrompt,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: resolved.geminiVoiceName },
              },
            },
          },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TTS_TIMEOUT')), timeoutMs)),
      ]);

      const parts = response?.candidates?.[0]?.content?.parts || [];
      const audioPart = parts.find((p: any) => p?.inlineData?.data && p.inlineData.data.length > 100);
      const rawData = audioPart?.inlineData?.data;

      if (!rawData || typeof rawData !== 'string') {
        throw new Error('EMPTY_AUDIO_RESPONSE');
      }

      const rawBuf = Buffer.from(rawData, 'base64');
      const wavBuffer = ensureWavBuffer(rawBuf, 24000);
      const metrics = inspectWavAudioMetrics(wavBuffer);

      if (!metrics.isValidRiffWav || metrics.isSilent) {
        throw new Error(`SILENT_OR_CORRUPT_WAV (peak=${metrics.peakAmplitude}, rmsDb=${metrics.rmsDb})`);
      }

      const finalBase64 = wavBuffer.toString('base64');
      const provenance: TtsAudioProvenance = {
        voiceId: resolved.voiceId,
        geminiVoiceName: resolved.geminiVoiceName,
        language: resolved.language,
        accent: resolved.accent,
        regionalVariant: resolved.regionalVariant,
        accentPolicy: resolved.isEnglish ? 'ENGLISH_STANDARD' : SAIGON_VOICE_POLICY.ACCENT_POLICY,
        voiceConfigVersion: SAIGON_VOICE_POLICY.VOICE_CONFIG_VERSION,
        ttsModelVersion: ttsModel,
        scriptHash: computeDeterministicScriptHash(text),
        cacheKey,
        cacheHit: false,
        synthesizedAt: Date.now(),
        durationSec: metrics.durationSec,
        rmsDb: metrics.rmsDb,
        isSilent: metrics.isSilent,
      };

      cacheMap.set(cacheKey, { audioBase64: finalBase64, provenance });
      return { audioBase64: finalBase64, wavBuffer, metrics, provenance };
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || err);
      console.error(`[SAIGON-TTS-ERR] Voice=${resolved.voiceId} Attempt=${attempt}:`, errMsg);

      const isQuota =
        err?.status === 429 ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.toLowerCase().includes('quota');
      if (isQuota) {
        break; // Do not hammer quota-exhausted API
      }

      if (attempt < maxRetries) {
        const retryMatch = errMsg.match(/Please retry in (\d+(?:\.\d+)?)s/i);
        const waitMs = retryMatch ? Math.min(4000, Math.ceil(parseFloat(retryMatch[1])) * 1000 + 300) : delayMs;
        await new Promise((r) => setTimeout(r, waitMs));
        delayMs = Math.min(delayMs * 1.8, 3500);
      }
    }
  }

  const msg = String(lastError?.message || lastError || 'Unknown TTS error');
  const isQuota =
    lastError?.status === 429 || msg.includes('RESOURCE_EXHAUSTED') || msg.toLowerCase().includes('quota');
  const isTimeout = msg.includes('TTS_TIMEOUT');

  const wrapped: any = new Error(
    isQuota
      ? 'Hạn ngạch (Quota) Gemini TTS tạm thời đã hết. Hệ thống từ chối chuyển sang giọng miền Bắc hay giọng trình duyệt; vui lòng chờ rồi bấm Thử lại.'
      : isTimeout
      ? 'Quá thời gian phản hồi từ Gemini TTS. Hệ thống giữ nguyên chuẩn giọng Sài Gòn (không dùng giọng dự phòng miền Bắc), vui lòng bấm Thử lại.'
      : `Không thể tạo giọng đọc Sài Gòn (${resolved.voiceId}) từ Gemini TTS: ${msg}`
  );
  wrapped.httpStatus = isQuota ? 429 : isTimeout ? 504 : 503;
  wrapped.code = isQuota ? 'TTS_QUOTA_EXCEEDED' : isTimeout ? 'TTS_TIMEOUT' : 'TTS_UNAVAILABLE';
  wrapped.retryable = true;
  throw wrapped;
}

export { SAIGON_SAMPLE_SCRIPT };
