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
import { writerGeometryBlock } from './reportGeometryContext.js';
import { writerVisualBlock } from './reportVisualContext.js';
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
 * @param {Object|null} [input.geometryContext] — the frozen report geometry context
 *   (buildReportGeometryContext output): where the seating actually sits in the room
 *   that produced the saved report and its drawings. It is carried BESIDE the pack,
 *   where the writer reads its design context — never inside the frozen evidence —
 *   and it is omitted entirely when none is supplied, so an input built without one
 *   is unchanged, fingerprint included.
 * @param {Object|null} [input.visualContext] — the frozen report visual context
 *   (buildReportVisualContext output): the Project Library pictures this design is
 *   represented by, chosen by the shared selection authority. It is carried BESIDE
 *   the pack as the writer's one block of visual context, and it is omitted entirely
 *   when none is supplied, so an input built without one is unchanged, fingerprint
 *   included. The pictures themselves are attached to the provider request; this
 *   block states what they are for and what they may never be used for.
 * @returns {Object} the writer input, carrying its own content fingerprint
 */
export function buildDesignIntentWriterInput({
  pack,
  designContext = null,
  promptVersion = undefined,
  reportLabel = 'Project Report',
  geometryContext = null,
  visualContext = null,
} = {}) {
  const full = buildWriterInput({
    pack,
    ...(promptVersion ? { promptVersion } : {}),
    designContext,
  });

  const section = designIntentSection(full.section_requirements);
  const { input_fingerprint: _ignored, ...core } = full;
  // The report's own saved geometry, where the caller holds it. It states no
  // result and no level and it is design context only, but it is the only way the
  // seating decision can be explained in THIS room's own terms: the frozen pack
  // carries the published results, not the seat coordinates behind them.
  const geometryBlock = geometryContext?.available === true ? writerGeometryBlock(geometryContext) : null;
  // THE PROJECT LIBRARY'S OWN PICTURES, where the designer's selection produced a
  // usable set: the one place the writer is told what it is looking at, and what
  // it may never read out of a photograph. Visual context only — it adds no fact,
  // changes no rule, and states no figure, level, product or result.
  const visualBlock = writerVisualBlock(visualContext);

  const scoped = {
    ...core,
    ...(geometryBlock ? { design_geometry_context: geometryBlock } : {}),
    ...(visualBlock ? { design_visual_context: visualBlock } : {}),
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