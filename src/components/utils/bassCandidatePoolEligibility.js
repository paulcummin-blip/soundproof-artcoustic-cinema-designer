export function displayBassCandidates(candidates, selected) {
  const baseline = candidates[0];
  const valid = candidates.filter((candidate) => candidate.meetsRequestedEnvelope);
  const rejected = candidates.filter((candidate) => !candidate.meetsRequestedEnvelope && candidate.rejectionReason);
  return [...new Set([baseline, ...valid, ...rejected.slice(0, 3), selected].filter(Boolean))];
}

export function isPhysicallyCredibleBassCandidate(candidate) {
  if (!candidate) return false;
  if (!Array.isArray(candidate.finalPostEqCurve) || candidate.finalPostEqCurve.length === 0) return false;
  if (!Array.isArray(candidate.generatedFilterBank)) return false;
  if (candidate.physicalEqAuthorityPassed === false) return false;
  return Number.isFinite(candidate.achievedP14Db)
    && Number.isFinite(candidate.achievedP18FrequencyHz)
    && Number.isFinite(candidate.achievedP19VariationDb);
}