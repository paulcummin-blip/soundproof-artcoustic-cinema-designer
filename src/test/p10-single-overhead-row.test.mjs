import { test, expect } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSeatSplMetrics } from '../components/utils/spl/centralSplEngine';
import { computeP10RspNormalisedSpread } from '../components/utils/rp22/p10RspNormalisation';
import {
  hasOverheadLayer,
  buildOverheadNotApplicableMetric,
  buildSingleOverheadRowNotApplicableMetric,
  countDistinctOverheadRows,
  SINGLE_OVERHEAD_ROW_REASON,
} from '../components/utils/rp22/overheadLayerAuthority';
import { buildDesignRatingInput } from '../components/report/technical/buildDesignRatingInput';
import { buildArtcousticDesignRatingAuthority } from '../components/report/technical/artcousticSystemDesignRating';
import { summariseEngineeringResults } from '../components/engineering/engineeringSummaryAuthority';
import { assessEngineeringReportCompleteness } from '../../shared/assessmentTerminal';
import { buildAtomicParameterIndex } from '../../shared/engineeringPublicationContract';

globalThis.window = {
  location: { href: 'http://localhost/', search: '', pathname: '/', hash: '', origin: 'http://localhost' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  history: { replaceState: () => {} }, addEventListener: () => {}, removeEventListener: () => {},
};
globalThis.document = { title: '' };
const { buildSeatHudSnapshot } = await import('../components/utils/buildSeatHudSnapshot.jsx');

// Execute the actual P10 engine section with its production helpers, isolated
// from the hook's unrelated bass and UI effects.
const engine = readFileSync(new URL('../components/hooks/useRP22AnalysisEngine.jsx', import.meta.url), 'utf8');
const p10Section = engine.slice(
  engine.indexOf('// P10 – Maximum SPL difference'),
  engine.indexOf('// P16 – LCR horizontal off-axis HF loss'),
);
assert.ok(p10Section.length > 100);
const evaluate = new Function(
  'seat', 'speakers', 'seatSplMetrics', 'getSeatSplMetrics', 'computeP10RspNormalisedSpread',
  'primarySeats', 'overheadLayerPresent', 'distinctOverheadRowCount',
  'buildOverheadNotApplicableMetric', 'buildSingleOverheadRowNotApplicableMetric',
  `
  const metrics = { p10: null };
  const _diag = { p10: { seats: {}, level: null } };
  const seatId = seat.id;
  ${p10Section}
  return metrics.p10;
`,
);

const seats = [{ id: 's1', x: 2, y: 3, z: 1.2, priority: 'primary', isPrimary: true }];
const pair = (prefix, y) => ['L', 'R'].map((side, i) => ({
  id: prefix + side, role: prefix + side, model: 'Evolve 3-1', enabled: true,
  position: { x: i ? 3 : 1, y, z: 2.8 },
}));
const bed = ['FL', 'FR', 'FC', 'SL', 'SR'].map((role) => ({
  id: role, role, model: 'Evolve 3-1', enabled: true, position: { x: 2, y: 0.5, z: 1.2 },
}));

// Configurations under test
const configNoOverhead = [...bed];                                            // 5.1.0
const configOneRow = [...bed, ...pair('TM', 2)];                              // 5.1.2 (TML/TMR)
const configTwoRows = [...bed, ...pair('TF', 2), ...pair('TR', 4)];           // 5.1.4 (TFL/TFR + TRL/TRR)
const configThreeRows = [...bed, ...pair('TF', 2), ...pair('TM', 3), ...pair('TR', 4)]; // 5.1.6

function metricFor(speakers, seatSplMetrics = null) {
  return evaluate(
    seats[0], speakers, seatSplMetrics, getSeatSplMetrics, computeP10RspNormalisedSpread,
    seats, hasOverheadLayer(speakers), countDistinctOverheadRows(speakers),
    buildOverheadNotApplicableMetric, buildSingleOverheadRowNotApplicableMetric,
  );
}

function pipeline(speakers, seatSplMetrics = null) {
  const metric = metricFor(speakers, seatSplMetrics);
  const analysisResult = { perSeatRp22: { s1: { rp22: { 10: metric } } } };
  const snapshot = buildSeatHudSnapshot({
    seat: seats[0], placedSpeakers: speakers, widthM: 4, lengthM: 6, heightM: 2.8,
    screenFrontPlaneM: 0, mlp: seats[0], analysisResult, seatingPositions: seats,
  });
  const input = buildDesignRatingInput({ seats, analysisResult, reportSeatHudById: { s1: snapshot }, placedSpeakers: speakers });
  const authority = buildArtcousticDesignRatingAuthority(input);
  const summary = summariseEngineeringResults({ designRatingAuthority: authority, seats, seatHudById: { s1: snapshot }, perSeatRp23: {} });
  const publication = { engineering_fingerprint: 'eng:test', published_at: '2026-11-15T00:00:00Z', engineering_summary: summary };
  publication.parameter_index = buildAtomicParameterIndex(publication);
  return { metric, snapshot, input, authority, summary, publication };
}

// A seatSplMetrics Map whose seat and RSP carry four finite upper-channel SPLs.
function splMapWithUppers(values) {
  const uppers = {};
  for (const [role, val] of Object.entries(values)) uppers[role] = { value: val };
  const spl = { uppers };
  return new Map([['s1', { spl }], ['mlp', { spl }]]);
}

// ── countDistinctOverheadRows ───────────────────────────────────────────
test('countDistinctOverheadRows uses actual installed overhead geometry, not nominal channel count', () => {
  assert.equal(countDistinctOverheadRows(configNoOverhead), 0);
  assert.equal(countDistinctOverheadRows(configOneRow), 1);
  assert.equal(countDistinctOverheadRows(configTwoRows), 2);
  assert.equal(countDistinctOverheadRows(configThreeRows), 3);
  // Disabled / model-less overheads do not count.
  const disabled = [...bed, { id: 'TML', role: 'TML', enabled: false, model: 'Evolve 3-1', position: { x: 1, y: 2, z: 2.8 } }];
  assert.equal(countDistinctOverheadRows(disabled), 0);
});

// ── 5.1.0 (no overheads) ─────────────────────────────────────────────────
test('5.1.0 — no overheads: P10 is terminal N/A (no overhead layer)', () => {
  const result = pipeline(configNoOverhead);
  assert.equal(result.metric.level, 'N/A');
  assert.equal(result.metric.status, 'not_applicable');
  assert.equal(result.metric.formatted, 'N/A');
  assert.equal(result.authority.parameters.p10.state, 'na');
  assert.equal(assessEngineeringReportCompleteness(result.summary).missingParameterKeys.includes('p10'), false);
  assert.equal(assessEngineeringReportCompleteness(result.summary).incompleteSeatParameterKeys.includes('p10'), false);
});

// ── 5.1.2 (one overhead row) ─────────────────────────────────────────────
test('5.1.2 — one overhead row (TML/TMR): P10 is terminal N/A, not "insufficient data"', () => {
  const result = pipeline(configOneRow);
  assert.equal(result.metric.level, 'N/A');
  assert.equal(result.metric.status, 'not_applicable');
  assert.equal(result.metric.applicable, false);
  assert.equal(result.metric.note, SINGLE_OVERHEAD_ROW_REASON);
  // Display shows only "N/A" — no explanatory text in the formatted string.
  assert.equal(result.metric.formatted, 'N/A');
  assert.ok(!result.metric.formatted.toLowerCase().includes('insufficient'));
  assert.equal(result.snapshot.rp22.p10.level, 'N/A');
  assert.equal(result.snapshot.rp22.p10.formatted, 'N/A');
  assert.equal(result.input.p10.s1, 'na');
  assert.equal(result.authority.parameters.p10.state, 'na');
  assert.equal(assessEngineeringReportCompleteness(result.summary).missingParameterKeys.includes('p10'), false);
  assert.equal(assessEngineeringReportCompleteness(result.summary).incompleteSeatParameterKeys.includes('p10'), false);
  assert.equal(result.publication.parameter_index.P10.level, 'N/A');
});

// ── 5.1.4 (two rows) — insufficient-data when SPL unavailable ────────────
test('5.1.4 — two rows but no SPL: P10 is insufficient-data (provisional), retained as a failure', () => {
  const result = pipeline(configTwoRows, null);
  assert.equal(result.metric.level, '—');
  // Display reads "N/A" — the "(insufficient data)" wording is gone from the UI/PDF.
  assert.equal(result.metric.formatted, 'N/A');
  assert.ok(!result.metric.formatted.toLowerCase().includes('insufficient'));
  assert.equal(result.input.p10.s1, null);
  assert.equal(result.authority.parameters.p10.state, 'provisional');
  // Retained as an unresolved failure — the export gate rejects it.
  assert.equal(assessEngineeringReportCompleteness(result.summary).missingParameterKeys.includes('p10'), true);
});

// ── 5.1.4 (two rows) — scored when SPL available ─────────────────────────
test('5.1.4 — two rows with SPL: P10 calculates and is terminal scored', () => {
  const seatUppers = { TFL: 90, TFR: 92, TRL: 88, TRR: 89 };
  const rspUppers = { TFL: 90, TFR: 90, TRL: 90, TRR: 90 };
  const map = new Map([
    ['s1', { spl: { uppers: Object.fromEntries(Object.entries(seatUppers).map(([k, v]) => [k, { value: v }])) } }],
    ['mlp', { spl: { uppers: Object.fromEntries(Object.entries(rspUppers).map(([k, v]) => [k, { value: v }])) } }],
  ]);
  const result = pipeline(configTwoRows, map);
  assert.equal(typeof result.metric.value, 'number');
  assert.equal(result.metric.level, 3); // spread = 2 - (-2) = 4 dB → L3
  assert.equal(result.authority.parameters.p10.state, 'scored');
  assert.equal(assessEngineeringReportCompleteness(result.summary).missingParameterKeys.includes('p10'), false);
});

// ── 5.1.6 (three rows) ───────────────────────────────────────────────────
test('5.1.6 — three rows: counts as 2+ rows; insufficient-data without SPL, scored with SPL', () => {
  assert.equal(countDistinctOverheadRows(configThreeRows), 3);
  const noSpl = pipeline(configThreeRows, null);
  assert.equal(noSpl.metric.level, '—');
  assert.equal(noSpl.authority.parameters.p10.state, 'provisional');
  assert.equal(assessEngineeringReportCompleteness(noSpl.summary).missingParameterKeys.includes('p10'), true);

  const seatUppers = { TFL: 90, TFR: 91, TML: 89, TMR: 90, TRL: 88, TRR: 89 };
  const rspUppers = { TFL: 90, TFR: 90, TML: 90, TMR: 90, TRL: 90, TRR: 90 };
  const map = new Map([
    ['s1', { spl: { uppers: Object.fromEntries(Object.entries(seatUppers).map(([k, v]) => [k, { value: v }])) } }],
    ['mlp', { spl: { uppers: Object.fromEntries(Object.entries(rspUppers).map(([k, v]) => [k, { value: v }])) } }],
  ]);
  const withSpl = pipeline(configThreeRows, map);
  assert.equal(typeof withSpl.metric.value, 'number');
  assert.equal(withSpl.authority.parameters.p10.state, 'scored');
  assert.equal(assessEngineeringReportCompleteness(withSpl.summary).missingParameterKeys.includes('p10'), false);
});

// ── HUD fallback when the engine has not published P10 ───────────────────
test('HUD fallback: single row shows N/A (with internal note), two rows shows not-calculated', () => {
  const singleRowSnapshot = buildSeatHudSnapshot({
    seat: seats[0], placedSpeakers: configOneRow, widthM: 4, lengthM: 6, heightM: 2.8,
    screenFrontPlaneM: 0, mlp: seats[0], analysisResult: { perSeatRp22: { s1: { rp22: {} } } }, seatingPositions: seats,
  });
  assert.equal(singleRowSnapshot.rp22.p10.formatted, 'N/A');
  assert.equal(singleRowSnapshot.rp22.p10.level, 'N/A');
  assert.equal(singleRowSnapshot.rp22.p10.status, 'not_applicable');
  assert.equal(singleRowSnapshot.rp22.p10.note, SINGLE_OVERHEAD_ROW_REASON);

  const twoRowSnapshot = buildSeatHudSnapshot({
    seat: seats[0], placedSpeakers: configTwoRows, widthM: 4, lengthM: 6, heightM: 2.8,
    screenFrontPlaneM: 0, mlp: seats[0], analysisResult: { perSeatRp22: { s1: { rp22: {} } } }, seatingPositions: seats,
  });
  assert.notEqual(twoRowSnapshot.rp22.p10.status, 'not_applicable');
  assert.notEqual(twoRowSnapshot.rp22.p10.level, 'N/A');
});

// ── Saved publication round-trip keeps the terminal N/A ──────────────────
test('5.1.2 — terminal N/A survives save and restore', () => {
  const result = pipeline(configOneRow);
  const dir = mkdtempSync(join(tmpdir(), 'p10-save-'));
  try {
    const file = join(dir, 'saved-publication.json');
    writeFileSync(file, JSON.stringify(result.publication));
    const restored = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(buildAtomicParameterIndex(restored).P10, restored.parameter_index.P10);
    assert.equal(restored.engineering_summary.parameterAuthority.p10.state, 'na');
    assert.equal(assessEngineeringReportCompleteness(restored.engineering_summary).missingParameterKeys.includes('p10'), false);
    assert.equal(assessEngineeringReportCompleteness(restored.engineering_summary).incompleteSeatParameterKeys.includes('p10'), false);
  } finally { rmSync(dir, { recursive: true }); }
});

test('P10 N/A does not excuse another incomplete parameter', () => {
  const { summary } = pipeline(configOneRow);
  const complete = { parameterAuthority: { p10: summary.parameterAuthority.p10 }, project: { seatIds: ['s1'] } };
  for (let n = 1; n <= 21; n++) {
    if (n !== 10) complete.parameterAuthority[`p${n}`] = { state: 'scored', scope: 'room', level: 'L3' };
  }
  assert.equal(assessEngineeringReportCompleteness(complete).complete, true);
  complete.parameterAuthority.p4 = { state: 'provisional', scope: 'room', level: null };
  assert.equal(assessEngineeringReportCompleteness(complete).complete, false);
});

// keep vitest's default test discovery happy
test('suite sanity', () => { expect(true).toBe(true); });