import type { ExportQualityTier, TranscodeJobStatus } from "./types";

export const EXPORT_QUALITY_META: Record<
  ExportQualityTier,
  { label: string; bitrateBps: number; mbpsLabel: string; description: string }
> = {
  standard: {
    label: "Standard",
    bitrateBps: 8_000_000,
    mbpsLabel: "8 Mbps",
    description: "Tối ưu dung lượng nhẹ, tải nhanh trên mạng di động (1080×1920 @ 30fps)",
  },
  high: {
    label: "High Quality",
    bitrateBps: 10_000_000,
    mbpsLabel: "10 Mbps",
    description: "Khuyên dùng cho TikTok & Reels: sắc nét chữ phụ đề, cân bằng dung lượng",
  },
  premium: {
    label: "Premium",
    bitrateBps: 12_000_000,
    mbpsLabel: "12 Mbps",
    description: "Độ chi tiết tối đa cho sản phẩm cao cấp chuẩn 1080×1920 @ 30fps CFR",
  },
};

export interface SelectedRecorderProfile {
  mimeType: string;
  isNativeMp4: boolean;
  needsServerTranscode: boolean;
  isAndroid: boolean;
}

/**
 * Priority 1: Probe browser MediaRecorder.isTypeSupported for H.264/AAC MP4.
 * Priority 2: On Android (or browsers without H.264/AAC MP4), capture temporary WebM VP8/VP9+Opus
 * and ALWAYS route through the backend FFmpeg transcode/validation worker before final TikTok download.
 */
export function selectOptimalRecorderCodec(
  userAgent: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
  isTypeSupportedFn: (mime: string) => boolean = (m) =>
    typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function"
      ? MediaRecorder.isTypeSupported(m)
      : false
): SelectedRecorderProfile {
  const isAndroid = /Android/i.test(userAgent);

  const mp4Candidates = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs="avc1.4D401E,mp4a.40.2"',
    'video/mp4;codecs="avc1.640028,mp4a.40.2"',
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
  ];

  const webmCandidates = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];

  // Priority 1: Check native MP4 H.264 + AAC support first
  // Note: On Android Chrome, hardware WebM VP8/Opus is reliable while MediaRecorder MP4 often lacks faststart or crashes;
  // still check strict H.264+AAC support, and ALWAYS normalize via server FFmpeg for 100% TikTok CFR + faststart compliance.
  if (!isAndroid) {
    for (const mime of mp4Candidates) {
      if (isTypeSupportedFn(mime)) {
        return {
          mimeType: mime,
          isNativeMp4: true,
          needsServerTranscode: true, // Always run FFmpeg/FFprobe faststart + CFR + AAC-LC 48kHz verification
          isAndroid,
        };
      }
    }
  }

  // Priority 2: WebM VP8/VP9 + Opus temporary capture -> mandatory server FFmpeg MP4 H.264/AAC transcoding
  for (const mime of webmCandidates) {
    if (isTypeSupportedFn(mime)) {
      return {
        mimeType: mime,
        isNativeMp4: false,
        needsServerTranscode: true,
        isAndroid,
      };
    }
  }

  // Fallback MP4 check even on Android if WebM wasn't listed
  for (const mime of mp4Candidates) {
    if (isTypeSupportedFn(mime)) {
      return {
        mimeType: mime,
        isNativeMp4: true,
        needsServerTranscode: true,
        isAndroid,
      };
    }
  }

  return {
    mimeType: "",
    isNativeMp4: false,
    needsServerTranscode: true,
    isAndroid,
  };
}

export function getTikTokExportBitrateBps(tier: ExportQualityTier): number {
  return (EXPORT_QUALITY_META[tier] || EXPORT_QUALITY_META.high).bitrateBps;
}

/**
 * Compute target canvas resolution for TikTok Export Engine.
 * Default TikTok 9:16 output is strict 1080x1920 (even dimensions).
 */
export function computeTikTokCanvasDimensions(preset: "1080p" | "720p" | "4k" = "1080p"): {
  width: number;
  height: number;
} {
  if (preset === "720p") {
    return { width: 720, height: 1280 };
  }
  return { width: 1080, height: 1920 };
}

export async function uploadAndTranscodeToTikTokMp4(params: {
  blob: Blob;
  sourceExt: string;
  fileName: string;
  qualityTier: ExportQualityTier;
  signal?: AbortSignal;
  onUploadProgress?: (pct: number) => void;
  onTranscodeStatus?: (status: TranscodeJobStatus) => void;
}): Promise<TranscodeJobStatus> {
  const { blob, sourceExt, fileName, qualityTier, signal, onUploadProgress, onTranscodeStatus } = params;

  const formData = new FormData();
  const uploadName = `${fileName.replace(/\.[^.]+$/, "")}.${sourceExt}`;
  formData.append("video", blob, uploadName);
  formData.append("qualityTier", qualityTier);
  formData.append("baseFileName", fileName);

  // 1. Multipart/form-data upload via XHR for real upload progress without Base64/RAM bloat
  const createdJob = await new Promise<{ jobId: string; status: TranscodeJobStatus }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/transcode/tiktok", true);

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return reject(new Error("Quá trình xuất video đã bị hủy."));
      }
      signal.addEventListener("abort", () => {
        xhr.abort();
        reject(new Error("Quá trình xuất video đã bị hủy."));
      });
    }

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        onUploadProgress?.(Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300 && data.jobId) {
          resolve({ jobId: data.jobId, status: data });
        } else {
          reject(new Error(data.error || `Upload chuyển mã thất bại (HTTP ${xhr.status})`));
        }
      } catch {
        reject(new Error(`Phản hồi máy chủ không hợp lệ (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Lỗi kết nối mạng khi tải video lên bộ chuyển mã TikTok MP4."));
    xhr.ontimeout = () => reject(new Error("Hết thời gian tải video lên máy chủ chuyển mã."));
    xhr.send(formData);
  });

  onTranscodeStatus?.(createdJob.status);

  // 2. Poll real job progress until completed or failed
  const jobId = createdJob.jobId;
  const maxPollDurationMs = 6 * 60 * 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxPollDurationMs) {
    if (signal?.aborted) {
      fetch(`/api/transcode/job/${encodeURIComponent(jobId)}`, { method: "DELETE" }).catch(() => {});
      throw new Error("Quá trình chuyển mã TikTok MP4 đã bị hủy.");
    }

    await new Promise((r) => setTimeout(r, 700));

    const res = await fetch(`/api/transcode/status/${encodeURIComponent(jobId)}`, { signal });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Không kiểm tra được trạng thái chuyển mã (HTTP ${res.status})`);
    }

    const job: TranscodeJobStatus = await res.json();
    onTranscodeStatus?.(job);

    if (job.status === "completed") {
      if (!job.validation?.valid || !job.downloadUrl) {
        throw new Error(
          `Video đầu ra chưa vượt qua kiểm định TikTok: ${job.validation?.errors?.join("; ") || "Thiếu kiểm định"}`
        );
      }
      return job;
    }

    if (job.status === "failed") {
      throw new Error(job.error || "Bộ chuyển mã FFmpeg không thể tạo tệp MP4 hợp lệ.");
    }
  }

  throw new Error("Quá trình chuyển mã video MP4 vượt quá thời gian chờ tối đa.");
}
