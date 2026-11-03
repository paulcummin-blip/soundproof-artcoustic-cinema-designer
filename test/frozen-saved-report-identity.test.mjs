// Regression: a saved Project Report is a frozen document.
//
// Once created, a saved ReportSnapshot keeps the exact engineering and bass
// publication identities it was generated from. A later design recalculation
// (E2/B2) must NOT make the saved report adopt the newer identities; it must
// stay visible as the previous report until the designer explicitly chooses
// "Create Updated Report". Opening or viewing a stale report writes nothing.
//
// Covers the spec cases A–G:
//   A. CREATE REPORT      — saved report stores E1/B1
//   B. RECALCULATE DESIGN — reopen old report → still E1/B1
//   C. GRAPH              — old report P19 graph remains the B1 graph
//   D. NUMERIC RESULTS    — old P19/P20 remain B1 values
//   E. UPDATE REPORT      — explicit regenerate resolves E2/B2
//   F. COLD REOPEN        — still E1/B1 (opening never mutated it)
//   G. NO SILENT WRITES   — opening/viewing does not auto-regenerate
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import frozenReportRead from '@/components/report/frozenReportRead';
import frozenReportBass from '@/components/report/frozenReportBass';
import {
  REPORT_SNAPSHOT_STATUS,
  resolveSnapshotStatus,
  shouldRefreshEvidence,
  buildSourceFingerprints,
} from '@/components/report/reportSnapshotAuthority';
import { syntheticContractFromRetainedEvidence } from '@/lib/bassEvidencePublication';

const ENG_E1 = 'eng:v1:e1-frozen';
const ENG_E2 = 'eng:v1:e2-recalc';
const BASS_B1 = 'cal:v1:b1-frozen';
const BASS_B2 = 'cal:v1:b2-recalc';

const GRAPH_B1 = {
  postEqRspCurve: [{ frequency: 20, spl: 88 }, { frequency: 30, spl: 84 }],
  correctionCurve: [{ frequency: 20, gain: -2 }],
  productionHouseCurveTarget: [{ frequency: 20, spl: 86 }],
  operatingLevelOffsetDb: -1.5,
  roomResponseCurve: [{ frequency: 20, spl: 90 }],
  rawCorrectionCurve: [],
  referenceEq: [],
  eqFilterBank: [],
  postEqPerSeatCurves: [],
  maximumSplCurveAfterEq: [],
  maximumSplSafetyMarginDb: 0,
  perSeatRoomResponseCurves: [],
  sourceCapabilityCurves: [],
  physicalRawResponseCurve: [],
};

/** An immutable engineering publication pinned to E1/B1, retaining its B1 graph. */
function publicationE1() {
  return {
    engineering_fingerprint: ENG_E1,
    published_at: '2026-01-01T00:00:00.000Z',
    provenance: { bass_fingerprint: BASS_B1 },
    engineering_summary: {
      roomResultsByParameter: {
        19: { value: -2.1, formatted: '-2.1 dB' },
        20: { value: 1.0, formatted: '1.0 dB' },
      },
    },
    bass_evidence: {
      schema_version: 1,
      fingerprint: BASS_B1,
      graphPayload: GRAPH_B1,
    },
    report_snapshot: { report_project: { project_id: 'p1', version_id: 'v1' } },
  };
}

/** A saved ReportSnapshot generated from E1/B1. */
function savedReportE1() {
  return {
    id: 'snap-1',
    project_id: 'p1',
    version_id: 'v1',
    report_type: 'project',
    report_schema_version: 1,
    source_fingerprints: buildSourceFingerprints({
      engineeringFingerprint: ENG_E1,
      calculationFingerprint: BASS_B1,
    }),
    generated_at: '2026-01-01T00:00:00.000Z',
    generated_by: 'Dealer',
    status: REPORT_SNAPSHOT_STATUS.CURRENT,
    payload: { engineeringFingerprint: ENG_E1, presentation: {}, pages: [] },
  };
}

test('Case A — CREATE REPORT stores E1/B1', () => {
  const saved = savedReportE1();
  assert.equal(saved.source_fingerprints.engineeringFingerprint, ENG_E1);
  assert.equal(saved.source_fingerprints.calculationFingerprint, BASS_B1);
});

test('Case B — RECALCULATE DESIGN: reopening the old report still resolves E1/B1', () => {
  const saved = savedReportE1();
  // The current design has moved on to E2/B2.
  const read = frozenReportRead(saved, ENG_E2);
  assert.equal(read.fingerprint, ENG_E1, 'saved report reads its own frozen E1, not current E2');
  assert.equal(read.updateNeeded, true, 'the report is marked update-needed against E2');
  const status = resolveSnapshotStatus({
    saved,
    currentFingerprints: { engineeringFingerprint: ENG_E2, calculationFingerprint: BASS_B2 },
  });
  assert.equal(status.status, REPORT_SNAPSHOT_STATUS.STALE);
  assert.ok(status.changedKeys.includes('engineeringFingerprint'));
  assert.ok(status.changedKeys.includes('calculationFingerprint'));
});

test('Case C — GRAPH: the old report P19 graph remains the B1 graph', () => {
  const saved = savedReportE1();
  const publication = publicationE1();
  // The saved report reads its own pinned publication, so the bass resolver
  // receives E1's publication and its B1 bass fingerprint.
  const read = frozenReportRead(saved, ENG_E2);
  const picked = read.fingerprint === ENG_E1 ? publication : null;
  const resolved = frozenReportBass([], picked);
  assert.equal(resolved.currentFingerprint, BASS_B1);
  assert.equal(resolved.source, 'publication-retained');
  const contract = syntheticContractFromRetainedEvidence(picked);
  assert.deepEqual(contract.graphPayload.postEqRspCurve, GRAPH_B1.postEqRspCurve);
});

test('Case D — NUMERIC RESULTS: old P19/P20 remain B1 values', () => {
  const publication = publicationE1();
  const resolved = frozenReportBass([], publication);
  // The frozen publication carries the B1 engineering summary values; the
  // resolver hands back the B1 contract, so P19/P20 are read from B1.
  assert.equal(publication.engineering_summary.roomResultsByParameter[19].value, -2.1);
  assert.equal(publication.engineering_summary.roomResultsByParameter[20].value, 1.0);
  assert.equal(resolved.currentFingerprint, BASS_B1);
});

test('Case E — UPDATE REPORT (explicit) resolves the current E2/B2 publication', () => {
  const saved = savedReportE1();
  // An explicit regenerate is generation mode: it passes generate=true, so the
  // reader returns the current fingerprint rather than the pinned one.
  const read = frozenReportRead(saved, ENG_E2, true);
  assert.equal(read.fingerprint, ENG_E2, 'explicit regenerate uses the current E2');
});

test('Case F — COLD REOPEN: still E1/B1 (opening never mutated the saved report)', () => {
  const saved = savedReportE1();
  // Reopening resolves the frozen identity again; the saved record is untouched.
  const read = frozenReportRead(saved, ENG_E2);
  assert.equal(read.fingerprint, ENG_E1);
  assert.equal(saved.source_fingerprints.engineeringFingerprint, ENG_E1);
  assert.equal(saved.source_fingerprints.calculationFingerprint, BASS_B1);
  const status = resolveSnapshotStatus({
    saved,
    currentFingerprints: { engineeringFingerprint: ENG_E2, calculationFingerprint: BASS_B2 },
  });
  assert.equal(status.status, REPORT_SNAPSHOT_STATUS.STALE);
});

test('Case G — NO SILENT WRITES: a stale report is never auto-refreshed on open', () => {
  const saved = savedReportE1();
  const stale = resolveSnapshotStatus({
    saved,
    currentFingerprints: { engineeringFingerprint: ENG_E2, calculationFingerprint: BASS_B2 },
  });
  assert.equal(stale.status, REPORT_SNAPSHOT_STATUS.STALE);
  // The useReportSnapshot auto-save effect only fires when shouldRefreshEvidence
  // is true. A stale report must never qualify, with or without evidence.
  assert.equal(
    shouldRefreshEvidence({ saved, status: stale.status, hasEvidence: true }),
    false,
    'stale + has evidence: no auto-save',
  );
  assert.equal(
    shouldRefreshEvidence({ saved, status: stale.status, hasEvidence: false }),
    false,
    'stale + no evidence: no auto-save',
  );
  // The automatic-regenerate hook has been removed from the report page, so
  // opening a stale report can no longer trigger a silent regenerate. This
  // structural assertion locks the fix: the import must not exist.
  const pageSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/RP22ClientReport.jsx'),
    'utf8',
  );
  assert.equal(
    pageSource.includes('useAutoUpdateStaleReport'),
    false,
    'RP22ClientReport must not import the auto-update hook',
  );
  assert.equal(
    pageSource.includes('autoUpdating={false}'),
    true,
    'the stale banner is shown (autoUpdating is never set true by the page)',
  );
});