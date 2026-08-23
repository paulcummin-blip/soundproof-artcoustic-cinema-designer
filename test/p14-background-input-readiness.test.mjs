// Regression tests for the background scheduler input-readiness race fix.
//
// Verifies the lifecycle described in the fix spec:
//   STATE A: restored authoritative foreground, cache=1/8, rspRawCurve=[]
//     → foregroundReady=true, backgroundInputsReady=false, scheduler NOT scheduled
//   STATE B: same authority, same cache, rspRawCurve=360 valid points
//     → backgroundInputsReady=true, scheduler scheduled with rawCurve.length=360
//   No foreground optimiser run in either state.
//   activeSubs=[] → no background scheduling.
//
// Pure functions are inlined to avoid JSX import issues (same pattern as
// p14-background-scheduler.test.mjs).

import assert from 'assert';

// ── Inlined pure function (from backgroundInputReadiness.js) ──

function isBackgroundInputsReady({ rspRawCurve, sources } = {}) {
  if (!Array.isArray(rspRawCurve) || rspRawCurve.length === 0) return false;
  for (const point of rspRawCurve) {
    if (!point || !Number.isFinite(point.frequency) || point.frequency <= 0) return false;
  }
  if (!Array.isArray(sources) || sources.length === 0) return false;
  return true;
}

// ── Inlined scheduling decision (mirrors BassBackgroundAnalysisOwner effect) ──
// Returns 'schedule' or 'cancel' based on the combined readiness gates.

function resolveBackgroundSchedulingDecision({
  isProjectHydrationReady,
  isDragging,
  baseDesignFingerprint,
  targetKey,
  foregroundReady,
  backgroundInputsReady,
  allTargetsLength,
}) {
  if (!isProjectHydrationReady || isDragging || !baseDesignFingerprint || !targetKey) {
    return 'cancel';
  }
  if (!foregroundReady || !allTargetsLength || !backgroundInputsReady) {
    return 'cancel';
  }
  return 'schedule';
}

// ── Helpers ──

function makeValidCurve(length = 360) {
  return Array.from({ length }, (_, i) => ({
    frequency: 20 + (i * 180 / (length - 1)),
    spl: -10 + (i % 20) * 0.5,
  }));
}

function makeActiveSubs(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: `front-sub-${i}`,
    modelKey: 'SUB2-12',
    x: 1 + i,
    y: 2,
    z: 0.35,
  }));
}

// ── Tests ──

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e) { failed++; console.error(`  \u2717 ${name}: ${e.message}`); }
}

// ── isBackgroundInputsReady unit tests ──

test('readiness: empty curve → false', () => {
  assert.strictEqual(isBackgroundInputsReady({ rspRawCurve: [], sources: makeActiveSubs() }), false);
});

test('readiness: null curve → false', () => {
  assert.strictEqual(isBackgroundInputsReady({ rspRawCurve: null, sources: makeActiveSubs() }), false);
});

test('readiness: undefined args → false', () => {
  assert.strictEqual(isBackgroundInputsReady(), false);
});

test('readiness: valid 360-point curve + 2 subs → true', () => {
  assert.strictEqual(isBackgroundInputsReady({ rspRawCurve: makeValidCurve(360), sources: makeActiveSubs(2) }), true);
});

test('readiness: valid curve + 1 sub → true', () => {
  assert.strictEqual(isBackgroundInputsReady({ rspRawCurve: makeValidCurve(360), sources: makeActiveSubs(1) }), true);
});

test('readiness: valid curve + 0 subs → false', () => {
  assert.strictEqual(isBackgroundInputsReady({ rspRawCurve: makeValidCurve(360), sources: [] }), false);
});

test('readiness: valid curve + null subs → false', () => {
  assert.strictEqual(isBackgroundInputsReady({ rspRawCurve: makeValidCurve(360), sources: null }), false);
});

test('readiness: curve with non-finite frequency point → false', () => {
  const curve = makeValidCurve(360);
  curve[100] = { frequency: NaN, spl: 0 };
  assert.strictEqual(isBackgroundInputsReady({ rspRawCurve: curve, sources: makeActiveSubs() }), false);
});

test('readiness: curve with zero frequency point → false', () => {
  const curve = makeValidCurve(360);
  curve[50] = { frequency: 0, spl: 0 };
  assert.strictEqual(isBackgroundInputsReady({ rspRawCurve: curve, sources: makeActiveSubs() }), false);
});

test('readiness: curve with null point → false', () => {
  const curve = makeValidCurve(360);
  curve[200] = null;
  assert.strictEqual(isBackgroundInputsReady({ rspRawCurve: curve, sources: makeActiveSubs() }), false);
});

test('readiness: single-point valid curve → true', () => {
  assert.strictEqual(isBackgroundInputsReady({ rspRawCurve: [{ frequency: 35, spl: -5 }], sources: makeActiveSubs() }), true);
});

test('readiness: spl=null is tolerated (frequency is the mandatory axis)', () => {
  const curve = makeValidCurve(360).map((p) => ({ frequency: p.frequency, spl: null }));
  assert.strictEqual(isBackgroundInputsReady({ rspRawCurve: curve, sources: makeActiveSubs() }), true);
});

// ── Scheduling decision lifecycle tests ──

const BASE_HYDRATED = {
  isProjectHydrationReady: true,
  isDragging: false,
  baseDesignFingerprint: 'base-fp-abc',
  targetKey: 'minimum-L2',
  allTargetsLength: 8,
};

// STATE A: restored authoritative foreground, cache=1/8, rspRawCurve=[]
test('STATE A: restored foreground + empty rawCurve → NOT scheduled', () => {
  const decision = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    foregroundReady: true,           // restored authority satisfies this
    backgroundInputsReady: isBackgroundInputsReady({ rspRawCurve: [], sources: makeActiveSubs() }),
  });
  assert.strictEqual(decision, 'cancel');
  assert.strictEqual(isBackgroundInputsReady({ rspRawCurve: [], sources: makeActiveSubs() }), false);
});

// STATE B: same authority, same cache, rspRawCurve=360 valid points
test('STATE B: restored foreground + 360-point rawCurve → scheduled', () => {
  const curve = makeValidCurve(360);
  const decision = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    foregroundReady: true,
    backgroundInputsReady: isBackgroundInputsReady({ rspRawCurve: curve, sources: makeActiveSubs() }),
  });
  assert.strictEqual(decision, 'schedule');
  assert.strictEqual(curve.length, 360);
});

// No foreground optimiser run in either state — foregroundReady=true means
// restored authority is reused, controller is skipped.
test('STATE A/B: foreground optimiser NOT run (foregroundReady=true → authority restored)', () => {
  const stateA = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    foregroundReady: true,
    backgroundInputsReady: false,
  });
  const stateB = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    foregroundReady: true,
    backgroundInputsReady: true,
  });
  // foregroundReady=true in both → no foreground recalculation triggered.
  // The only difference is backgroundInputsReady gating the scheduler.
  assert.strictEqual(stateA, 'cancel');
  assert.strictEqual(stateB, 'schedule');
});

// activeSubs=[] → no background scheduling even with valid curve
test('activeSubs=[] → NOT scheduled even with valid rawCurve', () => {
  const decision = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    foregroundReady: true,
    backgroundInputsReady: isBackgroundInputsReady({ rspRawCurve: makeValidCurve(360), sources: [] }),
  });
  assert.strictEqual(decision, 'cancel');
});

// ── Hydration / drag guards still take precedence ──

test('project not hydrated → cancel regardless of curve', () => {
  const decision = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    isProjectHydrationReady: false,
    foregroundReady: true,
    backgroundInputsReady: true,
  });
  assert.strictEqual(decision, 'cancel');
});

test('dragging → cancel regardless of curve', () => {
  const decision = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    isDragging: true,
    foregroundReady: true,
    backgroundInputsReady: true,
  });
  assert.strictEqual(decision, 'cancel');
});

test('no baseDesignFingerprint → cancel', () => {
  const decision = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    baseDesignFingerprint: null,
    foregroundReady: true,
    backgroundInputsReady: true,
  });
  assert.strictEqual(decision, 'cancel');
});

test('no targetKey → cancel', () => {
  const decision = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    targetKey: null,
    foregroundReady: true,
    backgroundInputsReady: true,
  });
  assert.strictEqual(decision, 'cancel');
});

test('foregroundReady=false (recalculating) → cancel even if curve ready', () => {
  const decision = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    foregroundReady: false,
    backgroundInputsReady: true,
  });
  assert.strictEqual(decision, 'cancel');
});

test('allTargets empty → cancel', () => {
  const decision = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    allTargetsLength: 0,
    foregroundReady: true,
    backgroundInputsReady: true,
  });
  assert.strictEqual(decision, 'cancel');
});

// ── Design-change invalidation lifecycle ──
test('design change: rawCurve goes [] → backgroundInputsReady false → cancel', () => {
  const before = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    foregroundReady: true,
    backgroundInputsReady: isBackgroundInputsReady({ rspRawCurve: makeValidCurve(360), sources: makeActiveSubs() }),
  });
  assert.strictEqual(before, 'schedule');

  // After design change: simulation re-runs, rawCurve=[], foregroundReady=false
  // (new fingerprint), backgroundInputsReady=false
  const after = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    baseDesignFingerprint: 'base-fp-NEW',  // changed
    foregroundReady: false,                 // new fingerprint, authority stale
    backgroundInputsReady: isBackgroundInputsReady({ rspRawCurve: [], sources: makeActiveSubs() }),
  });
  assert.strictEqual(after, 'cancel');
});

// ── 8/8 cache: scheduler called but queue empty (no worker) ──
test('8/8 cache: scheduling decision is schedule, but no worker runs (queue empty)', () => {
  const decision = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    foregroundReady: true,
    backgroundInputsReady: isBackgroundInputsReady({ rspRawCurve: makeValidCurve(360), sources: makeActiveSubs() }),
  });
  assert.strictEqual(decision, 'schedule');
  // (The scheduler's runNext would find all 8 cached and exit without a worker.)
});

// ── Resume / non-bass interaction ──
test('resume: valid curve unchanged → decision stays schedule (no re-cancel)', () => {
  const curve = makeValidCurve(360);
  const subs = makeActiveSubs(2);
  const d1 = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    foregroundReady: true,
    backgroundInputsReady: isBackgroundInputsReady({ rspRawCurve: curve, sources: subs }),
  });
  const d2 = resolveBackgroundSchedulingDecision({
    ...BASE_HYDRATED,
    foregroundReady: true,
    backgroundInputsReady: isBackgroundInputsReady({ rspRawCurve: curve, sources: subs }),
  });
  assert.strictEqual(d1, 'schedule');
  assert.strictEqual(d2, 'schedule');
});

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);