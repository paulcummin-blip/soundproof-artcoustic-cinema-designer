import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { debug } from "@/components/utils/consolePolyfill";
import { canonicalProductId } from "@/components/utils/modelKeyNormaliser";

const SURROUND_ROLES = new Set([
  "SL", "SR", "SBL", "SBR", 
  "LW", "RW", // Front-wide surrounds
  "LS", "RS", "LRS", "RRS", "RL", "RR", // Legacy / Aliases
  "TSL", "TSR", "TML", "TMR", "TBL", "TBR" // Top surrounds also sometimes have surround variants
]);

/**
 * Checks if a role belongs to the surround speaker family.
 * @param {string} role - The canonical speaker role (e.g., "SL", "FR").
 * @returns {boolean}
 */
const isSurroundRole = (role) => SURROUND_ROLES.has(String(role || "").toUpperCase());

/**
 * Resolves the correct speaker model key for a given role, enforcing the "_s" suffix for surrounds.
 * This is the single source of truth for mapping a role to its final model key for rendering.
 *
 * @param {string} baseModel - The base model name (e.g., "evolve-2-1") from user selections or speaker object.
 * @param {string} role - The canonical role of the speaker (e.g., "SL").
 * @returns {string} The resolved model key, with "_s" appended for surrounds if necessary.
 */
export function resolveSpeakerModelMeta(modelName, orientation) {
  return getSpeakerModelMeta(modelName, orientation);
}

export function resolveSubwooferBassCapability(modelName) {
  const meta = resolveSpeakerModelMeta(modelName);
  return meta?.category === "SUBWOOFERS" ? meta.bassCapability ?? null : null;
}

export function resolveSurroundModel(baseModel, role) {
  if (!baseModel || !role) {
    return baseModel || "";
  }

  const modelKey = String(baseModel).trim().toLowerCase();
  const canonicalRole = String(role).toUpperCase();

  // Never return "off" or "none" - these should be filtered earlier
  if (modelKey === "off" || modelKey === "none" || modelKey === "") {
    console.warn(`[resolver] Invalid model "${modelKey}" for role ${canonicalRole}`);
    return modelKey;
  }

  // Product identity never encodes role: a surround is the base product plus a
  // surround role, not a separate "_s" product. The registry keeps its legacy
  // "_s" rows as aliases that are acoustically identical to their base model, so
  // returning the canonical base key leaves acoustic, RP22 and SPL results
  // unchanged while keeping role-encoded ids out of stored and commercial state.
  const canonical = canonicalProductId(modelKey);
  if (isSurroundRole(canonicalRole)) {
    debug(`[resolver] Surround role ${canonicalRole} resolves to canonical product "${canonical}"`);
  }
  return canonical;
}