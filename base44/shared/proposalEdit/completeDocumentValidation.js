import { latestValidGeneration } from '../proposalGeneration/proposalGenerationHistory.js';
import { proposalIssueGate, renderableProposalCopy } from './proposalEditHistory.js';
import { contractSectionsOf } from '../proposalWriter/writerContractSchema.js';
import { validateWriterOutput } from '../proposalWriter/writerOutputValidator.js';
import { multiCabinetChannelViolations } from '../proposalWriter/writerMultiCabinetRules.js';
import { validationRegisterPhrase } from '../proposalWriter/writerValidationRegister.js';
import { buildEditedDraft } from './proposalEditCopy.js';
import { composeWriterSectionBodies } from '../proposalWriter/writerSectionMapping.js';
import { proposalEvidenceFingerprint } from '../proposalEvidence/proposalEvidenceBuilder.js';
import { resolveReportLayout } from '../highChannelDensityRule.js';
import { orderPublicationSections } from './publicationOrder.js';
import { preparePublishedSectionBody, missingPublishedContent } from './publishedSectionPreparation.js';

import { containsPrivateNote, publicationText as plain } from './privateNoteAuthority.js';

/** Read-only publication boundary. Historical contracts are never upgraded. */
export function validateCompleteDocument({ proposal, sections = [], generationRecords = [], editRecords = [], optionGuidance = null, privateNotes = [], publishedAssetText = [] }) {
  const errors = [];
  const reject = (code, detail) => errors.push({ code, detail });
  const generation = latestValidGeneration(generationRecords, null);
  const selected = renderableProposalCopy({ generation, edits: editRecords });
  const gate = proposalIssueGate({ generationRecords, editRecords, generationId: generation?.generation_id });
  if (!gate.issuable) reject('copy_not_valid', 'A valid approved generation and valid latest edit are required.');
  const copy = selected.copy || [];
  const input = generation?.gpt_input;
  if (!input) reject('frozen_input_missing', 'The original frozen writing contract is required for issue and export.');
  const frozenGroups = input?.option_guidance?.groups || [];
  const groups = optionGuidance?.groups || [];
  const optionsRequired = frozenGroups.length > 0 || groups.length > 0;
  if (groups.some(group => !frozenGroups.some(frozen => frozen.group === group.group
    && JSON.stringify(frozen.options) === JSON.stringify(group.options)
    && (frozen.note || '') === (group.note || '')))) {
    reject('option_guidance_changed', 'The alternatives have changed since this copy was approved. Create a corrected revision before issue or export.');
  }
  const optionsText = copy.find(entry => entry.section === 'presented_options')?.text?.trim() || '';
  if (optionsRequired && !optionsText) reject('option_copy_missing', 'The alternatives require validated Presented Options copy. Create a corrected revision; the historical proposal remains readable.');
  if (input) {
    const required = contractSectionsOf(input);
    for (const def of required) {
      if (def.section === 'presented_options' && !optionsRequired) continue;
      const entry = copy.find(row => row.section === def.section);
      if (!entry || !entry.text?.trim()) reject('required_section_missing', `Required copy is missing: ${def.section}`);
    }
    // New contracts run the complete claim validator. Historical drafts retain
    // their recorded validation, not today's prose rules.
    if (Number(input.contract_version) >= 2 && copy.length) {
      const validation = validateWriterOutput({ input, output: buildEditedDraft({ generation, editedSections: copy }) });
      errors.push(...(validation.violations || []));
    } else if (generation?.validation_result?.valid !== true) {
      reject('historical_validation_missing', 'The original recorded validation is required.');
    }
    const pack = generation.evidence_pack;
    if (!pack || proposalEvidenceFingerprint(pack) !== generation.evidence_pack_fingerprint
      || proposalEvidenceFingerprint(input.evidence_pack) !== generation.evidence_pack_fingerprint
      || input.evidence_pack?.pack_fingerprint !== generation.evidence_pack_fingerprint) {
      reject('frozen_evidence_mismatch', 'The frozen engineering evidence does not match the generation.');
    }
    const ids = proposal?.selected_version_ids?.length ? proposal.selected_version_ids : [proposal?.version_id].filter(Boolean);
    const evidenceIds = (pack?.options || []).map(option => option.version_id);
    if (JSON.stringify(ids) !== JSON.stringify(evidenceIds)) reject('frozen_version_mismatch', 'The proposal and frozen evidence name different design versions.');
    const snapshot = proposal?.engineering_snapshot;
    if (!snapshot || snapshot.valid === false || snapshot.available === false) reject('engineering_snapshot_missing', 'A frozen engineering snapshot is required.');
    if (snapshot?.identity?.projectId !== proposal.project_id || snapshot?.identity?.versionId !== ids[0]) reject('engineering_snapshot_identity', 'The frozen equipment specification belongs to a different project or version.');
  }
  const notes = [...privateNotes, ...groups.map(group => group.note), ...frozenGroups.map(group => group.note), ...sections.map(section => section.dealer_notes)].filter(Boolean);
  const narrative = [...copy.map(entry => entry.text), ...publishedAssetText,
    ...sections.filter(section => section.is_enabled !== false).flatMap(section => [section.title, section.body])];
  if (narrative.some(text => containsPrivateNote(text, notes))) reject('raw_dealer_notes', 'Private design instructions cannot be published verbatim.');
  const safeOptionsText = containsPrivateNote(optionsText, notes) ? '' : optionsText;
  const mapped = composeWriterSectionBodies({ output: { sections: copy }, mode: input?.proposal_mode || generation?.evidence_pack?.mode });
  const bodyByType = new Map(mapped.bodies.map(body => [body.section_type, body.html]));
  const originalBodies = new Map(composeWriterSectionBodies({ output: generation?.gpt_output, mode: input?.evidence?.proposal_mode || generation?.evidence_pack?.mode }).bodies.map(body => [body.section_type, body.html]));
  const documentSections = sections.map(section => {
    if (!bodyByType.has(section.section_type)) return section;
    const approved = bodyByType.get(section.section_type);
    const original = originalBodies.get(section.section_type);
    if (plain(section.body) !== plain(original) && plain(section.body) !== plain(approved)) {
      reject('unvalidated_document_text', `This section contains wording not approved by the copy validator: ${section.section_type}`);
      return section; // Remain readable for review; never silently replace a manual edit.
    }
    return { ...section, body: approved };
  });
  // Old documents stay readable, but no unvalidated options body is exposed.
  const safeSections = documentSections.map(section => section.section_type === 'presented_options'
    ? { ...section, body: safeOptionsText ? section.body : '', is_enabled: section.is_enabled !== false && Boolean(optionsRequired && safeOptionsText) }
    : { ...section, body: containsPrivateNote(section.body, notes) ? '' : section.body });
  for (const section of safeSections) {
    if (section.is_enabled !== false && section.body?.trim() && !bodyByType.has(section.section_type)) {
      reject('unvalidated_document_text', `This section has no approved writer copy: ${section.section_type}`);
    }
  }
  // ── ONE ordered, prepared publication ────────────────────────────────────
  // The order the client reads this document in is decided from the report type's
  // own section definitions, never from the order the rows happened to be read
  // in: the cover is first, the narrative follows it, Presented Options keeps its
  // place and the Appendix stays last. The bodies are then prepared by the same
  // deterministic rules the browser renders, so the Editor and the PDF publish
  // one prepared content rather than two assemblies of the same records.
  const highChannel = resolveReportLayout(proposal?.engineering_snapshot).highDensity;
  const published = orderPublicationSections({ sections: safeSections, proposalType: proposal?.proposal_type })
    .map((section) => (section.is_enabled === false ? section : {
      ...section,
      body: preparePublishedSectionBody(section.body, {
        title: section.title,
        sectionType: section.section_type,
        highChannel,
        proposalType: proposal?.proposal_type,
      }),
    }));
  for (const body of mapped.bodies) {
    if (!published.some(section => section.section_type === body.section_type && section.is_enabled !== false)) reject('document_section_missing', `Required document section is missing or hidden: ${body.section_type}`);
  }
  // Required validated copy must SURVIVE that preparation. A successful writer
  // response is not enough: the published page is what the client reads, and a
  // validated section whose copy the page has lost is not a publishable document.
  for (const [sectionType, approvedHtml] of bodyByType.entries()) {
    const section = published.find(row => row.section_type === sectionType && row.is_enabled !== false);
    if (!section) continue; // already reported as missing or hidden above
    const missing = missingPublishedContent({
      approvedHtml,
      publishedHtml: section.body,
      title: section.title,
      sectionType,
    });
    if (missing) {
      reject('published_content_missing', `Validated copy is missing from the published ${sectionType} page: "${missing}"`);
    }
  }
  // Validate the very bodies returned to BOTH Editor and PDF, after mapping,
  // ordering, preparation, enablement and private-note filtering, not merely the
  // provider's response.
  const publishedRows = published.filter(section => section.is_enabled !== false)
    .map(section => ({ section: section.section_type, text: plain(section.body) }));
  errors.push(...multiCabinetChannelViolations({ input, sections: publishedRows }));
  if (input?.editorial_rules?.validation_register) {
    for (const row of [...publishedRows, ...publishedAssetText.map(text => ({ section: null, text: plain(text) }))]) {
      const register = validationRegisterPhrase(row.text);
      if (register) errors.push({ code: 'validation_register', section: row.section, detail: register.rule });
    }
  }
  return { valid: errors.length === 0, errors, generation_id: generation?.generation_id || null,
    edit_id: selected.edit_id, options_text: safeOptionsText, options_required: optionsRequired,
    document_sections: published, blocked_reason: errors.length ? (errors[0].detail || 'The complete proposal did not pass its evidence checks.') : null };
}