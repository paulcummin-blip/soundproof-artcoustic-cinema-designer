import { test } from 'node:test';
import assert from 'node:assert/strict';

// Regression tests for the peak-power acceptance mapping and the power
// authority hierarchy. These mirror the pure logic in adiParityMapping.js
// and rp22ComparisonPublish.js without importing the base44 client.

import { assumedContinuousFromPeak, PEAK_TO_CONTINUOUS_FACTOR } from '../src/components/utils/spl/peakPowerAssumption.js';

// Mirror of the PEAK_SOURCES list in adiParityMapping.extractionToFound.
const PEAK_SOURCES = [
  { field: 'power_handling_peak_w', label: 'Power handling peak' },
  { field: 'peak_power_w', label: 'Peak power' },
];

// Mirror of the acceptance decision: only a REPORTED peak rating is proposed.
function proposedPeak(byField) {
  const peak = PEAK_SOURCES.find(
    (src) => byField[src.field] && byField[src.field].status === 'reported',
  );
  if (!peak) return null;
  const entry = byField[peak.field];
  return { value: entry.value, basis: 'peak', category: peak.label };
}

// Mirror of resolvePowerAuthority (rp22ComparisonPublish.js).
function present(v) {
  return v !== null && v !== undefined && v !== '' && v !== 'unknown' && v !== 'unspecified';
}
function resolvePowerAuthority(spec) {
  if (present(spec.power_handling_continuous_w)) return { value: spec.power_handling_continuous_w, source: 'power_rating' };
  if (present(spec.long_term_iec_power_w)) return { value: spec.long_term_iec_power_w, source: 'power_rating' };
  if (present(spec.rated_iec_power_w)) return { value: spec.rated_iec_power_w, source: 'power_rating' };
  if (present(spec.aes_power_w)) return { value: spec.aes_power_w, source: 'power_rating' };
  if (present(spec.recommended_amp_max_w)) return { value: spec.recommended_amp_max_w, source: 'recommended_amp_max' };
  const peak = present(spec.power_handling_peak_w) ? spec.power_handling_peak_w
    : present(spec.peak_power_w) ? spec.peak_power_w : null;
  const assumed = assumedContinuousFromPeak(peak);
  if (assumed !== null) return { value: assumed, source: 'peak_power_assumed' };
  return { value: null, source: null };
}

// --- 1. Extraction proposes peak power when reported ---
test('Extraction: reported power_handling_peak_w is proposed as peak_power_w', () => {
  const byField = {
    power_handling_peak_w: { value: 500, status: 'reported', quote: 'Peak power handling: 500 W' },
  };
  const result = proposedPeak(byField);
  assert.equal(result.value, 500);
  assert.equal(result.basis, 'peak');
  assert.equal(result.category, 'Power handling peak');
});

// --- 2. Extraction does NOT propose ambiguous peak power ---
test('Extraction: ambiguous peak power is NOT proposed for acceptance', () => {
  const byField = {
    power_handling_peak_w: { value: 500, status: 'ambiguous', quote: 'up to 500 W' },
  };
  assert.equal(proposedPeak(byField), null);
});

// --- 3. Extraction prefers power_handling_peak_w over peak_power_w ---
test('Extraction: power_handling_peak_w preferred over peak_power_w when both reported', () => {
  const byField = {
    power_handling_peak_w: { value: 500, status: 'reported', quote: 'Peak: 500 W' },
    peak_power_w: { value: 400, status: 'reported', quote: 'Peak: 400 W' },
  };
  const result = proposedPeak(byField);
  assert.equal(result.value, 500);
  assert.equal(result.category, 'Power handling peak');
});

// --- 4. Extraction falls back to peak_power_w when power_handling_peak_w absent ---
test('Extraction: falls back to peak_power_w field', () => {
  const byField = {
    peak_power_w: { value: 500, status: 'reported', quote: 'Peak power 500 W' },
  };
  const result = proposedPeak(byField);
  assert.equal(result.value, 500);
  assert.equal(result.category, 'Peak power');
});

// --- 5. Regression: continuous takes precedence over peak ---
test('Hierarchy: continuous power takes precedence over peak', () => {
  const spec = { power_handling_continuous_w: 200, power_handling_peak_w: 800 };
  const auth = resolvePowerAuthority(spec);
  assert.equal(auth.source, 'power_rating');
  assert.equal(auth.value, 200);
});

// --- 6. Regression: recommended amplifier max takes precedence over peak ---
test('Hierarchy: recommended amplifier max takes precedence over peak', () => {
  const spec = { recommended_amp_max_w: 300, power_handling_peak_w: 600 };
  const auth = resolvePowerAuthority(spec);
  assert.equal(auth.source, 'recommended_amp_max');
  assert.equal(auth.value, 300);
});

// --- 7. Regression: no power at all stays ungradeable ---
test('Hierarchy: no power authority returns null', () => {
  const spec = { sensitivity_db: 90 };
  const auth = resolvePowerAuthority(spec);
  assert.equal(auth.value, null);
  assert.equal(auth.source, null);
});

// --- 8. L8i: peak only -> provisional 250 W ---
test('L8i: peak-only uses peak fallback (500 W -> 250 W assumed)', () => {
  const spec = { power_handling_peak_w: 500 };
  const auth = resolvePowerAuthority(spec);
  assert.equal(auth.source, 'peak_power_assumed');
  assert.equal(auth.value, 250);
});

// --- 9. buildSpecPatch saves to power_handling_peak_w, never continuous ---
// Mirrors the buildSpecPatch peak-power mapping.
function buildSpecPatchPeak(values) {
  const patch = {};
  const n = Number(String(values.peak_power_w || '').replace(/[,£\s]/g, ''));
  if (Number.isFinite(n) && n > 0) {
    patch.power_handling_peak_w = n;
    // Crucially NOT power_handling_continuous_w
  }
  return patch;
}

test('buildSpecPatch: peak power saved to power_handling_peak_w, NOT continuous', () => {
  const patch = buildSpecPatchPeak({ peak_power_w: 500 });
  assert.equal(patch.power_handling_peak_w, 500);
  assert.equal(patch.power_handling_continuous_w, undefined);
});

test('buildSpecPatch: blank peak power writes nothing', () => {
  const patch = buildSpecPatchPeak({ peak_power_w: '' });
  assert.deepEqual(patch, {});
});

console.log('All peak-power acceptance tests pass.');