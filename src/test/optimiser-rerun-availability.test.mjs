// optimiser-rerun-availability.test.mjs
// ---------------------------------------------------------------------------
// The run control is always available, and there is only ever one of it.
//
// Product rule verified here:
//   • every journey state except a run in progress offers the run action
//   • the wording is "Bass Optimiser" in every state that offers it
//   • a completed run (plan available) still offers it — the re-run action is
//     never hidden after a result
//   • Apply and run remain different actions: a plan available state shows both
//     possibilities, but only one run control
//   • the card renders ONE run control, with a spinner while running
//
// Presentation only: no bass maths, no optimiser scoring and no RP22 grading.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  ADI_BASS_OPTIMISER_LABEL,
  ADI_OPTIMISER_ACTION,
  ADI_OPTIMISER_JOURNEY_STATE,
  resolveAdiOptimiserJourney,
} from "@/components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js";
import {
  OPTIMISER_PRESENTATION_ACTION,
  OPTIMISER_PRESENTATION_STATE,
  resolveOptimiserPresentationState,
} from "@/components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";

/** A saved plan whose lever-level evidence is complete and applicable. */
const COMPLETE_PLAN = {
  status: "current",
  individualEffectsEvaluated: true,
  levers: [{
    key: "placement",
    evaluated: true,
    canApply: true,
    effect: { p20DeltaDb: -2, p20VariationDb: 14, p20Level: 1 },
    changes: [{ instanceId: "s1", axis: "x", to: 1.2 }],
  }],
  baseline: { p20VariationDb: 16, p20Level: 1 },
  baselineParity: { status: "MATCHED" },
};

describe("the journey offers the run action in every state but a run", () => {
  it("offers it after a completed run", () => {
    const journey = resolveAdiOptimiserJourney({ planView: COMPLETE_PLAN });
    expect(journey.state).toBe(ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE);
    expect(journey.action).toBe(ADI_OPTIMISER_ACTION.RERUN);
    expect(journey.actionLabel).toBe(ADI_BASS_OPTIMISER_LABEL);
    expect(journey.canRun).toBe(true);
    expect(journey.showPlan).toBe(true);
  });

  it("offers the same wording before a run and after an incomplete one", () => {
    const states = [
      resolveAdiOptimiserJourney({ planView: null }),
      resolveAdiOptimiserJourney({ planView: { status: "stale" } }),
      resolveAdiOptimiserJourney({ planView: { status: "no_useful_improvement" } }),
      resolveAdiOptimiserJourney({ planView: { status: "failed" } }),
      resolveAdiOptimiserJourney({ planView: COMPLETE_PLAN }),
    ];
    states.forEach((journey) => {
      expect(journey.action).toBeTruthy();
      expect(journey.actionLabel).toBe(ADI_BASS_OPTIMISER_LABEL);
    });
  });

  it("keeps a blocked run stated with its reason, and no action", () => {
    const journey = resolveAdiOptimiserJourney({
      planView: COMPLETE_PLAN,
      blockReason: { code: "calculation_in_progress", message: "A bass calculation is already running." },
    });
    expect(journey.action).toBe(ADI_OPTIMISER_ACTION.RERUN);
    expect(journey.canRun).toBe(false);
  });
});

describe("the presentation state offers the run action after a result", () => {
  it("offers it beside a genuinely applicable plan", () => {
    const presentation = resolveOptimiserPresentationState({
      planView: COMPLETE_PLAN,
      runStatus: "idle",
    });
    expect(presentation.state).toBe(OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE);
    expect(presentation.showApply).toBe(true);
    expect(presentation.action).toBe(OPTIMISER_PRESENTATION_ACTION.RERUN);
    expect(presentation.actionLabel).toBe(ADI_BASS_OPTIMISER_LABEL);
  });

  it("never offers it while a run is in progress", () => {
    const running = resolveOptimiserPresentationState({
      planView: COMPLETE_PLAN,
      runStatus: "running",
    });
    expect(running.state).toBe(OPTIMISER_PRESENTATION_STATE.RUNNING);
    expect(running.action).toBeNull();
    expect(running.showApply).toBe(false);
  });

  it("offers it after a failed run too", () => {
    const failed = resolveOptimiserPresentationState({ planView: null, runStatus: "failed" });
    expect(failed.action).toBe(OPTIMISER_PRESENTATION_ACTION.RERUN);
  });
});

describe("the card renders one run control", () => {
  const card = fs.readFileSync(
    path.join(process.cwd(), "src/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx"),
    "utf8",
  );

  it("keeps the running control disabled with a spinner, wording unchanged", () => {
    expect(card).toMatch(/data-adi-optimiser-button="running"/);
    expect(card).toMatch(/animate-spin/);
    expect(card).toMatch(/\{ADI_BASS_OPTIMISER_LABEL\}/);
  });

  it("stands its own button down when the placement panel already offers it", () => {
    // Exactly one run control: the panel's, or the card's — never both.
    expect(card).toMatch(/showAction && !panelShowsRerun/);
    expect(card).toMatch(/data-adi-rerun-plan/);
  });

  it("keeps Apply and run as separate actions", () => {
    expect(card).toMatch(/onApply=\{panelShowsApply \? null : handleApplyRecommended\}/);
    expect(card).toMatch(/onClick=\{journey\.action === ADI_OPTIMISER_ACTION\.CALCULATE/);
  });
});