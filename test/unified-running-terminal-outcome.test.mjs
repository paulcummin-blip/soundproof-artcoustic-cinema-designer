// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED RUNNING / TERMINAL OUTCOME — regression suite
//
// One shared freshRunActive authority controls both receipt ownership and
// main running presentation. One canonical terminal outcome drives saved
// result, presentation, and history. A Primary-seat regression statement is
// allowed only when the affected seat is genuinely Primary AND its metric
// genuinely worsens.
//
// Source-inspection tests: they read the actual source files and assert on
// the exact contracts. No runtime, no mocks — the source IS the authority.
// ═══════════════════════════════════════════════════════════════════════════

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
const PRESENTATION_PATH = "src/components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
const CANONICAL_PATH = "src/components/room/bass/optimiserPlan/resolveCanonicalTerminalOutcome.js";
const TRADE_OFF_PATH = "src/components/room/bass/optimiserPlan/optimiserTradeOffState.js";
const RUN_PLAN_PATH = "src/components/room/bass/optimiseWorkflow/useRunOptimisationPlan.js";
const CALC_PATH = "src/components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx";
const RECOMMENDATION_PATH = "src/components/room/bass/optimiseWorkflow/AdiRecommendation.jsx";
const CONSTANTS_PATH = "src/components/room/bass/optimiserPlan/optimiserPlanConstants.js";

// ═══════════════════════════════════════════════════════════════════════════
// CASE A — RUNNING AUTHORITY
// ═══════════════════════════════════════════════════════════════════════════

describe("Case A — ONE freshRunActive authority", () => {
  const journey = readSource(JOURNEY_PATH);
  const presentation = readSource(PRESENTATION_PATH);
  const recommendation = readSource(RECOMMENDATION_PATH);

  it("1: Run ADI Again active → RUNNING (runStatus === 'running')", () => {
    assert.ok(
      journey.includes("const freshRunActive = runStatus === \"running\" || reoptimiseBusy === true;"),
      "freshRunActive must combine runStatus === 'running' (Run ADI Again) and reoptimiseBusy",
    );
    assert.ok(
      presentation.includes("if (runStatus === \"running\" || reoptimiseBusy === true)"),
      "Presentation state must return RUNNING when runStatus === 'running' OR reoptimiseBusy",
    );
  });

  it("2: Re-test active → RUNNING (reoptimiseBusy === true)", () => {
    assert.ok(
      presentation.includes("reoptimiseBusy"),
      "Presentation state must accept reoptimiseBusy",
    );
    assert.ok(
      recommendation.includes("reoptimiseBusy: reoptimiseBusy === true"),
      "AdiRecommendation must pass reoptimiseBusy to the presentation resolver",
    );
  });

  it("3: reoptimiseBusy=true with runStatus not running → RUNNING", () => {
    // The RUNNING check uses OR, so reoptimiseBusy alone drives RUNNING.
    const runningCheck = presentation.match(/if \(runStatus === "running" \|\| reoptimiseBusy === true\)/);
    assert.ok(runningCheck, "RUNNING check must use OR of runStatus and reoptimiseBusy");
  });

  it("4: active fresh run → no APPLIED/no_run state", () => {
    // The RUNNING return happens BEFORE any other state check.
    const runningIdx = presentation.indexOf("if (runStatus === \"running\" || reoptimiseBusy === true)");
    const failedIdx = presentation.indexOf("if (runStatus === \"failed\"");
    const staleIdx = presentation.indexOf("status === OPTIMISER_PLAN_STATUS.STALE");
    assert.ok(runningIdx > 0, "RUNNING check exists");
    assert.ok(runningIdx < failedIdx, "RUNNING check must come BEFORE the FAILED check");
    assert.ok(runningIdx < staleIdx, "RUNNING check must come BEFORE the STALE check");
  });

  it("5: historical receipt cannot own active panel during fresh run", () => {
    assert.ok(
      journey.includes("if (freshRunActive) return false;"),
      "jointReceiptOwnsPanel must return false when freshRunActive is true",
    );
    assert.ok(
      journey.includes("if (jointReceiptOwnsPanel && !freshRunActive) return ("),
      "The early-return panel check must use !freshRunActive",
    );
  });

  it("6: fresh terminal outcome replaces running state normally", () => {
    // When freshRunActive is false, the normal presentation flow resumes.
    assert.ok(
      journey.includes("const isRunning = freshRunActive;"),
      "isRunning must be derived from freshRunActive (same authority)",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE B — SINGLE TERMINAL OUTCOME
// ═══════════════════════════════════════════════════════════════════════════

describe("Case B — CANONICAL TERMINAL AUTHORITY", () => {
  const canonical = readSource(CANONICAL_PATH);
  const presentation = readSource(PRESENTATION_PATH);
  const runPlan = readSource(RUN_PLAN_PATH);
  const calc = readSource(CALC_PATH);
  const constants = readSource(CONSTANTS_PATH);

  it("7: safe practical winner → existing actionable outcome unchanged", () => {
    // The canonical authority returns actionable_plan first.
    assert.ok(
      canonical.includes("if (actionability?.actionable === true) return \"actionable_plan\";"),
      "An actionable plan must return 'actionable_plan' first (unchanged)",
    );
  });

  it("8: safe non-practical winner → NON_ACTIONABLE_WINNER", () => {
    assert.ok(
      canonical.includes("if (planOutcome === OPTIMISER_TERMINAL_OUTCOME.NON_ACTIONABLE_WINNER)"),
      "Non-actionable winner must be checked before trade-off and no-useful-improvement",
    );
    assert.ok(
      canonical.includes('return "non_actionable_winner"'),
      "Non-actionable winner must return 'non_actionable_winner'",
    );
  });

  it("9: non-actionable winner + calibration trade-off → NON_ACTIONABLE_WINNER", () => {
    // The NON_ACTIONABLE_WINNER check comes BEFORE the trade-off check.
    const nonActionableIdx = canonical.indexOf("NON_ACTIONABLE_WINNER");
    const tradeOffIdx = canonical.indexOf("isCalibrationTradeOffDecision");
    assert.ok(nonActionableIdx > 0 && tradeOffIdx > 0, "Both checks exist");
    assert.ok(
      nonActionableIdx < tradeOffIdx,
      "NON_ACTIONABLE_WINNER must be checked BEFORE the trade-off check",
    );
  });

  it("10: saved result uses resolveCanonicalTerminalOutcome (Run ADI Again route)", () => {
    assert.ok(
      runPlan.includes("resolveCanonicalTerminalOutcome"),
      "useRunOptimisationPlan must import and use resolveCanonicalTerminalOutcome",
    );
    assert.ok(
      runPlan.includes("runTerminalStatus = resolveCanonicalTerminalOutcome("),
      "runTerminalStatus must be derived from resolveCanonicalTerminalOutcome",
    );
  });

  it("11: presentation uses NON_ACTIONABLE_WINNER before TRADE_OFF", () => {
    const nonActionableIdx = presentation.indexOf("OPTIMISER_PLAN_STATUS.NON_ACTIONABLE_WINNER");
    const tradeOffIdx = presentation.indexOf("if (tradeOff?.isTradeOff)");
    assert.ok(nonActionableIdx > 0, "NON_ACTIONABLE_WINNER presentation check exists");
    assert.ok(tradeOffIdx > 0, "TRADE_OFF presentation check exists");
    assert.ok(
      nonActionableIdx < tradeOffIdx,
      "NON_ACTIONABLE_WINNER must be presented BEFORE TRADE_OFF",
    );
  });

  it("12: history uses resolveCanonicalTerminalOutcome (Re-test route)", () => {
    assert.ok(
      calc.includes("resolveCanonicalTerminalOutcome"),
      "OptimiseAndCalculate must import and use resolveCanonicalTerminalOutcome",
    );
    assert.ok(
      calc.includes("runTerminalStatus = resolveCanonicalTerminalOutcome("),
      "Re-test route must derive runTerminalStatus from resolveCanonicalTerminalOutcome",
    );
  });

  it("13: winner ID preserved — canonical authority does not read winner id", () => {
    // The canonical terminal outcome returns a string classification; it does
    // not touch or overwrite the winner id in the saved record.
    assert.ok(
      !canonical.includes("winnerId") && !canonical.includes("candidateId"),
      "resolveCanonicalTerminalOutcome must not reference winner/candidate id (it preserves them)",
    );
  });

  it("14: calibration trade-off remains available as secondary/supporting evidence", () => {
    // In the NON_ACTIONABLE_WINNER presentation block, tradeOff is passed as
    // supporting evidence.
    const nonActionBlock = presentation.slice(
      presentation.indexOf("if (status === OPTIMISER_PLAN_STATUS.NON_ACTIONABLE_WINNER)"),
      presentation.indexOf("if (hasApplicableEvaluatedLever"),
    );
    assert.ok(
      nonActionBlock.includes("tradeOff: tradeOff?.isTradeOff ? tradeOff : null"),
      "NON_ACTIONABLE_WINNER must carry the trade-off as supporting evidence",
    );
  });

  it("15: calibration trade-off does not override run outcome", () => {
    // The canonical authority checks NON_ACTIONABLE_WINNER before the trade-off,
    // so the trade-off can never override a non-actionable winner.
    const nonActionableReturn = canonical.indexOf('return "non_actionable_winner"');
    const tradeOffCheck = canonical.indexOf("isCalibrationTradeOffDecision(calibrationDecision)");
    assert.ok(nonActionableReturn > 0 && tradeOffCheck > 0);
    assert.ok(
      nonActionableReturn < tradeOffCheck,
      "The non_actionable_winner return must come before the trade-off check",
    );
  });

  it("16: no winner + genuine trade-off → TRADE_OFF", () => {
    assert.ok(
      canonical.includes('if (isCalibrationTradeOffDecision(calibrationDecision))'),
      "A held calibration trade-off must be checked when no higher-priority outcome exists",
    );
    assert.ok(
      canonical.includes('return "trade_off"'),
      "A genuine trade-off must return 'trade_off'",
    );
  });

  it("17: no winner + no useful result → NO_USEFUL_IMPROVEMENT", () => {
    assert.ok(
      canonical.includes('return "no_useful_improvement"'),
      "No winner and no trade-off must return 'no_useful_improvement'",
    );
    // The no_useful_improvement return is the LAST return (fallback).
    const lastReturn = canonical.lastIndexOf("return");
    assert.ok(
      canonical.slice(lastReturn).includes('return "no_useful_improvement"'),
      "'no_useful_improvement' must be the final fallback return",
    );
  });

  it("18: Primary regression statement requires actual Primary regression", () => {
    const tradeOff = readSource(TRADE_OFF_PATH);
    assert.ok(
      tradeOff.includes("const verifiedPrimaryRegression = affectedIsPrimary && affectedWorsens;"),
      "verifiedPrimaryRegression must require both affectedIsPrimary AND affectedWorsens",
    );
    assert.ok(
      tradeOff.includes("affectedIsPrimary"),
      "The affected seat's isPrimary flag must be checked from per-seat evidence",
    );
    assert.ok(
      tradeOff.includes("affectedWorsens"),
      "The affected seat's metric worsening must be checked from per-seat evidence",
    );
  });

  it("19: Secondary-only regression never described as Primary regression", () => {
    const tradeOff = readSource(TRADE_OFF_PATH);
    // The headline uses verifiedPrimaryRegression to decide between
    // TRADE_OFF_HEADLINE (primary) and TRADE_OFF_METRIC_NOTE (secondary).
    assert.ok(
      tradeOff.includes("verifiedPrimaryRegression ? TRADE_OFF_HEADLINE : TRADE_OFF_METRIC_NOTE"),
      "The headline must fall back to TRADE_OFF_METRIC_NOTE when the regression is not primary",
    );
    // The impact line must use "Seat …" not "Primary seat …" for non-primary.
    assert.ok(
      tradeOff.includes('verifiedPrimaryRegression\n      ? `Primary seat ${seat.label}: ${seatClause}`'),
      "The impact line must say 'Primary seat' only for verified primary regressions",
    );
    assert.ok(
      tradeOff.includes('`Seat ${seat.label}: ${seatClause}`'),
      "The impact line must say 'Seat …' (not 'Primary seat …') for secondary regressions",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE C — UNCHANGED CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Case C — unchanged contracts", () => {
  const tradeOff = readSource(TRADE_OFF_PATH);
  const autoApply = readSource("src/components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js");

  it("20: held trade-off wording unchanged and honest", () => {
    // The offset statement for held trade-offs must not say "is applied".
    const offsetBlock = autoApply.slice(
      autoApply.indexOf("export function describeRearGroupOffset"),
      autoApply.indexOf("// ── The decision"),
    );
    const returnStrings = [...offsetBlock.matchAll(/return\s+["'`]([^"'`]+)["'`]/g)]
      .map((m) => m[1]);
    assert.ok(returnStrings.length > 0, "describeRearGroupOffset has return string literals");
    for (const str of returnStrings) {
      assert.ok(!/\bis applied\b/.test(str), `Held trade-off must not say 'is applied': "${str.slice(0, 60)}"`);
    }
  });

  it("21: exact evaluated/saved/Apply coordinates unchanged", () => {
    // The canonical authority does not touch coordinates.
    const canonical = readSource(CANONICAL_PATH);
    assert.ok(
      !canonical.includes("coordinate") && !canonical.includes("position"),
      "resolveCanonicalTerminalOutcome must not reference coordinates or positions",
    );
  });

  it("22: winnerless persistence unchanged", () => {
    const constants = readSource(CONSTANTS_PATH);
    assert.ok(
      constants.includes("NO_USEFUL_IMPROVEMENT: \"no_useful_improvement\""),
      "NO_USEFUL_IMPROVEMENT terminal outcome constant is preserved",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STATE SAFETY — stronger existing states are protected
// ═══════════════════════════════════════════════════════════════════════════

describe("State safety — stronger existing states protected", () => {
  const canonical = readSource(CANONICAL_PATH);
  const runPlan = readSource(RUN_PLAN_PATH);
  const calc = readSource(CALC_PATH);

  it("23: genuine EVALUATION_INCOMPLETE remains EVALUATION_INCOMPLETE", () => {
    assert.ok(
      canonical.includes("if (planOutcome === OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE)"),
      "EVALUATION_INCOMPLETE must be checked and returned before the trade-off check",
    );
    assert.ok(
      canonical.includes('return "evaluation_incomplete"'),
      "EVALUATION_INCOMPLETE must return 'evaluation_incomplete'",
    );
    // The EVALUATION_INCOMPLETE check comes before the trade-off check.
    const incompleteIdx = canonical.indexOf("EVALUATION_INCOMPLETE");
    const tradeOffIdx = canonical.indexOf("isCalibrationTradeOffDecision");
    assert.ok(incompleteIdx < tradeOffIdx, "EVALUATION_INCOMPLETE must be checked before trade-off");
  });

  it("24: actually-applied current run remains applied", () => {
    // The canonical authority checks actionable FIRST. An applied run with an
    // actionable plan returns 'actionable_plan' — it is never overwritten by
    // a trade-off or no-useful-improvement.
    const actionableCheck = canonical.indexOf("if (actionability?.actionable === true) return \"actionable_plan\";");
    const nonActionableCheck = canonical.indexOf("if (planOutcome === OPTIMISER_TERMINAL_OUTCOME.NON_ACTIONABLE_WINNER)");
    assert.ok(actionableCheck > 0, "Actionable check exists in code");
    assert.ok(nonActionableCheck > 0, "Non-actionable winner check exists in code");
    assert.ok(actionableCheck < nonActionableCheck, "Actionable must be checked before non-actionable winner");
  });

  it("25: actionable safe winner remains actionable", () => {
    assert.ok(
      canonical.includes("if (actionability?.actionable === true) return \"actionable_plan\";"),
      "An actionable plan returns 'actionable_plan' immediately — never downgraded",
    );
  });

  it("26: publication failure remains publication failure and is not rewritten by canonical selection", () => {
    // The canonical authority returns a terminal classification string. It does
    // not handle publication failure — that remains a separate lifecycle event
    // recorded in the history row's publicationStatus, never in terminalStatus.
    // The runPlan catch block records publicationStatus: "failed" without
    // overwriting runTerminalStatus.
    assert.ok(
      runPlan.includes('publicationStatus: "failed"'),
      "Publication failure must record publicationStatus: 'failed'",
    );
    assert.ok(
      runPlan.includes("terminalStatus: runTerminalStatus"),
      "Publication failure path must preserve runTerminalStatus (not overwrite it)",
    );
    // Same for the Re-test route.
    assert.ok(
      calc.includes("publicationStatus: \"failed\""),
      "Re-test route must record publicationStatus: 'failed' on publication failure",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE AUDIT — no duplicate overall terminal derivations remain
// ═══════════════════════════════════════════════════════════════════════════

describe("Source audit — duplicate derivations eliminated", () => {
  const runPlan = readSource(RUN_PLAN_PATH);
  const calc = readSource(CALC_PATH);

  it("no residual 'persistedPlan ? actionable_plan : no_useful_improvement' in useRunOptimisationPlan", () => {
    assert.ok(
      !runPlan.includes('persistedPlan ? "actionable_plan" : "no_useful_improvement"'),
      "useRunOptimisationPlan must NOT independently derive terminal status from persistedPlan existence",
    );
    // The finalization must use runTerminalStatus (the canonical value).
    assert.ok(
      runPlan.includes("terminalStatus: runTerminalStatus,"),
      "useRunOptimisationPlan history finalization must use runTerminalStatus",
    );
  });

  it("no residual 'persistedPlan ? actionable_plan : no_useful_improvement' in OptimiseAndCalculate", () => {
    assert.ok(
      !calc.includes('persistedPlan ? "actionable_plan" : "no_useful_improvement"'),
      "OptimiseAndCalculate must NOT independently derive terminal status from persistedPlan existence",
    );
  });

  it("both execution routes import resolveCanonicalTerminalOutcome", () => {
    assert.ok(
      runPlan.includes('import { resolveCanonicalTerminalOutcome }'),
      "useRunOptimisationPlan must import resolveCanonicalTerminalOutcome",
    );
    assert.ok(
      calc.includes('import { resolveCanonicalTerminalOutcome }'),
      "OptimiseAndCalculate must import resolveCanonicalTerminalOutcome",
    );
  });
});