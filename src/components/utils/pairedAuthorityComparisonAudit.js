import { CANONICAL_BASS_PRIORITY_MODES, rankBassCandidates } from "@/components/utils/bassPriorityPolicies";

const finite = (value) => Number.isFinite(Number(value));
const numberOrNull = (value) => finite(value) ? Number(value) : null;
const levelNumber = (value) => {
  const parsed = typeof value === "string" ? Number(value.replace(/^L/i, "")) : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(4, Math.round(parsed))) : 0;
};
const levelLabel = (value) => levelNumber(value) > 0 ? `L${levelNumber(value)}` : "FAIL";
const metricStatus = (level, available = true) => !available ? "INCOMPLETE DATA" : levelNumber(level) > 0 ? "PASS" : "FAIL";

function currentMetrics(candidate) {
  return {
    p14: { status: metricStatus(candidate?.achievedP14Level), level: levelLabel(candidate?.achievedP14Level), levelNumber: levelNumber(candidate?.achievedP14Level), valueDb: numberOrNull(candidate?.achievedP14Db), targetBasis: candidate?.p14TargetBasis ?? null },
    p18: { status: metricStatus(candidate?.achievedP18Level), level: levelLabel(candidate?.achievedP18Level), levelNumber: levelNumber(candidate?.achievedP18Level), extensionHz: numberOrNull(candidate?.achievedP18FrequencyHz) },
    p19: { status: metricStatus(candidate?.achievedP19Level), level: levelLabel(candidate?.achievedP19Level), levelNumber: levelNumber(candidate?.achievedP19Level), variationDb: numberOrNull(candidate?.achievedP19VariationDb) },
    p20: { status: metricStatus(candidate?.achievedP20Level, candidate?.p20Available !== false), level: levelLabel(candidate?.achievedP20Level), levelNumber: levelNumber(candidate?.achievedP20Level), variationDb: numberOrNull(candidate?.achievedP20VariationDb) },
  };
}

function pairedResult(assessment) {
  return {
    status: assessment?.status ?? "INCOMPLETE DATA",
    winningLevel: assessment?.winningLevel ?? null,
    winningLevelNumber: numberOrNull(assessment?.winningLevelNumber),
    p14: { worstCapabilityDb: numberOrNull(assessment?.p14?.worstCapabilityDb), limitingFrequencyHz: numberOrNull(assessment?.p14?.limitingFrequencyHz) },
    p18: { level: assessment?.p18?.level ?? null, extensionHz: numberOrNull(assessment?.p18?.extensionHz) },
  };
}

function selectedPaired(candidate) {
  const basis = candidate?.p14TargetBasis === "recommended" ? "recommended" : "minimum";
  return candidate?.pairedP14P18Authority?.assessments?.[basis] ?? null;
}

function projectPairedMetrics(candidate) {
  const paired = selectedPaired(candidate);
  const pairedLevel = levelNumber(paired?.winningLevelNumber);
  return {
    ...candidate,
    achievedP14Level: pairedLevel,
    achievedP14Db: numberOrNull(paired?.p14?.worstCapabilityDb),
    achievedP18Level: pairedLevel,
    achievedP18FrequencyHz: numberOrNull(paired?.p18?.extensionHz),
    allAtLeastL1: pairedLevel >= 1 && levelNumber(candidate?.achievedP19Level) >= 1,
  };
}

function selectionMap(candidates, modes) {
  return Object.fromEntries(modes.map((mode) => [mode, rankBassCandidates(candidates, mode).selected?.candidateId ?? null]));
}

function collectProfessionalSmells(candidate, current, minimum, recommended) {
  const failures = [];
  if (!candidate?.pairedP14P18Authority) failures.push("missing paired authority");
  if ([minimum.status, recommended.status].includes("INCOMPLETE DATA")) failures.push("paired authority has incomplete product or transfer coverage");
  if (levelNumber(recommended.winningLevelNumber) > levelNumber(minimum.winningLevelNumber)) failures.push("recommended grade exceeds minimum grade");
  if (minimum.winningLevel !== minimum.p18.level || recommended.winningLevel !== recommended.p18.level) failures.push("paired P14/P18 winning levels diverge internally");
  if (!finite(current.p14.valueDb) || !finite(current.p18.extensionHz) || !finite(current.p19.variationDb)) failures.push("current scalar metric is non-finite");
  const selected = candidate?.p14TargetBasis === "recommended" ? recommended : minimum;
  if (finite(current.p14.valueDb) && finite(selected.p14.worstCapabilityDb) && Math.abs(current.p14.valueDb - selected.p14.worstCapabilityDb) > 15) failures.push("P14 scalar/paired delta exceeds 15 dB");
  if (finite(current.p18.extensionHz) && finite(selected.p18.extensionHz) && Math.abs(current.p18.extensionHz - selected.p18.extensionHz) > 15) failures.push("P18 scalar/paired delta exceeds 15 Hz");
  return failures;
}

function metricDeltas(row, candidate) {
  const selected = candidate?.p14TargetBasis === "recommended" ? row.pairedRecommendedResult : row.pairedMinimumResult;
  return [
    { metric: "P14", unit: "dB", current: row.current.p14.valueDb, paired: selected.p14.worstCapabilityDb },
    { metric: "P18", unit: "Hz", current: row.current.p18.extensionHz, paired: selected.p18.extensionHz },
    { metric: "P19", unit: "dB", current: row.current.p19.variationDb, paired: row.current.p19.variationDb },
    { metric: "P20", unit: "dB", current: row.current.p20.variationDb, paired: row.current.p20.variationDb },
  ].filter((entry) => finite(entry.current) && finite(entry.paired)).map((entry) => ({ ...entry, delta: entry.paired - entry.current, absoluteDelta: Math.abs(entry.paired - entry.current), candidateId: row.candidateId }));
}

export function auditPairedAuthorityCandidatePool(pool, { priorityModes = CANONICAL_BASS_PRIORITY_MODES } = {}) {
  const candidates = Array.isArray(pool?.candidates) ? pool.candidates : [];
  const selectableIds = new Set((Array.isArray(pool?.selectablePool) && pool.selectablePool.length ? pool.selectablePool : candidates).map((candidate) => candidate?.candidateId));
  const selectable = candidates.filter((candidate) => selectableIds.has(candidate?.candidateId));
  const projected = selectable.map(projectPairedMetrics);
  const currentSelections = selectionMap(selectable, priorityModes);
  const pairedSelections = selectionMap(projected, priorityModes);
  const changedModes = priorityModes.filter((mode) => currentSelections[mode] !== pairedSelections[mode]);
  const rows = candidates.map((candidate) => {
    const current = currentMetrics(candidate);
    const minimum = pairedResult(candidate?.pairedP14P18Authority?.assessments?.minimum);
    const recommended = pairedResult(candidate?.pairedP14P18Authority?.assessments?.recommended);
    const selected = candidate?.p14TargetBasis === "recommended" ? recommended : minimum;
    const projectedP14Status = selected.status === "PASS" && levelNumber(selected.winningLevelNumber) > 0 ? "PASS" : selected.status;
    const projectedP18Status = selected.status === "PASS" && levelNumber(selected.p18.level) > 0 ? "PASS" : selected.status;
    const impactedModes = changedModes.filter((mode) => [currentSelections[mode], pairedSelections[mode]].includes(candidate?.candidateId));
    return {
      candidateId: candidate?.candidateId ?? null,
      current,
      pairedMinimumResult: minimum,
      pairedRecommendedResult: recommended,
      differenceFlags: {
        p14Changed: current.p14.status !== projectedP14Status || current.p14.levelNumber !== levelNumber(selected.winningLevelNumber),
        p18Changed: current.p18.status !== projectedP18Status || current.p18.levelNumber !== levelNumber(selected.p18.level),
        p19Changed: false,
        selectionImpact: impactedModes.length > 0,
      },
      selectionImpactModes: impactedModes,
      professionalSmellTestFailures: collectProfessionalSmells(candidate, current, minimum, recommended),
    };
  });
  const allDeltas = rows.flatMap((row) => metricDeltas(row, candidates.find((candidate) => candidate?.candidateId === row.candidateId)));
  const largestMetricDelta = [...allDeltas].sort((a, b) => b.absoluteDelta - a.absoluteDelta || a.metric.localeCompare(b.metric) || String(a.candidateId).localeCompare(String(b.candidateId)))[0] ?? null;
  const allSmellFailures = rows.flatMap((row) => row.professionalSmellTestFailures.map((failure) => ({ candidateId: row.candidateId, failure })));
  return {
    candidates: rows,
    summary: {
      candidateCount: rows.length,
      changedStatusCandidateCount: rows.filter((row) => row.differenceFlags.p14Changed || row.differenceFlags.p18Changed || row.differenceFlags.p19Changed).length,
      selectedCandidateChanges: Object.fromEntries(priorityModes.map((mode) => [mode, { currentCandidateId: currentSelections[mode], pairedCandidateId: pairedSelections[mode], changed: currentSelections[mode] !== pairedSelections[mode] }])),
      selectedCandidateChangesAnyMode: changedModes.length > 0,
      largestMetricDelta,
      professionalSmellTestFailureCount: allSmellFailures.length,
      professionalSmellTestFailures: allSmellFailures,
    },
  };
}