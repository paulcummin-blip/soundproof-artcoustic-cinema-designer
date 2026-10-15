// optimiser-retest-one-next-action.test.mjs
// ---------------------------------------------------------------------------
// RE-TEST NEEDED HAS ONE CLEAR NEXT ACTION.
//
// The re-test state says one thing: the saved result cannot be trusted and has to
// be checked again against the current design. This suite pins the presentation
// that follows from it — ONE control, worded as the re-test itself; no
// "OPTIMISE BASS" beside it; the previous candidate's own detail moved into
// Engineer details; the main panel explaining why the re-test is needed; and the
// normal result states returning once the re-test has run.
//
// PRESENTATION ONLY: no optimiser maths, no candidate search, no P19/P20
// definition, no baseline authority, no grouping rule and no physical-change rule
// is asserted or changed here.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  OPTIMISER_OUTCOME,
  OPTIMISER_OUTCOME_LABEL,
  OPTIMISER_PRESENTATION_ACTION,
  OPTIMISER_PRESENTATION_STATE,
  OPTIMISER_RETEST_LABEL,
  OPTIMISER_RETEST_PREVIOUS_CANDIDATE,
  resolveOptimiserPresentationState,
} from "../components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import {
  ADI_BASS_OPTIMISER_LABEL,
  ADI_OPTIMISER_JOURNEY_STATE,
} from "../components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js";
import {
  resolvePreviousCandidate,
  resolveRetestNeeded,
} from "../components/room/bass/optimiserPlan/resolveRetestPresentation.js";
import {
  OPTIMISER_RETEST_DETAIL,
  OPTIMISER_RETEST_MESSAGE,
} from "../components/room/bass/optimiserPlan/optimiserFailureReason.js";
import { OPTIMISER_PLAN_STATUS } from "../components/room/bass/optimiserPlan/optimiserPlanConstants.js";

const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const journey = read("src/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx");
const summaryPanel = read("src/components/room/bass/optimiserPlan/AdiPanelSummary.jsx");
const candidateDetails = read("src/components/room/bass/optimiserPlan/AdiPreviousCandidateDetails.jsx");
const retestAuthority = read("src/components/room/bass/optimiserPlan/resolveRetestPresentation.js");
const presentationAuthority = read("src/components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js");
const evidenceGroups = read("src/components/room/bass/optimiserPlan/AdiRecommendationEvidenceGroups.jsx");

/** Every way the re-test state is reached. */
const RETEST_CASES = [
  {
    name: "stale plan",
    planView: {
      status: OPTIMISER_PLAN_STATUS.STALE,
      staleReason: "The design has changed since this optimiser result was evaluated.",
    },
  },
  {
    name: "unreadable saved result",
    planView: { status: OPTIMISER_PLAN_STATUS.UNSUPPORTED, run: { rejectionReasons: [] } },
  },
  {
    name: "terminal run without a usable comparison",
    planView: {
      status: OPTIMISER_PLAN_STATUS.INCOMPLETE,
      terminalOutcome: "evaluation_incomplete",
      run: { rejectionReasons: [] },
    },
  },
  {
    name: "result never persisted",
    planView: null,
    extra: { planPersisted: false },
  },
  {
    name: "current plan without lever-level evidence",
    planView: {
      status: OPTIMISER_PLAN_STATUS.CURRENT,
      individualEffectsEvaluated: false,
      run: { rejectionReasons: [] },
    },
  },
];

describe("RE-TEST NEEDED HAS ONE CTA", () => {
  it.each(RETEST_CASES)("$name offers only the re-test, never OPTIMISE BASS", ({ planView, extra = {} }) => {
    const state = resolveOptimiserPresentationState({ planView, ...extra });

    expect(state.outcome).toBe(OPTIMISER_OUTCOME.RETEST_NEEDED);
    expect(state.statusLabel).toBe(OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.RETEST_NEEDED]);
    // ONE action, and it names the re-test itself.
    expect(state.action).toBe(OPTIMISER_PRESENTATION_ACTION.RETEST);
    expect(state.actionLabel).toBe(OPTIMISER_RETEST_LABEL);
    expect(state.actionLabel).not.toBe(ADI_BASS_OPTIMISER_LABEL);
    expect(state.showApply).toBe(false);
    // The main panel states the re-test: what it needs and why.
    expect(state.message).toBe(OPTIMISER_RETEST_MESSAGE);
    expect(state.nextAction).toBe(OPTIMISER_RETEST_DETAIL);
  });

  it("draws that one control as the re-test and stands every other control down", () => {
    // The state rule is part of the one-re-test rule, so a re-test can never be
    // drawn beside an "OPTIMISE BASS" run control.
    expect(journey).toMatch(
      /const runControlIsRetest = journey\.action === OPTIMISER_PRESENTATION_ACTION\.RETEST[\s\S]*?journey\.actionLabel === OPTIMISER_RETEST_LABEL[\s\S]*?optimiserRunOwnsRetry;/,
    );
    expect(journey).toMatch(
      /optimiserRunOwnsRetry && journey\.action !== ADI_OPTIMISER_ACTION\.CALCULATE\s*\n\s*\? OPTIMISER_RETEST_LABEL\s*\n\s*: journey\.actionLabel\}/,
    );
    // Both legacy re-test and fresh technical-failure retry states are owned by
    // the evidence-only run path, never calibration auto-apply.
    expect(journey).toMatch(/const optimiserRunOwnsRetry = retestNeeded[\s\S]*?OPTIMISER_OUTCOME\.UNABLE_TO_EVALUATE;/);
    // The calibration re-test, the placement re-run and the placement Apply/Undo
    // are the controls that start the same or an overlapping flow.
    expect(journey).toMatch(/onReoptimise=\{optimiserRunOwnsRetry \|\| isRunning \|\| retestOwnsPrimary/);
    expect(journey).toMatch(/onRerun=\{isRunning \|\| optimiserRunOwnsRetry \? null : onRunOptimisationPlan\}/);
    expect(journey).toMatch(/onApply=\{optimiserRunOwnsRetry \? null : handleApplyPlacement\}/);
    expect(journey).toMatch(/onUndo=\{optimiserRunOwnsRetry \? null : handleUndoPlacement\}/);
    // Nothing is applied from an unconfirmed candidate.
    expect(journey).toMatch(/onApply=\{optimiserRunOwnsRetry \|\| recommendationIgnored/);
    expect(journey).toMatch(/onUndo=\{optimiserRunOwnsRetry \|\| panelShowsUndo \? null : handleUndoRecommended\}/);
    expect(journey).toMatch(/designApplicable: !optimiserRunOwnsRetry/);
    // The placement panel cannot claim the re-run while the re-test owns it.
    expect(journey).toMatch(/panelShowsRerun = placement\?\.kind === "previous" && !optimiserRunOwnsRetry;/);
  });

  it("takes the re-test state from the outcome, or from the journey's own badge", () => {
    expect(resolveRetestNeeded({ outcome: OPTIMISER_OUTCOME.RETEST_NEEDED })).toBe(true);
    expect(resolveRetestNeeded({ outcome: OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND })).toBe(false);
    expect(resolveRetestNeeded({ outcome: OPTIMISER_OUTCOME.PHYSICAL_CHANGE })).toBe(false);
    expect(resolveRetestNeeded({ outcome: OPTIMISER_OUTCOME.NO_IMPROVEMENTS })).toBe(false);
    expect(resolveRetestNeeded({ outcome: OPTIMISER_OUTCOME.BASS_UPDATE_REQUIRED })).toBe(false);
    expect(resolveRetestNeeded({ journeyStateKey: ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE })).toBe(true);
    expect(resolveRetestNeeded({ journeyStateKey: ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED })).toBe(true);
    expect(resolveRetestNeeded({ journeyStateKey: ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE })).toBe(false);
    expect(resolveRetestNeeded({ journeyStateKey: ADI_OPTIMISER_JOURNEY_STATE.NO_USEFUL_IMPROVEMENT })).toBe(false);
  });

  it("keeps the bass calculation's own wording where that is the required action", () => {
    const bassUpdate = resolveOptimiserPresentationState({
      planView: null,
      runBlockReason: { code: "calculation_required" },
    });
    expect(bassUpdate.outcome).toBe(OPTIMISER_OUTCOME.BASS_UPDATE_REQUIRED);
    expect(bassUpdate.actionLabel).not.toBe(OPTIMISER_RETEST_LABEL);
    expect(resolveRetestNeeded({ outcome: bassUpdate.outcome })).toBe(false);
  });
});

describe("STALE CANDIDATE DETAILS MOVED TO ENGINEER DETAILS", () => {
  const detail = {
    adjustment: "Rear sub group +5.4 ms relative to front group",
    benefit: "Not applied because a primary seat would regress.",
    comparison: "P20 variation: ±15 dB → ±12 dB · L1",
  };

  it("resolves the old candidate only for a re-test state", () => {
    expect(resolvePreviousCandidate({ retestNeeded: true, headline: { kind: "rejected", ...detail } }))
      .toEqual({ ...detail, staleCopy: null, previousBest: null });
    expect(resolvePreviousCandidate({ retestNeeded: true, headline: { kind: "consider", ...detail } }))
      .toEqual({ ...detail, staleCopy: null, previousBest: null });
    // Not a re-test state: the headline keeps the main panel.
    expect(resolvePreviousCandidate({ retestNeeded: false, headline: { kind: "rejected", ...detail } })).toBeNull();
    // The design's own APPLIED calibration is not an old candidate.
    expect(resolvePreviousCandidate({ retestNeeded: true, headline: { kind: "applied", ...detail } })).toBeNull();
    expect(resolvePreviousCandidate({ retestNeeded: true, headline: { kind: "running" } })).toBeNull();
    // Nothing to move = nothing rendered.
    expect(resolvePreviousCandidate({ retestNeeded: true, headline: { kind: "state" } })).toBeNull();
  });

  it("carries the stale block and the previous best result with it", () => {
    const staleCopy = { MESSAGE: "Previous result found a possible improvement.", INSTRUCTION: "The design has changed." };
    const resolved = resolvePreviousCandidate({
      retestNeeded: true,
      headline: { kind: "state" },
      summary: { staleCopy, previousBest: "Previous best result: P20: ±15 dB → ±12 dB" },
    });
    expect(resolved.staleCopy).toBe(staleCopy);
    expect(resolved.previousBest).toBe("Previous best result: P20: ±15 dB → ±12 dB");
  });

  it("keeps the old candidate off the main panel and inside the disclosure", () => {
    expect(journey).toMatch(/adjustment=\{previousCandidate \? null : headline\.adjustment\}/);
    expect(journey).toMatch(/benefit=\{previousCandidate \? null : headline\.benefit\}/);
    expect(journey).toMatch(/comparison=\{previousCandidate \? null : headline\.comparison\}/);
    expect(journey).toMatch(/staleCopy=\{previousCandidate \? null : summary\.staleCopy\}/);
    expect(journey).toMatch(/previousBest=\{previousCandidate \? null : summary\.previousBest\}/);

    const detailsAt = journey.indexOf("data-adi-engineer-details");
    const candidateAt = journey.indexOf("<AdiPreviousCandidateDetails");
    expect(detailsAt).toBeGreaterThan(-1);
    expect(candidateAt).toBeGreaterThan(detailsAt);
    expect(candidateAt).toBeLessThan(journey.indexOf("</details>"));

    // The moved detail is read-only: no control of its own, and it renders
    // nothing at all when there is no candidate.
    expect(/<button|onClick|onApply/.test(candidateDetails)).toBe(false);
    expect(candidateDetails).toContain("if (!hasDetail) return null;");
  });
});

describe("MAIN PANEL EXPLAINS WHY RE-TEST IS NEEDED", () => {
  it("states the re-test sentence and its supporting copy, in the designer's words", () => {
    expect(OPTIMISER_RETEST_MESSAGE).toBe(
      "The previous optimiser result needs to be checked again against the current design.",
    );
    expect(OPTIMISER_RETEST_DETAIL).toBe(
      "The saved run does not contain enough evidence to confirm its recommendation.",
    );
  });

  it("states that pair for a stale result too, and keeps the stale reason in the details", () => {
    const staleReason = "The design has changed since this optimiser result was evaluated.";
    const state = resolveOptimiserPresentationState({
      planView: { status: OPTIMISER_PLAN_STATUS.STALE, staleReason },
    });
    expect(state.message).toBe(OPTIMISER_RETEST_MESSAGE);
    expect(state.nextAction).toBe(OPTIMISER_RETEST_DETAIL);
    // WHY this one has to be checked again is not lost: the resolution states it,
    // and the panel renders the explanation inside Engineer details.
    expect(state.explanation).toContain(staleReason);
    expect(journey).toMatch(/\{journey\.explanation && \(/);
  });

  it("states what the previous run found without offering it as a recommendation", () => {
    expect(OPTIMISER_RETEST_PREVIOUS_CANDIDATE).toBe(
      "A previous run found a possible improvement, but it must be re-tested before it can be recommended.",
    );
    expect(journey).toMatch(
      /previousCandidateNotice=\{previousCandidate \? OPTIMISER_RETEST_PREVIOUS_CANDIDATE : null\}/,
    );
    expect(summaryPanel).toContain("previousCandidateNotice");
    expect(summaryPanel).toContain("data-adi-previous-candidate-notice");
  });
});

describe("AFTER RE-TEST NORMAL RESULT STATES RETURN", () => {
  const applicablePlan = {
    status: OPTIMISER_PLAN_STATUS.CURRENT,
    individualEffectsEvaluated: true,
    baseline: { p20VariationDb: 12 },
    run: { rejectionReasons: [] },
    levers: [{
      key: "delay",
      evaluated: true,
      canApply: true,
      effect: { p20DeltaDb: -3 },
      changes: [{ lever: "delay", field: "delayMs", to: 4.5 }],
    }],
  };

  it("offers the improvement and its Apply again, with the run control's own wording", () => {
    const state = resolveOptimiserPresentationState({ planView: applicablePlan });
    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE);
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND);
    expect(state.showApply).toBe(true);
    expect(resolveRetestNeeded({ outcome: state.outcome })).toBe(false);
    expect(state.actionLabel).toBe(ADI_BASS_OPTIMISER_LABEL);
    // Nothing is moved into the details for a live improvement.
    expect(resolvePreviousCandidate({ retestNeeded: false, headline: { kind: "consider" } })).toBeNull();
  });

  it("states a completed no-improvement result with no re-test badge", () => {
    const state = resolveOptimiserPresentationState({
      planView: { status: OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT, run: { rejectionReasons: [] } },
    });
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.NO_IMPROVEMENTS);
    expect(state.statusLabel).toBe(OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.NO_IMPROVEMENTS]);
    expect(resolveRetestNeeded({ outcome: state.outcome })).toBe(false);
    expect(state.actionLabel).toBe(ADI_BASS_OPTIMISER_LABEL);
  });
});

describe("NO OPTIMISER LOGIC CHANGE", () => {
  it("writes nothing: no design, no calibration, no saved result", () => {
    const writePattern = /commitInstances|commitSeating|bulkUpdate|applyCalibrationTuning|setOptimiserPlanAuthority|manageProjectAnalysisCache|localStorage\.setItem/;
    [journey, summaryPanel, candidateDetails, evidenceGroups, retestAuthority, presentationAuthority]
      .forEach((source) => expect(writePattern.test(source)).toBe(false));
  });

  it("keeps the one control on the same handler it always used", () => {
    expect(journey).toMatch(
      /onClick=\{journey\.action === ADI_OPTIMISER_ACTION\.CALCULATE\s*\n\s*\? onCalculateBassPerformance\s*\n\s*: onRunOptimisationPlan\}/,
    );
  });
});