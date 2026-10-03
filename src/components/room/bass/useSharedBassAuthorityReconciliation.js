// useSharedBassAuthorityReconciliation.js
// --------------------------------------
// Reconciliation on the SHARED authority path.
//
// A Visual Report, Technical Report / Design Review or proposal source read that
// is opened DIRECTLY must be able to repair the saved bass authority itself,
// without the Room Designer, the bass UI or BassBackgroundAnalysisOwner ever
// mounting. This hook is that path: it is called by the version-scoped
// engineering authority reader, which every report and the proposal source
// check already use.
//
// The identity is built from the SAME canonical inputs the Room Designer uses:
// the design hydrated into shared app state (ProjectDesignHydrator), the same
// authoritative bass hook for its fingerprints, and the same P14 target key.
// The authoritative hook is mounted for identity only — no calculation request
// and no background preparation is made, so no worker starts and nothing is
// computed.
//
// It calculates nothing, grades nothing, and never writes the P14 target bank
// (that bank belongs to the Room Designer surface).

import { useMemo } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { useAuthoritativeBassResponse } from "./useAuthoritativeBassResponse";
import { useCompletedBassAuthority } from "./completedBassResultStore";
import { useBassAuthorityReconciliation } from "./useBassAuthorityReconciliation";
import { buildP14TargetKey, computeBaseDesignFingerprint } from "./p14TargetDefinitions";
import { buildBassResultCacheKey } from "./bassResultAuthority";
import { BASS_OPTIMISER_VERSIONS, bassOptimiserVersionSignature } from "./bassOptimiserWorkerProtocol";

const OPTIMISER_VERSION_SIGNATURE = bassOptimiserVersionSignature();

export function useSharedBassAuthorityReconciliation(projectId, versionId) {
  const appState = useAppState();
  const scopeId = projectId || "free";
  const scopeVersionId = versionId || "free";

  // The same live subwoofer derivation the Room Designer hands the authoritative
  // hook: appState.subwoofers is the canonical bassInputAdapter output hydrated
  // from subwooferInstances, so the identity built here is the identity this
  // design was published with.
  const frontSubsLive = useMemo(
    () => (appState?.subwoofers || []).filter((sub) => sub?.group === "front"),
    [appState?.subwoofers],
  );
  const rearSubsLive = useMemo(
    () => (appState?.subwoofers || []).filter((sub) => sub?.group === "rear"),
    [appState?.subwoofers],
  );

  // Identity only: no request id, no background prep — the hook never starts the
  // room-physics worker and never publishes a result.
  const authoritative = useAuthoritativeBassResponse({ appState, frontSubsLive, rearSubsLive });
  const completedBassAuthority = useCompletedBassAuthority(scopeId, scopeVersionId);

  const cacheKey = useMemo(
    () => (authoritative.fingerprints ? buildBassResultCacheKey(authoritative.fingerprints.calibration) : null),
    [authoritative.fingerprints, OPTIMISER_VERSION_SIGNATURE],
  );
  const baseDesignFingerprint = useMemo(
    () => (authoritative.fingerprintInputs ? computeBaseDesignFingerprint(authoritative.fingerprintInputs) : null),
    [authoritative.fingerprintInputs],
  );
  const targetKey = useMemo(() => {
    const basis = authoritative.requested?.p14TargetBasis;
    const level = authoritative.requested?.requestedLevel;
    if (!basis || !level) return null;
    return buildP14TargetKey(basis, level);
  }, [authoritative.requested?.p14TargetBasis, authoritative.requested?.requestedLevel]);

  return useBassAuthorityReconciliation({
    scopeId,
    versionId: scopeVersionId,
    projectHydrationReady: appState?.isProjectHydrationReady === true,
    authorityHydrationSettled: completedBassAuthority?.hydrationSettled === true,
    // This surface does not own the P14 target bank — it must not write to it.
    targetCacheHydrated: false,
    reconciliationSource: "shared_restore",
    inputsValid: authoritative.inputsValid,
    cacheKey,
    baseDesignFingerprint,
    fingerprints: authoritative.fingerprints,
    fingerprintInputs: authoritative.fingerprintInputs,
    requested: authoritative.requested,
    targetKey,
    roomDims: authoritative.roomDims,
    rspPosition: authoritative.rspPosition,
    seatingPositions: authoritative.seatingPositions,
    sources: authoritative.sources,
    usableLfHz: authoritative.designEqSystemLimits?.usableLfHz,
    optimisationTransitionHz: authoritative.optimisationTransitionHz,
    optimiserVersions: BASS_OPTIMISER_VERSIONS,
    authorityStatus: completedBassAuthority?.authorityStatus || null,
    authorityCurrentFingerprint: completedBassAuthority?.currentFingerprint || null,
    manualRequestActive: false,
    calculationInProgress: false,
  });
}

export default useSharedBassAuthorityReconciliation;