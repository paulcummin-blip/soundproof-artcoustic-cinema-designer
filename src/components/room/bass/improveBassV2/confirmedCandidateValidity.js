import { gradeP19FromRaw, gradeP20FromRaw } from "../completedBassResultPersistence.js";
import { STAGE2_CANONICAL_VERSION } from "../stage2/stage2Constants.js";

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
export function validateSeatResults(result, seats) {
  const required = requiredSeats(seats);
  const ids = required.map(s => s.id);
  const issues = [];
  if (!ids.length || ids.some(id => !id) || new Set(ids).size !== ids.length) issues.push("Invalid applicable seat set");
  for (const [field, grade] of [["perSeatP19", gradeP19FromRaw], ["perSeatP20", gradeP20FromRaw]]) {
    const rows = result?.[field];
    if (!Array.isArray(rows) || rows.length !== ids.length || !rows.length) { issues.push(field + ": missing required seats"); continue; }
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
  }
  return { valid: issues.length === 0, issues };
}
export function validateConfirmedCandidate(result, context = {}) {
  const issues = validateSeatResults(result, context.seats).issues;
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
          !finite(t.gainDb) || ![0,1,-1,180].includes(t.polarity))) issues.push("Invalid effective source tuning");
  }
  const priority = new Map(requiredSeats(context.seats).map(s => [s.id,s.isPrimary]));
  const value = result ? { ...result,
    perSeatP19: (result.perSeatP19 || []).map(s=>({...s,isPrimary:priority.get(String(s.seatId))})),
    perSeatP20: (result.perSeatP20 || []).map(s=>({...s,isPrimary:priority.get(String(s.seatId))})),
  } : null;
  return { valid: issues.length === 0, issues, result: value };
}
export function effectiveConfigurationKey(instances, tuning) {
  const byId = new Map((tuning || []).map(t=>[t.sourceId,t]));
  return JSON.stringify((instances || []).filter(s=>s.enabled!==false).map((s,i)=>{
    const t=byId.get(s.id) || tuning?.[i] || {};
    return [s.id,s.position?.x ?? s.x,s.position?.y ?? s.y,s.bottomHeightM,
      t.delayMs,t.gainDb,t.polarity===-1||t.polarity===180?-1:1];
  }).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
}

