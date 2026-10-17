import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildReportDesignIntentAttempt } from '../../shared/reportDesignIntent/buildReportDesignIntentAttempt.js';
import { readOnlyEntities } from '../../shared/reportDesignIntent/readOnlyEntities.js';

/**
 * PREVIEW the Project Report's Design Intent — ADMIN ONLY, STRUCTURALLY READ-ONLY.
 *
 * It generates, and it does nothing else.
 *
 * It imports the pure generation core and the write-refusing client wrapper, and
 * nothing else: no save wrapper, no persistence helper, no delete or update helper of
 * any kind. It cannot write because it has nothing that writes — the only module it
 * could reach for one (generateAndSaveReportDesignIntent, the production save wrapper)
 * is deliberately not on its import list, and the clients it does hand the core refuse
 * every write method before it reaches the platform.
 *
 * THE GENERATION IS THE PRODUCTION GENERATION. The attempt is built by
 * buildReportDesignIntentAttempt, the same core the production save wrapper calls,
 * against the same saved project, the same saved design version, the same frozen
 * Project Report evidence, the same evidence pack, the same interpretation input, the
 * same scoping to the one Design Intent section, the same writing contract, the same
 * prompt version — and a prompt fingerprint of the prompt built NOW, by construction
 * the current one — and the same model the flag resolves to.
 *
 * Because nothing is saved, the report, the version, the snapshot, the approval state,
 * the readiness state, the published engineering and the prompt fingerprint of any
 * saved content are all left exactly as they were. A refusal here is a result to read,
 * never a record to keep. No approval prompt is needed to run it.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'The Design Intent preview is admin-only.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const projectId = body?.project_id || null;
    const versionId = body?.version_id || null;

    const guarded = readOnlyEntities(base44.entities);
    const guardedService = readOnlyEntities(base44.asServiceRole.entities);

    const outcome = await buildReportDesignIntentAttempt({
      entities: guarded.entities,
      authorityEntities: guardedService.entities,
      invokeLLM: (request) => base44.integrations.Core.InvokeLLM(request),
      projectId,
      versionId,
      user,
      accountIdFallback: null,
      // The page is reachable by a master admin alone, so the writer's own switch is
      // resolved exactly as production resolves it for this login.
      isMasterAdmin: true,
      now: new Date().toISOString(),
    });

    // The boundary, reported on every response: the reads that were made, and the
    // write attempts, which are always none because no write was ever made.
    const boundary = {
      write_attempts: [...guarded.attempts, ...guardedService.attempts],
      write_attempt_count: guarded.attempts.length + guardedService.attempts.length,
      reads: guarded.reads.length + guardedService.reads.length,
      persisted: false,
    };

    if (!outcome.ok) {
      return Response.json({
        ok: false,
        dry_run: true,
        code: outcome.block.code,
        error: outcome.block.error,
        reason: outcome.block.reason,
        boundary,
      }, { status: outcome.block.status });
    }

    const { project, version, snapshot, generation } = outcome;

    return Response.json({
      ok: generation.status === 'accepted',
      dry_run: true,
      // Stated explicitly so a reader never has to infer it: nothing was saved.
      persisted: false,
      notice: 'READ-ONLY PREVIEW. The production Design Intent writer was run once against the current project, '
        + 'version and authoritative evidence. No report, snapshot, approval, readiness or published value was '
        + 'created, modified or deleted, and no saved Design Intent was touched.',

      project: {
        id: project.id,
        name: project.name || null,
        client_name: project.client_name || null,
        project_reference: project.project_reference || null,
      },
      version: {
        id: version.id,
        version_name: version.version_name || null,
        version_number: version.version_number ?? null,
      },
      report: {
        snapshot_id: snapshot.id,
        generated_at: snapshot.generated_at || null,
        status: snapshot.status || null,
        source_fingerprints: snapshot.source_fingerprints || null,
      },

      // THE PURE GENERATION RESULT, exactly as the core built it: the generated text
      // and its word count, the prompt version and the fingerprint of the prompt the
      // writer was actually given, the contract identities, the validation result and
      // the evidence used and excluded.
      generation,
      boundary,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      dry_run: true,
      persisted: false,
      error: error?.message || 'The Design Intent preview failed; nothing was saved.',
    }, { status: 500 });
  }
}