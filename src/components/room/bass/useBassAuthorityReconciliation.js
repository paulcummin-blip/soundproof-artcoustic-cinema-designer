// useBassAuthorityReconciliation.js
// ---------------------------------
// The missing restore step, as one hook: rebuild the bass identity from the
// FULLY HYDRATED design and reconcile it against the saved contracts.
//
// Why this exists
// ---------------
// A persisted bass authority row carries a current_fingerprint written by a
// previous session. Nothing on the restore path ever recomputed that identity
// from the design actually being opened, so a key produced from unsettled inputs
// — before the room, reference listening position, subwoofer instances, resolved
// subwoofer capability, usable LF limit, transition frequency or P14 target had
// resolved — was restored verbatim as "out of date" on every open, even when a
// valid saved contract for the real design sat in the same cache record (the P14
// target bank).
//
// This hook owns:
//   · the identity-readiness gate  — no identity is produced, compared or
//     persisted until every identity input is genuinely resolved;
//   · the reconciliation effect    — compare the rebuilt identity against the
//     saved contracts and, on a match, promote the saved contract to CURRENT;
//   · the async identity guard     — re-verify the identity immediately before a
//     match is promoted, so a contract is never promoted from an identity that
//     moved while the cache record was being read.
//
// Eligibility is "every identity input is resolved and a key can be built from
// them". There is deliberately NO "observed across two renders" latch: a React
// effect re-runs only when its dependencies change, so a latch that waits for a
// second execution after the identity settles can never close — which made
// reconciliation permanently unreachable. The safety the latch was meant to
// provide is enforced by the async identity guard instead.
//
// It never calculates, regrades or recomputes anything, and it changes no
// acoustics: a match uses the saved contract exactly as stored.

import { useEffect, useMemo, useRef } from "react";
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
import { publishBassReconciliationStatus } from "./bassReconciliationStatus";

export function useBassAuthorityReconciliation({
  scopeId = "free",
  versionId = "free",
  projectHydrationReady = false,
  authorityHydrationSettled = false,
  // Whether THIS surface owns the hydrated P14 target bank. It gates only the
  // diagnostic digest written beside the bank — never reconciliation itself.
  // A report route passes false: the bank is read from the same cache record by
  // the store, and a surface that does not own the bank must not write to it.
  targetCacheHydrated = false,
  // Where this instance runs (room_designer / shared_restore), for diagnostics.
  reconciliationSource = null,
  // Reported for runtime proof only. It is deliberately NOT a gate: in the Room
  // Designer it means the room-physics worker has produced its curve, which only
  // happens after a calculation — requiring it would reintroduce recalculation
  // on open. Identity readiness is what this hook actually needs.
  inputsValid = null,
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

  // Eligible as soon as every identity input is resolved and a key can be built
  // from them (no fallback/default values remain — each one is a readiness input).
  const identityEligible = identityInputsReady && !!cacheKey;

  // Hook-mounted proof, written before any eligibility test, so "never mounted"
  // is distinguishable from "mounted but not yet eligible".
  useEffect(() => {
    publishBassReconciliationStatus(scopeId, versionId, {
      hookMounted: true,
      source: reconciliationSource,
    });
  }, [scopeId, versionId, reconciliationSource]);

  const digest = useMemo(
    () => (identityEligible ? JSON.stringify(buildFingerprintInputDigest(fingerprintInputs, requested)) : null),
    [identityEligible, fingerprintInputs, requested],
  );
  // Readable after the async read: the guard compares the identity as it is NOW
  // against the identity the match was computed from.
  const latestIdentityRef = useRef({ cacheKey: null, digest: null });
  latestIdentityRef.current = { cacheKey, digest };

  // Publish every eligibility exit; a mounted hook must never fail silently.
  useEffect(() => {
    const blocked = !scopeId || scopeId === "free" || !versionId || versionId === "free" ? "missing projectId/versionId"
      : !projectHydrationReady ? "missing design state"
        : !authorityHydrationSettled ? "missing bass row: hydration pending"
          : !identityEligible ? (identityReadiness.reason || "identity not ready")
            : !fingerprints || !targetKey || !baseDesignFingerprint ? "effect guard false: missing fingerprint context"
              : manualRequestActive || calculationInProgress ? "effect guard false: calculation active" : null;
    publishBassReconciliationStatus(scopeId, versionId, {
      designStateReceived: projectHydrationReady,
      identityReady: identityEligible,
      identityMissing: identityReadiness.missing,
      inputsValid: inputsValid === true,
      cacheKeyBuilt: !!cacheKey,
      cacheKey,
      baseDesignFingerprint,
      ...(blocked ? { ran: false, reason: blocked, authorityStatusBefore: authorityStatus, authorityStatusAfter: authorityStatus } : {}),
    });
  }, [scopeId, versionId, projectHydrationReady, authorityHydrationSettled, identityEligible, identityReadiness, inputsValid, cacheKey, baseDesignFingerprint, fingerprints, targetKey, manualRequestActive, calculationInProgress, authorityStatus]);

  // ── Reconciliation ────────────────────────────────────────────────────
  const reconciliationRef = useRef({ fingerprint: null, matched: null, source: null, reason: null, differences: null });
  useEffect(() => {
    if (!projectHydrationReady || !authorityHydrationSettled) return;
    if (!identityEligible) return;
    if (!fingerprints || !targetKey || !baseDesignFingerprint) return;
    if (manualRequestActive || calculationInProgress) return;
    if (reconciliationRef.current.fingerprint === cacheKey) return;

    const alreadyCurrent = authorityStatus === "AUTHORITATIVE" && authorityCurrentFingerprint === cacheKey;
    reconciliationRef.current = { fingerprint: cacheKey, matched: null, source: null, reason: null, differences: null };

    publishBassReconciliationStatus(scopeId, versionId, {
      hookMounted: true,
      source: reconciliationSource,
      identityReady: true,
      inputsValid: inputsValid === true,
      cacheKeyBuilt: true,
      cacheKey,
      matched: null,
      matchSource: null,
      ran: true,
      reason: "reconciling",
      writeAttempted: false,
      writeSucceeded: null,
      differences: null,
      authorityStatusBefore: authorityStatus,
      authorityCurrentFingerprintBefore: authorityCurrentFingerprint,
    });

    if (alreadyCurrent) {
      reconciliationRef.current = { fingerprint: cacheKey, matched: true, source: "already-current", reason: null, differences: null };
      publishBassReconciliationStatus(scopeId, versionId, {
        matched: true,
        matchSource: "already-current",
        matchedFingerprint: cacheKey,
        authorityStatusAfter: authorityStatus,
        reason: "already-current",
      });
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
    safeConsole.log("bass-authority-reconcile", JSON.stringify({ projectId: scopeId, versionId, source: reconciliationSource, identity }));

    const callFingerprint = cacheKey;
    const callDigest = digest;

    reconcileBassAuthorityWithPersisted(scopeId, versionId, {
      identity,
      requestedP14Identity: requested,
      // Re-verified after the cache read: if the live identity no longer matches
      // the one this match was built from, the result is discarded and the next
      // eligible identity is awaited.
      verifyIdentity: () => latestIdentityRef.current.cacheKey === callFingerprint
        && latestIdentityRef.current.digest === callDigest,
    })
      .then((outcome) => {
        if (!outcome || outcome.fingerprint !== cacheKey) return;
        const differences = !outcome.matched && outcome.reason?.startsWith("no-saved-contract-for-rebuilt-identity") && targetCacheHydrated
          ? describeFingerprintDifferences(digest, getFingerprintInputDigest(scopeId, versionId, authorityCurrentFingerprint))
          : null;
        reconciliationRef.current = {
          fingerprint: cacheKey,
          matched: !!outcome.matched,
          source: outcome.source || null,
          reason: outcome.reason || null,
          differences,
        };
        if (outcome.matched && targetCacheHydrated) {
          setFingerprintInputDigest(scopeId, versionId, cacheKey, digest);
        }
        publishBassReconciliationStatus(scopeId, versionId, {
          source: reconciliationSource,
          identityReady: true,
          inputsValid: inputsValid === true,
          cacheKeyBuilt: true,
          cacheKey,
          matched: !!outcome.matched,
          matchSource: outcome.source || null,
          matchedFingerprint: outcome.contract?.job?.resultFingerprint || null,
          matchedTargetKey: outcome.targetKey || null,
          reason: outcome.reason || null,
          writeAttempted: outcome.writeAttempted === true,
          differences,
          authorityStatusAfter: outcome.matched ? "AUTHORITATIVE" : authorityStatus,
          authorityCurrentFingerprintAfter: outcome.matched ? callFingerprint : null,
        });
        safeConsole.log("bass-authority-reconcile-outcome", JSON.stringify({
          projectId: scopeId,
          versionId,
          source: reconciliationSource,
          matched: !!outcome.matched,
          source_: outcome.source || null,
          reason: outcome.reason || null,
          targetKey: outcome.targetKey || null,
          differences,
        }));
      })
      .catch((error) => {
        publishBassReconciliationStatus(scopeId, versionId, {
          ran: true, matched: false, reason: `reconciliation-error: ${error?.message || String(error)}`,
          authorityStatusAfter: authorityStatus,
        });
      });
  }, [
    projectHydrationReady,
    authorityHydrationSettled,
    identityEligible,
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
    digest,
    reconciliationSource,
    targetCacheHydrated,
    inputsValid,
  ]);

  return { identityReadiness, identityInputsReady };
}

export default useBassAuthorityReconciliation;