// optimiser-plan-save-terminal-boundary.test.mjs
// ---------------------------------------------------------------------------
// FOCUSED TESTS — PLAN SAVE IS THE USER-TERMINAL BOUNDARY.
//
// The live Barton trace: the acoustic search and the plan save cost ≈57 s, and the
// recommendation publication then held the card for a further ≈58 s — and when it
// was refused, the whole run was reported as a FAILED optimisation even though its
// validated plan was already saved. A reload then restored a DIFFERENT terminal
// state, because that failure lived only in memory while the plan was persisted.
//
// What this suite protects:
//
//   1. the saved plan is the terminal boundary: the user's wait is the plan save
//      and never the publication;
//   2. the recommendation publication is SECONDARY — its outcome is a diagnostic,
//      and it can never hold the card or fail the run;
//   3. a PLAN SAVE that fails is still a terminal failure, with RETRY ADI and KEEP
//      CURRENT BASS RESULT, and it is persisted;
//   4. live state and hydrated state are ONE terminal authority;
//   5. one run publishes once: no duplicate publication, no repeated save;
//   6. the bass authority and report readiness are untouched by any of it;
//   7. no optimiser maths — no search range, candidate count, P19/P20 rule,
//      3-sub logic or ranking — is changed by this work.
// ---------------------------------------------------------------------------

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ADI_OPTIMISER_JOURNEY_STATE,
  ADI_PLAN_SAVE_FAILURE_MESSAGE,
  ADI_PUBLICATION_FAILURE_KEEP_LABEL,
  ADI_PUBLICATION_FAILURE_RETRY_LABEL,
  resolveAdiOptimiserJourney,
} from "../components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js";
import {
  OPTIMISER_FAILURE_STATUS,
  OPTIMISER_PLAN_STATUS,
  OPTIMISER_PLAN_VERSION,
  OPTIMISER_TERMINAL_OUTCOME,
} from "../components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import { resolveOptimiserPlanStatus } from "../components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js";
import {
  OPTIMISER_PRESENTATION_STATE,
  resolveOptimiserPresentationState,
} from "../components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import { serializeOptimiserPlan } from "../components/room/bass/optimiserPlan/optimiserPlanPersistence.js";
import {
  RECOMMENDATION_PUBLICATION_STATUS,
  buildRecommendationPublicationRecord,
  planRecommendationPublication,
} from "../components/room/bass/optimiserPlan/optimiserRecommendationPublication.js";
import {
  RUN_TIMING,
  buildPersistedRunTimings,
} from "../components/room/bass/optimiserPlan/optimiserRunTimings.js";
import { buildOptimiserRunHistoryRecord } from "../components/room/bass/optimiserPlan/optimiserRunHistory.js";
import { BASELINE_PARITY_STATUS } from "../components/room/bass/optimiserPlan/optimiserBaselineAuthority.js";
import { REPORT_STATE, deriveReportReadiness } from "../components/report/reportReadinessAuthority.js";
import { floorBassDeviation, gradeP19 } from "../components/utils/rp22/bassGradingAuthority.js";

const source = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

const RUN_HOOK = "../components/room/bass/optimiseWorkflow/useRunOptimisationPlan.js";
const PUBLICATION = "../components/room/bass/optimiserPlan/optimiserRecommendationPublication.js";

/** A saved, terminal plan that belongs to the open design. */
const TERMINAL_PLAN = {
  planVersion: OPTIMISER_PLAN_VERSION,
  recordKind: "run_evidence",
  savedAt: "2026-10-16T12:00:57.400Z",
  designFingerprint: "design-1",
  terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT,
  baselineParity: { status: BASELINE_PARITY_STATUS.MATCH },
  run: {
    runId: "run-1",
    terminal: true,
    evidenceContractVersion: OPTIMISER_PLAN_VERSION,
    outcome: OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT,
  },
};

/** The plan-save failure: the analysis ran and its result could not be saved. */
const PLAN_SAVE_FAILURE = {
  status: OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED,
  category: OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED,
  message: "The optimiser returned no usable result for this design. Re-run the Optimisation Plan.",
  publicationError: null,
  attempts: null,
  at: "2026-10-16T12:00:57.400Z",
  runId: "run-1",
};

/**
 * The record the run persists when the plan save failed — the run's OWN failure,
 * exactly as buildOptimiserRunEvidence writes it from saveRunFailure.
 */
const PLAN_SAVE_FAILURE_PLAN = {
  ...TERMINAL_PLAN,
  terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.FAILED,
  failure: PLAN_SAVE_FAILURE,
  run: { ...TERMINAL_PLAN.run, outcome: OPTIMISER_TERMINAL_OUTCOME.FAILED, failure: PLAN_SAVE_FAILURE },
};

/** What a refused SECONDARY publication recorded. */
const REFUSED_PUBLICATION = {
  status: RECOMMENDATION_PUBLICATION_STATUS.REFUSED,
  category: "write_refused",
  error: "Entity write-traffic limit reached.",
  attempts: 2,
  mode: "separate",
  fingerprints: ["fp-1"],
  at: "2026-10-16T12:01:55.000Z",
  runId: "run-1",
};

const planViewOf = (plan) => resolveOptimiserPlanStatus({
  plan,
  currentDesignFingerprint: "design-1",
});

const journeyOf = (plan) => {
  const planView = planViewOf(plan);
  return resolveAdiOptimiserJourney({
    planView,
    publicationFailure: planView.failure,
  });
};

describe("1 · the saved plan is the terminal boundary", () => {
  it("measures the user's wait to the plan save, never to the publication", () => {
    const start = Date.parse("2026-10-16T12:00:00.000Z");
    const saved = start + 57_400;
    const publicationCompleted = saved + 58_000;
    const stamp = (at) => ({ at, iso: new Date(at).toISOString() });
    const ledger = {
      runId: "run-1",
      publicationRetries: 2,
      milestones: {
        [RUN_TIMING.RUN_START]: stamp(start),
        [RUN_TIMING.SAVE_COMPLETED]: stamp(saved),
        [RUN_TIMING.USER_TERMINAL]: stamp(saved),
        [RUN_TIMING.PUBLICATION_STARTED]: stamp(saved),
        [RUN_TIMING.PUBLICATION_COMPLETED]: stamp(publicationCompleted),
      },
    };

    const timings = buildPersistedRunTimings(ledger);
    // The user's wait ends at the plan save: 57.4 s, not 115.4 s.
    assert.equal(timings.durationsMs.total, 57_400);
    assert.equal(timings.userTerminalAt, new Date(saved).toISOString());
    // The publication's own cost is recorded SEPARATELY, after the boundary.
    assert.equal(timings.durationsMs.publicationAfterTerminal, 58_000);
    assert.equal(timings.publicationCompleted, new Date(publicationCompleted).toISOString());
  });

  it("makes the run terminal at the plan save, before the publication is attempted", () => {
    const hook = source(RUN_HOOK);
    const terminalMark = hook.indexOf("RUN_TIMING.USER_TERMINAL)");
    const complete = hook.indexOf('setStatus("complete")');
    const publicationStart = hook.indexOf("await publishOptimiserRecommendation({");

    assert.ok(terminalMark > -1 && complete > terminalMark, "the run is terminal at the plan save");
    assert.ok(
      publicationStart > complete,
      "the publication is secondary: it starts after the designer already has the result",
    );
  });
});

describe("2 · the recommendation publication is secondary", () => {
  it("records a refused publication as its own diagnostic, with the error verbatim", () => {
    const record = buildRecommendationPublicationRecord({
      publication: {
        ok: false,
        mode: "separate",
        results: [{ fingerprint: "fp-1", withPlan: true, persisted: false }],
        failure: {
          category: "write_refused",
          message: "The optimiser result could not be saved.",
          publicationError: "Entity write-traffic limit reached.",
          attempts: 2,
        },
      },
      runId: "run-1",
    });

    assert.equal(record.status, RECOMMENDATION_PUBLICATION_STATUS.REFUSED);
    assert.equal(record.error, "Entity write-traffic limit reached.");
    assert.equal(record.attempts, 2);
    assert.deepEqual(record.fingerprints, ["fp-1"]);
    // It is its own diagnostic: it never becomes the run's failure.
    assert.equal("failure" in record, false);
  });

  it("never reports a publication that was not attempted as published", () => {
    const nothingToWrite = planRecommendationPublication({ runFingerprint: null, savedFingerprint: null });
    assert.equal(nothingToWrite.writes.length, 0);
    const record = buildRecommendationPublicationRecord({ publication: nothingToWrite, runId: "run-1" });
    assert.equal(record.status, RECOMMENDATION_PUBLICATION_STATUS.NOT_ATTEMPTED);
    assert.equal(record.error, null);
  });

  it("still resolves the run's OWN terminal result when that publication was refused", () => {
    const plan = { ...TERMINAL_PLAN, recommendationPublication: REFUSED_PUBLICATION };
    const planView = planViewOf(plan);

    assert.equal(planView.failure, null, "a refused publication is not the run's failure");
    assert.equal(planView.status, OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT);
    assert.equal(
      resolveOptimiserPresentationState({ planView }).state,
      OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT,
    );
    assert.equal(journeyOf(plan).state, ADI_OPTIMISER_JOURNEY_STATE.NO_USEFUL_IMPROVEMENT);
  });

  it("never holds the terminal card: the saved result reads the same with or without it", () => {
    const without = planViewOf(TERMINAL_PLAN);
    const withRefusal = planViewOf({ ...TERMINAL_PLAN, recommendationPublication: REFUSED_PUBLICATION });
    assert.equal(withRefusal.status, without.status);
    assert.equal(
      journeyOf({ ...TERMINAL_PLAN, recommendationPublication: REFUSED_PUBLICATION }).state,
      journeyOf(TERMINAL_PLAN).state,
    );
  });
});

describe("3 · a failed plan save is still a terminal failure", () => {
  it("states UNABLE TO COMPLETE OPTIMISATION with RETRY ADI and KEEP CURRENT BASS RESULT", () => {
    const journey = journeyOf(PLAN_SAVE_FAILURE_PLAN);

    assert.equal(journey.state, ADI_OPTIMISER_JOURNEY_STATE.PUBLICATION_FAILED);
    assert.equal(journey.statusLabel, "Unable To Complete Optimisation");
    assert.equal(journey.message, ADI_PLAN_SAVE_FAILURE_MESSAGE);
    assert.equal(journey.primaryLabel, ADI_PUBLICATION_FAILURE_RETRY_LABEL);
    assert.equal(journey.keepAction.label, ADI_PUBLICATION_FAILURE_KEEP_LABEL);
    assert.equal(journey.showPlan, false);
  });

  it("is a terminal state of the run, not a completed result", () => {
    const planView = planViewOf(PLAN_SAVE_FAILURE_PLAN);
    assert.equal(planView.terminalOutcome, OPTIMISER_TERMINAL_OUTCOME.FAILED);
    assert.equal(planView.failure.status, OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED);
  });

  it("is persisted with the run's record, so it survives a reload", () => {
    const hook = source(RUN_HOOK);
    const helper = hook.indexOf("const saveRunFailure = (reason, extra = {}) => {");
    assert.ok(helper > -1, "every fresh run writes a durable terminal record");
    const block = hook.slice(helper, helper + 1600);
    assert.ok(block.includes("failure: extra.planSaveFailed"));
    assert.ok(block.includes("status: OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED"));
    assert.ok(block.includes("setOptimiserPlanAuthority(projectId, versionId, evidence)"));
  });
});

describe("4 · live state and hydrated state are ONE authority", () => {
  it("restores the SAME terminal failure through a save and reload round trip", () => {
    const live = planViewOf(PLAN_SAVE_FAILURE_PLAN);
    const restored = planViewOf(serializeOptimiserPlan(PLAN_SAVE_FAILURE_PLAN));

    assert.equal(restored.failure.status, OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED);
    assert.equal(restored.status, live.status);
    assert.equal(restored.terminalOutcome, live.terminalOutcome);
    assert.equal(
      journeyOf(serializeOptimiserPlan(PLAN_SAVE_FAILURE_PLAN)).state,
      ADI_OPTIMISER_JOURNEY_STATE.PUBLICATION_FAILED,
      "a reload states the failure that was actually reached, never a different result",
    );
  });

  it("restores the same normal result, with the secondary publication beside it", () => {
    const saved = { ...TERMINAL_PLAN, recommendationPublication: REFUSED_PUBLICATION };
    const restored = planViewOf(serializeOptimiserPlan(saved));

    assert.equal(restored.status, OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT);
    assert.equal(restored.failure, null);
    assert.equal(restored.recommendationPublication.status, RECOMMENDATION_PUBLICATION_STATUS.REFUSED);
    assert.equal(
      journeyOf(serializeOptimiserPlan(saved)).state,
      ADI_OPTIMISER_JOURNEY_STATE.NO_USEFUL_IMPROVEMENT,
    );
  });
});

describe("5 · one run publishes once", () => {
  it("consolidates to ONE write for one result, and keeps both only when they differ", () => {
    const same = planRecommendationPublication({ runFingerprint: "fp-1", savedFingerprint: "fp-1" });
    assert.equal(same.writes.length, 1);
    assert.equal(same.writes[0].withPlan, true);

    const different = planRecommendationPublication({ runFingerprint: "fp-1", savedFingerprint: "fp-2" });
    assert.equal(different.writes.length, 2);
  });

  it("attempts the publication once per run and records its outcome once", () => {
    const hook = source(RUN_HOOK);
    assert.equal((hook.match(/await publishOptimiserRecommendation\(/g) || []).length, 1);
    // One call site in the run, one in the builder's own definition.
    assert.equal((hook.match(/buildRecommendationPublicationRecord\(/g) || []).length, 1);
    // One run at a time, so no second publication can be queued behind this one.
    assert.ok(hook.includes("if (runningRef.current || !hasCanonicalInstances) return;"));
  });

  it("writes the run's own record for the publication's outcome, and nothing else", () => {
    const hook = source(RUN_HOOK);
    const writes = hook.match(/^\s+setOptimiserPlanAuthority\(/gm) || [];
    // The save, the terminal authority, and ONE further write for the secondary
    // publication's outcome.
    assert.equal(writes.length, 3);
  });
});

describe("6 · the bass authority and report readiness are untouched", () => {
  const READY_INPUT = {
    hydrating: false,
    roomDims: { widthM: 4.5, lengthM: 6 },
    placedSpeakers: [{ id: "l" }, { id: "r" }],
    engineeringSummary: { overallLevel: 3 },
    bassPerformance: { p14Db: 115, p20Db: 12 },
    pricingStatus: "ok",
    assessment: { reportComplete: true },
  };

  it("is READY with the publication published, refused or never attempted", () => {
    assert.equal(deriveReportReadiness(READY_INPUT).state, REPORT_STATE.READY);
    assert.equal(
      deriveReportReadiness({ ...READY_INPUT, recommendationPublication: REFUSED_PUBLICATION }).state,
      REPORT_STATE.READY,
    );
  });

  it("gives the secondary publication no way to write the design or the bass result", () => {
    const hook = source(RUN_HOOK);
    for (const mutator of [
      "commitInstances",
      "commitSeating",
      "applyCalibration",
      "buildOptimisedInstances",
      "applyCalibrationTuning",
    ]) {
      assert.equal(hook.includes(mutator), false, `${mutator} must never run in the optimiser's own path`);
    }
    const publication = source(PUBLICATION);
    assert.equal(publication.includes("commitInstances"), false);
    assert.equal(publication.includes("setOptimiserPlanAuthority"), false);
  });
});

describe("7 · no optimiser maths is changed by this work", () => {
  it("keeps the P19/P20 display and grading rules exactly as they were", () => {
    assert.equal(floorBassDeviation(12.8), 12);
    assert.equal(floorBassDeviation(15.9), 15);
    assert.equal(floorBassDeviation(4.99), 4);
    assert.equal(gradeP19(2.0), 4);
    assert.equal(gradeP19(6.4), 0);
  });

  it("confines the change to the run lifecycle: no maths authority knows about it", () => {
    const vocabulary = /recommendationPublication|userTerminal|user_terminal|planSaveFailed|PLAN_SAVE_FAILED/;
    const maths = [
      "../components/room/bass/optimiserPlan/optimiserResultViewModel.js",
      "../components/room/bass/optimiserPlan/buildOptimiserPlan.js",
      "../components/room/bass/optimiserPlan/optimiserPlanSave.js",
      "../components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js",
      "../components/room/bass/optimiserPlan/optimiserBaselineAuthority.js",
      "../components/room/bass/optimiserPlan/optimiserLeverVerdict.js",
      "../components/utils/rp22/bassGradingAuthority.js",
    ];
    for (const file of maths) {
      assert.equal(vocabulary.test(source(file)), false, `${file} must not take part in the lifecycle boundary`);
    }
  });
});

describe("8 · the durable timestamps stay separable", () => {
  it("persists plan saved, user terminal and the publication's own lifecycle separately", () => {
    const record = buildOptimiserRunHistoryRecord({
      runId: "run-1",
      projectId: "p1",
      versionId: "v1",
      startedAt: "2026-10-16T12:00:00.000Z",
      planSavedAt: "2026-10-16T12:00:57.400Z",
      userTerminalAt: "2026-10-16T12:00:57.400Z",
      terminalAt: "2026-10-16T12:00:57.400Z",
      publicationStartedAt: "2026-10-16T12:00:57.500Z",
      publicationCompletedAt: "2026-10-16T12:01:55.000Z",
      publicationStatus: "refused",
      publicationError: "Entity write-traffic limit reached.",
      publicationAttemptCount: 2,
      terminalStatus: "no_useful_improvement",
    });

    assert.equal(record.plan_saved_at, "2026-10-16T12:00:57.400Z");
    // The designer's terminal instant never waits for the publication.
    assert.equal(record.user_terminal_at, "2026-10-16T12:00:57.400Z");
    assert.equal(record.terminal_at, record.user_terminal_at);
    assert.equal(record.publication_started_at, "2026-10-16T12:00:57.500Z");
    assert.equal(record.publication_completed_at, "2026-10-16T12:01:55.000Z");
    assert.equal(record.publication_status, "refused");
    assert.equal(record.publication_error, "Entity write-traffic limit reached.");
  });
});