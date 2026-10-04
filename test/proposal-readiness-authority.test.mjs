/**
 * Acceptance tests — ONE proposal readiness authority.
 *
 * Defect under test (Marquee Home, Step 5):
 *   The Version Readiness panel read every selected version as Current, while
 *   the Generate gate blocked with
 *   "Level 1 version · V2 is missing Visual and Technical Reports".
 *
 * Two authorities were answering: the panel read the version's engineering
 * result from a browser-session handoff (which the server cannot see), and the
 * server judged the version from its published engineering pointer — then
 * described that block as missing REPORTS, and named the version with a slot
 * suffix ("· V2").
 *
 * The stored truth for Marquee Home is in the fixtures below:
 *   Level 4 version (slot 1) — published engineering result + current reports
 *   Level 1 version (slot 2) — reports current, NO published engineering result
 *
 * So the verdict must name Level 1 version, its saved name, and the source that
 * is actually missing — and the panel, the blocking text, the Generate gate and
 * the server must all state exactly that.
 *
 *   TEST 1  Both modules derive the same rows, sentences and gate (parity)
 *   TEST 2  Both modules share one vocabulary (no drift in the copy)
 *   TEST 3  Marquee Home Level 4 version: everything Current, gate ready
 *   TEST 4  Marquee Home Level 1 version: reports Current, engineering Missing
 *   TEST 5  The gate message is the panel's own sentence (one authority)
 *   TEST 6  No false missing-report warning; the real source is named
 *   TEST 7  A stale report names that report, per version
 *   TEST 8  Both reports missing → one combined clause
 *   TEST 9  Saved version names only — never "· V2"
 *   TEST 10 Generate is enabled only when every selected version is Current
 *
 * Pure: no React, no database.
 *
 * Run: node test/proposal-readiness-authority.test.mjs
 */

import assert from 'node:assert/strict';

import {
  READINESS_VERB as SHARED_VERB,
  READINESS_COLUMNS as SHARED_COLUMNS,
  READINESS_COMBINED_REPORT_LABEL as SHARED_COMBINED_LABEL,
  READINESS_STATUS_TEXT as SHARED_STATUS_TEXT,
  PROPOSAL_READINESS_READY_COPY as SHARED_READY_COPY,
  READINESS_STATE,
  PUBLICATION_STATUS,
  buildReadinessCell,
  blockerLabel as sharedBlockerLabel,
  resolveEngineeringCell,
  resolveProposalReadinessGate,
  resolveSavedReportCell,
  resolveVersionReadiness,
  versionDisplayName as sharedVersionDisplayName,
} from '../base44/shared/proposalReadinessAuthority.js';

import {
  READINESS_VERB as CLIENT_VERB,
  READINESS_COLUMNS as CLIENT_COLUMNS,
  READINESS_COMBINED_REPORT_LABEL as CLIENT_COMBINED_LABEL,
  READINESS_STATUS_TEXT as CLIENT_STATUS_TEXT,
  PROPOSAL_READINESS_READY_COPY as CLIENT_READY_COPY,
  blockerLabel as clientBlockerLabel,
  resolveProposalReadinessGate as clientGate,
  resolveVersionReadinessRow as clientRow,
  versionDisplayName as clientVersionDisplayName,
} from '../src/components/proposal/sourceAuthority/proposalReadinessAuthority.js';

// ── The stored Marquee Home sources (read from the app's own records) ───────

const SEAT_PRIORITY =
  'seat-r1-c1:secondary|seat-r1-c2:primary|seat-r1-c3:primary|seat-r1-c4:secondary'
  + '|seat-r2-c1:secondary|seat-r2-c2:secondary|seat-r2-c3:primary|seat-r2-c4:secondary|seat-r2-c5:secondary';

/** A saved report carried under the current payload generation. */
const savedReport = ({ fingerprints, generatedAt }) => ({
  report_schema_version: 1,
  payload: { pages: [{ id: 'cover', category: 'cover' }] },
  source_fingerprints: fingerprints,
  generated_at: generatedAt,
});

const LEVEL_4_VERSION = {
  id: '6abbca6e199f13dc4d74ec4a',
  version_name: 'Level 4 version',
  version_number: 1,
  published_fingerprint: 'eng:v1:c19ceb2efb6c3d9c',
};

const LEVEL_1_VERSION = {
  id: '6ac22230d40d8bb0a925ecab',
  version_name: 'Level 1 version',
  version_number: 2,
  published_fingerprint: null,
};

const LEVEL_4_PUBLICATION = {
  engineering_fingerprint: 'eng:v1:c19ceb2efb6c3d9c',
  published_at: '2026-10-01T23:10:14.308Z',
  provenance: { bass_fingerprint: null },
  engineering_summary: { seatPriorityFingerprint: SEAT_PRIORITY },
};

const LEVEL_4_SOURCES = {
  version: LEVEL_4_VERSION,
  savedReports: {
    visual: savedReport({
      generatedAt: '2026-10-02T22:03:28.601Z',
      fingerprints: { engineeringFingerprint: 'eng:v1:c19ceb2efb6c3d9c', calculationFingerprint: null, seatPriorityFingerprint: SEAT_PRIORITY },
    }),
    technical: savedReport({
      generatedAt: '2026-10-04T17:11:05.564Z',
      fingerprints: { engineeringFingerprint: 'eng:v1:c19ceb2efb6c3d9c', calculationFingerprint: null, seatPriorityFingerprint: SEAT_PRIORITY },
    }),
  },
  publication: LEVEL_4_PUBLICATION,
  publicationStatus: PUBLICATION_STATUS.PUBLISHED,
  currentFingerprints: {
    engineeringFingerprint: 'eng:v1:c19ceb2efb6c3d9c',
    calculationFingerprint: null,
    seatPriorityFingerprint: SEAT_PRIORITY,
  },
};

const LEVEL_1_SOURCES = {
  version: LEVEL_1_VERSION,
  savedReports: {
    visual: savedReport({
      generatedAt: '2026-10-04T10:07:51.482Z',
      fingerprints: { engineeringFingerprint: null, calculationFingerprint: 'cal:v8:395d1a338da6c449', seatPriorityFingerprint: SEAT_PRIORITY },
    }),
    technical: savedReport({
      generatedAt: '2026-10-04T15:48:40.816Z',
      fingerprints: { engineeringFingerprint: null, calculationFingerprint: 'cal:v8:395d1a338da6c449', seatPriorityFingerprint: SEAT_PRIORITY },
    }),
  },
  publication: null,
  publicationStatus: PUBLICATION_STATUS.NOT_CALCULATED,
  currentFingerprints: {
    engineeringFingerprint: null,
    calculationFingerprint: null,
    seatPriorityFingerprint: SEAT_PRIORITY,
  },
};

/** The same row, assembled the way the Step 5 table assembles it. */
const asClientRow = (sources) => clientRow({
  versionId: sources.version.id,
  versionName: clientVersionDisplayName(sources.version),
  versionNumber: sources.version.version_number,
  cells: {
    visual: sources.savedReports.visual
      ? buildReadinessCell({
        state: resolveSavedReportCell({ saved: sources.savedReports.visual, currentFingerprints: sources.currentFingerprints }).state,
      })
      : undefined,
    technical: sources.savedReports.technical
      ? buildReadinessCell({
        state: resolveSavedReportCell({ saved: sources.savedReports.technical, currentFingerprints: sources.currentFingerprints }).state,
      })
      : undefined,
    engineering: undefined,
  },
});

const results = [];
const test = (name, fn) => {
  try {
    fn();
    results.push(`PASS  ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name}\n      ${error.message}`);
  }
};

// ── 1. Parity: both modules derive the same verdict ─────────────────────────

test('1. both modules derive the same rows, sentences and gate message', () => {
  for (const sources of [LEVEL_4_SOURCES, LEVEL_1_SOURCES]) {
    const shared = resolveVersionReadiness(sources);
    const client = clientRow({
      versionId: shared.versionId,
      versionName: shared.versionName,
      versionNumber: shared.versionNumber,
      cells: { visual: shared.visual, technical: shared.technical, engineering: shared.engineering },
    });
    assert.equal(client.blockingSentence, shared.blockingSentence, 'same sentence');
    assert.equal(client.ready, shared.ready, 'same verdict');
    assert.equal(client.visual_report_status, shared.visual_report_status);
    assert.equal(client.technical_report_status, shared.technical_report_status);
    assert.equal(client.engineering_result_status, shared.engineering_result_status);
  }

  const sharedGate = resolveProposalReadinessGate({ rows: [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness(LEVEL_1_SOURCES)] });
  const clientGateResult = clientGate({ rows: [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness(LEVEL_1_SOURCES)] });
  assert.equal(clientGateResult.ready, sharedGate.ready);
  assert.equal(clientGateResult.message, sharedGate.message);
  assert.deepEqual(clientGateResult.blockedVersions, sharedGate.blockedVersions);
});

// ── 2. One vocabulary ───────────────────────────────────────────────────────

test('2. both modules share one vocabulary', () => {
  assert.deepEqual(CLIENT_VERB, SHARED_VERB);
  assert.deepEqual(CLIENT_STATUS_TEXT, SHARED_STATUS_TEXT);
  assert.deepEqual(CLIENT_COLUMNS, SHARED_COLUMNS);
  assert.equal(CLIENT_COMBINED_LABEL, SHARED_COMBINED_LABEL);
  assert.equal(CLIENT_READY_COPY, SHARED_READY_COPY);
  for (const source of ['visual', 'technical', 'engineering']) {
    for (const state of Object.values(READINESS_STATE)) {
      assert.equal(clientBlockerLabel({ source, state }), sharedBlockerLabel({ source, state }), `${source} / ${state}`);
    }
  }
  assert.equal(clientVersionDisplayName(LEVEL_1_VERSION), sharedVersionDisplayName(LEVEL_1_VERSION));
});

// ── 3. Marquee Home Level 4 version ─────────────────────────────────────────

test('3. Level 4 version reads Current everywhere and does not block', () => {
  const row = resolveVersionReadiness(LEVEL_4_SOURCES);
  assert.equal(row.versionId, LEVEL_4_VERSION.id);
  assert.equal(row.versionName, 'Level 4 version');
  assert.equal(row.visual_report_status, 'Current');
  assert.equal(row.technical_report_status, 'Current');
  assert.equal(row.engineering_result_status, 'Current');
  assert.equal(row.blockingSentence, null);
  assert.equal(row.ready, true);

  const gate = resolveProposalReadinessGate({ rows: [row] });
  assert.equal(gate.ready, true);
  assert.equal(gate.message, null);
  assert.equal(gate.blockedVersions.length, 0);
});

// ── 4. Marquee Home Level 1 version ─────────────────────────────────────────

test('4. Level 1 version: reports Current, engineering source Missing', () => {
  const row = resolveVersionReadiness(LEVEL_1_SOURCES);
  assert.equal(row.versionName, 'Level 1 version');
  assert.equal(row.visual_report_status, 'Current');
  assert.equal(row.technical_report_status, 'Current');
  assert.equal(row.engineering_result_status, 'Missing');
  assert.equal(row.ready, false);
});

// ── 5. One authority: gate message is the panel's own sentence ──────────────

test('5. the gate message is the row sentence, verbatim', () => {
  const rows = [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness(LEVEL_1_SOURCES)];
  const gate = resolveProposalReadinessGate({ rows });
  assert.equal(gate.ready, false);
  assert.equal(gate.message, `${rows[1].blockingSentence}.`);
  assert.equal(gate.blockedVersions.length, 1);
  assert.equal(gate.blockedVersions[0].version_name, 'Level 1 version');
  assert.deepEqual(gate.blockedVersions[0].blockers.map((blocker) => blocker.source), ['engineering']);
});

// ── 6. The false warning is gone; the real source is named ──────────────────

test('6. no false missing-report warning — the real source is named', () => {
  const gate = resolveProposalReadinessGate({
    rows: [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness(LEVEL_1_SOURCES)],
  });
  assert.equal(gate.message, 'Level 1 version is missing the calculated engineering result.');
  assert.doesNotMatch(gate.message, /Visual and Technical Reports/, 'the current reports are not claimed missing');
  assert.doesNotMatch(gate.message, /Visual Report|Technical Report/);
});

// ── 7. A genuinely stale report is named, per version ───────────────────────

test('7. a stale report names that report and that version', () => {
  const row = resolveVersionReadiness({
    ...LEVEL_4_SOURCES,
    savedReports: {
      ...LEVEL_4_SOURCES.savedReports,
      technical: savedReport({
        generatedAt: '2026-10-04T17:11:05.564Z',
        fingerprints: { engineeringFingerprint: 'eng:v1:older-design', calculationFingerprint: null, seatPriorityFingerprint: SEAT_PRIORITY },
      }),
    },
  });
  assert.equal(row.visual_report_status, 'Current');
  assert.equal(row.technical_report_status, 'Stale');
  assert.equal(row.blockingSentence, 'Level 4 version has a stale Technical Report');
  const gate = resolveProposalReadinessGate({ rows: [row] });
  assert.equal(gate.message, 'Level 4 version has a stale Technical Report.');
});

// ── 8. Both reports missing → one combined clause ──────────────────────────

test('8. both reports missing reads as one clause', () => {
  const row = resolveVersionReadiness({
    version: LEVEL_1_VERSION,
    savedReports: { visual: null, technical: null },
    publication: null,
    publicationStatus: PUBLICATION_STATUS.NOT_CALCULATED,
    currentFingerprints: null,
  });
  assert.equal(row.visual_report_status, 'Missing');
  assert.equal(row.technical_report_status, 'Missing');
  assert.equal(
    row.blockingSentence,
    'Level 1 version is missing Visual and Technical Reports and the calculated engineering result',
  );
});

// ── 9. Saved version names only ────────────────────────────────────────────

test('9. the sentence uses the saved version name and no slot suffix', () => {
  const row = resolveVersionReadiness(LEVEL_1_SOURCES);
  assert.match(row.blockingSentence, /^Level 1 version /);
  assert.doesNotMatch(row.blockingSentence, /·\s*V\d/, 'never "Level 1 version · V2"');
  assert.doesNotMatch(row.blockingSentence, /\bV\d\b/);
});

// ── 10. Generate gate ──────────────────────────────────────────────────────

test('10. Generate is enabled only when every selected version is Current', () => {
  const allCurrent = resolveProposalReadinessGate({
    rows: [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness({ ...LEVEL_4_SOURCES, version: { ...LEVEL_4_VERSION, id: LEVEL_1_VERSION.id, version_name: 'Level 1 version', version_number: 2 } })],
  });
  assert.equal(allCurrent.ready, true, 'both versions current → Generate enabled');
  assert.equal(allCurrent.message, null);

  const oneBlocked = resolveProposalReadinessGate({
    rows: [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness(LEVEL_1_SOURCES)],
  });
  assert.equal(oneBlocked.ready, false, 'one blocked version → Generate disabled');

  const checking = resolveProposalReadinessGate({ rows: [], loading: true });
  assert.equal(checking.ready, false);
  assert.equal(checking.message, null, 'a read in flight never claims anything is missing');
});

// ── The per-source rules the server and the client share ───────────────────

test('11. the engineering cell follows the published result, never a handoff', () => {
  assert.equal(resolveEngineeringCell({ publication: LEVEL_4_PUBLICATION, publicationStatus: PUBLICATION_STATUS.PUBLISHED }).state, READINESS_STATE.CURRENT);
  assert.equal(resolveEngineeringCell({ publication: null, publicationStatus: PUBLICATION_STATUS.STALE }).state, READINESS_STATE.STALE);
  assert.equal(resolveEngineeringCell({ publication: null, publicationStatus: PUBLICATION_STATUS.NOT_CALCULATED }).state, READINESS_STATE.MISSING);
  assert.equal(resolveEngineeringCell({ publication: null, publicationStatus: PUBLICATION_STATUS.READ_FAILED }).state, READINESS_STATE.UNAVAILABLE);
});

test('12. a report cell is judged by the fingerprints both sides state', () => {
  // Marquee Home Level 1: the saved report states no engineering fingerprint, so
  // that key is never compared — the report reads Current rather than being
  // accused of staleness on a value nobody recorded.
  assert.equal(resolveSavedReportCell({ saved: LEVEL_1_SOURCES.savedReports.visual, currentFingerprints: LEVEL_1_SOURCES.currentFingerprints }).state, READINESS_STATE.CURRENT);
  // A report from another payload generation is not a usable source.
  assert.equal(resolveSavedReportCell({ saved: { ...LEVEL_1_SOURCES.savedReports.visual, report_schema_version: 0 }, currentFingerprints: null }).state, READINESS_STATE.MISSING);
  // No saved report at all is Missing, never Current.
  assert.equal(resolveSavedReportCell({ saved: null, currentFingerprints: null }).state, READINESS_STATE.MISSING);
});

// ── Report ─────────────────────────────────────────────────────────────────

const failures = results.filter((line) => line.startsWith('FAIL'));
console.log(results.join('\n'));
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
if (failures.length > 0) process.exitCode = 1;