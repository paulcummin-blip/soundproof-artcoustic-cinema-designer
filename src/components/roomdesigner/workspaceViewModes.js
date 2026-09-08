// workspaceViewModes.js — single source of truth for the Room Designer
// workspace view modes. Pure JS (no React) so it can be unit-tested under
// bare Node and consumed by both ViewModeToggle and the persistent header.
//
// This is UI-preference state only. It must NEVER be persisted into project
// design data, autosave, RP22 analysis, fingerprints, or calculations.

export const WORKSPACE_VIEW_MODES = [
  { key: "split", label: "Split View" },
  { key: "plan", label: "Plan View" },
  { key: "technical", label: "Technical" },
];

export const DEFAULT_WORKSPACE_VIEW = "split";

const VALID_KEYS = new Set(WORKSPACE_VIEW_MODES.map((m) => m.key));

/**
 * Returns a valid workspace view key, falling back to the default when the
 * supplied value is missing or unknown. Guarantees a re-render never leaves
 * the selector stuck on an invalid value.
 */
export function normalizeWorkspaceView(viewMode) {
  return typeof viewMode === "string" && VALID_KEYS.has(viewMode)
    ? viewMode
    : DEFAULT_WORKSPACE_VIEW;
}

export function isWorkspaceViewMode(value) {
  return typeof value === "string" && VALID_KEYS.has(value);
}