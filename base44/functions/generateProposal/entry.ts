import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { buildWritingStyleContract } from '../../shared/reportWritingStyleContract.js';
import { SYSTEM_SUMMARY_SECTIONS, HIGHLIGHTS_SECTION_TYPE, getSystemSummarySectionPrompt, COMPARISON_REPORT_INSTRUCTIONS, resolveSectionTitle } from '../../shared/systemDesignSummarySections.js';
import { buildComparisonSectionRule } from '../../shared/comparisonStoryRule.js';
import { buildSelectedVersionEvidence, formatVersionEvidenceForPrompt } from '../../shared/comparisonEvidence.js';
import { buildComparisonTable, formatComparisonTableForPrompt, buildComparisonHighlightsPrompt, COMPARISON_HIGHLIGHTS_SCHEMA } from '../../shared/comparisonTable.js';
import { buildEngineeringEvidence, selectHighlightRows, mergeHighlightRows, buildHighlightsPrompt, HIGHLIGHTS_JSON_SCHEMA } from '../../shared/engineeringSnapshotEvidence.js';
import { buildProjectInterpretation, formatInterpretationForPrompt, formatInterpretationForLog } from '../../shared/adiProjectInterpretation.js';
import { compareInterpretations, formatComparisonInterpretationForPrompt } from '../../shared/adiReportComparison.js';
import { loadCacheRecord, findPublication } from '../../shared/publishedEngineeringAuthority.js';
import { resolveReportLayout } from '../../shared/highChannelDensityRule.js';

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

const SECTIONS = [
  { type: 'cover', key: 'cover', title: 'Cover', canEditBody: false },
  { type: 'executive_summary', key: 'executive_summary', title: 'Executive Summary', canEditBody: true },
  { type: 'design_philosophy', key: 'design_philosophy', title: 'Design Philosophy', canEditBody: true },
  { type: 'system_overview', key: 'system_overview', title: 'System Overview', canEditBody: true },
  { type: 'room_images', key: 'room_images', title: 'Room Images', canEditBody: true },
  { type: 'performance', key: 'performance', title: 'Performance', canEditBody: true },
  { type: 'products', key: 'products', title: 'Products', canEditBody: true },
  { type: 'comparison', key: 'comparison', title: 'Comparison', canEditBody: true },
  { type: 'conclusion', key: 'conclusion', title: 'Conclusion', canEditBody: true },
  { type: 'appendix', key: 'appendix', title: 'Appendix', canEditBody: true },
];

/**
 * The section set for a report type.
 *
 * Both current report types are client-facing reports built around the three
 * core RP22 design structures, so they share the System Design section set.
 * The legacy proposal section set is kept only for 'single' reports saved
 * before the two report types were merged.
 */
function resolveSections(proposalType) {
  return proposalType === 'single' ? SECTIONS : SYSTEM_SUMMARY_SECTIONS;
}

const GOAL_LABELS = {
  luxury_cinema: 'Luxury Cinema',
  family_media_room: 'Family Media Room',
  reference_performance: 'Reference Performance',
  best_value: 'Best Value',
  future_proof: 'Future Proof',
};

const SECTION_PROMPTS = {
  executive_summary: 'Write an executive summary introducing the project, the design intent, and the key outcomes. 2-3 paragraphs.',
  design_philosophy: 'Write the design philosophy section explaining the approach to this cinema design — why these choices were made, the acoustic principles, and the design intent. 2-3 paragraphs.',
  system_overview: 'Write the system overview section describing the speaker system, configuration, and key equipment. Use bullet lists for specifications. 2-3 paragraphs plus a bullet list.',
  room_images: 'Write a brief introduction for the room images section. This section will be followed by project render images. 1 paragraph.',
  performance: 'Write the performance section describing the expected acoustic performance, RP22 compliance approach, and bass response characteristics. 2-3 paragraphs.',
  products: 'Write the products section describing the key products in the system. Use a bullet list for each product category. 2-3 paragraphs plus bullet lists.',
  comparison: 'Write the comparison section comparing this design to typical alternatives, explaining the advantages of this approach. 2-3 paragraphs.',
  conclusion: 'Write the conclusion section summarising the proposal, restating the value, and including a call to action. 2-3 paragraphs.',
  appendix: 'Write the appendix introduction. This section will contain technical specifications and detailed data. 1 paragraph.',
};

export default async function(req) {
  let base44 = null;
  let proposal = null;
  let sectionRecords = [];

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { request_id, project_id, version_id, account_id, narrative_goal, proposal_type, selected_version_ids, client_brief, engineering_snapshot, engineering_snapshots, parent_proposal_id } = body;

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
    const suppliedSnapshots = Array.isArray(engineering_snapshots) && engineering_snapshots.length > 0
      ? engineering_snapshots
      : [{ version_id: legacyVersionId, snapshot: engineering_snapshot || null }];
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
    const versionEvidence = buildSelectedVersionEvidence(suppliedSnapshots.map((entry) => {
      const versionId = entry?.version_id || entry?.versionId || null;
      const record = (projectVersions || []).find((version) => version.id === versionId);
      return {
        version_id: versionId,
        version_name: entry?.version_name || record?.version_name || null,
        snapshot: entry?.snapshot || null,
      };
    }));
    const comparisonTable = resolvedType === 'comparison'
      ? buildComparisonTable(versionEvidence)
      : { rows: [], versions: [] };
    const comparisonEvidenceText = resolvedType === 'comparison'
      ? [
        formatVersionEvidenceForPrompt(versionEvidence),
        formatComparisonTableForPrompt(comparisonTable),
      ].join('\n\n')
      : '';

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
    if (!readinessGate.ready) {
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
    const interpretations = suppliedSnapshots.map((entry) => {
      const versionId = entry?.version_id || entry?.versionId || null;
      return {
        label: entry?.label || versionLabelById.get(versionId) || null,
        interpretation: buildProjectInterpretation({
          snapshot: entry?.snapshot || null,
          project,
          clientBrief: client_brief,
          reportType: resolvedType,
          versions: resolvedVersionIds.map((id) => ({ id, label: versionLabelById.get(id) || null })),
          reportLabel: versionLabelById.get(versionId) || null,
        }),
      };
    });
    const primaryInterpretation = interpretations[0]?.interpretation || null;
    const comparisonReading = resolvedType === 'comparison' ? compareInterpretations(interpretations) : null;
    const comparisonBlock = comparisonReading
      && (comparisonReading.shared.length > 0 || comparisonReading.changes.length > 0)
      ? formatComparisonInterpretationForPrompt(comparisonReading)
      : '';
    const interpretationBlock = [
      formatInterpretationForPrompt(primaryInterpretation),
      comparisonBlock,
    ].filter(Boolean).join('\n\n');
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
        ...(comparisonReading ? { comparison_reading: comparisonReading } : {}),
        // The comparison data contract: one frozen evidence entry per selected
        // version, plus the calculated table the report renders. Section
        // regeneration reuses this exactly.
        ...(resolvedType === 'comparison'
          ? { selected_versions: versionEvidence, comparison_table: comparisonTable }
          : {}),
      },
    });

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
      return `Version ${record?.version_number ?? index + 1} - ${record?.version_name || 'Untitled'}`;
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

    // ── Key Performance Highlights rows ──
    // Read straight out of the frozen Engineering Snapshot. The AI writes the
    // "What the room gains" cells only; it never sets or changes a Result value,
    // and it never chooses which rows appear.
    const usesSystemStructure = resolvedType !== 'single';
    const isComparisonReport = resolvedType === 'comparison';
    // A single report carries one calculated row per useful result. A
    // comparison carries the calculated comparison table instead, so its
    // highlight rows are never selected from one version.
    const highlightRows = usesSystemStructure && !isComparisonReport
      ? selectHighlightRows(engineering_snapshot)
      : [];
    const isComparisonHighlights = (section) => isComparisonReport
      && section.section_type === HIGHLIGHTS_SECTION_TYPE
      && comparisonTable.rows.length > 0;
    const isHighlightsSection = (section) => isComparisonHighlights(section)
      || (usesSystemStructure
        && section.section_type === HIGHLIGHTS_SECTION_TYPE
        && highlightRows.length > 0);

    // ── The layout authority for this report ──
    // The high-channel-density upgrade rule (9.1.6, or 15 or more discrete
    // channels) then applies to every prompt this report builds, so no section
    // can offer added speakers or an improved horizontal spacing result as a
    // future upgrade. It reads the frozen snapshot: nothing is recalculated.
    const reportLayout = resolveReportLayout(engineering_snapshot);

    // ── Generate content for each editable section in parallel ──
    const editableIndices = sectionRecords
      .map((section, index) => ({ section, index }))
      .filter(({ index }) => sectionDefs[index]?.canEditBody)
      // Project Images carries no generated copy at all: the section shows the
      // images the designer uploaded for the project, and nothing is written
      // underneath them.
      .filter(({ section }) => !(usesSystemStructure && section.section_type === 'room_images'));

    const generationResults = await Promise.allSettled(
      editableIndices.map(({ section }) => {
        const sectionDef = sectionDefs.find((s) => s.type === section.section_type);
        if (isComparisonHighlights(section)) {
          // The comparison table is already calculated: the model writes the
          // introduction only and never a value.
          return base44.integrations.Core.InvokeLLM({
            prompt: [
              interpretationBlock,
              projectContext,
              buildComparisonHighlightsPrompt(),
              buildWritingStyleContract(reportLayout),
            ].filter(Boolean).join('\n\n'),
            response_json_schema: COMPARISON_HIGHLIGHTS_SCHEMA,
          });
        }
        if (isHighlightsSection(section)) {
          return base44.integrations.Core.InvokeLLM({
            prompt: [
              interpretationBlock,
              buildHighlightsPrompt(projectContext, highlightRows),
              buildWritingStyleContract(reportLayout),
            ].filter(Boolean).join('\n\n'),
            response_json_schema: HIGHLIGHTS_JSON_SCHEMA,
          });
        }
        return base44.integrations.Core.InvokeLLM({
          prompt: buildSectionPrompt(sectionDef, projectContext, resolvedType, interpretationBlock, reportLayout),
        });
      })
    );

    const generatedContent = editableIndices.map(({ section }, index) => {
      const result = generationResults[index];

      if (isComparisonHighlights(section)) {
        const payload = result.status === 'fulfilled' ? result.value : null;
        const intro = String(payload?.intro_html || '').trim();
        return {
          section,
          html: intro,
          // The calculated table travels with the section: one column per
          // selected version, every value read from that version's evidence.
          metadata: {
            comparison: true,
            comparison_versions: comparisonTable.versions,
            comparison_rows: comparisonTable.rows,
          },
          failed: result.status === 'rejected' || intro.length === 0,
        };
      }
      if (isHighlightsSection(section)) {
        const payload = result.status === 'fulfilled' ? result.value : null;
        const intro = String(payload?.intro_html || '').trim();
        const rows = mergeHighlightRows(highlightRows, payload?.rows);
        return {
          section,
          html: intro,
          metadata: { highlight_rows: rows },
          failed: result.status === 'rejected'
            || intro.length === 0
            || rows.every((row) => !(row.what_the_room_gains || row.what_you_hear)),
        };
      }

      const html = result.status === 'fulfilled'
        ? (typeof result.value === 'string' ? result.value : result.value?.content || '').trim()
        : '';
      return { section, html, metadata: null, failed: result.status === 'rejected' || html.length === 0 };
    });
    const failedSections = generatedContent.filter((item) => item.failed);
    if (failedSections.length > 0) {
      throw new Error(`Proposal generation failed for ${failedSections.length} section(s). No proposal was saved.`);
    }

    // ── Update sections with generated content ──
    const generatedAt = new Date().toISOString();
    await Promise.all(generatedContent.map(({ section, html, metadata }) =>
      base44.entities.ProposalSection.update(section.id, {
        body: html,
        ...(metadata ? { metadata } : {}),
        last_gpt_generated_at: generatedAt,
      })
    ));

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

function buildProjectContext(project, narrativeGoal, brandAsset, clientBrief, engineeringSnapshot, reportType = 'system_summary', reportVersions = [], sourceIdentity = null, versionEvidenceText = '') {
  const goalLabel = GOAL_LABELS[narrativeGoal] || 'Luxury Cinema';
  // A comparison carries the frozen evidence for EVERY selected version plus the
  // calculated comparison table. A single report carries its own evidence.
  const evidence = reportType === 'comparison' && versionEvidenceText
    ? versionEvidenceText
    : buildEngineeringEvidence(engineeringSnapshot);
  // Project facts are read from the REPORT — the frozen snapshot built from the
  // current version — never from the legacy project row, so a proposal can
  // never describe another version's screen, room or layout. The legacy screen
  // is not used as a fallback either: a report either states the screen the
  // design actually has, in every section, or states none at all.
  const snapshotRoom = engineeringSnapshot?.room || {};
  const snapshotSystem = engineeringSnapshot?.system || {};
  const legacyRoom = [project.room_width, project.room_length, project.room_height]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .join(' × ');
  const roomDimensions = snapshotRoom.dimensions_text
    || (legacyRoom ? `${legacyRoom} m` : 'Not specified');
  const screenSize = snapshotRoom.size_inches ?? '';
  const aspectRatio = snapshotRoom.aspect_ratio || project.aspect_ratio || '';
  const dolbyConfig = snapshotSystem.channel_layout?.configuration_text || project.dolby_config || '';
  const speakersByRole = project.selected_speakers_by_role || {};
  const speakerInfo = Object.entries(speakersByRole)
    .map(([role, model]) => `${role}: ${model}`)
    .join(', ');
  const subwoofers = project.subwooferInstances || [];
  const subInfo = subwoofers.length > 0
    ? `${subwoofers.length}x ${subwoofers[0]?.model || 'Subwoofer'}`
    : '';
  const companyName = brandAsset?.company_name || '';
  const briefText = (clientBrief || '').trim();

  const isComparison = reportType === 'comparison';

  return [
    `Report Type: ${isComparison ? 'System Design Comparison' : 'System Design Summary'}`,
    isComparison && reportVersions.length > 0 ? `Versions compared: ${reportVersions.join(' | ')}` : '',
    isComparison && reportVersions.length > 0 ? `Calculated evidence supplied for every version: ${reportVersions.join(' | ')}` : '',
    `Narrative Goal: ${goalLabel}`,
    `Company: ${companyName}`,
    `Project: ${project.name || ''}`,
    `Client: ${project.client_name || ''}`,
    // Report identity: which report, for which version, was written from.
    `Report project id: ${sourceIdentity?.project_id || ''}`,
    `Report version id: ${sourceIdentity?.version_id || ''}`,
    `Report version: ${sourceIdentity?.version_label || ''}`,
    `Report fingerprint: ${sourceIdentity?.engineering_fingerprint || ''}`,
    `Reports generated: ${sourceIdentity?.published_at || ''}`,
    `Room Dimensions: ${roomDimensions}`,
    screenSize
      ? `Screen: ${screenSize}" ${aspectRatio} (this is the screen for this report: never state, convert or infer another screen size anywhere in the report)`
      : 'Screen: not stated in this report — never state a screen size',
    `Speaker Configuration: ${dolbyConfig}`,
    speakerInfo ? `Speakers: ${speakerInfo}` : '',
    subInfo ? `Subwoofers: ${subInfo}` : '',
    '',
    evidence,
    '',
    '=== EMPHASIS NOTES / CLIENT BRIEF (narrative focus: guides emphasis only, never the facts) ===',
    briefText || 'No specific emphasis notes provided. Use a balanced professional narrative.',
    '',
    '=== CONSTRAINT ===',
    'Use only the supplied report data for project facts.',
    'Never invent, infer, or carry over a project fact — screen size, aspect ratio,',
    'room dimensions, seating, speaker layout, subwoofer layout, RP22 results,',
    'viewing results, SPL capability, bass results, limitations, or recommendations —',
    'from any other project, version, or earlier design.',
    isComparison
      ? 'Calculated Sound Proof evidence is supplied for every selected version, and the comparison table is calculated for each of them. Never state or imply a measured result that is not in that evidence, and never state a difference the table does not show.'
      : '',
    'The Client Brief influences narrative emphasis, wording, and structure ONLY.',
    'It must NEVER alter, contradict, or override any engineering result, RP22 value,',
    'Design Rating, or recommendation. All measured values remain exactly as reported.',
  ].filter(Boolean).join('\n');
}

function buildSectionPrompt(sectionDef, projectContext, proposalType, interpretationBlock = '', layout = null) {
  const sectionInstruction = proposalType !== 'single'
    ? getSystemSummarySectionPrompt(sectionDef.type, sectionDef.title, layout)
    : SECTION_PROMPTS[sectionDef.type] || `Write the ${sectionDef.title} section. 2-3 paragraphs.`;

  return [
    // Stage 1 leads: the design story first, then the engineering evidence that
    // supports it, then this section's instruction, with the style contract
    // last so it is the final thing the model reads.
    interpretationBlock,
    '',
    projectContext,
    '',
    '---',
    '',
    `Write the "${sectionDef.title}" section of a professional home cinema design proposal.`,
    '',
    sectionInstruction,
    // A comparison carries its own rule as well as the shared comparison
    // instructions: every difference is explained as what changed, which
    // parameter carries it, what each option's value is, and what that gives the
    // room.
    proposalType === 'comparison'
      ? [COMPARISON_REPORT_INSTRUCTIONS, buildComparisonSectionRule(sectionDef.type)].filter(Boolean).join('\n\n')
      : '',
    '',
    'Format the response as HTML. Use <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em> tags.',
    'Do NOT include the section title — only the body content.',
    'Write in British English.',
    'Do not mention prices.',
    '',
    buildWritingStyleContract(layout),
  ].join('\n');
}