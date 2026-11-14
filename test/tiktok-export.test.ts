import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkFfmpegCapabilities,
  verifyMp4FastStart,
  probeMediaFile,
  validateTikTokMp4,
  transcodeAndValidateToTikTokMp4,
  TIKTOK_QUALITY_PRESETS,
  normalizeQualityTier,
} from '../server/tiktokTranscoder';
import {
  selectOptimalRecorderCodec,
  getTikTokExportBitrateBps,
  computeTikTokCanvasDimensions,
  computeUploadChunkPlan,
  SINGLE_UPLOAD_SAFE_MAX_BYTES,
  DEFAULT_UPLOAD_CHUNK_BYTES,
} from '../src/tiktokExportEngine';

function runFfmpegSync(args: string[]): void {
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
  });
}

export async function runTikTokExportTests() {
  console.log('🧪 [TEST SUITE 8] TikTok Export Engine & FFmpeg MP4 Validation Tests (12 Scenarios)...');

  const caps = checkFfmpegCapabilities();
  assert.equal(caps.ffmpegAvailable, true, 'System FFmpeg binary must be available');
  assert.equal(caps.ffprobeAvailable, true, 'System FFprobe binary must be available');
  assert.equal(caps.encoders.h264, true, 'FFmpeg must have libx264 encoder enabled');
  assert.equal(caps.encoders.aac, true, 'FFmpeg must have aac encoder enabled');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktok-export-test-'));

  try {
    // Use ultrafast x264 preset in automated test execution so full multi-scenario suite runs in seconds
    // while exercising exact same libx264 High profile, yuv420p, 1080x1920, 30fps CFR, AAC 48kHz, +faststart pipeline.
    const fastTestPreset = 'ultrafast';

    // ------------------------------------------------------------------------
    // TEST 1: WebM VP8 + Opus -> Transcode to TikTok MP4 (H.264/AAC faststart)
    // ------------------------------------------------------------------------
    const vp8Input = path.join(tmpDir, 'input_vp8_opus.webm');
    const vp8Output = path.join(tmpDir, 'output_vp8.mp4');
    runFfmpegSync([
      '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
      '-c:v', 'libvpx', '-b:v', '1M', '-c:a', 'libopus', '-b:a', '96k',
      vp8Input,
    ]);
    const vp8Report = await transcodeAndValidateToTikTokMp4({
      inputPath: vp8Input,
      outputPath: vp8Output,
      qualityTier: 'high',
      presetOverride: fastTestPreset,
    });
    assert.equal(vp8Report.valid, true, `VP8+Opus MP4 validation failed: ${vp8Report.errors.join('; ')}`);
    assert.equal(vp8Report.videoCodec, 'h264');
    assert.equal(vp8Report.audioCodec, 'aac');
    assert.equal(vp8Report.pixelFormat, 'yuv420p');
    assert.equal(vp8Report.width, 1080);
    assert.equal(vp8Report.height, 1920);
    assert.ok(vp8Report.fps >= 29.5 && vp8Report.fps <= 30.5, `Expected ~30fps, got ${vp8Report.fps}`);
    assert.equal(vp8Report.fastStart, true);
    assert.equal(vp8Report.decodeIntegrityPassed, true);

    // ------------------------------------------------------------------------
    // TEST 2: WebM VP9 + Opus -> Transcode to TikTok MP4
    // ------------------------------------------------------------------------
    const vp9Input = path.join(tmpDir, 'input_vp9_opus.webm');
    const vp9Output = path.join(tmpDir, 'output_vp9.mp4');
    runFfmpegSync([
      '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30:duration=1.5',
      '-f', 'lavfi', '-i', 'sine=frequency=523:sample_rate=48000:duration=1.5',
      '-c:v', 'libvpx-vp9', '-b:v', '800k', '-deadline', 'realtime', '-cpu-used', '8',
      '-c:a', 'libopus', '-b:a', '96k',
      vp9Input,
    ]);
    const vp9Report = await transcodeAndValidateToTikTokMp4({
      inputPath: vp9Input,
      outputPath: vp9Output,
      qualityTier: 'standard',
      presetOverride: fastTestPreset,
    });
    assert.equal(vp9Report.valid, true, `VP9+Opus MP4 validation failed: ${vp9Report.errors.join('; ')}`);
    assert.equal(vp9Report.fastStart, true);
    assert.equal(vp9Report.decodeIntegrityPassed, true);

    // ------------------------------------------------------------------------
    // TEST 3: MP4 H.264 + AAC landscape & non-faststart -> Normalized 1080x1920 faststart MP4
    // ------------------------------------------------------------------------
    const nonFastMp4 = path.join(tmpDir, 'input_nonfast_landscape.mp4');
    const normalizedMp4 = path.join(tmpDir, 'output_normalized.mp4');
    runFfmpegSync([
      '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-ar', '44100',
      nonFastMp4, // default FFmpeg muxer places moov after mdat unless -movflags +faststart
    ]);
    const preCheck = verifyMp4FastStart(nonFastMp4);
    assert.equal(preCheck.fastStart, false, 'Baseline MP4 without +faststart should have moov after mdat');

    const normalizedReport = await transcodeAndValidateToTikTokMp4({
      inputPath: nonFastMp4,
      outputPath: normalizedMp4,
      qualityTier: 'high',
      presetOverride: fastTestPreset,
    });
    assert.equal(normalizedReport.valid, true);
    assert.equal(normalizedReport.width, 1080);
    assert.equal(normalizedReport.height, 1920);
    assert.equal(normalizedReport.fastStart, true, 'Normalized MP4 must place moov atom before mdat');

    // ------------------------------------------------------------------------
    // TEST 4: Silent video (no audio track)
    // ------------------------------------------------------------------------
    const silentInput = path.join(tmpDir, 'input_silent.webm');
    const silentOutput = path.join(tmpDir, 'output_silent.mp4');
    runFfmpegSync([
      '-f', 'lavfi', '-i', 'color=c=navy:size=1080x1920:rate=30:duration=1.5',
      '-c:v', 'libvpx', '-b:v', '500k', '-an',
      silentInput,
    ]);
    const silentReport = await transcodeAndValidateToTikTokMp4({
      inputPath: silentInput,
      outputPath: silentOutput,
      qualityTier: 'standard',
      presetOverride: fastTestPreset,
    });
    assert.equal(silentReport.valid, true, `Silent video failed: ${silentReport.errors.join('; ')}`);
    assert.equal(silentReport.hasAudio, false);
    assert.equal(silentReport.audioCodec, null);
    assert.equal(silentReport.decodeIntegrityPassed, true);

    // ------------------------------------------------------------------------
    // TEST 5: Exact 1080x1920 portrait 9:16 preservation
    // ------------------------------------------------------------------------
    const portraitInput = path.join(tmpDir, 'input_1080x1920.webm');
    const portraitOutput = path.join(tmpDir, 'output_1080x1920.mp4');
    runFfmpegSync([
      '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=1.5',
      '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=1.5',
      '-c:v', 'libvpx', '-b:v', '1500k', '-c:a', 'libopus',
      portraitInput,
    ]);
    const portraitReport = await transcodeAndValidateToTikTokMp4({
      inputPath: portraitInput,
      outputPath: portraitOutput,
      qualityTier: 'premium',
      presetOverride: fastTestPreset,
    });
    assert.equal(portraitReport.valid, true);
    assert.equal(portraitReport.width, 1080);
    assert.equal(portraitReport.height, 1920);

    // ------------------------------------------------------------------------
    // TEST 6: Short video (< 30s, e.g. 4s) & tight A/V sync delta
    // ------------------------------------------------------------------------
    const shortInput = path.join(tmpDir, 'input_short_4s.webm');
    const shortOutput = path.join(tmpDir, 'output_short_4s.mp4');
    runFfmpegSync([
      '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30:duration=4',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
      '-c:v', 'libvpx', '-b:v', '800k', '-c:a', 'libopus',
      shortInput,
    ]);
    const shortReport = await transcodeAndValidateToTikTokMp4({
      inputPath: shortInput,
      outputPath: shortOutput,
      qualityTier: 'high',
      presetOverride: fastTestPreset,
    });
    assert.equal(shortReport.valid, true);
    assert.ok(shortReport.durationSec >= 3.8 && shortReport.durationSec <= 4.3, `Unexpected duration ${shortReport.durationSec}`);
    assert.ok(shortReport.audioVideoSyncDeltaSec !== null && shortReport.audioVideoSyncDeltaSec <= 0.3, `A/V drift too high: ${shortReport.audioVideoSyncDeltaSec}`);

    // ------------------------------------------------------------------------
    // TEST 7: Long video (1–3 min simulation: 65s CFR stream)
    // ------------------------------------------------------------------------
    const longInput = path.join(tmpDir, 'input_long_65s.mp4');
    const longOutput = path.join(tmpDir, 'output_long_65s.mp4');
    runFfmpegSync([
      '-f', 'lavfi', '-i', 'color=c=black:size=360x640:rate=30:duration=65',
      '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=65',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '150k',
      '-c:a', 'aac', '-b:a', '64k',
      longInput,
    ]);
    const longReport = await transcodeAndValidateToTikTokMp4({
      inputPath: longInput,
      outputPath: longOutput,
      qualityTier: 'standard',
      presetOverride: fastTestPreset,
    });
    assert.equal(longReport.valid, true, `Long 65s MP4 failed: ${longReport.errors.join('; ')}`);
    assert.ok(longReport.durationSec >= 64.0 && longReport.durationSec <= 66.0);
    assert.equal(longReport.fastStart, true);
    assert.equal(longReport.decodeIntegrityPassed, true);

    // ------------------------------------------------------------------------
    // TEST 8: Multi-segment video concatenation -> Single TikTok MP4
    // ------------------------------------------------------------------------
    const segA = path.join(tmpDir, 'segA.mp4');
    const segB = path.join(tmpDir, 'segB.mp4');
    const mergedSegInput = path.join(tmpDir, 'merged_seg.webm');
    const mergedSegOutput = path.join(tmpDir, 'output_multi_seg.mp4');
    runFfmpegSync([
      '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=25:duration=1.2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=1.2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-ar', '44100', '-ac', '2',
      segA,
    ]);
    runFfmpegSync([
      '-f', 'lavfi', '-i', 'color=c=red:size=1280x720:rate=30:duration=1.2',
      '-f', 'lavfi', '-i', 'sine=frequency=550:sample_rate=48000:duration=1.2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-ar', '48000', '-ac', '2',
      segB,
    ]);
    runFfmpegSync([
      '-i', segA, '-i', segB,
      '-filter_complex',
      '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0];' +
      '[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1];' +
      '[0:a]aresample=48000[a0];[1:a]aresample=48000[a1];' +
      '[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]',
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libvpx', '-b:v', '900k', '-c:a', 'libopus',
      mergedSegInput,
    ]);
    const multiSegReport = await transcodeAndValidateToTikTokMp4({
      inputPath: mergedSegInput,
      outputPath: mergedSegOutput,
      qualityTier: 'high',
      presetOverride: fastTestPreset,
    });
    assert.equal(multiSegReport.valid, true);
    assert.ok(multiSegReport.durationSec >= 2.1 && multiSegReport.durationSec <= 2.8);

    // ------------------------------------------------------------------------
    // TEST 9: Burned-in Subtitle Overlay Bar Simulation
    // ------------------------------------------------------------------------
    const subInput = path.join(tmpDir, 'input_subtitle_overlay.webm');
    const subOutput = path.join(tmpDir, 'output_subtitle_overlay.mp4');
    runFfmpegSync([
      '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=1.5',
      '-f', 'lavfi', '-i', 'sine=frequency=480:sample_rate=48000:duration=1.5',
      '-vf', 'drawbox=x=80:y=1420:w=920:h=160:color=black@0.75:t=fill,drawbox=x=80:y=1420:w=920:h=160:color=yellow:t=4',
      '-c:v', 'libvpx', '-b:v', '1200k', '-c:a', 'libopus',
      subInput,
    ]);
    const subReport = await transcodeAndValidateToTikTokMp4({
      inputPath: subInput,
      outputPath: subOutput,
      qualityTier: 'high',
      presetOverride: fastTestPreset,
    });
    assert.equal(subReport.valid, true);
    assert.equal(subReport.decodeIntegrityPassed, true);

    // ------------------------------------------------------------------------
    // TEST 10: Mixed Voice + Background Music Audio -> AAC-LC 48kHz Stereo
    // ------------------------------------------------------------------------
    const mixedInput = path.join(tmpDir, 'input_mixed_audio.webm');
    const mixedOutput = path.join(tmpDir, 'output_mixed_audio.mp4');
    runFfmpegSync([
      '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=24000:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=120:sample_rate=44100:duration=2',
      '-filter_complex', '[1:a]volume=0.8[voice];[2:a]volume=0.25[bgm];[voice][bgm]amix=inputs=2:duration=shortest[a]',
      '-map', '0:v', '-map', '[a]',
      '-c:v', 'libvpx', '-b:v', '800k', '-c:a', 'libopus',
      mixedInput,
    ]);
    const mixedReport = await transcodeAndValidateToTikTokMp4({
      inputPath: mixedInput,
      outputPath: mixedOutput,
      qualityTier: 'high',
      presetOverride: fastTestPreset,
    });
    assert.equal(mixedReport.valid, true);
    assert.equal(mixedReport.audioCodec, 'aac');
    const mixedProbe = await probeMediaFile(mixedOutput);
    const mixedAudioStream = mixedProbe.streams.find((s) => s.codec_type === 'audio');
    assert.equal(mixedAudioStream?.sample_rate, '48000');
    assert.equal(mixedAudioStream?.channels, 2);

    // ------------------------------------------------------------------------
    // TEST 11: Bitrate Tiers (8/10/12 Mbps) & High-Bitrate Source Control
    // ------------------------------------------------------------------------
    assert.equal(TIKTOK_QUALITY_PRESETS.standard.bitrateBps, 8_000_000);
    assert.equal(TIKTOK_QUALITY_PRESETS.high.bitrateBps, 10_000_000);
    assert.equal(TIKTOK_QUALITY_PRESETS.premium.bitrateBps, 12_000_000);
    assert.equal(getTikTokExportBitrateBps('standard'), 8_000_000);
    assert.equal(getTikTokExportBitrateBps('high'), 10_000_000);
    assert.equal(getTikTokExportBitrateBps('premium'), 12_000_000);
    assert.equal(normalizeQualityTier('master'), 'premium');
    assert.deepEqual(computeTikTokCanvasDimensions('1080p'), { width: 1080, height: 1920 });
    assert.deepEqual(computeTikTokCanvasDimensions('4k'), { width: 1080, height: 1920 });
    assert.deepEqual(computeTikTokCanvasDimensions('720p'), { width: 720, height: 1280 });

    // Chunked streaming upload plan must guarantee every HTTP request stays well under Cloud Run's 32MB ceiling
    assert.ok(SINGLE_UPLOAD_SAFE_MAX_BYTES < 32 * 1024 * 1024);
    assert.ok(DEFAULT_UPLOAD_CHUNK_BYTES <= 8 * 1024 * 1024);
    const plan50mb = computeUploadChunkPlan(50 * 1024 * 1024 + 12345);
    assert.ok(plan50mb.length >= 10, '50MB+ export must split into safe multi-chunk streaming slices');
    assert.equal(plan50mb[0].start, 0);
    assert.equal(plan50mb[plan50mb.length - 1].end, 50 * 1024 * 1024 + 12345);
    for (const s of plan50mb) {
      assert.ok(s.size > 0 && s.size <= DEFAULT_UPLOAD_CHUNK_BYTES, 'Every chunk must respect max chunk size');
    }

    // Large / high-bitrate source (>20Mbps bursts) cleanly encoded within tier ceiling
    const highBrInput = path.join(tmpDir, 'input_high_bitrate.mp4');
    const highBrOutput = path.join(tmpDir, 'output_capped_standard.mp4');
    runFfmpegSync([
      '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '25M', '-minrate', '20M', '-maxrate', '30M', '-bufsize', '30M',
      '-c:a', 'aac', '-ar', '48000',
      highBrInput,
    ]);
    const cappedReport = await transcodeAndValidateToTikTokMp4({
      inputPath: highBrInput,
      outputPath: highBrOutput,
      qualityTier: 'standard',
      presetOverride: fastTestPreset,
    });
    assert.equal(cappedReport.valid, true);
    assert.ok(cappedReport.bitrateBps <= 11_000_000, `Standard 8M tier output bitrate (${cappedReport.bitrateBps}) should remain safely bounded`);

    // ------------------------------------------------------------------------
    // TEST 12: Android Codec Selection Strategy + Negative Validator Guards
    // ------------------------------------------------------------------------
    const androidProfile = selectOptimalRecorderCodec(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
      (mime) => mime.includes('webm') || mime.includes('mp4')
    );
    assert.equal(androidProfile.isAndroid, true);
    assert.equal(androidProfile.isNativeMp4, false, 'Android Chrome must capture reliable WebM VP8/Opus temp stream, not flaky MediaRecorder MP4');
    assert.equal(androidProfile.needsServerTranscode, true, 'Android capture MUST require server FFmpeg MP4 transcode');
    assert.ok(androidProfile.mimeType.startsWith('video/webm'));

    const desktopMp4Profile = selectOptimalRecorderCodec(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      (mime) => mime.startsWith('video/mp4') || mime.startsWith('video/webm')
    );
    assert.equal(desktopMp4Profile.isAndroid, false);
    assert.equal(desktopMp4Profile.isNativeMp4, true, 'Priority 1 selects native H.264/AAC MP4 when browser supports it');
    assert.equal(desktopMp4Profile.needsServerTranscode, true, 'Even native MP4 goes through FFmpeg faststart/CFR verification');

    // Negative test A: Validate rejects non-faststart landscape file
    const badReport = await validateTikTokMp4(nonFastMp4, { requireExact1080x1920: true, requireFastStart: true });
    assert.equal(badReport.valid, false, 'Validator must reject non-faststart non-1080x1920 MP4');
    assert.equal(badReport.fastStart, false);
    assert.ok(badReport.errors.length >= 2);

    // Negative test B: Validate rejects corrupted truncated MP4 file
    const corruptMp4 = path.join(tmpDir, 'corrupt.mp4');
    const validBytes = fs.readFileSync(vp8Output);
    fs.writeFileSync(corruptMp4, validBytes.subarray(0, Math.floor(validBytes.length / 2)));
    let corruptRejected = false;
    try {
      const corruptReport = await validateTikTokMp4(corruptMp4);
      if (!corruptReport.valid) corruptRejected = true;
    } catch {
      corruptRejected = true;
    }
    assert.equal(corruptRejected, true, 'Validator must reject corrupted/truncated MP4');

    console.log('✅ [PASSED] 12/12 TikTok Export Engine, FFmpeg Transcode & FastStart Validation Tests passed!\n');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
