/**
 * publishedEngineeringAuthority.js
 * --------------------------------
 * Shared backend logic for the Published Engineering Authority.
 *
 * Used by:
 *   - base44/functions/publishEngineering/entry.ts
 *   - base44/functions/readPublishedEngineering/entry.ts
 *
 * This module owns:
 *   - Project + ProjectVersion loading and ownership verification
 *   - ProjectAnalysisCache record loading (with account_id stamping)
 *   - Pure publication map operations (upsert, find)
 *   - Response cleaning
 *
 * It does NOT own:
 *   - Authentication (handled by the calling function)
 *   - Account access resolution (handled by the calling function)
 *   - Browser handoff (frontend concern)
 */

export const PUBLICATION_SCHEMA_VERSION = 2;

/**
 * Load a Project and verify the caller's account owns it.
 * Returns { project, projectAccountId } or throws.
 */
export async function loadOwnedProject(service, projectId, access) {
  const projects = await service.entities.Project.filter({ id: projectId });
  const project = Array.isArray(projects) ? projects[0] : null;
  if (!project) {
    const error = new Error('PROJECT_NOT_FOUND');
    error.code = 'PROJECT_NOT_FOUND';
    throw error;
  }

  const projectAccountId = String(project.account_id || '').trim();
  const userAccountId = String(access?.user?.account_id || '').trim();
  if (!access.isMasterAdmin && (!projectAccountId || projectAccountId !== userAccountId)) {
    const error = new Error('FORBIDDEN');
    error.code = 'FORBIDDEN';
    throw error;
  }

  return { project, projectAccountId };
}

/**
 * Load a ProjectVersion, verify it belongs to the same project, and verify
 * the caller's account owns the parent project.
 * Returns { project, version, projectAccountId } or throws.
 */
export async function loadOwnedProjectVersion(service, projectId, versionId, access) {
  const { project, projectAccountId } = await loadOwnedProject(service, projectId, access);

  const versions = await service.entities.ProjectVersion.filter({
    id: versionId,
    project_id: projectId,
  });
  const version = Array.isArray(versions) ? versions[0] : null;
  if (!version) {
    const error = new Error('VERSION_NOT_FOUND');
    error.code = 'VERSION_NOT_FOUND';
    throw error;
  }

  return { project, version, projectAccountId };
}

/**
 * Load the ProjectAnalysisCache record for a project+version.
 * Returns the record or null if not found.
 */
export async function loadCacheRecord(service, projectId, versionId) {
  const rows = await service.entities.ProjectAnalysisCache.filter(
    { project_id: projectId, version_id: versionId },
    '-updated_date',
    1,
  );
  return Array.isArray(rows) ? rows[0] : null;
}

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

/**
 * Pure function: find a publication by fingerprint in the engineering_publications map.
 * Returns the publication object or null.
 */
export function findPublication(cacheRecord, fingerprint) {
  if (!fingerprint) return null;
  const pubs = cacheRecord?.engineering_publications;
  if (!pubs || typeof pubs !== 'object') return null;
  const entry = pubs[fingerprint];
  return entry && typeof entry === 'object' ? entry : null;
}

/**
 * Pure function: add a new publication to the engineering_publications map.
 * Idempotent — if the fingerprint already exists, returns the existing entry
 * unchanged (no duplicate, no modification).
 *
 * Returns { publications, created, existing }.
 */
export function upsertPublication(cacheRecord, fingerprint, publication) {
  const existing = findPublication(cacheRecord, fingerprint);
  if (existing) {
    return {
      publications: cacheRecord?.engineering_publications || {},
      created: false,
      existing,
    };
  }

  const basePubs = cacheRecord?.engineering_publications;
  const publications = (basePubs && typeof basePubs === 'object') ? { ...basePubs } : {};
  publications[fingerprint] = publication;
  return { publications, created: true, existing: null };
}

/**
 * Reconcile orphaned publications — Phase 1A.5 recovery mechanism.
 *
 * An "orphan" is a publication in the engineering_publications map that no
 * ProjectVersion pointer references. With the pointer-first write order in
 * publishEngineering, new orphans are impossible. This function cleans up
 * any pre-existing orphans (from the old publication-first write order) by
 * removing publications that are not referenced by any known version pointer.
 *
 * This is a soft reconciliation: it only removes publications that are
 * definitively orphaned (not referenced by the provided version pointer).
 * It never removes the publication matching the current pointer.
 *
 * @param {Object} cacheRecord — the ProjectAnalysisCache record
 * @param {string|null} currentPointerFingerprint — the version's published_fingerprint
 * @returns {{ publications: Object, removed: string[] }} — cleaned map + removed keys
 */
export function reconcileOrphanedPublications(cacheRecord, currentPointerFingerprint) {
  const pubs = cacheRecord?.engineering_publications;
  if (!pubs || typeof pubs !== 'object') {
    return { publications: {}, removed: [] };
  }

  const removed = [];
  const cleaned = {};

  for (const [key, entry] of Object.entries(pubs)) {
    if (key === currentPointerFingerprint) {
      // Always keep the publication the current pointer references.
      cleaned[key] = entry;
    } else {
      // This publication is not referenced by the current pointer.
      // It is an orphan — remove it.
      removed.push(key);
    }
  }

  return { publications: cleaned, removed };
}

/**
 * Clean a publication entry for API response.
 * Strips nothing — the full publication is returned for read.
 */
export function cleanPublicationForResponse(publication) {
  if (!publication) return null;
  return {
    publication_contract_version: publication.publication_contract_version ?? null,
    parameter_index: publication.parameter_index ?? null,
    engineering_summary: publication.engineering_summary ?? null,
    // Optional presentation payload (rating envelope, seats, speakers,
    // analysisResult, priceData). Written by the Room Designer alongside the
    // immutable engineering summary so cold report/proposal loads can assemble
    // without a browser handoff. Never carries identity or metric authority.
    report_snapshot: publication.report_snapshot ?? null,
    engineering_fingerprint: publication.engineering_fingerprint ?? null,
    published_at: publication.published_at ?? null,
    engine_version: publication.engine_version ?? null,
    rp22_version: publication.rp22_version ?? null,
    algorithm_version: publication.algorithm_version ?? null,
    publication_reason: publication.publication_reason ?? null,
    provenance: publication.provenance ?? null,
  };
}

/** The bass room results every report reads: P14 and P18 published, P19 RSP-scoped. */
const BASS_ROOM_RESULT_PARAMETERS = [14, 18, 19];

/** Whether a room result entry actually states a value rather than a blank. */
function bassRoomResultStatesAValue(entry) {
  if (!entry || typeof entry !== 'object') return false;
  // A blank result carries value: null, and null is NOT a value of zero.
  const stated = (entry.value === null || entry.value === undefined || entry.value === '')
    ? null
    : Number(entry.value);
  if (Number.isFinite(stated)) return true;
  const formatted = typeof entry.formatted === 'string' ? entry.formatted.trim() : '';
  return formatted.length > 0 && formatted !== '—' && formatted !== 'N/A';
}

/**
 * ADD-ONLY bass completion for an existing publication.
 *
 * A summary published before P19 was a published room result leaves that result
 * blank, so a restored report rendered an empty P19 box. This returns a copy of
 * the stored publication with those blanks filled from the incoming summary, or
 * null when there is nothing to add.
 *
 * It can only ever FILL a blank. Identity, fingerprint, timestamps, provenance
 * and every value the stored publication already states are returned untouched —
 * a stated value is never replaced with a different one.
 */
export function completeMissingBassResults(existingPublication, incomingSummary) {
  const existingSummary = existingPublication?.engineering_summary;
  if (!existingSummary || !incomingSummary || typeof incomingSummary !== 'object') return null;

  const incomingResults = incomingSummary.roomResultsByParameter;
  if (!incomingResults || typeof incomingResults !== 'object') return null;

  const existingResults = existingSummary.roomResultsByParameter;
  const existingMap = (existingResults && typeof existingResults === 'object') ? existingResults : {};
  const completed = { ...existingMap };
  let added = false;

  for (const parameterNumber of BASS_ROOM_RESULT_PARAMETERS) {
    const incomingEntry = incomingResults[parameterNumber] ?? incomingResults[String(parameterNumber)];
    if (!bassRoomResultStatesAValue(incomingEntry)) continue;
    const existingEntry = existingMap[parameterNumber] ?? existingMap[String(parameterNumber)];
    if (bassRoomResultStatesAValue(existingEntry)) continue;
    completed[parameterNumber] = incomingEntry;
    added = true;
  }

  if (!added) return null;

  return {
    ...existingPublication,
    engineering_summary: { ...existingSummary, roomResultsByParameter: completed },
  };
}

/**
 * Clean the cache record for API response (includes engineering_publications).
 */
export function cleanCacheRecordForResponse(record) {
  if (!record) return null;
  return {
    id: record.id,
    project_id: record.project_id,
    version_id: record.version_id || null,
    account_id: record.account_id || null,
    current_fingerprint: record.current_fingerprint || null,
    status: record.status || 'uncalculated',
    engineering_publications:
      record.engineering_publications && typeof record.engineering_publications === 'object'
        ? record.engineering_publications
        : {},
  };
}