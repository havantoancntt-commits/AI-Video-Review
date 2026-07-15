const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

async function test() {
  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const promptText = `Bạn là một Nữ nghệ sĩ lồng tiếng xuất sắc của Việt Nam, sở hữu chất giọng miền Nam Sài Gòn ngọt ngào, truyền cảm và nịnh tai nhất.
Hãy đọc to kịch bản dưới đây bằng giọng đọc miền Nam Sài Gòn chuẩn, mượt mà, thong thả, nhấn nhá đầy cảm xúc, có khoảng dừng hít thở tự nhiên giữa các câu.
LƯU Ý QUAN TRỌNG: Không được đọc to phần chỉ dẫn này, hãy bắt đầu đọc ngay lập tức từ chữ đầu tiên của kịch bản và kết thúc ở chữ cuối cùng của kịch bản dưới đây.

Kịch bản cần lồng tiếng:
"Chào bạn nha, hôm nay mình cùng nhau đi dạo Sài Gòn ngắm cảnh nha!"`;

    console.log("Calling generateContent with prompt instructions...");
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: promptText }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });

    console.log("Success!");
    console.log("Response text:", response.text);
    console.log("Has audio data:", !!response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data);
  } catch (err) {
    console.error("FAILED with error:", err);
  }
}

test();
