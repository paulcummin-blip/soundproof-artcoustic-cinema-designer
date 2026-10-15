// optimiser-trade-off-state.test.mjs
// ---------------------------------------------------------------------------
// FOCUSED TESTS — the TRADE-OFF FOUND decision state.
//
// One completed run whose best change improves the overall result but worsens a
// protected primary seat must be stated as a trade-off, with the exact seat, its
// own current → proposed result, the amount it worsens by, the overall P20 and
// P19 pairs, one review action that owns the only Apply, and the designer's own
// "keep the current design" that applies nothing.
//
// Nothing here changes an optimiser rule: the fixtures are the run's own recorded
// decision evidence, and the assertions are presentation.
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  TRADE_OFF_ACTIONS,
  TRADE_OFF_DIRECTION,
  TRADE_OFF_HEADLINE,
  TRADE_OFF_KEPT_LABEL,
  TRADE_OFF_KEPT_SENTENCE,
  readRecordedSeatRegression,
  resolveTradeOffState,
  tradeOffApplySentence,
} from "../components/room/bass/optimiserPlan/optimiserTradeOffState.js";
import {
  OPTIMISER_OUTCOME,
  OPTIMISER_OUTCOME_LABEL,
  OPTIMISER_PRESENTATION_STATE,
  resolveOptimiserPresentationState,
} from "../components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import { CALIBRATION_APPLY_DECISION, CALIBRATION_APPLY_REASON } from "../components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(resolve(HERE, "..", path), "utf8");

const PLAN_DIR = "components/room/bass/optimiserPlan";
const WORKFLOW_DIR = "components/room/bass/optimiseWorkflow";

// ── The current real case, exactly as the run recorded it ──
// Rear sub group +5.4 ms relative to the front group; overall P20 ±15 dB → ±12 dB;
// the candidate held because primary seat r1-c2 regresses.
const REAL_CASE = Object.freeze({
  decision: CALIBRATION_APPLY_DECISION.HOLD,
  reason: CALIBRATION_APPLY_REASON.PRIMARY_SEAT_REGRESSION,
  statement: "The combined candidate regresses P20 at r1-c2 by 1.2 dB. This is a trade-off, so it has not been applied — your approval is required.",
  offsetStatement: "Rear sub group +5.4 ms relative to the front group",
  objective: "combined",
  objectiveLabel: "combined",
  candidateId: "cand-combined-7",
  before: {
    p19: { deviationDb: 6.4, level: 2 },
    p20: { deviationDb: 15, level: 1 },
    perSeatP20: [
      { seatId: "r1-c1", isPrimary: true, level: 1, variationDbRaw: 13.2 },
      { seatId: "r1-c2", isPrimary: true, level: 1, variationDbRaw: 9.1 },
      { seatId: "r2-c1", isPrimary: false, level: 1, variationDbRaw: 15 },
    ],
    perSeatP19: [
      { seatId: "r1-c1", isPrimary: true, level: 2, variationDbRaw: 6.2 },
      { seatId: "r1-c2", isPrimary: true, level: 2, variationDbRaw: 5.9 },
    ],
  },
  after: {
    p19: { deviationDb: 6.4, level: 2 },
    p20: { deviationDb: 12, level: 1 },
    perSeatP20: [
      { seatId: "r1-c1", isPrimary: true, level: 1, variationDbRaw: 12 },
      { seatId: "r1-c2", isPrimary: true, level: 1, variationDbRaw: 10.3 },
      { seatId: "r2-c1", isPrimary: false, level: 1, variationDbRaw: 12.1 },
    ],
    perSeatP19: [
      { seatId: "r1-c1", isPrimary: true, level: 2, variationDbRaw: 6.1 },
      { seatId: "r1-c2", isPrimary: true, level: 2, variationDbRaw: 5.9 },
    ],
  },
  improvement: { p19DeltaDb: 0, p20DeltaDb: 3, p19Improved: false, p20Improved: true },
  damage: { p19WorseDb: null, p20WorseDb: null, p19LevelDrop: false, p20LevelDrop: false },
  regression: {
    regressed: true,
    seatId: "r1-c2",
    parameter: "P20",
    currentLevel: 1,
    candidateLevel: 1,
    rawDeltaDb: 1.2,
    reason: "same-level raw regression",
  },
});

const resolveRealCase = (overrides = {}) => resolveTradeOffState({
  decision: { ...REAL_CASE, ...overrides },
});

// ── 1. The trade-off is detected, and the seat is shown exactly ──

test("a completed run whose improvement worsens a primary seat is a trade-off", () => {
  const tradeOff = resolveRealCase();
  assert.ok(tradeOff, "the recorded decision must resolve as a trade-off");
  assert.equal(tradeOff.isTradeOff, true);
  assert.equal(tradeOff.headline, TRADE_OFF_HEADLINE);
  assert.equal(tradeOff.candidateId, "cand-combined-7");
});

test("the exact affected primary seat, its current → proposed result and the amount worsened are shown", () => {
  const tradeOff = resolveRealCase();
  assert.equal(tradeOff.seat.seatId, "r1-c2");
  assert.equal(tradeOff.seat.scope, "primary");
  assert.equal(tradeOff.seat.parameter, "P20");
  assert.ok(tradeOff.seat.label, "the seat label is read from the canonical label authority");
  assert.equal(tradeOff.seat.before, "±9 dB · L1");
  assert.equal(tradeOff.seat.after, "±10 dB · L1");
  assert.equal(tradeOff.seat.direction, TRADE_OFF_DIRECTION.WORSENS);
  assert.equal(tradeOff.seat.deltaText, "1 dB worse");
  // The one impact line states the same seat and the same values.
  assert.match(tradeOff.impact, /Primary seat/);
  assert.match(tradeOff.impact, /P20 ±9 dB · L1 → ±10 dB · L1 \(1 dB worse\)/);
});

test("the proposed adjustment is the run's own recorded change, never re-worded", () => {
  const tradeOff = resolveRealCase();
  assert.equal(tradeOff.adjustment, "Rear sub group +5.4 ms relative to the front group");
  // With no recorded offset statement, the decision's own first sentence names it.
  const withoutOffset = resolveRealCase({ offsetStatement: null });
  assert.match(withoutOffset.adjustment, /^The combined candidate regresses/);
});

// ── 2. The overall P20 and P19 pairs travel with the state ──

test("overall P20 and P19 current → proposed are both stated, with their direction", () => {
  const tradeOff = resolveRealCase();
  const p20 = tradeOff.overall.find((row) => row.key === "p20");
  const p19 = tradeOff.overall.find((row) => row.key === "p19");
  assert.equal(p20.before, "±15 dB · L1");
  assert.equal(p20.after, "±12 dB · L1");
  assert.equal(p20.direction, TRADE_OFF_DIRECTION.IMPROVES);
  assert.equal(p20.delta, "3 dB better");
  assert.equal(p19.before, "±6 dB · L2");
  assert.equal(p19.after, "±6 dB · L2");
  assert.equal(p19.direction, TRADE_OFF_DIRECTION.UNCHANGED);
});

test("every seat the run retained is stated with its own direction, primary seats first", () => {
  const tradeOff = resolveRealCase();
  const seats = tradeOff.rows.filter((row) => row.group !== "Overall");
  assert.ok(seats.some((row) => row.key === "seat:r1-c1" && row.group === "Primary seats"));
  assert.ok(seats.some((row) => row.key === "seat:r1-c2" && row.direction === TRADE_OFF_DIRECTION.WORSENS));
  assert.ok(seats.some((row) => row.key === "seat:r2-c1" && row.group === "Secondary seats"));
});

test("a displayed-level regression is stated as worsening even when no raw value was retained", () => {
  const tradeOff = resolveTradeOffState({
    decision: {
      ...REAL_CASE,
      // The run recorded the level drop but did not retain that seat's own
      // proposed row: the level itself is the evidence.
      after: { ...REAL_CASE.after, perSeatP20: REAL_CASE.after.perSeatP20.filter((seat) => seat.seatId !== "r1-c2") },
      regression: { regressed: true, seatId: "r1-c2", parameter: "P20", currentLevel: 1, candidateLevel: 2 },
    },
  });
  assert.equal(tradeOff.seat.after, "L2");
  assert.equal(tradeOff.seat.direction, TRADE_OFF_DIRECTION.WORSENS);
  assert.match(tradeOff.impact, /L1 → L2/);
});

// ── 3. The state is TRADE-OFF FOUND, never IMPROVEMENT FOUND ──

test("the presentation state is Trade-off Found, with no plan action and no Apply on the card", () => {
  const tradeOff = resolveRealCase();
  const state = resolveOptimiserPresentationState({
    planView: { status: "current" },
    runStatus: "idle",
    tradeOff,
  });
  assert.equal(state.state, OPTIMISER_PRESENTATION_STATE.TRADE_OFF);
  assert.equal(state.outcome, OPTIMISER_OUTCOME.TRADE_OFF);
  assert.equal(state.outcomeLabel, "Trade-off Found");
  assert.notEqual(state.outcomeLabel, OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND]);
  assert.equal(state.showApply, false);
  assert.equal(state.action, null);
  assert.equal(state.canRun, false);
  assert.equal(state.tradeOff.seat.seatId, "r1-c2");
});

test("the trade-off state leaves the safe-improvement and physical-change outcomes untouched", () => {
  // No trade-off recorded: the resolver states nothing, so the existing branches
  // decide the outcome exactly as before.
  assert.equal(resolveTradeOffState({ decision: null }), null);
  assert.equal(resolveTradeOffState({ decision: { decision: CALIBRATION_APPLY_DECISION.APPLIED, reason: CALIBRATION_APPLY_REASON.IMPROVES_ONE_WITHOUT_DAMAGE } }), null);
  assert.equal(resolveTradeOffState({ decision: { decision: CALIBRATION_APPLY_DECISION.NONE, reason: CALIBRATION_APPLY_REASON.NOT_MATERIAL } }), null);
  assert.equal(resolveTradeOffState({ decision: { decision: CALIBRATION_APPLY_DECISION.HOLD, reason: CALIBRATION_APPLY_REASON.HUMAN_CALIBRATION, improvement: REAL_CASE.improvement } }), null);
  // A held candidate that improved nothing is a rejection, not a decision.
  assert.equal(resolveRealCase({ improvement: { p19DeltaDb: 0, p20DeltaDb: 0, p19Improved: false, p20Improved: false } }), null);

  const source = read(`${PLAN_DIR}/resolveOptimiserPresentationState.js`);
  // The improvement and physical-change branches are unchanged and still own
  // their own outcomes.
  assert.match(source, /OPTIMISER_OUTCOME\.PHYSICAL_CHANGE/);
  assert.match(source, /OPTIMISER_OUTCOME\.IMPROVEMENTS_FOUND/);
  assert.match(source, /status === OPTIMISER_PLAN_STATUS\.NO_USEFUL_IMPROVEMENT/);
});

// ── 4. One review action, one Apply, and the designer's own keep ──

test("the main card offers Review Trade-off and Keep Current Design, and draws no Apply", () => {
  const journey = read(`${PLAN_DIR}/AdiOptimisationJourney.jsx`);
  assert.match(journey, /tradeOffActive && \(\s*<AdiTradeOffActions/);
  assert.match(journey, /onKeep=\{onKeepTradeOff\}/);
  // No run control and no plan control while the trade-off is live.
  assert.match(journey, /const showAction = !!journey\.action && journey\.canRun && !isRunning\s*\n\s*&& !tradeOffActive && !tradeOffSettled;/);
  assert.match(journey, /\{!tradeOffActive && !tradeOffSettled && \(<>/);

  const actions = read(`${PLAN_DIR}/AdiTradeOffActions.jsx`);
  assert.match(actions, /TRADE_OFF_ACTIONS\.REVIEW/);
  assert.match(actions, /TRADE_OFF_ACTIONS\.KEEP/);
  // Apply is never drawn by the main card's own control block.
  assert.ok(!/TRADE_OFF_ACTIONS\.APPLY/.test(actions), "the card must not draw Apply directly");
  assert.ok(!/data-adi-trade-off-apply/.test(actions), "the card must not draw the Apply button itself");
});

test("Apply lives inside the review only, stated with the seat it would cost", () => {
  const dialog = read(`${PLAN_DIR}/AdiTradeOffReviewDialog.jsx`);
  assert.match(dialog, /data-adi-trade-off-apply="true"/);
  assert.match(dialog, /TRADE_OFF_ACTIONS\.APPLY/);
  assert.match(dialog, /tradeOffApplySentence\(seatLabel\)/);
  assert.match(dialog, /data-adi-trade-off-apply-note="true"/);
  // The review marks every row.
  assert.match(dialog, /Improves/);
  assert.match(dialog, /Unchanged/);
  assert.match(dialog, /Worsens/);
  assert.equal(
    tradeOffApplySentence("Row 1 - Seat 2"),
    "This change improves overall consistency but worsens Row 1 - Seat 2.",
  );
});

test("Keep Current Design applies nothing and resolves the panel to a terminal state", () => {
  const store = read(`${PLAN_DIR}/optimiserKeepTradeOffStore.js`);
  assert.ok(!/base44|entities\.|commit|onRecalculate/.test(store), "keeping must write no design or engineering state");
  assert.match(store, /localStorage/);

  const recommendation = read(`${WORKFLOW_DIR}/AdiRecommendation.jsx`);
  assert.match(recommendation, /const handleKeepTradeOff = useCallback\(\(\) => \{\s*keepTradeOff\(tradeOffKeptKey\);/);
  assert.ok(!/handleKeepTradeOff[\s\S]{0,120}commitInstances/.test(recommendation));

  const journey = read(`${PLAN_DIR}/AdiOptimisationJourney.jsx`);
  assert.match(journey, /data-adi-trade-off-kept="true"/);
  assert.match(journey, /TRADE_OFF_KEPT_LABEL/);
  assert.match(journey, /TRADE_OFF_KEPT_SENTENCE/);
  assert.equal(TRADE_OFF_KEPT_LABEL, "Current Design Kept");
});

// ── 5. Refresh / reopen keeps the seat-regression evidence ──

test("the seat-regression evidence is recorded on the decision the run saves", () => {
  const authority = read(`${WORKFLOW_DIR}/adiCalibrationAutoApplyAuthority.js`);
  // The evidence the protection already computed is recorded with the decision,
  // in both places a held primary-seat regression is stated. This is additive:
  // no rule, threshold or statement changed.
  const recordings = authority.match(/\{ \.\.\.(?:context|tradeOffContext), regression \}/g) || [];
  assert.equal(recordings.length, 2, "both held-regression branches record the seat evidence");
  // The protection rule itself is untouched: the same single tolerance, in the
  // one place it has always lived.
  const protection = read("components/room/bass/best-layout/authoritativeFinalistSelection.js");
  assert.match(protection, /export function hasPrimarySeatRegression/);
  assert.match(protection, /PRIMARY_RAW_REGRESSION_THRESHOLD_DB = 1\.0/);
});

test("a saved decision alone recreates the same trade-off after refresh or reopen", () => {
  // The decision is what the plan persists, and the resolver reads nothing else.
  const saved = JSON.parse(JSON.stringify(REAL_CASE));
  const afterReopen = resolveTradeOffState({ decision: saved });
  const live = resolveRealCase();
  assert.ok(afterReopen, "the reopened decision must resolve as the same trade-off");
  assert.equal(afterReopen.candidateId, live.candidateId);
  assert.equal(afterReopen.seat.seatId, live.seat.seatId);
  assert.equal(afterReopen.seat.label, live.seat.label);
  assert.equal(afterReopen.seat.before, live.seat.before);
  assert.equal(afterReopen.seat.after, live.seat.after);
  assert.equal(afterReopen.seat.deltaText, live.seat.deltaText);
  assert.equal(afterReopen.impact, live.impact);
  assert.equal(afterReopen.adjustment, live.adjustment);
  assert.deepEqual(
    afterReopen.rows.map((row) => [row.key, row.group, row.direction, row.before, row.after, row.delta]),
    live.rows.map((row) => [row.key, row.group, row.direction, row.before, row.after, row.delta]),
  );
});

test("the kept decision is remembered for the project version and candidate only", () => {
  const store = read(`${PLAN_DIR}/optimiserKeepTradeOffStore.js`);
  assert.match(store, /b44_adi_tradeoff_kept_v1/);
  assert.match(store, /STORAGE_PREFIX\}\}::\$\{projectId/);
  assert.match(store, /candidateId/);
});

// ── 6. Evidence reads ──

test("the seat regression is read from the structured evidence, with the statement as fallback", () => {
  assert.deepEqual(readRecordedSeatRegression({ regression: REAL_CASE.regression }), {
    seatId: "r1-c2",
    parameter: "P20",
    rawDeltaDb: 1.2,
    levelBefore: "L1",
    levelAfter: "L1",
  });
  const legacy = readRecordedSeatRegression({ statement: "The combined candidate regresses P20 at r3-c1 by 2.4 dB. This is a trade-off." });
  assert.equal(legacy.seatId, "r3-c1");
  assert.equal(legacy.rawDeltaDb, 2.4);
});

test("no optimiser calculation, threshold or apply logic changed", () => {
  const resolver = read(`${PLAN_DIR}/optimiserTradeOffState.js`);
  assert.ok(!/improveBassV2Engine|groupedDelaySearch|stage2|materialityGate/.test(resolver),
    "the trade-off resolver performs no optimisation and imports no search");
  // Apply reuses the existing lever apply path.
  const journey = read(`${PLAN_DIR}/AdiOptimisationJourney.jsx`);
  assert.match(journey, /const handleApplyTradeOff = tradeOffLever && typeof onApplyLever === "function"/);
  assert.match(journey, /onApply=\{handleApplyTradeOff\}/);
});

test("the presentation actions constant names the review and the keep", () => {
  assert.equal(TRADE_OFF_ACTIONS.REVIEW, "Review Trade-off");
  assert.equal(TRADE_OFF_ACTIONS.KEEP, "Keep Current Design");
  assert.equal(TRADE_OFF_ACTIONS.APPLY, "Apply Change");
});