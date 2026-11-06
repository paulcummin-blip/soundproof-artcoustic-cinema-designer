// Regression tests for:
//   DEFECT 1 — Fresh Re-test does not own the panel while running.
//   DEFECT 2 — Held trade-off uses applied wording.
//
// Source-inspection tests: they read the actual source files and assert on the
// exact contracts that prevent each defect from recurring. No runtime, no
// mocks — the source IS the authority.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { describe, it } = test;

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSource(rel) {
  return readFileSync(join(__dirname, "..", rel), "utf8");
}

const JOURNEY_PATH = "src/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx";
const AUTO_APPLY_PATH = "src/components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";
const TRADE_OFF_STATE_PATH = "src/components/room/bass/optimiserPlan/optimiserTradeOffState.js";

// ═══════════════════════════════════════════════════════════════════════════
// DEFECT 1 — FRESH RE-TEST DOES NOT OWN THE PANEL WHILE RUNNING
// ═══════════════════════════════════════════════════════════════════════════

describe("Defect 1 — Fresh Re-test panel ownership", () => {
  const source = readSource(JOURNEY_PATH);

  it("Apply recalculation is not presented as a fresh optimiser run", () => {
    const workflow = readSource("src/components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx");
    assert.ok(workflow.includes("reoptimiseBusy={isCalculating && !jointReceiptState.operationActive}"));
  });

  it("1: freshRunActive combines isRunning (runStatus) and reoptimiseBusy", () => {
    assert.ok(
      source.includes("const freshRunActive = runStatus === \"running\" || reoptimiseBusy === true;"),
      "freshRunActive must be derived from both runStatus === 'running' AND reoptimiseBusy",
    );
  });

  it("2: jointReceiptOwnsPanel is suppressed when freshRunActive is true", () => {
    assert.ok(
      source.includes("jointReceiptState?.ownsPanel === true && !freshRunActive"),
      "jointReceiptOwnsPanel must return false when freshRunActive is true",
    );
  });

  it("3: the early-return panel-ownership check uses freshRunActive (not just isRunning)", () => {
    assert.ok(
      source.includes("if (jointReceiptOwnsPanel && !freshRunActive) return ("),
      "The early-return check must use !freshRunActive, not !isRunning, so Re-test busy suppresses the receipt",
    );
    // The old !isRunning check must NOT remain for the receipt early return.
    assert.ok(
      !source.includes("if (jointReceiptOwnsPanel && !isRunning) return ("),
      "The old 'jointReceiptOwnsPanel && !isRunning' check must be replaced with freshRunActive",
    );
  });

  it("4: historical receipt still allowed when no fresh run is active", () => {
    // The FRESH_RUN_SUPERSEDES_RECEIPT_STATES check still exists for terminal
    // states, and when freshRunActive is false the receipt may own the panel.
    assert.ok(
      readSource("src/components/room/bass/optimiseWorkflow/crossoverReceiptState.js").includes('plan.run?.outcome !== "actionable_plan_produced"'),
      "The terminal-state supersede check must remain for when no fresh run is active",
    );
    assert.ok(
      source.includes("jointReceiptState?.ownsPanel === true && !freshRunActive"),
      "freshRunActive guard exists before the terminal-state check",
    );
  });

  it("5: reoptimiseBusy is a prop of the component", () => {
    assert.ok(
      source.includes("reoptimiseBusy = false"),
      "reoptimiseBusy must be a destructured prop",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DEFECT 2 — HELD TRADE-OFF USES APPLIED WORDING
// ═══════════════════════════════════════════════════════════════════════════

describe("Defect 2 — Held trade-off wording", () => {
  const autoApplySource = readSource(AUTO_APPLY_PATH);
  const tradeOffSource = readSource(TRADE_OFF_STATE_PATH);

  it("7: describeRearGroupOffset fallback no longer says 'is applied'", () => {
    // The fallback statement (signed == null) must not contain "is applied".
    const lines = autoApplySource.split("\n");
    const fallbackLine = lines.find((l) => l.includes("adjusts the evaluated group"));
    assert.ok(fallbackLine, "The fallback must use neutral wording 'adjusts the evaluated group'");
    // The old "is applied" wording must NOT be in the return string.
    const oldWording = lines.find((l) =>
      l.includes("The delay change is applied to the adjusted group"),
    );
    assert.ok(!oldWording, "The old 'is applied' wording must be removed from describeRearGroupOffset");
  });

  it("8: the offset statement does not claim applied for held trade-offs", () => {
    // Extract only the RETURN STRING literals inside describeRearGroupOffset,
    // not the comments — comments may legitimately discuss the wording rule.
    const offsetBlock = autoApplySource.slice(
      autoApplySource.indexOf("export function describeRearGroupOffset"),
      autoApplySource.indexOf("// ── The decision"),
    );
    // Collect every `return "..."` string literal in the function.
    const returnStrings = [...offsetBlock.matchAll(/return\s+["'`]([^"'`]+)["'`]/g)]
      .map((m) => m[1]);
    assert.ok(returnStrings.length > 0, "describeRearGroupOffset must have return string literals");
    for (const str of returnStrings) {
      assert.ok(
        !/\bis applied\b/.test(str),
        `Return string must not say 'is applied': "${str.slice(0, 60)}..."`,
      );
      assert.ok(
        !/\bwas applied\b/.test(str),
        `Return string must not say 'was applied': "${str.slice(0, 60)}..."`,
      );
      assert.ok(
        !/\bhas been applied\b/.test(str),
        `Return string must not say 'has been applied': "${str.slice(0, 60)}..."`,
      );
    }
  });

  it("9: the APPLIED case sentence still correctly says 'ADI applied'", () => {
    // For the genuinely-applied case, the full sentence starts with
    // "ADI applied the ... candidate." — that is correct because the decision
    // IS applied. The offsetStatement is a separate clause describing the
    // change, not claiming applied.
    assert.ok(
      autoApplySource.includes("`ADI applied the ${objectiveLabel} candidate.`"),
      "The APPLIED case sentence must still say 'ADI applied the ... candidate.'",
    );
  });

  it("10: held design changes still say 'has not been applied'", () => {
    // Physical design changes (buildDesignChangeRecommendations) correctly
    // state "has not been applied".
    assert.ok(
      autoApplySource.includes("This requires a design change, so it has not been applied."),
      "Physical design change recommendations must still say 'has not been applied'",
    );
  });

  it("11: materiality-held calibration still says 'Nothing has been applied'", () => {
    assert.ok(
      autoApplySource.includes("Nothing has been applied — your approval is required."),
      "Materiality-held calibration must still say 'Nothing has been applied'",
    );
  });

  it("12: adjustmentLine in optimiserTradeOffState uses offsetStatement (neutral)", () => {
    // The trade-off's adjustment line reads decision.offsetStatement first.
    // Since that is now neutral, a held trade-off will NOT say "is applied".
    assert.ok(
      tradeOffSource.includes("const offset = typeof decision?.offsetStatement === \"string\""),
      "adjustmentLine reads decision.offsetStatement",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHECKS — applied/held distinction is owned by the decision authority
// ═══════════════════════════════════════════════════════════════════════════

describe("Application-state authority", () => {
  const resultVmSource = readSource("src/components/room/bass/optimiserPlan/optimiserResultViewModel.js");

  it("13: OPTIMISER_APPLIED_STATE distinguishes APPLIED from HELD", () => {
    assert.ok(
      resultVmSource.includes("APPLIED: \"applied\""),
      "OPTIMISER_APPLIED_STATE.APPLIED exists",
    );
    assert.ok(
      resultVmSource.includes("HELD: \"held\""),
      "OPTIMISER_APPLIED_STATE.HELD exists",
    );
  });

  it("14: HELD label is 'Held — not applied'", () => {
    assert.ok(
      resultVmSource.includes("[OPTIMISER_APPLIED_STATE.HELD]: \"Held — not applied\""),
      "The HELD label explicitly says 'not applied'",
    );
  });

  it("15: AdiAppliedStateLine renders the decision's applied/held state", () => {
    const appliedLineSource = readSource("src/components/room/bass/optimiserPlan/AdiAppliedStateLine.jsx");
    assert.ok(
      appliedLineSource.includes("resultModel.appliedStateLabel"),
      "AdiAppliedStateLine renders the applied state label from the result model",
    );
    assert.ok(
      appliedLineSource.includes("data-adi-applied-state={state}"),
      "AdiAppliedStateLine carries the applied state as a data attribute",
    );
  });
});