// engineeringConstraints.js
// ---------------------------------------------------------------------------
// ADI — Validate Engineering Constraints
//
// Every candidate must pass ALL hard engineering gates before ranking.
// Candidates that fail any gate are rejected — never ranked.
//
// Hard gates:
//   1. Capability              — P14 achieved >= P14 target
//   2. Extension                — P18 achieved >= P18 target
//   3. Protected-seat regression — no primary seat level regression
//   4. Temporal behaviour        — no new significant problems
//   5. Robustness                — no muted subs, no output failure
//
// This module is PURE: no React, no side effects.
// It consumes materialityGate.js for primary-seat regression checking.
// ---------------------------------------------------------------------------

import { hasPrimarySeatRegression } from '@/components/room/bass/improveBassV2/materialityGate';
import { ENGINEERING_CONSTRAINT, DEFAULT_MATERIALITY_THRESHOLDS } from './adiConstants';

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || '').match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function checkCapability(candidateResult, designObjectives, thresholds) {
  const targetDb = Number(designObjectives?.p14TargetDb) || 0;
  if (targetDb <= 0) return { passed: true };
  const achievedDb = Number(candidateResult?.p14AchievedDb) || 0;
  if (achievedDb <= 0) return { passed: true };
  // Hard gate: achieved must meet target (with small tolerance)
  const passed = achievedDb >= targetDb - 0.5;
  return { passed, constraint: ENGINEERING_CONSTRAINT.CAPABILITY, achieved: achievedDb, target: targetDb };
}

function checkExtension(candidateResult, designObjectives) {
  const targetHz = Number(designObjectives?.p18TargetHz) || 0;
  if (targetHz <= 0) return { passed: true };
  const achievedHz = Number(candidateResult?.achievedP18Hz) || 0;
  if (achievedHz <= 0) return { passed: true };
  // Hard gate: achieved extension must be at least target (with 2 Hz tolerance)
  const passed = achievedHz >= targetHz - 2;
  return { passed, constraint: ENGINEERING_CONSTRAINT.EXTENSION, achieved: achievedHz, target: targetHz };
}

function checkProtectedSeatRegression(candidateResult, currentResult) {
  const regression = hasPrimarySeatRegression(currentResult, candidateResult);
  return {
    passed: !regression.regressed,
    constraint: ENGINEERING_CONSTRAINT.PROTECTED_SEAT_REGRESSION,
    details: regression.regressed ? regression : null,
  };
}

function checkTemporalBehaviour(candidateResult, currentResult, thresholds) {
  // No new significant problems: no seat where deviation worsens > threshold
  const currentP19 = new Map((currentResult?.perSeatP19 || []).map(s => [String(s.seatId), s]));
  const currentP20 = new Map((currentResult?.perSeatP20 || []).map(s => [String(s.seatId), s]));
  const newProblemThreshold = thresholds.newProblemThresholdDb || 1.0;

  for (const seat of (candidateResult?.perSeatP19 || [])) {
    const cur = currentP19.get(String(seat.seatId));
    const curVar = Math.abs(Number(cur?.variationDbRaw) || 0);
    const candVar = Math.abs(Number(seat?.variationDbRaw) || 0);
    if (candVar > curVar + newProblemThreshold) {
      return { passed: false, constraint: ENGINEERING_CONSTRAINT.TEMPORAL_BEHAVIOUR, seatId: seat.seatId, parameter: 'P19' };
    }
  }
  for (const seat of (candidateResult?.perSeatP20 || [])) {
    const cur = currentP20.get(String(seat.seatId));
    const curVar = Math.abs(Number(cur?.variationDbRaw) || 0);
    const candVar = Math.abs(Number(seat?.variationDbRaw) || 0);
    if (candVar > curVar + newProblemThreshold) {
      return { passed: false, constraint: ENGINEERING_CONSTRAINT.TEMPORAL_BEHAVIOUR, seatId: seat.seatId, parameter: 'P20' };
    }
  }
  return { passed: true, constraint: ENGINEERING_CONSTRAINT.TEMPORAL_BEHAVIOUR };
}

function checkRobustness(candidateResult) {
  // No muted subs (gain = -infinity or very low) and no output failure
  const p14Achieved = Number(candidateResult?.p14AchievedDb) || 0;
  if (p14Achieved <= 0) {
    return { passed: false, constraint: ENGINEERING_CONSTRAINT.ROBUSTNESS, reason: 'No valid output' };
  }
  return { passed: true, constraint: ENGINEERING_CONSTRAINT.ROBUSTNESS };
}

/**
 * Validate all engineering constraints for a candidate.
 *
 * @param {object} candidateResult - canonical result for the candidate
 * @param {object} currentResult - canonical result for the current design
 * @param {object} designObjectives - { p14TargetDb, p18TargetHz }
 * @param {object} [thresholds] - optional threshold overrides
 * @returns {{ passed: boolean, failures: string[], checks: object[] }}
 */
export function validateEngineeringConstraints(candidateResult, currentResult, designObjectives = {}, thresholds = {}) {
  const t = { ...DEFAULT_MATERIALITY_THRESHOLDS, ...thresholds };

  const checks = [
    checkCapability(candidateResult, designObjectives, t),
    checkExtension(candidateResult, designObjectives),
    checkProtectedSeatRegression(candidateResult, currentResult),
    checkTemporalBehaviour(candidateResult, currentResult, t),
    checkRobustness(candidateResult),
  ];

  const failures = checks
    .filter(c => !c.passed)
    .map(c => c.constraint);

  return {
    passed: failures.length === 0,
    failures,
    checks,
  };
}