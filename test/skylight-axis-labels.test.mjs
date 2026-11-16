// skylight-axis-labels.test.mjs
//
// Validates that the skylight Width/Length controls map to the correct plan
// axes after the label correction:
//   - "Width (m)"  → length_m  → X-axis span (left to right, horizontal)
//   - "Length (m)" → width_m   → Y-axis span (front to back, vertical)
//
// A clearly rectangular skylight (wide, shallow) is used so that changing one
// control visibly alters only the corresponding axis of the drawn rectangle.

import assert from 'node:assert';
import { test } from 'node:test';
import { skylightRectM } from '../src/components/room/rv/utils/skylightGeometry.js';

const ROOM = { widthM: 6.0, lengthM: 8.0, heightM: 2.7 };

// A clearly rectangular skylight: 4.0 m wide (X) × 1.0 m deep (Y), centred.
const baseSkylight = {
  type: 'skylight',
  surface: 'ceiling',
  x_m: 3.0,   // centred on room width
  y_m: 4.0,   // centred on room length
  length_m: 4.0,  // X-axis span — shown as "Width (m)"
  width_m: 1.0,   // Y-axis span — shown as "Length (m)"
};

test('base skylight rectangle matches the wide, shallow footprint', () => {
  const r = skylightRectM(baseSkylight, ROOM);
  assert.equal(r.w, 4.0, 'X-axis span (w) is 4.0 m');
  assert.equal(r.h, 1.0, 'Y-axis span (h) is 1.0 m');
  assert.equal(r.x, 1.0, 'left edge at 1.0 m (centre 3.0 - half 2.0)');
  assert.equal(r.y, 3.5, 'front edge at 3.5 m (centre 4.0 - half 0.5)');
});

test('changing Width (length_m) alters only the horizontal X span', () => {
  const wider = { ...baseSkylight, length_m: 5.0 };  // "Width" increased to 5.0
  const r = skylightRectM(wider, ROOM);
  assert.equal(r.w, 5.0, 'X-axis span grew to 5.0');
  assert.equal(r.h, 1.0, 'Y-axis span unchanged at 1.0');
  assert.equal(r.y, 3.5, 'front edge unchanged');
  assert.equal(r.x, 0.5, 'left edge shifted to keep centre at 3.0');
});

test('changing Length (width_m) alters only the front-to-back Y span', () => {
  const deeper = { ...baseSkylight, width_m: 2.0 };  // "Length" increased to 2.0
  const r = skylightRectM(deeper, ROOM);
  assert.equal(r.h, 2.0, 'Y-axis span grew to 2.0');
  assert.equal(r.w, 4.0, 'X-axis span unchanged at 4.0');
  assert.equal(r.x, 1.0, 'left edge unchanged');
  assert.equal(r.y, 3.0, 'front edge shifted to keep centre at 4.0');
});

test('changing Width does not move the centre, only the X footprint', () => {
  const original = skylightRectM(baseSkylight, ROOM);
  const changed = skylightRectM({ ...baseSkylight, length_m: 6.0 }, ROOM);
  assert.equal(
    original.x + original.w / 2,
    changed.x + changed.w / 2,
    'X centre preserved',
  );
  assert.equal(
    original.y + original.h / 2,
    changed.y + changed.h / 2,
    'Y centre preserved',
  );
  assert.equal(changed.w, 6.0, 'only width changed');
  assert.equal(changed.h, 1.0, 'length unchanged');
});

test('changing Length does not move the centre, only the Y footprint', () => {
  const original = skylightRectM(baseSkylight, ROOM);
  const changed = skylightRectM({ ...baseSkylight, width_m: 3.0 }, ROOM);
  assert.equal(
    original.x + original.w / 2,
    changed.x + changed.w / 2,
    'X centre preserved',
  );
  assert.equal(
    original.y + original.h / 2,
    changed.y + changed.h / 2,
    'Y centre preserved',
  );
  assert.equal(changed.w, 4.0, 'width unchanged');
  assert.equal(changed.h, 3.0, 'only length changed');
});

test('existing saved geometry is preserved — no rotation or swap on reopen', () => {
  // Simulates a project that was saved BEFORE the label fix. The stored values
  // (length_m = X span, width_m = Y span) must produce the identical rectangle.
  const saved = {
    type: 'skylight',
    x_m: 2.5,
    y_m: 3.5,
    length_m: 3.0,  // was saved as the X-axis span
    width_m: 1.5,   // was saved as the Y-axis span
  };
  const r = skylightRectM(saved, ROOM);
  // The footprint must be 3.0 m wide (X) × 1.5 m deep (Y) — unchanged.
  assert.equal(r.w, 3.0, 'X span preserved at 3.0');
  assert.equal(r.h, 1.5, 'Y span preserved at 1.5');
  assert.equal(r.x, 1.0, 'left edge at 1.0');
  assert.equal(r.y, 2.75, 'front edge at 2.75');
});