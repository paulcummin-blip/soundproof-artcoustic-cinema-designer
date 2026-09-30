// projectHydrationStore.js
// --------------------------------
// CANONICAL project hydration state for the whole app.
//
// Every project-dependent surface (Room Designer, reports, Project Images,
// pricing, engineering/bass/SPL pages, the sidebar active-project indicator)
// reads its state from here. No page invents its own active-project or
// loading logic.
//
// States:
//   "none"    → no project selected
//   "loading" → a project is selected and its saved state is still being hydrated
//   "loaded"  → the saved project state is hydrated and safe to render
//   "failed"  → the project could not be loaded (never falls back to a default)
//
// Two layers are tracked so that identity-only surfaces (sidebar, Project
// Images header) are not blocked by design-state hydration:
//   identity → project record exists (name, client, active version)
//   design   → the saved design state has been hydrated into app state
//
// All writers are scoped by project id, so a late response for a project the
// user has already navigated away from can never mark the new project loaded.

import { useMemo, useSyncExternalStore } from "react";
import { useActiveProjectId } from "@/components/state/project-session";

const EMPTY = Object.freeze({
  projectId: null,
  status: "none",
  identity: null,
  design: "pending",
  error: null,
  retryToken: 0,
});

let state = { ...EMPTY, retryToken: 0 };
const listeners = new Set();

function deriveStatus(snapshot) {
  if (!snapshot.projectId) return "none";
  if (snapshot.error) return "failed";
  if (snapshot.design === "loaded") return "loaded";
  return "loading";
}

function publish(partial) {
  const next = { ...state, ...partial };
  next.status = deriveStatus(next);
  state = next;
  listeners.forEach((listener) => listener());
}

export function getProjectHydration() {
  return state;
}

export function subscribeProjectHydration(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetProjectHydration() {
  if (!state.projectId && state.status === "none") return;
  publish({ projectId: null, identity: null, design: "pending", error: null });
}

// A new project is being opened. An already-hydrated project keeps its state so
// navigation between pages does not re-enter a loading shell.
export function beginProjectHydration(projectId, { name = null } = {}) {
  if (!projectId) {
    resetProjectHydration();
    return;
  }
  if (state.projectId === projectId) {
    if (!name) return;
    publish({
      // Keep a known name so the loading shell can be project-specific.
      identity: { ...(state.identity || {}), name: state.identity?.name || name },
      error: null,
    });
    return;
  }
  publish({
    projectId,
    identity: name ? { name, clientName: null, activeVersionId: null } : null,
    design: "pending",
    error: null,
  });
}

export function setProjectIdentity(projectId, identity) {
  if (state.projectId !== projectId) return;
  publish({ identity: { ...(state.identity || {}), ...identity }, error: null });
}

export function beginDesignHydration(projectId) {
  if (!projectId) return;
  if (state.projectId !== projectId) {
    publish({ projectId, identity: null, design: "loading", error: null });
    return;
  }
  if (state.design === "loaded") return; // never downgrade a hydrated project
  publish({ design: "loading", error: null });
}

export function completeDesignHydration(projectId, identity) {
  if (state.projectId !== projectId) return;
  publish({
    design: "loaded",
    error: null,
    identity: identity ? { ...(state.identity || {}), ...identity } : state.identity,
  });
}

export function failDesignHydration(projectId, error) {
  if (state.projectId !== projectId) return;
  publish({ error: error || "Project could not be loaded" });
}

export function failProjectHydration(projectId, error) {
  if (state.projectId !== projectId) return;
  publish({ error: error || "Project could not be loaded" });
}

export function markIdentityMissing(projectId) {
  if (state.projectId !== projectId) return;
  publish({ error: "Project not found", identity: null });
}

// Retry: clear the failure and re-run every loader from scratch. A full reload
// is used deliberately so that page-owned loaders (Room Designer, reports)
// restart from a clean hydration rather than from partial leftover state.
export function retryProjectHydration() {
  publish({ error: null, design: "pending" });
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

export function useProjectHydration() {
  return useSyncExternalStore(
    subscribeProjectHydration,
    getProjectHydration,
    () => EMPTY
  );
}

export function useProjectHydrationStatus() {
  return useProjectHydration().status;
}

/**
 * The canonical project state for rendering.
 *
 * It compares the hydrated project against the ACTIVE project id at render
 * time, so the instant the user switches projects the answer is "loading" with
 * no identity — never the outgoing project's name, design state or results.
 * This is what makes the switch zero-frame: no surface can show the previous
 * project's content as if it were the current one.
 */
export function useCanonicalProject() {
  const activeProjectId = useActiveProjectId();
  const hydration = useProjectHydration();

  return useMemo(() => {
    if (!activeProjectId) {
      return { projectId: null, status: "none", identity: null, design: "pending", error: null, mismatch: false };
    }
    if (hydration.projectId !== activeProjectId) {
      return { projectId: activeProjectId, status: "loading", identity: null, design: "pending", error: null, mismatch: true };
    }
    return { ...hydration, mismatch: false };
  }, [activeProjectId, hydration]);
}