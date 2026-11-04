import { gradeP19FromRaw, gradeP20FromRaw } from "../completedBassResultPersistence.js";
import { STAGE2_CANONICAL_VERSION } from "../stage2/stage2Constants.js";
import { normalisePhaseControlDeg } from "../../../../bass/core/subwooferPhaseControl.js";

export const RECOMMENDATION_CONTRACT_VERSION = "improve-bass-confirmed-v1";
const finite = value => typeof value === "number" && Number.isFinite(value);
export function canonicalLevel(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 4) return value;
  if (value === "FAIL") return 0;
  const match = typeof value === "string" && value.match(/^L([1-4])$/);
  return match ? Number(match[1]) : null;
}
export function requiredSeats(seats) {
  return (Array.isArray(seats) ? seats : []).map(s => ({
    id: String(s.id ?? s.seatId ?? ""),
    isPrimary: s.priority != null ? s.priority !== "secondary" : s.isPrimary !== false,
  }));
}
/**
 * Integrity of ONE seat-metric collection.
 *
 * `required: true` — the metric must cover every applicable seat (P20, the
 * per-seat metric). `required: false` — the collection is optional: when a
 * result carries none, that is valid, no seat is failed for the absence and no
 * row is fabricated. Rows that DO exist are validated as written.
 */
function seatRowIssues(result, field, ids, grade, { required }) {
  const rows = Array.isArray(result?.[field]) ? result[field] : [];
  const issues = [];
  if (!rows.length) {
    if (required) issues.push(field + ": missing required seats");
    return issues;
  }
  if (rows.length !== ids.length) {
    issues.push(field + ": missing required seats");
    return issues;
  }
  const seen = new Set();
  for (const row of rows) {
    const id = String(row?.seatId ?? "");
    if (!ids.includes(id) || seen.has(id)) issues.push(field + ": unexpected or duplicate seat " + id);
    seen.add(id);
    if (!finite(row?.variationDbRaw) || row.variationDbRaw < 0) issues.push(field + ": invalid raw value for " + id);
    const level = canonicalLevel(row?.level);
    if (level == null || (finite(row?.variationDbRaw) && level !== canonicalLevel(grade(row.variationDbRaw)))) issues.push(field + ": invalid canonical grade for " + id);
  }
  for (const id of ids) if (!seen.has(id)) issues.push(field + ": missing " + id);
  return issues;
}

/**
 * Seat-level validation.
 *
 * P20 is the per-seat metric — every applicable seat must carry a graded row.
 * P19 is an AGGREGATE RSP result in this model, so per-seat P19 rows are
 * optional: an empty per-seat P19 collection is valid and is never treated as
 * a failed seat, a Level 0 seat, or a reason to reject the result.
 */
export function validateSeatResults(result, seats) {
  const required = requiredSeats(seats);
  const ids = required.map(s => s.id);
  const issues = [];
  if (!ids.length || ids.some(id => !id) || new Set(ids).size !== ids.length) issues.push("Invalid applicable seat set");
  issues.push(...seatRowIssues(result, "perSeatP20", ids, gradeP20FromRaw, { required: true }));
  issues.push(...seatRowIssues(result, "perSeatP19", ids, gradeP19FromRaw, { required: false }));
  return { valid: issues.length === 0, issues };
}

/**
 * The aggregate RSP P19 headline — the ONE P19 authority, validated on its own,
 * exactly once, for every result. A missing or ungradeable aggregate RSP P19 is
 * a genuine validation failure, and no legacy per-seat P19 row can rescue it.
 */
export function validateAggregateP19(result) {
  const issues = [];
  if (!finite(result?.achievedP19VariationDb)) issues.push("P19: missing aggregate RSP deviation");
  if (canonicalLevel(result?.achievedP19Level) == null) issues.push("P19: missing aggregate RSP level");
  return { valid: issues.length === 0, issues };
}

/** The applicable seat set of a result, taken from its validated per-seat P20. */
export function applicableSeatsFromResult(result) {
  const rows = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  return rows.map(row => ({ id: String(row?.seatId ?? ""), isPrimary: row?.isPrimary !== false }));
}
/**
 * The reason a candidate is NON-ASSESSABLE: its achieved P18 bass extension
 * sits at or above the room transition frequency, so there is no valid
 * P19/P20 assessment band. P19 and P20 cannot be graded by definition — they
 * are never fabricated and never reported as "missing evidence".
 */
export const CANDIDATE_ASSESSABILITY_REASON = {
  NO_VALID_P19_P20_ASSESSMENT_BAND: "NO_VALID_P19_P20_ASSESSMENT_BAND",
  P14_OPERATING_POINT_NOT_ACHIEVED: "P14_OPERATING_POINT_NOT_ACHIEVED",
};

const finiteNum = (value) =>
  value !== null && value !== undefined && typeof value !== "boolean" && Number.isFinite(Number(value));

/**
 * Classify whether a candidate's result conditions permit P19/P20 assessment.
 *
 * NON_ASSESSABLE is a TERMINAL CANDIDATE OUTCOME, not missing evidence. When
 * the achieved P18 F3 is at or above the room transition frequency there is no
 * valid assessment band, so P19/P20 cannot validly be graded. The candidate is
 * rejected for that reason — never reported as "missing P19/P20" and never
 * fabricated.
 *
 * A candidate whose P18 was not achieved, or whose transition frequency is
 * unavailable, is NOT classified as non-assessable here: those are either
 * genuine missing evidence or a separate failure, handled by
 * validateConfirmedCandidate. Non-assessability is decided only when both
 * P18 and the transition frequency are known and P18 >= transition.
 *
 * @param {object} result - a confirmed candidate result
 * @returns {{assessable: boolean, reason: string|null, achievedP18Hz: number|null, transitionHz: number|null}}
 */
/**
 * PHYSICAL / OPERATING-POINT REJECTION — distinct from NON-ASSESSABLE and from
 * genuine missing evidence. When the requested P14 operating target cannot
 * be achieved, the canonical authority deliberately does NOT evaluate
 * P18/P19/P20. That is a completed physical rejection, not a calculation
 * failure: the candidate is terminally rejected for this reason, P18/P19/P20
 * are never fabricated, and the run is NOT incomplete because of it. The
 * explicit reason, the requested and achieved P14 dB travel with the verdict
 * so Engineering Mode can state them.
 */
export function classifyCandidateAssessability(result) {
  // P14 operating-point failure is checked FIRST: it is the upstream canonical
  // prerequisite. requestedP14Pass === false (strict) is the authority's
  // explicit FAIL — a null/non-finite P14 (genuine missing evidence) does NOT
  // match and falls through to the normal validation path.
  if (result?.requestedP14Pass === false) {
    return {
      assessable: false,
      reason: CANDIDATE_ASSESSABILITY_REASON.P14_OPERATING_POINT_NOT_ACHIEVED,
      achievedP18Hz: null,
      transitionHz: finiteNum(result?.transitionHz) ? Number(result.transitionHz) : null,
      p14AchievedDb: finiteNum(result?.p14AchievedDb) ? Number(result.p14AchievedDb) : null,
      p14TargetDb: finiteNum(result?.p14TargetDb) ? Number(result.p14TargetDb) : null,
      p14NotAchievedReason: result?.p14NotAchievedReason || "p14-operating-point-not-achieved",
    };
  }
  const p18 = finiteNum(result?.achievedP18Hz) ? Number(result.achievedP18Hz) : null;
  const transition = finiteNum(result?.transitionHz) ? Number(result.transitionHz) : null;
  if (p18 == null || p18 <= 0) return { assessable: true, reason: null, achievedP18Hz: p18, transitionHz: transition };
  if (transition == null || transition <= 0) return { assessable: true, reason: null, achievedP18Hz: p18, transitionHz: transition };
  if (p18 >= transition) {
    return {
      assessable: false,
      reason: CANDIDATE_ASSESSABILITY_REASON.NO_VALID_P19_P20_ASSESSMENT_BAND,
      achievedP18Hz: p18,
      transitionHz: transition,
    };
  }
  return { assessable: true, reason: null, achievedP18Hz: p18, transitionHz: transition };
}

/**
 * Unified candidate validation for the run. This is the ONE entry point the
 * engine and the selection authority use to keep CANDIDATE VALIDATION and RUN
 * COMPLETION separate:
 *
 *   NON_ASSESSABLE — terminal candidate rejection (no fabricated P19/P20,
 *                    issues: []). Does NOT make the run incomplete.
 *   INVALID        — genuine missing evidence the calculation should have
 *                    produced. Issues are returned and MAY make the run
 *                    incomplete.
 *   VALID          — a confirmed, assessable, evidence-complete candidate.
 *
 * @returns {{assessable: boolean, nonAssessable: boolean, reason: string|null, valid: boolean, issues: string[], result: object|null, achievedP18Hz: number|null, transitionHz: number|null}}
 */
export function validateCandidateForRun(result, context = {}) {
  const assessability = classifyCandidateAssessability(result);
  if (!assessability.assessable) {
    return {
      assessable: false,
      nonAssessable: true,
      reason: assessability.reason,
      achievedP18Hz: assessability.achievedP18Hz,
      transitionHz: assessability.transitionHz,
      // P14 operating-point rejection carries its own evidence (requested +
      // achieved P14 dB and the explicit reason) so the run evidence and
      // Engineering Mode can state them. Null for a band-rejection reason.
      p14AchievedDb: assessability.p14AchievedDb ?? null,
      p14TargetDb: assessability.p14TargetDb ?? null,
      p14NotAchievedReason: assessability.p14NotAchievedReason ?? null,
      valid: false,
      issues: [],
      result,
    };
  }
  const check = validateConfirmedCandidate(result, context);
  return {
    assessable: true,
    nonAssessable: false,
    reason: null,
    achievedP18Hz: assessability.achievedP18Hz,
    transitionHz: assessability.transitionHz,
    valid: check.valid,
    issues: check.issues,
    result: check.result,
  };
}

export function validateConfirmedCandidate(result, context = {}) {
  // Per-seat P20 (required), plus the canonical P19 authority — ALWAYS.
  // P19 is an aggregate RSP result in this model, so the aggregate deviation and
  // the aggregate level are required of every confirmed candidate. A legacy
  // per-seat P19 row is ignored diagnostic evidence: it is never validated in
  // place of the aggregate, so a result that carries per-seat P19 rows but no
  // aggregate RSP P19 is INVALID/INCOMPLETE — it is never rescued by them.
  const issues = [
    ...validateSeatResults(result, context.seats).issues,
    ...validateAggregateP19(result).issues,
  ];
  if (!finite(result?.assessmentStartHz) || !finite(result?.assessmentEndHz) ||
      result.assessmentStartHz <= 0 || result.assessmentEndHz <= result.assessmentStartHz) issues.push("Invalid assessment band");
  if (!finite(result?.achievedP18Hz) || result.achievedP18Hz <= 0 || canonicalLevel(result?.p18AchievedLevel) == null) issues.push("Invalid P18");
  if (!finite(result?.p14AchievedDb) || canonicalLevel(result?.p14AchievedLevel) == null ||
      !finite(result?.operatingOutputDb) || !finite(result?.p14TargetDb)) issues.push("Missing output/capability authority");
  if (!result?.canonicalAuthorityReceipt?.selectedCandidateId || !result?.canonicalAuthorityReceipt?.postEqCurveSignature) issues.push("Missing canonical receipt");
  if (result?.timingVersion !== STAGE2_CANONICAL_VERSION) issues.push("Incompatible timing version");
  if (context.inputIdentity && result?.inputIdentity !== context.inputIdentity) issues.push("Stale input identity");
  if (result?.physicalValidation?.passed !== true) issues.push("Physical validation did not pass");
  if (context.sourceIds) {
    const tuning = result?.appliedTuning;
    if (!Array.isArray(tuning) || tuning.length !== context.sourceIds.length ||
        new Set(tuning.map(t=>t.sourceId)).size !== context.sourceIds.length ||
        tuning.some(t => !context.sourceIds.includes(t.sourceId) || !finite(t.delayMs) || t.delayMs < 0 ||
          !finite(t.gainDb) || ![0,1,-1,180].includes(t.polarity) ||
          !finite(Number(t.phaseControlDeg ?? t.phaseAdjust ?? 0)) ||
          Number(t.phaseControlDeg ?? t.phaseAdjust ?? 0) < 0 ||
          Number(t.phaseControlDeg ?? t.phaseAdjust ?? 0) > 175)) issues.push("Invalid effective source tuning");
  }
  const priority = new Map(requiredSeats(context.seats).map(s => [s.id,s.isPrimary]));
  const value = result ? { ...result,
    perSeatP19: (result.perSeatP19 || []).map(s=>({...s,isPrimary:priority.get(String(s.seatId))})),
    perSeatP20: (result.perSeatP20 || []).map(s=>({...s,isPrimary:priority.get(String(s.seatId))})),
  } : null;
  return { valid: issues.length === 0, issues, result: value };
}

/**
 * Baseline validation — the CURRENT design a candidate is compared against.
 *
 * The baseline IS the published bass result the designer is looking at. It is
 * NOT a candidate: it was never produced by the optimiser's candidate pipeline,
 * so it can never carry the candidate-confirmation contract — a canonical
 * receipt for a candidate that was selected in this run, a
 * physical-validation round-trip, or a reproduction of the source tuning from
 * the live sources. Requiring those of it is what refused a confirmed
 * improvement against a Current the optimiser had itself just displayed.
 *
 * What IS required is exactly what the published authority publishes: the
 * per-seat P20 set for every applicable seat, the aggregate RSP P19 headline,
 * the assessment band, and — when identity is being checked — the same design
 * fingerprint. Everything the record does carry is validated as written; a
 * value it does not publish is a stated absence, never invented and never a
 * fabricated pass. P18/P14 are read when published so the safety comparison can
 * use them, and are not demanded of a baseline that does not state them.
 */
export function validatePublishedBaseline(result, context = {}) {
  if (!result) {
    return { valid: false, publishedBaseline: true, issues: ["No published baseline result"], result: null };
  }
  const issues = [
    ...validateSeatResults(result, context.seats).issues,
    ...validateAggregateP19(result).issues,
  ];
  if (!finite(result?.assessmentStartHz) || !finite(result?.assessmentEndHz) ||
      result.assessmentStartHz <= 0 || result.assessmentEndHz <= result.assessmentStartHz) issues.push("Invalid assessment band");
  if (context.inputIdentity && result?.inputIdentity !== context.inputIdentity) issues.push("Stale input identity");
  // Validated as written, never required: a level that IS present must be
  // canonical, so a garbled published level still fails.
  if (result?.p14AchievedLevel != null && canonicalLevel(result.p14AchievedLevel) == null) issues.push("Invalid achieved capability level");
  if (result?.p18AchievedLevel != null && canonicalLevel(result.p18AchievedLevel) == null) issues.push("Invalid P18 level");
  if (result?.achievedP20Level != null && canonicalLevel(result.achievedP20Level) == null) issues.push("Invalid P20 level");
  const priority = new Map(requiredSeats(context.seats).map(s => [s.id, s.isPrimary]));
  const value = { ...result,
    perSeatP19: (result.perSeatP19 || []).map(s => ({ ...s, isPrimary: priority.get(String(s.seatId)) })),
    perSeatP20: (result.perSeatP20 || []).map(s => ({ ...s, isPrimary: priority.get(String(s.seatId)) })),
  };
  return { valid: issues.length === 0, publishedBaseline: true, issues, result: value };
}
export function effectiveConfigurationKey(instances, tuning) {
  const byId = new Map((tuning || []).map(t=>[t.sourceId,t]));
  return JSON.stringify((instances || []).filter(s=>s.enabled!==false).map((s,i)=>{
    const t=byId.get(s.id) || tuning?.[i] || {};
    return [s.id,s.position?.x ?? s.x,s.position?.y ?? s.y,s.bottomHeightM,
      t.delayMs,t.gainDb,t.polarity===-1||t.polarity===180?-1:1,
      normalisePhaseControlDeg(t.phaseControlDeg ?? t.phaseAdjust)];
  }).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
}