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

export const SINGLE_UPLOAD_SAFE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB fast path (well below Cloud Run 32MB ceiling)
export const DEFAULT_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB per binary chunk

export interface UploadChunkSlice {
  index: number;
  start: number;
  end: number;
  size: number;
}

export function computeUploadChunkPlan(
  totalBytes: number,
  chunkSizeBytes: number = DEFAULT_UPLOAD_CHUNK_BYTES
): UploadChunkSlice[] {
  if (totalBytes <= 0 || chunkSizeBytes <= 0) return [];
  const totalChunks = Math.ceil(totalBytes / chunkSizeBytes);
  const slices: UploadChunkSlice[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSizeBytes;
    const end = Math.min(totalBytes, start + chunkSizeBytes);
    slices.push({
      index: i,
      start,
      end,
      size: end - start,
    });
  }
  return slices;
}

function safeParseXhrError(xhr: XMLHttpRequest, fallbackPrefix: string): { status: number; message: string; isPayloadTooLarge: boolean } {
  const status = xhr.status || 0;
  let parsedError = "";
  try {
    const data = JSON.parse(xhr.responseText || "{}");
    if (data && typeof data.error === "string" && data.error.trim()) {
      parsedError = data.error.trim();
    }
  } catch {
    // Upstream ingress/proxy may return non-JSON HTML/text on 413/502/504
  }
  if (!parsedError) {
    if (status === 413) {
      parsedError = "Kích thước gói tải lên vượt quá giới hạn máy chủ trung gian (HTTP 413).";
    } else {
      parsedError = `${fallbackPrefix} (HTTP ${status})`;
    }
  }
  return { status, message: parsedError, isPayloadTooLarge: status === 413 };
}

async function uploadSingleMultipart(params: {
  blob: Blob;
  sourceExt: string;
  fileName: string;
  qualityTier: ExportQualityTier;
  signal?: AbortSignal;
  onUploadProgress?: (pct: number) => void;
}): Promise<{ jobId: string; status: TranscodeJobStatus }> {
  const { blob, sourceExt, fileName, qualityTier, signal, onUploadProgress } = params;
  const formData = new FormData();
  const uploadName = `${fileName.replace(/\.[^.]+$/, "")}.${sourceExt}`;
  formData.append("video", blob, uploadName);
  formData.append("qualityTier", qualityTier);
  formData.append("baseFileName", fileName);

  return new Promise<{ jobId: string; status: TranscodeJobStatus }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/transcode/tiktok", true);

    const onAbort = () => {
      xhr.abort();
      reject(new Error("Quá trình xuất video đã bị hủy."));
    };

    if (signal) {
      if (signal.aborted) {
        return reject(new Error("Quá trình xuất video đã bị hủy."));
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        onUploadProgress?.(Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
      }
    };

    xhr.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText || "{}");
          if (data.jobId) {
            return resolve({ jobId: data.jobId, status: data });
          }
        } catch {}
      }
      const errInfo = safeParseXhrError(xhr, "Upload chuyển mã thất bại");
      const err: any = new Error(errInfo.message);
      err.httpStatus = errInfo.status;
      reject(err);
    };

    xhr.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Lỗi kết nối mạng khi tải video lên bộ chuyển mã TikTok MP4."));
    };
    xhr.ontimeout = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Hết thời gian tải video lên máy chủ chuyển mã."));
    };
    xhr.send(formData);
  });
}

function sendSingleBinaryChunk(params: {
  uploadId: string;
  chunkIndex: number;
  chunkBlob: Blob;
  signal?: AbortSignal;
  onChunkBytesProgress: (loadedBytes: number) => void;
}): Promise<void> {
  const { uploadId, chunkIndex, chunkBlob, signal, onChunkBytesProgress } = params;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/transcode/upload/chunk/${encodeURIComponent(uploadId)}/${chunkIndex}`, true);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    const onAbort = () => {
      xhr.abort();
      reject(new Error("Quá trình xuất video đã bị hủy."));
    };

    if (signal) {
      if (signal.aborted) {
        return reject(new Error("Quá trình xuất video đã bị hủy."));
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        onChunkBytesProgress(Math.min(chunkBlob.size, evt.loaded));
      }
    };

    xhr.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        onChunkBytesProgress(chunkBlob.size);
        return resolve();
      }
      const errInfo = safeParseXhrError(xhr, `Tải phân đoạn ${chunkIndex + 1} thất bại`);
      const err: any = new Error(errInfo.message);
      err.httpStatus = errInfo.status;
      reject(err);
    };

    xhr.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      const err: any = new Error(`Lỗi mạng khi tải phân đoạn ${chunkIndex + 1}.`);
      err.retryable = true;
      reject(err);
    };
    xhr.ontimeout = () => {
      signal?.removeEventListener("abort", onAbort);
      const err: any = new Error(`Hết thời gian tải phân đoạn ${chunkIndex + 1}.`);
      err.retryable = true;
      reject(err);
    };
    xhr.send(chunkBlob);
  });
}

async function uploadChunkedStreaming(params: {
  blob: Blob;
  sourceExt: string;
  fileName: string;
  qualityTier: ExportQualityTier;
  chunkSizeBytes?: number;
  signal?: AbortSignal;
  onUploadProgress?: (pct: number) => void;
}): Promise<{ jobId: string; status: TranscodeJobStatus }> {
  const {
    blob,
    sourceExt,
    fileName,
    qualityTier,
    chunkSizeBytes = DEFAULT_UPLOAD_CHUNK_BYTES,
    signal,
    onUploadProgress,
  } = params;

  const slices = computeUploadChunkPlan(blob.size, chunkSizeBytes);
  if (slices.length === 0) {
    throw new Error("Tệp video rỗng, không thể tải lên bộ chuyển mã.");
  }

  const initRes = await fetch("/api/transcode/upload/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      sourceExt,
      qualityTier,
      baseFileName: fileName,
      totalSize: blob.size,
      totalChunks: slices.length,
    }),
  });
  const initData = await initRes.json().catch(() => ({}));
  if (!initRes.ok || !initData.uploadId) {
    throw new Error(initData.error || `Không thể khởi tạo phiên tải lên phân đoạn (HTTP ${initRes.status})`);
  }

  const uploadId: string = initData.uploadId;
  let uploadedBytes = 0;

  try {
    for (const slice of slices) {
      if (signal?.aborted) {
        throw new Error("Quá trình xuất video đã bị hủy.");
      }

      const chunkBlob = blob.slice(slice.start, slice.end, blob.type || "application/octet-stream");
      let chunkDone = false;
      let lastChunkErr: any = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await sendSingleBinaryChunk({
            uploadId,
            chunkIndex: slice.index,
            chunkBlob,
            signal,
            onChunkBytesProgress: (loadedBytes) => {
              const aggregate = uploadedBytes + loadedBytes;
              onUploadProgress?.(Math.min(99, Math.round((aggregate / blob.size) * 100)));
            },
          });
          chunkDone = true;
          break;
        } catch (err: any) {
          lastChunkErr = err;
          if (signal?.aborted || err?.httpStatus === 413 || err?.httpStatus === 404 || err?.httpStatus === 400) {
            throw err;
          }
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 600 * attempt));
          }
        }
      }

      if (!chunkDone) {
        throw lastChunkErr || new Error(`Không thể tải phân đoạn ${slice.index + 1}/${slices.length}.`);
      }
      uploadedBytes += slice.size;
      onUploadProgress?.(Math.min(99, Math.round((uploadedBytes / blob.size) * 100)));
    }

    const completeRes = await fetch(`/api/transcode/upload/complete/${encodeURIComponent(uploadId)}`, {
      method: "POST",
      signal,
    });
    const completeData = await completeRes.json().catch(() => ({}));
    if (!completeRes.ok || !completeData.jobId) {
      throw new Error(completeData.error || `Không thể hoàn tất ghép video chuyển mã (HTTP ${completeRes.status})`);
    }

    onUploadProgress?.(100);
    return { jobId: completeData.jobId, status: completeData };
  } catch (err) {
    fetch(`/api/transcode/upload/${encodeURIComponent(uploadId)}`, { method: "DELETE" }).catch(() => {});
    throw err;
  }
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

  let createdJob: { jobId: string; status: TranscodeJobStatus };

  // Route videos > 8MB straight through disk-backed chunked streaming to respect Cloud Run's 32MB HTTP request ceiling.
  // Also automatically fail over to smaller 2MB chunks if any ingress proxy still rejects a small single upload with 413.
  if (blob.size <= SINGLE_UPLOAD_SAFE_MAX_BYTES) {
    try {
      createdJob = await uploadSingleMultipart({
        blob,
        sourceExt,
        fileName,
        qualityTier,
        signal,
        onUploadProgress,
      });
    } catch (err: any) {
      if (err?.httpStatus === 413) {
        createdJob = await uploadChunkedStreaming({
          blob,
          sourceExt,
          fileName,
          qualityTier,
          chunkSizeBytes: 2 * 1024 * 1024,
          signal,
          onUploadProgress,
        });
      } else {
        throw err;
      }
    }
  } else {
    try {
      createdJob = await uploadChunkedStreaming({
        blob,
        sourceExt,
        fileName,
        qualityTier,
        chunkSizeBytes: DEFAULT_UPLOAD_CHUNK_BYTES,
        signal,
        onUploadProgress,
      });
    } catch (err: any) {
      // Defensive: if an extra-strict proxy rejects 4MB chunks with 413, step down to 1.5MB chunks automatically
      if (err?.httpStatus === 413) {
        createdJob = await uploadChunkedStreaming({
          blob,
          sourceExt,
          fileName,
          qualityTier,
          chunkSizeBytes: Math.floor(1.5 * 1024 * 1024),
          signal,
          onUploadProgress,
        });
      } else {
        throw err;
      }
    }
  }

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
