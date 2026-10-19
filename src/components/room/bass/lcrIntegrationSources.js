// lcrIntegrationSources.js
// The three front screen channels as sources for the combined LCR + subwoofer
// model. Pure: it reads the placed speakers and returns positions and models
// only — it holds no crossover or acoustic policy.

import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

/** The screen channels that take part in the combined bass-managed response. */
export const LCR_ROLES = Object.freeze(["FL", "FC", "FR"]);

const ROLE_SET = new Set(LCR_ROLES);
const FALLBACK_Z_M = 1.2;

/**
 * @param {Array} placedSpeakers appState.placedSpeakers
 * @returns {Array<{id:string, role:string, modelKey:string, x:number, y:number, z:number}>}
 */
export function buildLcrIntegrationSources(placedSpeakers) {
  return (Array.isArray(placedSpeakers) ? placedSpeakers : [])
    .map((speaker) => {
      const role = getCanonicalRole(speaker?.role);
      if (!ROLE_SET.has(role)) return null;
      const x = Number(speaker?.position?.x);
      const y = Number(speaker?.position?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const z = Number(speaker?.position?.z);
      return {
        id: `lcr-${role}`,
        role,
        modelKey: speaker?.model ?? null,
        x,
        y,
        z: Number.isFinite(z) ? z : FALLBACK_Z_M,
      };
    })
    .filter(Boolean);
}

/** The speaker models present across the LCR trio, for the shared crossover rule. */
export function lcrCrossoverModelKeys(placedSpeakers) {
  return buildLcrIntegrationSources(placedSpeakers)
    .map((source) => source.modelKey)
    .filter(Boolean);
}