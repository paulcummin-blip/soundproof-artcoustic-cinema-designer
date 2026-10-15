// electronicCandidateSafetyAuthority.js
// ---------------------------------------------------------------------------
// THE ONE authority for automatic electronic candidate comparison.
//
// PRODUCT RULE THIS EXISTS TO SATISFY
//
//   Gain, delay, phase and polarity are CALCULATION variables, not design
//   decisions. Sound Proof does not ask the designer to approve a better safe
//   electronic state — it uses it.
//
// A candidate may be adopted automatically only when, beyond the canonical
// electronic tolerance, ALL of these hold:
//
//   1. NO Primary seat gets worse.
//   2. NO required protected aggregate metric gets worse.
//   3. NO Secondary seat gets MATERIALLY worse.
//   4. At least one useful result improves.
//
// Nothing has to clear 1 dB to be adopted: a continuous improvement inside the
// same RP22 grade is a real improvement, and the old 1 dB action threshold is
// deliberately NOT consulted here.
//
// An unsafe candidate is never adopted — not even when it improves the overall
// result, and not even when its improvement is much larger than its damage.
//
// WHAT THIS MODULE IS NOT
//   • NOT a physical authority: it reads only the canonical acoustic values of a
//     confirmed candidate, and it can never choose a physical change.
//   • NOT the approval authority. adiCalibrationAutoApplyAuthority.js still owns
//     the "does the designer approve this" workflow and is unchanged.
//   • NOT acoustic maths: it reads the canonical P19/P20/P14/P18 values a
//     confirmed result already carries and states what they prove. It changes no
//     equation, no grading, no scoring and no threshold of its own.
//   • NOT a weighted scoring system: selection among safe candidates is a
//     deterministic lexicographic comparison, in the documented priority order.
//
// PURE. No React, no stores, no worker, no acoustic maths.
// ---------------------------------------------------------------------------

import {
  ELECTRONIC_COMPARISON_TOLERANCE_DB,
  SECONDARY_MATERIAL_REGRESSION_DB,
  finiteNumber,
  improvedBy,
  levelValue,
  worsenedBy,
} from "./electronicComparisonTolerance.js";

/** What the authority concluded about one candidate. */
export const ELECTRONIC_SAFETY_VERDICT = Object.freeze({
  /** Adoptable automatically: safe, and it improves something. */
  AUTO_SAFE: "auto-safe",
  /** Refused: it worsens a protected result. */
  REJECTED: "rejected",
  /** Nothing improved beyond tolerance: the baseline is kept. */
  NO_IMPROVEMENT: "no-improvement",
  /** The canonical seat evidence is not there to judge with. */
  INVALID: "invalid",
});

/** WHY a candidate was refused, or what makes it adoptable. */
export const ELECTRONIC_SAFETY_REASON = Object.freeze({
  MISSING_CANONICAL_EVIDENCE: "missing-canonical-evidence",
  PRIMARY_SEAT_REGRESSION: "primary-seat-regression",
  PROTECTED_METRIC_REGRESSION: "protected-metric-regression",
  SECONDARY_SEAT_REGRESSION: "secondary-seat-regression",
  NO_IMPROVEMENT: "no-improvement-beyond-tolerance",
  SAFE_IMPROVEMENT: "safe-improvement",
});

/** The protected aggregate metrics, and the direction that counts as worse. */
export const PROTECTED_METRIC = Object.freeze({
  P19: "P19",
  P20: "P20",
  P14: "P14",
  P18: "P18",
  OUTPUT: "output",
});

const round1 = (value) => Math.round(Number(value) * 10) / 10;

/** The canonical per-seat P20 rows of a result — the per-seat metric. */
function seatRows(result) {
  const rows = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  return rows.filter((row) => row && row.seatId !== null && row.seatId !== undefined);
}

/**
 * Which protection a seat gets. Conservative, and consistent with the engine's
 * own seat validation: a seat that is not explicitly secondary is protected as
 * PRIMARY. A seat can never lose protection through a missing flag.
 */
function isPrimarySeat(row) {
  return row?.isPrimary !== false;
}

/** The canonical aggregate values a result publishes, read as written. */
function aggregates(result) {
  return {
    p19Level: levelValue(result?.achievedP19Level),
    p19Db: finiteNumber(result?.achievedP19VariationDb),
    p20Level: levelValue(result?.achievedP20Level),
    p20Db: finiteNumber(result?.achievedP20VariationDb),
    p14Level: levelValue(result?.p14AchievedLevel),
    p14Db: finiteNumber(result?.p14AchievedDb),
    p18Level: levelValue(result?.p18AchievedLevel),
    p18Hz: finiteNumber(result?.achievedP18Hz),
  };
}

/** Can this result be judged at all? P20 is the per-seat metric and is required. */
function hasComparableSeatEvidence(result) {
  const rows = seatRows(result);
  return rows.length > 0 && rows.some((row) => finiteNumber(row.variationDbRaw) !== null);
}

/**
 * Seat regressions between two scoped seat sets.
 *
 * A grade drop is always a regression. When the grade HOLDS, the raw deviation is
 * compared at the caller's tolerance — strict for a Primary seat, material for a
 * Secondary one. A seat whose grade IMPROVED is never reported as a regression:
 * the grade is the stronger statement about that seat.
 */
function seatRegressions(beforeRows, afterRows, { tolerance, material }) {
  const threshold = material ? SECONDARY_MATERIAL_REGRESSION_DB : tolerance;
  const beforeById = new Map(beforeRows.map((row) => [String(row.seatId), row]));
  const findings = [];
  for (const row of afterRows) {
    const previous = beforeById.get(String(row.seatId));
    if (!previous) continue;
    const fromLevel = levelValue(previous.level);
    const toLevel = levelValue(row.level);
    if (fromLevel !== null && toLevel !== null && toLevel < fromLevel) {
      findings.push({ seatId: row.seatId, parameter: "P20", kind: "level-drop", fromLevel, toLevel });
      continue;
    }
    const worse = worsenedBy(previous.variationDbRaw, row.variationDbRaw, threshold);
    if (worse > 0) {
      findings.push({
        seatId: row.seatId,
        parameter: "P20",
        kind: "same-level-raw-regression",
        rawDeltaDb: round1(worse),
        fromLevel,
        toLevel,
        thresholdDb: threshold,
      });
    }
  }
  return findings;
}

/**
 * Did a required protected aggregate metric get worse? Each metric is read with
 * the direction that means "worse" for it: P19/P20 deviation is a magnitude
 * (lower better), P14 capability is dB (higher better), P18 extension is Hz
 * (lower better), and an output pass that was held and is now lost is a
 * regression whatever the numbers say.
 */
function protectedMetricRegressions(before, after, tolerance) {
  const a = aggregates(before);
  const b = aggregates(after);
  const findings = [];

  const worseDeviation = (parameter, fromDb, toDb) => {
    const worse = worsenedBy(fromDb, toDb, tolerance);
    if (worse > 0) findings.push({ parameter, kind: "deviation-worse", rawDeltaDb: round1(worse) });
    return worse > 0;
  };
  const levelDrop = (parameter, fromLevel, toLevel) => {
    if (fromLevel !== null && toLevel !== null && toLevel < fromLevel) {
      findings.push({ parameter, kind: "level-drop", fromLevel, toLevel });
      return true;
    }
    return false;
  };

  if (!levelDrop(PROTECTED_METRIC.P19, a.p19Level, b.p19Level)) worseDeviation(PROTECTED_METRIC.P19, a.p19Db, b.p19Db);
  if (!levelDrop(PROTECTED_METRIC.P20, a.p20Level, b.p20Level)) worseDeviation(PROTECTED_METRIC.P20, a.p20Db, b.p20Db);

  if (!levelDrop(PROTECTED_METRIC.P14, a.p14Level, b.p14Level)) {
    if (a.p14Db !== null && b.p14Db !== null && a.p14Db - b.p14Db > tolerance) {
      findings.push({ parameter: PROTECTED_METRIC.P14, kind: "capability-drop", rawDeltaDb: round1(a.p14Db - b.p14Db) });
    }
  }
  if (!levelDrop(PROTECTED_METRIC.P18, a.p18Level, b.p18Level)) {
    if (a.p18Hz !== null && b.p18Hz !== null && b.p18Hz - a.p18Hz > tolerance) {
      findings.push({ parameter: PROTECTED_METRIC.P18, kind: "extension-worse", fromHz: a.p18Hz, toHz: b.p18Hz });
    }
  }
  if (before?.requestedP14Pass !== false && after?.requestedP14Pass === false) {
    findings.push({ parameter: PROTECTED_METRIC.OUTPUT, kind: "output-pass-lost" });
  }
  return findings;
}

/**
 * EVERY useful improvement of the candidate over the baseline, beyond tolerance.
 * A level gain, or a continuous deviation improvement inside the same grade —
 * on the aggregate result and on any seat.
 */
function improvementFindings(before, after, beforeRows, afterRows, tolerance) {
  const a = aggregates(before);
  const b = aggregates(after);
  const findings = [];
  const gain = (parameter, scope, seatId, fromLevel, toLevel) => findings.push({
    parameter, scope, seatId: seatId || null, kind: "level-gain", fromLevel, toLevel,
  });
  const better = (parameter, scope, seatId, gainDb) => findings.push({
    parameter, scope, seatId: seatId || null, kind: "deviation-improved", gainDb: round1(gainDb),
  });

  if (a.p19Level !== null && b.p19Level !== null && b.p19Level > a.p19Level) gain("P19", "aggregate", null, a.p19Level, b.p19Level);
  else {
    const p19Gain = improvedBy(a.p19Db, b.p19Db, tolerance);
    if (p19Gain > 0) better("P19", "aggregate", null, p19Gain);
  }
  if (a.p20Level !== null && b.p20Level !== null && b.p20Level > a.p20Level) gain("P20", "aggregate", null, a.p20Level, b.p20Level);
  else {
    const p20Gain = improvedBy(a.p20Db, b.p20Db, tolerance);
    if (p20Gain > 0) better("P20", "aggregate", null, p20Gain);
  }

  const beforeById = new Map(beforeRows.map((row) => [String(row.seatId), row]));
  for (const row of afterRows) {
    const previous = beforeById.get(String(row.seatId));
    if (!previous) continue;
    const scope = isPrimarySeat(row) ? "primary" : "secondary";
    const fromLevel = levelValue(previous.level);
    const toLevel = levelValue(row.level);
    if (fromLevel !== null && toLevel !== null && toLevel > fromLevel) {
      gain("P20", scope, row.seatId, fromLevel, toLevel);
      continue;
    }
    const seatGain = improvedBy(previous.variationDbRaw, row.variationDbRaw, tolerance);
    if (seatGain > 0) better("P20", scope, row.seatId, seatGain);
  }
  return findings;
}

function record(verdict, reasonCode, reasons, improvements, candidateId, tolerance) {
  return {
    verdict,
    autoSafe: verdict === ELECTRONIC_SAFETY_VERDICT.AUTO_SAFE,
    reasonCode,
    reasons,
    improvements,
    candidateId,
    tolerance,
  };
}

/**
 * Classify ONE electronic candidate against the baseline the designer is shown.
 *
 * @param {object} params
 * @param {object|null} params.baseline - the installed-tuning canonical result
 * @param {object|null} params.candidate - a canonically confirmed electronic candidate
 * @param {number} [params.tolerance] - override for tests only
 * @returns {{verdict, autoSafe, reasonCode, reasons, improvements, candidateId, tolerance}}
 */
export function classifyElectronicCandidate({
  baseline = null,
  candidate = null,
  tolerance = ELECTRONIC_COMPARISON_TOLERANCE_DB,
} = {}) {
  const t = finiteNumber(tolerance) ?? ELECTRONIC_COMPARISON_TOLERANCE_DB;
  const candidateId = String(candidate?.candidateId || candidate?.id || "");

  if (!hasComparableSeatEvidence(baseline) || !hasComparableSeatEvidence(candidate)) {
    return record(
      ELECTRONIC_SAFETY_VERDICT.INVALID,
      ELECTRONIC_SAFETY_REASON.MISSING_CANONICAL_EVIDENCE,
      [{ code: ELECTRONIC_SAFETY_REASON.MISSING_CANONICAL_EVIDENCE }],
      [],
      candidateId,
      t,
    );
  }

  const beforeRows = seatRows(baseline);
  const afterRows = seatRows(candidate);
  const primaryRegressions = seatRegressions(
    beforeRows.filter(isPrimarySeat),
    afterRows.filter(isPrimarySeat),
    { tolerance: t, material: false },
  );
  const protectedRegressions = protectedMetricRegressions(baseline, candidate, t);
  const secondaryRegressions = seatRegressions(
    beforeRows.filter((row) => !isPrimarySeat(row)),
    afterRows.filter((row) => !isPrimarySeat(row)),
    { tolerance: t, material: true },
  );
  const improvements = improvementFindings(baseline, candidate, beforeRows, afterRows, t);

  // The rejection order IS the protection priority: Primary seats first, then the
  // required protected metrics, then Secondary seats.
  const reasons = [];
  if (primaryRegressions.length) reasons.push({ code: ELECTRONIC_SAFETY_REASON.PRIMARY_SEAT_REGRESSION, seats: primaryRegressions });
  if (protectedRegressions.length) reasons.push({ code: ELECTRONIC_SAFETY_REASON.PROTECTED_METRIC_REGRESSION, metrics: protectedRegressions });
  if (secondaryRegressions.length) reasons.push({ code: ELECTRONIC_SAFETY_REASON.SECONDARY_SEAT_REGRESSION, seats: secondaryRegressions });

  if (reasons.length) {
    return record(ELECTRONIC_SAFETY_VERDICT.REJECTED, reasons[0].code, reasons, improvements, candidateId, t);
  }
  if (!improvements.length) {
    return record(
      ELECTRONIC_SAFETY_VERDICT.NO_IMPROVEMENT,
      ELECTRONIC_SAFETY_REASON.NO_IMPROVEMENT,
      [{ code: ELECTRONIC_SAFETY_REASON.NO_IMPROVEMENT }],
      improvements,
      candidateId,
      t,
    );
  }
  return record(ELECTRONIC_SAFETY_VERDICT.AUTO_SAFE, ELECTRONIC_SAFETY_REASON.SAFE_IMPROVEMENT, [], improvements, candidateId, t);
}

/**
 * THE PRIORITY OF A SAFE CANDIDATE, as an ascending tuple (lower = better).
 *
 *   1. best Primary-seat result   worst Primary-seat deviation, then Primary floor grade
 *   2. best overall P19/P20       level first, then the continuous figure
 *   3. best Secondary-seat result worst Secondary-seat deviation, then floor grade
 *   4. existing safety/output tie-breakers  capability, extension, then grades
 *
 * Deterministic lexicographic comparison. No weights, no arbitrary scoring.
 */
export function buildElectronicPriorityTuple(result) {
  const rows = seatRows(result);
  const primary = rows.filter(isPrimarySeat);
  const secondary = rows.filter((row) => !isPrimarySeat(row));
  const a = aggregates(result);
  const worstDeviation = (scoped) => (scoped.length
    ? Math.max(...scoped.map((row) => Math.abs(finiteNumber(row.variationDbRaw) ?? 0)))
    : 0);
  const floorGrade = (scoped) => (scoped.length
    ? -Math.min(...scoped.map((row) => levelValue(row.level) ?? 0))
    : 0);
  return [
    worstDeviation(primary),
    floorGrade(primary),
    a.p19Level !== null ? -a.p19Level : 0,
    a.p19Db ?? 0,
    a.p20Level !== null ? -a.p20Level : 0,
    a.p20Db ?? 0,
    worstDeviation(secondary),
    floorGrade(secondary),
    a.p14Db !== null ? -a.p14Db : 0,
    a.p18Hz ?? 0,
    a.p14Level !== null ? -a.p14Level : 0,
    a.p18Level !== null ? -a.p18Level : 0,
  ];
}

/**
 * Compare two results by the priority above, treating differences inside the
 * canonical tolerance as equal, and breaking a true tie on a stable identity so
 * the same inputs always produce the same winner.
 */
export function compareElectronicPriority(a, b, tolerance = ELECTRONIC_COMPARISON_TOLERANCE_DB) {
  const t = finiteNumber(tolerance) ?? ELECTRONIC_COMPARISON_TOLERANCE_DB;
  const left = buildElectronicPriorityTuple(a);
  const right = buildElectronicPriorityTuple(b);
  for (let index = 0; index < left.length; index += 1) {
    const lv = left[index] ?? 0;
    const rv = right[index] ?? 0;
    if (Math.abs(lv - rv) > t) return lv - rv;
  }
  return String(a?.candidateId || "").localeCompare(String(b?.candidateId || ""));
}

/**
 * THE AUTOMATIC DECISION for a set of confirmed electronic candidates.
 *
 * Every candidate is classified first, and only the AUTO_SAFE ones compete. When
 * none is safe, or none improves anything, the baseline is kept — the caller
 * publishes the installed-tuning result and nothing was changed.
 *
 * @param {object} params
 * @param {object|null} params.baseline - the installed-tuning canonical result
 * @param {Array} params.candidates - canonically confirmed electronic candidates
 * @returns {{winner, winnerRecord, safe, excluded, considered, keptBaseline, tolerance}}
 */
export function selectBestAutoSafeElectronicCandidate({
  baseline = null,
  candidates = [],
  tolerance = ELECTRONIC_COMPARISON_TOLERANCE_DB,
} = {}) {
  const t = finiteNumber(tolerance) ?? ELECTRONIC_COMPARISON_TOLERANCE_DB;
  const considered = (Array.isArray(candidates) ? candidates : [])
    .filter(Boolean)
    .map((candidate) => ({ ...classifyElectronicCandidate({ baseline, candidate, tolerance: t }), candidate }));

  const safe = considered.filter((entry) => entry.verdict === ELECTRONIC_SAFETY_VERDICT.AUTO_SAFE);
  const excluded = considered.filter((entry) => entry.verdict !== ELECTRONIC_SAFETY_VERDICT.AUTO_SAFE);

  let winnerRecord = null;
  for (const entry of safe) {
    if (!winnerRecord || compareElectronicPriority(entry.candidate, winnerRecord.candidate, t) < 0) {
      winnerRecord = entry;
    }
  }

  return {
    winner: winnerRecord?.candidate || null,
    winnerRecord,
    safe,
    excluded,
    considered,
    keptBaseline: !winnerRecord,
    tolerance: t,
  };
}