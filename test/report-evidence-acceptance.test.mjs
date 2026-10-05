/**
 * reportEvidence — the acceptance contract for every report-derived proposal
 * fact.
 *
 *   the human report   → for people
 *   reportEvidence     → for Proposal Centre   ← the only source of report facts
 *
 * The contract these tests hold the code to:
 *   1  a newly generated report writes its reportEvidence snapshot
 *   2  a parity failure blocks proposal readiness
 *   3  a parity failure shows the report as Incomplete for proposal use
 *   4  legacy evidence is recovered from the report's OWN frozen source only
 *   5  a legacy report with no frozen source fails closed
 *   6  a proposal reads reportEvidence, never the report's frozen source values
 *   7  there is no live-project fallback anywhere on the read path
 *   8  one version's evidence never leaks into another
 *   9  P13 parity is exact against the Technical Report's own authority
 *   10 Products Selected parity is exact, and layer order is not a difference
 *   11 a design that moved on is blocked; an unreadable fingerprint is not
 *   12 a proposal stores the evidence it was generated from, per version
 *
 * Read-only: pure functions, source text and a fake entity layer. No entity is
 * written, and no test may delete or mutate a real record.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProposalReportEvidence } from '../base44/shared/proposalReportEvidenceReader.js';
import {
  READINESS_STATE,
  resolveSavedReportCell,
} from '../base44/shared/proposalReadinessAuthority.js';
import { buildReportEvidence, validateReportEvidence } from '../src/components/report/reportEvidenceAuthority.js';
import { buildParityRecord, checkReportEvidenceParity } from '../src/components/report/reportEvidenceParity.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const HOOK = read('src/components/report/useReportSnapshot.js');
const CAPTURE = read('src/components/report/captureReportProposalSource.js');
const READER = read('base44/shared/proposalReportEvidenceReader.js');
const PROPOSAL_FUNCTION = read('base44/functions/generateProposal/entry.ts');

const PROJECT = 'p1';
const PARAM_IDS = [12, 13, 14, 18, 19, 20];
const FINGERPRINT = 'eng:v1:aaa';

/* ── The report's own frozen capture ──────────────────────────────────────
   The same authority the human report is generated from: the RP22 parameter
   verdicts, the products selected, the room, screen and viewing geometry. */

const HEADLINES = (p13 = { level: 'L4', value: '108 dBC (OH)' }) => PARAM_IDS.map((id) => ({
  parameter_id: id,
  title: `P${id}`,
  category: 'RP22',
  achieved_level: id === 13 ? p13.level : 'L3',
  formatted_value: id === 13 ? p13.value : `P${id} value`,
}));

const capture = ({
  versionId = 'v4',
  lcr = ['Q8-5 × 3'],
  p13 = { level: 'L4', value: '108 dBC (OH)' },
  authorityP13 = p13,
} = {}) => ({
  report_source_version: 1,
  identity: { projectId: PROJECT, versionId, generatedAt: '2026-10-05T10:00:00.000Z' },
  project: { project_name: 'Marquee Home', client_name: 'Mr C', project_reference: 'AC-2026-014', dealer_company: 'Sound Proof' },
  version: { name: 'Level 4 version' },
  dealer: { company_name: 'Sound Proof' },
  room: {
    dimensions: { length_m: 6, width_m: 4.5, height_m: 2.4 },
    volume_m3: 64.8,
    screen: {
      aspect_ratio: '16:9', computed_width_m: 2.655, computed_height_m: 1.494, diagonal_inches: 120, television: false,
    },
    rsp: { mode: 'middle_row_center', x_m: 2.25, y_m: 3.2 },
  },
  seats: [{ id: 'r1c1', row: 1, priority: 'primary' }, { id: 'r1c2', row: 1, priority: 'secondary' }],
  viewing: {
    available: true,
    per_seat: [{
      seatId: 'r1c1', row: 1, label: 'Row 1 seat 1',
      distance_m: 3.2, horizontal_angle_deg: 0, vertical_angle_deg: 0, level: 'Level 4',
    }],
  },
  system: {
    products_selected: { rows: [{ key: 'lcr', area: 'LCR', value: lcr[0] }], lcr },
    configuration: { dolby_config: '9.4.6', text: '9.4.6' },
    channel_layout: {
      bed_channels: 9, overhead_channels: 6, dolby_subwoofer_channels: 4, total_discrete: 19, subwoofer_count: 4,
    },
  },
  rp22: { parameter_headlines: HEADLINES(authorityP13) },
  report_parameters: PARAM_IDS.map((id) => ({
    parameter_id: id,
    level: id === 13 ? p13.level : 'L3',
    value: id === 13 ? p13.value : `P${id} value`,
  })),
  bass: { available: true, p14: { text: 'L3 · 30 Hz' }, p18: { text: 'L3 · 25 Hz' }, p19: { text: 'L3 · ±3 dB' }, p20: { text: 'L3 · ±4 dB' } },
});

const buildEvidence = (captured, reportType = 'technical') => buildReportEvidence({
  reportType,
  captured,
  sourceFingerprint: { engineeringFingerprint: FINGERPRINT, calculationFingerprint: 'bass:v1:abc', seatPriorityFingerprint: 'seat:v1:def' },
});

/* ── Stored snapshots, and the reader that gates on them ────────────────── */

/** The evidence a saved report carries. */
const EVIDENCE = ({
  versionId = 'v4',
  fingerprint = FINGERPRINT,
  ready = true,
  p13 = { level: 'L4', value: '108 dBC (OH)' },
  model = 'Q8-5',
  quantity = 3,
  reportType = 'technical',
} = {}) => {
  const parameters = PARAM_IDS.map((id) => {
    const level = id === 13 ? p13.level : 'L3';
    const value = id === 13 ? p13.value : `P${id} value`;
    return {
      key: `P${id}`,
      parameter_id: id,
      title: `P${id}`,
      area: 'RP22',
      level,
      value,
      text: `${level} · ${value}`,
      unit: null,
      context: null,
      source: 'technical_report',
    };
  });
  const layer = [{ role: 'LCR', model, quantity, position: null }];
  return {
    evidence_version: 1,
    report_type: reportType,
    identity: {
      project_id: PROJECT,
      version_id: versionId,
      report_type: reportType,
      source_fingerprint: fingerprint,
      generated_at: '2026-10-05T10:00:00.000Z',
    },
    room: { length_m: 6, width_m: 4.5, height_m: 2.4 },
    screen: { screen_type: 'Projection screen', format: '16:9', viewable_width_cm: 265.5 },
    seating: {
      row_count: 1,
      per_seat: [{
        row: 1, seat_id: 'r1c1', seat_label: 'Row 1 seat 1',
        distance_m: 3.2, horizontal_angle_deg: 0, vertical_angle_deg: 0, rp23_level: 'Level 4',
      }],
    },
    system: { products_selected: layer, products_selected_by_layer: { lcr: layer } },
    parameters,
    parameter_index: Object.fromEntries(parameters.map((row) => [row.key, row])),
    bass: { current: false },
    proposal_ready: ready,
    evidence_fingerprint: `re1-${versionId}-${reportType}-${fingerprint}`,
  };
};

/** A report's own frozen source, which may state DIFFERENT values than the evidence. */
const FROZEN = ({ versionId = 'v4', p13 = 'L3 · 99 dBC (OH)', lcr = 'DFC-2 × 1' } = {}) => ({
  report_source_version: 1,
  identity: { projectId: PROJECT, versionId },
  room: { dimensions: { length_m: 6, width_m: 4.5, height_m: 2.4 } },
  seats: [{ id: 'r1c1', row: 1, priority: 'primary' }],
  viewing: { available: true, per_seat: [{ seatId: 'r1c1', row: 1, distance_m: 3.2, horizontal_angle_deg: 0 }] },
  system: { products_selected: { rows: [{ key: 'lcr', area: 'LCR', value: lcr }], lcr: [lcr] } },
  rp22: { parameter_headlines: [] },
  report_parameters: PARAM_IDS.map((id) => ({
    parameter_id: id,
    level: 'L3',
    value: id === 13 ? '99 dBC (OH)' : `P${id} value`,
    text: id === 13 ? p13 : `L3 · P${id} value`,
  })),
});

const row = ({
  type, versionId = 'v4', evidence = null, frozen = null, status = 'current', fingerprint = FINGERPRINT,
}) => ({
  id: `${versionId}-${type}`,
  project_id: PROJECT,
  version_id: versionId,
  report_type: type,
  report_schema_version: 1,
  status,
  generated_at: '2026-10-05T10:00:00.000Z',
  source_fingerprints: { engineeringFingerprint: fingerprint },
  payload: {
    pages: [],
    ...(frozen ? { proposalSource: frozen } : {}),
    ...(evidence ? { reportEvidence: evidence } : {}),
  },
});

/** A technical + visual pair for one version. */
const pair = ({
  versionId = 'v4',
  fingerprint = FINGERPRINT,
  technical = {},
  visual = {},
  technicalEvidence,
  visualEvidence,
  technicalFrozen,
  visualFrozen,
  technicalStatus = 'current',
} = {}) => [
  row({
    type: 'technical',
    versionId,
    fingerprint,
    status: technicalStatus,
    evidence: technicalEvidence === undefined ? EVIDENCE({ versionId, fingerprint, reportType: 'technical', ...technical }) : technicalEvidence,
    frozen: technicalFrozen === undefined ? FROZEN({ versionId }) : technicalFrozen,
  }),
  row({
    type: 'visual',
    versionId,
    fingerprint,
    evidence: visualEvidence === undefined ? EVIDENCE({ versionId, fingerprint, reportType: 'visual' }) : visualEvidence,
    frozen: visualFrozen === undefined ? FROZEN({ versionId }) : visualFrozen,
  }),
];

const VERSION = (id = 'v4', published = FINGERPRINT) => ({
  id,
  version_number: id === 'v4' ? 4 : 1,
  version_name: `Level ${id === 'v4' ? 4 : 1} version`,
  published_fingerprint: published,
});

const fakeEntities = (rows) => ({
  ReportSnapshot: { filter: async (query) => ({ items: rows.filter((item) => item.version_id === query.version_id) }) },
});

const gate = async (rows, versions) => {
  try {
    const entries = await readProposalReportEvidence(fakeEntities(rows), PROJECT, versions);
    return { decision: 'ALLOWED', entries };
  } catch (error) {
    return { decision: 'BLOCKED', detail: error.message };
  }
};

/* ── 1. A new report writes its evidence snapshot ───────────────────────── */

test('1. a newly generated report writes a complete reportEvidence snapshot', () => {
  const evidence = buildEvidence(capture());

  assert.equal(evidence.evidence_version, 1);
  assert.equal(validateReportEvidence(evidence, 'technical').complete, true, 'the evidence states every fact a proposal needs');
  assert.equal(evidence.parameter_index.P13.text, 'L4 · 108 dBC (OH)', 'P13 is stated as the report prints it');
  assert.deepEqual(evidence.system.products_selected_by_layer.lcr, [{ role: 'LCR', model: 'Q8-5', quantity: 3, position: null }]);
  assert.equal(evidence.room.width_m, 4.5);
  assert.match(String(evidence.evidence_fingerprint), /^re1-/, 'the evidence carries its own content fingerprint');

  // Written into the SAME snapshot payload as the report, with its parity outcome.
  assert.match(CAPTURE, /captured\.reportEvidence = buildReportEvidence\(/);
  assert.match(HOOK, /reportEvidence: evidence,/);
  assert.match(HOOK, /evidence_parity: buildParityRecord\(parity\)/);
});

/* ── 2 + 3. A parity failure blocks the proposal, never the report ───────── */

test('2. a parity failure blocks proposal readiness', async () => {
  // The report's own RP22 authority states P13 at L3, while the row it prints
  // says L4. The report is still generated and saved; its evidence is stored
  // with proposal_ready = false.
  const conflicting = capture({ authorityP13: { level: 'L3', value: '108 dBC (OH)' } });
  const evidence = buildEvidence(conflicting);
  const parity = checkReportEvidenceParity({ evidence, captured: conflicting, reportType: 'technical' });

  assert.equal(parity.passed, false, 'a report may never state a figure its own authority did not state');
  assert.ok(parity.blocking.some((entry) => entry.key === 'P13'), 'the disagreement is named, by parameter');
  assert.equal(buildParityRecord(parity).proposal_ready, false, 'the stored outcome is proposal_ready = false');

  const stored = { ...evidence, proposal_ready: false };
  const result = await gate(pair({ technicalEvidence: stored }), [VERSION('v4')]);
  assert.equal(result.decision, 'BLOCKED');
  assert.match(result.detail, /incomplete Technical Report evidence/);
  assert.match(result.detail, /Regenerate the Technical Report for this version/);
});

test('3. a parity failure shows the report as Incomplete for proposal use, never Missing', () => {
  const evidence = { ...buildEvidence(capture()), proposal_ready: false };
  const saved = {
    report_schema_version: 1,
    status: 'current',
    generated_at: '2026-10-05T10:00:00.000Z',
    source_fingerprints: { engineeringFingerprint: FINGERPRINT },
    payload: { pages: [], reportEvidence: evidence, evidence_parity: { proposal_ready: false, mismatch_count: 1 } },
  };

  const cell = resolveSavedReportCell({ saved, currentFingerprints: { engineeringFingerprint: FINGERPRINT } });
  assert.equal(cell.state, READINESS_STATE.INCOMPLETE);
  assert.equal(cell.status, 'Incomplete');
  assert.notEqual(cell.status, 'Missing');
  assert.equal(cell.current, false);
  assert.match(cell.reason, /evidence does not match what the report shows/);
});

/* ── 4 + 5. Legacy evidence: recovered from the frozen source, or refused ── */

test('4. legacy evidence is recovered from the report OWN frozen source only', () => {
  const stored = capture();
  const recovered = buildEvidence(stored);

  assert.equal(validateReportEvidence(recovered, 'technical').complete, true, 'the frozen source is enough to rebuild the evidence');
  assert.equal(
    checkReportEvidenceParity({ evidence: recovered, captured: stored, reportType: 'technical' }).passed,
    true,
    'the recovered evidence agrees with the report it came from',
  );

  const saved = {
    report_schema_version: 1,
    status: 'current',
    generated_at: '2026-10-05T10:00:00.000Z',
    source_fingerprints: { engineeringFingerprint: FINGERPRINT },
    payload: { pages: [], proposalSource: stored, reportEvidence: recovered },
  };
  assert.equal(
    resolveSavedReportCell({ saved, currentFingerprints: { engineeringFingerprint: FINGERPRINT } }).state,
    READINESS_STATE.CURRENT,
    'a recovered report reads Current again',
  );

  // The recovery reads the SAVED report's own frozen source. It never reads the
  // live project, so a report opened after the design moved on cannot have its
  // evidence rebuilt from the current design.
  const backfill = HOOK.slice(HOOK.indexOf('Legacy path: recover'));
  assert.match(backfill, /const stored = saved\.payload\?\.proposalSource;/);
  assert.match(backfill, /captured: stored,/);
  assert.doesNotMatch(backfill, /reportSource/, 'the recovery never reads the live project source');
});

test('5. a legacy report with no frozen source fails closed', async () => {
  const legacyTechnical = row({ type: 'technical', evidence: null, frozen: null });
  const result = await gate(
    [legacyTechnical, ...pair({ versionId: 'v4' }).filter((item) => item.report_type === 'visual')],
    [VERSION('v4')],
  );

  assert.equal(result.decision, 'BLOCKED');
  assert.match(result.detail, /Technical Report is current, but it needs a one-time evidence refresh/);
  assert.match(result.detail, /carries no stored frozen source, so regenerate the Technical Report/);
  assert.doesNotMatch(result.detail, /missing Technical Report/);
});

/* ── 6 + 7. What the proposal reads, and what it can never read ─────────── */

test('6. a proposal reads reportEvidence, never the report own frozen values', async () => {
  // The frozen source and the evidence deliberately disagree. What is returned
  // must be the evidence.
  const result = await gate(pair({
    technicalFrozen: FROZEN({ p13: 'L3 · 99 dBC (OH)', lcr: 'DFC-2 × 1' }),
  }), [VERSION('v4')]);

  assert.equal(result.decision, 'ALLOWED');
  const [entry] = result.entries;
  assert.equal(
    entry.snapshot.report_parameters.find((item) => item.parameter_id === 13).text,
    'L4 · 108 dBC (OH)',
    'P13 is the evidence value, not the frozen source value',
  );
  assert.deepEqual(entry.snapshot.system.products_selected.lcr, ['Q8-5 × 3'], 'Products Selected are the evidence products');
  assert.equal(entry.snapshot.system.products_selected.lcr.includes('DFC-2 × 1'), false);
  assert.equal(entry.source, 'report-evidence', 'the entry declares the evidence as its source');
});

test('7. there is no live-project fallback anywhere on the proposal read path', () => {
  // The reader takes (entities, projectId, versions) and reads ReportSnapshot only.
  assert.doesNotMatch(READER, /entities\.Project\b/, 'the reader never reads the live Project record');
  assert.doesNotMatch(READER, /Project\.get|ProjectVersion\.get/);
  assert.doesNotMatch(READER, /sessionStorage|localStorage|window\./, 'no browser-session handoff is consulted');

  // The generator loads the project record for identity and branding only: no
  // figure-bearing field is read from it.
  assert.doesNotMatch(
    PROPOSAL_FUNCTION,
    /project\.(roomDims|seating_positions|screen_size|dolby_config|selected_speakers|selected_speakers_by_role|subwooferInstances|room_length|room_width|room_height|manual_width_m|manual_height_m|aspect_ratio)/,
    'no design fact is read from the live project record',
  );
  assert.match(
    PROPOSAL_FUNCTION,
    /engineering_snapshot = suppliedSnapshots\[0\]\.snapshot;/,
    'the proposal snapshot is the evidence reader snapshot',
  );
  assert.match(
    PROPOSAL_FUNCTION,
    /suppliedSnapshots = await readProposalReportEvidence\(/,
    'report facts reach generation through the one evidence reader',
  );
});

/* ── 8. Multi-version isolation ─────────────────────────────────────────── */

test('8. one version evidence never leaks into another version', async () => {
  const rows = [
    ...pair({ versionId: 'v4', technical: { p13: { level: 'L4', value: '108 dBC (OH)' }, model: 'Q8-5', quantity: 3 } }),
    ...pair({ versionId: 'v1', technical: { p13: { level: 'L2', value: '100 dBC (FW)' }, model: 'DFC-1', quantity: 3 } }),
  ];

  const result = await gate(rows, [VERSION('v4'), VERSION('v1')]);
  assert.equal(result.decision, 'ALLOWED');
  assert.equal(result.entries.length, 2);

  const byVersion = new Map(result.entries.map((entry) => [entry.version_id, entry]));
  assert.equal(byVersion.get('v4').snapshot.report_parameters.find((item) => item.parameter_id === 13).text, 'L4 · 108 dBC (OH)');
  assert.equal(byVersion.get('v1').snapshot.report_parameters.find((item) => item.parameter_id === 13).text, 'L2 · 100 dBC (FW)');
  assert.deepEqual(byVersion.get('v4').snapshot.system.products_selected.lcr, ['Q8-5 × 3']);
  assert.deepEqual(byVersion.get('v1').snapshot.system.products_selected.lcr, ['DFC-1 × 3']);
  assert.equal(byVersion.get('v4').evidence.citation.version_id, 'v4');
  assert.equal(byVersion.get('v1').evidence.citation.version_id, 'v1');
  assert.notEqual(
    byVersion.get('v4').evidence.citation.evidence_fingerprint,
    byVersion.get('v1').evidence.citation.evidence_fingerprint,
    'each version cites its own evidence fingerprint',
  );
});

/* ── 9 + 10. Exact parity, parameter by parameter and product by product ── */

test('9. P13 parity is exact against the Technical Report own authority', () => {
  const agreeing = capture();
  const clean = checkReportEvidenceParity({
    evidence: buildEvidence(agreeing), captured: agreeing, reportType: 'technical',
  });
  assert.equal(clean.passed, true, 'the report and its evidence state the same P13');
  assert.equal(clean.blocking.some((entry) => entry.key === 'P13'), false);

  const disagreeing = capture({ authorityP13: { level: 'L3', value: '108 dBC (OH)' } });
  const failed = checkReportEvidenceParity({
    evidence: buildEvidence(disagreeing), captured: disagreeing, reportType: 'technical',
  });
  const p13 = failed.blocking.find((entry) => entry.key === 'P13');
  assert.ok(p13, 'P13 is a blocking parameter for a Technical Report');
  assert.equal(p13.evidence, 'L4', 'the value the report shows');
  assert.equal(p13.report, 'L3', 'the value its own authority stated');

  // A different figure in the same unit is a difference; a different level never is.
  const reworded = capture({ authorityP13: { level: 'L4', value: '108.0 dBC (OH)' } });
  assert.equal(
    checkReportEvidenceParity({ evidence: buildEvidence(reworded), captured: reworded, reportType: 'technical' }).passed,
    true,
    'formatting alone never manufactures a failure',
  );
});

test('10. Products Selected parity is exact, and layer order is not a difference', () => {
  const reordered = capture({ lcr: ['DFC-2', 'Q8-5 × 3'] });
  assert.equal(
    checkReportEvidenceParity({ evidence: buildEvidence(reordered), captured: reordered, reportType: 'technical' }).passed,
    true,
    'the same set of products in a different row order is the same selection',
  );

  const evidence = buildEvidence(capture());
  const changed = capture({ lcr: ['Q8-5 × 2'] });
  const failed = checkReportEvidenceParity({ evidence, captured: changed, reportType: 'technical' });
  assert.equal(failed.passed, false);
  const mismatch = failed.mismatches.find((entry) => entry.area === 'products_selected' && entry.key === 'lcr');
  assert.ok(mismatch, 'a changed quantity is named, by layer');
  assert.equal(mismatch.evidence, 'Q8-5 × 3');
  assert.equal(mismatch.report, 'Q8-5 × 2');
  assert.equal(mismatch.blocking, true, 'a products disagreement always blocks');
});

/* ── 11. A design that moved on ─────────────────────────────────────────── */

test('11. a design that moved on is blocked; an unreadable fingerprint never is', async () => {
  const same = await gate(pair(), [VERSION('v4', FINGERPRINT)]);
  assert.equal(same.decision, 'ALLOWED');

  const moved = await gate(pair(), [VERSION('v4', 'eng:v1:bbb')]);
  assert.equal(moved.decision, 'BLOCKED');
  assert.match(moved.detail, /stale Technical Report|stale Visual Report/);
  assert.match(moved.detail, /The design changed after it was generated/);
  assert.doesNotMatch(moved.detail, /needs a one-time evidence refresh/, 'a moved-on report is stale, not legacy');

  const unreadable = await gate(pair(), [VERSION('v4', null)]);
  assert.equal(unreadable.decision, 'ALLOWED', 'nothing states the design moved on, so nothing is manufactured');
});

/* ── 12. The evidence trace a proposal keeps ────────────────────────────── */

test('12. a proposal stores the evidence it was generated from, per version', async () => {
  const result = await gate(pair(), [VERSION('v4')]);
  const { citation } = result.entries[0].evidence;

  assert.deepEqual(
    Object.keys(citation).sort(),
    ['evidence_fingerprint', 'evidence_generated_at', 'technical_report_snapshot_id', 'version_id', 'visual_report_snapshot_id'],
  );
  assert.equal(citation.technical_report_snapshot_id, 'v4-technical');
  assert.equal(citation.visual_report_snapshot_id, 'v4-visual');
  assert.equal(citation.version_id, 'v4');
  assert.equal(citation.evidence_generated_at, '2026-10-05T10:00:00.000Z');
  assert.match(String(citation.evidence_fingerprint), /^re1-/);

  // And the proposal record keeps it, per version, so a proposal that later
  // disagrees with a report can be traced back to the evidence it read.
  assert.match(PROPOSAL_FUNCTION, /const reportEvidenceCitations = suppliedSnapshots\.map\(/);
  assert.match(PROPOSAL_FUNCTION, /\.\.\.\(entry\.evidence\?\.citation \|\| \{\}\)/);
  assert.match(PROPOSAL_FUNCTION, /report_evidence: reportEvidenceCitations/);
});