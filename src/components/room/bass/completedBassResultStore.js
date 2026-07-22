import { useSyncExternalStore } from "react";

const completedByScope = new Map();
const listeners = new Set();

export function isCompletedBassContract(contract) {
  const status = contract?.job?.status;
  return ["ready", "complete"].includes(status)
    && !!contract?.selectedCandidate
    && !!contract?.selectedCandidateId
    && !!contract?.job?.resultFingerprint
    && contract.job.resultFingerprint === contract.job.currentJobFingerprint;
}

export function publishCompletedBassContract(scopeId, contract) {
  if (!isCompletedBassContract(contract)) return false;
  const key = String(scopeId || "free");
  if (completedByScope.get(key) === contract) return true;
  completedByScope.set(key, contract);
  listeners.forEach((listener) => listener());
  return true;
}

export const getCompletedBassContract = (scopeId) => completedByScope.get(String(scopeId || "free")) || null;
export function clearCompletedBassContract(scopeId) {
  const deleted = completedByScope.delete(String(scopeId || "free"));
  if (deleted) listeners.forEach((listener) => listener());
  return deleted;
}

export function useCompletedBassContract(scopeId) {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => getCompletedBassContract(scopeId),
    () => getCompletedBassContract(scopeId)
  );
}