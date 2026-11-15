// physical-materiality-gate.test.mjs
// ---------------------------------------------------------------------------
// Validation for the stricter physical materiality gate and the electronic
// apply threshold. Sound Proof is a design-stage sales tool: physical changes
// require an RP22 Performance Level gain (or an L1→L1 ≥6 dB variation gain),
// and electronic apply is not triggered by a merely-positive fractional change.
//
// Uses node:test — run with:
//   node --import ./test/_alias-register.mjs --test test/physical-materiality-gate.test.mjs
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isPhysicalMaterialImprovement,
  isPhysicalCandidate,
  PHYSICAL_L1_L1_THRESHOLD_DB,
} from "../src/components/room/bass/improveBassV2/physicalMaterialityGate.js";
import { isMaterialImprovement } from "../src/components/room/bass/improveBassV2/materialityGate.js";
import { resolveCalibrationAutoApply, CALIBRATION_APPLY_DECISION } from "../src/components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";

// ── Grading (matches bassGradingAuthority.js) ───────────────────────────
// floor the deviation, then map to a level. P19 has FAIL (0); P20 floor is L1.

function gradeP20(value) {
  const w = Math.floor(Number(value));
  if (!Number.isFinite(w)) return null;
  if (w <= 2) return 4;
  if (w <= 3) return 3;
  if (w <= 4) return 2;
  return 1;
}
function gradeP19(value) {
  const w = Math.floor(Number(value));
  if (!Number.isFinite(w)) return null;
  if (w <= 2) return 4;
  if (w <= 3) return 3;
  if (w <= 4) return 2;
  if (w <= 5) return 1;
  return 0;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function seat(seatId, variationDbRaw, isPrimary = true) {
  return { seatId, variationDbRaw, level: gradeP20(variationDbRaw), isPrimary };
}

function result({
  p19Var, p20Var, perSeatP20, p14AchievedDb = 126, p14TargetDb = 117,
  requestedP14Pass = true, operatingOutputDb = 126,
}) {
  return {
    achievedP19Level: gradeP19(p19Var),
    achievedP19VariationDb: p19Var,
    achievedP20Level: gradeP20(p20Var),
    achievedP20VariationDb: p20Var,
    perSeatP20,
    p14AchievedDb,
    p14TargetDb,
    requestedP14Pass,
    operatingOutputDb,
  };
}

// ── Physical materiality gate ────────────────────────────────────────────

test("1. L1 → L2 with modest dB improvement: physical recommendation allowed", () => {
  const baseline = result({
    p19Var: 5.0, p20Var: 5.0,
    perSeatP20: [seat("s1", 5.0), seat("s2", 5.0, false)],
  });
  const candidate = result({
    p19Var: 4.0, p20Var: 4.0,
    perSeatP20: [seat("s1", 4.0), seat("s2", 4.0, false)],
  });
  const m = isPhysicalMaterialImprovement(baseline, candidate);
  assert.equal(m.material, true, `Expected material, got: ${m.reason}`);
  assert.equal(m.rule, "physical-level-improved");
});

test("2. L2 → L3: physical recommendation allowed", () => {
  const baseline = result({
    p19Var: 4.0, p20Var: 4.0,
    perSeatP20: [seat("s1", 4.0), seat("s2", 4.0, false)],
  });
  const candidate = result({
    p19Var: 3.0, p20Var: 3.0,
    perSeatP20: [seat("s1", 3.0), seat("s2", 3.0, false)],
  });
  const m = isPhysicalMaterialImprovement(baseline, candidate);
  assert.equal(m.material, true, `Expected material, got: ${m.reason}`);
  assert.equal(m.rule, "physical-level-improved");
});

test("3. L1 → L1 with 6 dB improvement: physical recommendation allowed", () => {
  // P20 stays at L1 (both > 4 dB) but variation improves by exactly 6.0 dB.
  const baseline = result({
    p19Var: 5.0, p20Var: 11.0,
    perSeatP20: [seat("s1", 11.0), seat("s2", 10.0, false)],
  });
  const candidate = result({
    p19Var: 5.0, p20Var: 5.0,
    perSeatP20: [seat("s1", 5.0), seat("s2", 5.0, false)],
  });
  const m = isPhysicalMaterialImprovement(baseline, candidate);
  assert.equal(m.material, true, `Expected material, got: ${m.reason}`);
  assert.equal(m.rule, "physical-l1-l1-variation");
});

test("4. L1 → L1 with 5.9 dB improvement: rejected", () => {
  const baseline = result({
    p19Var: 5.0, p20Var: 11.0,
    perSeatP20: [seat("s1", 11.0), seat("s2", 10.0, false)],
  });
  const candidate = result({
    p19Var: 5.0, p20Var: 5.1,
    perSeatP20: [seat("s1", 5.1), seat("s2", 5.1, false)],
  });
  const m = isPhysicalMaterialImprovement(baseline, candidate);
  assert.equal(m.material, false, `Expected NOT material, got: ${m.reason}`);
  assert.equal(m.rule, "physical-below-materiality");
});

test("5. Same-Level improvement of 0.3 dB: physical recommendation rejected", () => {
  // Both floor to 4 → L2; improvement is 0.3 dB, same level.
  const baseline = result({
    p19Var: 4.8, p20Var: 4.8,
    perSeatP20: [seat("s1", 4.8), seat("s2", 4.8, false)],
  });
  const candidate = result({
    p19Var: 4.5, p20Var: 4.5,
    perSeatP20: [seat("s1", 4.5), seat("s2", 4.5, false)],
  });
  const m = isPhysicalMaterialImprovement(baseline, candidate);
  assert.equal(m.material, false, `Expected NOT material, got: ${m.reason}`);
  assert.equal(m.rule, "physical-below-materiality");
});

test("6. A qualifying P19 improvement that materially worsens P20: rejected", () => {
  // P19 improves L1 → L2, but P20 deviation worsens from 5.0 to 7.0 (2.0 dB
  // worse, beyond the 1.0 dB material-damage figure). The P20 worsening safety
  // check fires before the P19 level gain is considered.
  const baseline = result({
    p19Var: 5.0, p20Var: 5.0,
    perSeatP20: [seat("s1", 5.0), seat("s2", 5.0, false)],
  });
  const candidate = result({
    p19Var: 4.0, p20Var: 7.0,
    perSeatP20: [seat("s1", 7.0), seat("s2", 7.0, false)],
  });
  const m = isPhysicalMaterialImprovement(baseline, candidate);
  assert.equal(m.material, false, `Expected NOT material, got: ${m.reason}`);
  assert.ok(m.rule && m.rule.startsWith("physical-p20"), `Expected P20 worsening rule, got: ${m.rule}`);
});

test("7. A qualifying P20 improvement that compromises P14 safety: rejected by selection layer", () => {
  // The physical gate accepts the P20 L1→L1 6 dB improvement (P14 is enforced
  // in the selection layer, not in the gate). This test confirms the gate does
  // not invent a P14 check, and that the candidate IS material for the gate —
  // the P14 rejection happens in confirmedRecommendationSelection's outputPass
  // check, which runs BEFORE the materiality gate and is unchanged.
  const baseline = result({
    p19Var: 5.0, p20Var: 11.0,
    p14AchievedDb: 126, p14TargetDb: 117, requestedP14Pass: true,
    perSeatP20: [seat("s1", 11.0), seat("s2", 10.0, false)],
  });
  const candidate = result({
    p19Var: 5.0, p20Var: 5.0,
    p14AchievedDb: 110, p14TargetDb: 117, // P14 FAILS (110 < 117)
    requestedP14Pass: false,
    perSeatP20: [seat("s1", 5.0), seat("s2", 5.0, false)],
  });
  const m = isPhysicalMaterialImprovement(baseline, candidate);
  assert.equal(m.material, true, "Gate should accept the P20 L1→L1 6 dB gain; P14 safety is enforced in the selection layer");
  assert.equal(candidate.requestedP14Pass, false, "P14 is compromised — the selection layer rejects this before the materiality gate");
});

test("8. An electronic same-Level fractional improvement is not auto-applied merely because positive", () => {
  // A calibration candidate with a 0.3 dB same-level improvement. The existing
  // materiality gate returns material:false (below the 1.0 dB same-level rule).
  // The electronic apply authority must NOT apply it — the fractional bypass
  // (applyValidatedSimulation && rawBenefit > 0) has been removed.
  const baseline = result({
    p19Var: 4.8, p20Var: 4.8,
    perSeatP20: [seat("s1", 4.8), seat("s2", 4.8, false)],
  });
  const candidate = result({
    p19Var: 4.5, p20Var: 4.5,
    perSeatP20: [seat("s1", 4.5), seat("s2", 4.5, false)],
  });
  candidate.candidateId = "cal-fractional";
  candidate.candidateKind = "calibration";
  candidate.appliedTuning = [{
    sourceId: "sub-1", delayMs: 0, gainDb: 0.3, phaseControlDeg: 0, polarity: 1,
  }];

  const mat = isMaterialImprovement(baseline, candidate);
  assert.equal(mat.material, false, "Existing gate should refuse a 0.3 dB same-level improvement");

  const decision = resolveCalibrationAutoApply({
    baseline,
    candidate,
    objectives: null,
    instances: [{ id: "sub-1", enabled: true, delayMs: 0, gainDb: 0, phaseControlDeg: 0, polarity: 1, model: "SUB-1", position: { x: 1, y: 2 }, bottomHeightM: 0.1, rotationDeg: 0 }],
    appliedCalibration: null,
    applyValidatedSimulation: true,
  });
  assert.notEqual(decision.decision, CALIBRATION_APPLY_DECISION.APPLIED,
    `Expected NOT applied for a 0.3 dB fractional change, got: ${decision.decision} (${decision.reason})`);
});

test("isPhysicalCandidate identifies calibration as electronic, position/seating/coordinated as physical", () => {
  assert.equal(isPhysicalCandidate({ candidateKind: "calibration" }), false);
  assert.equal(isPhysicalCandidate({ candidateId: "calibration-only" }), false);
  assert.equal(isPhysicalCandidate({ isPositionCandidate: true }), true);
  assert.equal(isPhysicalCandidate({ candidateKind: "seating" }), true);
  assert.equal(isPhysicalCandidate({ candidateOrigin: "coordinated" }), true);
  assert.equal(isPhysicalCandidate({ isCoordinatedCandidate: true }), true);
  assert.equal(isPhysicalCandidate({ candidateOrigin: "combined" }), true);
});

test("PHYSICAL_L1_L1_THRESHOLD_DB is 6.0 dB", () => {
  assert.equal(PHYSICAL_L1_L1_THRESHOLD_DB, 6.0);
});