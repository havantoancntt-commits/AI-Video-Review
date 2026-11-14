import assert from 'node:assert/strict';
import { ServiceHealthItem, SystemStatusResponse } from '../src/types';

function computeCompositeHealth(services: {
  text: ServiceHealthItem;
  vision: ServiceHealthItem;
  tts: ServiceHealthItem;
}): SystemStatusResponse['geminiStatus'] {
  const statuses = [services.text.status, services.vision.status, services.tts.status];
  if (statuses.some(s => s === 'MISCONFIGURED')) return 'MISCONFIGURED';
  if (statuses.every(s => s === 'QUOTA_EXCEEDED')) return 'QUOTA_EXCEEDED';
  if (statuses.every(s => s === 'UNAVAILABLE' || s === 'QUOTA_EXCEEDED')) return 'UNAVAILABLE';
  if (statuses.some(s => s !== 'CONNECTED')) return 'DEGRADED';
  return 'CONNECTED';
}

export function runSystemStatusTests() {
  console.log('🧪 [TEST SUITE 7] Multi-Service Gemini Health Probe Tests...');

  // 1. All 3 healthy -> CONNECTED
  assert.equal(
    computeCompositeHealth({
      text: { status: 'CONNECTED', latencyMs: 120, model: 'gemini-4-hydrogen' },
      vision: { status: 'CONNECTED', latencyMs: 240, model: 'gemini-4-hydrogen' },
      tts: { status: 'CONNECTED', latencyMs: 310, model: 'gemini-3.8-flash-lite-tts' }
    }),
    'CONNECTED'
  );

  // 2. Text OK, TTS down -> DEGRADED (NOT falsely CONNECTED)
  assert.equal(
    computeCompositeHealth({
      text: { status: 'CONNECTED', latencyMs: 110, model: 'gemini-4-hydrogen' },
      vision: { status: 'CONNECTED', latencyMs: 200, model: 'gemini-4-hydrogen' },
      tts: { status: 'UNAVAILABLE', latencyMs: 5000, model: 'gemini-3.8-flash-lite-tts', error: '503' }
    }),
    'DEGRADED'
  );

  // 3. Invalid key anywhere -> MISCONFIGURED
  assert.equal(
    computeCompositeHealth({
      text: { status: 'MISCONFIGURED', latencyMs: 50, model: 'gemini-4-hydrogen', error: '401 Unauthorized' },
      vision: { status: 'CONNECTED', latencyMs: 200, model: 'gemini-4-hydrogen' },
      tts: { status: 'CONNECTED', latencyMs: 200, model: 'gemini-3.8-flash-lite-tts' }
    }),
    'MISCONFIGURED'
  );

  // 4. All Quota exhausted -> QUOTA_EXCEEDED
  assert.equal(
    computeCompositeHealth({
      text: { status: 'QUOTA_EXCEEDED', latencyMs: 90, model: 'gemini-4-hydrogen' },
      vision: { status: 'QUOTA_EXCEEDED', latencyMs: 90, model: 'gemini-4-hydrogen' },
      tts: { status: 'QUOTA_EXCEEDED', latencyMs: 90, model: 'gemini-3.8-flash-lite-tts' }
    }),
    'QUOTA_EXCEEDED'
  );

  // 5. All Unavailable -> UNAVAILABLE
  assert.equal(
    computeCompositeHealth({
      text: { status: 'UNAVAILABLE', latencyMs: 3000, model: 'gemini-4-hydrogen' },
      vision: { status: 'UNAVAILABLE', latencyMs: 3000, model: 'gemini-4-hydrogen' },
      tts: { status: 'QUOTA_EXCEEDED', latencyMs: 100, model: 'gemini-3.8-flash-lite-tts' }
    }),
    'UNAVAILABLE'
  );

  console.log('✅ [PASSED] Multi-Service Gemini Health Probe Tests passed!\n');
}
