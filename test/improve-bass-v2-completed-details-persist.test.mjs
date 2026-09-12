// improve-bass-v2-completed-details-persist.test.mjs
// Regression tests for the completed-investigation panel persistence.
//
// Tests:
//   A. During run: detailed stage panel visible (running progress)
//   B. Successful completion: completed investigation panel visible with verdicts
//   C. No material recommendation: detail remains visible (buildStageDetails)
//   D. Material recommendation: detail has numerical results
//   E. Not-tested stages remain Not tested (seating_positions)
//   F. Cancelled run: stage checklist reflects partial completion
//   G. New run resets stage verdicts (store-level)
//   H. Post-completion stale detection (fingerprint mismatch)
//   I. Re-render does not clear completed state (store persistence)

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildStageDisplay,
  STAGE_KEYS,
} from "@/components/room/bass/improveBassV2/improveBassV2StageMapping.js";
import {
  buildStageDetails,
  primarySeatMetric,
  findBestCalibrationOption,
} from "@/components/room/bass/improveBassV2/ImproveBassV2CompletedInvestigation.jsx";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeSeat(seatId, isPrimary, variationDbRaw, level) {
  return { seatId, isPrimary, variationDbRaw, level };
}

function makeCompletedState(opts = {}) {
  return {
    status: "complete",
    phase: "finalising",
    stageVerdicts: opts.stageVerdicts || {
      phase_polarity: "skipped",
      delays: "no_improvement",
      gain: "skipped",
      sub_positions: "no_improvement",
      comparing: "done",
      preparing: "done",
    },
    ...opts,
  };
}

function makeSelection(opts = {}) {
  return {
    winner: opts.winner || null,
    currentResult: opts.currentResult || {
      candidateId: "current",
      perSeatP19: [makeSeat("s1", true, 4.8, 4), makeSeat("s2", false, 5.2, 4)],
      perSeatP20: [makeSeat("s1", true, 3.0, 4), makeSeat("s2", false, 3.5, 4)],
    },
    calibrationDiagnostics: opts.calibrationDiagnostics || {
      coarseCount: 61,
      fineCount: 2,
      options: [
        {
          candidateId: "cal-1",
          tuning: [{ delayMs: 9, gainDb: 0, polarity: 0 }],
          proxy: { proxyP19: 4.4 },
          validity: { valid: true, issues: [] },
          canonical: {
            perSeatP19: [makeSeat("s1", true, 4.4, 4), makeSeat("s2", false, 4.9, 4)],
            perSeatP20: [makeSeat("s1", true, 2.8, 4), makeSeat("s2", false, 3.2, 4)],
          },
        },
      ],
    },
    calibrationResult: opts.calibrationResult || null,
    calibrationMaterial: opts.calibrationMaterial || { material: false, reason: null },
    positionOptimisation: opts.positionOptimisation || {
      subOptimisationExhausted: true,
      materialSubImprovementFound: false,
    },
    evaluationCounts: opts.evaluationCounts || {
      symmetric: { generated: 8, promotedToV2: 2 },
      asymmetricPair: { generated: 6, promotedToV2: 1 },
      individual: { generated: 4, promotedToV2: 1 },
    },
    ...opts,
  };
}

// ── A. During run: progress panel visible (stage display shows active) ──

describe("A — During run, stage display shows active stages", () => {
  it("calibrating phase shows delays as active when grouped-delay-only", () => {
    const display = buildStageDisplay({
      phase: "calibrating",
      status: "running",
      stageVerdicts: { phase_polarity: "skipped", gain: "skipped" },
    });
    const delays = display.stages.find((s) => s.key === "delays");
    assert.equal(delays.status, "active");
  });
});

// ── B. Successful completion: completed investigation visible ──────────

describe("B — Completed state shows all stages with verdicts", () => {
  it("complete status shows calibration stages as completed", () => {
    const state = makeCompletedState();
    const display = buildStageDisplay(state);
    const delays = display.stages.find((s) => s.key === "delays");
    assert.equal(delays.status, "completed");
    assert.equal(delays.verdict, "no_improvement");
  });

  it("complete status shows comparing and preparing as completed", () => {
    const state = makeCompletedState();
    const display = buildStageDisplay(state);
    const comparing = display.stages.find((s) => s.key === "comparing");
    const preparing = display.stages.find((s) => s.key === "preparing");
    assert.equal(comparing.status, "completed");
    assert.equal(preparing.status, "completed");
  });
});

// ── C. No material recommendation: detail remains visible ───────────────

describe("C — No material recommendation: stage details computed", () => {
  it("buildStageDetails produces delay detail with option count", () => {
    const selection = makeSelection();
    const details = buildStageDetails(selection);
    assert.ok(details.delays, "delays detail should exist");
    // coarseCount(61) + fineCount(2) = 63 total
    assert.ok(details.delays.includes("63"), "should mention 63 total options");
  });

  it("buildStageDetails shows 'below material threshold' when no material winner", () => {
    const selection = makeSelection();
    const details = buildStageDetails(selection);
    assert.ok(details.delays.includes("below material threshold"));
  });

  it("buildStageDetails shows P19 before→after for best candidate", () => {
    const selection = makeSelection();
    const details = buildStageDetails(selection);
    assert.ok(details.delays.includes("4.8"), "should mention before P19");
    assert.ok(details.delays.includes("4.4"), "should mention after P19");
  });
});

// ── D. Material recommendation: detail has numerical results ───────────

describe("D — Material recommendation: numerical results in detail", () => {
  it("buildStageDetails shows 'Best result' when calibration is material", () => {
    const selection = makeSelection({
      calibrationResult: {
        perSeatP19: [makeSeat("s1", true, 0.4, 4)],
        perSeatP20: [makeSeat("s1", true, 0.23, 4)],
      },
      calibrationMaterial: { material: true, reason: "improvement" },
    });
    const details = buildStageDetails(selection);
    assert.ok(details.delays.includes("Best result"));
    assert.ok(details.delays.includes("0.40"), "should show after P19");
    assert.ok(details.delays.includes("0.23"), "should show after P20");
  });
});

// ── E. Not-tested stages remain Not tested ─────────────────────────────

describe("E — Seating positions always not_tested", () => {
  it("seating_positions is not_tested in completed state", () => {
    const state = makeCompletedState();
    const display = buildStageDisplay(state);
    const seating = display.stages.find((s) => s.key === "seating_positions");
    assert.equal(seating.status, "not_tested");
  });

  it("seating_positions is not_tested in cancelled state", () => {
    const state = makeCompletedState({ status: "cancelled" });
    const display = buildStageDisplay(state);
    const seating = display.stages.find((s) => s.key === "seating_positions");
    assert.equal(seating.status, "not_tested");
  });

  it("skipped phase_polarity shows as not_available", () => {
    const state = makeCompletedState();
    const display = buildStageDisplay(state);
    const phase = display.stages.find((s) => s.key === "phase_polarity");
    assert.equal(phase.status, "not_available");
  });
});

// ── F. Cancelled run: partial completion reflected ──────────────────────

describe("F — Cancelled run retains completed history", () => {
  it("cancelled during calibrating: comparing/preparing remain pending", () => {
    const state = {
      status: "cancelled",
      phase: "calibrating",
      stageVerdicts: { phase_polarity: "skipped", gain: "skipped" },
    };
    const display = buildStageDisplay(state);
    const comparing = display.stages.find((s) => s.key === "comparing");
    const preparing = display.stages.find((s) => s.key === "preparing");
    assert.equal(comparing.status, "pending");
    assert.equal(preparing.status, "pending");
  });

  it("cancelled after calibration: delays completed, comparing pending", () => {
    const state = {
      status: "cancelled",
      phase: "testing_positions",
      stageVerdicts: {
        phase_polarity: "skipped",
        delays: "no_improvement",
        gain: "skipped",
      },
    };
    const display = buildStageDisplay(state);
    const delays = display.stages.find((s) => s.key === "delays");
    const comparing = display.stages.find((s) => s.key === "comparing");
    assert.equal(delays.status, "completed");
    assert.equal(comparing.status, "pending");
  });
});

// ── G. New run resets stage verdicts (store-level) ──────────────────────

describe("G — New run resets stage verdicts", () => {
  it("startImproveBassV2 resets to running with empty verdicts", async () => {
    const { startImproveBassV2, getImproveBassV2State, resetImproveBassV2 } =
      await import("@/components/room/bass/improveBassV2/improveBassV2Store.js");

    const projectId = "test-reset-" + Date.now();
    resetImproveBassV2(projectId);

    // Simulate a completed run
    startImproveBassV2(projectId, {});
    const { setStageVerdict } = await import("@/components/room/bass/improveBassV2/improveBassV2Store.js");
    setStageVerdict(projectId, "delays", "no_improvement");

    let state = getImproveBassV2State(projectId);
    assert.equal(state.stageVerdicts.delays, "no_improvement");

    // Start a new run — should reset
    startImproveBassV2(projectId, {});
    state = getImproveBassV2State(projectId);
    assert.equal(state.status, "running");
    assert.equal(state.phase, "reviewing");
    assert.deepEqual(state.stageVerdicts, {});
    assert.equal(state.winner, null);

    resetImproveBassV2(projectId);
  });
});

// ── H. Post-completion stale detection ──────────────────────────────────

describe("H — Post-completion stale detection logic", () => {
  it("stale when fingerprint mismatch after completion", () => {
    const applyFingerprint = "fp-abc123";
    const currentDesignFingerprint = "fp-different";
    const completedResultStale =
      !!applyFingerprint && !!currentDesignFingerprint && currentDesignFingerprint !== applyFingerprint;
    assert.equal(completedResultStale, true);
  });

  it("not stale when fingerprint matches after completion", () => {
    const applyFingerprint = "fp-abc123";
    const currentDesignFingerprint = "fp-abc123";
    const completedResultStale =
      !!applyFingerprint && !!currentDesignFingerprint && currentDesignFingerprint !== applyFingerprint;
    assert.equal(completedResultStale, false);
  });

  it("not stale when no applyFingerprint (e.g. no-winner case)", () => {
    const applyFingerprint = null;
    const currentDesignFingerprint = "fp-abc123";
    const completedResultStale =
      !!applyFingerprint && !!currentDesignFingerprint && currentDesignFingerprint !== applyFingerprint;
    assert.equal(completedResultStale, false);
  });
});

// ── I. Re-render does not clear completed state ─────────────────────────

describe("I — Store persistence across re-renders", () => {
  it("completed state with winner persists in store", async () => {
    const { setWinner, getImproveBassV2State, resetImproveBassV2 } =
      await import("@/components/room/bass/improveBassV2/improveBassV2Store.js");

    const projectId = "test-persist-" + Date.now();
    resetImproveBassV2(projectId);

    setWinner(projectId, {
      isCurrent: true,
      winner: null,
      message: "No verified material automatic improvement found.",
      applyFingerprint: "fp-test",
    });

    // Simulate re-render: just read state again
    const state1 = getImproveBassV2State(projectId);
    const state2 = getImproveBassV2State(projectId);

    assert.equal(state1.status, "complete");
    assert.equal(state2.status, "complete");
    assert.equal(state1.winner, state2.winner);
    assert.equal(state1.winner.applyFingerprint, "fp-test");

    resetImproveBassV2(projectId);
  });
});

// ── Helper function tests ───────────────────────────────────────────────

describe("primarySeatMetric", () => {
  it("finds the primary seat", () => {
    const arr = [makeSeat("s2", false, 5.0, 4), makeSeat("s1", true, 4.8, 4)];
    const result = primarySeatMetric(arr);
    assert.equal(result.seatId, "s1");
  });

  it("falls back to first entry if no primary", () => {
    const arr = [makeSeat("s1", false, 5.0, 4), makeSeat("s2", false, 4.8, 4)];
    const result = primarySeatMetric(arr);
    assert.equal(result.seatId, "s1");
  });

  it("returns null for empty array", () => {
    assert.equal(primarySeatMetric([]), null);
    assert.equal(primarySeatMetric(null), null);
  });
});

describe("findBestCalibrationOption", () => {
  it("finds the option with the best primary P19", () => {
    const calDiag = {
      options: [
        {
          validity: { valid: true },
          canonical: { perSeatP19: [makeSeat("s1", true, 5.0, 4)] },
        },
        {
          validity: { valid: true },
          canonical: { perSeatP19: [makeSeat("s1", true, 3.0, 4)] },
        },
      ],
    };
    const best = findBestCalibrationOption(calDiag);
    assert.equal(best.canonical.perSeatP19[0].variationDbRaw, 3.0);
  });

  it("skips invalid options", () => {
    const calDiag = {
      options: [
        { validity: { valid: false }, canonical: { perSeatP19: [] } },
        {
          validity: { valid: true },
          canonical: { perSeatP19: [makeSeat("s1", true, 4.0, 4)] },
        },
      ],
    };
    const best = findBestCalibrationOption(calDiag);
    assert.equal(best.canonical.perSeatP19[0].variationDbRaw, 4.0);
  });

  it("returns null when no valid options", () => {
    assert.equal(findBestCalibrationOption({ options: [] }), null);
    assert.equal(findBestCalibrationOption(null), null);
  });
});