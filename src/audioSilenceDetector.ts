/**
 * Audio Silence & Speech Activity Detector (VAD)
 * Analyzes audio streams/blobs using the Web Audio API to detect:
 * 1. Silence pauses (breath, commas, sentence transitions)
 * 2. Speech activity intervals (actual spoken words/phrases)
 * 3. Proposes optimal subtitle segment timings snapped to real speech boundaries
 */

export interface SpeechInterval {
  start: number;
  end: number;
  duration: number;
  peakRms: number;
  averageRms: number;
}

export interface SilenceGap {
  start: number;
  end: number;
  duration: number;
}

export interface SubtitleTimingAdjustment {
  index: number;
  text: string;
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  deltaStart: number;
  deltaEnd: number;
  matchedSpeechStart?: number;
  matchedSpeechEnd?: number;
}

export interface SilenceDetectionResult {
  totalDuration: number;
  speechIntervals: SpeechInterval[];
  silenceGaps: SilenceGap[];
  waveformData: { time: number; rms: number; isSpeech: boolean }[];
  averageSpeechRms: number;
  noiseFloorRms: number;
  thresholdDbUsed: number;
  adjustments: SubtitleTimingAdjustment[];
  alignedSubtitles: { start: number; end: number; text: string; sentenceIndex?: number; translation?: string }[];
}

export interface SilenceDetectionOptions {
  thresholdDb?: number;        // Energy threshold in dB (e.g. -38 dB)
  minSilenceDurationSec?: number; // Minimum gap duration to count as silence (e.g. 0.22s)
  minSpeechDurationSec?: number;  // Minimum speech chunk duration (e.g. 0.18s)
  startPaddingSec?: number;       // Safety buffer before speech start (e.g. 0.04s)
  endPaddingSec?: number;         // Safety buffer after speech end (e.g. 0.08s)
}

/**
 * Decode audio from URL or Blob into an AudioBuffer using Web Audio API
 */
export async function decodeAudioFromSource(source: string | Blob): Promise<AudioBuffer> {
  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtxClass) {
    throw new Error("Trình duyệt không hỗ trợ Web Audio API.");
  }
  const audioCtx = new AudioCtxClass();

  try {
    let arrayBuffer: ArrayBuffer;
    if (typeof source === 'string') {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Không thể nạp tệp âm thanh (${response.statusText}).`);
      }
      arrayBuffer = await response.arrayBuffer();
    } else {
      arrayBuffer = await source.arrayBuffer();
    }

    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } finally {
    if (audioCtx.state !== 'closed') {
      try {
        await audioCtx.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

/**
 * Analyze an AudioBuffer to detect speech intervals and silence gaps
 */
export function analyzeAudioBufferSilence(
  buffer: AudioBuffer,
  options: SilenceDetectionOptions = {}
): {
  totalDuration: number;
  speechIntervals: SpeechInterval[];
  silenceGaps: SilenceGap[];
  waveformData: { time: number; rms: number; isSpeech: boolean }[];
  averageSpeechRms: number;
  noiseFloorRms: number;
  thresholdDbUsed: number;
} {
  const sampleRate = buffer.sampleRate;
  const totalDuration = buffer.duration;
  const numChannels = buffer.numberOfChannels;
  
  // Downmix to mono channel data
  const length = buffer.length;
  const monoData = new Float32Array(length);
  
  if (numChannels === 1) {
    monoData.set(buffer.getChannelData(0));
  } else {
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      monoData[i] = (ch0[i] + ch1[i]) * 0.5;
    }
  }

  // Window frame parameters (~20ms per window)
  const windowSize = Math.max(256, Math.floor(sampleRate * 0.02)); // 20ms
  const hopSize = Math.floor(windowSize * 0.5); // 10ms hop (50% overlap)
  const numFrames = Math.floor((length - windowSize) / hopSize);

  // Compute RMS for each window frame
  const frameTimes = new Float32Array(numFrames);
  const frameRms = new Float32Array(numFrames);
  let globalMaxRms = 0;
  let globalSumRms = 0;

  for (let f = 0; f < numFrames; f++) {
    const startIdx = f * hopSize;
    let sumSquares = 0;
    for (let i = 0; i < windowSize; i++) {
      const val = monoData[startIdx + i];
      sumSquares += val * val;
    }
    const rms = Math.sqrt(sumSquares / windowSize);
    frameRms[f] = rms;
    frameTimes[f] = (startIdx + windowSize * 0.5) / sampleRate;

    if (rms > globalMaxRms) globalMaxRms = rms;
    globalSumRms += rms;
  }

  // Calculate adaptive threshold if default is used
  // User threshold in dB (e.g. -38 dB)
  const userThresholdDb = options.thresholdDb !== undefined ? options.thresholdDb : -36;
  
  // Linear threshold from dB: 10^(dB/20)
  // If globalMaxRms is very low (e.g. quiet audio), adjust threshold relative to max
  const absoluteThreshold = Math.pow(10, userThresholdDb / 20);
  const relativeThreshold = globalMaxRms * 0.08; // 8% of peak
  const effectiveThreshold = Math.max(0.0015, Math.min(absoluteThreshold, Math.max(relativeThreshold, 0.005)));

  const minSilenceFrames = Math.max(1, Math.floor((options.minSilenceDurationSec || 0.22) / (hopSize / sampleRate)));
  const minSpeechFrames = Math.max(1, Math.floor((options.minSpeechDurationSec || 0.18) / (hopSize / sampleRate)));

  // Frame-level speech classification with simple hysteresis smoothing
  const isSpeechFrame = new Uint8Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    isSpeechFrame[f] = frameRms[f] >= effectiveThreshold ? 1 : 0;
  }

  // Morphological closing: Fill short dips in speech (micro-pauses < 90ms)
  const bridgeFrames = Math.floor(0.09 / (hopSize / sampleRate));
  let zeroCount = 0;
  let zeroStart = -1;
  for (let f = 0; f < numFrames; f++) {
    if (isSpeechFrame[f] === 0) {
      if (zeroCount === 0) zeroStart = f;
      zeroCount++;
    } else {
      if (zeroCount > 0 && zeroCount <= bridgeFrames && zeroStart > 0) {
        for (let k = zeroStart; k < f; k++) {
          isSpeechFrame[k] = 1;
        }
      }
      zeroCount = 0;
    }
  }

  // Identify raw speech intervals
  const rawIntervals: { startFrame: number; endFrame: number }[] = [];
  let inSpeech = false;
  let currentStartFrame = 0;

  for (let f = 0; f < numFrames; f++) {
    if (isSpeechFrame[f] === 1 && !inSpeech) {
      inSpeech = true;
      currentStartFrame = f;
    } else if (isSpeechFrame[f] === 0 && inSpeech) {
      inSpeech = false;
      const durationFrames = f - currentStartFrame;
      if (durationFrames >= minSpeechFrames) {
        rawIntervals.push({ startFrame: currentStartFrame, endFrame: f });
      }
    }
  }
  if (inSpeech && (numFrames - currentStartFrame) >= minSpeechFrames) {
    rawIntervals.push({ startFrame: currentStartFrame, endFrame: numFrames - 1 });
  }

  // Convert raw speech intervals to SpeechInterval seconds with padding
  const speechIntervals: SpeechInterval[] = [];
  const startPadding = options.startPaddingSec !== undefined ? options.startPaddingSec : 0.04;
  const endPadding = options.endPaddingSec !== undefined ? options.endPaddingSec : 0.08;

  let totalSpeechRms = 0;
  let speechFrameCount = 0;

  for (let i = 0; i < rawIntervals.length; i++) {
    const raw = rawIntervals[i];
    const rawStartSec = frameTimes[raw.startFrame];
    const rawEndSec = frameTimes[raw.endFrame];

    const paddedStart = Math.max(0, rawStartSec - startPadding);
    const paddedEnd = Math.min(totalDuration, rawEndSec + endPadding);

    // Compute peak and average RMS for this interval
    let peakRms = 0;
    let sumRms = 0;
    for (let f = raw.startFrame; f <= raw.endFrame; f++) {
      const r = frameRms[f];
      if (r > peakRms) peakRms = r;
      sumRms += r;
      totalSpeechRms += r;
      speechFrameCount++;
    }
    const avgRms = sumRms / Math.max(1, raw.endFrame - raw.startFrame + 1);

    speechIntervals.push({
      start: Number(paddedStart.toFixed(3)),
      end: Number(paddedEnd.toFixed(3)),
      duration: Number((paddedEnd - paddedStart).toFixed(3)),
      peakRms: Number(peakRms.toFixed(4)),
      averageRms: Number(avgRms.toFixed(4))
    });
  }

  // Prevent overlap between consecutive padded speech intervals
  for (let i = 0; i < speechIntervals.length - 1; i++) {
    const current = speechIntervals[i];
    const next = speechIntervals[i + 1];
    if (current.end > next.start) {
      const mid = Number(((current.end + next.start) * 0.5).toFixed(3));
      current.end = mid;
      current.duration = Number((current.end - current.start).toFixed(3));
      next.start = mid;
      next.duration = Number((next.end - next.start).toFixed(3));
    }
  }

  // Extract silence gaps between speech intervals
  const silenceGaps: SilenceGap[] = [];
  const minSilenceSec = options.minSilenceDurationSec !== undefined ? options.minSilenceDurationSec : 0.22;

  let lastEnd = 0;
  for (let i = 0; i < speechIntervals.length; i++) {
    const sp = speechIntervals[i];
    if (sp.start - lastEnd >= minSilenceSec) {
      silenceGaps.push({
        start: Number(lastEnd.toFixed(3)),
        end: Number(sp.start.toFixed(3)),
        duration: Number((sp.start - lastEnd).toFixed(3))
      });
    }
    lastEnd = sp.end;
  }
  if (totalDuration - lastEnd >= minSilenceSec) {
    silenceGaps.push({
      start: Number(lastEnd.toFixed(3)),
      end: Number(totalDuration.toFixed(3)),
      duration: Number((totalDuration - lastEnd).toFixed(3))
    });
  }

  // Downsample waveform data to 120 points for smooth UI display
  const targetPoints = 120;
  const waveformData: { time: number; rms: number; isSpeech: boolean }[] = [];
  const pointsStep = Math.max(1, Math.floor(numFrames / targetPoints));

  for (let f = 0; f < numFrames; f += pointsStep) {
    const t = frameTimes[f];
    const r = frameRms[f];
    // Check if within any speech interval
    const isSp = speechIntervals.some(sp => t >= sp.start && t <= sp.end);
    waveformData.push({
      time: Number(t.toFixed(2)),
      rms: Number((r / Math.max(0.001, globalMaxRms)).toFixed(3)),
      isSpeech: isSp
    });
  }

  const averageSpeechRms = speechFrameCount > 0 ? (totalSpeechRms / speechFrameCount) : 0;
  const noiseFloorRms = (globalSumRms - totalSpeechRms) / Math.max(1, numFrames - speechFrameCount);

  return {
    totalDuration: Number(totalDuration.toFixed(3)),
    speechIntervals,
    silenceGaps,
    waveformData,
    averageSpeechRms: Number(averageSpeechRms.toFixed(4)),
    noiseFloorRms: Number(noiseFloorRms.toFixed(4)),
    thresholdDbUsed: userThresholdDb
  };
}

/**
 * Intelligent Subtitle-to-Speech Alignment Algorithm
 * Maps current subtitle segments onto detected speech intervals based on chronological
 * overlap, length proportions, and natural silence boundaries.
 */
export function alignSubtitlesWithSpeechIntervals(
  subtitles: { start: number; end: number; text: string; sentenceIndex?: number; translation?: string }[],
  speechIntervals: SpeechInterval[],
  totalDuration: number
): {
  alignedSubtitles: { start: number; end: number; text: string; sentenceIndex?: number; translation?: string }[];
  adjustments: SubtitleTimingAdjustment[];
} {
  if (!subtitles || subtitles.length === 0) {
    return { alignedSubtitles: [], adjustments: [] };
  }

  // If no speech intervals were detected (e.g. completely silent audio), return original
  if (!speechIntervals || speechIntervals.length === 0) {
    return {
      alignedSubtitles: [...subtitles],
      adjustments: subtitles.map((sub, idx) => ({
        index: idx,
        text: sub.text,
        oldStart: sub.start,
        oldEnd: sub.end,
        newStart: sub.start,
        newEnd: sub.end,
        deltaStart: 0,
        deltaEnd: 0
      }))
    };
  }

  const subCount = subtitles.length;
  const speechCount = speechIntervals.length;

  // Calculate syllable-based weights for each subtitle segment
  const subWeights = subtitles.map(sub => {
    const words = sub.text.trim().split(/\s+/).filter(Boolean);
    return Math.max(1, words.length * 0.35 + sub.text.length * 0.05);
  });
  const totalSubWeight = subWeights.reduce((a, b) => a + b, 0);

  const alignedSubtitles: { start: number; end: number; text: string; sentenceIndex?: number; translation?: string }[] = [];
  const adjustments: SubtitleTimingAdjustment[] = [];

  // CASE 1: Equal count (1-to-1 direct mapping)
  if (Math.abs(subCount - speechCount) <= 1 && subCount === speechCount) {
    for (let i = 0; i < subCount; i++) {
      const orig = subtitles[i];
      const speech = speechIntervals[i];
      const newStart = speech.start;
      const newEnd = speech.end;

      alignedSubtitles.push({
        ...orig,
        start: newStart,
        end: newEnd
      });

      adjustments.push({
        index: i,
        text: orig.text,
        oldStart: orig.start,
        oldEnd: orig.end,
        newStart,
        newEnd,
        deltaStart: Number((newStart - orig.start).toFixed(2)),
        deltaEnd: Number((newEnd - orig.end).toFixed(2)),
        matchedSpeechStart: speech.start,
        matchedSpeechEnd: speech.end
      });
    }
  } 
  // CASE 2: Subtitle count differs from speech count (Dynamic Boundary Snapping)
  else {
    // For each subtitle segment, find the closest speech interval boundaries
    // or distribute speech intervals proportionately
    const firstSpeechStart = speechIntervals[0].start;
    const lastSpeechEnd = speechIntervals[speechIntervals.length - 1].end;
    const totalSpokenSpan = Math.max(1.0, lastSpeechEnd - firstSpeechStart);

    let accumulatedWeight = 0;
    for (let i = 0; i < subCount; i++) {
      const orig = subtitles[i];
      const weight = subWeights[i];
      
      const idealStartRatio = accumulatedWeight / totalSubWeight;
      accumulatedWeight += weight;
      const idealEndRatio = accumulatedWeight / totalSubWeight;

      const idealStart = firstSpeechStart + (idealStartRatio * totalSpokenSpan);
      const idealEnd = firstSpeechStart + (idealEndRatio * totalSpokenSpan);

      // Find nearest speech boundary within 0.75s to snap to
      let bestStart = idealStart;
      let minStartDiff = 0.75;
      for (const sp of speechIntervals) {
        const diffStart = Math.abs(sp.start - idealStart);
        if (diffStart < minStartDiff) {
          minStartDiff = diffStart;
          bestStart = sp.start;
        }
      }

      let bestEnd = idealEnd;
      let minEndDiff = 0.75;
      for (const sp of speechIntervals) {
        const diffEnd = Math.abs(sp.end - idealEnd);
        if (diffEnd < minEndDiff) {
          minEndDiff = diffEnd;
          bestEnd = sp.end;
        }
      }

      // Ensure segment end > segment start + 0.35s
      if (bestEnd <= bestStart + 0.35) {
        bestEnd = Number((bestStart + Math.max(0.4, (idealEnd - idealStart))).toFixed(2));
      }

      // Cap to audio duration
      bestStart = Math.max(0, Number(bestStart.toFixed(2)));
      bestEnd = Math.min(totalDuration, Number(bestEnd.toFixed(2)));

      // Prevent overlap with previous aligned subtitle
      if (alignedSubtitles.length > 0) {
        const prev = alignedSubtitles[alignedSubtitles.length - 1];
        if (bestStart < prev.end) {
          bestStart = Number((prev.end + 0.05).toFixed(2));
          if (bestEnd <= bestStart) {
            bestEnd = Number((bestStart + 0.4).toFixed(2));
          }
        }
      }

      alignedSubtitles.push({
        ...orig,
        start: bestStart,
        end: bestEnd
      });

      adjustments.push({
        index: i,
        text: orig.text,
        oldStart: orig.start,
        oldEnd: orig.end,
        newStart: bestStart,
        newEnd: bestEnd,
        deltaStart: Number((bestStart - orig.start).toFixed(2)),
        deltaEnd: Number((bestEnd - orig.end).toFixed(2))
      });
    }
  }

  return { alignedSubtitles, adjustments };
}

/**
 * Complete Pipeline: Detects silence in audio source and computes subtitle alignment
 */
export async function detectSilenceAndAlignSubtitles(
  audioSource: string | Blob,
  currentSubtitles: { start: number; end: number; text: string; sentenceIndex?: number; translation?: string }[],
  options: SilenceDetectionOptions = {}
): Promise<SilenceDetectionResult> {
  const audioBuffer = await decodeAudioFromSource(audioSource);
  const analysis = analyzeAudioBufferSilence(audioBuffer, options);
  const { alignedSubtitles, adjustments } = alignSubtitlesWithSpeechIntervals(
    currentSubtitles,
    analysis.speechIntervals,
    analysis.totalDuration
  );

  return {
    ...analysis,
    adjustments,
    alignedSubtitles
  };
}
