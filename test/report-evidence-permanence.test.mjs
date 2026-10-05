/**
 * report-evidence-permanence.test.mjs
 * -----------------------------------
 * The permanence standard: a generated report is a permanent saved artefact.
 * It keeps its complete evidence and reads Current until the design authority
 * actually changes, and it is never degraded by a duplicate row, a save without
 * evidence, or an incomplete write.
 *
 * Pure: the canonical-selection rule, the evidence write guard and the readiness
 * verdict the server and the table both apply.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  rankReportSnapshot,
  resolveEvidenceWrite,
  selectCanonicalReportSnapshot,
  selectCanonicalReportSnapshotsByKey,
} from '../src/components/report/reportSnapshotCanonical.js';
import { READINESS_STATE, resolveSavedReportCell } from '../base44/shared/proposalReadinessAuthority.js';

const FINGERPRINTS = Object.freeze({
  engineeringFingerprint: 'eng:v1:aaaa1111',
  calculationFingerprint: 'cal:v8:bbbb2222',
  seatPriorityFingerprint: 'seat:r1c1:primary',
});

const readyEvidence = (fingerprint = FINGERPRINTS.engineeringFingerprint) => ({
  evidence_version: 1,
  proposal_ready: true,
  identity: { source_fingerprint: fingerprint, engineering_fingerprint: fingerprint },
});

const incompleteEvidence = () => ({
  evidence_version: 1,
  proposal_ready: false,
  identity: { source_fingerprint: null, engineering_fingerprint: null },
});

function row({
  id,
  versionId = 'v1',
  type = 'technical',
  generatedAt = '2026-10-01T10:00:00.000Z',
  reportEvidence = null,
  fingerprints = FINGERPRINTS,
  schemaVersion = 1,
  updatedDate = null,
} = {}) {
  return {
    id,
    version_id: versionId,
    report_type: type,
    report_schema_version: schemaVersion,
    status: 'current',
    generated_at: generatedAt,
    ...(updatedDate ? { updated_date: updatedDate } : {}),
    source_fingerprints: { ...fingerprints },
    payload: {
      pages: [{ id: 'page-1' }],
      ...(reportEvidence ? { reportEvidence } : {}),
    },
  };
}

const stateOf = (rows, { reportType = 'technical', currentFingerprints = FINGERPRINTS } = {}) => {
  const saved = selectCanonicalReportSnapshot(rows, { reportType });
  return {
    id: saved?.id || null,
    state: resolveSavedReportCell({ saved, currentFingerprints }).state,
  };
};

// ── The canonical snapshot rule ──────────────────────────────────────────────

test('1. a generated report with complete evidence reads Current', () => {
  const rows = [row({ id: 'snap-a', reportEvidence: readyEvidence() })];
  assert.deepEqual(stateOf(rows), { id: 'snap-a', state: READINESS_STATE.CURRENT });
});

test('2. a newer duplicate without evidence never displaces the complete row', () => {
  const rows = [
    row({ id: 'snap-old', generatedAt: '2026-10-01T10:00:00.000Z', reportEvidence: readyEvidence() }),
    row({ id: 'snap-new', generatedAt: '2026-10-05T18:00:00.000Z' }),
  ];
  assert.deepEqual(stateOf(rows), { id: 'snap-old', state: READINESS_STATE.CURRENT });
});

test('3. a newer incomplete duplicate never makes a complete report read Incomplete', () => {
  const rows = [
    row({ id: 'snap-old', generatedAt: '2026-10-01T10:00:00.000Z', reportEvidence: readyEvidence() }),
    row({ id: 'snap-new', generatedAt: '2026-10-05T18:00:00.000Z', reportEvidence: incompleteEvidence() }),
  ];
  assert.deepEqual(stateOf(rows), { id: 'snap-old', state: READINESS_STATE.CURRENT });
});

test('4. a later version record write does not change which report is saved', () => {
  const base = row({ id: 'snap-a', reportEvidence: readyEvidence() });
  const touched = { ...base, updated_date: '2026-10-05T19:30:00.000Z' };
  assert.equal(selectCanonicalReportSnapshot([base]).id, 'snap-a');
  assert.deepEqual(stateOf([touched]), { id: 'snap-a', state: READINESS_STATE.CURRENT });
});

test('5. a genuine design change reads Stale', () => {
  const rows = [row({ id: 'snap-a', reportEvidence: readyEvidence() })];
  const movedOn = { ...FINGERPRINTS, calculationFingerprint: 'cal:v8:cccc3333' };
  assert.deepEqual(stateOf(rows, { currentFingerprints: movedOn }), { id: 'snap-a', state: READINESS_STATE.STALE });
});

test('6. an existing report is never Missing, and a version with no row is', () => {
  const legacy = [row({ id: 'snap-legacy' })];
  assert.equal(stateOf(legacy).state, READINESS_STATE.LEGACY);
  assert.deepEqual(stateOf([]), { id: null, state: READINESS_STATE.MISSING });
});

test('7. an incomplete report with a matching fingerprint reads Incomplete', () => {
  const rows = [row({ id: 'snap-a', reportEvidence: incompleteEvidence() })];
  assert.equal(stateOf(rows).state, READINESS_STATE.INCOMPLETE);
});

test('8. rank order: complete evidence, then readable, then not a report', () => {
  assert.equal(rankReportSnapshot(row({ id: 'a', reportEvidence: readyEvidence() })), 2);
  assert.equal(rankReportSnapshot(row({ id: 'b' })), 1);
  assert.equal(rankReportSnapshot({ id: 'c', report_type: 'technical' }), 0);
  assert.equal(rankReportSnapshot(row({ id: 'd', schemaVersion: 2, reportEvidence: readyEvidence() })), 0);
});

// ── The evidence write guard (upgrade only) ─────────────────────────────────

test('9. complete evidence is never overwritten by an incomplete payload', () => {
  const existing = row({ id: 'snap-a', reportEvidence: readyEvidence() });
  const write = resolveEvidenceWrite({ existing, incoming: incompleteEvidence() });
  assert.equal(write.preserved, true);
  assert.equal(write.rejectedReason, 'incomplete-incoming-evidence');
  assert.equal(write.evidence, existing.payload.reportEvidence, 'the saved complete evidence is kept, byte for byte');
});

test('10. a save that carries no evidence never clears the evidence already saved', () => {
  const existing = row({ id: 'snap-a', reportEvidence: readyEvidence() });
  const write = resolveEvidenceWrite({ existing, incoming: null });
  assert.equal(write.preserved, true);
  assert.equal(write.evidence, existing.payload.reportEvidence);
});

test('11. a legacy report is upgraded once complete evidence arrives', () => {
  const existing = row({ id: 'snap-a' });
  const incoming = readyEvidence();
  const write = resolveEvidenceWrite({ existing, incoming });
  assert.equal(write.preserved, false);
  assert.equal(write.incomingReady, true);
  assert.equal(write.evidence, incoming);
});

test('12. rewritten incomplete evidence never looks like an upgrade', () => {
  const existing = row({ id: 'snap-a', reportEvidence: incompleteEvidence() });
  const write = resolveEvidenceWrite({ existing, incoming: incompleteEvidence() });
  assert.equal(write.preserved, false, 'the fresh capture is written');
  assert.equal(write.existingReady, false);
  assert.equal(write.incomingReady, false);
});

// ── A repaired report stays Current, and versions stay separate ─────────────

test('13. a recovered report stays Current across refresh, reopen, export and proposal', () => {
  const legacy = row({ id: 'snap-a', generatedAt: '2026-09-20T09:00:00.000Z' });
  assert.equal(stateOf([legacy]).state, READINESS_STATE.LEGACY);

  const write = resolveEvidenceWrite({ existing: legacy, incoming: readyEvidence() });
  const recovered = { ...legacy, payload: { ...legacy.payload, reportEvidence: write.evidence } };
  assert.equal(stateOf([recovered]).state, READINESS_STATE.CURRENT);

  // Nothing else happened to the report: it is still the same row, and later
  // reads (refresh, reopen, a PDF export, a proposal) select it again.
  const afterLibraryAssetWrite = { ...recovered, updated_date: '2026-10-05T19:45:00.000Z' };
  assert.deepEqual(stateOf([afterLibraryAssetWrite]), { id: 'snap-a', state: READINESS_STATE.CURRENT });
});

test('14. each version keeps its own saved report and its own evidence', () => {
  const rows = [
    row({ id: 'l4-technical', versionId: 'level-4', reportEvidence: readyEvidence('eng:v1:level4') }),
    row({
      id: 'level-1-technical',
      versionId: 'level-1',
      reportEvidence: readyEvidence('eng:v1:level1'),
      fingerprints: { ...FINGERPRINTS, engineeringFingerprint: 'eng:v1:level1' },
    }),
    row({ id: 'level-1-visual', versionId: 'level-1', type: 'visual', reportEvidence: readyEvidence('eng:v1:level1') }),
  ];
  const byKey = selectCanonicalReportSnapshotsByKey(rows);
  assert.equal(byKey.get('level-1::technical').id, 'level-1-technical');
  assert.equal(byKey.get('level-1::visual').id, 'level-1-visual');
  assert.equal(byKey.get('level-4::technical').id, 'l4-technical');

  // A version whose own report is missing is Missing — never filled from another
  // version's report, and never filled from the project's other versions.
  assert.equal(stateOf([rows[0]], { reportType: 'visual' }).state, READINESS_STATE.MISSING);
  assert.equal(stateOf([rows[0]], {
    reportType: 'technical',
    currentFingerprints: { ...FINGERPRINTS, engineeringFingerprint: 'eng:v1:level1' },
  }).state, READINESS_STATE.STALE);
});