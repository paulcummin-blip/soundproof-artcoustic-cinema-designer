import { useEffect, useSyncExternalStore } from "react";
import { base44 } from "@/api/base44Client";
import { INSTANCE_AUTHORITY_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from "@/lib/bassAuthorityVersion";
import {
  COMPLETED_BASS_CACHE_VERSION,
  BASS_AUTHORITY_STATUS,
  bassContractMatchesRequestedP14,
  buildPersistedBassAuthority,
  buildHydratedPersistedWrapper,
  compactCompletedBassContract,
  isCompletedBassContract,
  isStructurallyCompleteBassContract,
  isAuthoritativeBassContract,
  isExportableBassContract,
  resolvePersistedBassAuthority,
} from "./completedBassResultPersistence";
import { isValidLimitedP14Contract } from "./p14LimitedTargetAuthority";

export {
  BASS_AUTHORITY_STATUS,
  buildPersistedBassAuthority,
  compactCompletedBassContract,
  isCompletedBassContract,
  isStructurallyCompleteBassContract,
  isAuthoritativeBassContract,
  isExportableBassContract,
  resolvePersistedBassAuthority,
  bassContractMatchesRequestedP14,
};

const memoryByProject = new Map();
const listeners = new Set();
const writeQueues = new Map();
const syncSignatures = new Map();

// ── Project-keyed refcounted authority manager ──────────────────────────
// Ensures ONE initial hydration per project regardless of how many React
// consumers call useCompletedBassAuthority. Runtime updates are published
// directly by BassBackgroundAnalysisOwner through this same module. We do not
// attach an entity realtime listener: ProjectAnalysisCache records exceed the
// broadcast field limit, so those broadcasts are stubs and only create noisy
// SDK console errors before a full hydrate is required anyway.
const projectAuthorityState = new Map();

function ensureProjectAuthorityState(key) {
  if (!projectAuthorityState.has(key)) {
    projectAuthorityState.set(key, {
      refCount: 0,
      hydrationInFlight: null,
      hydrationStarted: false,
      hydrationSettled: false,
    });
  }
  return projectAuthorityState.get(key);
}

// #1: Explicit completed-bass-authority hydration-settled flag. True only
// after hydrateCompletedBassAuthority has finished (success or fail) for the
// current acquisition cycle. While false, LOADING must not be overwritten by
// terminal BLOCKED/UNCALCULATED and resolveBassReadiness must keep the rating
// pending so a provisional ASDR cannot publish before the persisted authority
// arrives.
function currentHydrationSettled(key) {
  const state = projectAuthorityState.get(key);
  return state ? state.hydrationSettled === true : false;
}

function markHydrationSettled(key) {
  const state = ensureProjectAuthorityState(key);
  if (state.hydrationSettled) return;
  state.hydrationSettled = true;
  const current = memoryByProject.get(key);
  if (current) {
    setMemory(key, { ...current });
  } else {
    notify();
  }
}

function startProjectHydration(key) {
  const state = ensureProjectAuthorityState(key);
  if (state.hydrationInFlight) return state.hydrationInFlight;
  state.hydrationSettled = false;
  state.hydrationInFlight = hydrateCompletedBassAuthority(key).finally(() => {
    state.hydrationInFlight = null;
    markHydrationSettled(key);
  });
  return state.hydrationInFlight;
}

function acquireProjectAuthority(key) {
  const state = ensureProjectAuthorityState(key);
  state.refCount += 1;
  if (!state.hydrationStarted) {
    state.hydrationStarted = true;
    startProjectHydration(key);
  }
}

function releaseProjectAuthority(key) {
  const state = projectAuthorityState.get(key);
  if (!state) return;
  state.refCount = Math.max(0, state.refCount - 1);
  if (state.refCount === 0) {
    state.hydrationStarted = false;
    state.hydrationInFlight = null;
    state.hydrationSettled = false;
  }
}

// Stable signature for snapshot equality — ignores transient object identity,
// timestamps, and noise. Uses the canonical result fingerprint + status.
function authoritySignature(a) {
  if (!a) return "";
  return JSON.stringify({
    s: a.status,
    a: a.authorityStatus,
    cf: a.currentFingerprint || null,
    rf: a.contract?.job?.resultFingerprint || null,
    sc: a.contract?.selectedCandidateId || null,
    sc2: a.structurallyComplete,
    au: a.authoritative,
    ex: a.exportable,
    pr: a.publicationRejectionReason || null,
    e: a.errorMessage || null,
    hs: a.hydrationSettled === true,
  });
}

const projectKey = (projectId) => String(projectId || "free");
const emptyAuthority = (projectId) => ({
  projectId: projectKey(projectId),
  status: "loading",
  authorityStatus: BASS_AUTHORITY_STATUS.LOADING,
  currentFingerprint: null,
  contract: null,
  staleContract: null,
  errorMessage: null,
  structurallyComplete: false,
  authoritative: false,
  exportable: false,
  publicationRejectionReason: null,
  hydrationSettled: false,
});

function notify() {
  listeners.forEach((listener) => listener());
}

function setMemory(projectId, authority) {
  const key = projectKey(projectId);
  const previous = memoryByProject.get(key);
  // Merge the current hydrationSettled flag so every stored authority object
  // carries it and useSyncExternalStore snapshots stay referentially stable
  // until a real state change (or the hydration-settled transition) occurs.
  const withSettled = { ...authority, hydrationSettled: currentHydrationSettled(key) };

  // Publishing the same semantic authority again must be a no-op. The bass
  // owner can legitimately recompute an equivalent blocked/updating snapshot
  // during React renders; notifying every ASDR candidate for that identical
  // snapshot creates a self-sustaining rerender loop.
  if (previous && authoritySignature(previous) === authoritySignature(withSettled)) {
    return previous;
  }

  memoryByProject.set(key, withSettled);
  notify();
  return withSettled;
}

export function publishCompletedBassContract(projectId, contract) {
  if (!isStructurallyCompleteBassContract(contract)) return false;
  const compact = compactCompletedBassContract(contract);
  const authoritative = isAuthoritativeBassContract(compact);
  const exportable = authoritative;
  const publicationRejectionReason = !authoritative
    ? (compact?.metricPublication?.publicationRejectionReason || "metric-publication-invalid")
    : null;
  setMemory(projectId, {
    projectId: projectKey(projectId),
    status: "complete",
    authorityStatus: authoritative ? BASS_AUTHORITY_STATUS.AUTHORITATIVE : BASS_AUTHORITY_STATUS.NOT_VERIFIED,
    currentFingerprint: compact.job.resultFingerprint,
    contract: compact,
    staleContract: memoryByProject.get(projectKey(projectId))?.contract || null,
    errorMessage: null,
    structurallyComplete: true,
    authoritative,
    exportable,
    publicationRejectionReason,
  });
  // FIX 4: Return true ONLY when the contract is authoritatively accepted.
  // A structurally stored but NOT_VERIFIED contract must return false so
  // callers treat it as a terminal rejected state, not success.
  return authoritative;
}

/**
 * Publish a cached compact contract directly as the live authority.
 * Used when the user switches to a P14 target that has already been
 * precomputed by the background scheduler. Skips the optimiser entirely.
 *
 * The compact contract must be authoritative (isAuthoritativeBassContract).
 * This does NOT call compactCompletedBassContract — the input is already compact.
 */
export function publishCachedCompactBassContract(projectId, compactContract, expectedFingerprint = null, requestedP14Identity = null) {
  if (!compactContract || !isAuthoritativeBassContract(compactContract)) return false;
  // Stage 3: cached target must contain the finished graph payload.
  if (!compactContract?.graphPayload?.postEqRspCurve?.length) return false;
  // Stage 4: the contract's result fingerprint must match the expected
  // buildBassResultCacheKey(...) fingerprint for the current design + target.
  // This implicitly verifies the base design matches (calibration fingerprint
  // is a hash of all design inputs) and that the fingerprint format is correct.
  const resultFingerprint = compactContract.job?.resultFingerprint || null;
  if (expectedFingerprint && resultFingerprint !== expectedFingerprint) return false;
  // Stage 4: the contract's P14 identity must match the selected P14 target.
  if (requestedP14Identity && !bassContractMatchesRequestedP14(compactContract, requestedP14Identity)) return false;
  const key = projectKey(projectId);
  setMemory(key, {
    projectId: key,
    status: "complete",
    authorityStatus: BASS_AUTHORITY_STATUS.AUTHORITATIVE,
    currentFingerprint: resultFingerprint,
    contract: compactContract,
    staleContract: memoryByProject.get(key)?.contract || null,
    errorMessage: null,
    structurallyComplete: true,
    authoritative: true,
    exportable: true,
    publicationRejectionReason: null,
  });
  // Persist the selected cached target as the current completed authority so
  // it survives project close/reopen. Without this, the cached target
  // promotion is memory-only and reverts to the previous authority on reopen.
  syncCachedCompactBassAuthority(key, compactContract);
  return true;
}

/**
 * Publish a cached LIMITED P14 contract as the live authority.
 *
 * A LIMITED contract is a terminal engineering result where the requested P14
 * dBC is physically unattainable. It is structurally complete but NOT
 * authoritative (no P18/P19/P20). The authority status is set to LIMITED so
 * downstream consumers can distinguish "capability below target" from
 * "calculating" or "error".
 *
 * Does NOT persist to the DB — LIMITED contracts are cache-only. The DB
 * current authority remains on the last authoritative result so reopening
 * the project restores a valid authoritative state, not a dead-end LIMITED.
 */
export function publishCachedLimitedBassContract(projectId, compactContract, expectedFingerprint = null, requestedP14Identity = null) {
  if (!compactContract || !isValidLimitedP14Contract(compactContract)) return false;
  const resultFingerprint = compactContract.job?.resultFingerprint || null;
  if (expectedFingerprint && resultFingerprint !== expectedFingerprint) return false;
  if (requestedP14Identity && !bassContractMatchesRequestedP14(compactContract, requestedP14Identity)) return false;
  const key = projectKey(projectId);
  setMemory(key, {
    projectId: key,
    status: "complete",
    authorityStatus: BASS_AUTHORITY_STATUS.LIMITED,
    currentFingerprint: resultFingerprint,
    contract: compactContract,
    staleContract: memoryByProject.get(key)?.contract || null,
    errorMessage: null,
    structurallyComplete: true,
    authoritative: false,
    exportable: false,
    publicationRejectionReason: "p14-capability-limited",
  });
  return true;
}

export function markBassAuthorityUpdating(projectId, currentFingerprint) {
  const key = projectKey(projectId);
  const previous = memoryByProject.get(key) || emptyAuthority(projectId);
  // Don't wipe an authoritative result that is still valid for this fingerprint.
  // The background optimiser may emit an incomplete contract before producing a
  // replacement; the existing completed result remains authoritative until a
  // genuinely different fingerprint invalidates it.
  if (previous.authoritative && previous.contract && currentFingerprint && previous.currentFingerprint === currentFingerprint) {
    return previous;
  }
  setMemory(projectId, {
    ...previous,
    status: currentFingerprint ? "updating" : "uncalculated",
    authorityStatus: currentFingerprint ? BASS_AUTHORITY_STATUS.UPDATING : BASS_AUTHORITY_STATUS.UNCALCULATED,
    currentFingerprint: currentFingerprint || null,
    contract: null,
    staleContract: previous.contract || previous.staleContract || null,
    errorMessage: null,
    structurallyComplete: false,
    authoritative: false,
    exportable: false,
    publicationRejectionReason: null,
  });
}

export function markBassAuthorityStale(projectId, currentFingerprint) {
  const key = projectKey(projectId);
  const previous = memoryByProject.get(key) || emptyAuthority(projectId);
  const staleContract = previous.contract || previous.staleContract || null;
  if (!staleContract) return previous;
  if (
    previous.authorityStatus === BASS_AUTHORITY_STATUS.STALE
    && previous.currentFingerprint === (currentFingerprint || null)
  ) return previous;

  const next = setMemory(projectId, {
    ...previous,
    status: "stale",
    authorityStatus: BASS_AUTHORITY_STATUS.STALE,
    currentFingerprint: currentFingerprint || null,
    contract: null,
    staleContract,
    errorMessage: null,
    structurallyComplete: false,
    authoritative: false,
    exportable: false,
    publicationRejectionReason: null,
  });
  syncStaleBassAuthority(key, currentFingerprint || null);
  return next;
}

export function markBassAuthorityFailed(projectId, currentFingerprint, errorMessage) {
  const previous = memoryByProject.get(projectKey(projectId)) || emptyAuthority(projectId);
  setMemory(projectId, {
    ...previous,
    status: "error",
    authorityStatus: BASS_AUTHORITY_STATUS.ERROR,
    currentFingerprint: currentFingerprint || null,
    contract: null,
    staleContract: previous.contract || previous.staleContract || null,
    errorMessage: typeof errorMessage === "string" && errorMessage.trim() ? errorMessage : "Bass analysis failed",
    structurallyComplete: false,
    authoritative: false,
    exportable: false,
    publicationRejectionReason: null,
  });
}

export function markBassAuthorityBlocked(projectId) {
  const key = projectKey(projectId);
  const previous = memoryByProject.get(key) || emptyAuthority(projectId);
  // Don't wipe an authoritative result during transient hydration (e.g. subwoofer
  // instances still hydrating). The result remains valid until a fingerprint
  // mismatch is detected once fingerprints can be evaluated.
  if (previous.authoritative && previous.contract) {
    return previous;
  }
  // #4: While persisted bass-authority hydration is still in flight, do NOT
  // overwrite a non-authoritative LOADING state with terminal BLOCKED. A
  // transient BLOCKED during hydration is treated as final by
  // resolveBassReadiness, publishing a provisional ASDR before the persisted
  // authority arrives. Keep LOADING until hydration settles.
  if (!currentHydrationSettled(key) && previous.authorityStatus === BASS_AUTHORITY_STATUS.LOADING) {
    return previous;
  }
  setMemory(projectId, {
    ...previous,
    status: "blocked",
    authorityStatus: BASS_AUTHORITY_STATUS.BLOCKED,
    currentFingerprint: null,
    contract: null,
    staleContract: null,
    errorMessage: null,
    structurallyComplete: false,
    authoritative: false,
    exportable: false,
    publicationRejectionReason: null,
  });
}

/**
 * Persist a cached compact contract as the current completed authority.
 * Used when the user switches to a precomputed P14 target — the cached
 * compact contract becomes the current completed authority and must
 * persist so it survives project close/reopen.
 *
 * Unlike syncPersistentBassAuthority, this accepts an ALREADY-compact
 * contract and does NOT re-compact it (which would lose the graphPayload).
 */
export function syncCachedCompactBassAuthority(projectId, compactContract) {
  const key = projectKey(projectId);
  if (key === "free") return Promise.resolve(null);
  if (!compactContract || !isAuthoritativeBassContract(compactContract)) return Promise.resolve(null);
  // Stage 3: reject contracts without the finished graph payload.
  if (!compactContract?.graphPayload?.postEqRspCurve?.length) return Promise.resolve(null);
  const currentFingerprint = compactContract.job?.resultFingerprint || null;
  const signature = `cached:${currentFingerprint || ""}|${compactContract.selectedCandidateId || ""}`;
  if (syncSignatures.get(key) === signature) return writeQueues.get(key) || Promise.resolve(null);
  syncSignatures.set(key, signature);
  const queued = (writeQueues.get(key) || Promise.resolve()).then(async () => {
    try {
      const records = await base44.entities.ProjectAnalysisCache.filter({ project_id: key }, '-updated_date', 1);
      const record = Array.isArray(records) ? records[0] : null;
      const existing = record ? {
        version: record.completed_cache_version,
        instanceAuthorityVersion: record.instance_authority_version,
        metricSchemaVersion: record.metric_schema_version,
        currentFingerprint: record.current_fingerprint,
        status: record.status,
        completedByFingerprint: record.completed_by_fingerprint,
      } : null;
      // buildPersistedBassAuthority detects already-compact contracts via
      // the graphPayload flag and uses them directly (no re-compaction).
      const persisted = buildPersistedBassAuthority(existing, currentFingerprint, compactContract, false);
      const payload = {
        project_id: key,
        completed_cache_version: COMPLETED_BASS_CACHE_VERSION,
        instance_authority_version: INSTANCE_AUTHORITY_VERSION,
        metric_schema_version: RP22_BASS_METRIC_SCHEMA_VERSION,
        current_fingerprint: persisted.currentFingerprint,
        status: persisted.status,
        completed_by_fingerprint: persisted.completedByFingerprint,
      };
      if (record?.id) await base44.entities.ProjectAnalysisCache.update(record.id, payload);
      else await base44.entities.ProjectAnalysisCache.create(payload);
      const resolved = resolvePersistedBassAuthority(key, persisted);
      if (resolved?.authoritative) {
        return setMemory(key, resolved);
      }
      return memoryByProject.get(key) || resolved;
    } catch (e) {
      // Sync failure is non-fatal — next change will retry
      return null;
    }
  });
  writeQueues.set(key, queued);
  return queued;
}

export function syncStaleBassAuthority(projectId, currentFingerprint) {
  const key = projectKey(projectId);
  if (key === "free" || !currentFingerprint) return Promise.resolve(null);
  const signature = `stale:${currentFingerprint}`;
  if (syncSignatures.get(key) === signature) return writeQueues.get(key) || Promise.resolve(null);
  syncSignatures.set(key, signature);

  const queued = (writeQueues.get(key) || Promise.resolve()).then(async () => {
    try {
      const records = await base44.entities.ProjectAnalysisCache.filter({ project_id: key }, '-updated_date', 1);
      const record = Array.isArray(records) ? records[0] : null;
      const existing = record ? {
        version: record.completed_cache_version,
        instanceAuthorityVersion: record.instance_authority_version,
        metricSchemaVersion: record.metric_schema_version,
        currentFingerprint: record.current_fingerprint,
        status: record.status,
        completedByFingerprint: record.completed_by_fingerprint,
      } : null;
      const persisted = {
        ...buildPersistedBassAuthority(existing, currentFingerprint, null, false),
        status: "stale",
      };
      const payload = {
        project_id: key,
        completed_cache_version: COMPLETED_BASS_CACHE_VERSION,
        instance_authority_version: INSTANCE_AUTHORITY_VERSION,
        metric_schema_version: RP22_BASS_METRIC_SCHEMA_VERSION,
        current_fingerprint: persisted.currentFingerprint,
        status: persisted.status,
        completed_by_fingerprint: persisted.completedByFingerprint,
      };
      if (record?.id) await base44.entities.ProjectAnalysisCache.update(record.id, payload);
      else await base44.entities.ProjectAnalysisCache.create(payload);

      const live = memoryByProject.get(key);
      if (
        live?.authorityStatus === BASS_AUTHORITY_STATUS.STALE
        && live?.currentFingerprint === currentFingerprint
      ) {
        return setMemory(key, resolvePersistedBassAuthority(key, persisted));
      }
      return live || null;
    } catch (e) {
      return memoryByProject.get(key) || null;
    }
  });
  writeQueues.set(key, queued);
  return queued;
}

export function syncPersistentBassAuthority(projectId, currentFingerprint, contract) {
  const key = projectKey(projectId);
  if (key === "free") return Promise.resolve(null);
  // FIX 1: Detect already-compact contracts (has graphPayload, lacks
  // finalOptimisedBassResponse) and use them directly. Re-compacting a compact
  // contract destroys assessmentEnvelope and graphPayload because
  // buildAssessmentEnvelope / buildGraphPayload read from
  // finalOptimisedBassResponse which is absent on compact contracts. This is
  // the same guard used in buildPersistedBassAuthority (line 424) and
  // syncCachedCompactBassAuthority.
  const isAlreadyCompact = contract && !contract.finalOptimisedBassResponse && contract.graphPayload;
  const completed = isAlreadyCompact ? contract : compactCompletedBassContract(contract);
  const signature = `${currentFingerprint || ""}|${completed?.job?.resultFingerprint || ""}|${completed?.selectedCandidateId || ""}`;
  if (syncSignatures.get(key) === signature) return writeQueues.get(key) || Promise.resolve(null);
  syncSignatures.set(key, signature);
  const queued = (writeQueues.get(key) || Promise.resolve()).then(async () => {
    const records = await base44.entities.ProjectAnalysisCache.filter({ project_id: key }, '-updated_date', 1);
    const record = Array.isArray(records) ? records[0] : null;
    const existing = record ? {
      version: record.completed_cache_version,
      instanceAuthorityVersion: record.instance_authority_version,
      metricSchemaVersion: record.metric_schema_version,
      currentFingerprint: record.current_fingerprint,
      status: record.status,
      completedByFingerprint: record.completed_by_fingerprint,
    } : null;
    const persisted = buildPersistedBassAuthority(existing, currentFingerprint, completed, !completed);
    const payload = {
      project_id: key,
      completed_cache_version: COMPLETED_BASS_CACHE_VERSION,
      instance_authority_version: INSTANCE_AUTHORITY_VERSION,
      metric_schema_version: RP22_BASS_METRIC_SCHEMA_VERSION,
      current_fingerprint: persisted.currentFingerprint,
      status: persisted.status,
      completed_by_fingerprint: persisted.completedByFingerprint,
    };
    if (record?.id) await base44.entities.ProjectAnalysisCache.update(record.id, payload);
    else await base44.entities.ProjectAnalysisCache.create(payload);
    const resolved = resolvePersistedBassAuthority(key, persisted);
    // When syncing with no new completed contract (optimiser still running),
    // the DB may still hold an old NOT_VERIFIED snapshot that matches the
    // current fingerprint. Don't overwrite the in-memory UPDATING state (set
    // by markBassAuthorityUpdating) with that stale NOT_VERIFIED contract —
    // it would re-present the old result as COMPLETE and undermine the
    // foreground recalculation. The DB sync still happens; only the in-memory
    // state is preserved. When a new completed contract IS being synced
    // (optimiser just finished), always update the in-memory state.
    if (!completed && resolved && !resolved.authoritative) {
      return memoryByProject.get(key) || resolved;
    }
    return setMemory(key, resolved);
  });
  writeQueues.set(key, queued);
  return queued;
}

export async function hydrateCompletedBassAuthority(projectId) {
  const key = projectKey(projectId);
  if (key === "free") return setMemory(key, { ...emptyAuthority(key), status: "uncalculated", authorityStatus: BASS_AUTHORITY_STATUS.UNCALCULATED });
  const current = memoryByProject.get(key);
  if (current?.status === "error" && current.errorMessage) return current;
  try {
    const records = await base44.entities.ProjectAnalysisCache.filter({ project_id: key }, '-updated_date', 1);
    const record = Array.isArray(records) ? records[0] : null;
    const persisted = buildHydratedPersistedWrapper(record);
    const next = resolvePersistedBassAuthority(key, persisted);

    // ── Route-navigation guard ──────────────────────────────────────────
    // When navigating between Room Designer and report pages (Technical
    // Report, Visual Report, Design Review) within the same session, the
    // in-memory authority is the most recent state. The DB may lag behind
    // because syncPersistentBassAuthority is async. Never overwrite an
    // authoritative in-memory result with a non-authoritative DB record
    // (stale "updating"/"uncalculated"/null) — that would reset P14/P18/
    // P19/P20 to blank and trigger a recalculation solely because the
    // report route opened. The DB is only authoritative for fresh page
    // loads / new sessions where no in-memory state exists.
    if (current?.authoritative && current?.contract && !next?.authoritative) {
      return current;
    }

    // Ignore unchanged snapshot — don't publish a new store object or notify
    // listeners merely because a realtime callback fired. Compares canonical
    // result fingerprint + status + authority flags, not object identity.
    if (current && authoritySignature(current) === authoritySignature(next)) {
      return current;
    }
    return setMemory(key, next);
  } catch (e) {
    // #1: Failed DB read — must not remain LOADING indefinitely. Transition
    // to ERROR so resolveBassReadiness settles (ready: true, reason: 'error')
    // and the foreground optimiser is allowed to run once project hydration
    // is ready. Don't wipe an authoritative in-memory result on a transient
    // DB error — the route-navigation guard above covers that, but this
    // catch must also preserve it.
    if (current?.authoritative && current?.contract) {
      return current;
    }
    return setMemory(key, {
      projectId: key,
      status: "error",
      authorityStatus: BASS_AUTHORITY_STATUS.ERROR,
      currentFingerprint: current?.currentFingerprint || null,
      contract: null,
      staleContract: current?.contract || current?.staleContract || null,
      errorMessage: "Bass authority hydration failed",
      structurallyComplete: false,
      authoritative: false,
      exportable: false,
      publicationRejectionReason: null,
    });
  }
}

export function getCompletedBassAuthority(projectId) {
  const key = projectKey(projectId);
  if (!memoryByProject.has(key)) memoryByProject.set(key, emptyAuthority(key));
  return memoryByProject.get(key);
}
export const getCompletedBassContract = (projectId) => getCompletedBassAuthority(projectId).contract;

/**
 * Check whether an authoritative completed bass result already exists in memory
 * for this project, optionally matching a specific fingerprint.
 *
 * Used by BassBackgroundAnalysisOwner to avoid wiping a valid hydrated result
 * when the background optimiser has not yet produced a replacement contract.
 */
export function hasAuthoritativeResult(projectId, fingerprint = null) {
  const key = projectKey(projectId);
  const authority = memoryByProject.get(key);
  if (!authority || !authority.authoritative || !authority.contract) return false;
  if (fingerprint && authority.currentFingerprint !== fingerprint) return false;
  return true;
}

/**
 * #1: Whether persisted completed-bass-authority hydration has settled for this
 * project. While false, LOADING is preserved (markBassAuthorityBlocked is a
 * no-op) and resolveBassReadiness keeps BLOCKED/UNCALCULATED pending so no
 * provisional ASDR can publish. Used by BassBackgroundAnalysisOwner to gate
 * foreground optimiser starts until the persisted authority either restores
 * (AUTHORITATIVE → skip) or is confirmed absent (UNCALCULATED → calculate).
 */
export function isBassAuthorityHydrationSettled(projectId) {
  return currentHydrationSettled(projectKey(projectId));
}

export function useCompletedBassAuthority(projectId) {
  const key = projectKey(projectId);
  const authority = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => getCompletedBassAuthority(key),
    () => getCompletedBassAuthority(key),
  );
  useEffect(() => {
    // ONE hydration per project, shared across all consumers (baseline +
    // recommendation candidates) via refcounting. Runtime authority changes
    // publish directly through this module; route remounts rehydrate once.
    acquireProjectAuthority(key);
    return () => releaseProjectAuthority(key);
  }, [key]);
  return authority;
}

export function useCompletedBassContract(projectId) {
  return useCompletedBassAuthority(projectId).contract;
}