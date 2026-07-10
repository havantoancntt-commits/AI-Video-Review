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
}

export interface TTSVoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  description: string;
  style: string;
  language?: 'vi' | 'en';
}

export const TTS_VOICES: TTSVoiceOption[] = [
  // Vietnamese Voices
  { id: 'Kore', name: 'Nữ Sài Gòn Ngọt Ngào (Kore)', gender: 'female', description: 'Giọng đọc Nữ Sài Gòn truyền thống cực kỳ ngọt ngào, ấm áp, nịnh tai và giàu cảm xúc. Sức hút thôi miên thích hợp cho mỹ phẩm, gia dụng, thời trang, mẹ & bé.', style: 'Warm, Sweet Southern Female', language: 'vi' },
  { id: 'Aoede', name: 'Nữ Sài Gòn Thời Thượng (Aoede)', gender: 'female', description: 'Giọng đọc Nữ Sài Gòn trẻ trung, thanh lịch, sành điệu và tràn đầy năng lượng hân hoan. Phù hợp các sản phẩm xu hướng cao cấp, công nghệ và Gen Z.', style: 'Modern, Chic Southern Female', language: 'vi' },
  { id: 'Puck', name: 'Nam Sài Gòn Cuốn Hút (Puck)', gender: 'male', description: 'Giọng đọc Nam Sài Gòn năng động, hào sảng, cực kỳ lôi cuốn và giàu năng lượng điện ảnh. Thước đo vàng cho TikTok Shop, Reels triệu view, review sản phẩm.', style: 'Energetic, Viral Southern Male', language: 'vi' },
  { id: 'Fenrir', name: 'Nam Sài Gòn Trầm Ấm (Fenrir)', gender: 'male', description: 'Giọng đọc Nam Sài Gòn trầm dày, điềm đạm, sang trọng, toát lên phong thái chuyên gia và vị thế doanh nhân. Thuyết phục tuyệt đối cho các sản phẩm cao cấp.', style: 'Deep, Premium Southern Male', language: 'vi' },
  { id: 'Charon', name: 'Nam Sài Gòn Dõng Dạc (Charon)', gender: 'male', description: 'Giọng đọc Nam Sài Gòn trực diện, rành mạch, dứt khoát và rõ chữ. Hoàn hảo cho các bài phân tích sâu sắc, giới thiệu kỹ thuật hay đánh giá chuyên môn.', style: 'Direct, Authoritative Southern Male', language: 'vi' },

  // English Voices
  { id: 'Aoede_EN', name: 'Elite Elegant Female (Aoede - EN)', gender: 'female', description: 'Sophisticated, premium English female voice with a modern American/British accent. Perfect for luxury goods, tech, fashion, and lifestyle brands.', style: 'Elegant, Chic English Female', language: 'en' },
  { id: 'Puck_EN', name: 'Elite Dynamic Male (Puck - EN)', gender: 'male', description: 'Energetic, highly engaging, and passionate English male voice. Ideal for tech reviews, viral product videos, and direct selling.', style: 'Energetic, Premium English Male', language: 'en' },
  { id: 'Fenrir_EN', name: 'Elite Deep Male (Fenrir - EN)', gender: 'male', description: 'Deep, rich, and reassuring professional English male voice. Exudes authority, expertise, and corporate credibility.', style: 'Deep, Trustworthy English Male', language: 'en' },
  { id: 'Kore_EN', name: 'Elite Warm Female (Kore - EN)', gender: 'female', description: 'Warm, friendly, and narrative English female voice. Excellent for lifestyle, storytelling, cosmetics, and organic reviews.', style: 'Warm, Organic English Female', language: 'en' },
  { id: 'Charon_EN', name: 'Elite Direct Male (Charon - EN)', gender: 'male', description: 'Clear, concise, articulate, and business-focused English male voice. Excellent for analytical reviews and tech-specs presentation.', style: 'Clear, Authoritative English Male', language: 'en' }
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

export interface TrendingProduct {
  id: string;
  name: string;
  category: string;
  hotScore: number;
  viralFactor: string;
  purchaseCount: string;
  targetAudience: string;
  viralHook: string;
  shortDesc: string;
  suggestedTone: string;
  hashtags: string[];
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

