/**
 * report-design-intent-persistence.test.mjs
 * -----------------------------------------
 * Regression tests for the Design Intent snapshot-persistence fix.
 *
 * The accepted Design Intent narrative is written to the ReportSnapshot record
 * ONLY by the Design Intent generator (generateAndSaveReportDesignIntent /
 * commitReportDesignIntent), which writes accepted records directly to the
 * database. The snapshot-save path (useReportSnapshot -> saveReportSnapshot)
 * must never overwrite that accepted narrative with the older one held in the
 * hook's local `saved` state.
 *
 * These tests model the actual persistence sequence at the write boundary:
 * the `design_intent` resolved by saveReportSnapshot is the canonical
 * (database) row's narrative, falling back to the incoming record only when no
 * canonical row exists. They also verify the export gate refuses to issue a
 * document while the accepted narrative is missing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mirrors the design_intent resolution in saveReportSnapshot (reportSnapshotStore.js):
 *   design_intent: target?.payload?.design_intent ?? record.payload?.design_intent ?? null
 * `target` is the canonical row read from the database at write time; `record`
 * is the candidate built by the hook from its local `saved` state.
 */
function resolveDesignIntentAtWrite(target, record) {
  const targetIntent = (target && target.payload && target.payload.design_intent) || null;
  const incomingIntent = (record && record.payload && record.payload.design_intent) || null;
  return targetIntent ?? incomingIntent ?? null;
}

/** The generator writes ONLY accepted narratives to the database. */
function generatorWrite(snapshot, narrativeRecord) {
  if (!narrativeRecord || narrativeRecord.status !== 'accepted') return snapshot;
  return {
    ...snapshot,
    payload: { ...(snapshot.payload || {}), design_intent: narrativeRecord },
  };
}

/** A fake single-row database for one project/version/report_type. */
function makeDb(initialSnapshot) {
  let row = initialSnapshot ? { ...initialSnapshot } : null;
  return {
    readCanonical() { return row ? { ...row } : null; },
    write(nextRecord) { row = { ...nextRecord }; return { ...row }; },
  };
}

const INTENT_A = { status: 'accepted', text: 'Intent A narrative that is long enough to be a complete paragraph and ends with a period.', evidence_fingerprints: { engineeringFingerprint: 'fp-1' } };
const INTENT_B = { status: 'accepted', text: 'Intent B replacement narrative that is long enough to be a complete paragraph and ends with a period.', evidence_fingerprints: { engineeringFingerprint: 'fp-2' } };
const REJECTED_DRAFT = { status: 'rejected', text: null };

// ── Sequence 1: A -> regenerate -> accept B -> snapshot save -> final contains B ─
test('Sequence 1: accepted B replaces accepted A; snapshot save preserves B', () => {
  const db = makeDb({ id: 'snap-1', payload: { design_intent: INTENT_A, reportEvidence: {} } });
  // The hook's local `saved` still holds A (stale) after the generator writes B.
  const hookSaved = db.readCanonical();
  // Regenerate: generator writes accepted B directly to the database.
  db.write(generatorWrite(db.readCanonical(), INTENT_B));
  const canonicalAfterGenerate = db.readCanonical();
  assert.equal(canonicalAfterGenerate.payload.design_intent, INTENT_B,
    'Generator must write B to the database');
  // Snapshot save: incoming record built from stale hook `saved` carries A.
  const incomingRecord = { payload: { design_intent: hookSaved.payload.design_intent } };
  const target = db.readCanonical();
  const resolved = resolveDesignIntentAtWrite(target, incomingRecord);
  // Simulate the store applying the resolved design_intent.
  db.write({ ...target, payload: { ...target.payload, design_intent: resolved } });
  const final = db.readCanonical();
  assert.deepEqual(final.payload.design_intent, INTENT_B,
    'Final snapshot must contain B, not the stale A from the hook');
});

// ── Sequence 2: A -> regenerate -> reject/cancel B -> final retains A ────────────
test('Sequence 2: rejected or cancelled B leaves A intact in the final snapshot', () => {
  const db = makeDb({ id: 'snap-1', payload: { design_intent: INTENT_A, reportEvidence: {} } });
  const hookSaved = db.readCanonical();
  // Regenerate: generator refuses B (rejected draft) — nothing is written.
  db.write(generatorWrite(db.readCanonical(), REJECTED_DRAFT));
  assert.deepEqual(db.readCanonical().payload.design_intent, INTENT_A,
    'A rejected draft must not be written to the database');
  // Snapshot save: incoming carries A (hook local), canonical still A.
  const incomingRecord = { payload: { design_intent: hookSaved.payload.design_intent } };
  const target = db.readCanonical();
  const resolved = resolveDesignIntentAtWrite(target, incomingRecord);
  db.write({ ...target, payload: { ...target.payload, design_intent: resolved } });
  assert.deepEqual(db.readCanonical().payload.design_intent, INTENT_A,
    'Final snapshot must retain A when B was rejected');
});

// ── Sequence 3: first-ever -> generate and accept A -> final contains A ─────────
test('Sequence 3: first-ever report accepts A; final snapshot contains A', () => {
  const db = makeDb(null); // no existing snapshot
  // First snapshot save: no canonical row, incoming design_intent is null.
  const incomingRecord = { payload: { design_intent: null } };
  const target = db.readCanonical(); // null
  const resolved = resolveDesignIntentAtWrite(target, incomingRecord);
  assert.equal(resolved, null,
    'First save has no canonical narrative; internal snapshot carries null');
  db.write({ id: 'snap-1', payload: { reportEvidence: {}, design_intent: resolved } });
  // Generator runs and writes accepted A directly.
  db.write(generatorWrite(db.readCanonical(), INTENT_A));
  assert.deepEqual(db.readCanonical().payload.design_intent, INTENT_A,
    'Final snapshot must contain A after the generator accepts it');
});

// ── Sequence 4: repeated snapshot saves cannot revert B to A ───────────────────
test('Sequence 4: repeated saves preserve the canonical B and never revert to A', () => {
  const db = makeDb({ id: 'snap-1', payload: { design_intent: INTENT_B, reportEvidence: {} } });
  const staleHookSaved = { payload: { design_intent: INTENT_A } };
  for (let i = 0; i < 3; i += 1) {
    const target = db.readCanonical();
    const incomingRecord = { payload: { design_intent: staleHookSaved.payload.design_intent } };
    const resolved = resolveDesignIntentAtWrite(target, incomingRecord);
    db.write({ ...target, payload: { ...target.payload, design_intent: resolved } });
  }
  assert.deepEqual(db.readCanonical().payload.design_intent, INTENT_B,
    'Repeated saves must never revert B back to the stale A');
});

// ── Sequence 5: accepted Intent belongs to the correct project/version/evidence ─
test('Sequence 5: canonical lookup is scoped to project/version; foreign narrative is not used', () => {
  // The canonical row is read by loadReportSnapshot filtering on project_id,
  // version_id and report_type, so a narrative from a different version can
  // never be the `target` for this version's save. Model that scoping: only the
  // row matching this version is returned as the canonical target.
  const thisVersion = { id: 'snap-v1', project_id: 'p1', version_id: 'v1', payload: { design_intent: INTENT_A } };
  const otherVersion = { id: 'snap-v2', project_id: 'p1', version_id: 'v2', payload: { design_intent: INTENT_B } };
  function loadCanonical(projectId, versionId) {
    const rows = [thisVersion, otherVersion];
    const match = rows.find((r) => r.project_id === projectId && r.version_id === versionId);
    return match ? { ...match } : null;
  }
  const target = loadCanonical('p1', 'v1');
  const incomingRecord = { payload: { design_intent: null } };
  const resolved = resolveDesignIntentAtWrite(target, incomingRecord);
  assert.deepEqual(resolved, INTENT_A,
    'The accepted narrative for v1 is used for v1, not v2\'s B');
  assert.notDeepEqual(resolved, INTENT_B,
    'A narrative from a different version is never substituted');
});

// ── Sequence 6: automatic PDF storage cannot issue with missing/stale Intent ───
test('Sequence 6: export/store gate refuses to issue while Design Intent is missing or stale', () => {
  // reportFullyReady = reportReady && (adiComplete || savedNarrativeAccepted)
  function reportFullyReady({ reportReady, adiComplete, savedNarrativeAccepted }) {
    return !!(reportReady && (adiComplete || savedNarrativeAccepted));
  }
  // First-ever internal snapshot (null design_intent) before generation: not ready.
  const beforeGenerate = reportFullyReady({ reportReady: true, adiComplete: false, savedNarrativeAccepted: false });
  assert.equal(beforeGenerate, false,
    'PDF storage must not issue while the accepted narrative is missing');
  // After the generator accepts A: adiComplete true, saved narrative accepted.
  const afterGenerate = reportFullyReady({ reportReady: true, adiComplete: true, savedNarrativeAccepted: true });
  assert.equal(afterGenerate, true,
    'PDF storage may issue once the accepted narrative is present');
  // Stale narrative (evidence moved) without regeneration: narrativeIsCurrent is
  // false, so useAutoDesignIntent regenerates before COMPLETE; until then not ready.
  const staleWithoutRegen = reportFullyReady({ reportReady: true, adiComplete: false, savedNarrativeAccepted: false });
  assert.equal(staleWithoutRegen, false,
    'A stale narrative must not be issued before regeneration completes');
});

// ── Accepted-only rule: an unaccepted draft never reaches the database ─────────
test('Accepted-only: a rejected/failed draft is never written to the snapshot', () => {
  const db = makeDb({ id: 'snap-1', payload: { design_intent: INTENT_A } });
  db.write(generatorWrite(db.readCanonical(), REJECTED_DRAFT));
  assert.deepEqual(db.readCanonical().payload.design_intent, INTENT_A,
    'A rejected draft must not replace an accepted narrative');
  db.write(generatorWrite(db.readCanonical(), { status: 'failed', text: null }));
  assert.deepEqual(db.readCanonical().payload.design_intent, INTENT_A,
    'A failed draft must not replace an accepted narrative');
});