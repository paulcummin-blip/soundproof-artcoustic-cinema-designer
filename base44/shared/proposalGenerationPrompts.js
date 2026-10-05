// Shared live/preview prompt assembly. No storage or SDK access.
import { buildWritingStyleContract } from './reportWritingStyleContract.js';
import { SYSTEM_SUMMARY_SECTIONS, getSystemSummarySectionPrompt, COMPARISON_REPORT_INSTRUCTIONS } from './systemDesignSummarySections.js';
import { buildComparisonSectionRule } from './comparisonStoryRule.js';
import { buildProposalSalesVoice } from './proposalSalesVoice.js';
import { buildEngineeringEvidence } from './engineeringSnapshotEvidence.js';
import { buildExcludedParameterPolicy, buildClientFacingParameterRule } from './clientFacingParameterAuthority.js';

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
export function resolveSections(type) { return type === 'single' ? SECTIONS : SYSTEM_SUMMARY_SECTIONS; }
const GOAL_LABELS = { luxury_cinema: 'Luxury Cinema', family_media_room: 'Family Media Room', reference_performance: 'Reference Performance', best_value: 'Best Value', future_proof: 'Future Proof' };
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
export function buildProjectContext(project, narrativeGoal, brandAsset, clientBrief, engineeringSnapshot, reportType = 'system_summary', reportVersions = [], sourceIdentity = null, versionEvidenceText = '') {
  const goalLabel = GOAL_LABELS[narrativeGoal] || 'Luxury Cinema';
  const evidence = reportType === 'comparison' && versionEvidenceText ? versionEvidenceText : buildEngineeringEvidence(engineeringSnapshot);
  const snapshotRoom = engineeringSnapshot?.room || {};
  const snapshotSystem = engineeringSnapshot?.system || {};
  const legacyRoom = [project.room_width, project.room_length, project.room_height].filter(value => value !== null && value !== undefined && value !== '').join(' × ');
  const roomDimensions = snapshotRoom.dimensions_text || (legacyRoom ? `${legacyRoom} m` : 'Not specified');
  const screenSize = snapshotRoom.size_inches ?? '';
  const aspectRatio = snapshotRoom.aspect_ratio || project.aspect_ratio || '';
  const dolbyConfig = snapshotSystem.channel_layout?.configuration_text || project.dolby_config || '';
  const speakerInfo = Object.entries(project.selected_speakers_by_role || {}).map(([role, model]) => `${role}: ${model}`).join(', ');
  const subwoofers = project.subwooferInstances || [];
  const subInfo = subwoofers.length > 0 ? `${subwoofers.length}x ${subwoofers[0]?.model || 'Subwoofer'}` : '';
  const companyName = brandAsset?.company_name || '';
  const briefText = (clientBrief || '').trim();
  // Assumed and administrative parameters (P8, P15, P21) are excluded from every
  // client-facing section unless the designer explicitly asked for one of them.
  const parameterRule = buildClientFacingParameterRule(buildExcludedParameterPolicy({ clientBrief: briefText }));
  const isComparison = reportType === 'comparison';
  return [
    `Report Type: ${isComparison ? 'System Design Comparison' : 'System Design Summary'}`,
    isComparison && reportVersions.length > 0 ? `Versions compared: ${reportVersions.join(' | ')}` : '',
    isComparison && reportVersions.length > 0 ? `Calculated evidence supplied for every version: ${reportVersions.join(' | ')}` : '',
    `Narrative Goal: ${goalLabel}`, `Company: ${companyName}`, `Project: ${project.name || ''}`, `Client: ${project.client_name || ''}`,
    `Report project id: ${sourceIdentity?.project_id || ''}`, `Report version id: ${sourceIdentity?.version_id || ''}`,
    `Report version: ${sourceIdentity?.version_label || ''}`, `Report fingerprint: ${sourceIdentity?.engineering_fingerprint || ''}`,
    `Reports generated: ${sourceIdentity?.published_at || ''}`,
    ...(!isComparison ? [
      `Room Dimensions: ${roomDimensions}`,
      screenSize ? `Screen: ${screenSize}" ${aspectRatio} (this is the screen for this report: never state, convert or infer another screen size anywhere in the report)` : 'Screen: not stated in this report — never state a screen size',
      `Speaker Configuration: ${dolbyConfig}`, speakerInfo ? `Speakers: ${speakerInfo}` : '', subInfo ? `Subwoofers: ${subInfo}` : '',
    ] : []),
    '', evidence, '', '=== EMPHASIS NOTES / CLIENT BRIEF (narrative focus: guides emphasis only, never the facts) ===',
    briefText || 'No specific emphasis notes provided. Use a balanced professional narrative.', '', '=== CONSTRAINT ===',
    'Use only the supplied report data for project facts.',
    'Never invent, infer, or carry over a project fact — screen size, aspect ratio,',
    'room dimensions, seating, speaker layout, subwoofer layout, RP22 results,',
    'viewing results, SPL capability, bass results, limitations, or recommendations —',
    'from any other project, version, or earlier design.',
    isComparison ? 'Calculated Sound Proof evidence is supplied for every selected version, and the comparison table is calculated for each of them. Every value is predicted or calculated, never measured in the room: describe it as predicted, modelled, calculated, or shown in the Technical Report. Never state a result that is not in that evidence, and never state a difference the table does not show.' : '',
    'The Client Brief influences narrative emphasis, wording, and structure ONLY.',
    'It must NEVER alter, contradict, or override any engineering result, RP22 value,',
    'Design Rating, or recommendation. All supplied values remain exactly as reported.',
    '', parameterRule,
  ].filter(Boolean).join('\n');
}
export function buildSectionPrompt(sectionDef, projectContext, proposalType, interpretationBlock = '', layout = null) {
  const instruction = proposalType !== 'single' ? getSystemSummarySectionPrompt(sectionDef.type, sectionDef.title, layout, proposalType)
    : SECTION_PROMPTS[sectionDef.type] || `Write the ${sectionDef.title} section. 2-3 paragraphs.`;
  return [interpretationBlock, '', projectContext, '', '---', '',
    `Write the "${sectionDef.title}" section of a professional home cinema design proposal.`, '', instruction,
    proposalType === 'comparison' ? [COMPARISON_REPORT_INSTRUCTIONS, buildComparisonSectionRule(sectionDef.type)].filter(Boolean).join('\n\n') : '', '',
    'Format the response as HTML. Use <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em> tags.',
    'Do NOT include the section title — only the body content.', 'Write in British English.', 'Do not mention prices.', '',
    buildWritingStyleContract(layout), buildProposalSalesVoice(sectionDef.type, proposalType),
  ].join('\n');
}