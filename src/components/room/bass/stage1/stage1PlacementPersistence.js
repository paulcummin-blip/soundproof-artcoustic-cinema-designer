// stage1PlacementPersistence.js
// DB persistence for Stage 1 placement cache.
// Clearly separate from canonical completed bass authority.

import { base44 } from "@/api/base44Client";
import { bassDbFilter } from "../bassCacheKey";
import {
  STAGE1_CACHE_VERSION,
  STAGE1_PLACEMENT_ALGORITHM_VERSION,
  STAGE1_FAMILY_POLICY_VERSION,
} from "./stage1Constants";
import { parseStage1FingerprintScope } from "./stage1RecommendationScope";

const BASS_PHYSICS_VERSION = "normalized-physics-v1";

// Per-quantity result slots, in quantity order.
const STAGE1_RESULT_FIELDS = Object.freeze({
  1: "one_sub_result",
  2: "two_sub_result",
  3: "three_sub_result",
  4: "four_sub_result",
});

function buildPersistedCache(existing, fingerprint, results, status) {
  // The A-prohibition aggregate is computed only over the quantities the run
  // actually searched. A recommendation-scope `[1,2,4]` run has no
  // three_sub_result; the old logic AND-ed the (absent) three-sub check and
  // stamped a perfectly valid 1/2/4 run as "FAIL". Aggregate over present
  // results only, so a scoped run records the prohibition status of the
  // quantities it actually evaluated. The validator re-derives per quantity
  // from each result's own aProhibitionValidation, so historical records
  // stamped by the old logic are not misread either.
  const prohibitionResults = results
    ? [results.one_sub_result, results.two_sub_result, results.three_sub_result, results.four_sub_result]
        .filter((r) => r && typeof r.aProhibitionValidation === "string")
    : [];
  const allPass = prohibitionResults.length > 0
    && prohibitionResults.every((r) => r.aProhibitionValidation === "PASS");

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
    three_sub_result: results?.three_sub_result || null,
    four_sub_result: results?.four_sub_result || null,
    a_prohibition_validation: results ? (allPass ? "PASS" : "FAIL") : "PASS",
    b_evaluated: false,
  };
}

/**
 * Hydrate the Stage 1 placement cache from the database.
 * @param {string} projectId
 * @returns {Promise<object|null>} persisted cache, or null if not found
 */
export async function hydrateStage1PlacementCache(projectId, versionId) {
  if (!projectId || !versionId) return null;
  try {
    const records = await base44.entities.Stage1PlacementCache.filter(bassDbFilter(projectId, versionId), "-updated_date", 1);
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
      three_sub_result: record.three_sub_result || null,
      four_sub_result: record.four_sub_result || null,
      a_prohibition_validation: record.a_prohibition_validation || "PASS",
      b_evaluated: record.b_evaluated || false,
    };
  } catch {
    return null;
  }
}

/**
 * Check whether a hydrated cache is valid for the current run.
 *
 * Scope-aware: the `fingerprint` argument is the CURRENT run's fingerprint
 * (which may carry a `|rec:1,2,4` or `|sel:N` suffix). The validator compares
 * the base identity (room, RSP, seating, modal physics, algorithm, family
 * policy) and then checks that the saved cache SEARCHED every quantity the
 * current run requests — so a valid `[1,2,4]` cache hydrates a `[1,2,4]`
 * request without requiring a three-subwoofer result that was never searched.
 *
 * Per-quantity A-prohibition is read from each requested result's own
 * `aProhibitionValidation`, so an irrelevant three-sub prohibition result
 * (or a stale aggregate stamped by an older writer) cannot invalidate a
 * 1/2/4 recommendation cache. A full `[1,2,3,4]` request still validates
 * quantity 3, preserving the legitimate three-sub check where it is required.
 *
 * Partial or incompatible caches (wrong base, or missing a requested
 * quantity's evidence) are rejected, so a stale or narrower cache is never
 * accepted as complete.
 *
 * @param {object} hydrated — from hydrateStage1PlacementCache
 * @param {string} fingerprint — current run's (possibly scoped) fingerprint
 * @returns {boolean}
 */
export function isStage1CacheValid(hydrated, fingerprint) {
  if (!hydrated || !fingerprint) return false;
  if (hydrated.stage1_cache_version !== STAGE1_CACHE_VERSION) return false;
  if (hydrated.placement_algorithm_version !== STAGE1_PLACEMENT_ALGORITHM_VERSION) return false;
  if (hydrated.family_policy_version !== STAGE1_FAMILY_POLICY_VERSION) return false;
  if (hydrated.status !== "complete") return false;

  const requested = parseStage1FingerprintScope(fingerprint);
  const saved = parseStage1FingerprintScope(hydrated.current_fingerprint);
  // Base identity protects room dimensions, RSP, seating, modal physics,
  // algorithm and family policy. A mismatch means the design moved on.
  if (!requested.base || requested.base !== saved.base) return false;
  // The saved cache must have searched every quantity the current run needs.
  const requestedQuantities = requested.quantities;
  if (!Array.isArray(requestedQuantities) || requestedQuantities.length === 0) return false;
  const savedSet = new Set(Array.isArray(saved.quantities) ? saved.quantities : []);
  if (!requestedQuantities.every((q) => savedSet.has(q))) return false;

  for (const q of requestedQuantities) {
    const result = hydrated[STAGE1_RESULT_FIELDS[q]];
    if (!result || result.status !== "complete" || !Array.isArray(result.finalists)) return false;
    // Per-quantity A-prohibition for the requested quantities only. A missing
    // field (legacy result without it) does not fail validation here — the
    // version checks above already guard incompatible old records.
    if (typeof result.aProhibitionValidation === "string" && result.aProhibitionValidation !== "PASS") {
      return false;
    }
  }

  return true;
}

/**
 * Persist Stage 1 results to the database.
 * @param {string} projectId
 * @param {string} fingerprint
 * @param {object} results — { one_sub_result, two_sub_result, three_sub_result, four_sub_result }
 * @param {string|null} existingRecordId
 * @returns {Promise<object|null>}
 */
export async function syncStage1PlacementCache(projectId, versionId, fingerprint, results, existingRecordId) {
  if (!projectId || !versionId || !fingerprint || !results) return null;
  try {
    const existing = existingRecordId ? { id: existingRecordId } : null;
    const persisted = buildPersistedCache(existing, fingerprint, results, "complete");
    const payload = {
      ...bassDbFilter(projectId, versionId),
      ...persisted,
    };
    if (existingRecordId) {
      await base44.entities.Stage1PlacementCache.update(existingRecordId, payload);
    } else {
      // Check if a record already exists (avoid duplicates)
      const records = await base44.entities.Stage1PlacementCache.filter(bassDbFilter(projectId, versionId), "-updated_date", 1);
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
export async function markStage1Updating(projectId, versionId, fingerprint, existingRecordId) {
  if (!projectId || !versionId) return null;
  try {
    const payload = {
      ...bassDbFilter(projectId, versionId),
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