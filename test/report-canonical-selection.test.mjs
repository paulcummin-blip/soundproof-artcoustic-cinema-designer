// ---------------------------------------------------------------------------
// TEST   Report canonical selection
// WHAT   One rule decides which saved report is THE report for a project version
//        and report type. A newer duplicate that is incomplete, stale, or parity
//        failed must never displace the valid Current report.
// WHY    Marquee Level 4 lost its valid Current reports to newer bad duplicates:
//        the Library, the report pages, the Proposal Centre and the server gate
//        each chose their own row, so a version could read ready on one surface
//        and not generated on another.
//
// The SAME cases are run through the client half and the server half of the rule
// (they are one rule, kept as two modules), and through every consumer entry
// point, so no surface can resolve a different row.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  compareReportSnapshots,
  matchesCurrentAuthority,
  selectCanonicalReportSnapshot,
  selectCanonicalReportSnapshotsByKey,
} from '../src/components/report/reportSnapshotCanonical.js';
import { selectCanonicalReportSnapshot as selectOnServer } from '../base44/shared/reportSnapshotCanonical.js';
import { collapseLiveReports } from '../src/components/library/librarySourceStatus.js';
import { validateReportEvidence } from '../shared/reportEvidenceCompleteness.js';
import {
  CURRENT,
  PROJECT,
  STALE,
  VERSION,
  completeEvidence,
  incompleteEvidence,
  reportRow,
} from '../src/test/fixtures/reportSnapshotFixtures.mjs';
import { createSnapshotClient, loadSnapshotStore } from '../src/test/fixtures/reportSnapshotStoreHarness.mjs';

const read = (path) => readFileSync(path, 'utf8');

const currentByVersion = new Map([[VERSION, CURRENT]]);

/** Every entry point that resolves the canonical row, for one fixture set. */
function resolveEverywhere(rows, { reportType = 'technical' } = {}) {
  const client = selectCanonicalReportSnapshot(rows, { reportType, currentFingerprint: CURRENT });
  const server = selectOnServer(rows, { reportType, currentFingerprint: CURRENT });
  const byKey = selectCanonicalReportSnapshotsByKey(rows, { currentFingerprintByVersion: currentByVersion })
    .get(`${VERSION}::${reportType}`);
  const library = collapseLiveReports(rows, { currentFingerprintByVersion: currentByVersion })
    .find((row) => row.report_type === reportType);
  return { client, server, byKey, library };
}

// ── Fixture guard ───────────────────────────────────────────────────────────
test('the fixtures are what the rule judges: complete evidence is complete', () => {
  const evidence = completeEvidence({ reportType: 'technical' });
  const complete = validateReportEvidence(evidence, 'technical');
  assert.equal(complete.complete, true, `complete fixture must validate: ${complete.missing?.join(', ')}`);
  assert.equal(evidence.proposal_ready, true);

  const incomplete = validateReportEvidence(incompleteEvidence({ reportType: 'technical' }), 'technical');
  assert.equal(incomplete.complete, false, 'the incomplete fixture must NOT be complete evidence');

  const row = reportRow({ id: 'r', generatedAt: '2026-10-02T09:00:00.000Z' });
  assert.equal(row.report_schema_version, 1, 'a row must be readable as a saved report');
});

// ── A — newer INCOMPLETE duplicate ──────────────────────────────────────────
const caseA = [
  reportRow({ id: 'current-old', generatedAt: '2026-10-02T09:00:00.000Z', fingerprint: CURRENT }),
  reportRow({ id: 'newer-incomplete', generatedAt: '2026-10-09T09:00:00.000Z', fingerprint: STALE, complete: false }),
];

test('A — a newer INCOMPLETE duplicate never displaces the older Current report', () => {
  const { client, server, byKey, library } = resolveEverywhere(caseA);
  assert.equal(client.id, 'current-old', 'client half');
  assert.equal(server.id, 'current-old', 'server half');
  assert.equal(byKey.id, 'current-old', 'client, collapsed by version and type');
  assert.equal(library.id, 'current-old', 'Project Library listing');
  assert.equal(matchesCurrentAuthority(client, CURRENT), true, 'the selected row is frozen against authority');
});

// ── A2 — the completeness rung on its own ───────────────────────────────────
// Both rows are frozen against the SAME authority, so authority cannot decide:
// only completeness can. Without that rung the newer incomplete row would win.
const caseA2 = [
  reportRow({ id: 'current-complete', generatedAt: '2026-10-02T09:00:00.000Z', fingerprint: CURRENT }),
  reportRow({ id: 'current-incomplete', generatedAt: '2026-10-09T09:00:00.000Z', fingerprint: CURRENT, complete: false }),
];

test('A2 — with the same authority, only complete evidence decides', () => {
  const { client, server, byKey, library } = resolveEverywhere(caseA2);
  assert.equal(client.id, 'current-complete', 'client half');
  assert.equal(server.id, 'current-complete', 'server half');
  assert.equal(byKey.id, 'current-complete');
  assert.equal(library.id, 'current-complete');
  assert.equal(
    compareReportSnapshots(caseA2[1], caseA2[0], { currentFingerprint: CURRENT }),
    -1,
    'the newer row loses on evidence, not on date',
  );
});

// ── B — newer COMPLETE STALE duplicate ──────────────────────────────────────
const caseB = [
  reportRow({ id: 'current-old', generatedAt: '2026-10-02T09:00:00.000Z', fingerprint: CURRENT }),
  reportRow({ id: 'newer-stale', generatedAt: '2026-10-09T09:00:00.000Z', fingerprint: STALE }),
];

test('B — a newer COMPLETE STALE duplicate never displaces the older Current report', () => {
  const { client, server, byKey, library } = resolveEverywhere(caseB);
  assert.equal(client.id, 'current-old');
  assert.equal(server.id, 'current-old');
  assert.equal(byKey.id, 'current-old');
  assert.equal(library.id, 'current-old');
  // The rule is not "newest wins for the same shape": the STALE row is complete.
  assert.equal(
    compareReportSnapshots(caseB[1], caseB[0], { currentFingerprint: CURRENT }),
    -1,
    'the row frozen against the current authority outranks the newer stale row',
  );
});

// ── C — two complete Current rows ───────────────────────────────────────────
const caseC = [
  reportRow({ id: 'current-old', generatedAt: '2026-10-02T09:00:00.000Z', fingerprint: CURRENT }),
  reportRow({ id: 'current-new', generatedAt: '2026-10-05T09:00:00.000Z', fingerprint: CURRENT }),
];

test('C — with two complete Current rows, the newest generation is selected', () => {
  const { client, server, byKey, library } = resolveEverywhere(caseC);
  assert.equal(client.id, 'current-new');
  assert.equal(server.id, 'current-new');
  assert.equal(byKey.id, 'current-new');
  assert.equal(library.id, 'current-new');
});

// ── D — no Current rows ─────────────────────────────────────────────────────
const caseD = [
  reportRow({ id: 'stale-parity-failed', generatedAt: '2026-10-09T09:00:00.000Z', fingerprint: STALE, parity: false }),
  reportRow({ id: 'stale-parity-passed', generatedAt: '2026-10-04T09:00:00.000Z', fingerprint: STALE, parity: true }),
];

test('D — with no Current row, the best available row is selected and surfaced honestly', () => {
  const selected = selectCanonicalReportSnapshot(caseD, { reportType: 'technical', currentFingerprint: CURRENT });
  assert.equal(selected.id, 'stale-parity-passed', 'the row that passed parity outranks the newer failed one');
  // Honestly: the chosen row is NOT the current authority, so every status
  // reader still derives Stale / Update needed from it. Selection never invents
  // a Current report.
  assert.equal(matchesCurrentAuthority(selected, CURRENT), false);
  assert.equal(
    selectCanonicalReportSnapshot([], { currentFingerprint: CURRENT }),
    null,
    'no rows at all selects nothing rather than a placeholder',
  );
});

// ── E — every consumer resolves the same ID ─────────────────────────────────
// The store's own reader, built once here: the focused runner's test() is
// synchronous, so the read happens at module scope and the test asserts on it.
const storeRead = await (async () => {
  const instance = createSnapshotClient(caseA);
  const store = await loadSnapshotStore(instance.client);
  return store.loadReportSnapshot({
    projectId: PROJECT,
    versionId: VERSION,
    reportType: 'technical',
    currentFingerprint: CURRENT,
  });
})();

test('E — every consumer resolves the same snapshot ID', () => {
  const { client, server, byKey, library } = resolveEverywhere(caseA);
  assert.equal(storeRead.id, 'current-old', 'the store reads through the rule, not the newest row');
  [server.id, byKey.id, library.id, storeRead.id].forEach((id) => {
    assert.equal(id, client.id, 'every entry point resolves the same row');
  });
});

test('E2 — each consumer delegates to the one rule, told which authority the version holds now', () => {
  // The report pages and the store.
  assert.match(read('src/components/report/reportSnapshotStore.js'), /selectCanonicalReportSnapshot\(items, \{ reportType, currentFingerprint \}\)/);
  assert.match(read('src/components/report/useReportSnapshot.js'), /currentFingerprint: currentFp\.engineeringFingerprint/);

  // The Project Library listing and the version switcher.
  assert.match(read('src/components/library/useProjectLibraryAssets.js'), /collapseLiveReports\(savedReports, \{[\s\S]{0,80}currentFingerprintByVersion: publishedFingerprintByVersionId/);
  assert.match(read('src/components/versions/versionDocumentStatus.js'), /collapseLiveReports\(snapshots, \{ currentFingerprintByVersion \}\)/);

  // The Proposal Centre readiness read and the proposal library.
  assert.match(read('src/components/proposal/sourceAuthority/useProposalReadiness.js'), /selectCanonicalReportSnapshotsByKey\(snapshotRows, \{[\s\S]{0,80}currentFingerprintByVersion: publishedFingerprintByVersionId/);
  assert.match(read('src/components/proposal/library/useProposalLibrary.js'), /selectCanonicalReportSnapshot\(/);
  assert.match(read('src/components/proposal/library/useProposalLibrary.js'), /currentFingerprint: nextVersionsById\.get\(row\.version_id\)\?\.published_fingerprint/);

  // The issued-document source check.
  assert.match(read('src/components/library/issuedDocument/proposalExportSource.js'), /selectCanonicalReportSnapshot\(/);
  assert.match(read('src/components/library/issuedDocument/proposalExportSource.js'), /currentFingerprint: versionsById\.get\(snapshot\.version_id\)\?\.published_fingerprint/);

  // The server proposal gate and the report-evidence reader.
  assert.match(read('base44/shared/proposalReportEvidenceReader.js'), /selectCanonicalReportSnapshot\(rows, \{ reportType: 'technical', currentFingerprint \}\)/);
  assert.match(read('base44/shared/proposalReportEvidenceReader.js'), /const currentFingerprint = version\.published_fingerprint \|\| null;/);
  assert.match(read('base44/functions/generateProposal/entry.ts'), /selectCanonicalReportSnapshotsByKey\(/);
  assert.match(read('base44/functions/generateProposal/entry.ts'), /currentFingerprintByVersion/);

  // No surface still chooses by date alone: the newest row is no longer the answer.
  assert.doesNotMatch(read('src/components/library/librarySourceStatus.js'), /timestampOf\(snapshot\) > timestampOf\(current\)/);
  assert.doesNotMatch(read('src/components/library/useProjectLibraryAssets.js'), /if \(!canonicalByKey\.has\(key\)\) canonicalByKey\.set\(key, row\)|if \(!entry\[row\.report_type\]\) entry\[row\.report_type\] = row;/);
  assert.doesNotMatch(read('src/components/versions/versionDocumentStatus.js'), /if \(!entry\[row\.report_type\]\) entry\[row\.report_type\] = row;/);
  assert.doesNotMatch(read('src/components/proposal/library/useProposalLibrary.js'), /if \(!entry\[row\.report_type\]\) entry\[row\.report_type\] = row;/);
  assert.doesNotMatch(read('src/components/library/issuedDocument/proposalExportSource.js'), /if \(!entry\[snapshot\.report_type\]\) entry\[snapshot\.report_type\] = snapshot;/);

  // The two halves are one rule: both implement the same order.
  assert.match(read('src/components/report/reportSnapshotCanonical.js'), /export function compareReportSnapshots/);
  assert.match(read('base44/shared/reportSnapshotCanonical.js'), /export function compareReportSnapshots/);
});