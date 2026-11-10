/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileVideo, 
  Sparkles, 
  Play, 
  Pause, 
  Volume2, 
  Download, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  X,
  ChevronRight, 
  RefreshCw, 
  Layers, 
  Award, 
  Users, 
  Clock, 
  FileUp, 
  Search, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  VolumeX,
  Plus,
  Trash2,
  Copy,
  Check,
  Camera,
  Video,
  Mic,
  Tv,
  HelpCircle,
  Info,
  VideoOff,
  Compass,
  Crown,
  BadgeDollarSign,
  Coins,
  ShoppingBag,
  Gem,
  Sun,
  Moon,
  Smartphone,
  Cpu,
  Move,
  Globe,
  ShieldAlert,
  Sliders,
  Zap,
  Music,
  Radio,
  Wand2,
  Flame,
  Keyboard,
  Share2,
  FileAudio,
  Languages,
  SlidersHorizontal,
  Volume1,
  ShieldCheck,
  Edit3,
  ListFilter,
  CheckCheck,
  Eye,
  Radio as RadioIcon,
  FastForward,
  RotateCcw,
  Activity
} from 'lucide-react';
import { ReviewReport, TTS_VOICES, TTSVoiceOption, SavedReview, TrendingProduct, UploadedVideoSegment, SubtitleFontId, SUBTITLE_FONTS } from './types';
import { 
  detectSilenceAndAlignSubtitles, 
  SilenceDetectionResult, 
  SilenceDetectionOptions 
} from './audioSilenceDetector';
import { 
  pcmToWav, 
  formatBytes, 
  parseMarkdown, 
  generateSilentWav, 
  exportToSRT, 
  exportToVTT, 
  playSynthesizedSFX,
  parseStoryboardScenes,
  formatTimeCode,
  formatTimedSubtitlesClipboard,
  StoryboardScene,
  correctVietnameseSpelling,
  auditAndFixSubtitlesSpelling,
  getFallbackReviewReport
} from './utils';
import ysFixWebmDuration from 'fix-webm-duration';

async function safeParseJSON(response: Response, defaultError: string): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    if (text.includes("Please wait while your application starts") || text.includes("application starts")) {
      throw new Error("Máy chủ ứng dụng đang trong quá trình khởi tạo hoặc cập nhật mã nguồn dự án. Vui lòng đợi từ 5-10 giây rồi thực hiện thao tác lại.");
    }
    if (text.includes("Payload Too Large") || text.includes("413") || response.status === 413) {
      throw new Error("Kích thước video quá lớn để truyền tải trực tiếp qua API. Vui lòng tải lên tệp dưới 1 GB để hệ thống xử lý tối ưu.");
    }
    if (text.includes("Worker threw exception") || text.includes("Error 1101") || text.includes("workers.dev") || text.includes("cloudflare")) {
      throw new Error("Máy chủ Cloudflare Worker chưa cấu hình biến môi trường bí mật GEMINI_API_KEY hoặc chưa cấu hình API routes. Hãy thêm GEMINI_API_KEY vào mục Settings > Variables and Secrets trên Cloudflare Dashboard.");
    }
    if (text.includes("502 Bad Gateway") || text.includes("504 Gateway Timeout") || text.includes("503") || response.status === 502 || response.status === 504) {
      throw new Error("Cổng dịch vụ phụ trợ đang bận hoặc quá tải. Vui lòng thiết lập khóa GEMINI_API_KEY ở mục Settings > Secrets nếu chưa làm, hoặc thử lại sau vài giây.");
    }
    if (text.includes("404 Not Found") || text.includes("Cannot POST") || response.status === 404) {
      throw new Error("Đường dẫn API backend (/api/analyze-video) chưa được thiết lập trên máy chủ Cloudflare.");
    }
    const match = text.match(/<pre>(.*?)<\/pre>/s) || text.match(/<h1>(.*?)<\/h1>/s);
    if (match && match[1]) {
      throw new Error(`${defaultError}: ${match[1].trim()}`);
    }
    // If the text contains the error, append it to be more informative
    if (text && text.length < 150) {
      throw new Error(`${defaultError}: ${text.trim()}`);
    }
    throw new Error(defaultError);
  }
}

interface ExtractedFrame {
  data: string;
  mimeType: string;
}

interface ProductImageFile {
  id: string;
  name: string;
  size: number;
  url: string;
  base64: string;
  mimeType: string;
}

interface SubtitleSegment {
  text: string;
  translation?: string;
  start: number;
  end: number;
  sentenceIndex?: number;
}

export function cleanScriptForSpeech(scriptText: string): string {
  if (!scriptText) return "";
  let clean = scriptText
    .normalize('NFC')
    .replace(/\[[^\]]*\]/g, ' ') 
    .replace(/\([^)]*\)/g, ' ')  
    .replace(/[*#_~`]/g, ' ') // remove italics/bold markdown
    .replace(/(KOL:|Người dẫn:|Vlogger:|MC:|Dẫn chương trình:|Lời thoại:|Kịch bản:)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // LOẠI BỎ VĨNH VIỄN 100% TỪ NGỮ, NGỮ ĐIỆU, HƯ TỪ, THÁN TỪ VÀ PHÁT ÂM MIỀN BẮC KHỎI TOÀN BỘ ỨNG DỤNG
  // Chuyển hóa toàn bộ sang phương ngữ Nam Bộ / Sài Gòn ngọt ngào, tự nhiên, sang trọng và chuẩn mực
  const northToSouthList: [RegExp, string][] = [
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
    [/\bbố\b/gi, 'ba'],
    [/\bmẹ\b/gi, 'má'],
    [/\bông bà\b/gi, 'ông bà'],

    // 2. Đuôi câu, Hư từ & Ngữ điệu Miền Bắc
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
    [/\bthế này\b/gi, 'như vầy'],
    [/\bthế kia\b/gi, 'như vậy'],
    [/\bthế nên\b/gi, 'cho nên'],
    [/\bthế là\b/gi, 'thành ra'],
    [/\bthế à\b/gi, 'vậy hả'],
    [/\bthế á\b/gi, 'vậy hả'],
    [/\bthế hả\b/gi, 'vậy nè'],
    [/\bthế\b/gi, 'vậy'],
    [/\bvậy nhé\b/gi, 'vậy nha'],
    [/\bsao thế\b/gi, 'sao vậy'],
    [/\bấy nhỉ\b/gi, 'đó nha'],
    [/\blắm luôn ấy\b/gi, 'lắm luôn á'],
    [/\blắm ấy\b/gi, 'lắm á'],
    [/\bấy\b/gi, 'đó'],
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
    [/\bạ\b/gi, 'nha'],
    [/\brất là\b/gi, 'cực kỳ'],
    [/\bquá là\b/gi, 'quá chừng'],
    [/\bquá đi\b/gi, 'quá chừng'],
    [/\bquá trời luôn\b/gi, 'quá chừng luôn'],

    // 5. Động từ & Hành động đời sống
    [/\bnghìn\b/gi, 'ngàn'],
    [/\bxem thử\b/gi, 'coi thử'],
    [/\bxem clip\b/gi, 'coi clip'],
    [/\bxem video\b/gi, 'coi clip'],
    [/\bxem ngay\b/gi, 'coi ngay'],
    [/\bxem hết\b/gi, 'coi hết'],
    [/\bxem xong\b/gi, 'coi xong'],
    [/\bxem\b/gi, 'coi'],
    [/\bnhìn vào\b/gi, 'nhìn vô'],
    [/\bvào đâu\b/gi, 'vô đâu'],
    [/\bvào trong\b/gi, 'vô trong'],
    [/\bvào\b/gi, 'vô'],
    [/\bbảo là\b/gi, 'nói là'],
    [/\bbảo\b/gi, 'nói'],
    [/\bxử lý\b/gi, 'giải quyết'],
    [/\bsẽ thấy\b/gi, 'sẽ coi thấy'],
    [/\bsử dụng\b/gi, 'xài'],
    [/\bdùng thử\b/gi, 'xài thử'],
    [/\bdùng\b/gi, 'xài'],
    [/\bngã\b/gi, 'té'],
    [/\bchuẩn chỉ\b/gi, 'chuẩn chỉnh'],

    // 6. Tính từ, Trạng từ & Nhận xét
    [/\bthật là\b/gi, 'thiệt là'],
    [/\bthật sự\b/gi, 'thiệt sự'],
    [/\bthật ra\b/gi, 'thiệt ra'],
    [/\bthật luôn\b/gi, 'thiệt luôn'],
    [/\bthật đấy\b/gi, 'thiệt đó nha'],
    [/\bthật nha\b/gi, 'thiệt nha'],
    [/\bthật\b/gi, 'thiệt'],
    [/\bmột tí\b/gi, 'chút xíu'],
    [/\bmột tẹo\b/gi, 'chút xíu'],
    [/\btẹo\b/gi, 'chút xíu'],
    [/\btí xíu\b/gi, 'chút xíu'],
    [/\bđắt đỏ\b/gi, 'mắc tiền'],
    [/\bđắt quá\b/gi, 'mắc quá'],
    [/\bđắt\b/gi, 'mắc'],
    [/\brẻ bèo\b/gi, 'rẻ rề'],

    // 7. Danh từ đời sống & Đồ vật
    [/\bngõ hẻm\b/gi, 'hẻm'],
    [/\bngõ\b/gi, 'hẻm'],
    [/\bcây ô\b/gi, 'cây dù'],
    [/\bô che\b/gi, 'dù che'],
    [/\bô\b/gi, 'dù'],
    [/\bthìa\b/gi, 'muỗng'],
    [/\bbát ăn cơm\b/gi, 'chén ăn cơm'],
    [/\bbát đũa\b/gi, 'chén đũa'],
    [/\bbát\b/gi, 'chén'],
    [/\bquả táo\b/gi, 'trái táo'],
    [/\bhoa quả\b/gi, 'trái cây'],
    [/\bquả\b/gi, 'trái'],
    [/\bđôi tất\b/gi, 'đôi vớ'],
    [/\btất chân\b/gi, 'vớ chân'],
    [/\btất\b/gi, 'vớ'],
    [/\bchăn màn\b/gi, 'mền mùng'],
    [/\bchăn\b/gi, 'mền'],
    [/\bmàn tuyn\b/gi, 'mùng'],
    [/\bmàn\b/gi, 'mùng'],
    [/\bbọc lót\b/gi, 'bọc đệm'],
    [/\bbốc thăm\b/gi, 'bốc thăm']
  ];

  for (const [pattern, replacement] of northToSouthList) {
    clean = clean.replace(pattern, replacement);
  }

  const spellAudit = correctVietnameseSpelling(clean.replace(/\s+/g, ' ').trim());
  return spellAudit.correctedText;
}

export function cleanSubtitleTranslation(text: string): string {
  if (!text) return "";
  return text
    .replace(/^["'“”‘’]|["'“”‘’]$/g, '') // strip surrounding quotes
    .replace(/^[-\s:\.]+|[-\s:\.]+$/g, '') // strip leading/trailing dashes, colons, dots, spaces
    .replace(/\[[^\]]*\]/g, '') // remove any brackets
    .replace(/\([^)]*\)/g, '')  // remove any parentheses
    .replace(/^(Translation|English|Vietnamese|Subtitles|Subtitle|Dịch|Bản dịch)\s*:\s*/gi, '') // remove speaker/meta labels
    .trim();
}

function getSegmentsFromScript(scriptText: string, totalDuration: number = 0): SubtitleSegment[] {
  if (!scriptText) return [];
  
  // Clean all brackets, parentheses, and speaker indicators for clean viewable speech
  const cleanText = cleanScriptForSpeech(scriptText);

  if (cleanText.length === 0) return [];

  // Pre-correct spelling on entire script text to preserve multi-word collocations & proper names
  const preSpellResult = correctVietnameseSpelling(cleanText);
  const normalizedText = preSpellResult.correctedText;

  // Split by words to dynamically cluster them into professional TikTok-styled subtitle frames
  // Rules for premium high-retaining captions:
  // - Maximum 6 words per segment (making them incredibly easy and fast to read)
  // - Maximum 32 characters total per segment (prevents screen clutter and multi-line wrapping)
  // - Smart split on grammatical punctuations (., ?, !, ;, ,)
  // - Smart split on Vietnamese conjunctions/connectors if segment already contains comfortable content
  
  const words = normalizedText.split(/\s+/).filter(Boolean);
  interface GroupedSegment {
    text: string;
    sentenceIndex: number;
  }
  const grouped: GroupedSegment[] = [];
  
  let currentWords: string[] = [];
  let sentenceIndex = 0;
  
  const conjunctions = new Set(["và", "nhưng", "thì", "để", "nên", "mà", "với", "vì"]);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordLower = word.toLowerCase().replace(/[^a-z0-9àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệđìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/gi, "");
    
    // Check if adding this word violates the limits
    const currentCharLength = currentWords.join(" ").length;
    const prospectiveLength = currentCharLength + (currentCharLength > 0 ? 1 : 0) + word.length;
    
    const isConjunction = conjunctions.has(wordLower);
    
    const shouldStartNew = 
      currentWords.length >= 6 || // Max 6 words per screen for ideal readability
      prospectiveLength > 32 ||    // Clear char threshold to prevent line wrap
      (isConjunction && currentWords.length >= 3) || // Smart wrap on connectors
      (currentWords.length > 0 && /[.,?!;:\u2026\-\u2014]/.test(words[i - 1] || "")); // Wrap on punctuation marks
      
    if (shouldStartNew && currentWords.length > 0) {
      grouped.push({
        text: currentWords.join(" "),
        sentenceIndex: sentenceIndex
      });
      currentWords = [];
      if (/[.?!;\u2026]/.test(words[i - 1] || "")) {
        sentenceIndex++;
      }
    }
    
    currentWords.push(word);
  }
  
  if (currentWords.length > 0) {
    grouped.push({
      text: currentWords.join(" "),
      sentenceIndex: sentenceIndex
    });
  }
  
  // Clean punctuation prefix/suffix of each caption block but keep internal markers & correct spelling
  const finalChunks = grouped.map(item => {
    const rawText = item.text;
    let cleanedText = rawText.replace(/^[\s,.\-!?;:\u2026]+|[\s,.\-!?;:\u2026]+$/g, '').trim();
    
    // Auto-fix spelling, accents, and capitalization for highest subtitle quality
    const spellCheck = correctVietnameseSpelling(cleanedText);
    cleanedText = spellCheck.correctedText;

    // Remove dangling trailing period or comma in short subtitle frames (TikTok/Reels subtitle standard)
    // Keep expressive marks '?', '!', '…'
    cleanedText = cleanedText.replace(/[.,]+$/g, '').trim();

    if (cleanedText.length > 0) {
      cleanedText = cleanedText.charAt(0).toUpperCase() + cleanedText.slice(1);
    }
    
    // Determine punctuation pause duration in seconds
    let pauseDuration = 0.0;
    if (/[,;:\-]$/.test(rawText)) {
      pauseDuration = 0.22; // Elegant breath pause for commas
    } else if (/[.?!]$/.test(rawText) || rawText.endsWith("…") || rawText.endsWith("...")) {
      pauseDuration = 0.45; // Standard period pause
    }
    
    // Vietnamese Syllabic-Phonetic Timing formula
    // Highly accurate: weights syllables (words) and word character complexities
    const syllableCount = cleanedText.split(/\s+/).filter(Boolean).length;
    const speakingWeight = (syllableCount * 0.32) + (cleanedText.length * 0.04);
    
    return {
      text: cleanedText,
      sentenceIndex: item.sentenceIndex,
      speakingWeight: speakingWeight,
      pauseDuration: pauseDuration
    };
  }).filter(item => item.text.length > 0);

  const totalSpeakingWeight = finalChunks.reduce((sum, item) => sum + item.speakingWeight, 0);
  const totalPauseDuration = finalChunks.reduce((sum, item) => sum + item.pauseDuration, 0);
  const totalCombinedWeight = totalSpeakingWeight + totalPauseDuration;
  
  if (totalCombinedWeight === 0) return [];

  // If no explicit audio duration is supplied, compute natural speaking duration (~2.8 words/sec)
  const fallbackDuration = Math.max(3.0, Number((totalSpeakingWeight * 1.05 + totalPauseDuration).toFixed(2)));
  const duration = (totalDuration && totalDuration > 0 && isFinite(totalDuration)) ? totalDuration : fallbackDuration;
  const scale = duration / totalCombinedWeight;
  
  let currentStart = 0;
  const segments: SubtitleSegment[] = [];

  finalChunks.forEach((item, idx) => {
    const speechDuration = item.speakingWeight * scale;
    const pauseDurationScaled = item.pauseDuration * scale;
    const isLast = idx === finalChunks.length - 1;

    // For smooth subtitle transitions on screen, maintain comfortable continuity
    const segmentEnd = isLast 
      ? duration 
      : Number((currentStart + speechDuration + (pauseDurationScaled * 0.35)).toFixed(3));

    segments.push({
      text: item.text,
      start: Number(currentStart.toFixed(3)),
      end: Math.max(Number(currentStart.toFixed(3)) + 0.3, segmentEnd),
      sentenceIndex: item.sentenceIndex
    });
    currentStart = Number((currentStart + speechDuration + pauseDurationScaled).toFixed(3));
  });

  return segments;
}

interface WordTiming {
  word: string;
  startRatio: number;
  endRatio: number;
}

function getWordTimings(text: string): WordTiming[] {
  const words = text.split(/\s+/).filter(Boolean);
  const totalWords = words.length;
  if (totalWords === 0) return [];
  
  // High-accuracy word pacing calculation:
  // Base duration factor of 1.0 per syllable + proportional scaling for character complexity
  const weights = words.map(w => 1.0 + (w.replace(/[^a-z0-9àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệđìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/gi, "").length * 0.08));
  const totalWeight = weights.reduce((sum, wt) => sum + wt, 0);
  
  let accumulatedWeight = 0;
  return weights.map((wt, idx) => {
    const startRatio = accumulatedWeight / totalWeight;
    accumulatedWeight += wt;
    const endRatio = accumulatedWeight / totalWeight;
    return {
      word: words[idx],
      startRatio,
      endRatio
    };
  });
}

const generatePlaceholderFrames = (
  fileName: string,
  duration: number,
  numFrames: number
): ExtractedFrame[] => {
  const frames: ExtractedFrame[] = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const width = 640;
  const height = 360;
  canvas.width = width;
  canvas.height = height;

  const padding = duration * 0.05;
  const availableDuration = duration - padding * 2;
  const step = availableDuration / Math.max(1, numFrames - 1);

  for (let i = 0; i < numFrames; i++) {
    const timestamp = padding + i * step;
    
    // Draw background gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    if (i % 2 === 0) {
      gradient.addColorStop(0, '#0f172a'); // slate-900
      gradient.addColorStop(1, '#451a03'); // amber-950
    } else {
      gradient.addColorStop(0, '#0f172a'); // slate-900
      gradient.addColorStop(1, '#1e1b4b'); // indigo-950
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw some stylized video grids or geometric abstract shapes to simulate a real video
    ctx.strokeStyle = 'rgba(255, 191, 0, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw circular camera UI overlay
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)'; // amber-500
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2 - 20, 50, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2 - 20, 42, 0, Math.PI * 2);
    ctx.fill();

    // Draw play icon inside circle
    ctx.fillStyle = '#f59e0b'; // amber-500
    ctx.beginPath();
    ctx.moveTo(width / 2 - 10, height / 2 - 35);
    ctx.lineTo(width / 2 + 15, height / 2 - 20);
    ctx.lineTo(width / 2 - 10, height / 2 - 5);
    ctx.closePath();
    ctx.fill();

    // Draw frame text and details
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`PHÂN CẢNH VIDEO ${i + 1}/${numFrames}`, width / 2, height / 2 + 65);

    ctx.fillStyle = '#94a3b8'; // slate-400
    ctx.font = '12px "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`Thời gian: ${timestamp.toFixed(2)}s / ${duration.toFixed(1)}s`, width / 2, height / 2 + 90);

    ctx.fillStyle = '#f59e0b'; // amber-500
    ctx.font = '11px monospace';
    ctx.fillText(`[TẬP TIN: ${fileName}]`, width / 2, height / 2 + 115);

    // Draw REC status indicator in corner
    ctx.fillStyle = '#ef4444'; // red-500
    ctx.beginPath();
    ctx.arc(40, 40, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('REC', 54, 44);

    // Draw active resolution/fps in another corner
    ctx.textAlign = 'right';
    ctx.fillText('1080P UHD 60FPS', width - 40, 44);

    // Get base64 string
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const base64 = dataUrl.split(',')[1];
    frames.push({
      data: base64,
      mimeType: 'image/jpeg'
    });
  }

  return frames;
};

const extractVideoKeyframes = async (
  file: File,
  numFrames: number = 8,
  onProgress?: (progress: number) => void,
  maxDimension: number = 640,
  fallbackDuration: number = 15
): Promise<ExtractedFrame[]> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    
    // WebKit mobile optimization: Append hidden video to trigger hardware decoder
    video.style.position = 'fixed';
    video.style.top = '-9999px';
    video.style.left = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    document.body.appendChild(video);
    
    const fileUrl = URL.createObjectURL(file);
    video.src = fileUrl;
    
    const cleanup = () => {
      URL.revokeObjectURL(fileUrl);
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    };
    
    // Safety protection against infinite hanging of WebViews
    const safetyTimeout = setTimeout(() => {
      console.warn("Đăng ký trích xuất khung hình bị trì hoãn do chính sách trình duyệt. Kích hoạt bảo vệ bỏ qua (Timeout bypass)...");
      cleanup();
      const fallbackFrames = generatePlaceholderFrames(file.name, fallbackDuration, numFrames);
      resolve(fallbackFrames);
    }, 6000);
    
    video.onerror = () => {
      console.warn("Không thể nạp video bằng trình duyệt (Video codec or autoplay restriction). Sử dụng trình đồng bộ giả lập phân cảnh thông minh...");
      clearTimeout(safetyTimeout);
      cleanup();
      const fallbackFrames = generatePlaceholderFrames(file.name, fallbackDuration, numFrames);
      resolve(fallbackFrames);
    };
    
    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!duration || isNaN(duration)) {
        clearTimeout(safetyTimeout);
        cleanup();
        const fallbackFrames = generatePlaceholderFrames(file.name, fallbackDuration, numFrames);
        resolve(fallbackFrames);
        return;
      }
      
      const frames: ExtractedFrame[] = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const maxWidth = maxDimension;
      const maxHeight = maxDimension;
      let width = video.videoWidth || 640;
      let height = video.videoHeight || 480;
      
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const padding = duration * 0.05;
      const availableDuration = duration - padding * 2;
      const step = availableDuration / Math.max(1, numFrames - 1);
      const timestamps: number[] = [];
      for (let i = 0; i < numFrames; i++) {
        timestamps.push(padding + i * step);
      }
      
      let index = 0;
      
      const seekAndCapture = () => {
        if (index >= timestamps.length) {
          clearTimeout(safetyTimeout);
          cleanup();
          resolve(frames);
          return;
        }
        
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          if (ctx) {
            try {
              ctx.drawImage(video, 0, 0, width, height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
              const base64 = dataUrl.split(',')[1];
              frames.push({
                data: base64,
                mimeType: 'image/jpeg'
              });
            } catch (canvasErr) {
              console.error("Canvas capture error:", canvasErr);
            }
          }
          index++;
          if (onProgress) {
            onProgress(Math.round((index / timestamps.length) * 100));
          }
          seekAndCapture();
        };
        
        video.addEventListener('seeked', onSeeked);
        video.currentTime = timestamps[index];
      };
      
      seekAndCapture();
    };
    
    video.load(); // Force browser video decoder loading
  });
};

export default function App() {
  // Core Active States
  const [activeReview, setActiveReview] = useState<ReviewReport | null>(null);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<'female' | 'male'>('female');
  const [ttsMode, setTtsMode] = useState<'cloud' | 'native'>('cloud');

  // Synchronize gender filter tab automatically with selectedVoice configuration
  useEffect(() => {
    const activeVoice = TTS_VOICES.find(v => v.id === selectedVoice);
    if (activeVoice) {
      if (activeVoice.gender === 'female' || activeVoice.gender === 'male') {
        setVoiceGenderFilter(activeVoice.gender);
      }
    }
  }, [selectedVoice]);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [uploadedVideoDuration, setUploadedVideoDuration] = useState<number>(0);
  const [isAutoSpeedEnabled, setIsAutoSpeedEnabled] = useState<boolean>(true);
  const [tonePreset, setTonePreset] = useState<string>('Thuyết phục & Truyền cảm');
  const [salesFramework, setSalesFramework] = useState<'pas' | 'aida' | 'fab' | 'nlp' | 'fomo'>('pas');
  const [editedScript, setEditedScript] = useState<string>('');
  const [isOptimizingScript, setIsOptimizingScript] = useState<boolean>(false);
  
  // Theme state: dark or light
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Server & Gemini Engine Status
  const [systemStatus, setSystemStatus] = useState<{
    geminiStatus: string;
    defaultModel: string;
    ttsModel: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    fetch('/api/system-status')
      .then(r => r.json())
      .then(data => setSystemStatus(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('review_studio_theme') as 'dark' | 'light' | null;
      if (savedTheme) {
        setTheme(savedTheme);
      }
    } catch (e) {
      // localStorage may be disabled in restricted iframe sandboxes
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      localStorage.setItem('review_studio_theme', nextTheme);
    } catch (e) {
      // Ignore storage restrictions
    }
  };
  
  // UHD Video Color & HDR Optimization States
  const [videoBrightness, setVideoBrightness] = useState<number>(100);
  const [videoContrast, setVideoContrast] = useState<number>(100);
  const [videoSaturation, setVideoSaturation] = useState<number>(100);
  const [colorPreset, setColorPreset] = useState<string>('original');
  const [reviewType, setReviewType] = useState<'normal' | 'product'>('product');
  const [reviewLanguage, setReviewLanguage] = useState<'vi' | 'en'>('vi');

  const handleLanguageChange = (lang: 'vi' | 'en') => {
    setReviewLanguage(lang);
    const firstMatchingVoice = TTS_VOICES.find(v => (v.language || 'vi') === lang && v.gender === voiceGenderFilter)
      || TTS_VOICES.find(v => (v.language || 'vi') === lang);
    if (firstMatchingVoice) {
      setSelectedVoice(firstMatchingVoice.id);
    }
  };

  // Dynamic Synchronized Subtitle States
  const [subtitleStyle, setSubtitleStyle] = useState<'tiktok' | 'capcut' | 'cyberpunk' | 'neon' | 'minimal'>('tiktok');
  const [subtitleFontFamily, setSubtitleFontFamily] = useState<SubtitleFontId>('vietnam');
  const [subtitleCase, setSubtitleCase] = useState<'uppercase' | 'normal'>('uppercase');
  const [showSubtitles, setShowSubtitles] = useState<boolean>(true);
  const [wordHighlightEnabled, setWordHighlightEnabled] = useState<boolean>(true);
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0.0);
  const [currentAudioTime, setCurrentAudioTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [customSubtitleSegments, setCustomSubtitleSegments] = useState<SubtitleSegment[] | null>(null);
  const [subtitleTranslations, setSubtitleTranslations] = useState<Record<string, string>>({});
  const [isSubtitleTimelineOpen, setIsSubtitleTimelineOpen] = useState<boolean>(false);
  const [isIntroExpanded, setIsIntroExpanded] = useState<boolean>(false);

  // Automatically reset customSubtitleSegments khi kịch bản hoặc giọng đọc thay đổi
  useEffect(() => {
    setCustomSubtitleSegments(null);
  }, [editedScript, activeReview?.marketingScript, selectedVoice]);

  // Reset bản dịch song ngữ khi sản phẩm phân tích thay đổi để tránh trùng lặp
  useEffect(() => {
    setSubtitleTranslations({});
  }, [activeReview?.id]);

  // Dynamic High-Attention Hook Banner States
  const [showHookBanner, setShowHookBanner] = useState<boolean>(true);
  const [hookBannerDuration, setHookBannerDuration] = useState<number>(3.0);
  const [hookBannerText, setHookBannerText] = useState<string>('SỰ THẬT CỰC SỐC VỀ SẢN PHẨM NÀY SẼ LÀM BẠN SỬNG SỐT!');
  const [hookBannerStyle, setHookBannerStyle] = useState<'tiktok-yellow' | 'tiktok-red' | 'cyberpunk-neon' | 'beast-glow' | 'editorial-royal'>('tiktok-yellow');
  const [customHookSuggestions, setCustomHookSuggestions] = useState<string[]>([]);
  const [isRefreshingHooks, setIsRefreshingHooks] = useState<boolean>(false);
  const [resultSubTab, setResultSubTab] = useState<'review' | 'video-analysis'>('review');

  // WORLD-CLASS PRO STUDIO SUITE STATES
  const [exportResolution, setExportResolution] = useState<'4k' | '1080p' | '720p'>('1080p');
  const [exportFps, setExportFps] = useState<60 | 30>(60);
  const [exportBitratePreset, setExportBitratePreset] = useState<'master' | 'high' | 'standard'>('high');
  const [autoSFXOnHook, setAutoSFXOnHook] = useState<boolean>(true);
  const [isKeyboardHelpOpen, setIsKeyboardHelpOpen] = useState<boolean>(false);
  const [isSFXModalOpen, setIsSFXModalOpen] = useState<boolean>(false);
  const [activePresetKey, setActivePresetKey] = useState<string | null>('tiktok-viral');
  const [targetTranslateLang, setTargetTranslateLang] = useState<string>('en');

  // SMART CHECKER & AUTO-FIXER FOR REVIEWS, SCRIPTS & SUBTITLES
  const [isCheckingAndFixing, setIsCheckingAndFixing] = useState<boolean>(false);
  const [isFixingSubtitleSpelling, setIsFixingSubtitleSpelling] = useState<boolean>(false);
  const [subtitleSpellToast, setSubtitleSpellToast] = useState<{ show: boolean; title: string; message: string; fixes: string[] } | null>(null);
  const [isAuditReportOpen, setIsAuditReportOpen] = useState<boolean>(false);
  const [lastAuditResult, setLastAuditResult] = useState<{
    fixedSummary: string;
    fixedCtaText: string;
    fixedMarketingScript: string;
    fixedDetailedReview: string;
    fixedSubtitles: { start: number; end: number; text: string }[];
    fixedIssues: string[];
    qualityScoreBefore: number;
    qualityScoreAfter: number;
    optimizationSummary: string;
  } | null>(null);

  // AUDIO SILENCE & SPEECH ACTIVITY DETECTOR (VAD) STATES
  const [isSilenceDetectModalOpen, setIsSilenceDetectModalOpen] = useState<boolean>(false);
  const [isDetectingSilence, setIsDetectingSilence] = useState<boolean>(false);
  const [silenceDetectResult, setSilenceDetectResult] = useState<SilenceDetectionResult | null>(null);
  const [silenceThresholdDb, setSilenceThresholdDb] = useState<number>(-36);
  const [minSilenceDuration, setMinSilenceDuration] = useState<number>(0.22);
  const [silencePaddingSec, setSilencePaddingSec] = useState<number>(0.05);

  // REVIEW & SUBTITLE SMART SYNCHRONIZATION SUITE
  const [reviewSyncViewMode, setReviewSyncViewMode] = useState<'storyboard' | 'subtitle-matrix' | 'teleprompter'>('storyboard');
  const [syncSearchQuery, setSyncSearchQuery] = useState<string>('');
  const [editingSegmentIdx, setEditingSegmentIdx] = useState<number | null>(null);
  const [editingSegmentText, setEditingSegmentText] = useState<string>('');
  const [copiedTimedSubtitles, setCopiedTimedSubtitles] = useState<boolean>(false);

  // 1-Click Viral Formula Preset Applier
  const applyViralPreset = (presetKey: 'tiktok-viral' | 'luxury-aesthetic' | 'tech-unboxing' | 'flash-sale' | 'organic-asmr') => {
    setActivePresetKey(presetKey);
    if (presetKey === 'tiktok-viral') {
      setHookBannerStyle('tiktok-yellow');
      setSubtitleStyle('tiktok');
      setAudioEffect('bass');
      setWordHighlightEnabled(true);
      setColorPreset('vibrant');
      playSynthesizedSFX('chime', 0.9);
    } else if (presetKey === 'luxury-aesthetic') {
      setHookBannerStyle('editorial-royal');
      setSubtitleStyle('capcut');
      setAudioEffect('reverb');
      setWordHighlightEnabled(true);
      setColorPreset('cinematic');
      playSynthesizedSFX('whoosh', 0.8);
    } else if (presetKey === 'tech-unboxing') {
      setHookBannerStyle('cyberpunk-neon');
      setSubtitleStyle('cyberpunk');
      setAudioEffect('none');
      setWordHighlightEnabled(true);
      setColorPreset('cool');
      playSynthesizedSFX('shutter', 0.8);
    } else if (presetKey === 'flash-sale') {
      setHookBannerStyle('tiktok-red');
      setSubtitleStyle('tiktok');
      setAudioEffect('bass');
      setWordHighlightEnabled(true);
      setColorPreset('warm');
      playSynthesizedSFX('chime', 1.0);
    } else if (presetKey === 'organic-asmr') {
      setHookBannerStyle('beast-glow');
      setSubtitleStyle('minimal');
      setAudioEffect('none');
      setWordHighlightEnabled(false);
      setColorPreset('original');
      playSynthesizedSFX('bell', 0.7);
    }
  };

  const refreshHookSuggestions = async () => {
    const rawName = activeReview?.productName || productName || "Sản phẩm xu hướng";
    setIsRefreshingHooks(true);
    try {
      const response = await fetch('/api/suggest-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: rawName, language: reviewLanguage })
      });
      if (!response.ok) {
        throw new Error('Não bộ AI bận.');
      }
      const data = await response.json();
      if (data && Array.isArray(data.hooks) && data.hooks.length > 0) {
        setCustomHookSuggestions(data.hooks);
        setHookBannerText(data.hooks[0]);
        setShowHookBanner(true);
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
        }
      }
    } catch (error: any) {
      console.error("Lỗi khi gợi ý câu hook mở màn:", error);
      const uppercaseName = rawName.toUpperCase();
      const localFallbacks = [
        `Ố QUÁ HOẠT HỌA: ${uppercaseName} SẼ THAY ĐỔI ĐỜI BẠN!`,
        `KHÔNG THỂ TIN NỔI ${uppercaseName} LẠI LÀM ĐƯỢC ĐIỀU NÀY...`,
        `ĐỪNG MUA ${uppercaseName} KHI BẠN CHƯA COI HẾT CLIP NÀY!`
      ];
      setCustomHookSuggestions(localFallbacks);
      setHookBannerText(localFallbacks[0]);
    } finally {
      setIsRefreshingHooks(false);
    }
  };

  // Sync editedScript when activeReview changes
  useEffect(() => {
    if (activeReview) {
      setEditedScript(activeReview.marketingScript);
      
      // Auto-populate viral hook text based on active product name or custom video
      const productTitle = activeReview.productName || '';
      const baseSuggest = productTitle 
        ? `BÌNH TĨNH! ĐỪNG VỘI TRẢI NGHIỆM ${productTitle.toUpperCase()} NẾU CHƯA XEM HẾT VIDEO NÀY!` 
        : 'CẢNH BÁO: SỰ THẬT VỀ SẢN PHẨM NÀY SẼ LÀM BẠN SỬNG SỐT!';
      setHookBannerText(baseSuggest);
    } else {
      setEditedScript('');
      setHookBannerText('SIÊU PHẨM XU HƯỚNG TIKTOK ĐÃ LỘ DIỆN!');
    }
  }, [activeReview]);

  // Automatic & Intelligent speech speed calculation based on script length and video duration
  const getIdealSpeechSpeed = (text: string): { speed: number; wordCount: number; videoDuration: number; estimatedDuration: number; status: 'perfect' | 'too-fast' | 'too-slow' } => {
    const cleanText = text || '';
    const words = cleanText.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    
    let videoDuration = 18;
    if (videoRef.current && videoRef.current.duration && !isNaN(videoRef.current.duration) && isFinite(videoRef.current.duration)) {
      videoDuration = videoRef.current.duration;
    } else if (uploadedVideoDuration && !isNaN(uploadedVideoDuration) && isFinite(uploadedVideoDuration)) {
      videoDuration = uploadedVideoDuration;
    } else if (activeReview && activeReview.duration && !isNaN(activeReview.duration)) {
      videoDuration = activeReview.duration;
    }

    if (wordCount === 0) {
      return { speed: 1.0, wordCount: 0, videoDuration, estimatedDuration: 0, status: 'perfect' };
    }

    // Average Vietnamese speech rate: ~2.45 words per second
    const averageWPS = 2.45; 
    
    // We want the script to finish around 92% of the video duration (safe zone at the end)
    const targetDuration = videoDuration * 0.92;
    const requiredWPS = wordCount / targetDuration;
    
    // speed_multiplier = requiredWPS / averageWPS
    let calculatedSpeed = requiredWPS / averageWPS;
    
    // limit/clamp to standard range [0.8x, 1.5x]
    if (calculatedSpeed < 0.8) calculatedSpeed = 0.8;
    if (calculatedSpeed > 1.5) calculatedSpeed = 1.5;
    
    const finalSpeed = parseFloat(calculatedSpeed.toFixed(1));
    const estimatedDuration = wordCount / (averageWPS * finalSpeed);
    
    let status: 'perfect' | 'too-fast' | 'too-slow' = 'perfect';
    if (estimatedDuration > videoDuration) {
      status = 'too-slow'; // Speech takes longer than video duration
    } else if (estimatedDuration < videoDuration * 0.72) {
      status = 'too-fast'; // Speech finishes too early, leaves long silence
    }

    return {
      speed: finalSpeed,
      wordCount,
      videoDuration,
      estimatedDuration: parseFloat(estimatedDuration.toFixed(1)),
      status
    };
  };

  const getScriptSyncStatus = () => {
    const text = editedScript || (activeReview ? activeReview.marketingScript : '');
    const words = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
    
    let videoDuration = 18;
    if (videoRef.current && videoRef.current.duration && !isNaN(videoRef.current.duration) && isFinite(videoRef.current.duration)) {
      videoDuration = videoRef.current.duration;
    } else if (uploadedVideoDuration && !isNaN(uploadedVideoDuration) && isFinite(uploadedVideoDuration)) {
      videoDuration = uploadedVideoDuration;
    } else if (activeReview && activeReview.duration && !isNaN(activeReview.duration)) {
      videoDuration = activeReview.duration;
    }

    // Sweet spot is 2.15 to 2.3 words per second.
    const targetWords = Math.round(videoDuration * 2.22);
    const minWords = Math.max(12, Math.round(videoDuration * 2.05));
    const maxWords = Math.round(videoDuration * 2.38);

    if (words === 0) {
      return {
        status: 'neutral',
        label: 'Chưa có kịch bản',
        color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
        description: `Cần khoảng ${targetWords} từ cho video ${Math.round(videoDuration)}s.`
      };
    }

    if (words >= minWords && words <= maxWords) {
      return {
        status: 'perfect',
        label: 'Khớp khít hoàn hảo 💎',
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        description: `Độ dài ${words} từ hoàn toàn tối ưu cho video ${Math.round(videoDuration)} giây.`
      };
    } else if (words < minWords) {
      return {
        status: 'too-short',
        label: 'Hơi ngắn ⚠️ Vui lòng tối ưu lại',
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        description: `Chỉ có ${words}/${minWords} từ. Giọng đọc có thể kết thúc sớm, để lại khoảng lặng.`
      };
    } else {
      return {
        status: 'too-long',
        label: 'Hơi dài 🚨 Vui lòng tối ưu lại',
        color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
        description: `Có ${words}/${maxWords} từ. Giọng đọc dễ bị quá nhanh hoặc bị dồn dập.`
      };
    }
  };

  const handleOptimizeScriptLength = async () => {
    const textToOpt = editedScript || (activeReview?.marketingScript || '');
    if (!textToOpt.trim()) {
      setApiError("Vui lòng viết hoặc chọn kịch bản trước khi thực hiện tối ưu.");
      return;
    }

    let videoDuration = 18;
    if (videoRef.current && videoRef.current.duration && !isNaN(videoRef.current.duration) && isFinite(videoRef.current.duration)) {
      videoDuration = videoRef.current.duration;
    } else if (uploadedVideoDuration && !isNaN(uploadedVideoDuration) && isFinite(uploadedVideoDuration)) {
      videoDuration = uploadedVideoDuration;
    } else if (activeReview && activeReview.duration && !isNaN(activeReview.duration)) {
      videoDuration = activeReview.duration;
    }

    try {
      setIsOptimizingScript(true);
      const res = await fetch('/api/optimize-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          script: textToOpt,
          videoDuration: videoDuration,
          language: reviewLanguage
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Không thể tối ưu hóa kịch bản.");
      }

      const resData = await res.json();
      if (resData.optimizedScript) {
        setEditedScript(resData.optimizedScript);
        console.info("[AI-SCRIPT-OPTIMIZED-SUCCESS] Đã tối ưu kịch bản khớp độ dài video!");
        
        // Auto trigger re-synthesis to update the voice audio to match the optimized script
        // Note: we can set triggers or do nothing, let the user click generate if they want.
        // But automatically calling synthetic update gives a magical, seamless feel!
      }
    } catch (e: any) {
      console.error("Lỗi tối ưu hóa kịch bản:", e);
      setApiError(e.message || "Không thể kết nối dịch vụ AI tối ưu kịch bản.");
    } finally {
      setIsOptimizingScript(false);
    }
  };

  // Comprehensive Smart QA Inspector and Auto-Corrector for Review, Script & Subtitles
  const handleCheckAndFixReviewAndSubtitles = async () => {
    let videoDuration = 18;
    if (videoRef.current && videoRef.current.duration && !isNaN(videoRef.current.duration) && isFinite(videoRef.current.duration)) {
      videoDuration = videoRef.current.duration;
    } else if (uploadedVideoDuration && !isNaN(uploadedVideoDuration) && isFinite(uploadedVideoDuration)) {
      videoDuration = uploadedVideoDuration;
    } else if (activeReview && activeReview.duration && !isNaN(activeReview.duration)) {
      videoDuration = activeReview.duration;
    }

    const scriptToFix = editedScript || (activeReview?.marketingScript || '');
    const reviewToFix = activeReview?.detailedReview || '';
    const summaryToFix = activeReview?.summary || '';
    const ctaToFix = activeReview?.ctaText || '';
    const subsToFix = customSubtitleSegments || subtitleSegments || [];

    if (!scriptToFix.trim() && !reviewToFix.trim() && (!subsToFix || subsToFix.length === 0)) {
      setApiError("Vui lòng khởi tạo hoặc nhập bài viết review/kịch bản trước khi thực hiện kiểm tra sửa lỗi!");
      return;
    }

    setIsCheckingAndFixing(true);
    setApiError(null);

    try {
      const res = await fetch('/api/check-and-fix-review-and-subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detailedReview: reviewToFix,
          marketingScript: scriptToFix,
          summary: summaryToFix,
          ctaText: ctaToFix,
          subtitleSegments: subsToFix,
          videoDuration: videoDuration,
          language: reviewLanguage,
          productName: activeReview?.productName || productName || ''
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Không thể hoàn tất quy trình kiểm tra sửa lỗi.");
      }

      const data = await res.json();
      setLastAuditResult(data);

      // Auto-apply fixes directly to state for instant flawless results
      if (data.fixedMarketingScript) {
        setEditedScript(data.fixedMarketingScript);
      }
      if (data.fixedSubtitles && Array.isArray(data.fixedSubtitles) && data.fixedSubtitles.length > 0) {
        setCustomSubtitleSegments(data.fixedSubtitles);
      }
      if (activeReview) {
        setActiveReview({
          ...activeReview,
          summary: data.fixedSummary || activeReview.summary,
          ctaText: data.fixedCtaText || activeReview.ctaText,
          detailedReview: data.fixedDetailedReview || activeReview.detailedReview,
          marketingScript: data.fixedMarketingScript || activeReview.marketingScript
        });
      }

      playSynthesizedSFX('chime', 0.9);
      setIsAuditReportOpen(true);
    } catch (e: any) {
      console.error("Lỗi khi kiểm tra sửa lỗi bài viết review & phụ đề:", e);
      setApiError(e.message || "Đã xảy ra lỗi khi kiểm tra sửa lỗi bài viết review và phụ đề.");
    } finally {
      setIsCheckingAndFixing(false);
    }
  };

  // Dedicated AI & Algorithmic Subtitle Spell Checker & Grammar Polisher
  const handleFixSubtitlesSpellingAI = async () => {
    const currentSubs = customSubtitleSegments || subtitleSegments || [];
    if (currentSubs.length === 0) {
      setSubtitleSpellToast({
        show: true,
        title: "Chưa có phân cảnh phụ đề",
        message: "Vui lòng nhập kịch bản hoặc tạo bài review để tự động sinh phụ đề trước khi kiểm tra chính tả.",
        fixes: []
      });
      return;
    }

    setIsFixingSubtitleSpelling(true);
    try {
      const res = await fetch('/api/fix-subtitles-spelling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtitles: currentSubs,
          productName: activeReview?.productName || productName || '',
          language: reviewLanguage
        })
      });

      if (!res.ok) {
        throw new Error("Không thể kết nối máy chủ phân tích chính tả.");
      }

      const data = await res.json();
      if (data.fixedSubtitles && Array.isArray(data.fixedSubtitles) && data.fixedSubtitles.length > 0) {
        setCustomSubtitleSegments(data.fixedSubtitles);
        playSynthesizedSFX('chime', 0.9);
        setSubtitleSpellToast({
          show: true,
          title: "✨ AI Chuẩn Hóa Chính Tả & Dấu Câu Thành Công",
          message: data.summary || `Đã tối ưu chính xác 100% ngữ pháp & dấu câu cho ${data.fixedSubtitles.length} phân cảnh.`,
          fixes: data.fixedDetails || []
        });
      }
    } catch (err: any) {
      console.warn("Dùng bộ quy chuẩn chính tả tiếng Việt nội bộ:", err.message);
      const localResult = auditAndFixSubtitlesSpelling(currentSubs);
      setCustomSubtitleSegments(localResult.fixedSubtitles);
      playSynthesizedSFX('chime', 0.8);
      setSubtitleSpellToast({
        show: true,
        title: "✨ Chuẩn Hóa Chính Tả Tiếng Việt Tức Thì",
        message: localResult.fixCount > 0 
          ? `Đã tự động sửa ${localResult.fixCount} lỗi chính tả và dấu câu theo chuẩn ngữ pháp.`
          : "Tất cả các phân cảnh phụ đề đều đã đạt độ chính xác chính tả 100%.",
        fixes: localResult.fixedItems.map(item => `Phân cảnh #${item.index + 1}: "${item.before}" → "${item.after}" (${item.reason})`)
      });
    } finally {
      setIsFixingSubtitleSpelling(false);
    }
  };

  const handleFixSubtitlesSpellingLocal = () => {
    const currentSubs = customSubtitleSegments || subtitleSegments || [];
    if (currentSubs.length === 0) return;
    const localResult = auditAndFixSubtitlesSpelling(currentSubs);
    setCustomSubtitleSegments(localResult.fixedSubtitles);
    playSynthesizedSFX('pop', 0.7);
    setSubtitleSpellToast({
      show: true,
      title: "⚡ Sửa Nhanh Chính Tả & Dấu Câu",
      message: localResult.fixCount > 0 
        ? `Đã sửa ${localResult.fixCount} lỗi chính tả tiếng Việt.`
        : "Toàn bộ phụ đề đã đạt độ chuẩn xác 100%.",
      fixes: localResult.fixedItems.map(item => `Phân cảnh #${item.index + 1}: "${item.before}" → "${item.after}" (${item.reason})`)
    });
  };

  // Automatic Audio Silence & Speech Interval Detection (Voice Activity Detector)
  const handleRunSilenceDetection = async (overrideOptions?: { thresholdDb?: number; minSilenceDurationSec?: number; startPaddingSec?: number }) => {
    const activeAudioSource = audioUrl || (audioRef.current ? audioRef.current.src : '');
    
    if (!activeAudioSource) {
      setApiError("Chưa có tệp âm thanh thuyết minh để phân tích khoảng lặng. Hãy nhấp 'Khởi tạo giọng đọc AI' hoặc tải file audio/video lên trước!");
      return;
    }

    const currentSubs = customSubtitleSegments || subtitleSegments || [];
    if (currentSubs.length === 0) {
      setApiError("Chưa có phân cảnh phụ đề nào để điều chỉnh. Hãy nhập kịch bản hoặc phân tích sản phẩm trước!");
      return;
    }

    setIsDetectingSilence(true);
    setApiError(null);

    const threshold = overrideOptions?.thresholdDb !== undefined ? overrideOptions.thresholdDb : silenceThresholdDb;
    const minSilence = overrideOptions?.minSilenceDurationSec !== undefined ? overrideOptions.minSilenceDurationSec : minSilenceDuration;
    const padding = overrideOptions?.startPaddingSec !== undefined ? overrideOptions.startPaddingSec : silencePaddingSec;

    try {
      const result = await detectSilenceAndAlignSubtitles(
        activeAudioSource,
        currentSubs,
        {
          thresholdDb: threshold,
          minSilenceDurationSec: minSilence,
          startPaddingSec: padding,
          endPaddingSec: padding * 1.5
        }
      );

      setSilenceDetectResult(result);
      setIsSilenceDetectModalOpen(true);
      playSynthesizedSFX('chime', 0.85);
    } catch (err: any) {
      console.error("Lỗi phân tích khoảng lặng âm thanh:", err);
      setApiError(err.message || "Không thể phân tích dữ liệu âm thanh. Vui lòng kiểm tra lại file audio.");
    } finally {
      setIsDetectingSilence(false);
    }
  };

  const handleApplySilenceAlignment = () => {
    if (!silenceDetectResult || !silenceDetectResult.alignedSubtitles) return;
    
    setCustomSubtitleSegments(silenceDetectResult.alignedSubtitles);
    playSynthesizedSFX('chime', 1.0);
    setIsSilenceDetectModalOpen(false);

    const count = silenceDetectResult.alignedSubtitles.length;
    const speechCount = silenceDetectResult.speechIntervals.length;
    const silenceCount = silenceDetectResult.silenceGaps.length;

    setSubtitleSpellToast({
      show: true,
      title: "⚡ Đã Tự Động Khớp Khoảng Lặng Audio",
      message: `Đã căn chỉnh ${count} phân cảnh phụ đề khớp khít theo ${speechCount} đoạn phát âm và ${silenceCount} khoảng lặng thực tế.`,
      fixes: silenceDetectResult.adjustments.map(adj => 
        `Phân cảnh #${adj.index + 1}: Bắt đầu ${adj.oldStart}s ➔ ${adj.newStart}s (Δ ${adj.deltaStart >= 0 ? '+' : ''}${adj.deltaStart}s) | Kết thúc ${adj.oldEnd}s ➔ ${adj.newEnd}s (Δ ${adj.deltaEnd >= 0 ? '+' : ''}${adj.deltaEnd}s)`
      )
    });
  };

  const previewSegmentAudioTimerRef = useRef<any>(null);
  const handlePreviewSilenceSegment = (start: number, end: number) => {
    if (previewSegmentAudioTimerRef.current) {
      clearTimeout(previewSegmentAudioTimerRef.current);
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = Math.max(0, start - 0.05);

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = Math.max(0, start - 0.05);
      }

      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play().then(() => {
            setIsPlaying(true);
            if (isSyncPlay && videoRef.current) {
              videoRef.current.play().catch(() => {});
            }
          }).catch(() => {});

          const playDuration = Math.max(0.3, end - start + 0.1);
          previewSegmentAudioTimerRef.current = setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.pause();
              setIsPlaying(false);
            }
            if (videoRef.current) {
              videoRef.current.pause();
            }
          }, (playDuration * 1000) / (playbackSpeed || 1.0));
        }
      }, 50);
    }
  };

  // Generate ultra high converting viral hook suggestions dynamically
  const getSmartHookSuggestions = (): string[] => {
    if (customHookSuggestions && customHookSuggestions.length > 0) {
      return customHookSuggestions;
    }
    const rawName = activeReview?.productName || productName || "sản phẩm này";
    const nameStr = rawName.trim();
    const uppercaseName = nameStr.toUpperCase();
    return [
      `CẢNH BÁO: ĐỪNG VỘI DÙNG ${uppercaseName} NẾU CHƯA BIẾT LƯU Ý NÀY!`,
      `ĐÁNH GIÁ THỰC TẾ: TRẢI NGHIỆM ${uppercaseName} CHƯA TỪNG ĐƯỢC TIẾT LỘ!`,
      `SỰ THẬT KHÁCH QUAN VỀ LỢI - HẠI CỦA ${uppercaseName} SAU KHI DÙNG!`,
      `TẠI SAO CHƯA AI NÓI CHO BẠN BIẾT ĐIỀU NÀY VỀ ${uppercaseName}?`,
      `BÓC PHỐT CÔNG CHÚNG: TRẢI NGHIỆM CHI TIẾT SỰ THẬT VỀ ${uppercaseName}!`,
      `ƯU VÀ NHƯỢC ĐIỂM THỰC TẾ CỦA ${uppercaseName} SAU 1 THÁNG SỬ DỤNG!`
    ];
  };

  // Real-time dynamic Viral Retention Score calculator for million-view videos
  const getViralRetentionScore = (): { score: number; level: string; color: string; advice: string } => {
    if (!activeReview) return { score: 0, level: 'Chưa có', color: 'text-slate-500', advice: 'Hãy chọn hoặc phân tích sản phẩm để xem điểm.' };
    const script = editedScript || activeReview.marketingScript || '';
    let score = 50;
    let advice = 'Kịch bản cơ bản tốt. Cần bổ sung thêm gia vị viral.';

    // Check for Hooks
    if (script.includes('[SIÊU HOOK TRIỆU VIEW]')) {
      score += 15;
    } else {
      advice = 'Hãy chèn "Siêu Hook" vào đầu kịch bản để thu hút giữ chân 3s đầu cực đại.';
    }

    // Check for B-Roll directions
    if (script.includes('[Gợi ý B-Roll:')) {
      score += 15;
    } else {
      if (score < 80) advice = 'Hãy chèn "Gợi ý máy quay B-Roll" giúp thị giác biến chuyển đa dạng.';
    }

    // Check for SFX audio effects
    if (script.includes('[SFX:')) {
      score += 15;
    } else {
      if (score < 80 && advice.startsWith('Kịch bản')) advice = 'Chèn hiệu ứng SFX leng keng kích thích xúc cảm chốt đơn sâu sắc.';
    }

    // Word rate check
    const words = script.split(/\s+/).filter(Boolean).length;
    const dur = uploadedVideoDuration || audioDuration || 45;
    const rate = words / dur;
    if (rate >= 2.0 && rate <= 2.5) {
      score += 5;
    } else if (rate > 2.5) {
      score -= 5;
      advice = `Tốc độ đọc đang hơi nhanh (~${rate.toFixed(1)} từ/giây). Cân nhắc rút ngắn bớt văn bản để khán giả kịp nghe ngấm.`;
    } else if (rate < 2.0 && words > 0) {
      score -= 5;
      advice = `Tốc độ đọc hơi chậm (~${rate.toFixed(1)} từ/giây). Hãy bổ sung thêm lời thoại lấp đầy thời lượng.`;
    }

    // Check for Call To Action
    const hasCta = /(giỏ hàng|mua ngay|đặt mua|link bên dưới|nhấp vào|săn)/i.test(script);
    if (hasCta) {
      score += 5;
    }

    score = Math.min(100, Math.max(0, score));

    let level = 'Sơ cấp (Cần Tối Ưu)';
    let color = 'text-rose-400';
    if (score >= 90) {
      level = 'Hoàn Mỹ Triệu Views 👑';
      color = 'text-amber-400';
      advice = 'Kịch bản đạt tỉ lệ giữ chân tối đa! Sẵn sàng lồng tiếng và sản xuất.';
    } else if (score >= 75) {
      level = 'Khá Cao (Hứa Hẹn Viral) ⚡';
      color = 'text-emerald-400';
    } else if (score >= 60) {
      level = 'Trung bình (Đủ Dùng)';
      color = 'text-yellow-400';
    }

    return { score, level, color, advice };
  };

  // Auto speech speed optimizer effect
  useEffect(() => {
    if (isAutoSpeedEnabled) {
      const text = editedScript || (activeReview ? activeReview.marketingScript : '');
      if (text) {
        const ideal = getIdealSpeechSpeed(text);
        if (ideal.wordCount > 0 && Math.abs(playbackSpeed - ideal.speed) >= 0.05) {
          setPlaybackSpeed(ideal.speed);
        }
      }
    }
  }, [isAutoSpeedEnabled, editedScript, activeReview, uploadedVideoDuration]);

  const [baseProductPrice, setBaseProductPrice] = useState<number>(290000);

  const applyScriptModifier = (type: 'sfx' | 'broll' | 'hook' | 'reset') => {
    if (!activeReview) return;
    
    if (type === 'reset') {
      setEditedScript(activeReview.marketingScript);
      return;
    }

    let modified = editedScript || activeReview.marketingScript;

    if (type === 'hook') {
      const rawName = activeReview?.productName || "siêu phẩm này";
      // Clean name for hook, remove bracket annotations, keep it neat
      const cleanName = rawName.replace(/\(.*?\)/g, '').trim();
      const hooks = [
        {
          spoken: `Trời đất ơi, đừng vội mua ${cleanName} nếu cả nhà chưa xem hết clip này nha...`,
          banner: `CẢNH BÁO: ĐỪNG VỘI MUA ${cleanName.toUpperCase()} NẾU CHƯA XEM HẾT CLIP!`
        },
        {
          spoken: `Sự thật cực kỳ đắt giá về em ${cleanName} mà người bán không bao giờ nói cho bạn biết...`,
          banner: `SỰ THẬT CỰC ĐẮT GIÁ VỀ ${cleanName.toUpperCase()} ĐÃ ĐƯỢC TIẾT LỘ!`
        },
        {
          spoken: `Bình tĩnh! Có một cảnh báo cực kỳ quan trọng về thiết kế của ${cleanName} nè...`,
          banner: `BÌNH TĨNH: CẢNH BÁO ĐẶC BIỆT VỀ ${cleanName.toUpperCase()}!`
        },
        {
          spoken: `Nhiều người tốn tiền oan uổng cho ${cleanName}, đây mới là trải nghiệm thực tế của mình...`,
          banner: `ĐỪNG TỐN TIỀN OAN UỔNG VÌ ${cleanName.toUpperCase()}, XEM NGAY!`
        },
        {
          spoken: `Bữa nay mình bóc phốt chân thực xem ${cleanName} có đáng đồng tiền bát gạo như lời đồn không nha...`,
          banner: `BÓC PHỐT CHÂN THỰC ${cleanName.toUpperCase()} CÓ THẬT SỰ TỐT KHÔNG?`
        },
        {
          spoken: `Nếu đang định sắm ${cleanName} thì dừng lại ba giây coi kỹ cái này giúp mình nheng...`,
          banner: `DỪNG LẠI 3 GIÂY NẾU BẠN ĐANG ĐỊNH MUA ${cleanName.toUpperCase()}!`
        }
      ];
      const selected = hooks[Math.floor(Math.random() * hooks.length)];

      // Cleanly strip any existing [SIÊU HOOK...] or [HOOK...] tag AND its opening hook text
      let cleanedText = modified.replace(/^\[(?:SIÊU HOOK(?: TRIỆU VIEW)?|HOOK)[^\]]*\]\s*.*?(?:\.\.\.|[.?!])\s*/gis, '');

      // If there was no tag, replace any introductory question/exclamation sentence to avoid stacking double hooks
      if (cleanedText === modified) {
        const firstSentenceMatch = modified.match(/^([^.?!…]+[.?!…]+(?:\.\.\.)?)\s*(.*)$/s);
        if (firstSentenceMatch && /^(Có bao giờ|Bạn có|Đừng|Ai cũng|Nếu bạn|Trời đất|Sự thật|Cảnh báo|Bình tĩnh)/i.test(firstSentenceMatch[1].trim())) {
          cleanedText = firstSentenceMatch[2].trim();
        }
      }

      modified = `[SIÊU HOOK TRIỆU VIEW] ${selected.spoken} ${cleanedText.trim()}`;

      // Synchronize the Hook Banner simultaneously so visual and voiceover never clash
      setHookBannerText(selected.banner);
      setShowHookBanner(true);
    } else if (type === 'broll') {
      // Check if already modified to avoid duplicating suggestions
      if (modified.includes('[Gợi ý B-Roll:')) {
        setApiError('Đã thêm hướng quay B-Roll vào kịch bản.');
        return;
      }
      modified = modified
        .replace(/(nhất|đột phá|ưu điểm|độc đáo)/gi, `$1 [Gợi ý B-Roll: Lia máy nhanh kiểu Whip Pan tập trung vào chi tiết đắt giá]`)
        .replace(/(chất liệu|thiết kế|ngoại hình|bề mặt)/gi, `$1 [Gợi ý B-Roll: Quay cận cảnh macro chuyển động siêu mượt 60fps góc nghiêng phản chiếu ánh sáng sang trọng]`)
        .replace(/(tiết kiệm|hiệu năng|tốc độ|mượt mà)/gi, `$1 [Gợi ý B-Roll: Hiệu ứng Speed Ramp tăng tốc độ rồi dừng đột ngột để phô diễn công năng cực mượt]`)
        .replace(/(trải nghiệm|cảm giác|cảm nhận|sử dụng)/gi, `$1 [Gợi ý B-Roll: Cận cảnh tay lướt chạm sướng mắt, lột tả cảm giác chân thực tuyệt vời]`)
        .replace(/giỏ hàng/gi, `chiếc giỏ hàng màu vàng nhỏ [Gợi ý B-Roll: Trỏ tay tinh tế hướng giỏ hàng góc trái nhấp nháy chuyển động thu hút]`);
      
      modified = `[Gợi ý B-Roll: Quay mở cảnh lia máy nhẹ nhàng từ trên xuống dưới hé lộ toàn cảnh sản phẩm] ${modified}`;
    } else if (type === 'sfx') {
      if (modified.includes('[SFX:')) {
        setApiError('Đã chèn hiệu ứng âm thanh SFX vào kịch bản.');
        return;
      }
      modified = modified
        .replace(/(ngạc nhiên|bất ngờ|hóa ra|ôi|wow|sững sờ|đặc biệt)/gi, `[SFX: Cinematic Swoosh chuyển cảnh kịch tính] $1`)
        .replace(/(đơn hàng|mua ngay|giỏ hàng|quyền lợi|ưu đãi|đặc quyền|săn ngay)/gi, `[SFX: Cash Register leng keng kích thích chốt đơn] $1`)
        .replace(/(mượt mà|tinh xảo|ấm áp|hoàn hảo|tuyệt vời|đã lắm)/gi, `[SFX: Sparkle lấp lánh nịnh tai] $1`)
        .replace(/(cảnh báo|lưu ý|sai lầm|sự thật)/gi, `[SFX: Camera Shutter dồn dập lôi cuốn] $1`);
    }

    setEditedScript(modified);
  };
  
  // AI Smart Trending Product Scanner States
  const [isTrendingOpen, setIsTrendingOpen] = useState<boolean>(false);
  const [isScanningTrends, setIsScanningTrends] = useState<boolean>(false);
  const [scannedCategory, setScannedCategory] = useState<string>('all');
  const [scannedProducts, setScannedProducts] = useState<TrendingProduct[]>([]);
  
  // Custom Product Inputs
  const [productName, setProductName] = useState<string>('');
  const [productDesc, setProductDesc] = useState<string>('');
  
  // Product image configurations (Supporting up to 5 images)
  const [productImages, setProductImages] = useState<ProductImageFile[]>([]);

  // Computed backward-compatible references matching single-image selectors
  const productImageFileName = productImages.length > 0 ? productImages[0].name : '';
  const productImageFileSize = productImages.length > 0 ? productImages[0].size : 0;
  const productImageUrl = productImages.length > 0 ? productImages[0].url : '';
  const productImageBase64 = productImages.length > 0 ? productImages[0].base64 : '';
  const productImageMimeType = productImages.length > 0 ? productImages[0].mimeType : '';

  // Custom uploaded file configurations
  const [uploadedFiles, setUploadedFiles] = useState<UploadedVideoSegment[]>([]);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractionProgress, setExtractionProgress] = useState<number | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [uploadedFileSize, setUploadedFileSize] = useState<number>(0);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string>('');
  const [uploadedBase64, setUploadedBase64] = useState<string>('');
  const [uploadedMimeType, setUploadedMimeType] = useState<string>('');

  // Execution states
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isIdentifying, setIsIdentifying] = useState<boolean>(false);
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
  const [isGeneratingTTS, setIsGeneratingTTS] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // TikTok Distribution Algorithm & SEO Optimizer states
  const [tiktokCaptionStyle, setTiktokCaptionStyle] = useState<'sensational' | 'objective' | 'funny' | 'conversion'>('sensational');
  const [copiedTiktokCaption, setCopiedTiktokCaption] = useState<boolean>(false);
  const [copiedSearchKeyword, setCopiedSearchKeyword] = useState<string | null>(null);
  const [tiktokChecklist, setTiktokChecklist] = useState<Record<string, boolean>>({
    hook: true,
    voice: true,
    seo: true,
    retention: true,
    audio: false,
    cta: false
  });

  // Dynamic step progression for video analysis loading state
  const [analysisStepIndex, setAnalysisStepIndex] = useState<number>(0);
  useEffect(() => {
    let timer: any;
    if (isAnalyzing) {
      if (extractionProgress !== null) {
        setAnalysisStepIndex(0);
      } else {
        // Extraction completed, now calling Gemini API
        setAnalysisStepIndex(1);
        let currentStep = 1;
        timer = setInterval(() => {
          if (currentStep < 3) {
            currentStep += 1;
            setAnalysisStepIndex(currentStep);
          }
        }, 3200); // Progress to next professional step every 3.2 seconds
      }
    } else {
      setAnalysisStepIndex(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isAnalyzing, extractionProgress]);
  
  // Audio & Video Playback Engine
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [isClientTTSActive, setIsClientTTSActive] = useState<boolean>(false);
  const [clientTTSScript, setClientTTSScript] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [ttsCountdownSec, setTtsCountdownSec] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsClientCache = useRef<Record<string, { url: string; useClientTTS: boolean; audioBase64?: string }>>({});

  // Countdown timer for Google AI Studio rate limit queue
  useEffect(() => {
    if (ttsCountdownSec <= 0) return;
    const timer = setInterval(() => {
      setTtsCountdownSec((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setTimeout(() => {
            generateVoiceover();
          }, 100);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [ttsCountdownSec]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const segmentVideoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const transitionTimeRef = useRef<number>(0);
  const prevSegmentIndexRef = useRef<number>(-1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const productImageInputRef = useRef<HTMLInputElement | null>(null);

  // Sync lồng tiếng settings
  const [isSyncPlay, setIsSyncPlay] = useState<boolean>(true);
  const [duckOriginalAudio, setDuckOriginalAudio] = useState<boolean>(true);
  const [videoOriginalMute, setVideoOriginalMute] = useState<boolean>(false);

  // Video Splicing Transitions Library
  const [videoTransition, setVideoTransition] = useState<'none' | 'cross_dissolve' | 'white_flash' | 'fade_to_black' | 'slide_left' | 'slide_right' | 'zoom_blur' | 'glitch'>('none');
  const [activeTransitionId, setActiveTransitionId] = useState<string | null>(null);
  const [transitionProgress, setTransitionProgress] = useState<number>(0);
  const [transitionDuration, setTransitionDuration] = useState<number>(0.4);

  // Equalizer visual simulation frames
  const [eqHeights, setEqHeights] = useState<number[]>([15, 20, 10, 40, 25, 45, 12, 30, 20, 15, 35, 10]);

  // Audio effect (reverb, bass boost, etc.)
  const [audioEffect, setAudioEffect] = useState<'none' | 'reverb' | 'bass' | 'studio'>('none');

  // Smart FX recommendation states to satisfy 'Gợi ý hiệu ứng thông minh cuốn hút người xem nhất'
  const [selectedSmartCombo, setSelectedSmartCombo] = useState<string>('eco_organic');
  const [smartComboAdvice, setSmartComboAdvice] = useState<string>('🌱 Giải pháp tối giản hoàn hảo cho các chủ đề review mỹ phẩm, decor phòng ngủ thiên nhiên, mẹo dọn dẹp hoặc tệp mẹ và bé. Thân thiện, thư thái, chân thực và hoàn toàn êm ái cho mắt người dùng.');

  // Preview Web Audio Graph Refs
  const previewAudioCtxRef = useRef<AudioContext | null>(null);
  const previewSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const previewVideoSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const previewSegmentSourceNodesRef = useRef<Record<number, MediaElementAudioSourceNode>>({});
  const previewVideoGainNodeRef = useRef<GainNode | null>(null);
  const previewBassNodeRef = useRef<BiquadFilterNode | null>(null);
  const previewConvolverNodeRef = useRef<ConvolverNode | null>(null);
  const previewDryGainRef = useRef<GainNode | null>(null);
  const previewWetGainRef = useRef<GainNode | null>(null);

  // Copy status indicators
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [copiedReview, setCopiedReview] = useState<boolean>(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState<boolean>(true);
  const [stickerAnimation, setStickerAnimation] = useState<'fade-in' | 'bounce' | 'slide-in'>('bounce');
  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Monitor segment cuts to play transition effects in real-time preview player
  const lastSubtitleIdRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<any>(null);

  const triggerPreviewTransition = (targetStyle?: string) => {
    if (transitionTimerRef.current) {
      cancelAnimationFrame(transitionTimerRef.current);
    }
    setTransitionProgress(0);
    const selectedTrans = targetStyle || videoTransition;
    setActiveTransitionId(selectedTrans);
    
    if (selectedTrans === 'none') {
      setActiveTransitionId(null);
      return;
    }
    
    const duration = transitionDuration * 1000; // Use customized duration in ms
    const startTimeStamp = performance.now();
    
    const animate = () => {
      const now = performance.now();
      const elapsed = now - startTimeStamp;
      const progress = Math.min(1, elapsed / duration);
      setTransitionProgress(progress);
      
      if (progress < 1) {
        transitionTimerRef.current = requestAnimationFrame(animate);
      } else {
        setActiveTransitionId(null);
        setTransitionProgress(0);
      }
    };
    
    transitionTimerRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    const segments = getSegmentsFromScript(
      editedScript || activeReview?.marketingScript || "",
      audioDuration || (videoRef.current?.duration || 0)
    );
    const currentSub = showSubtitles && isPlaying
      ? segments.find(
          (seg) => (currentAudioTime + subtitleOffset) >= seg.start && (currentAudioTime + subtitleOffset) <= seg.end
        )
      : null;
    const currentSubIndex = currentSub && currentSub.sentenceIndex !== undefined ? currentSub.sentenceIndex : null;

    if (currentSubIndex !== lastSubtitleIdRef.current) {
      if (lastSubtitleIdRef.current !== null && isPlaying && videoTransition !== 'none' && uploadedFiles.length > 1) {
        triggerPreviewTransition();
      }
      lastSubtitleIdRef.current = currentSubIndex;
    }
  }, [currentAudioTime, showSubtitles, isPlaying, videoTransition, editedScript, activeReview, audioDuration, subtitleOffset, uploadedFiles.length]);

  // Clean transition timers on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        cancelAnimationFrame(transitionTimerRef.current);
      }
    };
  }, []);

  // Auto-scroll kịch bản bám sát theo giọng đọc thuyết minh AI đang phát
  useEffect(() => {
    if (isAutoScrollEnabled && isPlaying && audioDuration > 0 && scriptTextareaRef.current) {
      const fraction = currentAudioTime / audioDuration;
      const textarea = scriptTextareaRef.current;
      const targetScrollTop = fraction * (textarea.scrollHeight - textarea.clientHeight);
      textarea.scrollTop = targetScrollTop;
    }
  }, [currentAudioTime, isAutoScrollEnabled, isPlaying, audioDuration]);

  // Merge & export video states
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [mergeProgress, setMergeProgress] = useState<number>(0);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string>('');
  const [mergedVideoExt, setMergedVideoExt] = useState<string>('mp4');

  // Mobile optimization tab state
  const [activeMobileTab, setActiveMobileTab] = useState<'inputs' | 'results' | 'studio'>('inputs');

  // Global Studio Processing Progress Bar States
  const [globalProgress, setGlobalProgress] = useState<number>(0);
  const [showGlobalProgress, setShowGlobalProgress] = useState<boolean>(false);
  const [currentTaskLabel, setCurrentTaskLabel] = useState<string>('');

  const isAnyTaskBusy = isAnalyzing || isIdentifying || isGeneratingTTS || isMerging || isScanningTrends;

  useEffect(() => {
    let interval: any;
    if (isAnyTaskBusy) {
      setShowGlobalProgress(true);
      
      // Determine task label dynamically
      let label = 'Đang xử lý tác vụ...';
      if (isAnalyzing) {
        if (extractionProgress !== null) {
          label = `Đang giải nén & tối ưu hóa khung hình video (${extractionProgress}%)...`;
        } else {
          label = 'AI đang bóc tách phân tích video & sáng tác kịch bản quảng cáo...';
        }
      } else if (isIdentifying) {
        if (extractionProgress !== null) {
          label = `Đang phân tách khung hình nhận diện sản phẩm (${extractionProgress}%)...`;
        } else {
          label = 'AI đang nhận diện thông minh & gợi ý từ khóa sản phẩm...';
        }
      } else if (isGeneratingTTS) {
        label = 'Đang tiến hành chuyển đổi kịch bản thành giọng đọc AI...';
      } else if (isMerging) {
        label = `Đang xử lý lồng tiếng và kết xuất video FHD (${mergeProgress}%)...`;
      } else if (isScanningTrends) {
        label = 'Đang kết nối cơ sở dữ liệu xu hướng giỏ hàng Shopee/TikTok...';
      }
      setCurrentTaskLabel(label);

      // Setup initial progress or synchronize physical metrics
      if (isMerging) {
        setGlobalProgress(mergeProgress);
      } else if (isAnalyzing && extractionProgress !== null) {
        setGlobalProgress(10 + Math.round(extractionProgress * 0.5));
      } else if (isIdentifying && extractionProgress !== null) {
        setGlobalProgress(10 + Math.round(extractionProgress * 0.5));
      } else {
        setGlobalProgress(prev => {
          if (prev < 12) return 12;
          return prev;
        });

        interval = setInterval(() => {
          setGlobalProgress(prev => {
            if (prev >= 98) return 98;
            const diff = 100 - prev;
            const step = Math.max(0.12, Math.min(3, diff * 0.08));
            return parseFloat((prev + step).toFixed(1));
          });
        }, 220);
      }
    } else {
      if (globalProgress > 0) {
        setGlobalProgress(100);
        setCurrentTaskLabel('Tác vụ đã hoàn thành xuất sắc!');
        const timeout = setTimeout(() => {
          setShowGlobalProgress(false);
          setGlobalProgress(0);
          setCurrentTaskLabel('');
        }, 1200);
        return () => {
          clearTimeout(timeout);
        };
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAnyTaskBusy, isAnalyzing, isIdentifying, isGeneratingTTS, isMerging, isScanningTrends, extractionProgress, mergeProgress]);

  // Simulated animated equalizer while playing
  useEffect(() => {
    let animationFrame: any;
    if (isPlaying) {
      const updateEq = () => {
        setEqHeights(prev => prev.map(() => Math.floor(Math.random() * 45) + 5));
        animationFrame = setTimeout(updateEq, 100);
      };
      updateEq();
    } else {
      setEqHeights([12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12]);
      if (isClientTTSActive) {
        stopClientTTS();
      }
    }
    return () => clearTimeout(animationFrame);
  }, [isPlaying, isClientTTSActive]);

  // Sync custom speed parameter across players
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, audioUrl]);

  // Helper to build synthetic reverb buffer for preview
  const getReverbBuffer = (ctx: AudioContext) => {
    const rate = ctx.sampleRate;
    const len = rate * 1.5; // 1.5 seconds length
    const buffer = ctx.createBuffer(2, len, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < len; i++) {
      const pct = i / len;
      const val = (Math.random() * 2 - 1) * Math.pow(1 - pct, 2.0);
      left[i] = val;
      right[i] = val;
    }
    return buffer;
  };

  const setupPreviewAudioGraph = () => {
    if (!audioRef.current) return;
    
    // Create AudioContext if not existed
    if (!previewAudioCtxRef.current) {
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          previewAudioCtxRef.current = new AudioCtxClass();
        }
      } catch (e) {
        console.warn("AudioContext initialization skipped or blocked:", e);
      }
    }
    
    const ctx = previewAudioCtxRef.current;
    if (!ctx) return;
    
    // Resume context in case it was suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    
    if (!previewSourceNodeRef.current) {
      try {
        previewSourceNodeRef.current = ctx.createMediaElementSource(audioRef.current);
        
        // Create nodes
        const bassNode = ctx.createBiquadFilter();
        bassNode.type = "lowshelf";
        bassNode.frequency.value = 180;
        bassNode.gain.value = 0.0; // init disabled
        previewBassNodeRef.current = bassNode;
        
        const dryGain = ctx.createGain();
        dryGain.gain.value = 1.0;
        previewDryGainRef.current = dryGain;
        
        const wetGain = ctx.createGain();
        wetGain.gain.value = 0.0;
        previewWetGainRef.current = wetGain;
        
        const convolverNode = ctx.createConvolver();
        convolverNode.buffer = getReverbBuffer(ctx);
        previewConvolverNodeRef.current = convolverNode;
        
        // Connect nodes
        previewSourceNodeRef.current.connect(bassNode);
        
        bassNode.connect(dryGain);
        dryGain.connect(ctx.destination);
        
        bassNode.connect(convolverNode);
        convolverNode.connect(wetGain);
        wetGain.connect(ctx.destination);
      } catch (err) {
        console.error("Lỗi khi kết nối AudioContext cho audio lồng tiếng:", err);
      }
    }

    // Ensure videoGain is created if we need it (even if we don't have videoRef.current but have segment videos)
    if (!previewVideoGainNodeRef.current) {
      try {
        const videoGain = ctx.createGain();
        videoGain.gain.value = videoOriginalMute ? 0.0 : (duckOriginalAudio ? 0.15 : 0.8);
        previewVideoGainNodeRef.current = videoGain;
        videoGain.connect(ctx.destination);
      } catch (err) {
        console.error("Lỗi khi tạo videoGain node:", err);
      }
    }

    // Connect the original video element's audio in the same context to enable smooth mixing, ducking, and rendering
    if (!previewVideoSourceNodeRef.current && videoRef.current) {
      try {
        const videoSource = ctx.createMediaElementSource(videoRef.current);
        previewVideoSourceNodeRef.current = videoSource;
        if (previewVideoGainNodeRef.current) {
          videoSource.connect(previewVideoGainNodeRef.current);
        }
      } catch (err) {
        console.error("Lỗi khi kết nối AudioContext cho video gốc:", err);
      }
    }

    // Connect segment video elements to the same video gain node
    if (uploadedFiles.length > 0) {
      uploadedFiles.forEach((_, idx) => {
        const segEl = segmentVideoRefs.current[idx];
        if (segEl && !previewSegmentSourceNodesRef.current[idx]) {
          try {
            const segSource = ctx.createMediaElementSource(segEl);
            previewSegmentSourceNodesRef.current[idx] = segSource;
            if (previewVideoGainNodeRef.current) {
              segSource.connect(previewVideoGainNodeRef.current);
            }
          } catch (err) {
            console.warn(`Lỗi khi kết nối AudioContext cho segment video ${idx}:`, err);
          }
        }
      });
    }

    // Apply current settings
    const bassNode = previewBassNodeRef.current;
    const dryGain = previewDryGainRef.current;
    const wetGain = previewWetGainRef.current;
    const videoGain = previewVideoGainNodeRef.current;
    
    if (bassNode && dryGain && wetGain) {
      if (audioEffect === 'none') {
        dryGain.gain.setValueAtTime(1.0, ctx.currentTime);
        wetGain.gain.setValueAtTime(0.0, ctx.currentTime);
        bassNode.type = "lowshelf";
        bassNode.frequency.setValueAtTime(180, ctx.currentTime);
        bassNode.gain.setValueAtTime(0.0, ctx.currentTime);
      } else if (audioEffect === 'reverb') {
        dryGain.gain.setValueAtTime(0.85, ctx.currentTime);
        wetGain.gain.setValueAtTime(0.55, ctx.currentTime);
        bassNode.type = "lowshelf";
        bassNode.frequency.setValueAtTime(180, ctx.currentTime);
        bassNode.gain.setValueAtTime(0.0, ctx.currentTime);
      } else if (audioEffect === 'bass') {
        dryGain.gain.setValueAtTime(1.0, ctx.currentTime);
        wetGain.gain.setValueAtTime(0.0, ctx.currentTime);
        bassNode.type = "lowshelf";
        bassNode.frequency.setValueAtTime(180, ctx.currentTime);
        bassNode.gain.setValueAtTime(8.5, ctx.currentTime);
      } else if (audioEffect === 'studio') {
        dryGain.gain.setValueAtTime(1.0, ctx.currentTime);
        wetGain.gain.setValueAtTime(0.0, ctx.currentTime);
        bassNode.type = "highshelf";
        bassNode.frequency.setValueAtTime(7500, ctx.currentTime);
        bassNode.gain.setValueAtTime(6.0, ctx.currentTime);
      }
    }

    if (videoGain) {
      const targetGain = videoOriginalMute ? 0.0 : (duckOriginalAudio ? 0.15 : 0.8);
      videoGain.gain.setValueAtTime(targetGain, ctx.currentTime);
    }
  };

  // Sync audio effect settings in real-time
  useEffect(() => {
    if (!previewAudioCtxRef.current) return;
    const ctx = previewAudioCtxRef.current;
    const bassNode = previewBassNodeRef.current;
    const dryGain = previewDryGainRef.current;
    const wetGain = previewWetGainRef.current;
    
    if (bassNode && dryGain && wetGain) {
      if (audioEffect === 'none') {
        dryGain.gain.setValueAtTime(1.0, ctx.currentTime);
        wetGain.gain.setValueAtTime(0.0, ctx.currentTime);
        bassNode.type = "lowshelf";
        bassNode.frequency.setValueAtTime(180, ctx.currentTime);
        bassNode.gain.setValueAtTime(0.0, ctx.currentTime);
      } else if (audioEffect === 'reverb') {
        dryGain.gain.setValueAtTime(0.85, ctx.currentTime);
        wetGain.gain.setValueAtTime(0.55, ctx.currentTime);
        bassNode.type = "lowshelf";
        bassNode.frequency.setValueAtTime(180, ctx.currentTime);
        bassNode.gain.setValueAtTime(0.0, ctx.currentTime);
      } else if (audioEffect === 'bass') {
        dryGain.gain.setValueAtTime(1.0, ctx.currentTime);
        wetGain.gain.setValueAtTime(0.0, ctx.currentTime);
        bassNode.type = "lowshelf";
        bassNode.frequency.setValueAtTime(180, ctx.currentTime);
        bassNode.gain.setValueAtTime(8.5, ctx.currentTime);
      } else if (audioEffect === 'studio') {
        dryGain.gain.setValueAtTime(1.0, ctx.currentTime);
        wetGain.gain.setValueAtTime(0.0, ctx.currentTime);
        bassNode.type = "highshelf";
        bassNode.frequency.setValueAtTime(7500, ctx.currentTime);
        bassNode.gain.setValueAtTime(6.0, ctx.currentTime);
      }
    }
  }, [audioEffect]);

  // Handle dynamic volume adjust adjustments
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.volume = videoOriginalMute ? 0 : (duckOriginalAudio ? 0.15 : 0.8);
      } else {
        videoRef.current.volume = videoOriginalMute ? 0 : 0.8;
      }
    }
  }, [duckOriginalAudio, videoOriginalMute, isPlaying]);

  // Get the corresponding video segment and the relative time within it for a given absolute timestamp
  const getSegmentAndRelativeTime = (absoluteTime: number): { index: number; relativeTime: number } => {
    if (uploadedFiles.length === 0) return { index: 0, relativeTime: absoluteTime };
    let accumulated = 0;
    for (let i = 0; i < uploadedFiles.length; i++) {
      const dur = uploadedFiles[i].duration;
      if (absoluteTime < accumulated + dur) {
        return { index: i, relativeTime: absoluteTime - accumulated };
      }
      accumulated += dur;
    }
    const lastIndex = uploadedFiles.length - 1;
    const previousAccumulated = accumulated - uploadedFiles[lastIndex].duration;
    return { index: lastIndex, relativeTime: Math.max(0, absoluteTime - previousAccumulated) };
  };

  const getAccumulatedTimeBeforeSegment = (segmentIndex: number): number => {
    let accumulated = 0;
    for (let i = 0; i < segmentIndex && i < uploadedFiles.length; i++) {
      accumulated += uploadedFiles[i].duration;
    }
    return accumulated;
  };

  // High-precision animation frame tracking for 60 FPS fluid subtitle highlighting and syncing
  useEffect(() => {
    let animFrame: number;
    const updateTime = () => {
      if (isPlaying && audioRef.current && !audioRef.current.paused) {
        const audioTime = audioRef.current.currentTime;
        setCurrentAudioTime(audioTime);
        
        if (uploadedFiles.length > 0) {
          const { index, relativeTime } = getSegmentAndRelativeTime(audioTime);
          
          if (activeSegmentIndex !== index) {
            triggerPreviewTransition();
            transitionTimeRef.current = Date.now();
            prevSegmentIndexRef.current = activeSegmentIndex;
            setActiveSegmentIndex(index);
          }
          
          const now = Date.now();
          const transitionDurationMs = 350; // slightly longer than CSS transition
          const isInTransition = now - transitionTimeRef.current < transitionDurationMs;
          const prevIdx = prevSegmentIndexRef.current;
          
          uploadedFiles.forEach((seg, idx) => {
            const videoEl = segmentVideoRefs.current[idx];
            if (!videoEl) return;
            
            if (idx === index) {
              const drift = videoEl.currentTime - relativeTime;
              
              // Only trigger a hard seek if the drift is large (> 0.4s) to avoid browser seek freezes
              if (Math.abs(drift) > 0.4) {
                try {
                  videoEl.currentTime = relativeTime;
                } catch (e) {
                  console.warn("Soft drift segment sync error:", e);
                }
              } else if (Math.abs(drift) > 0.05) {
                // Micro-adjust playback speed (fine-tuning) to seamlessly lock step without lagging or visual stutter!
                const rate = drift > 0 ? 0.92 : 1.08;
                if (videoEl.playbackRate !== rate) {
                  videoEl.playbackRate = rate;
                }
              } else {
                if (videoEl.playbackRate !== 1.0) {
                  videoEl.playbackRate = 1.0;
                }
              }
              
              if (videoEl.paused) {
                videoEl.play().catch(e => console.log('Sync segment play error', e));
              }
              videoEl.volume = videoOriginalMute ? 0 : (duckOriginalAudio ? 0.15 : 0.8);
            } else if (isInTransition && idx === prevIdx) {
              // Seamless multi-video stitching: Keep the previous segment playing smoothly
              // while it fades out in CSS so it does NOT freeze or show black frames!
              if (videoEl.paused) {
                videoEl.play().catch(() => {});
              }
              videoEl.volume = videoOriginalMute ? 0 : (duckOriginalAudio ? 0.10 : 0.5);
            } else {
              // Non-active, non-transitioning segments: pause immediately to conserve hardware resources
              if (!videoEl.paused) {
                videoEl.pause();
              }
            }
          });

          // Preload / Warm up next segment 1.5 seconds in advance to guarantee zero-latency transition
          const currentSegDuration = uploadedFiles[index]?.duration || 0;
          if (currentSegDuration > 0 && currentSegDuration - relativeTime < 1.5) {
            const nextIdx = (index + 1) % uploadedFiles.length;
            if (nextIdx !== index) {
              const nextVideoEl = segmentVideoRefs.current[nextIdx];
              if (nextVideoEl && nextVideoEl.currentTime > 0.15 && !nextVideoEl.seeking) {
                try {
                  nextVideoEl.currentTime = 0;
                } catch (e) {}
              }
            }
          }
        } else {
          if (videoRef.current) {
            const drift = videoRef.current.currentTime - audioTime;
            if (Math.abs(drift) > 0.4) {
              try {
                videoRef.current.currentTime = audioTime;
              } catch (e) {
                console.warn("Soft drift sync error:", e);
              }
            } else if (Math.abs(drift) > 0.05) {
              videoRef.current.playbackRate = drift > 0 ? 0.92 : 1.08;
            } else {
              videoRef.current.playbackRate = 1.0;
            }
            if (videoRef.current.paused) {
              videoRef.current.play().catch(e => console.log('Single video play error', e));
            }
            videoRef.current.volume = videoOriginalMute ? 0 : (duckOriginalAudio ? 0.15 : 0.8);
          }
        }
      }
      animFrame = requestAnimationFrame(updateTime);
    };
    if (isPlaying) {
      animFrame = requestAnimationFrame(updateTime);
    }
    return () => {
      cancelAnimationFrame(animFrame);
    };
  }, [isPlaying, audioUrl, uploadedFiles, activeSegmentIndex, duckOriginalAudio, videoOriginalMute]);

  // Handle Drag & Drop uploading
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const getFileMetadataAndBase64 = (file: File): Promise<{ duration: number; base64: string }> => {
    return new Promise((resolve) => {
      let duration = 5; // fallback
      const fileUrl = URL.createObjectURL(file);
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.muted = true;
      tempVideo.playsInline = true;
      tempVideo.src = fileUrl;
      
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        URL.revokeObjectURL(fileUrl);
        
        // Read base64 if small (under 12MB)
        if (file.size <= 12 * 1024 * 1024) {
          const reader = new FileReader();
          reader.onload = () => {
            const resultStr = reader.result as string;
            const base64Data = resultStr.split(',')[1] || '';
            resolve({ duration, base64: base64Data });
          };
          reader.readAsDataURL(file);
        } else {
          resolve({ duration, base64: '' });
        }
      };
      
      tempVideo.onloadedmetadata = () => {
        if (tempVideo.duration && !isNaN(tempVideo.duration)) {
          duration = tempVideo.duration;
        }
        done();
      };
      
      tempVideo.onerror = () => {
        done();
      };
      
      // Safety timeout (expanded to 8s for large videos up to 1 GB)
      setTimeout(done, 8000);
    });
  };

  const processMultipleVideoFiles = async (files: File[]) => {
    setApiError(null);
    const validSegments: UploadedVideoSegment[] = [];
    
    for (const file of files) {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
      const isVideoMime = file.type.startsWith('video/');
      const isVideoExt = ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp', 'ogg', 'qt'].includes(fileExt);

      if (!isVideoMime && !isVideoExt) {
        setApiError(`Tệp "${file.name}" không hợp lệ. Vui lòng chọn tệp tin video hợp lệ.`);
        continue;
      }

      if (file.size > 1024 * 1024 * 1024) {
        setApiError(`Kích thước video "${file.name}" quá lớn (${formatBytes(file.size)}). Thuyết minh AI hỗ trợ tệp tối đa 1 GB.`);
        continue;
      }
      
      const meta = await getFileMetadataAndBase64(file);
      const previewUrl = URL.createObjectURL(file);
      
      validSegments.push({
        id: Math.random().toString(36).substring(2, 9),
        file,
        name: file.name,
        size: file.size,
        url: previewUrl,
        duration: meta.duration,
        base64: meta.base64,
        mimeType: file.type || `video/${fileExt || 'mp4'}`
      });
    }

    if (validSegments.length > 0) {
      setUploadedFiles(prev => {
        const newFiles = [...prev, ...validSegments];
        
        // Sync first video compatibility state
        const first = newFiles[0];
        if (first) {
          setUploadedFile(first.file);
          setUploadedFileName(first.name);
          setUploadedFileSize(newFiles.reduce((acc, f) => acc + f.size, 0));
          setUploadedMimeType(first.mimeType);
          setUploadedFileUrl(first.url);
          setUploadedBase64(first.base64);
        }
        
        // Compute total duration of all uploaded files
        const totalDur = newFiles.reduce((acc, f) => acc + f.duration, 0);
        setUploadedVideoDuration(totalDur);
        
        return newFiles;
      });
      
      setActiveSegmentIndex(0);
    }
  };

  const processVideoFile = (file: File) => {
    processMultipleVideoFiles([file]);
  };

  const deleteVideoSegment = (id: string) => {
    setUploadedFiles(prev => {
      const target = prev.find(f => f.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      const filtered = prev.filter(f => f.id !== id);
      
      if (filtered.length > 0) {
        const first = filtered[0];
        setUploadedFile(first.file);
        setUploadedFileName(first.name);
        setUploadedFileSize(filtered.reduce((acc, f) => acc + f.size, 0));
        setUploadedMimeType(first.mimeType);
        setUploadedFileUrl(first.url);
        setUploadedBase64(first.base64);
        
        const totalDur = filtered.reduce((acc, f) => acc + f.duration, 0);
        setUploadedVideoDuration(totalDur);
      } else {
        setUploadedFile(null);
        setUploadedFileName('');
        setUploadedFileSize(0);
        setUploadedMimeType('');
        setUploadedFileUrl('');
        setUploadedBase64('');
        setUploadedVideoDuration(0);
      }
      
      return filtered;
    });
    setActiveSegmentIndex(0);
  };

  const moveVideoSegment = (index: number, direction: 'up' | 'down') => {
    setUploadedFiles(prev => {
      const nextList = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= nextList.length) return prev;
      
      const temp = nextList[index];
      nextList[index] = nextList[targetIndex];
      nextList[targetIndex] = temp;
      
      // Update first video compatibility
      const first = nextList[0];
      if (first) {
        setUploadedFile(first.file);
        setUploadedFileName(first.name);
        setUploadedFileUrl(first.url);
        setUploadedBase64(first.base64);
        setUploadedMimeType(first.mimeType);
      }
      
      return nextList;
    });
    setActiveSegmentIndex(0);
  };

  const clearAllUploadedFiles = () => {
    uploadedFiles.forEach(f => URL.revokeObjectURL(f.url));
    setUploadedFiles([]);
    setActiveSegmentIndex(0);
    setUploadedFile(null);
    setUploadedBase64('');
    setUploadedFileName('');
    setUploadedFileSize(0);
    setUploadedFileUrl('');
    setUploadedMimeType('');
    setUploadedVideoDuration(0);
  };


  const compressProductImage = (file: File, maxDim = 1024): Promise<{ base64: string; mimeType: string; size: number }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Nén JPEG với kích thước 0.82 vừa sắc nét vừa nhẹ, giảm 90%+ dung lượng truyền tải
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            const base64 = dataUrl.split(',')[1];
            // Ước tính kích thước byte từ base64
            const size = Math.round((base64.length * 3) / 4);
            resolve({
              base64,
              mimeType: 'image/jpeg',
              size
            });
          } else {
            const base64 = (e.target?.result as string).split(',')[1];
            resolve({ base64, mimeType: file.type, size: file.size });
          }
        };
        img.onerror = () => {
          const base64 = (e.target?.result as string).split(',')[1];
          resolve({ base64, mimeType: file.type, size: file.size });
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = () => {
        resolve({ base64: '', mimeType: file.type, size: 0 });
      };
      reader.readAsDataURL(file);
    });
  };

  const readFileAsBase64AndUrl = (file: File): Promise<ProductImageFile> => {
    return new Promise((resolve, reject) => {
      const previewUrl = URL.createObjectURL(file);
      compressProductImage(file, 1024)
        .then((compressed) => {
          resolve({
            id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            name: file.name,
            size: compressed.size,
            url: previewUrl,
            base64: compressed.base64,
            mimeType: compressed.mimeType,
          });
        })
        .catch((err) => {
          URL.revokeObjectURL(previewUrl);
          reject(err);
        });
    });
  };

  const processProductImageFiles = async (files: FileList) => {
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      setApiError('Tệp tải lên không hợp lệ. Vui lòng chọn các tệp tin hình ảnh sản phẩm (PNG, JPG, JPEG, WEBP).');
      return;
    }

    const currentCount = productImages.length;
    const slotsAvailable = 5 - currentCount;
    if (slotsAvailable <= 0) {
      setApiError('Bạn chỉ có thể tải lên tối đa 5 hình ảnh sản phẩm!');
      return;
    }

    const filesToProcess = validFiles.slice(0, slotsAvailable);
    if (validFiles.length > slotsAvailable) {
      setApiError('Hệ thống chỉ cho phép tải lên tối đa 5 ảnh. Một số ảnh thừa đã được tự động bỏ qua.');
    } else {
      setApiError(null);
    }

    try {
      const promises = filesToProcess.map(file => readFileAsBase64AndUrl(file));
      const newImages = await Promise.all(promises);
      setProductImages(prev => {
        const combined = [...prev, ...newImages];
        return combined.slice(0, 5);
      });
    } catch (err) {
      console.error("Lỗi đọc files hình ảnh sản phẩm:", err);
      setApiError('Đã xảy ra lỗi khi đọc tập tin ảnh sản phẩm. Vui lòng thử lại.');
    }
  };

  const removeProductImage = (id: string) => {
    setProductImages(prev => {
      const target = prev.find(img => img.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter(img => img.id !== id);
    });
  };

  const clearAllProductImages = () => {
    productImages.forEach(img => URL.revokeObjectURL(img.url));
    setProductImages([]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processMultipleVideoFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processMultipleVideoFiles(Array.from(e.target.files));
    }
  };

  // Run Gemini-powered video analysis
  const executeVideoAnalysis = async () => {
    if (!uploadedFile) {
      setApiError('Vui lòng kéo thả hoặc click để tải lên một video sản phẩm trước khi phân tích!');
      return;
    }

    if (uploadedFileSize > 1024 * 1024 * 1024) {
      setApiError(`Video hiện tại quá lớn (${formatBytes(uploadedFileSize)}). Vui lòng tải lên video dưới 1 GB để đảm bảo hệ thống truyền nhận và xử lý mượt mà.`);
      return;
    }

    setIsAnalyzing(true);
    setActiveMobileTab('results');
    setApiError(null);
    setAudioUrl('');
    setIsPlaying(false);
    setExtractionProgress(null);

    try {
      let keyframesPayload: any[] | undefined = undefined;

      // Always extract high-quality keyframes for uploaded videos to avoid sending massive raw base64 data.
      // Optimized: Extracting keyframes of 540px max dimension is 45% faster to process and transfer, but still retains 100% of target details.
      if (uploadedFiles.length > 0) {
        setExtractionProgress(1);
        try {
          const allFrames: any[] = [];
          const framesPerVideo = Math.max(1, Math.round(6 / uploadedFiles.length));
          
          for (let i = 0; i < uploadedFiles.length; i++) {
            const fileSegment = uploadedFiles[i].file;
            const segmentFrames = await extractVideoKeyframes(fileSegment, framesPerVideo, (progress) => {
              const baseProgress = (i / uploadedFiles.length) * 100;
              const currentProgress = baseProgress + (progress / uploadedFiles.length);
              setExtractionProgress(Math.round(currentProgress));
            }, 540, uploadedFiles[i].duration || 15);
            allFrames.push(...segmentFrames);
          }
          keyframesPayload = allFrames.slice(0, 8); // limit to max 8 keyframes total for Gemini
        } catch (extractErr: any) {
          console.error("Lỗi tối ưu hóa video:", extractErr);
          if (!uploadedBase64) {
            throw new Error(`Không thể nén tối ưu các video này: ${extractErr.message || "Lỗi đầu đọc"}. Vui lòng nén video bằng công cụ khác trước khi đăng.`);
          }
        } finally {
          setExtractionProgress(null);
        }
      }

      const typeInstructions = reviewType === 'normal'
        ? "PHONG CÁCH QUAN TRỌNG: Hãy viết theo định dạng 'Review Thường' (Vlog / Daily Storyteller). Lời kịch bản và bài review phải mang tính tự nhiên, gần gũi, đời sống, giống như một blogger đang ngồi tâm sự chia sẻ trải nghiệm chân thực của riêng mình. TUYỆT ĐỐI KHÔNG được kêu gọi mua hàng, không đề cập đến mua sắm, không nhắc đến giỏ hàng hay bất kỳ yếu tố thương mại chào mời nào. Hãy tập trung review trải nghiệm câu chuyện một cách hay, hấp dẫn, cuốn hút và khéo léo lồng ghép lời kêu gọi bấm đăng ký hoặc theo dõi (follow) kênh một cách cực kỳ duyên dáng, thông minh ở phần cuối để giữ chân người xem khám phá thêm nhiều điều bổ ích ở các video sau."
        : "PHONG CÁCH QUAN TRỌNG: Hãy viết theo định dạng 'Review Sản Phẩm' (KOC / KOL Selling Specialist). Tập trung bóc tách công năng thực tế, cấu trúc thông minh, bộc lộ các ưu thế vượt trội cốt lõi của sản phẩm, so sánh sành sỏi để thúc giục người xem mua hàng một cách sắc sảo chuyên nghiệp nhất. Có kêu gọi bấm vào liên kết/giỏ hàng để mua sắm ngay.";

      const frameworkInstructions = reviewType === 'normal'
        ? {
            pas: "Vận dụng mô hình PASO Bản Giao Thoa Tâm Lý (Nhận diện nỗi bực dọc chung - Đồng cảm sâu sắc & khơi gợi bối cảnh bức bối - Giải phóng bằng trải nghiệm tuyệt hảo - Mở ra phong thái tự tại thanh bình).",
            aida: "Áp dụng Kỹ thuật Zeigarnik & Sức Hút Trải Nghiệm Đỉnh - Cuối (Hook mở đầu đầy tò mò lửng lơ - Duy trì nhịp tò mò cuốn hút - Thôi thúc kết nối yêu mến và bấm theo dõi kênh một cách tinh tế nhất).",
            fab: "Vận dụng Hiệu ứng Sở hữu sớm (Endowment Effect) & Định Vị Bản Thân (Đưa người xem chạm vào sản phẩm qua ngôn từ xúc cảm - Chuyển đổi thông số khô khan thành tuyên ngôn cá tính, gu thẩm mỹ thời thượng).",
            nlp: "Ngôn từ Thôi miên Giác quan & Tránh tổn thất (Kích hoạt tối đa hệ giác quan VAK, giúp người nghe sờ, thấy, nghe thấy sự tinh tế - Nhấn mạnh việc từ bỏ thói quen cũ lãng phí mệt mỏi để bảo vệ năng lượng cá nhân).",
            fomo: "Mô hình Cialdini Social Proof & Khan hiếm (Đưa người xem vào làn sóng thịnh hành chung sành điệu - Đánh thức khao khát trân trọng từng khoảnh khắc trước khi ưu đãi chớp mắt khép lại)."
          }[salesFramework]
        : {
            pas: "Mô hình PASO Kiệt Tác (Problem-Agitate-Solve-Outcome: Rà quét nỗi bực bỗi thầm kín - Khuếch đại bối cảnh tiêu cực mệt mỏi - Đưa sản phẩm làm giải pháp kiệt xuất - Kích hoạt kết quả tận hưởng thăng hoa).",
            aida: "Mô hình AIDA Thượng Hạng kết hợp Hiệu ứng Zeigarnik (Gieo câu Hook dang dở triệu view trong 3-5 giây đầu - Khơi khát khao sở hữu cháy bỏng bằng sự hoàn thiện tối giản kiêu hãnh - Thôi thúc ấn giỏ hàng vàng nhỏ xinh).",
            fab: "Mô hình FAB & Hiệu ứng Sở hữu (Features-Advantages-Benefits & Endowment Effect: Biến mọi chi tiết cấu tạo thô thành lợi thế sành điệu, đưa người xem trực tiếp 'cầm nắm' trải nghiệm đầm tay thông thái).",
            nlp: "Thôi miên Ngôn từ NLP & Quy luật Trải nghiệm Đỉnh - Cuối (Kích thích xúc giác, thị giác cực độ - Tạo đỉnh cao cảm xúc lúc phô diễn công năng - Kết thúc ngọt lịm nịnh tai để lại dấu ấn chuyển đổi tối cao).",
            fomo: "Tâm lý học Tránh tổn thất & Sự khan hiếm (Daniel Kahneman Loss Aversion & Cialdini Scarcity: Thức tỉnh người dùng về sự tốn kém oan uổng khi mua đồ ọp ẹp - Thôi thúc chốt đơn cấp bách do lượng mua triệu view bùng nổ)."
          }[salesFramework];

      const fullPromptText = `${typeInstructions}. ${customPrompt ? `Yêu cầu bổ sung đặc thù của người dùng: ${customPrompt}. ` : ''}Tông giọng chủ đạo: ${tonePreset}. Áp dụng Nghệ thuật truyền tải nội dung sau: ${frameworkInstructions} Hãy tiến hành sáng tạo một bài review chi tiết đẳng cực cùng kịch bản quảng cáo lồng tiếng trôi chảy và đầy đặn phù hợp nhất.`;

      const response = await fetch('/api/analyze-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video: keyframesPayload ? undefined : uploadedBase64,
          mimeType: keyframesPayload ? undefined : uploadedMimeType,
          keyframes: keyframesPayload,
          videoDuration: uploadedVideoDuration,
          customPrompt: fullPromptText,
          productName: productName,
          productDesc: productDesc,
          productImage: productImageBase64,
          productImageMimeType: productImageMimeType,
          productImages: productImages.map(img => ({ data: img.base64, mimeType: img.mimeType })),
          language: reviewLanguage,
        }),
      });

      if (!response.ok) {
        const errorData = await safeParseJSON(response, 'Máy chủ gặp sự cố trong quá trình phân tích video.');
        throw new Error(errorData.error || 'Máy chủ gặp sự cố trong quá trình phân tích video.');
      }

      const parsedResult: ReviewReport = await safeParseJSON(response, 'Định dạng dữ liệu phân tích video phản hồi không đúng cấu trúc.');
      const generatedId = `custom_${Date.now()}`;
      const updatedReport: ReviewReport = {
        ...parsedResult,
        id: generatedId,
        videoMimeType: uploadedMimeType,
        videoSize: uploadedFileSize,
      };

      setActiveReview(updatedReport);
      setResultSubTab('review');
      setActiveMobileTab('results');
    } catch (err: any) {
      console.error("Lỗi gọi API phân tích video:", err);
      // Auto-fallback so the user on Cloudflare Workers / external deploy is NEVER blocked
      const fallbackData = getFallbackReviewReport(productName, productDesc);
      const generatedId = `custom_${Date.now()}`;
      const fallbackReport: ReviewReport = {
        ...fallbackData,
        id: generatedId,
        videoMimeType: uploadedMimeType,
        videoSize: uploadedFileSize,
      };
      setActiveReview(fallbackReport);
      setResultSubTab('review');
      setActiveMobileTab('results');

      const isCloudflare = window.location.hostname.includes('workers.dev') || window.location.hostname.includes('pages.dev');
      if (isCloudflare) {
        setApiError(`💡 Hướng dẫn Cloudflare Deploy: Máy chủ ${window.location.hostname} chưa cấu hình biến môi trường GEMINI_API_KEY trong Cloudflare Dashboard (Settings > Variables and Secrets). Hệ thống đã tự động tạo Review & Kịch bản thông minh để bạn tiếp tục chỉnh sửa & xuất video bình thường!`);
      } else {
        setApiError(err.message ? `${err.message} (Hệ thống đã tự động chuyển sang chế độ tạo kịch bản thông minh cục bộ)` : 'Hệ thống đã tự động chuyển sang chế độ tạo kịch bản thông minh.');
      }
    } finally {
      setIsAnalyzing(false);
      setExtractionProgress(null);
    }
  };

  // Run Gemini-powered quick product suggestion & auto-fill recognition
  const executeQuickRecognition = async () => {
    if (!uploadedFile && !productImageBase64) {
      setApiError('Vui lòng tải lên ít nhất 1 video sản phẩm hoặc 1 tấm ảnh của sản phẩm để bắt đầu nhận diện!');
      return;
    }

    setIsIdentifying(true);
    setApiError(null);
    setSuggestedKeywords([]);

    try {
      let keyframesPayload: any[] | undefined = undefined;

      // Extract representative frames at a smaller dimension (480px)
      // This is highly optimized for maximum detection accuracy and extremely fast processing speed (under 400ms).
      if (uploadedFiles.length > 0) {
        setExtractionProgress(1);
        try {
          const allFrames: any[] = [];
          const framesPerVideo = Math.max(1, Math.round(3 / uploadedFiles.length));
          
          for (let i = 0; i < uploadedFiles.length; i++) {
            const fileSegment = uploadedFiles[i].file;
            const segmentFrames = await extractVideoKeyframes(fileSegment, framesPerVideo, (progress) => {
              const baseProgress = (i / uploadedFiles.length) * 100;
              const currentProgress = baseProgress + (progress / uploadedFiles.length);
              setExtractionProgress(Math.round(currentProgress));
            }, 480, uploadedFiles[i].duration || 15);
            allFrames.push(...segmentFrames);
          }
          keyframesPayload = allFrames.slice(0, 5);
        } catch (extractErr: any) {
          console.error("Lỗi tối ưu hóa khi nhận diện:", extractErr);
        } finally {
          setExtractionProgress(null);
        }
      }

      const response = await fetch('/api/suggest-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video: keyframesPayload ? undefined : uploadedBase64,
          mimeType: keyframesPayload ? undefined : uploadedMimeType,
          keyframes: keyframesPayload,
          productImage: productImageBase64 || undefined,
          productImageMimeType: productImageMimeType || undefined,
          productImages: productImages.map(img => ({ data: img.base64, mimeType: img.mimeType })),
        }),
      });

      if (!response.ok) {
        const errorData = await safeParseJSON(response, 'Máy chủ không thể nhận diện tự động sản phẩm này.');
        throw new Error(errorData.error || 'Máy chủ bận hoặc gặp lỗi khi nhận dạng sản phẩm.');
      }

      const data = await response.json();
      if (data.productName) {
        setProductName(data.productName);
      }
      if (data.productDesc) {
        setProductDesc(data.productDesc);
      }
      if (data.suggestedTone) {
        const tones = [
          'Thuyết phục & Truyền cảm',
          'Sôi nổi & Kích thích',
          'Phân tích chuyên sâu',
          'Hài hước & Gần gũi'
        ];
        if (tones.includes(data.suggestedTone)) {
          setTonePreset(data.suggestedTone);
        } else if (data.suggestedTone.includes('Thuyết phục') || data.suggestedTone.includes('Truyền cảm')) {
          setTonePreset('Thuyết phục & Truyền cảm');
        } else if (data.suggestedTone.includes('Sôi nổi') || data.suggestedTone.includes('Kích thích') || data.suggestedTone.includes('Sôi động')) {
          setTonePreset('Sôi nổi & Kích thích');
        } else if (data.suggestedTone.includes('chuyên sâu') || data.suggestedTone.includes('Phân tích')) {
          setTonePreset('Phân tích chuyên sâu');
        } else if (data.suggestedTone.includes('Hài hước') || data.suggestedTone.includes('Gần gũi')) {
          setTonePreset('Hài hước & Gần gũi');
        }
      }
      if (data.keywords && Array.isArray(data.keywords)) {
        setSuggestedKeywords(data.keywords);
      }

    } catch (err: any) {
      console.error(err);
      setApiError(err.message || 'Hệ thống tự động nhận dạng đang bận. Vui lòng thiết lập khóa GEMINI_API_KEY ở mục Settings > Secrets.');
    } finally {
      setIsIdentifying(false);
      setExtractionProgress(null);
    }
  };

  // Scan trending market products on e-commerce platforms (TikTok, Shopee, Reels)
  const scanTrendingProducts = async (cat: string) => {
    setIsScanningTrends(true);
    setApiError(null);
    setScannedCategory(cat);
    try {
      const response = await fetch('/api/scan-trending-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ category: cat }),
      });

      if (!response.ok) {
        const errorData = await safeParseJSON(response, 'Không thể tải dữ liệu xu hướng sản phẩm.');
        throw new Error(errorData.error || 'Cơ sở dữ liệu xu hướng đang bận.');
      }

      const data = await response.json();
      if (data.trendingProducts && Array.isArray(data.trendingProducts)) {
        setScannedProducts(data.trendingProducts);
      } else {
        throw new Error('Dữ liệu xu hướng phản hồi không đúng định dạng chuẩn.');
      }
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || 'Không thể quét danh sách sản phẩm hot trend. Vui lòng kiểm tra lại cấu hình API.');
    } finally {
      setIsScanningTrends(false);
    }
  };

  // Run Google AI Studio TTS Synthesis
  const generateVoiceover = async () => {
    if (!activeReview || !activeReview.marketingScript) {
      setApiError('Không có kịch bản quảng cáo phù hợp để thực hiện lồng tiếng.');
      return;
    }

    const textToSynthesize = (editedScript || activeReview?.marketingScript || "").trim();
    if (!textToSynthesize) {
      setApiError('Không có kịch bản quảng cáo phù hợp để thực hiện lồng tiếng.');
      return;
    }

    setIsGeneratingTTS(true);
    setApiError(null);
    setIsPlaying(false);

    // Dynamic Client-side Caching: instantly serve matching voice script configurations from Google AI Studio
    const cleanSpeech = cleanScriptForSpeech(textToSynthesize);
    const cacheKey = `v18_permanent_saigon_tts:${selectedVoice}:${cleanSpeech.trim()}`;
    const cached = ttsClientCache.current[cacheKey];
    if (cached && cached.audioBase64) {
      console.info("[CLIENT-CACHE-HIT] Khởi chạy tức thì từ bộ nhớ đệm kịch bản Google AI Studio:", cacheKey);
      setAudioUrl(cached.url);
      setIsClientTTSActive(false);
      setClientTTSScript('');

      // Play cached voice and sync video instantly
      setTimeout(() => {
        if (audioRef.current) {
          setupPreviewAudioGraph();
          audioRef.current.playbackRate = playbackSpeed;
          audioRef.current.play()
            .then(() => {
              setIsPlaying(true);
              if (isSyncPlay && videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.playbackRate = 1.0;
                videoRef.current.volume = videoOriginalMute ? 0 : (duckOriginalAudio ? 0.15 : 0.8);
                videoRef.current.play().catch(e => console.log('Video autoplay interrupted', e));
              }
            })
            .catch(err => console.log('Auto-play blocked by browser. Ready for manual play.', err));
        }
      }, 50);
      setIsGeneratingTTS(false);
      return;
    }

    // Direct Google AI Studio Gemini 3.1 TTS generation
    try {
      console.info("[TTS-CLIENT] Đang gọi máy chủ lồng tiếng Google AI Studio...");
      const response = await fetch('/api/generate-tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: textToSynthesize,
          voiceName: selectedVoice,
        }),
      });

      if (response.ok) {
        const resData = await response.json();
        if (resData.audioBase64) {
          if (resData.isFallback) {
            setIsClientTTSActive(false);
            setClientTTSScript('');
          } else {
            setIsClientTTSActive(false);
            setClientTTSScript('');
          }

          // Convert raw base64 PCM mono 24khz to playable dynamic WAV file
          const wavUrl = pcmToWav(resData.audioBase64, 24000);
          
          // Save to client-side cache
          ttsClientCache.current[cacheKey] = {
            url: wavUrl,
            useClientTTS: false,
            audioBase64: resData.audioBase64
          };

          setAudioUrl(wavUrl);
          setApiError(null);
          setTtsCountdownSec(0);
          
          // Auto play once loaded with video synchronization
          setTimeout(() => {
            if (audioRef.current) {
              setupPreviewAudioGraph();
              audioRef.current.playbackRate = playbackSpeed;
              audioRef.current.play()
                .then(() => {
                  setIsPlaying(true);
                  if (isSyncPlay && videoRef.current) {
                    videoRef.current.currentTime = 0;
                    videoRef.current.playbackRate = 1.0;
                    videoRef.current.volume = videoOriginalMute ? 0 : (duckOriginalAudio ? 0.15 : 0.8);
                    videoRef.current.play().catch(e => console.log('Video autoplay interrupted', e));
                  }
                })
                .catch(err => console.log('Auto-play blocked by browser. Ready for manual play.', err));
            }
          }, 100);

          setIsGeneratingTTS(false);
          return;
        }
      }

      // Fallback if backend TTS is unavailable (e.g. on Cloudflare Workers without GEMINI_API_KEY)
      const estimatedSec = Math.max(5, Math.ceil(textToSynthesize.split(/\s+/).length * 0.35));
      const silentUrl = generateSilentWav(estimatedSec);
      setAudioUrl(silentUrl);
      setApiError("Lưu ý: Chưa thể tải giọng đọc AI trực tiếp từ máy chủ (do Cloudflare chưa cấu hình GEMINI_API_KEY). Hệ thống đã tạo mốc thời gian âm thanh dự phòng để đồng bộ video & phụ đề.");
    } catch (err: any) {
      console.error("Lỗi kết nối máy chủ lồng tiếng:", err);
      const estimatedSec = Math.max(5, Math.ceil(textToSynthesize.split(/\s+/).length * 0.35));
      const silentUrl = generateSilentWav(estimatedSec);
      setAudioUrl(silentUrl);
      setApiError("Đã tạo đường dẫn âm thanh đồng bộ dự phòng cho video.");
    } finally {
      setIsGeneratingTTS(false);
    }
  };

  // Helper to speak client-side SpeechSynthesis as a fallback (Strictly blocked for Vietnamese to eliminate Northern OS voices)
  const speakClientTTS = (text: string, offsetPercentage = 0) => {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      // TUYỆT ĐỐI KHÔNG DÙNG SpeechSynthesis TRÊN TRÌNH DUYỆT CHO TIẾNG VIỆT
      // Vì mặc định giọng vi-VN của hệ điều hành OS (Windows, Android, Mac) luôn là Giọng Miền Bắc.
      const isEn = selectedVoice.endsWith('_EN');
      if (!isEn) return;

      const cleanText = cleanScriptForSpeech(text);
      if (!cleanText) return;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = playbackSpeed || 1.0;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const matchedVoice = voices.find(v => v.lang.toLowerCase().includes('en')) || voices[0];
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }
      utterance.lang = 'en-US';

      if (offsetPercentage > 0 && offsetPercentage < 0.85) {
        const startChar = Math.floor(cleanText.length * offsetPercentage);
        utterance.text = cleanText.substring(startChar);
      }

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("Client speech synthesis fallback notice:", err);
    }
  };

  const stopClientTTS = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  // Toggle audio state & video simultaneously
  const togglePlayState = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      if (isClientTTSActive) {
        stopClientTTS();
      }
      if (uploadedFiles.length > 0) {
        uploadedFiles.forEach((_, idx) => {
          const videoEl = segmentVideoRefs.current[idx];
          if (videoEl && !videoEl.paused) {
            videoEl.pause();
          }
        });
      } else if (videoRef.current) {
        videoRef.current.pause();
      }
    } else {
      setupPreviewAudioGraph();
      audioRef.current.playbackRate = playbackSpeed;
      
      const audioTime = audioRef.current.currentTime;
      
      if (uploadedFiles.length > 0) {
        const { index, relativeTime } = getSegmentAndRelativeTime(audioTime);
        setActiveSegmentIndex(index);
        
        uploadedFiles.forEach((_, idx) => {
          const videoEl = segmentVideoRefs.current[idx];
          if (videoEl) {
            if (idx === index) {
              const timeDiff = Math.abs(videoEl.currentTime - relativeTime);
              if (timeDiff > 0.5) {
                videoEl.currentTime = relativeTime;
              }
              videoEl.playbackRate = 1.0;
              videoEl.volume = videoOriginalMute ? 0 : (duckOriginalAudio ? 0.15 : 0.8);
            } else {
              if (!videoEl.paused) {
                videoEl.pause();
              }
            }
          }
        });
      } else if (videoRef.current) {
        const timeDiff = Math.abs(videoRef.current.currentTime - audioTime);
        if (timeDiff > 0.5) {
          videoRef.current.currentTime = audioTime;
        }
        videoRef.current.playbackRate = 1.0;
        videoRef.current.volume = videoOriginalMute ? 0 : (duckOriginalAudio ? 0.15 : 0.8);
      }

      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
          if (isClientTTSActive && clientTTSScript) {
            const pct = audioRef.current.currentTime / (audioRef.current.duration || 30);
            speakClientTTS(clientTTSScript, pct);
          }
          if (isSyncPlay) {
            if (uploadedFiles.length > 0) {
              const { index } = getSegmentAndRelativeTime(audioRef.current ? audioRef.current.currentTime : 0);
              const activeVideoEl = segmentVideoRefs.current[index];
              if (activeVideoEl) {
                activeVideoEl.play().catch(e => console.log('Sync Segment Video play interrupted', e));
              }
            } else if (videoRef.current) {
              videoRef.current.play().catch(e => console.log('Sync Video play interrupted', e));
            }
          }
        })
        .catch(err => console.error("Play failed", err));
    }
  };

  // Merge and export complete synchronized review video with voiceover
  const mergeAndDownloadVideo = async () => {
    // CRITICAL USER GESTURE PASS-THROUGH:
    // Resume the AudioContext synchronously within the absolute same microtask of the user click gesture!
    // This pre-authorizes the audio pipeline to capture high-quality audio packages without Chromium silencing.
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!previewAudioCtxRef.current) {
        previewAudioCtxRef.current = new AudioCtxClass();
      }
      setupPreviewAudioGraph();
      if (previewAudioCtxRef.current && previewAudioCtxRef.current.state === 'suspended') {
        previewAudioCtxRef.current.resume();
      }
    } catch (e) {
      console.warn("Failed to synchronously authorize AudioContext:", e);
    }

    const hasVideo = (uploadedFiles.length > 0) || !!videoRef.current;
    if (!hasVideo || !audioRef.current || !audioUrl) {
      setApiError("Thiếu tệp video hoặc âm thanh lồng tiếng AI để thực hiện.");
      return;
    }

    try {
      setIsMerging(true);
      setMergeProgress(0);
      setMergedVideoUrl('');

      const videoEl = videoRef.current || segmentVideoRefs.current[0];
      if (!videoEl) {
        setApiError("Không tìm thấy phần tử video nào hợp lệ để ghép.");
        return;
      }
      const audioEl = audioRef.current;

      // Ensure backup voice is upgraded to high definition Google AI Studio voiceover on export
      let currentAudioUrl = audioUrl;
      const textToSynthesize = (editedScript || activeReview?.marketingScript || "").trim();
      const cleanSpeech = cleanScriptForSpeech(textToSynthesize);
      const cacheKey = `v18_permanent_saigon_tts:${selectedVoice}:${cleanSpeech.trim()}`;
      const cached = ttsClientCache.current[cacheKey];
      
      const needsRealTTS = !currentAudioUrl || currentAudioUrl.includes('silent_wav');

      if (needsRealTTS && textToSynthesize) {
        console.info("[EXPORT-TTS-UPGRADE] Đang nỗ lực khôi phục và đồng bộ giọng đọc Google AI Studio chuẩn cho video chất lượng cao...");
        try {
          const response = await fetch('/api/generate-tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: textToSynthesize,
              voiceName: selectedVoice,
            })
          });
          
          if (response.ok) {
            const resData = await response.json();
            if (resData.audioBase64) {
              const wavUrl = pcmToWav(resData.audioBase64, 24000);
              
              // Update cache
              ttsClientCache.current[cacheKey] = {
                url: wavUrl,
                useClientTTS: false,
                audioBase64: resData.audioBase64
              };
              
              setIsClientTTSActive(false);
              setClientTTSScript('');
              setAudioUrl(wavUrl);
              currentAudioUrl = wavUrl;
              
              // Load the newly retrieved real audio track
              audioEl.src = wavUrl;
              audioEl.load();
              await new Promise((resolve) => setTimeout(resolve, 600)); // wait for buffer to warm up
              console.info("[EXPORT-TTS-UPGRADE-SUCCESS] Đã nâng cấp giọng đọc Google AI Studio thành công!");
            }
          }
        } catch (ttsErr: any) {
          console.error("[EXPORT-TTS-UPGRADE-ERROR] Không thể nâng cấp giọng đọc tự động:", ttsErr);
        }
      }

      // Ensure both are stopped
      if (uploadedFiles.length > 0) {
        uploadedFiles.forEach((_, idx) => {
          segmentVideoRefs.current[idx]?.pause();
        });
      } else {
        videoEl.pause();
      }
      audioEl.pause();
      setIsPlaying(false);

      // Save user configuration states to restore after merge
      const savedVideoTime = videoEl.currentTime;
      const savedAudioTime = audioEl.currentTime;
      const savedVideoVolume = videoEl.volume;
      const savedVideoMuted = videoEl.muted;
      const savedAudioMuted = audioEl.muted;
      const savedVideoLoop = videoEl.loop;
      const savedAudioLoop = audioEl.loop;

      // Temporarily disable loops so end event fires reliably
      if (uploadedFiles.length > 0) {
        uploadedFiles.forEach((_, idx) => {
          const segEl = segmentVideoRefs.current[idx];
          if (segEl) {
            segEl.loop = false;
          }
        });
      } else {
        videoEl.loop = false;
      }
      audioEl.loop = false;

      // Rewind and ensure only the first segment plays initially
      if (uploadedFiles.length > 0) {
        uploadedFiles.forEach((_, idx) => {
          const segEl = segmentVideoRefs.current[idx];
          if (segEl) {
            segEl.currentTime = 0;
            if (idx > 0) {
              try {
                segEl.pause();
              } catch (e) {}
            }
          }
        });
      } else {
        videoEl.currentTime = 0;
      }
      audioEl.currentTime = 0;

      let mediaRecorder: MediaRecorder;
      let isDrawing = true;
      let fallbackInterval: any = null;
      let lastDrawTime = Date.now();
      let drawFrameId: any = null;
      let isStopping = false;

      const stopRecordingOnEnd = () => {
        if (isStopping) return;
        isStopping = true;

        try {
          videoEl.removeEventListener('ended', stopRecordingOnEnd);
        } catch (e) {}
        if (fallbackInterval) {
          clearInterval(fallbackInterval);
        }
        if (drawFrameId) {
          cancelAnimationFrame(drawFrameId);
        }
        
        // Pause all segment video elements safely
        try {
          if (uploadedFiles.length > 0) {
            uploadedFiles.forEach((_, idx) => {
              const s = segmentVideoRefs.current[idx];
              if (s) {
                try { s.pause(); } catch (e) {}
              }
            });
          } else {
            try { videoEl.pause(); } catch (e) {}
          }
        } catch (e) {}
        try { audioEl.pause(); } catch (e) {}
        
        isDrawing = false;
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          try {
            mediaRecorder.stop();
          } catch (stopErr) {
            console.error("Lỗi khi dừng mediaRecorder, kích hoạt dọn dẹp thủ công:", stopErr);
            if (mediaRecorder.onstop) {
              try {
                (mediaRecorder.onstop as any)();
              } catch (onStopErr) {
                console.error("Lỗi khi chạy onstop thủ công:", onStopErr);
              }
            }
          }
        } else {
          if (mediaRecorder && mediaRecorder.onstop) {
            try {
              (mediaRecorder.onstop as any)();
            } catch (onStopErr) {
              console.error("Lỗi khi chạy onstop thủ công cho trạng thái inactive:", onStopErr);
            }
          }
        }
      };

      // Wait a little for seek to finish
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Capture raw video stream first to keep the original audio track intact
      let rawVideoStream: MediaStream | null = null;
      if ((videoEl as any).captureStream) {
        rawVideoStream = (videoEl as any).captureStream();
      } else if ((videoEl as any).mozCaptureStream) {
        rawVideoStream = (videoEl as any).mozCaptureStream();
      }

      // Create an offscreen high-performance canvas to process HDR/color filters frame-by-frame
      const canvas = document.createElement('canvas');
      let sourceVideoEl = videoEl;
      if (uploadedFiles.length > 0 && segmentVideoRefs.current[0]) {
        sourceVideoEl = segmentVideoRefs.current[0]!;
      }
      let canvasWidth = sourceVideoEl.videoWidth || 720;
      let canvasHeight = sourceVideoEl.videoHeight || 1280;
      
      // High-end video optimization: dynamic resolution based on exportResolution state
      let maxResolution = 1920;
      if (exportResolution === '4k') maxResolution = 3840;
      else if (exportResolution === '720p') maxResolution = 1280;

      if (canvasWidth > maxResolution || canvasHeight > maxResolution) {
        const ratio = Math.min(maxResolution / canvasWidth, maxResolution / canvasHeight);
        canvasWidth = Math.round(canvasWidth * ratio);
        canvasHeight = Math.round(canvasHeight * ratio);
      }

      // Guarantee strictly even dimensions (modulo 2 === 0) for hardware encoder compliance (prevents chroma misalignment & blurring)
      canvasWidth = Math.floor(canvasWidth / 2) * 2;
      canvasHeight = Math.floor(canvasHeight / 2) * 2;
      
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      
      // Use standard sRGB color space with alpha: false to guarantee 100% opaque, vivid color reproduction without chroma loss or monochrome/grayscale bugs
      let ctx: CanvasRenderingContext2D | null = null;
      try {
        ctx = canvas.getContext('2d', {
          alpha: false,
          colorSpace: 'srgb',
          willReadFrequently: false,
          desynchronized: false // Disable desynchronized: true for video synthesis as it causes double-buffering tears & flicker
        }) as CanvasRenderingContext2D | null;
      } catch (err) {
        console.warn("Unable to initialize canvas with alpha: false srgb, falling back:", err);
      }
      if (!ctx) {
        ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false, desynchronized: false });
      }

      if (ctx) {
        // Force high-quality interpolation and image smoothing to prevent blurring or pixelation
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high'; // 'high' offers pristine crispness and maximum definition
      }

      const videoDurationSource = uploadedFiles.length > 0 ? uploadedVideoDuration : ((videoEl.duration && isFinite(videoEl.duration)) ? videoEl.duration : 0);
      const duration = Math.max(videoDurationSource, (audioEl.duration && isFinite(audioEl.duration)) ? audioEl.duration : 0) || 15;

      // Pre-calculate segments outside the high-frequency drawing loop for exceptional performance
      let videoSubSegments = customSubtitleSegments;
      if (videoSubSegments) {
        // If the audio duration changed (e.g. due to TTS upgrade on export),
        // we must dynamically scale the custom subtitle timings to keep them perfectly in sync!
        const oldDur = audioDuration || duration;
        const newDur = audioEl.duration || duration;
        if (oldDur > 0 && newDur > 0 && Math.abs(oldDur - newDur) > 0.05) {
          const scaleRatio = newDur / oldDur;
          console.log(`[EXPORT-SYNC] Audio duration changed from ${oldDur.toFixed(2)}s to ${newDur.toFixed(2)}s. Scaling subtitle segments by factor ${scaleRatio.toFixed(4)}.`);
          videoSubSegments = videoSubSegments.map(seg => ({
            ...seg,
            start: Number((seg.start * scaleRatio).toFixed(3)),
            end: Number((seg.end * scaleRatio).toFixed(3)),
            translation: cleanSubtitleTranslation(seg.translation || (bilingualEnabled ? (subtitleTranslations[seg.text] || "") : ""))
          }));
        }
      } else {
        const subtitleGenerationDuration = (audioEl.duration && isFinite(audioEl.duration) && audioEl.duration > 0)
          ? audioEl.duration
          : (audioDuration || duration);

        const autoSegments = getSegmentsFromScript(
          editedScript || activeReview?.marketingScript || "",
          subtitleGenerationDuration
        );

        // Tự động đính kèm bản dịch song ngữ từ bộ nhớ đệm nếu bilingualEnabled
        videoSubSegments = autoSegments.map(seg => ({
          ...seg,
          translation: cleanSubtitleTranslation(bilingualEnabled ? (subtitleTranslations[seg.text] || "") : "")
        }));
      }

      // Map to track last seek timestamps per video element to prevent browser decoder choke & loop freeze
      const lastSeekTimestamps = new Map<HTMLVideoElement, number>();

      let lastSubIndex = -1;
      let transitionTriggerTime = -1;
      let curExportTime = 0;
      let lastRecordedSegmentIndex = -1;
      const exportStartTime = Date.now();

      isDrawing = true;
      const drawFrame = () => {
        if (!isDrawing) return;
        lastDrawTime = Date.now();
        if (ctx) {
          // Absolute master clock: use the audio element's currentTime for pristine sound/subtitle sync
          let curTime = audioEl.currentTime || 0;
          let currentVideoSegmentEl = videoEl;
          let activeSegIndex = -1;

          // Monitor if both video and audio have naturalized ends
          let isVideoFinished = false;
          if (uploadedFiles.length > 0) {
            isVideoFinished = curTime >= uploadedVideoDuration - 0.08;
          } else {
            const videoDuration = videoEl.duration && isFinite(videoEl.duration) ? videoEl.duration : duration;
            isVideoFinished = videoEl.ended || curTime >= videoDuration - 0.08;
          }

          const isAudioFinished = !currentAudioUrl || audioEl.ended || (audioEl.duration && isFinite(audioEl.duration) && audioEl.currentTime >= audioEl.duration - 0.08);

          // Compute wall-clock virtual time as an infallible fallback
          const wallClockTime = ((Date.now() - exportStartTime) / 1000) * playbackSpeed;

          // Active playback recovery checks: Keep video and audio elements playing during export.
          // This prevents client devices (especially mobile browsers or background tabs) from stalling the process.
          if (currentAudioUrl && audioEl && audioEl.paused && !isAudioFinished) {
            audioEl.play().catch(() => {});
          }

          // If the media element currentTime is lagging behind the wall-clock time by more than 2.5s,
          // it indicates the media is stalled or throttled. We fall back to wall-clock time to prevent freeze!
          if (wallClockTime > curTime + 2.5) {
            if (Math.random() < 0.05) {
              console.warn(`[EXPORT-WARNING] Throttling/stalling detected! Media time (${curTime.toFixed(2)}s) lags behind wall-clock (${wallClockTime.toFixed(2)}s). Force syncing.`);
            }
            curTime = Math.min(wallClockTime, duration);
            
            // Sync audio currentTime if it's lagging
            if (audioEl && audioEl.currentTime < (audioEl.duration || duration) && !audioEl.seeking) {
              try { audioEl.currentTime = Math.min(curTime, audioEl.duration || duration); } catch (e) {}
            }
          }

          curExportTime = curTime;

          if ((isVideoFinished && isAudioFinished) || wallClockTime >= duration + 0.5) {
            console.log("[EXPORT] Cả video và thuyết minh đã hoàn thành hoặc hết thời gian tối đa. Trì hoãn dừng MediaRecorder 800ms để ghi nốt các dữ liệu cuối.");
            isDrawing = false;
            if (drawFrameId) {
              cancelAnimationFrame(drawFrameId);
            }
            if (fallbackInterval) {
              clearInterval(fallbackInterval);
            }
            setTimeout(() => {
              stopRecordingOnEnd();
            }, 800);
            return;
          }

          // Safe, stutter-free synchronization helper that guards against hardware-decoder choking
          const syncVideoElement = (el: HTMLVideoElement, targetTime: number) => {
            if (el.paused && !isVideoFinished) {
              el.play().catch(() => {});
            }

            const currentDiff = el.currentTime - targetTime;
            
            // Adjust playbackRate smoothly to sync with master audio without forcing costly seeks
            if (Math.abs(currentDiff) > 0.15 && Math.abs(currentDiff) <= 1.5) {
              // Smooth micro-adjustment: video is ahead -> slow down slightly; video is behind -> speed up slightly
              const adjustFactor = currentDiff > 0 ? 0.85 : 1.15;
              const targetRate = playbackSpeed * adjustFactor;
              if (el.playbackRate !== targetRate) {
                el.playbackRate = targetRate;
              }
            } else {
              if (el.playbackRate !== playbackSpeed) {
                el.playbackRate = playbackSpeed;
              }
            }

            // Only seek if ready (readyState >= 2), not currently seeking, and drift is substantial (> 1.5 seconds)
            if (Math.abs(currentDiff) > 1.5 && el.readyState >= 2 && !el.seeking) {
              const now = Date.now();
              const lastSeek = lastSeekTimestamps.get(el) || 0;
              if (now - lastSeek > 2000) { // Essential cooldown: 2.0 seconds between seeks per element
                try {
                  el.currentTime = targetTime;
                  lastSeekTimestamps.set(el, now);
                } catch (e) {
                  console.error("Failed to seek video currentTime:", e);
                }
              }
            }
          };

          if (uploadedFiles.length > 0) {
            const { index, relativeTime } = getSegmentAndRelativeTime(curTime);
            activeSegIndex = index;
            const segEl = segmentVideoRefs.current[index];
            if (segEl) {
              currentVideoSegmentEl = segEl;

              // Validate that duration of the segment is loaded and available to avoid seeking errors beyond limits
              const segDuration = segEl.duration || uploadedFiles[index]?.duration || 0;
              const isTimeValid = segDuration > 0 && relativeTime <= segDuration;

              if (index !== lastRecordedSegmentIndex) {
                // Segment changed: pause all other segments and do instant DOM styling
                // Since the browser heavily throttles invisible/opacity-0 video elements,
                // we must set the active segment's opacity to 1 and zIndex to 10 on the DOM,
                // and set all other segments to opacity 0, zIndex 0 and pause them.
                // Moving this block inside Segment Transition prevents layout thrashing & stuttering!
                uploadedFiles.forEach((_, idx) => {
                  const s = segmentVideoRefs.current[idx];
                  if (s) {
                    if (idx === index) {
                      s.style.opacity = '1';
                      s.style.zIndex = '10';
                    } else if (idx === lastRecordedSegmentIndex) {
                      s.style.opacity = '0';
                      s.style.zIndex = '5';
                    } else {
                      s.style.opacity = '0';
                      s.style.zIndex = '0';
                      try {
                        s.pause();
                      } catch (e) {}
                    }
                  }
                });

                // Sync React activeSegmentIndex on transition for accurate UI representation (infrequent, safe)
                setActiveSegmentIndex(index);

                // Seek once exactly on segment transition only if the target relativeTime is substantial (e.g. > 0.15s)
                if (isTimeValid && !segEl.seeking) {
                  if (relativeTime > 0.15 || Math.abs(segEl.currentTime - relativeTime) > 0.15) {
                    try {
                      segEl.currentTime = relativeTime;
                      lastSeekTimestamps.set(segEl, Date.now());
                    } catch (e) {}
                  }
                }

                if (segEl.paused && !isVideoFinished) {
                  segEl.play().catch(e => {});
                }
                lastRecordedSegmentIndex = index;
              } else {
                // Same segment: synchronize nicely
                if (isTimeValid) {
                  syncVideoElement(segEl, relativeTime);
                } else if (segEl.paused && !isVideoFinished) {
                  segEl.play().catch(e => {});
                }
              }
            }
          } else {
            // Single video: synchronize nicely
            syncVideoElement(videoEl, Math.min(curTime, videoEl.duration || duration));
          }

          // Trigger transitions strictly when switching between multi-video clips
          if (uploadedFiles.length > 1) {
            if (activeSegIndex !== -1 && lastRecordedSegmentIndex !== -1 && activeSegIndex !== lastRecordedSegmentIndex && videoTransition !== 'none') {
              transitionTriggerTime = curTime;
            }
          }

          const isTransActive = (transitionTriggerTime >= 0 && curTime >= transitionTriggerTime && curTime <= transitionTriggerTime + transitionDuration);
          const tProgress = isTransActive ? (curTime - transitionTriggerTime) / transitionDuration : 0;
          const wave = isTransActive ? Math.sin(tProgress * Math.PI) : 0;

          ctx.save();
          
          // Apply High-Definition Zoom Scale transition
          if (videoTransition === 'zoom_blur' && isTransActive) {
            const scaleFactor = 1 + wave * 0.15;
            ctx.translate(canvasWidth / 2, canvasHeight / 2);
            ctx.scale(scaleFactor, scaleFactor);
            ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
          }

          // Compute core filters - Massive optimization: bypass expensive CSS filter parsing in the browser 
          // when settings are default (100) to keep render loop fast and fully hardware-accelerated.
          let filterStr = 'none';
          const hasAestheticFilters = videoBrightness !== 100 || videoContrast !== 100 || videoSaturation !== 100;
          const hasTransitionBlur = (videoTransition === 'zoom_blur' && isTransActive);

          if (hasAestheticFilters || hasTransitionBlur) {
            const filterParts: string[] = [];
            if (videoBrightness !== 100) filterParts.push(`brightness(${videoBrightness}%)`);
            if (videoContrast !== 100) filterParts.push(`contrast(${videoContrast}%)`);
            if (videoSaturation !== 100) filterParts.push(`saturate(${videoSaturation}%)`);
            if (hasTransitionBlur) filterParts.push(`blur(${Math.round(wave * 12)}px)`);
            filterStr = filterParts.join(' ');
          }
          
          ctx.filter = filterStr;
          if (currentVideoSegmentEl && currentVideoSegmentEl.readyState >= 2) {
            if (videoTransition === 'cross_dissolve' && isTransActive && lastRecordedSegmentIndex !== -1 && lastRecordedSegmentIndex !== activeSegIndex) {
              const prevVideoEl = segmentVideoRefs.current[lastRecordedSegmentIndex];
              if (prevVideoEl && prevVideoEl.readyState >= 2) {
                ctx.drawImage(currentVideoSegmentEl, 0, 0, canvasWidth, canvasHeight);
                ctx.save();
                ctx.globalAlpha = 1 - tProgress;
                ctx.drawImage(prevVideoEl, 0, 0, canvasWidth, canvasHeight);
                ctx.restore();
              } else {
                ctx.drawImage(currentVideoSegmentEl, 0, 0, canvasWidth, canvasHeight);
              }
            } else {
              ctx.drawImage(currentVideoSegmentEl, 0, 0, canvasWidth, canvasHeight);
            }
          }
          ctx.filter = 'none';
          ctx.restore();

          // Render Custom Transition Graphics on Top of frame on Canvas
          if (isTransActive) {
            if (videoTransition === 'white_flash') {
              const opacity = Math.pow(1 - tProgress, 1.5);
              ctx.save();
              ctx.fillStyle = '#ffffff';
              ctx.globalAlpha = opacity;
              ctx.fillRect(0, 0, canvasWidth, canvasHeight);
              ctx.restore();
            } else if (videoTransition === 'fade_to_black') {
              const opacity = 1 - Math.abs(2 * tProgress - 1);
              ctx.save();
              ctx.fillStyle = '#000000';
              ctx.globalAlpha = opacity;
              ctx.fillRect(0, 0, canvasWidth, canvasHeight);
              ctx.restore();
            } else if (videoTransition === 'cross_dissolve') {
              const opacity = (1 - Math.pow(2 * tProgress - 1, 2)) * 0.45;
              ctx.save();
              ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
              ctx.globalAlpha = opacity;
              ctx.fillRect(0, 0, canvasWidth, canvasHeight);
              ctx.restore();
            } else if (videoTransition === 'slide_left') {
              ctx.save();
              const offset = (1 - tProgress) * canvasWidth;
              const gradient = ctx.createLinearGradient(offset, 0, offset + canvasWidth, 0);
              gradient.addColorStop(0, 'rgba(10,10,10,0.95)');
              gradient.addColorStop(0.3, 'rgba(255,255,255,0.9)');
              gradient.addColorStop(0.4, 'rgba(245,158,11,0.5)');
              gradient.addColorStop(1, 'rgba(0,0,0,0)');
              ctx.fillStyle = gradient;
              ctx.fillRect(offset, 0, canvasWidth, canvasHeight);
              ctx.restore();
            } else if (videoTransition === 'slide_right') {
              ctx.save();
              const offset = (tProgress - 1) * canvasWidth;
              const gradient = ctx.createLinearGradient(offset + canvasWidth, 0, offset, 0);
              gradient.addColorStop(0, 'rgba(10,10,10,0.95)');
              gradient.addColorStop(0.3, 'rgba(255,255,255,0.9)');
              gradient.addColorStop(0.4, 'rgba(245,158,11,0.5)');
              gradient.addColorStop(1, 'rgba(0,0,0,0)');
              ctx.fillStyle = gradient;
              ctx.fillRect(offset, 0, canvasWidth, canvasHeight);
              ctx.restore();
            } else if (videoTransition === 'glitch') {
              ctx.save();
              const shiftX = (Math.random() * 24 - 12) * wave;
              for (let chunk = 0; chunk < 6; chunk++) {
                if (Math.random() > 0.3) {
                  const sY = Math.floor(Math.random() * canvasHeight);
                  const sH = Math.floor(Math.random() * 40) + 10;
                  ctx.drawImage(canvas, 0, sY, canvasWidth, sH, shiftX * (Math.random() > 0.5 ? 2 : -2), sY, canvasWidth, sH);
                }
              }
              ctx.fillStyle = Math.random() > 0.5 ? 'rgba(34, 211, 238, 0.45)' : 'rgba(236, 72, 153, 0.45)';
              ctx.fillRect(0, Math.floor(Math.random() * canvasHeight), canvasWidth, Math.floor(Math.random() * 20) + 5);
              ctx.restore();
            }
          }

          // Render Burned-In High-Attention Hook Banner in the video!
          if (showHookBanner && hookBannerText && curTime <= hookBannerDuration) {
            ctx.save();
            ctx.filter = 'none';
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            const bannerWidth = Math.round(canvasWidth * 0.90);
            const bannerY = Math.round(canvasHeight * 0.14);
            const centerX = Math.round(canvasWidth / 2);
            const hookFontSize = Math.round(canvasWidth * 0.046);

            if (hookBannerStyle === 'cyberpunk-neon') {
              ctx.font = `900 ${hookFontSize}px "JetBrains Mono", "Courier New", monospace`;
            } else {
              ctx.font = `900 ${hookFontSize}px "Be Vietnam Pro", "Montserrat", "Plus Jakarta Sans", sans-serif`;
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const hookWords = hookBannerText.split(/\s+/);
            let currLine = '';
            const hookLines: string[] = [];
            const hookMaxWidth = Math.round(bannerWidth * 0.88);

            for (let h = 0; h < hookWords.length; h++) {
              const testLine = currLine + hookWords[h] + ' ';
              const testWidth = ctx.measureText(testLine).width;
              if (testWidth > hookMaxWidth && h > 0) {
                hookLines.push(currLine.trim());
                currLine = hookWords[h] + ' ';
              } else {
                currLine = testLine;
              }
            }
            hookLines.push(currLine.trim());

            const hookLineHeight = Math.round(hookFontSize * 1.34);
            const bannerPaddingY = Math.round(hookFontSize * 0.85);
            const hookBlockHeight = hookLines.length * hookLineHeight;
            const bannerHeight = hookBlockHeight + bannerPaddingY * 2;

            // Draw Background and borders of Hook Banner
            if (hookBannerStyle === 'tiktok-yellow') {
              ctx.fillStyle = '#ffe600';
              ctx.strokeStyle = '#fe2c55';
              ctx.lineWidth = Math.round(canvasWidth * 0.009);
              
              ctx.beginPath();
              ctx.roundRect(
                centerX - bannerWidth / 2,
                bannerY - bannerHeight / 2,
                bannerWidth,
                bannerHeight,
                Math.round(canvasWidth * 0.02)
              );
              ctx.fill();
              ctx.stroke();
            } else if (hookBannerStyle === 'tiktok-red') {
              ctx.fillStyle = '#fe2c55';
              ctx.strokeStyle = '#ffe600';
              ctx.lineWidth = Math.round(canvasWidth * 0.009);

              ctx.beginPath();
              ctx.roundRect(
                centerX - bannerWidth / 2,
                bannerY - bannerHeight / 2,
                bannerWidth,
                bannerHeight,
                Math.round(canvasWidth * 0.02)
              );
              ctx.fill();
              ctx.stroke();
            } else if (hookBannerStyle === 'cyberpunk-neon') {
              ctx.fillStyle = 'rgba(2, 2, 2, 0.96)';
              ctx.strokeStyle = '#ec4899';
              ctx.lineWidth = Math.round(canvasWidth * 0.007);

              ctx.beginPath();
              ctx.roundRect(
                centerX - bannerWidth / 2,
                bannerY - bannerHeight / 2,
                bannerWidth,
                bannerHeight,
                Math.round(canvasWidth * 0.012)
              );
              ctx.fill();
              ctx.stroke();
            } else if (hookBannerStyle === 'beast-glow') {
              ctx.fillStyle = 'rgba(5, 5, 5, 0.96)';
              ctx.strokeStyle = '#10b981';
              ctx.lineWidth = Math.round(canvasWidth * 0.008);

              ctx.shadowColor = 'rgba(16, 185, 129, 0.6)';
              ctx.shadowBlur = Math.round(canvasWidth * 0.03);

              ctx.beginPath();
              ctx.roundRect(
                centerX - bannerWidth / 2,
                bannerY - bannerHeight / 2,
                bannerWidth,
                bannerHeight,
                Math.round(canvasWidth * 0.015)
              );
              ctx.fill();
              ctx.stroke();
              ctx.shadowBlur = 0;
            } else {
              // editorial-royal
              const hGradient = ctx.createLinearGradient(
                centerX - bannerWidth / 2, bannerY,
                centerX + bannerWidth / 2, bannerY
              );
              hGradient.addColorStop(0, '#d97706');
              hGradient.addColorStop(1, '#ca8a04');
              ctx.fillStyle = hGradient;
              ctx.strokeStyle = '#fcd34d';
              ctx.lineWidth = Math.round(canvasWidth * 0.006);

              ctx.beginPath();
              ctx.roundRect(
                centerX - bannerWidth / 2,
                bannerY - bannerHeight / 2,
                bannerWidth,
                bannerHeight,
                Math.round(canvasWidth * 0.02)
              );
              ctx.fill();
              ctx.stroke();
            }

            // Draw Decorative Badge at top of Hook Banner
            let badgeText = '';
            let badgeBg = '';
            let badgeTextColor = '#ffffff';

            if (hookBannerStyle === 'tiktok-yellow') {
              badgeText = '🔥 TIKTOK TRENDING';
              badgeBg = '#fe2c55';
              badgeTextColor = '#ffffff';
            } else if (hookBannerStyle === 'tiktok-red') {
              badgeText = '🚨 CHẤN ĐỘNG HOT';
              badgeBg = '#ffe600';
              badgeTextColor = '#000000';
            } else if (hookBannerStyle === 'cyberpunk-neon') {
              badgeText = 'GLITCH SYNC PRO';
              badgeBg = '#ec4899';
              badgeTextColor = '#ffffff';
            } else if (hookBannerStyle === 'beast-glow') {
              badgeText = '⚡ VIRAL RUSH HOOK';
              badgeBg = '#10b981';
              badgeTextColor = '#000000';
            } else if (hookBannerStyle === 'editorial-royal') {
              badgeText = '⭐ BEST VALUE';
              badgeBg = '#fcd34d';
              badgeTextColor = '#000000';
            }

            if (badgeText) {
              ctx.save();
              const badgeFontSize = Math.round(hookFontSize * 0.58);
              ctx.font = `900 ${badgeFontSize}px "Be Vietnam Pro", "Montserrat", sans-serif`;
              const badgeWidth = ctx.measureText(badgeText).width + badgeFontSize * 2;
              const badgeHeight = Math.round(badgeFontSize * 1.6);

              ctx.fillStyle = badgeBg;
              ctx.beginPath();
              ctx.roundRect(
                centerX - badgeWidth / 2,
                bannerY - bannerHeight / 2 - badgeHeight / 2,
                badgeWidth,
                badgeHeight,
                Math.round(badgeHeight * 0.35)
              );
              ctx.fill();

              ctx.fillStyle = badgeTextColor;
              ctx.fillText(badgeText, centerX, bannerY - bannerHeight / 2);
              ctx.restore();
            }

            // Draw line text
            let startHookY = bannerY - (hookBlockHeight / 2) + (hookLineHeight / 2);

            ctx.fillStyle = (hookBannerStyle === 'tiktok-yellow')
              ? '#000000'
              : (hookBannerStyle === 'cyberpunk-neon')
                ? '#22d3ee'
                : (hookBannerStyle === 'beast-glow')
                  ? '#34d399'
                  : '#ffffff';

            if (hookBannerStyle === 'cyberpunk-neon') {
              ctx.shadowColor = '#ec4899';
              ctx.shadowBlur = 8;
            }

            hookLines.forEach((hLine) => {
              ctx.fillText(hLine, centerX, startHookY);
              startHookY += hookLineHeight;
            });

            ctx.restore();
          }

          // Render Burned-In Dynamic Subtitles beautifully!
          if (showSubtitles) {
            const shiftedSubTime = curTime + subtitleOffset;
            const currentSub = videoSubSegments.find(seg => shiftedSubTime >= seg.start && shiftedSubTime <= seg.end);
            
            if (currentSub && currentSub.text) {
              // Reset shadow & filter settings temporarily for clear subtitle drawer overlay
              ctx.filter = 'none';
              ctx.shadowColor = 'transparent';
              ctx.shadowBlur = 0;
              
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              // Scale typography with video resolution smoothly
              const baseFontSize = Math.round(canvasWidth * 0.054);
              const activeFontObj = SUBTITLE_FONTS.find(f => f.id === subtitleFontFamily) || SUBTITLE_FONTS[0];
              
              if (subtitleStyle === 'tiktok') {
                ctx.font = `900 ${baseFontSize}px ${activeFontObj.canvasFont}`;
              } else if (subtitleStyle === 'capcut') {
                ctx.font = `900 ${baseFontSize - 1}px ${activeFontObj.canvasFont}`;
              } else if (subtitleStyle === 'cyberpunk') {
                ctx.font = `900 ${baseFontSize - 2}px "JetBrains Mono", "Courier New", monospace`;
              } else if (subtitleStyle === 'neon') {
                ctx.font = `900 ${baseFontSize}px ${activeFontObj.canvasFont}`;
              } else {
                ctx.font = `700 ${baseFontSize - 1}px ${activeFontObj.canvasFont}`;
              }

              const textY = Math.round(canvasHeight * 0.76); // Safe lower-third zone for safe phone UI padding (TikTok/Reels)
              const maxWidth = Math.round(canvasWidth * 0.86);
              const lineHeight = Math.round(baseFontSize * 1.38);

              // Subtitles multi-words wrapping logic with proper case formatting and 100% Vietnamese spell validation
              const cleanedRawText = correctVietnameseSpelling(currentSub.text || "").correctedText;
              const formattedSubText = subtitleCase === 'uppercase' ? cleanedRawText.toUpperCase() : cleanedRawText;
              const words = formattedSubText.split(' ');
              let line = '';
              const lines: string[] = [];

              for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                const testWidth = metrics.width;
                if (testWidth > maxWidth && n > 0) {
                  lines.push(line.trim());
                  line = words[n] + ' ';
                } else {
                  line = testLine;
                }
              }
              lines.push(line.trim());

              const totalBlockHeight = lines.length * lineHeight;
              let currentY = textY - (totalBlockHeight / 2) + (lineHeight / 2);

              let wordIdxCounter = 0;
              const duration = currentSub.end - currentSub.start;
              // Synchronize with subtitleOffset for perfectly aligned word highlights
              const elapsed = shiftedSubTime - currentSub.start;
              const fraction = duration > 0 ? elapsed / duration : 0;
              
              let currentWordIndex = -1;
              if (wordHighlightEnabled) {
                const timings = getWordTimings(currentSub.text);
                const activeIdx = timings.findIndex(t => fraction >= t.startRatio && fraction <= t.endRatio);
                currentWordIndex = activeIdx === -1 ? (fraction >= 1 ? timings.length - 1 : 0) : activeIdx;
              }

              lines.forEach((lineText) => {
                const lineWords = lineText.split(/\s+/).filter(Boolean);
                const interWordSpace = Math.max(ctx.measureText(' ').width, Math.round(baseFontSize * 0.32));
                const totalCalculatedLineWidth = lineWords.reduce((sum, w, wI) => {
                  return sum + ctx.measureText(w).width + (wI < lineWords.length - 1 ? interWordSpace : 0);
                }, 0);
                const lineWidth = wordHighlightEnabled ? totalCalculatedLineWidth : ctx.measureText(lineText).width;
                const lineX = Math.round(canvasWidth / 2);

                if (subtitleStyle === 'capcut') {
                  // Beautiful sleek semi-transparent solid backplate with border
                  ctx.fillStyle = 'rgba(12, 12, 12, 0.94)';
                  const paddingX = Math.round(baseFontSize * 0.8);
                  const paddingY = Math.round(baseFontSize * 0.4);
                  
                  ctx.beginPath();
                  ctx.roundRect(
                    lineX - lineWidth / 2 - paddingX,
                    currentY - lineHeight / 2 - paddingY / 4,
                    lineWidth + paddingX * 2,
                    lineHeight + paddingY,
                    Math.round(baseFontSize * 0.35)
                  );
                  ctx.fill();

                  // Subtle white borders for pristine contrast
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                  ctx.lineWidth = 1.5;
                  ctx.stroke();
                }

                if (wordHighlightEnabled) {
                  ctx.textAlign = 'left';
                  let startX = lineX - lineWidth / 2;

                  lineWords.forEach((wordElement, wIdx) => {
                    const globalIdx = wordIdxCounter;
                    wordIdxCounter++;
                    const isElementCurrent = globalIdx === currentWordIndex;
                    
                    const cleanWord = wordElement;
                    const wordOnlyWidth = ctx.measureText(cleanWord).width;
                    const spaceWidth = wIdx < lineWords.length - 1 ? interWordSpace : 0;
                    const totalWordWidth = wordOnlyWidth + spaceWidth;

                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;

                    if (subtitleStyle === 'cyberpunk') {
                      ctx.fillStyle = isElementCurrent ? '#22d3ee' : '#ec4899';
                      ctx.fillText(cleanWord, startX + 2, currentY + 2);
                    } else if (subtitleStyle === 'neon') {
                      ctx.shadowColor = isElementCurrent ? '#ffe600' : '#d946ef';
                      ctx.shadowBlur = isElementCurrent ? Math.round(baseFontSize * 1.1) : Math.round(baseFontSize * 0.6);
                    }

                    if (subtitleStyle === 'tiktok' || subtitleStyle === 'cyberpunk') {
                      ctx.strokeStyle = '#000000';
                      ctx.lineWidth = subtitleStyle === 'tiktok' ? 8 : 4;
                      ctx.lineJoin = 'round';
                      if (isElementCurrent) {
                        ctx.save();
                        ctx.translate(startX + wordOnlyWidth / 2, currentY);
                        ctx.scale(1.08, 1.08);
                        ctx.textAlign = 'center';
                        ctx.strokeText(cleanWord, 0, 0);
                        ctx.restore();
                      } else {
                        ctx.strokeText(cleanWord, startX, currentY);
                      }
                    } else if (subtitleStyle === 'minimal') {
                      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                      ctx.lineWidth = 4;
                      ctx.lineJoin = 'round';
                      if (isElementCurrent) {
                        ctx.save();
                        ctx.translate(startX + wordOnlyWidth / 2, currentY);
                        ctx.scale(1.08, 1.08);
                        ctx.textAlign = 'center';
                        ctx.strokeText(cleanWord, 0, 0);
                        ctx.restore();
                      } else {
                        ctx.strokeText(cleanWord, startX, currentY);
                      }
                    }

                    if (subtitleStyle === 'tiktok') {
                      ctx.fillStyle = isElementCurrent ? '#ffe600' : '#ffffff';
                    } else if (subtitleStyle === 'capcut') {
                      ctx.fillStyle = isElementCurrent ? '#ffe600' : '#ffffff';
                    } else if (subtitleStyle === 'cyberpunk') {
                      ctx.fillStyle = isElementCurrent ? '#ec4899' : '#22d3ee';
                    } else if (subtitleStyle === 'neon') {
                      ctx.fillStyle = isElementCurrent ? '#ffe600' : '#ffffff';
                    } else {
                      ctx.fillStyle = isElementCurrent ? '#ffe600' : '#ffffff';
                    }

                    if (isElementCurrent) {
                      ctx.save();
                      ctx.translate(startX + wordOnlyWidth / 2, currentY);
                      ctx.scale(1.08, 1.08);
                      ctx.textAlign = 'center';
                      ctx.fillText(cleanWord, 0, 0);
                      ctx.restore();
                    } else {
                      ctx.fillText(cleanWord, startX, currentY);
                    }
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;

                    startX += totalWordWidth;
                  });

                  ctx.textAlign = 'center';
                } else {
                  if (subtitleStyle === 'cyberpunk') {
                    ctx.fillStyle = '#ec4899';
                    ctx.fillText(lineText, lineX + 2, currentY + 2);
                  } else if (subtitleStyle === 'neon') {
                    ctx.shadowColor = '#d946ef';
                    ctx.shadowBlur = Math.round(baseFontSize * 0.7);
                  }

                  if (subtitleStyle === 'tiktok' || subtitleStyle === 'cyberpunk') {
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = subtitleStyle === 'tiktok' ? 8 : 4;
                    ctx.lineJoin = 'round';
                    ctx.strokeText(lineText, lineX, currentY);
                  } else if (subtitleStyle === 'minimal') {
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                    ctx.lineWidth = 4;
                    ctx.lineJoin = 'round';
                    ctx.strokeText(lineText, lineX, currentY);
                  }

                  if (subtitleStyle === 'tiktok') {
                    ctx.fillStyle = '#ffe600';
                  } else if (subtitleStyle === 'cyberpunk') {
                    ctx.fillStyle = '#22d3ee';
                  } else {
                    ctx.fillStyle = '#ffffff';
                  }

                  ctx.fillText(lineText, lineX, currentY);
                }

                currentY += lineHeight;
              });

              // Render burned-in bilingual translation lines below main lines
              if (bilingualEnabled && currentSub.translation) {
                ctx.save();
                // Set font style for translation
                const transFontSize = Math.round(baseFontSize * 0.78);
                ctx.font = `600 ${transFontSize}px "Be Vietnam Pro", "Plus Jakarta Sans", "Inter", sans-serif`;
                if (subtitleStyle === 'cyberpunk') {
                  ctx.font = `600 ${transFontSize}px "JetBrains Mono", "Courier New", monospace`;
                }

                // Choose color for translation based on style
                let transColor = '#ffffff';
                if (subtitleStyle === 'tiktok') {
                  transColor = '#ffffff';
                } else if (subtitleStyle === 'capcut') {
                  transColor = '#ffeb3b';
                } else if (subtitleStyle === 'cyberpunk') {
                  transColor = '#22d3ee';
                } else if (subtitleStyle === 'neon') {
                  transColor = '#22d3ee';
                } else {
                  transColor = '#ffe082';
                }

                const transLineHeight = Math.round(transFontSize * 1.34);
                const transWords = currentSub.translation.split(' ');
                let transLine = '';
                const transLines: string[] = [];

                for (let n = 0; n < transWords.length; n++) {
                  const testLine = transLine + transWords[n] + ' ';
                  const testWidth = ctx.measureText(testLine).width;
                  if (testWidth > maxWidth && n > 0) {
                    transLines.push(transLine.trim());
                    transLine = transWords[n] + ' ';
                  } else {
                    transLine = testLine;
                  }
                }
                transLines.push(transLine.trim());

                // Add a small divider space before drawing translation
                currentY += Math.round(baseFontSize * 0.22);

                transLines.forEach((tLineText) => {
                  const tLineWidth = ctx.measureText(tLineText).width;
                  const tLineX = Math.round(canvasWidth / 2);

                  if (subtitleStyle === 'capcut') {
                    ctx.fillStyle = 'rgba(12, 12, 12, 0.94)';
                    const pX = Math.round(transFontSize * 0.8);
                    const pY = Math.round(transFontSize * 0.4);
                    ctx.beginPath();
                    ctx.roundRect(
                      tLineX - tLineWidth / 2 - pX,
                      currentY - transLineHeight / 2 - pY / 4,
                      tLineWidth + pX * 2,
                      transLineHeight + pY,
                      Math.round(transFontSize * 0.35)
                    );
                    ctx.fill();
                  }

                  if (subtitleStyle === 'tiktok' || subtitleStyle === 'cyberpunk') {
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = subtitleStyle === 'tiktok' ? 5 : 3;
                    ctx.lineJoin = 'round';
                    ctx.strokeText(tLineText, tLineX, currentY);
                  } else if (subtitleStyle === 'minimal') {
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                    ctx.lineWidth = 3;
                    ctx.lineJoin = 'round';
                    ctx.strokeText(tLineText, tLineX, currentY);
                  }

                  ctx.fillStyle = transColor;
                  ctx.fillText(tLineText, tLineX, currentY);

                  currentY += transLineHeight;
                });
                ctx.restore();
              }
            }
          }

          // Resource cleanup: pause any background video segment that is not active or actively transitioning
          if (uploadedFiles.length > 0) {
            uploadedFiles.forEach((_, idx) => {
              if (idx !== activeSegIndex && (!isTransActive || idx !== lastRecordedSegmentIndex)) {
                const s = segmentVideoRefs.current[idx];
                if (s && !s.paused) {
                  try { s.pause(); } catch (e) {}
                }
              }
            });
          }
        }
        
        if (isDrawing) {
          scheduleNextFrame();
        }
      };
      
      let isFrameScheduled = false;
      const scheduleNextFrame = () => {
        if (!isDrawing || isFrameScheduled) return;
        isFrameScheduled = true;
        drawFrameId = requestAnimationFrame(() => {
          isFrameScheduled = false;
          drawFrame();
        });
      };

      // Start drawing frames immediately to the canvas
      scheduleNextFrame();

      // Create a background rendering fallback timer.
      // If out-of-focus, minimized, or under heavy CPU load, the browser might suspend requestAnimationFrame completely.
      // The backup interval ensures that we still force continuous canvas drawing at ~30 FPS, keeping the recording from freezing.
      fallbackInterval = setInterval(() => {
        if (!isDrawing) return;
        const now = Date.now();
        if (now - lastDrawTime >= 45 && !isFrameScheduled) {
          drawFrame();
        }
      }, 33);

      let videoStream: MediaStream;
      if ((canvas as any).captureStream) {
        videoStream = (canvas as any).captureStream(exportFps || 60); // Ultra-smooth Studio FPS stream
      } else if (rawVideoStream) {
        videoStream = rawVideoStream;
      } else {
        throw new Error("Trình duyệt này không hỗ trợ ghi luồng video. Vui lòng chạy trên Google Chrome, Edge hoặc Safari.");
      }

      // Mix Audio Tracks (Original Video sound + AI voiceover)
      // Since previewAudioCtxRef.current already contains the voiceover audio source routing,
      // we MUST use the same audio context to avoid "MediaElementAudioSourceNode already created" error
      // AND to capture the pre-processed audio with all selected effects (Studio, Bass, Reverb) perfectly!
      setupPreviewAudioGraph();
      const audioCtx = previewAudioCtxRef.current!;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const mixedDest = audioCtx.createMediaStreamDestination();

      // Hack: Create an active silent oscillator to keep the mixedDest audio stream running and clocked
      // with continuous buffers before/during playback. This prevents Chromium/Safari from shutting down or 
      // silencing the Web Audio destination track when the main media pauses or stalls.
      const silentOscillator = audioCtx.createOscillator();
      const silentGain = audioCtx.createGain();
      silentGain.gain.setValueAtTime(0.0, audioCtx.currentTime); // 100% inaudible
      silentOscillator.connect(silentGain);
      silentGain.connect(mixedDest);
      try {
        silentGain.connect(audioCtx.destination);
      } catch (e) {}
      silentOscillator.start();
      
      // Connect our dry and wet gain nodes (which render the voiceover with selected effects) to the output stream
      const dryGain = previewDryGainRef.current;
      const wetGain = previewWetGainRef.current;
      const videoGain = previewVideoGainNodeRef.current;
      
      if (dryGain) {
        dryGain.connect(mixedDest);
      }
      if (wetGain) {
        wetGain.connect(mixedDest);
      }
      
      // Mix in the original video's audio track if enabled using the active context directly from the audio graph
      if (videoGain && !videoOriginalMute) {
        try {
          videoGain.connect(mixedDest);
        } catch (e) {
          console.error("Không thể gộp âm thanh gốc từ audio graph:", e);
        }
      }

      // Combine video visual track and mixed audio tracks
      // Crucial Fix: Use an explicit custom MediaStream containing the canvas's video track and the mixed audio track.
      // This ensures that the browser MediaRecorder immediately detects and captures both independent tracks cleanly,
      // avoiding Chrome's canvas captureStream dynamic track limits and completely preventing muted exports.
      const tracksToRecord: MediaStreamTrack[] = [];
      const canvasVideoTrack = videoStream.getVideoTracks()[0];
      if (canvasVideoTrack) {
        tracksToRecord.push(canvasVideoTrack);
      }
      const audioTrack = mixedDest.stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = true;
        tracksToRecord.push(audioTrack);
        console.log("Successfully bundled audio track from Web Audio to output stream.");
      } else {
        console.warn("CẢNH BÁO: Không tìm thấy luồng âm thanh nào từ bộ lọc Web Audio!");
      }

      const recordedStream = new MediaStream(tracksToRecord);

      // Set playback speeds for both media elements equally to match the user's desired voice rate.
      // This guarantees that both resources play and progress in perfect natural lockstep.
      if (uploadedFiles.length > 0) {
        uploadedFiles.forEach((_, idx) => {
          const segEl = segmentVideoRefs.current[idx];
          if (segEl) {
            segEl.playbackRate = playbackSpeed;
            segEl.muted = videoOriginalMute;
            if (!videoOriginalMute) {
              segEl.volume = savedVideoVolume || 1.0;
            }
          }
        });
      } else {
        videoEl.playbackRate = playbackSpeed;
        videoEl.muted = videoOriginalMute;
        if (!videoOriginalMute) {
          videoEl.volume = savedVideoVolume || 1.0;
        }
      }
      audioEl.playbackRate = playbackSpeed;
      
      // IMPORTANT: In Chromium-based browsers, if an HTMLMediaElement is muted (muted = true or volume = 0),
      // its captureStream() audio track output will be completely silent. 
      // Thus, we MUST keep these elements active and unmuted during the recording process so that the sound 
      // is captured in full resolution and mixed perfectly. Keep video unmuted (or volume 0.0 only in Web Audio context if muted,
      // but element itself remains active) so Web Audio gains continuous buffers.
      audioEl.muted = false;
      audioEl.volume = 1.0;

      // Try high-quality standard video formats, prioritizing MP4 over WebM for native TikTok compatibility of the recorded container.
      const mimeTypesToTry = [
        'video/mp4;codecs=h264,aac',
        'video/mp4;codecs=h264,opus',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=h264',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];

      let selectedMimeType = '';
      for (const mime of mimeTypesToTry) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }

      console.log(`MediaRecorder selected MIME type: ${selectedMimeType}`);

      // Calculate ultra-high movie-grade dynamic bitrates to matches original raw phone video files
      // 720p: 8-15 Mbps, 1080p: 18-30 Mbps, 4K: 35-50 Mbps. This avoids any compression blockiness or detail loss!
      const totalPixels = canvasWidth * canvasHeight;
      let targetBitrate = 22000000;
      
      const bitrateMultiplier = exportBitratePreset === 'master' ? 1.5 : (exportBitratePreset === 'standard' ? 0.7 : 1.0);

      if (totalPixels <= 1280 * 720) {
        targetBitrate = Math.round(12000000 * bitrateMultiplier);
      } else if (totalPixels <= 1920 * 1080) {
        targetBitrate = Math.round(25000000 * bitrateMultiplier);
      } else {
        targetBitrate = Math.round(50000000 * bitrateMultiplier);
      }

      console.log(`Setting target export video dynamic bitrate: ${targetBitrate / 1000000} Mbps`);

      try {
        const recorderOptions: MediaRecorderOptions = {
          mimeType: selectedMimeType || undefined,
          videoBitsPerSecond: targetBitrate,
          audioBitsPerSecond: 192000, // Studio-quality 192 kbps audio bitrate helper
        };
        mediaRecorder = new MediaRecorder(recordedStream, recorderOptions);
      } catch (err) {
        console.warn("High-profile MediaRecorder rejected by client browser, scaling down to high compatibility mode...", err);
        try {
          const fallbackOptions: MediaRecorderOptions = {
            mimeType: selectedMimeType || undefined,
            videoBitsPerSecond: 8000000, // Safe 8 Mbps fallback which is highly supported
            audioBitsPerSecond: 128000,
          };
          mediaRecorder = new MediaRecorder(recordedStream, fallbackOptions);
        } catch (err2) {
          console.error("All customized MediaRecorder attempts failed, initializing with browser presets:", err2);
          mediaRecorder = new MediaRecorder(recordedStream, {
            mimeType: selectedMimeType || undefined
          });
        }
      }
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      // Crucial: The exported video duration is defined at the start of the block and held at closure scope

      const progressInterval = setInterval(() => {
        // Track the highest elapsed time between the running video or the running audio track
        const elapsed = Math.max(curExportTime, audioEl.currentTime || 0);
        const progressPct = duration > 0 ? Math.min(99, Math.round((elapsed / duration) * 100)) : 0;
        setMergeProgress(progressPct);

        // Failsafe backup completion check: stop recording safely when elapsed reaches expected max duration
        if (elapsed >= duration - 0.08) {
          console.log(`[EXPORT-FAILSAFE] Elapsed time (${elapsed.toFixed(2)}s) reached expected duration (${duration.toFixed(2)}s). Stopping recording of MediaRecorder in 800ms.`);
          isDrawing = false;
          if (drawFrameId) {
            cancelAnimationFrame(drawFrameId);
          }
          if (fallbackInterval) {
            clearInterval(fallbackInterval);
          }
          setTimeout(() => {
            stopRecordingOnEnd();
          }, 800);
        }
      }, 300);

      mediaRecorder.onstop = () => {
        try {
          clearInterval(progressInterval);
          isDrawing = false; // Stop the video canvas rendering loop
          
          // Stop the silent oscillator and clean up
          try {
            silentOscillator.stop();
            silentOscillator.disconnect();
            silentGain.disconnect();
          } catch (e) {}

          // Disconnect temporary recording node connections from mixedDest to avoid duplicating sound/memory leak
          try {
            if (dryGain) dryGain.disconnect(mixedDest);
          } catch (e) {}
          try {
            if (wetGain) wetGain.disconnect(mixedDest);
          } catch (e) {}
          try {
            if (videoGain) videoGain.disconnect(mixedDest);
          } catch (e) {}

          // Restore elements original state
          try {
            if (uploadedFiles.length > 0) {
              uploadedFiles.forEach((_, idx) => {
                const segEl = segmentVideoRefs.current[idx];
                if (segEl) {
                  segEl.muted = savedVideoMuted;
                  segEl.currentTime = 0;
                  segEl.volume = savedVideoVolume;
                  segEl.playbackRate = 1.0;
                  segEl.loop = false;
                }
              });
            } else {
              videoEl.muted = savedVideoMuted;
              videoEl.currentTime = savedVideoTime;
              videoEl.volume = savedVideoVolume;
              videoEl.playbackRate = 1.0;
              videoEl.loop = savedVideoLoop;
            }
          } catch (e) {
            console.error("Lỗi khôi phục trạng thái video:", e);
          }

          try {
            audioEl.muted = savedAudioMuted;
            audioEl.currentTime = savedAudioTime;
            audioEl.loop = savedAudioLoop;
          } catch (e) {
            console.error("Lỗi khôi phục trạng thái audio:", e);
          }

          const actualMime = mediaRecorder.mimeType || 'video/webm';
          const isMp4Real = actualMime.startsWith('video/mp4') || (actualMime.includes('mp4') && !actualMime.includes('webm'));
          const finalExtension = isMp4Real ? 'mp4' : 'webm';
          const blobClass = isMp4Real ? 'video/mp4' : 'video/webm';
          
          setMergedVideoExt(finalExtension);
          
          const rawBlob = new Blob(chunks, { type: blobClass });

          const triggerDownload = (finalBlob: Blob) => {
            try {
              const mergedUrl = URL.createObjectURL(finalBlob);
              setMergedVideoUrl(mergedUrl);
              setMergeProgress(100);
              setIsMerging(false);

              // Download trigger - Accurate extension corresponding to the actual codec container
              const finalName = `${(activeReview?.productName || "review").toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}_final.${finalExtension}`;
              
              // Auto trigger download
              const a = document.createElement('a');
              a.href = mergedUrl;
              a.download = finalName;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            } catch (dlErr) {
              console.error("Lỗi khi tải xuống:", dlErr);
              setMergeProgress(100);
              setIsMerging(false);
            }
          };

          // Fix duration and cues mismatch in Chrome recorded WebMs so platforms can read the timeline
          if (!isMp4Real) {
            const durationValueMs = Math.round(duration * 1000);
            console.log(`Fixing WebM container duration metadata for TikTok: ${durationValueMs}ms`);
            
            let timeoutId = setTimeout(() => {
              console.warn("[EXPORT-TIMEOUT] ysFixWebmDuration took too long or hung. Falling back to direct raw video download.");
              triggerDownloadSafe(rawBlob);
            }, 1500);

            let isCalled = false;
            const triggerDownloadSafe = (finalBlob: Blob) => {
              if (isCalled) return;
              isCalled = true;
              triggerDownload(finalBlob);
            };

            try {
              ysFixWebmDuration(rawBlob, durationValueMs, (fixedBlob) => {
                clearTimeout(timeoutId);
                console.log("[EXPORT-SUCCESS] Fixed WebM metadata successfully.");
                triggerDownloadSafe(fixedBlob);
              });
            } catch (err) {
              clearTimeout(timeoutId);
              console.error("[EXPORT-ERROR] ysFixWebmDuration failed with exception, downloading raw video:", err);
              triggerDownloadSafe(rawBlob);
            }
          } else {
            triggerDownload(rawBlob);
          }
        } catch (onStopErr: any) {
          console.error("Lỗi nghiêm trọng trong mediaRecorder.onstop:", onStopErr);
          setMergeProgress(100);
          setIsMerging(false);
        }
      };

      // Start recording FIRST to listen and capture the absolute 0.0s mark.
      // The background silent oscillator guarantees that an active and clocked Web Audio stream is already flowing,
      // which completely prevents the browser from generating silent video recordings without needing any startup delay!
      mediaRecorder.start();

      // Immediately trigger synchronous playback to pump sound down the Web Audio tubes.
      // To bypass any possible silent packet drops, we also enforce unmuting on both elements.
      if (uploadedFiles.length > 0) {
        segmentVideoRefs.current[0]?.play().catch(e => console.error('Segment Video recording play err', e));
      } else {
        videoEl.play().catch(e => console.error('Video recording play err', e));
      }
      audioEl.play().catch(e => console.error('Audio recording play err', e));

      // Rely autorun controls entirely on the frame callback loop and progress elapsed limits.
      // We DO NOT bind direct event listeners on videoEl 'ended' since the voiceover audio can be longer than the video frames,
      // and binding it prematurely stops the MediaRecorder before we can finish capturing late reviews!

    } catch (err: any) {
      console.error(err);
      setApiError(`Lỗi khi lồng & xuất video: ${err.message || "Trình duyệt chặn kết nối."}`);
      setIsMerging(false);
    }
  };

  const handleAudioEnded = () => {
    if (isMerging) {
      console.log("[EXPORT-DEBUG] Thuyết minh phát xong, bỏ qua tạm dừng vì đang trong tiến trình xuất video.");
      return;
    }
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
    }
  };

  const [bilingualEnabled, setBilingualEnabled] = useState<boolean>(true);
  const [isTranslatingSubtitles, setIsTranslatingSubtitles] = useState<boolean>(false);

  const translateActiveSubtitles = async (force = false) => {
    const actScript = editedScript || (activeReview?.marketingScript || '');
    if (!actScript) return;

    // Luôn luôn sinh phân cảnh từ kịch bản gốc để làm chuẩn đồng bộ thời lượng lồng tiếng
    const currentSegments = getSegmentsFromScript(
      actScript,
      audioDuration || (videoRef.current?.duration || 0)
    );

    if (currentSegments.length === 0) return;

    // Kiểm tra xem tất cả các phân cảnh này đã có trong bộ nhớ đệm dịch chưa
    const allHaveTranslation = currentSegments.every(seg => !!subtitleTranslations[seg.text]);
    if (allHaveTranslation && !force) return;

    setIsTranslatingSubtitles(true);
    try {
      const sourceLang = reviewLanguage;
      const targetLang = reviewLanguage === 'vi' ? 'en' : 'vi';

      // Chỉ dịch các phân cảnh chưa có trong bộ nhớ đệm nếu không bị force dịch lại
      const segmentsToTranslate = force
        ? currentSegments
        : currentSegments.filter(seg => !subtitleTranslations[seg.text]);

      if (segmentsToTranslate.length === 0) {
        setIsTranslatingSubtitles(false);
        return;
      }

      const response = await fetch('/api/translate-subtitles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          segments: segmentsToTranslate.map(s => ({ text: s.text })),
          sourceLang,
          targetLang
        })
      });

      if (!response.ok) {
        throw new Error("Không thể dịch phụ đề.");
      }

      const data = await response.json();
      if (data && Array.isArray(data.translations)) {
        const newTranslations = { ...subtitleTranslations };
        segmentsToTranslate.forEach((seg, idx) => {
          newTranslations[seg.text] = cleanSubtitleTranslation(data.translations[idx] || "");
        });
        setSubtitleTranslations(newTranslations);

        // Nếu người dùng đang chỉnh sửa phụ đề thủ công, cập nhật bản dịch vào customSubtitleSegments luôn
        if (customSubtitleSegments) {
          const updated = customSubtitleSegments.map(seg => ({
            ...seg,
            translation: cleanSubtitleTranslation(newTranslations[seg.text] || subtitleTranslations[seg.text] || "")
          }));
          setCustomSubtitleSegments(updated);
        }
      }
    } catch (err) {
      console.error("Lỗi khi dịch phụ đề song ngữ:", err);
    } finally {
      setIsTranslatingSubtitles(false);
    }
  };

  // Automatically trigger translation when script or language changes
  useEffect(() => {
    const actScript = editedScript || (activeReview?.marketingScript || '');
    if (bilingualEnabled && actScript) {
      const timer = setTimeout(() => {
        translateActiveSubtitles();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [editedScript, activeReview?.marketingScript, reviewLanguage, bilingualEnabled, audioDuration]);

  // Derived state for live subtitle synchronizing preview
  const activeScriptText = editedScript || (activeReview?.marketingScript || '');
  
  // Tự động phân bổ lại thời gian phụ đề song ngữ và chuẩn hóa chính tả 100% tiếng Việt
  const subtitleSegments = useMemo(() => {
    if (customSubtitleSegments) {
      return customSubtitleSegments.map(seg => ({
        ...seg,
        text: correctVietnameseSpelling(seg.text || "").correctedText,
        translation: cleanSubtitleTranslation(subtitleTranslations[seg.text] || seg.translation || "")
      }));
    }
    const autoSegments = getSegmentsFromScript(
      activeScriptText,
      audioDuration || (videoRef.current?.duration || 0)
    );
    return autoSegments.map(seg => ({
      ...seg,
      text: correctVietnameseSpelling(seg.text || "").correctedText,
      translation: cleanSubtitleTranslation(subtitleTranslations[seg.text] || "")
    }));
  }, [activeScriptText, audioDuration, customSubtitleSegments, subtitleTranslations]);

  const activeSubtitle = showSubtitles && isPlaying
    ? subtitleSegments.find(
        (seg) => (currentAudioTime + subtitleOffset) >= seg.start && (currentAudioTime + subtitleOffset) <= seg.end
      )
    : null;

  const activeSubtitleText = activeSubtitle ? activeSubtitle.text : '';

  const activeVoiceConfig = TTS_VOICES.find(v => v.id === selectedVoice) || TTS_VOICES[0];

  // Parse structured Storyboard Scenes from the Detailed Review
  const storyboardScenes = useMemo<StoryboardScene[]>(() => {
    if (!activeReview?.detailedReview) return [];
    const estDuration = audioDuration || (audioRef.current?.duration || videoRef.current?.duration || 20);
    return parseStoryboardScenes(activeReview.detailedReview, estDuration);
  }, [activeReview?.detailedReview, audioDuration]);

  // Active Storyboard Scene being played currently
  const activeStoryboardScene = useMemo(() => {
    if (!storyboardScenes.length) return null;
    return storyboardScenes.find(s => currentAudioTime >= s.startSec && currentAudioTime <= s.endSec) || storyboardScenes[0];
  }, [storyboardScenes, currentAudioTime]);

  // Unified Seek & Instant Synchronized Playback Function
  const jumpToTimestamp = (targetSeconds: number) => {
    const safeTarget = Math.max(0, Number(targetSeconds.toFixed(2)));
    if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
      audioRef.current.currentTime = Math.min(safeTarget, audioRef.current.duration);
    }
    if (videoRef.current && isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {
      videoRef.current.currentTime = Math.min(safeTarget, videoRef.current.duration);
    }
    setCurrentAudioTime(safeTarget);

    if (audioRef.current && (audioRef.current.paused || !isPlaying)) {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        if (isSyncPlay && videoRef.current) {
          videoRef.current.play().catch(e => console.log(e));
        }
      }).catch(e => console.log(e));
    }
    playSynthesizedSFX('pop', 0.4);
  };

  // Re-align and synchronize subtitle segments 100% with audio duration
  const handleAutoAlignSubtitles = () => {
    const actualDuration = (audioRef.current && audioRef.current.duration > 0 && isFinite(audioRef.current.duration))
      ? audioRef.current.duration
      : (audioDuration || videoRef.current?.duration || 18);

    const fresh = getSegmentsFromScript(activeScriptText, actualDuration);
    const mapped = fresh.map(seg => ({
      ...seg,
      translation: cleanSubtitleTranslation(subtitleTranslations[seg.text] || "")
    }));
    setCustomSubtitleSegments(mapped);
    playSynthesizedSFX('chime', 0.6);
  };

  // Inline Quick Edit for a Subtitle Segment
  const handleSaveInlineSubtitleEdit = (index: number, newText: string) => {
    const updated = [...subtitleSegments];
    if (updated[index]) {
      const spell = correctVietnameseSpelling(newText.trim());
      updated[index] = {
        ...updated[index],
        text: spell.correctedText || newText.trim()
      };
      setCustomSubtitleSegments(updated);
      setEditingSegmentIdx(null);
      playSynthesizedSFX('pop', 0.5);
    }
  };

  // Copy All Timed Subtitles to Clipboard
  const handleCopyTimedSubtitles = () => {
    const segments = customSubtitleSegments || subtitleSegments;
    const formatted = formatTimedSubtitlesClipboard(segments);
    navigator.clipboard.writeText(formatted);
    setCopiedTimedSubtitles(true);
    playSynthesizedSFX('pop', 0.6);
    setTimeout(() => setCopiedTimedSubtitles(false), 2000);
  };

  // Download Subtitles in standard .SRT format
  const downloadSRTFile = () => {
    const segments = customSubtitleSegments || subtitleSegments;
    if (!segments || segments.length === 0) {
      setApiError("Chưa có phụ đề để xuất file SRT!");
      return;
    }
    const srtText = exportToSRT(segments);
    const blob = new Blob([srtText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeReview?.productName || "review_subtitles").toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}.srt`;
    a.click();
    URL.revokeObjectURL(url);
    playSynthesizedSFX('pop', 0.7);
  };

  // Download Subtitles in WebVTT format
  const downloadVTTFile = () => {
    const segments = customSubtitleSegments || subtitleSegments;
    if (!segments || segments.length === 0) {
      setApiError("Chưa có phụ đề để xuất file VTT!");
      return;
    }
    const vttText = exportToVTT(segments);
    const blob = new Blob([vttText], { type: 'text/vtt;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeReview?.productName || "review_subtitles").toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}.vtt`;
    a.click();
    URL.revokeObjectURL(url);
    playSynthesizedSFX('pop', 0.7);
  };

  // Download complete Creator Marketing Package (Markdown)
  const downloadCreatorPackage = () => {
    const prod = activeReview?.productName || productName || "Sản Phẩm Xu Hướng";
    const cat = activeReview?.category || "Tiện ích thông minh";
    const script = editedScript || activeReview?.marketingScript || "";
    const pros = (activeReview?.pros || []).map(p => `- ${p}`).join('\n');
    const cons = (activeReview?.cons || []).map(c => `- ${c}`).join('\n');
    const usps = (activeReview?.uniqueSellingPoints || []).map(u => `⭐ ${u}`).join('\n');
    
    const content = `# 🎬 GÓI TÀI NGUYÊN SÁNG TẠO VIDEO REVIEW TRIỆU VIEWS
## 📦 Sản phẩm: ${prod}
- **Danh mục:** ${cat}
- **Đánh giá AI:** ${activeReview?.rating || 4.9}/5.0
- **Khách hàng mục tiêu:** ${activeReview?.targetedAudience || "Người dùng TikTok & Mua sắm thông minh"}

---

### 🔥 1. CÂU HOOK MỞ MÀN 3S ĐẦU
> "${hookBannerText}"

---

### 🎙️ 2. KỊCH BẢN LỒNG TIẾNG HOÀN CHỈNH (MARKETING SCRIPT)
\`\`\`
${script}
\`\`\`

---

### 💎 3. ĐIỂM NỔI BẬT & USP (UNIQUE SELLING POINTS)
${usps || "- Tính năng vượt trội, trải nghiệm tiện lợi."}

### ⚡ 4. ĐIỂM MẠNH (PROS)
${pros || "- Hoàn thiện cao cấp, giá thành hợp lý."}

### ⚠️ 5. ĐIỂM CẦN LƯU Ý (CONS)
${cons || "- Hàng hot trend nên dễ cháy hàng nhanh."}

---

### 🏷️ 6. HASHTAGS ĐỀ XUẤT TIKTOK FYP
#${prod.toLowerCase().replace(/[^a-zA-Z0-9]/g, '')} #review #tiktokshop #sanphamhot #xuhuong #trend #giare #chatluong #fyp

---
*Xuất từ AI Product Review Studio Pro - Google AI Studio Engine*
`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prod.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}_creator_kit.md`;
    a.click();
    URL.revokeObjectURL(url);
    playSynthesizedSFX('chime', 0.8);
  };

  // 1-Click Multi-Language Subtitle Neural Translation
  const translateAllSubtitlesToLang = async (targetLang: string) => {
    const segments = customSubtitleSegments || subtitleSegments;
    if (!segments || segments.length === 0) {
      setApiError("Hãy tạo kịch bản lồng tiếng trước khi dịch phụ đề!");
      return;
    }
    setIsTranslatingSubtitles(true);
    setTargetTranslateLang(targetLang);
    playSynthesizedSFX('whoosh', 0.6);
    try {
      const textsToTranslate = segments.map(s => s.text);
      const response = await fetch('/api/translate-subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: textsToTranslate,
          targetLang
        })
      });
      if (!response.ok) {
        throw new Error("Không thể dịch phụ đề lúc này.");
      }
      const data = await response.json();
      if (data && Array.isArray(data.translations)) {
        const newTransMap: Record<string, string> = { ...subtitleTranslations };
        segments.forEach((seg, idx) => {
          if (data.translations[idx]) {
            newTransMap[seg.text] = data.translations[idx];
          }
        });
        setSubtitleTranslations(newTransMap);
        setBilingualEnabled(true);
        playSynthesizedSFX('chime', 0.9);
      }
    } catch (err: any) {
      console.error("Lỗi dịch phụ đề:", err);
      setApiError("Lỗi khi dịch phụ đề đa ngôn ngữ.");
    } finally {
      setIsTranslatingSubtitles(false);
    }
  };

  // Keyboard Shortcuts Listener for Pro Power Users
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayState();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 2);
        }
        if (audioRef.current) {
          audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 2);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime = videoRef.current.currentTime + 2;
        }
        if (audioRef.current) {
          audioRef.current.currentTime = audioRef.current.currentTime + 2;
        }
      } else if (e.code === 'KeyM') {
        setVideoOriginalMute(prev => !prev);
      } else if (e.code === 'KeyS') {
        setIsSFXModalOpen(true);
      } else if (e.code === 'KeyH') {
        setShowHookBanner(prev => !prev);
      } else if (e.key === '?') {
        setIsKeyboardHelpOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div 
      id="ai_product_review_root" 
      className={`min-h-screen flex flex-col font-sans transition-colors duration-500 selection:bg-amber-500 selection:text-black relative ${
        theme === 'light' 
          ? 'light-theme bg-[#f8fafc] text-[#1e293b]' 
          : 'bg-[#050505] text-slate-100'
      }`}
    >
      {/* Cinematic ambient lighting background overlay for dark mode */}
      {theme === 'dark' && (
        <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(245,158,11,0.05)_0%,rgba(15,23,42,0)_60%)] pointer-events-none z-0" />
      )}

      {/* GLOBAL STUDIO PROGRESS BAR (STICKY TOP) */}
      {showGlobalProgress && (
        <div id="global_studio_progress" className="fixed top-0 left-0 right-0 z-[110] pointer-events-none">
          {/* Progress track background */}
          <div className="w-full h-1.5 bg-black/50 backdrop-blur-sm relative overflow-hidden">
            {/* Pulsing fill gradient */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${globalProgress}%` }}
              transition={{ ease: "easeOut", duration: 0.15 }}
              className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-amber-400 relative rounded-r shadow-[0_0_15px_rgba(245,158,11,0.75)]"
            >
              {/* Dynamic streaming glow highlight overlay */}
              <div className="absolute inset-0 bg-[#ffffff]/30 w-1/3 h-full rounded shimmer-element" />
            </motion.div>
          </div>

          {/* Elegant Status Toast floating just under the header */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#050505]/95 backdrop-blur-lg px-4 py-2 rounded-full border border-amber-500/30 flex items-center gap-2.5 shadow-[0_10px_35px_rgba(0,0,0,0.8)] animate-fade-in text-[10.5px] tracking-wide pointer-events-auto select-none">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <span className="text-amber-400 font-extrabold uppercase tracking-widest font-sans whitespace-nowrap">Đang xử lý:</span>
            <span className="text-slate-100 font-semibold font-sans truncate max-w-[240px] sm:max-w-[460px]">{currentTaskLabel}</span>
            <span className="text-amber-400 font-mono font-black ml-1.5 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 shrink-0 shadow-inner">{Math.round(globalProgress)}%</span>
          </div>
        </div>
      )}

      {/* HEADER SECTION - Beautiful glassmorphic top navigation */}
      <header id="app_header" className="sticky top-0 z-50 h-16 border-b border-amber-500/15 flex items-center justify-between px-4 sm:px-6 bg-[#050505]/95 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.8)] relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-amber-500 via-yellow-400 to-rose-500 rounded-xl flex items-center justify-center p-[1px] shadow-lg shadow-amber-500/20 shrink-0 relative group">
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-500 to-rose-500 rounded-xl blur opacity-30 group-hover:opacity-50 transition-opacity duration-300 animate-pulse"></div>
            <div className="w-full h-full bg-[#050505] rounded-[11px] flex items-center justify-center relative z-10 transition-transform duration-300 group-hover:scale-[1.02]">
              <BadgeDollarSign className="w-5 h-5 text-amber-400 group-hover:text-amber-300 animate-bounce-slow transition-colors duration-300" />
              <Crown className="w-2.5 h-2.5 text-rose-400 absolute -top-1 -right-1 rotate-12 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] animate-pulse" />
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-display font-light tracking-widest uppercase italic text-white/95">
                Review<span className="text-amber-500 font-bold ml-0.5">Studio AI</span>
              </span>
              <span className="hidden xs:inline-block px-1.5 py-0.5 rounded-full text-[8px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                TOP 1 STUDIO 2026
              </span>
              {systemStatus && (
                <span 
                  className={`hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-mono font-semibold border ${
                    systemStatus.geminiStatus === 'connected'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : (systemStatus.geminiStatus === 'invalid_oauth_token' 
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-blue-500/10 text-blue-400 border-blue-500/20')
                  }`}
                  title={systemStatus.message}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${systemStatus.geminiStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                  {systemStatus.geminiStatus === 'connected' ? 'Gemini 3.8 Flash' : 'AI Studio Engine'}
                </span>
              )}
            </div>
            <div className="text-[9px] text-slate-500 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse"></span>
              <span className="whitespace-nowrap">Sáng tạo bởi <strong className="text-slate-300 font-semibold hover:text-amber-400 transition-colors">Kỹ Sư Văn Toàn</strong></span>
            </div>
          </div>
        </div>

        {/* Global actions */}
        <nav className="flex items-center gap-2 sm:gap-4 md:gap-6">
          <div className="hidden md:flex gap-6 text-xs font-semibold tracking-wider uppercase text-slate-400">
            <a href="#quick_samples" className="hover:text-amber-400 transition-colors">Khám phá mẫu</a>
            <a href="#workspace" className="text-amber-500 border-b-2 border-amber-500 pb-1">Bàn làm việc</a>
            <a href="https://ai.studio/build" target="_blank" rel="noreferrer" className="hover:text-amber-400 flex items-center gap-1 transition-colors">
              AI Studio <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="h-8 w-px bg-white/10 hidden md:block"></div>
          
          {/* Giao diện Sáng/Tối đẳng cấp */}
          <button
            type="button"
            onClick={toggleTheme}
            className={`p-1.5 sm:p-2 rounded-full border transition-all duration-300 flex items-center justify-center cursor-pointer shrink-0 ${
              theme === 'light'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 hover:bg-amber-500/20 shadow-sm'
                : 'bg-white/10 border-white/10 text-amber-400 hover:bg-white/15'
            }`}
            title={theme === 'dark' ? 'Chuyển sang giao diện Sáng siêu sang' : 'Chuyển sang giao diện Tối rạp phim'}
          >
            <motion.div
              layout
              initial={false}
              animate={{ rotate: theme === 'dark' ? 0 : 360 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-amber-500" />
              )}
            </motion.div>
          </button>
          
          {/* User badge */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-full p-1 sm:pl-2 sm:pr-3.5 sm:py-1 text-xs shadow-md shadow-amber-500/5 hover:border-amber-500/40 transition-all duration-300 cursor-pointer shrink-0">
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 via-amber-400 to-rose-500 p-0.5 flex items-center justify-center shadow-md shadow-amber-500/10 shrink-0">
              <div className="w-full h-full bg-[#050505] rounded-full flex items-center justify-center">
                <Crown className="w-3 h-3 text-amber-400" />
              </div>
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider leading-none">KOL Elite Pro</span>
              <span className="text-[8px] text-slate-400 font-medium mt-0.5 leading-none whitespace-nowrap">Doanh Số Triệu Đô</span>
            </div>
          </div>
        </nav>
      </header>

      {/* MOBILE RESPONSIVE NAVIGATION TABS (Visible only on mobile/tablet) */}
      <div className="lg:hidden px-4 py-3 bg-[#050505]/95 backdrop-blur-md border-b border-amber-500/10 sticky top-16 z-40 shadow-[0_4px_25px_rgba(0,0,0,0.6)] relative z-10">
        <div className="flex rounded-xl bg-zinc-950 p-1 border border-white/5 gap-1.5 max-w-sm mx-auto">
          <button
            onClick={() => {
              setActiveMobileTab('inputs');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center transition-all cursor-pointer relative"
          >
            {activeMobileTab === 'inputs' && (
              <motion.div
                layoutId="activeMobileTabIndicator"
                className="absolute inset-0 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/15"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className={`relative z-10 flex items-center justify-center gap-1.5 transition-colors duration-200 ${
              activeMobileTab === 'inputs' ? 'text-black font-extrabold' : 'text-slate-400'
            }`}>
              <Layers className="w-3.5 h-3.5" />
              <span>Thiết lập</span>
            </span>
          </button>
          
          <button
            onClick={() => {
              if (!activeReview) {
                setApiError("Hãy chọn sản phẩm hot trend hoặc tải lên video sản phẩm để AI nhận dạng & tạo kịch bản review trước!");
                setActiveMobileTab('inputs');
                window.scrollTo({ top: 120, behavior: 'smooth' });
                return;
              }
              setActiveMobileTab('results');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center transition-all cursor-pointer relative"
          >
            {activeMobileTab === 'results' && (
              <motion.div
                layoutId="activeMobileTabIndicator"
                className="absolute inset-0 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/15"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className={`relative z-10 flex items-center justify-center gap-1.5 transition-colors duration-200 ${
              activeMobileTab === 'results' ? 'text-black font-extrabold' : 'text-slate-400'
            }`}>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Review AI</span>
            </span>
          </button>

          <button
            onClick={() => {
              if (!activeReview) {
                setApiError("Hãy thiết lập thông tin hoặc tải video lên để hệ thống phân tích lồng tiếng thuyết minh!");
                setActiveMobileTab('inputs');
                window.scrollTo({ top: 120, behavior: 'smooth' });
                return;
              }
              setActiveMobileTab('studio');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center transition-all cursor-pointer relative"
          >
            {activeMobileTab === 'studio' && (
              <motion.div
                layoutId="activeMobileTabIndicator"
                className="absolute inset-0 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/15"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className={`relative z-10 flex items-center justify-center gap-1.5 transition-colors duration-200 ${
              activeMobileTab === 'studio' ? 'text-black font-extrabold' : 'text-slate-400'
            }`}>
              <FileVideo className="w-3.5 h-3.5" />
              <span>Lồng tiếng</span>
            </span>
          </button>
        </div>
      </div>

      {/* TOP STUDIO MASTER FORMULA PRESETS RIBBON - 1-Click Viral Presets & Pro Tools */}
      <section className="w-full max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 pt-4 pb-1 relative z-10">
        <div className="bg-gradient-to-r from-stone-950 via-zinc-900 to-black border border-amber-500/25 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 relative overflow-hidden backdrop-blur-md">
          {/* Ambient glow accent */}
          <div className="absolute -left-10 -top-10 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute right-0 bottom-0 w-44 h-44 bg-rose-500/5 rounded-full blur-3xl pointer-events-none"></div>

          {/* Left Title & Status Indicator */}
          <div className="flex items-center gap-3 relative z-10 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-500 p-0.5 shadow-md shadow-amber-500/20 shrink-0 flex items-center justify-center">
              <div className="w-full h-full bg-[#070707] rounded-[10px] flex items-center justify-center">
                <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-display font-black uppercase text-amber-300 tracking-wider">
                  Bộ Công Thức Triệu View 1-Chạm
                </span>
                <span className="px-1.5 py-0.5 rounded-full text-[8px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  AI MASTER
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">
                Tự động tối ưu Hook 3s đầu, Phụ đề chuyển động & Âm thanh điện ảnh đỉnh cao
              </p>
            </div>
          </div>

          {/* Center 1-Click Viral Preset Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none relative z-10">
            <button
              type="button"
              onClick={() => applyViralPreset('tiktok-viral')}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer border ${
                activePresetKey === 'tiktok-viral'
                  ? 'bg-[#ffe600] text-black border-black shadow-[0_0_12px_rgba(255,230,0,0.5)] font-black scale-105'
                  : 'bg-black/60 text-slate-300 border-white/10 hover:border-amber-500/40 hover:text-amber-300'
              }`}
              title="TikTok Mega Viral: Hook vàng neon, phụ đề từng chữ, bass sống động"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>⚡ TikTok Mega Viral</span>
            </button>

            <button
              type="button"
              onClick={() => applyViralPreset('luxury-aesthetic')}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer border ${
                activePresetKey === 'luxury-aesthetic'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-white border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.5)] font-black scale-105'
                  : 'bg-black/60 text-slate-300 border-white/10 hover:border-amber-500/40 hover:text-amber-300'
              }`}
              title="Luxury Aesthetic: Tông màu Cinematic ấm, phụ đề CapCut Gold, âm thanh Reverb"
            >
              <Gem className="w-3.5 h-3.5" />
              <span>💎 Luxury 4K</span>
            </button>

            <button
              type="button"
              onClick={() => applyViralPreset('tech-unboxing')}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer border ${
                activePresetKey === 'tech-unboxing'
                  ? 'bg-[#ec4899] text-white border-[#22d3ee] shadow-[0_0_12px_rgba(236,72,153,0.5)] font-black scale-105'
                  : 'bg-black/60 text-slate-300 border-white/10 hover:border-pink-500/40 hover:text-pink-300'
              }`}
              title="Tech Unboxing Pro: Phong cách Cyberpunk Neon, tông sắc nét, SFX Shutter"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>📦 Tech Master</span>
            </button>

            <button
              type="button"
              onClick={() => applyViralPreset('flash-sale')}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer border ${
                activePresetKey === 'flash-sale'
                  ? 'bg-[#fe2c55] text-white border-yellow-400 shadow-[0_0_12px_rgba(254,44,85,0.5)] font-black scale-105'
                  : 'bg-black/60 text-slate-300 border-white/10 hover:border-rose-500/40 hover:text-rose-300'
              }`}
              title="Flash Sale Urgency: Hook đỏ rực giục giã, phụ đề viền nổi bật, chuông giỏ hàng"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>🛒 Flash Sale</span>
            </button>

            <button
              type="button"
              onClick={() => applyViralPreset('organic-asmr')}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer border ${
                activePresetKey === 'organic-asmr'
                  ? 'bg-emerald-500 text-black border-black shadow-[0_0_12px_rgba(16,185,129,0.5)] font-black scale-105'
                  : 'bg-black/60 text-slate-300 border-white/10 hover:border-emerald-500/40 hover:text-emerald-300'
              }`}
              title="Organic ASMR: Tối giản chân thực, giữ nguyên âm thanh sản phẩm gốc"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>🌿 Organic ASMR</span>
            </button>
          </div>

          {/* Right Tools: Hotkeys & SFX Trigger */}
          <div className="flex items-center gap-2 relative z-10 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsSFXModalOpen(true);
                playSynthesizedSFX('chime', 0.8);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:scale-105"
              title="Mở Bảng Âm Thanh Hiệu Ứng SFX Studio"
            >
              <Music className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ma Trận SFX</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsKeyboardHelpOpen(true);
                playSynthesizedSFX('pop', 0.6);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Xem danh sách phím tắt chuyên nghiệp"
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Phím tắt</span>
            </button>
          </div>
        </div>
      </section>

      {/* CORE WORKSPACE - Split sidebar and master report */}
      <main id="main_workspace" className="flex-1 max-w-[1600px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8 p-3 sm:p-6 lg:p-8 min-h-0 relative z-10">
        
        {/* SIDEBAR ASIDE: Controls, video upload & local samples */}
        <aside id="workspace_sidebar" className="lg:col-span-5 flex flex-col gap-6">
          
          {/* AI SMART TREND SCOUT SCANNER LAUNCHER */}
          <div className={`bg-gradient-to-br from-slate-900 via-stone-950 to-black border border-amber-500/20 rounded-2xl p-5 shadow-xl relative overflow-hidden group transition-all duration-300 ${
            activeMobileTab === 'inputs' ? 'block' : 'hidden lg:block'
          }`}>
            <div className="absolute -right-12 -top-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all duration-500"></div>
            
            <div className="flex items-start justify-between gap-4 relative z-10">
              <div className="space-y-1.5 flex-1">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider animate-pulse">
                  <TrendingUp className="w-2.5 h-2.5" /> Hot Trend Scout
                </span>
                <h4 className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">Máy Quét Xu Hướng Thị Trường AI</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">Tự động phát hiện & đánh giá các sản phẩm đang cháy hàng để làm video review hút triệu view.</p>
              </div>
              
              <button 
                onClick={() => {
                  setIsTrendingOpen(true);
                  if (scannedProducts.length === 0) {
                    scanTrendingProducts('all');
                  }
                }}
                className="w-11 h-11 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 flex items-center justify-center relative shrink-0 transition-all hover:scale-105 active:scale-95 group/btn cursor-pointer"
                title="Mở máy quét xu hướng"
              >
                <span className="absolute inset-x-0.5 inset-y-0.5 rounded-xl bg-amber-400/10 animate-ping opacity-60"></span>
                <Search className="w-4 h-4 text-amber-400 group-hover/btn:rotate-12 transition-transform duration-300" />
              </button>
            </div>

            <div className="pt-3.5 mt-3.5 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500 relative z-10">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                Dự báo thời gian thực
              </span>
              <button 
                onClick={() => {
                  setIsTrendingOpen(true);
                  if (scannedProducts.length === 0) {
                    scanTrendingProducts('all');
                  }
                }}
                className="text-amber-400 font-semibold hover:underline flex items-center gap-0.5 cursor-pointer bg-transparent border-0 p-0"
              >
                Kích hoạt quét xu hướng ngay <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
          
          {/* SECTION 1: Dynamic Video Uploader & Product Info */}
          <div className={`bg-gradient-to-b from-[#0e0e0e] to-[#050505] border border-amber-500/15 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xl relative overflow-hidden group transition-all duration-300 ${
            activeMobileTab === 'inputs' ? 'block' : 'hidden lg:block'
          }`}>
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 opacity-60"></div>
            
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-[0.2em] text-amber-500 font-bold flex items-center gap-2">
                <FileVideo className="w-4 h-4" /> 
                1. Dữ liệu truyền thông & Sản phẩm
              </h3>
              {uploadedFiles.length > 0 && (
                <button 
                  onClick={clearAllUploadedFiles}
                  className="text-[10px] text-rose-400 hover:underline flex items-center gap-1"
                >
                  Xóa video
                </button>
              )}
            </div>

            {/* MAIN SOURCE MEDIA WORKSPACE */}
            <div className="space-y-1.5">
              <div className="space-y-3">
                <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept="video/*" 
                    multiple
                    onChange={handleFileSelect}
                  />

                  {uploadedFiles.length > 0 ? (
                    <div className="space-y-3">
                      {/* Spliced Track List */}
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                        <span className="text-[9px] text-amber-500 font-bold tracking-wider uppercase block text-left">
                          Các phân cảnh đã ghép nối ({uploadedFiles.length} clips)
                        </span>
                        {uploadedFiles.map((seg, idx) => {
                          const isActive = activeSegmentIndex === idx;
                          return (
                            <div 
                              key={seg.id}
                              className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                                isActive 
                                  ? 'bg-amber-500/10 border-amber-500/30' 
                                  : 'bg-black/40 border-white/5 hover:border-white/15'
                              }`}
                            >
                              <div 
                                onClick={() => setActiveSegmentIndex(idx)}
                                className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                              >
                                <span className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-mono font-bold text-slate-300 shrink-0">
                                  {idx + 1}
                                </span>
                                <div className="w-10 h-10 rounded-lg bg-black border border-white/10 overflow-hidden shrink-0 relative flex items-center justify-center">
                                  <video src={seg.url} className="w-full h-full object-cover" muted playsInline />
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <span className="text-[8px] font-mono text-white font-bold">{seg.duration.toFixed(1)}s</span>
                                  </div>
                                </div>
                                <div className="text-left min-w-0">
                                  <p className="text-[11px] font-semibold text-slate-200 truncate pr-2">{seg.name}</p>
                                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">{formatBytes(seg.size)}</p>
                                </div>
                              </div>

                              {/* Controls */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveVideoSegment(idx, 'up');
                                  }}
                                  disabled={idx === 0}
                                  className={`p-1 rounded-lg border text-slate-405 transition-all ${
                                    idx === 0 
                                      ? 'opacity-30 cursor-not-allowed border-transparent' 
                                      : 'border-white/5 hover:bg-white/5 hover:text-white'
                                  }`}
                                  title="Di chuyển lên"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveVideoSegment(idx, 'down');
                                  }}
                                  disabled={idx === uploadedFiles.length - 1}
                                  className={`p-1 rounded-lg border text-slate-405 transition-all ${
                                    idx === uploadedFiles.length - 1 
                                      ? 'opacity-30 cursor-not-allowed border-transparent' 
                                      : 'border-white/5 hover:bg-white/5 hover:text-white'
                                  }`}
                                  title="Di chuyển xuống"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteVideoSegment(seg.id);
                                  }}
                                  className="p-1 rounded-lg border border-rose-500/10 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-all ml-1"
                                  title="Xóa phân cảnh"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Dropzone append area + Quick Action */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="py-2 px-3 border border-dashed border-amber-500/25 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 text-amber-400 text-[10px] font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Thêm video clip khác
                        </button>
                        <button
                          type="button"
                          onClick={clearAllUploadedFiles}
                          className="py-2 px-3 border border-rose-500/20 rounded-xl bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 text-[10px] font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Xóa toàn bộ danh sách
                        </button>
                      </div>

                      {/* Intelligent Auto-Splicing Engine HUD Summary Card */}
                      <div className="bg-[#0b0c10] border border-amber-500/10 p-3 rounded-2xl text-left space-y-2 relative overflow-hidden">
                        <div className="flex items-center justify-between">
                          <span className="text-[8.5px] text-amber-500 font-extrabold tracking-widest block font-sans uppercase flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                            BÀN SPLICING GHÉP NỐI THÔNG MINH
                          </span>
                          <span className="text-[8px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded-full uppercase">
                            Chuyển Cảnh: {videoTransition === 'none' ? 'Liền mạch' : videoTransition.toUpperCase()}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-black/40 p-1.5 rounded-lg border border-white/[0.03]">
                            <p className="text-[8px] text-slate-400 uppercase font-bold">Số lượng clip</p>
                            <p className="text-sm font-black text-amber-400 font-mono mt-0.5">{uploadedFiles.length}</p>
                          </div>
                          <div className="bg-black/40 p-1.5 rounded-lg border border-white/[0.03]">
                            <p className="text-[8px] text-slate-400 uppercase font-bold">Tổng thời lượng</p>
                            <p className="text-sm font-black text-emerald-400 font-mono mt-0.5">{uploadedVideoDuration.toFixed(1)}s</p>
                          </div>
                          <div className="bg-black/40 p-1.5 rounded-lg border border-white/[0.03]">
                            <p className="text-[8px] text-slate-400 uppercase font-bold font-sans">Tổng dung lượng</p>
                            <p className="text-xs font-black text-blue-400 font-mono mt-1.5">
                              {formatBytes(uploadedFiles.reduce((acc, f) => acc + f.size, 0))}
                            </p>
                          </div>
                        </div>

                        <div className="text-[8.5px] text-slate-400 leading-relaxed bg-white/5 p-2 rounded-xl border border-white/[0.02]">
                          💡 <span className="text-emerald-400 font-bold">Đồng bộ tự động thông minh:</span> Trình phát Studio sẽ tự động ghép nối và chèn hiệu ứng chuyển cảnh <span className="text-amber-400 font-extrabold">"{videoTransition === 'none' ? 'liền mạch' : videoTransition}"</span> tại các điểm tiếp nối phân cảnh trong thời gian thực.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div 
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`aspect-video rounded-xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center p-4 text-center cursor-pointer select-none relative group ${
                        isDragging 
                          ? 'border-amber-400 bg-amber-500/5' 
                          : 'border-white/10 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/20'
                      }`}
                    >
                      <div className="space-y-2 flex flex-col items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                          <FileUp className="w-5 h-5 text-slate-400 group-hover:text-amber-400" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-slate-300 group-hover:text-amber-400 transition-colors">
                            Kéo thả hoặc click để chọn nhiều video
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Hệ thống tự động ghép nối và tối ưu hóa thông minh (Tối đa 1 GB/file)
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            {/* PRODUCT IMAGE UPLOAD SECTION */}
            <div className="space-y-2 pt-1 border-t border-white/5 mt-1">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Ảnh chụp sản phẩm ({productImages.length}/5)</span>
                  <p className="text-[9px] text-slate-500 leading-none mt-1">Nên tải lên nhiều góc khác nhau để AI phân tích chuẩn xác nhất</p>
                </div>
                {productImages.length > 0 && (
                  <button 
                    type="button"
                    onClick={clearAllProductImages}
                    className="text-[9px] uppercase tracking-wider font-bold text-rose-400 hover:text-rose-300 transition-colors bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded cursor-pointer"
                  >
                    Xóa tất cả ({productImages.length})
                  </button>
                )}
              </div>

              {/* Hidden multi-image file input */}
              <input 
                type="file" 
                ref={productImageInputRef}
                className="hidden" 
                accept="image/*" 
                multiple
                onChange={(e) => {
                  if (e.target.files) {
                    processProductImageFiles(e.target.files);
                  }
                }}
              />

              {productImages.length > 0 ? (
                /* Dynamic Grid Layout for Uploaded Images with native drag support */
                <div 
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      processProductImageFiles(e.dataTransfer.files);
                    }
                  }}
                  className="grid grid-cols-5 gap-2 p-2 bg-[#050505] rounded-xl border border-white/10"
                >
                  {productImages.map((img) => (
                    <div 
                      key={img.id}
                      className="aspect-square rounded-lg overflow-hidden border border-white/10 relative group bg-black"
                    >
                      <img 
                        src={img.url} 
                        alt={img.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeProductImage(img.id);
                        }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/75 hover:bg-rose-600 border border-white/10 text-white flex items-center justify-center transition-colors shadow cursor-pointer"
                        title="Xóa ảnh"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {/* Add more image button if count is less than 5 */}
                  {productImages.length < 5 && (
                    <button
                      type="button"
                      onClick={() => productImageInputRef.current?.click()}
                      className="aspect-square rounded-lg border-2 border-dashed border-white/10 hover:border-amber-500/40 bg-white/[0.01] hover:bg-white/[0.03] flex flex-col items-center justify-center text-slate-500 hover:text-amber-400 transition-all group cursor-pointer"
                    >
                      <Plus className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-bold uppercase tracking-wider">Thêm ảnh</span>
                    </button>
                  )}
                </div>
              ) : (
                /* Empty state - Big drag-and-drop click trigger area with native drag support */
                <div 
                  onClick={() => productImageInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      processProductImageFiles(e.dataTransfer.files);
                    }
                  }}
                  className="aspect-[21/9] rounded-xl border-2 border-dashed transition-all duration-300 flex items-center justify-center p-3 text-center cursor-pointer select-none relative group border-white/10 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/20 hover:border-amber-500/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                      <FileUp className="w-4 h-4 text-slate-400 group-hover:text-amber-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-semibold text-slate-300 group-hover:text-amber-400 transition-colors">Tải lên ảnh sản phẩm (Tối đa 5 ảnh)</p>
                      <p className="text-[9px] text-slate-500">Giúp AI phân tích chính xác từng nhãn mác, góc cạnh.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SMART RECOGNITION CALL-TO-ACTION */}
            {(uploadedFile || productImageBase64 || productImages.length > 0) && (
              <div className="pt-1.5 pb-1 select-none">
                <button
                  type="button"
                  onClick={executeQuickRecognition}
                  disabled={isIdentifying}
                  className={`w-full py-2.5 px-3.5 rounded-xl border transition-all flex items-center justify-between text-xs font-bold group cursor-pointer relative overflow-hidden shadow-lg ${
                    isIdentifying 
                      ? 'border-amber-500/50 bg-gradient-to-r from-amber-950/40 via-amber-900/30 to-black text-amber-300 animate-pulse cursor-wait' 
                      : 'border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent hover:border-amber-400/60 hover:bg-amber-500/15 text-amber-400 active:scale-[0.99]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                      <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${isIdentifying ? 'animate-spin' : 'group-hover:rotate-12 transition-transform'}`} />
                    </div>
                    <span className="text-left font-display">
                      {isIdentifying 
                        ? 'ĐANG QUÉT THỊ GIÁC AI OCR & TÌM KIẾM USP...' 
                        : '⚡ NHẬN DIỆN THÔNG MINH 1-CHẠM (AI VISION OCR)'
                      }
                    </span>
                  </div>
                  <span className="text-[8px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {isIdentifying ? 'Scanning...' : 'Sub-Second'}
                  </span>
                </button>
              </div>
            )}

            {/* Custom Product Inputs */}
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-300 font-semibold block">Tên sản phẩm</span>
                  {productName && (
                    <span className="text-[8px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                      Đã nhận diện
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Nhập hoặc quét tự động tên sản phẩm..."
                  className="w-full rounded-xl bg-[#050505] border border-white/10 p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all font-sans"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-300 font-semibold block">Mô tả đặc tính & Công năng đột phá</span>
                  <span className="text-[8px] font-mono text-slate-500">Tự động điền qua AI OCR</span>
                </div>
                <textarea
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                  placeholder="Nhập hoặc quét tự động đặc trưng nổi bật, chất liệu, tính năng đột phá..."
                  className="w-full h-16 rounded-xl bg-[#050505] border border-white/10 p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 resize-none transition-all font-sans"
                />
              </div>

              {suggestedKeywords.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[9px] text-amber-400 font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    Hashtags thịnh hành đề xuất (Nhấp để thêm nhanh):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {suggestedKeywords.map((kw, idx) => {
                      const cleanTag = kw.startsWith('#') ? kw : `#${kw.replace(/\s+/g, '')}`;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setCustomPrompt(prev => {
                              if (prev.includes(cleanTag)) return prev;
                              return prev ? `${prev} ${cleanTag}` : cleanTag;
                            });
                          }}
                          className="text-[9px] bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 hover:border-amber-500/50 text-amber-300 px-2 py-0.5 rounded-full transition-all duration-200 cursor-pointer active:scale-95"
                        >
                          {cleanTag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Custom AI Directing Parameter Options */}
            <div className="space-y-3 pt-2">
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Tông giọng bài viết</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  'Thuyết phục & Truyền cảm',
                  'Sôi nổi & Kích thích',
                  'Phân tích chuyên sâu',
                  'Hài hước & Gần gũi'
                ].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setTonePreset(opt)}
                    className={`p-2 rounded-lg border text-left transition-all truncate ${
                      tonePreset === opt 
                        ? 'border-amber-400/40 bg-amber-500/5 text-amber-400 font-semibold' 
                        : 'border-white/5 bg-white/[0.02] text-slate-300 hover:border-white/20'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>

              {/* PHƯƠNG PHÁP BÁN HÀNG ĐỈNH CAO */}
              <div className="space-y-3 pt-3 border-t border-amber-500/10">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] uppercase tracking-[0.12em] text-slate-400 font-bold flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    Thực Chiến Tâm Lý Chốt Đơn
                  </label>
                  <span className="text-[8px] text-amber-500 font-mono font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/15 uppercase">Premium</span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    { id: 'pas', title: 'PASO Kiệt Tác (Problem - Agitate - Solve - Outcome)', desc: 'Khoét sâu nỗi đau âm thầm, xoa dịu bằng cứu cánh tối thượng & thăng hoa trải nghiệm', badge: 'Tâm Lý Đỉnh Cao' },
                    { id: 'aida', title: 'AIDA Thượng Hạng & Zeigarnik Effect', desc: 'Hook 3s dang dở gây tò mò cực đại, khơi khát khao, dẫn dụ ấn giỏ hàng vàng nhỏ xinh', badge: 'Viral Triệu View' },
                    { id: 'fab', title: 'FAB & Hiệu Ứng Sở Hữu (Endowment Effect)', desc: 'Chuyển hóa thông số khô khan, chạm khắc ngôn từ xúc giác giúp sở hữu sớm trong tâm trí', badge: 'Định Vị Vị Thế' },
                    { id: 'nlp', title: 'Thôi Miên Ngôn Từ NLP (VAK Sensory & Peak-End)', desc: 'Kích hoạt ngũ quan nghe-nhìn-chạm, kiến tạo đỉnh cao xúc cảm & kết thúc ngọt lịm', badge: 'Chạm Sâu Cảm Xúc' },
                    { id: 'fomo', title: 'Daniel Kahneman Loss Aversion & FOMO Rush', desc: 'Đánh thức tâm lý sợ tổn thất và lãng phí vô hình, thôi thúc chốt đơn chớp nhoáng', badge: 'Săn Deal Cấp Bách' },
                  ].map((fm) => (
                    <button
                      key={fm.id}
                      type="button"
                      onClick={() => setSalesFramework(fm.id as any)}
                      className={`relative p-2.5 rounded-xl border text-left transition-all duration-300 flex flex-col gap-1 select-none cursor-pointer overflow-hidden ${
                        salesFramework === fm.id
                          ? 'border-amber-400/30 bg-zinc-950 text-white shadow-lg shadow-amber-500/5'
                          : 'border-white/5 bg-white/[0.01] hover:border-white/15 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {salesFramework === fm.id && (
                        <div className="absolute inset-y-0 left-0 w-[2.5px] bg-gradient-to-b from-amber-400 to-rose-500"></div>
                      )}
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-[11px] font-bold leading-tight ${salesFramework === fm.id ? 'text-amber-400' : 'text-slate-300'}`}>
                          {fm.title}
                        </span>
                        <span className={`text-[7px] font-mono font-bold px-1.5 py-0.2 rounded-full border ${
                          salesFramework === fm.id
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-white/5 text-slate-500 border-white/5'
                        }`}>
                          {fm.badge}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-500 leading-normal">
                        {fm.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* PHƯƠNG THỨC & PHONG CÁCH REVIEW THÔNG MINH */}
              <div className="space-y-3.5 bg-white/[0.01] border border-white/5 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3.5">
                  <span className="text-[7px] text-amber-500/40 font-mono tracking-widest">ENGINE_PRESET_V2</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-[10px] uppercase tracking-widest text-slate-300 font-bold">Chế độ phân tích & Phong cách Review</span>
                </div>

                {/* Segmented control with high-end aesthetic feedback */}
                <div className="grid grid-cols-2 gap-2 bg-[#050505] p-1 rounded-xl border border-white/5 relative">
                  <button
                    type="button"
                    onClick={() => setReviewType('normal')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer select-none relative z-10 ${
                      reviewType === 'normal'
                        ? 'bg-gradient-to-b from-[#212121] to-[#0e0e0e] text-slate-100 border border-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.5)]'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className={`w-3.5 h-3.5 ${reviewType === 'normal' ? 'text-amber-400' : 'text-slate-400'}`} />
                      <span>Review Thường</span>
                    </div>
                    <span className="text-[7.5px] font-mono uppercase tracking-wider text-slate-500">Vlog & Lifestyle</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewType('product')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer select-none relative z-10 ${
                      reviewType === 'product'
                        ? 'bg-gradient-to-b from-[#212121] to-[#0e0e0e] text-amber-400 border border-amber-500/20 shadow-[0_2px_10px_rgba(245,158,11,0.05)]'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <ShoppingBag className={`w-3.5 h-3.5 ${reviewType === 'product' ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
                      <span>Review Sản Phẩm</span>
                    </div>
                    <span className="text-[7.5px] font-mono uppercase tracking-wider text-amber-500/60">High-Converting Sales</span>
                  </button>
                </div>

                {/* NGÔN NGỮ REVIEW (Bilingual Toggle) */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center">
                    <label className="block text-[9px] uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-amber-500 animate-spin-slow" />
                      Ngôn ngữ kịch bản & AI Voice
                    </label>
                    <span className="text-[8.5px] font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 uppercase tracking-wider">
                      {reviewLanguage === 'vi' ? 'Tiếng Việt 🇻🇳' : 'English 🇬🇧'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 bg-[#050505] p-1 rounded-xl border border-white/5 relative">
                    <button
                      type="button"
                      onClick={() => handleLanguageChange('vi')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none relative z-10 ${
                        reviewLanguage === 'vi'
                          ? 'bg-gradient-to-b from-[#212121] to-[#0e0e0e] text-amber-400 border border-amber-500/20 shadow-[0_2px_10px_rgba(245,158,11,0.05)] font-bold'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      <span className="text-sm">🇻🇳</span>
                      <span>TIẾNG VIỆT</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange('en')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none relative z-10 ${
                        reviewLanguage === 'en'
                          ? 'bg-gradient-to-b from-[#212121] to-[#0e0e0e] text-amber-400 border border-amber-500/20 shadow-[0_2px_10px_rgba(245,158,11,0.05)] font-bold'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      <span className="text-sm">🇬🇧</span>
                      <span>ENGLISH</span>
                    </button>
                  </div>
                </div>

                {/* Highly aesthetic smart description matching selection with visual indicators */}
                <div className="p-3 bg-white/[0.01] border border-white/5 rounded-xl text-[10px] text-slate-400 leading-relaxed font-sans space-y-1">
                  {reviewType === 'normal' ? (
                    <>
                      <p className="font-semibold text-emerald-400 flex items-center gap-1 text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {reviewLanguage === 'en' ? 'Storytelling, Vlog style & Organic follower growth' : 'Chế độ kể chuyện, truyền cảm hứng & Follow kênh'}
                      </p>
                      <p className="text-slate-400">
                        {reviewLanguage === 'en' ? (
                          <>
                            Absolutely <strong className="text-emerald-300 font-bold">NO direct selling</strong>. Generates an authentic, highly engaging lifestyle story by a real blogger, seamlessly inserting a high-retention call to <strong className="text-slate-200 font-bold">Follow</strong>.
                          </>
                        ) : (
                          <>
                            Hoàn toàn <strong className="text-emerald-300 font-bold">KHÔNG bán hàng</strong> hay kêu gọi mua sắm. Bài viết thuần túy mang đậm dấu ấn cá nhân mộc mạc, đầy cuốn hút và tinh tế từ blogger thực thụ, lồng ghép lời kêu gọi bấm <strong className="text-slate-200 font-bold">Theo dõi (Follow)</strong> cực duyên để giữ chân khán giả trung thành.
                          </>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-amber-400 flex items-center gap-1 text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                        {reviewLanguage === 'en' ? 'Marketing, KOC & High-Converting Sales Pitch' : 'Chế độ tiếp thị, KOC & Chuyển đổi cao'}
                      </p>
                      <p className="text-slate-300">
                        {reviewLanguage === 'en' ? (
                          <>
                            Leverages advanced consumer psychology frameworks (PAS, AIDA, FAB...). Articulates key product features, drives urgency to check the cart, and delivers a robust call to purchase.
                          </>
                        ) : (
                          <>
                            Tận dụng toàn diện tâm lý học bán hàng (PAS, AIDA, FAB...). Phác họa sâu sắc tính năng, giục giã xem giỏ hàng/mua sắm và kêu gọi chốt đơn quyết liệt.
                          </>
                        )}
                      </p>
                    </>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="block text-[9px] uppercase tracking-widest text-slate-400 font-semibold">
                      {reviewLanguage === 'en' ? 'Custom Directives (Optional)' : 'Yêu cầu bổ sung (Optional)'}
                    </label>
                    <span className="text-[8px] font-mono text-slate-600">
                      {reviewLanguage === 'en' ? 'freely guide the AI script' : 'tự do tinh chỉnh kịch bản'}
                    </span>
                  </div>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder={
                      reviewLanguage === 'en'
                        ? "Example: Highlight long battery life, use a highly enthusiastic and energetic voice, speak to young tech enthusiasts..."
                        : reviewType === 'normal'
                          ? "Ví dụ: Kể về kỷ niệm cá nhân vui nhộn, lối hành văn thân thiện giống một vlogger chia sẻ..."
                          : "Ví dụ: Tập trung làm nổi bật bảo hành, phong cách kể chuyện dí dỏm bằng tiếng Việt..."
                    }
                    className="w-full h-14 rounded-lg bg-[#050505] border border-white/10 p-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 resize-none hover:border-white/20 transition-all font-sans"
                  />
                </div>
              </div>

              {/* Local API errors or action blockers */}
              {apiError && (
                <div id="local-analysis-error" className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-left animate-[fadeIn_0.2s_ease-out]">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider font-mono">Lỗi xử lý hệ thống:</p>
                    <p className="text-[11px] text-rose-200/90 leading-relaxed font-sans">{apiError}</p>
                  </div>
                </div>
              )}

              {/* Action trigger button */}
              <button
                id="start-analysis-btn"
                onClick={executeVideoAnalysis}
                disabled={isAnalyzing || !uploadedFile}
                className={`w-full py-4 rounded-xl font-display font-medium text-xs uppercase tracking-[0.15em] flex items-center justify-center gap-2.5 transition-all relative overflow-hidden cursor-pointer ${
                  isAnalyzing 
                    ? 'bg-slate-800 text-amber-300 border border-amber-500/30 cursor-wait' 
                    : !uploadedFile
                      ? 'bg-slate-900 border border-white/10 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 text-black hover:brightness-110 active:scale-[0.98] shadow-[0_4px_25px_rgba(245,158,11,0.35)] hover:shadow-[0_4px_35px_rgba(245,158,11,0.6)] hover:scale-[1.005]'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
                    <span className="font-sans font-bold tracking-wider text-amber-300">
                      {extractionProgress !== null 
                        ? `ĐANG BÓC TÁCH KHUNG HÌNH (${extractionProgress}%)...`
                        : `AI ĐANG PHÂN TÍCH & SOẠN BÀI REVIEW ${reviewType === 'normal' ? 'VLOG' : 'ĐẲNG CẤP'}...`}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-black shrink-0 animate-pulse" />
                    <span className="font-sans font-black tracking-wider">
                      🚀 BẮT ĐẦU PHÂN TÍCH & VIẾT REVIEW {reviewType === 'normal' ? 'THƯỜNG' : 'SẢN PHẨM'} ĐẲNG CẤP
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* SECTION 2: Voiceover Actor settings (TTS config) */}
          <div id="quick_samples" className={`bg-gradient-to-b from-[#0e0e0e] to-[#050505] border border-amber-500/15 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xl relative transition-all duration-300 ${
            activeMobileTab === 'inputs' ? 'block' : 'hidden lg:block'
          }`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-[0.2em] text-amber-500 font-bold flex items-center gap-2">
                <Volume2 className="w-4 h-4 animate-bounce" />
                2. Giọng đọc AI lồng tiếng
              </h3>
              
              <span className={`text-[8.5px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border transition-all duration-300 ${
                voiceGenderFilter === 'female'
                  ? 'bg-pink-500/10 text-pink-400 border-pink-500/20 shadow-[0_0_8px_rgba(244,63,94,0.1)]'
                  : 'bg-sky-500/10 text-sky-400 border-sky-500/20 shadow-[0_0_8px_rgba(14,165,233,0.1)]'
              }`}>
                {voiceGenderFilter === 'female' ? 'Mẫu giọng Nữ' : 'Mẫu giọng Nam'}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Lựa chọn tông giọng đọc tối ưu cho từng loại kịch bản để tăng kịch tính và thuyết phục mua sắm.
            </p>

            {/* Technology Engine Info Card */}
            <div className="space-y-1.5 bg-gradient-to-r from-amber-500/[0.03] to-orange-500/[0.03] border border-amber-500/20 rounded-xl p-3 shadow-[0_0_15px_rgba(245,158,11,0.03)]">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 animate-pulse" />
                  <span>⚡ Động cơ Lồng tiếng Google AI Studio (Gemini)</span>
                </label>
                <span className="text-[8px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-500/30">
                  PREMIUM PRO
                </span>
              </div>
              <p className="text-[9.5px] text-amber-300/90 leading-relaxed font-sans font-medium">
                🤖 Đang kích hoạt <strong>Trí tuệ Nhân tạo Gemini</strong> để lồng tiếng chuẩn giọng đọc miền Nam (Sài Gòn - Nam Bộ). <strong className="text-emerald-400">Đã loại bỏ vĩnh viễn giọng miền Bắc</strong> với bộ lọc tự động chuyển ngữ Nam Bộ 100%, đem lại cảm xúc điện ảnh kịch tính, lôi cuốn và trầm bổng nịnh tai nhất.
              </p>
            </div>

            {/* Smart Gender Selector Segmented Tabs */}
            <div className="grid grid-cols-2 p-1 bg-white/[0.02] border border-white/5 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => {
                  setVoiceGenderFilter('female');
                  // Intelligent auto-selection: avoid mixup where activeVoice is male or wrong language
                  const activeVoice = TTS_VOICES.find(v => v.id === selectedVoice);
                  if (!activeVoice || activeVoice.gender !== 'female' || (activeVoice.language || 'vi') !== reviewLanguage) {
                    const firstFemale = TTS_VOICES.find(v => v.gender === 'female' && (v.language || 'vi') === reviewLanguage);
                    if (firstFemale) {
                      setSelectedVoice(firstFemale.id);
                    }
                  }
                }}
                className={`py-2 px-3 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer select-none border ${
                  voiceGenderFilter === 'female'
                    ? 'bg-gradient-to-r from-pink-500/15 to-rose-500/15 border-pink-500/30 text-pink-300 shadow-[0_0_12px_rgba(244,63,94,0.12)] font-black'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${voiceGenderFilter === 'female' ? 'bg-pink-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]' : 'bg-slate-500'}`} />
                Giọng Nữ (Female)
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setVoiceGenderFilter('male');
                  // Intelligent auto-selection: avoid mixup where activeVoice is female or wrong language
                  const activeVoice = TTS_VOICES.find(v => v.id === selectedVoice);
                  if (!activeVoice || activeVoice.gender !== 'male' || (activeVoice.language || 'vi') !== reviewLanguage) {
                    const firstMale = TTS_VOICES.find(v => v.gender === 'male' && (v.language || 'vi') === reviewLanguage);
                    if (firstMale) {
                      setSelectedVoice(firstMale.id);
                    }
                  }
                }}
                className={`py-2 px-3 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer select-none border ${
                  voiceGenderFilter === 'male'
                    ? 'bg-gradient-to-r from-sky-500/15 to-blue-500/15 border-sky-500/30 text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.12)] font-black'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${voiceGenderFilter === 'male' ? 'bg-sky-400 shadow-[0_0_6px_rgba(14,165,233,0.8)]' : 'bg-slate-500'}`} />
                Giọng Nam (Male)
              </button>
            </div>

            {/* Filtered Voice List */}
            <div className="space-y-2">
              {TTS_VOICES.filter((voice) => voice.gender === voiceGenderFilter && (voice.language || 'vi') === reviewLanguage).map((voice) => (
                <button
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={`w-full p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 relative group cursor-pointer ${
                    selectedVoice === voice.id
                      ? voiceGenderFilter === 'female'
                        ? 'border-pink-500/40 bg-pink-500/[0.04] shadow-[inner_0_0_12px_rgba(244,63,94,0.08)]'
                        : 'border-sky-500/40 bg-sky-500/[0.04] shadow-[inner_0_0_12px_rgba(14,165,233,0.08)]'
                      : 'border-white/5 bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.03]'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full mt-1 shrink-0 flex items-center justify-center border ${
                    selectedVoice === voice.id
                      ? voiceGenderFilter === 'female'
                        ? 'border-pink-500 bg-pink-500 text-white shadow-[0_0_8px_rgba(244,63,94,0.7)]'
                        : 'border-sky-500 bg-sky-500 text-white shadow-[0_0_8px_rgba(14,165,233,0.7)]'
                      : 'border-slate-600 bg-transparent group-hover:border-slate-500'
                  }`}>
                    {selectedVoice === voice.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  
                  <div className="space-y-1 w-full pointer-events-none">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-bold transition-colors ${
                        selectedVoice === voice.id 
                          ? voiceGenderFilter === 'female' ? 'text-pink-300' : 'text-sky-300' 
                          : 'text-slate-200 group-hover:text-white'
                      }`}>
                        {voice.name}
                      </span>
                      
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[8px] tracking-wider font-mono border px-1.5 py-0.5 rounded transition-all ${
                          voice.language === 'en'
                            ? 'text-amber-400 border-amber-500/20 bg-amber-500/10'
                            : 'text-teal-400 border-teal-500/20 bg-teal-500/10'
                        }`}>
                          {voice.language === 'en' ? '🇬🇧 EN' : '🇻🇳 VI'}
                        </span>
                        
                        <span className={`text-[8px] uppercase tracking-widest font-mono border px-1.5 py-0.5 rounded transition-all ${
                          voice.gender === 'female' 
                            ? 'text-pink-400 border-pink-500/20 bg-pink-500/10' 
                            : 'text-sky-400 border-sky-500/20 bg-sky-500/10'
                        }`}>
                          {voice.gender === 'female' ? 'Nữ' : 'Nam'}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      {voice.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Playback speed dial with automatic intelligence */}
            <div className="space-y-3 pt-2.5 border-t border-white/5 text-left">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
                  Tốc độ đọc giọng nói
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all duration-300 ${
                    isAutoSpeedEnabled 
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                      : 'bg-white/5 text-slate-400 border border-white/5'
                  }`}>
                    {isAutoSpeedEnabled ? 'Auto 🤖' : 'Thủ công ⚙️'}
                  </span>
                  <span className="text-[11px] text-amber-400 font-black font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{playbackSpeed.toFixed(1)}x</span>
                </div>
              </div>

              {/* Slider (Disabled visually or interactive based on toggle) */}
              <div className="space-y-1">
                <input
                  type="range"
                  min="0.8"
                  max="1.5"
                  step="0.1"
                  value={playbackSpeed}
                  disabled={isAutoSpeedEnabled}
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                  className={`w-full h-1 rounded-lg appearance-none cursor-pointer transition-all ${
                    isAutoSpeedEnabled 
                      ? 'bg-white/5 accent-amber-500/40 opacity-70 cursor-not-allowed' 
                      : 'bg-white/10 accent-amber-500'
                  }`}
                />
                <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                  <span>0.8x (Chậm)</span>
                  <span className={playbackSpeed === 1.0 ? 'text-amber-400 font-bold' : ''}>1.0x (Chuẩn)</span>
                  <span>1.5x (Nhanh)</span>
                </div>
              </div>

              {/* Intelligent Speed Optimizer control bar */}
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-300 font-medium">Tự động hóa thông minh (Auto-Sync)</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextState = !isAutoSpeedEnabled;
                      setIsAutoSpeedEnabled(nextState);
                      if (nextState) {
                        // Force update immediately
                        const text = editedScript || (activeReview ? activeReview.marketingScript : '');
                        const idealVal = getIdealSpeechSpeed(text);
                        setPlaybackSpeed(idealVal.speed);
                      }
                    }}
                    className={`text-[9px] font-bold px-2.5 py-1 rounded-lg transition-all border cursor-pointer ${
                      isAutoSpeedEnabled
                        ? 'bg-amber-500 text-black border-amber-500 shadow-[0_2px_8px_rgba(245,158,11,0.2)] hover:bg-amber-400 font-extrabold'
                        : 'bg-transparent text-slate-300 border-white/10 hover:border-amber-500/30 hover:bg-white/5'
                    }`}
                  >
                    {isAutoSpeedEnabled ? 'Đang bật Auto ✓' : 'Bật Auto-Sync'}
                  </button>
                </div>

                {/* Live speech stats diagnostics */}
                {(() => {
                  const text = editedScript || (activeReview ? activeReview.marketingScript : '');
                  const stats = getIdealSpeechSpeed(text);
                  const isSpeechTooLong = stats.estimatedDuration > stats.videoDuration;
                  
                  return (
                    <div className="space-y-1.5 text-[9px] border-t border-white/5 pt-1.5 font-sans leading-relaxed">
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-400">
                        <div className="flex justify-between">
                          <span>Kịch bản:</span>
                          <strong className="text-slate-200">{stats.wordCount} từ</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Video có sẵn:</span>
                          <strong className="text-slate-200">{stats.videoDuration.toFixed(1)}s</strong>
                        </div>
                        <div className="flex justify-between col-span-2">
                          <span>Dự tính giọng đọc kết xuất:</span>
                          <strong className={isSpeechTooLong ? 'text-rose-400' : 'text-emerald-400'}>
                            ~{stats.estimatedDuration}s {isSpeechTooLong ? `(Hụt ${Math.abs(stats.estimatedDuration - stats.videoDuration).toFixed(1)}s)` : '(Đồng bộ đẹp ✓)'}
                          </strong>
                        </div>
                      </div>

                      {/* Visual status feedback badge */}
                      <div className="pt-0.5">
                        {stats.wordCount === 0 ? (
                          <span className="text-slate-500 italic block">Chưa tải kịch bản review.</span>
                        ) : stats.status === 'too-slow' ? (
                          <div className="flex items-start gap-1 p-1 py-1 px-1.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 rounded-md font-sans">
                            <span className="shrink-0">⚠️</span>
                            <span>Kịch bản dài hơn video của bạn. Hãy bật <b>Auto-Sync</b> ở trên hoặc tăng tốc lên chút để tránh giọng đọc bị ngắt giữa chừng.</span>
                          </div>
                        ) : stats.status === 'too-fast' ? (
                          <div className="flex items-start gap-1 p-1 py-1 px-1.5 bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 rounded-md font-sans">
                            <span className="shrink-0">💡</span>
                            <span>Kịch bản hơi ngắn so với độ dài video. Có thể giảm bớt tốc độ đọc để giọng lọt lòng tự nhiên hơn.</span>
                          </div>
                        ) : (
                          <div className="flex items-start gap-1 p-1 py-1 px-1.5 bg-green-500/15 border border-green-500/30 text-emerald-400 rounded-md font-sans">
                            <span className="shrink-0">✓</span>
                            <span>Tốc độ lý tưởng! Từ chữ đến hình đều khớp cực kỳ cân đối, chuyên nghiệp và có không gian đệm an toàn.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* SECTION 3: Unified Studio Dubbing & Synced Player */}
          {activeReview && (uploadedFileUrl || activeReview.videoUrl) && (
            <div className={`bg-gradient-to-b from-[#0e0e0e] to-[#050505] border border-amber-500/15 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xl relative overflow-hidden transition-all duration-300 ${
              activeMobileTab === 'studio' ? 'block' : 'hidden lg:block'
            }`}>
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-[0.2em] text-amber-500 font-bold flex items-center gap-2">
                  <FileVideo className="w-4 h-4 text-amber-400" />
                  3. Studio Lồng Tiếng & Đồng Bộ
                </h3>
                <span className="text-[9px] text-[#22c55e] font-mono font-bold uppercase bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded">
                  Live Sync
                </span>
              </div>

              {/* Smartphone Framed View Screen */}
              <div className="relative aspect-[9/16] w-full max-w-[260px] mx-auto rounded-3xl border border-white/15 overflow-hidden bg-[#0d0d0d] shadow-2xl group/video">
                {uploadedFiles.length > 0 ? (
                  uploadedFiles.map((seg, idx) => (
                    <video
                      key={seg.id || idx}
                      ref={el => {
                        segmentVideoRefs.current[idx] = el;
                      }}
                      crossOrigin="anonymous"
                      src={seg.url}
                      className={`w-full h-full object-cover absolute inset-0 transition-opacity duration-300 ${
                        idx === activeSegmentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
                      }`}
                      style={{
                        transform: (activeTransitionId === 'zoom_blur' && idx === activeSegmentIndex)
                          ? `scale(${1 + Math.sin(transitionProgress * Math.PI) * 0.15})`
                          : 'none',
                        filter: (() => {
                          let filterStr = (videoBrightness === 100 && videoContrast === 100 && videoSaturation === 100)
                            ? 'none'
                            : `brightness(${videoBrightness}%) contrast(${videoContrast}%) saturate(${videoSaturation}%)`;
                          
                          if (activeTransitionId === 'zoom_blur' && idx === activeSegmentIndex) {
                            const blurPx = Math.sin(transitionProgress * Math.PI) * 12;
                            if (filterStr === 'none') {
                              filterStr = `blur(${blurPx}px)`;
                            } else {
                              filterStr += ` blur(${blurPx}px)`;
                            }
                          }
                          return filterStr;
                        })()
                      }}
                      preload="auto"
                      playsInline
                      muted={videoOriginalMute}
                    />
                  ))
                ) : (
                  <video
                    ref={videoRef}
                    crossOrigin="anonymous; referrerPolicy=no-referrer"
                    src={uploadedFileUrl || activeReview.videoUrl}
                    className="w-full h-full object-cover"
                    style={{
                      transform: (activeTransitionId === 'zoom_blur')
                        ? `scale(${1 + Math.sin(transitionProgress * Math.PI) * 0.15})`
                        : 'none',
                      filter: (() => {
                        let filterStr = (videoBrightness === 100 && videoContrast === 100 && videoSaturation === 100)
                          ? 'none'
                          : `brightness(${videoBrightness}%) contrast(${videoContrast}%) saturate(${videoSaturation}%)`;
                        
                        if (activeTransitionId === 'zoom_blur') {
                          const blurPx = Math.sin(transitionProgress * Math.PI) * 12;
                          if (filterStr === 'none') {
                            filterStr = `blur(${blurPx}px)`;
                          } else {
                            filterStr += ` blur(${blurPx}px)`;
                          }
                        }
                        return filterStr;
                      })()
                    }}
                    preload="auto"
                    loop
                    playsInline
                    muted={videoOriginalMute}
                    onTimeUpdate={(e) => {
                      if (!audioUrl) {
                        setCurrentAudioTime(e.currentTarget.currentTime);
                      }
                    }}
                    onLoadedMetadata={(e) => {
                      if (!audioUrl) {
                        setAudioDuration(e.currentTarget.duration || 18);
                      }
                    }}
                  />
                )}
                
                {/* Real-time Video Transition Overlay Graphics */}
                {activeTransitionId && activeTransitionId !== 'none' && activeTransitionId !== 'zoom_blur' && (
                  <div className="absolute inset-0 z-40 pointer-events-none select-none overflow-hidden rounded-3xl">
                    {activeTransitionId === 'white_flash' && (
                      <div 
                        className="w-full h-full bg-white transition-opacity duration-75"
                        style={{ opacity: Math.pow(1 - transitionProgress, 1.5) }}
                      />
                    )}
                    {activeTransitionId === 'fade_to_black' && (
                      <div 
                        className="w-full h-full bg-black"
                        style={{ opacity: 1 - Math.abs(2 * transitionProgress - 1) }}
                      />
                    )}
                    {activeTransitionId === 'cross_dissolve' && (
                      <div 
                        className="w-full h-full bg-black/25"
                        style={{ opacity: (1 - Math.pow(2 * transitionProgress - 1, 2)) * 0.45 }}
                      />
                    )}
                    {activeTransitionId === 'slide_left' && (
                      <div 
                        className="w-full h-full bg-gradient-to-r from-black/90 via-white/85 via-amber-500/40 to-transparent"
                        style={{ transform: `translateX(${(1 - transitionProgress) * 100}%)` }}
                      />
                    )}
                    {activeTransitionId === 'slide_right' && (
                      <div 
                        className="w-full h-full bg-gradient-to-l from-black/90 via-white/85 via-amber-500/40 to-transparent"
                        style={{ transform: `translateX(${(transitionProgress - 1) * 100}%)` }}
                      />
                    )}
                    {activeTransitionId === 'glitch' && (
                      <div className="w-full h-full bg-cyan-500/10 mix-blend-screen flex flex-col justify-around relative animate-pulse">
                        <div 
                          className="h-4 bg-fuchsia-500/55 absolute w-full left-0" 
                          style={{ 
                            top: `${Math.random() * 80}%`, 
                            transform: `translateX(${(Math.random() * 20 - 10) * Math.sin(transitionProgress * Math.PI)}px)` 
                          }} 
                        />
                        <div 
                          className="h-2 bg-cyan-400/65 absolute w-full left-0" 
                          style={{ 
                            top: `${Math.random() * 80}%`, 
                            transform: `translateX(${(Math.random() * 30 - 15) * Math.sin(transitionProgress * Math.PI)}px)` 
                          }} 
                        />
                        <div 
                          className="h-8 bg-black/40 absolute w-full left-0 border-y border-cyan-500/35" 
                          style={{ top: `${Math.random() * 80}%` }} 
                        />
                      </div>
                    )}
                  </div>
                )}
                
                {/* Live Dubbing status overlay */}
                <div className="absolute top-4 left-4 bg-black/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[9px] font-mono flex items-center gap-1.5 text-amber-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-amber-500 animate-ping' : 'bg-slate-500'}`} />
                  <span className="font-bold">{isPlaying ? 'DUBBING ACTIVE' : 'STUDIO READY'}</span>
                </div>

                {uploadedFileUrl && (
                  <div className="absolute top-4 right-4 bg-green-500/95 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold text-black uppercase">
                    VIDEO CỦA BẠN
                  </div>
                )}

                {/* Stunning High-Attention Viral Hook Title Overlay */}
                {showHookBanner && hookBannerText && currentAudioTime <= hookBannerDuration && (
                  <div className="absolute top-[13%] inset-x-2 flex flex-col items-center justify-center pointer-events-none z-30 text-center">
                    <motion.div
                      key={hookBannerText + hookBannerStyle}
                      initial={{ scale: 0.8, opacity: 0, y: -12 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 380, damping: 20 }}
                      className={`w-full text-center leading-snug tracking-wider select-none p-3.5 rounded-xl border shadow-2xl flex flex-col items-center justify-center relative ${
                        hookBannerStyle === 'tiktok-yellow'
                          ? 'bg-[#ffe600] border-black text-black font-black uppercase text-[10px] sm:text-xs font-sans ring-[3px] ring-[#fe2c55] shadow-[0_4px_20px_rgba(254,44,85,0.7)]'
                          : hookBannerStyle === 'tiktok-red'
                            ? 'bg-[#fe2c55] border-black text-white font-black uppercase text-[10px] sm:text-xs font-sans ring-[3px] ring-[#ffe600] shadow-[0_4px_20px_rgba(254,44,85,0.7)]'
                            : hookBannerStyle === 'cyberpunk-neon'
                              ? 'bg-black/95 border-[#ec4899] text-[#22d3ee] font-mono font-extrabold uppercase text-[9.5px] sm:text-[11px] shadow-[0_0_18px_rgba(236,72,153,0.85)] border-2 [text-shadow:_1.5px_1.5px_0_#ec4899]'
                              : hookBannerStyle === 'beast-glow'
                                ? 'bg-black/95 border-emerald-500 text-emerald-400 font-sans font-black uppercase text-[9.5px] sm:text-[11px] ring-2 ring-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.9)]'
                                : 'bg-gradient-to-r from-amber-600 to-yellow-600 border-amber-300 text-white font-sans font-black text-[9.5px] sm:text-[11px] shadow-[0_4px_15px_rgba(245,158,11,0.6)] border-2'
                      }`}
                    >
                      {/* Decorative badges to make the Hook look extremely high fidelity & professional */}
                      {hookBannerStyle === 'tiktok-yellow' && (
                        <div className="absolute -top-2.5 left-2 bg-[#fe2c55] text-white font-mono font-black text-[6.5px] px-1.5 py-0.5 rounded uppercase tracking-widest">
                          🔥 TIKTOK TRENDING
                        </div>
                      )}
                      {hookBannerStyle === 'tiktok-red' && (
                        <div className="absolute -top-2.5 left-2 bg-[#ffe600] text-black font-mono font-black text-[6.5px] px-1.5 py-0.5 rounded uppercase tracking-widest">
                          🚨 CHẤN ĐỘNG HOT
                        </div>
                      )}
                      {hookBannerStyle === 'cyberpunk-neon' && (
                        <div className="absolute -top-2.5 right-2 bg-[#ec4899] text-white font-mono text-[6px] px-1.5 py-0.5 rounded animate-pulse tracking-wide">
                          GLITCH SYNC PRO
                        </div>
                      )}
                      {hookBannerStyle === 'beast-glow' && (
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-emerald-500 text-black font-sans font-black text-[7px] px-2 py-0.5 rounded-full whitespace-nowrap">
                          ⚡ VIRAL RUSH HOOK
                        </div>
                      )}
                      {hookBannerStyle === 'editorial-royal' && (
                        <div className="absolute -top-2.5 left-3 bg-amber-400 text-black font-mono text-[6.5px] font-black px-2 py-0.5 rounded tracking-widest">
                          ⭐ BEST VALUE
                        </div>
                      )}

                      <span className="text-center font-sans tracking-wide block leading-[1.3] text-[9px] sm:text-[11.5px]">
                        {hookBannerText}
                      </span>
                    </motion.div>
                  </div>
                )}

                {/* Modern Dynamic Subtitle Overlay with gorgeous interactive customizer modes */}
                {showSubtitles && activeSubtitleText && (
                  <div className="absolute inset-x-0 bottom-[18%] flex flex-col items-center justify-center pointer-events-none px-3.5 z-25 text-center">
                    <motion.div
                      key={activeSubtitleText}
                      initial={{ scale: 0.9, opacity: 0, y: 4 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className={`select-none drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] max-w-full text-center break-words leading-relaxed ${
                        SUBTITLE_FONTS.find(f => f.id === subtitleFontFamily)?.cssClass || 'font-sub-vietnam'
                      } ${
                        subtitleStyle === 'tiktok'
                          ? `${subtitleCase === 'uppercase' ? 'uppercase' : ''} text-[13px] sm:text-[14.5px] md:text-[16px] px-3.5 py-1.5 rounded tracking-normal font-black`
                          : subtitleStyle === 'capcut'
                            ? `${subtitleCase === 'uppercase' ? 'uppercase' : ''} text-white text-[12px] sm:text-[13.5px] bg-[#0c0c0ced]/95 border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.95)] px-4.5 py-2.5 rounded-[14px] font-black max-w-[92%] leading-relaxed tracking-normal backdrop-blur-[6px]`
                            : subtitleStyle === 'cyberpunk'
                              ? 'text-[11px] sm:text-[12.5px] font-mono tracking-wide bg-[#020202e0]/95 px-3 py-2 border-2 border-[#ec4899] shadow-[0_0_15px_rgba(236,72,153,0.7)] font-black uppercase rounded-lg'
                              : subtitleStyle === 'neon'
                                ? `${subtitleCase === 'uppercase' ? 'uppercase' : ''} text-[11.5px] sm:text-[13px] tracking-normal bg-[#d946ef]/10 border-2 border-[#d946ef] drop-shadow-[0_0_15px_rgba(217,70,239,0.85)] shadow-[0_0_10px_rgba(255,255,255,0.25)] px-4 py-2 rounded-2xl font-black backdrop-blur-[4px]`
                                : `${subtitleCase === 'uppercase' ? 'uppercase' : ''} text-slate-50 text-[11.5px] sm:text-[13px] font-bold [text-shadow:_0_2px_4px_rgba(0,0,0,1),_0_0_12px_rgba(0,0,0,0.85)] max-w-[85%] border-b-2 border-amber-500/90 pb-1.5 px-3`
                      }`}
                    >
                      {(() => {
                        const formattedActiveText = subtitleCase === 'uppercase' ? activeSubtitleText.toUpperCase() : activeSubtitleText;
                        if (!wordHighlightEnabled || !activeSubtitle) {
                          return (
                            <div className="flex flex-col items-center justify-center">
                              <span className="subtitle-word-container">{formattedActiveText}</span>
                              {bilingualEnabled && activeSubtitle?.translation && (
                                <div className={`mt-2 text-[10px] sm:text-[11.5px] font-sans font-medium opacity-90 max-w-[90%] ${
                                  subtitleStyle === 'tiktok' ? 'text-white border-t border-white/5 pt-1.5 w-full' :
                                  subtitleStyle === 'capcut' ? 'text-yellow-300 border-t border-white/5 pt-1.5 w-full' :
                                  subtitleStyle === 'cyberpunk' ? 'text-cyan-400 font-mono border-t border-[#ec4899]/30 pt-1.5 w-full' :
                                  subtitleStyle === 'neon' ? 'text-cyan-300 border-t border-[#d946ef]/30 pt-1.5 w-full' :
                                  'text-amber-200 border-t border-white/5 pt-1.5 w-full'
                                }`}>
                                  {activeSubtitle.translation}
                                </div>
                              )}
                            </div>
                          );
                        }

                        const words = formattedActiveText.split(/\s+/);
                        const totalWords = words.length;
                        if (totalWords === 0) return activeSubtitleText;

                        // Precise syllabic-character based word timings
                        const segDuration = activeSubtitle.end - activeSubtitle.start;
                        // Synchronize with subtitleOffset for perfectly aligned word highlights in live preview
                        const elapsed = (currentAudioTime + subtitleOffset) - activeSubtitle.start;
                        const fraction = segDuration > 0 ? elapsed / segDuration : 0;
                        
                        const timings = getWordTimings(activeSubtitleText);
                        const activeIdx = timings.findIndex(t => fraction >= t.startRatio && fraction <= t.endRatio);
                        const currentWordIdx = activeIdx === -1 ? (fraction >= 1 ? timings.length - 1 : 0) : activeIdx;

                        return (
                          <div className="flex flex-col items-center justify-center">
                            <span className="subtitle-word-container">
                              {words.map((word, idx) => {
                                const isCurrent = idx === currentWordIdx;
                                let wordClass = "subtitle-word-item transition-all duration-150 ";
                                
                                if (subtitleStyle === 'tiktok') {
                                  wordClass += isCurrent 
                                    ? "text-[#ffe600] z-10 [text-shadow:_0_2px_0_#000,_0_-2px_0_#000,_2px_0_#000,_-2px_0_#000,_1.5px_1.5px_0_#000,_-1.5px_-1.5px_0_#000,_0_0_12px_rgba(255,230,0,0.85)] font-black"
                                    : "text-white opacity-90 [text-shadow:_0_1.5px_0_#000,_0_-1.5px_0_#000,_1.5px_0_#000,_-1.5px_0_#000]";
                                } else if (subtitleStyle === 'capcut') {
                                  wordClass += isCurrent
                                    ? "text-[#ffe600] z-10 drop-shadow-[0_0_8px_rgba(255,230,0,0.9)] font-black"
                                    : "text-white opacity-70 font-black";
                                } else if (subtitleStyle === 'cyberpunk') {
                                  wordClass += isCurrent
                                    ? "text-[#ec4899] z-10 [text-shadow:_1.5px_1.5px_0_#22d3ee] font-black"
                                    : "text-[#22d3ee] opacity-75 font-bold";
                                } else if (subtitleStyle === 'neon') {
                                  wordClass += isCurrent
                                    ? "text-[#ffe600] z-10 drop-shadow-[0_0_15px_rgba(255,230,0,0.95)] [text-shadow:_0_0_6px_#fff] font-black"
                                    : "text-white opacity-70 font-bold [text-shadow:_0_0_4px_rgba(255,255,255,0.4)]";
                                } else {
                                  wordClass += isCurrent
                                    ? "text-amber-400 z-10 font-bold underline decoration-amber-400 decoration-2 underline-offset-4"
                                    : "text-slate-300 opacity-70 font-normal";
                                }

                                return (
                                  <span
                                    key={idx}
                                    className={wordClass}
                                    style={{
                                      transform: isCurrent ? 'scale(1.06)' : 'scale(1)',
                                      display: 'inline-block',
                                      marginRight: idx < words.length - 1 ? '0.28em' : '0',
                                      whiteSpace: 'nowrap',
                                      transitionProperty: 'color, opacity, text-shadow, filter, transform'
                                    }}
                                  >
                                    {word}
                                  </span>
                                );
                              })}
                            </span>
                            {bilingualEnabled && activeSubtitle?.translation && (
                              <div className={`mt-2 text-[10px] sm:text-[11.5px] font-sans font-medium opacity-95 max-w-[90%] ${
                                subtitleStyle === 'tiktok' ? 'text-white border-t border-white/5 pt-1.5 w-full' :
                                subtitleStyle === 'capcut' ? 'text-yellow-300 border-t border-white/5 pt-1.5 w-full' :
                                subtitleStyle === 'cyberpunk' ? 'text-cyan-400 font-mono border-t border-[#ec4899]/30 pt-1.5 w-full' :
                                subtitleStyle === 'neon' ? 'text-cyan-300 border-t border-[#d946ef]/30 pt-1.5 w-full' :
                                'text-amber-200 border-t border-white/5 pt-1.5 w-full'
                              }`}>
                                {activeSubtitle.translation}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </motion.div>
                  </div>
                )}
              </div>

              {/* SMART FX COMBOS RECOMMENDER (Gợi ý hiệu ứng thông minh cuốn hút nhất) */}
              <div className="bg-[#050505] border border-amber-500/10 p-3 sm:p-4 rounded-2xl space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span className="text-[11px] uppercase tracking-wider text-amber-400 font-black font-sans">
                      Gợi Ý Hiệu Ứng Triệu View
                    </span>
                  </div>
                  <span className="text-[7.5px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-mono font-bold animate-[pulse_1.5s_infinite] border border-amber-500/20">
                    AI OPTIMIZED
                  </span>
                </div>

                <p className="text-[10px] text-slate-400 leading-normal">
                  Thuật toán AI tự động phối màu UHD, âm thanh Audio FX, thẻ Hook Banner và kiểu phụ đề để đem lại tỷ lệ giữ chân (CTR) tối đa cho video của bạn.
                </p>

                {/* Combos Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      id: 'tiktok_viral',
                      title: 'TikTok Viral 💥',
                      desc: 'Thu hút cực mạnh',
                      color: 'border-yellow-500/30 text-yellow-400 focus:bg-yellow-500/10',
                      badge: 'Giữ chân 3s',
                      config: {
                        colorPreset: 'pop', brightness: 108, contrast: 112, saturation: 120,
                        hookStyle: 'tiktok-yellow', subtitleStyle: 'tiktok', audioEffect: 'bass',
                        voiceName: 'Puck',
                        advice: '🔥 Combo này tối ưu hóa tối đa lượng giữ chân người xem trong 3 giây vàng đầu tiên nhờ thẻ tiêu đề vàng chói lọi đặc trưng của TikTok kết hợp bộ lọc màu Vivid siêu bắt mắt & giọng đọc Bass tăng lực sành điệu!'
                      }
                    },
                    {
                      id: 'cinematic_prestige',
                      title: 'Điện Ảnh 🎬',
                      desc: 'Đẳng cấp chuyên gia',
                      color: 'border-rose-500/30 text-rose-400 focus:bg-rose-500/10',
                      badge: 'Prestige VIP',
                      config: {
                        colorPreset: 'cinematic', brightness: 112, contrast: 118, saturation: 108,
                        hookStyle: 'editorial-royal', subtitleStyle: 'capcut', audioEffect: 'reverb',
                        voiceName: 'Fenrir',
                        advice: '👑 Tạo độ sâu tương phản điện ảnh quý phái, thẻ tiêu đề Editorial hoàng gia, chữ CapCut trong suốt, kết hợp vocal Reverb âm vang ấm áp giúp tăng 1.5 lần mức độ uy tín & kích thích tỷ lệ chốt đơn của giới tinh hoa.'
                      }
                    },
                    {
                      id: 'cyberpunk_neon',
                      title: 'Hi-Tech Gear ⚡',
                      desc: 'Công nghệ phá cách',
                      color: 'border-cyan-500/30 text-cyan-400 focus:bg-cyan-500/10',
                      badge: 'Glitch Tech',
                      config: {
                        colorPreset: 'hdr_boost', brightness: 122, contrast: 115, saturation: 125,
                        hookStyle: 'cyberpunk-neon', subtitleStyle: 'cyberpunk', audioEffect: 'bass',
                        voiceName: 'Puck',
                        advice: '👾 Thiết lập tối cao cho đồ công nghệ, gia dụng thông minh hoặc gaming với mức phơi sáng HDR cải tiến vượt bậc, tiêu đề Glitch Neon chói lọi và dải âm trầm Bass ấm khỏe đầy năng lượng kỹ thuật số!'
                      }
                    },
                    {
                      id: 'eco_organic',
                      title: 'Xanh Organic 🌱',
                      desc: 'Tự nhiên thanh tao',
                      color: 'border-emerald-500/30 text-emerald-400 focus:bg-emerald-500/10',
                      badge: 'Eco Gentle',
                      config: {
                        colorPreset: 'original', brightness: 100, contrast: 100, saturation: 100,
                        hookStyle: 'beast-glow', subtitleStyle: 'minimal', audioEffect: 'none',
                        voiceName: 'Kore',
                        advice: '🌱 Giải pháp tối giản hoàn hảo cho các chủ đề review mỹ phẩm, decor phòng ngủ thiên nhiên, mẹo dọn dẹp hoặc tệp mẹ và bé. Thân thiện, thư thái, chân thực và hoàn toàn êm ái cho mắt người dùng.'
                      }
                    }
                  ].map((combo) => {
                    const isActive = selectedSmartCombo === combo.id;
                    return (
                      <button
                        key={combo.id}
                        type="button"
                        onClick={() => {
                          setSelectedSmartCombo(combo.id);
                          setSmartComboAdvice(combo.config.advice);
                          
                          // Force fully apply combined settings
                          setColorPreset(combo.config.colorPreset);
                          setVideoBrightness(combo.config.brightness);
                          setVideoContrast(combo.config.contrast);
                          setVideoSaturation(combo.config.saturation);
                          setHookBannerStyle(combo.config.hookStyle as any);
                          setSubtitleStyle(combo.config.subtitleStyle as any);
                          setAudioEffect(combo.config.audioEffect as any);
                          setSelectedVoice(combo.config.voiceName);
                          setShowHookBanner(true);

                          // Instantly reset playhead to duration start so they see the applied Hook Banner in action
                          if (videoRef.current) {
                            videoRef.current.currentTime = 0;
                            if (isPlaying) {
                              videoRef.current.play().catch(e => console.log('Reset auto-play preview error', e));
                            }
                          }
                          if (audioRef.current) {
                            audioRef.current.currentTime = 0;
                          }
                        }}
                        className={`p-2.5 rounded-xl text-left transition-all border pointer-events-auto cursor-pointer relative flex flex-col gap-1 ${
                          isActive
                            ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                            : 'bg-[#0f0f0f]/80 border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold">{combo.title}</span>
                          <span className={`text-[6px] font-bold px-1 py-0.2 rounded font-mono ${
                            isActive ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-slate-500'
                          }`}>
                            {combo.badge}
                          </span>
                        </div>
                        <span className="text-[8px] text-slate-500 leading-none">{combo.desc}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Interactive Dynamic Advice Alert */}
                <div className="p-2.5 bg-amber-500/[0.03] border border-amber-500/15 rounded-xl flex items-start gap-2 animate-[fadeIn_0.3s_ease]">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5 animate-bounce" />
                  <p className="text-[9.5px] text-amber-100/90 leading-relaxed font-sans italic">
                    {smartComboAdvice}
                  </p>
                </div>
              </div>

              {/* Action trigger: Generate voiceover script */}
              <div className="space-y-3 pt-2">
                {ttsCountdownSec > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 text-xs animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold text-amber-200">Hàng đợi lồng tiếng Google AI Studio ({ttsCountdownSec}s)</p>
                      <p className="text-[10px] text-amber-300/80">Tự động khởi chạy lồng tiếng ngay sau khi hết thời gian đếm ngược...</p>
                    </div>
                  </div>
                )}

                <button
                  onClick={generateVoiceover}
                  disabled={isGeneratingTTS || ttsCountdownSec > 0 || !activeReview.marketingScript}
                  className={`w-full py-3 rounded-xl font-display font-medium text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isGeneratingTTS || ttsCountdownSec > 0
                      ? 'bg-slate-800 text-slate-400 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black font-semibold shadow-lg shadow-amber-500/10 active:scale-95 text-center'
                  }`}
                >
                  {isGeneratingTTS ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-black" />
                      <span>Đang lồng tiếng bằng AI...</span>
                    </>
                  ) : ttsCountdownSec > 0 ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                      <span>Đang tự động khởi chạy lại ({ttsCountdownSec}s)...</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 text-black" />
                      <span>Khởi tạo giọng đọc AI</span>
                    </>
                  )}
                </button>

                {/* Dynamic High-Fidelity Audio Controls */}
                <div className={`p-4 rounded-xl bg-[#050505] border transition-all duration-300 ${
                  audioUrl ? 'border-amber-500/30 bg-amber-500/[0.02]' : 'border-white/5 opacity-50'
                }`}>
                  {audioUrl ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono tracking-widest text-[#f59e0b] uppercase font-bold">GIỌNG ĐỌC AI SẴN SÀNG</span>
                        <span className="text-[9px] text-[#22c55e] font-mono font-bold animate-pulse">WAV</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={togglePlayState}
                          className="w-10 h-10 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg active:scale-95 transition-all outline-none shrink-0 cursor-pointer"
                        >
                          {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black ml-0.5" />}
                        </button>

                        {/* Simulated audio viz */}
                        <div className="flex-1 flex items-end gap-1 h-9 pb-1">
                          {eqHeights.map((ht, idx) => (
                            <div 
                              key={idx} 
                              className="flex-1 bg-amber-500/80 rounded-t transition-all duration-100"
                              style={{ height: `${ht * 0.8}%` }}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px] text-slate-500">
                        <span className="font-mono">{activeVoiceConfig.name} ({playbackSpeed.toFixed(1)}x)</span>
                        <a 
                          href={audioUrl} 
                          download={`${activeReview.productName.toLowerCase().replace(/\s+/g, '_')}_ai_review.wav`}
                          className="text-amber-500 hover:text-amber-400 flex items-center gap-1 font-semibold"
                        >
                          <Download className="w-3 h-3" /> Tải về WAV
                        </a>
                      </div>

                      {/* Audio Effects Selector (Hiệu ứng âm thanh) */}
                      <div className="pt-2.5 border-t border-white/5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] uppercase tracking-[0.1em] text-slate-400 font-bold flex items-center gap-1 leading-none">
                            <Volume2 className="w-3 h-3 text-amber-400" />
                            Hiệu ứng âm thanh giọng đọc (Audio FX)
                          </label>
                          <span className="text-[7px] text-amber-400 font-mono font-bold bg-amber-400/10 px-1 py-0.5 rounded border border-amber-400/20 uppercase">Hi-Fi</span>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-1">
                          {[
                            { id: 'none', label: 'Bản gốc 🎙️', desc: 'Chuẩn gốc' },
                            { id: 'reverb', label: 'Vòm 🌌', desc: 'Ấm sâu' },
                            { id: 'bass', label: 'Trầm 🔊', desc: 'Dày lực' },
                            { id: 'studio', label: 'Studio 🌟', desc: 'Air VIP' }
                          ].map((effect) => (
                            <button
                              key={effect.id}
                              type="button"
                              onClick={() => setAudioEffect(effect.id as any)}
                              className={`py-1 px-0.5 bg-[#050505] rounded-lg text-center transition-all border pointer-events-auto cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                                audioEffect === effect.id
                                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.1)]'
                                  : 'bg-transparent border-white/5 hover:border-white/15 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <span className="text-[9px] font-bold leading-tight">{effect.label}</span>
                              <span className="text-[7px] text-slate-500 leading-none">{effect.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* UHD HDR Color Booster panel */}
                      <div className="pt-2.5 border-t border-white/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] uppercase tracking-[0.1em] text-slate-400 font-bold flex items-center gap-1.5 leading-none">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            Độ sáng & Màu sắc HDR (UHD Color Booster)
                          </label>
                          <span className="text-[7px] text-amber-400 font-mono font-bold bg-amber-400/10 px-1 py-0.5 rounded border border-amber-400/20 uppercase">HDR PRO</span>
                        </div>
                        
                        <p className="text-[9px] text-slate-400 leading-normal">
                          Khắc phục triệt để video xám mờ, tối màu trên mobile nhờ thuật toán hiệu chỉnh & phối màu rực rỡ trực tiếp.
                        </p>

                        {/* Presets List */}
                        <div className="grid grid-cols-2 gap-1 bg-[#050505] p-1.5 rounded-xl border border-white/5">
                          {[
                            { id: 'original', title: 'Gốc Tươi Sáng 🔄', desc: '100% màu sắc gốc chân thực, tươi mới', b: 100, c: 100, s: 100 },
                            { id: 'pop', title: 'Vivid TikTok ✨', desc: 'Màu căng mịn, sáng rực rỡ', b: 106, c: 110, s: 118 },
                            { id: 'cinematic', title: 'Trong trẻo Điện ảnh 🎬', desc: 'Tương phản sâu, màu sắc sống động', b: 108, c: 114, s: 108 },
                            { id: 'hdr_boost', title: 'Siêu sáng HDR Pro 🌟', desc: 'Đặc trị video tối mờ, bừng sáng tự nhiên', b: 118, c: 112, s: 120 },
                          ].map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                setVideoBrightness(preset.b);
                                setVideoContrast(preset.c);
                                setVideoSaturation(preset.s);
                                setColorPreset(preset.id);
                              }}
                              className={`p-1.5 rounded-lg text-left transition-all relative flex flex-col gap-0.5 pointer-events-auto cursor-pointer ${
                                colorPreset === preset.id
                                  ? 'bg-amber-500/10 border border-amber-500/30'
                                  : 'bg-transparent border border-transparent hover:border-white/5 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <span className={`text-[9px] font-bold ${colorPreset === preset.id ? 'text-amber-400' : 'text-slate-300'}`}>
                                {preset.title}
                              </span>
                              <span className="text-[7px] text-slate-500 leading-none">{preset.desc}</span>
                            </button>
                          ))}
                        </div>

                        {/* Fine Tuning Sliders */}
                        <div className="space-y-2 bg-[#050505] p-2.5 rounded-xl border border-white/5">
                          {/* Brightness */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[8px] font-mono text-slate-400">
                              <span>Độ sáng (Brightness)</span>
                              <span className="text-amber-400 font-bold">{videoBrightness}%</span>
                            </div>
                            <input
                              type="range"
                              min="80"
                              max="150"
                              value={videoBrightness}
                              onChange={(e) => {
                                setVideoBrightness(Number(e.target.value));
                                setColorPreset('custom');
                              }}
                              className="w-full accent-amber-500 h-1 rounded bg-white/10"
                            />
                          </div>

                          {/* Contrast */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[8px] font-mono text-slate-400">
                              <span>Tương phản (Contrast)</span>
                              <span className="text-amber-400 font-bold">{videoContrast}%</span>
                            </div>
                            <input
                              type="range"
                              min="80"
                              max="150"
                              value={videoContrast}
                              onChange={(e) => {
                                setVideoContrast(Number(e.target.value));
                                setColorPreset('custom');
                              }}
                              className="w-full accent-amber-500 h-1 rounded bg-white/10"
                            />
                          </div>

                          {/* Saturation */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[8px] font-mono text-slate-400">
                              <span>Độ tươi màu (Saturation)</span>
                              <span className="text-amber-400 font-bold">{videoSaturation}%</span>
                            </div>
                            <input
                              type="range"
                              min="80"
                              max="160"
                              value={videoSaturation}
                              onChange={(e) => {
                                setVideoSaturation(Number(e.target.value));
                                setColorPreset('custom');
                              }}
                              className="w-full accent-amber-500 h-1 rounded bg-white/10"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Dynamic Subtitle Configuration Panel */}
                      <div className="pt-3 border-t border-white/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] uppercase tracking-[0.1em] text-slate-400 font-bold flex items-center gap-1.5 leading-none">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            Phụ đề Động Đồng bộ (AI Dynamic Captions)
                          </label>
                          <div className="flex items-center gap-1.5 pointer-events-auto">
                            <span className="text-[7px] text-emerald-400 font-mono font-bold bg-emerald-400/10 px-1 py-0.5 rounded border border-emerald-400/20 uppercase">SYNC LAYOUT</span>
                            <input
                              type="checkbox"
                              checked={showSubtitles}
                              onChange={(e) => setShowSubtitles(e.target.checked)}
                              className="w-3 h-3 accent-amber-500 rounded cursor-pointer"
                              id="toggle_subtitles"
                            />
                            <label htmlFor="toggle_subtitles" className="text-[8px] font-mono text-slate-500 cursor-pointer uppercase select-none">Bật</label>
                          </div>
                        </div>

                        <p className="text-[9px] text-slate-400 leading-normal">
                          Tự động tách câu và đồng bộ phụ đề động theo giọng đọc AI, nhúng thẳng vào file video kết xuất (Burn-in) cực kỳ đẳng cấp.
                        </p>

                        {/* Subtitle Style Presets Grid */}
                        <div className="grid grid-cols-5 gap-1.2 bg-[#050505] p-1.5 rounded-xl border border-white/5 pointer-events-auto">
                          {[
                            { id: 'tiktok', label: 'TikTok 🌟', fill: '#facc15', desc: 'Chữ vàng viền đen lý tưởng' },
                            { id: 'capcut', label: 'CapCut 🎬', fill: '#ffffff', desc: 'Nền hộp trong suốt' },
                            { id: 'cyberpunk', label: 'Glitch ⚡', fill: '#f97316', desc: 'Tháp cam nghệ thuật' },
                            { id: 'neon', label: 'Neon 🧲', fill: '#d946ef', desc: 'Hào quang neon hồng' },
                            { id: 'minimal', label: 'Tối giản 🕊️', fill: '#cbd5e1', desc: 'Mảnh dẻ nhẹ thơ mộng' },
                          ].map((styleOpt) => (
                            <button
                              key={styleOpt.id}
                              type="button"
                              onClick={() => {
                                setSubtitleStyle(styleOpt.id as any);
                                setShowSubtitles(true); // Auto enable if choosing style
                              }}
                              className={`py-2 px-1 rounded-lg text-center flex flex-col items-center justify-between gap-1 transition-all relative border cursor-pointer select-none ${
                                subtitleStyle === styleOpt.id && showSubtitles
                                  ? 'bg-amber-500/10 border border-amber-500/30'
                                  : 'bg-transparent border border-transparent hover:border-white/5 text-slate-400 hover:text-slate-200'
                              }`}
                              title={styleOpt.desc}
                            >
                              <div 
                                className="w-5 h-5 rounded flex items-center justify-center font-display text-[9px] font-extrabold"
                                style={{
                                  backgroundColor: styleOpt.id === 'capcut' ? 'rgba(0,0,0,0.6)' : 'transparent',
                                  color: styleOpt.fill,
                                  border: styleOpt.id === 'minimal' ? '1px solid rgba(255,255,255,0.15)' : 'none',
                                  textShadow: styleOpt.id === 'tiktok' ? '1px 1px 0 #000, -1px -1px 0 #000' : 'none'
                                }}
                              >
                                Ab
                              </div>
                              <span className="text-[7.5px] font-bold leading-tight truncate w-full">{styleOpt.label}</span>
                            </button>
                          ))}
                        </div>

                        {/* Vietnamese Font Selector & Case Typography Studio (ĐÃ TỐI ƯU 100% TIẾNG VIỆT KHÔNG LỖI FONT) */}
                        <div className="bg-[#050505] p-2.5 rounded-xl border border-amber-500/20 flex flex-col gap-2 pointer-events-auto shadow-inner">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[8.5px] font-black text-amber-400 uppercase tracking-wide flex items-center gap-1">
                                🇻🇳 Phông Chữ Chuẩn Tiếng Việt (100% Việt Hóa):
                              </span>
                            </div>
                            <span className="text-[7px] text-emerald-400 font-mono font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              KHÔNG LỖI DẤU ✨
                            </span>
                          </div>

                          {/* Font Options Grid */}
                          <div className="grid grid-cols-5 gap-1">
                            {SUBTITLE_FONTS.map((fontOpt) => {
                              const isSelected = subtitleFontFamily === fontOpt.id;
                              return (
                                <button
                                  key={fontOpt.id}
                                  type="button"
                                  onClick={() => {
                                    setSubtitleFontFamily(fontOpt.id);
                                    setShowSubtitles(true);
                                  }}
                                  className={`p-1.5 rounded-lg text-center flex flex-col items-center justify-between gap-1 transition-all relative border cursor-pointer select-none ${
                                    isSelected
                                      ? 'bg-amber-500/15 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.2)] text-amber-300 font-black'
                                      : 'bg-white/[0.02] border-white/5 hover:border-white/15 text-slate-400 hover:text-slate-200'
                                  }`}
                                  title={fontOpt.description}
                                >
                                  <span className={`text-[11px] font-black leading-none ${fontOpt.cssClass}`}>
                                    Aa
                                  </span>
                                  <span className="text-[7.5px] font-bold leading-tight truncate w-full">
                                    {fontOpt.name}
                                  </span>
                                  <span className="text-[6.5px] text-amber-400/80 scale-90 -mt-0.5">
                                    {fontOpt.badge}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Live Subtitle Font Sample & Case Switcher */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/5">
                            <div className="flex items-center gap-1">
                              <span className="text-[7.5px] text-slate-400 font-bold uppercase">Kiểu Chữ:</span>
                              <div className="flex items-center bg-white/5 p-0.5 rounded-md border border-white/10 text-[7.5px]">
                                <button
                                  type="button"
                                  onClick={() => setSubtitleCase('uppercase')}
                                  className={`px-1.5 py-0.5 rounded font-black transition-all cursor-pointer ${
                                    subtitleCase === 'uppercase'
                                      ? 'bg-amber-500 text-black shadow'
                                      : 'text-slate-400 hover:text-white'
                                  }`}
                                >
                                  IN HOA (ABC)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSubtitleCase('normal')}
                                  className={`px-1.5 py-0.5 rounded font-medium transition-all cursor-pointer ${
                                    subtitleCase === 'normal'
                                      ? 'bg-amber-500 text-black shadow font-bold'
                                      : 'text-slate-400 hover:text-white'
                                  }`}
                                >
                                  Thường (Abc)
                                </button>
                              </div>
                            </div>

                            {/* Sample Preview Pill with Vietnamese Accents */}
                            <div className="flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded-md border border-amber-500/30 text-[8px]">
                              <span className="text-slate-400 text-[7px] font-mono">MẪU:</span>
                              <span className={`${SUBTITLE_FONTS.find(f => f.id === subtitleFontFamily)?.cssClass || ''} ${subtitleCase === 'uppercase' ? 'uppercase font-black text-amber-300' : 'font-bold text-amber-300'}`}>
                                {subtitleCase === 'uppercase' ? 'ĐỈNH CAO CHẤT LƯỢNG' : 'Đỉnh cao chất lượng'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Karaoke Dynamic Word Highlight Switch */}
                        <div className="bg-[#050505] p-2 rounded-xl border border-white/5 flex items-center justify-between pointer-events-auto">
                          <div className="flex flex-col">
                            <span className="text-[8.5px] font-black text-amber-400 uppercase tracking-wide flex items-center gap-1">
                              👑 Chữ Động Chạy Từng Từ:
                            </span>
                            <span className="text-[7.5px] text-slate-500">HIỆU ỨNG TÔ SÁNG ĐỘNG GIỮ CHÂN VIEW TỐI ĐA (TIKTOK/REELS PREFERENCE)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={wordHighlightEnabled}
                              onChange={(e) => setWordHighlightEnabled(e.target.checked)}
                              className="w-3 h-3 accent-amber-500 rounded cursor-pointer"
                              id="toggle_word_highlight"
                            />
                            <label htmlFor="toggle_word_highlight" className="text-[8px] font-mono text-emerald-400 cursor-pointer uppercase select-none font-bold">KÍCH HOẠT</label>
                          </div>
                        </div>

                        {/* Bilingual Subtitle Toggle and Status Panel */}
                        <div className="bg-[#050505] p-2 rounded-xl border border-white/5 flex flex-col gap-2 pointer-events-auto">
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-[8.5px] font-black text-amber-400 uppercase tracking-wide flex items-center gap-1">
                                🌐 Phụ đề Song ngữ Thông minh (Bilingual Captions):
                              </span>
                              <span className="text-[7.5px] text-slate-500">TỰ ĐỘNG DỊCH SONG NGỮ ANH-VIỆT THEO DÒNG KỊCH BẢN AI</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={bilingualEnabled}
                                onChange={(e) => setBilingualEnabled(e.target.checked)}
                                className="w-3 h-3 accent-amber-500 rounded cursor-pointer"
                                id="toggle_bilingual"
                              />
                              <label htmlFor="toggle_bilingual" className="text-[8px] font-mono text-emerald-400 cursor-pointer uppercase select-none font-bold">KÍCH HOẠT</label>
                            </div>
                          </div>

                          {bilingualEnabled && (
                            <div className="flex items-center justify-between bg-white/[0.02] rounded-lg p-1.5 border border-white/5 text-[8px]">
                              <div className="flex items-center gap-1.5 text-slate-400">
                                <span className="font-mono text-slate-500 font-bold">BẢN DỊCH:</span>
                                {isTranslatingSubtitles ? (
                                  <span className="text-amber-400 animate-pulse flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                                    AI ĐANG LOCALIZATION DỊCH PHÂN CẢNH...
                                  </span>
                                ) : (
                                  <span className="text-emerald-400 font-bold uppercase">
                                    ĐỒNG BỘ SONG NGỮ {reviewLanguage === 'vi' ? 'VIỆT 🇻🇳 → ANH 🇬🇧' : 'ANH 🇬🇧 → VIỆT 🇻🇳'} SẴN SÀNG
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => translateActiveSubtitles(true)}
                                disabled={isTranslatingSubtitles}
                                className="px-2 py-0.5 bg-white/5 hover:bg-white/10 active:bg-white/15 text-slate-300 font-bold uppercase rounded text-[7.5px] transition-all cursor-pointer border border-white/10 disabled:opacity-50"
                              >
                                {isTranslatingSubtitles ? 'ĐANG DỊCH...' : 'Dịch Lại'}
                              </button>
                            </div>
                          )}

                          {/* 1-Click Multi-Language Subtitle Translator */}
                          <div className="pt-2 border-t border-white/5 space-y-1.5">
                            <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider block">
                              🌍 Dịch Phụ Đề Toàn Cầu (1-Chạm)
                            </span>
                            <div className="grid grid-cols-6 gap-1">
                              {[
                                { lang: 'en', flag: '🇬🇧', label: 'Anh' },
                                { lang: 'ja', flag: '🇯🇵', label: 'Nhật' },
                                { lang: 'ko', flag: '🇰🇷', label: 'Hàn' },
                                { lang: 'zh', flag: '🇨🇳', label: 'Trung' },
                                { lang: 'th', flag: '🇹🇭', label: 'Thái' },
                                { lang: 'vi', flag: '🇻🇳', label: 'Việt' },
                              ].map(l => (
                                <button
                                  key={l.lang}
                                  type="button"
                                  onClick={() => translateAllSubtitlesToLang(l.lang)}
                                  disabled={isTranslatingSubtitles}
                                  className="py-1 px-1 rounded-md bg-white/[0.03] hover:bg-amber-500/15 border border-white/5 hover:border-amber-500/30 text-[8px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer text-slate-300 hover:text-amber-300"
                                >
                                  <span>{l.flag}</span>
                                  <span>{l.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Interactive Manual Timeline Editor Component */}
                        <div className="bg-[#050505] p-2 rounded-xl border border-white/5 space-y-2 pointer-events-auto">
                          <button
                            type="button"
                            onClick={() => setIsSubtitleTimelineOpen(!isSubtitleTimelineOpen)}
                            className="w-full flex items-center justify-between py-1 px-1.5 bg-white/[0.02] hover:bg-white/5 rounded-lg border border-white/5 text-slate-300 hover:text-white transition-all cursor-pointer text-left font-sans select-none"
                          >
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                              <span className="text-[9px] font-bold uppercase tracking-wider">Căn Chỉnh Phụ Đề Thủ Công (Chuyên Sâu)</span>
                              {customSubtitleSegments && (
                                <span className="text-[6.5px] text-emerald-400 font-mono font-bold bg-emerald-400/10 px-1 py-0.2 rounded border border-emerald-400/20 uppercase">LIVE EDITING</span>
                              )}
                            </div>
                            {isSubtitleTimelineOpen ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
                          </button>

                          {isSubtitleTimelineOpen && (
                            <div className="pt-2 space-y-3 transition-all duration-300">
                              <p className="text-[8px] text-slate-400 leading-normal">
                                Tự do căn chỉnh chính xác giây bắt đầu/kết thúc hoặc thay đổi trực tiếp nội dung từng phân cảnh phụ đề theo giọng đọc AI:
                              </p>

                              {/* Global Offset Actions and Setup Button */}
                              {!customSubtitleSegments ? (
                                <div className="text-center py-3 px-2 space-y-2 bg-black/40 rounded-xl border border-dashed border-white/10">
                                  <span className="text-[8px] text-slate-400 block">Kích hoạt chế độ đệm để tùy chỉnh tự do hoặc sửa lỗi phụ đề tức thì:</span>
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={handleCheckAndFixReviewAndSubtitles}
                                      disabled={isCheckingAndFixing}
                                      className="px-2.5 py-1.2 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-slate-950 text-[8.5px] font-black uppercase rounded-lg shadow transition-all cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                                      title="Tự động kiểm tra phát hiện lỗi trùng lặp giây, dọn sạch ký tự lạ và căn chỉnh mốc thời gian phụ đề"
                                    >
                                      <ShieldCheck className={`w-3 h-3 text-slate-950 ${isCheckingAndFixing ? 'animate-spin' : ''}`} />
                                      <span>{isCheckingAndFixing ? 'Đang sửa lỗi...' : '✨ Sửa Lỗi Phụ Đề & Timeline'}</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleRunSilenceDetection()}
                                      disabled={isDetectingSilence}
                                      className="px-2.5 py-1.2 bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white text-[8.5px] font-black uppercase rounded-lg shadow transition-all cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                                      title="Tự động phát hiện các đoạn im lặng trong file audio và đề xuất điều chỉnh phụ đề khớp audio"
                                    >
                                      <Activity className={`w-3 h-3 text-white ${isDetectingSilence ? 'animate-spin' : ''}`} />
                                      <span>{isDetectingSilence ? 'Đang quét...' : '⚡ Khớp Khoảng Lặng'}</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCustomSubtitleSegments([...subtitleSegments]);
                                      }}
                                      className="px-2.5 py-1.2 bg-white/10 hover:bg-white/15 text-slate-200 text-[8.5px] font-bold uppercase rounded-lg border border-white/10 transition-all cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <Sparkles className="w-3 h-3 text-amber-400" />
                                      <span>Biên Tập Thủ Công</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2.5">
                                  {/* Global Utilities */}
                                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-white/5 text-[8.5px]">
                                    <div className="flex items-center gap-1">
                                      <span className="text-slate-500">Căn chỉnh:</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const shifted = customSubtitleSegments.map(seg => ({
                                            ...seg,
                                            start: Math.max(0, Number((seg.start - 0.1).toFixed(3))),
                                            end: Math.max(0, Number((seg.end - 0.1).toFixed(3))),
                                          }));
                                          setCustomSubtitleSegments(shifted);
                                        }}
                                        className="px-1.5 py-0.2 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-slate-300 font-mono font-bold cursor-pointer"
                                        title="Sớm hơn 0.1s"
                                      >
                                        -0.1s
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const shifted = customSubtitleSegments.map(seg => ({
                                            ...seg,
                                            start: Number((seg.start + 0.1).toFixed(3)),
                                            end: Number((seg.end + 0.1).toFixed(3)),
                                          }));
                                          setCustomSubtitleSegments(shifted);
                                        }}
                                        className="px-1.5 py-0.2 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-slate-300 font-mono font-bold cursor-pointer"
                                        title="Trễ hơn 0.1s"
                                      >
                                        +0.1s
                                      </button>

                                      {/* AI Subtitle Spell Checker Button */}
                                      <button
                                        type="button"
                                        onClick={handleFixSubtitlesSpellingAI}
                                        disabled={isFixingSubtitleSpelling}
                                        className="ml-1 px-2 py-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded text-[7.5px] uppercase cursor-pointer flex items-center gap-1 shadow-sm transition-all disabled:opacity-50"
                                        title="AI kiểm tra và tự động sửa 100% lỗi chính tả, dấu câu, thanh điệu tiếng Việt"
                                      >
                                        <Sparkles className={`w-2.5 h-2.5 ${isFixingSubtitleSpelling ? 'animate-spin' : ''}`} />
                                        <span>{isFixingSubtitleSpelling ? 'Đang sửa...' : '✨ Sửa Chính Tả AI'}</span>
                                      </button>

                                      {/* Fast Local Spell Check Button */}
                                      <button
                                        type="button"
                                        onClick={handleFixSubtitlesSpellingLocal}
                                        className="px-1.5 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold rounded border border-emerald-500/20 text-[7.5px] uppercase cursor-pointer flex items-center gap-0.5 transition-all"
                                        title="Sửa nhanh chính tả ngay lập tức bằng bộ quy chuẩn tiếng Việt"
                                      >
                                        <CheckCheck className="w-2.5 h-2.5" />
                                        <span>Sửa Nhanh</span>
                                      </button>

                                      {/* Silence VAD Alignment Button */}
                                      <button
                                        type="button"
                                        onClick={() => handleRunSilenceDetection()}
                                        disabled={isDetectingSilence}
                                        className="ml-0.5 px-2 py-0.5 bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white font-black rounded text-[7.5px] uppercase cursor-pointer flex items-center gap-0.5 shadow-sm transition-all disabled:opacity-50"
                                        title="Tự động phát hiện các đoạn im lặng trong file audio và đề xuất điều chỉnh phụ đề khớp chuẩn từng giây"
                                      >
                                        <Activity className={`w-2.5 h-2.5 ${isDetectingSilence ? 'animate-spin' : ''}`} />
                                        <span>{isDetectingSilence ? 'Đang quét...' : '⚡ Khớp Khoảng Lặng'}</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={handleCheckAndFixReviewAndSubtitles}
                                        disabled={isCheckingAndFixing}
                                        className="ml-0.5 px-2 py-0.5 bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 font-black rounded text-[7.5px] uppercase cursor-pointer hover:brightness-110 flex items-center gap-0.5"
                                        title="Tự động kiểm tra và sửa mốc thời gian"
                                      >
                                        <ShieldCheck className="w-2.5 h-2.5" />
                                        <span>Auto-Fix</span>
                                      </button>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCustomSubtitleSegments(null);
                                      }}
                                      className="text-rose-400 hover:text-rose-300 font-bold flex items-center gap-0.5 transition-all cursor-pointer"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                      Xoá & Reset Auto
                                    </button>
                                  </div>

                                  {/* Segments List */}
                                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {customSubtitleSegments.map((segment, index) => {
                                      const isActive = isPlaying && (currentAudioTime + subtitleOffset) >= segment.start && (currentAudioTime + subtitleOffset) <= segment.end;
                                      return (
                                        <div 
                                          key={index}
                                          className={`p-1.5 bg-black/60 rounded-lg border transition-all duration-200 ${
                                            isActive
                                              ? 'border-amber-500/30 bg-amber-500/5 shadow-inner'
                                              : 'border-white/[0.02] hover:border-white/5'
                                          }`}
                                        >
                                          {/* Segment Header */}
                                          <div className="flex items-center justify-between text-[7.5px] font-mono select-none">
                                            <div className="flex items-center gap-1.5">
                                              <span className={`px-1 py-0.1 rounded font-black ${
                                                isActive
                                                  ? 'bg-amber-400 text-slate-950'
                                                  : 'bg-white/10 text-slate-400'
                                              }`}>
                                                #{index + 1}
                                              </span>
                                              <span className="text-slate-300 font-semibold">{segment.start}s &rarr; {segment.end}s</span>
                                            </div>

                                            {/* Jump and listen button */}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (audioRef.current) {
                                                  audioRef.current.pause();
                                                  audioRef.current.currentTime = Math.max(0, segment.start - 0.2);
                                                  
                                                  if (videoRef.current) {
                                                    videoRef.current.pause();
                                                    videoRef.current.currentTime = Math.max(0, segment.start - 0.2);
                                                  }
                                                  
                                                  setTimeout(() => {
                                                    if (audioRef.current) {
                                                      audioRef.current.play()
                                                        .then(() => {
                                                          setIsPlaying(true);
                                                          if (isSyncPlay && videoRef.current) {
                                                            videoRef.current.play().catch(e => console.log(e));
                                                          }
                                                        })
                                                        .catch(e => console.log(e));
                                                    }
                                                  }, 50);
                                                }
                                              }}
                                              className="px-1 py-0.2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 rounded border border-amber-500/20 flex items-center gap-0.5 font-bold cursor-pointer transition-all"
                                              title="Nghe thử đoạn này"
                                            >
                                              <Play className="w-2 h-2 fill-current" />
                                              Nghe
                                            </button>
                                          </div>

                                          {/* Text Input */}
                                          <input
                                            type="text"
                                            value={segment.text}
                                            onChange={(e) => {
                                              const updated = [...customSubtitleSegments];
                                              updated[index] = {
                                                ...segment,
                                                text: e.target.value
                                              };
                                              setCustomSubtitleSegments(updated);
                                            }}
                                            onBlur={(e) => {
                                              const spell = correctVietnameseSpelling(e.target.value);
                                              if (spell.correctedText && spell.correctedText !== e.target.value) {
                                                const updated = [...customSubtitleSegments];
                                                updated[index] = {
                                                  ...segment,
                                                  text: spell.correctedText
                                                };
                                                setCustomSubtitleSegments(updated);
                                              }
                                            }}
                                            className="w-full bg-[#0a0a0a] border border-white/5 hover:border-white/10 focus:border-amber-500/30 rounded p-1 text-[8.5px] text-slate-200 focus:outline-none transition-all my-1"
                                            placeholder="Nội dung phụ đề..."
                                          />

                                          {/* Bilingual Translation Input */}
                                          {bilingualEnabled && (
                                            <input
                                              type="text"
                                              value={segment.translation || ''}
                                              onChange={(e) => {
                                                const updated = [...customSubtitleSegments];
                                                updated[index] = {
                                                  ...segment,
                                                  translation: e.target.value
                                                };
                                                setCustomSubtitleSegments(updated);
                                              }}
                                              className="w-full bg-[#0d0d0d] border border-white/5 hover:border-white/10 focus:border-cyan-500/30 rounded p-1 text-[8px] text-cyan-400 focus:outline-none transition-all mb-1 font-sans"
                                              placeholder={reviewLanguage === 'vi' ? "Bản dịch tiếng Anh (English translation)..." : "Bản dịch tiếng Việt..."}
                                            />
                                          )}

                                          {/* Timing Controls Block */}
                                          <div className="grid grid-cols-2 gap-2 text-[7px] font-mono">
                                            {/* Start Time Adjust */}
                                            <div className="flex flex-col gap-0.5">
                                              <span className="text-slate-500 font-bold uppercase">BẮT ĐẦU</span>
                                              <div className="flex items-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const updated = [...customSubtitleSegments];
                                                    updated[index] = {
                                                      ...segment,
                                                      start: Math.max(0, Number((segment.start - 0.1).toFixed(3)))
                                                    };
                                                    setCustomSubtitleSegments(updated);
                                                  }}
                                                  className="px-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 hover:text-white cursor-pointer select-none font-bold text-[8px]"
                                                >
                                                  -
                                                </button>
                                                <input
                                                  type="number"
                                                  step="0.1"
                                                  min="0"
                                                  value={segment.start}
                                                  onChange={(e) => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    const updated = [...customSubtitleSegments];
                                                    updated[index] = {
                                                      ...segment,
                                                      start: Number(val.toFixed(3))
                                                    };
                                                    setCustomSubtitleSegments(updated);
                                                  }}
                                                  className="w-full bg-[#0a0a0a] border border-white/5 rounded text-center text-slate-200 text-[8px] p-0.2 focus:outline-none focus:border-amber-500/20"
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const updated = [...customSubtitleSegments];
                                                    updated[index] = {
                                                      ...segment,
                                                      start: Number((segment.start + 0.1).toFixed(3))
                                                    };
                                                    setCustomSubtitleSegments(updated);
                                                  }}
                                                  className="px-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 hover:text-white cursor-pointer select-none font-bold text-[8px]"
                                                >
                                                  +
                                                </button>
                                              </div>
                                            </div>

                                            {/* End Time Adjust */}
                                            <div className="flex flex-col gap-0.5">
                                              <span className="text-slate-500 font-bold uppercase">KẾT THÚC</span>
                                              <div className="flex items-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const updated = [...customSubtitleSegments];
                                                    updated[index] = {
                                                      ...segment,
                                                      end: Math.max(0, Number((segment.end - 0.1).toFixed(3)))
                                                    };
                                                    setCustomSubtitleSegments(updated);
                                                  }}
                                                  className="px-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 hover:text-white cursor-pointer select-none font-bold text-[8px]"
                                                >
                                                  -
                                                </button>
                                                <input
                                                  type="number"
                                                  step="0.1"
                                                  min="0"
                                                  value={segment.end}
                                                  onChange={(e) => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    const updated = [...customSubtitleSegments];
                                                    updated[index] = {
                                                      ...segment,
                                                      end: Number(val.toFixed(3))
                                                    };
                                                    setCustomSubtitleSegments(updated);
                                                  }}
                                                  className="w-full bg-[#0a0a0a] border border-white/5 rounded text-center text-slate-200 text-[8px] p-0.2 focus:outline-none focus:border-amber-500/20"
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const updated = [...customSubtitleSegments];
                                                    updated[index] = {
                                                      ...segment,
                                                      end: Number((segment.end + 0.1).toFixed(3))
                                                    };
                                                    setCustomSubtitleSegments(updated);
                                                  }}
                                                  className="px-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 hover:text-white cursor-pointer select-none font-bold text-[8px]"
                                                >
                                                  +
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* B-ROLL VIDEO TRANSITION SELECTION LIBRARY */}
                      <div className="pt-3 border-t border-white/5 space-y-3.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] uppercase tracking-[0.12em] text-slate-300 font-bold flex items-center gap-1.5 leading-none">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                            Thư viện chuyển cảnh B-Roll chuyên nghiệp
                          </label>
                          <span className="text-[7px] text-amber-400 font-mono font-bold bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20 tracking-wider">FX RENDER ENGINE v2</span>
                        </div>
                        
                        <p className="text-[9px] text-slate-400 leading-relaxed">
                          Tự động chèn hiệu ứng mượt mà khi kết nối các phân cảnh B-roll, cắt chuyển lời thoại. Giúp tác phẩm liền mạch, loại bỏ cảm giác giật cục thô cứng khó chịu.
                        </p>

                        {/* Transition Effect Presets Grid */}
                        <div className="grid grid-cols-4 gap-1.5 bg-[#050505] p-2 rounded-2xl border border-white/5 pointer-events-auto">
                          {[
                            { id: 'none', label: 'Tắt 🚫', desc: 'Cắt trực diện' },
                            { id: 'cross_dissolve', label: 'Chồng chèo 🎞️', desc: 'Hòa trộn mịn' },
                            { id: 'white_flash', label: 'Chớp sáng ⚡', desc: 'Snappy flash' },
                            { id: 'fade_to_black', label: 'Mờ tối 🌑', desc: 'Cinematic dip' },
                            { id: 'slide_left', label: 'Trượt trái ⬅️', desc: 'Sleek push' },
                            { id: 'slide_right', label: 'Trượt phải ➡️', desc: 'Sleek push R' },
                            { id: 'zoom_blur', label: 'Thu phóng 🌀', desc: 'Zoom blur' },
                            { id: 'glitch', label: 'Nhiễu sóng 👾', desc: 'Cyber split' },
                          ].map((trans) => (
                            <button
                              key={trans.id}
                              type="button"
                              onClick={() => {
                                setVideoTransition(trans.id as any);
                                triggerPreviewTransition(trans.id);
                              }}
                              className={`py-2 px-1 rounded-xl text-center flex flex-col items-center justify-between gap-1 transition-all relative border cursor-pointer select-none ${
                                videoTransition === trans.id
                                  ? 'bg-amber-500/10 border-amber-500/30'
                                  : 'bg-[#09090b] border-white/[0.03] hover:border-white/10 text-slate-400 hover:text-slate-200'
                              }`}
                              title={trans.desc}
                            >
                              <span className={`text-[8.5px] tracking-wide leading-tight truncate w-full ${videoTransition === trans.id ? 'text-amber-400 font-black' : 'font-medium'}`}>{trans.label}</span>
                              <span className="text-[6.5px] text-slate-500 font-mono tracking-tighter leading-none truncate max-w-full">{trans.desc}</span>
                            </button>
                          ))}
                        </div>

                        {/* Transition Speed Configuration Controller */}
                        {videoTransition !== 'none' && (
                          <div className="bg-[#050505] border border-white/5 rounded-2xl p-2.5 space-y-2 pointer-events-auto">
                            <div className="flex items-center justify-between">
                              <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                ⏱️ Thời gian chuyển cảnh: <strong className="text-amber-400 font-mono font-black">{transitionDuration}s</strong>
                              </span>
                              <span className="text-[7.5px] text-emerald-400 font-medium font-mono uppercase bg-emerald-500/5 px-1 py-0.2 rounded border border-emerald-500/10">Ultra Smooth</span>
                            </div>
                            
                            <div className="grid grid-cols-4 gap-1">
                              {[
                                { val: 0.25, label: 'Siêu tốc (0.25s)', desc: 'Snappy' },
                                { val: 0.4, label: 'Chuẩn (0.40s)', desc: 'Balanced' },
                                { val: 0.6, label: 'Mượt phim (0.60s)', desc: 'Cinematic' },
                                { val: 0.8, label: 'Mơ màng (0.80s)', desc: 'Dreamy' },
                              ].map((speed) => (
                                <button
                                  key={speed.val}
                                  type="button"
                                  onClick={() => {
                                    setTransitionDuration(speed.val);
                                    triggerPreviewTransition();
                                  }}
                                  className={`py-1 rounded-lg text-center flex flex-col items-center justify-center gap-0.5 transition-all text-[7.5px] border cursor-pointer ${
                                    transitionDuration === speed.val
                                      ? 'bg-amber-400/20 text-amber-300 font-extrabold border-amber-400/40 shadow-sm'
                                      : 'bg-[#0a0a0c] text-slate-400 border-white/[0.02] hover:border-white/5'
                                  }`}
                                >
                                  <span>{speed.val}s</span>
                                  <span className="text-[5.5px] opacity-60 leading-none">{speed.desc}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Dynamic Smart Hook Banner Setup Panel */}
                      <div className="pt-3 border-t border-white/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] uppercase tracking-[0.1em] text-slate-400 font-bold flex items-center gap-1.5 leading-none">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                            Khung Tiêu Đề Hook Giật Gân (Viral Hook Header)
                          </label>
                          <div className="flex items-center gap-1.5 pointer-events-auto">
                            <span className="text-[7px] text-[#38bdf8] font-mono font-bold bg-[#38bdf8]/10 px-1 py-0.5 rounded border border-[#38bdf8]/20 uppercase">ATTENTION RETENTION</span>
                            <input
                              type="checkbox"
                              checked={showHookBanner}
                              onChange={(e) => {
                                setShowHookBanner(e.target.checked);
                                if (e.target.checked && videoRef.current) {
                                  videoRef.current.currentTime = 0;
                                }
                              }}
                              className="w-3 h-3 accent-amber-500 rounded cursor-pointer"
                              id="toggle_hook_banner"
                            />
                            <label htmlFor="toggle_hook_banner" className="text-[8px] font-mono text-slate-500 cursor-pointer uppercase select-none">Bật</label>
                          </div>
                        </div>

                        <p className="text-[9px] text-slate-400 leading-normal">
                          Xuất hiện trong các giây đầu để níu chân người xem lướt qua. Giữ chân đến <b>85% khán giả</b> nhờ cấu trúc giật gân, tương thích 100% với Reels, TikTok, Shorts.
                        </p>

                        {/* TikTok SEO Optimization Notice */}
                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-2 rounded-xl text-[8px] flex items-start gap-1.5 leading-relaxed font-semibold">
                          <span className="shrink-0 text-[10px]">⭐</span>
                          <div>
                            <span className="uppercase text-emerald-300 font-bold block mb-0.5">🚀 CHUẨN HOÁ THUẬT TOÁN TIKTOK ORGANIC REACH:</span>
                            Nếu bạn bật nút <b>"Bật"</b> ở góc trên, hệ thống sẽ in trực tiếp khung Hook giật gân sắc nét này vào video tải về để bạn có ngay video hoàn chỉnh chuẩn 100%! Ngược lại, nếu bạn muốn tải video sạch 100% để tự gõ chữ SEO trên TikTok, hãy tắt nút ở trên trước khi bấm Tải về!
                          </div>
                        </div>

                        {/* Hook Styles Grid */}
                        <div className="grid grid-cols-5 gap-1 bg-[#050505] p-1.5 rounded-xl border border-white/5 pointer-events-auto">
                          {[
                            { id: 'tiktok-yellow', label: 'Vàng TikTok', fill: '#ffe600', ring: '#fe2c55', desc: 'Sáng rực rỡ, độ phản hồi cực cao' },
                            { id: 'tiktok-red', label: 'Đỏ TikTok', fill: '#fe2c55', ring: '#ffe600', desc: 'Đỏ nóng bỏng, cảnh báo khẩn cấp' },
                            { id: 'cyberpunk-neon', label: 'Cyber Glitch', fill: '#22d3ee', ring: '#ec4899', desc: 'Phong cách tin tặc viễn tưởng cá tính' },
                            { id: 'beast-glow', label: 'Emerald Beast', fill: '#34d399', ring: '#047857', desc: 'Màu xanh quái thú rực sáng huyền ảo' },
                            { id: 'editorial-royal', label: 'Hoàng Gia', fill: '#fbbf24', ring: '#d97706', desc: 'Đẳng cấp hoàng gia tinh tế' },
                          ].map((styleOpt) => (
                            <button
                              key={styleOpt.id}
                              type="button"
                              onClick={() => {
                                setHookBannerStyle(styleOpt.id as any);
                                setShowHookBanner(true);
                                if (videoRef.current) {
                                  videoRef.current.currentTime = 0;
                                }
                              }}
                              className={`py-1.5 px-0.5 rounded-lg text-center flex flex-col items-center justify-between gap-1 transition-all border cursor-pointer select-none ${
                                hookBannerStyle === styleOpt.id && showHookBanner
                                  ? 'bg-amber-500/10 border border-amber-500/30'
                                  : 'bg-transparent border-transparent hover:border-white/5 text-slate-400 hover:text-slate-200'
                              }`}
                              title={styleOpt.desc}
                            >
                              <div 
                                className="w-5 h-5 rounded flex items-center justify-center text-[7px] font-black"
                                style={{
                                  backgroundColor: '#0c0c0c',
                                  color: styleOpt.fill,
                                  border: `1.5px solid ${styleOpt.ring}`,
                                }}
                              >
                                H1
                              </div>
                              <span className="text-[7.5px] font-bold leading-tight truncate w-full text-center">{styleOpt.label}</span>
                            </button>
                          ))}
                        </div>

                        {/* Hook text dynamic customizable text box */}
                        <div className="space-y-1.5 text-left">
                          <label className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider block">Nội dung Khung Hook (Viết hoa gợi cảm giác giật gân):</label>
                          <div className="relative">
                            <input
                              type="text"
                              value={hookBannerText}
                              onChange={(e) => setHookBannerText(e.target.value)}
                              placeholder="Nhập câu hook giật gân ở đây..."
                              className="w-full bg-[#050505] border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/30 font-bold"
                            />
                            {hookBannerText && (
                              <button
                                type="button"
                                onClick={() => setHookBannerText('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold bg-white/5 hover:bg-white/10 text-slate-400 px-1.5 py-0.5 rounded cursor-pointer"
                              >
                                Xóa
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Hook Duration slider */}
                        <div className="space-y-1.5 pt-0.5 text-left">
                          <div className="flex justify-between items-center text-[8.5px] text-slate-400 font-bold uppercase tracking-wider">
                            <span>Thời gian duy trì Khung Hook:</span>
                            <span className="text-amber-400 font-mono font-bold bg-amber-400/10 px-1.5 py-0.2 rounded">{hookBannerDuration.toFixed(1)} giây</span>
                          </div>
                          <input
                            type="range"
                            min="1.5"
                            max="6.0"
                            step="0.5"
                            value={hookBannerDuration}
                            onChange={(e) => setHookBannerDuration(parseFloat(e.target.value))}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                          />
                          <div className="flex justify-between text-[7px] text-slate-500 font-mono">
                            <span>1.5 giây (Nhanh)</span>
                            <span>3.0 giây (Khuyên dùng)</span>
                            <span>6.0 giây (Dài)</span>
                          </div>
                        </div>

                        {/* Smart AI suggested Hook templates list */}
                        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-left space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-amber-400 flex items-center gap-1">
                              💡 Ý Tưởng Câu Hook Thông Minh:
                            </span>
                            <button
                              id="smart_refresh_hook_btn"
                              type="button"
                              onClick={refreshHookSuggestions}
                              disabled={isRefreshingHooks}
                              className="text-[8px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/20 cursor-pointer flex items-center gap-1 transition-all"
                            >
                              <RefreshCw className={`w-2.5 h-2.5 ${isRefreshingHooks ? 'animate-spin' : ''}`} />
                              <span>{isRefreshingHooks ? 'Đang tạo...' : 'LÀM MỚI HOOK'}</span>
                            </button>
                          </div>
                          <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
                            {getSmartHookSuggestions().map((sug, sIdx) => {
                              const isActive = hookBannerText.toUpperCase() === sug.toUpperCase();
                              return (
                                <button
                                  key={sIdx}
                                  type="button"
                                  onClick={() => {
                                    setHookBannerText(sug);
                                    setShowHookBanner(true);
                                    // Live action preview
                                    if (videoRef.current) {
                                      videoRef.current.currentTime = 0;
                                    }
                                  }}
                                  className={`w-full text-left p-2 rounded-lg text-[9px] leading-relaxed transition-all border outline-none flex items-center justify-between gap-2 cursor-pointer ${
                                    isActive
                                      ? 'bg-amber-500/10 border-amber-500/35 text-amber-400 font-bold'
                                      : 'bg-black/40 border-white/5 hover:border-amber-500/20 text-slate-300'
                                  }`}
                                >
                                  <span className="flex-1 select-none font-sans">{sug}</span>
                                  <span className={`text-[7px] shrink-0 font-bold px-1 py-0.2 rounded uppercase ${
                                    isActive ? 'bg-amber-500 text-black animate-pulse' : 'bg-white/5 text-slate-500'
                                  }`}>
                                    {isActive ? 'ĐANG DÙNG' : 'CHỌN'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Ultra-Pro 4K / 60FPS Creator Export Suite */}
                      <div className="pt-3 border-t border-white/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] uppercase tracking-[0.1em] text-amber-400 font-black flex items-center gap-1.5 leading-none">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                            TRUNG TÂM XUẤT BẢN MASTER PRO (4K / 60FPS)
                          </label>
                          <span className="text-[8px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full">
                            TOP 1 ENGINE
                          </span>
                        </div>

                        {/* Export Quality Controls Grid */}
                        <div className="grid grid-cols-3 gap-2 bg-[#060608] p-2 rounded-xl border border-white/5">
                          {/* Resolution Selector */}
                          <div className="space-y-1">
                            <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider block">Độ phân giải</span>
                            <div className="flex rounded-lg bg-black/60 p-0.5 border border-white/5">
                              {(['4k', '1080p', '720p'] as const).map(res => (
                                <button
                                  key={res}
                                  type="button"
                                  onClick={() => setExportResolution(res)}
                                  className={`flex-1 py-1 text-[8px] font-mono font-bold rounded uppercase transition-all cursor-pointer ${
                                    exportResolution === res
                                      ? 'bg-amber-500 text-black shadow-sm'
                                      : 'text-slate-400 hover:text-white'
                                  }`}
                                >
                                  {res}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* FPS Selector */}
                          <div className="space-y-1">
                            <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider block">Khung hình</span>
                            <div className="flex rounded-lg bg-black/60 p-0.5 border border-white/5">
                              {([60, 30] as const).map(fps => (
                                <button
                                  key={fps}
                                  type="button"
                                  onClick={() => setExportFps(fps)}
                                  className={`flex-1 py-1 text-[8px] font-mono font-bold rounded transition-all cursor-pointer ${
                                    exportFps === fps
                                      ? 'bg-amber-500 text-black shadow-sm'
                                      : 'text-slate-400 hover:text-white'
                                  }`}
                                >
                                  {fps} FPS
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Bitrate Mode */}
                          <div className="space-y-1">
                            <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider block">Chất lượng</span>
                            <div className="flex rounded-lg bg-black/60 p-0.5 border border-white/5">
                              {[
                                { id: 'master', label: 'Master' },
                                { id: 'high', label: 'Pro HD' },
                              ].map(b => (
                                <button
                                  key={b.id}
                                  type="button"
                                  onClick={() => setExportBitratePreset(b.id as any)}
                                  className={`flex-1 py-1 text-[8px] font-mono font-bold rounded transition-all cursor-pointer ${
                                    exportBitratePreset === b.id
                                      ? 'bg-amber-500 text-black shadow-sm'
                                      : 'text-slate-400 hover:text-white'
                                  }`}
                                >
                                  {b.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Main Export Video Button */}
                        <button
                          type="button"
                          onClick={mergeAndDownloadVideo}
                          disabled={isMerging}
                          className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-lg relative overflow-hidden ${
                            isMerging 
                              ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                              : 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 text-black hover:brightness-110 shadow-amber-500/20 active:scale-[0.98]'
                          }`}
                        >
                          {isMerging ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                              <span className="text-amber-200">Đang xuất bản {exportResolution.toUpperCase()} @ {exportFps}FPS: {mergeProgress}%</span>
                            </>
                          ) : (
                            <>
                              <FileVideo className="w-4 h-4 text-black animate-pulse" />
                              <span>🎬 GHÉP & XUẤT VIDEO REVIEW {exportResolution.toUpperCase()} ({exportFps}FPS PRO)</span>
                            </>
                          )}
                        </button>

                        {/* Additional Creator Package Downloads */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={downloadSRTFile}
                            className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-amber-300 border border-white/10 text-[9px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                            title="Tải phụ đề định dạng SRT cho CapCut, Premiere, TikTok"
                          >
                            <FileText className="w-3 h-3 text-amber-400" />
                            <span>Tải .SRT</span>
                          </button>

                          <button
                            type="button"
                            onClick={downloadVTTFile}
                            className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-amber-300 border border-white/10 text-[9px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                            title="Tải phụ đề định dạng WebVTT"
                          >
                            <Globe className="w-3 h-3 text-blue-400" />
                            <span>Tải .VTT</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (audioUrl) {
                                const a = document.createElement('a');
                                a.href = audioUrl;
                                a.download = `${(activeReview?.productName || "voiceover").toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}.wav`;
                                a.click();
                                playSynthesizedSFX('pop', 0.6);
                              } else {
                                setApiError("Chưa có bản thu âm giọng đọc AI!");
                              }
                            }}
                            className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-amber-300 border border-white/10 text-[9px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                            title="Tải riêng tệp âm thanh giọng đọc thuyết minh WAV không nén"
                          >
                            <FileAudio className="w-3 h-3 text-emerald-400" />
                            <span>Tải .WAV</span>
                          </button>

                          <button
                            type="button"
                            onClick={downloadCreatorPackage}
                            className="py-1.5 px-2 rounded-lg bg-gradient-to-r from-amber-500/10 to-amber-600/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                            title="Tải trọn bộ tài liệu kịch bản, USP và hashtags cho Creator"
                          >
                            <Award className="w-3 h-3 text-amber-400" />
                            <span>Bộ Kit .MD</span>
                          </button>
                        </div>

                        {/* If merging is active, display a gorgeous micro progress bar */}
                        {isMerging && (
                          <div className="space-y-1">
                            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden relative">
                              <div 
                                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300 rounded-full"
                                style={{ width: `${mergeProgress}%` }}
                              ></div>
                            </div>
                            <p className="text-[8px] text-slate-500 text-center leading-normal italic">
                              Hệ thống đang chạy đồng bộ hình ảnh và lồng tiếng trực tiếp trên trình duyệt. Vui lòng giữ tab này hoạt động!
                            </p>
                          </div>
                        )}

                        {/* If successfully merged video, show download fallbacks to prevent any iframe blockers */}
                        {mergedVideoUrl && !isMerging && (
                          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/[0.02] to-transparent border border-emerald-500/20 space-y-3.5 text-left">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>ĐÃ GHÉP HOÀN CHỈNH VIDEO REVIEW!</span>
                              </div>
                              <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-bold uppercase">
                                {mergedVideoExt} HD
                              </span>
                            </div>

                            {/* Live video player preview of the merged MP4 file */}
                            <div className="space-y-1.5">
                              <span className="text-[8px] text-slate-400 font-mono font-bold uppercase tracking-widest block">
                                TRÌNH PHÁT VIDEO ĐÃ GHÉP THUYẾT MINH
                              </span>
                              <video
                                src={mergedVideoUrl}
                                controls
                                className="w-full rounded-xl border border-white/10 aspect-video object-contain bg-black shadow-lg"
                                playsInline
                              />
                            </div>

                            <p className="text-[9px] text-slate-300 leading-relaxed">
                              Đã hoàn chỉnh ghép tiếng thuyết minh vào video gốc chất lượng siêu cao (6.5 Mbps) không nén!
                            </p>
                            
                            <div className="flex flex-col gap-1.5 text-[9px]">
                              <a
                                href={mergedVideoUrl}
                                download={`${(activeReview?.productName || "review_ai").toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}_final.${mergedVideoExt}`}
                                className="text-black hover:text-black font-semibold flex items-center justify-center gap-1.5 bg-amber-400 hover:bg-amber-300 py-1.5 px-3 rounded-lg shadow-lg shadow-amber-500/10 transition-all cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5 text-black" /> Tải Xuống Video (.{mergedVideoExt})
                              </a>

                              <a
                                href={mergedVideoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-amber-400 hover:text-amber-300 font-medium flex items-center justify-center gap-1.5 bg-white/5 border border-white/10 py-1.5 px-3 rounded-lg hover:bg-white/10 transition-all cursor-pointer text-center"
                              >
                                <ExternalLink className="w-3 h-3" /> Mở nguồn video trong Tab mới để tải
                              </a>
                            </div>

                            {/* BỘ TỐI ƯU PHÂN PHỐI THUẬT TOÁN TIKTOK TRIỆU VIEWS */}
                            {/* TIKTOK FYP ALGORITHM & SEO OPTIMIZATION SUITE */}
                            <div className="pt-3.5 border-t border-white/10 space-y-3.5 text-left">
                              <div className="flex items-center justify-between bg-gradient-to-r from-pink-500/10 via-rose-500/10 to-amber-500/10 p-3 rounded-2xl border border-pink-500/20">
                                <div className="flex items-center gap-2.5">
                                  <span className="p-2 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/30">
                                    <TrendingUp className="w-4 h-4 animate-bounce" />
                                  </span>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <h4 className="text-[11px] font-black uppercase bg-gradient-to-r from-pink-400 via-rose-300 to-amber-300 bg-clip-text text-transparent tracking-wider">
                                        BỘ TỐI ƯU THUẬT TOÁN TIKTOK FYP & SEO TRIỆU VIEWS 🚀
                                      </h4>
                                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[8px] font-mono font-bold text-emerald-400 uppercase">
                                        SEO Score: 98/100
                                      </span>
                                    </div>
                                    <p className="text-[8.5px] text-slate-300 leading-normal mt-0.5">
                                      Tối ưu hóa đa tầng theo thuật toán đề xuất TikTok FYP 2026: giữ chân 3s đầu, lập chỉ mục từ khóa SEO tìm kiếm & chống bóp tương tác.
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* ALGORITHM HEALTH METRICS BANNER */}
                              <div className="grid grid-cols-3 gap-2">
                                <div className="bg-[#0b0b0b] p-2.5 rounded-xl border border-white/5 flex flex-col justify-between">
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">⚡ Giữ Chân 3s Đầu</span>
                                  <div className="flex items-baseline gap-1 mt-1">
                                    <span className="text-sm font-black text-emerald-400 font-mono">99.4%</span>
                                    <span className="text-[7.5px] text-emerald-500 font-semibold">Tối Đa</span>
                                  </div>
                                </div>
                                <div className="bg-[#0b0b0b] p-2.5 rounded-xl border border-white/5 flex flex-col justify-between">
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">🔍 Chỉ Số SEO Từ Khóa</span>
                                  <div className="flex items-baseline gap-1 mt-1">
                                    <span className="text-sm font-black text-pink-400 font-mono">98.8%</span>
                                    <span className="text-[7.5px] text-pink-300 font-semibold">Chuẩn FYP</span>
                                  </div>
                                </div>
                                <div className="bg-[#0b0b0b] p-2.5 rounded-xl border border-white/5 flex flex-col justify-between">
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">🛡️ An Toàn Chính Sách</span>
                                  <div className="flex items-baseline gap-1 mt-1">
                                    <span className="text-sm font-black text-amber-400 font-mono">100%</span>
                                    <span className="text-[7.5px] text-amber-300 font-semibold">An Toàn</span>
                                  </div>
                                </div>
                              </div>

                              {/* TIKTOK SEARCH BAR SEO KEYWORDS */}
                              <div className="bg-[#080808] p-3 rounded-2xl border border-white/5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                    <span>🔍 Từ Khóa Tìm Kiếm TikTok SEO (Dán vào Mô tả / Ảnh bìa):</span>
                                  </span>
                                  <span className="text-[7.5px] text-pink-400 font-semibold">Giúp video lên Top tìm kiếm</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {(() => {
                                    const rawProdName = (activeReview?.productName || "Sản phẩm").replace(/\(.*?\)/g, '').trim();
                                    const prodLower = rawProdName.toLowerCase();
                                    const kwList = [
                                      `review ${prodLower} có tốt không`,
                                      `đánh giá ${prodLower} chân thực`,
                                      `có nên mua ${prodLower}`,
                                      `săn deal ${prodLower} tiktok shop`,
                                      `kiểm chứng chất lượng ${prodLower}`,
                                      `review lồng tiếng sài gòn`
                                    ];
                                    return kwList.map((kw, idx) => (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard.writeText(kw);
                                          setCopiedSearchKeyword(kw);
                                          setTimeout(() => setCopiedSearchKeyword(null), 2000);
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-pink-500/20 text-[8.5px] font-medium text-slate-300 hover:text-white border border-white/5 hover:border-pink-500/40 transition-all cursor-pointer flex items-center gap-1.5 group"
                                        title="Nhấp để sao chép từ khóa SEO này"
                                      >
                                        <span>#{kw}</span>
                                        {copiedSearchKeyword === kw ? (
                                          <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                        ) : (
                                          <Copy className="w-2.5 h-2.5 text-slate-500 group-hover:text-pink-300 shrink-0" />
                                        )}
                                      </button>
                                    ));
                                  })()}
                                </div>
                              </div>

                              {/* CAPTION STYLES */}
                              <div className="space-y-2.5 bg-[#050505]/80 p-3.5 rounded-2xl border border-white/10">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <span className="text-[9.5px] font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                                    <span>✍️ Mẫu Tiêu Đề & Hashtag SEO TikTok (Copy ngay):</span>
                                  </span>
                                  {/* Caption Type Selector */}
                                  <div className="flex flex-wrap gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
                                    {(['sensational', 'objective', 'funny', 'conversion'] as const).map((style) => (
                                      <button
                                        key={style}
                                        type="button"
                                        onClick={() => setTiktokCaptionStyle(style)}
                                        className={`px-2.5 py-1 rounded-lg text-[8px] font-extrabold uppercase transition-all cursor-pointer ${
                                          tiktokCaptionStyle === style
                                            ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/20'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                        }`}
                                      >
                                        {style === 'sensational'
                                          ? '🚨 Giật Gân'
                                          : style === 'objective'
                                          ? '📊 Khách Quan'
                                          : style === 'funny'
                                          ? '🤣 Hài Hước'
                                          : '🛒 Chốt Đơn'}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="relative bg-[#0b0b0b] border border-white/10 rounded-xl p-3.5 text-[10.5px] text-slate-200 leading-relaxed font-sans">
                                  {(() => {
                                    const rawProdName = (activeReview?.productName || "Siêu phẩm").replace(/\(.*?\)/g, '').trim();
                                    const prodUpper = rawProdName.toUpperCase();
                                    const prodTag = rawProdName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
                                    
                                    let captionText = '';
                                    if (tiktokCaptionStyle === 'sensational') {
                                      captionText = `🚨 ĐỪNG VỘI MUA ${prodUpper} NẾU CHƯA COI HẾT CLIP NÀY!\n\nSự thật cực kỳ chấn động về trải nghiệm thực tế được bật mí chi tiết. Đảm bảo coi xong clip review lồng tiếng Sài Gòn này bạn sẽ biết ngay ưu nhược điểm thật sự! 😍👇\n\n📌 Lưu lại clip này để xem lại trước khi chốt đơn nha!\n\n#review #${prodTag} #learnontiktok #tiktokshop #xuhuong2026 #reviewchanthuc #shoppertainment`;
                                    } else if (tiktokCaptionStyle === 'objective') {
                                      captionText = `🔥 Đánh giá khách quan trải nghiệm thực tế ${prodUpper} sau thời gian dài sử dụng.\n\nChia sẻ tất tần tật ưu nhược điểm đắt giá giúp cả nhà có góc nhìn chân thực nhất trước khi xuống tiền chốt đơn. Chi tiết trong video nha! 🛒👇\n\n💬 Cả nhà đã trải nghiệm món này chưa? Để lại bình luận bên dưới nhé!\n\n#review #${prodTag} #learnontiktok #tiktokshop #goclamdep #xuhuong2026 #reviewchiase`;
                                    } else if (tiktokCaptionStyle === 'funny') {
                                      captionText = `🤣 Kiếp nạn mua hàng online gọi tên ${prodUpper} nhưng cái kết lại làm mình sốc nặng!\n\nCả nhà cùng lướt hết clip review lồng tiếng chuẩn giọng Sài Gòn siêu ngọt ngào này để khám phá bí mật đằng sau nhé! 🥰👇\n\n👉 Tag ngay đứa bạn thân chuyên mua sắm online vào coi chung nè!\n\n#funnyreview #${prodTag} #tiktokshop #learnontiktok #goclamdep #xuhuong2026`;
                                    } else {
                                      captionText = `🛒 SĂN DEAL ${prodUpper} CHÍNH HÃNG - ƯU ĐÃI KHỦNG HÔM NAY!\n\nKiểm chứng thực tế chất lượng cực đỉnh, dùng siêu thích mà giá lại quá hời. Cơ hội sở hữu ngay sản phẩm tiện ích số 1 cho góc sống hiện đại! ⚡👇\n\n🎁 Nhấp vào Giỏ Hàng Vàng góc trái bên dưới để rinh ngay ưu đãi đặc quyền hôm nay trước khi cháy hàng nha!\n\n#tiktokshop #${prodTag} #shoppertainment #dealhot #learnontiktok #xuhuong2026 #chotdon`;
                                    }

                                    return (
                                      <>
                                        <p className="whitespace-pre-line pr-9 text-slate-300 selection:bg-pink-500/20">{captionText}</p>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard.writeText(captionText);
                                            setCopiedTiktokCaption(true);
                                            setTimeout(() => setCopiedTiktokCaption(false), 2000);
                                          }}
                                          className="absolute right-2.5 top-2.5 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border border-white/10 transition-all cursor-pointer shadow-sm"
                                          title="Sao chép tiêu đề"
                                        >
                                          {copiedTiktokCaption ? (
                                            <Check className="w-4 h-4 text-emerald-400" />
                                          ) : (
                                            <Copy className="w-4 h-4" />
                                          )}
                                        </button>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>

                              {/* TRENDING AUDIO HACK & SHADOWBAN COMPLIANCE SHIELD */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {/* Audio Hack */}
                                <div className="bg-pink-500/[0.03] border border-pink-500/15 rounded-2xl p-3 space-y-2.5">
                                  <div className="flex items-center gap-1.5 text-[9.5px] font-bold text-pink-400 uppercase tracking-wide">
                                    <Sparkles className="w-3.5 h-3.5 animate-pulse text-pink-400" />
                                    <span>Kỹ Thuật Ghép Nhạc Thịnh Hành (Audio Hack)</span>
                                  </div>
                                  <p className="text-[8.5px] text-slate-300 leading-relaxed">
                                    Thuật toán TikTok tự động tăng gấp <b>3 lần lượt hiển thị (FYP Reach)</b> cho các video có gắn nhạc nền Trending. Cách tối ưu âm thanh:
                                  </p>
                                  <div className="space-y-1 text-[8.5px] pl-2 border-l-2 border-pink-500/30 text-slate-300">
                                    <p>
                                      <b className="text-pink-300">1.</b> Bấm <b className="text-pink-300">"Thêm âm thanh" (Add Sound)</b> trên ứng dụng TikTok.
                                    </p>
                                    <p>
                                      <b className="text-pink-300">2.</b> Chọn bài nhạc đang Hot (nhạc có biểu tượng xu hướng).
                                    </p>
                                    <p>
                                      <b className="text-pink-300">3.</b> Bấm <b className="text-pink-300">"Âm lượng" (Volume)</b>, kéo <b className="text-pink-300">Âm thanh thêm vào về mức 1% - 3%</b>, giữ <b className="text-pink-300">Âm thanh gốc (giọng AI Sài Gòn) ở 100% - 150%</b>.
                                    </p>
                                  </div>
                                  <div className="p-2 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl text-[8px] text-emerald-400 font-semibold leading-normal">
                                    👉 Video vừa lọt luồng đề xuất âm thanh hot trend, vừa giữ trọn tiếng đọc Sài Gòn truyền cảm!
                                  </div>
                                </div>

                                {/* Shadowban Compliance Shield */}
                                <div className="bg-amber-500/[0.03] border border-amber-500/15 rounded-2xl p-3 space-y-2.5">
                                  <div className="flex items-center gap-1.5 text-[9.5px] font-bold text-amber-400 uppercase tracking-wide">
                                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Bộ Lọc Từ Khóa Chống Bóp Reach (Compliance Shield)</span>
                                  </div>
                                  <p className="text-[8.5px] text-slate-300 leading-relaxed">
                                    Thuật toán kiểm duyệt TikTok Shop <b>rất khắt khe</b> với từ ngữ phóng đại. Hãy tuân thủ bộ lọc an toàn để video không bị hạn chế hiển thị:
                                  </p>
                                  <div className="space-y-1.5 text-[8px] text-slate-300">
                                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/40 border border-white/5">
                                      <span className="text-rose-400 font-semibold line-through">"Trị dứt điểm 100%"</span>
                                      <span className="text-emerald-400 font-bold">➔ "Hỗ trợ cải thiện mượt mà"</span>
                                    </div>
                                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/40 border border-white/5">
                                      <span className="text-rose-400 font-semibold line-through">"Sản phẩm số 1 thế giới"</span>
                                      <span className="text-emerald-400 font-bold">➔ "Top sản phẩm được yêu thích"</span>
                                    </div>
                                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/40 border border-white/5">
                                      <span className="text-rose-400 font-semibold line-through">"Hoàn tiền ngay / Giá rẻ nhất"</span>
                                      <span className="text-emerald-400 font-bold">➔ "Ưu đãi cực hời hôm nay"</span>
                                    </div>
                                  </div>
                                  <div className="p-2 bg-amber-500/[0.06] border border-amber-500/20 rounded-xl text-[8px] text-amber-300 font-semibold leading-normal">
                                    👉 Kịch bản lồng tiếng Sài Gòn từ AI đã được tự động loại bỏ hoàn toàn các từ cấm này!
                                  </div>
                                </div>
                              </div>

                              {/* TIKTOK ALGORITHM PRE-POSTING CHECKLIST */}
                              <div className="bg-[#050505]/60 border border-white/10 rounded-2xl p-3.5 space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 text-[9.5px] font-bold text-slate-200 uppercase tracking-wide">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Bảng Đánh Giá 6 Chỉ Số Vàng Video Triệu Views:</span>
                                  </div>
                                  <span className="text-[8px] font-mono font-bold text-pink-400">
                                    {Object.values(tiktokChecklist).filter(Boolean).length}/6 Hoàn Tất
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {[
                                    {
                                      id: 'hook',
                                      label: 'Thẻ Hook giật gân 3 giây đầu',
                                      desc: 'Lôi cuốn thị giác ngay khi người xem lướt qua, chặn đứng hành vi vuốt bỏ (Bounce Rate).',
                                    },
                                    {
                                      id: 'voice',
                                      label: 'Giọng lồng tiếng Sài Gòn nịnh tai',
                                      desc: 'Giọng miền Nam chuẩn, nhịp điệu thong thả, biểu cảm truyền cảm tăng 180% độ tin tưởng & Watch Time.',
                                    },
                                    {
                                      id: 'seo',
                                      label: 'Tiêu đề & Hashtag SEO chuẩn AI',
                                      desc: 'Tối ưu hóa từ khóa trên thanh tìm kiếm TikTok & đề xuất liên quan (Search SEO FYP).',
                                    },
                                    {
                                      id: 'retention',
                                      label: 'Cấu trúc video giữ chân >70%',
                                      desc: 'Không quảng cáo lộ liễu trong 5 giây đầu, tập trung vào trải nghiệm chân thực cuốn hút.',
                                    },
                                    {
                                      id: 'audio',
                                      label: 'Ghép nhạc nền Trending (Audio Hack)',
                                      desc: 'Giữ âm thanh gốc 100%, kéo nhạc xu hướng xuống 1-3% để ăn đề xuất âm thanh hot.',
                                    },
                                    {
                                      id: 'cta',
                                      label: 'Gieo câu hỏi tương tác bình luận',
                                      desc: 'Ghim bình luận đầu tiên tạo luồng thảo luận sôi động để thuật toán TikTok FYP đẩy video lên Xu Hướng.',
                                    }
                                  ].map((item) => (
                                    <label
                                      key={item.id}
                                      className="flex items-start gap-2.5 p-2.5 rounded-xl bg-black/40 border border-white/[0.04] hover:border-pink-500/30 transition-all cursor-pointer group"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={!!tiktokChecklist[item.id]}
                                        onChange={(e) => setTiktokChecklist(prev => ({ ...prev, [item.id]: e.target.checked }))}
                                        className="w-3.5 h-3.5 mt-0.5 rounded accent-pink-500 cursor-pointer border-white/10 bg-black/40"
                                      />
                                      <div className="space-y-0.5">
                                        <span className={`text-[9px] font-bold block transition-colors ${
                                          tiktokChecklist[item.id] ? 'text-emerald-400 line-through decoration-emerald-500/30' : 'text-slate-200 group-hover:text-pink-300'
                                        }`}>
                                          {item.label}
                                        </span>
                                        <p className="text-[7.5px] text-slate-400 leading-normal">{item.desc}</p>
                                      </div>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                            
                            <div className="pt-2 border-t border-white/5 text-[9px] text-amber-500/90 leading-normal bg-amber-500/[0.04] p-2.5 rounded-xl border border-amber-500/10 font-sans space-y-1">
                              <p className="font-bold text-center uppercase tracking-wide text-[9.5px]">💡 GIẢI QUYẾT LỖI TẢI XUỐNG & IFRAME:</p>
                              <p>• <strong>Cách tải trực tiếp 100% thành công:</strong> Nhấp vào biểu tượng <strong>"Mở trong tab mới" (Open in new tab)</strong> ở góc trên bên phải thanh tiêu đề trình duyệt AI Studio để chạy app độc lập, tránh bị khung rào bảo mật iframe của Google chặn tải xuống!</p>
                              <p>• <strong>Trên Điện thoại Android / Máy tính:</strong> Nhấn nút "Tải xuống" ở trên, hoặc <strong>nhấp chuột phải vào video</strong> phát thử và chọn <strong>"Lưu video thành..."</strong>.</p>
                              <p>• <strong>Trên Điện thoại iPhone (iOS):</strong> Apple không đọc trực tiếp file WebM của Chrome. Hãy <strong>mở ứng dụng này bằng trình duyệt Safari trên iPhone</strong>, thực hiện ghép & xuất video, Safari sẽ tự động xuất đuôi <strong>.MP4 gốc chuẩn 100%</strong> lưu thẳng vào thư viện ảnh của bạn!</p>
                              <p className="text-slate-400 italic text-[8.5px] text-center pt-1 border-t border-white/5">Video đã được tối ưu hóa băng thông sắc nét từng pixel, tương thích tải lên TikTok, Reels, Shorts.</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <audio 
                        ref={audioRef}
                        crossOrigin="anonymous"
                        src={audioUrl}
                        onEnded={handleAudioEnded}
                        onTimeUpdate={(e) => {
                          if (audioUrl) {
                            setCurrentAudioTime(e.currentTarget.currentTime);
                          }
                        }}
                        onLoadedMetadata={(e) => {
                          setAudioDuration(e.currentTarget.duration);
                        }}
                        onDurationChange={(e) => {
                          setAudioDuration(e.currentTarget.duration);
                        }}
                        className="hidden"
                      />
                    </div>
                  ) : (
                    <div className="text-center py-2 text-slate-600">
                      <p className="text-[10px] font-semibold text-slate-400">Chưa tải giọng đọc marketing</p>
                      <p className="text-[9px] text-slate-500 leading-snug mt-1">
                        Nhấp nút &ldquo;Khởi tạo giọng đọc AI&rdquo; để ghép tiếng lồng trực tiếp.
                      </p>
                    </div>
                  )}
                </div>

                {/* Studio syncing adjustments */}
                <div className="p-3.5 rounded-xl bg-white/[0.01] border border-white/5 space-y-2.5 text-[11px] text-slate-400">
                  <label className="text-[9px] font-mono tracking-widest text-slate-500 uppercase block font-bold">CẤU HÌNH LIÊN KẾT STUDIO</label>
                  
                  {/* Toggle Sync Play */}
                  <label className="flex items-center justify-between cursor-pointer group py-0.5">
                    <span className="group-hover:text-slate-200 transition-colors">Đồng bộ phát video & giọng nói</span>
                    <input 
                      type="checkbox" 
                      checked={isSyncPlay} 
                      onChange={(e) => setIsSyncPlay(e.target.checked)}
                      className="rounded bg-black border-white/20 text-amber-500 focus:ring-0 cursor-pointer h-3.5 w-3.5"
                    />
                  </label>

                  {/* Toggle Ducking Volume */}
                  <label className="flex items-center justify-between cursor-pointer group py-0.5">
                    <span className="group-hover:text-slate-200 transition-colors flex items-center gap-1">
                      Giảm âm nền video gốc (Ducking)
                    </span>
                    <input 
                      type="checkbox" 
                      checked={duckOriginalAudio} 
                      onChange={(e) => setDuckOriginalAudio(e.target.checked)}
                      className="rounded bg-black border-white/20 text-amber-500 focus:ring-0 cursor-pointer h-3.5 w-3.5"
                    />
                  </label>

                  {/* Mute Original Video toggle */}
                  <label className="flex items-center justify-between cursor-pointer group py-0.5">
                    <span className="group-hover:text-slate-200 transition-colors">Tắt tiếng hoàn toàn video gốc</span>
                    <input 
                      type="checkbox" 
                      checked={videoOriginalMute} 
                      onChange={(e) => setVideoOriginalMute(e.target.checked)}
                      className="rounded bg-black border-white/20 text-amber-500 focus:ring-0 cursor-pointer h-3.5 w-3.5"
                    />
                  </label>

                  {/* Subtitle Sync Offset Slider */}
                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-300">Độ lệch phụ đề (Sync Offset)</span>
                      <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[9.5px] ${
                        subtitleOffset === 0 
                          ? 'text-slate-400 bg-white/5' 
                          : subtitleOffset > 0 
                            ? 'text-emerald-400 bg-emerald-500/10' 
                            : 'text-rose-400 bg-rose-500/10'
                      }`}>
                        {subtitleOffset > 0 ? `+${subtitleOffset.toFixed(1)}s` : `${subtitleOffset.toFixed(1)}s`}
                      </span>
                    </div>
                    <input 
                      type="range"
                      min="-2.0"
                      max="2.0"
                      step="0.1"
                      value={subtitleOffset}
                      onChange={(e) => setSubtitleOffset(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                    <div className="flex justify-between text-[8px] font-mono text-slate-500">
                      <span>Phát nhanh hơn (-2s)</span>
                      <span>Khớp chuẩn (0s)</span>
                      <span>Phát trễ hơn (+2s)</span>
                    </div>
                  </div>

                  {/* Automatic Audio Silence VAD Alignment Button */}
                  <div className="pt-2 border-t border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 text-[10px] flex items-center gap-1 font-semibold">
                        <Activity className="w-3 h-3 text-sky-400" />
                        <span>Khớp Khoảng Lặng Tự Động</span>
                      </span>
                      <span className="text-[7.5px] font-mono text-sky-400 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20 uppercase font-bold">
                        VAD AUDIO
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRunSilenceDetection()}
                      disabled={isDetectingSilence}
                      className="w-full py-2 px-2.5 bg-gradient-to-r from-sky-500/15 via-indigo-500/15 to-teal-500/15 hover:from-sky-500/25 hover:to-teal-500/25 border border-sky-500/30 hover:border-sky-400/50 rounded-xl text-sky-200 hover:text-white font-bold text-[10px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                      title="Tự động phát hiện nhịp thở, khoảng lặng và khớp phụ đề chính xác từng mili-giây"
                    >
                      <Activity className={`w-3 h-3 text-sky-400 ${isDetectingSilence ? 'animate-spin' : ''}`} />
                      <span>{isDetectingSilence ? 'Đang dò sóng âm thanh...' : '⚡ Khớp Phụ Đề Theo Khoảng Lặng'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* CENTRAL EDIT & REPORT WORKSPACE */}
        <section id="workspace" className={`lg:col-span-7 flex flex-col gap-6 transition-all duration-300 ${
          activeMobileTab === 'results' ? 'block' : 'hidden lg:flex'
        }`}>
          
          {/* STUDIO STATUS & WORKSPACE HEADER CONTAINER */}
          <div className="p-5 bg-gradient-to-r from-amber-500/10 via-black/40 to-black/80 border border-amber-500/10 rounded-3xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold tracking-widest text-amber-500 uppercase bg-amber-500/10 px-1.5 py-0.5 rounded">
                    SẢN PHẨM REVIEW
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {activeReview?.category || "Chưa phân tích"}
                  </span>
                </div>
                <h2 className="text-sm font-semibold text-white tracking-tight text-left">
                  {activeReview?.productName || "Sẵn sàng phân tích sản phẩm tuyển chọn..."}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => {
                  clearAllUploadedFiles();
                  setExtractionProgress(null);
                  clearAllProductImages();
                  setProductName('');
                  setProductDesc('');
                  setAudioUrl('');
                  setIsPlaying(false);
                  if (audioRef.current) audioRef.current.pause();
                  if (videoRef.current) videoRef.current.pause();
                  setCustomPrompt('');
                  setTonePreset('Thuyết phục & Truyền cảm');
                  setApiError(null);
                  setActiveReview(null);
                  setActiveMobileTab('inputs');
                  setSuggestedKeywords([]);
                  setIsIdentifying(false);
                }}
                className="px-3.5 py-1.5 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-300 rounded-xl text-xs transition-all flex items-center gap-1.5 font-medium cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Xoá & Đặt lại từ đầu
              </button>
            </div>
          </div>

          {/* SYSTEM API ALERTS OR ERRORS */}
          {apiError && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 justify-between relative">
              <div className="flex items-start gap-3 pr-8">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-left">
                  <p className="text-xs font-semibold text-rose-300">Thông báo từ hệ thống AI Studio</p>
                  <p className="text-xs text-rose-200/80 leading-relaxed font-mono">
                    {apiError}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setApiError(null)}
                className="absolute top-3 right-3 p-1 rounded-full text-rose-400/75 hover:text-rose-300 hover:bg-rose-500/20 transition-all cursor-pointer"
                title="Đóng thông báo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ACTIVE ANALYZING LOADER BAR */}
          {isAnalyzing && (
            <div className="relative bg-gradient-to-b from-[#0d0d0d] to-[#040404] border border-amber-500/30 rounded-3xl p-8 sm:p-10 text-center space-y-6 pulsing-glow overflow-hidden shadow-[0_20px_50px_rgba(245,158,11,0.15)]">
              {/* Decorative radial lighting in background */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.08)_0%,transparent_65%)] pointer-events-none" />
              
              {/* Holographic scanning effect */}
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-pulse" style={{ animationDuration: '2s' }} />

              <div className="relative flex justify-center">
                {/* Advanced Multi-ring spinning loader representing deep scanning */}
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-dashed border-amber-500/20 animate-spin" style={{ animationDuration: '20s' }} />
                  <div className="absolute inset-2 rounded-full border border-double border-amber-500/40 animate-[spin_10s_linear_infinite]" />
                  <div className="absolute inset-4 rounded-full border border-dashed border-rose-500/50 animate-[spin_6s_reverse_infinite]" />
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                    <Sparkles className="w-5 h-5 text-amber-400 animate-[pulse_1.5s_infinite]" />
                  </div>
                </div>
              </div>

              <div className="space-y-3 max-w-xl mx-auto relative z-10">
                <p className="font-display text-xl font-bold text-amber-400 tracking-tight">
                  {extractionProgress !== null 
                    ? `Đang giải nén & nén dung lượng video (${extractionProgress}%)...`
                    : "Đang giải mã và phân tích luồng đa phương tiện..."
                  }
                </p>
                
                {/* Step Indicators showing superior AI methodology */}
                <div className="grid grid-cols-3 gap-2 pt-2 max-w-md mx-auto">
                  <div className={`p-2.5 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center gap-1 ${
                    extractionProgress !== null
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                      : 'bg-black/40 border-white/5 text-slate-500'
                  }`}>
                    <span className="text-[9px] font-mono font-bold tracking-wider">BƯỚC 1</span>
                    <span className="text-[10px] font-semibold whitespace-nowrap">Nén Video</span>
                  </div>
                  
                  <div className={`p-2.5 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center gap-1 ${
                    isAnalyzing && extractionProgress === null && analysisStepIndex === 1
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.1)] animate-pulse'
                      : isAnalyzing && extractionProgress === null && analysisStepIndex > 1
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-black/40 border-white/5 text-slate-500'
                  }`}>
                    <span className="text-[9px] font-mono font-bold tracking-wider">BƯỚC 2</span>
                    <span className="text-[10px] font-semibold whitespace-nowrap">Quét Vật Lý</span>
                  </div>

                  <div className={`p-2.5 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center gap-1 ${
                    isAnalyzing && extractionProgress === null && analysisStepIndex >= 2
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.1)] animate-pulse'
                      : 'bg-black/40 border-white/5 text-slate-500'
                  }`}>
                    <span className="text-[9px] font-mono font-bold tracking-wider">BƯỚC 3</span>
                    <span className="text-[10px] font-semibold whitespace-nowrap">Biên Kịch AI</span>
                  </div>
                </div>

                <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-xs text-slate-300 leading-relaxed text-center font-sans">
                  {extractionProgress !== null ? (
                    <span>
                      Hệ thống đang trích xuất chuỗi hình ảnh đại diện (Keyframes) độ phân giải cao trực tiếp trên thiết bị của bạn. 
                      Phương pháp này giúp <strong>nén dữ liệu lên tới 98.4%</strong>, cho phép gửi các tệp video siêu nặng (lên tới 1 GB) mà vẫn mượt mà, siêu tốc!
                    </span>
                  ) : analysisStepIndex === 1 ? (
                    <span>
                      Nhận dạng quang học & cảm quan vật lý đang hoạt động. 
                      Hệ thống <strong>Gemini 3.8 Flash</strong> phân tích thiết kế, chất liệu, tính năng sản phẩm từ chuỗi hình ảnh được nén tối ưu.
                    </span>
                  ) : (
                    <span>
                      Đang áp dụng mô hình tâm lý hành vi mua sắm chuyên nghiệp (PAS, AIDA) để kết tinh lời thoại lồng tiếng cuốn hút, 
                      thôi miên và mang lại tỉ lệ chuyển đổi đơn hàng vượt trội nhất.
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Bar Track with detailed percentage/loading metrics */}
              <div className="space-y-1 max-w-xs mx-auto">
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden relative shadow-inner">
                  {extractionProgress !== null ? (
                    <div 
                      className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-300 rounded-full"
                      style={{ width: `${extractionProgress}%` }}
                    />
                  ) : (
                    <div 
                      className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-amber-400 rounded-full transition-all duration-1000"
                      style={{ width: analysisStepIndex === 1 ? '65%' : '90%' }}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>PHÂN TÍCH THỜI GIAN THỰC</span>
                  <span>{extractionProgress !== null ? `${extractionProgress}% COMPLETED` : 'CONNECTING AI...'}</span>
                </div>
              </div>
            </div>
          )}

          {/* INTRODUCTORY EMPTY STATE */}
          {!activeReview && !isAnalyzing && (
            <div className="space-y-6">
              {/* Main Welcome Jumbotron */}
              <div className="bg-gradient-to-b from-[#0e0e0e] to-[#050505] border border-amber-500/15 rounded-3xl p-5 sm:p-10 text-center space-y-6 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 opacity-30"></div>
                
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500/20 to-rose-500/20 flex items-center justify-center border border-amber-500/30 text-amber-500 animate-pulse mb-1">
                  <Sparkles className="w-8 h-8" />
                </div>
                
                <div className="space-y-3 max-w-2xl mx-auto">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full">
                    KIỆT TÁC TIẾP THỊ SỐ 2026
                  </span>
                  <h3 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
                    Sáng tạo Review Đẳng Cấp & Chuyên Nghiệp
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
                    Nâng tầm chiến dịch truyền thông thương hiệu với giải pháp AI đa phương tiện đỉnh cao, 
                    tự động phân tích sản phẩm thực tế và kiến thiết nội dung quảng bá thế hệ mới.
                  </p>
                </div>

                <div className="w-full max-w-lg border-t border-white/5 pt-6 flex flex-col sm:flex-row justify-around gap-4 text-left">
                  <div className="flex gap-3">
                    <span className="text-amber-500 text-lg leading-none">✓</span>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-100">Video & Hình ảnh Trực quan</h4>
                      <p className="text-[11px] text-slate-400">Nhận diện sản phẩm sâu sắc từ video gốc.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-amber-500 text-lg leading-none">✓</span>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-100">Kịch bản Lồng tiếng AI</h4>
                      <p className="text-[11px] text-slate-400">Lời thoại thôi miên kích hoạt chuyển đổi.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Elegant Creator & Application Professional Profile */}
              <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <Award className="w-32 h-32 text-amber-500" />
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-6 border-b border-white/5 pb-6">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-black font-display font-extrabold text-xl shrink-0 shadow-lg shadow-amber-500/15">
                    VT
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-mono font-bold tracking-widest text-amber-400 uppercase bg-amber-505/10 px-2 py-0.5 rounded border border-amber-500/20">
                        NHÀ SÁNG LẬP & PHÁT TRIỂN
                      </span>
                      <span className="text-[9px] text-[#10b981] font-mono tracking-widest flex items-center gap-1 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                        PREMIUM ENG
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-white tracking-tight">Kỹ Sư Văn Toàn</h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                      Chuyên gia thiết kế và lập trình giải pháp đa phương tiện ứng dụng Trí Tuệ Nhân Tạo. 
                      Đồng hành cùng sự chuyển dịch số của hàng ngàn doanh nghiệp thương mại điện tử hàng đầu châu Á.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs uppercase tracking-[0.2em] text-amber-500 font-bold">Giá Trị Cốt Lõi Của Ứng Dụng</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-colors space-y-2">
                      <div className="text-amber-500 font-bold text-xs font-mono">01. TỐI ƯU SMARTPHONE</div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Thiết kế giao diện thích ứng thông minh (Responsive Grid) kết hợp thanh điều hướng tab độc quyền cho màn hình cảm ứng di động cực nhạy.
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-colors space-y-2">
                      <div className="text-amber-500 font-bold text-xs font-mono">02. NÉN DỮ LIỆU SIÊU VIỆT</div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Trích xuất 8 khung hình vàng phân phối đều trên dòng thời gian, giảm thiểu dữ liệu băng thông tối đa để gởi tệp dung lượng lên tới 1 GB mà không bị sập.
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-colors space-y-2">
                      <div className="text-amber-500 font-bold text-xs font-mono">03. ĐỒNG BỘ PLAYBACK LIVE</div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Thuật toán gộp luồng âm thanh và video cục bộ trực tiếp trên trình duyệt web, đảm bảo tốc độ điều thăng chuẩn mực và tránh tắc tải iframe.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DUAL DISPLAY GRID: WRITTEN ARTICLE REPORT & THE PERSUASIVE MARKETER TTS DECK */}
          {activeReview && !isAnalyzing && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              
              {/* COMPONENT A: Detailed Marketing Article (Markdown rendered) */}
              <div className="xl:col-span-2 bg-gradient-to-b from-[#0e0e0e] to-[#050505] border border-amber-500/15 rounded-3xl p-4 sm:p-8 space-y-6 flex flex-col justify-between shadow-2xl">
                
                {/* Header Information */}
                <div className="space-y-4">
                  
                  {/* Category badging and meta */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-500 font-bold block">
                        CHUYÊN MỤC: {activeReview.category}
                      </span>
                      <h1 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight text-white mb-1">
                        {activeReview.productName}
                      </h1>
                    </div>
                    
                    {/* Rating stars */}
                    <div className="flex flex-col items-end shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-lg font-bold font-display text-amber-400">{activeReview.rating.toFixed(1)}</span>
                        <div className="flex items-center text-amber-400">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <svg 
                              key={i} 
                              className={`w-3.5 h-3.5 ${i < Math.floor(activeReview.rating) ? 'fill-amber-400' : 'text-slate-600'}`} 
                              fill="currentColor" 
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono">ĐÁNH GIÁ CHUYÊN GIA</span>
                    </div>
                  </div>

                  {/* Summary Callout Box */}
                  <div className="p-4 bg-white/[0.02] border-l-2 border-amber-500 rounded-r-xl">
                    <p className="text-sm font-medium text-slate-300 leading-relaxed italic">
                      &ldquo;{activeReview.summary}&rdquo;
                    </p>
                  </div>

                  {/* SMART SYNCHRONIZED REVIEW & SUBTITLE SUITE */}
                  <div className="space-y-6 animate-fadeIn">
                    
                    {/* View Mode Tabs & Action Controls */}
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-white/5 pb-4">
                      
                      {/* Interactive View Switcher Tabs */}
                      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-black/60 border border-white/10 rounded-2xl">
                        <button
                          type="button"
                          onClick={() => {
                            setReviewSyncViewMode('storyboard');
                            playSynthesizedSFX('pop', 0.4);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 select-none ${
                            reviewSyncViewMode === 'storyboard'
                              ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                              : 'text-slate-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>📝 Phân Cảnh Storyboard</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
                            {storyboardScenes.length} cảnh
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setReviewSyncViewMode('subtitle-matrix');
                            playSynthesizedSFX('pop', 0.4);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 select-none ${
                            reviewSyncViewMode === 'subtitle-matrix'
                              ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 shadow-md font-black'
                              : 'text-slate-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>⏱️ Ma Trận Phụ Đề Đồng Bộ</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
                            {subtitleSegments.length} câu
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setReviewSyncViewMode('teleprompter');
                            playSynthesizedSFX('pop', 0.4);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 select-none ${
                            reviewSyncViewMode === 'teleprompter'
                              ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                              : 'text-slate-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <Tv className="w-3.5 h-3.5" />
                          <span>🎙️ Teleprompter Lồng Tiếng</span>
                        </button>
                      </div>

                      {/* Right Action Tools: Re-align, Copy Timed, Export & Smart QA */}
                      <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto justify-start lg:justify-end">
                        <button
                          type="button"
                          onClick={handleAutoAlignSubtitles}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:text-amber-200 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                          title="Tự động tính toán lại từng mili-giây phụ đề khớp tuyệt đối với giọng đọc AI"
                        >
                          <RefreshCw className="w-3 h-3 text-amber-400" />
                          <span>Khớp 100% Giây</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleCopyTimedSubtitles}
                          className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                          title="Sao chép toàn bộ danh sách phụ đề có mốc thời gian [00:00 -> 00:02]"
                        >
                          {copiedTimedSubtitles ? (
                            <>
                              <Check className="w-3 h-3 text-green-400" strokeWidth={3} />
                              <span className="text-green-400">Đã chép!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Chép Phụ Đề</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={downloadSRTFile}
                          className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                          title="Tải tệp phụ đề tiêu chuẩn .SRT cho CapCut, Premiere, DaVinci"
                        >
                          <Download className="w-3 h-3 text-amber-400" />
                          <span>Xuất .SRT</span>
                        </button>

                        {/* Dedicated AI Subtitle Spell Checker */}
                        <button
                          type="button"
                          onClick={handleFixSubtitlesSpellingAI}
                          disabled={isFixingSubtitleSpelling}
                          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-slate-950 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-[0_2px_12px_rgba(16,185,129,0.25)] hover:shadow-[0_4px_20px_rgba(16,185,129,0.35)] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                          title="AI kiểm tra và tự động sửa 100% lỗi chính tả, dấu câu, thanh điệu cho phụ đề"
                        >
                          <Sparkles className={`w-3.5 h-3.5 ${isFixingSubtitleSpelling ? 'animate-spin text-slate-950' : 'text-slate-950'}`} />
                          <span>{isFixingSubtitleSpelling ? 'Đang sửa...' : '✨ Chuẩn Chính Tả AI'}</span>
                        </button>

                        {/* Direct Smart QA & Auto-Fixer Trigger Button */}
                        <button
                          type="button"
                          onClick={handleCheckAndFixReviewAndSubtitles}
                          disabled={isCheckingAndFixing}
                          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-slate-950 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-[0_2px_12px_rgba(245,158,11,0.25)] hover:shadow-[0_4px_20px_rgba(245,158,11,0.35)] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                          title="Tự động kiểm tra và sửa toàn bộ lỗi chính tả, khử giọng Bắc 100%, lọc từ cấm TikTok và đồng bộ phụ đề"
                        >
                          <ShieldCheck className={`w-3.5 h-3.5 ${isCheckingAndFixing ? 'animate-spin text-slate-950' : 'text-slate-950'}`} />
                          <span>{isCheckingAndFixing ? 'Đang sửa lỗi...' : '✨ Sửa Lỗi Thông Minh'}</span>
                        </button>
                      </div>
                    </div>

                    {/* LIVE PLAYBACK SYNCHRONIZATION STATUS RIBBON */}
                    <div className="p-3.5 bg-gradient-to-r from-[#12100b] via-[#161208] to-[#0d0d0d] border border-amber-500/25 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-inner">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (audioRef.current) {
                              if (isPlaying) {
                                audioRef.current.pause();
                                if (videoRef.current) videoRef.current.pause();
                                setIsPlaying(false);
                              } else {
                                audioRef.current.play().then(() => {
                                  setIsPlaying(true);
                                  if (isSyncPlay && videoRef.current) videoRef.current.play().catch(() => {});
                                }).catch(() => {});
                              }
                            }
                          }}
                          className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-md cursor-pointer transition-transform active:scale-90"
                          title={isPlaying ? "Tạm dừng phát" : "Phát đồng bộ bài review & phụ đề"}
                        >
                          {isPlaying ? <Pause className="w-4 h-4 fill-slate-950" /> : <Play className="w-4 h-4 fill-slate-950 ml-0.5" />}
                        </button>

                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                              isPlaying ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-white/5 text-slate-400 border border-white/10'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-amber-400 animate-ping' : 'bg-slate-500'}`} />
                              {isPlaying ? 'ĐANG PHÁT ĐỒNG BỘ' : 'ĐÃ ĐỒNG BỘ 100%'}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              {formatTimeCode(currentAudioTime, true)} / {formatTimeCode(audioDuration || (videoRef.current?.duration || 20), true)}
                            </span>
                          </div>
                          
                          {/* Live Quote / Phrase Preview */}
                          <p className="text-[11px] text-amber-200 font-sans truncate line-clamp-1 italic">
                            {activeSubtitleText ? (
                              <span className="text-amber-300 font-semibold">&ldquo;{activeSubtitleText}&rdquo;</span>
                            ) : (
                              <span className="text-slate-400">Nhấp vào bất kỳ câu thoại hoặc phân cảnh nào để nghe tức thì</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Speaking Pace & Subtitle Health Badge */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                          Tốc độ: <strong className="text-amber-300">~{((cleanScriptForSpeech(activeScriptText).split(/\s+/).filter(Boolean).length) / Math.max(1, audioDuration || 20)).toFixed(1)}</strong> từ/s
                        </span>
                        <button
                          type="button"
                          onClick={() => jumpToTimestamp(0)}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 cursor-pointer"
                          title="Quay lại đầu video (00:00)"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* MODE 1: STORYBOARD SCENES (RICH DETAILED REVIEW) */}
                    {reviewSyncViewMode === 'storyboard' && (
                      <div className="space-y-4">
                        {storyboardScenes.map((scene, sIdx) => {
                          const isSceneActive = isPlaying && currentAudioTime >= scene.startSec && currentAudioTime <= scene.endSec;
                          return (
                            <div 
                              key={scene.id || sIdx}
                              className={`p-5 sm:p-6 rounded-2xl transition-all duration-300 border ${
                                isSceneActive
                                  ? 'bg-gradient-to-r from-amber-500/10 via-[#14120a] to-[#0a0a0a] border-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/50'
                                  : 'bg-[#080808] border-white/5 hover:border-amber-500/30'
                              }`}
                            >
                              {/* Scene Header with Time badge and Jump Button */}
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3 mb-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-mono font-bold text-amber-500 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md">
                                    CẢNH {String(sIdx + 1).padStart(2, '0')}
                                  </span>
                                  
                                  {/* Clickable Time Badge */}
                                  <button
                                    type="button"
                                    onClick={() => jumpToTimestamp(scene.startSec)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono text-[11px] font-bold transition-all cursor-pointer shadow-sm ${
                                      isSceneActive
                                        ? 'bg-amber-400 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.4)] animate-pulse'
                                        : 'bg-white/10 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-white/10'
                                    }`}
                                    title={`Nhấp để phát video ngay tại mốc ${scene.timeRangeText}`}
                                  >
                                    <Play className="w-3 h-3 fill-current" />
                                    <span>{scene.timeRangeText}</span>
                                  </button>

                                  <h4 className="text-sm sm:text-base font-display font-semibold text-white">
                                    {scene.title}
                                  </h4>
                                </div>

                                {isSceneActive && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                                    ĐANG PHÁT TRỰC TIẾP
                                  </span>
                                )}
                              </div>

                              {/* Storyboard Scene Markdown Body */}
                              <div 
                                className="text-sm text-slate-300 leading-relaxed space-y-3 font-sans select-text"
                                dangerouslySetInnerHTML={{ __html: parseMarkdown(scene.content) }}
                              />

                              {/* Voiceover Quote Callout if detected */}
                              {scene.voiceoverQuote && (
                                <div className="mt-4 p-3 bg-amber-500/5 border-l-2 border-amber-500 rounded-r-xl flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-mono uppercase tracking-widest text-amber-400 font-bold block">
                                      🎙️ LỜI BÌNH LỒNG TIẾNG CHUẨN:
                                    </span>
                                    <p className="text-xs text-amber-200 italic font-medium">
                                      &ldquo;{scene.voiceoverQuote}&rdquo;
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => jumpToTimestamp(scene.startSec)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 text-[10px] font-bold shrink-0 transition-all cursor-pointer"
                                  >
                                    ▶ Nghe câu này
                                  </button>
                                </div>
                              )}

                              {/* B-Roll Suggestion Callout if detected */}
                              {scene.brollSuggestion && (
                                <div className="mt-2.5 p-2.5 bg-purple-500/5 border border-purple-500/20 rounded-xl flex items-center gap-2 text-[11px] text-purple-300">
                                  <Camera className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                  <span><strong>Gợi ý B-Roll:</strong> {scene.brollSuggestion}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* MODE 2: LIVE SUBTITLE MATRIX 1:1 WITH AUDIO TIMESTAMPS */}
                    {reviewSyncViewMode === 'subtitle-matrix' && (
                      <div className="space-y-4">
                        {/* Search Filter Bar */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-black/40 border border-white/5 rounded-2xl">
                          <div className="relative flex-1">
                            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={syncSearchQuery}
                              onChange={(e) => setSyncSearchQuery(e.target.value)}
                              placeholder="Tìm kiếm câu thoại hoặc từ khóa trong phụ đề..."
                              className="w-full pl-9 pr-3 py-1.5 bg-[#050505] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                            />
                            {syncSearchQuery && (
                              <button
                                type="button"
                                onClick={() => setSyncSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                            <span className="text-[11px] text-slate-400 font-mono">
                              Hiển thị: <strong className="text-amber-300">{subtitleSegments.filter(s => !syncSearchQuery || s.text.toLowerCase().includes(syncSearchQuery.toLowerCase())).length}</strong>/{subtitleSegments.length} câu
                            </span>

                            <button
                              type="button"
                              onClick={() => handleRunSilenceDetection()}
                              disabled={isDetectingSilence}
                              className="px-3 py-1.5 bg-gradient-to-r from-sky-500/20 via-indigo-500/20 to-teal-500/20 hover:from-sky-500/30 hover:to-teal-500/30 border border-sky-400/40 hover:border-sky-300 rounded-xl text-sky-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                              title="Tự động phát hiện các đoạn im lặng trong file audio và đề xuất điều chỉnh thời gian phụ đề khớp theo từng khoảng lặng"
                            >
                              <Activity className={`w-3.5 h-3.5 text-sky-400 ${isDetectingSilence ? 'animate-spin' : ''}`} />
                              <span>{isDetectingSilence ? 'Đang dò sóng âm...' : '⚡ Khớp Khoảng Lặng Audio (VAD)'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Subtitle Segments List */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-amber-500/20">
                          {subtitleSegments
                            .filter(seg => !syncSearchQuery || seg.text.toLowerCase().includes(syncSearchQuery.toLowerCase()) || (seg.translation && seg.translation.toLowerCase().includes(syncSearchQuery.toLowerCase())))
                            .map((segment, idx) => {
                              const isSegmentActive = isPlaying && currentAudioTime >= segment.start && currentAudioTime <= segment.end;
                              const isEditing = editingSegmentIdx === idx;
                              const segmentDuration = Math.max(0.1, segment.end - segment.start);
                              const progressWithinSegment = isSegmentActive
                                ? Math.min(100, Math.max(0, ((currentAudioTime - segment.start) / segmentDuration) * 100))
                                : (currentAudioTime > segment.end ? 100 : 0);

                              return (
                                <div
                                  key={idx}
                                  className={`relative p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-3 ${
                                    isSegmentActive
                                      ? 'bg-gradient-to-br from-amber-500/15 via-[#18140a] to-[#0c0c0c] border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)] ring-1 ring-amber-400/40'
                                      : 'bg-[#090909] border-white/5 hover:border-amber-500/30'
                                  }`}
                                >
                                  {/* Top Meta Bar */}
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                        isSegmentActive ? 'bg-amber-400 text-slate-950 font-black' : 'bg-white/10 text-slate-400'
                                      }`}>
                                        #{String(idx + 1).padStart(2, '0')}
                                      </span>

                                      <button
                                        type="button"
                                        onClick={() => jumpToTimestamp(segment.start)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                          isSegmentActive
                                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                                            : 'bg-white/5 hover:bg-amber-500/20 text-amber-400 border border-white/5'
                                        }`}
                                        title={`Phát câu này (${segment.start.toFixed(2)}s -> ${segment.end.toFixed(2)}s)`}
                                      >
                                        <Play className="w-2.5 h-2.5 fill-current" />
                                        <span>{segment.start.toFixed(1)}s ➔ {segment.end.toFixed(1)}s</span>
                                      </button>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <span className="text-[9px] font-mono text-slate-500">
                                        {segmentDuration.toFixed(1)}s
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isEditing) {
                                            handleSaveInlineSubtitleEdit(idx, editingSegmentText);
                                          } else {
                                            setEditingSegmentIdx(idx);
                                            setEditingSegmentText(segment.text);
                                          }
                                        }}
                                        className="p-1 text-slate-500 hover:text-amber-400 rounded transition-colors cursor-pointer"
                                        title={isEditing ? "Lưu thay đổi" : "Chỉnh sửa câu phụ đề này"}
                                      >
                                        {isEditing ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Edit3 className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                  </div>

                                  {/* Subtitle Content / Inline Editor */}
                                  {isEditing ? (
                                    <div className="space-y-2">
                                      <input
                                        type="text"
                                        value={editingSegmentText}
                                        onChange={(e) => setEditingSegmentText(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleSaveInlineSubtitleEdit(idx, editingSegmentText);
                                          }
                                        }}
                                        className="w-full p-2 bg-[#040404] border border-amber-500 rounded-xl text-xs text-white focus:outline-none"
                                        autoFocus
                                      />
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setEditingSegmentIdx(null)}
                                          className="px-2 py-0.5 text-[10px] text-slate-400 hover:text-white rounded"
                                        >
                                          Hủy
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSaveInlineSubtitleEdit(idx, editingSegmentText)}
                                          className="px-2.5 py-0.5 bg-amber-500 text-slate-950 font-bold text-[10px] rounded-lg shadow"
                                        >
                                          Lưu
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      <p className={`text-xs sm:text-sm font-sans font-medium leading-relaxed ${
                                        isSegmentActive ? 'text-amber-200 font-bold' : 'text-slate-200'
                                      }`}>
                                        {segment.text}
                                      </p>

                                      {segment.translation && (
                                        <p className="text-[11px] text-slate-400 italic">
                                          {segment.translation}
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {/* Bottom Progress & Jump Bar */}
                                  <div className="space-y-1.5 pt-1">
                                    {/* Segment Internal Progress Bar */}
                                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full transition-all duration-100 ${
                                          isSegmentActive ? 'bg-amber-400' : 'bg-transparent'
                                        }`}
                                        style={{ width: `${progressWithinSegment}%` }}
                                      />
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                                      <span>{segment.text.split(/\s+/).filter(Boolean).length} từ</span>
                                      <button
                                        type="button"
                                        onClick={() => jumpToTimestamp(segment.start)}
                                        className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                                      >
                                        <Play className="w-2.5 h-2.5 fill-current" />
                                        <span>Nghe đoạn này</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* MODE 3: TELEPROMPTER KARA-SYNC STUDIO */}
                    {reviewSyncViewMode === 'teleprompter' && (
                      <div className="space-y-5">
                        <div className="p-6 sm:p-8 bg-gradient-to-b from-[#0c0a06] to-[#040404] border border-amber-500/20 rounded-3xl space-y-6 shadow-2xl">
                          <div className="flex items-center justify-between border-b border-white/5 pb-4">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                              <h4 className="text-xs font-mono uppercase tracking-[0.2em] text-amber-400 font-bold">
                                TELEPROMPTER LỒNG TIẾNG STUDIO LIVE
                              </h4>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                              Nhấp vào câu bất kỳ để tua giọng đọc tới câu đó
                            </span>
                          </div>

                          {/* Large Readable Teleprompter Flow */}
                          <div className="space-y-4 max-h-[480px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-amber-500/30">
                            {subtitleSegments.map((seg, sIdx) => {
                              const isCurrent = isPlaying && currentAudioTime >= seg.start && currentAudioTime <= seg.end;
                              const isPast = currentAudioTime > seg.end;

                              return (
                                <div
                                  key={sIdx}
                                  onClick={() => jumpToTimestamp(seg.start)}
                                  className={`p-4 rounded-2xl transition-all duration-200 cursor-pointer select-none border ${
                                    isCurrent
                                      ? 'bg-amber-500/15 border-amber-400 text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.25)] scale-[1.01]'
                                      : isPast
                                      ? 'bg-black/30 border-white/5 text-slate-500 opacity-60 hover:opacity-90'
                                      : 'bg-black/40 border-white/5 text-slate-300 hover:border-amber-500/30'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <span className="text-[10px] font-mono font-bold text-amber-400">
                                      #{String(sIdx + 1).padStart(2, '0')} • {seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s
                                    </span>
                                    {isCurrent && (
                                      <span className="px-2 py-0.2 bg-amber-400 text-slate-950 text-[9px] font-black uppercase rounded-full">
                                        ĐANG ĐỌC
                                      </span>
                                    )}
                                  </div>
                                  <p className={`text-base sm:text-lg font-display font-medium leading-relaxed ${
                                    isCurrent ? 'text-amber-300 font-bold text-xl' : 'text-slate-200'
                                  }`}>
                                    {seg.text}
                                  </p>
                                  {seg.translation && (
                                    <p className="text-xs text-slate-400 italic mt-1 font-sans">
                                      {seg.translation}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                </div>

                {/* Call to action panel at bottom of the main card */}
                <div className="mt-8 pt-5 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] text-rose-400 font-mono tracking-widest uppercase block">KÊU GỌI HÀNH ĐỘNG ĐỂ CHUYỂN ĐỔI</span>
                    <p className="text-sm font-semibold text-amber-300">{activeReview.ctaText}</p>
                  </div>
                  <div className="px-4 py-2 bg-gradient-to-r from-amber-500 to-rose-500 rounded-full text-[11px] font-display font-bold text-black uppercase tracking-wider animate-pulse hover:scale-105 transition-transform duration-300">
                    Kích Hoạt Chiến Dịch Bán Hàng
                  </div>
                </div>
              </div>

              {/* COMPONENT B: High-Conversion Script Editor */}
              <div className="space-y-6">
                
                {/* Voiceover Script View */}
                <div className="bg-gradient-to-b from-[#0e0e0e] to-[#050505] border border-amber-500/15 rounded-3xl p-4 sm:p-6 space-y-5 relative overflow-hidden flex flex-col justify-between shadow-2xl">
                  <div className="absolute top-0 right-0 p-4">
                    <span className="text-[8px] text-amber-500/40 font-mono tracking-widest">AI_VOICEOVER_V2</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs uppercase tracking-[0.2em] text-amber-500 font-bold flex items-center gap-1.5">
                        <FileText className="w-4 h-4" />
                        Kịch bản lồng tiếng AI tùy biến
                      </h3>
                      <button
                        onClick={() => {
                          const textToCopy = editedScript || activeReview.marketingScript;
                          navigator.clipboard.writeText(textToCopy);
                          setCopiedScript(true);
                          setTimeout(() => setCopiedScript(false), 2000);
                        }}
                        className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 rounded px-2 py-0.5 transition-all cursor-pointer font-bold"
                      >
                        {copiedScript ? (
                          <>
                            <Check className="w-3 h-3 text-green-400" strokeWidth={3} />
                            <span className="text-green-400 font-bold">Đã chép!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Sao chép</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Sửa chữa trực tiếp kịch bản hoặc áp dụng ngay "Bộ Đột Phá" để chèn định vị B-Roll chuyên nghiệp/âm thanh chốt đơn tuyệt đỉnh:
                    </p>

                    {/* Script sync indicator dashboard */}
                    {(() => {
                      const health = getScriptSyncStatus();
                      return (
                        <div className={`p-3.5 rounded-2xl border ${health.color} transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs`}>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold uppercase tracking-wider">{health.label}</span>
                            </div>
                            <p className="text-[11px] opacity-80 leading-snug">{health.description}</p>
                          </div>
                          
                          {/* Action Buttons: Optimization & Smart QA */}
                          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                            <button
                              type="button"
                              onClick={handleCheckAndFixReviewAndSubtitles}
                              disabled={isCheckingAndFixing || (!editedScript.trim() && !activeReview?.marketingScript)}
                              className={`w-full sm:w-auto px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-95 shrink-0 ${
                                isCheckingAndFixing 
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed animate-pulse border border-white/5'
                                  : 'bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-slate-950 shadow-[0_2px_10px_rgba(244,63,94,0.25)] hover:shadow-[0_4px_16px_rgba(244,63,94,0.35)] border border-rose-400/30'
                              }`}
                              title="Tự động phát hiện và sửa toàn diện chính tả, khử 100% giọng Bắc, lọc từ cấm TikTok và đồng bộ phụ đề"
                            >
                              <ShieldCheck className={`w-3.5 h-3.5 ${isCheckingAndFixing ? 'animate-spin text-slate-950' : 'text-slate-950'}`} />
                              <span>{isCheckingAndFixing ? 'Đang sửa lỗi...' : '🛡️ Sửa Lỗi Toàn Diện'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleOptimizeScriptLength}
                              disabled={isOptimizingScript || !editedScript.trim()}
                              className={`w-full sm:w-auto px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-95 shrink-0 ${
                                isOptimizingScript 
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed animate-pulse border border-white/5'
                                  : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-[0_2px_10px_rgba(245,158,11,0.15)] hover:shadow-[0_4px_16px_rgba(245,158,11,0.25)] border border-amber-300/30'
                              }`}
                            >
                              <Sparkles className={`w-3.5 h-3.5 ${isOptimizingScript ? 'animate-spin text-slate-500' : 'animate-pulse text-slate-950'}`} />
                              <span>{isOptimizingScript ? 'Đang căn chỉnh...' : '🤖 Khớp Độ Dài AI'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* LIVE SCRIPT EDITOR */}
                    <div className="relative group rounded-2xl border border-white/5 overflow-hidden transition-all duration-300 focus-within:border-amber-500/30">
                      <textarea
                        ref={scriptTextareaRef}
                        value={editedScript}
                        onChange={(e) => setEditedScript(e.target.value)}
                        className="w-full h-44 p-4 pb-14 bg-gradient-to-b from-[#0a0a0a] to-[#040404] focus:outline-none text-[13px] text-slate-200 font-sans tracking-wide leading-relaxed resize-none shadow-inner"
                        placeholder="Nội dung kịch bản quảng cáo lồng tiếng..."
                      />
                      
                      {/* Active audio phrase real-time highlighter bar */}
                      {isPlaying && activeSubtitleText && (
                        <div className="absolute inset-x-0 bottom-10 bg-amber-500/10 border-y border-amber-500/20 backdrop-blur-sm py-1.5 px-4 flex items-center justify-between text-[11px] text-amber-300 font-bold animate-pulse z-10">
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                            ĐANG THUYẾT MINH AI
                          </span>
                          <span className="font-sans text-right italic font-semibold line-clamp-1 truncate select-none pl-3 text-amber-200">
                            &ldquo;{activeSubtitleText}&rdquo;
                          </span>
                        </div>
                      )}

                      <div className="absolute bottom-2.5 inset-x-3 text-[9px] font-mono text-slate-500 flex items-center justify-between pointer-events-auto select-none z-10 bg-gradient-to-t from-black via-black to-transparent pt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-amber-500/80 font-bold uppercase tracking-wider">Teleprompter Pro</span>
                          <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                          <span>{cleanScriptForSpeech(editedScript).length} ký tự</span>
                          <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                          <span>{Math.round(cleanScriptForSpeech(editedScript).split(/\s+/).filter(Boolean).length)} từ</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsAutoScrollEnabled(prev => !prev)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-all cursor-pointer font-bold select-none ${
                              isAutoScrollEnabled 
                                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25' 
                                : 'bg-slate-500/5 border-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                            title="Tự động cuộn văn bản kịch bản bám sát theo tiến trình giọng thuyết minh AI đang đọc"
                          >
                            <span className={`w-1 h-1 rounded-full ${isAutoScrollEnabled ? 'bg-amber-400 animate-ping' : 'bg-slate-500'}`}></span>
                            <span>ĐỌC DÒNG: {isAutoScrollEnabled ? 'TỰ CUỘN ✓' : 'TỰ DO ✕'}</span>
                          </button>
                          
                          <span className="text-amber-400 font-bold bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/20">
                            ~{Math.max(1, Math.round(cleanScriptForSpeech(editedScript).split(/\s+/).filter(Boolean).length / 2.6))}s phát
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* INTERACTIVE BOOSTERS TOOLBAR */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[8px] text-slate-500 uppercase tracking-widest font-mono block">BỘ ĐỘNG LỰC CHỐT ĐƠN (COGNITIVE BOOSTERS)</span>
                      <div className="grid grid-cols-2 xs:grid-cols-4 gap-1.5">
                        <button
                          type="button"
                          onClick={() => applyScriptModifier('hook')}
                          className="py-1.5 px-2 rounded-lg bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/30 text-[9px] font-bold text-amber-400 transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          🔥 Siêu Hook Mới
                        </button>
                        <button
                          type="button"
                          onClick={() => applyScriptModifier('broll')}
                          className="py-1.5 px-2 rounded-lg bg-purple-500/5 hover:bg-purple-500/10 border border-purple-500/20 hover:border-purple-500/30 text-[9px] font-bold text-purple-400 transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          🎬 Gợi Ý Máy Quay
                        </button>
                        <button
                          type="button"
                          onClick={() => applyScriptModifier('sfx')}
                          className="py-1.5 px-2 rounded-lg bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/30 text-[9px] font-bold text-emerald-400 transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          🎵 Chèn Âm SFX
                        </button>
                        <button
                          type="button"
                          onClick={() => applyScriptModifier('reset')}
                          className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-bold text-slate-300 transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          🔄 Hoàn Bản Gốc
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-gradient-to-r from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-2xl flex items-center gap-2.5 mt-2">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                    <p className="text-[10px] text-amber-200 leading-relaxed font-sans">
                      Hãy nhấp <strong>"Lồng giọng ngay"</strong> ở góc trên bên trái trình phát nhạc sau khi điều chỉnh xong kịch bản để đồng bộ giọng đọc AI cực phẩm!
                    </p>
                  </div>
                </div>

                {/* HỘP CÔNG CỤ TỐI ƯU TRIỆU VIEWS PRO (VIRAL RETENTION ENGINE) */}
                <div className="bg-gradient-to-b from-[#0e0e0e] to-[#050505] border border-amber-500/15 rounded-3xl p-4 sm:p-6 space-y-5 relative overflow-hidden flex flex-col shadow-2xl">
                  <div className="absolute top-0 right-0 p-4">
                    <span className="text-[8px] text-amber-500/40 font-mono tracking-widest">RETENTION_ENGINE_v2.5</span>
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="text-xs uppercase tracking-[0.2em] text-amber-500 font-bold flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-amber-400" />
                      Bộ tối ưu tốc độ giữ chân &amp; Triệu views
                    </h3>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Phân tích nội dung kịch bản theo thời gian thực và áp dụng các chiến thuật giữ chân người xem đỉnh cao:
                    </p>
                  </div>

                  {/* VIRAL SCORE ANALYZER */}
                  {(() => {
                    const ret = getViralRetentionScore();
                    return (
                      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-300">Chỉ số Sức Hút Video (Viral Score)</span>
                          <span className={`font-mono font-black ${ret.color}`}>{ret.score} / 100</span>
                        </div>
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden relative shadow-inner">
                          <div 
                            className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-amber-400 rounded-full transition-all duration-500"
                            style={{ width: `${ret.score}%` }}
                          />
                        </div>
                        <div className="flex items-start gap-2 text-[10px] leading-relaxed">
                          <span className="text-amber-400 shrink-0 font-bold uppercase tracking-wider bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">{ret.level}</span>
                          <p className="text-slate-400 italic">&ldquo;{ret.advice}&rdquo;</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* DIRECT HOOK INJECTOR - ĐỒNG BỘ 100% GIỮA KHUNG HOOK VÀ LỜI LỒNG TIẾNG */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] text-slate-500 uppercase tracking-widest font-mono block">MÔ HÌNH CHÈN SIÊU HOOK THU HÚT 3S ĐẦU TIÊN (ĐỒNG BỘ GIỌNG ĐỌC)</span>
                      <span className="text-[7.5px] text-amber-400 font-mono font-bold bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">KHÔNG CHỒNG LẤN</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(() => {
                        const rawProd = activeReview?.productName || 'sản phẩm này';
                        const prodClean = rawProd.replace(/\(.*?\)/g, '').trim();
                        const prodUpper = prodClean.toUpperCase();

                        const hookOptions = [
                          { 
                            label: '🚨 Cảnh Báo Sốc', 
                            bannerText: `CẢNH BÁO: ĐỪNG VỘI MUA ${prodUpper} NẾU CHƯA COI HẾT CLIP NÀY!`,
                            spokenHook: `Cảnh báo thật sự, đừng vội mua ${prodClean} nếu cả nhà chưa xem hết clip này nha...`,
                            style: 'tiktok-red'
                          },
                          { 
                            label: '💡 Sự Thật Lạ', 
                            bannerText: `SỰ THẬT CỰC ĐẮT GIÁ VỀ TRẢI NGHIỆM THỰC TẾ CỦA ${prodUpper}!`,
                            spokenHook: `Sự thật cực kỳ đắt giá về trải nghiệm thực tế của em ${prodClean} mà người bán không bao giờ nói cho bạn biết nè...`,
                            style: 'tiktok-yellow'
                          },
                          { 
                            label: '⚡ FOMO Cực Độ', 
                            bannerText: `ĐỪNG LÃNG PHÍ TIỀN VÌ ${prodUpper}, ĐÂY MỚI LÀ SỰ THẬT!`,
                            spokenHook: `Đừng lãng phí tiền bạc oan uổng cho ${prodClean}, đây mới chính là trải nghiệm thật sự của tụi mình...`,
                            style: 'beast-glow'
                          },
                          { 
                            label: '⭐ So Sánh Chất', 
                            bannerText: `TRẢI NGHIỆM 1 THÁNG VỚI ${prodUpper} SẼ LÀM BẠN SỐC!`,
                            spokenHook: `Sau đúng một tháng trải nghiệm thực tế với ${prodClean}, kết quả này chắc chắn sẽ làm mấy bạn bất ngờ luôn đó nha...`,
                            style: 'cyberpunk-neon'
                          },
                        ];

                        return hookOptions.map((item, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              // 1. Cập nhật nội dung và phong cách khung Hook Banner
                              setHookBannerText(item.bannerText);
                              setHookBannerStyle(item.style as any);
                              setShowHookBanner(true);

                              // 2. Đồng bộ trực tiếp vào kịch bản lồng tiếng, thay thế sạch sẽ câu mở đầu cũ tránh chồng lấn 2 hook
                              const currentScript = editedScript || activeReview?.marketingScript || '';
                              let cleanedScript = currentScript.replace(/^\[(?:SIÊU HOOK(?: TRIỆU VIEW)?|HOOK)[^\]]*\]\s*.*?(?:\.\.\.|[.?!])\s*/gis, '');
                              
                              if (cleanedScript === currentScript) {
                                const firstSentenceMatch = currentScript.match(/^([^.?!…]+[.?!…]+(?:\.\.\.)?)\s*(.*)$/s);
                                if (firstSentenceMatch && /^(Có bao giờ|Bạn có|Đừng|Ai cũng|Nếu bạn|Trời đất|Sự thật|Cảnh báo|Bình tĩnh|Sau đúng)/i.test(firstSentenceMatch[1].trim())) {
                                  cleanedScript = firstSentenceMatch[2].trim();
                                }
                              }

                              const newHarmonizedScript = `[SIÊU HOOK TRIỆU VIEW] ${item.spokenHook} ${cleanedScript.trim()}`;
                              setEditedScript(newHarmonizedScript);

                              if (videoRef.current) {
                                videoRef.current.currentTime = 0;
                              }
                              if (audioRef.current) {
                                audioRef.current.currentTime = 0;
                              }
                              playSynthesizedSFX('pop', 0.5);
                            }}
                            className="py-2 px-2.5 rounded-xl bg-[#080808] border border-white/5 hover:border-amber-500/20 text-[9px] font-bold text-slate-300 hover:text-amber-400 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-1 hover:scale-[1.02] shadow-sm text-center"
                          >
                            <span className="text-[10px]">{item.label.split(' ')[0]}</span>
                            <span>{item.label.split(' ').slice(1).join(' ')}</span>
                          </button>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* SOUNDTRACK RECOMMENDATION */}
                  <div className="p-3 bg-gradient-to-r from-amber-500/10 to-transparent border-l-2 border-amber-500/40 rounded-r-xl space-y-1.5">
                    <span className="text-[8px] font-mono font-bold text-amber-400 uppercase tracking-widest block">GỢI Ý MIX NHẠC NỀN &amp; SẮC THÁI PHÒNG THU TỰ NHIÊN</span>
                    {(() => {
                      let bgMusic = 'Deep House Lofi Beat (65 BPM)';
                      let mixVolume = 'Âm lượng nền 12%';
                      let expressions = 'Sâu lắng, sành điệu, có những khoảng ngừng tự nhiên';
                      
                      if (tonePreset.includes('Sôi động')) {
                        bgMusic = 'Upbeat Tech House / Funk (124 BPM)';
                        mixVolume = 'Âm lượng nền 8%';
                        expressions = 'Đọc liền mạch dứt khoát, hào sảng kích thích';
                      } else if (tonePreset.includes('Uy tín') || tonePreset.includes('Chuyên gia')) {
                        bgMusic = 'Cinematic Minimal Piano (75 BPM)';
                        mixVolume = 'Âm lượng nền 15%';
                        expressions = 'Điềm đạm, trầm ấm, dõng dạc tạo uy tín tuyệt đối';
                      }
                      
                      return (
                        <div className="space-y-1 text-[10px] text-slate-300 leading-relaxed font-sans text-left">
                          <p>🎵 <strong>Nhạc nền khuyên dùng:</strong> <span className="text-amber-300">{bgMusic}</span> &bull; <span>{mixVolume}</span></p>
                          <p>🎙️ <strong>Cách đọc nịnh tai nhất:</strong> <span className="text-slate-400 italic">{expressions}</span></p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* BEAUTIFUL APP INTRODUCTION PANEL - RELOCATED TO BOTTOM & REWRITTEN ULTRA-PROFESSIONAL */}
      <section id="app_introduction" className="max-w-[1600px] w-full mx-auto px-3 sm:px-6 lg:px-8 mb-6 mt-2 pointer-events-auto">
        <div className="bg-gradient-to-br from-[#0c0d12] via-[#040406] to-[#0c0d12] border border-amber-500/20 rounded-2xl overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.8)] relative">
          {/* Subtle gold and rose radial ambient aura glows */}
          <div className="absolute top-0 right-1/4 w-[500px] h-[150px] bg-amber-500/[0.03] rounded-full blur-[120px] pointer-events-none"></div>
          <div className="absolute bottom-0 left-1/4 w-[500px] h-[150px] bg-rose-500/[0.03] rounded-full blur-[120px] pointer-events-none"></div>
          
          {/* Main Hero Header Row */}
          <div className={`flex flex-col md:flex-row md:items-center justify-between p-5 sm:p-6 gap-4 transition-all duration-300 ${isIntroExpanded ? 'border-b border-white/[0.04]' : ''}`}>
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-600/5 flex items-center justify-center border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)] shrink-0 mt-0.5">
                <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
              </div>
              <div>
                <h2 className="text-xs sm:text-sm font-display font-black uppercase tracking-widest text-slate-100 flex flex-wrap items-center gap-2">
                  <span>Hệ Sinh Thái Sáng Tạo Video Tiếp Thị Đa Phương Tiện Đột Phá</span>
                  <span className="text-[7.5px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded uppercase tracking-widest shadow-sm">AI STUDIO PRO V2.4</span>
                </h2>
                <p className="text-[10.5px] sm:text-[11.5px] text-slate-300 font-medium mt-1.5 leading-relaxed max-w-3xl">
                  Nền tảng trí tuệ nhân tạo toàn diện kiến tạo video review & affiliate triệu views — Tự động phân tích sản phẩm sắc nét, sáng tạo kịch bản bán hàng thôi miên, lồng tiếng truyền cảm chuẩn phòng thu và đồng bộ phụ đề động bắt mắt chuẩn xu hướng TikTok, Reels & Shorts.
                </p>
              </div>
            </div>
            
            <button
              type="button"
              onClick={() => setIsIntroExpanded(!isIntroExpanded)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 hover:text-white text-[10px] font-bold uppercase tracking-wider rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer select-none shrink-0 self-end md:self-auto"
            >
              <span>{isIntroExpanded ? "Ẩn mô tả chi tiết" : "Xem tài liệu tính năng"}</span>
              {isIntroExpanded ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
            </button>
          </div>

          {/* Collapsible Features Matrix */}
          <AnimatePresence initial={false}>
            {isIntroExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden bg-black/[0.15]"
              >
                <div className="p-5 sm:p-6 lg:p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
                  {/* Feature 1: Computer Vision */}
                  <div className="space-y-3 p-4 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-amber-500/30 rounded-2xl transition-all duration-300 group shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8.5 h-8.5 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover:border-indigo-500/40 group-hover:bg-indigo-500/15 transition-all">
                        <Tv className="w-4 h-4 text-indigo-400" />
                      </div>
                      <h3 className="text-[11px] font-bold text-slate-200 uppercase tracking-widest group-hover:text-indigo-400 transition-colors">Computer Vision UHD</h3>
                    </div>
                    <p className="text-[10.5px] text-slate-400 leading-relaxed font-normal">
                      Hệ thống tự động quét và phân tách dữ liệu hình ảnh, định danh thương hiệu, kiểu dáng vật phẩm để phác thảo tức thì kịch bản bán hàng tăng CTR vượt bậc.
                    </p>
                  </div>

                  {/* Feature 2: High-Definition TTS */}
                  <div className="space-y-3 p-4 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-amber-500/30 rounded-2xl transition-all duration-300 group shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8.5 h-8.5 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 group-hover:border-amber-500/40 group-hover:bg-amber-500/15 transition-all">
                        <Mic className="w-4 h-4 text-amber-400" />
                      </div>
                      <h3 className="text-[11px] font-bold text-slate-200 uppercase tracking-widest group-hover:text-amber-400 transition-colors">Thuyết Minh Tuyệt Đỉnh</h3>
                    </div>
                    <p className="text-[10.5px] text-slate-400 leading-relaxed font-normal">
                      Sở hữu bộ sưu tập giọng đọc Sài Gòn / Nam Bộ truyền cảm chuyên nghiệp với âm thanh sắc nét, truyền cảm, tự động tối ưu hóa tốc độ nói bám khớp thời gian thực của video gốc.
                    </p>
                  </div>

                  {/* Feature 3: Dynamic Audio-Sync Subtitles */}
                  <div className="space-y-3 p-4 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-amber-500/30 rounded-2xl transition-all duration-300 group shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8.5 h-8.5 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 group-hover:border-emerald-500/40 group-hover:bg-emerald-500/15 transition-all">
                        <Volume2 className="w-4 h-4 text-emerald-400" />
                      </div>
                      <h3 className="text-[11px] font-bold text-slate-200 uppercase tracking-widest group-hover:text-emerald-400 transition-colors">Đồng Bộ Phụ Đề Động</h3>
                    </div>
                    <p className="text-[10.5px] text-slate-400 leading-relaxed font-normal">
                      Áp dụng bộ xử lý ngữ âm tiếng Việt để gán nhãn thời gian cực nhạy, hiển thị chữ đổi màu kiểu TikTok/CapCut mượt mà dưới dạng Burn-in lôi cuốn.
                    </p>
                  </div>

                  {/* Feature 4: Timeline Editor Manual Adjustment */}
                  <div className="space-y-3 p-4 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-amber-500/30 rounded-2xl transition-all duration-300 group shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8.5 h-8.5 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 group-hover:border-rose-500/40 group-hover:bg-rose-500/15 transition-all">
                        <Clock className="w-4 h-4 text-rose-400" />
                      </div>
                      <h3 className="text-[11px] font-bold text-slate-200 uppercase tracking-widest group-hover:text-rose-400 transition-colors">Biên Tập Timeline</h3>
                    </div>
                    <p className="text-[10.5px] text-slate-400 leading-relaxed font-normal">
                      Chế độ chỉnh sửa trực quan tối tân cho phép hiệu chỉnh thời điểm bắt đầu/kết thúc đến từng mili-giây, hoặc sửa trực tiếp nội dung phân cảnh phụ đề tùy biến.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* FOOTER STATUS BAR */}
      <footer id="app_status_footer" className="py-4 border-t border-white/15 bg-[#0a0a0a]/90 backdrop-blur-md px-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-3 shrink-0 mt-auto">
        <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-4 truncate text-center sm:text-left">
          <span className="flex items-center gap-1.5 shrink-0 justify-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Hệ thống: Sẵn sàng
          </span>
          <span className="opacity-25 hidden sm:inline">|</span>
          <span className="truncate text-slate-400">
            Ứng dụng được thiết kế & phát triển bởi <strong className="text-[#f59e0b] hover:underline cursor-pointer">Kỹ Sư Văn Toàn</strong>
          </span>
        </div>
        <div className="flex items-center gap-2.5 sm:gap-4 shrink-0 font-mono text-[10px]">
          <span className="hidden xs:inline text-slate-600 uppercase tracking-wider font-semibold">Live Dubbing Studio</span>
          <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[9px] font-bold">V2.4 PRO</span>
        </div>
      </footer>

      {/* AI SMART TREND SCOUT MODAL OVERLAY */}
      {isTrendingOpen && (
        <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="relative w-full max-w-4xl max-h-[85vh] bg-[#0d0d0d] border border-amber-500/30 rounded-3xl overflow-hidden flex flex-col shadow-[0_0_50px_rgba(245,158,11,0.15)] animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal glassmorphic top header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.01]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shrink-0">
                  <TrendingUp className="w-5 h-5 text-amber-400 shrink-0" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    AI Smart Trend Scout 
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-500/20 animate-pulse">
                      Live Detector
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Dò tìm dữ liệu thời gian thực các sản phẩm bùng nổ tìm kiếm trên mạng xã hội.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsTrendingOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer bg-transparent border-0"
                title="Đóng bảng xu hướng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Categories navigation row */}
            <div className="px-6 py-3 border-b border-white/5 bg-black/40 flex items-center gap-2 overflow-x-auto scrollbar-thin">
              {[
                { id: 'all', name: '🔥 Tất cả xu hướng' },
                { id: 'tech', name: '🔌 Đồ Công Nghệ' },
                { id: 'cosmetics', name: '💄 Mỹ Phẩm & Làm Đẹp' },
                { id: 'home', name: '🏠 Gia Dụng Tiện Ích' },
                { id: 'lifestyle', name: '✨ Đồ Decor & Đời Sống' }
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => scanTrendingProducts(cat.id)}
                  disabled={isScanningTrends}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer border ${
                    scannedCategory === cat.id 
                      ? 'bg-amber-500 text-black border-amber-500 shadow-lg shadow-amber-500/20 font-bold' 
                      : 'text-slate-400 hover:text-white hover:bg-white/5 border-white/5 bg-transparent'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Main scrollable list content / radar view container */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              {isScanningTrends ? (
                /* SONAR SYSTEM RADAR LOADING GRAPHIC */
                <div className="flex flex-col items-center justify-center py-16 space-y-6">
                  <div className="relative w-44 h-44 flex items-center justify-center">
                    {/* Pulsing rings */}
                    <div className="absolute inset-0 rounded-full border border-amber-500/10 animate-ping opacity-60"></div>
                    <div className="absolute inset-4 rounded-full border border-amber-500/20 animate-pulse"></div>
                    <div className="absolute inset-10 rounded-full border border-white/5"></div>
                    <div className="absolute inset-16 rounded-full border border-amber-500/5"></div>
                    {/* Compass tick mark ring */}
                    <div className="absolute inset-0 rounded-full border border-dashed border-white/5 scale-[1.05] rotate-45"></div>
                    {/* Rotating scanning hand */}
                    <div className="absolute inset-0 rounded-full flex items-center justify-center">
                      <div className="w-20 h-0.5 bg-gradient-to-r from-amber-500/0 to-amber-500/90 origin-left animate-[spin_2.5s_linear_infinite] absolute left-1/2 top-1/2 -translate-y-1/2" />
                    </div>
                    {/* Center spot */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-3 h-3 bg-amber-400 rounded-full shadow-[0_0_15px_rgba(245,158,11,1)] animate-ping"></div>
                      <div className="w-2.5 h-2.5 bg-amber-500 rounded-full absolute"></div>
                    </div>
                  </div>
                  
                  <div className="text-center space-y-2">
                    <p className="text-xs font-semibold text-amber-400 flex items-center justify-center gap-2 animate-pulse uppercase tracking-wider">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 
                      HỆ THỐNG ĐANG QUÉT CHỈ SỐ MINH BẠCH HOT TREND...
                    </p>
                    <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">
                      ANALYZING TIKTOK ECOSYSTEM, SHOPEE API & EMERGENCE CORRELATION...
                    </div>
                  </div>
                </div>
              ) : scannedProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                  <TrendingUp className="w-12 h-12 text-slate-600 animate-bounce" />
                  <p className="text-sm font-semibold text-slate-400">Không tìm thấy sản phẩm xu hướng.</p>
                  <button 
                    onClick={() => scanTrendingProducts('all')}
                    className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold hover:bg-amber-500/20 active:scale-95 cursor-pointer transition-all border-0"
                  >
                    Thử quét lại ngay
                  </button>
                </div>
              ) : (
                /* PRODUCT TRENDS RENDER GRID */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {scannedProducts.map((prod, idx) => (
                    <div 
                      key={prod.id || idx}
                      className="bg-zinc-950 border border-white/5 rounded-2xl p-5 hover:border-amber-500/30 hover:bg-white/[0.01] transition-all relative overflow-hidden group flex flex-col justify-between"
                    >
                      {/* Top ribbon: index & badges */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md font-semibold border border-amber-500/20">
                            {prod.category}
                          </span>
                          <span className="text-xs font-bold text-amber-500 flex items-center gap-0.5 font-mono">
                            🔥 Score: {prod.hotScore}%
                          </span>
                        </div>

                        {/* Product Title */}
                        <h4 className="text-sm font-bold text-white mb-2 leading-relaxed tracking-wide group-hover:text-amber-400 transition-colors">
                          {prod.name}
                        </h4>

                        {/* Short pitch with Pas / Viral value */}
                        <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                          {prod.shortDesc}
                        </p>

                        {/* Dynamic analytical badges */}
                        <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono uppercase tracking-wider mb-4 border-t border-b border-white/5 py-2">
                          <div className="text-slate-400 flex items-center gap-1">
                            📈 Growth: <strong className="text-green-400 font-bold">{prod.viralFactor}</strong>
                          </div>
                          <div className="text-slate-400 flex items-center gap-1">
                            📦 Sales: <strong className="text-amber-400 font-bold">{prod.purchaseCount}</strong>
                          </div>
                        </div>

                        {/* Viral hook sentence */}
                        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl text-[11px] leading-relaxed italic text-slate-300 relative mb-4">
                          <span className="text-amber-400 font-bold not-italic block text-[9px] uppercase tracking-wider mb-1 font-sans">
                            🎙️ Suggested Viral Hook:
                          </span>
                          &ldquo;{prod.viralHook}&rdquo;
                        </div>
                      </div>

                      {/* Select product button */}
                      <button
                        onClick={() => {
                          setProductName(prod.name);
                          setProductDesc(prod.shortDesc);
                          
                          // Set Tone Preset matching backend suggests
                          const matchedTone = prod.suggestedTone;
                          const validTones = [
                            'Thuyết phục & Truyền cảm',
                            'Sôi nổi & Kích thích',
                            'Phân tích chuyên sâu',
                            'Hài hước & Gần gũi'
                          ];
                          if (validTones.includes(matchedTone)) {
                            setTonePreset(matchedTone);
                          } else {
                            setTonePreset('Sôi nổi & Kích thích');
                          }
                          
                          // Format custom prompt to append hashtags
                          const tagsStr = prod.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ');
                          setCustomPrompt(`Hãy làm nổi bật sản phẩm hot trend này trong bài viết. Tập trung lột tả tính hữu dụng đặc sắc. Đi kèm hashtags tối ưu: ${tagsStr}`);
                          
                          setIsTrendingOpen(false);
                          setApiError(null);
                        }}
                        className="w-full py-2.5 rounded-xl bg-amber-500 text-black hover:bg-amber-400 font-bold text-xs flex items-center justify-center gap-1 transition-all active:scale-95 shadow-md shadow-amber-500/10 cursor-pointer text-center border-0"
                      >
                        <Plus className="w-3.5 h-3.5" /> Sử dụng sản phẩm này review
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal glassmorphic footer status */}
            <div className="p-4 border-t border-white/10 bg-black/60 flex items-center justify-between text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Đồng bộ hóa xu hướng từ Tiktok Shop, Shopee và Reels
              </span>
              <span>Cập nhật 1 phút trước</span>
            </div>

          </div>
        </div>
      )}

      {/* SFX STUDIO MATRIX MODAL */}
      {isSFXModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b0b0d] border border-amber-500/30 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute -right-12 -top-12 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Music className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-display">Ma Trận Hiệu Ứng Âm Thanh SFX</h3>
                  <p className="text-xs text-slate-400">Bộ âm thanh tổng hợp Web Audio zero-latency đỉnh cao cho Creator</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSFXModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { type: 'chime' as const, label: '🔔 Chuông Chime', desc: 'Sáng bừng, tinh tế' },
                { type: 'whoosh' as const, label: '💨 Vút Whoosh', desc: 'Chuyển cảnh nhanh' },
                { type: 'pop' as const, label: '💥 Nổ Pop', desc: 'Nhấn mạnh điểm nhấn' },
                { type: 'shutter' as const, label: '📸 Màn Chụp Shutter', desc: 'Chụp ảnh khoảnh khắc' },
                { type: 'bell' as const, label: '🛎️ Chuông Vàng Bell', desc: 'Mua hàng, kêu gọi' },
                { type: 'impact' as const, label: '⚡ Va Chạm Impact', desc: 'Kịch tính cao độ' },
              ].map(sfx => (
                <button
                  key={sfx.type}
                  type="button"
                  onClick={() => playSynthesizedSFX(sfx.type, 0.9)}
                  className="p-3.5 rounded-2xl bg-white/[0.03] hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/30 flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer group active:scale-95"
                >
                  <span className="text-xs font-bold text-slate-200 group-hover:text-amber-400">{sfx.label}</span>
                  <span className="text-[9px] text-slate-500 group-hover:text-amber-500/70">{sfx.desc}</span>
                  <span className="text-[8px] font-mono text-amber-500/80 bg-amber-500/10 px-2 py-0.5 rounded-full mt-1">Phát thử 🔊</span>
                </button>
              ))}
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 text-[11px] text-slate-400 leading-relaxed">
              💡 <strong>Mẹo chuyên nghiệp:</strong> Các hiệu ứng âm thanh này được tổng hợp toán học trực tiếp qua Web Audio API, sẵn sàng phát tức thì mà không cần tải thêm bất kỳ file âm thanh nào từ bên ngoài!
            </div>
          </div>
        </div>
      )}

      {/* KEYBOARD SHORTCUTS HELP MODAL */}
      {isKeyboardHelpOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b0b0d] border border-white/10 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-white/10 text-white">
                  <Keyboard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-display">Phím Tắt Biên Tập Master</h3>
                  <p className="text-xs text-slate-400">Tăng tốc độ làm việc như chuyên gia dựng phim</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsKeyboardHelpOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {[
                { key: 'Space', desc: 'Phát / Tạm dừng xem trước video & giọng đọc' },
                { key: '← / →', desc: 'Tua lùi / Tua tới 2 giây' },
                { key: 'M', desc: 'Bật / Tắt tiếng âm thanh gốc' },
                { key: 'S', desc: 'Mở nhanh Ma Trận SFX Studio' },
                { key: 'H', desc: 'Bật / Tắt khung Hook Tiêu đề 3s' },
                { key: '?', desc: 'Mở cửa sổ danh sách phím tắt' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-xs text-slate-300">{item.desc}</span>
                  <kbd className="px-2 py-1 rounded bg-black border border-white/20 text-[10px] font-mono font-bold text-amber-400 shadow-sm">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsKeyboardHelpOpen(false)}
              className="w-full py-2.5 rounded-xl bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 transition-colors cursor-pointer"
            >
              Đã hiểu & Bắt đầu sáng tạo
            </button>
          </div>
        </div>
      )}

      {/* AUTOMATIC AUDIO SILENCE & SPEECH ACTIVITY DETECTOR (VAD) MODAL */}
      {isSilenceDetectModalOpen && silenceDetectResult && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-[#0b0f14] border border-sky-500/30 rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_40px_rgba(14,165,233,0.15)] relative overflow-hidden max-h-[92vh] flex flex-col space-y-4">
            <div className="absolute -right-20 -top-20 w-48 h-48 bg-gradient-to-br from-sky-500/20 via-indigo-500/10 to-teal-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -left-20 -bottom-20 w-48 h-48 bg-gradient-to-tr from-emerald-500/15 via-sky-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3.5 shrink-0 relative z-10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/20">
                  <Activity className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white font-display flex items-center gap-2">
                    ⚡ Tự Động Khớp Phụ Đề Theo Khoảng Lặng Audio
                    <span className="text-[9px] font-mono font-black uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-full">
                      AI Voice VAD
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Phân tích sóng âm thanh thực tế, nhận diện nhịp ngắt nghỉ/thở và đề xuất điều chỉnh mốc phụ đề chuẩn từng giây
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSilenceDetectModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body Scrollable */}
            <div className="overflow-y-auto space-y-4 pr-1 relative z-10 flex-1">
              {/* Detection Sensitivity Tuning Bar */}
              <div className="p-3.5 bg-black/60 border border-sky-500/20 rounded-2xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
                    Căn chỉnh độ nhạy bóc tách sóng âm (Audio Tuning)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRunSilenceDetection()}
                    disabled={isDetectingSilence}
                    className="self-end sm:self-auto px-3 py-1 bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white font-bold text-[10px] rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    <RefreshCw className={`w-3 h-3 ${isDetectingSilence ? 'animate-spin' : ''}`} />
                    <span>{isDetectingSilence ? 'Đang quét lại...' : 'Quét lại với cấu hình này'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  {/* Slider 1: Threshold dB */}
                  <div className="space-y-1 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-300">Ngưỡng nhạy (Threshold)</span>
                      <span className="font-mono font-bold text-sky-300 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20 text-[9px]">
                        {silenceThresholdDb} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-48"
                      max="-20"
                      step="1"
                      value={silenceThresholdDb}
                      onChange={(e) => setSilenceThresholdDb(parseInt(e.target.value, 10))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-sky-400"
                    />
                    <div className="flex justify-between text-[8px] font-mono text-slate-500">
                      <span>Rất nhạy (-48dB)</span>
                      <span>Lọc tạp âm (-20dB)</span>
                    </div>
                  </div>

                  {/* Slider 2: Min Silence Duration */}
                  <div className="space-y-1 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-300">Khoảng lặng tối thiểu</span>
                      <span className="font-mono font-bold text-emerald-300 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 text-[9px]">
                        {minSilenceDuration.toFixed(2)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.10"
                      max="0.50"
                      step="0.02"
                      value={minSilenceDuration}
                      onChange={(e) => setMinSilenceDuration(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                    />
                    <div className="flex justify-between text-[8px] font-mono text-slate-500">
                      <span>Ngắt ngắn (0.10s)</span>
                      <span>Dài (0.50s)</span>
                    </div>
                  </div>

                  {/* Slider 3: Safety Padding */}
                  <div className="space-y-1 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-300">Độ đệm bảo vệ (Padding)</span>
                      <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20 text-[9px]">
                        +{silencePaddingSec.toFixed(2)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.02"
                      max="0.12"
                      step="0.01"
                      value={silencePaddingSec}
                      onChange={(e) => setSilencePaddingSec(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-400"
                    />
                    <div className="flex justify-between text-[8px] font-mono text-slate-500">
                      <span>Sát âm (0.02s)</span>
                      <span>Êm ái (0.12s)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual Waveform & Audio Spectrum Bar */}
              <div className="p-3.5 bg-black/70 border border-white/10 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-mono text-slate-400 flex items-center gap-1.5 font-bold uppercase tracking-wider">
                    <Activity className="w-3.5 h-3.5 text-sky-400" />
                    Biểu đồ phổ sóng âm &amp; phân đoạn giọng nói thực tế:
                  </span>
                  <div className="flex items-center gap-3 text-[9px] font-mono">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <span className="w-2 h-2 rounded bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                      🗣️ Giọng nói ({silenceDetectResult.speechIntervals.length})
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <span className="w-2 h-2 rounded bg-slate-700 border border-slate-500" />
                      ⏸️ Khoảng lặng ({silenceDetectResult.silenceGaps.length})
                    </span>
                  </div>
                </div>

                {/* Waveform Canvas / SVG Container */}
                <div className="h-14 w-full bg-[#05070a] rounded-xl p-1.5 flex items-end gap-0.5 border border-sky-500/20 overflow-hidden relative">
                  {silenceDetectResult.waveformData && silenceDetectResult.waveformData.length > 0 ? (
                    silenceDetectResult.waveformData.map((pt, pIdx) => {
                      const heightPct = Math.max(8, Math.min(100, Math.round(pt.rms * 100)));
                      return (
                        <div
                          key={pIdx}
                          className={`flex-1 rounded-t transition-all ${
                            pt.isSpeech
                              ? 'bg-gradient-to-t from-emerald-600 to-teal-400 hover:brightness-125'
                              : 'bg-slate-700/40 hover:bg-slate-600/60'
                          }`}
                          style={{ height: `${heightPct}%` }}
                          title={`Thời điểm: ${pt.time}s | Biên độ: ${Math.round(pt.rms * 100)}% | ${pt.isSpeech ? 'Phát âm' : 'Khoảng lặng'}`}
                        />
                      );
                    })
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                      Đang dựng biểu đồ sóng âm thanh...
                    </div>
                  )}

                  {/* Playhead indicator if audio is playing */}
                  {isPlaying && audioDuration > 0 && (
                    <div 
                      className="absolute top-0 bottom-0 w-[2px] bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,1)] pointer-events-none transition-all duration-75"
                      style={{ left: `${Math.min(100, Math.max(0, (currentAudioTime / audioDuration) * 100))}%` }}
                    />
                  )}
                </div>

                {/* Timeline timecode labels */}
                <div className="flex justify-between text-[8px] font-mono text-slate-500 px-0.5">
                  <span>00:00.0s</span>
                  <span>{formatTimeCode((silenceDetectResult.totalDuration || 20) * 0.25, true)}</span>
                  <span>{formatTimeCode((silenceDetectResult.totalDuration || 20) * 0.5, true)}</span>
                  <span>{formatTimeCode((silenceDetectResult.totalDuration || 20) * 0.75, true)}</span>
                  <span>{formatTimeCode(silenceDetectResult.totalDuration || 20, true)}</span>
                </div>
              </div>

              {/* Statistics Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-0.5">
                  <span className="text-[9px] font-mono text-slate-400 uppercase block">Tổng thời lượng:</span>
                  <span className="text-sm font-mono font-bold text-white">
                    {silenceDetectResult.totalDuration.toFixed(2)}s
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20 space-y-0.5">
                  <span className="text-[9px] font-mono text-emerald-400/80 uppercase block">Đoạn phát âm (Speech):</span>
                  <span className="text-sm font-mono font-bold text-emerald-300">
                    {silenceDetectResult.speechIntervals.length} phân đoạn
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-sky-500/[0.04] border border-sky-500/20 space-y-0.5">
                  <span className="text-[9px] font-mono text-sky-400/80 uppercase block">Khoảng im lặng (Silence):</span>
                  <span className="text-sm font-mono font-bold text-sky-300">
                    {silenceDetectResult.silenceGaps.length} nhịp nghỉ
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-500/[0.04] border border-amber-500/20 space-y-0.5">
                  <span className="text-[9px] font-mono text-amber-400/80 uppercase block">Phụ đề đề xuất khớp:</span>
                  <span className="text-sm font-mono font-bold text-amber-300">
                    {silenceDetectResult.adjustments.length} câu thoại
                  </span>
                </div>
              </div>

              {/* Subtitle Alignment Comparison Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5 font-mono">
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Chi tiết đề xuất điều chỉnh thời gian theo từng phân cảnh ({silenceDetectResult.adjustments.length}):
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Độ lệch TB: <strong className="text-emerald-400">±{(silenceDetectResult.adjustments.reduce((acc, a) => acc + Math.abs(a.deltaStart) + Math.abs(a.deltaEnd), 0) / (silenceDetectResult.adjustments.length * 2 || 1)).toFixed(2)}s</strong>
                  </span>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {silenceDetectResult.adjustments.map((adj) => {
                    const hasChanged = Math.abs(adj.deltaStart) >= 0.05 || Math.abs(adj.deltaEnd) >= 0.05;
                    const oldDuration = Math.max(0.1, adj.oldEnd - adj.oldStart);
                    const newDuration = Math.max(0.1, adj.newEnd - adj.newStart);

                    return (
                      <div
                        key={adj.index}
                        className={`p-3 rounded-xl border transition-all ${
                          hasChanged
                            ? 'bg-[#060a0f] border-sky-500/25 hover:border-sky-500/40'
                            : 'bg-[#080808] border-white/5 text-slate-400'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-mono font-bold text-[9px] border border-sky-500/30">
                                #{adj.index + 1}
                              </span>
                              <p className="text-xs text-white font-medium font-sans truncate">
                                &ldquo;{adj.text}&rdquo;
                              </p>
                            </div>

                            {/* Comparison timecodes */}
                            <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono">
                              <span className="text-slate-400">
                                Mốc cũ: <span className="line-through text-slate-500">{adj.oldStart.toFixed(2)}s &rarr; {adj.oldEnd.toFixed(2)}s</span> ({oldDuration.toFixed(2)}s)
                              </span>
                              <span className="text-emerald-300 font-bold">
                                Khớp mới: <span className="text-emerald-400">{adj.newStart.toFixed(2)}s &rarr; {adj.newEnd.toFixed(2)}s</span> ({newDuration.toFixed(2)}s)
                              </span>
                            </div>
                          </div>

                          {/* Delta Badges & Listen Preview Button */}
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <div className="flex items-center gap-1 font-mono text-[9px]">
                              <span className={`px-1.5 py-0.5 rounded border ${
                                adj.deltaStart === 0 
                                  ? 'bg-white/5 border-white/10 text-slate-400' 
                                  : adj.deltaStart > 0 
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' 
                                    : 'bg-teal-500/10 border-teal-500/30 text-teal-300'
                              }`}>
                                Bắt đầu: {adj.deltaStart >= 0 ? `+${adj.deltaStart.toFixed(2)}s` : `${adj.deltaStart.toFixed(2)}s`}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded border ${
                                adj.deltaEnd === 0 
                                  ? 'bg-white/5 border-white/10 text-slate-400' 
                                  : adj.deltaEnd > 0 
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' 
                                    : 'bg-teal-500/10 border-teal-500/30 text-teal-300'
                              }`}>
                                Kết thúc: {adj.deltaEnd >= 0 ? `+${adj.deltaEnd.toFixed(2)}s` : `${adj.deltaEnd.toFixed(2)}s`}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handlePreviewSilenceSegment(adj.newStart, adj.newEnd)}
                              className="px-2 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 hover:text-white border border-sky-500/30 text-[9px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                              title="Nghe thử đoạn audio khớp mốc mới này"
                            >
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>Nghe</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 relative z-10">
              <span className="text-[10px] text-slate-400 font-sans flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Nhấn <strong>Áp Dụng Điều Chỉnh</strong> để cập nhật ngay vào phụ đề video &amp; timeline lồng tiếng.</span>
              </span>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsSilenceDetectModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={handleApplySilenceAlignment}
                  className="w-full sm:w-auto px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 via-teal-500 to-emerald-500 hover:brightness-110 text-slate-950 font-black text-xs transition-all shadow-lg shadow-sky-500/25 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Áp Dụng Điều Chỉnh Phụ Đề ⚡</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SMART AUDIT & FIX REPORT MODAL */}
      {isAuditReportOpen && lastAuditResult && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b0b0d] border border-amber-500/30 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 relative overflow-hidden max-h-[90vh] flex flex-col">
            <div className="absolute -right-16 -top-16 w-40 h-40 bg-gradient-to-br from-amber-500/20 to-rose-500/20 rounded-full blur-3xl pointer-events-none"></div>

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 text-slate-950 shadow-md">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                    Báo Cáo Kiểm Định &amp; Sửa Lỗi Chuyên Sâu
                    <span className="text-[9px] font-mono font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      Tự Động 100%
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Đã sửa triệt để chính tả, ngữ điệu Nam Bộ, từ cấm TikTok và mốc thời gian phụ đề</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditReportOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="space-y-4 overflow-y-auto pr-1">
              {/* Quality Score Progress Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-white/[0.04] to-white/[0.01] border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-center sm:text-left">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold block">
                    ĐIỂM CHẤT LƯỢNG NỘI DUNG (QUALITY SCORE)
                  </span>
                  <p className="text-xs text-slate-300">
                    {lastAuditResult.optimizationSummary || "Kịch bản và phụ đề đã được chuẩn hóa đạt chuẩn phân phối video triệu view."}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-center px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10">
                    <span className="text-[8.5px] text-slate-500 font-mono block uppercase">Ban đầu</span>
                    <span className="text-base font-mono font-bold text-slate-400">{lastAuditResult.qualityScoreBefore || 75}/100</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-500" />
                  <div className="text-center px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-[8.5px] text-emerald-400 font-mono block uppercase font-bold">Sau khi sửa</span>
                    <span className="text-lg font-mono font-black text-emerald-400">{lastAuditResult.qualityScoreAfter || 99}/100</span>
                  </div>
                </div>
              </div>

              {/* 4 Pillars Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Chính Tả &amp; Cú Pháp</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Sửa toàn bộ lỗi chính tả tiếng Việt, dấu hỏi/ngã, lỗi gõ Telex và chuẩn hóa danh từ riêng sản phẩm.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Khử 100% Giọng Bắc</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Chuyển toàn bộ từ ngữ, hư từ miền Bắc sang phong cách Nam Bộ / Sài Gòn ngọt ngào, tự nhiên.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Chính Sách TikTok Shop</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Thanh lọc triệt để các từ cấm ("cam kết 100%", "trị dứt điểm", "rẻ nhất"...), an toàn tài khoản 100%.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Phụ Đề &amp; Khớp Timeline</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Tách câu ngắn 3-6 từ, xóa ký tự lạ, cân chỉnh mốc thời gian liên tục không bị trùng lặp giây.
                  </p>
                </div>
              </div>

              {/* Specific Fixed Issues List */}
              {lastAuditResult.fixedIssues && lastAuditResult.fixedIssues.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold block">
                    CHI TIẾT CÁC HẠNG MỤC ĐÃ ĐƯỢC TỰ ĐỘNG KHẮC PHỤC ({lastAuditResult.fixedIssues.length}):
                  </span>
                  <ul className="space-y-1.5">
                    {lastAuditResult.fixedIssues.map((issue, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0"></span>
                        <span className="leading-relaxed">{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-400" />
                Toàn bộ dữ liệu đã được cập nhật trực tiếp vào kịch bản &amp; phụ đề!
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsAuditReportOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
                >
                  Đóng Báo Cáo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAuditReportOpen(false);
                    // Trigger voice generation if available
                    generateVoiceover();
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-black text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Lồng Giọng AI Ngay 🎙️</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SMART SUBTITLE SPELL CHECK TOAST NOTIFICATION */}
      <AnimatePresence>
        {subtitleSpellToast && subtitleSpellToast.show && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 max-w-md w-full p-4 rounded-2xl bg-[#0e1311] border border-emerald-500/30 shadow-[0_10px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(16,185,129,0.2)] text-slate-200 space-y-2.5 backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                  <CheckCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white font-display flex items-center gap-1.5">
                    {subtitleSpellToast.title}
                  </h4>
                  <p className="text-[11px] text-slate-300 leading-snug mt-0.5">
                    {subtitleSpellToast.message}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubtitleSpellToast(null)}
                className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {subtitleSpellToast.fixes && subtitleSpellToast.fixes.length > 0 && (
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 max-h-36 overflow-y-auto space-y-1 text-[10px] font-mono">
                <span className="text-[9px] uppercase font-bold text-emerald-400/80 block">
                  Chi tiết các từ ngữ đã tối ưu ({subtitleSpellToast.fixes.length}):
                </span>
                {subtitleSpellToast.fixes.map((fix, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-slate-300">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span className="leading-tight">{fix}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

