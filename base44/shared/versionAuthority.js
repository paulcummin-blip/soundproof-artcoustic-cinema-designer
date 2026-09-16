// base44/shared/versionAuthority.js
//
// Core version resolution logic for the Project Versioning system.
//
// Architecture:
//   Project = shared room and administrative metadata.
//   ProjectVersion = complete independent design state.
//   Project.active_version_id is the single source of truth.
//   Every calculation, cache, report, optimisation result and AI output
//   must be version-aware (project_id + version_id).
//
// design_state contains every field required to completely reconstruct a
// design version. It is the authoritative serialisation of the Room Designer
// state. No per-version design field should remain on the Project entity.
// Future per-version fields automatically belong inside design_state without
// requiring schema changes.

// ─── Shared project fields (stay on Project entity) ──────────────────────
// These are NOT moved into design_state. They represent the physical room
// and administrative metadata that is shared across all versions.
//
// Administrative (always editable, propagates instantly):
//   name, client_name, project_status, notes
//
// Physical room definition (editable with confirmation, propagates to all):
//   roomDims, room_length, room_width, room_height, room_orientation,
//   screen_wall, room_dimensions_edited
//
// Commercial / lifecycle (managed by admin & commercial systems):
//   account_id, commercial_tier, lifecycle_status, last_age_reviewed_at,
//   professional_activated_date, activation_ledger_entry_id,
//   commercial_source, promotion_id, metrics_*
//
// Versioning pointer:
//   active_version_id
//
// Built-in (never serialised by the app):
//   id, created_date, updated_date, created_by_id

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

/**
 * Split a serialized project object into shared fields and design_state.
 *
 * @param {object} serialized - The full flat output of serializeProject()
 * @returns {{ shared: object, designState: object }}
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
 *
 * The hydration function reads from a flat `p` object — this merger
 * reconstructs that shape from the new two-record architecture.
 *
 * @param {object} project - The Project entity (shared fields)
 * @param {object} version - The ProjectVersion entity (design_state)
 * @returns {object} Merged flat object for hydration
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
 * Build a design_state object from a serialized project, stripping shared fields.
 * This is what gets written to ProjectVersion.design_state on save.
 *
 * @param {object} serialized - The full flat output of serializeProject()
 * @returns {object} design_state (per-version fields only)
 */
export function buildDesignState(serialized) {
  const { designState } = splitSerializedProject(serialized);
  return designState;
}

/**
 * Build a shared-fields update object from a serialized project.
 * This is what gets written to the Project entity on save.
 *
 * @param {object} serialized - The full flat output of serializeProject()
 * @returns {object} shared fields only
 */
export function buildSharedUpdate(serialized) {
  const { shared } = splitSerializedProject(serialized);
  return shared;
}

// ─── Version slot constants ─────────────────────────────────────────────

export const MAX_VERSION_SLOTS = 5;
export const VERSION_NAME_MAX_LENGTH = 50;
export const DEFAULT_V1_NAME = "Current Design";

/**
 * Find the next available version slot number for a project.
 * Returns the first empty slot (1–5), or null if all slots are occupied.
 *
 * @param {Array} versions - Existing ProjectVersion records
 * @returns {number|null} Next available slot number (1–5) or null
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
 *
 * @param {Array} versions - Existing ProjectVersion records
 * @returns {Array} Array of 5 entries: { version, slot, occupied }
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
 *
 * @param {Array} versions - Remaining versions after deletion (active version already removed)
 * @param {number} deletedVersionNumber - The slot number that was deleted
 * @returns {object|null} The version to activate, or null if no versions remain
 */
export function resolveActiveAfterDeletion(versions, deletedVersionNumber) {
  if (!versions || versions.length === 0) return null;

  // Walk backwards from the deleted slot to find the previous occupied version
  for (let i = deletedVersionNumber - 1; i >= 1; i--) {
    const found = versions.find((v) => Number(v.version_number) === i);
    if (found) return found;
  }

  // Fall back to V1 (or the lowest-numbered version if V1 was somehow deleted)
  const sorted = [...versions].sort((a, b) => Number(a.version_number) - Number(b.version_number));
  return sorted[0] || null;
}

/**
 * Truncate a version name to the max length, with ellipsis.
 * Used in dropdowns and narrow layouts. Report headings use the full name.
 *
 * @param {string} name - Version name
 * @param {number} [maxLen=30] - Max display length
 * @returns {string} Truncated name with ellipsis if needed
 */
export function truncateVersionName(name, maxLen = 30) {
  if (!name) return "";
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen - 1) + "…";
}

/**
 * Sanitise a version name: trim, enforce max length, fallback to default.
 *
 * @param {string} name - Raw input
 * @returns {string} Sanitised name (max 50 chars, never empty)
 */
export function sanitiseVersionName(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return DEFAULT_V1_NAME;
  return trimmed.substring(0, VERSION_NAME_MAX_LENGTH);
}