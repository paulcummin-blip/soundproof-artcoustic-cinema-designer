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
import { optimiserTradeOffKeptKey } from "../components/room/bass/optimiserPlan/optimiserKeepTradeOffStore.js";

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
  // The Apply sentence names the gain, the exact seat AND the exact amount that
  // seat loses — never a neutral "Apply change".
  assert.match(dialog, /tradeOffApplySentence\(seatLabel, amountText\)/);
  assert.match(dialog, /data-adi-trade-off-apply-note="true"/);
  // The review marks every row.
  assert.match(dialog, /Improves/);
  assert.match(dialog, /Unchanged/);
  assert.match(dialog, /Worsens/);
  assert.equal(
    tradeOffApplySentence("Row 1 - Seat 2", "1.2 dB"),
    "This change improves overall bass consistency, but makes Row 1 - Seat 2 worse by 1.2 dB.",
  );
  // Without a retained amount it still states the seat, and invents no figure.
  assert.equal(
    tradeOffApplySentence("Row 1 - Seat 2"),
    "This change improves overall bass consistency, but makes Row 1 - Seat 2 worse.",
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

test("the kept decision is remembered for the exact run and design it was decided on", () => {
  const decision = {
    projectId: "project-1",
    versionId: "version-1",
    runId: "optimiser-run-a",
    designFingerprint: "fp-design-a",
    candidateId: "cand-combined-7",
  };
  const kept = optimiserTradeOffKeptKey(decision);
  // The same project, design, run and candidate is the same decision: a refresh
  // or a project reopen restores it and does not offer the trade-off again.
  assert.equal(optimiserTradeOffKeptKey({ ...decision }), kept);
  // Every part of the scope is real — a different decision can never be mistaken
  // for this one, which is what stops an old dismissal hiding a new result.
  assert.notEqual(optimiserTradeOffKeptKey({ ...decision, candidateId: "cand-combined-8" }), kept);
  assert.notEqual(optimiserTradeOffKeptKey({ ...decision, runId: "optimiser-run-b" }), kept);
  assert.notEqual(optimiserTradeOffKeptKey({ ...decision, designFingerprint: "fp-design-b" }), kept);
  assert.notEqual(optimiserTradeOffKeptKey({ ...decision, versionId: "version-2" }), kept);
  assert.notEqual(optimiserTradeOffKeptKey({ ...decision, projectId: "project-2" }), kept);
  // The store's own record stays separated per project version.
  const store = read(`${PLAN_DIR}/optimiserKeepTradeOffStore.js`);
  assert.match(store, /STORAGE_PREFIX\}::\$\{projectId/);
  assert.match(store, /localStorage/);
});

test("Keep records the dismissal against the run and the design result, never the candidate alone", () => {
  const recommendation = read(`${WORKFLOW_DIR}/AdiRecommendation.jsx`);
  assert.match(recommendation, /optimiserTradeOffKeptKey\(\{[\s\S]{0,400}?runId: optimiserPlanView\?\.run\?\.runId/);
  assert.match(recommendation, /designFingerprint: shared\?\.cacheKey/);
  // The panel settles into its terminal state from the stored decision alone, so
  // keeping does not restart anything and does not re-offer the trade-off.
  const journey = read(`${PLAN_DIR}/AdiOptimisationJourney.jsx`);
  assert.match(journey, /const tradeOffSettled = !!tradeOff\?\.isTradeOff && tradeOffKept;/);
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

test("the presentation actions constant names the review, the keep and the trade-off Apply", () => {
  assert.equal(TRADE_OFF_ACTIONS.REVIEW, "Review Trade-off");
  assert.equal(TRADE_OFF_ACTIONS.KEEP, "Keep Current Design");
  // The Apply names the decision it is: a change with a known downside.
  assert.equal(TRADE_OFF_ACTIONS.APPLY, "Apply Trade-off");
});

// ── 7. The live saved record — Barton Solutions, V1, run 19:46:28Z ──
// Verbatim from the saved plan (saved 2026-10-15T19:46:34Z). This run predates the
// seat evidence being recorded with the decision, so it carries the seat in its own
// statement and retained no per-seat rows: the state must still be stated exactly.
const LIVE_SAVED = {
  decision: CALIBRATION_APPLY_DECISION.HOLD,
  reason: CALIBRATION_APPLY_REASON.PRIMARY_SEAT_REGRESSION,
  statement: "The Practical intervention ordering candidate regresses P20 at seat-r1-c2 by 1.2 dB. This is a trade-off, so it has not been applied — your approval is required.",
  offsetStatement: "Rear subwoofer group delay offset +5.4 ms — rear group later than the front group.",
  objective: "practical",
  objectiveLabel: "Practical intervention ordering",
  candidateId: 'grouped-delay:["sub-rear-1","sub-rear-2"]:1',
  before: { p19: { deviationDb: 0.7913641929311979, level: 4 }, p20: { deviationDb: 15.116028778061988, level: 1 } },
  after: { p19: { deviationDb: 0.8370847314354677, level: 4 }, p20: { deviationDb: 12.806331710223475, level: 1 } },
  improvement: { p19DeltaDb: 0, p20DeltaDb: 2.3, p19LevelGain: false, p20LevelGain: false, p19Improved: false, p20Improved: true },
  damage: { p19WorseDb: 0, p20WorseDb: -2.3, p19LevelDrop: false, p20LevelDrop: false, p19Damaged: false, p20Damaged: false, any: false },
  regression: null,
};

test("the live saved Barton record states Trade-off Found with its own seat and amount", () => {
  const tradeOff = resolveTradeOffState({ decision: LIVE_SAVED });
  assert.ok(tradeOff, "the live saved decision must resolve as a trade-off");
  assert.equal(tradeOff.isTradeOff, true);
  assert.equal(tradeOff.headline, TRADE_OFF_HEADLINE);
  assert.equal(tradeOff.seat.seatId, "seat-r1-c2");
  assert.equal(tradeOff.seat.direction, TRADE_OFF_DIRECTION.WORSENS);
  // This run retained no per-seat rows and no structured regression: the seat and the
  // exact amount it loses are read from the run's own recorded statement.
  assert.equal(tradeOff.seat.delta, 1.2);
  assert.match(tradeOff.impact, /Row 1 - Seat 2/);
  assert.match(tradeOff.impact, /worsens by 1\.2 dB/);
  assert.ok(!tradeOff.impact.includes("—"), "the live seat is never stated as — → —");
  // The run's own recorded adjustment, and the overall pair it bought — as displayed.
  assert.match(tradeOff.adjustment, /\+5\.4 ms/);
  const p20 = tradeOff.overall.find((row) => row.key === "p20");
  assert.equal(p20.before, "±15 dB · L1");
  assert.equal(p20.after, "±12 dB · L1");
  assert.equal(p20.direction, TRADE_OFF_DIRECTION.IMPROVES);
  const p19 = tradeOff.overall.find((row) => row.key === "p19");
  assert.equal(p19.before, "±0 dB · L4");
  assert.equal(p19.after, "±0 dB · L4");
  assert.equal(p19.direction, TRADE_OFF_DIRECTION.UNCHANGED);

  // Presented through the same authority the panel uses: Trade-off Found, with no
  // Apply on the card and the two designer controls.
  const state = resolveOptimiserPresentationState({
    planView: { status: "current", run: { runId: "optimiser-run-2026-10-15T19:46:28.706Z-1" } },
    runStatus: "idle",
    tradeOff,
  });
  assert.equal(state.state, OPTIMISER_PRESENTATION_STATE.TRADE_OFF);
  assert.equal(state.outcomeLabel, "Trade-off Found");
  assert.equal(state.showApply, false);
  assert.equal(state.action, null);
  assert.equal(state.canRun, false);
});

// ── 8. Partial seat evidence — the fallback for older saved runs ──
// The strongest evidence the run actually retained is stated. Where the seat and the
// amount it loses were recorded but that seat's own before/after values were not, the
// row states the seat and the amount alone: no absolute value is invented, an absent
// pair is never printed as placeholder dashes, and the trade-off stays valid.
const LIVE_WITH_PAIR = {
  ...LIVE_SAVED,
  regression: {
    seatId: "seat-r1-c2",
    parameter: "P20",
    rawDeltaDb: 1.2,
    currentLevel: 1,
    candidateLevel: 1,
  },
  before: {
    ...LIVE_SAVED.before,
    perSeatP20: [{ seatId: "seat-r1-c2", variationDbRaw: 8.6, level: 1, isPrimary: true }],
  },
  after: {
    ...LIVE_SAVED.after,
    perSeatP20: [{ seatId: "seat-r1-c2", variationDbRaw: 9.8, level: 1, isPrimary: true }],
  },
};

test("the affected seat is stated with the exact amount it loses, never a placeholder pair", () => {
  const tradeOff = resolveTradeOffState({ decision: LIVE_SAVED });
  const seatRow = tradeOff.rows.find((row) => row.key === "seat:seat-r1-c2");
  assert.ok(seatRow, "the affected primary seat is always stated, even with no pair retained");
  assert.equal(seatRow.pairKnown, false);
  assert.equal(seatRow.before, null);
  assert.equal(seatRow.after, null);
  assert.equal(seatRow.direction, TRADE_OFF_DIRECTION.WORSENS);
  // The run's own recorded amount, at the precision it recorded it.
  assert.equal(seatRow.delta, "1.2 dB");
  assert.match(tradeOff.impact, /^Primary seat Row 1 - Seat 2: P20 worsens by 1\.2 dB$/);
  const rendered = [tradeOff.impact, ...tradeOff.rows.flatMap((row) => [row.before, row.after, row.delta])];
  assert.ok(!rendered.some((value) => typeof value === "string" && value.includes("—")),
    "no dash ever stands in for a value this run never retained");
  // The review states exactly why the pair is absent.
  assert.equal(tradeOff.scopeNote,
    "This earlier optimiser run retained the affected seat and deterioration amount, but not the full per-seat before/after values.");
  // A partial record is still a trade-off the designer decides: never a re-test.
  assert.equal(resolveOptimiserPresentationState({
    planView: { status: "current", run: { runId: "run-live" } },
    runStatus: "idle",
    tradeOff,
  }).state, OPTIMISER_PRESENTATION_STATE.TRADE_OFF);
});

test("a run that retained the seat's own values keeps its current → proposed pair", () => {
  const tradeOff = resolveTradeOffState({ decision: LIVE_WITH_PAIR });
  const seatRow = tradeOff.rows.find((row) => row.key === "seat:seat-r1-c2");
  assert.notEqual(seatRow.pairKnown, false);
  assert.match(seatRow.before, /^±\d+ dB · L1$/);
  assert.match(seatRow.after, /^±\d+ dB · L1$/);
  assert.equal(seatRow.direction, TRADE_OFF_DIRECTION.WORSENS);
  assert.match(tradeOff.impact, /^Primary seat Row 1 - Seat 2: P20 ±\d+ dB · L1 → ±\d+ dB · L1 \(1 dB worse\)$/);
  assert.equal(tradeOff.scopeNote, "The run retained the affected seat's own result; the remaining seats' proposed values were not saved with it.");
});

test("the review draws a partial row with its amount alone", () => {
  const dialog = read(`${PLAN_DIR}/AdiTradeOffReviewDialog.jsx`);
  assert.match(dialog, /const pairKnown = row\.pairKnown !== false;/);
  assert.match(dialog, /\{pairKnown \? \(/);
});

// ── 9. THE DECISION, STATED PLAINLY ──
// The review states the trade-off itself — one sentence, what the change buys and
// what it costs — before any metric detail. The metric that is NOT the trade-off is
// stated separately and lightly, and P20 stays the seat-to-seat consistency measure.

test("the review states the whole decision in one sentence, naming the exact seat", () => {
  const live = resolveTradeOffState({ decision: LIVE_SAVED });
  assert.equal(
    live.decisionSentence,
    "Overall bass consistency improves, but Row 1 - Seat 2 gets worse.",
  );
  // The same sentence whichever form the seat id takes: the label is always the
  // canonical one the rest of the app prints.
  const real = resolveRealCase();
  assert.equal(
    real.decisionSentence,
    `Overall bass consistency improves, but ${real.seat.label} gets worse.`,
  );
  // A record that named no seat states the decision without naming one.
  const unnamed = resolveTradeOffState({
    decision: {
      ...LIVE_SAVED,
      statement: "The candidate worsens a protected measure. This is a trade-off, so it has not been applied.",
      regression: null,
    },
  });
  assert.equal(unnamed.decisionSentence, "Overall bass consistency improves, but one protected measure gets worse.");
});

test("what the change buys is stated as its own block, in whole dB", () => {
  const live = resolveTradeOffState({ decision: LIVE_SAVED });
  assert.equal(live.gain.title, "Overall bass consistency");
  assert.equal(live.gain.pair, "±15 dB → ±12 dB");
  // 2.3 dB recorded → floored, so the gain is never overstated.
  assert.equal(live.gain.delta, "Approximately 2 dB better");
  const real = resolveRealCase();
  assert.equal(real.gain.pair, "±15 dB → ±12 dB");
  assert.equal(real.gain.delta, "Approximately 3 dB better");
});

test("what the change costs is stated as its own block, with the exact amount", () => {
  const live = resolveTradeOffState({ decision: LIVE_SAVED });
  assert.equal(live.giveUp.label, "Row 1 - Seat 2");
  assert.equal(live.giveUp.amount, "Worsens by 1.2 dB");
  assert.equal(live.amountText, "1.2 dB");

  const real = resolveRealCase();
  assert.equal(real.giveUp.label, real.seat.label);
  assert.equal(real.giveUp.amount, "Worsens by 1.2 dB");
  assert.equal(real.amountText, "1.2 dB");

  // No amount is ever invented: a record without one states the seat and stops.
  const noAmount = resolveTradeOffState({
    decision: { ...LIVE_SAVED, statement: "The candidate regresses P20 at seat-r1-c2. This is a trade-off." },
  });
  assert.equal(noAmount.giveUp.label, "Row 1 - Seat 2");
  assert.equal(noAmount.giveUp.amount, "Worsens");
  assert.equal(noAmount.amountText, null);
});

test("P19 is stated separately as an unchanged protected metric, never a second benefit", () => {
  const live = resolveTradeOffState({ decision: LIVE_SAVED });
  assert.equal(live.protectedMetric.text, "P19 response quality — Unchanged · L4");
  assert.equal(live.protectedMetric.unchanged, true);
  assert.equal(live.protectedMetric.level, "L4");
  // It is not part of the cost: the protected metric is never the give-up block.
  assert.notEqual(live.protectedMetric.text, live.giveUp.amount);
});

test("P20 is the seat-to-seat consistency metric and P19 is never mislabelled as it", () => {
  const tradeOff = resolveRealCase();
  const p20 = tradeOff.overall.find((row) => row.key === "p20");
  const p19 = tradeOff.overall.find((row) => row.key === "p19");
  assert.equal(p20.label, "Seat-to-seat level consistency (P20)");
  assert.equal(p19.label, "Response quality (P19)");
  assert.ok(!/seat-to-seat/i.test(p19.label), "P19 is never labelled seat-to-seat consistency");
  const source = read(`${PLAN_DIR}/optimiserTradeOffState.js`);
  assert.ok(!/Seat-to-seat level consistency \(P19\)/.test(source),
    "the mislabelled P19 row is gone from the authority itself");
  assert.match(source, /TRADE_OFF_METRIC\.P20_LABEL/);
  // The decision's own blocks are stated on P20, the consistency measure.
  assert.equal(tradeOff.gain.metric, "Seat-to-seat level consistency (P20)");
  assert.equal(tradeOff.giveUp.metric, "Seat-to-seat level consistency (P20)");
});

test("the review draws the decision first and the supporting detail below it", () => {
  const dialog = read(`${PLAN_DIR}/AdiTradeOffReviewDialog.jsx`);
  assert.match(dialog, /data-adi-trade-off-title="true"/);
  assert.match(dialog, /AdiTradeOffDecisionSummary/);
  assert.match(dialog, /sentence=\{tradeOff\.decisionSentence\}/);
  assert.match(dialog, /gain=\{tradeOff\.gain\}/);
  assert.match(dialog, /giveUp=\{tradeOff\.giveUp\}/);
  assert.match(dialog, /protectedMetric=\{tradeOff\.protectedMetric\}/);

  // The plain-language decision is stated ABOVE the engineering detail.
  const decisionAt = dialog.indexOf("sentence={tradeOff.decisionSentence}");
  const detailAt = dialog.indexOf("Engineering detail");
  assert.ok(decisionAt > -1 && detailAt > -1 && decisionAt < detailAt,
    "the decision is stated before the supporting detail");

  // Both actions are named, and the designer's own no is available in the review.
  assert.match(dialog, /\{TRADE_OFF_ACTIONS\.APPLY\}/);
  assert.match(dialog, /\{TRADE_OFF_ACTIONS\.KEEP\}/);
  assert.match(dialog, /data-adi-trade-off-dialog-keep="true"/);

  const summary = read(`${PLAN_DIR}/AdiTradeOffDecisionSummary.jsx`);
  assert.match(summary, /You gain/);
  assert.match(summary, /You give up/);
  assert.match(summary, /data-adi-trade-off-gain-pair="true"/);
  assert.match(summary, /data-adi-trade-off-give-up-seat="true"/);
  assert.match(summary, /data-adi-trade-off-give-up-amount="true"/);
  assert.match(summary, /data-adi-trade-off-protected-metric="true"/);
  // The blocks print resolved values only: the summary computes no figure itself.
  assert.ok(!/Math\.|parseFloat|parseInt/.test(summary), "the decision summary computes no figure itself");
});