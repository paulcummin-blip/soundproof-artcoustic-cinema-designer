// TEMPORARY diagnostic — prints the resolved optimiser presentation state for
// each scenario so the state mapping and the control wording can be inspected.
import { describe, it } from "vitest";
import {
  OPTIMISER_PRESENTATION_ACTION,
  resolveOptimiserPresentationState,
} from "../components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import { OPTIMISER_PLAN_STATUS } from "../components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import { ADI_OPTIMISER_ACTION, OPTIMISER_PLAN_RUN_BLOCK } from "../components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js";

const CASES = {
  "old run, no retained evidence (INCOMPLETE)": {
    planView: { status: OPTIMISER_PLAN_STATUS.INCOMPLETE, terminalOutcome: "evaluation_incomplete", run: { rejectionReasons: [] } },
  },
  "old contract (UNSUPPORTED)": {
    planView: { status: OPTIMISER_PLAN_STATUS.UNSUPPORTED, run: { rejectionReasons: [] } },
  },
  "completed, nothing worth applying": {
    planView: { status: OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT, run: { rejectionReasons: [] } },
  },
  "stale design": { planView: { status: OPTIMISER_PLAN_STATUS.STALE } },
  "failed run": { planView: null, runStatus: "failed", runError: "worker failed" },
  "stale bass (block)": {
    planView: { status: OPTIMISER_PLAN_STATUS.INCOMPLETE, run: null },
    runBlockReason: { code: OPTIMISER_PLAN_RUN_BLOCK.DESIGN_STALE },
  },
  "bass not calculated (block)": {
    planView: null,
    runBlockReason: { code: OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_REQUIRED },
  },
  "no valid bass result": {
    planView: { status: OPTIMISER_PLAN_STATUS.INCOMPLETE, run: null },
    runBlockReason: { code: OPTIMISER_PLAN_RUN_BLOCK.NO_VALID_BASS_RESULT },
  },
  "blocked on missing subwoofer": {
    planView: { status: OPTIMISER_PLAN_STATUS.INCOMPLETE, run: null },
    runBlockReason: { code: OPTIMISER_PLAN_RUN_BLOCK.MISSING_REQUIRED_DATA },
    runBlocked: true,
  },
  "applied calibration lever": {
    planView: {
      status: OPTIMISER_PLAN_STATUS.CURRENT,
      individualEffectsEvaluated: true,
      levers: [{ key: "delay", evaluated: true, canApply: true, effect: 2, changes: [{ field: "delayMs" }] }],
      run: { rejectionReasons: [] },
    },
  },
  "physical lever (placement)": {
    planView: {
      status: OPTIMISER_PLAN_STATUS.CURRENT,
      individualEffectsEvaluated: true,
      levers: [{ key: "placement", evaluated: true, canApply: true, effect: 3, changes: [{ field: "position" }] }],
      run: { rejectionReasons: [] },
    },
  },
};

describe("inspect", () => {
  it("prints every resolved state", () => {
    Object.entries(CASES).forEach(([name, input]) => {
      const s = resolveOptimiserPresentationState(input);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        case: name,
        state: s.state,
        outcome: s.outcome,
        outcomeLabel: s.outcomeLabel,
        statusLabel: s.statusLabel,
        action: s.action,
        actionLabel: s.actionLabel,
        isRetestAction: s.action === OPTIMISER_PRESENTATION_ACTION.RETEST,
        isCalculateAction: s.action === ADI_OPTIMISER_ACTION.CALCULATE,
        canRun: s.canRun,
        runBlocked: s.runBlocked,
        message: s.message,
        nextAction: s.nextAction,
        failureCode: s.failureCode,
      }, null, 1));
    });
  });
});