import { useSyncExternalStore } from "react";

const listeners = new Set();
const memoryByProject = new Map();

function projectKey(projectId) {
  return String(projectId || "free");
}

function emptyProgress(projectId) {
  return {
    projectId: projectKey(projectId),
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

function getMemory(projectId) {
  const key = projectKey(projectId);
  if (!memoryByProject.has(key)) memoryByProject.set(key, emptyProgress(key));
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

export function getP14AnalysisProgress(projectId) {
  return getMemory(projectId);
}

export function subscribeP14AnalysisProgress(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishP14AnalysisProgress(projectId, patch = {}) {
  const key = projectKey(projectId);
  const previous = getMemory(key);
  const fingerprintChanged = patch.baseDesignFingerprint
    && previous.baseDesignFingerprint
    && patch.baseDesignFingerprint !== previous.baseDesignFingerprint;
  const base = fingerprintChanged ? emptyProgress(key) : previous;
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

export function beginP14AnalysisJob(projectId, {
  baseDesignFingerprint,
  targetKey,
  completed,
  total,
  completedDurationsMs,
} = {}) {
  const previous = getMemory(projectId);
  const sameJob = previous.baseDesignFingerprint === baseDesignFingerprint
    && previous.activeTargetKey === targetKey
    && Number.isFinite(previous.activeStartedAtMs);
  return publishP14AnalysisProgress(projectId, {
    baseDesignFingerprint,
    status: "calculating",
    completed,
    total,
    completedDurationsMs,
    activeTargetKey: targetKey || null,
    activeStartedAtMs: sameJob ? previous.activeStartedAtMs : Date.now(),
  });
}

export function pauseP14AnalysisJob(projectId, { baseDesignFingerprint } = {}) {
  return publishP14AnalysisProgress(projectId, {
    baseDesignFingerprint,
    activeTargetKey: null,
    activeStartedAtMs: null,
  });
}

export function useP14AnalysisProgress(projectId) {
  return useSyncExternalStore(
    subscribeP14AnalysisProgress,
    () => getP14AnalysisProgress(projectId),
    () => getP14AnalysisProgress(projectId),
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
    return { label: "Analysis complete", etaSeconds: null, complete: true };
  }

  // Hydration gate: "idle" status means the persisted cache hasn't been read
  // yet or no work is in progress. Don't show "Calculating N/8" — it's a
  // transient flash before the hydrated family resolves.
  if (progress?.status === "idle") {
    return { label: "Preparing…", etaSeconds: null, complete: false };
  }

  const active = !!progress?.activeTargetKey;
  const ordinal = Math.min(total, completed + (active ? 1 : 0));
  const baseLabel = `Calculating ${ordinal} of ${total}`;
  const meanDurationMs = weightedDurationMs(progress?.completedDurationsMs);
  if (!Number.isFinite(meanDurationMs)) {
    return { label: baseLabel, etaSeconds: null, complete: false };
  }

  const jobsRemaining = Math.max(0, total - completed);
  const elapsedCurrentMs = active && Number.isFinite(progress?.activeStartedAtMs)
    ? Math.max(0, nowMs - progress.activeStartedAtMs)
    : 0;
  const remainingCurrentMs = active ? Math.max(0, meanDurationMs - elapsedCurrentMs) : 0;
  const queuedJobs = active ? Math.max(0, jobsRemaining - 1) : jobsRemaining;
  const remainingMs = remainingCurrentMs + queuedJobs * meanDurationMs;
  const rawSeconds = Math.max(1, remainingMs / 1000);
  const etaSeconds = rawSeconds >= 15
    ? Math.max(5, Math.round(rawSeconds / 5) * 5)
    : Math.max(1, Math.round(rawSeconds));
  return {
    label: `${baseLabel} · ~${etaSeconds}s remaining`,
    etaSeconds,
    complete: false,
  };
}