import React from "react";
import { ProjectBus } from "@/components/state/bus";

// Persistent project session with per-project summary + legacy spec (for backward compatibility)
const STORAGE_KEY = "project-session";
const ACTIVE_PROJECT_KEY = "b44_activeProjectId";

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

// Persistence helpers
function load() {
  try {
    // Load active project ID from dedicated key (new approach)
    const activeId = typeof window !== "undefined" ? window.localStorage?.getItem(ACTIVE_PROJECT_KEY) : null;
    
    const raw = typeof window !== "undefined" ? window.localStorage?.getItem(STORAGE_KEY) : null;
    if (!raw) {
      // If we have an active ID but no session data, initialize with it
      if (activeId) {
        state.activeProjectId = activeId;
      }
      return;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state = {
        // Prefer dedicated key over embedded value
        activeProjectId: activeId || parsed.activeProjectId || null,
        byProject: parsed.byProject ?? {},
        spec: parsed.spec ?? { dolbyLayout: undefined, targetSPL_LCR_dB: null },
      };
    }
  } catch {}
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
load();

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
function setActiveProjectId(id) {
  setActiveProject(id);
}
function clearActiveProject() {
  setState({ activeProjectId: null });
}

// Upsert project summary from entity
function upsertProjectSummary(project) {
  if (!project || !project.id) return;
  
  const summary = {
    id: project.id,
    name: project.name || null,
    client_name: project.client_name || null,
    dolbyLayout: project.dolby_config || undefined,
    roomDims: project.roomDims || null,
    lcrModel: project.selected_speakers_by_role ? 
      (() => { try { const s = JSON.parse(project.selected_speakers_by_role); return s?.L || s?.FL || null; } catch { return null; } })() : null,
    surroundModel: project.selected_speakers_by_role ?
      (() => { try { const s = JSON.parse(project.selected_speakers_by_role); return s?.SL || s?.LS || null; } catch { return null; } })() : null,
    heightModel: project.selected_speakers_by_role ?
      (() => { try { const s = JSON.parse(project.selected_speakers_by_role); return s?.TFL || s?.TL || null; } catch { return null; } })() : null,
    subModel: null,
    subCount: null,
    targetSPL_LCR_dB: project.target_spl || null,
    ampHeadroom_dB: null,
  };

  setState({
    ...state,
    byProject: {
      ...state.byProject,
      [project.id]: summary,
    },
  });
}

function setProjectSummaryFromEntity(entity) {
  upsertProjectSummary(entity);
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
    () => ({ setActiveProject, setActiveProjectId, clearActiveProject, mergeSummary, resetSummary, setSummaryFor, setSpec, setProjectSummaryFromEntity }),
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

// Export standalone for direct imports
export { setProjectSummaryFromEntity };

// Optional raw accessor
export const ProjectSession = { getState, setActiveProject, setActiveProjectId, clearActiveProject, mergeSummary, resetSummary, setSummaryFor, setSpec, setProjectSummaryFromEntity };