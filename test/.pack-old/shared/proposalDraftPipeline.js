// Identical evidence, interpretation, prompts and LLM calls for saved and dry-run drafts.
// Deliberately receives only invokeLLM; it has no entity client or persistence capability.
import { buildSelectedVersionEvidence, formatVersionEvidenceForPrompt } from './comparisonEvidence.js';
import { buildComparisonTable, formatComparisonTableForPrompt, buildComparisonHighlightsPrompt, COMPARISON_HIGHLIGHTS_SCHEMA } from './comparisonTable.js';
import { comparisonSectionMetadata } from './comparisonPersistence.js';
import { buildProjectInterpretation, formatInterpretationForPrompt } from './adiProjectInterpretation.js';
import { compareInterpretations, formatComparisonInterpretationForPrompt } from './adiReportComparison.js';
import { HIGHLIGHTS_SECTION_TYPE } from './systemDesignSummarySections.js';
import { selectHighlightRows, mergeHighlightRows, buildHighlightsPrompt, HIGHLIGHTS_JSON_SCHEMA } from './engineeringSnapshotEvidence.js';
import { buildWritingStyleContract } from './reportWritingStyleContract.js';
import { buildProposalSalesVoice } from './proposalSalesVoice.js';
import { resolveReportLayout } from './highChannelDensityRule.js';
import { buildSectionPrompt } from './proposalGenerationPrompts.js';
import { buildProposalNarrativeEvidenceGuard } from './proposalNarrativeEvidenceGuard.js';
import { sanitizeNarrativeHtml } from './proposalNarrativeSanitizer.js';
import { resolveP17Tradeoff } from './p17TradeoffAuthority.js';
import { buildExcludedParameterPolicy } from './clientFacingParameterAuthority.js';
import {
  buildProductGrounding,
  buildProductVocabularyRule,
  groundProductMentions,
} from './proposalProductGrounding.js';

export function prepareProposalEvidence(suppliedSnapshots, projectVersions, resolvedType) {
  const versionEvidence = buildSelectedVersionEvidence(suppliedSnapshots.map(entry => {
    const versionId = entry?.version_id || entry?.versionId || null;
    const record = projectVersions.find(version => version.id === versionId);
    return { version_id: versionId, version_name: entry?.version_name || record?.version_name || null, snapshot: entry?.snapshot || null };
  }));
  const comparisonTable = resolvedType === 'comparison' ? buildComparisonTable(versionEvidence) : { rows: [], versions: [] };
  const comparisonEvidenceText = resolvedType === 'comparison'
    ? [formatVersionEvidenceForPrompt(versionEvidence), formatComparisonTableForPrompt(comparisonTable)].join('\n\n') : '';
  return { versionEvidence, comparisonTable, comparisonEvidenceText };
}

export function prepareProposalInterpretation({ suppliedSnapshots, project, client_brief, resolvedType, resolvedVersionIds, versionLabelById }) {
  const exactLabels = new Map(suppliedSnapshots.map(entry => [entry.version_id, entry.version_name || entry.snapshot?.version?.name || versionLabelById.get(entry.version_id)]));
  const interpretations = suppliedSnapshots.map(entry => {
    const versionId = entry?.version_id || entry?.versionId || null;
    return { label: entry?.label || exactLabels.get(versionId) || null,
      interpretation: buildProjectInterpretation({ snapshot: entry?.snapshot || null, project, clientBrief: client_brief,
        reportType: resolvedType, versions: resolvedVersionIds.map(id => ({ id, label: exactLabels.get(id) || null })),
        reportLabel: exactLabels.get(versionId) || null }) };
  });
  const primaryInterpretation = interpretations[0]?.interpretation || null;
  const comparisonReading = resolvedType === 'comparison' ? compareInterpretations(interpretations) : null;
  const comparisonBlock = comparisonReading && (comparisonReading.shared.length > 0 || comparisonReading.changes.length > 0)
    ? formatComparisonInterpretationForPrompt(comparisonReading) : '';
  const interpretationBlock = [formatInterpretationForPrompt(primaryInterpretation), comparisonBlock].filter(Boolean).join('\n\n');
  return { primaryInterpretation, comparisonReading, interpretationBlock };
}

export async function generateProposalDraftContent({ invokeLLM, sectionRecords, sectionDefs, resolvedType, engineering_snapshot, comparisonTable, versionEvidence = [], projectContext, interpretationBlock, clientBrief = '', dealerNotes = '' }) {
  // Assumed and administrative parameters (P8, P15, P21) are excluded from every
  // client-facing surface: prompt, comparison table, highlights rows and prose.
  // The designer can lift the exclusion for one of them, explicitly.
  const parameterPolicy = buildExcludedParameterPolicy({ clientBrief, dealerNotes });
  // ── PRODUCT GROUNDING (hard rule) ──
  // A section may name only the products actually selected in the version it is
  // about, and the allowed vocabulary is built from the SAME frozen
  // version-specific authority the At a Glance package table reads. The rule is
  // stated to the writer and then enforced on the returned prose, so a product
  // from another version, a remembered range or a catalogue product that was
  // never chosen cannot reach a client.
  const grounding = buildProductGrounding({
    snapshot: engineering_snapshot,
    resolvedType,
    comparisonTable,
    versionEvidence,
  });
  const productRule = buildProductVocabularyRule(grounding);
  const guard = [
    resolvedType === 'comparison' ? buildProposalNarrativeEvidenceGuard(comparisonTable, versionEvidence, parameterPolicy) : '',
    productRule,
  ].filter(Boolean).join('\n\n');
  const guardedLLM = args => invokeLLM({ ...args, prompt: [args.prompt, guard].filter(Boolean).join('\n\n') });
  // The deterministic pass: an unselected product name is replaced with safe
  // generic wording. A mention that cannot be removed marks the section failed,
  // so it is rejected rather than saved.
  const ground = (html) => groundProductMentions(html, grounding);
  const usesSystemStructure = resolvedType !== 'single';
  const isComparisonReport = resolvedType === 'comparison';
  const p17Tradeoff = isComparisonReport ? resolveP17Tradeoff(comparisonTable) : null;
  const highlightRows = usesSystemStructure && !isComparisonReport ? selectHighlightRows(engineering_snapshot) : [];
  const isComparisonHighlights = section => isComparisonReport && section.section_type === HIGHLIGHTS_SECTION_TYPE && comparisonTable.rows.length > 0;
  const isHighlightsSection = section => isComparisonHighlights(section)
    || (usesSystemStructure && section.section_type === HIGHLIGHTS_SECTION_TYPE && highlightRows.length > 0);
  const reportLayout = resolveReportLayout(engineering_snapshot);
  const editableIndices = sectionRecords.map((section,index) => ({ section,index }))
    .filter(({index}) => sectionDefs[index]?.canEditBody)
    .filter(({section}) => !(usesSystemStructure && section.section_type === 'room_images'));
  const generationResults = await Promise.allSettled(editableIndices.map(({section}) => {
    const sectionDef = sectionDefs.find(s => s.type === section.section_type);
    if (isComparisonHighlights(section)) return guardedLLM({
      prompt: [interpretationBlock, projectContext, buildComparisonHighlightsPrompt(), buildWritingStyleContract(reportLayout), buildProposalSalesVoice(section.section_type,resolvedType)].filter(Boolean).join('\n\n'),
      response_json_schema: COMPARISON_HIGHLIGHTS_SCHEMA,
    });
    if (isHighlightsSection(section)) return guardedLLM({
      prompt: [interpretationBlock, buildHighlightsPrompt(projectContext,highlightRows), buildWritingStyleContract(reportLayout), buildProposalSalesVoice(section.section_type,resolvedType)].filter(Boolean).join('\n\n'),
      response_json_schema: HIGHLIGHTS_JSON_SCHEMA,
    });
    return guardedLLM({ prompt: buildSectionPrompt(sectionDef,projectContext,resolvedType,interpretationBlock,reportLayout) });
  }));
  const generatedContent = editableIndices.map(({section},index) => {
    const result = generationResults[index];
    if (isComparisonHighlights(section)) {
      const payload = result.status === 'fulfilled' ? result.value : null;
      const groundedIntro = ground(sanitizeNarrativeHtml(String(payload?.intro_html || '').trim(), { p17Tradeoff, sectionType: section.section_type, parameterPolicy }));
      return { section, html: groundedIntro.html, metadata: comparisonSectionMetadata(comparisonTable), failed: result.status === 'rejected' || groundedIntro.html.length === 0 || !groundedIntro.grounded };
    }
    if (isHighlightsSection(section)) {
      const payload = result.status === 'fulfilled' ? result.value : null;
      const groundedIntro = ground(sanitizeNarrativeHtml(String(payload?.intro_html || '').trim(), { p17Tradeoff, sectionType: section.section_type, parameterPolicy }));
      const rows = mergeHighlightRows(highlightRows,payload?.rows);
      return { section, html: groundedIntro.html, metadata: {highlight_rows:rows}, failed: result.status === 'rejected' || groundedIntro.html.length === 0 || !groundedIntro.grounded || rows.every(row => !(row.what_the_room_gains || row.what_you_hear)) };
    }
    const raw = result.status === 'fulfilled' ? (typeof result.value === 'string' ? result.value : result.value?.content || '').trim() : '';
    const grounded = ground(sanitizeNarrativeHtml(raw, { p17Tradeoff, sectionType: section.section_type, parameterPolicy }));
    return { section, html: grounded.html, metadata: null, failed: result.status === 'rejected' || grounded.html.length === 0 || !grounded.grounded };
  });
  const failedSections = generatedContent.filter(item => item.failed);
  if (failedSections.length > 0) throw new Error(`Proposal generation failed for ${failedSections.length} section(s). No proposal was saved.`);
  return generatedContent;
}