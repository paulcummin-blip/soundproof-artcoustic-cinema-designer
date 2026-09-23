import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { assertCapability, resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import {
  loadOwnedProjectVersion,
  loadCacheRecord,
  findPublication,
  cleanPublicationForResponse,
} from '../../shared/publishedEngineeringAuthority.js';

/**
 * readPublishedEngineering
 * ------------------------
 * Reads the current Published Engineering result for a project version.
 *
 * The fingerprint is resolved in this order:
 *   1. Explicit `engineering_fingerprint` in the request body (if provided).
 *   2. ProjectVersion.published_fingerprint (the current publication pointer).
 *
 * If no fingerprint is available, returns { publication: null, status: 'not_calculated' }.
 * If a fingerprint is available but no matching publication exists in the cache,
 * returns { publication: null, status: 'stale' }.
 *
 * Input:
 *   { project_id, version_id, engineering_fingerprint? }
 *
 * Response:
 *   { publication, status, version: { published_fingerprint, published_at, ... } }
 *
 *   status: 'published' | 'not_calculated' | 'stale'
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
    const explicitFingerprint = body?.engineering_fingerprint
      ? String(body.engineering_fingerprint).trim()
      : null;

    if (!projectId || !versionId) {
      return Response.json({ error: 'INVALID_REQUEST', message: 'project_id and version_id are required.' }, { status: 400 });
    }

    const service = base44.asServiceRole;

    // Load + verify ownership
    let version;
    try {
      ({ version } = await loadOwnedProjectVersion(
        service, projectId, versionId, access,
      ));
    } catch (err) {
      const code = err?.code || 'OWNERSHIP_FAILED';
      const status = code === 'FORBIDDEN' ? 403 : code === 'PROJECT_NOT_FOUND' || code === 'VERSION_NOT_FOUND' ? 404 : 500;
      return Response.json({ error: code }, { status });
    }

    // Resolve the fingerprint: explicit > version pointer
    const fingerprint = explicitFingerprint || version.published_fingerprint || null;

    if (!fingerprint) {
      return Response.json({
        publication: null,
        status: 'not_calculated',
        version: {
          id: version.id,
          published_fingerprint: version.published_fingerprint || null,
          published_at: version.published_at || null,
        },
      });
    }

    // Load the cache record and find the publication
    const cacheRecord = await loadCacheRecord(service, projectId, versionId);
    const publication = findPublication(cacheRecord, fingerprint);

    if (!publication) {
      // Fingerprint is set on the version but no matching publication exists
      // in the cache — the publication is stale or the cache was cleared.
      return Response.json({
        publication: null,
        status: 'stale',
        version: {
          id: version.id,
          published_fingerprint: version.published_fingerprint || null,
          published_at: version.published_at || null,
        },
      });
    }

    return Response.json({
      publication: cleanPublicationForResponse(publication),
      status: 'published',
      version: {
        id: version.id,
        published_fingerprint: version.published_fingerprint || null,
        published_at: version.published_at || null,
        published_engine_version: version.published_engine_version || null,
        published_rp22_version: version.published_rp22_version || null,
        published_algorithm_version: version.published_algorithm_version || null,
        publication_reason: version.publication_reason || null,
      },
    });
  } catch (error) {
    return Response.json({
      error: 'READ_PUBLISHED_ENGINEERING_FAILED',
      message: error?.message || 'Unable to read published engineering result.',
    }, { status: 500 });
  }
}