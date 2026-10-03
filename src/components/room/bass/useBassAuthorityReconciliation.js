// useBassAuthorityReconciliation.js
// ---------------------------------
// The missing restore step, as one hook: rebuild the bass identity from the
// FULLY HYDRATED design and reconcile it against the saved contracts.
//
// Why this exists
// ---------------
// A persisted bass authority row carries a current_fingerprint written by a
// previous session. Nothing on the restore path ever recomputed that identity
// from the design being opened, so a key produced from unsettled inputs — before
// the room, reference listening position, subwoofer instances, resolved
// subwoofer capability, usable LF limit, transition frequency or P14 target had
// resolved — was restored verbatim as "out of date" on every open, even when a
// valid saved contract for the real design sat in the same cache record (the P14
// target bank).
//
// This hook owns:
//   · the identity-readiness gate  — no identity is produced, compared or
//     persisted until every identity input is genuinely resolved;
//   · the identity-stability gate  — the identity must be observed unchanged
//     across two consecutive settled renders before any decision is taken;
//   · the reconciliation effect    — compare the rebuilt identity against the
//     saved contracts and, on a match, promote the saved contract to CURRENT.
//
// It never calculates, regrades or recomputes anything, and it changes no
// acoustics: a match uses the saved contract exactly as stored.
//
// The extracted module keeps BassBackgroundAnalysisOwner within its size budget
// while the logic stays one cohesive, testable unit.

import { useEffect, useMemo, useRef, useState } from "react";
import { safeConsole } from "@/components/utils/safeConsole";
import {
  buildBassIdentity,
  buildFingerprintInputDigest,
  describeFingerprintDifferences,
  isBassIdentityReady,
} from "./bassIdentityReconciliation";
import {
  getFingerprintInputDigest,
  setFingerprintInputDigest,
} from "./p14TargetCache";
import { reconcileBassAuthorityWithPersisted } from "./completedBassResultStore";

export function useBassAuthorityReconciliation({
  scopeId = "free",
  versionId = "free",
  projectHydrationReady = false,
  authorityHydrationSettled = false,
  targetCacheHydrated = false,
  cacheKey = null,
  baseDesignFingerprint = null,
  fingerprints = null,
  fingerprintInputs = null,
  requested = null,
  targetKey = null,
  roomDims = null,
  rspPosition = null,
  seatingPositions = null,
  sources = null,
  usableLfHz = null,
  optimisationTransitionHz = null,
  optimiserVersions = null,
  authorityStatus = null,
  authorityCurrentFingerprint = null,
  manualRequestActive = false,
  calculationInProgress = false,
} = {}) {
  // ── Identity readiness ────────────────────────────────────────────────
  // Every input below feeds the calibration fingerprint, so a missing one
  // produces a key that describes nothing real. The room-response curve is
  // deliberately NOT required: it is not an identity input, and on a read-only
  // open it is empty until background preparation runs.
  const identityReadiness = useMemo(
    () => isBassIdentityReady({
      roomDims,
      rspPosition,
      seatingPositions,
      sources,
      productCapabilities: fingerprintInputs?.productCapabilities,
      usableLfHz,
      optimisationTransitionHz,
      requested,
      targetKey,
    }),
    [roomDims, rspPosition, seatingPositions, sources, fingerprintInputs?.productCapabilities, usableLfHz, optimisationTransitionHz, requested, targetKey],
  );
  const identityInputsReady = projectHydrationReady && identityReadiness.ready;

  // ── Identity stability ────────────────────────────────────────────────
  // Observed unchanged across two consecutive settled renders. Event-driven —
  // no timers.
  const [identityStable, setIdentityStable] = useState(false);
  const observationRef = useRef({ fingerprint: null, count: 0 });
  useEffect(() => {
    const observed = observationRef.current;
    if (!identityInputsReady || !cacheKey) {
      observed.fingerprint = null;
      observed.count = 0;
      if (identityStable) setIdentityStable(false);
      return;
    }
    if (observed.fingerprint === cacheKey) {
      observed.count += 1;
      if (observed.count >= 2 && !identityStable) setIdentityStable(true);
      return;
    }
    observed.fingerprint = cacheKey;
    observed.count = 1;
    if (identityStable) setIdentityStable(false);
  }, [identityInputsReady, cacheKey, identityStable]);

  // ── Reconciliation ────────────────────────────────────────────────────
  const reconciliationRef = useRef({ fingerprint: null, matched: null, source: null, reason: null, differences: null });
  useEffect(() => {
    if (!projectHydrationReady || !authorityHydrationSettled || !targetCacheHydrated) return;
    if (!identityInputsReady || !identityStable) return;
    if (!cacheKey || !fingerprints || !targetKey || !baseDesignFingerprint) return;
    if (manualRequestActive || calculationInProgress) return;
    if (reconciliationRef.current.fingerprint === cacheKey) return;

    const alreadyCurrent = authorityStatus === "AUTHORITATIVE" && authorityCurrentFingerprint === cacheKey;
    reconciliationRef.current = { fingerprint: cacheKey, matched: null, source: null, reason: null, differences: null };

    // Record this identity's inputs going forward so a real design change can
    // name the input that moved instead of only saying "out of date".
    const digest = buildFingerprintInputDigest(fingerprintInputs, requested);
    if (alreadyCurrent) {
      setFingerprintInputDigest(scopeId, versionId, cacheKey, digest);
      reconciliationRef.current = { fingerprint: cacheKey, matched: true, source: "already-current", reason: null, differences: null };
      return;
    }

    const identity = buildBassIdentity({
      fingerprints,
      cacheKey,
      baseDesignFingerprint,
      requested,
      targetKey,
      optimiserVersions,
    });
    safeConsole.log("bass-authority-reconcile", JSON.stringify({ projectId: scopeId, versionId, identity }));

    reconcileBassAuthorityWithPersisted(scopeId, versionId, { identity, requestedP14Identity: requested })
      .then((outcome) => {
        if (!outcome || outcome.fingerprint !== cacheKey) return;
        const differences = !outcome.matched && outcome.reason === "no-saved-contract-for-rebuilt-identity"
          ? describeFingerprintDifferences(digest, getFingerprintInputDigest(scopeId, versionId, authorityCurrentFingerprint))
          : null;
        reconciliationRef.current = {
          fingerprint: cacheKey,
          matched: !!outcome.matched,
          source: outcome.source || null,
          reason: outcome.reason || null,
          differences,
        };
        if (outcome.matched) {
          setFingerprintInputDigest(scopeId, versionId, cacheKey, digest);
        }
        safeConsole.log("bass-authority-reconcile-outcome", JSON.stringify({
          projectId: scopeId,
          versionId,
          matched: !!outcome.matched,
          source: outcome.source || null,
          reason: outcome.reason || null,
          targetKey: outcome.targetKey || null,
          differences,
        }));
      })
      .catch(() => { /* opportunistic: reconciliation never fails the open */ });
  }, [
    projectHydrationReady,
    authorityHydrationSettled,
    targetCacheHydrated,
    identityInputsReady,
    identityStable,
    cacheKey,
    fingerprints,
    targetKey,
    baseDesignFingerprint,
    manualRequestActive,
    calculationInProgress,
    authorityStatus,
    authorityCurrentFingerprint,
    fingerprintInputs,
    requested,
    scopeId,
    versionId,
    optimiserVersions,
  ]);

  return { identityReadiness, identityInputsReady, identityStable, reconciliationRef };
}

export default useBassAuthorityReconciliation;