import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { debug } from "@/components/utils/consolePolyfill";

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

  // If it's a surround role and the key doesn't already have the suffix, add it.
  if (isSurroundRole(canonicalRole) && !modelKey.endsWith('_s')) {
    const surroundKey = `${modelKey}_s`;
    
    // Check if the surround variant actually exists in the registry.
    // If not, it's safer to return the original key than a non-existent one.
    const meta = getSpeakerModelMeta(surroundKey);
    if (!meta.notFound) {
      debug(`[resolver] Mapped surround role ${canonicalRole} model from "${modelKey}" to "${surroundKey}"`);
      return surroundKey;
    } else {
      debug(`[resolver] WARN: Surround variant "${surroundKey}" not found for role ${canonicalRole}. Falling back to "${modelKey}".`);
    }
  }

  return modelKey;
}