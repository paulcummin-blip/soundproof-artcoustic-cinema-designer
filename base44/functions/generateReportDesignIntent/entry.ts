import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { readProposalReportEvidence } from '../../shared/proposalReportEvidenceReader.js';
import { GPT_WRITER_FLAG_FIELD, resolveGptWriterFlag } from '../../shared/proposalWriter/proposalWriterFlag.js';
import {
  DESIGN_INTENT_REFUSAL,
  runReportDesignIntent,
} from '../../shared/reportDesignIntent/reportDesignIntentRunner.js';

/**
 * Generate the Project Report's Design Intent with the Astra writer — OPTIONAL.
 *
 * The Project Report is untouched by this function and does not depend on it: the
 * report generates, renders and prints with its own deterministic Design Intent
 * whatever happens here. This is one failure-isolated operation that, when it
 * succeeds, saves an accepted narrative beside the report it was written for.
 *
 * The writer is given the report's own FROZEN evidence — the saved Project Report
 * and its published engineering, read through the existing evidence path — and the
 * existing writer contract, scoped to the one section the Design Intent is written
 * as. The provider is the platform AI gateway, called with the server session:
 * there is no API key in this app, in the browser bundle or in any client payload.
 *
 * Nothing is written unless the draft passed validation. A refused, failed or
 * timed-out attempt returns the reason and stores nothing, so an incomplete draft
 * can never reach the page. The saved narrative is written against the exact
 * version and the exact evidence fingerprints it was written from, and it is
 * never regenerated on opening a report.
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

    const project = await base44.entities.Project.get(project_id).catch(() => null);
    if (!project?.id) return Response.json({ error: 'That project was not found.' }, { status: 404 });

    const version = await base44.entities.ProjectVersion.get(version_id).catch(() => null);
    if (!version?.id || String(version.project_id || '') !== String(project_id)) {
      return Response.json({ error: 'That design version is not part of this project.' }, { status: 404 });
    }

    // The saved Project Report this narrative belongs to. A report that has not
    // been generated has no frozen evidence to write from, so nothing is written.
    const snapshotPage = await base44.entities.ReportSnapshot.filter(
      { project_id, version_id, report_type: 'project' },
      { limit: 1 },
    );
    const snapshot = (snapshotPage?.items || [])[0] || null;
    if (!snapshot) {
      return Response.json({
        error: 'The Project Report has not been generated for this version yet, so there is no frozen evidence to write from.',
        reason: DESIGN_INTENT_REFUSAL.NO_EVIDENCE,
      }, { status: 409 });
    }

    // ── The writer's own switch, before any evidence is read ──
    const configResult = await base44.asServiceRole.entities.SystemConfig.filter({}, { limit: 1 });
    const configRecord = (Array.isArray(configResult) ? configResult : (configResult?.items || []))[0] || null;
    const flag = resolveGptWriterFlag({
      config: configRecord?.[GPT_WRITER_FLAG_FIELD] || null,
      accountId: project.account_id || accessContext.user?.account_id || accessContext.account?.id || null,
      email: user.email || null,
      isMasterAdmin: accessContext.isMasterAdmin === true,
    });

    const attempt = await runReportDesignIntent({
      flag,
      versionIds: [version.id],
      project,
      // The evidence the narrative is saved against: the exact source inputs the
      // saved Project Report was generated from.
      sourceFingerprints: snapshot.source_fingerprints || null,
      user,
      now: new Date().toISOString(),
      readEvidence: async ({ versionIds }) => {
        const page = await base44.entities.ProjectVersion.filter(
          { project_id, id: { $in: versionIds } },
          { limit: 50 },
        );
        const rows = page?.items || [];
        const versions = versionIds.map((id) => rows.find((row) => row.id === id));
        if (versions.some((row) => !row)) {
          throw new Error('That design version could not be read, so its saved report evidence is unavailable.');
        }
        return readProposalReportEvidence(base44.entities, project_id, versions, {
          authorityEntities: base44.asServiceRole.entities,
        });
      },
      invokeLLM: (request) => base44.integrations.Core.InvokeLLM(request),
    });

    // ── The one write, and only for an accepted narrative ──
    if (!attempt.ok) {
      console.log(
        `[generateReportDesignIntent] refused reason=${attempt.reason} project=${project_id} version=${version_id} `
        + `by=${user.email || user.id} detail=${attempt.detail || 'none'}`,
      );
      return Response.json({
        ok: false,
        reason: attempt.reason,
        detail: attempt.detail,
        validation_errors: attempt.validation_errors || [],
        // The report keeps its own deterministic Design Intent: nothing was
        // written, and nothing incomplete is ever displayed.
        fallback: 'deterministic',
      });
    }

    const payload = {
      ...(snapshot.payload && typeof snapshot.payload === 'object' ? snapshot.payload : {}),
      design_intent: attempt.record,
    };
    const saved = await base44.entities.ReportSnapshot.update(snapshot.id, { payload });

    console.log(
      `[generateReportDesignIntent] accepted project=${project_id} version=${version_id} `
      + `provider=${attempt.provider || 'none'} model=${attempt.model || 'none'} prompt=${attempt.prompt_version} `
      + `contract=${attempt.contract_version} pack=${attempt.evidence_pack_fingerprint} by=${user.email || user.id}`,
    );

    return Response.json({
      ok: true,
      reason: null,
      status: attempt.record.status,
      text: attempt.text,
      metadata: attempt.record,
      snapshot_id: saved?.id || snapshot.id,
      validation_errors: attempt.validation_errors || [],
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'The report narrative could not be generated.' }, { status: 500 });
  }
}