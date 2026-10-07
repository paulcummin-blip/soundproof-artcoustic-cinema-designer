// ---------------------------------------------------------------------------
// TEST   Report snapshot atomic save
// WHAT   A save that is refused writes NOTHING: the saved report keeps its
//        evidence, identity, timestamps and fingerprints exactly as stored. A
//        save that is accepted writes evidence, identity, timestamp and
//        fingerprints TOGETHER. Complete evidence is never downgraded.
// WHY    A half-written snapshot is what let a level-4 report read as its own
//        evidence beside another generation's identity — and what made a
//        regenerated report look stale against a fingerprint it never froze to.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  resolveEvidenceWrite,
  reportRowEvidenceState,
} from '../src/components/report/reportSnapshotCanonical.js';
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

const savedRow = () => reportRow({ id: 'saved-v4-technical', generatedAt: '2026-10-02T09:00:00.000Z', fingerprint: CURRENT });

const candidate = ({ fingerprint = STALE, evidence } = {}) => ({
  project_id: PROJECT,
  version_id: VERSION,
  report_type: 'technical',
  report_schema_version: 1,
  source_fingerprints: { engineeringFingerprint: fingerprint },
  generated_at: '2026-10-09T09:00:00.000Z',
  generated_by: 'Paul',
  status: 'current',
  payload: { reportEvidence: evidence, evidence_parity: { proposal_ready: true, mismatch_count: 0 } },
});

const serialise = (value) => JSON.stringify(value);

/* ── F — refused incoming evidence ─────────────────────────────────────────── */

const rejectHarness = await (async () => {
  const saved = savedRow();
  const instance = createSnapshotClient([saved]);
  const store = await loadSnapshotStore(instance.client);
  const before = serialise(instance.read(saved.id));
  const returned = await store.saveReportSnapshot({
    existing: saved,
    record: candidate({ evidence: incompleteEvidence({ reportType: 'technical' }) }),
    currentFingerprint: CURRENT,
  });
  return { instance, saved, before, after: serialise(instance.read(saved.id)), returned, calls: instance.calls };
})();

test('F — rejected incoming evidence leaves the saved snapshot byte-identical, with no write at all', () => {
  assert.equal(rejectHarness.after, rejectHarness.before, 'the stored row is unchanged');
  assert.deepEqual(rejectHarness.returned, JSON.parse(rejectHarness.before), 'the caller is handed the saved report');
  assert.deepEqual(
    rejectHarness.calls.filter((call) => call.op === 'update' || call.op === 'create'),
    [],
    'a refusal performs NO database mutation',
  );
  assert.equal(reportRowEvidenceState(JSON.parse(rejectHarness.after)), 'ready', 'complete evidence is still on the row');
});

/* ── G — valid update ──────────────────────────────────────────────────────── */

const acceptHarness = await (async () => {
  const saved = savedRow();
  const instance = createSnapshotClient([saved]);
  const store = await loadSnapshotStore(instance.client);
  const incoming = candidate({
    fingerprint: STALE,
    evidence: completeEvidence({ reportType: 'technical', fingerprint: STALE }),
  });
  const returned = await store.saveReportSnapshot({
    existing: saved,
    record: incoming,
    currentFingerprint: CURRENT,
  });
  return { instance, saved, returned, stored: instance.read(saved.id), calls: instance.calls };
})();

test('G — a valid update writes evidence, identity, timestamp and fingerprints together', () => {
  const { stored, calls } = acceptHarness;
  const updates = calls.filter((call) => call.op === 'update');
  assert.equal(updates.length, 1, 'exactly one update');
  assert.equal(updates[0].id, 'saved-v4-technical', 'it updates the row the version resolves to');
  assert.equal(calls.filter((call) => call.op === 'create').length, 0, 'no duplicate row is created');

  // Identity, timestamp and fingerprints all moved together …
  assert.equal(stored.source_fingerprints.engineeringFingerprint, STALE, 'the new authority fingerprint');
  assert.equal(stored.generated_at, '2026-10-09T09:00:00.000Z', 'the new generation time');
  assert.equal(stored.report_schema_version, 1);
  // … and the evidence that landed is the evidence of the SAME generation.
  assert.equal(stored.payload.reportEvidence.identity.source_fingerprint, STALE, 'evidence identity matches the row');
  assert.equal(validateReportEvidence(stored.payload.reportEvidence, 'technical').complete, true);
  assert.equal(reportRowEvidenceState(stored), 'ready');
});

/* ── H — interrupted save ──────────────────────────────────────────────────── */

const interruptedHarness = await (async () => {
  const saved = savedRow();
  const instance = createSnapshotClient([saved], { failUpdate: true });
  const store = await loadSnapshotStore(instance.client);
  const before = serialise(instance.read(saved.id));
  const error = await store
    .saveReportSnapshot({ existing: saved, record: candidate({ evidence: completeEvidence({ fingerprint: STALE }) }), currentFingerprint: CURRENT })
    .then(() => null, (thrown) => thrown);
  return { instance, before, after: serialise(instance.read(saved.id)), error, calls: instance.calls };
})();

test('H — an interrupted save propagates and leaves the saved snapshot unchanged', () => {
  assert.ok(interruptedHarness.error instanceof Error, 'the failure is not swallowed');
  assert.equal(interruptedHarness.after, interruptedHarness.before, 'the saved report is exactly as it stood');
  assert.equal(interruptedHarness.calls.filter((call) => call.op === 'create').length, 0, 'no half-written duplicate');
});

/* ── I — complete Current evidence cannot be downgraded ───────────────────── */

test('I — complete Current evidence cannot be downgraded, and evidence is never cleared', () => {
  const saved = savedRow();

  const downgrade = resolveEvidenceWrite({
    existing: saved,
    incoming: incompleteEvidence({ reportType: 'technical' }),
  });
  assert.equal(downgrade.rejected, true, 'the refused candidate is reported');
  assert.equal(downgrade.rejectedReason, 'incomplete-incoming-evidence');
  assert.equal(downgrade.preserved, true);
  assert.equal(downgrade.evidence, saved.payload.reportEvidence, 'the saved complete evidence is kept, not replaced');

  const none = resolveEvidenceWrite({ existing: saved, incoming: null });
  assert.equal(none.rejected, true, 'a save carrying no evidence does not blank the row');
  assert.equal(none.rejectedReason, 'no-incoming-evidence');
  assert.equal(none.evidence, saved.payload.reportEvidence);

  const upgrade = resolveEvidenceWrite({
    existing: saved,
    incoming: completeEvidence({ reportType: 'technical', fingerprint: STALE }),
  });
  assert.equal(upgrade.rejected, false, 'complete evidence over complete evidence is an accepted regeneration');
  assert.equal(upgrade.incomingReady, true);
  assert.equal(upgrade.evidence.identity.source_fingerprint, STALE);

  const fresh = resolveEvidenceWrite({ existing: null, incoming: completeEvidence({ reportType: 'technical' }) });
  assert.equal(fresh.rejected, false, 'a first generation onto an empty slot is written');
});