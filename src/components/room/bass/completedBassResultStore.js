import { useEffect, useSyncExternalStore } from "react";
import { base44 } from "@/api/base44Client";
import {
  COMPLETED_BASS_CACHE_VERSION,
  BASS_AUTHORITY_STATUS,
  bassContractMatchesRequestedP14,
  buildPersistedBassAuthority,
  compactCompletedBassContract,
  isCompletedBassContract,
  isStructurallyCompleteBassContract,
  isAuthoritativeBassContract,
  isExportableBassContract,
  resolvePersistedBassAuthority,
} from "./completedBassResultPersistence";

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
// SDK errors before a full hydrate is required anyway.
const projectAuthorityState = new Map();

function ensureProjectAuthorityState(key) {
  if (!projectAuthorityState.has(key)) {
    projectAuthorityState.set(key, {
      refCount: 0,
      hydrationInFlight: null,
      hydrationStarted: false,
    });
  }
  return projectAuthorityState.get(key);
}

function startProjectHydration(key) {
  const state = ensureProjectAuthorityState(key);
  if (state.hydrationInFlight) return state.hydrationInFlight;
  state.hydrationInFlight = hydrateCompletedBassAuthority(key).finally(() => {
    state.hydrationInFlight = null;
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
});

function notify() {
  listeners.forEach((listener) => listener());
}

function setMemory(projectId, authority) {
  const key = projectKey(projectId);
  const previous = memoryByProject.get(key);

  // Publishing the same semantic authority again must be a no-op. The bass
  // owner can legitimately recompute an equivalent blocked/updating snapshot
  // during React renders; notifying every ASDR candidate for that identical
  // snapshot creates a self-sustaining rerender loop.
  if (previous && authoritySignature(previous) === authoritySignature(authority)) {
    return previous;
  }

  memoryByProject.set(key, authority);
  notify();
  return authority;
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
  return true;
}

export function markBassAuthorityUpdating(projectId, currentFingerprint) {
  const previous = memoryByProject.get(projectKey(projectId)) || emptyAuthority(projectId);
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
  const previous = memoryByProject.get(projectKey(projectId)) || emptyAuthority(projectId);
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

export function syncPersistentBassAuthority(projectId, currentFingerprint, contract) {
  const key = projectKey(projectId);
  if (key === "free") return Promise.resolve(null);
  const completed = compactCompletedBassContract(contract);
  const signature = `${currentFingerprint || ""}|${completed?.job?.resultFingerprint || ""}|${completed?.selectedCandidateId || ""}`;
  if (syncSignatures.get(key) === signature) return writeQueues.get(key) || Promise.resolve(null);
  syncSignatures.set(key, signature);
  const queued = (writeQueues.get(key) || Promise.resolve()).then(async () => {
    const records = await base44.entities.ProjectAnalysisCache.filter({ project_id: key }, '-updated_date', 1);
    const record = Array.isArray(records) ? records[0] : null;
    const existing = record ? {
      version: COMPLETED_BASS_CACHE_VERSION,
      currentFingerprint: record.current_fingerprint,
      status: record.status,
      completedByFingerprint: record.completed_by_fingerprint,
    } : null;
    const persisted = buildPersistedBassAuthority(existing, currentFingerprint, completed, !completed);
    const payload = {
      project_id: key,
      current_fingerprint: persisted.currentFingerprint,
      status: persisted.status,
      completed_by_fingerprint: persisted.completedByFingerprint,
    };
    if (record?.id) await base44.entities.ProjectAnalysisCache.update(record.id, payload);
    else await base44.entities.ProjectAnalysisCache.create(payload);
    return setMemory(key, resolvePersistedBassAuthority(key, persisted));
  });
  writeQueues.set(key, queued);
  return queued;
}

export async function hydrateCompletedBassAuthority(projectId) {
  const key = projectKey(projectId);
  if (key === "free") return setMemory(key, { ...emptyAuthority(key), status: "uncalculated", authorityStatus: BASS_AUTHORITY_STATUS.UNCALCULATED });
  const current = memoryByProject.get(key);
  if (current?.status === "error" && current.errorMessage) return current;
  const records = await base44.entities.ProjectAnalysisCache.filter({ project_id: key }, '-updated_date', 1);
  const record = Array.isArray(records) ? records[0] : null;
  const persisted = record ? {
    version: COMPLETED_BASS_CACHE_VERSION,
    currentFingerprint: record.current_fingerprint,
    status: record.status,
    completedByFingerprint: record.completed_by_fingerprint,
  } : null;
  const next = resolvePersistedBassAuthority(key, persisted);
  // Ignore unchanged snapshot — don't publish a new store object or notify
  // listeners merely because a realtime callback fired. Compares canonical
  // result fingerprint + status + authority flags, not object identity.
  if (current && authoritySignature(current) === authoritySignature(next)) {
    return current;
  }
  return setMemory(key, next);
}

export function getCompletedBassAuthority(projectId) {
  const key = projectKey(projectId);
  if (!memoryByProject.has(key)) memoryByProject.set(key, emptyAuthority(key));
  return memoryByProject.get(key);
}
export const getCompletedBassContract = (projectId) => getCompletedBassAuthority(projectId).contract;

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