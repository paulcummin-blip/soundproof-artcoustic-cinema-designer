import { PUBLICATION_CONTRACT_VERSION, buildAtomicParameterIndex, auditPublicationContract } from '../../shared/engineeringPublicationContract.js';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { assertCapability, resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import {
  PUBLICATION_SCHEMA_VERSION,
  loadOwnedProjectVersion,
  loadCacheRecord,
  createCacheRecord,
  findPublication,
  upsertPublication,
  retainPublications,
  PUBLICATION_RETENTION_RECENT,
  cleanPublicationForResponse,
  cleanCacheRecordForResponse,
  completeMissingBassResults,
} from '../../shared/publishedEngineeringAuthority.js';
import {
  auditEngineeringPublication,
  isPublishableEngineeringSummary,
} from '../../shared/publicationGateAuthority.js';

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
    // Optional presentation payload (analysisResult, priceData, seats,
    // speakers, showAsdr). Stored alongside the immutable engineering summary so
    // cold report/proposal loads can assemble from the durable authority
    // instead of depending on a browser-only handoff. It carries no identity or
    // metric authority — the engineering summary remains the sole metric source.
    const reportSnapshot = (body?.report_snapshot && typeof body.report_snapshot === 'object')
      ? body.report_snapshot
      : null;

    if (!projectId || !versionId || !fingerprint) {
      return Response.json({ error: 'INVALID_REQUEST', message: 'project_id, version_id, and engineering_fingerprint are required.' }, { status: 400 });
    }
    if (!engineeringSummary || typeof engineeringSummary !== 'object') {
      return Response.json({ error: 'INVALID_REQUEST', message: 'engineering_summary object is required.' }, { status: 400 });
    }

    // ── FAIL CLOSED AT THE SOURCE ──────────────────────────────────────────
    // A summary that does not carry the complete RP22 parameter authority is not
    // an engineering publication. Nothing is written — no pointer, no publication
    // — so a partial summary can never become the authority a report reads from.
    const publishability = isPublishableEngineeringSummary(engineeringSummary);
    if (!publishability.usable) {
      return Response.json({
        error: 'INCOMPLETE_ENGINEERING_SUMMARY',
        missing: publishability.missing,
        message: `This assessment is incomplete (${publishability.missing.join(', ')}). Nothing was saved — complete the assessment and try again.`,
      }, { status: 422 });
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

    // Read only until the strict producer contract passes. No defaults/backfill.
    let cacheRecord = await loadCacheRecord(service, projectId, versionId);


    // Idempotency check — if the fingerprint already exists, no duplicate.
    const existing = findPublication(cacheRecord, fingerprint);

    // The immutable publication entry for a new fingerprint.
    const incomingPublication = {
      engineering_summary: engineeringSummary,
      ...(reportSnapshot ? { report_snapshot: reportSnapshot } : {}),
      engineering_fingerprint: fingerprint,
      published_at: new Date().toISOString(),
      engine_version: String(body?.engine_version ?? 'unknown'),
      rp22_version: String(body?.rp22_version ?? 'unknown'),
      algorithm_version: String(body?.algorithm_version ?? 'unknown'),
      publication_reason: String(body?.publication_reason ?? 'auto-settled'),
      provenance: (body?.provenance && typeof body.provenance === 'object') ? body.provenance : null,
      schema_version: PUBLICATION_SCHEMA_VERSION,
      publication_contract_version: body?.publication_contract_version,
    };

    incomingPublication.parameter_index = buildAtomicParameterIndex(incomingPublication);
    const contract = auditPublicationContract(incomingPublication);
    if (reportSnapshot?.report_project?.project_id !== projectId || reportSnapshot?.report_project?.version_id !== versionId || reportSnapshot?.report_project?.version_name !== version.version_name) contract.missing.push('report_project version identity conflicts with selected version');
    if (cacheRecord?.current_fingerprint && incomingPublication.provenance?.bass_fingerprint !== cacheRecord.current_fingerprint) contract.missing.push('bass fingerprint conflicts with current selected-version authority');
    const existingAudit = existing ? auditPublicationContract(existing) : null;
    if (contract.missing.length || (existingAudit && !existingAudit.allowed)) {
      const missing = contract.missing.length ? contract.missing : existingAudit.missing;
      return Response.json({ error:'PUBLICATION_CONTRACT_FAILED', missing, message:missing.join('; ') }, { status:422 });
    }
    if (!cacheRecord) cacheRecord = await createCacheRecord(service, projectId, versionId, projectAccountId);
    let publication = existing || incomingPublication;
    let created = false;

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
    let updatedVersion = await service.entities.ProjectVersion.update(version.id, versionPatch);

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

    // ── BOUNDED RETENTION ──────────────────────────────────────────────
    // This map is rewritten, read back and returned on every publish. Left
    // unbounded it grew by a full publication (~0.5 MB) on every publish, so once
    // a version had published many times the request moved tens of megabytes and
    // the platform refused it — which the designer saw as a failed, unsaved
    // assessment. The map is therefore kept bounded: the publication this pointer
    // references is ALWAYS retained (it is the authority every report reads) plus
    // the most recent few. Anything removed is reported in the response as
    // `retention.pruned` and logged — never dropped silently.
    let retentionPruned: string[] = [];

    if (existing) {
      // Immutable valid new-contract idempotency hit. Never enrich old authority.
      // The map is still bounded here, so a record bloated by earlier publishes
      // heals on the next publish instead of staying too large to write.
      const { publications: retained, pruned } = retainPublications(cacheRecord, fingerprint);
      if (pruned.length) {
        cacheRecord = await service.entities.ProjectAnalysisCache.update(
          cacheRecord.id, { engineering_publications: retained },
        );
        retentionPruned = pruned;
      }
    } else {
      const { publications } = upsertPublication(cacheRecord, fingerprint, publication);
      const { publications: retained, pruned } = retainPublications(
        { engineering_publications: publications }, fingerprint,
      );
      const updatePayload = {
        engineering_publications: retained,
      };
      // Stamp account_id if missing (legacy records)
      if (!cacheRecord.account_id && projectAccountId) {
        updatePayload.account_id = projectAccountId;
      }
      cacheRecord = await service.entities.ProjectAnalysisCache.update(
        cacheRecord.id, updatePayload,
      );
      retentionPruned = pruned;
    }
    if (retentionPruned.length) {
      console.warn(
        `[publishEngineering] pruned ${retentionPruned.length} superseded publication(s) to keep the stored publication map bounded.`,
      );
    }

    // ── EXPLICIT ACKNOWLEDGEMENT ───────────────────────────────────────────
    // The caller confirms the durable write from the audit of the STORED
    // publication (read back by fingerprint) plus the version pointer — never
    // from the fact that this request returned. A report is only allowed to be
    // generated when this acknowledgement says durably_published.
    // Audit fresh database reads, never the submitted object or update response.
    const [storedVersion, storedCache] = await Promise.all([
      service.entities.ProjectVersion.get(versionId),
      service.entities.ProjectAnalysisCache.get(cacheRecord.id),
    ]);
    updatedVersion = storedVersion;
    cacheRecord = storedCache;
    const storedPublication = findPublication(storedCache, fingerprint);
    const audit = auditEngineeringPublication(storedPublication, {
      expectedFingerprint: fingerprint,
      project,
      bassAuthorityAvailable: Object.keys(cacheRecord?.completed_by_fingerprint || {}).length > 0,
    });

    return Response.json({
      publication: cleanPublicationForResponse(publication),
      created,
      version: {
        id: updatedVersion.id,
        version_name: version.version_name || null,
        published_fingerprint: updatedVersion.published_fingerprint,
        published_at: updatedVersion.published_at,
        published_engine_version: updatedVersion.published_engine_version,
        published_rp22_version: updatedVersion.published_rp22_version,
        published_algorithm_version: updatedVersion.published_algorithm_version,
        publication_reason: updatedVersion.publication_reason,
      },
      cache: cleanCacheRecordForResponse(cacheRecord),
      // Superseded publications removed to keep the stored map bounded. Reported
      // rather than silent: a version holds its current publication plus the most
      // recent few.
      retention: {
        recent_kept: PUBLICATION_RETENTION_RECENT,
        pruned: retentionPruned,
        pruned_count: retentionPruned.length,
      },
      acknowledgement: {
        status: audit.status,
        durably_published: audit.durablyPublished === true && storedVersion?.published_fingerprint === fingerprint && !!storedVersion?.published_at,
        complete: audit.complete === true,
        fingerprint_matches: audit.fingerprintMatches === true,
        missing: audit.missing,
        publication_key: fingerprint,
      },
    });
  } catch (error) {
    return Response.json({
      error: 'PUBLISH_ENGINEERING_FAILED',
      message: error?.message || 'Unable to publish engineering result.',
    }, { status: 500 });
  }
}