import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const SECTION_TITLES: Record<string, string> = {
  executive_summary: 'Executive Summary',
  design_philosophy: 'Design Philosophy',
  system_overview: 'System Overview',
  room_images: 'Room Images',
  performance: 'Performance',
  products: 'Products',
  comparison: 'Comparison',
  conclusion: 'Conclusion',
  appendix: 'Appendix',
};

const ACTION_INSTRUCTIONS: Record<string, string> = {
  refine: 'Refine the existing content. Improve clarity, flow, and professionalism while incorporating the client brief emphasis. Preserve the structure and all key facts. Do not rewrite from scratch — improve what is already there.',
  rewrite: 'Rewrite the section from scratch using the authoritative project data and client brief. Maintain a professional tone.',
  expand: 'Expand the section with more detail and depth while maintaining factual accuracy.',
  shorten: 'Shorten the section while keeping all key facts and recommendations intact.',
  technical: 'Make the section more technical and engineering-focused, with precise terminology.',
  client_friendly: 'Make the section more accessible and client-friendly, with less jargon.',
};

/**
 * Regenerate a single proposal section.
 *
 * Inputs:
 *  - proposal_id: the Proposal record ID
 *  - section_id: the ProposalSection record ID
 *  - action: regeneration action (refine, rewrite, expand, shorten, technical, client_friendly)
 *  - client_brief: optional updated Client Brief to persist on the Proposal
 *
 * The 'refine' action combines:
 *   1. Current section content (the report)
 *   2. Client Brief & Narrative Focus
 *   3. Dealer Notes for this section
 *   4. Authoritative project data (engineering results, RP22, system spec)
 *
 * CONSTRAINT: The Client Brief influences narrative emphasis, wording, and
 * structure only. It must NEVER alter, contradict, or override any engineering
 * result, RP22 value, Design Rating, or recommendation.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { proposal_id, section_id, action, client_brief } = body;

    if (!proposal_id || !section_id) {
      return Response.json({ error: 'proposal_id and section_id required' }, { status: 400 });
    }

    const resolvedAction = action || 'refine';
    const actionInstruction = ACTION_INSTRUCTIONS[resolvedAction] || ACTION_INSTRUCTIONS.refine;

    // ── Load proposal ──
    const proposals = await base44.entities.Proposal.filter({ id: proposal_id });
    const proposal = proposals?.[0];
    if (!proposal) return Response.json({ error: 'Proposal not found' }, { status: 404 });

    // ── Load section ──
    const sections = await base44.entities.ProposalSection.filter({ id: section_id });
    const section = sections?.[0];
    if (!section) return Response.json({ error: 'Section not found' }, { status: 404 });

    // ── Persist updated client_brief if provided ──
    if (typeof client_brief === 'string' && client_brief !== (proposal.client_brief || '')) {
      await base44.entities.Proposal.update(proposal_id, { client_brief });
    }

    const effectiveBrief = typeof client_brief === 'string' ? client_brief : (proposal.client_brief || '');

    // ── Load project + brand assets ──
    const projects = await base44.entities.Project.filter({ id: proposal.project_id });
    const project = projects?.[0];

    let brandAsset = null;
    if (proposal.account_id) {
      const brandResults = await base44.entities.BrandAsset.filter({ account_id: proposal.account_id });
      brandAsset = brandResults?.[0] || null;
    }

    // ── Build authoritative project context ──
    const projectContext = buildProjectContext(project, brandAsset);

    // ── Build the regeneration prompt ──
    const sectionTitle = SECTION_TITLES[section.section_type] || section.title || 'Section';
    const currentBody = stripHtml(section.body || '');
    const dealerNotes = section.dealer_notes || '';
    const briefText = effectiveBrief.trim();

    const prompt = [
      `You are refining the "${sectionTitle}" section of a professional home cinema design proposal.`,
      '',
      '=== AUTHORITATIVE PROJECT DATA (never alter these results) ===',
      projectContext,
      '',
      '=== CLIENT BRIEF & NARRATIVE FOCUS (guide the narrative emphasis only) ===',
      briefText || 'No specific client brief provided. Use a balanced professional narrative.',
      '',
      '=== DEALER NOTES (internal guidance, not shown to client) ===',
      dealerNotes || 'None.',
      '',
      '=== CURRENT SECTION CONTENT (refine this, do not rewrite from scratch) ===',
      currentBody || '(Section is currently empty — write fresh content.)',
      '',
      '=== INSTRUCTION ===',
      actionInstruction,
      '',
      '=== CONSTRAINT ===',
      'The Client Brief influences narrative emphasis, wording, and structure ONLY.',
      'It must NEVER alter, contradict, or override any engineering result, RP22 value,',
      'Design Rating, or recommendation. All measured values remain exactly as reported',
      'in the authoritative project data. If the client brief mentions a preference that',
      'conflicts with the engineering results, explain the engineering reality honestly',
      'rather than changing the results.',
      '',
      '=== FORMATTING ===',
      'Format the response as HTML. Use <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em> tags.',
      'Do NOT include the section title — only the body content.',
      'Write in British English.',
      'Tone: professional, confident, not overly technical unless the section demands it.',
      'Do not mention prices.',
    ].join('\n');

    // ── Invoke LLM ──
    const llmResult = await base44.integrations.Core.InvokeLLM({ prompt });
    const html = typeof llmResult === 'string' ? llmResult : llmResult?.content || '';

    // ── Update section ──
    await base44.entities.ProposalSection.update(section_id, {
      body: html,
      last_gpt_generated_at: new Date().toISOString(),
    });

    return Response.json({ section_id, status: 'regenerated' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function buildProjectContext(project, brandAsset) {
  if (!project) return 'Project data unavailable.';
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

  return [
    `Company: ${companyName}`,
    `Tone: ${tone}`,
    `Project: ${project.name || ''}`,
    `Client: ${project.client_name || ''}`,
    `Room Dimensions: ${roomWidth}m x ${roomLength}m x ${roomHeight}m`,
    `Screen: ${screenSize}" ${aspectRatio}`,
    `Speaker Configuration: ${dolbyConfig}`,
    speakerInfo ? `Speakers: ${speakerInfo}` : '',
    subInfo ? `Subwoofers: ${subInfo}` : '',
  ].filter(Boolean).join('\n');
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}