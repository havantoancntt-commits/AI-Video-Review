import { spawn, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import type { ExportQualityTier, TikTokValidationReport, TranscodeJobStatus } from "../src/types";

export const TIKTOK_QUALITY_PRESETS: Record<
  ExportQualityTier,
  { videoBitrate: string; maxrate: string; bufsize: string; bitrateBps: number; audioBitrate: string }
> = {
  standard: {
    videoBitrate: "8M",
    maxrate: "9600k",
    bufsize: "16M",
    bitrateBps: 8_000_000,
    audioBitrate: "128k",
  },
  high: {
    videoBitrate: "10M",
    maxrate: "12M",
    bufsize: "20M",
    bitrateBps: 10_000_000,
    audioBitrate: "160k",
  },
  premium: {
    videoBitrate: "12M",
    maxrate: "14400k",
    bufsize: "24M",
    bitrateBps: 12_000_000,
    audioBitrate: "192k",
  },
};

export const TRANSCODE_TMP_ROOT = path.join(os.tmpdir(), "ai-video-review-transcode");
const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes retention for downloadable MP4s
const TRANSCODE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max per job

export function normalizeQualityTier(input?: string): ExportQualityTier {
  if (input === "standard") return "standard";
  if (input === "premium" || input === "master") return "premium";
  return "high";
}

export function getFfmpegBinary(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

export function getFfprobeBinary(): string {
  return process.env.FFPROBE_PATH || "ffprobe";
}

export function checkFfmpegCapabilities(): {
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  ffmpegVersion?: string;
  encoders: { h264: boolean; aac: boolean };
} {
  let ffmpegAvailable = false;
  let ffprobeAvailable = false;
  let ffmpegVersion: string | undefined;
  let h264 = false;
  let aac = false;

  try {
    const out = execFileSync(getFfmpegBinary(), ["-version"], { encoding: "utf8", timeout: 4000 });
    ffmpegAvailable = true;
    ffmpegVersion = out.split("\n")[0]?.trim();
    const enc = execFileSync(getFfmpegBinary(), ["-encoders"], { encoding: "utf8", timeout: 4000 });
    h264 = /\blibx264\b/.test(enc);
    aac = /\baac\b/.test(enc);
  } catch {
    ffmpegAvailable = false;
  }

  try {
    execFileSync(getFfprobeBinary(), ["-version"], { encoding: "utf8", timeout: 4000 });
    ffprobeAvailable = true;
  } catch {
    ffprobeAvailable = false;
  }

  return {
    ffmpegAvailable,
    ffprobeAvailable,
    ffmpegVersion,
    encoders: { h264, aac },
  };
}

/**
 * Inspect top-level ISO BMFF / MP4 boxes on disk without reading the whole file into memory.
 * Verifies presence of 'ftyp', 'moov', 'mdat' and confirms 'moov' precedes 'mdat' (+faststart).
 */
export function verifyMp4FastStart(filePath: string): {
  isMp4Header: boolean;
  hasMoov: boolean;
  hasMdat: boolean;
  fastStart: boolean;
  boxOrder: string[];
} {
  const fd = fs.openSync(filePath, "r");
  const headerBuf = Buffer.alloc(16);
  const boxOrder: string[] = [];
  let isMp4Header = false;
  let moovIndex = -1;
  let mdatIndex = -1;

  try {
    const stat = fs.fstatSync(fd);
    const totalSize = stat.size;
    let offset = 0;

    while (offset + 8 <= totalSize && boxOrder.length < 64) {
      const bytesRead = fs.readSync(fd, headerBuf, 0, 16, offset);
      if (bytesRead < 8) break;

      const size32 = headerBuf.readUInt32BE(0);
      const boxType = headerBuf.slice(4, 8).toString("ascii");

      let boxSize = size32;
      if (size32 === 1) {
        if (bytesRead < 16) break;
        const hi = headerBuf.readUInt32BE(8);
        const lo = headerBuf.readUInt32BE(12);
        boxSize = hi * 4294967296 + lo;
      } else if (size32 === 0) {
        boxSize = totalSize - offset;
      }

      if (boxSize < 8) break;

      if (boxOrder.length === 0 && boxType === "ftyp") {
        isMp4Header = true;
      }

      boxOrder.push(boxType);
      if (boxType === "moov" && moovIndex === -1) moovIndex = boxOrder.length - 1;
      if (boxType === "mdat" && mdatIndex === -1) mdatIndex = boxOrder.length - 1;

      offset += boxSize;
    }
  } finally {
    fs.closeSync(fd);
  }

  const hasMoov = moovIndex !== -1;
  const hasMdat = mdatIndex !== -1;
  const fastStart = isMp4Header && hasMoov && (!hasMdat || moovIndex < mdatIndex);

  return { isMp4Header, hasMoov, hasMdat, fastStart, boxOrder };
}

export interface FfprobeResult {
  format: {
    filename?: string;
    format_name?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
  };
  streams: Array<{
    index: number;
    codec_type?: string;
    codec_name?: string;
    profile?: string;
    pix_fmt?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    sample_rate?: string;
    channels?: number;
    duration?: string;
    start_time?: string;
    bit_rate?: string;
  }>;
}

export function probeMediaFile(filePath: string): Promise<FfprobeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ];
    const proc = spawn(getFfprobeBinary(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("FFprobe timeout"));
    }, 30000);

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`FFprobe exited with code ${code}: ${stderr.trim()}`));
      }
      try {
        resolve(JSON.parse(stdout) as FfprobeResult);
      } catch (e: any) {
        reject(new Error(`Invalid FFprobe JSON: ${e.message}`));
      }
    });
  });
}

function parseFrameRate(rateStr?: string): number {
  if (!rateStr) return 0;
  const parts = rateStr.split("/");
  if (parts.length === 2) {
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (den > 0 && isFinite(num)) return Number((num / den).toFixed(2));
  }
  const n = parseFloat(rateStr);
  return isFinite(n) ? Number(n.toFixed(2)) : 0;
}

/**
 * Full bitstream decode verification using FFmpeg null muxer.
 * Ensures every video frame and audio packet actually decodes cleanly without corruption.
 */
export function verifyFullDecodeIntegrity(filePath: string): Promise<{ passed: boolean; errorOutput: string }> {
  return new Promise((resolve) => {
    const args = ["-v", "error", "-i", filePath, "-f", "null", "-"];
    const proc = spawn(getFfmpegBinary(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({ passed: false, errorOutput: "Full decode verification timeout" });
    }, 120000);

    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ passed: false, errorOutput: err.message });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      const trimmedErr = stderr.trim();
      const passed = code === 0 && trimmedErr.length === 0;
      resolve({ passed, errorOutput: trimmedErr });
    });
  });
}

/**
 * Comprehensive TikTok MP4 Validation combining FFprobe metadata checks,
 * binary MP4 moov-before-mdat faststart check, A/V sync delta check, and full decode verification.
 */
export async function validateTikTokMp4(
  filePath: string,
  options: { requireExact1080x1920?: boolean; requireFastStart?: boolean } = {}
): Promise<TikTokValidationReport> {
  const { requireExact1080x1920 = true, requireFastStart = true } = options;
  const errors: string[] = [];

  if (!fs.existsSync(filePath)) {
    return {
      valid: false,
      container: "",
      videoCodec: "",
      audioCodec: null,
      hasAudio: false,
      pixelFormat: "",
      width: 0,
      height: 0,
      fps: 0,
      durationSec: 0,
      bitrateBps: 0,
      fileSizeBytes: 0,
      fastStart: false,
      audioVideoSyncDeltaSec: null,
      decodeIntegrityPassed: false,
      errors: ["Output file does not exist"],
    };
  }

  const stat = fs.statSync(filePath);
  const fileSizeBytes = stat.size;
  if (fileSizeBytes < 1024) {
    errors.push(`File size too small (${fileSizeBytes} bytes)`);
  }

  const probe = await probeMediaFile(filePath);
  const formatName = probe.format?.format_name || "";
  const containerValid = formatName.split(",").some((f) => f.trim() === "mp4");
  if (!containerValid) {
    errors.push(`Invalid container format '${formatName}' (expected mp4)`);
  }

  const videoStream = probe.streams.find((s) => s.codec_type === "video");
  const audioStream = probe.streams.find((s) => s.codec_type === "audio");

  const videoCodec = videoStream?.codec_name || "";
  const pixelFormat = videoStream?.pix_fmt || "";
  const width = videoStream?.width || 0;
  const height = videoStream?.height || 0;
  const fps = parseFrameRate(videoStream?.avg_frame_rate || videoStream?.r_frame_rate);
  const durationSec = Number(parseFloat(probe.format?.duration || videoStream?.duration || "0").toFixed(3));
  const bitrateBps = parseInt(probe.format?.bit_rate || videoStream?.bit_rate || "0", 10) || 0;

  if (!videoStream) {
    errors.push("Missing video stream");
  } else {
    if (videoCodec !== "h264") errors.push(`Video codec '${videoCodec}' is not H.264/AVC`);
    if (pixelFormat !== "yuv420p") errors.push(`Pixel format '${pixelFormat}' is not yuv420p`);
    if (requireExact1080x1920 && (width !== 1080 || height !== 1920)) {
      errors.push(`Resolution ${width}x${height} is not 1080x1920`);
    } else if (width <= 0 || height <= 0 || width % 2 !== 0 || height % 2 !== 0) {
      errors.push(`Invalid or non-even dimensions ${width}x${height}`);
    }
    if (fps < 29 || fps > 31) {
      errors.push(`Frame rate ${fps} FPS is not ~30 FPS CFR`);
    }
  }

  if (!isFinite(durationSec) || durationSec <= 0) {
    errors.push(`Invalid duration ${durationSec}s`);
  }
  if (bitrateBps <= 0) {
    errors.push(`Invalid bitrate ${bitrateBps}`);
  }

  const hasAudio = !!audioStream;
  const audioCodec = audioStream?.codec_name || null;
  let audioVideoSyncDeltaSec: number | null = null;

  if (audioStream) {
    if (audioCodec !== "aac") {
      errors.push(`Audio codec '${audioCodec}' is not AAC`);
    }
    const sampleRate = parseInt(audioStream.sample_rate || "0", 10);
    if (sampleRate !== 48000) {
      errors.push(`Audio sample rate ${sampleRate}Hz is not 48000Hz`);
    }
    const vStart = parseFloat(videoStream?.start_time || "0") || 0;
    const aStart = parseFloat(audioStream.start_time || "0") || 0;
    const vDur = parseFloat(videoStream?.duration || String(durationSec)) || durationSec;
    const aDur = parseFloat(audioStream.duration || String(durationSec)) || durationSec;
    audioVideoSyncDeltaSec = Number(Math.max(Math.abs(vStart - aStart), Math.abs(vDur - aDur)).toFixed(3));
    if (audioVideoSyncDeltaSec > 0.75) {
      errors.push(`Audio-video duration/start sync drift too high (${audioVideoSyncDeltaSec}s)`);
    }
  }

  const boxCheck = verifyMp4FastStart(filePath);
  if (requireFastStart && !boxCheck.fastStart) {
    errors.push(`MP4 moov atom is not placed before mdat (faststart missing; boxes: ${boxCheck.boxOrder.join(",")})`);
  }

  const decodeCheck = await verifyFullDecodeIntegrity(filePath);
  if (!decodeCheck.passed) {
    errors.push(`Full video/audio decode verification failed: ${decodeCheck.errorOutput || "non-zero exit"}`);
  }

  return {
    valid: errors.length === 0,
    container: formatName,
    videoCodec,
    audioCodec,
    hasAudio,
    pixelFormat,
    width,
    height,
    fps,
    durationSec,
    bitrateBps,
    fileSizeBytes,
    fastStart: boxCheck.fastStart,
    audioVideoSyncDeltaSec,
    decodeIntegrityPassed: decodeCheck.passed,
    errors,
  };
}

export function buildTikTokFfmpegArgs(params: {
  inputPath: string;
  outputPath: string;
  qualityTier: ExportQualityTier;
  hasAudio: boolean;
  presetOverride?: string;
  isFastRemuxEligible?: boolean;
}): string[] {
  const { inputPath, outputPath, qualityTier, hasAudio, presetOverride } = params;
  const presetCfg = TIKTOK_QUALITY_PRESETS[qualityTier] || TIKTOK_QUALITY_PRESETS.high;
  const x264Preset = presetOverride || process.env.TIKTOK_FFMPEG_PRESET || "medium";

  const vf =
    "scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos," +
    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black," +
    "setsar=1,format=yuv420p";

  const args: string[] = [
    "-y",
    "-fflags",
    "+genpts",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    x264Preset,
    "-profile:v",
    "high",
    "-level:v",
    "4.1",
    "-pix_fmt",
    "yuv420p",
    "-vsync",
    "cfr",
    "-r",
    "30",
    "-b:v",
    presetCfg.videoBitrate,
    "-maxrate",
    presetCfg.maxrate,
    "-bufsize",
    presetCfg.bufsize,
    "-g",
    "60",
    "-keyint_min",
    "60",
    "-sc_threshold",
    "0",
  ];

  if (hasAudio) {
    args.push(
      "-af",
      "aresample=async=1:first_pts=0",
      "-c:a",
      "aac",
      "-profile:a",
      "aac_low",
      "-b:a",
      presetCfg.audioBitrate,
      "-ar",
      "48000",
      "-ac",
      "2"
    );
  } else {
    args.push("-an");
  }

  args.push(
    "-avoid_negative_ts",
    "make_zero",
    "-max_muxing_queue_size",
    "2048",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath
  );

  return args;
}

function runFfmpegTranscodeProcess(
  args: string[],
  expectedDurationSec: number,
  onProgress: (pct: number) => void,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegBinary(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
      reject(new Error(`FFmpeg transcoding exceeded timeout (${Math.round(timeoutMs / 1000)}s)`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith("out_time_us=")) {
          const us = parseInt(line.slice("out_time_us=".length).trim(), 10);
          if (!isNaN(us) && expectedDurationSec > 0) {
            const elapsedSec = us / 1_000_000;
            const rawPct = Math.min(99, Math.max(1, Math.round((elapsedSec / expectedDurationSec) * 100)));
            onProgress(rawPct);
          }
        }
      }
    });

    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
      if (stderr.length > 8192) stderr = stderr.slice(-8192);
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg failed with exit code ${code}: ${stderr.slice(-500).trim()}`));
      }
    });
  });
}

export async function transcodeAndValidateToTikTokMp4(params: {
  inputPath: string;
  outputPath: string;
  qualityTier: ExportQualityTier;
  presetOverride?: string;
  onProgress?: (pct: number, stageLabel: string) => void;
  timeoutMs?: number;
}): Promise<TikTokValidationReport> {
  const {
    inputPath,
    outputPath,
    qualityTier,
    presetOverride,
    onProgress,
    timeoutMs = TRANSCODE_TIMEOUT_MS,
  } = params;

  onProgress?.(5, "Đang kiểm tra luồng video/âm thanh nguồn bằng FFprobe...");
  const inputProbe = await probeMediaFile(inputPath);
  const videoStream = inputProbe.streams.find((s) => s.codec_type === "video");
  const audioStream = inputProbe.streams.find((s) => s.codec_type === "audio");

  if (!videoStream) {
    throw new Error("Tệp đầu vào không chứa luồng hình ảnh (video stream) hợp lệ.");
  }

  const expectedDurationSec =
    parseFloat(inputProbe.format?.duration || videoStream.duration || "0") || 15;
  const hasAudio = !!audioStream;

  const args = buildTikTokFfmpegArgs({
    inputPath,
    outputPath,
    qualityTier,
    hasAudio,
    presetOverride,
  });

  onProgress?.(10, `Đang chuyển mã chuẩn TikTok MP4 (H.264 + ${hasAudio ? "AAC-LC 48kHz" : "No Audio"})...`);

  try {
    await runFfmpegTranscodeProcess(
      args,
      expectedDurationSec,
      (ffmpegPct) => {
        // Map 0..100% FFmpeg progress to 10..88% pipeline progress
        const mapped = 10 + Math.round((ffmpegPct / 100) * 78);
        onProgress?.(mapped, `Đang chuyển mã H.264 / yuv420p (${ffmpegPct}%)...`);
      },
      timeoutMs
    );
  } catch (firstErr: any) {
    console.warn("[TIKTOK-TRANSCODE-RETRY] Lần 1 gặp sự cố, thử lại với preset fast:", firstErr.message);
    const retryArgs = buildTikTokFfmpegArgs({
      inputPath,
      outputPath,
      qualityTier,
      hasAudio,
      presetOverride: "fast",
    });
    await runFfmpegTranscodeProcess(
      retryArgs,
      expectedDurationSec,
      (ffmpegPct) => {
        const mapped = 10 + Math.round((ffmpegPct / 100) * 78);
        onProgress?.(mapped, `Đang chuyển mã lại (preset ổn định) ${ffmpegPct}%...`);
      },
      timeoutMs
    );
  }

  onProgress?.(92, "Đang kiểm định toàn diện FFprobe & giải mã toàn tệp MP4...");
  const validation = await validateTikTokMp4(outputPath, {
    requireExact1080x1920: true,
    requireFastStart: true,
  });

  if (!validation.valid) {
    throw new Error(`Video sau chuyển mã không đạt chuẩn TikTok: ${validation.errors.join("; ")}`);
  }

  onProgress?.(100, "Video MP4 H.264/AAC chuẩn TikTok đã sẵn sàng tải xuống!");
  return validation;
}

interface InternalJob extends TranscodeJobStatus {
  jobDir: string;
  inputPath: string;
  outputPath: string;
}

class TranscodeJobManager {
  private jobs = new Map<string, InternalJob>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    fs.mkdirSync(TRANSCODE_TMP_ROOT, { recursive: true });
    this.cleanupTimer = setInterval(() => this.pruneExpiredJobs(), 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  createJob(params: {
    inputPath: string;
    qualityTier: ExportQualityTier;
    baseFileName: string;
  }): TranscodeJobStatus {
    const jobId = crypto.randomUUID();
    const jobDir = path.join(TRANSCODE_TMP_ROOT, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    const safeBase = (params.baseFileName || "tiktok_review")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 60);
    const finalFileName = `${safeBase || "tiktok_review"}_tiktok.mp4`;
    const outputPath = path.join(jobDir, finalFileName);

    const now = Date.now();
    const job: InternalJob = {
      jobId,
      status: "queued",
      progress: 5,
      stageLabel: "Đã nhận tệp video, đang xếp hàng chuyển mã TikTok MP4...",
      qualityTier: params.qualityTier,
      fileName: finalFileName,
      createdAt: now,
      updatedAt: now,
      jobDir,
      inputPath: params.inputPath,
      outputPath,
    };

    this.jobs.set(jobId, job);
    this.processJobAsync(job);
    return this.toPublicStatus(job);
  }

  private async processJobAsync(job: InternalJob): Promise<void> {
    job.status = "transcoding";
    job.updatedAt = Date.now();

    try {
      const validation = await transcodeAndValidateToTikTokMp4({
        inputPath: job.inputPath,
        outputPath: job.outputPath,
        qualityTier: job.qualityTier,
        onProgress: (pct, stageLabel) => {
          job.progress = pct;
          job.stageLabel = stageLabel;
          job.status = pct >= 90 && pct < 100 ? "validating" : "transcoding";
          job.updatedAt = Date.now();
        },
      });

      job.validation = validation;
      job.downloadUrl = `/api/transcode/download/${job.jobId}`;
      job.progress = 100;
      job.status = "completed";
      job.stageLabel = "Hoàn tất chuyển mã & kiểm định TikTok MP4 (H.264/AAC)";
      job.updatedAt = Date.now();
    } catch (err: any) {
      console.error(`[TIKTOK-JOB-FAILED] ${job.jobId}:`, err);
      job.status = "failed";
      job.error = err?.message || "Chuyển mã MP4 thất bại.";
      job.stageLabel = "Chuyển mã thất bại";
      job.updatedAt = Date.now();
      this.safeUnlink(job.outputPath);
    } finally {
      // Immediately remove raw temporary upload (WebM/raw) once processing ends
      this.safeUnlink(job.inputPath);
    }
  }

  getJobStatus(jobId: string): TranscodeJobStatus | null {
    const job = this.jobs.get(jobId);
    return job ? this.toPublicStatus(job) : null;
  }

  getDownloadableFile(jobId: string): { outputPath: string; fileName: string; sizeBytes: number } | null {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "completed" || !job.validation?.valid) {
      return null;
    }
    if (!fs.existsSync(job.outputPath)) {
      return null;
    }
    const stat = fs.statSync(job.outputPath);
    return {
      outputPath: job.outputPath,
      fileName: job.fileName || "tiktok_review.mp4",
      sizeBytes: stat.size,
    };
  }

  deleteJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    this.safeUnlink(job.inputPath);
    this.safeUnlink(job.outputPath);
    try {
      fs.rmSync(job.jobDir, { recursive: true, force: true });
    } catch {}
    this.jobs.delete(jobId);
    return true;
  }

  private pruneExpiredJobs(): void {
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      if (now - job.updatedAt > JOB_TTL_MS && job.status !== "transcoding" && job.status !== "validating") {
        this.deleteJob(jobId);
      }
    }
  }

  private safeUnlink(targetPath: string): void {
    try {
      if (targetPath && fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
    } catch {}
  }

  private toPublicStatus(job: InternalJob): TranscodeJobStatus {
    return {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      stageLabel: job.stageLabel,
      qualityTier: job.qualityTier,
      validation: job.validation,
      downloadUrl: job.downloadUrl,
      fileName: job.fileName,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}

export const transcodeJobManager = new TranscodeJobManager();
