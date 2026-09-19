import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

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
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { project_id, version_id, account_id, narrative_goal, proposal_type, selected_version_ids, client_brief, engineering_snapshot } = body;

    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    // ── Load project data ──
    const projects = await base44.entities.Project.filter({ id: project_id });
    const project = projects?.[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // ── Load brand assets ──
    let brandAsset = null;
    const effectiveAccountId = account_id || project.account_id;
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
    // For backward compatibility, version_id = first selected version.
    const legacyVersionId = resolvedVersionIds[0] || null;

    // ── Create Proposal record ──
    const proposal = await base44.entities.Proposal.create({
      project_id,
      account_id: effectiveAccountId,
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
    const sectionRecords = await base44.entities.ProposalSection.bulkCreate(
      SECTIONS.map((s, i) => ({
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
    const projectContext = buildProjectContext(project, narrative_goal, brandAsset, client_brief);

    // ── Generate content for each editable section in parallel ──
    const editableIndices = sectionRecords
      .map((section, index) => ({ section, index }))
      .filter(({ index }) => SECTIONS[index].canEditBody);

    const generationResults = await Promise.allSettled(
      editableIndices.map(({ section }) => {
        const sectionDef = SECTIONS.find((s) => s.type === section.section_type);
        const prompt = buildSectionPrompt(sectionDef, projectContext);
        return base44.integrations.Core.InvokeLLM({ prompt });
      })
    );

    // ── Update sections with generated content ──
    const updatePromises = editableIndices.map(({ section }, i) => {
      const result = generationResults[i];
      if (result.status === 'fulfilled') {
        const html = typeof result.value === 'string' ? result.value : result.value?.content || '';
        return base44.entities.ProposalSection.update(section.id, {
          body: html,
          last_gpt_generated_at: new Date().toISOString(),
        });
      }
      return Promise.resolve();
    });

    await Promise.all(updatePromises);

    // ── Update Proposal status ──
    await base44.entities.Proposal.update(proposal.id, { status: 'generated' });

    return Response.json({ proposal_id: proposal.id, status: 'generated' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function buildProjectContext(project, narrativeGoal, brandAsset, clientBrief) {
  const goalLabel = GOAL_LABELS[narrativeGoal] || 'Luxury Cinema';
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
  const tone = brandAsset?.proposal_tone || 'luxury_residential';
  const briefText = (clientBrief || '').trim();

  return [
    `Narrative Goal: ${goalLabel}`,
    `Tone: ${tone}`,
    `Company: ${companyName}`,
    `Project: ${project.name || ''}`,
    `Client: ${project.client_name || ''}`,
    `Room Dimensions: ${roomWidth}m x ${roomLength}m x ${roomHeight}m`,
    `Screen: ${screenSize}" ${aspectRatio}`,
    `Speaker Configuration: ${dolbyConfig}`,
    speakerInfo ? `Speakers: ${speakerInfo}` : '',
    subInfo ? `Subwoofers: ${subInfo}` : '',
    '',
    '=== CLIENT BRIEF & NARRATIVE FOCUS (guide the narrative emphasis only) ===',
    briefText || 'No specific client brief provided. Use a balanced professional narrative.',
    '',
    '=== CONSTRAINT ===',
    'The Client Brief influences narrative emphasis, wording, and structure ONLY.',
    'It must NEVER alter, contradict, or override any engineering result, RP22 value,',
    'Design Rating, or recommendation. All measured values remain exactly as reported.',
  ].filter(Boolean).join('\n');
}

function buildSectionPrompt(sectionDef, projectContext) {
  const sectionInstruction = SECTION_PROMPTS[sectionDef.type] || `Write the ${sectionDef.title} section. 2-3 paragraphs.`;

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
    'Tone: professional, confident, not overly technical unless the section demands it.',
    'Do not mention prices.',
  ].join('\n');
}