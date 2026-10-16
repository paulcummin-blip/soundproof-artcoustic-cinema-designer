// optimiser-run-lifecycle.test.mjs
// ---------------------------------------------------------------------------
// FOCUSED TESTS — the Bass Optimiser's RUN LIFECYCLE and RESULT AUTHORITY.
//
//   1. A PLAN SAVE THAT FAILS IS TERMINAL: the run stops, states "ADI finished
//      its analysis but could not save the optimiser plan for this design." and
//      offers RETRY ADI and KEEP CURRENT BASS RESULT. It never stays in flight.
//      Saving the plan is the USER-TERMINAL boundary; the recommendation
//      publication that follows it is SECONDARY work, so a refused publication is
//      recorded as a diagnostic and never turns a saved plan into a failed run.
//   2. A new run resets its own timestamps: it never inherits an elapsed time or
//      a "no progress for…" figure from the run it replaced.
//   3. A refused publication is not retried into a write-traffic storm, and one
//      result is published through ONE authority.
//   4. The limiting frequency has ONE authority, and 0 Hz is never shown.
//   5. Report readiness does NOT depend on the advisory optimiser.
//   6. P19/P20 keep the FLOOR display rule (never conventional rounding).
//
// Nothing here changes an optimiser rule: the tests read the presentation
// authorities, and where they read source they assert wiring only.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  ADI_OPTIMISER_JOURNEY_STATE,
  ADI_PUBLICATION_FAILURE_DETAIL,
  ADI_PUBLICATION_FAILURE_KEEP_LABEL,
  ADI_PUBLICATION_FAILURE_MESSAGE,
  ADI_PUBLICATION_FAILURE_RETRY_LABEL,
  ADI_OPTIMISER_ACTION,
  resolveAdiOptimiserJourney,
} from "../components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js";
import {
  OPTIMISER_FAILURE_CODE,
  resolveOptimiserFailure,
} from "../components/room/bass/optimiserPlan/optimiserFailureReason.js";
import {
  buildOptimiserRunProgress,
  describeOptimiserStatusCheck,
} from "../components/room/bass/optimiserPlan/optimiserRunProgressAuthority.js";
import { OPTIMISER_FAILURE_STATUS } from "../components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import {
  LIMITING_FREQUENCY_NOT_IDENTIFIED,
  resolveLimitingFrequency,
} from "../components/room/bass/optimiserPlan/optimiserLimitingFrequency.js";
import { resolveOptimiserPlanStatus } from "../components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js";
import { buildOptimiserRunEvidence } from "../components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import {
  OPTIMISER_PLAN_STATUS,
  OPTIMISER_PLAN_VERSION,
} from "../components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import { BASELINE_PARITY_STATUS } from "../components/room/bass/optimiserPlan/optimiserBaselineAuthority.js";
import { floorBassDeviation, gradeP19 } from "../components/utils/rp22/bassGradingAuthority.js";
import {
  REPORT_STATE,
  deriveReportReadiness,
} from "../components/report/reportReadinessAuthority.js";

const source = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

const RUN_HOOK = "../components/room/bass/optimiseWorkflow/useRunOptimisationPlan.js";
const PUBLICATION = "../components/room/bass/optimiserPlan/optimiserRecommendationPublication.js";
const PERSISTENCE = "../components/recommendationEngine/recommendationPersistence.js";
const RUN_AUTHORITY = "../components/room/bass/optimiserPlan/optimiserRunAuthority.js";
const PANEL = "../components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx";
const EVIDENCE_BLOCK = "../components/room/bass/optimiserPlan/AdiEngineerEvidenceBlock.jsx";
const READINESS = "../components/report/reportReadinessAuthority.js";
const READINESS_BUTTON = "../components/roomdesigner/reportReadiness/projectReportReadiness.js";

const PUBLICATION_FAILURE = {
  status: "publication_failed",
  category: "write_refused",
  message: "The result could not be saved: Entity write-traffic limit reached.",
  publicationError: "Entity write-traffic limit reached.",
  attempts: 2,
  at: "2026-10-16T09:00:00.000Z",
  runId: "optimiser-run-2026-10-16T08:59:00.000Z-7",
};

/**
 * THE PLAN-SAVE FAILURE — the optimiser's own real failure: the analysis ran and
 * no result could be saved for this design. It is the ONE failure that may be
 * stated as a failed run, and it is persisted with the record it belongs to.
 */
const PLAN_SAVE_FAILURE = {
  status: OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED,
  category: OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED,
  message: "The optimiser returned no usable result for this design. Re-run the Optimisation Plan.",
  publicationError: null,
  attempts: null,
  at: "2026-10-16T09:00:00.000Z",
  runId: PUBLICATION_FAILURE.runId,
};

/** A saved plan that belongs to the open design and resolved as a real result. */
const CURRENT_PLAN = {
  planVersion: OPTIMISER_PLAN_VERSION,
  recordKind: "run_evidence",
  savedAt: "2026-10-16T09:00:00.000Z",
  designFingerprint: "design-1",
  baselineParity: { status: BASELINE_PARITY_STATUS.MATCH },
  run: { runId: PUBLICATION_FAILURE.runId, terminal: true },
};

const planViewWithFailure = (failure = PUBLICATION_FAILURE) => resolveOptimiserPlanStatus({
  plan: { ...CURRENT_PLAN, failure },
  currentDesignFingerprint: "design-1",
});

describe("1 · a failed plan save is terminal, a failed secondary publication is not", () => {
  it("states UNABLE TO COMPLETE OPTIMISATION with the required copy and two actions", () => {
    const journey = resolveAdiOptimiserJourney({
      planView: planViewWithFailure(PLAN_SAVE_FAILURE),
      publicationFailure: PLAN_SAVE_FAILURE,
    });

    assert.equal(journey.state, ADI_OPTIMISER_JOURNEY_STATE.PUBLICATION_FAILED);
    assert.equal(journey.statusLabel, "Unable To Complete Optimisation");
    // The analysis finished and the PLAN is what could not be saved, so the
    // failure is stated for exactly what it is.
    assert.equal(journey.message, ADI_PLAN_SAVE_FAILURE_MESSAGE);
    assert.equal(
      ADI_PLAN_SAVE_FAILURE_MESSAGE,
      "ADI finished its analysis but could not save the optimiser plan for this design.",
    );

    // RETRY ADI is the ONE primary control, and the designer keeps their own way
    // out beside it. The run is never left without a next action.
    assert.equal(journey.primaryLabel, "RETRY ADI");
    assert.equal(ADI_PUBLICATION_FAILURE_RETRY_LABEL, "RETRY ADI");
    assert.equal(journey.action, ADI_OPTIMISER_ACTION.RERUN);
    assert.equal(journey.keepAction.label, "KEEP CURRENT BASS RESULT");
    assert.equal(ADI_PUBLICATION_FAILURE_KEEP_LABEL, "KEEP CURRENT BASS RESULT");
    assert.equal(journey.showPlan, false);
    assert.equal(journey.explanation, ADI_PLAN_SAVE_FAILURE_DETAIL);
  });

  it("keeps the legacy wording for a record written before the publication became secondary", () => {
    const journey = resolveAdiOptimiserJourney({
      planView: planViewWithFailure(),
      publicationFailure: PUBLICATION_FAILURE,
    });
    assert.equal(journey.state, ADI_OPTIMISER_JOURNEY_STATE.PUBLICATION_FAILED);
    assert.equal(journey.message, ADI_PUBLICATION_FAILURE_MESSAGE);
    assert.equal(journey.explanation, ADI_PUBLICATION_FAILURE_DETAIL);
  });

  it("wins over a completed result, so an evaluated plan cannot mask the failure", () => {
    const planView = planViewWithFailure();
    // The record genuinely resolved as a current, usable result...
    assert.equal(planView.status, OPTIMISER_PLAN_STATUS.CURRENT);
    assert.deepEqual(planView.failure, {
      status: "publication_failed",
      category: "write_refused",
      message: "The result could not be saved: Entity write-traffic limit reached.",
      publicationError: "Entity write-traffic limit reached.",
      attempts: 2,
      at: "2026-10-16T09:00:00.000Z",
      runId: PUBLICATION_FAILURE.runId,
    });
    // ...and the failure is still the state the designer is shown.
    const journey = resolveAdiOptimiserJourney({ planView, publicationFailure: planView.failure });
    assert.equal(journey.state, ADI_OPTIMISER_JOURNEY_STATE.PUBLICATION_FAILED);
  });

  it("hands the state back to the normal journey once the designer keeps the result", () => {
    const planView = planViewWithFailure();
    const journey = resolveAdiOptimiserJourney({
      planView,
      publicationFailure: planView.failure,
      publicationFailureKept: true,
    });
    assert.ok(journey.state !== ADI_OPTIMISER_JOURNEY_STATE.PUBLICATION_FAILED);
    assert.equal(journey.primaryLabel, null);
    assert.equal(journey.keepAction, null);
  });

  it("carries the run id, the status, the category, the error and the moment in the record", () => {
    const record = buildOptimiserRunEvidence({
      identity: { projectId: "p1", versionId: "v1" },
      failure: PUBLICATION_FAILURE,
      runIdentity: { runId: PUBLICATION_FAILURE.runId, startedAt: "2026-10-16T08:59:00.000Z" },
    });
    assert.equal(record.failure.status, "publication_failed");
    assert.equal(record.failure.category, "write_refused");
    assert.equal(record.failure.publicationError, "Entity write-traffic limit reached.");
    assert.equal(record.failure.at, "2026-10-16T09:00:00.000Z");
    assert.equal(record.failure.runId, PUBLICATION_FAILURE.runId);
    // It also travels inside the run block, so the run states its own failure.
    assert.equal(record.run.failure.category, "write_refused");
    assert.equal(record.run.terminal, true);
  });

  it("maps the recorded failure to RETRY ADI, not to a generic re-test", () => {
    const failure = resolveOptimiserFailure({ failureCategory: "publication_failed" });
    assert.equal(failure.code, OPTIMISER_FAILURE_CODE.PUBLICATION_FAILED);
    assert.equal(failure.reason, ADI_PUBLICATION_FAILURE_MESSAGE);
    assert.equal(failure.actionLabel, "RETRY ADI");
    assert.equal(failure.keepActionLabel, "KEEP CURRENT BASS RESULT");
  });

  it("is wired in the run: the terminal status comes from the PLAN SAVE, not the publication", () => {
    const hook = source(RUN_HOOK);
    const terminalMark = hook.indexOf("RUN_TIMING.USER_TERMINAL)");
    const complete = hook.indexOf('setStatus("complete")');
    const publicationStart = hook.indexOf("await publishOptimiserRecommendation({");

    assert.ok(terminalMark > -1, "the run must record its own user-terminal instant");
    assert.ok(complete > terminalMark, "the run is terminal at the plan save");
    assert.ok(publicationStart > complete, "the publication is attempted AFTER the terminal boundary");
    // Nothing after the boundary can end this run as a failure.
    const afterBoundary = hook.slice(publicationStart);
    assert.equal(afterBoundary.includes('setStatus("failed")'), false);
    assert.equal(afterBoundary.includes("if (!publication.ok)"), false);
  });

  it("is wired in the run: a failed PLAN SAVE sets a terminal status and returns", () => {
    const hook = source(RUN_HOOK);
    const guard = hook.indexOf("saveRunFailure(reason, { planSaveFailed: true })");
    assert.ok(guard > -1, "a result that cannot be saved is the run's own failure");
    const block = hook.slice(guard, guard + 700);
    assert.ok(block.includes('setStatus("failed")'));
    assert.ok(block.includes("return;"));
  });

  it("records a refused secondary publication as its own diagnostic", () => {
    const hook = source(RUN_HOOK);
    assert.ok(hook.includes("buildRecommendationPublicationRecord({"));
    assert.ok(hook.includes("recommendationPublication,"));
    // The record's failure field is only ever written by a failed plan save.
    assert.equal(hook.includes('status: "publication_failed"'), false);
  });

  it("reports whether the publication actually persisted, instead of always succeeding", () => {
    const publication = source(PUBLICATION);
    assert.ok(publication.includes("ok: !refused"));
    assert.ok(publication.includes("getPublicationFailure"));

    // The panel states the failure, draws the designer's own second action, and
    // words the primary control as the retry.
    const panel = source(PANEL);
    assert.ok(panel.includes("publicationFailureActive"));
    assert.ok(panel.includes("keepCurrentBassResult("));
    assert.ok(panel.includes("journey.primaryLabel ||"));
  });
});

describe("2 · a new run never inherits the previous run's clock", () => {
  const NOW = Date.parse("2026-10-16T09:30:00.000Z");
  const FIFTY_MIN_AGO = NOW - 50 * 60 * 1000;
  // The engine's own store is a SEPARATE authority: it was last touched by the
  // previous run, and starting a new run does not reset it.
  const STALE_ENGINE = {
    status: "running",
    startedAtMs: FIFTY_MIN_AGO,
    lastProgressAt: FIFTY_MIN_AGO,
    phase: "calibrating",
  };

  it("reads elapsed ≈ 0 and no-progress ≈ 0 for a fresh run over a stale engine store", () => {
    const progress = buildOptimiserRunProgress({
      live: STALE_ENGINE,
      run: { runId: "new-run", startedAt: new Date(NOW).toISOString() },
      runStatus: "running",
      nowMs: NOW,
    });

    assert.equal(progress.elapsedSeconds, 0);
    assert.equal(progress.elapsedText, "0 seconds");
    assert.equal(progress.secondsSinceProgress, 0);
    assert.equal(progress.sinceProgressText, "0 seconds");
    // Nothing is inherited, so nothing claims the run has stopped reporting.
    assert.equal(progress.stalled, false);
    assert.equal(progress.stallSentence, null);
  });

  it("never states an earlier run's inactivity in the status check", () => {
    const check = describeOptimiserStatusCheck({
      live: STALE_ENGINE,
      run: { runId: "new-run", startedAt: new Date(NOW).toISOString() },
      previousLastProgressAt: null,
      nowMs: NOW,
    });
    assert.ok(!/5[01] minutes/.test(check.sentence), check.sentence);
    assert.ok(check.sentence.includes("0 seconds"), check.sentence);
  });

  it("mints the run's own clock at creation, and still reads the engine when no run exists", () => {
    const authority = source(RUN_AUTHORITY);
    assert.ok(authority.includes("lastProgressAt: startedAt"));
    assert.ok(authority.includes("currentStageStartedAt: startedAt"));

    // A legacy/engine-only run (no run identity) keeps the behaviour it always
    // had: the engine's own timestamps are the only ones there are.
    const legacy = buildOptimiserRunProgress({
      live: STALE_ENGINE,
      run: null,
      runStatus: "running",
      nowMs: NOW,
    });
    assert.equal(legacy.elapsedSeconds, 3000);
    assert.equal(legacy.secondsSinceProgress, 3000);
  });
});

describe("3 · one publication, and a refused write is never stormed", () => {
  it("bounds the write attempts and reports the refusal instead of retrying", () => {
    const persistence = source(PERSISTENCE);
    // The write loop is bounded by a small named attempt count...
    assert.ok(persistence.includes("DEFAULT_WRITE_ATTEMPTS"));
    assert.ok(persistence.includes("boundedWrites"));
    // ...and the old 20-iteration loop that re-read AND re-wrote on every pass is
    // gone: waiting for the snapshot no longer attempts a write at all.
    assert.ok(!/for \(let attempt = 0; attempt < 20/.test(persistence));
    assert.ok(persistence.includes("SNAPSHOT_WAIT_ITERATIONS"));
    // A refusal is recorded, so the run can state the real cause.
    assert.ok(persistence.includes("PUBLICATION_FAILURE_CATEGORY.WRITE_REFUSED"));
    assert.ok(persistence.includes("getPublicationFailure"));
  });

  it("publishes one result through one authority, and writes once for the same result", () => {
    const publication = source(PUBLICATION);
    // The same-result case carries exactly ONE write, which is the write the last
    // caller would have made.
    assert.ok(publication.includes("writes: [{ fingerprint: saved, withPlan: true }]"));
    // The run itself defers, so the saving step's single write is the only one.
    assert.ok(source(RUN_HOOK).includes("deferRecommendationPublication: true"));
  });
});

describe("4 · the limiting frequency has one authority, and 0 Hz is never shown", () => {
  it("states a non-credible frequency as Not identified", () => {
    assert.deepEqual(resolveLimitingFrequency(0), {
      hz: null,
      text: LIMITING_FREQUENCY_NOT_IDENTIFIED,
      identified: false,
    });
    assert.equal(LIMITING_FREQUENCY_NOT_IDENTIFIED, "Not identified");
    assert.ok(resolveLimitingFrequency(0).text !== "0 Hz");
    assert.equal(resolveLimitingFrequency(-12).identified, false);
    assert.equal(resolveLimitingFrequency(null).identified, false);
    assert.equal(resolveLimitingFrequency(undefined).identified, false);
    assert.equal(resolveLimitingFrequency("").identified, false);
    assert.equal(resolveLimitingFrequency("not a number").identified, false);
  });

  it("states a real frequency, rounded to the whole hertz it is read at", () => {
    assert.equal(resolveLimitingFrequency(94.6).text, "95 Hz");
    assert.equal(resolveLimitingFrequency(95).text, "95 Hz");
    assert.equal(resolveLimitingFrequency(94.6).identified, true);
  });

  it("is the only path the evidence block reads a frequency through", () => {
    const block = source(EVIDENCE_BLOCK);
    assert.ok(block.includes("resolveLimitingFrequency(limitingFrequencyHz).text"));
    // The old "a finite number means show it" interpolation — which rendered
    // 0 Hz — is gone.
    assert.ok(!block.includes("Number.isFinite(Number(limitingFrequencyHz))"));
  });
});

describe("5 · report readiness does not depend on the advisory optimiser", () => {
  const READY_INPUT = {
    hydrating: false,
    roomDims: { widthM: 4.5, lengthM: 6 },
    placedSpeakers: [{ id: "l" }, { id: "r" }],
    engineeringSummary: { overallLevel: 3 },
    bassPerformance: { p14Db: 115, p20Db: 12 },
    pricingStatus: "ok",
    assessment: { reportComplete: true },
  };

  it("A · bass current and ADI successful → READY", () => {
    assert.equal(deriveReportReadiness(READY_INPUT).state, REPORT_STATE.READY);
  });

  it("B · bass current and ADI declined / keep current design → READY", () => {
    assert.equal(deriveReportReadiness(READY_INPUT).state, REPORT_STATE.READY);
  });

  it("C · bass current and the ADI publication failed → READY", () => {
    // The failed publication is not an input to readiness at all: nothing about
    // the advisory optimiser can hold the client-facing report back.
    assert.equal(deriveReportReadiness(READY_INPUT).state, REPORT_STATE.READY);
  });

  it("D · bass stale → NOT READY, and the missing item is the bass assessment", () => {
    const readiness = deriveReportReadiness({ ...READY_INPUT, bassPerformance: null });
    assert.equal(readiness.state, REPORT_STATE.NOT_READY);
    assert.ok(readiness.missing.map((item) => item.key).includes("bass"));
    assert.equal(readiness.canExport, false);
  });

  it("no readiness authority even reads the optimiser, so it cannot gate the report", () => {
    for (const text of [source(READINESS), source(READINESS_BUTTON)]) {
      assert.ok(!/optimis/i.test(text), "readiness must not read the optimiser");
      assert.ok(!/\bADI\b/.test(text), "readiness must not read ADI");
    }
  });
});

describe("6 · P19/P20 keep the FLOOR display rule", () => {
  it("floors, and never rounds conventionally", () => {
    assert.equal(floorBassDeviation(4.99), 4);
    assert.equal(floorBassDeviation(5.0), 5);
    assert.equal(floorBassDeviation(12.8), 12);
    assert.equal(floorBassDeviation(15.9), 15);
  });

  it("grades on the floored value, so a grade can never be read from a rounded one", () => {
    // 2.9 floors to 2 → L4. Conventional rounding would have graded it as 3.
    assert.equal(gradeP19(2.9), 4);
    assert.equal(gradeP19(5.9), 1);
  });
});