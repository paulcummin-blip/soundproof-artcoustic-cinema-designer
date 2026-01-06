// components/utils/surroundRoleMap.js
// Pure helpers for layout-based role visibility and hydration
// No React imports - safe for use anywhere

// --- Canonical role mapping + helpers ---
// This map contains a comprehensive list of aliases for common speaker roles.
// Any role not explicitly mapped will return its uppercase version.
const CANONICAL_ROLE_MAP = {
  // LCR
  FL: "FL", L: "FL",
  FC: "FC", C: "FC",
  FR: "FR", R: "FR",

  // Side surrounds
  SL: "SL", LS: "SL",
  SR: "SR", RS: "SR",

  // Rear surrounds
  SBL: "SBL", RL: "SBL", RSL: "SBL", LR: "SBL", LRS: "SBL", BL: "SBL", LB: "SBL", LBS: "SBL", LBR: "SBL",
  SBR: "SBR", RR: "SBR", RSR: "SBR", RRS: "SBR", BR: "SBR", RB: "SBR", RBS: "SBR", RBR: "SBR",

  // Wides
  LW: "LW", FWL: "LW",
  RW: "RW", FWR: "RW",

  // Height / Atmos - Front
  TFL: "TFL", TF: "TFL",
  TFR: "TFR",

  // Height / Atmos - Middle/Side
  TL: "TL", TML: "TL", TSL: "TL",
  TR: "TR", TMR: "TR", TSR: "TR",

  // Height / Atmos - Rear
  TBL: "TBL", TRL: "TBL",
  TBR: "TBR", TRR: "TBR",

  // Up-firing (if used)
  UFL: "UFL",
  UFR: "UFR",
  UBL: "UBL",
  UBR: "UBR",
};

/**
 * Returns the canonical (standardized) role for a given speaker role string.
 * E.g., 'LS' becomes 'SL', 'RL' becomes 'SBL'.
 * If no mapping exists, returns the uppercase version of the input role.
 * @param {string} role - The raw speaker role string.
 * @returns {string} The canonical speaker role.
 */
export function getCanonicalRole(role) {
  return CANONICAL_ROLE_MAP[String(role || "").toUpperCase()] || String(role || "").toUpperCase();
}

/**
 * Get required speaker roles for a given layout and config.
 * This is the SINGLE SOURCE OF TRUTH for bed-layer surround existence.
 *
 * @param {Object} config
 * @param {string} config.dolbyLayout - e.g. "5.1", "7.1", "9.1.4"
 * @param {boolean} config.useWidesInsteadOfRears - for 7.x layouts, LW/RW vs SBL/SBR
 * @returns {string[]} canonical bed-layer roles (uppercase)
 */
export function rolesForLayout({ dolbyLayout = "5.1", useWidesInsteadOfRears = false } = {}) {
  const roles = new Set();

  const parts = String(dolbyLayout).split(".");
  const major = parseInt(parts[0], 10) || 5;

  // LCR always present
  roles.add("FL");
  roles.add("FC");
  roles.add("FR");

  // 5.x+ → side surrounds
  if (major >= 5) {
    roles.add("SL");
    roles.add("SR");
  }

  // 7.x → either rears or wides
  if (major === 7) {
    if (useWidesInsteadOfRears) {
      roles.add("LW");
      roles.add("RW");
    } else {
      roles.add("SBL");
      roles.add("SBR");
    }
  }

  // 9.x+ → sides + rears + wides
  if (major >= 9) {
    roles.add("SL");
    roles.add("SR");
    roles.add("SBL");
    roles.add("SBR");
    roles.add("LW");
    roles.add("RW");
  }

  return Array.from(roles);
}

// TEMP: debug helper
export function debugRolesForLayout(layout, useWides) {
  const roles = rolesForLayout({ dolbyLayout: layout, useWidesInsteadOfRears: !!useWides });
  if (typeof console !== "undefined") {
    console.log("[B44 DEBUG] rolesForLayout", { layout, useWidesInsteadOfRears: !!useWides, roles });
  }
  return roles;
}

/**
 * Check if a role should be visible in current layout
 * @param {string} role - Speaker role
 * @param {Object} config - Layout config (same as rolesForLayout)
 * @returns {boolean}
 */
export function isRoleVisible(role, { dolbyLayout = "5.1", useWidesInsteadOfRears = false } = {}) {
  const req = rolesForLayout({ dolbyLayout, useWidesInsteadOfRears });
  const canon = getCanonicalRole(role);
  return req.includes(canon);
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
  const have = new Set(next.map(s => getCanonicalRole(s?.role)));
  
  for (const r of requiredRoles) {
    const R = getCanonicalRole(r);
    if (!have.has(R)) {
      const sp = makeDefault ? makeDefault(R) : null;
      if (sp) next.push(sp);
    }
  }
  
  return next;
}

// Bed-surround roles we never want auto-placed here
const BED_SURROUND_ROLES = new Set(["SL","SR","SBL","SBR","LW","RW"]);

/**
 * Generate default speaker object for a role *without* imposing geometry
 * For bed surrounds, we now return a stub and let SpeakerPlacement /
 * resetSurroundPositions handle all coordinates and Dolby angles.
 * @param {string} role - Speaker role (uppercase)
 * @param {Object} dims - Room dimensions {width, length, height}
 * @param {Object} mlp - MLP point {x, y, z} for reference
 * @returns {Object|null} Speaker object or null if role unknown
 */
export function defaultSpeakerForRole(role, dims, mlp) {
  const R = String(role || "").toUpperCase();

  // 🔒 IMPORTANT:
  // Do NOT drive geometry for bed surrounds from here.
  // We only create a stub entry if some caller insists on "ensuring" the role exists.
  if (BED_SURROUND_ROLES.has(R)) {
    return {
      id: `${R}-${Math.random().toString(36).slice(2, 7)}`,
      role: R,
      label: R,
      position: {
        x: Number.isFinite(mlp?.x) ? mlp.x : 0,
        y: Number.isFinite(mlp?.y) ? mlp.y : 0,
        z: Number.isFinite(mlp?.z) ? mlp.z : 1.2,
      },
      model: undefined,     // User / SurroundsSelector chooses model
    };
  }

  // For all other roles (e.g. overheads, if ever used here), we currently
  // don't auto-generate anything. Callers can extend this later if needed.
  return null;
}