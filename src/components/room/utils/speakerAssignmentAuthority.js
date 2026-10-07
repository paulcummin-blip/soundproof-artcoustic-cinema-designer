// speakerAssignmentAuthority.js
// ---------------------------------------------------------------------------
// One authority for whether a role is installed, and who may install it.
//
// Format selection establishes the required speaker ROLES and their LOCATIONS.
// Model selection decides the actual EQUIPMENT. The two are never mixed:
//
//   - assignModelsForRoles()   user selected a model  → the roles present are
//                              given that model and appear immediately
//   - clearModelsForRoles()    user cleared a model   → those speakers disappear
//   - refreshAssignedModels()  automatic appliers (format change, hydration,
//                              placement) refresh roles that are ALREADY
//                              assigned and never assign an unassigned role
//
// A role is therefore assigned only when its own speaker object carries a real
// model, and only a user action can create that assignment. Drawing follows the
// same rule: isRenderableSpeaker() hides any role with no model, in Plan View
// and in the elevations.
// ---------------------------------------------------------------------------

/** A model is assigned when it is a real product key, never "off"/"none"/empty. */
export const isAssignedModel = (model) => {
  const value = String(model ?? "").trim().toLowerCase();
  return !!value && value !== "off" && value !== "none";
};

export const canonRole = (role) => String(role || "").trim().toUpperCase();

/** Overhead roles, grouped by the zone the overhead control addresses. */
const OVERHEAD_BAND_BY_ROLE = {
  TFL: "front", TFR: "front", TFC: "front",
  TML: "mid", TMR: "mid", TL: "mid", TR: "mid",
  TRL: "rear", TRR: "rear", TRC: "rear", TBL: "rear", TBR: "rear", TBC: "rear",
};

export const SURROUND_BED_ROLES = ["SL", "SR", "SBL", "SBR", "LW", "RW"];
export const LCR_ROLES = ["FL", "FC", "FR"];

export const isOverheadRole = (role) => canonRole(role).startsWith("T");

/**
 * The model an overhead role would use given the overhead control's settings.
 * Returns null when no model is in play, in which case nothing is assigned.
 */
export function resolveOverheadModelForRole(role, {
  globalModel = null,
  frontOverride = null,
  midOverride = null,
  rearOverride = null,
  useFrontGlobal = true,
  useMidGlobal = true,
  useRearGlobal = true,
} = {}) {
  const canon = canonRole(role);
  if (!canon.startsWith("T")) return null;

  const global = isAssignedModel(globalModel) ? globalModel : null;
  const band = OVERHEAD_BAND_BY_ROLE[canon];
  if (!band) return global;

  if (band === "front") {
    return useFrontGlobal ? global : (isAssignedModel(frontOverride) ? frontOverride : global);
  }
  if (band === "mid") {
    return useMidGlobal ? global : (isAssignedModel(midOverride) ? midOverride : global);
  }
  return useRearGlobal ? global : (isAssignedModel(rearOverride) ? rearOverride : global);
}

const toRoleSet = (roles) => (roles instanceof Set
  ? roles
  : new Set((Array.isArray(roles) ? roles : []).map(canonRole)));

/**
 * USER ACTION — assign the resolved model to the given roles where they exist.
 * Roles that are not in the design are not created here: the format does that.
 */
export function assignModelsForRoles(speakers, roles, resolveModel) {
  const list = Array.isArray(speakers) ? speakers : [];
  const wanted = toRoleSet(roles);
  if (!wanted.size) return list;

  let changed = false;
  const next = list.map((speaker) => {
    if (!speaker) return speaker;
    const canon = canonRole(speaker.role);
    if (!wanted.has(canon)) return speaker;

    const resolved = resolveModel ? resolveModel(canon, speaker) : null;
    const target = isAssignedModel(resolved) ? resolved : undefined;
    if (speaker.model === target || (!speaker.model && target === undefined)) return speaker;

    changed = true;
    const updated = { ...speaker };
    if (target === undefined) delete updated.model;
    else updated.model = target;
    return updated;
  });

  return changed ? next : list;
}

/** USER ACTION — clear the model from the given roles; their speakers disappear. */
export function clearModelsForRoles(speakers, roles) {
  return assignModelsForRoles(speakers, roles, () => null);
}

/**
 * AUTOMATIC APPLIER — refresh roles that are already assigned.
 * An unassigned role is left exactly as it is, so a format change, a reload or a
 * placement pass can never install equipment the user has not selected.
 */
export function refreshAssignedModels(speakers, isTargetRole, resolveModel) {
  const list = Array.isArray(speakers) ? speakers : [];
  let changed = false;

  const next = list.map((speaker) => {
    if (!speaker || !isAssignedModel(speaker.model)) return speaker;
    if (typeof isTargetRole === "function" && !isTargetRole(speaker)) return speaker;

    const resolved = resolveModel ? resolveModel(speaker) : null;
    if (!isAssignedModel(resolved) || resolved === speaker.model) return speaker;

    changed = true;
    return { ...speaker, model: resolved };
  });

  return changed ? next : list;
}