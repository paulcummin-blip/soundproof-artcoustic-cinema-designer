// optimiser-run-supersedes-previous.test.mjs
// ---------------------------------------------------------------------------
// A NEW RUN SUPERSEDES THE PREVIOUS RUN.
//
// The rule this suite pins:
//
//   THE LATEST RUN STARTED FOR THE DESIGN VERSION OWNS CURRENT-STATE
//   PRESENTATION. Every earlier run is history — kept, never rewritten — and may
//   not determine the badge, the headline, the next action, the current
//   recommendation or the current failure state.
//
// The nonsense this exists to prevent: the designer presses RE-TEST BASS
// OPTIMISATION, a new run starts and completes, and the panel still says "the
// previous run did not retain enough evidence".
//
// PRESENTATION AND LIFECYCLE ONLY: no optimiser maths, no candidate ranking, no
// P19/P20 definition, no subwoofer grouping, no materiality rule and no
// physical-change policy is asserted or changed here.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  beginOptimiserRun,
  getLatestOptimiserRun,
  planIsSupersededByRun,
  resetOptimiserRunAuthority,
  resolvePresentationPlan,
} from "../components/room/bass/optimiserPlan/optimiserRunAuthority.js";
import {
  getOptimiserPlanAuthority,
  resetOptimiserPlanAuthority,
  setOptimiserPlanAuthority,
} from "../components/room/bass/optimiserPlan/optimiserPlanStore.js";
import { resolveOptimiserPlanStatus } from "../components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js";
import {
  OPTIMISER_OUTCOME,
  OPTIMISER_OUTCOME_LABEL,
  OPTIMISER_PRESENTATION_COPY,
  OPTIMISER_PRESENTATION_LABEL,
  OPTIMISER_PRESENTATION_STATE,
  OPTIMISER_RETEST_LABEL,
  resolveOptimiserPresentationState,
} from "../components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import {
  ADI_OPTIMISER_JOURNEY_STATE,
  resolveAdiOptimiserJourney,
} from "../components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js";
import { resolveAdiPanelHeadline } from "../components/room/bass/optimiserPlan/adiPanelHeadline.js";
import { buildAdiDesignerSummary } from "../components/room/bass/optimiserPlan/adiDesignerSummary.js";
import {
  OPTIMISER_PLAN_STATUS,
  OPTIMISER_PLAN_VERSION,
} from "../components/room/bass/optimiserPlan/optimiserPlanConstants.js";

const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const runAuthority = read("src/components/room/bass/optimiserPlan/optimiserRunAuthority.js");
const viewHook = read("src/components/room/bass/optimiserPlan/useOptimiserPlanView.js");
const runStart = read("src/components/room/bass/optimiseWorkflow/useRunOptimisationPlan.js");
const journey = read("src/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx");

const PROJECT = "project-1";
const VERSION = "version-1";
const DESIGN = "design-fp";

const TOLD = "2026-10-15T10:00:00.000Z"; // the old run saved its result

/**
 * A save time for the newest run's OWN result: after that run started, so the
 * record it wrote is its own result and not the previous run's.
 */
const afterRun = (run) => new Date(Date.parse(run.startedAt) + 60000).toISOString();

/** The OLD run: it retained no usable comparison, so it asks for a re-test. */
const oldIncompleteRun = {
  planVersion: OPTIMISER_PLAN_VERSION,
  savedAt: TOLD,
  recordKind: "run_evidence",
  terminalOutcome: "evaluation_incomplete",
  designFingerprint: DESIGN,
  resultFingerprint: "result-old",
  run: { rejectionReasons: [], families: [] },
};

/** The OLD run saved under an evidence generation that cannot be read. */
const oldUnsupportedRun = {
  planVersion: OPTIMISER_PLAN_VERSION - 1,
  savedAt: TOLD,
  recordKind: "plan",
  designFingerprint: DESIGN,
  resultFingerprint: "result-old",
  run: {},
};

/** The NEW run: a completed search that found nothing worth applying. */
const noImprovementRun = (savedAt) => ({
  planVersion: OPTIMISER_PLAN_VERSION,
  savedAt,
  recordKind: "run_evidence",
  terminalOutcome: "no_useful_improvement",
  designFingerprint: DESIGN,
  resultFingerprint: "result-new",
  run: { rejectionReasons: [] },
});

const storedPlan = () => getOptimiserPlanAuthority(PROJECT, VERSION);
const view = (plan) => resolveOptimiserPlanStatus({ plan, currentDesignFingerprint: DESIGN });

/** The panel state the panel would resolve from the newest run's own record. */
const stateForRun = (run, runStatus = "complete") => {
  const presentation = resolvePresentationPlan({ plan: storedPlan(), run: run || getLatestOptimiserRun(PROJECT, VERSION) });
  return resolveOptimiserPresentationState({ planView: view(presentation.plan), runStatus });
};

beforeEach(() => {
  resetOptimiserPlanAuthority(PROJECT, VERSION);
  resetOptimiserRunAuthority(PROJECT, VERSION);
});

describe("OLD RUN RE-TEST NEEDED", () => {
  it("states the re-test for an incomplete saved result while nothing newer has run", () => {
    setOptimiserPlanAuthority(PROJECT, VERSION, oldIncompleteRun);
    const presentation = resolvePresentationPlan({ plan: storedPlan(), run: null });

    expect(presentation.superseded).toBe(false);
    const state = resolveOptimiserPresentationState({ planView: view(presentation.plan) });
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.RETEST_NEEDED);
    expect(state.statusLabel).toBe("Re-test Needed");
    expect(state.actionLabel).toBe(OPTIMISER_RETEST_LABEL);
  });

  it("states the re-test for an unreadable saved result too", () => {
    setOptimiserPlanAuthority(PROJECT, VERSION, oldUnsupportedRun);
    const state = resolveOptimiserPresentationState({ planView: view(oldUnsupportedRun) });
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.RETEST_NEEDED);
  });
});

describe("STARTING A NEW RUN CLEARS THE OLD RE-TEST STATE", () => {
  it("stops describing the old result the moment the run starts", () => {
    setOptimiserPlanAuthority(PROJECT, VERSION, oldIncompleteRun);
    expect(resolveOptimiserPresentationState({ planView: view(storedPlan()) }).outcome)
      .toBe(OPTIMISER_OUTCOME.RETEST_NEEDED);

    // The designer presses the panel's one run control (OPTIMISE BASS, or
    // RE-TEST BASS OPTIMISATION in a re-test state).
    const run = beginOptimiserRun(PROJECT, VERSION);
    expect(run.runId).toMatch(/^optimiser-run-/);
    expect(run.startedAt).toBeTruthy();

    const presentation = resolvePresentationPlan({ plan: storedPlan(), run });
    expect(presentation.superseded).toBe(true);
    expect(presentation.plan).toBeNull();
    expect(presentation.supersededByRunId).toBe(run.runId);
    expect(presentation.supersededPlanSavedAt).toBe(TOLD);

    const during = resolveOptimiserPresentationState({ planView: view(presentation.plan), runStatus: "running" });
    expect(during.state).toBe(OPTIMISER_PRESENTATION_STATE.RUNNING);
    expect(during.statusLabel).toBe(OPTIMISER_PRESENTATION_LABEL[OPTIMISER_PRESENTATION_STATE.RUNNING]);
    // No outcome, no old recommendation, no old re-test, nothing to apply.
    expect(during.outcome).toBeNull();
    expect(during.outcomeLabel).toBeNull();
    expect(during.showApply).toBe(false);
    expect(during.action).toBeNull();
    expect(during.evidence).toBeNull();
  });

  it("supersedes an unreadable old result as well", () => {
    setOptimiserPlanAuthority(PROJECT, VERSION, oldUnsupportedRun);
    const run = beginOptimiserRun(PROJECT, VERSION);
    expect(planIsSupersededByRun(oldUnsupportedRun, run)).toBe(true);
    expect(resolvePresentationPlan({ plan: storedPlan(), run }).plan).toBeNull();
  });
});

describe("RUNNING STATE DOES NOT SHOW OLD RUN COPY", () => {
  it("states the run in progress only", () => {
    const state = resolveOptimiserPresentationState({ planView: view(null), runStatus: "running" });

    expect(OPTIMISER_PRESENTATION_COPY.RUNNING).toBe("ADI is evaluating the current design.");
    expect(state.message).toBe("ADI is evaluating the current design.");
    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.RUNNING);
    // No previous-run warning, no old candidate, no old P20 improvement.
    expect(state.message).not.toMatch(/previous run|did not retain|not retain enough/i);
    expect(state.explanation).toBeNull();
    expect(state.nextAction).toBeNull();
    expect(state.evidence).toBeNull();
    expect(state.failureCode).toBeNull();
  });

  it("cannot resolve an old journey state or an old headline beside it", () => {
    const demoted = view(null);

    const journeyState = resolveAdiOptimiserJourney({ planView: demoted });
    expect(journeyState.state).toBe(ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED);
    expect(journeyState.state).not.toBe(ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE);
    expect(journeyState.state).not.toBe(ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED);
    expect(journeyState.state).not.toBe(ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE);

    // The headline states no adjustment, benefit or comparison while running,
    // whatever the earlier run found.
    const headline = resolveAdiPanelHeadline({
      isRunning: true,
      recommendation: "Rear sub group +5.4 ms relative to front group",
      comparison: "P20 variation: ±15 dB → ±12 dB · L1",
    });
    expect(headline.kind).toBe("running");
    expect(headline.adjustment).toBeNull();
    expect(headline.benefit).toBeNull();
    expect(headline.comparison).toBeNull();

    // And the panel's summary keeps none of the earlier run's offers.
    const summary = buildAdiDesignerSummary({ planView: demoted });
    expect(summary.placementRecommendation).toBeNull();
    expect(summary.recommendation).toBeNull();
    expect(summary.actions.canApply).toBe(false);
    expect(summary.staleCopy).toBeFalsy();
  });
});

describe("ONE RUNNING CONTROL ONLY", () => {
  it("draws the progress control and no run or re-test control while running", () => {
    // The panel's own run control is not drawn while a run is in flight.
    // No run control at all while a run is in flight — the decision gates stand
    // beside the running check, and the quiet deliberate re-run stands down too.
    expect(journey).toMatch(/const showAction = !!journey\.action && journey\.canRun && !isRunning\s*\n\s*&& !tradeOffActive && !tradeOffSettled\s*\n\s*&& !improvementOwnsPanel;/);
    expect(journey).toMatch(/const showRerunAgain = rerunAgain\.offered && !isRunning/);
    // The placement panel's re-run and the calibration control stand down.
    expect(journey).toMatch(/onRerun=\{isRunning \|\| optimiserRunOwnsRetry \? null : onRunOptimisationPlan\}/);
    expect(journey).toMatch(/onReoptimise=\{optimiserRunOwnsRetry \|\| isRunning \|\| retestOwnsPrimary/);

    // ONE control is rendered in that state: the disabled progress control.
    const runningBranch = journey.slice(
      journey.indexOf("{isRunning && ("),
      journey.indexOf("{showAction && !panelShowsRerun && ("),
    );
    expect(runningBranch).toContain('data-adi-optimiser-button="running"');
    expect(runningBranch).toContain('aria-busy="true"');
    expect(runningBranch).not.toContain('data-adi-optimiser-button="idle"');
    // The idle run control is drawn only outside the running state.
    expect(journey).toMatch(/\{showAction && !panelShowsRerun && \(/);
    expect(journey).toMatch(/\{isRunning && \(/);
  });
});

describe("NEW COMPLETED RUN BECOMES PRESENTATION AUTHORITY", () => {
  it("presents the result the new run saved, not the old record", () => {
    setOptimiserPlanAuthority(PROJECT, VERSION, oldIncompleteRun);
    const run = beginOptimiserRun(PROJECT, VERSION);

    // The new run finished and saved its own record.
    const newRecord = noImprovementRun(afterRun(run));
    setOptimiserPlanAuthority(PROJECT, VERSION, newRecord);

    const presentation = resolvePresentationPlan({ plan: storedPlan(), run });
    expect(presentation.superseded).toBe(false);
    expect(presentation.plan).toBe(newRecord);

    const state = stateForRun(run);
    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT);
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.NO_IMPROVEMENTS);
  });

  it("keeps a result saved in the same instant the run started", () => {
    expect(planIsSupersededByRun({ savedAt: "2026-10-15T11:00:00.000Z" }, { startedAt: "2026-10-15T11:00:00.000Z" }))
      .toBe(false);
    expect(planIsSupersededByRun({ savedAt: "2026-10-15T10:59:59.999Z" }, { startedAt: "2026-10-15T11:00:00.000Z" }))
      .toBe(true);
    // A record that cannot state when it was saved cannot claim to be this run's.
    expect(planIsSupersededByRun({}, { startedAt: "2026-10-15T11:00:00.000Z" })).toBe(true);
  });
});

describe("OLD RUN CANNOT FORCE RE-TEST AFTER NEW SUCCESSFUL RUN", () => {
  it("states NO IMPROVEMENT FOUND, never the old run's re-test", () => {
    setOptimiserPlanAuthority(PROJECT, VERSION, oldIncompleteRun);
    const run = beginOptimiserRun(PROJECT, VERSION);
    setOptimiserPlanAuthority(PROJECT, VERSION, noImprovementRun(afterRun(run)));

    const state = stateForRun(run);
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.NO_IMPROVEMENTS);
    expect(state.statusLabel).toBe("No Improvement Found");
    expect(state.outcome).not.toBe(OPTIMISER_OUTCOME.RETEST_NEEDED);
    expect(state.statusLabel).not.toBe(OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.RETEST_NEEDED]);
    expect(state.actionLabel).not.toBe(OPTIMISER_RETEST_LABEL);
    expect(state.failureCode).toBeNull();
  });

  it("cannot loop: the newest run's own outcome always wins", () => {
    // An incomplete result is superseded by the run that follows it...
    setOptimiserPlanAuthority(PROJECT, VERSION, oldIncompleteRun);
    const first = beginOptimiserRun(PROJECT, VERSION);
    expect(resolvePresentationPlan({ plan: storedPlan(), run: first }).plan).toBeNull();

    // ...and that run's OWN result is superseded by the next run in turn, so no
    // new run is ever judged through the run before it. Checked on the rule
    // itself so the sequence does not depend on the wall clock.
    const firstResult = noImprovementRun(afterRun(first));
    const second = {
      runId: "optimiser-run-2",
      startedAt: new Date(Date.parse(firstResult.savedAt) + 1000).toISOString(),
    };
    expect(planIsSupersededByRun(firstResult, second)).toBe(true);
    expect(resolvePresentationPlan({ plan: firstResult, run: second }).plan).toBeNull();

    // The second run's own result becomes the authority, and states its own
    // outcome — nothing of the run before it.
    const secondResult = {
      ...noImprovementRun(new Date(Date.parse(second.startedAt) + 1000).toISOString()),
      resultFingerprint: "result-3",
    };
    expect(resolvePresentationPlan({ plan: secondResult, run: second }).plan).toBe(secondResult);
    expect(resolveOptimiserPresentationState({ planView: view(secondResult) }).outcome)
      .toBe(OPTIMISER_OUTCOME.NO_IMPROVEMENTS);
  });
});

describe("NEW RESULT OUTCOMES THE NEWEST RUN PRODUCES", () => {
  it("shows IMPROVEMENT FOUND for the newest run's confirmed adjustment", () => {
    const run = beginOptimiserRun(PROJECT, VERSION);
    const improvedRecord = { ...noImprovementRun(afterRun(run)), terminalOutcome: null, individualEffectsEvaluated: true, baseline: { p20VariationDb: 12 } };
    setOptimiserPlanAuthority(PROJECT, VERSION, improvedRecord);

    const presentation = resolvePresentationPlan({ plan: storedPlan(), run });
    expect(presentation.superseded).toBe(false);
    // The lever-level evidence the newest run kept, read through the same status
    // authority the panel uses.
    const state = resolveOptimiserPresentationState({
      planView: {
        ...view(null),
        status: OPTIMISER_PLAN_STATUS.CURRENT,
        individualEffectsEvaluated: true,
        baseline: { p20VariationDb: 12 },
        levers: [{
          key: "delay",
          canApply: true,
          evaluated: true,
          effect: { p20DeltaDb: -3 },
          changes: [{ lever: "delay", field: "delayMs", to: 4.5 }],
        }],
      },
      runStatus: "complete",
    });
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND);
    expect(state.outcomeLabel).toBe("Improvement Found");
    expect(state.showApply).toBe(true);
  });

  it("shows PHYSICAL CHANGE RECOMMENDED for the newest run's physical move", () => {
    const run = beginOptimiserRun(PROJECT, VERSION);
    setOptimiserPlanAuthority(PROJECT, VERSION, { ...noImprovementRun(afterRun(run)), terminalOutcome: null });

    const presentation = resolvePresentationPlan({ plan: storedPlan(), run });
    expect(presentation.superseded).toBe(false);

    const state = resolveOptimiserPresentationState({
      planView: {
        ...view(null),
        status: OPTIMISER_PLAN_STATUS.CURRENT,
        levers: [{
          key: "placement",
          canApply: true,
          evaluated: true,
          effect: { summary: "Seat-to-seat bass consistency improves" },
          changes: [{ sourceId: "sub-front", from: "0.30 m", to: "0.45 m" }],
        }],
      },
      runStatus: "complete",
    });
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.PHYSICAL_CHANGE);
    expect(state.outcomeLabel).toBe(OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.PHYSICAL_CHANGE]);
    expect(state.message).toMatch(/requires a physical change/);
  });
});

describe("NEW FAILURE USES NEW RUN REASON ONLY", () => {
  it("states the newest run's own reason, and nothing of the old run", () => {
    const run = beginOptimiserRun(PROJECT, VERSION);
    expect(resolvePresentationPlan({ plan: storedPlan(), run }).plan).toBeNull();

    const state = resolveOptimiserPresentationState({
      planView: view(null),
      runStatus: "failed",
      runError: "Seat response data is missing for listening position 3.",
    });

    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.FAILED);
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.UNABLE_TO_EVALUATE);
    expect(state.statusLabel).toBe("Unable To Evaluate");
    // The NEW run's real reason, mapped to the designer's words.
    expect(state.message).toBe("Required seat-response data is missing.");
    expect(state.message).not.toMatch(/previous run|did not retain/i);
    expect(state.statusLabel).not.toBe("Re-test Needed");
    // The engine's own words stay available for Engineer details.
    expect(state.runError).toBe("Seat response data is missing for listening position 3.");
    expect(state.actionLabel).toBe(OPTIMISER_RETEST_LABEL);
  });

  it("maps the newest run's own error words, whatever they are", () => {
    beginOptimiserRun(PROJECT, VERSION);
    const subwooferFailure = resolveOptimiserPresentationState({
      planView: view(null),
      runStatus: "failed",
      runError: "The subwoofer configuration could not be read.",
    });
    expect(subwooferFailure.message).toBe("The current subwoofer configuration could not be evaluated.");
  });

  it("still names the bass calculation as the action when that is what the new run needs", () => {
    beginOptimiserRun(PROJECT, VERSION);
    const blocked = resolveOptimiserPresentationState({
      planView: view(null),
      runStatus: "failed",
      runError: "Seat response data is missing for listening position 3.",
      runBlockReason: { code: "calculation_required" },
    });
    expect(blocked.outcome).toBe(OPTIMISER_OUTCOME.BASS_UPDATE_REQUIRED);
    expect(blocked.actionLabel).toBe("Recalculate Bass Performance");
  });
});

describe("RUN HISTORY PRESERVED", () => {
  it("leaves the earlier record exactly as it was saved", () => {
    setOptimiserPlanAuthority(PROJECT, VERSION, oldIncompleteRun);
    const savedBefore = storedPlan();

    const run = beginOptimiserRun(PROJECT, VERSION);
    const savedAfter = storedPlan();

    // Same record, same fields, still stored: superseding is presentation only.
    expect(savedAfter).toBe(savedBefore);
    expect(savedAfter.savedAt).toBe(TOLD);
    expect(savedAfter.terminalOutcome).toBe("evaluation_incomplete");
    expect(savedAfter.recordKind).toBe("run_evidence");

    // What the new run superseded is recorded, for history and audit.
    expect(run.superseded).toEqual({
      recordKind: "run_evidence",
      terminalOutcome: "evaluation_incomplete",
      candidateId: null,
      savedAt: TOLD,
    });
    const latest = getLatestOptimiserRun(PROJECT, VERSION);
    expect(latest.runId).toBe(run.runId);
    expect(Array.isArray(latest.history)).toBe(true);
  });

  it("records each superseded run in order, oldest first", () => {
    setOptimiserPlanAuthority(PROJECT, VERSION, oldIncompleteRun);
    const first = beginOptimiserRun(PROJECT, VERSION);
    const firstResult = noImprovementRun(afterRun(first));
    setOptimiserPlanAuthority(PROJECT, VERSION, firstResult);
    const second = beginOptimiserRun(PROJECT, VERSION);

    expect(second.runId).not.toBe(first.runId);
    const { history } = getLatestOptimiserRun(PROJECT, VERSION);
    expect(history.length).toBe(1);
    expect(history[0].runId).toBe(first.runId);
    expect(history[0].startedAt).toBe(first.startedAt);
    expect(history[0].terminalOutcome).toBe("no_useful_improvement");
    expect(history[0].savedAt).toBe(firstResult.savedAt);
  });
});

describe("NO OPTIMISER MATHS CHANGE", () => {
  it("writes nothing and reaches no engineering module", () => {
    expect(/setOptimiserPlanAuthority|commitInstances|commitSeating|bulkUpdate|applyCalibrationTuning|localStorage/.test(runAuthority))
      .toBe(false);
    // It reads the saved record and nothing else: no engine, no ranking, no
    // grouping, no materiality verdict.
    expect(runAuthority).not.toMatch(/optimiseWorkflowOrchestrator|improveBassV2Engine|groupedDelaySearch|groupedGainSearch|groupedPhaseSearch|materialityGate/);
    expect(runAuthority).toMatch(/from "\.\/optimiserPlanStore\.js"/);
  });

  it("records the run before any work starts", () => {
    const startAt = runStart.indexOf("beginOptimiserRun(projectId, versionId)");
    expect(startAt).toBeGreaterThan(-1);
    expect(startAt).toBeLessThan(runStart.indexOf("await runOptimisation({"));
  });

  it("is the one place the panel learns which run it describes", () => {
    expect(viewHook).toMatch(/resolvePresentationPlan\(\{ plan: storedPlan, run: latestRun \}\)/);
    expect(viewHook).toMatch(/useLatestOptimiserRun\(projectId, versionId\)/);
  });
});