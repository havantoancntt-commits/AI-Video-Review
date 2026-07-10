import { ReviewReport } from './types';

export const SAMPLE_REVIEWS: ReviewReport[] = [
  {
    id: 'sample_iphone',
    productName: 'iPhone 15 Pro Max (Titanium Tự Nhiên)',
    category: 'Công nghệ / Điện thoại',
    rating: 4.8,
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-abstract-laser-lights-background-31718-large.mp4',
    summary: 'Đỉnh cao công nghệ di động thế hệ mới với vỏ Titanium Aerospace siêu nhẹ, siêu bền, chip A17 Pro tiên phong và camera zoom quang học 5x sắc nét tột đỉnh.',
    pros: [
      'Khung sườn Titanium cấp độ vũ trụ giúp giảm bụi bẩn, giảm trầy xước và giảm trọng lượng đáng kể.',
      'Sở hữu chip Apple A17 Pro (3nm) đầu tiên trên thế giới, hỗ trợ đồ hoạ Ray Training mượt mà.',
      'Hệ thống camera zoom quang học 5x với tiêu cự 120mm đột phá bắt trọn chi tiết từ xa.',
      'Nút Tác vụ (Action Button) tùy biến thông minh thay thế nút gạt rung truyền thống.'
    ],
    cons: [
      'Mức giá khởi điểm khá cao và khó tiếp cận đại đa số người dùng phổ thông.',
      'Công suất sạc nhanh dừng ở 25W, sạc đầy pin tốn nhiều thời gian hơn một số đối thủ Android.',
      'Máy sẽ hơi ấm lên khi tải các tựa game nặng 3D liên tục trong thời gian dài.'
    ],
    detailedReview: `### Đánh Giá Chi Tiết iPhone 15 Pro Max: Bản Nâng Cấp Chất Liệu Đáng Giá Nhất

**iPhone 15 Pro Max** ra mắt đã đánh dấu một bước chuyển mình mang tính lịch sử đối với dòng sản phẩm cao cấp của Apple. Trải qua hơn một thập kỷ trung thành với khung thép không gỉ, năm nay Apple đã chính thức chuyển sang sử dụng chất liệu **Titanium Aerospace** (vật liệu siêu bền được ứng dụng trong vỏ tàu vũ trụ NASA).

#### 1. Thiết Kế Titanium Siêu Nhẹ & Nút Tác Vụ Mới
Cảm nhận đầu tiên khi cầm trên tay chính là trọng lượng. Chiếc máy nhẹ hơn thế hệ tiền nhiệm khoảng 19g nhưng cảm giác sờ bám tay và chắc chắn vượt trội nhờ các cạnh bo cong nhẹ. Bề mặt nhám mờ sang trọng hạn chế tối đa việc bám vân tay. Nút gạt rung huyền thoại được thay thế bằng chiếc **Action Button** thông minh, cho phép khởi động nhanh Camera, Ghi âm, hay bật Kính lúp chỉ với một chạm.

#### 2. Hiệu Năng Vô Đối Với Chip A17 Pro
Được chế tạo trên tiến trình 3nm đột phá, chip **A17 Pro** biến chiếc điện thoại thành một cỗ máy chơi game di động thực thụ. Các nhà làm game lớn như Ubisoft đã mang hàng loạt tựa game AAA đình đám vốn chỉ chạy trên Console lên dòng điện thoại này. Màn hình Super Retina XDR với công nghệ ProMotion 120Hz mang đến phản hồi tức thì và rực rỡ đến say đắm.

#### 3. Hệ Thống Camera Đột Phá Tiêu Cự
Sự xuất hiện của thấu kính tiềm vọng zoom quang học **5x** độc quyền đem đến khả năng chụp ảnh thể thao, phong cảnh hay chân dung tầm xa sắc nét hoàn hảo. Các thuật toán nhiếp ảnh điện toán Smart HDR 5 xử lý màu da mềm mại, bắt sáng tối ưu ngay cả trong đêm tối mịt mù.`,
    marketingScript: 'Các tín đồ công nghệ ơi! Trên tay mình chính là siêu phẩm iPhone mười lăm Pro Max Titanium Tự Nhiên. Khung titanium siêu nhẹ siêu bền bỉ, mỏng nhẹ cầm cực kỳ đã tay. Sức mạnh đến từ chip A mười bảy Pro cực khủng chơi game siêu mượt cùng camera zoom quang học năm ích bắt trọn từng khoảnh khắc siêu sắc nét. Đây chắc chắn là chiếc điện thoại đẳng cấp xứng tầm nhất năm nay. Nhấp ngay vào link bên dưới để sở hữu ngay giá ưu đãi độc quyền cực kỳ hấp dẫn nhé!',
    ctaText: 'Mua Ngay iPhone 15 Pro Max - Nhận Quà Tặng 2 Triệu Đồng!',
    targetedAudience: 'Người đam mê công nghệ cao cấp, nhà sáng tạo nội dung, nhiếp ảnh gia tự do và doanh nhân.'
  },
  {
    id: 'sample_dyson',
    productName: 'Dyson Airwrap Multi-Styler Complete Long',
    category: 'Làm đẹp / Máy chăm sóc tóc',
    rating: 4.9,
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hair-of-a-woman-blowing-in-the-wind-34281-large.mp4',
    summary: 'Thiết bị tạo kiểu tóc đa năng ứng dụng hiệu ứng vật lý Coanda vượt trội, uốn sấy thông minh mà không phụ thuộc vào nhiệt độ cực đoan gây tổn hại tóc.',
    pros: [
      'Công nghệ khí động học Coanda tự động hút và quấn tóc quanh trục sấy nhẹ nhàng.',
      'Không dùng nhiệt quá cao (luôn dưới 150 độ C) để tạo kiểu, bảo vệ tóc bóng mượt từ gốc đến ngọn.',
      'Tích hợp đa năng 6 đầu sấy uốn phồng chuyên sâu phù hợp cho mọi kiểu chất tóc.',
      'Sở hữu luồng ion âm giúp kiểm soát xơ rối hoàn hảo sau mỗi lần sấy.'
    ],
    cons: [
      'Sản phẩm phân khúc siêu sang, mức giá bán lẻ chính hãng tương đối đắt đỏ.',
      'Cần dành từ 1 đến 2 ngày tập luyện để điều phối các góc luồng khí đúng kỹ thuật chuẩn salon.'
    ],
    detailedReview: `### Đánh Giá Dyson Airwrap Multi-Styler: Khi Vật Lý Thay Thế Nhiệt Độ Cực Đoan

Nếu bạn là người yêu cái đẹp, chắc chắn chiếc hộp sấy tóc màu xanh Prussian đặc trưng của **Dyson Airwrap** luôn là một ước mơ lớn trên bàn trang điểm. Đây không đơn thuần chỉ là một chiếc máy sấy, mà là cả một giải pháp chăm sóc tóc công nghệ cao đỉnh cao.

#### 1. Định Nghĩa Lại Công Nghệ Với Hiệu Ứng Coanda
Thay vì ép tóc chịu lượng nhiệt cực cao để phá vỡ liên kết sừng rồi uốn xoăn như máy uốn truyền thống, Dyson sử dụng khí động học. **Hiệu ứng Coanda** tạo ra một luồng khí xoáy áp suất cao chạy dọc thân đầu trục, tự động hút tóc quấn xung quanh trục uốn xoắn. Tóc được định hình bằng gió mát và luồng nhiệt an toàn nên giữ nếp lâu dài mà không bị khô xơ hay gãy rụng.

#### 2. Thiết Kế Đa Năng Sấy Tóc Kiêm Chải Phồng mượt
Bộ phụ kiện đi kèm gồm các đầu uốn đảo chiều linh hoạt, lược chải giúp giữ tóc thẳng mượt mà và đầu sấy Coanda làm ẩn tóc con xơ rối. Bảng điều khiển cơ học cho phép bạn tùy chỉnh 3 mức gió và 3 mức nhiệt linh hoạt, kèm nút thổi mát tức thì để khóa nếp nhanh chóng.

#### 3. Đánh Giá Trải Nghiệm Sử Dụng Thực Tế
Sau 3 tuần trải nghiệm thực tế, kết quả nhận được vô cùng vượt trội: Mái tóc của bạn giữ được độ bồng bềnh tự nhiên giống như vừa tạo kiểu tại Salon 5 sao. Tuy chi phí đầu tư ban đầu cao, nhưng việc giảm thiểu hoàn toàn tổn hại cho tóc và tiết kiệm thời gian chờ đợi salon chính là khoản đầu tư thông minh và xứng đáng nhất.`,
    marketingScript: 'Bí quyết để luôn có một mái tóc xoăn bồng bềnh chuẩn sa-lon sang chảnh ngay tại nhà là gì? Chắc chắn phải là Dyson Airwrap Multi Styler rồi các nàng ơi! Với hiệu ứng khí động học Co-an-da thông minh, em nó tự động hút và xoắn tạo kiểu tóc nhẹ nhàng không cần dùng nhiệt quá độ, giúp bảo vệ mái tóc của bạn luôn bóng mượt óng ả từ gốc tới ngọn. Đẹp rạng ngời mỗi ngày chưa bao giờ dễ dàng như thế. Săn ưu đãi giảm ngay mười phần trăm độc quyền chỉ trong hôm nay bằng cách bấm giỏ hàng ngay dưới nhé!',
    ctaText: 'Đăng Ký Săn Ngay Dyson Airwrap - Nhận Voucher Giảm 10% Quà Tặng!',
    targetedAudience: 'Phái đẹp hiện đại, những phụ nữ chăm lo nâng nui mái tóc, beauty blogger chuyên tạo kiểu.'
  },
  {
    id: 'sample_sihoo',
    productName: 'Sihoo M57 Ergonomic Office Chair',
    category: 'Nội thất / Thiết bị bảo vệ sức khỏe',
    rating: 4.6,
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-working-on-his-laptop-at-home-42291-large.mp4',
    summary: 'Ghế công thái học phân khúc tầm trung xuất sắc nhất với cấu tạo lưới đan thoáng khí cao cấp, giá đỡ thắt lưng đa điểm cải thiện hoàn hảo tư thế ngồi tránh mỏi vai gáy.',
    pros: [
      'Đệm nâng thắt lưng điều chỉnh cơ học đa hướng hỗ trợ cột sống nâng đỡ hoàn hảo.',
      'Tựa tay 3D tuỳ chỉnh độ cao, chiều sâu và xoay linh hoạt chống mệt cánh tay.',
      'Lưới đan Full-mesh chất lượng cao có độ đàn hồi tốt, thoáng mát không tích tụ mồ hôi.',
      'Trục thuỷ lực Class 3 chuẩn BIFMA cực kỳ an toàn, khung nâng mâm ghế vững chãi.'
    ],
    cons: [
      'Bánh xe lăn nhựa cứng di chuyển bám sàn tốt nhưng tạo âm thanh trượt nhẹ trên sàn gỗ.',
      'Kiểu dáng hầm hố của ghế công thái học đôi khi kén không gian phối trang trí tối giản.'
    ],
    detailedReview: `### Đánh Giá Ghế Công Thái Học Sihoo M57: Giá Trị Vàng Cho Sức Khỏe Văn Phòng

Với những người làm lập trình viên, thiết kế, hay dân văn phòng thường xuyên ngồi từ 8 đến 10 tiếng mỗi ngày, đau mỏi thắt lưng và vai gáy là căn bệnh trầm kha. Chiếc ghế công thái học **Sihoo M57** chính là giải pháp nâng đỡ phân khúc tầm trung tối ưu nhất.

#### 1. Hệ Thống Giá Đỡ Thắt Lưng Chữ Y Linh Hoạt
Điểm sáng giá nhất trên Sihoo M57 chính là cơ cấu hỗ trợ thắt lưng (Lumbar Support) thông minh hình chữ Y. Cơ cấu này cho phép điều chỉnh vặn núm tịnh tiến cao thấp và nông sâu, tùy chỉnh lực áp chặt ôm khít đường cong lưng của mỗi người sử dụng. Giúp giảm tải áp lực dồn nén trực tiếp lên đĩa đệm.

#### 2. Lưới Full-Mesh Có Độ Đàn Hồi Vượt Trội
Mặt ngồi và tựa lưng làm hoàn toàn bằng lưới Polypropylene cao cấp. Khác với chất đệm mút nóng bức giữ nhiệt trong mùa hè Việt Nam, chất liệu lưới mang lại sự lưu thông không khí tuyệt hảo. Lưới có độ đàn hồi cao, chống lún xẹp tuyệt đối kể cả sau hàng nghìn giờ nhún ngả lưng.

#### 3. Khung Gầm Và Khả Năng Ngả Lưng Lý Tưởng
Cơ chế ngả lưng cơ học từ 90 đến 125 độ đi kèm khóa vị trí, mang lại những giấc nghỉ trưa ngắn hoặc ngả lưng thư giãn sâu giữa giờ làm việc áp lực. Chân ghế kim loại đúc tạo hình lượn sóng chịu tải trọng động hơn 150kg vô cùng bền vững theo thời gian.`,
    marketingScript: 'Bạn bị đau vai gáy, mệt mỏi sau hàng giờ ngồi làm việc căng thẳng tại văn phòng? Hãy giải phóng cơ thể ngay với Ghế công thái học Si-hoo M năm mươi bảy! Thiết kế thông minh nâng đỡ trọn vẹn cột sống thắt lưng, tựa đầu và bệ đỡ tay điều chỉnh ba đê giúp bạn duy trì dáng ngồi khoa học nhất, chất liệu lưới full mesh siêu thoáng khí mát lạnh sảng khoái suốt cả ngày dài. Bảo vệ sức khỏe trọn đời chỉ với một lần đầu tư. Xem chi tiết và đặt mua hôm nay để nhận voucher miễn phí vận chuyển trên toàn quốc nhé!',
    ctaText: 'Mua Ngay Sihoo M57 - Bảo Vệ Cột Sống, Miễn Phí Giao Hàng!',
    targetedAudience: 'Dân văn phòng ngồi lâu, lập trình viên, designer, game thủ chuyên nghiệp và người làm tự do tại nhà.'
  }
];
