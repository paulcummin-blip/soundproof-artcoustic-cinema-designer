import { INSTANCE_AUTHORITY_VERSION } from "@/components/utils/subwooferInstanceMigration";

export const COMPLETED_BASS_CACHE_VERSION = 2;

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
    instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
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
    requestedP14TargetDb: Number.isFinite(contract.selectedP14TargetDb) ? contract.selectedP14TargetDb : null,
    requestedP14Basis: contract.selectedP14TargetBasis || null,
    requestedP14Level: Number.isFinite(contract.selectedP14Level) ? contract.selectedP14Level : null,
    requestedP18ExtensionHz: Number.isFinite(contract.selectedP14RequiredExtensionHz) ? contract.selectedP14RequiredExtensionHz : null,
    metricPublication: contract.metricPublication || null,
    provenance: contract.provenance || {},
  };
}

/**
 * Validate that a completed bass contract's stored P14 identity matches the
 * currently requested P14 identity. Defense-in-depth: the calibration fingerprint
 * already includes P14 identity (v4+), so a fingerprint mismatch rejects wrong
 * results at the cache layer. This function provides an explicit second check
 * at the contract level so a ready result is never presented under mismatched
 * P14 identity.
 */
export function bassContractMatchesRequestedP14(contract, requested) {
  if (!contract) return false;
  const cDb = Number.isFinite(contract.selectedP14TargetDb) ? contract.selectedP14TargetDb : null;
  const cBasis = contract.selectedP14TargetBasis || null;
  const cLevel = Number.isFinite(contract.selectedP14Level) ? contract.selectedP14Level : null;
  const cExtHz = Number.isFinite(contract.selectedP14RequiredExtensionHz) ? contract.selectedP14RequiredExtensionHz : null;
  const rDb = Number.isFinite(requested?.selectedP14TargetDb) ? requested.selectedP14TargetDb : null;
  const rBasis = requested?.p14TargetBasis || requested?.selectedP14TargetBasis || null;
  const rLevel = Number.isFinite(requested?.requestedLevel) ? requested.requestedLevel : (Number.isFinite(requested?.selectedP14Level) ? requested.selectedP14Level : null);
  const rExtHz = Number.isFinite(requested?.selectedP14RequiredExtensionHz) ? requested.selectedP14RequiredExtensionHz : null;
  return cDb === rDb && cBasis === rBasis && cLevel === rLevel && cExtHz === rExtHz;
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
    instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
    currentFingerprint: fingerprint,
    status: matching && !forceUpdating ? "complete" : fingerprint ? "updating" : "uncalculated",
    completedByFingerprint: bounded,
    updatedAtMs: Date.now(),
  };
}

/**
 * Resolve the persisted bass authority for a project.
 *
 * Cache isolation: records without the correct instanceAuthorityVersion are
 * treated as stale and rejected. Old CFG-keyed results always miss.
 */
export function resolvePersistedBassAuthority(projectId, persisted) {
  const state = persisted && typeof persisted === "object" ? persisted : {};

  // Cache isolation: reject records without the correct authority version.
  if (state.instanceAuthorityVersion !== INSTANCE_AUTHORITY_VERSION) {
    return {
      projectId: String(projectId || "free"),
      status: "uncalculated",
      currentFingerprint: null,
      contract: null,
      staleContract: null,
      exportable: false,
    };
  }

  const currentFingerprint = state.currentFingerprint || null;
  const snapshots = state.completedByFingerprint || {};

  // Also reject individual snapshots that lack the authority version.
  const validSnapshots = Object.fromEntries(
    Object.entries(snapshots).filter(
      ([, snap]) => snap?.instanceAuthorityVersion === INSTANCE_AUTHORITY_VERSION
    )
  );

  const current = state.status === "complete" && currentFingerprint ? validSnapshots[currentFingerprint] || null : null;
  const staleContract = Object.values(validSnapshots)
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