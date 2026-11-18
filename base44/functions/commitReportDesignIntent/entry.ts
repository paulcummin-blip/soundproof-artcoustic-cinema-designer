import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { commitReportDesignIntent } from '../../shared/reportDesignIntent/commitReportDesignIntent.js';

/**
 * Commit a reviewed, accepted Design Intent narrative onto the existing Project
 * Report snapshot — the write half of the deliberate Regenerate Design Intent
 * action.
 *
 * The narrative record is the exact record the writer produced and the designer
 * reviewed in the generate-only response from `generateReportDesignIntent`. It is
 * never regenerated here. Only `payload.design_intent` is overwritten; every other
 * snapshot field, every source fingerprint, the engineering evidence, the
 * drawings and the page inventory are preserved exactly as they stand.
 *
 * The Project Report is untouched apart from this one nested field. Existing
 * issued PDF assets are never modified by this function.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { project_id, version_id, narrative_record } = body || {};
    if (!project_id || !version_id || !narrative_record) {
      return Response.json({ error: 'project_id, version_id and narrative_record are required.' }, { status: 400 });
    }

    const accessContext = await resolveAccountAccess(base44, user);
    if (accessContext?.allowed !== true || accessContext.capabilities?.soundProof !== true) {
      return Response.json({ error: 'Sound Proof access is required to update a report narrative.' }, { status: 403 });
    }

    const outcome = await commitReportDesignIntent({
      entities: base44.entities,
      projectId: project_id || null,
      versionId: version_id || null,
      narrativeRecord: narrative_record || null,
      now: new Date().toISOString(),
    });

    if (!outcome.ok) {
      return Response.json(
        { error: outcome.block.error, reason: outcome.block.reason || null },
        { status: outcome.block.status },
      );
    }

    console.log(
      `[commitReportDesignIntent] committed project=${project_id} version=${version_id} by=${user.email || user.id}`,
    );

    return Response.json({
      ok: true,
      snapshot_id: outcome.snapshot_id,
      text: outcome.text,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'The report narrative could not be saved.' }, { status: 500 });
  }
}