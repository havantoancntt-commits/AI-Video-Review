import assert from 'node:assert/strict';

// Binary WAV encoder verification (Node.js compatible)
function encodePcmToWavBuffer(pcmBuffer: Buffer, sampleRate = 24000): Buffer {
  // If already WAV RIFF
  if (pcmBuffer.length >= 12 && pcmBuffer.subarray(0, 4).toString('ascii') === 'RIFF') {
    return pcmBuffer;
  }

  const len = pcmBuffer.length;
  const wavHeader = Buffer.alloc(44);

  // RIFF identifier
  wavHeader.write('RIFF', 0, 'ascii');
  wavHeader.writeUInt32LE(36 + len, 4);
  wavHeader.write('WAVE', 8, 'ascii');

  // fmt chunk
  wavHeader.write('fmt ', 12, 'ascii');
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20); // Linear PCM
  wavHeader.writeUInt16LE(1, 22); // Mono (1 channel)
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(sampleRate * 2, 28); // Byte rate
  wavHeader.writeUInt16LE(2, 32); // Block align
  wavHeader.writeUInt16LE(16, 34); // 16-bit

  // data chunk
  wavHeader.write('data', 36, 'ascii');
  wavHeader.writeUInt32LE(len, 40);

  return Buffer.concat([wavHeader, pcmBuffer]);
}

export function runTtsAudioTests() {
  console.log('🧪 [TEST SUITE 4] Text-To-Speech Audio & WAV Validation Tests...');

  // 1. Synthesize 0.5s of 440Hz sine wave PCM 16-bit Mono at 24000Hz
  const sampleRate = 24000;
  const durationSec = 0.5;
  const numSamples = Math.floor(sampleRate * durationSec);
  const pcmBuffer = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin(2 * Math.PI * 440 * (i / sampleRate));
    const intSample = Math.floor(sample * 32767);
    pcmBuffer.writeInt16LE(intSample, i * 2);
  }

  // Verify non-zero amplitude (not silent!)
  let hasNonZeroSample = false;
  for (let i = 0; i < numSamples; i++) {
    if (pcmBuffer.readInt16LE(i * 2) !== 0) {
      hasNonZeroSample = true;
      break;
    }
  }
  assert.equal(hasNonZeroSample, true, "Synthesized audio must have real non-zero audio wave amplitudes");

  // 2. Encode to WAV
  const wavBuffer = encodePcmToWavBuffer(pcmBuffer, sampleRate);
  assert.equal(wavBuffer.length, 44 + pcmBuffer.length);

  // 3. Verify WAV RIFF Header specification
  assert.equal(wavBuffer.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wavBuffer.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(wavBuffer.subarray(12, 16).toString('ascii'), 'fmt ');
  assert.equal(wavBuffer.readUInt16LE(20), 1, "Audio format must be Linear PCM (1)");
  assert.equal(wavBuffer.readUInt16LE(22), 1, "Audio channels must be Mono (1)");
  assert.equal(wavBuffer.readUInt32LE(24), 24000, "Sample rate must match 24000 Hz");
  assert.equal(wavBuffer.readUInt16LE(34), 16, "Bit depth must be 16-bit");
  assert.equal(wavBuffer.subarray(36, 40).toString('ascii'), 'data');
  assert.equal(wavBuffer.readUInt32LE(40), pcmBuffer.length);

  // 4. Test idempotent RIFF bypass
  const idempotentWav = encodePcmToWavBuffer(wavBuffer, sampleRate);
  assert.equal(idempotentWav.length, wavBuffer.length, "Existing RIFF header should not be double-wrapped");

  console.log('✅ [PASSED] Text-To-Speech Audio & WAV Validation Tests successfully passed!\n');
}
