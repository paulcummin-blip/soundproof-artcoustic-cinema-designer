import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { buildWritingStyleContract, mentionsDesignIndex } from '../../shared/reportWritingStyleContract.js';
import { resolveReportLayout, mentionsHighChannelCopyDefect, HIGH_CHANNEL_CLEANUP_NOTE } from '../../shared/highChannelDensityRule.js';
import { COMPARISON_REPORT_INSTRUCTIONS, resolveSectionTitle } from '../../shared/systemDesignSummarySections.js';
import { buildComparisonSectionRule } from '../../shared/comparisonStoryRule.js';
import { buildProposalSalesVoice } from '../../shared/proposalSalesVoice.js';
import { formatVersionEvidenceForPrompt } from '../../shared/comparisonEvidence.js';
import { formatComparisonTableForPrompt } from '../../shared/comparisonTable.js';
import { buildEngineeringEvidence } from '../../shared/engineeringSnapshotEvidence.js';
import { buildProjectInterpretation, formatInterpretationForPrompt, formatInterpretationForLog } from '../../shared/adiProjectInterpretation.js';

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
  // System Design Summary sections
  system_design_summary: 'System Design Summary',
  spatial_resolution: 'Spatial Resolution',
  dynamic_range: 'Dynamic Range',
  timbre_matching: 'Timbre Matching',
  key_performance_highlights: 'Key Performance Highlights',
  overall_design: 'Overall Design',
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
 * A section written before the Design Index rule existed may still carry the
 * index in its stored copy. Refining that section must remove the mention, not
 * preserve it, so this note is added when the stored copy carries one.
 */
const DESIGN_INDEX_CLEANUP_NOTE = 'The current section content names the Design Index, a design score, a design rating or a percentage. Design Index is an internal designer diagnostic: remove it from the section and make the same point from the design evidence (spatial resolution, dynamic range, timbre matching, the screen and speaker relationship, seating coverage, product choice and reason, or a clearly supported RP22 result). Do not invent a replacement score and do not state a percentage.';

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
    // The same frozen Engineering Snapshot the report was generated from, so a
    // regenerated section can never drift away from the calculated results.
    const evidence = buildEngineeringEvidence(proposal.engineering_snapshot);

    // The layout authority behind the high-channel-density upgrade rule: the
    // snapshot this report was written from wins, and the project's own
    // configuration is only a fallback for a report saved before it existed.
    const snapshotLayout = resolveReportLayout(proposal.engineering_snapshot);
    const reportLayout = snapshotLayout.highDensity
      ? snapshotLayout
      : resolveReportLayout({
        system: {
          channel_layout: { total_discrete: snapshotLayout.channelCount },
          configuration: { dolby_config: snapshotLayout.configuration || project?.dolby_config || null },
        },
      });

    // A comparison regenerates from the SAME frozen per-version evidence and
    // calculated table the report was generated from, so a refined section can
    // never drift to a single version's results.
    const storedVersions = Array.isArray(proposal.metadata?.selected_versions)
      ? proposal.metadata.selected_versions
      : [];
    const comparisonBlock = proposal.proposal_type === 'comparison' && storedVersions.length > 0
      ? [
        formatVersionEvidenceForPrompt(storedVersions),
        formatComparisonTableForPrompt(proposal.metadata?.comparison_table || { rows: [], versions: [] }),
      ].join('\n\n')
      : '';

    // ── Stage 1: the ADI project interpretation ──
    // Reuse the interpretation saved with the report, so a refined section
    // still tells the same design story as the rest of the report. Only when a
    // report predates the two-stage process is it derived now, from the same
    // frozen snapshot.
    const savedInterpretation = proposal.metadata?.project_interpretation || null;
    const interpretation = savedInterpretation
      || buildProjectInterpretation({
        snapshot: proposal.engineering_snapshot,
        reportType: proposal.proposal_type,
        clientBrief: effectiveBrief,
        reportLabel: proposal.title || null,
      });
    const interpretationBlock = formatInterpretationForPrompt(interpretation);
    console.log(`[regenerateProposalSection] ADI stage 1 interpretation | ${formatInterpretationForLog(interpretation)}`);

    // ── Build the regeneration prompt ──
    // A comparison names its own sections (System Options Summary, Key
    // Differences), so a refined section is never written as a single system.
    const sectionTitle = resolveSectionTitle(
      section.section_type,
      SECTION_TITLES[section.section_type] || section.title || 'Section',
      proposal.proposal_type,
    );
    const currentBody = stripHtml(section.body || '');
    const dealerNotes = section.dealer_notes || '';
    const briefText = effectiveBrief.trim();
    // The Key Performance Highlights table is built by Sound Proof from
    // calculated data. Only the introduction is written prose.
    const sectionNote = section.section_type === 'key_performance_highlights'
      ? (proposal.proposal_type === 'comparison'
        ? 'This section introduces a comparison table that Sound Proof calculates from every selected version. Refine the introduction only. Do not write a table, do not restate a value, and do not describe a difference the table does not show.'
        : 'This section introduces a performance table that Sound Proof builds from calculated data. Refine the introduction only. Do not write a table, and do not restate the table values.')
      : '';

    const prompt = [
      // Stage 1 leads: the design story, then the authoritative data.
      interpretationBlock,
      '',
      `You are refining the "${sectionTitle}" section of a professional home cinema design proposal.`,
      '',
      '=== AUTHORITATIVE PROJECT DATA (never alter these results) ===',
      proposal.proposal_type === 'comparison'
        ? `Project: ${project?.name || ''}\nClient: ${project?.client_name || ''}\nCompany: ${brandAsset?.company_name || ''}`
        : projectContext,
      '',
      proposal.proposal_type === 'comparison' ? '' : evidence,
      '',
      comparisonBlock,
      '',
      '=== EMPHASIS NOTES / CLIENT BRIEF (narrative focus: guides emphasis only, never the facts) ===',
      briefText || 'No specific emphasis notes provided. Use a balanced professional narrative.',
      '',
      '=== DEALER NOTES (internal guidance, not shown to client) ===',
      dealerNotes || 'None.',
      '',
      '=== CURRENT SECTION CONTENT (refine this, do not rewrite from scratch) ===',
      currentBody || '(Section is currently empty — write fresh content.)',
      '',
      '=== INSTRUCTION ===',
      actionInstruction,
      sectionNote,
      mentionsDesignIndex(currentBody) ? DESIGN_INDEX_CLEANUP_NOTE : '',
      reportLayout.highDensity && mentionsHighChannelCopyDefect(currentBody) ? HIGH_CHANNEL_CLEANUP_NOTE : '',
      proposal.proposal_type === 'comparison'
        ? [COMPARISON_REPORT_INSTRUCTIONS, buildComparisonSectionRule(section.section_type)].filter(Boolean).join('\n\n')
        : '',
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
      'Do not mention prices.',
      '',
      buildWritingStyleContract(reportLayout),
      buildProposalSalesVoice(section.section_type, proposal.proposal_type),
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

  return [
    `Company: ${companyName}`,
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