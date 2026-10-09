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
 *   4  legacy frozen source cannot be promoted to report authority
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
import { validateReportEvidence } from '../src/components/report/reportEvidenceAuthority.js';
import { buildParityRecord, checkReportEvidenceParity } from '../src/components/report/reportEvidenceParity.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const HOOK = read('src/components/report/useReportSnapshot.js');
const CAPTURE = read('src/components/report/captureReportProposalSource.js');
const READER = read('base44/shared/proposalReportEvidenceReader.js');
const PROPOSAL_FUNCTION = read('base44/functions/generateProposal/entry.ts');

// Frozen fixture factories are separate from the acceptance assertions.
import {
  PROJECT, FINGERPRINT, capture, buildEvidence, EVIDENCE, FROZEN,
  row, pair, VERSION, fakeEntities,
} from '../src/components/report/testing/reportEvidenceAcceptanceFixtures.mjs';

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
  const validation = validateReportEvidence(evidence, 'technical', { requireProposalReady: false });
  assert.equal(validation.complete, true, JSON.stringify(validation.missing));
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
  evidence.parameter_index.P13.authority_level = 'L3';
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
    report_type: 'technical',
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
  assert.match(cell.reason, /Project Report needs to be completed/);
});

/* ── 4 + 5. Legacy frozen source is not authoritative; absent evidence fails closed ── */

test('4. legacy proposalSource cannot be promoted to report authority', () => {
  assert.doesNotMatch(HOOK, /const stored = saved\.payload\?\.proposalSource;/);
  assert.match(HOOK, /seatingPublication: publication/);
  assert.match(HOOK, /auditReportSaveAuthority/);
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

  assert.equal(result.decision, 'ALLOWED', result.detail);
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
  assert.equal(result.decision, 'ALLOWED', result.detail);
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

  const disagreeing = capture();
  const mixed = buildEvidence(disagreeing);
  mixed.parameter_index.P13.authority_level = 'L3';
  const failed = checkReportEvidenceParity({
    evidence: mixed, captured: disagreeing, reportType: 'technical',
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

/* ── 13–17. reportEvidence is the sole source of every report fact ───────── */

/** The evidence and the frozen source deliberately state different facts. */
const conflicting = ({ room, seat, frozenRoom, frozenSeat } = {}) => pair({
  technicalEvidence: EVIDENCE({ room, seat }),
  visualEvidence: EVIDENCE({ reportType: 'visual', room, seat }),
  technicalFrozen: FROZEN({ room: frozenRoom, seat: frozenSeat }),
  visualFrozen: FROZEN({ room: frozenRoom, seat: frozenSeat }),
});

test('13. conflicting room data: the proposal receives the evidence room only', async () => {
  const result = await gate(conflicting({
    room: { length_m: 6, width_m: 5.2, height_m: 2.4 },
    frozenRoom: { length_m: 6, width_m: 9.9, height_m: 2.4 },
  }), [VERSION('v4')]);

  assert.equal(result.decision, 'ALLOWED', result.detail);
  assert.equal(result.entries[0].snapshot.room.dimensions.width_m, 5.2, 'the evidence room is the room the proposal states');
  assert.equal(result.entries[0].snapshot.room.dimensions.length_m, 6);
});

test('14. conflicting seating data: the proposal receives the evidence distance only', async () => {
  const result = await gate(conflicting({
    seat: { distance_m: 3.4, horizontal_angle_deg: 0, rp23_level: 'Level 4' },
    frozenSeat: { distance_m: 4.8, horizontal_angle_deg: 0 },
  }), [VERSION('v4')]);

  assert.equal(result.decision, 'ALLOWED', result.detail);
  assert.equal(result.entries[0].snapshot.viewing.per_seat[0].distance_m, 3.4, 'the evidence distance is the distance the proposal states');
});

test('15. conflicting viewing data: the proposal receives the evidence RP23 angle only', async () => {
  const result = await gate(conflicting({
    seat: { distance_m: 3.2, horizontal_angle_deg: 63, rp23_level: 'Level 4' },
    frozenSeat: { distance_m: 3.2, horizontal_angle_deg: 45 },
  }), [VERSION('v4')]);

  const seat = result.entries[0].snapshot.viewing.per_seat[0];
  assert.equal(result.decision, 'ALLOWED', result.detail);
  assert.equal(seat.horizontal_angle_deg, 63, 'the evidence angle is the angle the proposal states');
  assert.equal(seat.level, 'Level 4', 'the RP23 level is the level the evidence states');
});

test('16. a fact missing from reportEvidence blocks as Incomplete and is never filled from the frozen source', async () => {
  const result = await gate(conflicting({
    room: { length_m: 6, width_m: null, height_m: 2.4 },
    frozenRoom: { length_m: 6, width_m: 9.9, height_m: 2.4 },
  }), [VERSION('v4')]);

  assert.equal(result.decision, 'BLOCKED');
  assert.match(result.detail, /Level 4 version: incomplete (Visual|Technical) Report evidence/);
  assert.match(result.detail, /room\.width_m is missing/);
  assert.doesNotMatch(result.detail, /9\.9/, 'the frozen value is never substituted, and never reported as the fact');
});

test('17. the reader reads no report fact from proposalSource', () => {
  assert.doesNotMatch(READER, /visualFrozenSource/, 'the frozen-source reader is gone');
  assert.doesNotMatch(READER, /\.\.\.frozen/, 'no frozen block is spread into the snapshot');
  assert.doesNotMatch(READER, /payload\?\.proposalSource \|\|/, 'no frozen value is ever a fallback');
  // Its one remaining use: naming the recovery a legacy report needs.
  assert.match(READER, /const recoverable = !!row\.payload\?\.proposalSource;/);
});