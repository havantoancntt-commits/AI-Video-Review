import { runValidationTests } from './validation.test';
import { runGeminiParserTests } from './gemini-parser.test';
import { runSubtitleTests } from './subtitles.test';
import { runTtsAudioTests } from './tts-audio.test';
import { runProductRecognitionTests } from './product-recognition.test';
import { runTrendingScannerTests } from './trending-scanner.test';
import { runSystemStatusTests } from './system-status.test';
import { runTikTokExportTests } from './tiktok-export.test';

async function main() {
  console.log('========================================================');
  console.log('🚀 AI-VIDEO-REVIEW V3: PRODUCTION GRADE AUTOMATED TEST SUITE');
  console.log('========================================================\n');

  const startTime = Date.now();
  try {
    runValidationTests();
    runGeminiParserTests();
    runSubtitleTests();
    runTtsAudioTests();
    runProductRecognitionTests();
    runTrendingScannerTests();
    runSystemStatusTests();
    await runTikTokExportTests();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('========================================================');
    console.log(`🎉 ALL 8 TEST SUITES PASSED FLAWLESSLY IN ${elapsed}s!`);
    console.log('========================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILURE DETECTED:');
    console.error(error);
    process.exit(1);
  }
}

main();
