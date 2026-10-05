import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { readProposalReportEvidence } from '../../shared/proposalReportEvidenceReader.js';
import { prepareProposalEvidence, prepareProposalInterpretation, generateProposalDraftContent } from '../../shared/proposalDraftPipeline.js';
import { resolveSections, buildProjectContext } from '../../shared/proposalGenerationPrompts.js';
import { HIGHLIGHTS_SECTION_TYPE, resolveSectionTitle } from '../../shared/systemDesignSummarySections.js';
import { comparisonSectionMetadata, verifyComparisonPersisted } from '../../shared/comparisonPersistence.js';
import { formatInterpretationForLog } from '../../shared/adiProjectInterpretation.js';
import { loadCacheRecord, findPublication } from '../../shared/publishedEngineeringAuthority.js';

// ── ONE proposal readiness authority ──
// The gate below is decided by the SAME per-version rule the Step 5 table shows
// (src/components/proposal/sourceAuthority/proposalReadinessAuthority.js mirrors
// this module and a test asserts the two agree word for word). It states, per
// selected version, the Visual Report, the Technical Report and the published
// engineering result, and it names the version by the name the designer saved —
// never as "Level 1 version · V2".
import {
  PUBLICATION_STATUS,
  resolveCalculationAuthority,
  resolveProposalReadinessGate,
  resolveVersionReadiness,
} from '../../shared/proposalReadinessAuthority.js';

// The generic blocking rule — the wording the client authority uses when a
// block cannot be attributed to a named version and source.
// (src/components/proposal/sourceAuthority/proposalSourceAuthority.js). The
// frontend cannot import from base44/ and vice versa, so the sentence lives in
// both places and a test asserts they match.
const PROPOSAL_SOURCE_REQUIRED_MESSAGE =
  'Generate the Visual and Technical Reports before creating a proposal. This ensures the proposal uses the current project data and RP22 results.';

// Section definitions and prompts are shared with the write-free preview pipeline.

export default async function(req) {
  let base44 = null;
  let proposal = null;
  let sectionRecords = [];

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { request_id, project_id, version_id, account_id, narrative_goal, proposal_type, selected_version_ids, client_brief, parent_proposal_id } = body;
    let engineering_snapshot = null;

    if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    const existing = await base44.entities.Proposal.filter({ creation_request_id: request_id });
    if (existing?.[0]) {
      const existingSections = await base44.entities.ProposalSection.filter({ proposal_id: existing[0].id });
      const expectedSectionCount = resolveSections(existing[0].proposal_type || 'single').length;
      if (existing[0].status === 'generated' && existingSections.length === expectedSectionCount) {
        return Response.json({
          proposal_id: existing[0].id,
          proposal: existing[0],
          section_count: existingSections.length,
          status: 'generated',
          idempotent_replay: true,
        });
      }
      return Response.json({
        error: 'This proposal request is already in progress or requires recovery.',
        proposal_id: existing[0].id,
      }, { status: 409 });
    }

    // ── Load project data ──
    const projects = await base44.entities.Project.filter({ id: project_id });
    const project = projects?.[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // ── Load brand assets ──
    let brandAsset = null;
    const effectiveAccountId = project.account_id;
    if (!effectiveAccountId) {
      return Response.json({ error: 'Project account is missing.' }, { status: 409 });
    }
    if (account_id && account_id !== effectiveAccountId) {
      return Response.json({ error: 'Project account does not match the active account.' }, { status: 403 });
    }
    if (effectiveAccountId) {
      const brandResults = await base44.entities.BrandAsset.filter({ account_id: effectiveAccountId });
      brandAsset = brandResults?.[0] || null;
    }

    // ── Resolve version IDs ──
    // New proposals pass selected_version_ids[] and proposal_type.
    // Legacy calls pass a single version_id — treat as a single proposal.
    const resolvedType = proposal_type || 'single';
    const resolvedVersionIds = Array.isArray(selected_version_ids) && selected_version_ids.length > 0
      ? selected_version_ids
      : version_id
        ? [version_id]
        : [];
    if (!['single', 'comparison', 'system_summary'].includes(resolvedType)) {
      return Response.json({ error: 'Unsupported proposal_type.' }, { status: 400 });
    }
    const expectedVersionCountValid = resolvedType === 'comparison'
      ? resolvedVersionIds.length >= 2 && new Set(resolvedVersionIds).size === resolvedVersionIds.length
      : resolvedVersionIds.length === 1;
    if (!expectedVersionCountValid) {
      return Response.json({
        error: resolvedType === 'comparison'
          ? 'Comparison reports require at least two versions.'
          : 'This report type requires exactly one version.',
      }, { status: 400 });
    }

    const projectVersions = await base44.entities.ProjectVersion.filter({ project_id });
    const projectVersionIds = new Set((projectVersions || []).map((item) => item.id));
    const invalidVersionIds = resolvedVersionIds.filter((id) => !projectVersionIds.has(id));
    if (invalidVersionIds.length > 0) {
      return Response.json({ error: 'One or more selected versions do not belong to this project.' }, { status: 400 });
    }

    // For backward compatibility, version_id = first selected version.
    const legacyVersionId = resolvedVersionIds[0] || null;

    // ── Revision link ──
    // Regenerating a saved proposal creates a NEW proposal linked to the one it
    // revises. The original is never modified: not its sections, not its status,
    // and not its current-version flag, so a proposal that has already been sent
    // stays exactly as it was and stays visible.
    let parentProposal = null;
    let revisionNumber = 1;
    const parentProposalId = typeof parent_proposal_id === 'string' ? parent_proposal_id.trim() : '';
    if (parentProposalId) {
      const parents = await base44.entities.Proposal.filter({ id: parentProposalId });
      parentProposal = parents?.[0] || null;
      if (!parentProposal) {
        return Response.json({
          error: 'The proposal this regeneration was started from no longer exists.',
        }, { status: 404 });
      }
      if (String(parentProposal.project_id) !== String(project_id)) {
        return Response.json({
          error: 'The proposal this regeneration was started from belongs to another project.',
        }, { status: 400 });
      }
      const parentVersion = Number(parentProposal.version);
      revisionNumber = (Number.isFinite(parentVersion) && parentVersion > 0 ? parentVersion : 1) + 1;
    }

    // ── STAGE 1: ADI project interpretation ──
    // Before any client-facing text is written, ADI reads the selected version
    // data and states the design story: what this room is, what the design is
    // trying to achieve, where it is strongest, what limits it, and which
    // results are reliable enough to be used as evidence.
    //
    // STAGE 2 (the section writer below) then uses the results only as evidence
    // inside that story. Engineering data -> design interpretation -> narrative.
    //
    // The interpretation is saved with the report and logged, so the story a
    // report was written from can be audited later.
    let suppliedSnapshots;
    try {
      suppliedSnapshots = await readProposalReportEvidence(base44.entities, project_id,
        resolvedVersionIds.map((id) => projectVersions.find((version) => version.id === id)));
    } catch (error) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    engineering_snapshot = suppliedSnapshots[0].snapshot;
    // ── Evidence traceability ──
    // The exact evidence each version's facts were read from: the Visual and
    // Technical Report snapshots, the version, when the evidence was generated
    // and its content fingerprint. A proposal that later disagrees with a report
    // can therefore be traced back to the evidence it actually read.
    const reportEvidenceCitations = suppliedSnapshots.map((entry) => ({
      version_id: entry.version_id,
      ...(entry.evidence?.citation || {}),
    }));
    const versionLabelById = new Map(
      resolvedVersionIds.map((id, index) => {
        const record = (projectVersions || []).find((version) => version.id === id);
        return [id, `Version ${record?.version_number ?? index + 1} - ${record?.version_name || 'Untitled'}`];
      }),
    );

    // ── The per-version frozen evidence contract ──
    // A comparison report receives the frozen engineering evidence for EVERY
    // selected version, so neither the calculated comparison table nor the
    // narrative can ever fall back to a single version's results.
    const { versionEvidence, comparisonTable, comparisonEvidenceText } = prepareProposalEvidence(suppliedSnapshots, projectVersions || [], resolvedType);

    // A comparison is only generated from calculated evidence for every
    // version: a missing version would force an invented comparison value.
    if (resolvedType === 'comparison') {
      const missingEvidence = resolvedVersionIds.filter((id) => {
        const evidence = versionEvidence.find((version) => String(version.version_id) === String(id));
        return !evidence || evidence.available !== true;
      });
      if (missingEvidence.length > 0) {
        return Response.json({
          error: 'Comparison evidence could not be built for both selected versions. Regenerate the Visual and Technical Reports for each version, then try again.',
          missing_version_ids: missingEvidence,
        }, { status: 409 });
      }

      // A comparison without a table is not a comparison. The Key Performance
      // Highlights section is a calculated table, never a prose page under a
      // table's heading, so a table that cannot be built fails visibly here with
      // the reason instead of producing an empty section.
      if (comparisonTable.rows.length === 0) {
        return Response.json({
          error: 'Comparison evidence could not be built for both selected versions. Regenerate the Visual and Technical Reports for each version, then try again.',
          comparison_versions: comparisonTable.versions,
        }, { status: 409 });
      }
    }

    // ── SOURCE AUTHORITY: no current sources, no proposal ──
    // A proposal is downstream of the generated Visual and Technical Reports,
    // both of which are rendered from the version's published engineering
    // result. Every selected version is judged on those three sources by the one
    // shared readiness authority — the same verdict, for the same version, in
    // the same words as the Step 5 table. The engineering source is the PUBLISHED
    // result alone: a browser-session handoff is not visible here and so is never
    // accepted as readiness.
    const savedReportByKey = new Map();
    const savedReportRows = await base44.entities.ReportSnapshot.filter({ project_id }, '-generated_at', 200);
    (Array.isArray(savedReportRows) ? savedReportRows : []).forEach((row) => {
      const key = `${row.version_id}::${row.report_type}`;
      if (!savedReportByKey.has(key)) savedReportByKey.set(key, row);
    });

    const versionPublicationById = new Map();
    const cacheRecordByVersionId = new Map();
    for (const versionId of resolvedVersionIds) {
      const versionRecord = (projectVersions || []).find((version) => version.id === versionId);
      const pointer = String(versionRecord?.published_fingerprint || '').trim();
      // The cache row is read for EVERY selected version, not only for one that
      // has a publication pointer: it holds the version's completed calculation
      // authority, the calculated engineering result its Technical Report renders.
      const cacheRecord = await loadCacheRecord(base44, project_id, versionId);
      if (cacheRecord) cacheRecordByVersionId.set(versionId, cacheRecord);
      const publication = pointer && cacheRecord ? findPublication(cacheRecord, pointer) : null;
      if (publication) versionPublicationById.set(versionId, publication);
    }

    const readinessRows = resolvedVersionIds.map((versionId) => {
      const versionRecord = (projectVersions || []).find((version) => version.id === versionId) || null;
      const pointer = String(versionRecord?.published_fingerprint || '').trim();
      const publication = versionPublicationById.get(versionId) || null;
      const savedTechnical = savedReportByKey.get(`${versionId}::technical`) || null;
      // The version's calculated engineering result: the publication when it has
      // one, otherwise the completed calculation authority of the SAME design its
      // Technical Report was generated from — the rule the client applies too.
      const calculationAuthority = resolveCalculationAuthority({
        cacheRecord: cacheRecordByVersionId.get(versionId) || null,
        savedTechnicalReport: savedTechnical,
      });
      return resolveVersionReadiness({
        version: versionRecord,
        savedReports: {
          visual: savedReportByKey.get(`${versionId}::visual`) || null,
          technical: savedTechnical,
        },
        publication,
        publicationStatus: pointer
          ? (publication ? PUBLICATION_STATUS.PUBLISHED : PUBLICATION_STATUS.STALE)
          : PUBLICATION_STATUS.NOT_CALCULATED,
        currentFingerprints: {
          engineeringFingerprint: publication?.engineering_fingerprint || null,
          // When the version has no publication to speak for it, the completed
          // calculation authority supplies its bass fingerprint, so a saved report
          // is judged against the design the version actually holds. A version WITH
          // a publication keeps the publication's own values, exactly as before.
          calculationFingerprint: publication?.provenance?.bass_fingerprint
            || (publication ? null : calculationAuthority?.fingerprint)
            || null,
          seatPriorityFingerprint: publication?.engineering_summary?.seatPriorityFingerprint || null,
        },
        calculationAuthority,
      });
    });

    const readinessGate = resolveProposalReadinessGate({ rows: readinessRows, minVersions: 1 });
    // Saved-report reader above is the gate. A lagging publication pointer
    // must not override the report's captured source.
    if (!suppliedSnapshots.length) {
      // Name every blocked version and what it is ACTUALLY missing, from the same
      // authority the client's readiness table reads, so the panel and the gate
      // can never contradict one another.
      return Response.json({
        error: readinessGate.message || PROPOSAL_SOURCE_REQUIRED_MESSAGE,
        source_blockers: readinessGate.rows
          .filter((row) => !row.ready)
          .flatMap((row) => row.blockers.map((blocker) => ({
            version_id: row.versionId,
            version_name: row.versionName,
            source: blocker.source,
            state: blocker.state,
            label: blocker.label,
          }))),
      }, { status: 409 });
    }

    // The report identity carried into the prompt: the current publication for
    // the primary version. Proves every project fact came from a report.
    const primaryPublication = versionPublicationById.get(legacyVersionId) || null;
    const sourceIdentity = {
      project_id,
      version_id: legacyVersionId,
      version_label: versionLabelById.get(legacyVersionId) || null,
      engineering_fingerprint: primaryPublication?.engineering_fingerprint || null,
      published_at: primaryPublication?.published_at || null,
    };
    const { primaryInterpretation, comparisonReading, interpretationBlock } = prepareProposalInterpretation({
      suppliedSnapshots, project, client_brief, resolvedType, resolvedVersionIds, versionLabelById,
    });
    console.log(`[generateProposal] ADI stage 1 interpretation | ${formatInterpretationForLog(primaryInterpretation)}`);

    // ── Create Proposal record ──
    proposal = await base44.entities.Proposal.create({
      project_id,
      account_id: effectiveAccountId,
      creation_request_id: request_id,
      proposal_type: resolvedType,
      selected_version_ids: resolvedVersionIds,
      version_id: legacyVersionId,
      title: project.name || 'Untitled Proposal',
      status: 'generating',
      narrative_goal: narrative_goal || 'luxury_cinema',
      client_brief: client_brief || '',
      // A regeneration is a linked revision, never an overwrite: this record
      // points at the proposal it revises, and the original is left untouched.
      ...(parentProposal ? {
        parent_proposal_id: parentProposal.id,
        version: revisionNumber,
        version_label: `Revision ${revisionNumber}`,
      } : {}),
      // The frozen Engineering Snapshot assembled by the frontend. The snapshot
      // is frozen at generation time, so later Room Designer edits do NOT
      // silently change an existing proposal.
      engineering_snapshot: engineering_snapshot || null,
      // The Stage 1 ADI project interpretation is saved with the report, so the
      // design story a report was written from can be audited later.
      metadata: {
        project_interpretation: primaryInterpretation,
        // The evidence this proposal was generated from, per version.
        report_evidence: reportEvidenceCitations,
        ...(comparisonReading ? { comparison_reading: comparisonReading } : {}),
        // The comparison data contract: one frozen evidence entry per selected
        // version, plus the calculated table the report renders. Section
        // regeneration reuses this exactly.
        ...(resolvedType === 'comparison'
          ? { selected_versions: versionEvidence, comparison_table: comparisonTable }
          : {}),
      },
    });

    // Read the persisted record, not the create response, before any writing.
    if (resolvedType === 'comparison') {
      await verifyComparisonPersisted(base44, proposal.id, comparisonTable, versionEvidence);
    }

    // ── Create 10 ProposalSection records ──
    const sectionDefs = resolveSections(resolvedType);
    sectionRecords = await base44.entities.ProposalSection.bulkCreate(
      sectionDefs.map((s, i) => ({
        proposal_id: proposal.id,
        account_id: effectiveAccountId,
        section_type: s.type,
        section_key: s.key,
        // A comparison names its own sections: it presents system options and
        // compares them, so it is never titled as a single system design.
        title: resolveSectionTitle(s.type, s.title, resolvedType),
        body: '',
        ...(resolvedType === 'comparison' && s.type === HIGHLIGHTS_SECTION_TYPE
          ? { metadata: comparisonSectionMetadata(comparisonTable) } : {}),
        dealer_notes: '',
        order_index: i,
        is_enabled: true,
        locked: false,
      }))
    );

    // ── Build project context for GPT ──
    // Report identity: the versions this report covers, in selection order.
    const reportVersions = resolvedVersionIds.map((id, index) => {
      const record = (projectVersions || []).find((version) => version.id === id);
      return record?.version_name || 'Untitled';
    });
    const projectContext = buildProjectContext(
      project,
      narrative_goal,
      brandAsset,
      client_brief,
      engineering_snapshot,
      resolvedType,
      reportVersions,
      sourceIdentity,
      comparisonEvidenceText,
    );

    // Saved and preview drafts run the identical prompt assembly and LLM calls.
    // This helper has no entity client and cannot persist anything.
    const generatedContent = await generateProposalDraftContent({
      invokeLLM: (args) => base44.integrations.Core.InvokeLLM(args),
      sectionRecords, sectionDefs, resolvedType, engineering_snapshot,
      comparisonTable, versionEvidence, projectContext, interpretationBlock,
      // The Client Brief decides whether the designer explicitly asked for an
      // assumed parameter (P8, P15, P21), which is the only way one is mentioned.
      clientBrief: client_brief || '',
    });

    // ── Update sections with generated content ──
    const generatedAt = new Date().toISOString();
    await Promise.all(generatedContent.map(({ section, html, metadata }) =>
      base44.entities.ProposalSection.update(section.id, {
        body: html,
        ...(metadata ? { metadata } : {}),
        last_gpt_generated_at: generatedAt,
      })
    ));

    if (resolvedType === 'comparison') {
      const highlights = sectionRecords.find(s => s.section_type === HIGHLIGHTS_SECTION_TYPE);
      await verifyComparisonPersisted(base44, proposal.id, comparisonTable, versionEvidence, highlights?.id);
    }

    // ── Update Proposal status ──
    await base44.entities.Proposal.update(proposal.id, { status: 'generated' });

    const completedProposal = { ...proposal, status: 'generated' };
    return Response.json({
      proposal_id: proposal.id,
      proposal: completedProposal,
      section_count: sectionRecords.length,
      status: 'generated',
      idempotent_replay: false,
    });
  } catch (error) {
    const cleanupSucceeded = proposal?.id
      ? await rollbackCreatedProposal(base44, proposal.id, sectionRecords)
      : true;
    return Response.json({
      error: error?.message || 'Proposal generation failed.',
      cleanup_succeeded: cleanupSucceeded,
      proposal_id: cleanupSucceeded ? null : proposal?.id || null,
    }, { status: 500 });
  }
}

async function rollbackCreatedProposal(base44, proposalId, knownSections = []) {
  if (!base44 || !proposalId) return true;
  try {
    const discovered = await base44.entities.ProposalSection.filter({ proposal_id: proposalId });
    const sectionIds = [...new Set([
      ...knownSections.map((section) => section?.id),
      ...(discovered || []).map((section) => section?.id),
    ].filter(Boolean))];

    const sectionDeletes = await Promise.allSettled(
      sectionIds.map((sectionId) => base44.entities.ProposalSection.delete(sectionId))
    );
    const sectionsRemoved = sectionDeletes.every((result) => result.status === 'fulfilled');
    if (!sectionsRemoved) {
      await base44.entities.Proposal.update(proposalId, { status: 'draft' });
      return false;
    }

    await base44.entities.Proposal.delete(proposalId);
    return true;
  } catch {
    try {
      await base44.entities.Proposal.update(proposalId, { status: 'draft' });
    } catch {
      // Best effort: a remaining Draft card is safer than a misleading Generated card.
    }
    return false;
  }
}