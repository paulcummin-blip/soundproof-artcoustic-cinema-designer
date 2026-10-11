// adi-calibration-tradeoff-ratio.test.mjs
// ---------------------------------------------------------------------------
// The 3:1 calibration trade-off rule, as a product contract:
//
//   improvement ≥ 3 × damage            → applied automatically
//   improvement > damage, under 3:1     → useful, review required (held)
//   damage ≥ improvement                → not applied
//
// and the two behaviours that go with it:
//   • the strongest safe calibration candidate is the one applied; every other
//     confirmed calibration improvement states WHY it was not (never a bare
//     "Improvement found — not applied")
//   • a physical change is still never applied, whatever it would gain
//
// Genesis AV / Original Design is reproduced as a controlled fixture: a −3 ms
// rear delay improves P20 from ±27 dB to ±11 dB while P19 worsens by 1 dB.
//
// No P19/P20 threshold, no grading boundary and no bass maths is exercised as
// changed here — the two grading guards below prove they did not move.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import fs from "node:fs";

import { gradeP20FromRaw } from "../components/room/bass/completedBassResultPersistence.js";
import { gradeP19, gradeP20 } from "../components/utils/rp22/bassGradingAuthority.js";
import {
  CALIBRATION_TRADEOFF_DECISION,
  CALIBRATION_TRADEOFF_RATIO,
  assessCalibrationTradeOff,
} from "../components/room/bass/optimiseWorkflow/adiCalibrationTradeOffRule.js";
import {
  CALIBRATION_APPLY_DECISION,
  CALIBRATION_APPLY_REASON,
  MATERIAL_DAMAGE_DB,
  buildDesignChangeRecommendations,
  resolveCalibrationAutoApply,
} from "../components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";
import {
  confirmedCalibrationCandidates,
  resolveCalibrationApplicationPlan,
} from "../components/room/bass/optimiseWorkflow/adiCalibrationCandidateSelection.js";
import {
  CALIBRATION_EVIDENCE_RESULT,
  buildCalibrationEvidence,
  calibrationEvidenceFor,
  describeCalibrationLever,
  resolveCalibrationEvidenceState,
} from "../components/room/bass/optimiserPlan/optimiserCalibrationEvidence.js";

// ── Fixtures ─────────────────────────────────────────────────────────────

const SEATS = ["seat-left", "seat-right"];

const p20Row = (seatId, raw) => ({
  seatId,
  variationDbRaw: raw,
  level: `L${gradeP20FromRaw(raw)}`,
  isPrimary: true,
});

function confirmed({ id, p19, p19Level, p20, p20Level = null, tuning = [], kind = "calibration" }) {
  return {
    candidateId: id,
    candidateKind: kind,
    appliedTuning: tuning,
    achievedP19VariationDb: p19,
    achievedP19Level: p19Level,
    achievedP20VariationDb: p20,
    achievedP20Level: p20Level || `L${gradeP20FromRaw(p20)}`,
    perSeatP20: SEATS.map((seat) => p20Row(seat, p20)),
    perSeatP19: [],
    worstSeatId: SEATS[1],
  };
}

const tuning = ({ rearMs = 0, gainDb = 0 } = {}) => ([
  { sourceId: "sub-front", delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
  { sourceId: "sub-rear", delayMs: rearMs, gainDb, polarity: 1, phaseControlDeg: 0 },
]);

const instances = () => ([
  { id: "sub-front", enabled: true, model: "SUB3-12", legacyGroup: "front", delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
  { id: "sub-rear", enabled: true, model: "SUB3-12", legacyGroup: "rear", delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
]);

// Genesis AV / Original Design as saved: P20 ±27 dB → ±11 dB from a −3 ms rear
// group delay, with P19 essentially unchanged (0.6 dB → 1.6 dB, same level).
const baseline = () => confirmed({ id: "current", p19: 0.6, p19Level: "L4", p20: 27.4, kind: "current" });
const delayCandidate = () => confirmed({
  id: "delay:-3",
  p19: 1.6,
  p19Level: "L4",
  p20: 10.4,
  tuning: tuning({ rearMs: 3 }),
});
const gainCandidate = () => confirmed({
  id: "gain:-6",
  p19: 0.6,
  p19Level: "L4",
  p20: 23.7,
  tuning: tuning({ gainDb: -6 }),
});

const optionFor = (result) => ({
  candidateId: result.candidateId,
  tuning: result.appliedTuning,
  validity: { valid: true },
  canonical: result,
});

/**
 * A run selection carrying the delay and gain options the search confirmed, with
 * the stage counters and the retained best gain attempt the engine records — the
 * evidence builder reads the run's own numbers, not only the option list.
 */
const selectionWith = ({ delay = null, gain = null, base = null, combined = null, phaseOptions = 0 } = {}) => ({
  currentResult: base || baseline(),
  // The phase/polarity search retains its own option count and the combined
  // candidate it confirmed, so the polarity lever is evidenced too.
  phaseDiagnostics: { optionCount: phaseOptions },
  combinedResult: combined,
  calibrationDiagnostics: delay
    ? { options: [optionFor(delay)], coarseCount: 4, retained: 1, confirmed: 1, valid: 1 }
    : { options: [], coarseCount: 4, retained: 1, confirmed: 1, valid: 1 },
  gainDiagnostics: gain
    ? {
      options: [optionFor(gain)],
      coarseCount: 3,
      retained: 1,
      confirmed: 1,
      valid: 1,
      gainAdjustable: true,
      bestAttempt: {
        candidateId: gain.candidateId,
        p20VariationDb: gain.achievedP20VariationDb,
        p20Level: gain.achievedP20Level,
        p19VariationDb: gain.achievedP19VariationDb,
        p19Level: gain.achievedP19Level,
        adjustmentDb: -6,
      },
    }
    : { options: [], coarseCount: 3, retained: 1, confirmed: 1, valid: 1 },
});

const genesisSelection = () => selectionWith({
  delay: delayCandidate(),
  gain: gainCandidate(),
  phaseOptions: 4,
  combined: confirmed({
    id: "phase-combined",
    p19: 0.6,
    p19Level: "L4",
    p20: 23.0,
    tuning: tuning(),
  }),
});

const decisionFor = (candidate, base = null) => resolveCalibrationAutoApply({
  baseline: base || baseline(),
  candidate,
  instances: instances(),
  appliedCalibration: null,
  objectives: null,
});

const pair = (before19, after19, before20, after20) => ({
  before: { p19: { deviationDb: before19 }, p20: { deviationDb: before20 } },
  after: { p19: { deviationDb: after19 }, p20: { deviationDb: after20 } },
});

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ── The rule itself ──────────────────────────────────────────────────────

describe("the 3:1 calibration trade-off rule", () => {
  it("is three to one, read from the canonical deviations", () => {
    expect(CALIBRATION_TRADEOFF_RATIO).toBe(3);
  });

  it("auto-applies at or above three times the damage", () => {
    // The reported Genesis numbers: P20 27 → 10 (17 dB better), P19 0 → 1 (1 dB worse).
    const tradeOff = assessCalibrationTradeOff(pair(0, 1, 27, 10));
    expect(tradeOff.improvementDb).toBe(17);
    expect(tradeOff.damageDb).toBe(1);
    expect(tradeOff.ratio).toBe(17);
    expect(tradeOff.improvedSide).toBe("P20");
    expect(tradeOff.worsenedSide).toBe("P19");
    expect(tradeOff.decision).toBe(CALIBRATION_TRADEOFF_DECISION.AUTO_APPLY);
  });

  it("holds a useful trade-off under three to one for approval", () => {
    const tradeOff = assessCalibrationTradeOff(pair(0, 2, 20, 16));
    expect(tradeOff.improvementDb).toBe(4);
    expect(tradeOff.damageDb).toBe(2);
    expect(tradeOff.ratio).toBe(2);
    expect(tradeOff.decision).toBe(CALIBRATION_TRADEOFF_DECISION.REVIEW_REQUIRED);
  });

  it("rejects a trade-off larger than its own benefit", () => {
    const tradeOff = assessCalibrationTradeOff(pair(5, 3, 20, 24));
    expect(tradeOff.improvementDb).toBe(2);
    expect(tradeOff.damageDb).toBe(4);
    expect(tradeOff.decision).toBe(CALIBRATION_TRADEOFF_DECISION.REJECTED);
  });

  it("reports no trade-off at all when nothing is worsened", () => {
    expect(assessCalibrationTradeOff(pair(0, 0, 27, 10))).toBeNull();
  });
});

// ── The decision the rule drives ─────────────────────────────────────────

describe("the safe calibration auto-apply decision with a trade-off", () => {
  it("applies the Genesis delay improvement because it is far above 3:1", () => {
    const decision = decisionFor(delayCandidate());
    expect(decision.decision).toBe(CALIBRATION_APPLY_DECISION.APPLIED);
    expect(decision.reason).toBe(CALIBRATION_APPLY_REASON.TRADEOFF_WITHIN_RATIO);
    expect(decision.tradeOffDecision).toBe(CALIBRATION_TRADEOFF_DECISION.AUTO_APPLY);
    expect(decision.damage.p19WorseDb).toBe(1);
    expect(decision.improvement.p20DeltaDb).toBe(17);
    // The applied statement states the ratio that allowed it.
    expect(decision.statement).toMatch(/applied automatically/);
    expect(decision.statement).toMatch(/17:1/);
  });

  it("asks for approval when the improvement is useful but under 3:1", () => {
    // 4 dB better on P20, 2 dB worse on P19 — 2:1, so it is held.
    const base = confirmed({ id: "current", p19: 0.6, p19Level: "L4", p20: 20, kind: "current" });
    const candidate = confirmed({ id: "cal-review", p19: 2.6, p19Level: "L4", p20: 16, tuning: tuning({ rearMs: 2 }) });
    const decision = decisionFor(candidate, base);
    expect(decision.decision).toBe(CALIBRATION_APPLY_DECISION.HOLD);
    expect(decision.reason).toBe(CALIBRATION_APPLY_REASON.TRADEOFF_REVIEW_REQUIRED);
    expect(decision.tradeOff.ratio).toBe(2);
    expect(decision.statement).toMatch(/calibration trade-off/);
    expect(decision.statement).toMatch(/Review before applying/);
  });

  it("never applies a trade-off larger than the improvement", () => {
    // 1 dB better on P20, 1 dB worse on P19 — the damage is not smaller than the
    // improvement, so the ratio rule refuses it.
    const base = confirmed({ id: "current", p19: 2.6, p19Level: "L4", p20: 20, kind: "current" });
    const candidate = confirmed({ id: "cal-reject", p19: 3.6, p19Level: "L4", p20: 19, tuning: tuning({ rearMs: 1 }) });
    const decision = decisionFor(candidate, base);
    expect(decision.decision).toBe(CALIBRATION_APPLY_DECISION.HOLD);
    expect(decision.reason).toBe(CALIBRATION_APPLY_REASON.TRADEOFF_DAMAGE_EXCEEDS_BENEFIT);
    expect(decision.tradeOff.decision).toBe(CALIBRATION_TRADEOFF_DECISION.REJECTED);
    expect(decision.statement).toMatch(/trade-off is larger than the improvement/);
  });
});

// ── Genesis: the strongest safe candidate, and why the other was held ────

describe("the strongest safe calibration candidate is the one applied", () => {
  const plan = resolveCalibrationApplicationPlan({
    baseline: baseline(),
    selection: genesisSelection(),
    instances: instances(),
    appliedCalibration: null,
  });

  it("selects the delay candidate, not the weaker gain one", () => {
    expect(plan.decision).toBe(CALIBRATION_APPLY_DECISION.APPLIED);
    expect(plan.selected.lever).toBe("delay");
    expect(plan.selected.candidateId).toBe("delay:-3");
    expect(plan.tuning.find((entry) => entry.sourceId === "sub-rear").delayMs).toBe(3);
  });

  it("states why the weaker candidate was not applied", () => {
    expect(plan.perLever.delay.applied).toBe(true);
    expect(plan.perLever.gain.applied).toBe(false);
    expect(plan.perLever.gain.statement)
      .toMatch(/Not applied because the delay candidate gives the stronger calibration improvement/);
  });

  it("never offers a physical candidate as a calibration change", () => {
    const moved = confirmed({
      id: "pos-rear-quarter",
      p19: 0.6,
      p19Level: "L4",
      p20: 10.2,
      tuning: tuning({ rearMs: 3 }),
      kind: "positions",
    });
    const candidates = confirmedCalibrationCandidates({
      selection: { currentResult: baseline(), winner: moved, calibrationDiagnostics: { options: [] }, gainDiagnostics: { options: [] } },
    });
    expect(candidates).toEqual([]);
    const changes = buildDesignChangeRecommendations({ baseline: baseline(), subPositionResult: moved });
    expect(changes[0].applied).toBe(false);
    expect(changes[0].statement).toMatch(/has not been applied/);
  });
});

// ── What the panel is allowed to say ────────────────────────────────────

describe("the recorded reason and the panel copy", () => {
  const plan = resolveCalibrationApplicationPlan({
    baseline: baseline(),
    selection: genesisSelection(),
    instances: instances(),
    appliedCalibration: null,
  });

  it("records the decision with the evidence", () => {
    const evidence = buildCalibrationEvidence({
      selection: genesisSelection(),
      baseline: baseline(),
      calibrationDecision: plan,
      decisionApplied: true,
    });
    expect(evidence.decision?.selected?.lever).toBe("delay");
    expect(evidence.decisionApplied).toBe(true);
    expect(calibrationEvidenceFor(evidence, "delay").result).toBe(CALIBRATION_EVIDENCE_RESULT.APPLIED);
  });

  it("states a held improvement with its reason, never on its own", () => {
    const evidence = buildCalibrationEvidence({
      selection: genesisSelection(),
      baseline: baseline(),
      calibrationDecision: plan,
      decisionApplied: true,
    });
    const gain = calibrationEvidenceFor(evidence, "gain");
    expect(gain.result).toBe(CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED);
    expect(gain.notAppliedReason)
      .toBe("Not applied because the delay candidate gives the stronger calibration improvement.");
    const line = describeCalibrationLever(gain);
    expect(line).toContain("Not applied because the delay candidate");
    expect(line).not.toContain("Improvement found — not applied");

    const state = resolveCalibrationEvidenceState(evidence);
    expect(state.heldLines.map((entry) => entry.lever)).toContain("gain");
    expect(state.heldLines.every((entry) => Boolean(entry.notAppliedReason))).toBe(true);
  });

  it("carries a reason for an improvement saved before a decision was recorded", () => {
    const evidence = buildCalibrationEvidence({
      selection: genesisSelection(),
      baseline: baseline(),
      calibrationDecision: null,
    });
    const gain = calibrationEvidenceFor(evidence, "gain");
    expect(gain.notAppliedReason).toMatch(/Not applied because no automatic calibration decision was recorded/);
    expect(describeCalibrationLever(gain)).not.toContain("Improvement found — not applied");
  });

  it("carries no bare not-applied wording anywhere in the panel sources", () => {
    const sources = [
      "components/room/bass/optimiserPlan/optimiserCalibrationEvidence.js",
      "components/room/bass/optimiserPlan/AdiCalibrationSection.jsx",
      "components/room/bass/optimiserPlan/AdiCalibrationEvidenceBlock.jsx",
      "components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx",
      "components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js",
      "components/room/bass/optimiseWorkflow/adiCalibrationCandidateSelection.js",
      "components/room/bass/optimiseWorkflow/adiCalibrationTradeOffRule.js",
    ];
    for (const path of sources) {
      expect(read(path)).not.toContain("Improvement found — not applied");
    }
  });
});

// ── Nothing moved that must not move ───────────────────────────────────

describe("no scoring change", () => {
  it("keeps the P19 and P20 grading boundaries exactly as they were", () => {
    expect(gradeP19(2)).toBe(4);
    expect(gradeP19(3)).toBe(3);
    expect(gradeP19(4)).toBe(2);
    expect(gradeP19(5)).toBe(1);
    expect(gradeP19(6)).toBe(0);
    expect(gradeP20(2)).toBe(4);
    expect(gradeP20(3)).toBe(3);
    expect(gradeP20(4)).toBe(2);
    expect(gradeP20(20)).toBe(1);
  });

  it("keeps the canonical material damage threshold", () => {
    expect(MATERIAL_DAMAGE_DB).toBe(1.0);
  });

  it("keeps a physical change manual, whatever the ratio would allow", () => {
    const moves = confirmed({ id: "seating-row-2", p19: 0.6, p19Level: "L4", p20: 9.0, kind: "seating" });
    const changes = buildDesignChangeRecommendations({ baseline: baseline(), seatingResult: moves });
    expect(changes[0].key).toBe("seating");
    expect(changes[0].applied).toBe(false);
  });
});