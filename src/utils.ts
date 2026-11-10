/**
 * Helper to convert a raw base64 PCM 16-bit audio string (Mono, 24000Hz) 
 * into a fully standard WAV blob URL so standard HTML audio controls play it nicely.
 */
export function pcmToWav(base64Pcm: string, sampleRate: number = 24000): string {
  try {
    const binaryString = atob(base64Pcm);
    
    // If the data already contains a RIFF header (standard Gemini 3.8 Flash Lite TTS unary output), do not add another header!
    if (binaryString.length >= 12 && binaryString.slice(0, 4) === 'RIFF') {
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/wav' });
      return URL.createObjectURL(blob);
    }

    const len = binaryString.length;
    const buffer = new ArrayBuffer(44 + len);
    const view = new DataView(buffer);
    
    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + len, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format: 1 is Linear PCM
    view.setUint16(20, 1, true);
    // channel count: 1 (Mono)
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 2, true); // 16-bit is 2 bytes per sample
    // block align (channel count * bytes per sample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, len, true);
    
    // Copy the raw PCM samples
    const uint8View = new Uint8Array(buffer, 44);
    for (let i = 0; i < len; i++) {
      uint8View[i] = binaryString.charCodeAt(i);
    }
    
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error("Lỗi mã hóa âm thanh PCM sang WAV:", err);
    return "";
  }
}

/**
 * Break long subtitle text into clean, balanced lines for mobile vertical screens (9:16).
 * Avoids text clipping or stretching beyond video bounds.
 */
export function wrapSubtitleIntoLines(text: string, maxCharsPerLine: number = 32): string[] {
  if (!text) return [];
  const trimmed = text.trim();
  if (trimmed.length <= maxCharsPerLine) return [trimmed];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

/**
 * Format bytes into file size text
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * A highly tailored simple markdown parser for rendering bullet lists, h3 headers,
 * bold words, and sub-headings elegantly into the product review report.
 * Also highlights and styles timecode badges [00:00 - 00:04].
 */
export function parseMarkdown(text: string): string {
  if (!text) return '';
  return text
    // Escaping safety
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // H3 Headers with optional timestamps
    .replace(/^### (.*$)/gim, (_, content) => {
      return `<h3 class="font-display font-semibold text-base sm:text-lg text-amber-400 mt-5 mb-2.5 border-b border-amber-500/20 pb-1.5 flex flex-wrap items-center gap-2">${content}</h3>`;
    })
    // H4 Headers 
    .replace(/^#### (.*$)/gim, '<h4 class="font-sans font-medium text-amber-200 mt-4 mb-2">$1</h4>')
    // Highlight timestamps like (00:00 - 00:05) or [00:02 - 00:06] or 00:00 - 00:04
    .replace(/(\b\d{1,2}:\d{2}(?:\s*[-–đếnto]+\s*\d{1,2}:\d{2})?\b)/g, '<span class="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md shadow-sm">⏱️ $1</span>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-amber-300 font-semibold">$1</strong>')
    // Bullet Lists
    .replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc text-slate-300 mb-1">$1</li>')
    .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc text-slate-300 mb-1">$1</li>')
    // Line breaks
    .replace(/\n/g, '<br/>');
}

export interface StoryboardScene {
  id: string;
  rawHeader: string;
  title: string;
  timeRangeText: string;
  startSec: number;
  endSec: number;
  content: string;
  voiceoverQuote?: string;
  brollSuggestion?: string;
}

/**
 * Parse string timestamp "00:04" or "0:04" or "1:23" to seconds
 */
export function parseTimeStringToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  const floatVal = parseFloat(timeStr);
  return isNaN(floatVal) ? 0 : floatVal;
}

/**
 * Format seconds to MM:SS or MM:SS.S
 */
export function formatTimeCode(seconds: number, includeTenths = false): string {
  const safeSec = Math.max(0, seconds || 0);
  const mins = Math.floor(safeSec / 60);
  const secs = safeSec % 60;
  const minsStr = String(mins).padStart(2, '0');
  if (includeTenths) {
    const secsStr = secs.toFixed(1).padStart(4, '0');
    return `${minsStr}:${secsStr}`;
  }
  const secsStr = String(Math.floor(secs)).padStart(2, '0');
  return `${minsStr}:${secsStr}`;
}

/**
 * Parse detailedReview markdown into structured scenes with timestamps
 */
export function parseStoryboardScenes(detailedReviewText: string, totalEstimatedDuration: number = 20): StoryboardScene[] {
  if (!detailedReviewText || typeof detailedReviewText !== 'string') return [];

  // Match H3 headers (### ...)
  const sceneRegex = /^###\s+(.*)$/gm;
  const scenes: StoryboardScene[] = [];
  
  const matches: { header: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = sceneRegex.exec(detailedReviewText)) !== null) {
    matches.push({ header: match[1], index: match.index });
  }

  if (matches.length === 0) {
    // If no H3 headers, treat the entire review as one single scene
    return [{
      id: 'scene-0',
      rawHeader: 'Toàn bộ bài phân cảnh',
      title: 'Tổng quan bài viết review',
      timeRangeText: `00:00 - ${formatTimeCode(totalEstimatedDuration)}`,
      startSec: 0,
      endSec: totalEstimatedDuration,
      content: detailedReviewText
    }];
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const startIndex = current.index + current.header.length + 4; // account for "### " and newline
    const endIndex = i < matches.length - 1 ? matches[i + 1].index : detailedReviewText.length;
    const bodyContent = detailedReviewText.slice(startIndex, endIndex).trim();

    // Extract timestamps in header like "00:00 - 00:04" or "0:00 - 0:05" or "[00:00 - 00:05]"
    const timeMatch = current.header.match(/(\d{1,2}:\d{2})\s*(?:[-–đếnto]+\s*(\d{1,2}:\d{2}))?/i);
    let startSec = 0;
    let endSec = 0;
    let timeRangeText = '';

    if (timeMatch) {
      startSec = parseTimeStringToSeconds(timeMatch[1]);
      if (timeMatch[2]) {
        endSec = parseTimeStringToSeconds(timeMatch[2]);
        timeRangeText = `${timeMatch[1]} - ${timeMatch[2]}`;
      } else {
        endSec = startSec + 4;
        timeRangeText = `${timeMatch[1]} - ${formatTimeCode(endSec)}`;
      }
    } else {
      // Approximate time proportionally based on scene index
      const sceneDuration = totalEstimatedDuration / matches.length;
      startSec = Number((i * sceneDuration).toFixed(1));
      endSec = Number(((i + 1) * sceneDuration).toFixed(1));
      timeRangeText = `${formatTimeCode(startSec)} - ${formatTimeCode(endSec)}`;
    }

    // Clean title from header
    const cleanTitle = current.header
      .replace(/\[\d{1,2}:\d{2}.*?\]|\(\d{1,2}:\d{2}.*?\)/g, '')
      .replace(/\b\d{1,2}:\d{2}\s*[-–đếnto]+\s*\d{1,2}:\d{2}\b/g, '')
      .replace(/^[🌟🎬🔥💡🎯💎📌\s:,-]+/, '')
      .trim();

    // Extract quote / voiceover line if present in body
    const quoteMatch = bodyContent.match(/(?:Lời bình|Voiceover|Thuyết minh|Lời thoại)[^:]*:\s*(?:\*{1,2})?["“]([^"”]+)["”]/i);
    const brollMatch = bodyContent.match(/(?:Gợi ý B-Roll|B-Roll|Hình ảnh|Góc quay|Cảnh quay)[^:]*:\s*(?:\*{1,2})?([^\n\r]+)/i);

    scenes.push({
      id: `scene-${i}`,
      rawHeader: current.header,
      title: cleanTitle || `Phân cảnh ${i + 1}`,
      timeRangeText,
      startSec,
      endSec,
      content: bodyContent,
      voiceoverQuote: quoteMatch ? quoteMatch[1].trim() : undefined,
      brollSuggestion: brollMatch ? brollMatch[1].trim().replace(/^\*+|\*+$/g, '') : undefined
    });
  }

  return scenes;
}

/**
 * Format timed text list for easy clipboard copying
 */
export function formatTimedSubtitlesClipboard(segments: Array<{ start: number; end: number; text: string; translation?: string }>): string {
  return segments.map((seg, idx) => {
    const timeCode = `[${formatTimeCode(seg.start, true)} -> ${formatTimeCode(seg.end, true)}]`;
    const trans = seg.translation ? ` (${seg.translation})` : '';
    return `${idx + 1}. ${timeCode} ${seg.text}${trans}`;
  }).join('\n');
}

/**
 * Format seconds to SRT timestamp 00:00:00,000
 */
function formatSRTTime(seconds: number): string {
  const date = new Date(0);
  date.setUTCMilliseconds(Math.max(0, seconds) * 1000);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const secs = String(date.getUTCSeconds()).padStart(2, '0');
  const millis = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${secs},${millis}`;
}

/**
 * Format seconds to VTT timestamp 00:00:00.000
 */
function formatVTTTime(seconds: number): string {
  const date = new Date(0);
  date.setUTCMilliseconds(Math.max(0, seconds) * 1000);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const secs = String(date.getUTCSeconds()).padStart(2, '0');
  const millis = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${secs}.${millis}`;
}

/**
 * Export Subtitle Segments to standard .SRT string for CapCut, Premiere, TikTok, YouTube
 */
export function exportToSRT(segments: Array<{ start: number; end: number; text: string; translation?: string }>): string {
  return segments.map((seg, idx) => {
    const textContent = seg.translation ? `${seg.text}\n${seg.translation}` : seg.text;
    return `${idx + 1}\n${formatSRTTime(seg.start)} --> ${formatSRTTime(seg.end)}\n${textContent}\n`;
  }).join('\n');
}

/**
 * Export Subtitle Segments to WebVTT format
 */
export function exportToVTT(segments: Array<{ start: number; end: number; text: string; translation?: string }>): string {
  const body = segments.map((seg, idx) => {
    const textContent = seg.translation ? `${seg.text}\n${seg.translation}` : seg.text;
    return `${idx + 1}\n${formatVTTTime(seg.start)} --> ${formatVTTTime(seg.end)}\n${textContent}\n`;
  }).join('\n');
  return `WEBVTT - Exported from AI Product Review Studio Pro\n\n${body}`;
}

/**
 * Zero-latency Web Audio Sound Effects Synthesizer
 * Produces crisp studio sounds without external assets or network dependencies
 */
let sharedSFXAudioContext: AudioContext | null = null;

export function playSynthesizedSFX(
  type: 'chime' | 'whoosh' | 'pop' | 'shutter' | 'bell' | 'impact',
  volume: number = 0.8
) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedSFXAudioContext || sharedSFXAudioContext.state === 'closed') {
      sharedSFXAudioContext = new AudioCtx();
    }
    const ctx = sharedSFXAudioContext;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.max(0.01, Math.min(1.0, volume)), ctx.currentTime);
    masterGain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'chime') {
      // Golden Cash Register / E-Commerce Chime (Triad Frequencies: 1046Hz, 1318Hz, 1568Hz)
      const freqs = [1046.5, 1318.5, 1567.98, 2093.0];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + i * 0.06);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.35, now + i * 0.06 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.6);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.65);
      });
    } else if (type === 'whoosh') {
      // Cinematic transition whoosh (Bandpass swept noise)
      const bufferSize = Math.floor(ctx.sampleRate * 0.35);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(200, now);
      filter.frequency.exponentialRampToValueAtTime(2800, now + 0.18);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.35);
      filter.Q.setValueAtTime(3.0, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.36);
    } else if (type === 'pop') {
      // Bubble Pop / Tap UI effect
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'shutter') {
      // High-end camera shutter snap
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1500, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.04);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === 'bell') {
      // Clean alert notification bell
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'impact') {
      // Low-end cinematic impact boom
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch (e) {
    // Ignore audio synthesis errors silently
  }
}

/**
 * Comprehensive Vietnamese vocabulary, eCommerce terms, and spelling normalization rules
 */
export interface SpellingCorrection {
  original: string;
  replacement: string;
  reason: string;
}

/**
 * Intelligent helper to preserve original capitalization (ALL CAPS, Title Case, lowercase)
 */
export function preserveCase(original: string, target: string): string {
  if (!original || !target) return target;
  // If original is ALL CAPS (and contains letters)
  if (original === original.toUpperCase() && original !== original.toLowerCase()) {
    return target.toUpperCase();
  }
  // If original starts with an uppercase letter
  const firstChar = original.charAt(0);
  if (firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
    const origWords = original.split(/\s+/);
    const isAllWordsCapitalized = origWords.length > 1 && origWords.every(w => {
      const c = w.charAt(0);
      return c === c.toUpperCase() && c !== c.toLowerCase();
    });
    if (isAllWordsCapitalized) {
      return target.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
}

const VIETNAMESE_SPELL_RULES: Array<{ pattern: RegExp; replacement: string | ((match: string, ...args: any[]) => string); reason: string }> = [
  // 1. Phân biệt Dấu Hỏi / Ngã phổ biến nhất trong tiếng Việt & Review sản phẩm
  { pattern: /\bsản phẫm\b/gi, replacement: 'sản phẩm', reason: "Chuẩn chính tả: 'sản phẩm' (dấu hỏi)" },
  { pattern: /\bsản phảm\b/gi, replacement: 'sản phẩm', reason: "Chuẩn chính tả: 'sản phẩm'" },
  { pattern: /\bsản phầm\b/gi, replacement: 'sản phẩm', reason: "Chuẩn chính tả: 'sản phẩm'" },
  { pattern: /\bmẩu mã\b/gi, replacement: 'mẫu mã', reason: "Chuẩn chính tả: 'mẫu mã' (dấu ngã)" },
  { pattern: /\bchia sẽ\b/gi, replacement: 'chia sẻ', reason: "Chuẩn chính tả: 'chia sẻ' (dấu hỏi)" },
  { pattern: /\btrãi nghiệm\b/gi, replacement: 'trải nghiệm', reason: "Chuẩn chính tả: 'trải nghiệm' (dấu hỏi)" },
  { pattern: /\bchính hảng\b/gi, replacement: 'chính hãng', reason: "Chuẩn chính tả: 'chính hãng' (dấu ngã)" },
  { pattern: /\bưu đải\b/gi, replacement: 'ưu đãi', reason: "Chuẩn chính tả: 'ưu đãi' (dấu ngã)" },
  { pattern: /\bdư giả\b/gi, replacement: 'dư dả', reason: "Chuẩn chính tả: 'dư dả' (tiền của dư dả)" },
  { pattern: /\brãnh rỗi\b/gi, replacement: 'rảnh rỗi', reason: "Chuẩn chính tả: 'rảnh rỗi' (dấu hỏi)" },
  { pattern: /\bcãm nhận\b/gi, replacement: 'cảm nhận', reason: "Chuẩn chính tả: 'cảm nhận' (dấu hỏi)" },
  { pattern: /\bdưởng ẩm\b/gi, replacement: 'dưỡng ẩm', reason: "Chuẩn chính tả: 'dưỡng ẩm' (dấu ngã)" },
  { pattern: /\bdể thương\b/gi, replacement: 'dễ thương', reason: "Chuẩn chính tả: 'dễ thương' (dấu ngã)" },
  { pattern: /\bhửu ích\b/gi, replacement: 'hữu ích', reason: "Chuẩn chính tả: 'hữu ích' (dấu ngã)" },
  { pattern: /\blổi lầm\b/gi, replacement: 'lỗi lầm', reason: "Chuẩn chính tả: 'lỗi lầm' (dấu ngã)" },
  { pattern: /\brẽ rề\b/gi, replacement: 'rẻ rề', reason: "Chuẩn chính tả: 'rẻ rề' (dấu hỏi)" },
  { pattern: /\brực rở\b/gi, replacement: 'rực rỡ', reason: "Chuẩn chính tả: 'rực rỡ' (dấu ngã)" },
  { pattern: /\brạng rở\b/gi, replacement: 'rạng rỡ', reason: "Chuẩn chính tả: 'rạng rỡ' (dấu ngã)" },
  { pattern: /\bngở ngàng\b/gi, replacement: 'ngỡ ngàng', reason: "Chuẩn chính tả: 'ngỡ ngàng' (dấu ngã)" },
  { pattern: /\bchểm chệ\b/gi, replacement: 'chễm chệ', reason: "Chuẩn chính tả: 'chễm chệ' (dấu ngã)" },
  { pattern: /\bhảnh diện\b/gi, replacement: 'hãnh diện', reason: "Chuẩn chính tả: 'hãnh diện' (dấu ngã)" },
  { pattern: /\bnhẩn nại\b/gi, replacement: 'nhẫn nại', reason: "Chuẩn chính tả: 'nhẫn nại' (dấu ngã)" },
  { pattern: /\bvững trãi\b/gi, replacement: 'vững chãi', reason: "Chuẩn chính tả: 'vững chãi'" },
  { pattern: /\bmê mẫn\b/gi, replacement: 'mê mẩn', reason: "Chuẩn chính tả: 'mê mẩn' (dấu hỏi)" },
  { pattern: /\bbền bĩ\b/gi, replacement: 'bền bỉ', reason: "Chuẩn chính tả: 'bền bỉ' (dấu hỏi)" },
  { pattern: /\btỉ mĩ\b/gi, replacement: 'tỉ mỉ', reason: "Chuẩn chính tả: 'tỉ mỉ' (dấu hỏi)" },
  { pattern: /\bbảo hảnh\b/gi, replacement: 'bảo hành', reason: "Chuẩn chính tả: 'bảo hành'" },
  { pattern: /\bhướng dẩn\b/gi, replacement: 'hướng dẫn', reason: "Chuẩn chính tả: 'hướng dẫn' (dấu ngã)" },
  { pattern: /\bnhược điễm\b/gi, replacement: 'nhược điểm', reason: "Chuẩn chính tả: 'nhược điểm' (dấu hỏi)" },
  { pattern: /\bưu điễm\b/gi, replacement: 'ưu điểm', reason: "Chuẩn chính tả: 'ưu điểm' (dấu hỏi)" },
  { pattern: /\bvội vả\b/gi, replacement: 'vội vã', reason: "Chuẩn chính tả: 'vội vã' (dấu ngã)" },
  { pattern: /\bđầy đũ\b/gi, replacement: 'đầy đủ', reason: "Chuẩn chính tả: 'đầy đủ' (dấu hỏi)" },
  { pattern: /\bsẳn sàng\b/gi, replacement: 'sẵn sàng', reason: "Chuẩn chính tả: 'sẵn sàng' (dấu ngã)" },
  { pattern: /\bsữa rữa mặt\b/gi, replacement: 'sữa rửa mặt', reason: "Chuẩn chính tả: 'sữa rửa mặt'" },
  { pattern: /\bsửa rửa mặt\b/gi, replacement: 'sữa rửa mặt', reason: "Chuẩn chính tả: 'sữa rửa mặt'" },
  { pattern: /\bsửa tắm\b/gi, replacement: 'sữa tắm', reason: "Chuẩn chính tả: 'sữa tắm'" },
  { pattern: /\bsữa soạn\b/gi, replacement: 'sửa soạn', reason: "Chuẩn chính tả: 'sửa soạn'" },
  { pattern: /\bsửa chửa\b/gi, replacement: 'sửa chữa', reason: "Chuẩn chính tả: 'sửa chữa'" },
  { pattern: /\bsữa chữa\b/gi, replacement: 'sửa chữa', reason: "Chuẩn chính tả: 'sửa chữa'" },
  { pattern: /\bkỉ lưỡng\b/gi, replacement: 'kỹ lưỡng', reason: "Chuẩn chính tả: 'kỹ lưỡng'" },
  { pattern: /\bcặn kẻ\b/gi, replacement: 'cặn kẽ', reason: "Chuẩn chính tả: 'cặn kẽ'" },
  { pattern: /\bnghỉ ngợi\b/gi, replacement: 'nghĩ ngợi', reason: "Chuẩn chính tả: 'nghĩ ngợi'" },
  { pattern: /\bnghĩ ngơi\b/gi, replacement: 'nghỉ ngơi', reason: "Chuẩn chính tả: 'nghỉ ngơi'" },
  { pattern: /\bnỗi bật\b/gi, replacement: 'nổi bật', reason: "Chuẩn chính tả: 'nổi bật'" },
  { pattern: /\bnỗi tiếng\b/gi, replacement: 'nổi tiếng', reason: "Chuẩn chính tả: 'nổi tiếng'" },
  { pattern: /\bsửng sốt\b/gi, replacement: 'sửng sốt', reason: "Chuẩn chính tả: 'sửng sốt'" },
  { pattern: /\bxửng sốt\b/gi, replacement: 'sửng sốt', reason: "Chuẩn chính tả: 'sửng sốt'" },

  // 2. Phân biệt S / X và D / GI / R
  { pattern: /\bxịn xò\b/gi, replacement: 'xịn sò', reason: "Chuẩn chính tả: 'xịn sò'" },
  { pattern: /\bsắp sếp\b/gi, replacement: 'sắp xếp', reason: "Chuẩn chính tả: 'sắp xếp'" },
  { pattern: /\bxắp xếp\b/gi, replacement: 'sắp xếp', reason: "Chuẩn chính tả: 'sắp xếp'" },
  { pattern: /\bsuất sắc\b/gi, replacement: 'xuất sắc', reason: "Chuẩn chính tả: 'xuất sắc'" },
  { pattern: /\bxuất ăn\b/gi, replacement: 'suất ăn', reason: "Chuẩn chính tả: 'suất ăn'" },
  { pattern: /\bxuất vé\b/gi, replacement: 'suất vé', reason: "Chuẩn chính tả: 'suất vé'" },
  { pattern: /\bbổ xung\b/gi, replacement: 'bổ sung', reason: "Chuẩn chính tả: 'bổ sung'" },
  { pattern: /\bsơ xuất\b/gi, replacement: 'sơ suất', reason: "Chuẩn chính tả: 'sơ suất'" },
  { pattern: /\bxơ suất\b/gi, replacement: 'sơ suất', reason: "Chuẩn chính tả: 'sơ suất'" },
  { pattern: /\bchau chuốt\b/gi, replacement: 'trau chuốt', reason: "Chuẩn chính tả: 'trau chuốt'" },
  { pattern: /\btrau truốt\b/gi, replacement: 'trau chuốt', reason: "Chuẩn chính tả: 'trau chuốt'" },
  { pattern: /\bchuẩn đoán\b/gi, replacement: 'chẩn đoán', reason: "Chuẩn chính tả: 'chẩn đoán'" },
  { pattern: /\bchín mùi\b/gi, replacement: 'chín muồi', reason: "Chuẩn chính tả: 'chín muồi'" },
  { pattern: /\bthăm quan\b/gi, replacement: 'tham quan', reason: "Chuẩn chính tả: 'tham quan'" },
  { pattern: /\bbạc mạng\b/gi, replacement: 'bạt mạng', reason: "Chuẩn chính tả: 'bạt mạng'" },
  { pattern: /\bchung thực\b/gi, replacement: 'trung thực', reason: "Chuẩn chính tả: 'trung thực'" },
  { pattern: /\bcọ sát\b/gi, replacement: 'cọ xát', reason: "Chuẩn chính tả: 'cọ xát'" },
  { pattern: /\bsáng lạng\b/gi, replacement: 'xán lạn', reason: "Chuẩn chính tả: 'xán lạn'" },
  { pattern: /\bxáng lạn\b/gi, replacement: 'xán lạn', reason: "Chuẩn chính tả: 'xán lạn'" },
  { pattern: /\btựu chung\b/gi, replacement: 'tựu trung', reason: "Chuẩn chính tả: 'tựu trung'" },
  { pattern: /\bvô hình chung\b/gi, replacement: 'vô hình trung', reason: "Chuẩn chính tả: 'vô hình trung'" },
  { pattern: /\bđường xá\b/gi, replacement: 'đường sá', reason: "Chuẩn chính tả: 'đường sá'" },
  { pattern: /\bsuôn xẻ\b/gi, replacement: 'suôn sẻ', reason: "Chuẩn chính tả: 'suôn sẻ'" },
  { pattern: /\bsuông sẻ\b/gi, replacement: 'suôn sẻ', reason: "Chuẩn chính tả: 'suôn sẻ'" },
  { pattern: /\bxăm soi\b/gi, replacement: 'săm soi', reason: "Chuẩn chính tả: 'săm soi'" },
  { pattern: /\bsát sao\b/gi, replacement: 'sát sao', reason: "Chuẩn chính tả: 'sát sao'" },
  { pattern: /\bxát xao\b/gi, replacement: 'sát sao', reason: "Chuẩn chính tả: 'sát sao'" },
  { pattern: /\bsơ sài\b/gi, replacement: 'sơ sài', reason: "Chuẩn chính tả: 'sơ sài'" },
  { pattern: /\bxơ xài\b/gi, replacement: 'sơ sài', reason: "Chuẩn chính tả: 'sơ sài'" },
  { pattern: /\bsử lý\b/gi, replacement: 'xử lý', reason: "Chuẩn chính tả: 'xử lý'" },
  { pattern: /\bxử dụng\b/gi, replacement: 'sử dụng', reason: "Chuẩn chính tả: 'sử dụng'" },
  { pattern: /\bsuất sứ\b/gi, replacement: 'xuất xứ', reason: "Chuẩn chính tả: 'xuất xứ'" },
  { pattern: /\bxuất sứ\b/gi, replacement: 'xuất xứ', reason: "Chuẩn chính tả: 'xuất xứ'" },
  { pattern: /\btinh sảo\b/gi, replacement: 'tinh xảo', reason: "Chuẩn chính tả: 'tinh xảo'" },
  { pattern: /\bxành điệu\b/gi, replacement: 'sành điệu', reason: "Chuẩn chính tả: 'sành điệu'" },
  { pattern: /\bxử sự\b/gi, replacement: 'xử sự', reason: "Chuẩn chính tả: 'xử sự'" },
  { pattern: /\bsử sự\b/gi, replacement: 'xử sự', reason: "Chuẩn chính tả: 'xử sự'" },
  { pattern: /\bdấu giếm\b/gi, replacement: 'giấu giếm', reason: "Chuẩn chính tả: 'giấu giếm'" },
  { pattern: /\bdấu diếm\b/gi, replacement: 'giấu giếm', reason: "Chuẩn chính tả: 'giấu giếm'" },
  { pattern: /\bgiành cho\b/gi, replacement: 'dành cho', reason: "Chuẩn chính tả: 'dành cho' (tặng/chỉ định)" },
  { pattern: /\bgiành riêng\b/gi, replacement: 'dành riêng', reason: "Chuẩn chính tả: 'dành riêng'" },
  { pattern: /\bdành giật\b/gi, replacement: 'giành giật', reason: "Chuẩn chính tả: 'giành giật' (tranh đoạt)" },
  { pattern: /\btranh dành\b/gi, replacement: 'tranh giành', reason: "Chuẩn chính tả: 'tranh giành'" },
  { pattern: /\bdùm\b/gi, replacement: 'giùm', reason: "Chuẩn chính tả: 'giùm' (nhờ vả)" },
  { pattern: /\bdỏ hàng\b/gi, replacement: 'giỏ hàng', reason: "Chuẩn chính tả: 'giỏ hàng'" },
  { pattern: /\bzỏ hàng\b/gi, replacement: 'giỏ hàng', reason: "Chuẩn chính tả: 'giỏ hàng'" },
  { pattern: /\bdao hàng\b/gi, replacement: 'giao hàng', reason: "Chuẩn chính tả: 'giao hàng'" },
  { pattern: /\bdá rẻ\b/gi, replacement: 'giá rẻ', reason: "Chuẩn chính tả: 'giá rẻ'" },
  { pattern: /\bzá rẻ\b/gi, replacement: 'giá rẻ', reason: "Chuẩn chính tả: 'giá rẻ'" },
  { pattern: /\bdải pháp\b/gi, replacement: 'giải pháp', reason: "Chuẩn chính tả: 'giải pháp'" },
  { pattern: /\bdao diện\b/gi, replacement: 'giao diện', reason: "Chuẩn chính tả: 'giao diện'" },
  { pattern: /\bgiả cả\b/gi, replacement: 'giá cả', reason: "Chuẩn chính tả: 'giá cả'" },
  { pattern: /\btuyệt dời\b/gi, replacement: 'tuyệt vời', reason: "Chuẩn chính tả: 'tuyệt vời'" },
  { pattern: /\btuyệt zời\b/gi, replacement: 'tuyệt vời', reason: "Chuẩn chính tả: 'tuyệt vời'" },
  { pattern: /\bvừa dặn\b/gi, replacement: 'vừa vặn', reason: "Chuẩn chính tả: 'vừa vặn'" },

  // 3. Phân biệt Tr / Ch
  { pattern: /\btrân thực\b/gi, replacement: 'chân thực', reason: "Chuẩn chính tả: 'chân thực'" },
  { pattern: /\bchân trọng\b/gi, replacement: 'trân trọng', reason: "Chuẩn chính tả: 'trân trọng'" },
  { pattern: /\btri tiết\b/gi, replacement: 'chi tiết', reason: "Chuẩn chính tả: 'chi tiết'" },
  { pattern: /\bchải nghiệm\b/gi, replacement: 'trải nghiệm', reason: "Chuẩn chính tả: 'trải nghiệm'" },
  { pattern: /\bchực quan\b/gi, replacement: 'trực quan', reason: "Chuẩn chính tả: 'trực quan'" },
  { pattern: /\btrắc trắn\b/gi, replacement: 'chắc chắn', reason: "Chuẩn chính tả: 'chắc chắn'" },
  { pattern: /\bchắt chắn\b/gi, replacement: 'chắc chắn', reason: "Chuẩn chính tả: 'chắc chắn'" },
  { pattern: /\bchắc chán\b/gi, replacement: 'chắc chắn', reason: "Chuẩn chính tả: 'chắc chắn'" },
  { pattern: /\bchứng minh\b/gi, replacement: 'chứng minh', reason: "Chuẩn chính tả: 'chứng minh'" },

  // 4. Phân biệt Âm Cuối N / NG, T / C
  { pattern: /\bmịn màn\b/gi, replacement: 'mịn màng', reason: "Chuẩn chính tả: 'mịn màng'" },
  { pattern: /\bthắm nhanh\b/gi, replacement: 'thấm nhanh', reason: "Chuẩn chính tả: 'thấm nhanh'" },
  { pattern: /\bchóng nước\b/gi, replacement: 'chống nước', reason: "Chuẩn chính tả: 'chống nước'" },
  { pattern: /\bchốn nước\b/gi, replacement: 'chống nước', reason: "Chuẩn chính tả: 'chống nước'" },
  { pattern: /\bđặc hàng\b/gi, replacement: 'đặt hàng', reason: "Chuẩn chính tả: 'đặt hàng'" },
  { pattern: /\bchất lượn\b/gi, replacement: 'chất lượng', reason: "Chuẩn chính tả: 'chất lượng'" },
  { pattern: /\bchất lựơng\b/gi, replacement: 'chất lượng', reason: "Chuẩn chính tả: 'chất lượng'" },
  { pattern: /\btrắn sáng\b/gi, replacement: 'trắng sáng', reason: "Chuẩn chính tả: 'trắng sáng'" },
  { pattern: /\btiếc kiệm\b/gi, replacement: 'tiết kiệm', reason: "Chuẩn chính tả: 'tiết kiệm'" },
  { pattern: /\bđúng đắng\b/gi, replacement: 'đúng đắn', reason: "Chuẩn chính tả: 'đúng đắn'" },
  { pattern: /\bđóng gối\b/gi, replacement: 'đóng gói', reason: "Chuẩn chính tả: 'đóng gói'" },
  { pattern: /\bsán mịn\b/gi, replacement: 'sáng mịn', reason: "Chuẩn chính tả: 'sáng mịn'" },
  { pattern: /\bbắc mắt\b/gi, replacement: 'bắt mắt', reason: "Chuẩn chính tả: 'bắt mắt'" },
  { pattern: /\btiện ít\b/gi, replacement: 'tiện ích', reason: "Chuẩn chính tả: 'tiện ích'" },
  { pattern: /\brạng ngờ\b/gi, replacement: 'rạng ngời', reason: "Chuẩn chính tả: 'rạng ngời'" },
  { pattern: /\brạn ngời\b/gi, replacement: 'rạng ngời', reason: "Chuẩn chính tả: 'rạng ngời'" },
  { pattern: /\bvướn mắc\b/gi, replacement: 'vướng mắc', reason: "Chuẩn chính tả: 'vướng mắc'" },
  { pattern: /\bnhỏ gòn\b/gi, replacement: 'nhỏ gọn', reason: "Chuẩn chính tả: 'nhỏ gọn'" },
  { pattern: /\bthan toán\b/gi, replacement: 'thanh toán', reason: "Chuẩn chính tả: 'thanh toán'" },
  { pattern: /\bcấm sạc\b/gi, replacement: 'cắm sạc', reason: "Chuẩn chính tả: 'cắm sạc'" },
  { pattern: /\bnắp đập\b/gi, replacement: 'nắp đậy', reason: "Chuẩn chính tả: 'nắp đậy'" },
  { pattern: /\bđầm tai\b/gi, replacement: 'đầm tay', reason: "Chuẩn chính tả: 'đầm tay'" },
  { pattern: /\bpin châu\b/gi, replacement: 'pin trâu', reason: "Chuẩn chính tả: 'pin trâu'" },
  { pattern: /\bbàn hoàn\b/gi, replacement: 'bàng hoàng', reason: "Chuẩn chính tả: 'bàng hoàng'" },
  { pattern: /\bngoại mục\b/gi, replacement: 'ngoạn mục', reason: "Chuẩn chính tả: 'ngoạn mục'" },
  { pattern: /\bbão vệ\b/gi, replacement: 'bảo vệ', reason: "Chuẩn chính tả: 'bảo vệ'" },
  { pattern: /\bnguyên vẹn\b/gi, replacement: 'nguyên vẹn', reason: "Chuẩn chính tả: 'nguyên vẹn'" },

  // 5. Khắc phục Lỗi Gõ Telex / VNI / Dính Phím
  { pattern: /\bdd([a-zà-ỹ0-9])/gi, replacement: 'đ$1', reason: "Sửa lỗi gõ dính phím 'dd' -> 'đ'" },
  { pattern: /\b([a-zà-ỹ0-9])dd\b/gi, replacement: '$1đ', reason: "Sửa lỗi gõ dính phím 'dd'" },
  { pattern: /\bduwocj\b/gi, replacement: 'được', reason: "Sửa lỗi gõ Telex 'duwocj' -> 'được'" },
  { pattern: /\bdduocj\b/gi, replacement: 'được', reason: "Sửa lỗi gõ Telex 'dduocj' -> 'được'" },
  { pattern: /\bdduowcj\b/gi, replacement: 'được', reason: "Sửa lỗi gõ Telex 'dduowcj' -> 'được'" },
  { pattern: /\bnhieeuf\b/gi, replacement: 'nhiều', reason: "Sửa lỗi gõ Telex 'nhieeuf' -> 'nhiều'" },
  { pattern: /\bnguwowfi\b/gi, replacement: 'người', reason: "Sửa lỗi gõ Telex 'nguwowfi' -> 'người'" },
  { pattern: /\bnguoi\b/gi, replacement: 'người', reason: "Chuẩn hóa từ thiếu dấu 'người'" },
  { pattern: /\bkhonog\b/gi, replacement: 'không', reason: "Sửa lỗi gõ Telex 'khonog' -> 'không'" },
  { pattern: /\bkhong\b/gi, replacement: 'không', reason: "Chuẩn hóa từ thiếu dấu 'không'" },
  { pattern: /\bthoong\b/gi, replacement: 'thông', reason: "Sửa lỗi gõ Telex 'thoong' -> 'thông'" },
  { pattern: /\btoots\b/gi, replacement: 'tốt', reason: "Sửa lỗi gõ Telex 'toots' -> 'tốt'" },
  { pattern: /\bbieets\b/gi, replacement: 'biết', reason: "Sửa lỗi gõ Telex 'bieets' -> 'biết'" },
  { pattern: /\bmays\b/gi, replacement: 'máy', reason: "Sửa lỗi gõ Telex 'mays' -> 'máy'" },
  { pattern: /\bcuar\b/gi, replacement: 'của', reason: "Sửa lỗi gõ Telex 'cuar' -> 'của'" },
  { pattern: /\bmoij\b/gi, replacement: 'mọi', reason: "Sửa lỗi gõ Telex 'moij' -> 'mọi'" },
  { pattern: /\bchiecs\b/gi, replacement: 'chiếc', reason: "Sửa lỗi gõ Telex 'chiecs' -> 'chiếc'" },
  { pattern: /\bmoons\b/gi, replacement: 'món', reason: "Sửa lỗi gõ Telex 'moons' -> 'món'" },
  { pattern: /\bcungx\b/gi, replacement: 'cũng', reason: "Sửa lỗi gõ Telex 'cungx' -> 'cũng'" },
  { pattern: /\bnhuw\b/gi, replacement: 'như', reason: "Sửa lỗi gõ Telex 'nhuw' -> 'như'" },
  { pattern: /\bphari\b/gi, replacement: 'phải', reason: "Sửa lỗi gõ Telex 'phari' -> 'phải'" },
  { pattern: /\braats\b/gi, replacement: 'rất', reason: "Sửa lỗi gõ Telex 'raats' -> 'rất'" },
  { pattern: /\bmootj\b/gi, replacement: 'một', reason: "Sửa lỗi gõ Telex 'mootj' -> 'một'" },
  { pattern: /\btuyeetj\b/gi, replacement: 'tuyệt', reason: "Sửa lỗi gõ Telex 'tuyeetj' -> 'tuyệt'" },
  { pattern: /\bvowfi\b/gi, replacement: 'vời', reason: "Sửa lỗi gõ Telex 'vowfi' -> 'vời'" },
  { pattern: /\blaafm\b/gi, replacement: 'làm', reason: "Sửa lỗi gõ Telex 'laafm' -> 'làm'" },
  { pattern: /\bthựcc\b/gi, replacement: 'thực', reason: "Sửa lỗi nhân đôi ký tự 'thựcc' -> 'thực'" },
  { pattern: /\bđượcc\b/gi, replacement: 'được', reason: "Sửa lỗi nhân đôi ký tự 'đượcc' -> 'được'" },
  { pattern: /\bquáa\b/gi, replacement: 'quá', reason: "Sửa lỗi nhân đôi ký tự 'quáa' -> 'quá'" },
  { pattern: /\bđẹpp\b/gi, replacement: 'đẹp', reason: "Sửa lỗi nhân đôi ký tự 'đẹpp' -> 'đẹp'" },
  { pattern: /\bluônn\b/gi, replacement: 'luôn', reason: "Sửa lỗi nhân đôi ký tự 'luônn' -> 'luôn'" },
  { pattern: /\bnèe\b/gi, replacement: 'nè', reason: "Sửa lỗi nhân đôi ký tự 'nèe' -> 'nè'" },
  { pattern: /\bnhaa\b/gi, replacement: 'nha', reason: "Sửa lỗi nhân đôi ký tự 'nhaa' -> 'nha'" },
  { pattern: /\blắmm\b/gi, replacement: 'lắm', reason: "Sửa lỗi nhân đôi ký tự 'lắmm' -> 'lắm'" },
  { pattern: /\brấtt\b/gi, replacement: 'rất', reason: "Sửa lỗi nhân đôi ký tự 'rấtt' -> 'rất'" },
  { pattern: /\bxịnn\b/gi, replacement: 'xịn', reason: "Sửa lỗi nhân đôi ký tự 'xịnn' -> 'xịn'" },

  // Sửa lỗi gõ dính phím, lỗi OCR hoặc phiên âm món ăn, ẩm thực & phụ đề ngắn
  { pattern: /\bmđóm\s+iếng\b/gi, replacement: 'mỗi miếng', reason: "Sửa lỗi nhận diện/dính phím 'mđóm iếng' -> 'mỗi miếng'" },
  { pattern: /\bmđom\s+iếng\b/gi, replacement: 'mỗi miếng', reason: "Sửa lỗi nhận diện/dính phím 'mđom iếng' -> 'mỗi miếng'" },
  { pattern: /\bmđón\s+iếng\b/gi, replacement: 'mỗi miếng', reason: "Sửa lỗi nhận diện/dính phím 'mđón iếng' -> 'mỗi miếng'" },
  { pattern: /\bmđóm\s+miếng\b/gi, replacement: 'mỗi miếng', reason: "Sửa lỗi nhận diện 'mđóm miếng' -> 'mỗi miếng'" },
  { pattern: /\bmđóm\b/gi, replacement: 'món', reason: "Sửa lỗi gõ/nhận diện sai 'mđóm' -> 'món'" },
  { pattern: /\bmđon\b/gi, replacement: 'món', reason: "Sửa lỗi nhận diện 'mđon' -> 'món'" },
  { pattern: /\bmđom\b/gi, replacement: 'món', reason: "Sửa lỗi nhận diện 'mđom' -> 'món'" },
  { pattern: /\biếng\s+(chuối|bánh|thịt|cá|trái|hoa|đậu|chả|gà|bò)/gi, replacement: 'miếng $1', reason: "Sửa lỗi gõ thiếu phụ âm đầu 'iếng' -> 'miếng'" },
  { pattern: /\bliu\s+r\.+u\b/gi, replacement: 'liu riu', reason: "Sửa chính tả nấu nướng 'liu riu'" },
  { pattern: /\bliu\s+riu\b/gi, replacement: 'liu riu', reason: "Chuẩn hóa 'liu riu'" },
  { pattern: /\bliuriu\b/gi, replacement: 'liu riu', reason: "Tách từ 'liu riu'" },
  { pattern: /\br\.+u\b/gi, replacement: 'riu', reason: "Sửa lỗi dính dấu chấm 'r.u' -> 'riu'" },
  { pattern: /\bchuối\s+nam\b/gi, replacement: 'chuối xiêm', reason: "Chuẩn hóa tên chuối Nam Bộ: 'chuối xiêm'" },
  { pattern: /\bchuốinam\b/gi, replacement: 'chuối xiêm', reason: "Tách từ dính phím 'chuối xiêm'" },
  { pattern: /\bmiếngchuối\b/gi, replacement: 'miếng chuối', reason: "Tách từ dính phím 'miếng chuối'" },
  { pattern: /\bchuốixiêm\b/gi, replacement: 'chuối xiêm', reason: "Tách từ dính phím 'chuối xiêm'" },
  { pattern: /\bbánhchuối\b/gi, replacement: 'bánh chuối', reason: "Tách từ dính phím 'bánh chuối'" },
  { pattern: /\bmónăn\b/gi, replacement: 'món ăn', reason: "Tách từ dính phím 'món ăn'" },
  { pattern: /\bthơmngon\b/gi, replacement: 'thơm ngon', reason: "Tách từ dính phím 'thơm ngon'" },
  { pattern: /\bbéongậy\b/gi, replacement: 'béo ngậy', reason: "Tách từ dính phím 'béo ngậy'" },
  { pattern: /\bgiònrụm\b/gi, replacement: 'giòn rụm', reason: "Tách từ dính phím 'giòn rụm'" },
  { pattern: /\bđậmđà\b/gi, replacement: 'đậm đà', reason: "Tách từ dính phím 'đậm đà'" },
  { pattern: /\b(chiên|vàng|ngon|rất|da)\s+zòn\b/gi, replacement: '$1 giòn', reason: "Chuẩn chính tả: '$1 giòn'" },
  { pattern: /\b(chiên|vàng|ngon|rất|da)\s+dòn\b/gi, replacement: '$1 giòn', reason: "Chuẩn chính tả: '$1 giòn'" },
  { pattern: /\bvàng\s+dòn\b/gi, replacement: 'vàng giòn', reason: "Chuẩn chính tả: 'vàng giòn'" },
  { pattern: /\bvàng\s+zòn\b/gi, replacement: 'vàng giòn', reason: "Chuẩn chính tả: 'vàng giòn'" },
  { pattern: /\bchiên\s+dòn\b/gi, replacement: 'chiên giòn', reason: "Chuẩn chính tả: 'chiên giòn'" },
  { pattern: /\bchiên\s+zòn\b/gi, replacement: 'chiên giòn', reason: "Chuẩn chính tả: 'chiên giòn'" },
  { pattern: /\bdòn\s+rụm\b/gi, replacement: 'giòn rụm', reason: "Chuẩn chính tả: 'giòn rụm'" },
  { pattern: /\bzòn\s+rụm\b/gi, replacement: 'giòn rụm', reason: "Chuẩn chính tả: 'giòn rụm'" },
  { pattern: /\bzòn\b/gi, replacement: 'giòn', reason: "Chuẩn chính tả: 'giòn'" },
  { pattern: /\bdòn\b/gi, replacement: 'giòn', reason: "Chuẩn chính tả: 'giòn'" },
  { pattern: /\bthơm\s+phứt\b/gi, replacement: 'thơm phức', reason: "Chuẩn chính tả: 'thơm phức'" },
  { pattern: /\bnóng\s+hỗi\b/gi, replacement: 'nóng hổi', reason: "Chuẩn chính tả: 'nóng hổi' (dấu hỏi)" },
  { pattern: /\bdầu\s+mở\b/gi, replacement: 'dầu mỡ', reason: "Chuẩn chính tả: 'dầu mỡ' (dấu ngã)" },
  { pattern: /\bkhuấy\s+đều\b/gi, replacement: 'khuấy đều', reason: "Chuẩn chính tả: 'khuấy đều'" },
  { pattern: /\bquấy\s+đều\b/gi, replacement: 'khuấy đều', reason: "Chuẩn hóa ẩm thực Nam Bộ: 'khuấy đều'" },
  { pattern: /\bthơm\s+nức\s+mủi\b/gi, replacement: 'thơm nức mũi', reason: "Chuẩn chính tả: 'thơm nức mũi' (dấu ngã)" },
  { pattern: /\bướp\s+da\s+vị\b/gi, replacement: 'ướp gia vị', reason: "Chuẩn chính tả: 'ướp gia vị'" },
  { pattern: /\bngon\s+miệng\b/gi, replacement: 'ngon miệng', reason: "Chuẩn chính tả: 'ngon miệng'" },

  // 6. Modern Standard Vietnamese Tone Placement (Quy chuẩn vị trí dấu thanh Bộ GD&ĐT)
  { pattern: /\bhoà\b/gi, replacement: 'hòa', reason: "Chuẩn hóa vị trí dấu thanh: 'hòa'" },
  { pattern: /\bhoá\b/gi, replacement: 'hóa', reason: "Chuẩn hóa vị trí dấu thanh: 'hóa'" },
  { pattern: /\bhoàn\b/gi, replacement: 'hoàn', reason: "Chuẩn hóa vị trí dấu thanh: 'hoàn'" },
  { pattern: /\bhoặc\b/gi, replacement: 'hoặc', reason: "Chuẩn hóa vị trí dấu thanh: 'hoặc'" },
  { pattern: /\btoả\b/gi, replacement: 'tỏa', reason: "Chuẩn hóa vị trí dấu thanh: 'tỏa'" },
  { pattern: /\btoán\b/gi, replacement: 'toán', reason: "Chuẩn hóa vị trí dấu thanh: 'toán'" },
  { pattern: /\bthuỷ\b/gi, replacement: 'thủy', reason: "Chuẩn hóa vị trí dấu thanh: 'thủy'" },
  { pattern: /\bthuý\b/gi, replacement: 'thúy', reason: "Chuẩn hóa vị trí dấu thanh: 'thúy'" },
  { pattern: /\bkhoẻ\b/gi, replacement: 'khỏe', reason: "Chuẩn hóa vị trí dấu thanh: 'khỏe'" },
  { pattern: /\bhuỷ\b/gi, replacement: 'hủy', reason: "Chuẩn hóa vị trí dấu thanh: 'hủy'" },
  { pattern: /\bquỳ\b/gi, replacement: 'quỳ', reason: "Chuẩn hóa vị trí dấu thanh: 'quỳ'" },
  { pattern: /\bquý\b/gi, replacement: 'quý', reason: "Chuẩn hóa vị trí dấu thanh: 'quý'" },

  // 7. Southern Vietnamese Dialect Normalization (Đồng bộ tuyệt đối ngữ điệu Nam Bộ / Sài Gòn ngọt ngào)
  { pattern: /\bnhé cả nhà\b/gi, replacement: 'nha cả nhà', reason: "Chuẩn hóa Nam Bộ: 'nha cả nhà'" },
  { pattern: /\bnhé mọi người\b/gi, replacement: 'nha cả nhà', reason: "Chuẩn hóa Nam Bộ: 'nha cả nhà'" },
  { pattern: /\bnhé các bạn\b/gi, replacement: 'nha mấy bạn', reason: "Chuẩn hóa Nam Bộ: 'nha mấy bạn'" },
  { pattern: /\bnhé bạn\b/gi, replacement: 'nha bạn', reason: "Chuẩn hóa Nam Bộ: 'nha bạn'" },
  { pattern: /\bnhé\b/gi, replacement: 'nha', reason: "Chuẩn hóa Nam Bộ: 'nha'" },
  { pattern: /\bnhá\b/gi, replacement: 'nha', reason: "Chuẩn hóa Nam Bộ: 'nha'" },
  { pattern: /\bnhỉ\b/gi, replacement: 'nha', reason: "Chuẩn hóa Nam Bộ: 'nha'" },
  { pattern: /\bthật sự\b/gi, replacement: 'thiệt sự', reason: "Chuẩn hóa Nam Bộ: 'thiệt sự'" },
  { pattern: /\bthật là\b/gi, replacement: 'thiệt là', reason: "Chuẩn hóa Nam Bộ: 'thiệt là'" },
  { pattern: /\bthật ra\b/gi, replacement: 'thiệt ra', reason: "Chuẩn hóa Nam Bộ: 'thiệt ra'" },
  { pattern: /\bthật luôn\b/gi, replacement: 'thiệt luôn', reason: "Chuẩn hóa Nam Bộ: 'thiệt luôn'" },
  { pattern: /\bthật đấy\b/gi, replacement: 'thiệt đó', reason: "Chuẩn hóa Nam Bộ: 'thiệt đó'" },
  { pattern: /\bxem thử\b/gi, replacement: 'coi thử', reason: "Chuẩn hóa Nam Bộ: 'coi thử'" },
  { pattern: /\bxem ngay\b/gi, replacement: 'coi ngay', reason: "Chuẩn hóa Nam Bộ: 'coi ngay'" },
  { pattern: /\bxem kỹ\b/gi, replacement: 'coi kỹ', reason: "Chuẩn hóa Nam Bộ: 'coi kỹ'" },
  { pattern: /\bnhìn vào\b/gi, replacement: 'nhìn vô', reason: "Chuẩn hóa Nam Bộ: 'nhìn vô'" },
  { pattern: /\bbước vào\b/gi, replacement: 'bước vô', reason: "Chuẩn hóa Nam Bộ: 'bước vô'" },
  { pattern: /\bcho vào\b/gi, replacement: 'cho vô', reason: "Chuẩn hóa Nam Bộ: 'cho vô'" },
  { pattern: /\bbỏ vào\b/gi, replacement: 'bỏ vô', reason: "Chuẩn hóa Nam Bộ: 'bỏ vô'" },
  { pattern: /\bcất vào\b/gi, replacement: 'cất vô', reason: "Chuẩn hóa Nam Bộ: 'cất vô'" },
  { pattern: /\bthìa\b/gi, replacement: 'muỗng', reason: "Chuẩn hóa Nam Bộ: 'muỗng'" },
  { pattern: /\bbát ăn\b/gi, replacement: 'chén ăn', reason: "Chuẩn hóa Nam Bộ: 'chén ăn'" },
  { pattern: /\bhoa quả\b/gi, replacement: 'trái cây', reason: "Chuẩn hóa Nam Bộ: 'trái cây'" },
  { pattern: /\bchúng mình\b/gi, replacement: 'tụi mình', reason: "Chuẩn hóa Nam Bộ: 'tụi mình'" },
  { pattern: /\bchúng tôi\b/gi, replacement: 'tụi mình', reason: "Chuẩn hóa Nam Bộ: 'tụi mình'" },
  { pattern: /\bthế này nè\b/gi, replacement: 'như vầy nè', reason: "Chuẩn hóa Nam Bộ: 'như vầy nè'" },
  { pattern: /\bthế này\b/gi, replacement: 'như vầy', reason: "Chuẩn hóa Nam Bộ: 'như vầy'" },
  { pattern: /(\d+)\s*nghìn\b/gi, replacement: '$1 ngàn', reason: "Chuẩn hóa tiền tệ Nam Bộ: 'ngàn'" },

  // 8. Punctuation spacing & typography formatting
  { pattern: /\s+([,.\?!;:\u2026])/g, replacement: '$1', reason: "Loại bỏ khoảng trắng trước dấu câu" },
  { pattern: /([,;:])([^\s\d])/g, replacement: '$1 $2', reason: "Thêm khoảng trắng sau dấu câu" },
  { pattern: /\.{3,}/g, replacement: '…', reason: "Chuẩn hóa dấu ba chấm thành '…'" }
];

/**
 * Helper to convert ASCII word boundaries to true Unicode Vietnamese character boundaries
 */
function toUnicodeBoundaryRegex(regex: RegExp): RegExp {
  let src = regex.source;
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
  let flags = regex.flags;
  if (!flags.includes('u')) flags += 'u';
  if (!flags.includes('g')) flags += 'g';
  if (!flags.includes('i')) flags += 'i';
  return new RegExp(src, flags);
}

// Pre-compiled unicode-aware rules cache for optimal zero-overhead performance
const COMPILED_VIETNAMESE_SPELL_RULES = VIETNAMESE_SPELL_RULES.map(rule => ({
  pattern: toUnicodeBoundaryRegex(rule.pattern),
  replacement: rule.replacement,
  reason: rule.reason
}));

/**
 * Intelligent Vietnamese Spell & Grammar Corrector
 * Fixes spelling, accents, typos, and typography while preserving capitalization structure.
 */
export function correctVietnameseSpelling(text: string): { correctedText: string; fixes: SpellingCorrection[] } {
  if (!text) return { correctedText: "", fixes: [] };

  // Normalize to standard NFC Unicode to prevent any decomposed character font issues
  let corrected = text.normalize('NFC');
  const fixes: SpellingCorrection[] = [];

  for (const rule of COMPILED_VIETNAMESE_SPELL_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(corrected)) {
      rule.pattern.lastIndex = 0;
      const originalMatches = corrected.match(rule.pattern);
      if (originalMatches) {
        originalMatches.forEach(m => {
          const replacementStr = typeof rule.replacement === 'function' 
            ? rule.replacement(m) 
            : preserveCase(m, rule.replacement);
          fixes.push({
            original: m,
            replacement: replacementStr,
            reason: rule.reason
          });
        });
      }
      rule.pattern.lastIndex = 0;
      corrected = corrected.replace(rule.pattern, (match, ...args) => {
        if (typeof rule.replacement === 'function') {
          return rule.replacement(match, ...args);
        }
        let rep = rule.replacement;
        if (typeof rep === 'string' && rep.includes('$1') && args[0] !== undefined) {
          rep = rep.replace('$1', String(args[0]));
        }
        if (typeof rep === 'string' && rep.includes('$2') && args[1] !== undefined) {
          rep = rep.replace('$2', String(args[1]));
        }
        return preserveCase(match, rep);
      });
      rule.pattern.lastIndex = 0;
    }
  }

  // Capitalize sentence start after periods, question marks, exclamation marks, or line beginnings
  corrected = corrected.replace(/(^|[.?!]\s+)([a-zà-ỹ])/g, (_, p1, p2) => p1 + p2.toUpperCase());

  // Clean redundant spaces
  corrected = corrected.replace(/\s{2,}/g, ' ').trim();

  return {
    correctedText: corrected,
    fixes
  };
}

/**
 * Audit and Fix Subtitle Segments with full timing preservation and intelligent phrase boundary polishing
 */
export function auditAndFixSubtitlesSpelling(subtitles: Array<{ text: string; start: number; end: number; translation?: string }>): {
  fixedSubtitles: Array<{ text: string; start: number; end: number; translation?: string }>;
  fixCount: number;
  fixedItems: Array<{ index: number; before: string; after: string; reason: string }>;
} {
  if (!subtitles || subtitles.length === 0) {
    return { fixedSubtitles: [], fixCount: 0, fixedItems: [] };
  }

  const fixedItems: Array<{ index: number; before: string; after: string; reason: string }> = [];
  let totalFixCount = 0;

  const fixedSubtitles = subtitles.map((sub, idx) => {
    const rawText = (sub.text || "").trim();
    // Clean unwanted markdown symbols and script prefixes
    let clean = rawText
      .replace(/[*#_`~\[\]\(\)]/g, '')
      .replace(/^(Subtitle|Lời thoại|KOL|MC|Voiceover|Host|Phân cảnh \d+|Scene \d+):\s*/gi, '')
      .trim();

    const result = correctVietnameseSpelling(clean);
    let finalText = result.correctedText;

    // Remove dangling trailing period or comma in short subtitle frames (TikTok/Reels subtitle standard)
    // Keep '?', '!', '…' which are expressive
    finalText = finalText.replace(/[.,]+$/g, '').trim();

    // Ensure first letter of subtitle segment is capitalized
    if (finalText.length > 0) {
      finalText = finalText.charAt(0).toUpperCase() + finalText.slice(1);
    }

    if (finalText !== rawText) {
      totalFixCount++;
      fixedItems.push({
        index: idx,
        before: rawText,
        after: finalText,
        reason: result.fixes.length > 0 ? result.fixes[0].reason : "Chuẩn hóa chính tả, dấu thanh & cắt gọn phụ đề"
      });
    }

    return {
      ...sub,
      text: finalText
    };
  });

  return {
    fixedSubtitles,
    fixCount: totalFixCount,
    fixedItems
  };
}


