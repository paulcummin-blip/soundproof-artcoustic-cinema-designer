export const COMPLETED_BASS_CACHE_VERSION = 1;

export function isCompletedBassContract(contract) {
  const status = contract?.job?.status;
  return ["ready", "complete"].includes(status)
    && !!contract?.selectedCandidate
    && !!contract?.selectedCandidateId
    && !!contract?.job?.resultFingerprint
    && contract.job.resultFingerprint === contract.job.currentJobFingerprint;
}

export function compactCompletedBassContract(contract) {
  if (!isCompletedBassContract(contract)) return null;
  return {
    version: contract.version,
    analysisId: contract.analysisId,
    fingerprints: contract.fingerprints,
    job: { ...contract.job, status: "complete" },
    productAnalysis: { status: "complete", parameters: contract.productAnalysis?.parameters || {} },
    selectedMode: contract.selectedMode,
    selectedCandidateId: contract.selectedCandidateId,
    selectedCandidate: {
      id: contract.selectedCandidate?.id || contract.selectedCandidateId,
      worstP20SeatId: contract.selectedCandidate?.worstP20SeatId || null,
      perSeatP19Results: contract.selectedCandidate?.perSeatP19Results || [],
      perSeatP20Results: contract.selectedCandidate?.perSeatP20Results || [],
      p14TargetBasis: contract.selectedCandidate?.p14TargetBasis || contract.productAnalysis?.parameters?.p14?.targetBasis || "minimum",
      },
    provenance: contract.provenance || {},
  };
}

export function buildPersistedBassAuthority(existing, currentFingerprint, contract = null, forceUpdating = false) {
  const previous = existing && typeof existing === "object" ? existing : {};
  const completedByFingerprint = { ...(previous.completedByFingerprint || {}) };
  const compact = compactCompletedBassContract(contract);
  if (compact) completedByFingerprint[compact.job.resultFingerprint] = compact;
  const bounded = Object.fromEntries(Object.entries(completedByFingerprint)
    .sort(([, left], [, right]) => Number(right?.job?.completedAtMs || 0) - Number(left?.job?.completedAtMs || 0))
    .slice(0, 3));
  const fingerprint = currentFingerprint || compact?.job?.resultFingerprint || previous.currentFingerprint || null;
  const matching = fingerprint ? bounded[fingerprint] || null : null;
  return {
    version: COMPLETED_BASS_CACHE_VERSION,
    currentFingerprint: fingerprint,
    status: matching && !forceUpdating ? "complete" : fingerprint ? "updating" : "uncalculated",
    completedByFingerprint: bounded,
    updatedAtMs: Date.now(),
  };
}

export function resolvePersistedBassAuthority(projectId, persisted) {
  const state = persisted && typeof persisted === "object" ? persisted : {};
  const currentFingerprint = state.currentFingerprint || null;
  const snapshots = state.completedByFingerprint || {};
  const current = state.status === "complete" && currentFingerprint ? snapshots[currentFingerprint] || null : null;
  const staleContract = Object.values(snapshots)
    .filter((snapshot) => snapshot !== current && isCompletedBassContract(snapshot))
    .sort((left, right) => Number(right?.job?.completedAtMs || 0) - Number(left?.job?.completedAtMs || 0))[0] || null;
  return {
    projectId: String(projectId || "free"),
    status: current ? "complete" : state.status === "uncalculated" ? "uncalculated" : "updating",
    currentFingerprint,
    contract: isCompletedBassContract(current) ? current : null,
    staleContract,
    exportable: isCompletedBassContract(current),
  };
}