// Capability-check helpers. All app code should call these instead of
// comparing user.role / user.app_role directly, so access rules stay
// centralised in permissionManifest.js.

import { PERMISSION_MANIFEST } from "./permissionManifest";
import { LEVELS } from "./permissionLevels";
import { DEFAULT_ROLE } from "./roles";

function getUserRole(user) {
  return user?.app_role || DEFAULT_ROLE;
}

function getLevel(user, module) {
  const role = getUserRole(user);
  const roleMap = PERMISSION_MANIFEST[role];
  if (!roleMap) return LEVELS.NONE;
  return roleMap[module] ?? LEVELS.NONE;
}

/**
 * can(user, "moduleKey:read" | "moduleKey:edit" | "moduleKey:admin")
 * e.g. can(user, "projects:edit")
 */
export function can(user, capability) {
  if (!capability || typeof capability !== "string") return false;
  const [module, action] = capability.split(":");
  const requiredLevel = { read: LEVELS.READ, edit: LEVELS.EDIT, admin: LEVELS.ADMIN }[action];
  if (requiredLevel === undefined) return false;
  return getLevel(user, module) >= requiredLevel;
}

export function canView(user, module) {
  return getLevel(user, module) >= LEVELS.READ;
}

export function canEdit(user, module) {
  return getLevel(user, module) >= LEVELS.EDIT;
}

export function canAdmin(user, module) {
  return getLevel(user, module) >= LEVELS.ADMIN;
}

/** Returns the raw level (0-3) a user has for a module — useful for custom UI logic. */
export function getAccessLevel(user, module) {
  return getLevel(user, module);
}