// bassLimitingFactorAuthority.js
// ---------------------------------------------------------------------------
// ADI — Limiting Factor Priority Authority
//
// ADI must always lead with the most professionally important UNRESOLVED
// limitation. The priority order is fixed:
//
//   1. Hard target not achieved — output capability failure (P14)
//   2. Severe P20 seat-to-seat inconsistency
//   3. Severe P19 reference-seat response failure
//   4. P18 extension failure — ONLY when the selected P18 target is genuinely
//      missed (achieved grade below the selected target level)
//   5. Lower-severity polish (room mode / local cancellation / mild spread)
//
// ADI must NOT lead with P18 extension when the P18 target is achieved, when
// P19 fails, or when P20 variation is severe.
//
// SEVERITY SOURCE
// Severity is read from the EXISTING grading policy (gradeP19 / gradeP20 /
// gradeP18ForBasis). This module introduces no new RP22 threshold and no new
// grading rule: "severe" means "does not reach L2", decided by the canonical
// graders. This matters because P20 has no FAIL grade — a 20 dB P20 variation
// is still displayed as L1. Severity must therefore come from the dB value,
// never from "no seat is below L1".
//
// SCOPE
// This authority is the ADI diagnosis. The optimiser's own recoverability
// classification (correctabilityClassifier) deliberately keeps its existing
// diagnosis input and is NOT routed through this module.
//
// This module is PURE: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

import {
  gradeP18ForBasis,
  normalizeP18TargetBasis,
  p18ThresholdHzForLevel,
} from '@/components/utils/p18ExtensionAuthority';
import {
  bassRankFromLevel,
  gradeP19,
  gradeP20,
} from '@/components/utils/rp22/bassGradingAuthority';
import { PROBLEM_TYPE } from './recommendationTypes.js';
import { identifyProblem } from './recommendationProblem.js';

// ── Severity constants ───────────────────────────────────────────────────
//
// L2_RANK is the existing RP22 level rank for L2 (FAIL=0, L1=1, L2=2). A
// metric below it does not meet L2. No new threshold is created here.

export const ADI_SEVERITY = Object.freeze({
  L2_RANK: 2,
  P14_SHORTFALL_TOLERANCE_DB: 0.5,
  P18_HZ_TOLERANCE: 2,
});

const ARRAY_INTERACTION_MIN_SUBS = 2;

// ── Small helpers ────────────────────────────────────────────────────────

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const rank = bassRankFromLevel(value);
  return rank == null ? 0 : rank;
}

function positiveNum(value) {
  const n = num(value);
  return n != null && n > 0 ? n : null;
}

function worstRow(rows, key) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows.reduce((worst, row) => {
    if (!worst) return row;
    return Math.abs(num(row?.[key]) || 0) > Math.abs(num(worst?.[key]) || 0) ? row : worst;
  }, null);
}

function deviations(rows, key) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => num(row?.[key]))
    .filter((value) => value != null)
    .map((value) => Math.abs(value));
}

// ── Severity resolution ──────────────────────────────────────────────────

/**
 * Resolve the severity of each candidate limiting factor from the canonical
 * bass evidence. Every flag is derived from the existing graders.
 *
 * @param {object} evidence - canonical ADI bass evidence (buildAdiBassEvidence)
 * @param {object} [objectives] - { p14TargetDb, p14Level, p18TargetBasis, p18TargetHz }
 * @returns {object} severity assessment for capability, seat consistency,
 *   reference-seat response and extension
 */
export function resolveBassLimitationSeverity(evidence, objectives = {}) {
  const e = evidence || {};
  const perSeatP20 = Array.isArray(e.perSeatP20) ? e.perSeatP20 : [];
  const perSeatP19 = Array.isArray(e.perSeatP19) ? e.perSeatP19 : [];

  // ── P20 seat-to-seat consistency ──
  const p20SeatDeviations = deviations(perSeatP20, 'variationDbRaw');
  const p20AggregateDeviation = num(e.p20Aggregate?.value);
  const p20Assessable = p20SeatDeviations.length > 0 || p20AggregateDeviation != null;
  const p20WorstDeviationDb = Math.max(
    p20SeatDeviations.reduce((max, value) => Math.max(max, value), 0),
    p20AggregateDeviation == null ? 0 : Math.abs(p20AggregateDeviation),
  );
  const p20Grade = p20Assessable ? gradeP20(p20WorstDeviationDb) : null;
  const p20FailingSeats = perSeatP20.filter((seat) => numericLevel(seat?.level) === 0).length;
  const p20SpreadDb = p20SeatDeviations.length >= 2
    ? Math.max(...p20SeatDeviations) - Math.min(...p20SeatDeviations)
    : 0;
  const seatConsistencySevere = p20Assessable
    && ((p20Grade != null && p20Grade < ADI_SEVERITY.L2_RANK) || p20FailingSeats > 0);

  // ── P19 reference-seat response ──
  const p19SeatDeviations = deviations(perSeatP19, 'variationDbRaw');
  const p19AggregateDeviation = num(e.p19Aggregate?.value);
  const p19Assessable = p19SeatDeviations.length > 0 || p19AggregateDeviation != null;
  const p19WorstDeviationDb = Math.max(
    p19SeatDeviations.reduce((max, value) => Math.max(max, value), 0),
    p19AggregateDeviation == null ? 0 : Math.abs(p19AggregateDeviation),
  );
  const p19Grade = p19Assessable ? gradeP19(p19WorstDeviationDb) : null;
  const p19FailingSeats = perSeatP19.filter((seat) => numericLevel(seat?.level) === 0).length;
  const responseSevere = p19Assessable
    && ((p19Grade != null && p19Grade < ADI_SEVERITY.L2_RANK) || p19FailingSeats > 0);

  // ── P14 output capability ──
  const p14AchievedDb = positiveNum(e.p14AchievedDb);
  const p14TargetDb = positiveNum(objectives.p14TargetDb);
  const p14Assessable = p14AchievedDb != null && p14TargetDb != null;
  const p14ShortfallDb = p14Assessable ? p14TargetDb - p14AchievedDb : 0;
  const capabilityNotAchieved = p14Assessable
    && p14ShortfallDb > ADI_SEVERITY.P14_SHORTFALL_TOLERANCE_DB;

  // ── P18 extension: only a genuine miss of the SELECTED target counts ──
  const basis = normalizeP18TargetBasis(
    objectives.p18TargetBasis ?? objectives.selectedP18TargetBasis,
  );
  const targetLevel = num(objectives.p14Level ?? objectives.p18TargetLevel);
  const achievedHz = positiveNum(e.achievedP18Hz);
  const requiredHz = targetLevel != null
    ? p18ThresholdHzForLevel(basis, targetLevel)
    : positiveNum(objectives.selectedP18RequiredExtensionHz ?? objectives.p18TargetHz);
  const achievedGrade = achievedHz == null ? null : gradeP18ForBasis(achievedHz, basis);
  const extensionAssessable = achievedHz != null && (achievedGrade != null || requiredHz != null);
  const targetMissed = extensionAssessable && (
    achievedGrade != null && targetLevel != null
      ? achievedGrade < targetLevel
      : requiredHz != null && achievedHz > requiredHz + ADI_SEVERITY.P18_HZ_TOLERANCE
  );
  const extensionGapHz = requiredHz != null && achievedHz != null
    ? requiredHz - achievedHz
    : null;

  return {
    capability: {
      assessable: p14Assessable,
      achievedDb: p14AchievedDb,
      targetDb: p14TargetDb,
      shortfallDb: p14ShortfallDb,
      notAchieved: capabilityNotAchieved,
    },
    seatConsistency: {
      assessable: p20Assessable,
      worstDeviationDb: p20WorstDeviationDb,
      spreadDb: p20SpreadDb,
      grade: p20Grade,
      failingSeats: p20FailingSeats,
      severe: seatConsistencySevere,
    },
    responseSmoothness: {
      assessable: p19Assessable,
      deviationDb: p19WorstDeviationDb,
      grade: p19Grade,
      failingSeats: p19FailingSeats,
      severe: responseSevere,
    },
    extension: {
      assessable: extensionAssessable,
      achievedHz,
      requiredHz,
      achievedGrade,
      targetLevel,
      basis,
      targetMissed,
      gapHz: extensionGapHz,
    },
  };
}

// ── Problem construction ─────────────────────────────────────────────────

function seatRow(rows, aggregate) {
  const worst = worstRow(rows, 'variationDbRaw');
  if (worst) return worst;
  if (aggregate) {
    return {
      seatId: aggregate.seatId || null,
      variationDbRaw: num(aggregate.value),
      level: aggregate.level,
      worstFrequencyHz: num(aggregate.worstFrequencyHz) || 0,
      isPrimary: true,
    };
  }
  return null;
}

function buildMetrics(severity, context = {}) {
  return {
    worstSeatDeviationDb: severity.seatConsistency.worstDeviationDb,
    referenceSeatDeviationDb: severity.responseSmoothness.deviationDb,
    seatVariationSpreadDb: severity.seatConsistency.spreadDb,
    achievedP18Hz: severity.extension.achievedHz,
    requiredP18Hz: severity.extension.requiredHz,
    achievedP18Grade: severity.extension.achievedGrade,
    p18TargetLevel: severity.extension.targetLevel,
    p18TargetBasis: severity.extension.basis,
    subwooferCount: Number(context.subwooferCount) || 0,
    outputAndExtensionMet: !severity.capability.notAchieved && !severity.extension.targetMissed,
  };
}

function deviationText(value) {
  return `${Math.abs(Number(value) || 0).toFixed(1)} dB`;
}

/**
 * Identify the limiting factor ADI must lead with.
 *
 * @param {object} evidence - canonical ADI bass evidence
 * @param {object} [objectives] - { p14TargetDb, p14Level, p18TargetBasis, p18TargetHz }
 * @param {object} [context] - { subwooferCount, roomDims, seatingPositions }
 * @returns {{ type: string|null, description: string, worstSeat: object|null,
 *   severity: object, metrics: object }}
 */
export function identifyLimitingFactor(evidence, objectives = {}, context = {}) {
  if (!evidence) {
    return {
      type: PROBLEM_TYPE.NONE,
      description: 'No engineering results available.',
      worstSeat: null,
      severity: null,
      metrics: null,
    };
  }

  const severity = resolveBassLimitationSeverity(evidence, objectives);
  const metrics = buildMetrics(severity, context);
  const subwooferCount = metrics.subwooferCount;
  const seatWorst = seatRow(evidence.perSeatP20, evidence.p20Aggregate);
  const responseWorst = seatRow(evidence.perSeatP19, evidence.p19Aggregate);

  // ── Priority 1: hard target not achieved (output capability) ──
  if (severity.capability.notAchieved) {
    return {
      type: PROBLEM_TYPE.CAPABILITY,
      description: `Subwoofer output capability is the limiting factor. Achieved ${deviationText(severity.capability.achievedDb)} of the ${deviationText(severity.capability.targetDb)} target — a ${deviationText(severity.capability.shortfallDb)} shortfall.`,
      worstSeat: responseWorst,
      severity,
      metrics,
    };
  }

  // ── Priority 2 + 3: severe seat consistency and/or reference-seat response ──
  if (severity.seatConsistency.severe && severity.responseSmoothness.severe && subwooferCount >= ARRAY_INTERACTION_MIN_SUBS) {
    return {
      type: PROBLEM_TYPE.MULTI_SUB_INTERACTION,
      description: `The multiple-subwoofer placement is interacting poorly with the room. Worst seat deviation is ${deviationText(metrics.worstSeatDeviationDb)} and the reference-seat deviation is ${deviationText(metrics.referenceSeatDeviationDb)}.`,
      worstSeat: seatWorst || responseWorst,
      severity,
      metrics,
    };
  }

  if (severity.seatConsistency.severe) {
    return {
      type: PROBLEM_TYPE.SEAT_CONSISTENCY,
      description: `Seat-to-seat consistency is the limiting factor. Worst seat deviation is ${deviationText(metrics.worstSeatDeviationDb)} — the current result does not meet L2 seat-to-seat consistency.`,
      worstSeat: seatWorst,
      severity,
      metrics,
    };
  }

  if (severity.responseSmoothness.severe) {
    return {
      type: PROBLEM_TYPE.RESPONSE_SMOOTHNESS,
      description: `The reference-seat response is not currently controlled. Worst reference-seat deviation is ${deviationText(metrics.referenceSeatDeviationDb)}.`,
      worstSeat: responseWorst,
      severity,
      metrics,
    };
  }

  // ── Priority 4: extension, only when the selected target is genuinely missed ──
  if (severity.extension.targetMissed) {
    const achieved = metrics.achievedP18Hz == null ? 'unknown' : `${Number(metrics.achievedP18Hz).toFixed(0)} Hz`;
    const required = metrics.requiredP18Hz == null ? 'the selected target' : `${Number(metrics.requiredP18Hz).toFixed(0)} Hz`;
    return {
      type: PROBLEM_TYPE.EXTENSION,
      description: `Low-frequency extension is the limiting factor. Achieved ${achieved} against the selected ${required} target.`,
      worstSeat: responseWorst,
      severity,
      metrics,
    };
  }

  // ── Priority 5: lower-severity polish — existing (unchanged) heuristics ──
  // p18TargetHz is deliberately withheld so the legacy detector cannot
  // re-introduce an extension diagnosis the severity model has already
  // ruled out (the selected target is achieved).
  const polish = identifyProblem(evidence, {
    p14TargetDb: objectives.p14TargetDb ?? null,
    p18TargetHz: null,
  });
  return {
    ...polish,
    severity,
    metrics,
  };
}