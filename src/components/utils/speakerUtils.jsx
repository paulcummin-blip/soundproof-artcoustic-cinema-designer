
// This function must be defined before it's used by buildRoleMap, or be hoisted.
// Placing it first is the safest approach.
export function getCanonicalRole(role) {
  const r = String(role || "").toUpperCase().trim();
  const CANON_MAP = {
    L: "FL", R: "FR", C: "FC",
    SL: "SL", LS: "SL",
    SR: "SR", RS: "SR",
    SBL: "SBL", LR: "SBL", LRS: "SBL", RL: "SBL",
    SBR: "SBR", RR: "SBR", RRS: "SBR",
    TFL: "TFL", TFR: "TFR",
    TL: "TL", TML: "TL",
    TR: "TR", TMR: "TR",
    TBL: "TBL", TBR: "TBR",
    LFE: "LFE", SUB: "LFE"
  };
  return CANON_MAP[r] || r;
}

export function buildRoleMap(speakers) {
  if (!Array.isArray(speakers)) return {};
  const roleMap = {};
  for (const speaker of speakers) {
    if (!speaker || !speaker.role) continue;
    
    // Safely call getCanonicalRole directly. No .call or module object.
    const canonRole = getCanonicalRole(speaker.role);

    if (!roleMap[canonRole]) {
      roleMap[canonRole] = [];
    }
    roleMap[canonRole].push(speaker);
  }
  return roleMap;
}

// --- Other existing functions ---

export function isDraggable(speaker) {
  if (!speaker || !speaker.role) return false;
  const canonicalRole = getCanonicalRole(speaker.role);
  // Center speaker is fixed
  if (canonicalRole === 'FC') return false;
  // Subwoofers are fixed
  if (String(speaker.role).toUpperCase().includes("SUB")) return false;
  // Other speakers are draggable
  return true;
}

export function clampSideSurroundDrag(y, roomLength) {
  // Example implementation
  return Math.max(0.1, Math.min(y, roomLength - 0.1));
}

export function clampRearSurroundDrag(y, roomLength) {
  // Example implementation
  return Math.max(0.1, Math.min(y, roomLength - 0.1));
}
