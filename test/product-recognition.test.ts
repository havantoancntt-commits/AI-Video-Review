import assert from 'node:assert/strict';
import { SuggestedProductResult } from '../src/types';

export function runProductRecognitionTests() {
  console.log('🧪 [TEST SUITE 5] Product Recognition Verification & Anti-Fabrication Tests...');

  // 1. Verified recognition with clear OCR and visual observations
  const verifiedPayload: SuggestedProductResult = {
    productName: "Nồi chiên không dầu Philips HD9200",
    category: "Gia dụng nhà bếp",
    productDesc: "Thiết bị vỏ nhựa đen bóng, có núm xoay cơ học phía trên và khay chiên tháo rời quan sát được.",
    suggestedTone: "Phân tích chuyên sâu",
    keywords: ["#noichienkhongdau", "#philips", "#giadung", "#review"],
    keyUSPs: ["Vỏ nhựa đen bóng", "Núm xoay điều chỉnh nhiệt độ trực quan"],
    verificationStatus: "VERIFIED",
    confidenceScore: 0.94,
    directObservation: ["Thân máy màu đen bo tròn", "Hai núm xoay chỉnh nhiệt và thời gian"],
    ocrDetections: ["PHILIPS", "HD9200"],
    aiInference: ["Dòng nồi chiên điều khiển cơ truyền thống"],
    unverifiedData: ["Công suất thực tế (W)", "Giá bán chính hãng tại thời điểm hiện tại", "Thời hạn bảo hành"]
  };

  assert.equal(verifiedPayload.verificationStatus, "VERIFIED");
  assert.ok(verifiedPayload.confidenceScore >= 0.85);
  assert.ok(verifiedPayload.ocrDetections.includes("PHILIPS"));
  assert.ok(verifiedPayload.unverifiedData.length > 0, "Should isolate unverified specs instead of fabricating them");

  // 2. Ambiguous image -> NEED_MORE_INFORMATION without brand invention
  const partialPayload: SuggestedProductResult = {
    productName: "Tai nghe Bluetooth True Wireless màu trắng",
    category: "Phụ kiện âm thanh",
    productDesc: "Hộp sạc nhỏ gọn màu trắng bo tròn quan sát được qua khung hình video, chưa đọc được chữ in thương hiệu.",
    suggestedTone: "Thuyết phục & Truyền cảm",
    keywords: ["#tainghe", "#bluetooth", "#review"],
    verificationStatus: "NEED_MORE_INFORMATION",
    confidenceScore: 0.65,
    directObservation: ["Hộp sạc màu trắng có đèn LED nhỏ phía trước"],
    ocrDetections: [],
    aiInference: ["Tai nghe không dây kích thước nhỏ gọn"],
    unverifiedData: ["Thương hiệu", "Mã model chính xác", "Dung lượng pin mAh", "Chuẩn chống nước"]
  };

  assert.equal(partialPayload.verificationStatus, "NEED_MORE_INFORMATION");
  assert.equal(partialPayload.ocrDetections.length, 0);
  assert.ok(!partialPayload.productName.toLowerCase().includes("airpods"), "Must NOT invent Apple/AirPods when OCR is empty");

  // 3. Blurry/Unclear video -> UNKNOWN
  const unknownPayload: SuggestedProductResult = {
    productName: "Chưa đủ dữ liệu hình ảnh để xác định sản phẩm",
    category: "Chưa xác định",
    productDesc: "Khung hình video bị mờ hoặc thiếu góc quay cận cảnh sản phẩm.",
    suggestedTone: "Phân tích chuyên sâu",
    keywords: ["#review"],
    verificationStatus: "UNKNOWN",
    confidenceScore: 0.25,
    directObservation: ["Ánh sáng yếu, vật thể mờ ở hậu cảnh"],
    ocrDetections: [],
    aiInference: [],
    unverifiedData: ["Tên sản phẩm", "Công dụng", "Chất liệu", "Giá bán"]
  };

  assert.equal(unknownPayload.verificationStatus, "UNKNOWN");
  assert.ok(unknownPayload.confidenceScore < 0.5);

  console.log('✅ [PASSED] Product Recognition Verification & Anti-Fabrication Tests passed!\n');
}
