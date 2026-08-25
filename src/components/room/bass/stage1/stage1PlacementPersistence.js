// stage1PlacementPersistence.js
// DB persistence for Stage 1 placement cache.
// Clearly separate from canonical completed bass authority.

import { base44 } from "@/api/base44Client";
import {
  STAGE1_CACHE_VERSION,
  STAGE1_PLACEMENT_ALGORITHM_VERSION,
  STAGE1_FAMILY_POLICY_VERSION,
} from "./stage1Constants";

const BASS_PHYSICS_VERSION = "normalized-physics-v1";

function buildPersistedCache(existing, fingerprint, results, status) {
  return {
    stage1_cache_version: STAGE1_CACHE_VERSION,
    placement_algorithm_version: STAGE1_PLACEMENT_ALGORITHM_VERSION,
    family_policy_version: STAGE1_FAMILY_POLICY_VERSION,
    modal_physics_version: BASS_PHYSICS_VERSION,
    current_fingerprint: fingerprint,
    status: status || (results ? "complete" : "uncalculated"),
    completed_by_fingerprint: results
      ? { [fingerprint]: results }
      : existing?.completed_by_fingerprint || {},
    one_sub_result: results?.one_sub_result || null,
    two_sub_result: results?.two_sub_result || null,
    four_sub_result: results?.four_sub_result || null,
    a_prohibition_validation: results
      ? (results.one_sub_result?.aProhibitionValidation === "PASS" &&
         results.two_sub_result?.aProhibitionValidation === "PASS" &&
         results.four_sub_result?.aProhibitionValidation === "PASS" ? "PASS" : "FAIL")
      : "PASS",
    b_evaluated: false,
  };
}

/**
 * Hydrate the Stage 1 placement cache from the database.
 * @param {string} projectId
 * @returns {Promise<object|null>} persisted cache, or null if not found
 */
export async function hydrateStage1PlacementCache(projectId) {
  if (!projectId) return null;
  try {
    const records = await base44.entities.Stage1PlacementCache.filter({ project_id: projectId }, "-updated_date", 1);
    const record = Array.isArray(records) ? records[0] : null;
    if (!record) return null;
    return {
      recordId: record.id,
      stage1_cache_version: record.stage1_cache_version,
      placement_algorithm_version: record.placement_algorithm_version,
      family_policy_version: record.family_policy_version,
      modal_physics_version: record.modal_physics_version,
      current_fingerprint: record.current_fingerprint,
      status: record.status,
      completed_by_fingerprint: record.completed_by_fingerprint || {},
      one_sub_result: record.one_sub_result || null,
      two_sub_result: record.two_sub_result || null,
      four_sub_result: record.four_sub_result || null,
      a_prohibition_validation: record.a_prohibition_validation || "PASS",
      b_evaluated: record.b_evaluated || false,
    };
  } catch {
    return null;
  }
}

/**
 * Check whether a hydrated cache is valid for the current fingerprint and versions.
 * @param {object} hydrated — from hydrateStage1PlacementCache
 * @param {string} fingerprint — current required fingerprint
 * @returns {boolean}
 */
export function isStage1CacheValid(hydrated, fingerprint) {
  if (!hydrated || !fingerprint) return false;
  if (hydrated.stage1_cache_version !== STAGE1_CACHE_VERSION) return false;
  if (hydrated.placement_algorithm_version !== STAGE1_PLACEMENT_ALGORITHM_VERSION) return false;
  if (hydrated.family_policy_version !== STAGE1_FAMILY_POLICY_VERSION) return false;
  if (hydrated.current_fingerprint !== fingerprint) return false;
  if (hydrated.status !== "complete") return false;

  const requiredResults = [
    hydrated.one_sub_result,
    hydrated.two_sub_result,
    hydrated.four_sub_result,
  ];
  if (requiredResults.some((result) =>
    !result ||
    result.status !== "complete" ||
    !Array.isArray(result.finalists)
  )) return false;
  if (hydrated.a_prohibition_validation !== "PASS") return false;

  return true;
}

/**
 * Persist Stage 1 results to the database.
 * @param {string} projectId
 * @param {string} fingerprint
 * @param {object} results — { one_sub_result, two_sub_result, four_sub_result }
 * @param {string|null} existingRecordId
 * @returns {Promise<object|null>}
 */
export async function syncStage1PlacementCache(projectId, fingerprint, results, existingRecordId) {
  if (!projectId || !fingerprint || !results) return null;
  try {
    const existing = existingRecordId ? { id: existingRecordId } : null;
    const persisted = buildPersistedCache(existing, fingerprint, results, "complete");
    const payload = {
      project_id: projectId,
      ...persisted,
    };
    if (existingRecordId) {
      await base44.entities.Stage1PlacementCache.update(existingRecordId, payload);
    } else {
      // Check if a record already exists (avoid duplicates)
      const records = await base44.entities.Stage1PlacementCache.filter({ project_id: projectId }, "-updated_date", 1);
      const record = Array.isArray(records) ? records[0] : null;
      if (record?.id) {
        await base44.entities.Stage1PlacementCache.update(record.id, payload);
      } else {
        await base44.entities.Stage1PlacementCache.create(payload);
      }
    }
    return persisted;
  } catch {
    return null;
  }
}

/**
 * Mark the Stage 1 cache as updating (worker in progress).
 */
export async function markStage1Updating(projectId, fingerprint, existingRecordId) {
  if (!projectId) return null;
  try {
    const payload = {
      project_id: projectId,
      stage1_cache_version: STAGE1_CACHE_VERSION,
      placement_algorithm_version: STAGE1_PLACEMENT_ALGORITHM_VERSION,
      family_policy_version: STAGE1_FAMILY_POLICY_VERSION,
      modal_physics_version: BASS_PHYSICS_VERSION,
      current_fingerprint: fingerprint,
      status: "updating",
    };
    if (existingRecordId) {
      await base44.entities.Stage1PlacementCache.update(existingRecordId, payload);
    }
  } catch {
    // non-fatal
  }
  return null;
}