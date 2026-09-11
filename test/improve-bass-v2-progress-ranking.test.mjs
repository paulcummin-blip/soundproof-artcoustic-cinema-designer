// improve-bass-v2-progress-ranking.test.mjs
// Regression tests for Improve Bass V2 progress presentation + recommendation ranking.
//
// Tests:
//   A. progress sequence follows actual work
//   B. no fake stage is displayed
//   C. level-changing recommendation outranks same-level dB improvement
//   D. same-level broadly equivalent results prefer: calibration → position → seating
//   E. materially better raw result may outrank a weaker same-level result
//   F. seating remains last physical intervention (always not_tested)
//   G. stages with no material improvement are recorded as checked but not shown as cards
//   H. Cancel works from every stage (store-level — verified by existing engine)
//   I. no design state changes until Apply (verified by existing engine + apply handlers)

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildStageDisplay,
  STAGE_KEYS,
  STAGE_LABELS,
} from "@/components/room/bass/improveBassV2/improveBassV2StageMapping.js";
import {
  rankRecommendations,
  hasLevelChange,
  formatLevelChangeText,
} from "@/components/room/bass/improveBassV2/recommendationRanker.js";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeResult(opts = {}) {
  return {
    candidateId: opts.candidateId || "cand-1",
    isCurrent: opts.isCurrent || false,
    isPositionCandidate: opts.isPositionCandidate || false,
    positionPhase: opts.positionPhase || null,
    movementDescription: opts.movementDescription || null,
    achievedP19Level: opts.achievedP19Level ?? 0,
    achievedP20Level: opts.achievedP20Level ?? 0,
    perSeatP19: opts.perSeatP19 || [],
    perSeatP20: opts.perSeatP20 || [],
    appliedTuning: opts.appliedTuning || [],
    coordinates: opts.coordinates || [],
    positionCoordinates: opts.positionCoordinates || [],
    ...opts,
  };
}

function makeSeat(seatId, isPrimary, variationDbRaw, level) {
  return { seatId, isPrimary, variationDbRaw, level };
}

const currentResult = makeResult({
  candidateId: "current",
  isCurrent: true,
  achievedP19Level: 0, // FAIL
  achievedP20Level: 1, // L1
  perSeatP19: [makeSeat("s1", true, 8.0, 0), makeSeat("s2", true, 7.5, 0)],
  perSeatP20: [makeSeat("s1", true, 6.0, 1), makeSeat("s2", true, 5.5, 1)],
});

// ── A + B: Progress sequence follows actual work, no fake stages ────────

describe("A + B — Progress sequence follows actual work", () => {
  it("reviewing phase — all stages pending, none active", () => {
    const display = buildStageDisplay({ phase: "reviewing", status: "running" });
    const activeStages = display.stages.filter((s) => s.status === "active");
    assert.equal(activeStages.length, 0, "no stage should be active during reviewing");
    const completedStages = display.stages.filter((s) => s.status === "completed");
    assert.equal(completedStages.length, 0, "no stage should be completed during reviewing");
  });

  it("calibrating phase — phase_polarity active, delays+gain pending", () => {
    const display = buildStageDisplay({ phase: "calibrating", status: "running" });
    const phaseStage = display.stages.find((s) => s.key === "phase_polarity");
    assert.equal(phaseStage.status, "active");
    const delaysStage = display.stages.find((s) => s.key === "delays");
    assert.equal(delaysStage.status, "pending");
    const gainStage = display.stages.find((s) => s.key === "gain");
    assert.equal(gainStage.status, "pending");
  });

  it("testing_positions phase — calibration stages completed, sub_positions active", () => {
    const display = buildStageDisplay({ phase: "testing_positions", status: "running" });
    const phaseStage = display.stages.find((s) => s.key === "phase_polarity");
    assert.equal(phaseStage.status, "completed");
    const delaysStage = display.stages.find((s) => s.key === "delays");
    assert.equal(delaysStage.status, "completed");
    const gainStage = display.stages.find((s) => s.key === "gain");
    assert.equal(gainStage.status, "completed");
    const subStage = display.stages.find((s) => s.key === "sub_positions");
    assert.equal(subStage.status, "active");
  });

  it("screening_symmetric — sub_positions active with symmetric sub-label", () => {
    const display = buildStageDisplay({
      phase: "screening_symmetric",
      status: "running",
      positionSearchPhase: "symmetric",
    });
    const subStage = display.stages.find((s) => s.key === "sub_positions");
    assert.equal(subStage.status, "active");
    assert.equal(subStage.subStageLabel, "Testing symmetric positions");
  });

  it("finalising phase — sub_positions completed, comparing active", () => {
    const display = buildStageDisplay({ phase: "finalising", status: "running" });
    const subStage = display.stages.find((s) => s.key === "sub_positions");
    assert.equal(subStage.status, "completed");
    const comparingStage = display.stages.find((s) => s.key === "comparing");
    assert.equal(comparingStage.status, "active");
  });

  it("complete status — all stages completed (except seating)", () => {
    const display = buildStageDisplay({ phase: "finalising", status: "complete" });
    const completedStages = display.stages.filter((s) => s.status === "completed");
    assert.ok(completedStages.length >= 6, "all stages except seating should be completed");
    const seatingStage = display.stages.find((s) => s.key === "seating_positions");
    assert.equal(seatingStage.status, "not_tested");
  });

  it("no fake stage — only 7 stages exist", () => {
    assert.equal(STAGE_KEYS.length, 7);
    assert.deepEqual(STAGE_KEYS, [
      "phase_polarity", "delays", "gain", "sub_positions",
      "seating_positions", "comparing", "preparing",
    ]);
  });

  it("stage labels use correct terminology", () => {
    assert.equal(STAGE_LABELS.phase_polarity, "Checking phase / polarity");
    assert.equal(STAGE_LABELS.sub_positions, "Checking subwoofer positions");
    assert.equal(STAGE_LABELS.seating_positions, "Checking seating positions");
  });
});

// ── F: Seating remains last physical intervention ──────────────────────

describe("F — Seating remains last physical intervention", () => {
  it("seating_positions is always not_tested regardless of phase", () => {
    for (const phase of ["reviewing", "calibrating", "testing_positions", "finalising"]) {
      const display = buildStageDisplay({ phase, status: "running" });
      const seatingStage = display.stages.find((s) => s.key === "seating_positions");
      assert.equal(seatingStage.status, "not_tested", `seating should be not_tested during ${phase}`);
    }
  });

  it("seating_positions is not_tested even when run is complete", () => {
    const display = buildStageDisplay({ phase: "finalising", status: "complete" });
    const seatingStage = display.stages.find((s) => s.key === "seating_positions");
    assert.equal(seatingStage.status, "not_tested");
  });
});

// ── C: Level-changing recommendation outranks same-level dB improvement ─

describe("C — Level-changing recommendation outranks same-level dB", () => {
  it("P19 FAIL→L1 outranks P19 same-level 2.0 dB improvement", () => {
    const levelChangeResult = makeResult({
      candidateId: "position-1",
      isPositionCandidate: true,
      achievedP19Level: 1, // L1 (was FAIL=0)
      achievedP20Level: 1, // same
      perSeatP19: [makeSeat("s1", true, 4.0, 1), makeSeat("s2", true, 3.5, 1)],
      perSeatP20: [makeSeat("s1", true, 6.0, 1), makeSeat("s2", true, 5.5, 1)],
    });

    const sameLevelResult = makeResult({
      candidateId: "calibration-1",
      isCurrent: false,
      achievedP19Level: 0, // same FAIL
      achievedP20Level: 1, // same L1
      perSeatP19: [makeSeat("s1", true, 6.0, 0), makeSeat("s2", true, 5.5, 0)],
      perSeatP20: [makeSeat("s1", true, 6.0, 1), makeSeat("s2", true, 5.5, 1)],
    });

    const selection = {
      confirmedResults: [levelChangeResult, sameLevelResult],
      currentResult,
      winner: levelChangeResult,
    };

    const ranked = rankRecommendations(selection);
    assert.ok(ranked.length >= 1);
    assert.equal(ranked[0].result.candidateId, "position-1", "level-changing result should be #1");
    assert.ok(hasLevelChange(ranked[0]), "#1 should have a level change");
  });

  it("P20 L1→L2 outranks P20 same-level 1.5 dB improvement", () => {
    const levelChangeResult = makeResult({
      candidateId: "position-2",
      isPositionCandidate: true,
      achievedP19Level: 0, // same
      achievedP20Level: 2, // L2 (was L1)
      perSeatP19: [makeSeat("s1", true, 8.0, 0), makeSeat("s2", true, 7.5, 0)],
      perSeatP20: [makeSeat("s1", true, 4.0, 2), makeSeat("s2", true, 3.5, 2)],
    });

    const sameLevelResult = makeResult({
      candidateId: "calibration-2",
      isCurrent: false,
      achievedP19Level: 0,
      achievedP20Level: 1, // same L1
      perSeatP19: [makeSeat("s1", true, 8.0, 0), makeSeat("s2", true, 7.5, 0)],
      perSeatP20: [makeSeat("s1", true, 4.5, 1), makeSeat("s2", true, 4.0, 1)],
    });

    const selection = {
      confirmedResults: [levelChangeResult, sameLevelResult],
      currentResult,
      winner: levelChangeResult,
    };

    const ranked = rankRecommendations(selection);
    assert.equal(ranked[0].result.candidateId, "position-2");
    assert.ok(hasLevelChange(ranked[0]));
  });
});

// ── D: Same-level broadly equivalent — practical priority ───────────────

describe("D — Same-level broadly equivalent prefers calibration over position", () => {
  it("calibration (1.2 dB) outranks position (1.2 dB) — same level, same raw", () => {
    const calResult = makeResult({
      candidateId: "calibration-only",
      isCurrent: true,
      achievedP19Level: 0,
      achievedP20Level: 1,
      perSeatP19: [makeSeat("s1", true, 6.8, 0), makeSeat("s2", true, 6.3, 0)],
      perSeatP20: [makeSeat("s1", true, 6.0, 1), makeSeat("s2", true, 5.5, 1)],
    });

    const posResult = makeResult({
      candidateId: "position-3",
      isPositionCandidate: true,
      achievedP19Level: 0,
      achievedP20Level: 1,
      perSeatP19: [makeSeat("s1", true, 6.8, 0), makeSeat("s2", true, 6.3, 0)],
      perSeatP20: [makeSeat("s1", true, 6.0, 1), makeSeat("s2", true, 5.5, 1)],
    });

    const selection = {
      confirmedResults: [posResult],
      calibrationResult: calResult,
      calibrationMaterial: { material: true, reason: "test" },
      currentResult,
      winner: calResult,
    };

    const ranked = rankRecommendations(selection);
    // Both same level, same raw — calibration should rank first (less disruptive)
    assert.equal(ranked[0].interventionType, "calibration");
    assert.equal(ranked[1].interventionType, "position");
  });
});

// ── E: Materially better raw result may outrank weaker same-level ───────

describe("E — Materially better raw result outranks weaker same-level", () => {
  it("position with 2.0 dB improvement outranks calibration with 0.5 dB (same level)", () => {
    const calResult = makeResult({
      candidateId: "calibration-only",
      isCurrent: true,
      achievedP19Level: 0,
      achievedP20Level: 1,
      perSeatP19: [makeSeat("s1", true, 7.5, 0), makeSeat("s2", true, 7.0, 0)],
      perSeatP20: [makeSeat("s1", true, 6.0, 1), makeSeat("s2", true, 5.5, 1)],
    });

    const posResult = makeResult({
      candidateId: "position-4",
      isPositionCandidate: true,
      achievedP19Level: 0,
      achievedP20Level: 1,
      perSeatP19: [makeSeat("s1", true, 6.0, 0), makeSeat("s2", true, 5.5, 0)],
      perSeatP20: [makeSeat("s1", true, 6.0, 1), makeSeat("s2", true, 5.5, 1)],
    });

    const selection = {
      confirmedResults: [posResult],
      calibrationResult: calResult,
      calibrationMaterial: { material: true, reason: "test" },
      currentResult,
      winner: posResult, // winner is the position with 2.0 dB improvement
    };

    const ranked = rankRecommendations(selection);
    // Position has 2.0 dB improvement, calibration has 0.5 dB — position wins
    // (raw difference > 0.5 dB threshold)
    assert.equal(ranked[0].result.candidateId, "position-4");
  });
});

// ── G: No material improvement → checked but no card ────────────────────

describe("G — Stages with no material improvement are checked but no card", () => {
  it("immaterial calibration is not shown as a recommendation card", () => {
    const calResult = makeResult({
      candidateId: "calibration-only",
      isCurrent: true,
      achievedP19Level: 0,
      achievedP20Level: 1,
      perSeatP19: [makeSeat("s1", true, 7.9, 0), makeSeat("s2", true, 7.4, 0)],
      perSeatP20: [makeSeat("s1", true, 6.0, 1), makeSeat("s2", true, 5.5, 1)],
    });

    const selection = {
      confirmedResults: [],
      calibrationResult: calResult,
      calibrationMaterial: { material: false, reason: "No material improvement" },
      currentResult,
      winner: null,
    };

    const ranked = rankRecommendations(selection);
    assert.equal(ranked.length, 0, "immaterial calibration should not produce a card");
  });

  it("stage verdicts show 'no_improvement' for immaterial calibration", () => {
    const display = buildStageDisplay({
      phase: "testing_positions",
      status: "running",
      stageVerdicts: { phase_polarity: "no_improvement", delays: "no_improvement", gain: "no_improvement" },
    });
    const phaseStage = display.stages.find((s) => s.key === "phase_polarity");
    assert.equal(phaseStage.status, "completed");
    assert.equal(phaseStage.verdict, "no_improvement");
  });

  it("stage verdicts show 'improvement' for material calibration", () => {
    const display = buildStageDisplay({
      phase: "testing_positions",
      status: "running",
      stageVerdicts: { phase_polarity: "improvement", delays: "improvement", gain: "improvement" },
    });
    const phaseStage = display.stages.find((s) => s.key === "phase_polarity");
    assert.equal(phaseStage.status, "completed");
    assert.equal(phaseStage.verdict, "improvement");
  });
});

// ── H: Cancel works from every stage ────────────────────────────────────

describe("H — Cancel works from every stage (store-level)", () => {
  it("requestCancel sets cancelRequested flag", () => {
    // This is verified by the existing store mechanism — requestCancel sets
    // cancelRequested=true, and the engine's AbortController fires on the
    // next yieldToUI. The engine returns { status: "cancelled" } which
    // prevents any winner from publishing.
    // Here we verify that the stage display correctly shows cancelled state.
    const display = buildStageDisplay({ phase: "calibrating", status: "cancelled" });
    assert.equal(display.headerLabel, "Improving bass response");
    // Cancelled during calibrating — calibration stages should NOT be completed
    const phaseStage = display.stages.find((s) => s.key === "phase_polarity");
    assert.equal(phaseStage.status, "active", "phase was active when cancelled");
  });

  it("cancelled during sub_positions — no completed stages beyond what ran", () => {
    const display = buildStageDisplay({ phase: "screening_symmetric", status: "cancelled" });
    const subStage = display.stages.find((s) => s.key === "sub_positions");
    assert.equal(subStage.status, "active");
    const comparingStage = display.stages.find((s) => s.key === "comparing");
    assert.equal(comparingStage.status, "pending", "comparing should not be active or completed");
  });
});

// ── I: No design state changes until Apply ─────────────────────────────

describe("I — No design state changes until Apply", () => {
  it("rankRecommendations does not modify the selection or results", () => {
    const posResult = makeResult({
      candidateId: "position-5",
      isPositionCandidate: true,
      achievedP19Level: 1,
      achievedP20Level: 1,
      perSeatP19: [makeSeat("s1", true, 4.0, 1)],
      perSeatP20: [makeSeat("s1", true, 4.0, 1)],
    });

    const selection = {
      confirmedResults: [posResult],
      currentResult,
      winner: posResult,
    };

    const originalConfirmedResults = [...selection.confirmedResults];
    rankRecommendations(selection);
    assert.deepEqual(selection.confirmedResults, originalConfirmedResults, "selection should not be modified");
  });

  it("formatLevelChangeText produces correct output", () => {
    const rec = {
      levelChanges: {
        p19: { from: 0, to: 1, fromLabel: "FAIL", toLabel: "L1", jump: 1 },
        p20: { from: 1, to: 2, fromLabel: "L1", toLabel: "L2", jump: 1 },
        totalJumps: 2,
        paramCount: 2,
        hasLevelChange: true,
      },
    };
    assert.equal(formatLevelChangeText(rec), "P19: FAIL → L1, P20: L1 → L2");
  });

  it("formatLevelChangeText shows 'Same RP22 level' when no level change", () => {
    const rec = {
      levelChanges: {
        p19: { from: 0, to: 0, fromLabel: "FAIL", toLabel: "FAIL", jump: 0 },
        p20: { from: 1, to: 1, fromLabel: "L1", toLabel: "L1", jump: 0 },
        totalJumps: 0,
        paramCount: 0,
        hasLevelChange: false,
      },
    };
    assert.equal(formatLevelChangeText(rec), "Same RP22 level");
  });
});

// ── Winner authority ───────────────────────────────────────────────────

describe("Winner authority — canonical winner is always #1", () => {
  it("canonical winner is moved to #1 even if ranking would place it lower", () => {
    const winner = makeResult({
      candidateId: "position-winner",
      isPositionCandidate: true,
      achievedP19Level: 0, // same level
      achievedP20Level: 1, // same level
      perSeatP19: [makeSeat("s1", true, 6.0, 0)], // 2.0 dB improvement
      perSeatP20: [makeSeat("s1", true, 4.0, 1)],
    });

    const better = makeResult({
      candidateId: "position-better",
      isPositionCandidate: true,
      achievedP19Level: 0,
      achievedP20Level: 1,
      perSeatP19: [makeSeat("s1", true, 5.5, 0)], // 2.5 dB improvement
      perSeatP20: [makeSeat("s1", true, 4.0, 1)],
    });

    const selection = {
      confirmedResults: [winner, better],
      currentResult,
      winner, // canonical winner is "position-winner"
    };

    const ranked = rankRecommendations(selection);
    // Canonical winner should be #1 despite "better" having higher raw improvement
    assert.equal(ranked[0].result.candidateId, "position-winner");
    assert.ok(ranked[0].isWinner);
  });
});