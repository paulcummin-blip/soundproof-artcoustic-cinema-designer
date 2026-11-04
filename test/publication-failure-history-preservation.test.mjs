// Regression tests for Case B: preserve completed optimiser run history when
// bass publication fails.
//
// These tests verify the DECISION LOGIC that separates optimiser completion
// from publication completion. They do not require the base44 SDK — they test
// the pure contracts the catch blocks and history functions must follow.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HISTORY_MODULE_PATH = new URL(
  '../src/components/room/bass/optimiserPlan/optimiserRunHistory.js',
  import.meta.url,
).pathname;

const OPTIMISE_AND_CALCULATE_PATH = new URL(
  '../src/components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx',
  import.meta.url,
).pathname;

const USE_RUN_OPTIMISATION_PLAN_PATH = new URL(
  '../src/components/room/bass/optimiseWorkflow/useRunOptimisationPlan.js',
  import.meta.url,
).pathname;

// ── Source-level contract checks (no SDK needed) ──

function readSource(path) {
  return readFileSync(path, 'utf-8');
}

describe('Case B — publication failure history preservation', () => {

  // 1. optimiser complete + publication success → history written, publication current
  it('1: success path updates pre-written row to "published" (not a new row)', () => {
    const source = readSource(OPTIMISE_AND_CALCULATE_PATH);
    assert.ok(
      source.includes('publicationStatus: "published"'),
      'success path must set publicationStatus "published"',
    );
    assert.ok(
      source.includes('updateOptimiserRunHistoryPublication'),
      'success path must update the pre-written row',
    );
  });

  // 2. optimiser complete + publication HTTP failure → history still written, publication failed
  it('2: catch block with optimiserCompleted=true records publication "failed" (not "not_attempted")', () => {
    const source = readSource(OPTIMISE_AND_CALCULATE_PATH);
    assert.ok(
      source.includes('optimiserCompleted'),
      'optimiserCompleted flag must exist',
    );
    assert.ok(
      source.includes('if (optimiserCompleted)'),
      'catch block must branch on optimiserCompleted',
    );
    // The entire catch block (from "if (optimiserCompleted)" to "} finally {")
    const catchStart = source.indexOf('if (optimiserCompleted)');
    const catchEnd = source.indexOf('} finally {', catchStart);
    const catchBlock = source.slice(catchStart, catchEnd);
    assert.ok(
      catchBlock.includes('publicationStatus: "failed"'),
      'completed-then-failed must be "failed", not "not_attempted"',
    );
    // The completed branch ends at the "GENUINE OPTIMISER FAILURE" comment.
    const catchStart2 = source.indexOf('if (optimiserCompleted)');
    const elseMarker2 = source.indexOf('GENUINE OPTIMISER FAILURE', catchStart2);
    const completedBranch2 = source.slice(catchStart2, elseMarker2);
    assert.ok(
      !completedBranch2.includes('saveRunFailure('),
      'completed-then-failed must NOT call saveRunFailure (only mention in comments is OK)',
    );
  });

  // 3. optimiser complete + publication timeout → history still written
  it('3: pre-write occurs before any publication wait can return', () => {
    const source = readSource(OPTIMISE_AND_CALCULATE_PATH);
    const preWriteIndex = source.indexOf('publicationStatus: "pending"');
    const waitForIndex = source.indexOf('waitForCurrentPublication(sharedRef, phaseRef)', source.indexOf('Phase 4'));
    assert.ok(preWriteIndex > 0, 'pre-write with "pending" must exist');
    assert.ok(waitForIndex > 0, 'publication wait must exist in Phase 4');
    assert.ok(
      preWriteIndex < waitForIndex,
      'pre-write must occur BEFORE the publication wait',
    );
  });

  // 4. optimiser runId retained through publication failure
  it('4: runId is passed to updateOptimiserRunHistoryPublication in the catch block', () => {
    const source = readSource(OPTIMISE_AND_CALCULATE_PATH);
    const catchStart = source.indexOf('if (optimiserCompleted)');
    const elseMarker = source.indexOf('GENUINE OPTIMISER FAILURE', catchStart);
    const catchBlock = source.slice(catchStart, elseMarker);
    assert.ok(
      catchBlock.includes('runId: activeRun.runId'),
      'catch block must pass runId to the history update',
    );
  });

  // 5. applied electronic lever retained in history
  it('5: catch block does not call saveRunFailure when optimiser completed (plan evidence preserved)', () => {
    const source = readSource(OPTIMISE_AND_CALCULATE_PATH);
    const catchStart = source.indexOf('if (optimiserCompleted)');
    const elseMarker = source.indexOf('GENUINE OPTIMISER FAILURE', catchStart);
    const completedBranch = source.slice(catchStart, elseMarker);
    assert.ok(
      !completedBranch.includes('saveRunFailure('),
      'completed-then-failed must NOT call saveRunFailure (only mention in comments is OK)',
    );
    // The else branch (genuine failure) MUST call saveRunFailure
    const finallyIdx = source.indexOf('} finally {', catchStart);
    const elseBlock = source.slice(elseMarker, finallyIdx);
    assert.ok(
      elseBlock.includes('saveRunFailure'),
      'genuine failure path must still call saveRunFailure',
    );
  });

  // 6. winner/safety evidence retained
  it('6: catch block preserves runTerminalStatus (not relabelled "failed")', () => {
    const source = readSource(OPTIMISE_AND_CALCULATE_PATH);
    const catchStart = source.indexOf('if (optimiserCompleted)');
    const elseMarker = source.indexOf('GENUINE OPTIMISER FAILURE', catchStart);
    const completedBranch = source.slice(catchStart, elseMarker);
    assert.ok(
      completedBranch.includes('runTerminalStatus'),
      'catch block must use the optimiser\'s own terminal status, not "failed"',
    );
    assert.ok(
      !completedBranch.includes('terminalStatus: "failed"'),
      'completed-then-failed must NOT relabel as "failed"',
    );
  });

  // 7. reports/proposals remain blocked when publication not current
  it('7: user-facing message states optimisation completed but publication failed', () => {
    const source = readSource(OPTIMISE_AND_CALCULATE_PATH);
    assert.ok(
      source.includes('The optimisation completed, but the updated bass result could not be published'),
      'user-facing message must distinguish publication failure from optimiser failure',
    );
  });

  // 8. publication retry does not create a new optimiser run
  it('8: pre-written row is updated in place (not a second create)', () => {
    const source = readSource(OPTIMISE_AND_CALCULATE_PATH);
    assert.ok(
      source.includes('historyPreWritten'),
      'historyPreWritten flag must exist',
    );
    const catchStart = source.indexOf('if (optimiserCompleted)');
    const catchEnd = source.indexOf('} finally {', catchStart);
    const catchBlock = source.slice(catchStart, catchEnd);
    assert.ok(
      catchBlock.includes('if (historyPreWritten)'),
      'catch block must check historyPreWritten to update vs create',
    );
    assert.ok(
      catchBlock.includes('updateOptimiserRunHistoryPublication'),
      'catch block must update the existing row when pre-written',
    );
  });

  // 9. genuine optimiser computation failure remains distinct
  it('9: genuine failure (optimiserCompleted=false) remains "failed"/"not_attempted"', () => {
    const source = readSource(OPTIMISE_AND_CALCULATE_PATH);
    const elseBlock = source.slice(
      source.indexOf('} else {', source.indexOf('if (optimiserCompleted)')),
      source.indexOf('} finally {', source.indexOf('if (optimiserCompleted)')),
    );
    assert.ok(
      elseBlock.includes('terminalStatus: "failed"'),
      'genuine failure must use terminalStatus "failed"',
    );
    assert.ok(
      elseBlock.includes('publicationStatus: "not_attempted"'),
      'genuine failure must use publicationStatus "not_attempted"',
    );
  });

  // 10. successful normal path unchanged
  it('10: success path still calls setComplete (normal completion)', () => {
    const source = readSource(OPTIMISE_AND_CALCULATE_PATH);
    assert.ok(
      source.includes('setComplete(projectId, versionId, autoApplied, recommendations, noImprovements)'),
      'success path must still call setComplete',
    );
  });

  // ── optimiserRunHistory.js contract checks ──

  it('H1: updateOptimiserRunHistoryPublication exists and accepts publication status', () => {
    const source = readSource(HISTORY_MODULE_PATH);
    assert.ok(
      source.includes('export async function updateOptimiserRunHistoryPublication'),
      'updateOptimiserRunHistoryPublication must be exported',
    );
    assert.ok(
      source.includes('publicationStatus'),
      'update function must accept publicationStatus',
    );
    assert.ok(
      source.includes('row_not_found'),
      'update function must return row_not_found when no row exists',
    );
  });

  it('H2: buildOptimiserRunHistoryRecord accepts "pending" publication status', () => {
    const source = readSource(HISTORY_MODULE_PATH);
    assert.ok(
      source.includes('publication_status'),
      'history record must include publication_status field',
    );
    // The record builder must not reject "pending" — it uses text() which
    // accepts any non-null string.
    assert.ok(
      source.includes("text(publicationStatus)"),
      'publication status must be stored as text',
    );
  });

  it('H3: update function finds row by run_id (not by creating a duplicate)', () => {
    const source = readSource(HISTORY_MODULE_PATH);
    const updateFn = source.slice(
      source.indexOf('export async function updateOptimiserRunHistoryPublication'),
      source.indexOf('/** The retained rows'),
    );
    assert.ok(
      updateFn.includes('run_id: run'),
      'update function must filter by run_id',
    );
    assert.ok(
      updateFn.includes('base44.entities.OptimiserRunHistory.update'),
      'update function must call update (not create)',
    );
  });

  // ── useRunOptimisationPlan.js contract checks (same fix for second route) ──

  it('R1: useRunOptimisationPlan has optimiserCompleted flag', () => {
    const source = readSource(USE_RUN_OPTIMISATION_PLAN_PATH);
    assert.ok(
      source.includes('optimiserCompleted'),
      'useRunOptimisationPlan must have optimiserCompleted flag',
    );
    assert.ok(
      source.includes('if (optimiserCompleted)'),
      'useRunOptimisationPlan catch block must branch on optimiserCompleted',
    );
  });

  it('R2: useRunOptimisationPlan pre-writes history before publication', () => {
    const source = readSource(USE_RUN_OPTIMISATION_PLAN_PATH);
    assert.ok(
      source.includes('publicationStatus: "pending"'),
      'useRunOptimisationPlan must pre-write with "pending"',
    );
    assert.ok(
      source.includes('historyPreWritten = true'),
      'useRunOptimisationPlan must set historyPreWritten',
    );
  });

  it('R3: useRunOptimisationPlan catch preserves terminal status when optimiser completed', () => {
    const source = readSource(USE_RUN_OPTIMISATION_PLAN_PATH);
    const catchBlock = source.slice(
      source.indexOf('if (optimiserCompleted)'),
      source.indexOf('} else {', source.indexOf('if (optimiserCompleted)')),
    );
    assert.ok(
      !catchBlock.includes('saveRunFailure'),
      'completed-then-failed must NOT call saveRunFailure',
    );
    assert.ok(
      catchBlock.includes('publicationStatus: "failed"'),
      'completed-then-failed must use "failed"',
    );
  });

  it('R4: useRunOptimisationPlan success path updates pre-written row', () => {
    const source = readSource(USE_RUN_OPTIMISATION_PLAN_PATH);
    assert.ok(
      source.includes('updateOptimiserRunHistoryPublication'),
      'useRunOptimisationPlan must use updateOptimiserRunHistoryPublication',
    );
  });
});