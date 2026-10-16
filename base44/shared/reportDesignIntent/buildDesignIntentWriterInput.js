/**
 * buildDesignIntentWriterInput.js (shared)
 * ----------------------------------------
 * THE Project Report Design Intent's writer input: the existing Astra writer input
 * with its contract SCOPED to the one section the Design Intent is written as.
 *
 * The full writer input is built first, by the one Phase 2 builder, so the pack,
 * the nine-section contract, the interpretation, the designer's brief, the writing
 * rules, the allowed and blocked claims and the grounding rule all arrive exactly
 * as a proposal's would. Nothing about the writing rules changes here.
 *
 * This module then narrows that input to a single section: the section set, the
 * word limits and the output schema are reduced to the Design Intent, and the
 * scope is stated where the writer reads its contract. The validator already reads
 * the section set from the input the writer was GIVEN, which is why a scoped input
 * validates against exactly the agreement it was issued with and no second
 * authority is needed.
 *
 * The fingerprint is recomputed with the same content authority the builder uses,
 * so a scoped input is identified exactly as the pack it came from is, and a saved
 * narrative can always be traced to the agreement it was written under.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. No GPT call is made here.
 */

import { buildWriterInput } from '../proposalWriter/writerInputBuilder.js';
import { proposalEvidenceFingerprint } from '../proposalEvidence/proposalEvidenceBuilder.js';
import {
  DESIGN_INTENT_SCOPE_RULE,
  DESIGN_INTENT_SECTION,
  DESIGN_INTENT_WORD_LIMIT,
  designIntentSection,
} from './designIntentBrief.js';

/**
 * Build the section-scoped writer input for one Project Report Design Intent.
 *
 * @param {Object} input
 * @param {Object} input.pack — the frozen report evidence pack the writer reads
 * @param {Object|null} [input.designContext] — the verified ADI interpretation and
 *   the designer's recorded intent, carried as instructions and never as copy
 * @param {string} [input.promptVersion]
 * @param {string} [input.reportLabel] — the report identity the scope states
 * @returns {Object} the writer input, carrying its own content fingerprint
 */
export function buildDesignIntentWriterInput({
  pack,
  designContext = null,
  promptVersion = undefined,
  reportLabel = 'Project Report',
} = {}) {
  const full = buildWriterInput({
    pack,
    ...(promptVersion ? { promptVersion } : {}),
    designContext,
  });

  const section = designIntentSection(full.section_requirements);
  const { input_fingerprint: _ignored, ...core } = full;

  const scoped = {
    ...core,
    // The scope, stated where the writer reads its contract: one section, this
    // report's Design Intent, and nothing else in the draft.
    design_intent_scope: {
      report: reportLabel,
      section: DESIGN_INTENT_SECTION,
      rule: DESIGN_INTENT_SCOPE_RULE,
    },
    section_structure: {
      ...(core.section_structure || {}),
      labels: { [DESIGN_INTENT_SECTION]: section.title },
    },
    word_limits: { [DESIGN_INTENT_SECTION]: DESIGN_INTENT_WORD_LIMIT },
    section_requirements: [section],
    output: {
      ...(core.output || {}),
      sections: [{ ...section }],
    },
  };

  return { ...scoped, input_fingerprint: proposalEvidenceFingerprint(scoped) };
}

export default buildDesignIntentWriterInput;