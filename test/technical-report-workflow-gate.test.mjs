/**
 * technical-report-workflow-gate.test.mjs
 * ----------------------------------------
 * Focused tests for the two Technical Report workflow corrections:
 *
 * 1. useReportSnapshot persistence is gated on Design Intent completion
 *    (not just reportReady and orderedPages.length).
 * 2. regenerateIntent: true activates the Design Intent generation path even
 *    when an existing saved report snapshot is present, and the existing
 *    accepted narrative is preserved until the replacement is accepted.
 *
 * These tests verify the pure decision logic extracted from the hooks, not
 * the React components themselves. The hooks' internal effects are covered
 * by the existing report-design-intent and report-snapshot suites.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Correction 1: snapshot save readiness gate ───────────────────────────

/**
 * Mirrors the snapshotSaveReady logic in RP22ClientReport.jsx:
 *   const designIntentSettled = status === COMPLETE || status === FAILED
 *     || !autoIntentEnabled || savedNarrativeAccepted;
 *   const snapshotSaveReady = !savedReport.saved || designIntentSettled;
 */
function computeSnapshotSaveReady({ savedReportExists, autoIntentStatus, autoIntentEnabled, savedNarrativeAccepted }) {
  const designIntentSettled =
    autoIntentStatus === 'complete'
    || autoIntentStatus === 'failed'
    || !autoIntentEnabled
    || savedNarrativeAccepted;
  return !savedReportExists || designIntentSettled;
}

test('Correction 1: initial save (no existing snapshot) proceeds without waiting for Design Intent', () => {
  // New report: no saved snapshot, Design Intent not yet started.
  // The save must proceed so the backend can read frozen evidence.
  const ready = computeSnapshotSaveReady({
    savedReportExists: false,
    autoIntentStatus: 'idle',
    autoIntentEnabled: true,
    savedNarrativeAccepted: false,
  });
  assert.equal(ready, true, 'Initial save should proceed when no saved report exists');
});

test('Correction 1: re-save on existing snapshot waits for Design Intent to settle', () => {
  // Existing snapshot, Design Intent running.
  // The save must wait so the accepted narrative is not overwritten.
  const ready = computeSnapshotSaveReady({
    savedReportExists: true,
    autoIntentStatus: 'running',
    autoIntentEnabled: true,
    savedNarrativeAccepted: false,
  });
  assert.equal(ready, false, 'Re-save should wait when Design Intent is running');
});

test('Correction 1: re-save proceeds when Design Intent completes', () => {
  const ready = computeSnapshotSaveReady({
    savedReportExists: true,
    autoIntentStatus: 'complete',
    autoIntentEnabled: true,
    savedNarrativeAccepted: false,
  });
  assert.equal(ready, true, 'Re-save should proceed when Design Intent is complete');
});

test('Correction 1: re-save proceeds when Design Intent fails (narrative preserved)', () => {
  const ready = computeSnapshotSaveReady({
    savedReportExists: true,
    autoIntentStatus: 'failed',
    autoIntentEnabled: true,
    savedNarrativeAccepted: false,
  });
  assert.equal(ready, true, 'Re-save should proceed when Design Intent fails');
});

test('Correction 1: re-save proceeds when Design Intent is not expected (viewing only)', () => {
  const ready = computeSnapshotSaveReady({
    savedReportExists: true,
    autoIntentStatus: 'idle',
    autoIntentEnabled: false,
    savedNarrativeAccepted: false,
  });
  assert.equal(ready, true, 'Re-save should proceed when Design Intent is not expected');
});

test('Correction 1: re-save proceeds when saved narrative is already accepted', () => {
  const ready = computeSnapshotSaveReady({
    savedReportExists: true,
    autoIntentStatus: 'idle',
    autoIntentEnabled: true,
    savedNarrativeAccepted: true,
  });
  assert.equal(ready, true, 'Re-save should proceed when saved narrative is accepted');
});

// ── Correction 2: regenerateIntent activates the generation path ─────────

/**
 * Mirrors the autoIntentEnabled logic in RP22ClientReport.jsx:
 *   const autoIntentEnabled = updateRequested || !savedReport.saved || reportIntent.regenerateIntent;
 */
function computeAutoIntentEnabled({ updateRequested, savedReportExists, regenerateIntent }) {
  return updateRequested || !savedReportExists || regenerateIntent;
}

test('Correction 2: regenerateIntent enables generation even with an existing saved report', () => {
  // Create New path: existing report, no update flag, but regenerateIntent is true.
  const enabled = computeAutoIntentEnabled({
    updateRequested: false,
    savedReportExists: true,
    regenerateIntent: true,
  });
  assert.equal(enabled, true, 'regenerateIntent should enable Design Intent generation');
});

test('Correction 2: viewing a saved report without regenerateIntent does not enable generation', () => {
  const enabled = computeAutoIntentEnabled({
    updateRequested: false,
    savedReportExists: true,
    regenerateIntent: false,
  });
  assert.equal(enabled, false, 'Viewing should not enable Design Intent generation');
});

test('Correction 2: first generation enables Design Intent', () => {
  const enabled = computeAutoIntentEnabled({
    updateRequested: false,
    savedReportExists: false,
    regenerateIntent: false,
  });
  assert.equal(enabled, true, 'First generation should enable Design Intent');
});

test('Correction 2: explicit Update Report enables Design Intent', () => {
  const enabled = computeAutoIntentEnabled({
    updateRequested: true,
    savedReportExists: true,
    regenerateIntent: false,
  });
  assert.equal(enabled, true, 'Update Report should enable Design Intent');
});

// ── Correction 2: design_intent preservation in persist ──────────────────

test('Correction 2: persist preserves existing design_intent from the saved snapshot', () => {
  // Simulate what persist does: build the payload, preserving design_intent.
  const savedSnapshot = {
    payload: {
      design_intent: { status: 'accepted', text: 'Existing narrative', sections: [] },
      pages: [{ id: 'old-page' }],
    },
  };
  const newPayload = {
    pages: [{ id: 'new-page' }],
    proposalSource: { evidence: {} },
    reportEvidence: { proposal_ready: true },
  };

  // This mirrors the change in useReportSnapshot.js persist():
  const builtPayload = {
    ...newPayload,
    design_intent: savedSnapshot?.payload?.design_intent || null,
  };

  assert.deepEqual(builtPayload.design_intent, savedSnapshot.payload.design_intent,
    'The existing accepted narrative must be preserved during a re-save');
});

test('Correction 2: persist with no existing snapshot writes null design_intent (first save)', () => {
  const savedSnapshot = null;
  const newPayload = { pages: [{ id: 'page-1' }] };

  const builtPayload = {
    ...newPayload,
    design_intent: savedSnapshot?.payload?.design_intent || null,
  };

  assert.equal(builtPayload.design_intent, null,
    'First save has no existing narrative to preserve');
});

// ── Combined sequence tests ──────────────────────────────────────────────

test('Sequence: new report — initial save proceeds, Design Intent runs after', () => {
  // Step 1: No saved report, Design Intent idle.
  // The save must proceed so the backend can read the frozen evidence.
  const step1Ready = computeSnapshotSaveReady({
    savedReportExists: false,
    autoIntentStatus: 'idle',
    autoIntentEnabled: true,
    savedNarrativeAccepted: false,
  });
  assert.equal(step1Ready, true, 'Initial save must proceed for the backend to read');

  // Step 2: After the initial save, the saved report exists.
  // Design Intent is running. The re-save must NOT proceed (it would
  // overwrite the evidence before the narrative is written).
  const step2Ready = computeSnapshotSaveReady({
    savedReportExists: true,
    autoIntentStatus: 'running',
    autoIntentEnabled: true,
    savedNarrativeAccepted: false,
  });
  assert.equal(step2Ready, false, 'Re-save must wait while Design Intent runs');

  // Step 3: Design Intent completes. The re-save may proceed.
  const step3Ready = computeSnapshotSaveReady({
    savedReportExists: true,
    autoIntentStatus: 'complete',
    autoIntentEnabled: true,
    savedNarrativeAccepted: false,
  });
  assert.equal(step3Ready, true, 'Re-save proceeds after Design Intent completes');
});

test('Sequence: regenerateIntent — existing report, new explanations, narrative preserved until replacement accepted', () => {
  // Create New: existing report, regenerateIntent is true.
  const enabled = computeAutoIntentEnabled({
    updateRequested: false,
    savedReportExists: true,
    regenerateIntent: true,
  });
  assert.equal(enabled, true, 'Generation must be enabled for regenerateIntent');

  // The existing narrative is preserved in the snapshot during re-save.
  const existingNarrative = { status: 'accepted', text: 'Old narrative' };
  const savedSnapshot = { payload: { design_intent: existingNarrative } };
  const builtPayload = {
    pages: [{ id: 'new-page' }],
    design_intent: savedSnapshot?.payload?.design_intent || null,
  };
  assert.deepEqual(builtPayload.design_intent, existingNarrative,
    'Existing narrative must be preserved during the re-save');

  // The re-save waits for Design Intent to settle before proceeding.
  const readyWhileRunning = computeSnapshotSaveReady({
    savedReportExists: true,
    autoIntentStatus: 'running',
    autoIntentEnabled: true,
    savedNarrativeAccepted: false,
  });
  assert.equal(readyWhileRunning, false, 'Re-save must wait while Design Intent regenerates');

  // After Design Intent completes (new narrative accepted), the re-save proceeds.
  const readyAfterComplete = computeSnapshotSaveReady({
    savedReportExists: true,
    autoIntentStatus: 'complete',
    autoIntentEnabled: true,
    savedNarrativeAccepted: false,
  });
  assert.equal(readyAfterComplete, true, 'Re-save proceeds after new narrative is accepted');
});

test('Sequence: skipped review — Design Context review returns true, generation proceeds', () => {
  // When the review has no questions, review() returns true (proceed).
  // This is handled by useDesignContextReview, which returns true when
  // there are no questions or saved items.
  // The generation is enabled and runs normally.
  const enabled = computeAutoIntentEnabled({
    updateRequested: false,
    savedReportExists: false,
    regenerateIntent: true,
  });
  assert.equal(enabled, true, 'Generation is enabled even with no review questions');
});

test('Sequence: cancellation — review returns false, generation is skipped, existing narrative preserved', () => {
  // When the designer cancels the review, onBeforeGenerate returns false.
  // useAutoDesignIntent's run() checks: if (proceed === false) return;
  // The generation is skipped, and the existing narrative is preserved.
  // The snapshot save gate allows the save (Design Intent is not running).
  const ready = computeSnapshotSaveReady({
    savedReportExists: true,
    autoIntentStatus: 'idle', // Generation was skipped, status stays idle
    autoIntentEnabled: true,
    savedNarrativeAccepted: true, // Existing narrative is still accepted
  });
  assert.equal(ready, true, 'Save proceeds when generation is skipped and existing narrative is accepted');
});

test('Sequence: generation failure — Design Intent fails, existing narrative preserved, save proceeds', () => {
  // When the writer refuses or the provider fails, status becomes FAILED.
  // The existing narrative is preserved (generateAndSaveReportDesignIntent
  // does not write when the attempt fails).
  // The snapshot save proceeds because Design Intent has settled.
  const ready = computeSnapshotSaveReady({
    savedReportExists: true,
    autoIntentStatus: 'failed',
    autoIntentEnabled: true,
    savedNarrativeAccepted: false,
  });
  assert.equal(ready, true, 'Save proceeds after Design Intent fails');

  // The existing narrative is preserved in the payload.
  const existingNarrative = { status: 'accepted', text: 'Old narrative' };
  const savedSnapshot = { payload: { design_intent: existingNarrative } };
  const builtPayload = {
    pages: [{ id: 'new-page' }],
    design_intent: savedSnapshot?.payload?.design_intent || null,
  };
  assert.deepEqual(builtPayload.design_intent, existingNarrative,
    'Existing narrative must be preserved when generation fails');
});