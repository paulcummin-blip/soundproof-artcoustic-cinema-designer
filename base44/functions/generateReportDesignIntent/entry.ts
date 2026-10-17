import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { generateAndSaveReportDesignIntent } from '../../shared/reportDesignIntent/generateAndSaveReportDesignIntent.js';

/**
 * Generate the Project Report's Design Intent with the Astra writer — OPTIONAL.
 *
 * The Project Report is untouched by this function and does not depend on it: the
 * report generates, renders and prints with its own deterministic Design Intent
 * whatever happens here. This is one failure-isolated operation that, when it
 * succeeds, saves an accepted narrative beside the report it was written for.
 *
 * THE GENERATION IS NOT BUILT HERE. It is built by buildReportDesignIntentAttempt —
 * the pure generation core the admin-only read-only preview also calls — and saved by
 * generateAndSaveReportDesignIntent, the production save wrapper that is the only part
 * of the path allowed to write. This function adds the two things only production
 * does: the access decision, and the response.
 *
 * The provider is the platform AI gateway, called with the server session: there is
 * no API key in this app, in the browser bundle or in any client payload.
 *
 * Nothing is written unless the draft passed validation. A refused, failed or
 * timed-out attempt returns the reason and stores nothing, so an incomplete draft
 * can never reach the page. The saved narrative is written against the exact
 * version and the exact evidence fingerprints it was written from, and it is never
 * regenerated on opening a report.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { project_id, version_id } = body || {};
    if (!project_id || !version_id) {
      return Response.json({ error: 'project_id and version_id are required.' }, { status: 400 });
    }

    const accessContext = await resolveAccountAccess(base44, user);
    if (accessContext?.allowed !== true || accessContext.capabilities?.soundProof !== true) {
      return Response.json({ error: 'Sound Proof access is required to write a report narrative.' }, { status: 403 });
    }

    const outcome = await generateAndSaveReportDesignIntent({
      entities: base44.entities,
      authorityEntities: base44.asServiceRole.entities,
      invokeLLM: (request) => base44.integrations.Core.InvokeLLM(request),
      projectId: project_id || null,
      versionId: version_id || null,
      user,
      accountIdFallback: accessContext.user?.account_id || accessContext.account?.id || null,
      isMasterAdmin: accessContext.isMasterAdmin === true,
      now: new Date().toISOString(),
    });

    // A project, a version or a report that cannot be used is stated plainly and
    // nothing is written.
    if (!outcome.ok) {
      return Response.json({ error: outcome.block.error, reason: outcome.block.reason }, { status: outcome.block.status });
    }

    const { snapshot, attempt } = outcome;

    // ── Nothing was saved: the refused attempt's diagnostic, for a MASTER ADMIN alone ──
    // A refusal is never silent: the reason, the exact validation response and the draft
    // it refused travel back with the attempt, so the next refusal is diagnosable from
    // the response itself instead of being reconstructed from a console line. An
    // ordinary dealer is given the reason and the safe fallback, and no violation, claim
    // ID, sentence or draft reaches them. Nothing is stored: this is the response to the
    // attempt, not a record.
    if (!attempt.ok) {
      console.log(
        `[generateReportDesignIntent] refused reason=${attempt.reason} project=${project_id} version=${version_id} `
        + `by=${user.email || user.id} detail=${attempt.detail || 'none'}`,
      );

      const diagnostics = accessContext.isMasterAdmin === true
        ? {
          reason: attempt.reason,
          detail: attempt.detail || null,
          project_id,
          version_id,
          attempted_at: new Date().toISOString(),
          validation: attempt.validation || null,
          draft: attempt.draft ?? null,
          provider: attempt.provider_identity || null,
          source_fingerprints: snapshot.source_fingerprints || null,
          input_fingerprint: outcome.generation?.input_fingerprint ?? null,
          // Which pictures the refused attempt was shown, when it was shown any:
          // identity only, and never a storage address.
          visual_context: attempt.visual_context || null,
        }
        : null;

      return Response.json({
        ok: false,
        reason: attempt.reason,
        detail: attempt.detail,
        // The complete violation list belongs to the diagnostic response and is
        // returned to a master admin alone.
        validation_errors: diagnostics ? (attempt.validation_errors || []) : [],
        diagnostics,
        // The report keeps its own deterministic Design Intent: nothing was
        // written, and nothing incomplete is ever displayed.
        fallback: 'deterministic',
      });
    }

    console.log(
      `[generateReportDesignIntent] accepted project=${project_id} version=${version_id} `
      + `provider=${attempt.provider || 'none'} model=${attempt.model || 'none'} prompt=${attempt.prompt_version} `
      + `contract=${attempt.contract_version} pack=${attempt.evidence_pack_fingerprint} `
      + `geometry=${attempt.geometry_fingerprint || 'none'} images=${attempt.visual_fingerprint || 'none'} `
      + `by=${user.email || user.id}`,
    );

    return Response.json({
      ok: true,
      reason: null,
      status: attempt.record.status,
      text: attempt.text,
      metadata: attempt.record,
      snapshot_id: outcome.snapshot_id,
      // The geometry the narrative was written from, where one was confirmed against
      // this saved report. Null states honestly that no geometry was used.
      geometry_fingerprint: attempt.geometry_fingerprint ?? null,
      // The image selection the narrative was written from, where it was shown one.
      // Null states honestly that this attempt read no pictures, and the record saved
      // beside the report carries the identity of the selection: each image's own id,
      // the revision of its file, its role and the designer's caption. Never a
      // storage address.
      visual_fingerprint: attempt.visual_fingerprint ?? null,
      visual_context: attempt.visual_context ?? null,
      validation_errors: attempt.validation_errors || [],
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'The report narrative could not be generated.' }, { status: 500 });
  }
}