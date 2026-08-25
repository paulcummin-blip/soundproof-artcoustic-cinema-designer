// stage2PlacementPersistence.js
// DB persistence for Stage 2 placement canonical evaluation cache.
// Separate from Stage 1 placement search, applied-layout canonical authority,
// and eight-target P14 cache.

import { base44 } from "@/api/base44Client";
import {
  STAGE2_CACHE_VERSION,
  STAGE2_RANKING_VERSION,
  STAGE2_CANONICAL_VERSION,
} from "./stage2Constants";

/**
 * Hydrate the Stage 2 placement cache from the database.
 * @param {string} projectId
 * @returns {Promise<object|null>} persisted cache, or null if not found
 */
export async function hydrateStage2PlacementCache(projectId) {
  if (!projectId) return null;
  try {
    const records = await base44.entities.Stage2PlacementCache.filter({ project_id: projectId }, "-updated_date", 1);
    const record = Array.isArray(records) ? records[0] : null;
    if (!record) return null;
    return {
      recordId: record.id,
      stage2_cache_version: record.stage2_cache_version,
      stage2_ranking_version: record.stage2_ranking_version,
      stage2_canonical_version: record.stage2_canonical_version,
      current_fingerprint: record.current_fingerprint,
      status: record.status,
      one_sub_result: record.one_sub_result || null,
      two_sub_result: record.two_sub_result || null,
      four_sub_result: record.four_sub_result || null,
      overall_best: record.overall_best || null,
      canonical_jobs_run: record.canonical_jobs_run || 0,
      total_runtime_ms: record.total_runtime_ms || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Check whether a hydrated cache is valid for the current fingerprint and versions.
 */
export function isStage2CacheValid(hydrated, fingerprint) {
  if (!hydrated || !fingerprint) return false;
  if (hydrated.stage2_cache_version !== STAGE2_CACHE_VERSION) return false;
  if (hydrated.stage2_ranking_version !== STAGE2_RANKING_VERSION) return false;
  if (hydrated.stage2_canonical_version !== STAGE2_CANONICAL_VERSION) return false;
  if (hydrated.current_fingerprint !== fingerprint) return false;
  if (hydrated.status !== "complete") return false;
  return true;
}

/**
 * Persist Stage 2 results to the database.
 */
export async function syncStage2PlacementCache(projectId, fingerprint, results, existingRecordId) {
  if (!projectId || !fingerprint || !results) return null;
  try {
    const payload = {
      project_id: projectId,
      stage2_cache_version: STAGE2_CACHE_VERSION,
      stage2_ranking_version: STAGE2_RANKING_VERSION,
      stage2_canonical_version: STAGE2_CANONICAL_VERSION,
      current_fingerprint: fingerprint,
      status: "complete",
      one_sub_result: results.one_sub_result || null,
      two_sub_result: results.two_sub_result || null,
      four_sub_result: results.four_sub_result || null,
      overall_best: results.overall_best || null,
      canonical_jobs_run: results.canonical_jobs_run || 0,
      total_runtime_ms: results.total_runtime_ms || 0,
    };
    if (existingRecordId) {
      await base44.entities.Stage2PlacementCache.update(existingRecordId, payload);
    } else {
      const records = await base44.entities.Stage2PlacementCache.filter({ project_id: projectId }, "-updated_date", 1);
      const record = Array.isArray(records) ? records[0] : null;
      if (record?.id) {
        await base44.entities.Stage2PlacementCache.update(record.id, payload);
      } else {
        await base44.entities.Stage2PlacementCache.create(payload);
      }
    }
    return payload;
  } catch {
    return null;
  }
}