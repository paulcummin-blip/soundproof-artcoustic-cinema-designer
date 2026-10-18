/**
 * publishedEngineeringAuthority.js
 * --------------------------------
 * Shared backend logic for the Published Engineering Authority.
 *
 * Used by:
 *   - base44/functions/publishEngineering/entry.ts
 *   - base44/functions/readPublishedEngineering/entry.ts
 *
 * This module owns the ONE WRITE of the authority — creating a version's
 * ProjectAnalysisCache record with its account stamped from the parent project.
 *
 * Everything else it always owned — loading owned projects and versions, reading the
 * cache record, and the pure publication-map operations (upsert, find, retention,
 * reconciliation, response cleaning and add-only bass completion) — now lives in
 * publishedEngineeringRead.js, so that a reader which must never be able to write can
 * hold the same publication authority without carrying this create into its reachable
 * graph. Every one of those names is re-exported here, so no importer changes.
 *
 * It does NOT own:
 *   - Authentication (handled by the calling function)
 *   - Account access resolution (handled by the calling function)
 *   - Browser handoff (frontend concern)
 */

export * from './publishedEngineeringRead.js';

/**
 * Create a new cache record with the account_id stamped from the parent project.
 */
export async function createCacheRecord(service, projectId, versionId, projectAccountId) {
  return service.entities.ProjectAnalysisCache.create({
    project_id: projectId,
    version_id: versionId,
    account_id: projectAccountId || null,
    completed_by_fingerprint: {},
    engineering_publications: {},
  });
}