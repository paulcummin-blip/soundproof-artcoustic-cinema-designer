import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { assertCapability, resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import {
  PUBLICATION_SCHEMA_VERSION,
  loadOwnedProjectVersion,
  loadCacheRecord,
  createCacheRecord,
  findPublication,
  upsertPublication,
  cleanPublicationForResponse,
  cleanCacheRecordForResponse,
} from '../../shared/publishedEngineeringAuthority.js';

/**
 * publishEngineering
 * ------------------
 * Publishes an immutable Engineering result to the database-backed Published
 * Engineering Authority.
 *
 * Idempotent: if a publication already exists for the given engineering_fingerprint,
 * no duplicate is created. The ProjectVersion publication pointer is updated to
 * point at the fingerprint (this is the only mutable part — the pointer, not the
 * publication itself).
 *
 * ATOMICITY (Phase 1A.5):
 *   True database transactions are unavailable on the Base44 platform. To
 *   eliminate orphaned publications (publication exists but no pointer
 *   references it), the write order is POINTER-FIRST:
 *
 *     Step 1: Write the ProjectVersion publication pointer.
 *     Step 2: Write the publication to the cache map.
 *
 *   Failure modes:
 *     - Step 1 fails → nothing was written. Clean state. The next publish
 *       call retries from scratch.
 *     - Step 2 fails → the pointer references a publication that does not
 *       yet exist in the cache map. readPublishedEngineering returns
 *       status='stale' (safe, recoverable). The next publish call with the
 *       same fingerprint will create the publication and the pointer is
 *       already correct.
 *
 *   This is the safe failure mode: a "stale pointer" is always recoverable
 *   on the next publish, whereas an "orphaned publication" is permanently
 *   unreachable. Pointer-first makes the orphan case impossible.
 *
 *   Additionally, a reconciliation step runs before each publish: if the
 *   current version pointer references a publication that does not exist
 *   in the cache (a stale pointer from a previous failed Step 2), the new
 *   publish naturally overwrites it. No explicit cleanup is needed — the
 *   pointer is always replaced.
 *
 * Input:
 *   { project_id, version_id, engineering_summary, engineering_fingerprint,
 *     engine_version, rp22_version, algorithm_version, publication_reason,
 *     provenance? }
 *
 * Response:
 *   { publication, created, version: { published_fingerprint, published_at, ... } }
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sessionUser = await base44.auth.me();
    if (!sessionUser) {
      return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const access = await resolveAccountAccess(base44, sessionUser);
    try {
      assertCapability(access, 'soundProof');
    } catch {
      return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const projectId = String(body?.project_id || '').trim();
    const versionId = String(body?.version_id || '').trim();
    const fingerprint = String(body?.engineering_fingerprint || '').trim();
    const engineeringSummary = body?.engineering_summary;

    if (!projectId || !versionId || !fingerprint) {
      return Response.json({ error: 'INVALID_REQUEST', message: 'project_id, version_id, and engineering_fingerprint are required.' }, { status: 400 });
    }
    if (!engineeringSummary || typeof engineeringSummary !== 'object') {
      return Response.json({ error: 'INVALID_REQUEST', message: 'engineering_summary object is required.' }, { status: 400 });
    }

    const service = base44.asServiceRole;

    // Load + verify ownership
    let project, version, projectAccountId;
    try {
      ({ project, version, projectAccountId } = await loadOwnedProjectVersion(
        service, projectId, versionId, access,
      ));
    } catch (err) {
      const code = err?.code || 'OWNERSHIP_FAILED';
      const status = code === 'FORBIDDEN' ? 403 : code === 'PROJECT_NOT_FOUND' || code === 'VERSION_NOT_FOUND' ? 404 : 500;
      return Response.json({ error: code }, { status });
    }

    // Load or create the cache record
    let cacheRecord = await loadCacheRecord(service, projectId, versionId);
    if (!cacheRecord) {
      cacheRecord = await createCacheRecord(service, projectId, versionId, projectAccountId);
    }

    // Idempotency check — if the fingerprint already exists, no duplicate.
    const existing = findPublication(cacheRecord, fingerprint);
    let publication;
    let created = false;

    if (existing) {
      publication = existing;
      created = false;
    } else {
      // Build the immutable publication entry
      publication = {
        engineering_summary: engineeringSummary,
        engineering_fingerprint: fingerprint,
        published_at: new Date().toISOString(),
        engine_version: String(body?.engine_version ?? 'unknown'),
        rp22_version: String(body?.rp22_version ?? 'unknown'),
        algorithm_version: String(body?.algorithm_version ?? 'unknown'),
        publication_reason: String(body?.publication_reason ?? 'auto-settled'),
        provenance: (body?.provenance && typeof body.provenance === 'object') ? body.provenance : null,
        schema_version: PUBLICATION_SCHEMA_VERSION,
      };
    }

    // ── ATOMICITY: Pointer-first write order ──────────────────────────
    //
    // Step 1: Write the ProjectVersion publication pointer FIRST.
    // If this fails, nothing was written — clean state, safe retry.
    // If it succeeds but Step 2 fails, the pointer references a
    // non-existent publication → readPublishedEngineering returns 'stale'
    // (recoverable on next publish). No orphan is possible.
    const versionPatch = {
      published_fingerprint: fingerprint,
      published_at: publication.published_at,
      published_engine_version: publication.engine_version,
      published_rp22_version: publication.rp22_version,
      published_algorithm_version: publication.algorithm_version,
      publication_reason: publication.publication_reason,
    };
    const updatedVersion = await service.entities.ProjectVersion.update(version.id, versionPatch);

    // Step 2: Write the publication to the cache map (only if new).
    // If this fails, the pointer already references this fingerprint —
    // readPublishedEngineering returns 'stale' until the next publish
    // creates the publication. The next publish with the same fingerprint
    // will find no existing publication (Step 2 never completed) and
    // create it, at which point the pointer is already correct.
    if (created === false && !existing) {
      // We entered the else branch above but `created` was initialized to
      // false — this means we're about to create a new publication.
      created = true;
    }

    if (existing) {
      // Idempotent hit — publication already exists, pointer already updated.
      // No cache write needed.
    } else {
      const { publications } = upsertPublication(cacheRecord, fingerprint, publication);
      const updatePayload = {
        engineering_publications: publications,
      };
      // Stamp account_id if missing (legacy records)
      if (!cacheRecord.account_id && projectAccountId) {
        updatePayload.account_id = projectAccountId;
      }
      cacheRecord = await service.entities.ProjectAnalysisCache.update(
        cacheRecord.id, updatePayload,
      );
    }

    return Response.json({
      publication: cleanPublicationForResponse(publication),
      created,
      version: {
        id: updatedVersion.id,
        published_fingerprint: updatedVersion.published_fingerprint,
        published_at: updatedVersion.published_at,
        published_engine_version: updatedVersion.published_engine_version,
        published_rp22_version: updatedVersion.published_rp22_version,
        published_algorithm_version: updatedVersion.published_algorithm_version,
        publication_reason: updatedVersion.publication_reason,
      },
      cache: cleanCacheRecordForResponse(cacheRecord),
    });
  } catch (error) {
    return Response.json({
      error: 'PUBLISH_ENGINEERING_FAILED',
      message: error?.message || 'Unable to publish engineering result.',
    }, { status: 500 });
  }
}