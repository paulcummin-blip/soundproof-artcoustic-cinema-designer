export function displayBassCandidates(candidates, selected) {
  const baseline = candidates[0];
  const physicallyValid = candidates.filter(isPhysicallyCredibleBassCandidate);
  const physicallyRejected = candidates.filter((candidate) => !isPhysicallyCredibleBassCandidate(candidate));
  return [...new Set([baseline, ...physicallyValid, ...physicallyRejected.slice(0, 3), selected].filter(Boolean))];
}

export function isPhysicallyCredibleBassCandidate(candidate) {
  if (!candidate) return false;
  if (!Array.isArray(candidate.finalPostEqCurve) || candidate.finalPostEqCurve.length === 0) return false;
  if (!Array.isArray(candidate.generatedFilterBank)) return false;
  if (candidate.physicalEqAuthorityPassed === false) return false;
  return candidate.bankValidationResult?.allOk !== false;
}