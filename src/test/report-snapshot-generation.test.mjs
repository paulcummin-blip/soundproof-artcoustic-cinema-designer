/**
 * How a report snapshot is saved, and what keeps it Current for proposal
 * generation afterwards.
 *
 * The contract this guards:
 *   1. A newly generated report saves everything Proposal Centre reads AT THE
 *      SAME TIME, so Proposal Centre shows it Current immediately — it never
 *      needs opening again and never shows a refresh state.
 *   2. The saved report records the version's PUBLISHED engineering fingerprint,
 *      which is the fingerprint the version pointer holds and the one proposal
 *      readiness compares against.
 *   3. A report therefore becomes Stale only when that fingerprint moves on. A
 *      version record's own modified time is never consulted: opening the
 *      project, exporting a PDF, storing a library asset or generating a
 *      proposal all touch that record without changing the design.
 *   4. A legacy snapshot (saved before the proposal evidence capture existed)
 *      reads as a ONE-TIME evidence refresh, never as recurring maintenance and
 *      never as a missing report.
 *
 * Read-only: pure functions and source text. Writes nothing, reads no entity.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSavedSourceFingerprints,
  buildSnapshotRecord,
  buildSourceFingerprints,
} from '../components/report/reportSnapshotAuthority.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const HOOK = read('src/components/report/useReportSnapshot.js');
const READER = read('base44/shared/proposalReportEvidenceReader.js');
const READINESS_HOOK = read('src/components/proposal/sourceAuthority/useProposalReadiness.js');

/* ── 1. What a new report is saved with ─────────────────────────────────── */

test('a report is saved with the version published engineering fingerprint', () => {
  const saved = buildSavedSourceFingerprints({
    currentFingerprints: {
      engineeringFingerprint: null,
      calculationFingerprint: 'bass:v1:abc',
      seatPriorityFingerprint: 'seat:v1:def',
    },
    publishedFingerprint: 'eng:v1:c19ceb2efb6c3d9c',
  });

  assert.equal(
    saved.engineeringFingerprint,
    'eng:v1:c19ceb2efb6c3d9c',
    'the published engineering fingerprint identifies the design the report came from',
  );
  // The values the handoff did state are never discarded.
  assert.equal(saved.calculationFingerprint, 'bass:v1:abc');
  assert.equal(saved.seatPriorityFingerprint, 'seat:v1:def');
});

test('a stated fingerprint is never replaced, and no publication means no fingerprint', () => {
  const stated = buildSourceFingerprints({ engineeringFingerprint: 'eng:v1:from-handoff' });
  assert.equal(
    buildSavedSourceFingerprints({ currentFingerprints: stated, publishedFingerprint: 'eng:v1:other' })
      .engineeringFingerprint,
    'eng:v1:from-handoff',
  );

  // A version that has never published has nothing to state, so the key stays
  // empty: staleness is never manufactured from a fingerprint that does not exist.
  assert.equal(
    buildSavedSourceFingerprints({ currentFingerprints: { calculationFingerprint: 'bass:v1:abc' }, publishedFingerprint: null })
      .engineeringFingerprint,
    null,
  );
});

test('a newly generated report saves everything proposal readiness reads', () => {
  const record = buildSnapshotRecord({
    projectId: 'p1',
    versionId: 'v4',
    accountId: 'a1',
    reportType: 'technical',
    sourceFingerprints: { engineeringFingerprint: 'eng:v1:x' },
    generatedBy: 'Paul',
    payload: {
      engineeringFingerprint: 'eng:v1:x',
      presentation: {},
      pages: [],
      proposalSource: { report_source_version: 1, report_parameters: [] },
      reportEvidence: { evidence_version: 1, proposal_ready: true, evidence_fingerprint: 're1-x' },
    },
  });

  // Acceptance A/B: identity, status and every field the comparison reads.
  assert.equal(record.project_id, 'p1');
  assert.equal(record.version_id, 'v4');
  assert.equal(record.account_id, 'a1');
  assert.equal(record.report_type, 'technical');
  assert.equal(record.status, 'current', 'a newly generated report is Current, not a refresh state');
  assert.equal(record.source_fingerprints.engineeringFingerprint, 'eng:v1:x');
  assert.ok(record.generated_at, 'the generated date is saved with the report');
  assert.equal(record.generated_by, 'Paul');
  assert.ok(record.payload.proposalSource, 'the report keeps its own frozen source');
  assert.ok(record.payload.reportEvidence, 'the machine-readable evidence is saved with the report');
});

/* ── 2. The save path itself ────────────────────────────────────────────── */

test('the proposal evidence is captured on the save path, not on a later visit', () => {
  assert.match(HOOK, /captureReportProposalSource\(/, 'the report saves its own proposal evidence');
  assert.match(
    HOOK,
    /reportEvidence: evidence,\n\s+evidence_parity: buildParityRecord\(parity\)/,
    'the evidence is written into the same payload as the report, with its parity outcome',
  );
  assert.match(HOOK, /buildSavedSourceFingerprints\(/, 'the published engineering fingerprint is recorded');
  assert.match(HOOK, /publishedFingerprint: version\.published_fingerprint/);

  // The report save waits for the project record the capture reads, so a report
  // generated on a fast in-session load still saves complete evidence NOW instead
  // of leaving a snapshot that has to be opened again. The evidence backfill does
  // NOT wait for it: it reads the report's own stored frozen source only.
  const waits = HOOK.match(/if \(!reportSource\?\.project\) return;/g) || [];
  assert.equal(waits.length, 1, 'the report save waits for the project record; the evidence backfill never does');
});

test('the legacy backfill augments a CURRENT report in place, and never a stale one', () => {
  assert.match(
    HOOK,
    /if \(resolution\.status !== REPORT_SNAPSHOT_STATUS\.CURRENT\) return;/,
    'a report the design has moved past is left to Regenerate, never silently refreshed',
  );
  assert.match(HOOK, /if \(readStoredEvidence\(saved\)\) return;/, 'a report that already carries evidence is left alone');
  // The backfill reads the report's OWN stored frozen source. It never reads the
  // live project, so a report opened after the design moved on cannot have its
  // evidence rebuilt from the current design.
  assert.match(HOOK, /const stored = saved\.payload\?\.proposalSource;/, 'recovery reads the report frozen source');
  assert.match(HOOK, /captured: stored,/, 'the evidence is rebuilt from that stored source alone');
});

/* ── 3. What decides staleness ──────────────────────────────────────────── */

test('staleness is the published fingerprint, never a version record modified time', () => {
  assert.match(
    READER,
    /version\.published_fingerprint/,
    'the design the report came from is compared with the design the version holds now',
  );
  assert.doesNotMatch(
    READER,
    /updated_date/,
    'a record modified time never decides whether a report can be used',
  );
});

test('the readiness table judges a report by fingerprints, never by a modified time', () => {
  assert.match(
    READINESS_HOOK,
    /compareSourceFingerprints\(saved\.source_fingerprints, currentFingerprints\)/,
    'the table uses the same fingerprint comparison the report page uses',
  );
  assert.doesNotMatch(READINESS_HOOK, /updated_date/, 'a record modified time never decides readiness');
});

/* ── 4. How a legacy snapshot reads ─────────────────────────────────────── */

test('a legacy report reads as a one-time refresh in both the client and server authority', () => {
  for (const relative of [
    'src/components/proposal/sourceAuthority/proposalReadinessAuthority.js',
    'base44/shared/proposalReadinessAuthority.js',
  ]) {
    const source = read(relative);
    assert.match(source, /\[READINESS_STATE\.LEGACY\]: 'Needs one-time evidence refresh'/);
    assert.match(source, /one-time evidence refresh/);
    assert.doesNotMatch(source, /but it needs refreshing for proposal comparison/);
  }
});

test('the legacy wording never describes a report that exists as missing', () => {
  assert.match(READER, /Report is current, but it needs a one-time evidence refresh/);
  assert.doesNotMatch(READER, /missing .*Report exists/);
});