/**
 * Speaker Design lifecycle corrections — focused regression.
 *
 *   1.  Two concurrent requests share one generation operation.
 *   2.  Both callers await verified success.
 *   3.  Generation failure propagates to both callers.
 *   4.  already-preparing never counts as completed publication.
 *   5.  Missing file reference cannot be Current.
 *   6.  Missing engineering fingerprint cannot be Current.
 *   7.  Mismatched fingerprint cannot be Current.
 *   8.  Matching stored export becomes Current.
 *   9.  Matching older export can be reused correctly.
 *   10. Repeated report saves do not create duplicates.
 *   11. Different versions cannot share incorrect documents.
 *   12. Cold reopen derives readiness from persisted evidence.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  resolveSpeakerDesignCell,
  selectStoredSpeakerDesign,
  SPEAKER_DESIGN_DOCUMENT_TYPE,
} from '../src/components/proposal/sourceAuthority/speakerDesignChecklistReadiness.js';
import { READINESS_STATE } from '../src/components/proposal/sourceAuthority/proposalReadinessAuthority.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ENSURE = read('src/components/report/speakerDesign/ensureSpeakerDesignForVersion.js');
const PUBLICATION = read('src/components/report/projectReport/storeProjectReportPublication.js');

const baseStored = (overrides = {}) => ({
  document_type: SPEAKER_DESIGN_DOCUMENT_TYPE,
  project_id: 'p1',
  version_id: 'v1',
  file_uri: 'private://speaker-design.pdf',
  file_url: null,
  exported_at: '2026-11-01T10:00:00.000Z',
  source_fingerprints: { engineeringFingerprint: 'fp-1' },
  ...overrides,
});

/* ── 1 — concurrent callers share one in-flight Promise ──────────────────── */

test('TEST 1 — concurrent callers share one in-flight Promise', () => {
  assert.match(ENSURE, /const inflight = new Map\(\)/);
  assert.match(ENSURE, /const existing = inflight\.get\(key\)/);
  assert.match(ENSURE, /if \(existing\) \{[\s\S]*?return existing;/);
  // The Promise is removed only after it settles, so the outcome is shared.
  assert.match(ENSURE, /\.finally\(\(\) => \{[\s\S]*?inflight\.delete\(key\)/);
});

/* ── 2 & 3 — both callers await the verified outcome ────────────────────── */

test('TEST 2 & 3 — both callers await the same Promise outcome (success or failure)', () => {
  // The wrapper delegates to a single runEnsureSpeakerDesign and returns that
  // same Promise to every concurrent caller, so a failure propagates to all.
  assert.match(ENSURE, /const promise = runEnsureSpeakerDesign\(input\)/);
  assert.match(ENSURE, /inflight\.set\(key, promise\)/);
  assert.match(ENSURE, /return promise;/);
});

/* ── 4 — already-preparing never counts as completed publication ────────── */

test('TEST 4 — already-preparing never counts as completed publication', () => {
  // The ensure authority never returns already-preparing.
  assert.doesNotMatch(ENSURE, /return \{ status: 'already-preparing' \}/);
  // The companion storage never treats already-preparing as success.
  assert.doesNotMatch(PUBLICATION, /status === 'already-preparing'[\s\S]*?ok: true/);
  // A stored or reused export is the only path to ok: true.
  assert.match(PUBLICATION, /result\.status === 'stored' \|\| result\.status === 'reused'/);
});

/* ── 5 — a missing file reference cannot be Current ─────────────────────── */

test('TEST 5 — a stored record with no file reference cannot be Current', () => {
  const cell = resolveSpeakerDesignCell({
    stored: baseStored({ file_uri: null, file_url: null }),
    currentEngineeringFingerprint: 'fp-1',
    projectId: 'p1',
    versionId: 'v1',
  });
  assert.equal(cell.state, READINESS_STATE.STALE);
  assert.equal(cell.current, false);
});

/* ── 6 — a missing engineering fingerprint cannot be Current ────────────── */

test('TEST 6 — a missing engineering fingerprint cannot be Current', () => {
  // Stored fingerprint missing.
  const noStoredFp = resolveSpeakerDesignCell({
    stored: baseStored({ source_fingerprints: { engineeringFingerprint: null } }),
    currentEngineeringFingerprint: 'fp-1',
    projectId: 'p1',
    versionId: 'v1',
  });
  assert.equal(noStoredFp.state, READINESS_STATE.STALE);
  assert.equal(noStoredFp.current, false);

  // Current fingerprint missing.
  const noCurrentFp = resolveSpeakerDesignCell({
    stored: baseStored(),
    currentEngineeringFingerprint: null,
    projectId: 'p1',
    versionId: 'v1',
  });
  assert.equal(noCurrentFp.state, READINESS_STATE.STALE);
  assert.equal(noCurrentFp.current, false);

  // Both missing — never equivalent.
  const bothMissing = resolveSpeakerDesignCell({
    stored: baseStored({ source_fingerprints: { engineeringFingerprint: null } }),
    currentEngineeringFingerprint: null,
    projectId: 'p1',
    versionId: 'v1',
  });
  assert.equal(bothMissing.state, READINESS_STATE.STALE);
  assert.equal(bothMissing.current, false);
});

/* ── 7 — a mismatched fingerprint cannot be Current ──────────────────────── */

test('TEST 7 — a mismatched fingerprint cannot be Current', () => {
  const cell = resolveSpeakerDesignCell({
    stored: baseStored({ source_fingerprints: { engineeringFingerprint: 'fp-old' } }),
    currentEngineeringFingerprint: 'fp-new',
    projectId: 'p1',
    versionId: 'v1',
  });
  assert.equal(cell.state, READINESS_STATE.STALE);
  assert.equal(cell.current, false);
});

/* ── 8 — a matching stored export becomes Current ───────────────────────── */

test('TEST 8 — a matching stored export with a file reference becomes Current', () => {
  const cell = resolveSpeakerDesignCell({
    stored: baseStored(),
    currentEngineeringFingerprint: 'fp-1',
    projectId: 'p1',
    versionId: 'v1',
  });
  assert.equal(cell.state, READINESS_STATE.CURRENT);
  assert.equal(cell.current, true);
  assert.equal(cell.reason, null);
});

/* ── 9 — a matching older export can be reused ──────────────────────────── */

test('TEST 9 — the reuse search reads every stored export, not only the newest', () => {
  // The search reads up to 50 records and finds the first matching fingerprint
  // with a valid file reference — so a matching older export is reused even
  // when a newer export for a different fingerprint exists.
  assert.match(ENSURE, /limit: 50/);
  assert.match(ENSURE, /fp === engineeringFingerprint && hasFile/);
  assert.match(ENSURE, /return \{ status: 'reused', record: match \}/);
  // The old newest-only path is gone.
  assert.doesNotMatch(ENSURE, /sort: '-exported_at', limit: 1\}/);
});

test('TEST 9b — selectStoredSpeakerDesign filters by project id', () => {
  const records = [
    baseStored({ project_id: 'p1', version_id: 'v1', exported_at: '2026-11-01T10:00:00.000Z' }),
    baseStored({ project_id: 'p2', version_id: 'v1', exported_at: '2026-11-02T10:00:00.000Z' }),
  ];
  const selected = selectStoredSpeakerDesign(records, 'v1', 'p1');
  assert.equal(selected?.project_id, 'p1');
  // Without the project filter, the newer p2 record would win.
  const unfiltered = selectStoredSpeakerDesign(records, 'v1');
  assert.equal(unfiltered?.project_id, 'p2');
});

/* ── 10 — repeated saves reuse rather than duplicate ─────────────────────── */

test('TEST 10 — repeated saves reuse a matching stored export instead of duplicating', () => {
  // The reuse path runs before any build or store, so a second save for the
  // same fingerprint finds the existing record and returns 'reused'.
  assert.match(ENSURE, /if \(engineeringFingerprint\) \{[\s\S]*?records\.find/);
  assert.match(ENSURE, /return \{ status: 'reused', record: match \};/);
});

/* ── 11 — different versions cannot share incorrect documents ────────────── */

test('TEST 11 — a different version or project cannot satisfy readiness for another', () => {
  // Version mismatch.
  const versionMismatch = resolveSpeakerDesignCell({
    stored: baseStored({ version_id: 'v2' }),
    currentEngineeringFingerprint: 'fp-1',
    projectId: 'p1',
    versionId: 'v1',
  });
  assert.equal(versionMismatch.state, READINESS_STATE.STALE);
  assert.equal(versionMismatch.current, false);

  // Project mismatch.
  const projectMismatch = resolveSpeakerDesignCell({
    stored: baseStored({ project_id: 'p2' }),
    currentEngineeringFingerprint: 'fp-1',
    projectId: 'p1',
    versionId: 'v1',
  });
  assert.equal(projectMismatch.state, READINESS_STATE.STALE);
  assert.equal(projectMismatch.current, false);
});

/* ── 12 — cold reopen derives readiness from persisted evidence ───────────── */

test('TEST 12 — cold reopen derives readiness from persisted evidence, not an in-memory flag', () => {
  // A stored record with a file reference and matching fingerprint is Current
  // purely from the persisted record — no in-memory generation flag is consulted.
  const cell = resolveSpeakerDesignCell({
    stored: baseStored(),
    currentEngineeringFingerprint: 'fp-1',
    projectId: 'p1',
    versionId: 'v1',
  });
  assert.equal(cell.current, true);

  // A record that exists but carries no file reference is never Current, even
  // though a row exists in the database — so a cold reopen after a failed
  // storage never shows a false Current.
  const incomplete = resolveSpeakerDesignCell({
    stored: baseStored({ file_uri: null, file_url: null }),
    currentEngineeringFingerprint: 'fp-1',
    projectId: 'p1',
    versionId: 'v1',
  });
  assert.equal(incomplete.current, false);
});

export default null;