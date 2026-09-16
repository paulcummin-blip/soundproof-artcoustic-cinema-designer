import { useSyncExternalStore } from "react";
import { bassCacheKey } from "./bassCacheKey";

const listeners = new Set();
const memoryByProject = new Map();

function emptyProgress(projectId, versionId) {
  return {
    projectId: bassCacheKey(projectId, versionId),
    baseDesignFingerprint: null,
    status: "idle",
    completed: 0,
    total: 8,
    activeTargetKey: null,
    activeStartedAtMs: null,
    completedDurationsMs: [],
    failedTargetKeys: [],
    updatedAtMs: Date.now(),
  };
}

function getMemory(projectId, versionId) {
  const key = bassCacheKey(projectId, versionId);
  if (!memoryByProject.has(key)) memoryByProject.set(key, emptyProgress(projectId, versionId));
  return memoryByProject.get(key);
}

function notify() {
  listeners.forEach((listener) => listener());
}

function finiteDurations(values) {
  return (Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(-8);
}

export function getP14AnalysisProgress(projectId, versionId) {
  return getMemory(projectId, versionId);
}

export function subscribeP14AnalysisProgress(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishP14AnalysisProgress(projectId, versionId, patch = {}) {
  const key = bassCacheKey(projectId, versionId);
  const previous = getMemory(projectId, versionId);
  const fingerprintChanged = patch.baseDesignFingerprint
    && previous.baseDesignFingerprint
    && patch.baseDesignFingerprint !== previous.baseDesignFingerprint;
  const base = fingerprintChanged ? emptyProgress(projectId, versionId) : previous;
  const next = {
    ...base,
    ...patch,
    projectId: key,
    completed: Number.isFinite(Number(patch.completed))
      ? Math.max(0, Number(patch.completed))
      : base.completed,
    total: Number.isFinite(Number(patch.total))
      ? Math.max(0, Number(patch.total))
      : base.total,
    completedDurationsMs: patch.completedDurationsMs == null
      ? base.completedDurationsMs
      : finiteDurations(patch.completedDurationsMs),
    failedTargetKeys: patch.failedTargetKeys == null
      ? base.failedTargetKeys
      : [...new Set(patch.failedTargetKeys)],
    updatedAtMs: Date.now(),
  };
  if (next.total > 0 && next.completed >= next.total) {
    next.status = "complete";
    next.activeTargetKey = null;
    next.activeStartedAtMs = null;
  }
  memoryByProject.set(key, next);
  notify();
  return next;
}

export function beginP14AnalysisJob(projectId, versionId, {
  baseDesignFingerprint,
  targetKey,
  completed,
  total,
  completedDurationsMs,
} = {}) {
  const previous = getMemory(projectId, versionId);
  const sameJob = previous.baseDesignFingerprint === baseDesignFingerprint
    && previous.activeTargetKey === targetKey
    && Number.isFinite(previous.activeStartedAtMs);
  return publishP14AnalysisProgress(projectId, versionId, {
    baseDesignFingerprint,
    status: "calculating",
    completed,
    total,
    completedDurationsMs,
    activeTargetKey: targetKey || null,
    activeStartedAtMs: sameJob ? previous.activeStartedAtMs : Date.now(),
  });
}

export function pauseP14AnalysisJob(projectId, versionId, { baseDesignFingerprint } = {}) {
  return publishP14AnalysisProgress(projectId, versionId, {
    baseDesignFingerprint,
    activeTargetKey: null,
    activeStartedAtMs: null,
  });
}

export function useP14AnalysisProgress(projectId, versionId) {
  return useSyncExternalStore(
    subscribeP14AnalysisProgress,
    () => getP14AnalysisProgress(projectId, versionId),
    () => getP14AnalysisProgress(projectId, versionId),
  );
}

function weightedDurationMs(durations) {
  const values = finiteDurations(durations);
  if (values.length < 2) return null;
  const recent = values.slice(-5);
  let weightedTotal = 0;
  let weightTotal = 0;
  recent.forEach((value, index) => {
    const weight = index + 1;
    weightedTotal += value * weight;
    weightTotal += weight;
  });
  return weightTotal > 0 ? weightedTotal / weightTotal : null;
}

export function presentP14AnalysisProgress(progress, nowMs = Date.now()) {
  const total = Number(progress?.total) || 8;
  const completed = Math.max(0, Math.min(total, Number(progress?.completed) || 0));
  if (progress?.status === "complete" || (total > 0 && completed >= total)) {
    return { label: `${total} of ${total} prepared`, etaSeconds: null, complete: true };
  }

  if (progress?.status === "idle") {
    if (completed > 0) {
      return { label: `${completed} of ${total} prepared`, etaSeconds: null, complete: false };
    }
    return { label: "Preparing…", etaSeconds: null, complete: false };
  }

  if (progress?.status === "paused") {
    return { label: `Paused — ${completed} of ${total} prepared`, etaSeconds: null, complete: false };
  }

  if (progress?.status === "retryable-partial") {
    return { label: `${completed} of ${total} prepared — retry`, etaSeconds: null, complete: false, retryable: true };
  }

  const active = !!progress?.activeTargetKey;
  const baseLabel = active
    ? `Preparing ${Math.min(completed + 1, total)} of ${total}`
    : `${completed} of ${total} prepared`;
  const meanDurationMs = weightedDurationMs(progress?.completedDurationsMs);
  if (!Number.isFinite(meanDurationMs) || !active) {
    return { label: baseLabel, etaSeconds: null, complete: false };
  }

  const jobsRemaining = Math.max(0, total - completed);
  const elapsedCurrentMs = Number.isFinite(progress?.activeStartedAtMs)
    ? Math.max(0, nowMs - progress.activeStartedAtMs)
    : 0;
  const remainingCurrentMs = Math.max(0, meanDurationMs - elapsedCurrentMs);
  const queuedJobs = Math.max(0, jobsRemaining - 1);
  const remainingMs = remainingCurrentMs + queuedJobs * meanDurationMs;

  if (elapsedCurrentMs > 3 * meanDurationMs) {
    return { label: baseLabel, etaSeconds: null, complete: false };
  }

  const rawSeconds = Math.max(1, remainingMs / 1000);
  const etaSeconds = rawSeconds >= 15
    ? Math.max(5, Math.round(rawSeconds / 5) * 5)
    : Math.max(1, Math.round(rawSeconds));
  return { label: baseLabel, etaSeconds, complete: false };
}