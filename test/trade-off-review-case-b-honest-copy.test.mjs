// trade-off-review-case-b-honest-copy.test.mjs
// ---------------------------------------------------------------------------
// CASE B — the calibration trade-off with NO seat-specific evidence.
//
// The saved decision carries:
//   seat = null
//   regression = null
//   P20 improves (overall)
//   P19 slightly worse (raw, but displayed rounded level may be unchanged)
//
// The Review Trade-off copy may only claim evidence that is actually present.
// It must NOT claim:
//   - an affected seat was retained
//   - a Primary seat worsened
//   - a deterioration amount was retained for a seat
// It MUST describe the actual P19/P20 metric-level trade-off accurately.
// ---------------------------------------------------------------------------

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  resolveTradeOffState,
  TRADE_OFF_HEADLINE,
  TRADE_OFF_METRIC_NOTE,
  TRADE_OFF_AFFECTED_VALUES_NOTE,
} = await import("../src/components/room/bass/optimiserPlan/optimiserTradeOffState.js");

const {
  CALIBRATION_APPLY_DECISION,
  CALIBRATION_APPLY_REASON,
} = await import("../src/components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js");

// ── Case B: no seat-specific evidence, P20 improves, P19 slightly worse ──
// The displayed (floored) P19 deviation is the same before/after, but the raw
// evidence records a small P19 worsening.
const caseBDecision = {
  decision: CALIBRATION_APPLY_DECISION.HOLD,
  reason: CALIBRATION_APPLY_REASON.TRADEOFF_REVIEW_REQUIRED,
  candidateId: "calib-001",
  // No structured regression — no seat evidence retained.
  regression: null,
  statement: null,
  offsetStatement: "Delay 0.2 ms applied to rear-left subwoofer",
  before: {
    p20: { deviationDb: 15.4, level: 1 },
    p19: { deviationDb: 9.2, level: 2 },
  },
  after: {
    p20: { deviationDb: 12.1, level: 2 },
    p19: { deviationDb: 9.8, level: 2 }, // raw worsens (9.2→9.8), floored both ±9 dB, level same L2
  },
  improvement: {
    p20DeltaDb: 3.3,  // before - after = 15.4 - 12.1 = 3.3 (positive = improvement)
    p19DeltaDb: -0.6, // before - after = 9.2 - 9.8 = -0.6 (negative = worsening)
    p20Improved: true,
    p19Improved: false,
  },
  damage: {
    p19WorseDb: 0.6,  // after - before = 9.8 - 9.2 = 0.6 (positive = worse)
    p20WorseDb: -3.3,
    p19Damaged: false, // below material damage threshold
    p20Damaged: false,
  },
};

// ── Case A: no useful improvement — not a trade-off at all ──
const caseADecision = {
  decision: CALIBRATION_APPLY_DECISION.HOLD,
  reason: CALIBRATION_APPLY_REASON.P20_DAMAGED,
  regression: null,
  before: { p20: { deviationDb: 12.0, level: 2 }, p19: { deviationDb: 9.0, level: 2 } },
  after: { p20: { deviationDb: 12.0, level: 2 }, p19: { deviationDb: 9.0, level: 2 } },
  improvement: { p20DeltaDb: 0, p19DeltaDb: 0, p20Improved: false, p19Improved: false },
  damage: { p19WorseDb: 0, p20WorseDb: 0, p19Damaged: false, p20Damaged: false },
};

// ── Case C: held trade-off WITH a real seat regression (full evidence) ──
const caseCDecision = {
  decision: CALIBRATION_APPLY_DECISION.HOLD,
  reason: CALIBRATION_APPLY_REASON.PRIMARY_SEAT_REGRESSION,
  candidateId: "place-002",
  regression: {
    seatId: "row1-seat2",
    parameter: "P20",
    rawDeltaDb: 1.2,
    currentLevel: 2,
    candidateLevel: 1,
  },
  statement: "Candidate regresses P20 at row1-seat2 by 1.2 dB",
  before: {
    p20: { deviationDb: 15.0, level: 1 },
    p19: { deviationDb: 9.0, level: 2 },
    perSeatP20: [
      { seatId: "row1-seat2", variationDbRaw: 12.0, level: 2, isPrimary: true },
    ],
  },
  after: {
    p20: { deviationDb: 12.0, level: 2 },
    p19: { deviationDb: 9.0, level: 2 },
    perSeatP20: [
      { seatId: "row1-seat2", variationDbRaw: 13.2, level: 1, isPrimary: true },
    ],
  },
  improvement: { p20DeltaDb: 3.0, p19DeltaDb: 0, p20Improved: true, p19Improved: false },
  damage: { p19WorseDb: 0, p20WorseDb: 0, p19Damaged: false, p20Damaged: false },
};

// ── Case B': seat present but no before/after values (retained seat + amount) ──
const caseBPrimeDecision = {
  decision: CALIBRATION_APPLY_DECISION.HOLD,
  reason: CALIBRATION_APPLY_REASON.PRIMARY_SEAT_REGRESSION,
  candidateId: "place-003",
  regression: {
    seatId: "row1-seat1",
    parameter: "P20",
    rawDeltaDb: 1.5,
    currentLevel: null,  // No levels retained — seat has no before/after values
    candidateLevel: null,
  },
  statement: "Candidate regresses P20 at row1-seat1 by 1.5 dB",
  before: {
    p20: { deviationDb: 15.0, level: 1 },
    p19: { deviationDb: 9.0, level: 2 },
    // No perSeatP20 — the seat's own values were not retained.
  },
  after: {
    p20: { deviationDb: 12.0, level: 2 },
    p19: { deviationDb: 9.0, level: 2 },
  },
  improvement: { p20DeltaDb: 3.0, p19DeltaDb: 0, p20Improved: true, p19Improved: false },
  damage: { p19WorseDb: 0, p20WorseDb: 0, p19Damaged: false, p20Damaged: false },
};

describe("Case B — honest trade-off review copy", () => {
  const state = resolveTradeOffState({ decision: caseBDecision });

  it("resolves as a trade-off", () => {
    assert.ok(state?.isTradeOff, "should be a trade-off");
  });

  // 1. seat=null + regression=null → no affected-seat sentence
  it("has no seat object (no affected-seat evidence)", () => {
    assert.equal(state.seat, null);
  });

  it("has no affected-seat claim in any copy", () => {
    const allCopy = JSON.stringify(state);
    assert.ok(!/affected seat/i.test(allCopy), "must not mention 'affected seat'");
    assert.ok(!/retained the affected seat/i.test(allCopy), "must not claim retained affected seat");
  });

  // 2. seat=null + regression=null → no deterioration-amount sentence
  it("has no deterioration-amount claim", () => {
    assert.equal(state.scopeNote, null, "scopeNote must be null — no false retained-evidence claim");
    assert.ok(!/deterioration amount/i.test(JSON.stringify(state)), "must not mention deterioration amount");
  });

  // 3. P20 improves + P19 worsens → metric-level trade-off described accurately
  it("describes the P19/P20 metric trade-off", () => {
    assert.ok(state.decisionSentence, "must have a decision sentence");
    assert.ok(/consistency improves/i.test(state.decisionSentence), "must state P20 improves");
    assert.ok(/protected measure gets worse/i.test(state.decisionSentence), "must state a protected measure worsens");
  });

  it("uses the metric-note headline (no false primary-seat claim)", () => {
    assert.equal(state.headline, TRADE_OFF_METRIC_NOTE);
    assert.notEqual(state.headline, TRADE_OFF_HEADLINE);
  });

  // 4. same displayed rounded level but raw metric worsens → "slightly worse", not unchanged
  it("detects the small raw P19 regression despite equal floored displayed values", () => {
    const p19Row = state.overall.find((r) => r.key === "p19");
    assert.ok(p19Row, "p19 row must exist");
    assert.notEqual(p19Row.direction, "unchanged", "P19 must not be 'unchanged' when raw evidence proves regression");
    assert.equal(p19Row.direction, "worsens", "P19 direction must be 'worsens' from raw evidence");
    assert.equal(p19Row.slight, true, "P19 must be marked slight");
    assert.ok(/slightly worse/i.test(p19Row.delta), "P19 delta must say 'slightly worse'");
  });

  it("P20 is shown as improving", () => {
    const p20Row = state.overall.find((r) => r.key === "p20");
    assert.ok(p20Row, "p20 row must exist");
    assert.equal(p20Row.direction, "improves", "P20 direction must be 'improves'");
  });

  it("protectedMetric text says 'Slightly worsens' for P19", () => {
    assert.ok(state.protectedMetric, "must have protectedMetric");
    assert.ok(/slightly worsens/i.test(state.protectedMetric.text), "must say 'Slightly worsens'");
    assert.ok(!/unchanged/i.test(state.protectedMetric.text), "must not say 'Unchanged'");
  });

  // 5. no Primary-seat claim
  it("has no Primary-seat regression claim", () => {
    const allCopy = JSON.stringify(state);
    assert.ok(!/primary seat/i.test(allCopy), "must not claim a primary seat worsened");
    assert.ok(!/primary.*worsen/i.test(allCopy), "must not claim a primary regression");
  });

  // 9. NON_ACTIONABLE_WINNER headline unchanged — this is a trade-off state, not
  //    the run-level headline; the trade-off remains supporting evidence.
  it("remains supporting evidence (trade-off state, not the run headline)", () => {
    assert.ok(state.isTradeOff);
    assert.equal(state.kept, false);
  });
});

describe("Case A — no useful improvement (not a trade-off)", () => {
  it("does not resolve as a trade-off when nothing improved", () => {
    const state = resolveTradeOffState({ decision: caseADecision });
    assert.equal(state, null, "a change that improves nothing is not a trade-off");
  });
});

describe("Case C — held trade-off WITH full seat evidence (unchanged)", () => {
  const state = resolveTradeOffState({ decision: caseCDecision });

  it("resolves as a trade-off with a real primary seat", () => {
    assert.ok(state?.isTradeOff);
    assert.ok(state.seat, "must have a seat");
    assert.equal(state.seat.scope, "primary", "must be a verified primary regression");
  });

  it("uses the primary-seat headline", () => {
    assert.equal(state.headline, TRADE_OFF_HEADLINE);
  });

  it("states the primary seat in the decision sentence", () => {
    assert.ok(/primary seat/i.test(state.decisionSentence) || /gets worse/i.test(state.decisionSentence));
  });

  it("has a giveUp block naming the seat", () => {
    assert.ok(state.giveUp, "must have a giveUp block");
    assert.ok(state.giveUp.label);
  });
});

describe("Case B' — seat + regression present, full values absent (unchanged)", () => {
  const state = resolveTradeOffState({ decision: caseBPrimeDecision });

  it("resolves as a trade-off", () => {
    assert.ok(state?.isTradeOff);
  });

  it("has a seat object (seat evidence was retained)", () => {
    assert.ok(state.seat);
  });

  it("uses the AFFECTED_VALUES scope note (seat + amount retained, full values absent)", () => {
    assert.equal(state.scopeNote, TRADE_OFF_AFFECTED_VALUES_NOTE);
  });
});

describe("Honest evidence hierarchy", () => {
  it("full seat evidence → SCOPE note", () => {
    // Case C has per-seat values, so the seat has before/after → SCOPE note
    const state = resolveTradeOffState({ decision: caseCDecision });
    // Case C has >1 seat row? No — only 1 seat. And seat has before/after.
    // So scopeNote = TRADE_OFF_SCOPE_NOTE
    assert.ok(state.scopeNote);
  });

  it("seat + regression, no values → AFFECTED_VALUES note", () => {
    const state = resolveTradeOffState({ decision: caseBPrimeDecision });
    assert.equal(state.scopeNote, TRADE_OFF_AFFECTED_VALUES_NOTE);
  });

  it("no seat at all → null scopeNote (no false claim)", () => {
    const state = resolveTradeOffState({ decision: caseBDecision });
    assert.equal(state.scopeNote, null);
  });
});