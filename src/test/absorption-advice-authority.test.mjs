// absorption-advice-authority.test.mjs
// ---------------------------------------------------------------------------
// Low-frequency absorption advice — the ninth step of the fixed ADI order.
//
// What is verified here:
//   • it is ADVICE: it never becomes an applyable lever
//   • it appears only when P20 remains poor after practical options
//   • it references the limiting frequency when one is evidenced
//   • it does not over-claim (no "required", no "will fix", no "apply")
//   • it is the ninth row, always after seating and always after placement
//   • no decimal dB reaches the card
// ---------------------------------------------------------------------------

import { it } from "vitest";
import assert from "node:assert/strict";

import {
  ABSORPTION_ACTION_TEXT,
  ABSORPTION_LABEL,
  ABSORPTION_ROW_KEY,
  ABSORPTION_STATUS,
  resolveAbsorptionAdvice,
} from "../components/room/bass/optimiserPlan/absorptionAdviceAuthority.js";
import { buildAdiDesignerSummary } from "../components/room/bass/optimiserPlan/adiDesignerSummary.js";

const seatsSharing43Hz = [
  { seatId: "s1", p20WorstFrequencyHz: 43, p20Level: 1 },
  { seatId: "s2", p20WorstFrequencyHz: 44, p20Level: 1 },
  { seatId: "s3", p20WorstFrequencyHz: 81, p20Level: 2 },
];

const placementEvaluated = (effect = { p20VariationDb: -12, p20Level: 1 }) => ([
  { lever: "delay", evaluated: true, changes: [], effect: { p20VariationDb: -12, p20Level: 1 } },
  { lever: "placement", evaluated: true, changes: [], effect, notEvaluatedReason: null },
]);

const basePlanView = (overrides = {}) => ({
  status: "current",
  individualEffectsEvaluated: true,
  appliedCount: 0,
  baseline: { p20Level: 1, p20VariationDb: -12, seats: seatsSharing43Hz },
  levers: placementEvaluated(),
  ...overrides,
});

const staleSummaryPlan = () => basePlanView({ levers: placementEvaluated() });

// ── When advice appears ───────────────────────────────────────────────────────

it("advice is given when P20 remains L1 after the practical options", () => {
  const advice = resolveAbsorptionAdvice({
    p20Level: 1,
    p20DeviationDb: -12,
    seats: seatsSharing43Hz,
    leverRows: placementEvaluated(),
    limitingFrequencyHz: 43,
  });
  assert.ok(advice, "absorption advice should be given at P20 L1");
  assert.equal(advice.key, ABSORPTION_ROW_KEY);
  assert.equal(advice.label, ABSORPTION_LABEL);
});

it("no advice when P20 already reaches L2 or better", () => {
  const advice = resolveAbsorptionAdvice({
    p20Level: 2,
    p20DeviationDb: -9,
    seats: seatsSharing43Hz,
    leverRows: placementEvaluated(),
    limitingFrequencyHz: 43,
  });
  assert.equal(advice, null);
});

// ── The frequency it references ───────────────────────────────────────────────

it("the limiting frequency is referenced when several seats share it", () => {
  const advice = resolveAbsorptionAdvice({
    p20Level: 1,
    seats: seatsSharing43Hz,
    leverRows: placementEvaluated(),
    limitingFrequencyHz: 81,
  });
  assert.equal(advice.frequencyHz, 43, "the shared frequency outranks the published headline");
  assert.match(advice.reason, /43/);
  assert.match(advice.headline, /43/);
  assert.equal(advice.affectedSeatCount, 2);
  assert.equal(advice.status, ABSORPTION_STATUS.RECOMMENDED);
});

it("a single seat with a bad frequency is not treated as persistent", () => {
  const advice = resolveAbsorptionAdvice({
    p20Level: 1,
    seats: [{ seatId: "s1", p20WorstFrequencyHz: 43 }],
    leverRows: placementEvaluated(),
    limitingFrequencyHz: 43,
  });
  assert.equal(advice.status, ABSORPTION_STATUS.CONSIDER);
  assert.equal(advice.affectedSeatCount, 0);
});

// ── Location advice ───────────────────────────────────────────────────────────

it("front wall / corners are named only when placement was evaluated", () => {
  const withPlacement = resolveAbsorptionAdvice({
    p20Level: 1,
    seats: seatsSharing43Hz,
    leverRows: placementEvaluated(),
    limitingFrequencyHz: 43,
  });
  assert.equal(withPlacement.locationKnown, true);
  assert.match(withPlacement.location, /Front wall \/ front corners/);

  const withoutPlacement = resolveAbsorptionAdvice({
    p20Level: 1,
    seats: seatsSharing43Hz,
    leverRows: [{ lever: "delay", evaluated: true }],
    limitingFrequencyHz: 43,
  });
  assert.equal(withoutPlacement.locationKnown, false);
  assert.match(withoutPlacement.location, /confirmed during calibration/);
  assert.doesNotMatch(withoutPlacement.location, /Front wall \/ front corners are the first/);
});

// ── No over-claiming, no apply ────────────────────────────────────────────────

it("the advice never over-claims and never offers an applyable lever", () => {
  const advice = resolveAbsorptionAdvice({
    p20Level: 1,
    seats: seatsSharing43Hz,
    leverRows: placementEvaluated(),
    limitingFrequencyHz: 43,
  });
  const text = `${advice.headline} ${advice.reason} ${advice.location}`.toLowerCase();
  ["required", "will fix", "apply", "calculated", "guarantee"].forEach((word) => {
    assert.ok(!text.includes(word), `advice must not say "${word}"`);
  });
  assert.equal(advice.action, undefined, "absorption is advice — it carries no action");
  assert.equal(advice.actionText, ABSORPTION_ACTION_TEXT);
});

// ── The ninth row in the card ─────────────────────────────────────────────────

it("the card lists absorption ninth, after seating, and never as an Apply", () => {
  const summary = buildAdiDesignerSummary({
    planView: staleSummaryPlan(),
    presentation: { state: "stale", statusLabel: "Re-evaluation required", showApply: false },
    instances: [],
    seatCount: 8,
    currentP20Level: 1,
    currentP20Deviation: -12,
    limitingFrequencyHz: 43,
  });

  assert.equal(summary.rows.length, 9, "all nine steps are always listed");
  assert.deepEqual(
    summary.rows.map((row) => row.label),
    ["Delay", "Gain", "Phase", "Polarity", "Placement", "Layout", "Sub option", "Seating", ABSORPTION_LABEL],
    "the fixed order is stated exactly",
  );
  assert.equal(summary.rows[8].key, ABSORPTION_ROW_KEY, "absorption is the ninth row");
  assert.match(summary.rows[4].label, /placement/i, "placement is fifth");
  assert.match(summary.rows[7].label, /seating/i, "seating is eighth, before absorption");
  assert.equal(summary.rows[8].action, null, "no Apply action for absorption");
  assert.equal(summary.rows.filter((row) => row.action === "apply").length, 0, "nothing is applyable from stale evidence");
  assert.equal(summary.actions.canApply, false, "stale evidence offers no Apply");
  assert.ok(summary.absorption, "the advice is exposed to the card");
});

it("no decimal dB reaches the card, and the level is stated", () => {
  const summary = buildAdiDesignerSummary({
    planView: staleSummaryPlan(),
    presentation: { state: "stale", statusLabel: "Re-evaluation required", showApply: false },
    instances: [],
    seatCount: 8,
    currentP20Level: 1,
    currentP20Deviation: -12,
    limitingFrequencyHz: 43,
  });
  assert.doesNotMatch(String(summary.currentP20), /\d\.\d/, "no decimal dB");
  assert.match(String(summary.currentP20), /L1/, "the published level is stated");
});

it("no absorption advice when the recommended practical change already reaches L2", () => {
  const summary = buildAdiDesignerSummary({
    planView: basePlanView({
      baseline: { p20Level: 1, p20VariationDb: -12, seats: seatsSharing43Hz },
      levers: [{
        lever: "placement",
        evaluated: true,
        changes: [{ id: "c1" }],
        effect: { p20VariationDb: -9, p20Level: 2, p20DeltaDb: -3 },
        reason: "Move the front subs wider along the front wall.",
      }],
    }),
    presentation: { state: "plan_available", statusLabel: "Recommendation available", showApply: true },
    instances: [],
    seatCount: 8,
    currentP20Level: 1,
    currentP20Deviation: -12,
    limitingFrequencyHz: 43,
  });
  assert.equal(summary.absorption, null, "the practical change solves it — no absorption advice");
  assert.equal(summary.rows.length, 8, "only the eight practical levers are listed");
  assert.match(summary.rows[4].status, /Recommended/);
});