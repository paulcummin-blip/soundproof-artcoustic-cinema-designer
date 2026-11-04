// save-ordering-terminal-boundary.test.mjs
// ---------------------------------------------------------------------------
// REGRESSION SUITE — terminal UI must not release until BOTH the project-version
// save acknowledgement AND the history row are durable. Recommendation publication
// and target-cache writes remain non-blocking. Save failure is classified as a
// persistence failure, never as a bass publication failure.
//
// Source inspection contract: the code path in useRunOptimisationPlan.js must
// guarantee the ordering:
//   1. optimiser completes
//   2. final plan/result built
//   3. required project-version save awaited  (waitForOptimiserPlanSave)
//   4. history row durable                     (await logRunHistory)
//   5. terminal UI released                     (setStatus("complete"))
//   6. recommendation publication may continue in background
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(__dirname, "..", "src", "components", "room", "bass", "optimiseWorkflow", "useRunOptimisationPlan.js");
const source = readFileSync(sourcePath, "utf8");

// ---------------------------------------------------------------------------
// Helper: find the index of a marker in the source, starting from a given
// offset. Throws if the marker is not found.
// ---------------------------------------------------------------------------
function indexOf(text, marker, from = 0, label = "marker") {
  const idx = text.indexOf(marker, from);
  assert.ok(idx >= 0, `${label} not found in source`);
  return idx;
}

// ---------------------------------------------------------------------------
// TEST 1: project-version save pending → terminal UI not yet released
// The `waitForOptimiserPlanSave` await must come BEFORE `setStatus("complete")`.
// ---------------------------------------------------------------------------
{
  const saveAwaitIdx = indexOf(
    source,
    "await waitForOptimiserPlanSave(",
    0,
    "waitForOptimiserPlanSave await",
  );
  const completeIdx = indexOf(
    source,
    'setStatus("complete")',
    saveAwaitIdx,
    'setStatus("complete") after save await',
  );
  assert.ok(
    saveAwaitIdx < completeIdx,
    "TEST 1 FAIL: setStatus(\"complete\") must come AFTER waitForOptimiserPlanSave",
  );
}

// ---------------------------------------------------------------------------
// TEST 2: project-version save succeeds → terminal UI released
// The `setStatus("complete")` call must exist and must be on the success path
// (after the save ack try/catch, not inside the catch).
// ---------------------------------------------------------------------------
{
  const saveCompletedIdx = indexOf(
    source,
    "RUN_TIMING.SAVE_COMPLETED",
    0,
    "SAVE_COMPLETED timing",
  );
  const completeIdx = indexOf(
    source,
    'setStatus("complete")',
    saveCompletedIdx,
    'setStatus("complete") after SAVE_COMPLETED',
  );
  assert.ok(
    saveCompletedIdx < completeIdx,
    "TEST 2 FAIL: setStatus(\"complete\") must come after SAVE_COMPLETED",
  );
}

// ---------------------------------------------------------------------------
// TEST 3: history pending → terminal UI not yet released
// The `await logRunHistory` call (history pre-write) must come BEFORE
// `setStatus("complete")`.
// ---------------------------------------------------------------------------
{
  // Find the history pre-write block — it contains "publicationStatus: \"pending\""
  // inside an await logRunHistory call.
  const historyPrewriteIdx = indexOf(
    source,
    'await logRunHistory({',
    0,
    "history pre-write await logRunHistory",
  );
  const pendingIdx = indexOf(
    source,
    'publicationStatus: "pending"',
    historyPrewriteIdx,
    "publicationStatus pending in history pre-write",
  );
  const completeIdx = indexOf(
    source,
    'setStatus("complete")',
    pendingIdx,
    'setStatus("complete") after history pre-write',
  );
  assert.ok(
    pendingIdx < completeIdx,
    "TEST 3 FAIL: setStatus(\"complete\") must come AFTER the history pre-write",
  );
}

// ---------------------------------------------------------------------------
// TEST 4: project-version save + history durable → terminal UI released
// Both the save ack AND the history pre-write must appear before
// `setStatus("complete")` on the success path.
// ---------------------------------------------------------------------------
{
  const saveAwaitIdx = indexOf(source, "await waitForOptimiserPlanSave(");
  const historyIdx = indexOf(source, "await logRunHistory({", saveAwaitIdx);
  const completeIdx = indexOf(source, 'setStatus("complete")', historyIdx);
  assert.ok(
    saveAwaitIdx < historyIdx && historyIdx < completeIdx,
    "TEST 4 FAIL: save await → history pre-write → setStatus(\"complete\") ordering broken",
  );
}

// ---------------------------------------------------------------------------
// TEST 5: recommendation publication pending → terminal UI may still release
// The `publishOptimiserRecommendation` call must come AFTER
// `setStatus("complete")`.
// ---------------------------------------------------------------------------
{
  const completeIdx = indexOf(source, 'setStatus("complete")');
  const pubIdx = indexOf(
    source,
    "await publishOptimiserRecommendation(",
    completeIdx,
    "publishOptimiserRecommendation after setStatus complete",
  );
  assert.ok(
    completeIdx < pubIdx,
    "TEST 5 FAIL: publishOptimiserRecommendation must come AFTER setStatus(\"complete\")",
  );
}

// ---------------------------------------------------------------------------
// TEST 6: target-cache pending/failure → terminal UI unaffected
// No target-cache write or await may appear between the save ack and
// setStatus("complete"). The word "target" (case-insensitive) must not appear
// as an await between SAVE_COMPLETED and setStatus("complete").
// ---------------------------------------------------------------------------
{
  const saveCompletedIdx = indexOf(source, "RUN_TIMING.SAVE_COMPLETED");
  const completeIdx = indexOf(source, 'setStatus("complete")', saveCompletedIdx);
  const between = source.slice(saveCompletedIdx, completeIdx);
  // No await ... target-cache ... in the critical section.
  const targetAwaitMatch = between.match(/await\s+\w*[Tt]arget\w*/);
  assert.ok(
    !targetAwaitMatch,
    `TEST 6 FAIL: target-cache await found between SAVE_COMPLETED and terminal: ${targetAwaitMatch?.[0]}`,
  );
}

// ---------------------------------------------------------------------------
// TEST 7: project-version save failure → persistence failure surfaced
// The save ack catch block must use terminalStatus "failed" (NOT
// "publication_failed"), because a save failure is a persistence failure,
// not a bass publication failure.
// ---------------------------------------------------------------------------
{
  const saveAckCatchIdx = indexOf(
    source,
    "saveAckError",
    0,
    "save ack catch block",
  );
  // The catch block must contain terminalStatus: "failed"
  const failedIdx = indexOf(
    source,
    'terminalStatus: "failed"',
    saveAckCatchIdx,
    'terminalStatus "failed" in save ack catch',
  );
  // And it must NOT contain terminalStatus: "publication_failed" in that block
  const blockEnd = indexOf(source, "return;", failedIdx, "return after save failure");
  const block = source.slice(saveAckCatchIdx, blockEnd);
  assert.ok(
    !block.includes('terminalStatus: "publication_failed"'),
    "TEST 7 FAIL: save failure misclassified as publication_failed",
  );
  assert.ok(
    block.includes('terminalStatus: "failed"'),
    "TEST 7 FAIL: save failure must use terminalStatus \"failed\"",
  );
}

// ---------------------------------------------------------------------------
// TEST 8: no-apply fast path unchanged
// The fast-path preflight (retestPreflightAuthority) is in OptimiseAndCalculate,
// not in useRunOptimisationPlan. The hook must not reference preflight or
// reuse — that path is unchanged.
// ---------------------------------------------------------------------------
{
  assert.ok(
    !source.includes("canReuseCurrentBaselineForOptimiser"),
    "TEST 8 FAIL: useRunOptimisationPlan must not reference the preflight authority (that lives in OptimiseAndCalculate)",
  );
  assert.ok(
    !source.includes("retestPreflight"),
    "TEST 8 FAIL: useRunOptimisationPlan must not reference retestPreflight",
  );
}

// ---------------------------------------------------------------------------
// TEST 9: recommendation publication remains non-blocking
// The publication await must come AFTER setStatus("complete"), and the catch
// block for publication failures must NOT overwrite the completed plan with
// failure evidence (it checks optimiserCompleted).
// ---------------------------------------------------------------------------
{
  const completeIdx = indexOf(source, 'setStatus("complete")');
  const pubIdx = indexOf(source, "await publishOptimiserRecommendation(", completeIdx);
  // The catch block after publication must check optimiserCompleted before
  // deciding whether to overwrite with failure evidence.
  const catchIdx = indexOf(source, "} catch (err) {", pubIdx, "catch block after publication");
  const optimiserCompletedCheck = indexOf(
    source,
    "if (optimiserCompleted)",
    catchIdx,
    "optimiserCompleted check in catch",
  );
  assert.ok(
    catchIdx < optimiserCompletedCheck,
    "TEST 9 FAIL: catch block must check optimiserCompleted before overwriting",
  );
}

// ---------------------------------------------------------------------------
// TEST 10: actual apply path unchanged
// The hook must NOT call applyCalibration, applyRecommendation, or any lever
// application function. It is evidence-only.
// ---------------------------------------------------------------------------
{
  assert.ok(
    !source.includes("applyCalibration("),
    "TEST 10 FAIL: hook must not call applyCalibration (evidence-only)",
  );
  assert.ok(
    !source.includes("applyRecommendation("),
    "TEST 10 FAIL: hook must not call applyRecommendation (evidence-only)",
  );
}

// ---------------------------------------------------------------------------
// TEST 11: USER_TERMINAL timing recorded after both save and history
// The RUN_TIMING.USER_TERMINAL recording must come AFTER both
// waitForOptimiserPlanSave and the history pre-write await, and before
// setStatus("complete").
// ---------------------------------------------------------------------------
{
  const saveAwaitIdx = indexOf(source, "await waitForOptimiserPlanSave(");
  const historyIdx = indexOf(source, "await logRunHistory({", saveAwaitIdx);
  const historyBlockEnd = indexOf(source, "}", indexOf(source, "historyPreWritten = true", historyIdx), "end of history block");
  const userTerminalIdx = indexOf(
    source,
    "RUN_TIMING.USER_TERMINAL",
    historyIdx,
    "USER_TERMINAL after history",
  );
  const completeIdx = indexOf(source, 'setStatus("complete")', userTerminalIdx);
  assert.ok(
    saveAwaitIdx < historyIdx && historyIdx < userTerminalIdx && userTerminalIdx < completeIdx,
    "TEST 11 FAIL: USER_TERMINAL must come after save + history, before setStatus(\"complete\")",
  );
}

// ---------------------------------------------------------------------------
// TEST 12: PLAN_SAVE_FAILED failure status used for save failures
// The save ack catch block must stamp the completed evidence with
// OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED, not a publication failure code.
// ---------------------------------------------------------------------------
{
  const saveAckCatchIdx = indexOf(source, "saveAckError");
  const planSaveFailedIdx = indexOf(
    source,
    "OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED",
    saveAckCatchIdx,
    "PLAN_SAVE_FAILED in save ack catch",
  );
  assert.ok(
    planSaveFailedIdx > saveAckCatchIdx,
    "TEST 12 FAIL: save ack catch must use OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED",
  );
}

console.log("✓ All 12 save-ordering terminal-boundary tests passed.");