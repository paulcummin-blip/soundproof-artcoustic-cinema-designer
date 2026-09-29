import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { buildWritingStyleContract } from '../../shared/reportWritingStyleContract.js';
import { SYSTEM_SUMMARY_SECTIONS, HIGHLIGHTS_SECTION_TYPE, getSystemSummarySectionPrompt } from '../../shared/systemDesignSummarySections.js';
import { buildEngineeringEvidence, selectHighlightRows, mergeHighlightRows, buildHighlightsPrompt, HIGHLIGHTS_JSON_SCHEMA } from '../../shared/engineeringSnapshotEvidence.js';

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
 * A System Design Summary is a client-facing sales summary of the system
 * design, built around the three core RP22 design structures. It is not a
 * general proposal document, so it never uses the proposal section set.
 */
function resolveSections(proposalType) {
  return proposalType === 'system_summary' ? SYSTEM_SUMMARY_SECTIONS : SECTIONS;
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
    const { request_id, project_id, version_id, account_id, narrative_goal, proposal_type, selected_version_ids, client_brief, engineering_snapshot } = body;

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
      ? resolvedVersionIds.length >= 2
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
      // Stage 2A: store the frozen Engineering Snapshot assembled by the frontend.
      // The snapshot is frozen at generation time — later Room Designer edits do
      // NOT silently change an existing proposal. The AI does NOT consume this
      // snapshot yet (Stage 2A proves the snapshot itself first).
      engineering_snapshot: engineering_snapshot || null,
    });

    // ── Create 10 ProposalSection records ──
    const sectionDefs = resolveSections(resolvedType);
    sectionRecords = await base44.entities.ProposalSection.bulkCreate(
      sectionDefs.map((s, i) => ({
        proposal_id: proposal.id,
        account_id: effectiveAccountId,
        section_type: s.type,
        section_key: s.key,
        title: s.title,
        body: '',
        dealer_notes: '',
        order_index: i,
        is_enabled: true,
        locked: false,
      }))
    );

    // ── Build project context for GPT ──
    const projectContext = buildProjectContext(project, narrative_goal, brandAsset, client_brief, engineering_snapshot);

    // ── Key Performance Highlights rows ──
    // Read straight out of the frozen Engineering Snapshot. The AI writes the
    // "What you hear" cells only; it never sets or changes a Result value, and
    // it never chooses which rows appear.
    const highlightRows = resolvedType === 'system_summary' ? selectHighlightRows(engineering_snapshot) : [];
    const isHighlightsSection = (section) => resolvedType === 'system_summary'
      && section.section_type === HIGHLIGHTS_SECTION_TYPE
      && highlightRows.length > 0;

    // ── Generate content for each editable section in parallel ──
    const editableIndices = sectionRecords
      .map((section, index) => ({ section, index }))
      .filter(({ index }) => sectionDefs[index]?.canEditBody);

    const generationResults = await Promise.allSettled(
      editableIndices.map(({ section }) => {
        const sectionDef = sectionDefs.find((s) => s.type === section.section_type);
        if (isHighlightsSection(section)) {
          return base44.integrations.Core.InvokeLLM({
            prompt: `${buildHighlightsPrompt(projectContext, highlightRows)}\n\n${buildWritingStyleContract()}`,
            response_json_schema: HIGHLIGHTS_JSON_SCHEMA,
          });
        }
        return base44.integrations.Core.InvokeLLM({
          prompt: buildSectionPrompt(sectionDef, projectContext, resolvedType),
        });
      })
    );

    const generatedContent = editableIndices.map(({ section }, index) => {
      const result = generationResults[index];

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
            || rows.every((row) => !row.what_you_hear),
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

function buildProjectContext(project, narrativeGoal, brandAsset, clientBrief, engineeringSnapshot) {
  const goalLabel = GOAL_LABELS[narrativeGoal] || 'Luxury Cinema';
  const evidence = buildEngineeringEvidence(engineeringSnapshot);
  const roomWidth = project.room_width || '';
  const roomLength = project.room_length || '';
  const roomHeight = project.room_height || '';
  const screenSize = project.screen_size || '';
  const aspectRatio = project.aspect_ratio || '';
  const dolbyConfig = project.dolby_config || '';
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

  return [
    `Narrative Goal: ${goalLabel}`,
    `Company: ${companyName}`,
    `Project: ${project.name || ''}`,
    `Client: ${project.client_name || ''}`,
    `Room Dimensions: ${roomWidth}m x ${roomLength}m x ${roomHeight}m`,
    `Screen: ${screenSize}" ${aspectRatio}`,
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
    'The Client Brief influences narrative emphasis, wording, and structure ONLY.',
    'It must NEVER alter, contradict, or override any engineering result, RP22 value,',
    'Design Rating, or recommendation. All measured values remain exactly as reported.',
  ].filter(Boolean).join('\n');
}

function buildSectionPrompt(sectionDef, projectContext, proposalType) {
  const sectionInstruction = proposalType === 'system_summary'
    ? getSystemSummarySectionPrompt(sectionDef.type, sectionDef.title)
    : SECTION_PROMPTS[sectionDef.type] || `Write the ${sectionDef.title} section. 2-3 paragraphs.`;

  return [
    projectContext,
    '',
    '---',
    '',
    `You are writing the "${sectionDef.title}" section of a professional home cinema design proposal.`,
    '',
    sectionInstruction,
    '',
    'Format the response as HTML. Use <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em> tags.',
    'Do NOT include the section title — only the body content.',
    'Write in British English.',
    'Do not mention prices.',
    '',
    buildWritingStyleContract(),
  ].join('\n');
}