// optimiser-live-progress.test.mjs
// ---------------------------------------------------------------------------
// The running-state contract of the Bass Optimisation card.
//
// Product rule: while a run is in progress every family shown is Waiting,
// Testing or Tested — never "Not tested", and never the previous run's rows.
// A capability the optimiser does not evaluate is not a row at all: it is stated
// once as a future capability, in the collapsed Engineer details.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ADI_LIVE_ROW_KEYS,
  ADI_LIVE_STATUS,
  buildLiveFamilyRows,
} from "@/components/room/bass/optimiserPlan/optimiserLiveProgress.js";
import { buildAdiDesignerSummary } from "@/components/room/bass/optimiserPlan/adiDesignerSummary.js";
import { OPTIMISER_PRESENTATION_STATE } from "@/components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import { ADI_ROW_STATUS } from "@/components/room/bass/optimiserPlan/optimiserFamilyLedgerRows.js";
import {
  OPTIMISER_FUTURE_CAPABILITY,
  buildFutureCapabilityNotes,
} from "@/components/room/bass/optimiserPlan/optimiserLiveFamilies.js";
import { OPTIMISER_LEVER_SEQUENCE } from "@/components/room/bass/optimiserPlan/optimiserLeverOrder.js";

// The tested table while a run is in progress: the families ADI evaluates, in
// the fixed least-intrusive order, then the absorption advice row.
const REQUIRED_ORDER = [
  "Delay", "Gain", "Polarity", "Placement",
  "Layout", "Seating", "Low-frequency absorption",
];

// Never a tested-table row: the optimiser does not evaluate these.
const NEVER_A_ROW = ["Phase", "Sub option", "Subwoofer option"];

const labels = (rows) => rows.map((row) => row.label);
const statusOf = (rows, label) => rows.find((row) => row.label === label)?.status;
const outcomeOf = (rows, label) => rows.find((row) => row.label === label)?.outcome;

describe("running state — the live tested rows", () => {
  it("lists every live family in the fixed order", () => {
    const rows = buildLiveFamilyRows({ status: "running", phase: "reviewing" });
    expect(labels(rows)).toEqual(REQUIRED_ORDER);
  });

  it("exports the same keys, in order", () => {
    expect(ADI_LIVE_ROW_KEYS).toEqual([
      "delay", "gain", "polarity", "placement",
      "layout", "seating", "absorption",
    ]);
  });

  it("carries no row for a capability the optimiser does not evaluate", () => {
    for (const phase of ["reviewing", "calibrating", "testing_positions", "finalising"]) {
      const rows = buildLiveFamilyRows({ status: "running", phase });
      for (const label of NEVER_A_ROW) {
        expect(labels(rows)).not.toContain(label);
      }
      expect(rows.map((row) => row.key)).not.toContain("phase");
      expect(rows.map((row) => row.key)).not.toContain("subwoofer_option");
      // Nothing in the tested table claims an unsupported capability.
      for (const row of rows) {
        expect(`${row.status} ${row.outcome || ""}`).not.toMatch(/not yet supported|not currently/i);
      }
    }
  });

  it("keeps the future capabilities stated, for Engineer details", () => {
    const notes = buildFutureCapabilityNotes();
    expect(notes.map((note) => note.key)).toEqual(["phase", "subwoofer_option"]);
    expect(notes[0].statement)
      .toBe(OPTIMISER_FUTURE_CAPABILITY.phase.statement);
    expect(notes[1].statement)
      .toBe(OPTIMISER_FUTURE_CAPABILITY.subwoofer_option.statement);
    expect(notes[0].statement).toMatch(/not currently evaluated/);
    expect(notes[1].statement).toMatch(/not currently part of this optimisation run/);
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

  it("keeps phase third in the order, for the day the crossover region is modelled", () => {
    // The order still reserves position 3 for phase, so the capability joins the
    // tested table in the right place when it goes live — it is simply not
    // claimed while the model cannot evaluate it.
    expect(OPTIMISER_LEVER_SEQUENCE.indexOf("phase")).toBe(2);
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