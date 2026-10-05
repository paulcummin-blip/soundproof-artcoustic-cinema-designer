/**
 * report-evidence-refresh.test.mjs
 * --------------------------------
 * Acceptance tests for the report-evidence refresh and parity path:
 *
 *   A. opening a legacy Technical Report writes its evidence, and it reads Current
 *   B. regenerating a Technical Report writes its evidence immediately
 *   C. a regenerated Visual Report's evidence states the room and screen the
 *      report itself shows
 *   D. the snapshot, the evidence and the readiness read all name the SAME frozen
 *      authority fingerprint (including a version with no published engineering)
 *   E/F. the Marquee Level 4 and Level 1 versions read Current for both reports
 *
 * The parity checks for room, screen and design fingerprint are strict: a single
 * disagreement blocks, and is never filled from anywhere else.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { buildReportEvidence, readStoredEvidence } from '../src/components/report/reportEvidenceAuthority.js';
import { buildParityRecord, checkReportEvidenceParity } from '../src/components/report/reportEvidenceParity.js';
import {
  REPORT_SNAPSHOT_SCHEMA_VERSION,
  REPORT_SNAPSHOT_STATUS,
  REPORT_SNAPSHOT_TYPE,
  shouldRefreshEvidence,
} from '../src/components/report/reportSnapshotAuthority.js';
import { READINESS_STATE, resolveSavedReportCell } from '../base44/shared/proposalReadinessAuthority.js';

const PROJECT = 'proj-marquee';
const CURRENT = REPORT_SNAPSHOT_STATUS.CURRENT;

/** The source fingerprints of one Marquee version. */
const LEVEL_4_FINGERPRINTS = {
  engineeringFingerprint: 'eng:v1:c19ceb2efb6c3d9c',
  calculationFingerprint: 'cal:v8:c3e14089a2279007',
  seatPriorityFingerprint: 'seat-r1-c1:secondary|seat-r1-c2:primary',
};
/** A version that has never been published: no engineering authority exists. */
const LEVEL_1_FINGERPRINTS = {
  engineeringFingerprint: null,
  calculationFingerprint: 'cal:v8:395d1a338da6c449',
  seatPriorityFingerprint: 'seat-r1-c1:secondary|seat-r1-c2:primary',
};

const PARAMETERS = [
  { parameter_id: 12, title: 'Screen sound pressure level', level: 'L4', value: '108 dBC' },
  { parameter_id: 13, title: 'Non-screen sound pressure level', level: 'L4', value: '105 dBC (OH)' },
  { parameter_id: 14, title: 'Bass capability', level: 'L4', value: '20 Hz' },
  { parameter_id: 18, title: 'Low frequency extension', level: 'L4', value: '19 Hz' },
  { parameter_id: 19, title: 'Reference seat level', level: 'L4', value: '±3 dB' },
  { parameter_id: 20, title: 'Seat-to-seat consistency', level: 'L4', value: '±2 dB' },
];

/**
 * The frozen capture a report saves, in the shape the evidence builder reads:
 * the version's own design state over the project record — the room dimensions
 * and the screen configuration the report itself renders from.
 */
const capture = ({
  reportType = REPORT_SNAPSHOT_TYPE.TECHNICAL,
  fingerprints = LEVEL_4_FINGERPRINTS,
  roomDims = { widthM: 5.18, lengthM: 7.29, heightM: 2.8 },
  screen = {},
} = {}) => ({
  engineeringFingerprint: { ...fingerprints },
  identity: { projectId: PROJECT, versionId: 'v1', engineeringFingerprint: null, generatedAt: '2026-10-01T10:00:00.000Z' },
  project: { project_name: 'Marquee Home', client_name: 'Client', project_reference: 'AC-2026-014', dealer_company: 'Dealer' },
  version: { id: 'v1', name: 'Level 4 version' },
  room: {
    dimensions: { width_m: roomDims.widthM, length_m: roomDims.lengthM, height_m: roomDims.heightM },
    dimensions_text: '7.3m × 5.2m × 2.8m (L × W × H)',
    volume_m3: 105.8,
    classification: { value: 'rectangular room' },
    screen: {
      aspect_ratio: '16:9',
      size_inches: 120,
      diagonal_inches: null,
      computed_width_m: 2.655,
      computed_height_m: 1.494,
      television: false,
      interpretation: '120" 16:9 screen on front wall, baffle wall construction.',
      ...screen,
    },
    rsp: { mode: 'auto_from_screen', x_m: 2.59, y_m: 4.3 },
  },
  seats: [{ id: 'r1c1', row: 1, priority: 'secondary' }, { id: 'r1c2', row: 1, priority: 'primary' }],
  viewing: {
    available: true,
    summary: 'Level 4 viewing',
    primary_floor: 'Level 4',
    per_seat: [{ seatId: 'r1c1', row: 1, label: 'Row 1 seat 1', distance_m: 3.2, horizontal_angle_deg: 0, vertical_angle_deg: 0, level: 'Level 4' }],
  },
  system: {
    configuration: { dolby_config: '9.4.6', text: '9.4.6 Dolby Atmos' },
    channel_layout: { bed_channels: 9, overhead_channels: 6, dolby_subwoofer_channels: 4, total_discrete: 19, subwoofer_count: 4 },
    topology: { placed_speaker_count: 15 },
    products_selected: {
      lcr: ['Q8-5 × 3'],
      surrounds: ['Q8-5 × 6'],
      overheads: ['Q6-5 × 6'],
      subwoofers: ['SUB4-12 × 4 (front)'],
      acoustic_treatment: ['None specified'],
    },
    product_roles: [{ role: 'lcr', role_description: 'LCR', model_label: 'Q8-5' }],
    subwoofer_strategy: { count: 4, models: ['sub4-12'], strategy_text: '4 × SUB4-12' },
    amplification: { specified: true, power_w: 400, text: '400 W' },
  },
  rp22: {
    parameter_headlines: PARAMETERS,
    strengths: [],
    weaknesses: [],
    assumed: {},
    assessment_basis: { p12_mode: 'minimum', p13_mode: 'minimum' },
    categories: null,
  },
  bass: { available: true },
  report_parameters: PARAMETERS,
  reportType,
});

const evidenceOf = (captured) => buildReportEvidence({
  reportType: captured.reportType,
  captured,
  sourceFingerprint: captured.engineeringFingerprint,
});

/** The saved snapshot a report page writes from its own capture. */
const savedFrom = (captured, { legacy = false } = {}) => {
  const evidence = evidenceOf(captured);
  const parity = checkReportEvidenceParity({ evidence, captured, reportType: captured.reportType });
  const payload = { engineeringFingerprint: captured.engineeringFingerprint, presentation: {}, pages: [], proposalSource: captured };
  if (!legacy) {
    payload.reportEvidence = { ...evidence, proposal_ready: parity.passed === true };
    payload.evidence_parity = buildParityRecord(parity);
  }
  return {
    id: 'snap-1',
    report_schema_version: REPORT_SNAPSHOT_SCHEMA_VERSION,
    report_type: captured.reportType,
    status: 'current',
    generated_at: '2026-10-01T10:00:00.000Z',
    generated_by: 'Designer',
    source_fingerprints: { ...captured.engineeringFingerprint },
    payload,
    parity,
  };
};

const cellFor = (saved, fingerprints) => resolveSavedReportCell({
  saved,
  currentFingerprints: fingerprints,
  evidenceState: null,
});

/* ── A. Opening a legacy Technical Report writes its evidence ─────────────── */

test('A. opening a legacy Technical Report writes evidence and reads Current', () => {
  const captured = capture();
  const legacy = savedFrom(captured, { legacy: true });
  assert.equal(readStoredEvidence(legacy), null, 'the legacy report carries no usable evidence');

  // Opening it: the report is CURRENT and carries no evidence, so the evidence
  // is written once, in place.
  assert.equal(shouldRefreshEvidence({
    saved: legacy,
    status: CURRENT,
    hasEvidence: !!readStoredEvidence(legacy),
  }), true);

  const refreshed = savedFrom(captured);
  assert.equal(refreshed.parity.passed, true, 'the evidence states exactly what the report shows');
  assert.ok(readStoredEvidence(refreshed), 'the refreshed report carries evidence');
  assert.equal(cellFor(refreshed, LEVEL_4_FINGERPRINTS).state, READINESS_STATE.CURRENT);
});

/* ── B. Regenerating a Technical Report writes evidence immediately ───────── */

test('B. a regenerated Technical Report writes evidence that reads Current', () => {
  const captured = capture({ reportType: REPORT_SNAPSHOT_TYPE.TECHNICAL });
  const regenerated = savedFrom(captured);
  const evidence = readStoredEvidence(regenerated);

  assert.ok(evidence, 'evidence is written with the report, on the same save');
  assert.equal(evidence.report_type, REPORT_SNAPSHOT_TYPE.TECHNICAL);
  assert.equal(evidence.proposal_ready, true);
  assert.equal(cellFor(regenerated, LEVEL_4_FINGERPRINTS).state, READINESS_STATE.CURRENT);
});

/* ── C. A regenerated Visual Report's evidence states its room and screen ─── */

test('C. a regenerated Visual Report carries the room and screen it shows', () => {
  const captured = capture({ reportType: REPORT_SNAPSHOT_TYPE.VISUAL, fingerprints: LEVEL_4_FINGERPRINTS });
  const regenerated = savedFrom(captured);
  const evidence = readStoredEvidence(regenerated);

  // The room the report states, and the same room in the evidence.
  assert.equal(evidence.room.length_m, captured.room.dimensions.length_m);
  assert.equal(evidence.room.width_m, captured.room.dimensions.width_m);
  assert.equal(evidence.room.height_m, captured.room.dimensions.height_m);
  // The screen the report states, from the same canonical capture before formatting.
  assert.equal(evidence.screen.format, captured.room.screen.aspect_ratio);
  assert.equal(evidence.screen.viewable_width_cm, captured.room.screen.computed_width_m * 100);
  assert.equal(evidence.screen.screen_type, 'Projection screen');
  assert.equal(evidence.proposal_ready, true);
  assert.equal(cellFor(regenerated, LEVEL_4_FINGERPRINTS).state, READINESS_STATE.CURRENT);
});

test('C2. a report whose capture states no room is refused, never filled in', () => {
  const captured = capture({ reportType: REPORT_SNAPSHOT_TYPE.VISUAL });
  captured.room = { ...captured.room, dimensions: null, screen: null };
  const evidence = evidenceOf(captured);
  const parity = checkReportEvidenceParity({ evidence, captured, reportType: REPORT_SNAPSHOT_TYPE.VISUAL });

  assert.equal(parity.passed, false);
  assert.ok(parity.missing.includes('room'), 'the missing room is named');
  assert.ok(parity.missing.includes('screen'), 'the missing screen is named');
});

/* ── D. One frozen authority fingerprint, stated in all three places ────────── */

test('D. the snapshot, the evidence and readiness name the same frozen authority', () => {
  const captured = capture({ fingerprints: LEVEL_4_FINGERPRINTS });
  const saved = savedFrom(captured);
  const evidence = readStoredEvidence(saved);

  assert.equal(evidence.identity.source_fingerprint, LEVEL_4_FINGERPRINTS.engineeringFingerprint);
  assert.equal(saved.source_fingerprints.engineeringFingerprint, LEVEL_4_FINGERPRINTS.engineeringFingerprint);
  assert.equal(captured.engineeringFingerprint.engineeringFingerprint, LEVEL_4_FINGERPRINTS.engineeringFingerprint);
  assert.equal(cellFor(saved, LEVEL_4_FINGERPRINTS).state, READINESS_STATE.CURRENT);
});

test('D2. a version with no published engineering states its calculation fingerprint', () => {
  const captured = capture({ fingerprints: LEVEL_1_FINGERPRINTS });
  const saved = savedFrom(captured);
  const evidence = readStoredEvidence(saved);

  // The report has a frozen authority fingerprint, so its evidence does too.
  assert.equal(evidence.identity.source_fingerprint, LEVEL_1_FINGERPRINTS.calculationFingerprint);
  assert.equal(evidence.identity.engineering_fingerprint, null);
  // The snapshot's own fingerprints are untouched: no publication is invented.
  assert.equal(saved.source_fingerprints.engineeringFingerprint, null);
  // And readiness does not manufacture staleness it cannot read.
  assert.equal(cellFor(saved, LEVEL_1_FINGERPRINTS).state, READINESS_STATE.CURRENT);
});

test('D3. a report must state a fingerprint before any proposal may read it', () => {
  const captured = capture({ fingerprints: { engineeringFingerprint: null, calculationFingerprint: null, seatPriorityFingerprint: null } });
  const evidence = evidenceOf(captured);
  const parity = checkReportEvidenceParity({ evidence, captured, reportType: REPORT_SNAPSHOT_TYPE.TECHNICAL });

  assert.equal(evidence.identity.source_fingerprint, null);
  assert.ok(parity.missing.includes('identity.source_fingerprint'));
  assert.equal(parity.passed, false);
});

/* ── E/F. Marquee Level 4 and Level 1: both reports read Current ───────────── */

test('E. Marquee Level 4 reads Current for the Visual and the Technical Report', () => {
  const visual = savedFrom(capture({ reportType: REPORT_SNAPSHOT_TYPE.VISUAL, fingerprints: LEVEL_4_FINGERPRINTS }));
  const technical = savedFrom(capture({ reportType: REPORT_SNAPSHOT_TYPE.TECHNICAL, fingerprints: LEVEL_4_FINGERPRINTS }));

  assert.equal(cellFor(visual, LEVEL_4_FINGERPRINTS).state, READINESS_STATE.CURRENT);
  assert.equal(cellFor(technical, LEVEL_4_FINGERPRINTS).state, READINESS_STATE.CURRENT);
});

test('F. Marquee Level 1 reads Current for the Visual and the Technical Report', () => {
  const visual = savedFrom(capture({ reportType: REPORT_SNAPSHOT_TYPE.VISUAL, fingerprints: LEVEL_1_FINGERPRINTS }));
  const technical = savedFrom(capture({ reportType: REPORT_SNAPSHOT_TYPE.TECHNICAL, fingerprints: LEVEL_1_FINGERPRINTS }));

  assert.equal(cellFor(visual, LEVEL_1_FINGERPRINTS).state, READINESS_STATE.CURRENT);
  assert.equal(cellFor(technical, LEVEL_1_FINGERPRINTS).state, READINESS_STATE.CURRENT);
});

/* ── Strictness: the new checks block, and never pass a disagreement ───────── */

test('room parity blocks on a disagreement, and is never filled from anywhere else', () => {
  const captured = capture({ reportType: REPORT_SNAPSHOT_TYPE.VISUAL });
  const evidence = evidenceOf(captured);
  evidence.room.width_m = 9.9;
  const parity = checkReportEvidenceParity({ evidence, captured, reportType: REPORT_SNAPSHOT_TYPE.VISUAL });

  assert.equal(parity.passed, false);
  const mismatch = parity.mismatches.find((entry) => entry.area === 'room');
  assert.ok(mismatch, 'the room disagreement is reported');
  assert.equal(mismatch.evidence, 9.9);
  assert.equal(mismatch.report, 5.18);
  assert.equal(mismatch.blocking, true);
});

test('screen parity blocks on a disagreement', () => {
  const captured = capture({ reportType: REPORT_SNAPSHOT_TYPE.VISUAL });
  const evidence = evidenceOf(captured);
  evidence.screen.format = '2.35:1';
  const parity = checkReportEvidenceParity({ evidence, captured, reportType: REPORT_SNAPSHOT_TYPE.VISUAL });

  assert.equal(parity.passed, false);
  assert.ok(parity.mismatches.some((entry) => entry.area === 'screen' && entry.key === 'aspect_ratio'));
});

test('fingerprint parity blocks on a disagreement', () => {
  const captured = capture();
  const evidence = evidenceOf(captured);
  evidence.identity.source_fingerprint = 'eng:v1:deadbeefdeadbeef';
  const parity = checkReportEvidenceParity({ evidence, captured, reportType: REPORT_SNAPSHOT_TYPE.TECHNICAL });

  assert.equal(parity.passed, false);
  assert.equal(parity.mismatches.find((entry) => entry.area === 'identity.source_fingerprint').blocking, true);
});

test('a stale report is never refreshed automatically', () => {
  const captured = capture();
  const saved = savedFrom(captured);

  assert.equal(shouldRefreshEvidence({
    saved,
    status: REPORT_SNAPSHOT_STATUS.STALE,
    hasEvidence: false,
  }), false, 'a report the project has moved past is never re-frozen');
  assert.equal(shouldRefreshEvidence({
    saved,
    status: CURRENT,
    hasEvidence: true,
  }), false, 'a report that already carries evidence is only written again by Regenerate');
});