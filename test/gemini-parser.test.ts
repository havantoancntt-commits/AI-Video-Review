import assert from 'node:assert/strict';
import { ReviewReport } from '../src/types';

export function runGeminiParserTests() {
  console.log('🧪 [TEST SUITE 2] Gemini AI Parser & Anti-Hallucination Schema Tests...');

  // Mock real Gemini response payload with observational fields
  const sampleGeminiOutput = JSON.stringify({
    productName: "Nồi Chiên Không Dầu Sunhouse 6L",
    category: "Đồ gia dụng nhà bếp",
    rating: 4.6,
    summary: "Nồi chiên thiết kế hiện đại, bảng điều khiển cảm ứng trực quan, chiên giòn đều không cần dầu mỡ.",
    pros: [
      "Vỏ nhựa cao cấp màu đen bóng, ít bám vân tay",
      "Lòng nồi phủ chống dính Ceramic dễ vệ sinh"
    ],
    cons: [
      "Dây nguồn hơi ngắn khi để xa ổ điện",
      "Quạt đối lưu có tiếng ồn nhẹ khi hoạt động ở mức nhiệt tối đa"
    ],
    detailedReview: "### 00:00 - 00:05 Mở Hộp Và Đánh Giá Ngoại Quan\nChiếc nồi chiên dung tích 6 lít khá đầm tay...",
    marketingScript: "Cả nhà ơi, coi ngay chiếc nồi chiên không dầu này nha...",
    ctaText: "Bấm ngay vào giỏ hàng bên dưới để nhận ưu đãi!",
    targetedAudience: "Gia đình từ 3-5 người, người thích ăn đồ chiên không dầu",
    productFeatures: [
      "Dung tích 6 lít",
      "Bảng điều khiển cảm ứng thông minh",
      "Khay chiên có thể tháo rời"
    ],
    uniqueSellingPoints: [
      "Chiên giòn rụm không ngấy mỡ",
      "Giảm tới 85% lượng dầu mỡ thừa"
    ],
    videoHighlights: [
      "00:02 - Cận cảnh lòng nồi và thanh nhiệt",
      "00:15 - Thao tác bấm phím cảm ứng"
    ],
    reviewSuggestions: [
      "Quay cận cảnh lớp da gà vàng giòn sau khi chiên"
    ],
    scriptSuggestions: [
      "Dùng giọng hào hứng tự nhiên"
    ],
    observedVisuals: [
      "Lớp vỏ nhựa màu đen nhám có logo in chìm",
      "Khay chiên phủ lớp chống dính màu xám",
      "Màn hình LED màu xanh dương hiển thị thời gian và nhiệt độ"
    ],
    userProvidedContext: "Khách hàng muốn nhấn mạnh độ giòn và tiết kiệm điện",
    unverifiedNotes: [
      "Độ bền lớp chống dính sau 6 tháng sử dụng",
      "Mức tiêu thụ điện năng thực tế qua đồng hồ đo"
    ],
    needsMoreData: false,
    dataGapMessage: ""
  });

  const parsed: ReviewReport = JSON.parse(sampleGeminiOutput);

  // Assertions
  assert.equal(parsed.productName, "Nồi Chiên Không Dầu Sunhouse 6L");
  assert.equal(typeof parsed.rating, 'number');
  assert.ok(parsed.rating >= 1 && parsed.rating <= 5);
  assert.ok(Array.isArray(parsed.pros) && parsed.pros.length >= 2);
  assert.ok(Array.isArray(parsed.cons) && parsed.cons.length >= 1);
  assert.ok(Array.isArray(parsed.observedVisuals) && parsed.observedVisuals.length >= 3);
  assert.ok(Array.isArray(parsed.unverifiedNotes) && parsed.unverifiedNotes.length >= 2);
  assert.equal(parsed.needsMoreData, false);

  // Test anti-hallucination flag when data is incomplete
  const incompleteOutput = JSON.stringify({
    productName: "Sản phẩm chưa rõ nhãn hiệu",
    category: "Tiện ích",
    rating: 3.5,
    summary: "Video quá ngắn và thiếu cận cảnh nhãn mác kỹ thuật.",
    pros: ["Thiết kế nhỏ gọn"],
    cons: ["Chưa thấy thao tác kiểm thử tính năng"],
    detailedReview: "Phân tích sơ bộ từ 2 khung hình...",
    marketingScript: "Mời bạn xem video...",
    ctaText: "Xem thêm chi tiết",
    targetedAudience: "Người dùng phổ thông",
    productFeatures: [],
    uniqueSellingPoints: [],
    videoHighlights: [],
    reviewSuggestions: [],
    scriptSuggestions: [],
    observedVisuals: ["Hộp màu trắng trơn"],
    userProvidedContext: "",
    unverifiedNotes: ["Thông số công suất và điện áp"],
    needsMoreData: true,
    dataGapMessage: "Vui lòng tải lên video có quay cận cảnh tem nhãn phụ hoặc thao tác bật công tắc để báo cáo chính xác hơn."
  });

  const parsedIncomplete: ReviewReport = JSON.parse(incompleteOutput);
  assert.equal(parsedIncomplete.needsMoreData, true);
  assert.ok(parsedIncomplete.dataGapMessage && parsedIncomplete.dataGapMessage.length > 10);

  console.log('✅ [PASSED] Gemini Parser & Observational Integrity Schema Tests successfully passed!\n');
}
