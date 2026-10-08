// ---------------------------------------------------------------------------
// LCR / equipment identity — stored model key vs selector option
//
// A speaker's stored identity is the canonical product KEY ("q4-3"); a selector
// option is displayed under its product LABEL ("Q4-3"). Binding one to the other
// by string equality made the LCR control read "Select LCR model" while the
// speakers were installed, drawn and calculated.
//
//   TEST 1  A stored KEY resolves to its catalogue option
//   TEST 2  A stored label / legacy role key resolves to the same option
//   TEST 3  An unmapped model resolves to nothing (no invented option)
//   TEST 4  An unresolved model reports notFound and no fabricated sensitivity
//   TEST 5  The SPL engine reports no SPL for an unresolved model, and a real
//           value for a resolved one (live path parity)
//   TEST 6  The LCR control binds through the shared resolver, not label equality
//
// This test asserts identity resolution and the refusal to substitute. It does
// not assert or change RP22/RP23 grading, thresholds or engineering maths.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  resolveModelOption,
  resolveModelOptionKey,
  resolveModelOptionLabel,
} from '@/components/products/modelOptionResolver';
import { resolveSpeakerSplMeta } from '@/components/utils/spl/speakerSplMeta';
import { computeAllSeatSplMetrics } from '@/components/utils/spl/centralSplEngine';

// The shape the catalogue produces: option key (SelectItem value) + display label.
const LCR_OPTIONS = [
  { key: 'q4-3', label: 'Q4-3' },
  { key: 'q6-3', label: 'Q6-3' },
  { key: 'evolve-2-1', label: 'EVOLVE 2-1' },
  { key: 'multi-mono', label: 'Multi (Mono)' },
  { key: 'q4-3_s', label: 'Q4-3 · Surround' },
];

// ── TEST 1 ──────────────────────────────────────────────────────────────────
test('TEST 1 — a stored product KEY resolves to its catalogue option', () => {
  assert.equal(resolveModelOptionKey(LCR_OPTIONS, 'q4-3'), 'q4-3');
  assert.equal(resolveModelOptionLabel(LCR_OPTIONS, 'q4-3'), 'Q4-3');
  assert.equal(resolveModelOptionKey(LCR_OPTIONS, 'evolve-2-1'), 'evolve-2-1');
  assert.equal(resolveModelOptionKey(LCR_OPTIONS, 'multi-mono'), 'multi-mono');
});

// ── TEST 2 ──────────────────────────────────────────────────────────────────
test('TEST 2 — a stored label or legacy role key resolves to the same option', () => {
  // Display label as stored value.
  assert.equal(resolveModelOptionKey(LCR_OPTIONS, 'Q4-3'), 'q4-3');
  // Case / spacing drift.
  assert.equal(resolveModelOptionKey(LCR_OPTIONS, 'q4 3'), 'q4-3');
  assert.equal(resolveModelOptionKey(LCR_OPTIONS, 'Q6-3'), 'q6-3');
  assert.equal(resolveModelOptionKey(LCR_OPTIONS, 'evolve 2-1'), 'evolve-2-1');
  assert.equal(resolveModelOptionKey(LCR_OPTIONS, 'Multi (Mono)'), 'multi-mono');
  // A legacy role-encoded key canonicalises to the same product, so it resolves
  // to the base product's option rather than reading as unassigned.
  assert.equal(resolveModelOptionKey(LCR_OPTIONS, 'q4-3_s'), 'q4-3');
});

// ── TEST 3 ──────────────────────────────────────────────────────────────────
test('TEST 3 — an unmapped model resolves to nothing', () => {
  assert.equal(resolveModelOption(LCR_OPTIONS, 'not-a-real-speaker'), null);
  assert.equal(resolveModelOptionKey(LCR_OPTIONS, 'not-a-real-speaker'), '');
  assert.equal(resolveModelOption(LCR_OPTIONS, ''), null);
  assert.equal(resolveModelOption(LCR_OPTIONS, null), null);
  assert.equal(resolveModelOption([], 'q4-3'), null);
});

// ── TEST 4 ──────────────────────────────────────────────────────────────────
test('TEST 4 — an unresolved model reports notFound and no fabricated sensitivity', () => {
  const unknown = resolveSpeakerSplMeta('not-a-real-speaker');
  assert.equal(unknown.notFound, true, 'unresolved model must declare itself unresolved');
  assert.ok(
    !Number.isFinite(unknown.sensitivity_db_1w_1m),
    'no generic sensitivity may be fabricated for an unresolved model'
  );
  assert.ok(!Number.isFinite(unknown.power_handling_w));
  assert.ok(!Number.isFinite(unknown.max_spl_cont_db_1m_halfspace));

  // A real catalogue model still resolves with its own published figures.
  const known = resolveSpeakerSplMeta('q4-3');
  assert.ok(!known.notFound);
  assert.equal(known.sensitivity_db_1w_1m, 98);
});

// ── TEST 5 ──────────────────────────────────────────────────────────────────
const seatInputs = (model) => ({
  seats: [{ id: 's1', x: 0, y: 3.5, z: 1.2 }],
  placedSpeakers: [{ id: 'spk-fc', role: 'FC', model, position: { x: 0, y: 0.2, z: 1.2 } }],
  getCanonicalRole: (r) => String(r || '').toUpperCase(),
  getEffectiveSplInputs: () => ({ powerW: 100, eqHeadroomDb: 0 }),
  getModelDimsM: (m) => resolveSpeakerSplMeta(m),
  screenLoss_dB: 0,
  eqHeadroom_dB: 0,
  mlpPoint: { x: 0, y: 3.5, z: 1.2 },
  heightM: 2.4,
  widthM: 5,
  lengthM: 6,
});

test('TEST 5 — resolved model reports SPL; unresolved model reports none', () => {
  const known = computeAllSeatSplMetrics(seatInputs('q4-3'));
  const knownEntry = known.get('mlp')?.spl?.screen?.FC;
  assert.ok(knownEntry, 'a resolvable model must still report its SPL');
  assert.ok(Number.isFinite(knownEntry.value), 'the reported SPL must be a real number');

  const unknown = computeAllSeatSplMetrics(seatInputs('not-a-real-speaker'));
  assert.ok(
    !(unknown.get('mlp')?.spl?.screen?.FC),
    'an unresolved model must report no SPL rather than a substituted figure'
  );
});

// ── TEST 6 ──────────────────────────────────────────────────────────────────
test('TEST 6 — the LCR control resolves identity through the shared resolver', () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/room/LCRPanel.jsx'),
    'utf8'
  );
  assert.ok(
    /from '@\/components\/products\/modelOptionResolver'/.test(src),
    'LCRPanel must use the shared model option resolver'
  );
  assert.ok(
    src.includes('resolveModelOption(standardLcrOptions, model)'),
    'the installed model must be resolved against the catalogue options'
  );
  assert.ok(
    src.includes('resolveModelOption(soundbarOptions, fcModel)'),
    'the installed soundbar must be resolved against the catalogue options'
  );
  assert.ok(
    !/if \(m && standardLcrOptions\.some\(opt => opt\.label === m\)\)/.test(src),
    'the previous label-equality identity match must be gone'
  );
});