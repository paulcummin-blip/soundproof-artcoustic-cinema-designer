// adi-tested-status-after-run.test.mjs
// ---------------------------------------------------------------------------
// The "What ADI tested" table AFTER an optimiser pass has completed.
//
// Product rule verified here: once ADI has completed a pass, every supported
// lever states a resolved outcome. No row reads "Not yet run", and the result
// panel and the table agree about what was evaluated:
//
//   A completed pass, no calibration improvement
//     → delay · gain · polarity are Tested / No useful improvement found
//   A completed pass with seating recommended
//     → Seating is Recommended, and it is the only row carrying an Apply
//   A placement the plausibility gate refuses
//     → Placement is Tested, stated as a theoretical option, with no Apply
//   Phase
//     → not a row of this table at all
//   While the pass is running
//     → Waiting may appear; once it completes, no Waiting / Not yet run remains
//
// Presentation only: no optimiser maths, scoring, grading or apply logic.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import {
  ADI_LIVE_STATUS,
  buildLiveFamilyRows,
} from "@/components/room/bass/optimiserPlan/optimiserLiveProgress.js";
import {
  ADI_ROW_OUTCOME,
  ADI_ROW_STATUS,
  buildFamilyLedgerRows,
} from "@/components/room/bass/optimiserPlan/optimiserFamilyLedgerRows.js";
import {
  buildAdiDesignerSummary,
  buildTestedOptionRows,
} from "@/components/room/bass/optimiserPlan/adiDesignerSummary.js";
import { OPTIMISER_PRESENTATION_STATE } from "@/components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import { ADI_OPTIMISER_COPY } from "@/components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js";
import { PLACEMENT_THEORETICAL_NOTE } from "@/components/room/bass/optimiserPlan/placementMoveAuthority.js";
import { BASELINE_PARITY_STATUS } from "@/components/room/bass/optimiserPlan/optimiserBaselineAuthority.js";

const COMPLETED_AT = "2026-01-01T00:00:00.000Z";
const CALIBRATION_KEYS = ["delay", "gain", "polarity"];

/** Placement was evaluated, and its best attempt stayed inside the 1 dB gate. */
const BELOW_THRESHOLD_PLACEMENT = {
  key: "placement",
  lever: "placement",
  evaluated: true,
  canApply: false,
  changes: [{ subId: "sub-1", position: { x: 0.7, y: 0.9 } }],
  effect: { p20DeltaDb: -0.4, p20VariationDb: 13, p20Level: 1 },
};

/**
 * A completed pass in the shape that used to leave the calibration levers
 * unresolved: placement was evaluated, the saved record kept no per-family
 * ledger, and delay / gain / polarity have no lever rows of their own.
 */
const COMPLETED_PLAN = {
  status: "current",
  baseline: { p20Level: 1, p20VariationDb: 13, p19Level: 1, p19VariationDb: -3 },
  run: { completedAt: COMPLETED_AT, outcome: "actionable_plan_produced", families: [] },
  levers: [BELOW_THRESHOLD_PLACEMENT],
};

/** A completed pass whose one offerable change is the seating move. */
const SEATING_PLAN = {
  status: "current",
  baseline: null,
  individualEffectsEvaluated: true,
  // The published bass result is this run's baseline, so its one change is
  // applyable — the same record a saved winning run carries.
  baselineParity: { status: BASELINE_PARITY_STATUS.MATCH },
  run: { completedAt: COMPLETED_AT, outcome: "actionable_plan_produced", families: [] },
  levers: [{
    key: "seating",
    lever: "seating",
    evaluated: true,
    canApply: true,
    changes: [{ seatId: "seat-1", fromY: 4.2, toY: 3.7 }],
    effect: { p20DeltaDb: -3, p20VariationDb: 10, p20Level: 2, p19DeltaDb: -1 },
    seating: { movementLabel: "Move the seating 500 mm toward the screen" },
    validation: { destinationsValid: true },
  }],
};

/** A completed pass whose only placement change is outside the practical envelope. */
const THEORETICAL_PLACEMENT_PLAN = {
  status: "current",
  baseline: null,
  run: { completedAt: COMPLETED_AT, outcome: "actionable_plan_produced", families: [] },
  levers: [{
    ...BELOW_THRESHOLD_PLACEMENT,
    practical: false,
    theoreticalReason: "It breaks the symmetry of the front-wall layout.",
    effect: { p20DeltaDb: -4, p20VariationDb: 12, p20Level: 1 },
  }],
};

const summaryFor = (planView, state = OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE) => (
  buildAdiDesignerSummary({
    planView,
    presentation: {
      state,
      statusLabel: "status",
      showApply: state === OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE,
    },
    instances: [],
  })
);

const rowFor = (rows, key) => rows.find((row) => row.key === key) || null;
const rowText = (row) => `${row.label} ${row.status} ${row.outcome || ""} ${row.actionText || ""}`;

describe("a completed pass leaves no lever unresolved", () => {
  it("states the calibration levers as Tested with no useful improvement", () => {
    const rows = buildTestedOptionRows(COMPLETED_PLAN, { runComplete: true });
    CALIBRATION_KEYS.forEach((key) => {
      const row = rowFor(rows, key);
      expect(row.status).toBe(ADI_ROW_STATUS.TESTED);
      expect(row.outcome).toBe(ADI_ROW_OUTCOME.NO_USEFUL);
    });
  });

  it("never says 'Not yet run' on any row", () => {
    const rows = buildTestedOptionRows(COMPLETED_PLAN, { runComplete: true });
    rows.forEach((row) => expect(rowText(row)).not.toMatch(/not yet run/i));
  });

  it("reads the completed pass from the plan itself, through the card summary", () => {
    const summary = summaryFor(COMPLETED_PLAN);
    summary.rows.forEach((row) => expect(rowText(row)).not.toMatch(/not yet run|waiting/i));
    CALIBRATION_KEYS.forEach((key) => {
      expect(rowFor(summary.rows, key).status).toBe(ADI_ROW_STATUS.TESTED);
      expect(rowFor(summary.rows, key).outcome).toBe(ADI_ROW_OUTCOME.NO_USEFUL);
    });
  });

  it("applies the same rule to the saved run ledger", () => {
    const families = [
      { family: "placement", status: "rejected", tested: true, candidatesEvaluated: 4, bestAttempt: null },
      { family: "delay", status: "not_tested", tested: false, candidatesEvaluated: null, bestAttempt: null },
      { family: "gain", status: "not_tested", tested: false, candidatesEvaluated: null, bestAttempt: null },
      { family: "polarity", status: "not_tested_separately", tested: false, candidatesEvaluated: null, bestAttempt: null },
    ];
    const rows = buildFamilyLedgerRows({ families, baseline: null, runComplete: true });
    expect(rows.delay).toEqual({ status: ADI_ROW_STATUS.TESTED, outcome: ADI_ROW_OUTCOME.NO_USEFUL });
    expect(rows.gain).toEqual({ status: ADI_ROW_STATUS.TESTED, outcome: ADI_ROW_OUTCOME.NO_USEFUL });
    expect(rows.polarity.status).toBe(ADI_ROW_STATUS.TESTED);
    // With no completed pass the same evidence states the run-scope fact instead.
    const preRun = buildFamilyLedgerRows({ families, baseline: null });
    expect(preRun.delay.status).toBe(ADI_ROW_STATUS.NOT_RUN);
  });
});

describe("a completed pass with seating recommended", () => {
  const summary = summaryFor(SEATING_PLAN);

  it("states the result in the seating row and the move in the recommendation", () => {
    const seating = rowFor(summary.rows, "seating");
    expect(seating.status).toBe(ADI_ROW_STATUS.RECOMMENDED);
    // The row states the performance the evaluated move produced — the final
    // P20 first, with the improvement beside it — not the movement on its own.
    expect(seating.outcome).toMatch(/^P20: ±10 dB/);
    expect(seating.outcome).not.toMatch(/move the seating/i);
    // The movement itself is the card's recommendation headline.
    expect(summary.recommendation).toMatch(/move the seating/i);
  });

  it("carries exactly one Apply, on the recommended row", () => {
    const applying = summary.rows.filter((row) => row.action === "apply");
    expect(applying).toHaveLength(1);
    expect(applying[0].key).toBe("seating");
    // The card's own Apply control exists for that same one recommendation.
    expect(summary.recommendedLever).toBe("seating");
    expect(summary.actions.canApply).toBe(true);
  });

  it("shows no Apply beside a tested, not-applicable or advice row", () => {
    summary.rows
      .filter((row) => row.status !== ADI_ROW_STATUS.RECOMMENDED)
      .forEach((row) => {
        expect(row.action).not.toBe("apply");
        expect(String(row.actionText || "")).not.toMatch(/^apply/i);
      });
  });

  it("still resolves its calibration levers from the completed pass", () => {
    CALIBRATION_KEYS.forEach((key) => {
      expect(rowFor(summary.rows, key).status).toBe(ADI_ROW_STATUS.TESTED);
    });
  });
});

describe("a placement the plausibility gate refuses", () => {
  it("is Tested, stated as a theoretical option, and carries no Apply", () => {
    const rows = buildTestedOptionRows(THEORETICAL_PLACEMENT_PLAN, { runComplete: true });
    const placement = rowFor(rows, "placement");
    expect(placement.status).toBe(ADI_ROW_STATUS.TESTED);
    expect(placement.outcome).toContain(PLACEMENT_THEORETICAL_NOTE);
    expect(placement.outcome).toMatch(/not offered as default placement/i);
    expect(placement.outcome).toMatch(/symmetry/i);
    expect(placement.action).toBeNull();
    expect(rows.filter((row) => row.action === "apply")).toEqual([]);
  });

  it("offers no recommendation for it through the card summary", () => {
    const summary = summaryFor(THEORETICAL_PLACEMENT_PLAN);
    expect(summary.recommendedLever).toBeNull();
    expect(summary.actions.canApply).toBe(false);
    expect(summary.rows.filter((row) => row.action === "apply")).toEqual([]);
  });
});

describe("phase is not a row of the tested table", () => {
  it("never appears in the keys, labels or outcomes", () => {
    const rows = buildTestedOptionRows(COMPLETED_PLAN, { runComplete: true });
    expect(rows.map((row) => row.key)).not.toContain("phase");
    rows.forEach((row) => expect(rowText(row)).not.toMatch(/phase/i));
  });

  it("is not named in the sentence under the table", () => {
    expect(ADI_OPTIMISER_COPY.PRE_RUN_SUMMARY).toBe(
      "ADI checks calibration and design options first, then suggests physical changes only when they produce a meaningful and credible improvement.",
    );
    expect(ADI_OPTIMISER_COPY.PRE_RUN_SUMMARY).not.toMatch(/phase/i);
  });
});

describe("Waiting belongs to a pass in progress only", () => {
  it("states Waiting while the engine is working", () => {
    const live = buildLiveFamilyRows({ status: "running", phase: "reviewing" });
    expect(live.some((row) => row.status === ADI_LIVE_STATUS.WAITING)).toBe(true);
  });

  it("states no Waiting or Not yet run once the pass has completed", () => {
    const rows = buildTestedOptionRows(COMPLETED_PLAN, { runComplete: true });
    rows.forEach((row) => {
      expect(rowText(row)).not.toMatch(/waiting/i);
      expect(rowText(row)).not.toMatch(/not yet run/i);
    });
  });

  it("never states a completed outcome while the run is still active", () => {
    const summary = summaryFor(COMPLETED_PLAN, OPTIMISER_PRESENTATION_STATE.RUNNING);
    CALIBRATION_KEYS.forEach((key) => {
      expect(rowFor(summary.rows, key).outcome).not.toBe(ADI_ROW_OUTCOME.NO_USEFUL);
    });
  });
});