// adi-optimiser-journey-acceptance.test.mjs
// ---------------------------------------------------------------------------
// Acceptance for the ADI bass-optimisation journey on the Room Designer card.
//
//   A  the four journey states and the action each offers
//   B  no dead end: every state states what is limiting AND what happens next
//   C  running the optimiser leaves visible evaluated evidence on the card
//   D  every "cannot run yet" reason carries its own next step
//   E  "no valid bass result" is a reachable reason, not unused wording
//   F  the run action saves the plan and never mutates the design
//
// Pure logic plus one source guard. No bass maths, no optimiser scoring and no
// P19/P20 definition is exercised or changed here.
// ---------------------------------------------------------------------------

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import {
  ADI_OPTIMISER_ACTION,
  ADI_OPTIMISER_JOURNEY_STATE,
  OPTIMISER_PLAN_RUN_BLOCK,
  OPTIMISER_PLAN_RUN_BLOCK_MESSAGE,
  firstSentence,
  isLeverLevelComplete,
  resolveAdiOptimiserJourney,
  resolveOptimisationPlanRunBlock,
} from "@/components/room/bass/optimiserPlan/resolveAdiOptimiserJourney";
import { OPTIMISER_PLAN_STATUS } from "@/components/room/bass/optimiserPlan/optimiserPlanConstants";
import { buildOptimiserPlan } from "@/components/room/bass/optimiserPlan/buildOptimiserPlan";
import { serializeOptimiserPlan } from "@/components/room/bass/optimiserPlan/optimiserPlanPersistence";
import { resolveOptimiserPlanStatus } from "@/components/room/bass/optimiserPlan/resolveOptimiserPlanStatus";

const LIMITING = "Seat-to-seat consistency is the limiting factor.";

const evaluatedLever = {
  key: "delay",
  evaluated: true,
  notEvaluated: false,
  effect: { p20DeltaDb: -2.02, p19VariationDb: 0.8 },
};

const planViewCurrent = {
  status: OPTIMISER_PLAN_STATUS.CURRENT,
  individualEffectsEvaluated: true,
  levers: [evaluatedLever],
};

const planViewCombinedOnly = {
  status: OPTIMISER_PLAN_STATUS.CURRENT,
  individualEffectsEvaluated: false,
  levers: [{ key: "polarity", evaluated: false, notEvaluated: true, effect: null }],
};

const planViewStale = { ...planViewCurrent, status: OPTIMISER_PLAN_STATUS.STALE };
const planViewUnsupported = {
  status: OPTIMISER_PLAN_STATUS.UNSUPPORTED,
  individualEffectsEvaluated: false,
  levers: [],
};
const planViewAbsent = {
  status: OPTIMISER_PLAN_STATUS.ABSENT,
  individualEffectsEvaluated: false,
  levers: [],
};

const resolve = (planView, blockReason = null) => resolveAdiOptimiserJourney({
  planView,
  limitingFactorSentence: LIMITING,
  blockReason,
});

// ── A. States and their actions ─────────────────────────────────────────────

describe("ADI optimiser journey — states", () => {
  test("no saved plan → Optimisation required, offers Run", () => {
    const journey = resolve(planViewAbsent);
    expect(journey.state).toBe(ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED);
    expect(journey.action).toBe(ADI_OPTIMISER_ACTION.RUN);
    expect(journey.actionLabel).toBe("Run Optimisation Plan");
    expect(journey.message).toContain(LIMITING);
    expect(journey.explanation).toBeTruthy();
    expect(journey.notes.length).toBeGreaterThan(0);
  });

  test("saved plan from an earlier design → Re-evaluation required, offers Re-run", () => {
    const journey = resolve(planViewStale);
    expect(journey.state).toBe(ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED);
    expect(journey.action).toBe(ADI_OPTIMISER_ACTION.RERUN);
    expect(journey.message).toContain(LIMITING);
    expect(journey.message).toMatch(/earlier design state/i);
  });

  test("combined-only evidence → Evaluation incomplete, offers Complete", () => {
    const journey = resolve(planViewCombinedOnly);
    expect(journey.state).toBe(ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE);
    expect(journey.action).toBe(ADI_OPTIMISER_ACTION.COMPLETE);
    expect(journey.message).toContain(LIMITING);
  });

  test("unreadable evidence → Evaluation incomplete, offers Re-run", () => {
    const journey = resolve(planViewUnsupported);
    expect(journey.state).toBe(ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE);
    expect(journey.action).toBe(ADI_OPTIMISER_ACTION.RERUN);
  });

  test("complete lever-level evidence → Optimisation plan available, read-only", () => {
    const journey = resolve(planViewCurrent);
    expect(journey.state).toBe(ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE);
    expect(journey.action).toBeNull();
    expect(journey.showPlan).toBe(true);
  });

  test("lever-level completeness requires an evaluated effect on every lever", () => {
    expect(isLeverLevelComplete(planViewCurrent)).toBe(true);
    expect(isLeverLevelComplete(planViewCombinedOnly)).toBe(false);
    expect(isLeverLevelComplete(planViewStale)).toBe(false);
    expect(isLeverLevelComplete(null)).toBe(false);
  });
});

// ── B. No dead end ──────────────────────────────────────────────────────────

describe("ADI optimiser journey — never a dead end", () => {
  const allViews = [planViewAbsent, planViewStale, planViewCombinedOnly, planViewUnsupported, planViewCurrent];

  test("every state states the limitation and offers an action or visible evidence", () => {
    allViews.forEach((planView) => {
      const journey = resolve(planView);
      expect(journey.message).toBeTruthy();
      expect(journey.message).toContain(LIMITING);
      const hasNextStep = journey.action !== null || journey.showPlan === true;
      expect(hasNextStep, `${journey.state} has no next step`).toBe(true);
    });
  });

  test("an incomplete evaluation always offers an action and explains what it will do", () => {
    [planViewCombinedOnly, planViewUnsupported].forEach((planView) => {
      const journey = resolve(planView);
      expect(journey.state).toBe(ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE);
      expect(journey.action).not.toBeNull();
      expect(journey.actionLabel).toBeTruthy();
      expect(journey.explanation).toBeTruthy();
      expect(journey.notes.length).toBeGreaterThan(0);
    });
  });

  test("the limiting factor survives even when the diagnosis has trailing detail", () => {
    expect(firstSentence(`${LIMITING} Seating geometry is fixed.`)).toBe(LIMITING);
    expect(firstSentence("")).toBeNull();
  });

  test("a blocked run keeps the journey usable: reason plus the step that unblocks it", () => {
    const blockReason = resolveOptimisationPlanRunBlock({
      hasActiveSubModel: true,
      hasCanonicalInstances: true,
      targetSelected: false,
    });
    const journey = resolve(planViewAbsent, blockReason);
    expect(journey.canRun).toBe(false);
    expect(journey.action).not.toBeNull();
    expect(journey.blockReason.message).toMatch(/select the bass target/i);
  });
});

// ── C. A run leaves a useful card ───────────────────────────────────────────

describe("ADI optimiser journey — after running the optimiser", () => {
  const DESIGN_FP = "design:fp:marquee";

  const instances = () => [
    { id: "sub-front-1", enabled: true, legacyGroup: "front", position: { x: 0.31, y: 0.1375 }, delayMs: 0, gainDb: 0, polarity: 1 },
    { id: "sub-front-2", enabled: true, legacyGroup: "front", position: { x: 4.19, y: 0.1375 }, delayMs: 0, gainDb: 0, polarity: 1 },
    { id: "sub-rear-1", enabled: true, legacyGroup: "rear", position: { x: 0.31, y: 5.8625 }, delayMs: 0, gainDb: 0, polarity: 1 },
    { id: "sub-rear-2", enabled: true, legacyGroup: "rear", position: { x: 4.19, y: 5.8625 }, delayMs: 0, gainDb: 0, polarity: 1 },
  ];

  const baseline = () => ({
    candidateId: "current",
    candidateKind: "current",
    perSeatP20: [{ seatId: "seat-r1-c1", level: 1, variationDbRaw: 17.02, worstFrequencyHz: 94.56 }],
    achievedP19VariationDb: 0.56,
    achievedP19Level: 4,
    achievedP20VariationDb: 17.02,
    achievedP20Level: 1,
    p14AchievedDb: 112,
    achievedP18Hz: 22,
    operatingOutputDb: 106,
  });

  const combinedWinner = () => ({
    candidateId: "combined:9",
    candidateKind: "combined",
    coordinates: [{ x: 0.9, y: 0.4 }, { x: 3.6, y: 0.4 }, { x: 0.9, y: 5.6 }, { x: 3.6, y: 5.6 }],
    appliedTuning: [
      { sourceId: "sub-front-1", delayMs: 0, gainDb: 0, polarity: 1 },
      { sourceId: "sub-front-2", delayMs: 0, gainDb: 0, polarity: 1 },
      { sourceId: "sub-rear-1", delayMs: 2.5, gainDb: -2, polarity: -1 },
      { sourceId: "sub-rear-2", delayMs: 2.5, gainDb: -2, polarity: -1 },
    ],
    perSeatP20: [{ seatId: "seat-r1-c1", level: 3, variationDbRaw: 7.4, worstFrequencyHz: 88.0 }],
    achievedP19VariationDb: 1.1,
    achievedP20VariationDb: 7.4,
    p14AchievedDb: 111.4,
    operatingOutputDb: 104.5,
    achievedP18Hz: 22,
  });

  const savedCombinedOnlyPlan = () => serializeOptimiserPlan(buildOptimiserPlan({
    selection: { winner: combinedWinner(), currentResult: baseline(), confirmedResults: [] },
    identity: {
      projectId: "proj-marquee",
      versionId: "ver-1",
      designFingerprint: DESIGN_FP,
      resultFingerprint: "result:fp:marquee",
      cacheKey: DESIGN_FP,
      target: { p14TargetDb: 115, targetKey: null },
    },
    instances: instances(),
  }));

  test("the plan saved by a run is restored and resolved as Current", () => {
    const plan = savedCombinedOnlyPlan();
    expect(plan).toBeTruthy();
    const planView = resolveOptimiserPlanStatus({
      plan,
      currentDesignFingerprint: DESIGN_FP,
      instances: instances(),
    });
    expect(planView.status).toBe(OPTIMISER_PLAN_STATUS.CURRENT);
  });

  test("after a run the card shows evaluated evidence and still offers the next action", () => {
    const planView = resolveOptimiserPlanStatus({
      plan: savedCombinedOnlyPlan(),
      currentDesignFingerprint: DESIGN_FP,
      instances: instances(),
    });
    const journey = resolve(planView);
    expect(journey.showPlan).toBe(true);
    expect(journey.action).toBe(ADI_OPTIMISER_ACTION.COMPLETE);
    expect(journey.statusLabel).toBe("Evaluation incomplete");
  });

  test("reopening on the same design resolves to the same usable state", () => {
    const onFirstOpen = resolve(resolveOptimiserPlanStatus({
      plan: savedCombinedOnlyPlan(),
      currentDesignFingerprint: DESIGN_FP,
      instances: instances(),
    }));
    const onReopen = resolve(resolveOptimiserPlanStatus({
      plan: JSON.parse(JSON.stringify(savedCombinedOnlyPlan())),
      currentDesignFingerprint: DESIGN_FP,
      instances: instances(),
    }));
    expect(onReopen.state).toBe(onFirstOpen.state);
    expect(onReopen.showPlan).toBe(true);
    expect(onReopen.action).not.toBeNull();
  });

  test("a changed design is stale — never silently reported as current evidence", () => {
    const planView = resolveOptimiserPlanStatus({
      plan: savedCombinedOnlyPlan(),
      currentDesignFingerprint: "design:fp:changed",
      instances: instances(),
    });
    const journey = resolve(planView);
    expect(planView.status).toBe(OPTIMISER_PLAN_STATUS.STALE);
    expect(journey.state).toBe(ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED);
    expect(journey.action).toBe(ADI_OPTIMISER_ACTION.RERUN);
  });
});

// ── D + E. Blocked reasons are actionable, and all of them are reachable ────

describe("ADI optimiser journey — why the optimiser cannot run yet", () => {
  const canRunBase = {
    hasActiveSubModel: true,
    hasCanonicalInstances: true,
    targetSelected: true,
    canCalculate: true,
    hasCurrentResult: true,
  };

  test("a ready design is not blocked", () => {
    expect(resolveOptimisationPlanRunBlock(canRunBase)).toBeNull();
  });

  test("every reason states a next step", () => {
    Object.values(OPTIMISER_PLAN_RUN_BLOCK).forEach((code) => {
      expect(OPTIMISER_PLAN_RUN_BLOCK_MESSAGE[code], `${code} has no message`).toBeTruthy();
      expect(
        OPTIMISER_PLAN_RUN_BLOCK_MESSAGE[code],
        `${code} does not tell the designer what to do next`,
      ).toMatch(/Calculate Performance|Select the bass target|Choose the subwoofer system|Update Bass Performance|as soon as it finishes|Retry Calculate Performance/);
    });
  });

  test("each blocking condition resolves to its own reason", () => {
    expect(resolveOptimisationPlanRunBlock({ ...canRunBase, hasCanonicalInstances: false }).code)
      .toBe(OPTIMISER_PLAN_RUN_BLOCK.MISSING_REQUIRED_DATA);
    expect(resolveOptimisationPlanRunBlock({ ...canRunBase, targetSelected: false }).code)
      .toBe(OPTIMISER_PLAN_RUN_BLOCK.TARGET_NOT_SELECTED);
    expect(resolveOptimisationPlanRunBlock({ ...canRunBase, authorityStatus: "STALE" }).code)
      .toBe(OPTIMISER_PLAN_RUN_BLOCK.DESIGN_STALE);
    expect(resolveOptimisationPlanRunBlock({ ...canRunBase, calculationInProgress: true }).code)
      .toBe(OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_IN_PROGRESS);
    expect(resolveOptimisationPlanRunBlock({ ...canRunBase, lastOutcome: "error" }).code)
      .toBe(OPTIMISER_PLAN_RUN_BLOCK.WORKER_FAILED);
    expect(resolveOptimisationPlanRunBlock({ ...canRunBase, hasCurrentResult: false, canCalculate: false }).code)
      .toBe(OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_REQUIRED);
  });

  test("a result that is present but not a valid authority blocks the run with its own reason", () => {
    const notVerified = resolveOptimisationPlanRunBlock({
      ...canRunBase,
      hasCurrentResult: true,
      canCalculate: false,
      authorityStatus: "NOT_VERIFIED",
    });
    expect(notVerified.code).toBe(OPTIMISER_PLAN_RUN_BLOCK.NO_VALID_BASS_RESULT);
    expect(notVerified.message).toMatch(/no valid bass result/i);

    const limited = resolveOptimisationPlanRunBlock({
      ...canRunBase,
      hasCurrentResult: true,
      canCalculate: false,
      authorityStatus: "LIMITED",
    });
    expect(limited.code).toBe(OPTIMISER_PLAN_RUN_BLOCK.NO_VALID_BASS_RESULT);
  });

  test("an invalid result the engine can recalculate still allows the run", () => {
    expect(resolveOptimisationPlanRunBlock({
      ...canRunBase,
      authorityStatus: "NOT_VERIFIED",
      canCalculate: true,
    })).toBeNull();
  });

  test("a run blocked by an invalid result still shows the limiting factor and the next step", () => {
    const blockReason = resolveOptimisationPlanRunBlock({
      ...canRunBase,
      hasCurrentResult: true,
      canCalculate: false,
      authorityStatus: "NOT_VERIFIED",
    });
    const journey = resolve(planViewAbsent, blockReason);
    expect(journey.message).toContain(LIMITING);
    expect(journey.canRun).toBe(false);
    expect(journey.action).not.toBeNull();
    expect(journey.blockReason.message).toMatch(/Calculate Performance/);
  });
});

// ── F. The run action saves the plan and never mutates the design ───────────

describe("ADI optimiser run action — evidence only", () => {
  const hookSource = fs.readFileSync(
    new URL("../src/components/room/bass/optimiseWorkflow/useRunOptimisationPlan.js", import.meta.url),
    "utf8",
  );

  test("the run saves the evaluated plan", () => {
    expect(hookSource).toMatch(/setOptimiserPlanAuthority\(/);
    expect(hookSource).toMatch(/buildOptimiserPlan\(/);
  });

  test("the run never writes design state", () => {
    ["commitInstances", "commitSeating", "applyCalibrationTuning", "acceptRecommendation", "commitSeatingProvenance"]
      .forEach((mutator) => {
        expect(hookSource, `the run must not call ${mutator}`).not.toMatch(new RegExp(`\\b${mutator}\\b`));
      });
  });
});