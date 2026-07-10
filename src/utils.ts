/**
 * Helper to convert a raw base64 PCM 16-bit audio string (Mono, 24000Hz) 
 * into a fully standard WAV blob URL so standard HTML audio controls play it nicely.
 */
export function pcmToWav(base64Pcm: string, sampleRate: number = 24000): string {
  try {
    const binaryString = atob(base64Pcm);
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
 * Helper to programmatically generate a silent standard 16-bit Mono WAV audio file
 * of any arbitrary duration (seconds) so that the audio element controls / timeline updates
 * tick normally for subtitles and video syncing even on fallback mode!
 */
export function generateSilentWav(durationSeconds: number, sampleRate: number = 24000): string {
  try {
    const roundedDuration = Math.max(1, Math.min(180, Math.ceil(durationSeconds)));
    const numSamples = roundedDuration * sampleRate;
    const len = numSamples * 2; // 16-bit Mono
    const buffer = new ArrayBuffer(44 + len);
    const view = new DataView(buffer);
    
    // RIFF identifier
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + len, true);
    writeString(view, 8, 'WAVE');
    
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // Linear PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // 16-bit
    
    // data chunk identifier
    writeString(view, 36, 'data');
    view.setUint32(40, len, true);
    
    // Leave the data part as all zeroes (silence)
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error("Lỗi tạo âm thanh im lặng dự phòng:", err);
    return "";
  }
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
 */
export function parseMarkdown(text: string): string {
  if (!text) return '';
  return text
    // Escaping safety
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // H3 Headers
    .replace(/^### (.*$)/gim, '<h3 class="font-display font-semibold text-lg text-amber-400 mt-5 mb-2 border-b border-slate-800 pb-1">$1</h3>')
    // H4 Headers 
    .replace(/^#### (.*$)/gim, '<h4 class="font-sans font-medium text-amber-200 mt-4 mb-2">$1</h4>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-amber-300 font-semibold">$1</strong>')
    // Bullet Lists
    .replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc text-slate-300 mb-1">$1</li>')
    .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc text-slate-300 mb-1">$1</li>')
    // Line breaks
    .replace(/\n/g, '<br/>');
}
