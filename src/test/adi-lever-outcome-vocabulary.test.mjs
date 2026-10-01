// adi-lever-outcome-vocabulary.test.mjs
// ---------------------------------------------------------------------------
// The Bass Optimisation card states one of six fixed outcomes for every lever:
//
//   Recommended · Trade-off · Tested — no useful improvement ·
//   Rejected — worsens the result · Not yet supported · Compare separately
//
// What is verified here, against the REAL saved Marquee Home placement attempt:
//   • a measured improvement is never withheld without a reason
//   • a small improvement is marked "no useful improvement" with its threshold
//   • a trade-off is labelled a trade-off and carries no Apply
//   • a worsening lever is labelled Rejected, in whole numbers
//   • no row, vocabulary word or action word carries banned copy
//   • a plan lever's own verdict word is used, not an anonymous "Tested"
//   • the run's terminal reason never claims a threshold that the evidence
//     contradicts
//
// Presentation and copy only: no bass maths, no optimiser scoring, no RP22
// definition is exercised or changed here.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";

import {
  ADI_ROW_ACTION,
  ADI_ROW_OUTCOME,
  ADI_ROW_STATUS,
  buildFamilyLedgerRows,
} from "../components/room/bass/optimiserPlan/optimiserFamilyLedgerRows.js";
import {
  buildTestedOptionRows,
  resolveApplyPermission,
} from "../components/room/bass/optimiserPlan/adiDesignerSummary.js";
import {
  NO_MATERIAL_CHANGE_REASON,
  NO_RETAINED_CHANGE_REASON,
  resolvePlanActionability,
} from "../components/room/bass/optimiserPlan/optimiserPlanSave.js";

/** Copy the card must never carry. */
const BANNED_COPY =
  /not offered|improvement found|retained no attempt|no attempt value|not available|not evaluated|not tested/i;

const textOf = (row) => `${row.status} ${row.outcome || ""} ${row.actionText || ""}`;

/** One placement family row, from evidence shaped like a saved run's. */
const placementRow = (bestAttempt) => buildFamilyLedgerRows({
  families: [{
    family: "placement",
    status: "rejected",
    tested: true,
    candidatesEvaluated: 4,
    bestAttempt,
    reason: "Evaluated, but no candidate from this family was confirmed as a winner.",
  }],
  baseline: null,
})?.placement || null;

/** The saved Marquee Home placement attempt, exactly as the run recorded it. */
const MARQUEE_PLACEMENT_ATTEMPT = {
  candidateId: "practical-wall-front-single-33%",
  p20VariationDb: 14.521646809802334,
  p20Level: 1,
  p19VariationDb: 0.38570478768849625,
  p19Level: 4,
  p14Db: 125.11946050257433,
  p20DeltaDb: -3.91,
  p19DeltaDb: -0.62,
  p14DeltaDb: null,
};

describe("the fixed lever outcome vocabulary", () => {
  it("carries none of the banned copy", () => {
    const copy = [
      ...Object.values(ADI_ROW_STATUS),
      ...Object.values(ADI_ROW_OUTCOME),
      ...Object.values(ADI_ROW_ACTION),
    ];
    expect(copy.filter((text) => BANNED_COPY.test(text))).toEqual([]);
  });

  it("states a measured improvement with the reason it cannot be applied", () => {
    const row = placementRow(MARQUEE_PLACEMENT_ATTEMPT);
    expect(row.status).toBe(ADI_ROW_STATUS.TESTED);
    expect(row.outcome).toMatch(/Measured improvement/i);
    expect(row.outcome).toMatch(/P20 better by 3 dB/);
    expect(row.outcome).toMatch(/no applicable change was kept/i);
    expect(row.actionText).toBe(ADI_ROW_ACTION.RERUN_TO_APPLY);
    expect(BANNED_COPY.test(textOf(row))).toBe(false);
    // No decimal dB anywhere in the designer copy.
    expect(textOf(row)).not.toMatch(/\d\.\d/);
  });

  it("marks a small improvement as no useful improvement, with its threshold", () => {
    const row = placementRow({ p20DeltaDb: -0.4, p19DeltaDb: 0.2, p20VariationDb: 13 });
    expect(row.status).toBe(ADI_ROW_STATUS.TESTED);
    expect(row.outcome).toBe(ADI_ROW_OUTCOME.NO_USEFUL_BELOW_THRESHOLD);
    expect(row.outcome).toMatch(/no useful improvement/i);
    expect(row.outcome).toMatch(/below the 1 dB action threshold/i);
  });

  it("labels a trade-off and never applies it automatically", () => {
    const row = placementRow({ p20DeltaDb: -4, p19DeltaDb: 2, p20VariationDb: 12 });
    expect(row.status).toBe(ADI_ROW_STATUS.TRADE_OFF);
    expect(row.outcome).toMatch(/improves P20 but worsens P19 consistency by 2 dB/i);
    expect(row.outcome).toMatch(/no automatic apply/i);
    expect(row.action ?? null).toBeNull();
    expect(BANNED_COPY.test(textOf(row))).toBe(false);
  });

  it("labels a worsening lever as rejected, in whole numbers", () => {
    const row = placementRow({ p20DeltaDb: 2.4, p19DeltaDb: -1, p20VariationDb: 12 });
    expect(row.status).toBe(ADI_ROW_STATUS.REJECTED);
    expect(row.outcome).toMatch(/worsens seat-to-seat consistency by 2 dB/i);
    expect(BANNED_COPY.test(textOf(row))).toBe(false);
  });
});

describe("the saved Marquee Home run, through the card's own row builder", () => {
  /**
   * The per-family ledger exactly as the saved Marquee Home run recorded it
   * (recordKind run_evidence, no lever rows, no baseline).
   */
  const SAVED_FAMILIES = [
    { family: "delay", status: "evaluated", tested: true, candidatesEvaluated: 6, bestAttempt: null, reason: "Evaluated — no comparison value was kept for this search." },
    { family: "gain", status: "not_tested", tested: false, candidatesEvaluated: 0, bestAttempt: null, reason: "Gain available but not run: no validated Current baseline was available for comparison in this run." },
    { family: "phase", status: "not_tested", tested: false, candidatesEvaluated: 9, bestAttempt: null, reason: "Not yet supported. The current optimiser does not model crossover-region phase between the main speakers and subwoofers." },
    { family: "polarity", status: "not_tested_separately", tested: false, candidatesEvaluated: 6, bestAttempt: null, reason: "No polarity-only evaluation exists." },
    { family: "placement", status: "rejected", tested: true, candidatesEvaluated: 4, bestAttempt: MARQUEE_PLACEMENT_ATTEMPT, reason: "Evaluated, but no candidate from this family was confirmed as a winner." },
    { family: "additional_positions", status: "rejected", tested: true, candidatesEvaluated: 4, bestAttempt: MARQUEE_PLACEMENT_ATTEMPT, reason: "Evaluated, but no candidate from this family was confirmed as a winner." },
    { family: "subwoofer_option", status: "not_tested", tested: false, candidatesEvaluated: null, bestAttempt: null, reason: "Not searched by the optimiser." },
    { family: "seat_movement", status: "evaluated", tested: true, candidatesEvaluated: 8, bestAttempt: null, reason: "Evaluated — no comparison value was kept for this search." },
  ];

  const rows = buildTestedOptionRows({ levers: [], run: { families: SAVED_FAMILIES }, baseline: null });
  const rowFor = (key) => rows.find((row) => row.key === key);

  it("states the placement outcome without withholding it", () => {
    const row = rowFor("placement");
    expect(row.status).toBe(ADI_ROW_STATUS.TESTED);
    expect(row.outcome).toMatch(/Measured improvement/i);
    expect(row.outcome).toMatch(/P20 better by 3 dB/);
    expect(row.outcome).toMatch(/no applicable change was kept/i);
    expect(row.actionText).toBe(ADI_ROW_ACTION.RERUN_TO_APPLY);
  });

  it("carries no banned copy on any row of the saved run", () => {
    const banned = rows.filter((row) => BANNED_COPY.test(textOf(row)));
    expect(banned.map((row) => `${row.label}: ${textOf(row)}`)).toEqual([]);
  });

  it("shows no decimal dB on any row", () => {
    const decimal = rows.filter((row) => /\d\.\d/.test(textOf(row)));
    expect(decimal.map((row) => `${row.label}: ${textOf(row)}`)).toEqual([]);
  });
});

describe("a plan lever's own verdict word", () => {
  const rowWith = (effect, extra = {}) => buildTestedOptionRows({
    status: "current",
    levers: [{
      lever: "placement",
      key: "placement",
      evaluated: true,
      changes: [{ subId: "sub-1", position: { x: 1, y: 2 } }],
      effect,
      ...extra,
    }],
    baseline: null,
  }).find((row) => row.key === "placement");

  it("is Recommended when the change improves the result and damages nothing", () => {
    const row = rowWith({ p20DeltaDb: -4, p20VariationDb: 12, p20Level: 1 });
    expect(row.status).toBe(ADI_ROW_STATUS.RECOMMENDED);
    expect(BANNED_COPY.test(textOf(row))).toBe(false);
  });

  it("is Trade-off when it improves one measure and worsens another", () => {
    const row = rowWith({ p20DeltaDb: -4, p19DeltaDb: 2, p20VariationDb: 12 });
    expect(row.status).toBe(ADI_ROW_STATUS.TRADE_OFF);
    expect(row.outcome).toMatch(/no automatic apply/i);
  });

  it("is Rejected when it worsens the result", () => {
    const row = rowWith({ p20DeltaDb: 2.4, p20VariationDb: 12 });
    expect(row.status).toBe(ADI_ROW_STATUS.REJECTED);
    expect(row.outcome).toMatch(/worsens seat-to-seat consistency/i);
  });

  it("states the threshold rather than a bare number when it is below the gate", () => {
    const row = rowWith({ p20DeltaDb: -0.4, p20VariationDb: 13 });
    expect(row.status).toBe(ADI_ROW_STATUS.TESTED);
    expect(row.outcome).toMatch(/no useful improvement/i);
    expect(row.outcome).toMatch(/1 dB action threshold/);
  });

  it("rejects a lever whose destination positions were not confirmed", () => {
    const row = rowWith(
      { p20DeltaDb: -4, p20VariationDb: 12 },
      { validation: { destinationsValid: false, reason: "Destination seats overlap." } },
    );
    expect(row.status).toBe(ADI_ROW_STATUS.REJECTED);
    expect(row.outcome).toMatch(/could not be confirmed as safe/i);
  });
});

describe("apply safety and the run's own reason", () => {
  it("refuses an Apply with a reason a designer can read", () => {
    const permission = resolveApplyPermission({
      planView: { status: "current", levers: [], individualEffectsEvaluated: true },
      presentation: { showApply: true },
      recommendedLever: null,
    });
    expect(permission.allowed).toBe(false);
    expect(permission.reason).toMatch(/no single evaluated change/i);
    expect(BANNED_COPY.test(permission.reason)).toBe(false);
  });

  it("states that no evaluated change was kept, instead of blaming the threshold", () => {
    const actionability = resolvePlanActionability({
      plan: { levers: {}, baseline: null },
      selection: { winner: null, evaluationIssues: [] },
    });
    expect(actionability.actionable).toBe(false);
    expect(actionability.reason).toBe(NO_RETAINED_CHANGE_REASON);
    expect(actionability.reason).toMatch(/kept no independently evaluated change/i);
  });

  it("states the threshold only when evaluated changes existed", () => {
    const actionability = resolvePlanActionability({
      plan: {
        levers: {
          placement: {
            lever: "placement",
            evaluated: true,
            changes: [{ subId: "sub-1", position: { x: 1, y: 2 } }],
            effect: { p20DeltaDb: -0.5, p20VariationDb: 13 },
          },
        },
        baseline: null,
      },
      selection: { winner: null, evaluationIssues: [] },
    });
    expect(actionability.actionable).toBe(false);
    expect(actionability.reason).toBe(NO_MATERIAL_CHANGE_REASON);
    expect(actionability.reason).toMatch(/below the 1 dB action threshold/i);
  });
});