import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dns from "dns";
import {
  checkFfmpegCapabilities,
  normalizeQualityTier,
  transcodeJobManager,
  TRANSCODE_TMP_ROOT,
} from "./server/tiktokTranscoder";
import {
  PRIMARY_TTS_LITE_MODEL,
  VOICE_DESIGN_TTS_MODEL,
  TTS_SAMPLES_DIR,
  getLastSuccessfulTtsAt,
  synthesizeGeminiTtsStrict,
  auditWavDialectWithGemini,
  saveSampleWavFile,
} from "./server/saigonTtsEngine";
import {
  SAIGON_VOICE_POLICY,
  SAIGON_TEST_SENTENCES,
  SAIGON_SAMPLE_SCRIPT,
  TtsAudioProvenance,
  adaptVietnameseTextForSaigonSpeech,
  resolveVoiceConfiguration,
} from "./src/saigonVoicePolicy";

// Set DNS resolution to prioritize IPv4 over IPv6. This prevents "fetch failed" errors inside Cloud Run and sandboxed Node.js environments when connecting to Google APIs.
dns.setDefaultResultOrder("ipv4first");

dotenv.config();

const app = express();

let portArg = 3000;
const portIdx = process.argv.indexOf('--port');
if (portIdx !== -1 && process.argv[portIdx + 1]) {
  const parsed = parseInt(process.argv[portIdx + 1], 10);
  if (!isNaN(parsed) && parsed > 0) portArg = parsed;
}
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (portArg || 3000);

// Instant health check for AI Studio platform dev server supervisor
app.get("/__health", (req, res) => res.status(200).send("OK"));
app.get("/api/health", (req, res) => res.status(200).json({ status: "ok", timestamp: Date.now() }));

// Request Timeout Middleware (600s for large multipart video uploads/downloads, 90s for AI endpoints)
app.use((req, res, next) => {
  const timeoutMs = req.path.startsWith("/api/transcode/") ? 600000 : 90000;
  res.setTimeout(timeoutMs, () => {
    if (!res.headersSent) {
      res.status(504).json({ error: "Thời gian xử lý yêu cầu vượt quá giới hạn an toàn. Vui lòng thử lại." });
    }
  });
  next();
});

// Configurable safe payload limit to prevent Node.js Heap Out-Of-Memory while allowing high-res keyframes
const MAX_PAYLOAD_LIMIT = process.env.MAX_PAYLOAD_LIMIT || "50mb";
app.use(express.json({ limit: MAX_PAYLOAD_LIMIT }));
app.use(express.urlencoded({ limit: MAX_PAYLOAD_LIMIT, extended: true }));

// In-Memory Sliding Window Rate Limiter
interface RateLimitRecord {
  timestamps: number[];
}
const rateLimitMap = new Map<string, RateLimitRecord>();

function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const record = rateLimitMap.get(key) || { timestamps: [] };
    
    // Filter out timestamps outside current sliding window
    record.timestamps = record.timestamps.filter(ts => now - ts < windowMs);
    
    if (record.timestamps.length >= maxRequests) {
      const waitSec = Math.ceil((record.timestamps[0] + windowMs - now) / 1000);
      return res.status(429).json({
        error: `Quá nhiều yêu cầu đến ${req.path}. Vui lòng chờ ${waitSec} giây trước khi gửi lại.`,
        code: "RATE_LIMITED",
        retryAfterSec: waitSec
      });
    }
    
    record.timestamps.push(now);
    rateLimitMap.set(key, record);
    next();
  };
}

const aiEndpointLimiter = createRateLimiter(35, 60000); // 35 req/min for AI endpoints
const generalEndpointLimiter = createRateLimiter(70, 60000); // 70 req/min for general endpoints

// Security: Magic Number / File Signature Validator for Base64 Uploads
function validateBase64FileSignature(base64Data: string, expectedTypes: string[]): { valid: boolean; detected?: string } {
  if (!base64Data || base64Data.length < 16) return { valid: false };
  try {
    const headerSlice = base64Data.slice(0, 48);
    const buf = Buffer.from(headerSlice, 'base64');
    
    // Check known magic signatures
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
    const isWebp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
    const isMp4 = buf.length > 8 && buf.slice(4, 8).toString('ascii') === 'ftyp';
    const isWebm = buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3;
    
    let detected = 'unknown';
    if (isJpeg) detected = 'image/jpeg';
    else if (isPng) detected = 'image/png';
    else if (isGif) detected = 'image/gif';
    else if (isWebp) detected = 'image/webp';
    else if (isMp4) detected = 'video/mp4';
    else if (isWebm) detected = 'video/webm';
    
    const valid = expectedTypes.some(t => detected.startsWith(t) || detected === t);
    return { valid, detected };
  } catch {
    return { valid: false };
  }
}

// Helper function to lazily initialize the Gemini client so it does not crash if keys are missing
let googleAi: GoogleGenAI | null = null;
let googleAiBeta: GoogleGenAI | null = null;
// Strict Provenance-Verified In-Memory TTS Voiceover Cache (Saigon Policy v3)
const ttsMemoryCache = new Map<string, { audioBase64: string; provenance: TtsAudioProvenance }>();

const PRIMARY_TEXT_VISION_MODEL = "gemini-4-hydrogen";
const LITE_FALLBACK_MODEL = "gemini-3.1-flash-lite";
const PRIMARY_TTS_MODEL = VOICE_DESIGN_TTS_MODEL;

function getGoogleAI(apiVersion?: string): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY" || key.trim() === "") {
    return null;
  }
  if (apiVersion === "v1beta") {
    if (!googleAiBeta) {
      try {
        googleAiBeta = new GoogleGenAI({
          apiKey: key.trim(),
          apiVersion: "v1beta",
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });
      } catch (e) {
        console.warn("[GEMINI-INIT-WARN] Không thể khởi tạo GoogleGenAI v1beta SDK:", e);
        return null;
      }
    }
    return googleAiBeta;
  }

  if (!googleAi) {
    try {
      googleAi = new GoogleGenAI({
        apiKey: key.trim(),
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    } catch (e) {
      console.warn("[GEMINI-INIT-WARN] Không thể khởi tạo GoogleGenAI SDK:", e);
      return null;
    }
  }
  return googleAi;
}

// System Status Live Probe Cache (30s TTL to prevent rate limit exhaustion)
interface ServiceHealthResult {
  status: "CONNECTED" | "DEGRADED" | "UNAVAILABLE" | "QUOTA_EXCEEDED" | "MISCONFIGURED";
  latencyMs: number;
  model: string;
  error?: string;
}

interface SystemProbeStatus {
  geminiStatus: "CONNECTED" | "DEGRADED" | "UNAVAILABLE" | "QUOTA_EXCEEDED" | "MISCONFIGURED";
  testedAt: number;
  services: {
    text: ServiceHealthResult;
    vision: ServiceHealthResult;
    tts: ServiceHealthResult;
  };
  latencyMs: number;
  message: string;
}
let statusCache: SystemProbeStatus | null = null;

async function probeSingleService(
  probeFn: () => Promise<any>,
  modelName: string,
  timeoutMs = 8000
): Promise<ServiceHealthResult> {
  const t0 = Date.now();
  try {
    await Promise.race([
      probeFn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("PROBE_TIMEOUT")), timeoutMs))
    ]);
    const latencyMs = Date.now() - t0;
    return {
      status: "CONNECTED",
      latencyMs,
      model: modelName
    };
  } catch (err: any) {
    const latencyMs = Date.now() - t0;
    const msg = String(err.message || "");
    const isAuth = msg.includes("403") || msg.includes("PERMISSION_DENIED") || msg.includes("API key") || msg.includes("API_KEY_INVALID");
    const isQuota = msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429");
    const isDegraded = msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand") || msg.includes("PROBE_TIMEOUT");

    let status: ServiceHealthResult["status"] = "UNAVAILABLE";
    if (isAuth) status = "MISCONFIGURED";
    else if (isQuota) status = "QUOTA_EXCEEDED";
    else if (isDegraded) status = "DEGRADED";

    return {
      status,
      latencyMs,
      model: modelName,
      error: msg
    };
  }
}

async function probeGeminiHealth(force = false): Promise<SystemProbeStatus> {
  const key = process.env.GEMINI_API_KEY || "";
  const hasKey = !!key && key !== "MY_GEMINI_API_KEY" && key.trim() !== "";
  
  if (!hasKey) {
    const unconfig: ServiceHealthResult = {
      status: "MISCONFIGURED",
      latencyMs: 0,
      model: PRIMARY_TEXT_VISION_MODEL,
      error: "Chưa cấu hình GEMINI_API_KEY."
    };
    return {
      geminiStatus: "MISCONFIGURED",
      testedAt: Date.now(),
      services: {
        text: { ...unconfig, model: PRIMARY_TEXT_VISION_MODEL },
        vision: { ...unconfig, model: PRIMARY_TEXT_VISION_MODEL },
        tts: { ...unconfig, model: PRIMARY_TTS_MODEL }
      },
      latencyMs: 0,
      message: "Chưa cấu hình GEMINI_API_KEY trong biến môi trường máy chủ."
    };
  }

  // Use cached probe if fresh (< 5 minutes) unless force requested so page loads do not burn Free-Tier quota
  if (!force && statusCache && (Date.now() - statusCache.testedAt < 300000)) {
    return statusCache;
  }

  const ai = getGoogleAI();
  const aiBeta = getGoogleAI("v1beta");
  if (!ai || !aiBeta) {
    const misconfig: ServiceHealthResult = {
      status: "MISCONFIGURED",
      latencyMs: 0,
      model: PRIMARY_TEXT_VISION_MODEL,
      error: "Khởi tạo GoogleGenAI SDK thất bại."
    };
    statusCache = {
      geminiStatus: "MISCONFIGURED",
      testedAt: Date.now(),
      services: {
        text: { ...misconfig, model: PRIMARY_TEXT_VISION_MODEL },
        vision: { ...misconfig, model: PRIMARY_TEXT_VISION_MODEL },
        tts: { ...misconfig, model: PRIMARY_TTS_MODEL }
      },
      latencyMs: 0,
      message: "Khởi tạo GoogleGenAI SDK thất bại với API key hiện tại."
    };
    return statusCache;
  }

  const t0 = Date.now();
  const tinyGif = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const recentTtsAgeMs = Date.now() - getLastSuccessfulTtsAt();
  const skipRedundantTtsProbe = !force && recentTtsAgeMs < 300000;

  const [textProbe, visionProbe, ttsProbe] = await Promise.all([
    probeSingleService(() =>
      ai.models.generateContent({
        model: PRIMARY_TEXT_VISION_MODEL,
        contents: "ping",
      }),
      PRIMARY_TEXT_VISION_MODEL,
      8000
    ),
    probeSingleService(() =>
      ai.models.generateContent({
        model: PRIMARY_TEXT_VISION_MODEL,
        contents: [
          { inlineData: { mimeType: "image/gif", data: tinyGif } },
          { text: "describe in 1 word" }
        ]
      }),
      PRIMARY_TEXT_VISION_MODEL,
      8000
    ),
    skipRedundantTtsProbe
      ? Promise.resolve<ServiceHealthResult>({
          status: "CONNECTED",
          latencyMs: 1,
          model: PRIMARY_TTS_MODEL,
        })
      : probeSingleService(() => {
          const probeVoice = resolveVoiceConfiguration(SAIGON_VOICE_POLICY.DEFAULT_VOICE, "vi");
          return aiBeta.models.generateContent({
            model: PRIMARY_TTS_MODEL,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: "Dạ chào cả nhà nha.",
                    speechMetadata: { style: probeVoice.speechStylePrompt },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: probeVoice.geminiVoiceName },
                },
              },
            },
          });
        },
          PRIMARY_TTS_MODEL,
          8000
        )
  ]);

  const totalLatency = Date.now() - t0;
  const services = { text: textProbe, vision: visionProbe, tts: ttsProbe };

  // Calculate composite status
  const statuses = [textProbe.status, visionProbe.status, ttsProbe.status];
  let compositeStatus: SystemProbeStatus["geminiStatus"] = "CONNECTED";
  let message = `Tất cả dịch vụ Gemini (Text: ${textProbe.latencyMs}ms, Vision: ${visionProbe.latencyMs}ms, TTS: ${ttsProbe.latencyMs}ms) hoạt động bình thường.`;

  if (statuses.some(s => s === "MISCONFIGURED")) {
    compositeStatus = "MISCONFIGURED";
    message = "API key không hợp lệ hoặc thiếu quyền hạn truy cập Google Gemini.";
  } else if (statuses.every(s => s === "QUOTA_EXCEEDED")) {
    compositeStatus = "QUOTA_EXCEEDED";
    message = "Hạn ngạch (Quota) Gemini API đã chạm giới hạn trên toàn bộ dịch vụ.";
  } else if (statuses.every(s => s === "UNAVAILABLE" || s === "QUOTA_EXCEEDED")) {
    compositeStatus = "UNAVAILABLE";
    message = "Không thể kết nối đến máy chủ Google Gemini.";
  } else if (statuses.some(s => s !== "CONNECTED")) {
    compositeStatus = "DEGRADED";
    const failedServices = Object.entries(services)
      .filter(([_, v]) => v.status !== "CONNECTED")
      .map(([k, v]) => `${k}: ${v.status}`)
      .join(", ");
    message = `Hệ thống đang hoạt động ở chế độ phân cấp; dịch vụ cần lưu ý: ${failedServices}.`;
  }

  statusCache = {
    geminiStatus: compositeStatus,
    testedAt: Date.now(),
    services,
    latencyMs: totalLatency,
    message
  };

  return statusCache;
}

// Resilient API Call Execution with Retry & Exponential Backoff for 503 unavailable spikes
async function generateWithRetry(
  fn: (modelName: string) => Promise<any>, 
  retries = 4, 
  delayMs = 1200, 
  defaultModel = PRIMARY_TEXT_VISION_MODEL, 
  useModelFallback = true
) {
  let modelName = defaultModel;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn(modelName);
    } catch (err: any) {
      const errMsg = String(err.message || "");
      
      // Explicitly check for quota exhaustion failures
      const isQuotaExceeded = errMsg.includes("Quota exceeded") || 
                            errMsg.includes("quota") || 
                            errMsg.includes("current quota") || 
                            errMsg.includes("RESOURCE_EXHAUSTED");

      if (isQuotaExceeded) {
        if (useModelFallback && modelName !== LITE_FALLBACK_MODEL) {
          console.info(`[GEMINI-RETRY] Chuyển đổi sang mô hình dự phòng ${LITE_FALLBACK_MODEL} do hạn ngạch...`);
          modelName = LITE_FALLBACK_MODEL;
          continue;
        }
        throw err;
      }

      const isTemporary = errMsg.includes("503") || 
                        errMsg.includes("UNAVAILABLE") || 
                        errMsg.includes("high demand") || 
                        errMsg.includes("429") ||
                        errMsg.includes("404") ||
                        errMsg.includes("NOT_FOUND") ||
                        errMsg.includes("limit") ||
                        errMsg.toLowerCase().includes("fetch failed") ||
                        errMsg.toLowerCase().includes("request failed") ||
                        errMsg.toLowerCase().includes("aborted") ||
                        errMsg.toLowerCase().includes("timeout") ||
                        errMsg.includes("500") ||
                        errMsg.toLowerCase().includes("internal") ||
                        err.status === 503 ||
                        err.status === 429 ||
                        err.status === 404 ||
                        err.status === 500;
      if (isTemporary && i < retries) {
        if (useModelFallback && modelName !== LITE_FALLBACK_MODEL) {
          console.info(`[GEMINI-RETRY] Điều chỉnh sang mô hình ${LITE_FALLBACK_MODEL} để đảm bảo độ ổn định...`);
          modelName = LITE_FALLBACK_MODEL;
          continue;
        }
        console.info(`[GEMINI-RETRY] Thử lại sau ${delayMs}ms (Lần ${i + 1}/${retries}).`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2.0;
        continue;
      }
      throw err;
    }
  }
}

// Endpoint: Analyze product video to generate detailed reviews and a voiceover script
app.post("/api/analyze-video", aiEndpointLimiter, async (req, res): Promise<any> => {
  try {
    const { 
      video, 
      mimeType, 
      keyframes, 
      videoDuration,
      customPrompt, 
      productName, 
      productDesc, 
      productImage, 
      productImageMimeType,
      productImages,
      language
    } = req.body;

    const effectiveProductName = (productName || "Sản phẩm thực tế").trim();

    // Security: Validate file signatures of video payload
    if (video && typeof video === 'string') {
      const sig = validateBase64FileSignature(video, ['video/mp4', 'video/webm']);
      if (!sig.valid) {
        return res.status(400).json({
          error: "Định dạng tệp video không hợp lệ hoặc dữ liệu tệp bị lỗi (yêu cầu MP4 hoặc WebM hợp lệ).",
          code: "INVALID_VIDEO_FORMAT"
        });
      }
    }

    // Security: Validate file signatures of keyframes
    if (keyframes && Array.isArray(keyframes) && keyframes.length > 0) {
      for (let i = 0; i < Math.min(keyframes.length, 6); i++) {
        const kf = keyframes[i];
        if (kf && kf.data) {
          const sig = validateBase64FileSignature(kf.data, ['image/jpeg', 'image/png', 'image/webp']);
          if (!sig.valid) {
            return res.status(400).json({
              error: `Khung hình số ${i + 1} không đúng định dạng hình ảnh hợp lệ (yêu cầu JPEG/PNG/WebP).`,
              code: "INVALID_KEYFRAME_FORMAT"
            });
          }
        }
      }
    }

    const ai = getGoogleAI();
    if (!ai) {
      return res.status(503).json({
        error: "Chưa cấu hình GEMINI_API_KEY hoặc khóa xác thực không hợp lệ trên máy chủ.",
        code: "MISCONFIGURED_API_KEY",
        retryable: false
      });
    }

    // Prepare content parts
    const contents: any[] = [];

    // 1. Add video part or keyframes parts
    if (keyframes && Array.isArray(keyframes) && keyframes.length > 0) {
      keyframes.slice(0, 6).forEach((kf: any) => {
        contents.push({
          inlineData: {
            mimeType: kf.mimeType || "image/jpeg",
            data: kf.data,
          }
        });
      });
    } else if (video && mimeType) {
      contents.push({
        inlineData: {
          mimeType: mimeType,
          data: video,
        }
      });
    }

    // 2. Add product images if uploaded for reference
    if (productImages && Array.isArray(productImages) && productImages.length > 0) {
      productImages.slice(0, 4).forEach((img: any) => {
        if (img && img.data && img.mimeType) {
          contents.push({
            inlineData: {
              mimeType: img.mimeType,
              data: img.data,
            }
          });
        }
      });
    } else if (productImage && productImageMimeType) {
      contents.push({
        inlineData: {
          mimeType: productImageMimeType,
          data: productImage,
        }
      });
    }

    const roundedDuration = videoDuration && videoDuration > 0 ? Math.round(videoDuration) : 45;
    const minWords = Math.max(12, Math.round(roundedDuration * 2.1));
    const maxWords = Math.round(roundedDuration * 2.35);

    const isEn = language === 'en';

    const durationInstruction = isEn
      ? `The uploaded video is ${roundedDuration}s long. The spoken voiceover script (marketingScript) MUST be calibrated to between ${minWords} and ${maxWords} words to synchronize with this duration.`
      : `Video gốc dài đúng ${roundedDuration} giây. Kịch bản thuyết minh lồng tiếng (marketingScript) BẮT BUỘC có độ dài từ ${minWords} đến ${maxWords} từ để khớp với thời lượng này.`;

    const promptText = `
Bạn là Chuyên gia Đánh giá Sản phẩm & Biên kịch Video Quảng cáo Thương mại Sản phẩm Thực chiến (Senior Product Reviewer & Copywriter).

NHIỆM VỤ CỐT LÕI:
Phân tích kỹ lưỡng các khung hình và video được cung cấp. Tạo báo cáo review khách quan, chân thực và kịch bản thuyết minh lồng tiếng có sức thuyết phục cao.

THÔNG TIN ĐẦU VÀO:
- Tên sản phẩm người dùng cung cấp: "${productName || "(Chưa nhập - hãy nhận diện từ video/hình ảnh)"}"
- Mô tả người dùng cung cấp: "${productDesc || "(Chưa nhập - hãy quan sát công năng thực tế từ video)"}"
- Thời lượng video: ${roundedDuration} giây (${minWords} - ${maxWords} từ lồng tiếng).
- Ngôn ngữ: ${isEn ? "Tiếng Anh" : "Tiếng Việt (Nam Bộ)"}.

NGUYÊN TẮC TRUNG THỰC & CHUẨN XÁC BẮT BUỘC (ANTI-HALLUCINATION):
1. KHÔNG được bịa đặt thông số kỹ thuật (ví dụ: dung lượng pin mAh, công suất W, chip xử lý) nếu không nhìn thấy rõ trên nhãn mác, bao bì hoặc màn hình hiển thị trong video.
2. KHÔNG được suy đoán chất liệu (nhôm hàng không, titan, da thật) nếu video không chứng minh được. Hãy mô tả đúng bề mặt nhìn thấy (nhám mờ, bóng bẩy, kim loại, nhựa đầm chắc).
3. KHÔNG tự bịa giá bán hoặc chương trình bảo hành nếu người dùng không cung cấp.
4. KHÔNG tự động cho điểm số 4.9/5 hoặc điểm số giả. Đánh giá (rating) từ 1.0 đến 5.0 phải dựa trên độ hoàn thiện, tính hữu dụng quan sát được trong video.
5. PHÂN BIỆT RÕ RÀNG:
   - "observedVisuals": Những gì THỰC SỰ NHÌN THẤY trong video/khung hình (màu sắc, hình dạng, phụ kiện, thao tác tay, đèn báo).
   - "userProvidedContext": Những gì người dùng khai báo hoặc kỳ vọng.
   - "unverifiedNotes": Những điểm cần người mua kiểm chứng thêm (chưa có bằng chứng trong video).
   - "needsMoreData": Đặt là true nếu video quá tối, mờ hoặc thiếu cận cảnh chi tiết.

${isEn ? `### LANGUAGE REQUIREMENT: PURE ENGLISH
- Write all fields in professional, engaging English.
- The marketingScript must be natural and ready for TTS synthesis without brackets or emojis.` : `### VĂN PHONG TIẾNG VIỆT NAM BỘ CHUẨN MỰC:
- Lời thuyết minh (marketingScript) sử dụng văn phong Nam Bộ ấm áp, gần gũi ('nha cả nhà', 'coi thử', 'nhìn vô', 'thiệt sự', 'xài bền').
- KHÔNG dùng từ ngữ thô thiển hay giật gân rẻ tiền.
- Lời thoại chỉ chứa văn bản đọc thuần túy, không có ký tự markdown hay chú thích thời gian.`}

${durationInstruction}
Yêu cầu bổ sung từ người dùng: "${customPrompt || "Hãy review chân thực, chi tiết và làm nổi bật giá trị sản phẩm."}"
    `;

    contents.push({ text: promptText });

    const response = await generateWithRetry(
      (model) => 
        ai.models.generateContent({
          model: model,
          contents: contents,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                productName: { type: Type.STRING, description: "Tên thương mại chi tiết của sản phẩm nhận diện được" },
                category: { type: Type.STRING, description: "Phân loại danh mục sản phẩm" },
                rating: { type: Type.NUMBER, description: "Điểm đánh giá thực tế từ 1.0 đến 5.0 dựa trên quan sát" },
                summary: { type: Type.STRING, description: "Bản tóm tắt ngắn gọn 1-2 câu về giá trị sản phẩm" },
                pros: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Danh sách 3-5 ưu điểm quan sát thấy từ sản phẩm thực tế"
                },
                cons: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Danh sách 1-2 điểm hạn chế hoặc lưu ý khách quan"
                },
                detailedReview: { type: Type.STRING, description: "Bài review phân cảnh chi tiết định dạng Markdown chuẩn" },
                marketingScript: { type: Type.STRING, description: "Kịch bản thuyết minh lồng tiếng khớp thời lượng video" },
                ctaText: { type: Type.STRING, description: "Lời kêu gọi hành động tinh tế" },
                targetedAudience: { type: Type.STRING, description: "Tệp khách hàng mục tiêu phù hợp" },
                productFeatures: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Danh sách tính năng quan sát trực tiếp từ video"
                },
                uniqueSellingPoints: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Các điểm ưu thế nổi bật"
                },
                videoHighlights: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Các khoảnh khắc nổi bật kèm mốc giây cụ thể"
                },
                reviewSuggestions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Đề xuất cải thiện nội dung video"
                },
                scriptSuggestions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Chỉ dẫn cách diễn đạt ngữ điệu khi đọc"
                },
                observedVisuals: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Chi tiết hình ảnh cụ thể nhìn thấy trực tiếp trong video"
                },
                userProvidedContext: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Thông tin lấy từ mô tả của người dùng"
                },
                unverifiedNotes: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Các điểm chưa có bằng chứng xác minh trực quan trong video"
                },
                needsMoreData: { type: Type.BOOLEAN, description: "Video có bị thiếu góc quay quan trọng hay không" },
                dataGapMessage: { type: Type.STRING, description: "Gợi ý bổ sung nếu video cần thêm chi tiết" }
              },
              required: [
                "productName", "category", "rating", "summary", "pros", "cons", "detailedReview", "marketingScript", "ctaText", "targetedAudience",
                "productFeatures", "uniqueSellingPoints", "videoHighlights", "reviewSuggestions", "scriptSuggestions",
                "observedVisuals", "unverifiedNotes"
              ]
            }
          }
        }),
      2,
      1200,
      PRIMARY_TEXT_VISION_MODEL,
      true
    );

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Mô hình AI phản hồi rỗng.");
    }
    const reviewData = JSON.parse(resultText);
    return res.json(reviewData);

  } catch (error: any) {
    console.error("[VIDEO-ANALYZE-ERROR] Phân tích video thất bại:", error);
    const isQuota = error.status === 429 || String(error.message).includes("quota") || String(error.message).includes("RESOURCE_EXHAUSTED");
    const isUnavailable = error.status === 503 || String(error.message).includes("503") || String(error.message).includes("UNAVAILABLE");

    return res.status(isQuota ? 429 : (isUnavailable ? 503 : 502)).json({
      success: false,
      error: isQuota 
        ? "Hạn ngạch Google Gemini API tạm thời chạm mức giới hạn. Vui lòng thử lại sau vài giây."
        : (isUnavailable 
            ? "Mô hình phân tích video Gemini đang có nhu cầu cao tạm thời. Vui lòng bấm Thử lại."
            : `Không thể hoàn thành phân tích video: ${error.message || "Lỗi giao tiếp AI"}`),
      code: isQuota ? "QUOTA_EXHAUSTED" : (isUnavailable ? "SERVICE_UNAVAILABLE" : "ANALYSIS_FAILED"),
      retryable: true
    });
  }
});

// Endpoint: Quickly identify the product and suggest details from keyframes and photo with strict observational accuracy
app.post("/api/suggest-product", aiEndpointLimiter, async (req, res): Promise<any> => {
  try {
    const { 
      video, 
      mimeType, 
      keyframes, 
      productImage, 
      productImageMimeType,
      productImages
    } = req.body;

    if (!video && (!keyframes || keyframes.length === 0) && !productImage && (!productImages || productImages.length === 0)) {
      return res.status(400).json({ error: "Vui lòng tải lên ít nhất một tệp video hoặc ảnh sản phẩm thực tế để AI nhận diện." });
    }

    const ai = getGoogleAI();
    if (!ai) {
      return res.status(503).json({
        success: false,
        error: "Chưa cấu hình GEMINI_API_KEY hoặc hệ thống AI chưa sẵn sàng.",
        code: "MISCONFIGURED_API_KEY",
        retryable: false
      });
    }

    const contents: any[] = [];

    // 1. Add video parts or keyframes (capped at 4 for sub-second vision recognition)
    if (keyframes && Array.isArray(keyframes) && keyframes.length > 0) {
      keyframes.slice(0, 4).forEach((kf: any) => {
        contents.push({
          inlineData: {
            mimeType: kf.mimeType || "image/jpeg",
            data: kf.data,
          }
        });
      });
    } else if (video && mimeType) {
      contents.push({
        inlineData: {
          mimeType: mimeType,
          data: video,
        }
      });
    }

    // 2. Add product images or fallback to single image (max 3 images for peak speed)
    if (productImages && Array.isArray(productImages) && productImages.length > 0) {
      productImages.slice(0, 3).forEach((img: any) => {
        if (img && img.data && img.mimeType) {
          contents.push({
            inlineData: {
              mimeType: img.mimeType,
              data: img.data,
            }
          });
        }
      });
    } else if (productImage && productImageMimeType) {
      contents.push({
        inlineData: {
          mimeType: productImageMimeType,
          data: productImage,
        }
      });
    }

    // 3. Prompt with strict anti-fabrication guidelines
    const promptText = `
Bạn là chuyên gia thị giác máy tính và thẩm định sản phẩm thương mại điện tử chuyên nghiệp cấp cao.
Nhiệm vụ: Phân tích các khung hình/hình ảnh thực tế được cung cấp để nhận diện sản phẩm một cách TRUNG THỰC VÀ CHÍNH XÁC NHẤT.

QUY TẮC BẮT BUỘC VỀ TÍNH CHÂN THỰC (ZERO FAKE DATA):
1. CHỈ NHẬN DIỆN DỰA TRÊN DỮ LIỆU THỊ GIÁC CÓ TRONG HÌNH/VIDEO:
   - Trích xuất chữ viết/OCR in thực tế trên nhãn, bao bì, thân máy vào mảng 'ocrDetections'.
   - Nếu đọc được rõ tên thương hiệu/model (ví dụ: 'Xiaomi', 'Merzy', 'Anker', v.v.), hãy dùng nó.
   - NẾU KHÔNG THẤY THƯƠNG HIỆU: TUYỆT ĐỐI KHÔNG TỰ BỊA ĐẶT THƯƠNG HIỆU. Hãy dùng mô tả khách quan (ví dụ: 'Nồi chiên không dầu dung tích lớn', 'Tai nghe Bluetooth True Wireless').
2. KHÔNG TỰ BỊA ĐẶT THÔNG SỐ KỸ THUẬT, CHẤT LIỆU, GIÁ BÁN HAY BẢO HÀNH:
   - Những thông tin không thể khẳng định từ mắt nhìn, hãy đưa vào 'unverifiedData'.
   - Những gì thấy rõ (màu sắc, hình dạng, cổng kết nối nhìn thấy) đưa vào 'directObservation'.
   - Những suy luận logic hợp lý đưa vào 'aiInference'.
3. TRẠNG THÁI XÁC MINH (verificationStatus):
   - Đặt là 'VERIFIED' nếu nhìn rõ logo/model hoặc nhận diện chính xác không mơ hồ (confidenceScore >= 0.85).
   - Đặt là 'NEED_MORE_INFORMATION' nếu nhận diện được dạng sản phẩm nhưng thiếu tên cụ thể hoặc mờ (0.50 <= confidenceScore < 0.85).
   - Đặt là 'UNKNOWN' nếu hình ảnh quá tối, mờ hoặc không có sản phẩm rõ ràng (confidenceScore < 0.50).

Hãy trả về JSON theo đúng định dạng được yêu cầu.`;

    contents.push({ text: promptText });

    const response = await generateWithRetry((model) => 
      ai.models.generateContent({
        model: model,
        contents: contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              productName: { type: Type.STRING, description: "Tên thương mại chi tiết hoặc mô tả khách quan của sản phẩm" },
              category: { type: Type.STRING, description: "Danh mục ngành hàng chuyên nghiệp" },
              productDesc: { type: Type.STRING, description: "Mô tả ngắn gọn và trung thực về các đặc điểm nhìn thấy" },
              suggestedTone: { type: Type.STRING, description: "Đề xuất tông giọng lồng tiếng tối ưu nhất" },
              keywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Danh sách từ khóa thịnh hành/hashtags đề xuất"
              },
              keyUSPs: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Điểm nổi bật quan sát được từ ngoại quan sản phẩm"
              },
              verificationStatus: {
                type: Type.STRING,
                description: "Trạng thái xác minh: VERIFIED, UNKNOWN, hoặc NEED_MORE_INFORMATION"
              },
              confidenceScore: {
                type: Type.NUMBER,
                description: "Mức độ tin cậy từ 0.0 đến 1.0"
              },
              directObservation: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Chi tiết ngoại quan nhìn thấy trực tiếp"
              },
              ocrDetections: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Chữ viết đọc được trên sản phẩm hoặc bao bì"
              },
              aiInference: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Suy luận logic của AI dựa trên ngoại quan quan sát"
              },
              unverifiedData: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Thông tin chưa thể kiểm chứng từ hình ảnh (giá, công suất nội bộ, bảo hành...)"
              }
            },
            required: [
              "productName", 
              "category", 
              "productDesc", 
              "suggestedTone", 
              "keywords", 
              "verificationStatus", 
              "confidenceScore", 
              "directObservation", 
              "ocrDetections", 
              "aiInference", 
              "unverifiedData"
            ]
          }
        }
      })
    );

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Không nhận diện được nội dung từ hình ảnh/video cung cấp.");
    }

    const suggestData = JSON.parse(resultText);
    res.json(suggestData);

  } catch (apiError: any) {
    console.error("[PRODUCT-SUGGEST-ERROR]", apiError);
    res.status(502).json({
      success: false,
      error: `Không thể nhận diện sản phẩm: ${apiError.message || "Lỗi dịch vụ AI"}`,
      code: "RECOGNITION_FAILED",
      retryable: true
    });
  }
});

// Chuẩn hóa văn bản kịch bản cho giọng đọc TTS mượt mà và tự nhiên
function cleanTextForSpeech(text: string): string {
  if (!text) return "";
  return text
    .replace(/\[[^\]]*\]/g, ' ') // loại bỏ toàn bộ [SFX: ...], [Gợi ý B-Roll: ...], [SIÊU HOOK ...]
    .replace(/\([^)]*\)/g, ' ')  // loại bỏ ghi chú trong dấu ngoặc đơn
    .replace(/(KOL:|Người dẫn:|Vlogger:|MC:|Dẫn chương trình:|Lời thoại:|Kịch bản:)/gi, ' ') // loại bỏ nhãn người nói
    .replace(/[*#_~`•\-+]/g, ' ') // loại bỏ markdown và ký tự đặc biệt
    .replace(/\s+/g, ' ') // thu gọn khoảng trắng thừa
    .trim();
}

function sanitizeTextForVietnameseTTS(text: string, adaptSouthern: boolean = true): string {
  return adaptVietnameseTextForSaigonSpeech(text, adaptSouthern);
}

// Expose verified sample WAV files for live human listening & QA verification
fs.mkdirSync(TTS_SAMPLES_DIR, { recursive: true });
app.use("/samples/tts", express.static(TTS_SAMPLES_DIR));

// Endpoint: Generate High-quality Southern Saigon TTS Voiceover (STRICT_SOUTHERN_ONLY for Vietnamese)
app.post("/api/generate-tts", aiEndpointLimiter, async (req, res): Promise<any> => {
  try {
    const { text, voiceName, language, modelOverride } = req.body || {};

    if (!text || typeof text !== "string" || text.trim() === "") {
      return res.status(400).json({ error: "Không có văn bản kịch bản hợp lệ để tạo giọng đọc.", code: "EMPTY_TEXT" });
    }

    const ai = getGoogleAI("v1beta");
    if (!ai) {
      return res.status(503).json({
        success: false,
        error: "Chưa cấu hình GEMINI_API_KEY để kích hoạt tính năng lồng tiếng AI.",
        code: "MISCONFIGURED_API_KEY",
        retryable: false,
      });
    }

    // Detect English vs Vietnamese input explicitly and resolve strictly against Southern Saigon voice policy
    const langHint: "vi" | "en" =
      language === "en" || (typeof voiceName === "string" && voiceName.endsWith("_EN")) ? "en" : "vi";
    const resolved = resolveVoiceConfiguration(voiceName, langHint);

    // Strip stage directions & annotations; unconditionally enforce Southern Saigon vocabulary for Vietnamese TTS
    const cleanSpeechText = cleanTextForSpeech(text);
    const pureSpeechText = resolved.isEnglish
      ? cleanSpeechText
      : sanitizeTextForVietnameseTTS(cleanSpeechText, true);

    if (!pureSpeechText || pureSpeechText.trim() === "") {
      return res.status(400).json({ error: "Kịch bản sau khi lọc ký tự kỹ thuật bị rỗng.", code: "EMPTY_SPEECH_TEXT" });
    }

    const result = await synthesizeGeminiTtsStrict({
      aiBeta: ai,
      text: pureSpeechText,
      requestedVoiceId: resolved.voiceId,
      languageHint: langHint,
      ttsModelOverride: modelOverride,
      cacheMap: ttsMemoryCache,
      timeoutMs: 45000,
      maxRetries: 3,
    });

    return res.json({
      success: true,
      audioBase64: result.audioBase64,
      provenance: result.provenance,
      metrics: result.metrics,
      policy: SAIGON_VOICE_POLICY,
    });
  } catch (error: any) {
    const status = error?.httpStatus || 503;
    console.warn(`[SAIGON-TTS-ENDPOINT] Status=${status} Code=${error?.code || 'TTS_UNAVAILABLE'}:`, error?.message || error);
    return res.status(status).json({
      success: false,
      error: error?.message || "Không thể tạo giọng đọc Sài Gòn từ Gemini TTS.",
      code: error?.code || "TTS_UNAVAILABLE",
      retryable: error?.retryable !== false,
      retryAfterSeconds: error?.retryAfterSeconds,
      policy: SAIGON_VOICE_POLICY,
    });
  }
});

// Endpoint: Synthesize & Serve Audition Sample WAV for Southern Saigon Voice Audition
app.post("/api/tts/preview", aiEndpointLimiter, async (req, res): Promise<any> => {
  try {
    const { voiceName, customSampleText, modelOverride } = req.body || {};
    const resolved = resolveVoiceConfiguration(voiceName, "vi");
    const targetModel =
      modelOverride === VOICE_DESIGN_TTS_MODEL || modelOverride === PRIMARY_TTS_LITE_MODEL
        ? modelOverride
        : resolved.isEnglish
        ? PRIMARY_TTS_LITE_MODEL
        : VOICE_DESIGN_TTS_MODEL;

    const hasCustomText = typeof customSampleText === "string" && customSampleText.trim().length > 0;
    const sampleScript = hasCustomText
      ? sanitizeTextForVietnameseTTS(cleanTextForSpeech(customSampleText), !resolved.isEnglish)
      : resolved.isEnglish
      ? "Hello everyone! Today I am excited to introduce an amazingly useful product for daily life."
      : SAIGON_SAMPLE_SCRIPT;

    // Serve verified disk sample file immediately if it exists for canonical Saigon test sentences (saves RPM quota)
    if (!hasCustomText && !resolved.isEnglish) {
      const sampleFile = path.join(TTS_SAMPLES_DIR, `sample_${resolved.voiceId}_${targetModel}.wav`);
      if (fs.existsSync(sampleFile)) {
        const wavBuffer = fs.readFileSync(sampleFile);
        const { inspectWavAudioMetrics } = await import("./server/saigonTtsEngine");
        const { buildTtsCacheKey, computeDeterministicScriptHash } = await import("./src/saigonVoicePolicy");
        const metrics = inspectWavAudioMetrics(wavBuffer);
        if (metrics.isValidRiffWav && !metrics.isSilent) {
          return res.json({
            success: true,
            voiceId: resolved.voiceId,
            sampleText: sampleScript,
            audioBase64: wavBuffer.toString("base64"),
            samplePublicUrl: `/samples/tts/sample_${resolved.voiceId}_${targetModel}.wav`,
            provenance: {
              voiceId: resolved.voiceId,
              geminiVoiceName: resolved.geminiVoiceName,
              language: "vi-VN",
              accent: resolved.accent,
              regionalVariant: resolved.regionalVariant,
              accentPolicy: SAIGON_VOICE_POLICY.ACCENT_POLICY,
              voiceConfigVersion: SAIGON_VOICE_POLICY.VOICE_CONFIG_VERSION,
              ttsModelVersion: targetModel,
              scriptHash: computeDeterministicScriptHash(sampleScript),
              cacheKey: buildTtsCacheKey({
                voiceId: resolved.voiceId,
                language: "vi-VN",
                accent: resolved.accent,
                voiceConfigVersion: SAIGON_VOICE_POLICY.VOICE_CONFIG_VERSION,
                ttsModelVersion: targetModel,
                scriptText: sampleScript,
              }),
              cacheHit: true,
              synthesizedAt: Date.now(),
              durationSec: metrics.durationSec,
              rmsDb: metrics.rmsDb,
              isSilent: metrics.isSilent,
            },
            metrics,
          });
        }
      }
    }

    const ai = getGoogleAI("v1beta");
    if (!ai) {
      return res.status(503).json({
        success: false,
        error: "Chưa cấu hình GEMINI_API_KEY để nghe thử giọng đọc.",
        code: "MISCONFIGURED_API_KEY",
      });
    }

    const result = await synthesizeGeminiTtsStrict({
      aiBeta: ai,
      text: sampleScript,
      requestedVoiceId: resolved.voiceId,
      languageHint: resolved.isEnglish ? "en" : "vi",
      ttsModelOverride: targetModel,
      cacheMap: ttsMemoryCache,
      timeoutMs: 45000,
      maxRetries: 2,
    });

    const saved = saveSampleWavFile(resolved.voiceId, result.provenance.ttsModelVersion, result.wavBuffer);

    return res.json({
      success: true,
      voiceId: resolved.voiceId,
      sampleText: sampleScript,
      audioBase64: result.audioBase64,
      samplePublicUrl: saved.publicUrl,
      provenance: result.provenance,
      metrics: result.metrics,
    });
  } catch (error: any) {
    return res.status(error?.httpStatus || 503).json({
      success: false,
      error: error?.message || "Không thể tạo mẫu âm thanh nghe thử.",
      code: error?.code || "PREVIEW_FAILED",
      retryable: true,
      retryAfterSeconds: error?.retryAfterSeconds,
    });
  }
});

// Endpoint: Live Saigon Accent Acoustic Audit (synthesizes real WAV + analyzes audio stream honestly)
app.post("/api/tts/validate-saigon", aiEndpointLimiter, async (req, res): Promise<any> => {
  try {
    const { voiceName, customText, modelOverride, useCachedSample } = req.body || {};
    const aiBeta = getGoogleAI("v1beta");
    const aiStd = getGoogleAI();
    if (!aiBeta || !aiStd) {
      return res.status(503).json({
        success: false,
        error: "Chưa cấu hình GEMINI_API_KEY.",
        code: "MISCONFIGURED_API_KEY",
      });
    }

    const resolved = resolveVoiceConfiguration(voiceName, "vi");
    if (resolved.isEnglish) {
      return res.status(400).json({ error: "Kiểm định giọng Sài Gòn chỉ áp dụng cho voice tiếng Việt." });
    }

    const targetModel =
      modelOverride === VOICE_DESIGN_TTS_MODEL || modelOverride === PRIMARY_TTS_LITE_MODEL
        ? modelOverride
        : VOICE_DESIGN_TTS_MODEL;

    const rawText = typeof customText === "string" && customText.trim() ? customText : SAIGON_SAMPLE_SCRIPT;
    const sampleScript = sanitizeTextForVietnameseTTS(cleanTextForSpeech(rawText), true);
    const existingSamplePath = path.join(TTS_SAMPLES_DIR, `sample_${resolved.voiceId}_${targetModel}.wav`);

    let wavBuffer: Buffer;
    let saved = {
      filePath: existingSamplePath,
      publicUrl: `/samples/tts/sample_${resolved.voiceId}_${targetModel}.wav`,
    };
    let provenance: any = null;

    if (useCachedSample === true && !customText && fs.existsSync(existingSamplePath)) {
      wavBuffer = fs.readFileSync(existingSamplePath);
    } else {
      const synth = await synthesizeGeminiTtsStrict({
        aiBeta,
        text: sampleScript,
        requestedVoiceId: resolved.voiceId,
        languageHint: "vi",
        ttsModelOverride: targetModel,
        cacheMap: ttsMemoryCache,
        timeoutMs: 45000,
        maxRetries: 2,
      });
      wavBuffer = synth.wavBuffer;
      provenance = synth.provenance;
      saved = saveSampleWavFile(resolved.voiceId, synth.provenance.ttsModelVersion, synth.wavBuffer);
    }

    const audit = await auditWavDialectWithGemini({
      aiStd,
      wavBuffer,
      voiceId: resolved.voiceId,
      modelUsed: targetModel,
      testScript: sampleScript,
      sampleSavedPath: saved.filePath,
      samplePublicUrl: saved.publicUrl,
    });

    return res.json({
      success: true,
      policy: SAIGON_VOICE_POLICY,
      testSentences: SAIGON_TEST_SENTENCES,
      provenance,
      audit,
    });
  } catch (error: any) {
    return res.status(error?.httpStatus || 503).json({
      success: false,
      error: error?.message || "Kiểm định âm thanh Sài Gòn thất bại.",
      code: error?.code || "VALIDATION_FAILED",
      retryable: true,
    });
  }
});

// Endpoint: Optimize the length and tempo of a review script to precisely synchronize with the video duration
app.post("/api/optimize-script", aiEndpointLimiter, async (req, res): Promise<any> => {
  try {
    const { script, videoDuration, language } = req.body;

    if (!script) {
      return res.status(400).json({ error: "Vui lòng nhập kịch bản cần tối ưu hóa độ dài." });
    }

    if (!videoDuration || videoDuration <= 0) {
      return res.status(400).json({ error: "Vui lòng cung cấp độ dài thực tế của video để AI căn chỉnh chính xác số từ." });
    }

    const ai = getGoogleAI();
    if (!ai) {
      return res.status(503).json({
        success: false,
        error: "Chưa cấu hình GEMINI_API_KEY hoặc hệ thống AI chưa sẵn sàng.",
        code: "MISCONFIGURED_API_KEY",
        retryable: false
      });
    }

    const isEn = language === 'en';

    // 2.2 words per second is the sweet spot for professional, warm, natural Southern Vietnamese voice-overs, and around 2.3 for English
    const wordsPerSecond = isEn ? 2.3 : 2.22;
    const targetWords = Math.round(videoDuration * wordsPerSecond);
    const minWords = Math.max(12, Math.round(videoDuration * (isEn ? 2.1 : 2.05)));
    const maxWords = Math.round(videoDuration * (isEn ? 2.5 : 2.38));

    const optimizationPrompt = isEn ? `
You are an outstanding Creative Advertising Copywriter & Professional Editor.
Please rewrite and optimize the English voiceover script below to make it PERFECTLY CALIBRATED to match an uploaded video of exactly ${Math.round(videoDuration)} seconds.

SPECIFICATIONS:
- Video duration: ${videoDuration.toFixed(1)} seconds.
- Target words: ~${targetWords} English words.
- Allowed range (strict timing constraint): Between ${minWords} and ${maxWords} words.

USER'S ORIGINAL SCRIPT:
"${script}"

REQUIREMENTS:
1. Rewrite the script in premium, persuasive, and highly engaging English, keeping the exact core benefits, tone preset, and product value.
2. If it is too short, expand it with sensory details or strong product benefits. If too long, prune words concisely.
3. DO NOT include B-roll directions, SFX, emojis, hashtags, parenthetical directions, or bracketed instructions. Output pure narratable speech ONLY for seamless Text-to-Speech synthesis.
4. Total words MUST be between ${minWords} and ${maxWords} words.
5. Do not include any intro, outro, recommendations, or conversational preambles. Output ONLY the optimized voiceover text.
` : `
Bạn là Giám đốc Sáng tạo kịch bản Quảng cáo xuất sắc (Creative Copywriter & Editing Expert).
Hãy nhận và tối ưu hóa kịch bản lồng tiếng tiếng Việt dưới đây để nó ĐẠT ĐỘ DÀI HOÀN HẢO tương ứng khớp khít với video gốc có thời lượng chính xác là ${Math.round(videoDuration)} giây.

THÔNG SỐ PHÂN TÍCH:
- Số giây video phát: ${videoDuration.toFixed(1)} giây.
- Mục tiêu lý tưởng: ~${targetWords} từ tiếng Việt.
- Khoảng số từ cho phép (Kỷ luật nghiêm ngặt): Từ ${minWords} đến ${maxWords} từ tiếng Việt (mỗi âm tiết cách nhau bởi dấu cách là một từ).

VĂN BẢN GỐC CỦA NGƯỜI DÙNG:
"${script}"

YÊU CẦU THIẾT KẾ & TẤN CÔNG ĐỘ DÀI:
1. Bạn phải viết lại kịch bản, giữ nguyên 100% tinh thần, đặc điểm sản phẩm, cảm xúc dạt dào, văn phong Nam Bộ / Sài Gòn chuyên nghiệp, ấm áp và cực kỳ cuốn hút sang trọng. Tuyệt đối KHÔNG dùng từ ngữ hoặc ngữ điệu miền Bắc (như "nhé", "thế này", "bát", "thìa", "vâng", "xem").
2. Bạn có thể lược bớt những câu từ rườm rà, lặp ý hoặc kéo dài thêm câu từ bằng cách bổ sung tính từ/trải nghiệm sành sỏi nếu kịch bản quá ngắn.
3. KHÔNG đưa bất kỳ chỉ dẫn cảnh quay, B-Roll, SFX, hay ký hiệu nào khác ngoài văn bản thoại thuyết minh thuần túy. KHÔNG thêm emojis, hashtags, hay dấu ngoặc đơn. Chỉ lồng tiếng thuần để cho AI TTS giọng Sài Gòn đọc mượt mà.
4. BẮT BUỘC ĐẾM chính xác số từ (syllables) trong kịch bản mới của bạn trước khi trả về. Tổng số từ PHẢI nằm trong khoảng từ ${minWords} đến ${maxWords} từ. Đây là yêu cầu quan trọng số một của Dự án để không làm lag hay tràn âm thanh.
5. Kết quả trả về chỉ được chứa duy nhất nội dung kịch bản văn bản review thuần túy đã tối ưu, không có lời dạo đầu, lời khuyên, hay bất cứ lời chào xã giao nào bổ sung.

Hãy thực thi nhiệm vụ một cách chuyên nghiệp nhất!`;

    const response = await generateWithRetry(
      (model) => 
        ai.models.generateContent({
          model: model,
          contents: [{ parts: [{ text: optimizationPrompt }] }],
        }),
      3,
      1000,
      PRIMARY_TEXT_VISION_MODEL,
      true
    );

    const resultText = response.text || "";
    if (!resultText) {
      throw new Error("Không thể tối ưu hóa kịch bản từ mô hình AI.");
    }

    res.json({ optimizedScript: resultText.trim() });

  } catch (error: any) {
    console.error("Lỗi tối ưu kịch bản:", error);
    res.status(502).json({
      success: false,
      error: `Không thể tối ưu kịch bản: ${error.message || "Lỗi dịch vụ AI"}`,
      code: "OPTIMIZE_FAILED",
      retryable: true
    });
  }
});

// Endpoint: AI Smart Trending Product Scanner with market hypotheses transparency
app.post("/api/scan-trending-products", aiEndpointLimiter, async (req, res): Promise<any> => {
  try {
    const { category } = req.body;
    const ai = getGoogleAI();
    if (!ai) {
      return res.status(503).json({
        success: false,
        error: "Chưa cấu hình GEMINI_API_KEY hoặc hệ thống AI chưa sẵn sàng.",
        code: "MISCONFIGURED_API_KEY",
        retryable: false
      });
    }

    const selectedCategory = category || "all";
    const promptText = `
Bạn là chuyên gia phân tích xu hướng thương mại điện tử và cố vấn kịch bản video review ngắn (TikTok, Reels, Shorts).
Nhiệm vụ: Đề xuất danh sách 5 ý tưởng sản phẩm tiềm năng thuộc danh mục: "${selectedCategory}" (nếu là "all", hãy chọn đa dạng từ Gia dụng, Công nghệ, Mỹ phẩm, Decor).

NGUYÊN TẮC MINH BẠCH VÀ CHÂN THỰC (ZERO FAKE DATA):
1. TUYỆT ĐỐI KHÔNG BỊA ĐẶT SỐ LIỆU ĐƠN HÀNG HOẶC LƯỢT MUA THỰC TẾ (ví dụ: cấm bịa "12k+ lượt mua", "15k+ đơn hàng", "8.5k+ KOLs tin dùng").
2. ĐÂY LÀ GIẢ THUYẾT XU HƯỚNG TỪ MÔ HÌNH AI:
   - Ghi rõ 'isMarketHypothesis': true.
   - Ghi 'marketHypothesisNotice': "AI-generated market hypothesis – Chưa xác minh bằng dữ liệu thị trường".
   - 'estimationMethod': "Mô hình ngôn ngữ phân tích xu hướng tìm kiếm và nội dung sáng tạo số".
   - 'dataPeriod': "Giai đoạn 30 ngày gần nhất".
   - 'verificationStatus': "UNVERIFIED_HYPOTHESIS".
   - 'marketInterestLevel': Một trong 3 mức: "Cao" | "Rất cao" | "Đột biến".

Hãy trả về định dạng JSON chuẩn:
{
  "trendingProducts": [
    {
      "id": "trend_1",
      "name": "Tên sản phẩm cụ thể và hấp dẫn",
      "category": "Danh mục sản phẩm",
      "marketInterestLevel": "Cao" | "Rất cao" | "Đột biến",
      "isMarketHypothesis": true,
      "marketHypothesisNotice": "AI-generated market hypothesis – Chưa xác minh bằng dữ liệu thị trường",
      "estimationMethod": "Phân tích xu hướng từ khóa AI & cộng đồng sáng tạo",
      "dataPeriod": "Gần đây",
      "verificationStatus": "UNVERIFIED_HYPOTHESIS",
      "targetAudience": "Đối tượng khách hàng tiềm năng",
      "viralHook": "Câu Hook mở màn ấn tượng (không giục mua, tập trung trải nghiệm)",
      "shortDesc": "Mô tả công năng và lý do sản phẩm thu hút sự chú ý",
      "suggestedTone": "Thuyết phục & Truyền cảm" | "Sôi nổi & Kích thích" | "Phân tích chuyên sâu" | "Hài hước & Gần gũi",
      "hashtags": ["#review", "#trending", "#fyp"]
    }
  ]
}`;

    const response = await generateWithRetry((model) => 
      ai.models.generateContent({
        model: model,
        contents: [{ parts: [{ text: promptText }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              trendingProducts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    category: { type: Type.STRING },
                    marketInterestLevel: { type: Type.STRING },
                    isMarketHypothesis: { type: Type.BOOLEAN },
                    marketHypothesisNotice: { type: Type.STRING },
                    estimationMethod: { type: Type.STRING },
                    dataPeriod: { type: Type.STRING },
                    verificationStatus: { type: Type.STRING },
                    targetAudience: { type: Type.STRING },
                    viralHook: { type: Type.STRING },
                    shortDesc: { type: Type.STRING },
                    suggestedTone: { type: Type.STRING },
                    hashtags: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: [
                    "id", "name", "category", "marketInterestLevel", "isMarketHypothesis",
                    "marketHypothesisNotice", "estimationMethod", "dataPeriod", "verificationStatus",
                    "targetAudience", "viralHook", "shortDesc", "suggestedTone", "hashtags"
                  ]
                }
              }
            },
            required: ["trendingProducts"]
          }
        }
      })
    );

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Không nhận được dữ liệu xu hướng từ mô hình AI.");
    }
    const trendData = JSON.parse(resultText);
    res.json(trendData);

  } catch (error: any) {
    console.error("Lỗi quét sản phẩm xu hướng:", error);
    res.status(502).json({
      success: false,
      error: `Không thể quét sản phẩm xu hướng: ${error.message || "Lỗi dịch vụ AI"}`,
      code: "TRENDS_FAILED",
      retryable: true
    });
  }
});

// Endpoint: AI Smart Hook generator
app.post("/api/suggest-hooks", aiEndpointLimiter, async (req, res): Promise<any> => {
  try {
    const { productName, language } = req.body;
    if (!productName) {
      return res.status(400).json({ error: "Thiếu tên sản phẩm để gợi ý Hook." });
    }

    const ai = getGoogleAI();
    if (!ai) {
      return res.status(503).json({
        success: false,
        error: "Chưa cấu hình GEMINI_API_KEY hoặc hệ thống AI chưa sẵn sàng.",
        code: "MISCONFIGURED_API_KEY",
        retryable: false
      });
    }

    const isEn = language === 'en';

    const promptText = isEn ? `
You are an expert Creative Advertising Director specializing in high-retention hook copywriting for TikTok, Reels, and YouTube Shorts.
Your task is to write exactly 3 sensory and high-attention hooks (introductory video captions) that spark extreme curiosity for: "${productName}".

CRITICAL ORGANIC REACH REQUIREMENTS:
1. STRICTLY FORBIDDEN to use direct sales call-to-actions, commercial pitches, pricing, or purchase triggers (e.g., avoid "BUY NOW", "CLICK HERE", "DISCOUNT", "ON SALE").
2. Focus strictly on REAL-WORLD IMPRESSIONS, unexpected user warnings, or objective curiosity triggers that make users stop scrolling in the first 3 seconds.
3. Write completely in ENGLISH, IN ALL CAPS.
4. Keep it concise (10-15 words), suitable for on-screen dynamic text (Hook Banner).
5. TTS-Ready: No emojis, hashtags, or bracketed instructions. Just pure speakable text.

Return your response in standard JSON format containing a "hooks" array of strings:
{
  "hooks": [
    "FIRST ENGAGING HOOK IN ENGLISH CAPS",
    "SECOND ENGAGING HOOK IN ENGLISH CAPS",
    "THIRD ENGAGING HOOK IN ENGLISH CAPS"
  ]
}
` : `
Hãy đóng vai một chuyên gia Giám đốc Sáng tạo kịch bản quảng cáo và thu hút tỷ lệ giữ chân (Retention) xuất sắc trên TikTok, Reels và Shorts.
Nhiệm vụ của bạn là viết ra đúng 3 câu Hook (tiêu đề mở đầu video ngắn) cực kỳ giật gân, khơi dậy trí tò mò tuyệt đối cho sản phẩm: "${productName}".

YÊU CẦU ĐẶC BIỆT QUAN TRỌNG ĐỂ TỐI ƯU THUẬT TOÁN TIKTOK FYP 2026 (ORGANIC REACH):
1. TUYỆT ĐỐI KHÔNG kêu gọi bán hàng, không giục mua sắm, không nhắc tới mã giảm giá, giỏ hàng hay bất kì yếu tố thương mại nào (Ví dụ tránh tuyệt đối: "MUA NGAY", "CLICK GIỎ HÀNG", "CHỈ HÔM NAY", "GIÁ RẺ").
2. Chỉ tập trung vào TRẢI NGHIỆM TIÊU DÙNG THỰC TẾ, CẢNH BÁO khuyết điểm/lưu ý, hoặc khơi gợi TRÍ TÒ MÒ tột độ đầy khách quan để người xem không thể lướt qua trong 3 giây đầu tiên.
3. Áp dụng 3 công thức vàng giữ chân người xem (Retention Formulas):
   - Hook 1 (Cảnh báo trải nghiệm / Tiết kiệm chi phí): ĐỪNG VỘI MUA ... NẾU CHƯA BIẾT SỰ THẬT NÀY.
   - Hook 2 (Khám phá bí mật / Trải nghiệm bất ngờ): KIẾP NẠN MUA HÀNG ONLINE VÀ CÁI KẾT SỐC VỚI ...
   - Hook 3 (Kiểm chứng thực tế / Góc nhìn khách quan): KIỂM CHỨNG CHẤT LƯỢNG THỰC TẾ ... SAU THỜI GIAN DÀI SỬ DỤNG.
4. Viết bằng tiếng Việt, in hoa hoàn toàn.
5. Ngắn gọn, súc tích (khoảng 10-15 từ), phù hợp làm chữ chạy trên màn hình (Hook Banner).
6. TTS-Ready: Không chứa icon/emoji, hashtag hay kí tự đặc biệt kỳ lạ ngoài chấm, phẩy, hỏi chấm.

Trả về kết quả chuẩn định dạng JSON chứa mảng "hooks" như sau:
{
  "hooks": [
    "CÂU HOOK THỨ NHẤT IN HOA",
    "CÂU HOOK THỨ HAI IN HOA",
    "CÂU HOOK THỨ BA IN HOA"
  ]
}
`;

    const response = await generateWithRetry((model) =>
      ai.models.generateContent({
        model: model,
        contents: [{ parts: [{ text: promptText }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hooks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Mảng chứa chính xác 3 câu hook giật gân độc quyền"
              }
            },
            required: ["hooks"]
          }
        }
      })
    );

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Không nhận được phản hồi gợi ý câu Hook từ AI.");
    }
    const hooksData = JSON.parse(resultText);
    res.json(hooksData);

  } catch (error: any) {
    console.error("Lỗi gợi ý câu Hook:", error);
    res.status(502).json({
      success: false,
      error: `Không thể gợi ý câu Hook: ${error.message || "Lỗi dịch vụ AI"}`,
      code: "HOOKS_FAILED",
      retryable: true
    });
  }
});

// Endpoint: Translate subtitle segments for bilingual display
app.post("/api/translate-subtitles", aiEndpointLimiter, async (req, res): Promise<any> => {
  try {
    const { segments, targetLang } = req.body;

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: "Thiếu danh sách các phân cảnh phụ đề cần dịch." });
    }

    const ai = getGoogleAI();
    if (!ai) {
      return res.status(503).json({
        success: false,
        error: "Chưa cấu hình GEMINI_API_KEY hoặc hệ thống AI chưa sẵn sàng.",
        code: "MISCONFIGURED_API_KEY",
        retryable: false
      });
    }

    const targetLanguageName = {
      vi: "Vietnamese",
      en: "English",
      ja: "Japanese",
      ko: "Korean",
      th: "Thai",
      zh: "Chinese (Simplified)"
    }[targetLang as string] || "English";

    const promptText = `
You are a world-class localization expert and creative marketing copywriter specialized in professional subtitle translation for short-form video commercials (TikTok, Reels, YouTube Shorts, CapCut).
Your task is to translate a sequence of short subtitle segments into ${targetLanguageName}.

CRITICAL REQUIREMENTS FOR ULTIMATE PROFESSIONALISM AND CLASS:
1. ELEVATED STYLE & COMMERCIAL copywriting: Do not translate literally word-for-word. Use high-impact commercial vocabulary, strong active verbs, and natural native phrasing in ${targetLanguageName}.
   - For Vietnamese to English: Translate trendy words beautifully (e.g., "chất như nước cất" -> "top-tier quality" / "absolutely premium", "bão view" -> "going fully viral", "ngon bổ rẻ" -> "unbeatable value", "đập hộp" -> "unboxing live").
   - Ensure the tone is elite, smooth, persuasive, and perfectly localized for standard luxury or trending consumer brands.
2. CONCISE PACING & BREVITY: Subtitles are shown in rapid successions. Keep every segment extremely tight and punchy (ideally under 5-7 words per segment). Never over-explain or write long-winded academic sentences.
3. FLUID CONTEXTUAL FLOW: Read the list of segments as one single continuous narrative script. Ensure that transition words, sentence connections, and tense are consistent and seamless when read in succession.
4. ABSOLUTE CLEANLINESS: Strip away all technical annotations, brackets, markdown, or cues (e.g., [Music], (Laughter), KOL:, MC:). Only translate the pure spoken words.
5. CASING Consistency: Return clean, standard Sentence Case to ensure the subtitle layout looks beautifully polished, minimalist, and high-class.

Input segments to translate:
${segments.map((seg: any, idx: number) => `[${idx}]: "${seg.text}"`).join("\n")}
`;

    const response = await generateWithRetry((model) =>
      ai.models.generateContent({
        model: model,
        contents: [{ parts: [{ text: promptText }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Translated texts for each segment in the exact same order as input"
              }
            },
            required: ["translations"]
          }
        }
      })
    );

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Không nhận được phản hồi dịch thuật từ AI.");
    }
    const translationsData = JSON.parse(resultText);
    res.json(translationsData);

  } catch (error: any) {
    console.error("Lỗi dịch thuật phụ đề:", error);
    res.status(502).json({
      success: false,
      error: `Không thể dịch phụ đề: ${error.message || "Lỗi dịch vụ AI"}`,
      code: "TRANSLATE_FAILED",
      retryable: true
    });
  }
});

// Endpoint: Comprehensive Smart Checker and Auto-Fixer for Reviews, Scripts and Subtitles
app.post("/api/check-and-fix-review-and-subtitles", aiEndpointLimiter, async (req, res): Promise<any> => {
  try {
    const { 
      detailedReview, 
      marketingScript, 
      summary, 
      ctaText, 
      subtitleSegments, 
      videoDuration, 
      language = 'vi',
      productName = '',
      adaptSouthern = language !== 'en'
    } = req.body;

    const ai = getGoogleAI();
    if (!ai) {
      return res.status(503).json({
        success: false,
        error: "Chưa cấu hình GEMINI_API_KEY hoặc hệ thống AI chưa sẵn sàng.",
        code: "MISCONFIGURED_API_KEY",
        retryable: false
      });
    }

    const duration = typeof videoDuration === 'number' && videoDuration > 0 ? videoDuration : 30;

    const dialectInstruction = adaptSouthern ? `
2. 🗣️ ĐỒNG BỘ PHONG CÁCH NAM BỘ (THEO YÊU CẦU):
   - Chuyển các hư từ sang văn phong Nam Bộ / Sài Gòn ấm áp, tự nhiên (*nha, nha bạn, nha cả nhà, thiệt là, thiệt sự, coi, ngàn, như vầy, muỗng, chén, trái...*).
` : `
2. 🗣️ TÔN TRỌNG GIỌNG VĂN & PHƯƠNG NGỮ GỐC:
   - Giữ nguyên đại từ và phương ngữ gốc của người viết (không tự ý chuyển từ Bắc/Trung sang Nam hoặc ngược lại trừ khi sai chính tả).
`;

    const promptText = `
Bạn là Chuyên gia Kiểm định Chất lượng Nội dung (Chief Content QA & Subtitle Master) hàng đầu thế giới cho Video Thương mại Điện tử và TikTok Shop / Reels.
Nhiệm vụ của bạn là rà soát, kiểm tra toàn diện và tự động sửa chữa triệt để mọi lỗi chính tả và cấu trúc trong bài viết review, kịch bản lồng tiếng và phụ đề video sau đây:

THÔNG TIN ĐẦU VÀO:
- Tên sản phẩm: "${productName}"
- Thời lượng video: ${duration.toFixed(1)} giây
- Ngôn ngữ chính: ${language === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'}
- Tóm tắt hiện tại: """${summary || ''}"""
- Kêu gọi hành động (CTA): """${ctaText || ''}"""
- Kịch bản lồng tiếng: """${marketingScript || ''}"""
- Bài viết review chi tiết phân cảnh: """${detailedReview || ''}"""
- Danh sách phụ đề hiện tại (${Array.isArray(subtitleSegments) ? subtitleSegments.length : 0} phân cảnh):
${Array.isArray(subtitleSegments) ? subtitleSegments.map((s: any, idx: number) => `[${idx}] (${s.start}s -> ${s.end}s): "${s.text}"`).join('\n') : '(Chưa có phụ đề)'}

CÁC TIÊU CHUẨN KIỂM TRA VÀ TỰ ĐỘNG SỬA LỖI BẮT BUỘC:
1. ✍️ CHÍNH TẢ, NGỮ PHÁP & CÂU TỪ:
   - Sửa toàn bộ lỗi chính tả tiếng Việt (lỗi dấu hỏi/ngã, lỗi gõ Telex, lỗi từ ghép) hoặc ngữ pháp tiếng Anh.
   - Viết hoa đúng danh từ riêng, tên thương hiệu, tên sản phẩm.
   - Đảm bảo câu cú mạch lạc, chấm phẩy đúng nhịp thở thuyết minh.
${dialectInstruction}
3. 🛡️ TUÂN THỦ CHÍNH SÁCH TIKTOK SHOP / SHOPEE / REELS (AN TOÀN BÁN HÀNG 100%):
   - Tuyệt đối không dùng các từ bị cấm, phóng đại hoặc trị liệu: "cam kết 100%", "trị dứt điểm", "vĩnh viễn", "chữa khỏi hoàn toàn", "số 1 thế giới", "hàng đầu", "rẻ nhất", "chính hãng 100%", "quốc dân".
   - Thay thế bằng các từ ngữ tinh tế, thuyết phục, chuẩn chính sách thương mại điện tử.

4. ⏱️ CÂN CHỈNH ĐỘ DÀI & NHỊP ĐIỆU LỒNG TIẾNG:
   - Tối ưu số từ của kịch bản lồng tiếng (marketingScript) sao cho khớp hoàn hảo với thời lượng video ${duration.toFixed(1)}s (trung bình 2.1 - 2.3 từ/giây).
   - Đảm bảo kịch bản có đủ 4 giai đoạn: Hook 3s đầu -> Trải nghiệm giác quan -> Công năng thực chiến -> CTA nhấp giỏ hàng.

5. 🎬 ĐỒNG BỘ & SỬA LỖI PHỤ ĐỀ (SUBTITLE TIMELINE & CLEANING):
   - Phân chia lại danh sách phụ đề (fixedSubtitles) sao cho mỗi phân cảnh ngắn gọn (3-6 từ), không quá dài.
   - Loại bỏ mọi ký tự thừa như \`*\`, \`#\`, \`[B-roll]\`, \`(SFX)\` khỏi text phụ đề.
   - Căn chỉnh mốc thời gian start và end tăng dần liên tục từ 0.0s đến xấp xỉ ${duration.toFixed(1)}s, tuyệt đối không bị trùng lặp giây (overlap).
   - Viết hoa chữ cái đầu câu cho từng phân cảnh phụ đề chuẩn phong cách TikTok/CapCut.

6. 📋 TỔNG HỢP DANH SÁCH CÁC LỖI ĐÃ TÌM THẤY VÀ ĐÃ ĐƯỢC SỬA (fixedIssues):
   - Liệt kê 3-6 điểm lỗi cụ thể đã được hệ thống phát hiện và khắc phục tự động.

Hãy trả về phản hồi theo định dạng JSON với schema sau:
- fixedSummary: Chuỗi tóm tắt sản phẩm đã sửa lỗi
- fixedCtaText: Chuỗi CTA đã sửa lỗi và tối ưu chuyển đổi
- fixedMarketingScript: Chuỗi kịch bản lồng tiếng hoàn chỉnh đã sửa lỗi và tối ưu độ dài
- fixedDetailedReview: Chuỗi bài viết review chi tiết phân cảnh (Markdown) đã chuẩn hóa
- fixedSubtitles: Mảng các phân cảnh phụ đề đã sửa lỗi và đồng bộ thời gian (mỗi phần tử gồm { start: number, end: number, text: string })
- fixedIssues: Mảng các chuỗi mô tả lỗi đã sửa
- qualityScoreBefore: Số điểm chất lượng trước khi sửa (ví dụ: 78)
- qualityScoreAfter: Số điểm chất lượng sau khi sửa (ví dụ: 99)
- optimizationSummary: Tóm tắt ngắn gọn 1-2 câu về những cải tiến lớn nhất
`;

    const response = await generateWithRetry((model) =>
      ai.models.generateContent({
        model: model,
        contents: [{ parts: [{ text: promptText }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              fixedSummary: { type: Type.STRING, description: "Tóm tắt đã sửa lỗi" },
              fixedCtaText: { type: Type.STRING, description: "CTA đã sửa lỗi" },
              fixedMarketingScript: { type: Type.STRING, description: "Kịch bản lồng tiếng đã sửa lỗi và chuẩn nhịp điệu" },
              fixedDetailedReview: { type: Type.STRING, description: "Bài review phân cảnh đã sửa lỗi" },
              fixedSubtitles: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    start: { type: Type.NUMBER, description: "Giây bắt đầu" },
                    end: { type: Type.NUMBER, description: "Giây kết thúc" },
                    text: { type: Type.STRING, description: "Câu phụ đề đã sửa lỗi" }
                  },
                  required: ["start", "end", "text"]
                },
                description: "Danh sách phụ đề đã sửa lỗi và phân bổ đều theo thời lượng"
              },
              fixedIssues: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Danh sách các lỗi đã phát hiện và sửa chữa"
              },
              qualityScoreBefore: { type: Type.NUMBER, description: "Điểm chất lượng ban đầu (1-100)" },
              qualityScoreAfter: { type: Type.NUMBER, description: "Điểm chất lượng sau khi sửa (1-100)" },
              optimizationSummary: { type: Type.STRING, description: "Tóm tắt kết quả kiểm tra sửa lỗi" }
            },
            required: [
              "fixedSummary", 
              "fixedCtaText", 
              "fixedMarketingScript", 
              "fixedDetailedReview", 
              "fixedSubtitles", 
              "fixedIssues", 
              "qualityScoreBefore", 
              "qualityScoreAfter", 
              "optimizationSummary"
            ]
          }
        }
      })
    );

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Không nhận được kết quả phân tích sửa lỗi từ AI.");
    }
    const checkResult = JSON.parse(resultText);
    return res.json(checkResult);

  } catch (error: any) {
    console.error("Lỗi kiểm tra sửa lỗi bài viết review & phụ đề:", error);
    const isQuota = error.status === 429 || String(error.message).includes("quota") || String(error.message).includes("RESOURCE_EXHAUSTED");
    const isUnavailable = error.status === 503 || String(error.message).includes("503") || String(error.message).includes("UNAVAILABLE");
    return res.status(isQuota ? 429 : (isUnavailable ? 503 : 502)).json({
      success: false,
      error: isQuota
        ? "Hạn ngạch Google Gemini API tạm thời chạm mức giới hạn. Vui lòng thử lại sau."
        : `Không thể kiểm tra & sửa lỗi bằng AI: ${error.message || "Lỗi dịch vụ AI"}`,
      code: isQuota ? "QUOTA_EXHAUSTED" : (isUnavailable ? "SERVICE_UNAVAILABLE" : "AUDIT_FAILED"),
      retryable: true
    });
  }
});

function serverPreserveCase(original: string, target: string): string {
  if (!original || !target) return target;
  if (original === original.toUpperCase() && original !== original.toLowerCase()) return target.toUpperCase();
  const first = original.charAt(0);
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
}

function toServerUnicodeBoundaryRegex(regex: RegExp): RegExp {
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

const SERVER_LOCAL_SPELL_RULES: Array<[RegExp, string, string]> = [
  [/\bmđóm\s+iếng\b/gi, 'mỗi miếng', "Sửa lỗi nhận diện/dính phím 'mđóm iếng' -> 'mỗi miếng'"],
  [/\bmđom\s+iếng\b/gi, 'mỗi miếng', "Sửa lỗi nhận diện/dính phím 'mđom iếng' -> 'mỗi miếng'"],
  [/\bmđón\s+iếng\b/gi, 'mỗi miếng', "Sửa lỗi nhận diện/dính phím 'mđón iếng' -> 'mỗi miếng'"],
  [/\bmđóm\s+miếng\b/gi, 'mỗi miếng', "Sửa lỗi nhận diện 'mđóm miếng' -> 'mỗi miếng'"],
  [/\bmđóm\b/gi, 'món', "Sửa lỗi nhận diện âm thanh: 'món'"],
  [/\bmđon\b/gi, 'món', "Sửa lỗi nhận diện âm thanh: 'món'"],
  [/\bmđom\b/gi, 'món', "Sửa lỗi nhận diện âm thanh: 'món'"],
  [/\biếng\s+(chuối|bánh|thịt|cá|trái|hoa|đậu|chả|gà|bò)/gi, 'miếng $1', "Sửa lỗi thiếu phụ âm đầu 'iếng' -> 'miếng'"],
  [/\bliu\s+r\.+u\b/gi, 'liu riu', "Chuẩn chính tả: 'liu riu'"],
  [/\bliu\s+riu\b/gi, 'liu riu', "Chuẩn chính tả: 'liu riu'"],
  [/\br\.+u\b/gi, 'riu', "Sửa lỗi ký tự chấm dính 'r.u' -> 'riu'"],
  [/\bchuối\s+nam\b/gi, 'chuối xiêm', "Chuẩn hóa tên chuối Nam Bộ: 'chuối xiêm'"],
  [/\bchuốinam\b/gi, 'chuối xiêm', "Tách từ dính: 'chuối xiêm'"],
  [/\bmiếngchuối\b/gi, 'miếng chuối', "Tách từ dính: 'miếng chuối'"],
  [/\bchuốixiêm\b/gi, 'chuối xiêm', "Tách từ dính: 'chuối xiêm'"],
  [/\bbánhchuối\b/gi, 'bánh chuối', "Tách từ dính: 'bánh chuối'"],
  [/\b(chiên|vàng|ngon|rất|da)\s+zòn\b/gi, '$1 giòn', "Chuẩn chính tả: '$1 giòn'"],
  [/\b(chiên|vàng|ngon|rất|da)\s+dòn\b/gi, '$1 giòn', "Chuẩn chính tả: '$1 giòn'"],
  [/\bvàng\s+dòn\b/gi, 'vàng giòn', "Chuẩn chính tả: 'vàng giòn'"],
  [/\bvàng\s+zòn\b/gi, 'vàng giòn', "Chuẩn chính tả: 'vàng giòn'"],
  [/\bchiên\s+dòn\b/gi, 'chiên giòn', "Chuẩn chính tả: 'chiên giòn'"],
  [/\bchiên\s+zòn\b/gi, 'chiên giòn', "Chuẩn chính tả: 'chiên giòn'"],
  [/\bdòn\s+rụm\b/gi, 'giòn rụm', "Chuẩn chính tả: 'giòn rụm'"],
  [/\bzòn\s+rụm\b/gi, 'giòn rụm', "Chuẩn chính tả: 'giòn rụm'"],
  [/\bzòn\b/gi, 'giòn', "Chuẩn chính tả: 'giòn'"],
  [/\bdòn\b/gi, 'giòn', "Chuẩn chính tả: 'giòn'"],
  [/\bthơm\s+phứt\b/gi, 'thơm phức', "Chuẩn chính tả: 'thơm phức'"],
  [/\bnóng\s+hỗi\b/gi, 'nóng hổi', "Chuẩn chính tả: 'nóng hổi'"],
  [/\bdầu\s+mở\b/gi, 'dầu mỡ', "Chuẩn chính tả: 'dầu mỡ'"],
  [/\bkhuấy\s+đều\b/gi, 'khuấy đều', "Chuẩn chính tả: 'khuấy đều'"],
  [/\bquấy\s+đều\b/gi, 'khuấy đều', "Chuẩn hóa ẩm thực Nam Bộ: 'khuấy đều'"],
  [/\bthơm\s+nức\s+mủi\b/gi, 'thơm nức mũi', "Chuẩn chính tả: 'thơm nức mũi'"],
  [/\bướp\s+da\s+vị\b/gi, 'ướp gia vị', "Chuẩn chính tả: 'ướp gia vị'"],
  [/\bngon\s+miệng\b/gi, 'ngon miệng', "Chuẩn chính tả: 'ngon miệng'"],
  [/\bsản phẫm\b/gi, 'sản phẩm', "Chuẩn chính tả: 'sản phẩm'"],
  [/\bsản phảm\b/gi, 'sản phẩm', "Chuẩn chính tả: 'sản phẩm'"],
  [/\bmẩu mã\b/gi, 'mẫu mã', "Chuẩn chính tả: 'mẫu mã'"],
  [/\bchia sẽ\b/gi, 'chia sẻ', "Chuẩn chính tả: 'chia sẻ'"],
  [/\btrãi nghiệm\b/gi, 'trải nghiệm', "Chuẩn chính tả: 'trải nghiệm'"],
  [/\bchính hảng\b/gi, 'chính hãng', "Chuẩn chính tả: 'chính hãng'"],
  [/\bưu đải\b/gi, 'ưu đãi', "Chuẩn chính tả: 'ưu đãi'"],
  [/\bdư giả\b/gi, 'dư dả', "Chuẩn chính tả: 'dư dả'"],
  [/\brãnh rỗi\b/gi, 'rảnh rỗi', "Chuẩn chính tả: 'rảnh rỗi'"],
  [/\bcãm nhận\b/gi, 'cảm nhận', "Chuẩn chính tả: 'cảm nhận'"],
  [/\bdưởng ẩm\b/gi, 'dưỡng ẩm', "Chuẩn chính tả: 'dưỡng ẩm'"],
  [/\bdể thương\b/gi, 'dễ thương', "Chuẩn chính tả: 'dễ thương'"],
  [/\bhửu ích\b/gi, 'hữu ích', "Chuẩn chính tả: 'hữu ích'"],
  [/\blổi lầm\b/gi, 'lỗi lầm', "Chuẩn chính tả: 'lỗi lầm'"],
  [/\brẽ rề\b/gi, 'rẻ rề', "Chuẩn chính tả: 'rẻ rề'"],
  [/\brực rở\b/gi, 'rực rỡ', "Chuẩn chính tả: 'rực rỡ'"],
  [/\brạng rở\b/gi, 'rạng rỡ', "Chuẩn chính tả: 'rạng rỡ'"],
  [/\bngở ngàng\b/gi, 'ngỡ ngàng', "Chuẩn chính tả: 'ngỡ ngàng'"],
  [/\bvững trãi\b/gi, 'vững chãi', "Chuẩn chính tả: 'vững chãi'"],
  [/\bmê mẫn\b/gi, 'mê mẩn', "Chuẩn chính tả: 'mê mẩn'"],
  [/\bbền bĩ\b/gi, 'bền bỉ', "Chuẩn chính tả: 'bền bỉ'"],
  [/\btỉ mĩ\b/gi, 'tỉ mỉ', "Chuẩn chính tả: 'tỉ mỉ'"],
  [/\bhướng dẩn\b/gi, 'hướng dẫn', "Chuẩn chính tả: 'hướng dẫn'"],
  [/\bnhược điễm\b/gi, 'nhược điểm', "Chuẩn chính tả: 'nhược điểm'"],
  [/\bưu điễm\b/gi, 'ưu điểm', "Chuẩn chính tả: 'ưu điểm'"],
  [/\bvội vả\b/gi, 'vội vã', "Chuẩn chính tả: 'vội vã'"],
  [/\bđầy đũ\b/gi, 'đầy đủ', "Chuẩn chính tả: 'đầy đủ'"],
  [/\bsẳn sàng\b/gi, 'sẵn sàng', "Chuẩn chính tả: 'sẵn sàng'"],
  [/\bsữa rữa mặt\b/gi, 'sữa rửa mặt', "Chuẩn chính tả: 'sữa rửa mặt'"],
  [/\bsửa rửa mặt\b/gi, 'sữa rửa mặt', "Chuẩn chính tả: 'sữa rửa mặt'"],
  [/\bsữa tắm\b/gi, 'sữa tắm', "Chuẩn chính tả: 'sữa tắm'"],
  [/\bsữa soạn\b/gi, 'sửa soạn', "Chuẩn chính tả: 'sửa soạn'"],
  [/\bsửa chửa\b/gi, 'sửa chữa', "Chuẩn chính tả: 'sửa chữa'"],
  [/\bsữa chữa\b/gi, 'sửa chữa', "Chuẩn chính tả: 'sửa chữa'"],
  [/\bxịn xò\b/gi, 'xịn sò', "Chuẩn chính tả: 'xịn sò'"],
  [/\bsắp sếp\b/gi, 'sắp xếp', "Chuẩn chính tả: 'sắp xếp'"],
  [/\bxắp xếp\b/gi, 'sắp xếp', "Chuẩn chính tả: 'sắp xếp'"],
  [/\bsuất sắc\b/gi, 'xuất sắc', "Chuẩn chính tả: 'xuất sắc'"],
  [/\bxuất ăn\b/gi, 'suất ăn', "Chuẩn chính tả: 'suất ăn'"],
  [/\bxuất vé\b/gi, 'suất vé', "Chuẩn chính tả: 'suất vé'"],
  [/\bbổ xung\b/gi, 'bổ sung', "Chuẩn chính tả: 'bổ sung'"],
  [/\bsơ xuất\b/gi, 'sơ suất', "Chuẩn chính tả: 'sơ suất'"],
  [/\bxơ suất\b/gi, 'sơ suất', "Chuẩn chính tả: 'sơ suất'"],
  [/\bchau chuốt\b/gi, 'trau chuốt', "Chuẩn chính tả: 'trau chuốt'"],
  [/\btrau truốt\b/gi, 'trau chuốt', "Chuẩn chính tả: 'trau chuốt'"],
  [/\bchuẩn đoán\b/gi, 'chẩn đoán', "Chuẩn chính tả: 'chẩn đoán'"],
  [/\bchín mùi\b/gi, 'chín muồi', "Chuẩn chính tả: 'chín muồi'"],
  [/\bthăm quan\b/gi, 'tham quan', "Chuẩn chính tả: 'tham quan'"],
  [/\bbạc mạng\b/gi, 'bạt mạng', "Chuẩn chính tả: 'bạt mạng'"],
  [/\bchung thực\b/gi, 'trung thực', "Chuẩn chính tả: 'trung thực'"],
  [/\bcọ sát\b/gi, 'cọ xát', "Chuẩn chính tả: 'cọ xát'"],
  [/\bsáng lạng\b/gi, 'xán lạn', "Chuẩn chính tả: 'xán lạn'"],
  [/\bxáng lạn\b/gi, 'xán lạn', "Chuẩn chính tả: 'xán lạn'"],
  [/\btựu chung\b/gi, 'tựu trung', "Chuẩn chính tả: 'tựu trung'"],
  [/\bvô hình chung\b/gi, 'vô hình trung', "Chuẩn chính tả: 'vô hình trung'"],
  [/\bđường xá\b/gi, 'đường sá', "Chuẩn chính tả: 'đường sá'"],
  [/\bsuôn xẻ\b/gi, 'suôn sẻ', "Chuẩn chính tả: 'suôn sẻ'"],
  [/\bsuông sẻ\b/gi, 'suôn sẻ', "Chuẩn chính tả: 'suôn sẻ'"],
  [/\bxăm soi\b/gi, 'săm soi', "Chuẩn chính tả: 'săm soi'"],
  [/\bsát sao\b/gi, 'sát sao', "Chuẩn chính tả: 'sát sao'"],
  [/\bsử lý\b/gi, 'xử lý', "Chuẩn chính tả: 'xử lý'"],
  [/\bxử dụng\b/gi, 'sử dụng', "Chuẩn chính tả: 'sử dụng'"],
  [/\bsuất sứ\b/gi, 'xuất xứ', "Chuẩn chính tả: 'xuất xứ'"],
  [/\btinh sảo\b/gi, 'tinh xảo', "Chuẩn chính tả: 'tinh xảo'"],
  [/\bxành điệu\b/gi, 'sành điệu', "Chuẩn chính tả: 'sành điệu'"],
  [/\bdấu giếm\b/gi, 'giấu giếm', "Chuẩn chính tả: 'giấu giếm'"],
  [/\bgiành cho\b/gi, 'dành cho', "Chuẩn chính tả: 'dành cho'"],
  [/\bgiành riêng\b/gi, 'dành riêng', "Chuẩn chính tả: 'dành riêng'"],
  [/\bdành giật\b/gi, 'giành giật', "Chuẩn chính tả: 'giành giật'"],
  [/\bdùm\b/gi, 'giùm', "Chuẩn chính tả: 'giùm'"],
  [/\bdỏ hàng\b/gi, 'giỏ hàng', "Chuẩn chính tả: 'giỏ hàng'"],
  [/\bzỏ hàng\b/gi, 'giỏ hàng', "Chuẩn chính tả: 'giỏ hàng'"],
  [/\bdao hàng\b/gi, 'giao hàng', "Chuẩn chính tả: 'giao hàng'"],
  [/\bdá rẻ\b/gi, 'giá rẻ', "Chuẩn chính tả: 'giá rẻ'"],
  [/\bzá rẻ\b/gi, 'giá rẻ', "Chuẩn chính tả: 'giá rẻ'"],
  [/\bdải pháp\b/gi, 'giải pháp', "Chuẩn chính tả: 'giải pháp'"],
  [/\bdao diện\b/gi, 'giao diện', "Chuẩn chính tả: 'giao diện'"],
  [/\bgiả cả\b/gi, 'giá cả', "Chuẩn chính tả: 'giá cả'"],
  [/\btuyệt dời\b/gi, 'tuyệt vời', "Chuẩn chính tả: 'tuyệt vời'"],
  [/\btuyệt zời\b/gi, 'tuyệt vời', "Chuẩn chính tả: 'tuyệt vời'"],
  [/\bvừa dặn\b/gi, 'vừa vặn', "Chuẩn chính tả: 'vừa vặn'"],
  [/\btrân thực\b/gi, 'chân thực', "Chuẩn chính tả: 'chân thực'"],
  [/\bchân trọng\b/gi, 'trân trọng', "Chuẩn chính tả: 'trân trọng'"],
  [/\btri tiết\b/gi, 'chi tiết', "Chuẩn chính tả: 'chi tiết'"],
  [/\bchải nghiệm\b/gi, 'trải nghiệm', "Chuẩn chính tả: 'trải nghiệm'"],
  [/\bchực quan\b/gi, 'trực quan', "Chuẩn chính tả: 'trực quan'"],
  [/\btrắc trắn\b/gi, 'chắc chắn', "Chuẩn chính tả: 'chắc chắn'"],
  [/\bmịn màn\b/gi, 'mịn màng', "Chuẩn chính tả: 'mịn màng'"],
  [/\bthắm nhanh\b/gi, 'thấm nhanh', "Chuẩn chính tả: 'thấm nhanh'"],
  [/\bchóng nước\b/gi, 'chống nước', "Chuẩn chính tả: 'chống nước'"],
  [/\bđặc hàng\b/gi, 'đặt hàng', "Chuẩn chính tả: 'đặt hàng'"],
  [/\bchất lượn\b/gi, 'chất lượng', "Chuẩn chính tả: 'chất lượng'"],
  [/\bchất lựơng\b/gi, 'chất lượng', "Chuẩn chính tả: 'chất lượng'"],
  [/\btrắn sáng\b/gi, 'trắng sáng', "Chuẩn chính tả: 'trắng sáng'"],
  [/\btiếc kiệm\b/gi, 'tiết kiệm', "Chuẩn chính tả: 'tiết kiệm'"],
  [/\bđúng đắng\b/gi, 'đúng đắn', "Chuẩn chính tả: 'đúng đắn'"],
  [/\bđóng gối\b/gi, 'đóng gói', "Chuẩn chính tả: 'đóng gói'"],
  [/\bsán mịn\b/gi, 'sáng mịn', "Chuẩn chính tả: 'sáng mịn'"],
  [/\bbảo hảnh\b/gi, 'bảo hành', "Chuẩn chính tả: 'bảo hành'"],
  [/\bduwocj\b/gi, 'được', "Sửa lỗi gõ Telex: 'được'"],
  [/\bdduocj\b/gi, 'được', "Sửa lỗi gõ Telex: 'được'"],
  [/\bnhieeuf\b/gi, 'nhiều', "Sửa lỗi gõ Telex: 'nhiều'"],
  [/\bnguwowfi\b/gi, 'người', "Sửa lỗi gõ Telex: 'người'"],
  [/\bkhonog\b/gi, 'không', "Sửa lỗi gõ Telex: 'không'"],
  [/\bthoong\b/gi, 'thông', "Sửa lỗi gõ Telex: 'thông'"],
  [/\btoots\b/gi, 'tốt', "Sửa lỗi gõ Telex: 'tốt'"],
  [/\bmays\b/gi, 'máy', "Sửa lỗi gõ Telex: 'máy'"],
  [/\bcuar\b/gi, 'của', "Sửa lỗi gõ Telex: 'của'"],
  [/\bchiecs\b/gi, 'chiếc', "Sửa lỗi gõ Telex: 'chiếc'"]
];

const SERVER_SOUTHERN_DIALECT_RULES: Array<[RegExp, string, string]> = [
  [/\bnhé cả nhà\b/gi, 'nha cả nhà', "Chuẩn hóa Nam Bộ: 'nha cả nhà'"],
  [/\bnhé mọi người\b/gi, 'nha cả nhà', "Chuẩn hóa Nam Bộ: 'nha cả nhà'"],
  [/\bnhé\b/gi, 'nha', "Chuẩn hóa Nam Bộ: 'nha'"],
  [/\bnhá\b/gi, 'nha', "Chuẩn hóa Nam Bộ: 'nha'"],
  [/\bnhỉ\b/gi, 'nha', "Chuẩn hóa Nam Bộ: 'nha'"],
  [/\bthật là\b/gi, 'thiệt là', "Chuẩn hóa Nam Bộ: 'thiệt là'"],
  [/\bthật sự\b/gi, 'thiệt sự', "Chuẩn hóa Nam Bộ: 'thiệt sự'"],
  [/\bthật luôn\b/gi, 'thiệt luôn', "Chuẩn hóa Nam Bộ: 'thiệt luôn'"],
  [/\bxem ngay\b/gi, 'coi ngay', "Chuẩn hóa Nam Bộ: 'coi ngay'"],
  [/\bxem thử\b/gi, 'coi thử', "Chuẩn hóa Nam Bộ: 'coi thử'"],
  [/\bnhìn vào\b/gi, 'nhìn vô', "Chuẩn hóa Nam Bộ: 'nhìn vô'"],
  [/\bcho vào\b/gi, 'cho vô', "Chuẩn hóa Nam Bộ: 'cho vô'"],
  [/\bbát ăn\b/gi, 'chén ăn', "Chuẩn hóa Nam Bộ: 'chén ăn'"],
  [/\bthìa\b/gi, 'muỗng', "Chuẩn hóa Nam Bộ: 'muỗng'"],
  [/\bhoa quả\b/gi, 'trái cây', "Chuẩn hóa Nam Bộ: 'trái cây'"],
  [/\bchúng mình\b/gi, 'tụi mình', "Chuẩn hóa Nam Bộ: 'tụi mình'"],
  [/\bchúng tôi\b/gi, 'tụi mình', "Chuẩn hóa Nam Bộ: 'tụi mình'"],
  [/\bthế này\b/gi, 'như vầy', "Chuẩn hóa Nam Bộ: 'như vầy'"]
];

// Pre-compiled unicode-aware rules cache for optimal zero-overhead performance
const COMPILED_SERVER_SPELL_RULES = SERVER_LOCAL_SPELL_RULES.map(([pat, rep, reason]) => ({
  pattern: toServerUnicodeBoundaryRegex(pat),
  replacement: rep,
  reason
}));

const COMPILED_SERVER_DIALECT_RULES = SERVER_SOUTHERN_DIALECT_RULES.map(([pat, rep, reason]) => ({
  pattern: toServerUnicodeBoundaryRegex(pat),
  replacement: rep,
  reason
}));

function applyServerSpellCorrections(text: string, adaptSouthern: boolean = false): string {
  let t = (text || "").trim();
  const applyRuleList = (rules: typeof COMPILED_SERVER_SPELL_RULES) => {
    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(t)) {
        rule.pattern.lastIndex = 0;
        t = t.replace(rule.pattern, (m, ...args) => {
          let rep = rule.replacement;
          if (typeof rep === 'string' && rep.includes('$1') && args[0] !== undefined) {
            rep = rep.replace('$1', String(args[0]));
          }
          if (typeof rep === 'string' && rep.includes('$2') && args[1] !== undefined) {
            rep = rep.replace('$2', String(args[1]));
          }
          return serverPreserveCase(m, rep);
        });
        rule.pattern.lastIndex = 0;
      }
    }
  };

  applyRuleList(COMPILED_SERVER_SPELL_RULES);
  if (adaptSouthern) {
    applyRuleList(COMPILED_SERVER_DIALECT_RULES);
  }
  return t;
}

// Dedicated Fast AI Subtitle Spelling & Grammar Polisher Endpoint
app.post("/api/fix-subtitles-spelling", aiEndpointLimiter, async (req, res): Promise<any> => {
  try {
    const { subtitles, productName = '', language = 'vi', adaptSouthern = false } = req.body;

    if (!Array.isArray(subtitles) || subtitles.length === 0) {
      return res.json({
        fixedSubtitles: [],
        fixedCount: 0,
        fixedDetails: [],
        summary: "Không có phân cảnh phụ đề nào để xử lý."
      });
    }

    // Pre-clean subtitles with Unicode rules before feeding to Gemini model
    const preCleanedSubtitles = subtitles.map((s: any) => ({
      ...s,
      text: applyServerSpellCorrections(s.text || "", adaptSouthern)
    }));

    const ai = getGoogleAI();
    const promptText = `
Bạn là Trưởng Ban Ngôn ngữ học & Chuyên gia Giám định Phụ đề Video (Chief Vietnamese Linguist & Subtitle QA Master) cho TikTok Shop, Reels và YouTube Shorts.
Nhiệm vụ tối thượng: Rà soát và sửa triệt để 100% tất cả các lỗi chính tả tiếng Việt, lỗi dấu thanh điệu, lỗi gõ phím Telex/VNI, lỗi hoa thường và lỗi ngữ cảnh từ đồng âm khác nghĩa cho danh sách phụ đề video ngắn dưới đây.

THÔNG TIN ĐẦU VÀO:
- Tên sản phẩm chính: "${productName}"
- Ngôn ngữ: ${language === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'}
- Danh sách ${preCleanedSubtitles.length} phân cảnh phụ đề cần tối ưu:
${preCleanedSubtitles.map((s: any, idx: number) => `[Phân cảnh ${idx + 1}] (${s.start}s - ${s.end}s): "${s.text}"`).join('\n')}

HỆ THỐNG TIÊU CHUẨN CHÍNH TẢ & PHỤ ĐỀ BẮT BUỘC:
1. ✍️ CHÍNH TẢ & TỪ ĐỒNG ÂM KHÁC NGHĨA:
   - Sửa chuẩn xác các cặp từ hay viết sai:
     * xịn sò (không viết "xịn xò")
     * dành cho / dành riêng (không viết "giành cho", trừ khi là "tranh giành", "giành giật")
     * sắp xếp (không viết "sắp sếp", "xắp xếp")
     * xuất sắc (không viết "suất sắc"), nhưng suất ăn / suất vé (không viết "xuất ăn")
     * bổ sung (không viết "bổ xung")
     * sơ suất (không viết "sơ xuất", "xơ suất")
     * trau chuốt (không viết "chau chuốt", "trau truốt")
     * chẩn đoán (không viết "chuẩn đoán")
     * chín muồi (không viết "chín mùi")
     * rảnh rỗi (không viết "rãnh rỗi")
     * giùm (làm giùm, coi giùm, bấm giùm - không viết "dùm")
     * tham quan (không viết "thăm quan")
     * bạt mạng (không viết "bạc mạng")
     * trung thực (không viết "chung thực")
     * cọ xát (không viết "cọ sát")
     * xán lạn (không viết "sáng lạng")
     * tựu trung (không viết "tựu chung")
     * vô hình trung (không viết "vô hình chung")
     * đường sá (không viết "đường xá")
     * suôn sẻ (không viết "suôn xẻ", "suông sẻ")
     * dư dả (không viết "dư giả")
     * săm soi (không viết "xăm soi")
     * chính hãng (không viết "chính hảng")
     * ưu đãi (không viết "ưu đải")
     * trải nghiệm (không viết "trãi nghiệm")
     * giỏ hàng (không viết "dỏ hàng", "zỏ hàng")
     * sữa rửa mặt (không viết "sữa rữa mặt", "sửa rửa mặt")
     * sản phẩm (không viết "sản phẫm", "sản phảm")
     * dưỡng ẩm (không viết "dưởng ẩm")
     * mịn màng (không viết "mịn màn")
     * thấm nhanh (không viết "thắm nhanh")
     * chống nước (không viết "chóng nước")
     * đặt hàng (không viết "đặc hàng")
     * lỗi lầm (không viết "lổi lầm")
     * cảm nhận (không viết "cãm nhận")
     * chất lượng (không viết "chất lượn", "chất lựơng")
     * trắng sáng (không viết "trắn sáng")
     * tiết kiệm (không viết "tiếc kiệm")
     * đúng đắn (không viết "đúng đắng")
     * đóng gói (không viết "đóng gối")
     * giao hàng (không viết "dao hàng")
     * giá rẻ (không viết "dá rẻ", "zá rẻ")
     * tuyệt vời (không viết "tuyệt dời", "tuyệt zời")
     * dễ thương (không viết "dể thương")
     * vừa vặn (không viết "vừa dặn")
     * sáng mịn (không viết "sán mịn")
     * xử lý (không viết "sử lý")
     * sử dụng (không viết "xử dụng")
     * giá cả (không viết "giả cả")
     * bảo hành (không viết "bảo hảnh")
     * mẫu mã (không viết "mẩu mã")
     * chia sẻ (không viết "chia sẽ")
     * hữu ích (không viết "hửu ích")
     * tiện ích (không viết "tiện ít")
     * xuất xứ (không viết "suất sứ", "xuất sứ")
     * tinh xảo (không viết "tinh sảo")
     * sành điệu (không viết "xành điệu")
     * tỉ mỉ (không viết "tỉ mĩ")
     * rạng ngời (không viết "rạng ngờ", "rạn ngời")
     * giải pháp (không viết "dải pháp")
     * giao diện (không viết "dao diện")
     * hướng dẫn (không viết "hướng dẩn")
     * vướng mắc (không viết "vướn mắc")
     * rực rỡ / rạng rỡ (không viết dấu hỏi)
     * nhỏ gọn (không viết "nhỏ gòn")
     * thanh toán (không viết "than toán")
     * cắm sạc (không viết "cấm sạc")
     * pin trâu (không viết "pin châu")
     * nắp đậy (không viết "nắp đập")
     * đầm tay (không viết "đầm tai")
     * bàng hoàng (không viết "bàn hoàn")
     * ngoạn mục (không viết "ngoại mục")
     * bền bỉ (không viết "bền bĩ")
   - Sửa triệt để lỗi gõ dính phím Telex: dd -> đ, duwocj -> được, nhieeuf -> nhiều, toots -> tốt, mays -> máy, cuar -> của, chiecs -> chiếc...
   - Chuẩn hóa vị trí dấu thanh theo chuẩn quốc gia: hòa, hóa, hoàn, tỏa, toán, khỏe, thủy, thúy, hủy, quỳ, quý.

2. 🗣️ ${adaptSouthern ? "ĐỒNG BỘ NGỮ ĐIỆU NAM BỘ REVIEW QUẢNG CÁO:\n   - Dùng ngữ điệu gần gũi, cuốn hút: \"nha cả nhà\", \"nha mấy bạn\", \"thiệt sự\", \"thiệt là\", \"coi ngay\", \"coi thử\", \"nhìn vô\", \"muỗng\", \"chén\", \"trái cây\", \"tụi mình\"." : "GIỮ NGUYÊN PHƯƠNG NGỮ VÀ PHONG CÁCH GỐC:\n   - Chỉ sửa lỗi chính tả, dấu thanh điệu và ngữ pháp; TUYỆT ĐỐI KHÔNG tự ý đổi từ ngữ phương ngữ (Bắc/Trung/Nam) của người dùng (ví dụ giữ nguyên 'nhé', 'bát', 'thìa', 'chúng mình' nếu không sai chính tả)."}

3. 🎬 ĐỊNH DẠNG PHỤ ĐỀ CHUẨN TIKTOK/REELS:
   - Luôn viết hoa chữ cái đầu tiên của phân cảnh.
   - Viết hoa đúng tên sản phẩm "${productName}".
   - Bỏ toàn bộ nhãn thừa ("KOL:", "MC:", "Lời thoại:", "Subtitle:"), bỏ ký tự Markdown (*, #, _, ~, [], ()).
   - KHÔNG để dấu chấm '.' hoặc dấu phẩy ',' lơ lửng ở cuối phân cảnh phụ đề ngắn (để phụ đề chạy mượt, liền mạch). Giữ lại dấu hỏi '?', dấu chấm than '!', dấu ba chấm '…' nếu cần tạo cảm xúc.

4. ⏱️ BẢO TOÀN THỜI GIAN:
   - Giữ nguyên 100% mốc thời gian start và end của từng phân cảnh.

Trả về phản hồi JSON theo schema:
- fixedSubtitles: Danh sách phân cảnh phụ đề hoàn hảo
- fixedCount: Số lượng phân cảnh đã được chỉnh sửa
- fixedDetails: Mảng mô tả chi tiết từng lỗi đã sửa (Ví dụ: "Phân cảnh 1: 'xịn xò' ➔ 'xịn sò' (Chuẩn chính tả)")
- summary: Tóm tắt 1 câu thành quả chuẩn hóa chính tả
`;

    let result;
    try {
      if (!ai) {
        throw new Error("GEMINI_CLIENT_NOT_AVAILABLE");
      }
      const response: any = await Promise.race([
        generateWithRetry(
          (model) =>
            ai.models.generateContent({
              model: model,
              contents: [{ parts: [{ text: promptText }] }],
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    fixedSubtitles: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          start: { type: Type.NUMBER },
                          end: { type: Type.NUMBER },
                          text: { type: Type.STRING },
                          translation: { type: Type.STRING }
                        },
                        required: ["start", "end", "text"]
                      }
                    },
                    fixedCount: { type: Type.NUMBER },
                    fixedDetails: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    summary: { type: Type.STRING }
                  },
                  required: ["fixedSubtitles", "fixedCount", "fixedDetails", "summary"]
                }
              }
            }),
          1,
          500,
          PRIMARY_TEXT_VISION_MODEL,
          true
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error("AI_SUBTITLE_SPELL_TIMEOUT")), 12000))
      ]);

      result = JSON.parse(response.text || '{}');
      if (result && Array.isArray(result.fixedSubtitles)) {
        result.usedLocalEngine = false;
        result.fixedSubtitles = result.fixedSubtitles.map((sub: any) => {
          let txt = applyServerSpellCorrections(sub.text || "", adaptSouthern);
          txt = txt.replace(/[.,]+$/g, '').trim();
          if (txt.length > 0) {
            txt = txt.charAt(0).toUpperCase() + txt.slice(1);
          }
          return {
            ...sub,
            text: txt
          };
        });
      }
    } catch (e: any) {
      console.warn("[SUBTITLE-SPELL-LOCAL] AI unavailable, running local algorithmic spell corrector:", e.message);

      const fixedDetails: string[] = [];
      let count = 0;

      const fallbackSubs = subtitles.map((sub: any, idx: number) => {
        let txt = (sub.text || "")
          .replace(/[*#_`~\[\]\(\)]/g, '')
          .replace(/^(Subtitle|Lời thoại|KOL|MC|Voiceover|Host|Phân cảnh \d+|Scene \d+):\s*/gi, '')
          .trim();
        const originalTxt = txt;

        txt = applyServerSpellCorrections(txt, adaptSouthern);

        txt = txt.replace(/\s+([,.\?!;:\u2026])/g, '$1')
                 .replace(/([,;:])([^\s\d])/g, '$1 $2')
                 .replace(/\.{3,}/g, '…')
                 .replace(/[.,]+$/g, '')
                 .trim();

        if (txt.length > 0) {
          txt = txt.charAt(0).toUpperCase() + txt.slice(1);
        }

        if (txt !== originalTxt) {
          count++;
          fixedDetails.push(`Phân cảnh ${idx + 1}: "${originalTxt}" ➔ "${txt}"`);
        }

        return {
          start: sub.start,
          end: sub.end,
          text: txt,
          translation: sub.translation
        };
      });

      result = {
        usedLocalEngine: true,
        fixedSubtitles: fallbackSubs,
        fixedCount: count,
        fixedDetails: fixedDetails.length > 0 ? fixedDetails : ["Bộ quy tắc cục bộ không phát hiện thêm lỗi chính tả phổ biến nào."],
        summary: count > 0 
          ? `AI chính tả tạm bận — bộ quy tắc cục bộ đã sửa ${count} phân cảnh phụ đề.`
          : "AI chính tả tạm bận — bộ quy tắc cục bộ chưa phát hiện lỗi chính tả trong danh sách từ điển."
      };
    }

    res.json(result);
  } catch (error: any) {
    console.error("Lỗi chuẩn hóa chính tả phụ đề:", error);
    res.status(500).json({ error: error.message || "Lỗi máy chủ khi chuẩn hóa chính tả phụ đề." });
  }
});

// Multipart/form-data Disk Storage for TikTok Video Transcoding (zero RAM/Base64 bloat)
const transcodeUploadDir = path.join(TRANSCODE_TMP_ROOT, "uploads");
const transcodeChunkRoot = path.join(TRANSCODE_TMP_ROOT, "chunk_uploads");
fs.mkdirSync(transcodeUploadDir, { recursive: true });
fs.mkdirSync(transcodeChunkRoot, { recursive: true });

interface ChunkUploadSession {
  uploadId: string;
  sessionDir: string;
  ext: string;
  qualityTier: ReturnType<typeof normalizeQualityTier>;
  baseFileName: string;
  totalSize: number;
  totalChunks: number;
  receivedIndices: Set<number>;
  createdAt: number;
}
const chunkUploadSessions = new Map<string, ChunkUploadSession>();

const chunkCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, sess] of chunkUploadSessions.entries()) {
    if (now - sess.createdAt > 30 * 60 * 1000) {
      try { fs.rmSync(sess.sessionDir, { recursive: true, force: true }); } catch {}
      chunkUploadSessions.delete(id);
    }
  }
}, 60 * 1000);
chunkCleanupTimer.unref?.();

const transcodeUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, transcodeUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").replace(/[^.a-zA-Z0-9]/g, "") || ".webm";
      cb(null, `upload_${Date.now()}_${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max upload guard
    files: 1,
  },
});

function validateMagicFileHeaderOnDisk(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (bytesRead < 8) return false;
    const isWebm = buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3;
    const isMp4 = buf.slice(4, 8).toString("ascii") === "ftyp";
    const isMatroskaOrMov = isWebm || isMp4 || buf.slice(4, 8).toString("ascii") === "moov" || buf.slice(4, 8).toString("ascii") === "wide";
    return isMatroskaOrMov;
  } catch {
    return false;
  }
}

// Endpoint: Initialize chunked binary streaming upload (bypasses Cloud Run 32MB single-request ceiling cleanly)
app.post("/api/transcode/upload/init", (req, res) => {
  const caps = checkFfmpegCapabilities();
  if (!caps.ffmpegAvailable || !caps.ffprobeAvailable || !caps.encoders.h264 || !caps.encoders.aac) {
    return res.status(503).json({
      error: "Máy chủ chưa sẵn sàng bộ chuyển mã FFmpeg (libx264 / aac / ffprobe).",
      code: "TRANSCODER_UNAVAILABLE",
    });
  }

  const { sourceExt, qualityTier, baseFileName, totalSize, totalChunks } = req.body || {};
  const sizeNum = Number(totalSize);
  const chunksNum = Number(totalChunks);

  if (!isFinite(sizeNum) || sizeNum < 1024) {
    return res.status(400).json({ error: "Dung lượng tệp video nguồn quá nhỏ hoặc không hợp lệ.", code: "INVALID_SIZE" });
  }
  if (sizeNum > 500 * 1024 * 1024) {
    return res.status(413).json({ error: "Dung lượng video vượt quá giới hạn tối đa 500MB.", code: "FILE_TOO_LARGE" });
  }
  if (!Number.isInteger(chunksNum) || chunksNum < 1 || chunksNum > 2000) {
    return res.status(400).json({ error: "Số lượng phân đoạn tải lên (totalChunks) không hợp lệ.", code: "INVALID_CHUNKS" });
  }

  const cleanExt = `.${String(sourceExt || "webm").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "webm"}`;
  const uploadId = crypto.randomUUID();
  const sessionDir = path.join(transcodeChunkRoot, uploadId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const session: ChunkUploadSession = {
    uploadId,
    sessionDir,
    ext: cleanExt,
    qualityTier: normalizeQualityTier(qualityTier),
    baseFileName: typeof baseFileName === "string" ? baseFileName : "tiktok_review",
    totalSize: sizeNum,
    totalChunks: chunksNum,
    receivedIndices: new Set<number>(),
    createdAt: Date.now(),
  };
  chunkUploadSessions.set(uploadId, session);

  return res.status(201).json({
    uploadId,
    maxChunkBytes: 8 * 1024 * 1024,
  });
});

// Endpoint: Receive a binary video chunk (<= 12MB per HTTP request -> safely below Cloud Run 32MB limit)
app.post(
  "/api/transcode/upload/chunk/:uploadId/:chunkIndex",
  express.raw({ type: "application/octet-stream", limit: "12mb" }),
  (req, res) => {
    const { uploadId, chunkIndex } = req.params;
    const session = chunkUploadSessions.get(uploadId);
    if (!session) {
      return res.status(404).json({ error: "Phiên tải lên không tồn tại hoặc đã hết hạn.", code: "SESSION_NOT_FOUND" });
    }

    const idx = parseInt(chunkIndex, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= session.totalChunks) {
      return res.status(400).json({ error: "Chỉ số phân đoạn (chunkIndex) không hợp lệ.", code: "INVALID_CHUNK_INDEX" });
    }

    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ error: "Dữ liệu phân đoạn rỗng hoặc sai định dạng nhị phân.", code: "EMPTY_CHUNK" });
    }

    const partPath = path.join(session.sessionDir, `part_${String(idx).padStart(6, "0")}`);
    fs.writeFileSync(partPath, buf);
    session.receivedIndices.add(idx);

    return res.status(200).json({
      uploadId,
      chunkIndex: idx,
      receivedCount: session.receivedIndices.size,
      totalChunks: session.totalChunks,
    });
  }
);

// Endpoint: Assemble uploaded chunks on disk without buffering whole video in RAM and enqueue TikTok FFmpeg transcode
app.post("/api/transcode/upload/complete/:uploadId", (req, res) => {
  const { uploadId } = req.params;
  const session = chunkUploadSessions.get(uploadId);
  if (!session) {
    return res.status(404).json({ error: "Phiên tải lên không tồn tại hoặc đã hết hạn.", code: "SESSION_NOT_FOUND" });
  }

  for (let i = 0; i < session.totalChunks; i++) {
    const partPath = path.join(session.sessionDir, `part_${String(i).padStart(6, "0")}`);
    if (!fs.existsSync(partPath)) {
      return res.status(400).json({
        error: `Thiếu phân đoạn dữ liệu số ${i + 1}/${session.totalChunks}. Vui lòng thử xuất lại.`,
        code: "MISSING_CHUNK",
      });
    }
  }

  const finalInputPath = path.join(transcodeUploadDir, `upload_${Date.now()}_${uploadId}${session.ext}`);
  try {
    const outFd = fs.openSync(finalInputPath, "w");
    try {
      for (let i = 0; i < session.totalChunks; i++) {
        const partPath = path.join(session.sessionDir, `part_${String(i).padStart(6, "0")}`);
        const chunkBuf = fs.readFileSync(partPath);
        fs.writeSync(outFd, chunkBuf, 0, chunkBuf.length);
      }
    } finally {
      fs.closeSync(outFd);
    }

    const finalStat = fs.statSync(finalInputPath);
    if (finalStat.size < 1024 || !validateMagicFileHeaderOnDisk(finalInputPath)) {
      try { fs.unlinkSync(finalInputPath); } catch {}
      return res.status(400).json({
        error: "Tệp video sau khi ghép phân đoạn không đúng định dạng WebM/MP4 hợp lệ.",
        code: "INVALID_VIDEO_CONTAINER",
      });
    }

    const job = transcodeJobManager.createJob({
      inputPath: finalInputPath,
      qualityTier: session.qualityTier,
      baseFileName: session.baseFileName,
    });
    return res.status(202).json(job);
  } catch (err: any) {
    try { fs.unlinkSync(finalInputPath); } catch {}
    return res.status(500).json({
      error: `Không thể ghép phân đoạn video: ${err?.message || "Lỗi đĩa tạm"}`,
      code: "CHUNK_ASSEMBLE_ERROR",
    });
  } finally {
    try { fs.rmSync(session.sessionDir, { recursive: true, force: true }); } catch {}
    chunkUploadSessions.delete(uploadId);
  }
});

// Endpoint: Cancel/clean up chunked upload session
app.delete("/api/transcode/upload/:uploadId", (req, res) => {
  const session = chunkUploadSessions.get(req.params.uploadId);
  if (session) {
    try { fs.rmSync(session.sessionDir, { recursive: true, force: true }); } catch {}
    chunkUploadSessions.delete(req.params.uploadId);
    return res.json({ deleted: true });
  }
  return res.json({ deleted: false });
});

// Endpoint: Upload recorded WebM/MP4 via single multipart streaming (<= 16MB fast path) and start TikTok H.264/AAC MP4 transcode job
app.post("/api/transcode/tiktok", (req, res) => {
  transcodeUpload.single("video")(req, res, (uploadErr: any) => {
    if (uploadErr) {
      if (uploadErr.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: "Dung lượng video vượt quá giới hạn tối đa 500MB.",
          code: "FILE_TOO_LARGE",
        });
      }
      return res.status(400).json({
        error: `Lỗi tải tệp lên bộ chuyển mã: ${uploadErr.message || "Upload thất bại"}`,
        code: "UPLOAD_ERROR",
      });
    }

    const uploadedFile = req.file;
    if (!uploadedFile || !uploadedFile.path) {
      return res.status(400).json({
        error: "Không tìm thấy tệp video tải lên trong trường 'video'.",
        code: "MISSING_VIDEO_FILE",
      });
    }

    if (uploadedFile.size < 1024 || !validateMagicFileHeaderOnDisk(uploadedFile.path)) {
      try { fs.unlinkSync(uploadedFile.path); } catch {}
      return res.status(400).json({
        error: "Tệp video tải lên không đúng định dạng WebM/MP4 hợp lệ hoặc bị rỗng.",
        code: "INVALID_VIDEO_CONTAINER",
      });
    }

    const caps = checkFfmpegCapabilities();
    if (!caps.ffmpegAvailable || !caps.ffprobeAvailable || !caps.encoders.h264 || !caps.encoders.aac) {
      try { fs.unlinkSync(uploadedFile.path); } catch {}
      return res.status(503).json({
        error: "Máy chủ chưa sẵn sàng bộ chuyển mã FFmpeg (libx264 / aac / ffprobe).",
        code: "TRANSCODER_UNAVAILABLE",
      });
    }

    const qualityTier = normalizeQualityTier(req.body?.qualityTier);
    const baseFileName = typeof req.body?.baseFileName === "string" ? req.body.baseFileName : "tiktok_review";

    const job = transcodeJobManager.createJob({
      inputPath: uploadedFile.path,
      qualityTier,
      baseFileName,
    });

    return res.status(202).json(job);
  });
});

// Endpoint: Poll TikTok transcoding + FFprobe validation progress
app.get("/api/transcode/status/:jobId", (req, res) => {
  const job = transcodeJobManager.getJobStatus(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Không tìm thấy tiến trình chuyển mã hoặc tệp đã hết hạn.", code: "JOB_NOT_FOUND" });
  }
  return res.json(job);
});

// Endpoint: Download verified MP4 output ONLY after completion + FFprobe + full decode check pass (Range-enabled for Android)
app.get("/api/transcode/download/:jobId", (req, res) => {
  const job = transcodeJobManager.getJobStatus(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Không tìm thấy tệp MP4 hoặc liên kết đã hết hạn.", code: "JOB_NOT_FOUND" });
  }
  if (job.status !== "completed" || !job.validation?.valid) {
    return res.status(409).json({
      error: "Video vẫn đang xử lý hoặc chưa vượt qua kiểm định TikTok MP4.",
      code: "TRANSCODE_NOT_READY",
      status: job.status,
    });
  }

  const fileInfo = transcodeJobManager.getDownloadableFile(req.params.jobId);
  if (!fileInfo) {
    return res.status(404).json({ error: "Tệp MP4 không còn tồn tại trên đĩa tạm.", code: "FILE_EXPIRED" });
  }

  const total = fileInfo.sizeBytes;
  const safeFileName = fileInfo.fileName.replace(/["\\/\r\n]/g, "_");
  const range = req.headers.range;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.setHeader("Content-Range", `bytes */${total}`);
      return res.status(416).end();
    }
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
    if (isNaN(start) || isNaN(end) || start > end || start >= total) {
      res.setHeader("Content-Range", `bytes */${total}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
    res.setHeader("Content-Length", String(end - start + 1));
    fs.createReadStream(fileInfo.outputPath, { start, end }).pipe(res);
  } else {
    res.status(200);
    res.setHeader("Content-Length", String(total));
    fs.createReadStream(fileInfo.outputPath).pipe(res);
  }
});

// Endpoint: Cancel/Clean up transcoding temp job
app.delete("/api/transcode/job/:jobId", (req, res) => {
  const deleted = transcodeJobManager.deleteJob(req.params.jobId);
  return res.json({ deleted });
});

// System Status & Health Check for Production-Grade Verification
app.get("/api/system-status", generalEndpointLimiter, async (req, res) => {
  const probe = await probeGeminiHealth(req.query.force === 'true');
  const mediaCapabilities = checkFfmpegCapabilities();

  res.json({
    status: "ok",
    version: "2026.4.0-production-grade",
    engine: "AI-Video-Review Production Engine",
    geminiStatus: probe.geminiStatus, // CONNECTED | DEGRADED | UNAVAILABLE | QUOTA_EXCEEDED | MISCONFIGURED
    services: probe.services,
    mediaCapabilities,
    defaultModel: PRIMARY_TEXT_VISION_MODEL,
    ttsModel: PRIMARY_TTS_MODEL,
    latencyMs: probe.latencyMs,
    testedAt: probe.testedAt,
    message: probe.message
  });
});

// Set up server assets and bundle routing based on Node state
async function setupServerRouting() {
  if (process.env.NODE_ENV !== "production") {
    // Development Environment: Hook up Vite Dev Server Middleware
    // Disable HMR websocket server to avoid port 24678 collisions in AI Studio preview
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Assets serving and fallback SPA mapping
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

// Start listening immediately so port 3000 is open in <10ms for container supervisor
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[AI-STUDIO] Server is up and running on http://localhost:${PORT}`);
});

server.on("error", (err: any) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[AI-STUDIO] Port ${PORT} already in use.`);
  } else {
    console.error("[AI-STUDIO] Server error:", err);
  }
});

const gracefulShutdown = () => {
  console.log("[AI-STUDIO] Shutting down gracefully...");
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

setupServerRouting().catch((err) => {
  console.error("[AI-STUDIO] Failed to initialize Vite middleware:", err);
});
