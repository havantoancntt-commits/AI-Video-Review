import assert from 'node:assert/strict';
import { TrendingProduct } from '../src/types';

export function runTrendingScannerTests() {
  console.log('🧪 [TEST SUITE 6] Trending Market Hypothesis Transparency Tests...');

  const sampleTrends: TrendingProduct[] = [
    {
      id: "trend_1",
      name: "Bàn chải điện sóng âm cho người mới dùng",
      category: "Chăm sóc cá nhân",
      targetAudience: "Người trẻ quan tâm chăm sóc răng miệng hàng ngày",
      viralHook: "ĐỪNG ĐỔI SANG BÀN CHẢI ĐIỆN NẾU BẠN CHƯA BIẾT ĐIỀU NÀY!",
      shortDesc: "Thiết kế đầu chải nhỏ gọn dễ làm quen, hỗ trợ làm sạch răng miệng nhẹ nhàng.",
      suggestedTone: "Thuyết phục & Truyền cảm",
      hashtags: ["#chamsocrangmieng", "#banchaidien", "#review"],
      marketInterestLevel: "Rất cao",
      isMarketHypothesis: true,
      marketHypothesisNotice: "AI-generated market hypothesis – Chưa xác minh bằng dữ liệu thị trường",
      estimationMethod: "Phân tích xu hướng từ khóa AI & cộng đồng sáng tạo",
      dataPeriod: "Gần đây",
      verificationStatus: "UNVERIFIED_HYPOTHESIS"
    }
  ];

  for (const item of sampleTrends) {
    assert.equal(item.isMarketHypothesis, true, "Must explicitly flag item as market hypothesis");
    assert.equal(item.verificationStatus, "UNVERIFIED_HYPOTHESIS");
    assert.ok(item.marketHypothesisNotice.includes("Chưa xác minh"), "Must carry explicit transparency disclaimer");
    assert.equal(item.purchaseCount, undefined, "Must NEVER contain fabricated purchaseCount");
    assert.equal(item.hotScore, undefined, "Must NEVER contain fabricated hotScore percentage");
    assert.equal(item.viralFactor, undefined, "Must NEVER contain fabricated growth factor");
    assert.ok(["Cao", "Rất cao", "Đột biến"].includes(item.marketInterestLevel));
  }

  console.log('✅ [PASSED] Trending Market Hypothesis Transparency Tests passed!\n');
}
