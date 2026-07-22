import { useEffect, useSyncExternalStore } from "react";
import { base44 } from "@/api/base44Client";

const memoryByProject = new Map();
const listeners = new Set();
const writeQueues = new Map();
const syncSignatures = new Map();
const CACHE_VERSION = 1;

const projectKey = (projectId) => String(projectId || "free");
const emptyAuthority = (projectId) => ({
  projectId: projectKey(projectId),
  status: "loading",
  currentFingerprint: null,
  contract: null,
  staleContract: null,
  exportable: false,
});

function notify() {
  listeners.forEach((listener) => listener());
}

function setMemory(projectId, authority) {
  memoryByProject.set(projectKey(projectId), authority);
  notify();
  return authority;
}

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
    productAnalysis: {
      status: "complete",
      parameters: contract.productAnalysis?.parameters || {},
    },
    selectedMode: contract.selectedMode,
    selectedCandidateId: contract.selectedCandidateId,
    selectedCandidate: {
      id: contract.selectedCandidate?.id || contract.selectedCandidateId,
      worstP20SeatId: contract.selectedCandidate?.worstP20SeatId || null,
      perSeatP19Results: contract.selectedCandidate?.perSeatP19Results || [],
      perSeatP20Results: contract.selectedCandidate?.perSeatP20Results || [],
    },
    provenance: contract.provenance || {},
  };
}

export function buildPersistedBassAuthority(existing, currentFingerprint, contract = null, forceUpdating = false) {
  const previous = existing && typeof existing === "object" ? existing : {};
  const completedByFingerprint = { ...(previous.completedByFingerprint || {}) };
  const compact = compactCompletedBassContract(contract);
  if (compact) completedByFingerprint[compact.job.resultFingerprint] = compact;
  const ordered = Object.entries(completedByFingerprint)
    .sort(([, left], [, right]) => Number(right?.job?.completedAtMs || 0) - Number(left?.job?.completedAtMs || 0))
    .slice(0, 3);
  const bounded = Object.fromEntries(ordered);
  const fingerprint = currentFingerprint || compact?.job?.resultFingerprint || previous.currentFingerprint || null;
  const matching = fingerprint ? bounded[fingerprint] || null : null;
  return {
    version: CACHE_VERSION,
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
    projectId: projectKey(projectId),
    status: current ? "complete" : state.status === "uncalculated" ? "uncalculated" : "updating",
    currentFingerprint,
    contract: isCompletedBassContract(current) ? current : null,
    staleContract,
    exportable: isCompletedBassContract(current),
  };
}

export function publishCompletedBassContract(projectId, contract) {
  if (!isCompletedBassContract(contract)) return false;
  const compact = compactCompletedBassContract(contract);
  setMemory(projectId, {
    projectId: projectKey(projectId),
    status: "complete",
    currentFingerprint: compact.job.resultFingerprint,
    contract: compact,
    staleContract: memoryByProject.get(projectKey(projectId))?.contract || null,
    exportable: true,
  });
  return true;
}

export function markBassAuthorityUpdating(projectId, currentFingerprint) {
  const previous = memoryByProject.get(projectKey(projectId)) || emptyAuthority(projectId);
  setMemory(projectId, {
    ...previous,
    status: currentFingerprint ? "updating" : "uncalculated",
    currentFingerprint: currentFingerprint || null,
    contract: null,
    staleContract: previous.contract || previous.staleContract || null,
    exportable: false,
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
      version: CACHE_VERSION,
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
  if (key === "free") return setMemory(key, { ...emptyAuthority(key), status: "uncalculated" });
  const records = await base44.entities.ProjectAnalysisCache.filter({ project_id: key }, '-updated_date', 1);
  const record = Array.isArray(records) ? records[0] : null;
  const persisted = record ? {
    version: CACHE_VERSION,
    currentFingerprint: record.current_fingerprint,
    status: record.status,
    completedByFingerprint: record.completed_by_fingerprint,
  } : null;
  return setMemory(key, resolvePersistedBassAuthority(key, persisted));
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
    hydrateCompletedBassAuthority(key);
    const unsubscribe = key === "free" ? null : base44.entities.ProjectAnalysisCache.subscribe((event) => {
      if (String(event?.data?.project_id || "") === key) hydrateCompletedBassAuthority(key);
    });
    return () => unsubscribe?.();
  }, [key]);
  return authority;
}

export function useCompletedBassContract(projectId) {
  return useCompletedBassAuthority(projectId).contract;
}