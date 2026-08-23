// Tests for background scheduler pool failure classification.
//
// Verifies that classifyBackgroundPoolFailure mirrors the foreground
// classification order in bassBackgroundAnalysisStore.js:
//   1. generationStatus !== "complete" → real status (NOT "empty-pool")
//   2. generationStatus === "complete" + zero candidates → "no-candidates"
//   3. generationStatus === "complete" + candidates present → null (proceed)
//
// Pure functions are inlined to avoid JSX import issues (same pattern as
// p14-background-scheduler.test.mjs).

import assert from 'assert';

// ── Inlined pure function (from p14TargetBackgroundDiagnostics.js) ──

function classifyBackgroundPoolFailure(pool) {
  if (!pool) return 'no-pool';
  if (pool.generationStatus && pool.generationStatus !== 'complete') {
    return pool.generationStatus;
  }
  if (!Array.isArray(pool.candidates) || pool.candidates.length === 0) {
    return 'no-candidates';
  }
  return null;
}

function captureGenerationFailureDiagnostics({
  targetKey,
  pool,
  designContext,
  fingerprint,
  baseDesignFingerprint,
  retryCount,
}) {
  const ctx = designContext || {};
  return {
    targetKey,
    generationStatus: pool?.generationStatus || null,
    missingInputs: Array.isArray(pool?.missingInputs) ? [...pool.missingInputs] : [],
    rawCurveLength: Array.isArray(ctx.rspRawCurve) ? ctx.rspRawCurve.length : null,
    activeSubsCount: Array.isArray(ctx.sources) ? ctx.sources.length : null,
    verticalOffsetDb: ctx.payload?.verticalOffsetDb ?? null,
    requestFingerprint: fingerprint ? fingerprint.substring(0, 24) : null,
    baseDesignFingerprint: baseDesignFingerprint ? baseDesignFingerprint.substring(0, 24) : null,
    retryCount: retryCount || 0,
    warningMessage: pool?.warningMessage || null,
  };
}

// ── Tests ──

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e) { failed++; console.error(`  \u2717 ${name}: ${e.message}`); }
}

// 1. generationStatus = "invalid-inputs", candidates = [] → "invalid-inputs" (NOT "empty-pool")
test('1: invalid-inputs with empty candidates → "invalid-inputs" (not empty-pool)', () => {
  const pool = {
    generationStatus: 'invalid-inputs',
    candidates: [],
    missingInputs: ['rawCurve', 'activeSubs'],
    warningMessage: 'Missing mandatory inputs',
  };
  const reason = classifyBackgroundPoolFailure(pool);
  assert.strictEqual(reason, 'invalid-inputs');
  assert.notStrictEqual(reason, 'empty-pool');
  assert.notStrictEqual(reason, 'no-candidates');
});

// 2. generationStatus = "invalid-anchor", candidates = [] → "invalid-anchor"
test('2: invalid-anchor with empty candidates → "invalid-anchor"', () => {
  const pool = {
    generationStatus: 'invalid-anchor',
    candidates: [],
    warningMessage: 'Anchor frequency out of range',
  };
  const reason = classifyBackgroundPoolFailure(pool);
  assert.strictEqual(reason, 'invalid-anchor');
  assert.notStrictEqual(reason, 'empty-pool');
  assert.notStrictEqual(reason, 'no-candidates');
});

// 3. generationStatus = "complete", candidates = [] → "no-candidates" fallback
test('3: complete + zero candidates → "no-candidates" fallback', () => {
  const pool = {
    generationStatus: 'complete',
    candidates: [],
  };
  const reason = classifyBackgroundPoolFailure(pool);
  assert.strictEqual(reason, 'no-candidates');
  assert.notStrictEqual(reason, 'empty-pool');
  // The fallback is retained — the guard is not removed
  assert.ok(reason !== null, 'zero candidates must still produce a failure reason');
});

// 4. generationStatus = "complete", candidates contains identity → null (normal processing)
test('4: complete + identity candidate → null (normal processing)', () => {
  const pool = {
    generationStatus: 'complete',
    candidates: [{ id: 'identity', filterBank: [] }],
  };
  const reason = classifyBackgroundPoolFailure(pool);
  assert.strictEqual(reason, null, 'valid pool must return null so caller proceeds');
});

// 5. No pool at all → "no-pool"
test('5: missing pool → "no-pool"', () => {
  const reason = classifyBackgroundPoolFailure(null);
  assert.strictEqual(reason, 'no-pool');
  assert.strictEqual(classifyBackgroundPoolFailure(undefined), 'no-pool');
});

// 6. generationStatus absent but candidates present → null (normal processing)
test('6: absent generationStatus + candidates present → null', () => {
  const pool = { candidates: [{ id: 'c1' }] };
  const reason = classifyBackgroundPoolFailure(pool);
  assert.strictEqual(reason, null);
});

// 7. generationStatus absent + zero candidates → "no-candidates"
test('7: absent generationStatus + zero candidates → "no-candidates"', () => {
  const pool = { candidates: [] };
  const reason = classifyBackgroundPoolFailure(pool);
  assert.strictEqual(reason, 'no-candidates');
});

// 8. Diagnostic capture: invalid-inputs preserves missingInputs and context
test('8: diagnostic capture — invalid-inputs preserves missingInputs', () => {
  const pool = {
    generationStatus: 'invalid-inputs',
    candidates: [],
    missingInputs: ['rawCurve', 'activeSubs'],
    warningMessage: 'Missing mandatory inputs',
  };
  const diag = captureGenerationFailureDiagnostics({
    targetKey: 'minimum-L2',
    pool,
    designContext: {
      rspRawCurve: new Array(360),
      sources: [{ id: 'sub-1' }, { id: 'sub-2' }],
      payload: { verticalOffsetDb: 1.5 },
    },
    fingerprint: 'fp-abcdef1234567890',
    baseDesignFingerprint: 'cal:v5:601a675bda8e18d1',
    retryCount: 1,
  });
  assert.strictEqual(diag.targetKey, 'minimum-L2');
  assert.strictEqual(diag.generationStatus, 'invalid-inputs');
  assert.deepStrictEqual(diag.missingInputs, ['rawCurve', 'activeSubs']);
  assert.strictEqual(diag.rawCurveLength, 360);
  assert.strictEqual(diag.activeSubsCount, 2);
  assert.strictEqual(diag.verticalOffsetDb, 1.5);
  assert.strictEqual(diag.retryCount, 1);
  assert.strictEqual(diag.warningMessage, 'Missing mandatory inputs');
  assert.ok(diag.requestFingerprint.length <= 24, 'fingerprint truncated');
  assert.ok(diag.baseDesignFingerprint.length <= 24, 'base fingerprint truncated');
});

// 9. Diagnostic capture: null context fields are safe
test('9: diagnostic capture — null designContext fields are safe', () => {
  const pool = {
    generationStatus: 'invalid-anchor',
    candidates: [],
  };
  const diag = captureGenerationFailureDiagnostics({
    targetKey: 'recommended-L3',
    pool,
    designContext: null,
    fingerprint: null,
    baseDesignFingerprint: null,
    retryCount: 0,
  });
  assert.strictEqual(diag.generationStatus, 'invalid-anchor');
  assert.deepStrictEqual(diag.missingInputs, []);
  assert.strictEqual(diag.rawCurveLength, null);
  assert.strictEqual(diag.activeSubsCount, null);
  assert.strictEqual(diag.verticalOffsetDb, null);
  assert.strictEqual(diag.requestFingerprint, null);
  assert.strictEqual(diag.baseDesignFingerprint, null);
});

// 10. Regression: "empty-pool" is never returned by the classifier
test('10: regression — "empty-pool" is never returned', () => {
  const pools = [
    null,
    undefined,
    { candidates: [] },
    { generationStatus: 'complete', candidates: [] },
    { generationStatus: 'invalid-inputs', candidates: [] },
    { generationStatus: 'invalid-anchor', candidates: [] },
    { generationStatus: 'complete', candidates: [{ id: 'x' }] },
  ];
  for (const pool of pools) {
    const reason = classifyBackgroundPoolFailure(pool);
    assert.ok(reason !== 'empty-pool', `"empty-pool" must never be returned (got ${reason} for ${JSON.stringify(pool)})`);
  }
});

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);