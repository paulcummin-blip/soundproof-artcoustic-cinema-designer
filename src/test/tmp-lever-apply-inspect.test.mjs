// TEMPORARY diagnostic — is the plan view's lever apply state independent of the
// presentation modules? Prints the lever fields the presentation readers test.
import { describe, it } from "vitest";
import {
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_EVIDENCE,
  OPTIMISER_PLAN_VERSION,
} from "../components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import { resolveOptimiserPlanStatus } from "../components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js";

const FINGERPRINT = "marquee-home-design-fingerprint";
const PLAN_INSTANCES = [{ id: "sub-rear-right", delayMs: 0, gainDb: 0, polarity: 1, enabled: true }];

const planWithEvaluatedDelay = () => ({
  planVersion: OPTIMISER_PLAN_VERSION,
  savedAt: "2026-09-30T10:00:00.000Z",
  recordKind: "plan",
  projectId: "marquee-home",
  versionId: "v1",
  designFingerprint: FINGERPRINT,
  resultFingerprint: "result-fp-2",
  candidateId: "delay-candidate-1",
  baseline: { p20VariationDb: 12.24 },
  levers: {
    [OPTIMISER_LEVER.DELAY]: {
      lever: OPTIMISER_LEVER.DELAY,
      evidenceStatus: OPTIMISER_LEVER_EVIDENCE.EVALUATED,
      evaluated: true,
      notEvaluated: false,
      sourceCandidateId: "delay-candidate-1",
      changes: [{ lever: OPTIMISER_LEVER.DELAY, subId: "sub-rear-right", label: "Rear sub 2", fromMs: 0, toMs: 4.5 }],
      effect: { p20VariationDb: 9.8, p20DeltaDb: -2.44, worstSeatId: "seat-r1-c2" },
      reason: "Aligns the rear subwoofer with the front pair at the RSP.",
      tradeOff: null,
    },
  },
  individualEffectsEvaluated: true,
  leverDecisions: {},
  notes: [],
});

describe("inspect plan view levers", () => {
  it("prints the lever apply fields", () => {
    const view = resolveOptimiserPlanStatus({
      plan: planWithEvaluatedDelay(),
      currentDesignFingerprint: FINGERPRINT,
      instances: PLAN_INSTANCES,
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      status: view.status,
      leverCount: (view.levers || []).length,
      levers: (view.levers || []).map((lever) => ({
        key: lever.key,
        evaluated: lever.evaluated,
        canApply: lever.canApply,
        state: lever.state,
        effect: lever.effect,
        changes: (lever.changes || []).length,
        applyBlockedReason: lever.applyBlockedReason || null,
        plausibilityStatus: lever.plausibility?.status || null,
      })),
    }, null, 1));
  });
});