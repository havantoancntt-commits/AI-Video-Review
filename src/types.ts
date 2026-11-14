export interface ReviewReport {
  id: string;
  productName: string;
  category: string;
  rating: number;
  summary: string;
  pros: string[];
  cons: string[];
  detailedReview: string;
  marketingScript: string;
  ctaText: string;
  targetedAudience: string;
  createdAt?: string;
  videoMimeType?: string;
  videoSize?: number;
  videoUrl?: string;
  
  // Advanced Video Analysis Fields
  productFeatures?: string[];
  uniqueSellingPoints?: string[];
  videoHighlights?: string[];
  reviewSuggestions?: string[];
  scriptSuggestions?: string[];
  apiWarning?: string;

  // Production-grade Observational Accuracy Fields
  observedVisuals?: string[];
  userProvidedContext?: string[];
  unverifiedNotes?: string[];
  needsMoreData?: boolean;
  dataGapMessage?: string;
}

export interface TTSVoiceOption {
  id: string;
  name: string;
  geminiVoiceName: string;
  gender: 'male' | 'female' | 'neutral';
  description: string;
  style: string;
  language?: 'vi' | 'en';
  accent: 'Southern Vietnamese' | 'Standard English';
  regionalVariant: 'Saigon Vietnamese' | 'International English';
  verificationStatus: 'acoustic_audited_saigon' | 'english';
  sampleAudioUrl?: string;
}

export const TTS_VOICES: TTSVoiceOption[] = [
  // Vietnamese Southern Saigon Voices (STRICT_SOUTHERN_ONLY — tested with live WAV generation & acoustic dialect audit)
  {
    id: 'Kore',
    geminiVoiceName: 'Kore',
    name: 'Nữ Sài Gòn Ngọt Ngào, Ấm Áp (Kore)',
    gender: 'female',
    description: 'Giọng nữ Sài Gòn ngọt ngào, ấm áp, tự nhiên, nịnh tai. Phù hợp mỹ phẩm, gia dụng, thời trang, mẹ & bé.',
    style: 'Warm, Sweet Southern Saigon Female',
    language: 'vi',
    accent: 'Southern Vietnamese',
    regionalVariant: 'Saigon Vietnamese',
    verificationStatus: 'acoustic_audited_saigon',
    sampleAudioUrl: '/samples/tts/sample_Kore_gemini-3.8-flash-tts.wav',
  },
  {
    id: 'Aoede',
    geminiVoiceName: 'Aoede',
    name: 'Nữ Sài Gòn Trẻ Trung, Thanh Lịch (Aoede)',
    gender: 'female',
    description: 'Giọng nữ Sài Gòn trẻ trung, thanh lịch, sành điệu và sáng rõ. Phù hợp xu hướng cao cấp, công nghệ và Gen Z.',
    style: 'Modern, Chic Southern Saigon Female',
    language: 'vi',
    accent: 'Southern Vietnamese',
    regionalVariant: 'Saigon Vietnamese',
    verificationStatus: 'acoustic_audited_saigon',
    sampleAudioUrl: '/samples/tts/sample_Aoede_gemini-3.8-flash-tts.wav',
  },
  {
    id: 'Zephyr',
    geminiVoiceName: 'Zephyr',
    name: 'Nữ Sài Gòn Truyền Cảm, Rõ Ràng (Zephyr)',
    gender: 'female',
    description: 'Giọng nữ Sài Gòn truyền cảm, phát âm rõ ràng từng chữ, nhịp điệu tự nhiên. Phù hợp review chi tiết & storytelling.',
    style: 'Expressive, Clear Southern Saigon Female',
    language: 'vi',
    accent: 'Southern Vietnamese',
    regionalVariant: 'Saigon Vietnamese',
    verificationStatus: 'acoustic_audited_saigon',
    sampleAudioUrl: '/samples/tts/sample_Zephyr_gemini-3.8-flash-tts.wav',
  },
  {
    id: 'Fenrir',
    geminiVoiceName: 'Fenrir',
    name: 'Nam Sài Gòn Trầm Ấm, Chuyên Gia (Fenrir)',
    gender: 'male',
    description: 'Giọng nam Sài Gòn trầm ấm, điềm đạm, phong thái chuyên gia tin cậy. Phù hợp công nghệ, gia dụng cao cấp.',
    style: 'Deep, Authoritative Southern Saigon Male',
    language: 'vi',
    accent: 'Southern Vietnamese',
    regionalVariant: 'Saigon Vietnamese',
    verificationStatus: 'acoustic_audited_saigon',
    sampleAudioUrl: '/samples/tts/sample_Fenrir_gemini-3.8-flash-tts.wav',
  },
  {
    id: 'Puck',
    geminiVoiceName: 'Puck',
    name: 'Nam Sài Gòn Năng Động, Cuốn Hút (Puck)',
    gender: 'male',
    description: 'Giọng nam Sài Gòn trẻ trung, năng động, hào sảng và lôi cuốn. Phù hợp TikTok Shop, Reels và unbox nhanh.',
    style: 'Energetic, Viral Southern Saigon Male',
    language: 'vi',
    accent: 'Southern Vietnamese',
    regionalVariant: 'Saigon Vietnamese',
    verificationStatus: 'acoustic_audited_saigon',
    sampleAudioUrl: '/samples/tts/sample_Puck_gemini-3.8-flash-tts.wav',
  },
  {
    id: 'Charon',
    geminiVoiceName: 'Charon',
    name: 'Nam Sài Gòn Rõ Chữ, Dứt Khoát (Charon)',
    gender: 'male',
    description: 'Giọng nam Sài Gòn trực diện, rành mạch, dứt khoát và rõ chữ. Phù hợp phân tích thông số và đánh giá chuyên môn.',
    style: 'Direct, Articulate Southern Saigon Male',
    language: 'vi',
    accent: 'Southern Vietnamese',
    regionalVariant: 'Saigon Vietnamese',
    verificationStatus: 'acoustic_audited_saigon',
    sampleAudioUrl: '/samples/tts/sample_Charon_gemini-3.8-flash-tts.wav',
  },

  // English Voices (allowed strictly when user switches review language to English)
  { id: 'Aoede_EN', geminiVoiceName: 'Aoede', name: 'Elite Elegant Female (Aoede - EN)', gender: 'female', description: 'Sophisticated, premium English female voice. Ideal for luxury goods, tech, fashion, and lifestyle brands.', style: 'Elegant, Chic English Female', language: 'en', accent: 'Standard English', regionalVariant: 'International English', verificationStatus: 'english' },
  { id: 'Puck_EN', geminiVoiceName: 'Puck', name: 'Elite Dynamic Male (Puck - EN)', gender: 'male', description: 'Energetic, engaging English male voice. Ideal for tech reviews, viral product videos, and direct selling.', style: 'Energetic, Premium English Male', language: 'en', accent: 'Standard English', regionalVariant: 'International English', verificationStatus: 'english' },
  { id: 'Fenrir_EN', geminiVoiceName: 'Fenrir', name: 'Elite Deep Male (Fenrir - EN)', gender: 'male', description: 'Deep, rich, reassuring professional English male voice. Exudes authority and credibility.', style: 'Deep, Trustworthy English Male', language: 'en', accent: 'Standard English', regionalVariant: 'International English', verificationStatus: 'english' },
  { id: 'Kore_EN', geminiVoiceName: 'Kore', name: 'Elite Warm Female (Kore - EN)', gender: 'female', description: 'Warm, friendly narrative English female voice for lifestyle, storytelling, and organic reviews.', style: 'Warm, Organic English Female', language: 'en', accent: 'Standard English', regionalVariant: 'International English', verificationStatus: 'english' },
  { id: 'Charon_EN', geminiVoiceName: 'Charon', name: 'Elite Direct Male (Charon - EN)', gender: 'male', description: 'Clear, articulate English male voice for analytical reviews and tech-specs presentation.', style: 'Clear, Authoritative English Male', language: 'en', accent: 'Standard English', regionalVariant: 'International English', verificationStatus: 'english' }
];

export interface TTSRequest {
  text: string;
  voiceName: string;
}

export interface SavedReview {
  review: ReviewReport;
  audioUrl?: string; // Cache standard audio URL locally or base64
  audioBase64?: string;
}

export interface SuggestedProductResult {
  productName: string;
  category: string;
  productDesc: string;
  suggestedTone: string;
  keywords: string[];
  keyUSPs?: string[];
  verificationStatus: 'VERIFIED' | 'UNKNOWN' | 'NEED_MORE_INFORMATION';
  confidenceScore: number;
  directObservation: string[];
  ocrDetections: string[];
  aiInference: string[];
  unverifiedData: string[];
}

export interface TrendingProduct {
  id: string;
  name: string;
  category: string;
  targetAudience: string;
  viralHook: string;
  shortDesc: string;
  suggestedTone: string;
  hashtags: string[];
  marketInterestLevel: 'Cao' | 'Rất cao' | 'Đột biến';
  isMarketHypothesis: boolean;
  marketHypothesisNotice: string;
  estimationMethod: string;
  dataPeriod: string;
  verificationStatus: 'UNVERIFIED_HYPOTHESIS' | 'VERIFIED_METRIC';
  hotScore?: number;
  viralFactor?: string;
  purchaseCount?: string;
}

export interface ServiceHealthItem {
  status: 'CONNECTED' | 'DEGRADED' | 'UNAVAILABLE' | 'QUOTA_EXCEEDED' | 'MISCONFIGURED';
  latencyMs: number;
  model: string;
  error?: string;
}

export type ExportQualityTier = 'standard' | 'high' | 'premium';

export interface TikTokValidationReport {
  valid: boolean;
  container: string;
  videoCodec: string;
  audioCodec: string | null;
  hasAudio: boolean;
  pixelFormat: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  bitrateBps: number;
  fileSizeBytes: number;
  fastStart: boolean;
  audioVideoSyncDeltaSec: number | null;
  decodeIntegrityPassed: boolean;
  errors: string[];
}

export interface TranscodeJobStatus {
  jobId: string;
  status: 'queued' | 'uploading' | 'transcoding' | 'validating' | 'completed' | 'failed';
  progress: number;
  stageLabel: string;
  qualityTier: ExportQualityTier;
  validation?: TikTokValidationReport;
  downloadUrl?: string;
  fileName?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SystemStatusResponse {
  status: string;
  version: string;
  engine: string;
  geminiStatus: 'CONNECTED' | 'DEGRADED' | 'UNAVAILABLE' | 'QUOTA_EXCEEDED' | 'MISCONFIGURED';
  services: {
    text: ServiceHealthItem;
    vision: ServiceHealthItem;
    tts: ServiceHealthItem;
  };
  mediaCapabilities?: {
    ffmpegAvailable: boolean;
    ffprobeAvailable: boolean;
    ffmpegVersion?: string;
    encoders?: {
      h264: boolean;
      aac: boolean;
    };
  };
  defaultModel: string;
  ttsModel: string;
  latencyMs: number;
  testedAt: number;
  message: string;
}

export interface UploadedVideoSegment {
  id: string;
  file: File;
  name: string;
  size: number;
  url: string;
  duration: number;
  base64: string;
  mimeType: string;
}

export type SubtitleFontId = 'vietnam' | 'montserrat' | 'lexend' | 'jakarta' | 'mono';

export interface SubtitleFontOption {
  id: SubtitleFontId;
  name: string;
  badge: string;
  canvasFont: string;
  cssClass: string;
  description: string;
}

export const SUBTITLE_FONTS: SubtitleFontOption[] = [
  {
    id: 'vietnam',
    name: 'Be Vietnam Pro',
    badge: 'Chuẩn TV 100% 🇻🇳',
    canvasFont: '"Be Vietnam Pro", "Segoe UI", Roboto, sans-serif',
    cssClass: 'font-sub-vietnam',
    description: 'Bộ phông chuẩn quốc gia thiết kế tối ưu cho tiếng Việt, không bao giờ lỗi dấu.'
  },
  {
    id: 'montserrat',
    name: 'Montserrat',
    badge: 'TikTok Viral 🎬',
    canvasFont: '"Montserrat", "Be Vietnam Pro", "Segoe UI", sans-serif',
    cssClass: 'font-sub-montserrat',
    description: 'Phông chữ đậm nét, nổi tiếng nhất trên TikTok & CapCut hiện đại.'
  },
  {
    id: 'lexend',
    name: 'Lexend',
    badge: 'Siêu Nét ⚡',
    canvasFont: '"Lexend", "Be Vietnam Pro", "Segoe UI", sans-serif',
    cssClass: 'font-sub-lexend',
    description: 'Thiết kế khoa học giúp mắt đọc phụ đề nhanh hơn 20% trên điện thoại.'
  },
  {
    id: 'jakarta',
    name: 'Jakarta Sans',
    badge: 'Sang Trọng 💎',
    canvasFont: '"Plus Jakarta Sans", "Be Vietnam Pro", sans-serif',
    cssClass: 'font-sub-jakarta',
    description: 'Đường nét hiện đại, cao cấp cho các thương hiệu đẳng cấp.'
  },
  {
    id: 'mono',
    name: 'JetBrains Mono',
    badge: 'Cyberpunk 🤖',
    canvasFont: '"JetBrains Mono", "Courier New", monospace',
    cssClass: 'font-sub-mono',
    description: 'Phong cách công nghệ, hacker cá tính cho video review thiết bị số.'
  }
];

