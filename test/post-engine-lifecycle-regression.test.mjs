// ───────────────────────────────────────────────────────────────────────────
// POST-ENGINE LIFECYCLE REGRESSION SUITE — 18 TESTS
//
// Verifies the null-tuning guard, no-apply completion, history pre-write,
// recommendation write count, failure classification, terminal UI release,
// row-not-found fallback, and dual-route history ordering contract.
//
// Source-inspection tests read the ACTUAL source and assert on the exact
// contracts. Behavioral tests exercise the pure terminal-outcome authority.
// No mocks, no runtime, no bass engine — the source IS the authority.
// ───────────────────────────────────────────────────────────────────────────

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { describe, it } = test;
const __dirname = dirname(fileURLToPath(import.meta.url));

function readSource(rel) {
  return readFileSync(join(__dirname, "..", rel), "utf8");
}

// ── Source files under test ──
const OAC_PATH = "src/components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx";
const HOOK_PATH = "src/components/room/bass/optimiseWorkflow/useRunOptimisationPlan.js";
const HISTORY_PATH = "src/components/room/bass/optimiserPlan/optimiserRunHistory.js";
const PLAN_SAVE_PATH = "src/components/room/bass/optimiserPlan/optimiserPlanSave.js";
const TERMINAL_OUTCOME_PATH = "src/components/room/bass/optimiserPlan/resolveCanonicalTerminalOutcome.js";
const RECOMMENDATION_PUB_PATH = "src/components/room/bass/optimiserPlan/optimiserRecommendationPublication.js";

const oac = readSource(OAC_PATH);
const hook = readSource(HOOK_PATH);
const history = readSource(HISTORY_PATH);
const planSave = readSource(PLAN_SAVE_PATH);
const terminalOutcome = readSource(TERMINAL_OUTCOME_PATH);

// ═════════════════════════════════════════════════════════════════════════════
// NULL-TUNING GUARD (tests 1–2)
// ═════════════════════════════════════════════════════════════════════════════

describe("1. Null-tuning guard", () => {

  it("1: winner=null + tuning=null → no .map() call (hasValidTuning gate precedes .map)", () => {
    // The hasValidTuning guard must exist and the .map() on tuning must be
    // AFTER the `if (!hasValidTuning) { ... return; }` early exit.
    assert.ok(
      oac.includes("const hasValidTuning = hasCal"),
      "hasValidTuning must be derived from hasCal and winnerTuning",
    );
    const guardIdx = oac.indexOf("if (!hasValidTuning) {");
    const mapIdx = oac.indexOf("tuningToApply.map(");
    assert.ok(guardIdx > -1, "if (!hasValidTuning) guard must exist");
    assert.ok(mapIdx > -1, "tuningToApply.map() must exist in the apply path");
    assert.ok(
      mapIdx > guardIdx,
      "tuningToApply.map() must appear AFTER the !hasValidTuning guard, so null tuning never reaches it",
    );
    // The guard block must contain a return statement so execution stops.
    // Slice from the guard to the `return;` that ends the no-apply block (plus a
    // margin) — the first `}` inside setComplete is not the block's close.
    const returnIdx = oac.indexOf("return;", guardIdx);
    assert.ok(returnIdx > -1 && returnIdx < mapIdx, "a return; must exist between the guard and the .map() call");
    const guardBlock = oac.slice(guardIdx, returnIdx + 10);
    assert.ok(
      guardBlock.includes("return;"),
      "The !hasValidTuning block must return early",
    );
  });

  it("2: winner=null + tuning=null → valid NO_APPLY completion (setComplete + return)", () => {
    // The no-apply path must call setComplete and publishAdiRecommendationInBackground
    // then return — without entering the apply path.
    const guardIdx = oac.indexOf("if (!hasValidTuning) {");
    const guardBlock = oac.slice(guardIdx, oac.indexOf("return;", guardIdx) + 10);
    assert.ok(
      guardBlock.includes("setComplete("),
      "no-apply path must call setComplete (terminal UI release)",
    );
    assert.ok(
      guardBlock.includes("publishAdiRecommendationInBackground("),
      "no-apply path must publish recommendation in background",
    );
    assert.ok(
      guardBlock.includes("return;"),
      "no-apply path must return before entering the apply path",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NO-APPLY SKIPS (tests 3–6)
// ═════════════════════════════════════════════════════════════════════════════

describe("2. No-apply skips recalc / publication / authority mutation", () => {

  it("3: no-apply preserves fingerprint (no commitInstances in no-apply path)", () => {
    const guardIdx = oac.indexOf("if (!hasValidTuning) {");
    const guardEnd = oac.indexOf("return;", guardIdx);
    const guardBlock = oac.slice(guardIdx, guardEnd + 10);
    assert.ok(
      !guardBlock.includes("commitInstances("),
      "no-apply path must NOT call commitInstances (fingerprint preserved)",
    );
    assert.ok(
      !guardBlock.includes("acceptRecommendation("),
      "no-apply path must NOT call acceptRecommendation (no mutation)",
    );
  });

  it("4: no-apply skips bass recalculation (no onCalculate in no-apply path)", () => {
    const guardIdx = oac.indexOf("if (!hasValidTuning) {");
    const guardEnd = oac.indexOf("return;", guardIdx);
    const guardBlock = oac.slice(guardIdx, guardEnd + 10);
    assert.ok(
      !guardBlock.includes("onCalculate"),
      "no-apply path must NOT trigger recalculation (no onCalculate call)",
    );
    assert.ok(
      !guardBlock.includes("setRecalculating"),
      "no-apply path must NOT enter the recalculating phase",
    );
  });

  it("5: no-apply skips bass publication (no setPublishing in no-apply path)", () => {
    const guardIdx = oac.indexOf("if (!hasValidTuning) {");
    const guardEnd = oac.indexOf("return;", guardIdx);
    const guardBlock = oac.slice(guardIdx, guardEnd + 10);
    assert.ok(
      !guardBlock.includes("setPublishing"),
      "no-apply path must NOT enter the publishing phase",
    );
    assert.ok(
      !guardBlock.includes("waitForCurrentPublication"),
      "no-apply path must NOT wait for a new bass publication",
    );
  });

  it("6: no-apply preserves current bass authority (no setComplete with false flag misuse)", () => {
    // The no-apply setComplete call passes `true` as the final arg (noImprovements=true),
    // confirming the bass authority is unchanged and nothing was applied.
    const guardIdx = oac.indexOf("if (!hasValidTuning) {");
    const setCompleteIdx = oac.indexOf("setComplete(", guardIdx);
    const setCompleteBlock = oac.slice(setCompleteIdx, oac.indexOf("}, {", setCompleteIdx) + 200);
    // The no-apply path's setComplete ends with `true` (noImprovements)
    const guardEnd = oac.indexOf("return;", guardIdx);
    const guardBlock = oac.slice(guardIdx, guardEnd + 10);
    assert.ok(
      guardBlock.match(/setComplete\([\s\S]*?,\s*true\);/),
      "no-apply setComplete must pass noImprovements=true (bass authority preserved)",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// VALID TUNING STILL ENTERS APPLY PATH (tests 7–8)
// ═════════════════════════════════════════════════════════════════════════════

describe("3. Valid tuning enters apply path", () => {

  it("7: valid tuning still enters apply path (commitInstances + acceptRecommendation)", () => {
    // After the !hasValidTuning guard, the apply path must call commitInstances
    // and acceptRecommendation when hasCal is true.
    const guardIdx = oac.indexOf("if (!hasValidTuning) {");
    const afterGuard = oac.slice(guardIdx + 50);
    assert.ok(
      afterGuard.includes("commitInstances(newInstances)"),
      "apply path must call commitInstances with new instances",
    );
    assert.ok(
      afterGuard.includes("acceptRecommendation(projectId, versionId"),
      "apply path must call acceptRecommendation for safe calibration",
    );
    assert.ok(
      afterGuard.includes("tuningToApply.map("),
      "apply path must map tuning to recommendation values",
    );
  });

  it("8: valid tuning triggers recalculation and republish", () => {
    const guardIdx = oac.indexOf("if (!hasValidTuning) {");
    const afterGuard = oac.slice(guardIdx + 50);
    assert.ok(
      afterGuard.includes('phaseRef.current = "recalculating"'),
      "apply path must enter the recalculating phase",
    );
    assert.ok(
      afterGuard.includes('phaseRef.current = "publishing"'),
      "apply path must enter the publishing phase after recalculation",
    );
    assert.ok(
      afterGuard.includes("postRecalcFingerprint") && afterGuard.includes("publishAdiRecommendationInBackground"),
      "apply path must re-publish against the post-recalculation fingerprint",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// HISTORY PRE-WRITE (tests 9–10)
// ═════════════════════════════════════════════════════════════════════════════

describe("4. History pre-write — both routes", () => {

  it("9: completed no-apply run awaits history pre-write before terminal UI (OptimiseAndCalculate)", () => {
    // In OptimiseAndCalculate, the history pre-write (await logRunHistory) must
    // occur BEFORE setComplete (terminal UI release) in the no-apply path.
    // Actually: the history pre-write is BEFORE the no-apply branch, so it's
    // awaited for BOTH paths. Verify the await exists and precedes the guard.
    const historyPreWriteIdx = oac.indexOf("await logRunHistory({");
    assert.ok(historyPreWriteIdx > -1, "OptimiseAndCalculate must await logRunHistory");
    const noApplyGuardIdx = oac.indexOf("if (!hasValidTuning) {");
    assert.ok(
      historyPreWriteIdx < noApplyGuardIdx,
      "history pre-write must precede the no-apply guard (both paths await it)",
    );
    // Must check the result for ok: false
    assert.ok(
      oac.includes("historyResult?.ok === false"),
      "OptimiseAndCalculate must check history pre-write result for ok: false",
    );
    assert.ok(
      oac.includes("historyPreWritten = true"),
      "OptimiseAndCalculate must set historyPreWritten = true on success",
    );
  });

  it("9b: useRunOptimisationPlan awaits history pre-write before terminal status", () => {
    // In useRunOptimisationPlan, setStatus("complete") is the terminal UI release.
    // The history pre-write (await logRunHistory) must occur BEFORE
    // setStatus("complete") — BOTH the project-version save AND the history row
    // must be durable before the terminal UI is released. The plan save
    // acknowledgement (waitForOptimiserPlanSave) is also awaited before the
    // history pre-write, so the full ordering is:
    //   save ack → history pre-write → setStatus("complete") → publication
    const saveAwaitIdx = hook.indexOf("await waitForOptimiserPlanSave(");
    const historyPreWriteIdx = hook.indexOf("await logRunHistory({");
    const completeIdx = hook.indexOf('setStatus("complete")');
    assert.ok(saveAwaitIdx > -1, "useRunOptimisationPlan must await waitForOptimiserPlanSave");
    assert.ok(historyPreWriteIdx > -1, "useRunOptimisationPlan must await logRunHistory");
    assert.ok(completeIdx > -1, "useRunOptimisationPlan must call setStatus('complete')");
    assert.ok(
      saveAwaitIdx < historyPreWriteIdx,
      "history pre-write must occur AFTER the save acknowledgement await",
    );
    assert.ok(
      historyPreWriteIdx < completeIdx,
      "history pre-write must occur BEFORE setStatus('complete') (both save and history must be durable before terminal UI)",
    );
    // Must check the result
    assert.ok(
      hook.includes("historyResult?.ok === false"),
      "useRunOptimisationPlan must check history pre-write result for ok: false",
    );
  });

  it("10: history pre-write failure surfaces as history persistence failure", () => {
    // OptimiseAndCalculate must set historyPersistenceError and warn.
    assert.ok(
      oac.includes("historyPersistenceError ="),
      "OptimiseAndCalculate must record historyPersistenceError on pre-write failure",
    );
    assert.ok(
      oac.includes('console.warn("[OptimiseAndCalculate] history pre-write failed:'),
      "OptimiseAndCalculate must warn when history pre-write fails",
    );
    // The catch block must check the "history" phase
    assert.ok(
      oac.includes('phase === "history"'),
      "OptimiseAndCalculate catch block must classify the history phase",
    );
    assert.ok(
      oac.includes("The optimisation completed, but the run history could not be written"),
      "history phase failure must surface a dedicated user message",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RECOMMENDATION WRITE COUNT (tests 11–12)
// ═════════════════════════════════════════════════════════════════════════════

describe("5. Recommendation write count", () => {

  it("11: unchanged-fingerprint no-apply run performs exactly ONE recommendation publication", () => {
    // The no-apply path calls publishAdiRecommendationInBackground exactly once.
    // The apply path's re-publish is guarded by `calibrationApplied && postRecalcFingerprint !== planFingerprint`,
    // so when the fingerprint is unchanged, NO second publish runs.
    const noApplyGuardIdx = oac.indexOf("if (!hasValidTuning) {");
    const noApplyBlock = oac.slice(noApplyGuardIdx, oac.indexOf("return;", noApplyGuardIdx) + 10);
    const publishCallsInNoApply = (noApplyBlock.match(/publishAdiRecommendationInBackground\(/g) || []).length;
    assert.ok(
      publishCallsInNoApply === 1,
      `no-apply path must call publishAdiRecommendationInBackground exactly once, found ${publishCallsInNoApply}`,
    );

    // The apply path's re-publish guard: only when fingerprint actually changed
    const republishGuard = "calibrationApplied && postRecalcFingerprint && postRecalcFingerprint !== planFingerprint";
    assert.ok(
      oac.includes(republishGuard),
      "apply path must only re-publish when calibrationApplied AND fingerprint changed",
    );
    // When fingerprint is unchanged, the else branch finalises history (no second publish)
    assert.ok(
      oac.includes('updateOptimiserRunHistoryPublication({\n          runId: activeRun.runId, projectId, versionId,\n          publicationStatus: "published"'),
      "unchanged fingerprint apply path must finalise history (no re-publish)",
    );
  });

  it("12: recommendation publication does not block terminal UI", () => {
    // In the no-apply path, setComplete is called BEFORE publishAdiRecommendationInBackground.
    const noApplyGuardIdx = oac.indexOf("if (!hasValidTuning) {");
    const noApplyBlock = oac.slice(noApplyGuardIdx, oac.indexOf("return;", noApplyGuardIdx) + 10);
    const setCompleteIdx = noApplyBlock.indexOf("setComplete(");
    const publishIdx = noApplyBlock.indexOf("publishAdiRecommendationInBackground(");
    assert.ok(setCompleteIdx > -1 && publishIdx > -1, "both setComplete and publish must exist in no-apply path");
    assert.ok(
      setCompleteIdx < publishIdx,
      "setComplete (terminal UI) must precede publishAdiRecommendationInBackground",
    );
    // publishAdiRecommendationInBackground must NOT be awaited (no await keyword before it)
    const publishCall = noApplyBlock.slice(publishIdx - 10, publishIdx + 50);
    assert.ok(
      !publishCall.includes("await publishAdiRecommendationInBackground"),
      "publishAdiRecommendationInBackground must not be awaited (background, non-blocking)",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PUBLICATION FAILURE DOES NOT OVERWRITE (test 13)
// ═════════════════════════════════════════════════════════════════════════════

describe("6. Publication failure isolation", () => {

  it("13: recommendation publication failure does not overwrite completed optimiser result", () => {
    // The catch block's `if (optimiserCompleted)` branch must NOT call saveRunFailure.
    // It only updates the history row and sets a workflow error message.
    // We verify by checking that saveRunFailure only appears in the else branch
    // (the genuine-optimiser-failure branch), not in the completed branch.
    const catchIdx = oac.indexOf("} catch (err) {");
    const completedIfIdx = oac.indexOf("if (optimiserCompleted) {", catchIdx);
    assert.ok(completedIfIdx > -1, "if (optimiserCompleted) must exist in the catch block");
    // Find the saveRunFailure call — it must be AFTER the completed branch,
    // in the else (genuine failure) branch.
    const saveRunFailureIdx = oac.indexOf("saveRunFailure(", completedIfIdx);
    assert.ok(saveRunFailureIdx > -1, "saveRunFailure must exist somewhere after the completed branch");
    // The completed branch ends at the `} else {` that precedes saveRunFailure.
    // Find that else by searching backwards from saveRunFailure.
    const elseBeforeSave = oac.lastIndexOf("} else {", saveRunFailureIdx);
    assert.ok(elseBeforeSave > completedIfIdx, "the else branch must be between the completed if and saveRunFailure");
    const completedBranch = oac.slice(completedIfIdx, elseBeforeSave);
    assert.ok(
      !completedBranch.includes("saveRunFailure("),
      "optimiserCompleted branch must NOT call saveRunFailure (completed plan is preserved)",
    );
    assert.ok(
      completedBranch.includes("setWorkflowError("),
      "optimiserCompleted branch must set a workflow error (not a run failure)",
    );

    // Same for useRunOptimisationPlan
    const hookCatchIdx = hook.indexOf("} catch (err) {");
    const hookCompletedIfIdx = hook.indexOf("if (optimiserCompleted) {", hookCatchIdx);
    const hookSaveRunFailureIdx = hook.indexOf("saveRunFailure(", hookCompletedIfIdx);
    const hookElseBeforeSave = hook.lastIndexOf("} else {", hookSaveRunFailureIdx);
    const hookCompletedBranch = hook.slice(hookCompletedIfIdx, hookElseBeforeSave);
    assert.ok(
      !hookCompletedBranch.includes("saveRunFailure("),
      "useRunOptimisationPlan optimiserCompleted branch must NOT call saveRunFailure",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// FAILURE CLASSIFICATION (tests 14–16)
// ═════════════════════════════════════════════════════════════════════════════

describe("7. Failure classification by phase", () => {

  it("14: actual bass publication failure (recalculating/publishing) remains classified as bass publication failure", () => {
    const catchIdx = oac.indexOf("} catch (err) {");
    const phaseBlock = oac.slice(catchIdx, catchIdx + 1500);
    assert.ok(
      phaseBlock.includes('phase === "recalculating"'),
      "recalculating phase must be classified in the catch block",
    );
    assert.ok(
      phaseBlock.includes("The optimisation completed, but the recalculated bass result could not be published"),
      "recalculating phase must surface a bass-publication-failure message",
    );
    assert.ok(
      phaseBlock.includes('phase === "publishing"'),
      "publishing phase must be classified in the catch block",
    );
    assert.ok(
      phaseBlock.includes("The optimisation completed, but the updated bass result could not be published"),
      "publishing phase must surface a bass-publication-failure message",
    );
  });

  it("15: apply failure remains classified as apply failure", () => {
    const catchIdx = oac.indexOf("} catch (err) {");
    const phaseBlock = oac.slice(catchIdx, catchIdx + 1500);
    assert.ok(
      phaseBlock.includes('phase === "applying"'),
      "applying phase must be classified in the catch block",
    );
    assert.ok(
      phaseBlock.includes("The optimisation completed, but the calibration could not be applied"),
      "applying phase must surface an apply-failure message (not bass publication)",
    );
  });

  it("16: target-cache HTTP failure is isolated from optimiser/bass authority", () => {
    // The target_cache write is in ProjectAnalysisCache and must be background/optional.
    // Verify the failure classifier does NOT include a "target_cache" or "cache" phase.
    const catchIdx = oac.indexOf("} catch (err) {");
    const phaseBlock = oac.slice(catchIdx, catchIdx + 2000);
    // The phase classifier must only check: history, applying, recalculating, publishing
    const phases = ['"history"', '"applying"', '"recalculating"', '"publishing"'];
    for (const phase of phases) {
      assert.ok(
        phaseBlock.includes(`phase === ${phase}`),
        `phase classifier must check ${phase}`,
      );
    }
    // No target_cache or cache phase should exist in the classifier
    assert.ok(
      !phaseBlock.includes('phase === "target_cache"') && !phaseBlock.includes('phase === "cache"'),
      "target-cache failure must NOT enter the failure classifier",
    );
    // The else branch is the fallback for unknown phases
    assert.ok(
      phaseBlock.includes("a post-engine step could not complete"),
      "fallback message for unknown phases must exist",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PENDING STATUS CANNOT REMAIN (test 17)
// ═════════════════════════════════════════════════════════════════════════════

describe("8. Pending status finalisation", () => {

  it("17: publication status cannot remain permanently pending after a known terminal publication result", () => {
    // The finaliseHistory function in both routes must update the row from "pending"
    // to either "published" or "failed". Verify the finaliseHistory calls exist.
    // In OptimiseAndCalculate:
    assert.ok(
      oac.includes("finaliseHistory("),
      "OptimiseAndCalculate must have a finaliseHistory function",
    );
    assert.ok(
      oac.includes('finaliseHistory("published"') || oac.includes('finaliseHistory(persisted ? "published" : "failed"'),
      "OptimiseAndCalculate must finalise history to published/failed",
    );
    // In useRunOptimisationPlan:
    assert.ok(
      hook.includes("finaliseHistory("),
      "useRunOptimisationPlan must have a finaliseHistory function",
    );
    assert.ok(
      hook.includes("finaliseHistory(recommendationPublication.status, recommendationPublication.error)"),
      "useRunOptimisationPlan must finalise history with the publication's actual status",
    );
    // The catch block in both routes must also finalise to "failed" (not leave "pending")
    const oacCatch = oac.slice(oac.indexOf("} catch (err) {"), oac.indexOf("} finally {", oac.indexOf("} catch (err) {")));
    assert.ok(
      oacCatch.includes('publicationStatus: "failed"'),
      "OptimiseAndCalculate catch block must finalise to 'failed' (not leave pending)",
    );
    const hookCatch = hook.slice(hook.indexOf("} catch (err) {"), hook.indexOf("} finally {", hook.indexOf("} catch (err) {")));
    assert.ok(
      hookCatch.includes('publicationStatus: "failed"'),
      "useRunOptimisationPlan catch block must finalise to 'failed' (not leave pending)",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DUAL-ROUTE HISTORY ORDERING / FALLBACK (test 18)
// ═════════════════════════════════════════════════════════════════════════════

describe("9. Dual-route history ordering / fallback", () => {

  it("18: useRunOptimisationPlan preserves the same history ordering/fallback contract", () => {
    // The hook must have the same finaliseHistory pattern: historyPreWritten → update,
    // else → logRunHistory. And the row_not_found fallback.
    assert.ok(
      hook.includes("if (historyPreWritten) {"),
      "useRunOptimisationPlan must branch on historyPreWritten",
    );
    assert.ok(
      hook.includes("updateOptimiserRunHistoryPublication({"),
      "useRunOptimisationPlan must call updateOptimiserRunHistoryPublication when pre-written",
    );
    assert.ok(
      hook.includes('res?.ok === false && res?.error === "row_not_found"'),
      "useRunOptimisationPlan must check for row_not_found from updateOptimiserRunHistoryPublication",
    );
    assert.ok(
      hook.includes("return logRunHistory("),
      "useRunOptimisationPlan must fall back to logRunHistory on row_not_found",
    );
    // The catch block must also have the row_not_found fallback
    const hookCatch = hook.slice(hook.indexOf("} catch (err) {"), hook.indexOf("} finally {", hook.indexOf("} catch (err) {")));
    assert.ok(
      hookCatch.includes('res?.ok === false && res?.error === "row_not_found"'),
      "useRunOptimisationPlan catch block must have the row_not_found fallback",
    );
    assert.ok(
      hookCatch.includes("logRunHistory({ terminalStatus: runTerminalStatus, publicationStatus: \"failed\""),
      "useRunOptimisationPlan catch block must fall back to creating the row with failed status",
    );

    // Same contract in OptimiseAndCalculate
    assert.ok(
      oac.includes('res?.ok === false && res?.error === "row_not_found"'),
      "OptimiseAndCalculate must check for row_not_found",
    );
    assert.ok(
      oac.includes("return logRunHistory("),
      "OptimiseAndCalculate must fall back to logRunHistory on row_not_found",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUPPLEMENTARY: row_not_found in history module (test 18b)
// ═════════════════════════════════════════════════════════════════════════════

describe("10. History module row_not_found contract", () => {

  it("18b: updateOptimiserRunHistoryPublication returns row_not_found when no row exists", () => {
    assert.ok(
      history.includes('return { ok: false, error: "row_not_found" }'),
      "updateOptimiserRunHistoryPublication must return { ok: false, error: 'row_not_found' } when no row exists",
    );
    assert.ok(
      history.includes("rows.length === 0"),
      "updateOptimiserRunHistoryPublication must check for empty rows before updating",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUPPLEMENTARY: terminal outcome authority (behavioral)
// ═════════════════════════════════════════════════════════════════════════════

describe("11. Canonical terminal outcome (source inspection)", () => {

  // The terminal outcome authority is a pure function but its transitive
  // dependencies import @/ — so we verify the contract by source inspection.

  it("resolveCanonicalTerminalOutcome prioritises actionable_plan first", () => {
    const src = terminalOutcome;
    assert.ok(
      src.includes('if (actionability?.actionable === true) return "actionable_plan"'),
      "actionable_plan must be the first-priority terminal outcome",
    );
  });

  it("resolveCanonicalTerminalOutcome returns no_useful_improvement as the last fallback", () => {
    const src = terminalOutcome;
    assert.ok(
      src.includes('return "no_useful_improvement"'),
      "no_useful_improvement must be the final fallback when no winner and no trade-off",
    );
  });

  it("resolveCanonicalTerminalOutcome returns trade_off when held calibration is a genuine trade-off", () => {
    const src = terminalOutcome;
    assert.ok(
      src.includes('if (isCalibrationTradeOffDecision(calibrationDecision))'),
      "trade_off must be checked via isCalibrationTradeOffDecision",
    );
    assert.ok(
      src.includes('return "trade_off"'),
      "trade_off must be a returned terminal outcome",
    );
    // The hierarchy: actionable → non_actionable_winner → evaluation_incomplete → failed → trade_off → no_useful_improvement
    const actionableIdx = src.indexOf('return "actionable_plan"');
    const nonActionableIdx = src.indexOf('return "non_actionable_winner"');
    const incompleteIdx = src.indexOf('return "evaluation_incomplete"');
    const failedIdx = src.indexOf('return "failed"');
    const tradeOffIdx = src.indexOf('return "trade_off"');
    const noUsefulIdx = src.indexOf('return "no_useful_improvement"');
    assert.ok(actionableIdx < nonActionableIdx, "actionable_plan must precede non_actionable_winner");
    assert.ok(nonActionableIdx < incompleteIdx, "non_actionable_winner must precede evaluation_incomplete");
    assert.ok(incompleteIdx < failedIdx, "evaluation_incomplete must precede failed");
    assert.ok(failedIdx < tradeOffIdx, "failed must precede trade_off");
    assert.ok(tradeOffIdx < noUsefulIdx, "trade_off must precede no_useful_improvement");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUPPLEMENTARY: target_cache isolation (source inspection of history module)
// ═════════════════════════════════════════════════════════════════════════════

describe("12. Target cache isolation", () => {

  it("target_cache write is not referenced in the optimiser lifecycle code", () => {
    // The target_cache is written by the bass engine, not by the optimiser
    // lifecycle. The optimiser hook and component must not reference target_cache
    // as a terminal authority or block on it.
    assert.ok(
      !hook.includes("target_cache"),
      "useRunOptimisationPlan must not reference target_cache (it's isolated)",
    );
    assert.ok(
      !oac.includes("target_cache"),
      "OptimiseAndCalculate must not reference target_cache (it's isolated)",
    );
  });
});