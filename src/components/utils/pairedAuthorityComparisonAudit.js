import { CANONICAL_BASS_PRIORITY_MODES, rankBassCandidates } from "@/components/utils/bassPriorityPolicies";

const levelNumber = (value) => {
  const parsed = typeof value === "string" ? Number(value.replace(/^L/i, "")) : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(4, Math.round(parsed))) : 0;
};

const gradeLabel = (value, status) => {
  if (status === "INCOMPLETE DATA") return "INCOMPLETE DATA";
  const level = levelNumber(value);
  return level > 0 ? `L${level}` : "FAIL";
};

function selectedPaired(candidate) {
  const basis = candidate?.p14TargetBasis === "recommended" ? "recommended" : "minimum";
  return candidate?.pairedP14P18Authority?.assessments?.[basis] ?? null;
}

function projectPairedGrades(candidate) {
  const paired = selectedPaired(candidate);
  const p14Level = levelNumber(paired?.winningLevelNumber ?? paired?.winningLevel);
  const p18Level = levelNumber(paired?.p18?.level);
  return {
    ...candidate,
    achievedP14Level: p14Level,
    achievedP18Level: p18Level,
    allAtLeastL1: p14Level >= 1 && p18Level >= 1 && levelNumber(candidate?.achievedP19Level) >= 1,
  };
}

function selectionMap(candidates, modes) {
  return Object.fromEntries(modes.map((mode) => [mode, rankBassCandidates(candidates, mode).selected?.candidateId ?? null]));
}

export function auditPairedAuthorityCandidatePool(pool, { priorityModes = CANONICAL_BASS_PRIORITY_MODES } = {}) {
  const candidates = Array.isArray(pool?.candidates) ? pool.candidates : [];
  const selectableIds = new Set((Array.isArray(pool?.selectablePool) && pool.selectablePool.length ? pool.selectablePool : candidates).map((candidate) => candidate?.candidateId));
  const selectable = candidates.filter((candidate) => selectableIds.has(candidate?.candidateId));
  const currentSelections = selectionMap(selectable, priorityModes);
  const pairedSelections = selectionMap(selectable.map(projectPairedGrades), priorityModes);
  const changedModes = priorityModes.filter((mode) => currentSelections[mode] !== pairedSelections[mode]);

  const rows = candidates.map((candidate) => {
    const paired = selectedPaired(candidate);
    const currentP14Grade = gradeLabel(candidate?.achievedP14Level);
    const currentP18Grade = gradeLabel(candidate?.achievedP18Level);
    const pairedP14Grade = gradeLabel(paired?.winningLevelNumber ?? paired?.winningLevel, paired?.status);
    const pairedP18Grade = gradeLabel(paired?.p18?.level, paired?.status);
    const impactedModes = changedModes.filter((mode) => [currentSelections[mode], pairedSelections[mode]].includes(candidate?.candidateId));
    const p14Changed = currentP14Grade !== pairedP14Grade;
    const p18Changed = currentP18Grade !== pairedP18Grade;

    return {
      candidateId: candidate?.candidateId ?? null,
      currentGrade: { p14: currentP14Grade, p18: currentP18Grade },
      pairedGrade: { p14: pairedP14Grade, p18: pairedP18Grade },
      gradeChanged: { p14: p14Changed, p18: p18Changed, any: p14Changed || p18Changed },
      selectionImpact: impactedModes.length > 0,
      selectionImpactModes: impactedModes,
    };
  });

  return {
    candidates: rows,
    summary: {
      candidateCount: rows.length,
      gradeChangedCandidateCount: rows.filter((row) => row.gradeChanged.any).length,
      gradeChangedComparisonCount: rows.reduce((sum, row) => sum + Number(row.gradeChanged.p14) + Number(row.gradeChanged.p18), 0),
      selectedCandidateChanges: Object.fromEntries(priorityModes.map((mode) => [mode, { currentCandidateId: currentSelections[mode], pairedCandidateId: pairedSelections[mode], changed: currentSelections[mode] !== pairedSelections[mode] }])),
      selectedCandidateChangesAnyMode: changedModes.length > 0,
    },
  };
}