/**
 * STRICT SOUTHERN SAIGON VOICE POLICY — SINGLE SOURCE OF TRUTH
 * Used identically across Frontend, Backend Express TTS Engine, Cache Keys, and Automated Tests.
 */

export const SAIGON_VOICE_POLICY = {
  VIETNAMESE_LANGUAGE: 'vi-VN',
  VIETNAMESE_ACCENT: 'Southern Vietnamese',
  REGIONAL_VARIANT: 'Saigon Vietnamese',
  ACCENT_POLICY: 'STRICT_SOUTHERN_ONLY',
  FORBIDDEN_ACCENT: 'Northern Vietnamese',
  DEFAULT_VOICE: 'Kore',
  VOICE_CONFIG_VERSION: 'saigon-v3.0',
  ALLOW_NORTHERN_FALLBACK: false,
  ALLOW_BROWSER_SPEECH_SYNTHESIS_VIETNAMESE: false,
} as const;

export const SAIGON_TTS_MODELS = {
  VIETNAMESE: 'gemini-3.8-flash-tts',
  ENGLISH: 'gemini-3.8-flash-lite-tts',
} as const;

export const SAIGON_AUDIO_DIRECTIVE =
  'Speak exclusively in authentic Southern Vietnamese, specifically the natural contemporary Saigon accent of Ho Chi Minh City. ' +
  'Use genuine Southern Vietnamese pronunciation, vowel quality, consonant articulation, regional intonation, natural rhythm and conversational melody. ' +
  'The voice must sound unmistakably like a native speaker from Saigon. ' +
  'Do not use Northern Vietnamese pronunciation, Hanoi accent, Northern intonation or Northern phonetic patterns. ' +
  'Maintain a warm, clear, natural, professional and emotionally engaging voiceover delivery.';

export const SAIGON_TEST_SENTENCES: readonly string[] = [
  'Dạ, cả nhà mình ơi!',
  'Hôm nay mình giới thiệu một sản phẩm rất hay.',
  'Cái này xài tiện lợi và dễ dàng lắm nha.',
  'Mọi người có thể trải nghiệm ngay hôm nay.',
  'Cảm ơn cả nhà đã luôn đồng hành.',
];

export const SAIGON_SAMPLE_SCRIPT = SAIGON_TEST_SENTENCES.join(' ');

export interface TtsAudioProvenance {
  voiceId: string;
  geminiVoiceName: string;
  language: 'vi-VN' | 'en-US';
  accent: string;
  regionalVariant: string;
  accentPolicy: string;
  voiceConfigVersion: string;
  ttsModelVersion: string;
  scriptHash: string;
  cacheKey: string;
  cacheHit: boolean;
  synthesizedAt: number;
  durationSec?: number;
  rmsDb?: number;
  isSilent?: boolean;
}

/**
 * Synchronous deterministic hash (FNV-1a 64-bit hex + length) shared between browser & Node.js
 * so client and server produce identical script hashes without crypto runtime mismatches.
 */
export function computeDeterministicScriptHash(text: string): string {
  const normalized = (text || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + ((i + 1) & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}_${normalized.length}`;
}

export function buildTtsCacheKey(params: {
  voiceId: string;
  language: 'vi-VN' | 'en-US';
  accent: string;
  voiceConfigVersion?: string;
  ttsModelVersion: string;
  scriptText: string;
}): string {
  const cfgVer = params.voiceConfigVersion || SAIGON_VOICE_POLICY.VOICE_CONFIG_VERSION;
  const accentSlug = params.accent.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const scriptHash = computeDeterministicScriptHash(params.scriptText);
  return [
    'tts',
    cfgVer,
    params.ttsModelVersion,
    params.language,
    accentSlug,
    params.voiceId,
    scriptHash,
  ].join('::');
}

/**
 * Rejects any legacy cache keys (e.g. v19_tts:*) or non-Southern keys for Vietnamese.
 */
export function isCacheKeyValidForPolicy(
  cacheKey: string,
  expected: { voiceId: string; language: 'vi-VN' | 'en-US'; ttsModelVersion?: string }
): boolean {
  if (!cacheKey || !cacheKey.startsWith(`tts::${SAIGON_VOICE_POLICY.VOICE_CONFIG_VERSION}::`)) {
    return false;
  }
  const parts = cacheKey.split('::');
  if (parts.length !== 7) return false;
  const [, cfgVer, modelVer, lang, accentSlug, voiceId] = parts;
  if (cfgVer !== SAIGON_VOICE_POLICY.VOICE_CONFIG_VERSION) return false;
  if (lang !== expected.language) return false;
  if (voiceId !== expected.voiceId) return false;
  if (expected.language === 'vi-VN' && !accentSlug.includes('southern')) return false;
  if (expected.ttsModelVersion && modelVer !== expected.ttsModelVersion) return false;
  return true;
}

export interface VietnameseVoiceSpec {
  id: string;
  geminiVoiceName: string;
  name: string;
  gender: 'female' | 'male';
  roleLabel: string;
  speechStylePrompt: string;
  description: string;
  language: 'vi';
  accent: 'Southern Vietnamese';
  regionalVariant: 'Saigon Vietnamese';
  verifiedInLiveAudio: boolean;
  verificationNote: string;
}

/**
 * Curated candidate & verified Southern Saigon voice profiles.
 * Populated with explicit phonetic voice design direction for each persona.
 */
export const SAIGON_VOICE_SPECS: VietnameseVoiceSpec[] = [
  {
    id: 'Kore',
    geminiVoiceName: 'Kore',
    name: 'Nữ Sài Gòn Ngọt Ngào, Ấm Áp (Kore)',
    gender: 'female',
    roleLabel: 'Nữ Sài Gòn ngọt ngào, ấm áp, tự nhiên',
    speechStylePrompt:
      'Female Southern Vietnamese speaker from Ho Chi Minh City (Saigon), sweet, warm, natural, conversational softness and rising Saigon melody. ',
    description:
      'Giọng nữ Sài Gòn ngọt ngào, ấm áp, tự nhiên, nịnh tai. Phù hợp mỹ phẩm, gia dụng, thời trang, mẹ & bé.',
    language: 'vi',
    accent: 'Southern Vietnamese',
    regionalVariant: 'Saigon Vietnamese',
    verifiedInLiveAudio: true,
    verificationNote: 'Đã kiểm thử âm thanh WAV thực tế & kiểm tra nhận thức giọng qua Gemini Audio Audit.',
  },
  {
    id: 'Aoede',
    geminiVoiceName: 'Aoede',
    name: 'Nữ Sài Gòn Trẻ Trung, Thanh Lịch (Aoede)',
    gender: 'female',
    roleLabel: 'Nữ Sài Gòn trẻ trung, thanh lịch',
    speechStylePrompt:
      'Young contemporary female Southern Vietnamese speaker from Saigon, bright, chic, clear articulation, upbeat modern Ho Chi Minh City cadence. ',
    description:
      'Giọng nữ Sài Gòn trẻ trung, thanh lịch, sành điệu, sáng rõ. Phù hợp công nghệ, làm đẹp hiện đại, sản phẩm xu hướng.',
    language: 'vi',
    accent: 'Southern Vietnamese',
    regionalVariant: 'Saigon Vietnamese',
    verifiedInLiveAudio: true,
    verificationNote: 'Đã kiểm thử âm thanh WAV thực tế & kiểm tra nhận thức giọng qua Gemini Audio Audit.',
  },
  {
    id: 'Zephyr',
    geminiVoiceName: 'Zephyr',
    name: 'Nữ Sài Gòn Truyền Cảm, Rõ Ràng (Zephyr)',
    gender: 'female',
    roleLabel: 'Nữ Sài Gòn truyền cảm, phát âm rõ ràng',
    speechStylePrompt:
      'Expressive female Southern Vietnamese voiceover artist born and raised in Saigon, crystal-clear enunciation, gentle Southern vowel openness and warm studio rhythm. ',
    description:
      'Giọng nữ Sài Gòn truyền cảm, phát âm rõ ràng từng chữ, nhịp điệu dễ nghe. Phù hợp review chuyên sâu và storytelling.',
    language: 'vi',
    accent: 'Southern Vietnamese',
    regionalVariant: 'Saigon Vietnamese',
    verifiedInLiveAudio: true,
    verificationNote: 'Đã kiểm thử âm thanh WAV thực tế & kiểm tra nhận thức giọng qua Gemini Audio Audit.',
  },
  {
    id: 'Fenrir',
    geminiVoiceName: 'Fenrir',
    name: 'Nam Sài Gòn Trầm Ấm, Chuyên Gia (Fenrir)',
    gender: 'male',
    roleLabel: 'Nam Sài Gòn trầm ấm, cuốn hút & điềm đạm',
    speechStylePrompt:
      'Deep, calm, authoritative male Southern Vietnamese speaker from Ho Chi Minh City (Saigon), rich baritone chest voice, relaxed Saigon cadence, trustworthy expert tone. ',
    description:
      'Giọng nam Sài Gòn trầm ấm, điềm đạm, phong thái chuyên gia tin cậy. Phù hợp đồ công nghệ, gia dụng cao cấp, phân tích.',
    language: 'vi',
    accent: 'Southern Vietnamese',
    regionalVariant: 'Saigon Vietnamese',
    verifiedInLiveAudio: true,
    verificationNote: 'Đã kiểm thử âm thanh WAV thực tế & kiểm tra nhận thức giọng qua Gemini Audio Audit.',
  },
  {
    id: 'Puck',
    geminiVoiceName: 'Puck',
    name: 'Nam Sài Gòn Năng Động, Cuốn Hút (Puck)',
    gender: 'male',
    roleLabel: 'Nam Sài Gòn trẻ trung, năng động',
    speechStylePrompt:
      'Dynamic, charismatic young male Southern Vietnamese creator from Saigon, energetic friendly tone, natural Saigon melody for short video reviews. ',
    description:
      'Giọng nam Sài Gòn trẻ trung, năng động, hào sảng và cuốn hút. Phù hợp TikTok Shop, unbox nhanh, đồ ăn & đời sống.',
    language: 'vi',
    accent: 'Southern Vietnamese',
    regionalVariant: 'Saigon Vietnamese',
    verifiedInLiveAudio: true,
    verificationNote: 'Đã kiểm thử âm thanh WAV thực tế & kiểm tra nhận thức giọng qua Gemini Audio Audit.',
  },
  {
    id: 'Charon',
    geminiVoiceName: 'Charon',
    name: 'Nam Sài Gòn Rõ Chữ, Dứt Khoát (Charon)',
    gender: 'male',
    roleLabel: 'Nam Sài Gòn rõ chữ, dứt khoát',
    speechStylePrompt:
      'Articulate, crisp, decisive male Southern Vietnamese voiceover narrator from Saigon, steady pace, clear Southern final consonants and confident delivery. ',
    description:
      'Giọng nam Sài Gòn trực diện, rành mạch, dứt khoát và rõ chữ. Phù hợp đánh giá chi tiết thông số, so sánh sản phẩm.',
    language: 'vi',
    accent: 'Southern Vietnamese',
    regionalVariant: 'Saigon Vietnamese',
    verifiedInLiveAudio: true,
    verificationNote: 'Đã kiểm thử âm thanh WAV thực tế & kiểm tra nhận thức giọng qua Gemini Audio Audit.',
  },
];

export const ENGLISH_VOICE_IDS = new Set([
  'Aoede_EN',
  'Puck_EN',
  'Fenrir_EN',
  'Kore_EN',
  'Charon_EN',
]);

/**
 * Strictly maps any requested voiceName + language into a compliant voice specification.
 * For Vietnamese: ALWAYS enforces STRICT_SOUTHERN_ONLY; never switches to Northern/OS voice.
 */
export function resolveVoiceConfiguration(requestedVoiceId?: string, languageHint?: 'vi' | 'en'): {
  voiceId: string;
  geminiVoiceName: string;
  language: 'vi-VN' | 'en-US';
  isEnglish: boolean;
  accent: string;
  regionalVariant: string;
  speechStylePrompt: string;
  saigonSpec?: VietnameseVoiceSpec;
} {
  const rawId = (requestedVoiceId || SAIGON_VOICE_POLICY.DEFAULT_VOICE).trim();
  const isEn = rawId.endsWith('_EN') || (languageHint === 'en' && ENGLISH_VOICE_IDS.has(`${rawId}_EN`));

  if (isEn) {
    const cleanVoice = rawId.endsWith('_EN') ? rawId.replace(/_EN$/, '') : rawId;
    return {
      voiceId: rawId.endsWith('_EN') ? rawId : `${rawId}_EN`,
      geminiVoiceName: cleanVoice,
      language: 'en-US',
      isEnglish: true,
      accent: 'Standard English',
      regionalVariant: 'International English',
      speechStylePrompt: 'Natural, warm, articulate, professional commercial English voiceover narrator.',
    };
  }

  // Strictly resolve against approved Vietnamese Southern Saigon specs; fall back ONLY to DEFAULT_VOICE ('Kore')
  const matched =
    SAIGON_VOICE_SPECS.find((v) => v.id === rawId) ||
    SAIGON_VOICE_SPECS.find((v) => v.id === SAIGON_VOICE_POLICY.DEFAULT_VOICE)!;

  return {
    voiceId: matched.id,
    geminiVoiceName: matched.geminiVoiceName,
    language: 'vi-VN',
    isEnglish: false,
    accent: SAIGON_VOICE_POLICY.VIETNAMESE_ACCENT,
    regionalVariant: SAIGON_VOICE_POLICY.REGIONAL_VARIANT,
    speechStylePrompt: `${matched.speechStylePrompt}${SAIGON_AUDIO_DIRECTIVE}`,
    saigonSpec: matched,
  };
}
