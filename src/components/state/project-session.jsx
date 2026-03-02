import React from "react";
import { ProjectBus } from "@/components/state/bus";

// Persistent project session with per-project summary + legacy spec (for backward compatibility)
const STORAGE_KEY = "project-session";
const ACTIVE_PROJECT_KEY = "activeProjectId";

// Summary model (per acceptance)
const emptySummary = {
  dolbyLayout: undefined,       // "5.1", "7.1.4", etc.
  targetSPL_LCR_dB: null,       // number | null
  lcrModel: null,               // string | null
  surroundModel: null,          // string | null
  heightModel: null,            // string | null
  subModel: null,               // string | null
  subCount: null,               // number | null
  ampHeadroom_dB: null,         // number | null
};

// Internal store
let state = {
  activeProjectId: null,
  // Per-project summary map: id -> summary
  byProject: {},

  // Legacy spec (kept to avoid breaking pages using it)
  spec: { dolbyLayout: undefined, targetSPL_LCR_dB: null },
};

const listeners = new Set();

// Synchronous read of persisted active project id
export function getActiveProjectId() {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(ACTIVE_PROJECT_KEY) || null; } catch { return null; }
}

// Persistence helpers
function load() {
  const persistedId = getActiveProjectId();
  const empty = {
    activeProjectId: persistedId,
    byProject: {},
    spec: { dolbyLayout: undefined, targetSPL_LCR_dB: null },
  };

  if (typeof window === "undefined") {
    return empty;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;

    const parsed = JSON.parse(raw) || {};
    return {
      activeProjectId: persistedId,   // always restore from dedicated key
      byProject: parsed.byProject || {},
      spec: parsed.spec || { dolbyLayout: undefined, targetSPL_LCR_dB: null },
    };
  } catch {
    return empty;
  }
}
function save() {
  try {
    if (typeof window === "undefined") return;
    
    // Persist active project ID to dedicated key
    if (state.activeProjectId) {
      window.localStorage?.setItem(ACTIVE_PROJECT_KEY, state.activeProjectId);
    } else {
      window.localStorage?.removeItem(ACTIVE_PROJECT_KEY);
    }
    
    const payload = {
      activeProjectId: state.activeProjectId,
      byProject: state.byProject,
      spec: state.spec,
    };
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

// Initialize from storage
state = load();

// Core store API
function getState() {
  return state;
}
function setState(partial) {
  state = { ...state, ...partial };
  save();
  listeners.forEach((l) => l());
}
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Actions
function setActiveProject(id) {
  setState({ activeProjectId: id || null });
}
export function setActiveProjectId(id) {
  setActiveProject(id);
}
function clearActiveProject() {
  setState({ activeProjectId: null });
}
// Add fromBus guard and no-op if nothing changes
function setSummaryFor(projectId, partial, { fromBus = false } = {}) {
  if (!projectId) return;
  const current = state.byProject[projectId] || { ...emptySummary };
  const next = { ...current, ...partial };

  // Skip unnecessary work
  try {
    if (JSON.stringify(current) === JSON.stringify(next)) return;
  } catch {}

  state.byProject = { ...state.byProject, [projectId]: next };
  // Keep legacy spec in sync for pages still using it (targetSPL + layout)
  state.spec = {
    dolbyLayout: next.dolbyLayout,
    targetSPL_LCR_dB: next.targetSPL_LCR_dB,
  };
  save();
  listeners.forEach((l) => l());

  // Cross-tab broadcast (avoid ping-pong)
  if (!fromBus) {
    try {
      ProjectBus.publish({ type: "project/summary-updated", projectId, summary: next });
    } catch {}
  }
}
function mergeSummary(partial) {
  const pid = state.activeProjectId;
  if (!pid) return;
  setSummaryFor(pid, partial);
}
function resetSummary(projectId = null) {
  const pid = projectId || state.activeProjectId;
  if (!pid) return;
  state.byProject = { ...state.byProject, [pid]: { ...emptySummary } };
  // Also sync legacy spec
  state.spec = { dolbyLayout: undefined, targetSPL_LCR_dB: null };
  save();
  listeners.forEach((l) => l());
  try {
    ProjectBus.publish({ type: "project/summary-updated", projectId: pid, summary: { ...emptySummary } });
  } catch {}
}

// Alias to keep legacy 'spec' API working across the app
function setSpec(spec) {
  // accept legacy shape: { dolbyLayout?, targetSPL_LCR_dB? }
  // delegate to mergeSummary so future fields are harmless
  mergeSummary(spec);
}

// Hooks
export function useActiveProjectId() {
  return React.useSyncExternalStore(
    subscribe,
    () => getState().activeProjectId,
    () => null
  );
}
export function useProjectSummary() {
  return React.useSyncExternalStore(
    subscribe,
    () => {
      const s = getState();
      if (!s.activeProjectId) return { ...emptySummary };
      return s.byProject[s.activeProjectId] || { ...emptySummary };
    },
    () => ({ ...emptySummary })
  );
}
export function useProjectSpec() {
  // Legacy selector (kept to avoid breaking existing pages)
  return React.useSyncExternalStore(
    subscribe,
    () => getState().spec,
    () => ({ dolbyLayout: undefined, targetSPL_LCR_dB: null })
  );
}
export function useProjectActions() {
  const actions = React.useMemo(
    () => ({ setActiveProject, setActiveProjectId, clearActiveProject, mergeSummary, resetSummary, setSummaryFor, setSpec }),
    []
  );
  return actions;
}

// Cross-tab subscriber: merge inbound updates for the same active project (avoid loop)
if (typeof window !== "undefined") {
  try {
    ProjectBus.subscribe((e) => {
      if (e?.type === "project/summary-updated") {
        const s = getState();
        if (s.activeProjectId && s.activeProjectId === e.projectId) {
          setSummaryFor(e.projectId, e.summary || {}, { fromBus: true });
        }
      }
    });
  } catch {}
}

// Optional raw accessor
export const ProjectSession = { getState, setActiveProject, setActiveProjectId, clearActiveProject, mergeSummary, resetSummary, setSummaryFor, setSpec };

// TEMP DEBUG: remove after sub persistence proven
import { base44 } from "@/api/base44Client";
export async function fetchProjectById(projectId) {
  if (!projectId) return null;
  try {
    const results = await base44.entities.Project.filter({ id: projectId }, "-updated_date", 1);
    return Array.isArray(results) && results.length > 0 ? results[0] : null;
  } catch (e) {
    console.warn("[fetchProjectById] error:", e);
    return null;
  }
}
// END TEMP DEBUG