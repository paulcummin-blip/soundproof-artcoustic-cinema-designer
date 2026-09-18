// src/lib/versionAuthority.js
//
// Frontend version resolution utilities for the Project Versioning system.
// Mirrors the shared module in base44/shared/versionAuthority.js for the
// constants that must stay in sync between frontend and backend.
//
// Architecture:
//   Project = shared room and administrative metadata.
//   ProjectVersion = complete independent design state.
//   Project.active_version_id is the single source of truth.
//   design_state contains every field required to completely reconstruct a
//   design version. No per-version design field should remain on the Project
//   entity. Future per-version fields automatically belong inside design_state.

// ─── Shared project fields (stay on Project entity) ──────────────────────
// These are NOT moved into design_state. They represent the physical room
// and administrative metadata that is shared across all versions.
const SHARED_PROJECT_FIELDS = new Set([
  // Administrative
  "name",
  "client_name",
  "project_status",
  "notes",
  // Physical room
  "roomDims",
  "room_length",
  "room_width",
  "room_height",
  "room_orientation",
  "screen_wall",
  "room_dimensions_edited",
  // Commercial / lifecycle
  "account_id",
  "commercial_tier",
  "lifecycle_status",
  "last_age_reviewed_at",
  "professional_activated_date",
  "activation_ledger_entry_id",
  "commercial_source",
  "promotion_id",
  "metrics_last_opened",
  "metrics_last_modified",
  "metrics_session_count",
  "metrics_total_minutes_used",
  "metrics_reports_generated",
  "metrics_bass_simulations_run",
  "metrics_exports",
  // Versioning
  "active_version_id",
  // Built-in (never serialised by the app, but present on loaded records)
  "id",
  "created_date",
  "updated_date",
  "created_by_id",
]);

export const MAX_VERSION_SLOTS = 5;
export const VERSION_NAME_MAX_LENGTH = 50;
export const DEFAULT_V1_NAME = "Original Design";

/**
 * Split a serialized project object into shared fields and design_state.
 */
export function splitSerializedProject(serialized) {
  if (!serialized || typeof serialized !== "object") {
    return { shared: {}, designState: {} };
  }

  const shared = {};
  const designState = {};

  for (const [key, value] of Object.entries(serialized)) {
    if (SHARED_PROJECT_FIELDS.has(key)) {
      shared[key] = value;
    } else {
      designState[key] = value;
    }
  }

  return { shared, designState };
}

/**
 * Merge a Project entity and a ProjectVersion's design_state into a single
 * flat object suitable for hydrateProjectIntoAppState().
 */
export function mergeProjectAndVersion(project, version) {
  if (!project) return null;

  const designState = (version && version.design_state) || {};

  return {
    ...designState,
    // Shared fields from the Project override any stale copies in design_state
    name: project.name,
    client_name: project.client_name,
    project_status: project.project_status,
    notes: project.notes,
    roomDims: project.roomDims,
    room_length: project.room_length,
    room_width: project.room_width,
    room_height: project.room_height,
    room_orientation: project.room_orientation,
    screen_wall: project.screen_wall,
    room_dimensions_edited: project.room_dimensions_edited,
    account_id: project.account_id,
    commercial_tier: project.commercial_tier,
    lifecycle_status: project.lifecycle_status,
    // Built-in identity
    id: project.id,
    created_date: project.created_date,
    updated_date: project.updated_date,
    created_by_id: project.created_by_id,
    // Version identity
    active_version_id: project.active_version_id,
    _version_id: version?.id || null,
    _version_number: version?.version_number || null,
    _version_name: version?.version_name || null,
  };
}

/**
 * Build a design_state object from a serialized project (per-version fields only).
 */
export function buildDesignState(serialized) {
  const { designState } = splitSerializedProject(serialized);
  return designState;
}

/**
 * Build a shared-fields update object from a serialized project.
 */
export function buildSharedUpdate(serialized) {
  const { shared } = splitSerializedProject(serialized);
  return shared;
}

/**
 * Find the next available version slot number (1–5), or null if all occupied.
 */
export function findNextEmptySlot(versions) {
  const occupied = new Set(
    (versions || []).map((v) => Number(v.version_number)).filter((n) => Number.isFinite(n))
  );
  for (let i = 1; i <= MAX_VERSION_SLOTS; i++) {
    if (!occupied.has(i)) return i;
  }
  return null;
}

/**
 * Build a fixed-length 5-slot array from version records, with empty placeholders.
 */
export function buildSlotGrid(versions) {
  const bySlot = new Map();
  for (const v of versions || []) {
    const n = Number(v.version_number);
    if (Number.isFinite(n) && n >= 1 && n <= MAX_VERSION_SLOTS) {
      bySlot.set(n, v);
    }
  }
  const grid = [];
  for (let i = 1; i <= MAX_VERSION_SLOTS; i++) {
    grid.push({
      slot: i,
      occupied: bySlot.has(i),
      version: bySlot.get(i) || null,
    });
  }
  return grid;
}

/**
 * Determine which version to activate when the active version is deleted.
 * Falls back to the previous occupied version, then V1 if none exists.
 */
export function resolveActiveAfterDeletion(versions, deletedVersionNumber) {
  if (!versions || versions.length === 0) return null;
  for (let i = deletedVersionNumber - 1; i >= 1; i--) {
    const found = versions.find((v) => Number(v.version_number) === i);
    if (found) return found;
  }
  const sorted = [...versions].sort(
    (a, b) => Number(a.version_number) - Number(b.version_number)
  );
  return sorted[0] || null;
}

/**
 * Truncate a version name with ellipsis for dropdowns and narrow layouts.
 * Report headings use the full name.
 */
// Temporary default name for a newly created design option.
// The user normally renames it immediately via the inline edit field.
export const NEW_VERSION_DEFAULT_NAME = "New Design Option";

export function truncateVersionName(name, maxLen = 30) {
  if (!name) return "";
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen - 1) + "…";
}

/**
 * Sanitise a version name: trim, enforce max length, fallback to default.
 */
export function sanitiseVersionName(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return DEFAULT_V1_NAME;
  return trimmed.substring(0, VERSION_NAME_MAX_LENGTH);
}

/**
 * Build a copy name for a newly duplicated version.
 * Appends " (Copy)" to the source name, truncating the base if needed
 * to stay within VERSION_NAME_MAX_LENGTH.
 * e.g. "Original Design" → "Original Design (Copy)"
 *      "Premium Cinema"   → "Premium Cinema (Copy)"
 */
export function buildCopyVersionName(sourceName) {
  const base = ((sourceName || "") || DEFAULT_V1_NAME).trim() || DEFAULT_V1_NAME;
  const suffix = " (Copy)";
  const maxBase = VERSION_NAME_MAX_LENGTH - suffix.length;
  const truncatedBase = base.length > maxBase ? base.substring(0, maxBase) : base;
  return truncatedBase + suffix;
}

/**
 * Resolve the effective version ID for bass authority and report consumers.
 *
 * Canonical fallback chain (used by EVERY report and authority consumer):
 *   1. Explicit versionId argument (from async project fetch or version selector)
 *   2. appState.activeVersionId (already-hydrated active version — SPA fast path)
 *   3. "free" (no version bound)
 *
 * Every consumer — Room Designer, Technical Report, Compliance Report,
 * Visual Report, Design Rating — MUST call this helper so they all resolve
 * the version identically. Duplicated fallback logic causes version-key
 * mismatches that deadlock the auto-print gate (the report requests the
 * authority with "free" while the Room Designer requests it with the real
 * version ID, so the authority is never found and bassReportPending stays
 * true forever).
 *
 * @param {string|null|undefined} versionId  Explicit version ID (null during SPA navigation before async fetch completes).
 * @param {object|null|undefined} appState   AppState (must expose activeVersionId).
 * @returns {string} The effective version ID, or "free" if none is available.
 */
export function resolveEffectiveVersionId(versionId, appState) {
  return versionId || appState?.activeVersionId || "free";
}