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

/**
 * Verified compliant Southern Saigon TTS models supporting SAIGON_AUDIO_DIRECTIVE + approved prebuilt voices.
 */
export const SAIGON_COMPLIANT_TTS_MODELS: readonly string[] = [
  SAIGON_TTS_MODELS.VIETNAMESE,
  SAIGON_TTS_MODELS.ENGLISH,
];

function toUnicodeSpeechBoundaryRegex(rawPattern: RegExp): RegExp {
  let src = rawPattern.source;
  if (src.startsWith('^\\b')) {
    src = '^(?<![\\p{L}\\p{N}])' + src.slice(4);
  } else if (src.startsWith('\\b')) {
    src = '(?<![\\p{L}\\p{N}])' + src.slice(2);
  }
  if (src.endsWith('\\b$')) {
    src = src.slice(0, -4) + '(?![\\p{L}\\p{N}])$';
  } else if (src.endsWith('\\b')) {
    src = src.slice(0, -2) + '(?![\\p{L}\\p{N}])';
  }
  let flags = rawPattern.flags;
  if (!flags.includes('u')) flags += 'u';
  if (!flags.includes('g')) flags += 'g';
  if (!flags.includes('i')) flags += 'i';
  return new RegExp(src, flags);
}

function preserveSpeechCase(original: string, replacement: string): string {
  if (!original || !replacement) return replacement;
  if (original === original.toUpperCase() && original !== original.toLowerCase()) {
    return replacement.toUpperCase();
  }
  const firstChar = original.charAt(0);
  if (firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

const NORTH_TO_SOUTH_LEXICON_RAW: Array<[RegExp, string]> = [
  // 1. Đại từ xưng hô & Đối tượng
  [/\bchúng tôi\b/gi, 'tụi mình'],
  [/\bchúng mình\b/gi, 'tụi mình'],
  [/\bbọn mình\b/gi, 'tụi mình'],
  [/\bchúng ta\b/gi, 'tụi mình'],
  [/\bmọi người ơi\b/gi, 'cả nhà ơi'],
  [/\bmọi người nhé\b/gi, 'cả nhà nha'],
  [/\bmọi người nghen\b/gi, 'cả nhà nghen'],
  [/\bmọi người\b/gi, 'cả nhà'],
  [/\bcác bạn ơi\b/gi, 'mấy bạn ơi'],
  [/\bcác bạn nhé\b/gi, 'mấy bạn nha'],
  [/\bcác bạn\b/gi, 'mấy bạn'],
  [/\bcác bác ơi\b/gi, 'cả nhà ơi'],
  [/\bcác bác\b/gi, 'mấy bạn'],
  [/\bchị em ơi\b/gi, 'mấy chị ơi'],
  [/\banh em ơi\b/gi, 'mấy anh ơi'],
  [/\bbố mẹ\b/gi, 'ba má'],
  [/\bmẹ\b/gi, 'má'],

  // 2. Đuôi câu, Hư từ & Ngữ điệu Miền Bắc (ưu tiên cụm dài trước, dùng Unicode boundary chuẩn)
  [/\bnhé cả nhà\b/gi, 'nha cả nhà'],
  [/\bnhé mọi người\b/gi, 'nha cả nhà'],
  [/\bnhé các bạn\b/gi, 'nha mấy bạn'],
  [/\bnhé bạn\b/gi, 'nha bạn'],
  [/\bđâu nhé\b/gi, 'đâu nha'],
  [/\bđược nhé\b/gi, 'được nha'],
  [/\bnày nhé\b/gi, 'này nha'],
  [/\bnữa nhé\b/gi, 'nữa nha'],
  [/\bluôn nhé\b/gi, 'luôn nha'],
  [/\bnhé\b/gi, 'nha'],
  [/\bnhá cả nhà\b/gi, 'nha cả nhà'],
  [/\bnhá\b/gi, 'nha'],
  [/\bnhỉ cả nhà\b/gi, 'nha cả nhà'],
  [/\bnhỉ bạn\b/gi, 'nha bạn'],
  [/\bnhỉ\b/gi, 'nha'],
  [/\bđấy nhé\b/gi, 'đó nha'],
  [/\bđấy ạ\b/gi, 'đó nha'],
  [/\bđấy chứ\b/gi, 'đó chớ'],
  [/\bđấy\b/gi, 'đó'],
  [/\bthế này này\b/gi, 'như vầy nè'],
  [/\bthế này nhé\b/gi, 'như vầy nha'],
  [/\bthế này nha\b/gi, 'như vầy nha'],
  [/\bthế này nè\b/gi, 'như vầy nè'],
  [/\bthế này\b/gi, 'như vầy'],
  [/\bthế kia\b/gi, 'như vậy'],
  [/\bnhư thế\b/gi, 'như vậy'],
  [/\bthế nên\b/gi, 'cho nên'],
  [/\bthế là\b/gi, 'thành ra'],
  [/\bthế à\b/gi, 'vậy hả'],
  [/\bthế á\b/gi, 'vậy hả'],
  [/\bthế hả\b/gi, 'vậy nè'],
  [/\bthế nhé\b/gi, 'vậy nha'],
  [/\bthế nha\b/gi, 'vậy nha'],
  [/\bthế ạ\b/gi, 'vậy nha'],
  [/\bvậy nhé\b/gi, 'vậy nha'],
  [/\bsao thế\b/gi, 'sao vậy'],
  [/\bấy nhỉ\b/gi, 'đó nha'],
  [/\blắm luôn ấy\b/gi, 'lắm luôn á'],
  [/\blắm ấy\b/gi, 'lắm á'],
  [/\bvậy ấy\b/gi, 'vậy á'],
  [/\bkhi ấy\b/gi, 'khi đó'],
  [/\blúc ấy\b/gi, 'lúc đó'],
  [/\bhồi ấy\b/gi, 'hồi đó'],
  [/\bđúng rồi đấy\b/gi, 'đúng rồi đó nha'],
  [/\bchuẩn rồi đấy\b/gi, 'chuẩn rồi đó nha'],

  // 3. Từ ngữ phủ định, nghi vấn & câu hỏi
  [/\bchẳng\b/gi, 'hông'],
  [/\bchả\b/gi, 'hông'],
  [/\bkhông đấy\b/gi, 'hông đó'],
  [/\bkhông nhé\b/gi, 'hông nha'],
  [/\bkhông nhỉ\b/gi, 'hông nha'],
  [/\bđược không ạ\b/gi, 'được hông nè'],
  [/\bđược không\b/gi, 'được hông'],
  [/\bphải không ạ\b/gi, 'phải hông nè'],
  [/\bphải không\b/gi, 'phải hông'],
  [/\bđúng không ạ\b/gi, 'đúng hông nè'],
  [/\bđúng không nè\b/gi, 'đúng hông nè'],
  [/\bđúng không\b/gi, 'đúng hông'],
  [/\bcó đúng không\b/gi, 'đúng hông nè'],

  // 4. Kính ngữ & Thán từ
  [/\bvâng ạ\b/gi, 'dạ'],
  [/\bvâng\b/gi, 'dạ'],
  [/\bdạ ạ\b/gi, 'dạ'],
  [/\bcảm ơn ạ\b/gi, 'cảm ơn nha'],
  [/\bạ\b/gi, 'nha'],
  [/\brất là\b/gi, 'cực kỳ'],
  [/\bquá là\b/gi, 'quá chừng'],
  [/\bquá đi\b/gi, 'quá chừng'],
  [/\bquá trời luôn\b/gi, 'quá chừng luôn'],

  // 5. Động từ & Hành động đời sống (tránh phá từ ghép như "bảo hành", "đảm bảo", "tiêu dùng")
  [/\bnghìn\b/gi, 'ngàn'],
  [/\bxem thử\b/gi, 'coi thử'],
  [/\bxem clip\b/gi, 'coi clip'],
  [/\bxem video\b/gi, 'coi clip'],
  [/\bxem ngay\b/gi, 'coi ngay'],
  [/\bxem hết\b/gi, 'coi hết'],
  [/\bxem xong\b/gi, 'coi xong'],
  [/\bxem kỹ\b/gi, 'coi kỹ'],
  [/\bxem\b/gi, 'coi'],
  [/\bnhìn vào\b/gi, 'nhìn vô'],
  [/\bbước vào\b/gi, 'bước vô'],
  [/\bcho vào\b/gi, 'cho vô'],
  [/\bbỏ vào\b/gi, 'bỏ vô'],
  [/\bcất vào\b/gi, 'cất vô'],
  [/\bđi vào\b/gi, 'đi vô'],
  [/\bvào đâu\b/gi, 'vô đâu'],
  [/\bvào trong\b/gi, 'vô trong'],
  [/\bvào bếp\b/gi, 'vô bếp'],
  [/\bvào nhà\b/gi, 'vô nhà'],
  [/\bbảo là\b/gi, 'nói là'],
  [/\bsử dụng\b/gi, 'xài'],
  [/\bdùng thử\b/gi, 'xài thử'],
  [/\bnên dùng\b/gi, 'nên xài'],
  [/\bdễ dùng\b/gi, 'dễ xài'],
  [/\bhay dùng\b/gi, 'hay xài'],
  [/\bbị ngã\b/gi, 'bị té'],
  [/\bdễ ngã\b/gi, 'dễ té'],
  [/\bchuẩn chỉ\b/gi, 'chuẩn chỉnh'],

  // 6. Tính từ, Trạng từ & Nhận xét
  [/\bthật là\b/gi, 'thiệt là'],
  [/\bthật sự\b/gi, 'thiệt sự'],
  [/\bthật ra\b/gi, 'thiệt ra'],
  [/\bthật luôn\b/gi, 'thiệt luôn'],
  [/\bthật đấy\b/gi, 'thiệt đó nha'],
  [/\bthật nha\b/gi, 'thiệt nha'],
  [/\bthật tuyệt\b/gi, 'thiệt tuyệt'],
  [/\bthật tốt\b/gi, 'thiệt tốt'],
  [/\bmột tí\b/gi, 'chút xíu'],
  [/\bmột tẹo\b/gi, 'chút xíu'],
  [/\btẹo\b/gi, 'chút xíu'],
  [/\btí xíu\b/gi, 'chút xíu'],
  [/\bđắt đỏ\b/gi, 'mắc tiền'],
  [/\bđắt quá\b/gi, 'mắc quá'],
  [/\bđắt lắm\b/gi, 'mắc lắm'],
  [/\brẻ bèo\b/gi, 'rẻ rề'],

  // 7. Danh từ đời sống & Đồ vật (tránh từ đồng âm như "tất cả", "kết quả", "màn hình", "cái ô" đơn lẻ)
  [/\bngõ hẻm\b/gi, 'hẻm'],
  [/\bngõ\b/gi, 'hẻm'],
  [/\bcây ô\b/gi, 'cây dù'],
  [/\bô che\b/gi, 'dù che'],
  [/\bthìa\b/gi, 'muỗng'],
  [/\bbát ăn cơm\b/gi, 'chén ăn cơm'],
  [/\bbát đũa\b/gi, 'chén đũa'],
  [/\bbát ăn\b/gi, 'chén ăn'],
  [/\bcái bát\b/gi, 'cái chén'],
  [/\bbát\b/gi, 'chén'],
  [/\bquả táo\b/gi, 'trái táo'],
  [/\bhoa quả\b/gi, 'trái cây'],
  [/\bđôi tất\b/gi, 'đôi vớ'],
  [/\btất chân\b/gi, 'vớ chân'],
  [/\bđi tất\b/gi, 'mang vớ'],
  [/\bmang tất\b/gi, 'mang vớ'],
  [/\bchăn màn\b/gi, 'mền mùng'],
  [/\bđắp chăn\b/gi, 'đắp mền'],
  [/\bcái chăn\b/gi, 'cái mền'],
  [/\bchăn ga\b/gi, 'mền ga'],
  [/\bchăn ấm\b/gi, 'mền ấm'],
  [/\bmàn tuyn\b/gi, 'mùng'],
  [/\bbọc lót\b/gi, 'bọc đệm'],
];

const COMPILED_SAIGON_LEXICON: Array<[RegExp, string]> = NORTH_TO_SOUTH_LEXICON_RAW.map(
  ([pattern, replacement]) => [toUnicodeSpeechBoundaryRegex(pattern), replacement]
);

/**
 * Chuẩn hóa văn bản tiếng Việt sang từ vựng tự nhiên miền Nam / Sài Gòn bằng ranh giới Unicode chuẩn (`\p{L}\p{N}`),
 * tuyệt đối không làm hỏng từ có dấu thanh như "Hôm nay", "luôn", "bạn", "tạo", "kết quả", "tất cả", "màn hình".
 */
export function adaptVietnameseTextForSaigonSpeech(text: string, adaptSouthern: boolean = true): string {
  if (!text) return '';
  let clean = text
    .normalize('NFC')
    .replace(/[*#_~`•\-+]/g, ' ')
    .replace(/(\d+)\s*%/g, '$1 phần trăm')
    .replace(/(?<![\p{L}\p{N}])(\d+)\s*k(?![\p{L}\p{N}])/giu, '$1 ngàn')
    .replace(/(?<![\p{L}\p{N}])(\d+)\s*(đ|VND|đồng)(?![\p{L}\p{N}])/giu, '$1 đồng');

  if (adaptSouthern) {
    for (const [pattern, replacement] of COMPILED_SAIGON_LEXICON) {
      pattern.lastIndex = 0;
      clean = clean.replace(pattern, (match) => preserveSpeechCase(match, replacement));
      pattern.lastIndex = 0;
    }
  }

  return clean.replace(/\s+/g, ' ').trim();
}

