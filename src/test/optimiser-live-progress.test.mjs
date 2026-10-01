// optimiser-live-progress.test.mjs
// ---------------------------------------------------------------------------
// The running-state contract of the Bass Optimisation card.
//
// Product rule: ADI either tests the lever, is testing it, or clearly says the
// capability is not yet supported. While a run is in progress every family is
// Waiting, Testing, Tested or Not yet supported — never "Not tested", and never
// the previous run's rows.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ADI_LIVE_ROW_KEYS,
  ADI_LIVE_STATUS,
  PHASE_NOT_SUPPORTED_OUTCOME,
  SUB_OPTION_NOT_SUPPORTED_OUTCOME,
} from "../src/components/room/bass/optimiserPlan/optimiserLiveProgress.js";
import { buildLiveFamilyRows } from "../src/components/room/bass/optimiserPlan/optimiserLiveProgress.js";
import { buildAdiDesignerSummary } from "../src/components/room/bass/optimiserPlan/adiDesignerSummary.js";
import { OPTIMISER_PRESENTATION_STATE } from "../src/components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import { ADI_ROW_STATUS } from "../src/components/room/bass/optimiserPlan/optimiserFamilyLedgerRows.js";

const REQUIRED_ORDER = [
  "Delay", "Gain", "Phase", "Polarity", "Placement",
  "Layout", "Sub option", "Seating", "Low-frequency absorption",
];

const labels = (rows) => rows.map((row) => row.label);
const statusOf = (rows, label) => rows.find((row) => row.label === label)?.status;
const outcomeOf = (rows, label) => rows.find((row) => row.label === label)?.outcome;

describe("running state — the fixed nine rows", () => {
  it("lists every required family in the fixed order", () => {
    const rows = buildLiveFamilyRows({ status: "running", phase: "reviewing" });
    expect(labels(rows)).toEqual(REQUIRED_ORDER);
  });

  it("exports the same nine keys, in order", () => {
    expect(ADI_LIVE_ROW_KEYS).toEqual([
      "delay", "gain", "phase", "polarity", "placement",
      "layout", "subwoofer_option", "seating", "absorption",
    ]);
  });

  it("shows waiting before any search has been reached", () => {
    const rows = buildLiveFamilyRows({ status: "running", phase: "reviewing" });
    expect(statusOf(rows, "Delay")).toBe(ADI_LIVE_STATUS.WAITING);
    expect(statusOf(rows, "Gain")).toBe(ADI_LIVE_STATUS.WAITING);
    expect(statusOf(rows, "Placement")).toBe(ADI_LIVE_STATUS.WAITING);
    expect(statusOf(rows, "Seating")).toBe(ADI_LIVE_STATUS.WAITING);
    expect(statusOf(rows, "Low-frequency absorption")).toBe(ADI_LIVE_STATUS.WAITING);
  });

  it("marks the search that is running now as testing", () => {
    const rows = buildLiveFamilyRows({
      status: "running",
      phase: "calibrating",
      phaseLabel: "Testing grouped gain adjustments",
    });
    expect(statusOf(rows, "Gain")).toBe(ADI_LIVE_STATUS.TESTING);
    expect(outcomeOf(rows, "Gain")).toBe("Testing grouped gain adjustments");
    expect(statusOf(rows, "Placement")).toBe(ADI_LIVE_STATUS.WAITING);
  });

  it("tests the levers in the least-intrusive order: delay before gain", () => {
    const delay = buildLiveFamilyRows({
      status: "running", phase: "calibrating", phaseLabel: "Testing grouped delay adjustments",
    });
    expect(statusOf(delay, "Delay")).toBe(ADI_LIVE_STATUS.TESTING);
    expect(statusOf(delay, "Gain")).toBe(ADI_LIVE_STATUS.WAITING);

    const gain = buildLiveFamilyRows({
      status: "running", phase: "calibrating", phaseLabel: "Testing grouped gain adjustments",
      stageVerdicts: { delays: "no_improvement" },
    });
    expect(statusOf(gain, "Delay")).toBe(ADI_LIVE_STATUS.TESTED);
    expect(statusOf(gain, "Gain")).toBe(ADI_LIVE_STATUS.TESTING);
  });

  it("marks finished searches as tested and later ones as waiting", () => {
    const rows = buildLiveFamilyRows({
      status: "running",
      phase: "testing_positions",
      phaseLabel: "Testing recommended positions (2/6)",
      stageVerdicts: { phase_polarity: "no_improvement", delays: "no_improvement", gain: "no_improvement" },
    });
    expect(statusOf(rows, "Delay")).toBe(ADI_LIVE_STATUS.TESTED);
    expect(statusOf(rows, "Gain")).toBe(ADI_LIVE_STATUS.TESTED);
    expect(statusOf(rows, "Polarity")).toBe(ADI_LIVE_STATUS.TESTED);
    expect(statusOf(rows, "Placement")).toBe(ADI_LIVE_STATUS.TESTING);
    expect(statusOf(rows, "Layout")).toBe(ADI_LIVE_STATUS.TESTING);
    expect(statusOf(rows, "Seating")).toBe(ADI_LIVE_STATUS.WAITING);
  });

  it("shows the seating search working when the engine reaches it", () => {
    const rows = buildLiveFamilyRows({
      status: "running",
      phase: "finalising",
      phaseLabel: "Testing seating position changes",
      stageVerdicts: { sub_positions: "no_improvement" },
    });
    expect(statusOf(rows, "Placement")).toBe(ADI_LIVE_STATUS.TESTED);
    expect(statusOf(rows, "Seating")).toBe(ADI_LIVE_STATUS.TESTING);
  });

  it("states the two unsupported capabilities plainly, at every stage", () => {
    for (const phase of ["reviewing", "calibrating", "testing_positions", "finalising"]) {
      const rows = buildLiveFamilyRows({ status: "running", phase });
      expect(statusOf(rows, "Phase")).toBe(ADI_LIVE_STATUS.NOT_YET_SUPPORTED);
      expect(outcomeOf(rows, "Phase")).toBe(PHASE_NOT_SUPPORTED_OUTCOME);
      expect(statusOf(rows, "Sub option")).toBe(ADI_LIVE_STATUS.NOT_YET_SUPPORTED_IN_RUN);
      expect(outcomeOf(rows, "Sub option")).toBe(SUB_OPTION_NOT_SUPPORTED_OUTCOME);
    }
  });

  it("never shows a vague state or an Apply action while running", () => {
    const rows = buildLiveFamilyRows({
      status: "running", phase: "calibrating", phaseLabel: "Testing grouped phase settings",
    });
    for (const row of rows) {
      expect(row.status).not.toMatch(/Not tested|Not evaluated|Not available/);
      expect(row.action).toBeNull();
    }
  });

  it("drives the card's rows from live progress, not the previous run", () => {
    const summary = buildAdiDesignerSummary({
      planView: { status: "current", levers: [], baseline: null, run: null },
      presentation: { state: OPTIMISER_PRESENTATION_STATE.RUNNING, statusLabel: "Optimisation running" },
      liveProgress: {
        running: true,
        status: "running",
        phase: "calibrating",
        phaseLabel: "Testing grouped delay adjustments",
      },
      instances: [],
    });
    expect(labels(summary.rows)).toEqual(REQUIRED_ORDER);
    expect(statusOf(summary.rows, "Delay")).toBe(ADI_LIVE_STATUS.TESTING);
    expect(summary.actions.canApply).toBe(false);
    expect(summary.actions.canUndo).toBe(false);
  });

  it("keeps the absorption row waiting while the run is in progress", () => {
    const summary = buildAdiDesignerSummary({
      presentation: { state: OPTIMISER_PRESENTATION_STATE.RUNNING },
      liveProgress: { running: true, status: "running", phase: "finalising" },
      instances: [],
      currentP20Deviation: -6,
    });
    const absorption = summary.rows[summary.rows.length - 1];
    expect(absorption.label).toBe("Low-frequency absorption");
    expect(absorption.status).toBe(ADI_LIVE_STATUS.WAITING);
    expect(summary.absorption).toBeNull();
  });
});

describe("the running card is reachable whatever the previous outcome", () => {
  const recommendationSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/room/bass/optimiseWorkflow/AdiRecommendation.jsx"),
    "utf8",
  );

  it("routes a running optimisation to the journey card", () => {
    // ONE panel: every outcome renders the journey card, so a running
    // optimisation is routed to it by construction — there is no second
    // "Recommended Improvement" card or "Optimisation Plan" panel that a
    // previous outcome could leave standing beside it.
    expect(recommendationSource).toContain("<AdiOptimisationJourney");
    expect(recommendationSource).toContain("presentation={optimiserPresentation}");
    expect(recommendationSource).toContain('runStatus={optimisationRunStatus || "idle"}');
    expect(recommendationSource).not.toContain("Recommended Improvement");
    expect(recommendationSource).not.toContain("OptimisationPlanStatus");
  });

  it("feeds the engine's live progress into the card", () => {
    const journeySource = fs.readFileSync(
      path.join(process.cwd(), "src/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx"),
      "utf8",
    );
    expect(journeySource).toContain("useImproveBassV2State(projectId, versionId)");
    expect(journeySource).toContain("liveProgress: isRunning ? { ...liveState, running: true } : null");
  });
});

describe("post-run vocabulary has no vague states", () => {
  it("keeps only the allowed designer words", () => {
    const allowed = [
      ADI_ROW_STATUS.TESTED,
      ADI_ROW_STATUS.RECOMMENDED,
      ADI_ROW_STATUS.TRADE_OFF,
      ADI_ROW_STATUS.REJECTED,
      ADI_ROW_STATUS.NOT_YET_SUPPORTED,
      ADI_ROW_STATUS.NOT_YET_SUPPORTED_IN_RUN,
    ];
    expect(allowed).toEqual([
      "Tested", "Recommended", "Trade-off", "Rejected",
      "Not yet supported", "Not yet supported in this run",
    ]);
    expect(Object.values(ADI_ROW_STATUS)).not.toContain("Not tested");
    expect(Object.values(ADI_ROW_STATUS)).not.toContain("Not evaluated");
    expect(Object.values(ADI_ROW_STATUS)).not.toContain("Not available");
  });
});