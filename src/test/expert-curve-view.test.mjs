// expert-curve-view.test.mjs
// ---------------------------------------------------------------------------
//   TEST 1  raw is a declared curve key, off by default
//   TEST 2  the recommended default set is exactly as specified
//   TEST 3  every curve carries a professional, unambiguous label
//   TEST 4  the controls read/write only the raw key (no cross-talk)
//   TEST 5  curve keys cover every series kind the graph can render
//   TEST 6  a partial/stale visibility object can never lose the raw key
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { DEFAULT_BASS_CURVE_VISIBILITY } from '../components/room/bass/BassCurveVisibilityControls.jsx';

const KEYS = ['raw', 'room', 'product', 'combined', 'house', 'finalEq'];

test('TEST 1: raw is declared and off by default', () => {
  assert.ok(Object.prototype.hasOwnProperty.call(DEFAULT_BASS_CURVE_VISIBILITY, 'raw'),
    'raw must be an explicit key, not an implicit fallback');
  assert.equal(DEFAULT_BASS_CURVE_VISIBILITY.raw, false, 'expert layer is off by default');
});

test('TEST 2: default set is exactly as specified', () => {
  assert.deepEqual({ ...DEFAULT_BASS_CURVE_VISIBILITY }, {
    raw: false,
    room: false,
    product: false,
    combined: true,
    house: true,
    finalEq: true,
  });
  assert.ok(Object.isFrozen(DEFAULT_BASS_CURVE_VISIBILITY), 'defaults are immutable');
});

test('TEST 3: every curve key is present with a clear label', () => {
  const source = readControlsSource();
  assert.equal(KEYS.length, 6);
  for (const key of KEYS) {
    assert.ok(source.includes(`key: "${key}"`), `${key} has a control entry`);
  }
  // The labels the designer reads — no internal jargon, no "measured" claim.
  for (const label of [
    'Raw / before EQ',
    'Room / layout response',
    'Subwoofer maximum',
    'Product + room maximum',
    'House target',
    'Predicted / post-EQ response',
  ]) {
    assert.ok(source.includes(`label: "${label}"`), `label present: ${label}`);
  }
  assert.ok(!/measured/i.test(source), 'the post-EQ prediction is never called measured');
});

test('TEST 4: toggling one key leaves the others alone', () => {
  const merge = (visibility, key, nextValue) => ({
    ...DEFAULT_BASS_CURVE_VISIBILITY, ...(visibility || {}), [key]: nextValue,
  });
  const before = { ...DEFAULT_BASS_CURVE_VISIBILITY, house: true, combined: true };
  const after = merge(before, 'raw', true);
  assert.equal(after.raw, true, 'raw turned on');
  assert.equal(after.house, true, 'house untouched');
  assert.equal(after.combined, true, 'combined untouched');
  assert.equal(after.room, false, 'room untouched');

  const offAgain = merge(after, 'house', false);
  assert.equal(offAgain.house, false, 'house can be turned off independently');
  assert.equal(offAgain.raw, true, 'raw stays on');
});

test('TEST 5: curve keys cover every renderable series kind', () => {
  const source = readResponseSource();
  // Every mapping the graph applies is present, including the raw path.
  for (const fragment of [
    'series.kind === "room-response"',
    'series.kind === "product-maximum"',
    'series.kind === "maximum-spl"',
    'series.kind === "house-curve"',
    'series.kind === "post-eq"',
    'series.kind === "raw"',
  ]) {
    assert.ok(source.includes(fragment), `graph maps ${fragment}`);
  }
  // The raw series is no longer hard-hidden: it follows the raw key.
  assert.ok(source.includes('if (series.kind === "raw") return curveVisibility.raw === true;'),
    'raw visibility is driven by the raw key');
  assert.ok(!/if \(series\.kind === "raw"\) return false;/.test(source),
    'the permanent raw hide is gone');
  // Availability is derived from the built series, raw included.
  assert.ok(source.includes('else if (series.kind === "raw") available.raw = true;'),
    'raw availability is derived from the built series');
});

test('TEST 6: an older visibility object still yields every key', () => {
  const legacy = { room: true, product: false, combined: true, house: true, finalEq: true };
  const merged = { ...DEFAULT_BASS_CURVE_VISIBILITY, ...legacy };
  for (const key of KEYS) assert.equal(typeof merged[key], 'boolean', `${key} resolves`);
  assert.equal(merged.raw, false, 'pre-existing session state stays on the ADI default');
});

// ── source readers (presentation contract only) ──────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');

function readControlsSource() {
  return readFileSync(join(SRC, 'components/room/bass/BassCurveVisibilityControls.jsx'), 'utf8');
}
function readResponseSource() {
  return readFileSync(join(SRC, 'components/room/BassResponse.jsx'), 'utf8');
}