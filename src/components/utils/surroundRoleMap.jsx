// components/utils/surroundRoleMap.js
// Pure helpers for layout-based role visibility and hydration
// No React imports - safe for use anywhere

/**
 * Get required speaker roles for a given layout and config
 * @param {Object} config
 * @param {string} config.dolbyLayout - e.g., "5.1", "7.1", "9.1.4"
 * @param {boolean} config.useFrontWidesInsteadOfRears - 7.1 toggle
 * @returns {string[]} Array of required role strings (uppercase)
 */
export function rolesForLayout({ dolbyLayout = "5.1", useFrontWidesInsteadOfRears = false }) {
  const roles = new Set(["FL","FC","FR"]); // LCR always present

  // Side surrounds always present for 5.1, 7.1, 9-ch
  roles.add("SL"); 
  roles.add("SR");

  const is7 = /^7\./.test(dolbyLayout);
  const is9 = /^9\./.test(dolbyLayout);

  if (is7) {
    if (useFrontWidesInsteadOfRears) {
      roles.add("LW"); 
      roles.add("RW");
    } else {
      roles.add("SBL"); 
      roles.add("SBR");
    }
  }

  if (is9) {
    roles.add("SBL"); 
    roles.add("SBR");
    roles.add("LW");  
    roles.add("RW");
  }

  return Array.from(roles);
}

/**
 * Check if a role should be visible in current layout
 * @param {string} role - Speaker role
 * @param {Object} config - Layout config (same as rolesForLayout)
 * @returns {boolean}
 */
export function isRoleVisible(role, { dolbyLayout = "5.1", useFrontWidesInsteadOfRears = false }) {
  const req = rolesForLayout({ dolbyLayout, useFrontWidesInsteadOfRears });
  return req.includes(String(role).toUpperCase());
}

/**
 * Ensure speakers array contains all required roles
 * Non-destructive: adds missing, keeps existing
 * @param {Array} prev - Current speakers array
 * @param {string[]} requiredRoles - Roles that must exist
 * @param {Function} makeDefault - (role) => speaker object with position
 * @returns {Array} New array with guaranteed roles
 */
export function ensureSpeakersForRoles(prev = [], requiredRoles = [], makeDefault) {
  const next = Array.isArray(prev) ? [...prev] : [];
  const have = new Set(next.map(s => String(s?.role || '').toUpperCase()));
  
  for (const r of requiredRoles) {
    if (!have.has(r)) {
      const sp = makeDefault ? makeDefault(r) : null;
      if (sp) next.push(sp);
    }
  }
  
  return next;
}

/**
 * Generate default speaker position for a role
 * @param {string} role - Speaker role (uppercase)
 * @param {Object} dims - Room dimensions {width, length, height}
 * @param {Object} mlp - MLP point {x, y, z} for reference
 * @returns {Object|null} Speaker object or null if role unknown
 */
export function defaultSpeakerForRole(role, dims, mlp) {
  const W = Number(dims?.width) || 4.5;
  const L = Number(dims?.length) || 6.0;

  // Simple geometry: sides at edges, around MLP Y; rears/wides forward/back
  const baseY = Number(mlp?.y) || (L * 0.45);
  const earZ = 1.1; // Standard ear height for bed speakers

  const map = {
    SL:  { x: W * 0.10, y: baseY, z: earZ },
    SR:  { x: W * 0.90, y: baseY, z: earZ },
    SBL: { x: W * 0.18, y: baseY + Math.min(1.2, L * 0.18), z: earZ },
    SBR: { x: W * 0.82, y: baseY + Math.min(1.2, L * 0.18), z: earZ },
    LW:  { x: W * 0.25, y: baseY - Math.min(1.2, L * 0.18), z: earZ },
    RW:  { x: W * 0.75, y: baseY - Math.min(1.2, L * 0.18), z: earZ },
  };
  
  const p = map[role];
  if (!p) return null;
  
  return {
    id: `${role}-${Math.random().toString(36).slice(2,7)}`,
    role,
    label: role,
    position: { x: p.x, y: p.y, z: p.z },
    model: undefined, // Will be set by user/selector
  };
}