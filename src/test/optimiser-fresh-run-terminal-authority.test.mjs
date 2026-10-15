import { describe, expect, it } from "vitest";

import { buildOptimiserRunEvidence } from "../components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import { serializeOptimiserPlan } from "../components/room/bass/optimiserPlan/optimiserPlanPersistence.js";
import { resolveOptimiserPlanStatus } from "../components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js";
import {
  OPTIMISER_OUTCOME,
  OPTIMISER_PRESENTATION_STATE,
  resolveOptimiserPresentationState,
} from "../components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import {
  planIsSupersededByRun,
  resolvePresentationPlan,
} from "../components/room/bass/optimiserPlan/optimiserRunAuthority.js";

const DESIGN = "cal:v8:live-design";
const RUN = {
  runId: "optimiser-run-live-2",
  startedAt: "2026-10-15T16:55:00.000Z",
  supersededRunId: "optimiser-run-live-1",
};

function freshIncompleteRecord() {
  return buildOptimiserRunEvidence({
    identity: {
      projectId: "project-live",
      versionId: "version-live",
      designFingerprint: DESIGN,
      resultFingerprint: DESIGN,
      cacheKey: DESIGN,
    },
    runIdentity: RUN,
    selection: {
      currentResult: {},
      confirmedResults: [{ candidateId: "grouped-delay:rear:1" }],
      winner: { candidateId: "grouped-delay:rear:1" },
      canonicalJobsRun: 28,
      baselineValidation: { valid: true, issues: [], message: null },
      evaluationIncomplete: true,
      evaluationIssues: [
        { stage: "symmetric", error: "Cannot read properties of null (reading 'originalIndex')" },
        { stage: "asymmetric-pair", error: "Cannot read properties of null (reading 'x')" },
      ],
    },
    diagnostics: {
      canonicalJobsRun: 28,
      topCandidatesForWinningStage: [{
        candidateId: "grouped-delay:rear:1",
        candidateKind: "grouped-delay",
        score: { p20VariationDb: 9.2 },
      }],
    },
    terminalOutcome: "evaluation_incomplete",
    failureReason: "symmetric: Cannot read properties of null (reading 'originalIndex')",
  });
}

function view(record) {
  return resolveOptimiserPlanStatus({
    plan: record,
    currentDesignFingerprint: DESIGN,
    instances: [],
    seatingPositions: [],
  });
}

describe("fresh optimiser terminal authority", () => {
  it("maps the fresh run's own technical incompletion to Unable To Evaluate", () => {
    const record = freshIncompleteRecord();
    const planView = view(record);
    const state = resolveOptimiserPresentationState({
      planView,
      runStatus: "complete",
    });

    expect(record.run.runId).toBe(RUN.runId);
    expect(record.run.supersededRunId).toBe(RUN.supersededRunId);
    expect(record.run.evidenceContractVersion).toBe(record.planVersion);
    expect(record.run.terminal).toBe(true);
    expect(record.run.candidatesEvaluated).toBe(1);
    expect(record.run.resultsRetained).toBe(1);
    expect(record.run.baselineValidation.valid).toBe(true);

    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.FAILED);
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.UNABLE_TO_EVALUATE);
    expect(state.statusLabel).toBe("Unable To Evaluate");
    expect(state.message).toBe("Candidate geometry data was incomplete during the layout evaluation.");
    expect(state.statusLabel).not.toBe("Re-test Needed");
  });

  it("restores the same fresh terminal outcome after persistence round-trip", () => {
    const restored = JSON.parse(JSON.stringify(serializeOptimiserPlan(freshIncompleteRecord())));
    const state = resolveOptimiserPresentationState({ planView: view(restored) });

    expect(restored.run.runId).toBe(RUN.runId);
    expect(restored.run.evidenceContractVersion).toBe(restored.planVersion);
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.UNABLE_TO_EVALUATE);
    expect(state.statusLabel).toBe("Unable To Evaluate");
  });

  it("reserves Re-test Needed for a legacy artifact with no durable run identity", () => {
    const legacy = freshIncompleteRecord();
    legacy.run = {
      ...legacy.run,
      runId: null,
      startedAt: null,
      supersededRunId: null,
      evidenceContractVersion: null,
      terminal: false,
    };
    legacy.run.rejectionReasons = ["No candidate was confirmed in this run."];

    const state = resolveOptimiserPresentationState({ planView: view(legacy) });
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.RETEST_NEEDED);
    expect(state.statusLabel).toBe("Re-test Needed");
  });

  it("uses durable run identity before timestamps for newest-run authority", () => {
    const record = freshIncompleteRecord();
    record.savedAt = "2026-10-15T16:54:59.000Z";

    expect(planIsSupersededByRun(record, RUN)).toBe(false);
    expect(resolvePresentationPlan({ plan: record, run: RUN }).plan).toBe(record);

    const next = {
      runId: "optimiser-run-live-3",
      startedAt: "2026-10-15T17:00:00.000Z",
    };
    expect(planIsSupersededByRun(record, next)).toBe(true);
    expect(resolvePresentationPlan({ plan: record, run: next }).plan).toBeNull();
  });

  it("can persist an early fresh-run failure even before selection exists", () => {
    const record = buildOptimiserRunEvidence({
      identity: {
        projectId: "project-live",
        versionId: "version-live",
        designFingerprint: DESIGN,
        resultFingerprint: DESIGN,
        cacheKey: DESIGN,
      },
      runIdentity: RUN,
      failureReason: "The optimiser worker stopped before candidate evaluation.",
    });

    expect(record).toBeTruthy();
    expect(record.terminalOutcome).toBe("failed");
    expect(record.run.runId).toBe(RUN.runId);
    expect(record.run.terminal).toBe(true);

    const state = resolveOptimiserPresentationState({ planView: view(record) });
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.UNABLE_TO_EVALUATE);
    expect(state.statusLabel).toBe("Unable To Evaluate");
  });
});
