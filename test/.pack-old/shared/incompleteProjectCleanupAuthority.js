/**
 * Canonical authority for the 7-day incomplete-project auto-cleanup rule.
 *
 * Shared between the cleanupIncompleteProjects backend function and any
 * future admin/dry-run tooling so the eligibility logic is defined once.
 *
 * Business rule (strict OR):
 *   age >= 7 full days
 *   AND (
 *     project_name_is_blank_or_placeholder
 *     OR
 *     client_name_is_blank
 *     OR
 *     room_dimensions_edited !== true
 *   )
 *
 * Exclusions:
 *   - commercial_tier = INTERNAL (admin/internal development projects)
 *   - Projects belonging to the central Sound Proof admin account
 *
 * This module is self-contained (no cross-boundary imports) so it can be
 * imported from both backend functions (Deno/ESM) and the Node sandbox.
 */

/** Placeholder project names treated as "incomplete" (case-insensitive, trimmed). */
const PLACEHOLDER_NAMES = new Set([
  "untitled professional project",
  "untitled room",
  "untitled project",
]);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns true if a project name is blank or a known placeholder.
 * @param {string|null|undefined} name
 * @returns {boolean}
 */
export function isProjectNameIncomplete(name) {
  if (name == null) return true;
  const trimmed = String(name).trim().toLowerCase();
  if (trimmed === "") return true;
  if (PLACEHOLDER_NAMES.has(trimmed)) return true;
  return false;
}

/**
 * Returns true if a client name is blank.
 * @param {string|null|undefined} clientName
 * @returns {boolean}
 */
export function isClientNameIncomplete(clientName) {
  if (clientName == null) return true;
  const trimmed = String(clientName).trim();
  return trimmed === "";
}

/**
 * Returns true if the room_dimensions_edited flag is not true.
 * @param {boolean|null|undefined} flag
 * @returns {boolean}
 */
export function isRoomUnedited(flag) {
  return flag !== true;
}

/**
 * Returns the specific cleanup reasons for a project, given its fields.
 * A project may have more than one reason.
 * @param {object} project
 * @returns {string[]} e.g. ["NAME_INCOMPLETE", "CLIENT_INCOMPLETE"]
 */
export function getCleanupReasons(project) {
  const reasons = [];
  if (isProjectNameIncomplete(project?.name)) reasons.push("NAME_INCOMPLETE");
  if (isClientNameIncomplete(project?.client_name)) reasons.push("CLIENT_INCOMPLETE");
  if (isRoomUnedited(project?.room_dimensions_edited)) reasons.push("GENERIC_ROOM_UNCHANGED");
  return reasons;
}

/**
 * Returns true if the project is eligible for cleanup.
 * Does NOT check the INTERNAL/admin exclusion — pass excludeInternal=true
 * for the full check, or handle it in the caller.
 * @param {object} project
 * @param {number} [now] - timestamp override (defaults to Date.now())
 * @returns {boolean}
 */
export function isEligibleForCleanup(project, now = Date.now()) {
  if (!project) return false;
  if (project.commercial_tier === "INTERNAL") return false;

  const createdMs = project.created_date ? new Date(project.created_date).getTime() : NaN;
  if (!Number.isFinite(createdMs)) return false;
  if (now - createdMs < SEVEN_DAYS_MS) return false;

  const reasons = getCleanupReasons(project);
  return reasons.length > 0;
}

/**
 * Returns the age in days (floored) based on created_date.
 * @param {object} project
 * @param {number} [now]
 * @returns {number}
 */
export function getProjectAgeDays(project, now = Date.now()) {
  if (!project?.created_date) return 0;
  const createdMs = new Date(project.created_date).getTime();
  if (!Number.isFinite(createdMs)) return 0;
  return Math.floor((now - createdMs) / (24 * 60 * 60 * 1000));
}