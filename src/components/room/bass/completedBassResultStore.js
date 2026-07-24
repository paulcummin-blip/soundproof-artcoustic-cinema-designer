import { useEffect, useSyncExternalStore } from "react";
import { base44 } from "@/api/base44Client";
import {
  COMPLETED_BASS_CACHE_VERSION,
  buildPersistedBassAuthority,
  compactCompletedBassContract,
  isCompletedBassContract,
  resolvePersistedBassAuthority,
} from "./completedBassResultPersistence";

export { buildPersistedBassAuthority, compactCompletedBassContract, isCompletedBassContract, resolvePersistedBassAuthority };

const memoryByProject = new Map();
const listeners = new Set();
const writeQueues = new Map();
const syncSignatures = new Map();

const projectKey = (projectId) => String(projectId || "free");
const emptyAuthority = (projectId) => ({
  projectId: projectKey(projectId),
  status: "loading",
  currentFingerprint: null,
  contract: null,
  staleContract: null,
  errorMessage: null,
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

export function publishCompletedBassContract(projectId, contract) {
  if (!isCompletedBassContract(contract)) return false;
  const compact = compactCompletedBassContract(contract);
  setMemory(projectId, {
    projectId: projectKey(projectId),
    status: "complete",
    currentFingerprint: compact.job.resultFingerprint,
    contract: compact,
    staleContract: memoryByProject.get(projectKey(projectId))?.contract || null,
    errorMessage: null,
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
    errorMessage: null,
    exportable: false,
  });
}

export function markBassAuthorityFailed(projectId, currentFingerprint, errorMessage) {
  const previous = memoryByProject.get(projectKey(projectId)) || emptyAuthority(projectId);
  setMemory(projectId, {
    ...previous,
    status: "error",
    currentFingerprint: currentFingerprint || null,
    contract: null,
    staleContract: previous.contract || previous.staleContract || null,
    errorMessage: typeof errorMessage === "string" && errorMessage.trim() ? errorMessage : "Bass analysis failed",
    exportable: true,
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
  if (key === "free") return setMemory(key, { ...emptyAuthority(key), status: "uncalculated" });
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