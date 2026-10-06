/**
 * proposalEditCopy.js (shared)
 * -----------------------------
 * THE Phase 4 copy layer: the copy an edit starts from, the copy it produces,
 * and the copy a revert restores.
 *
 * An edited copy is validated by the Phase 2 writer validator, unchanged, against
 * the frozen GPT input of the generation it edits. That is the entire point of
 * this module: an edit is held to exactly the same contract the GPT draft was —
 * the same evidence pack, the same allowed and blocked claims, the same figures,
 * levels and products, the same word limits — so an edit may change wording and
 * tone but can never change a fact, and no second rule set exists to drift from
 * the first one.
 *
 * Two things are taken from the frozen generation and never from the caller: the
 * contract version and the pack fingerprint. A copy cannot even claim to belong
 * to another contract or another evidence pack, because the caller never supplies
 * them.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. No GPT call is made here.
 */

import { jsonClone } from '../proposalGeneration/proposalGenerationRecord.js';
import { violation } from '../proposalWriter/writerContractSchema.js';
import { validateWriterOutput } from '../proposalWriter/writerOutputValidator.js';
import { EDIT_RULE_REJECTION } from './editStatuses.js';

/**
 * The copy a valid generation produced: the sections of its frozen GPT output,
 * byte for byte. Null when there is no validated output to start from.
 */
export function generatedCopy(generation) {
  const output = generation?.gpt_output ?? null;
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null;
  if (!Array.isArray(output.sections) || output.sections.length === 0) return null;
  return jsonClone(output.sections);
}

/** The copy an edit record holds. Null when the record holds no section list. */
export function editCopy(edit) {
  if (!edit || !Array.isArray(edit.edited_sections)) return null;
  return jsonClone(edit.edited_sections);
}

/**
 * The draft an edited copy is validated as: the edited sections, under the
 * contract version and the pack fingerprint of the frozen generation. The caller
 * supplies the sections and nothing else.
 */
export function buildEditedDraft({ generation = null, editedSections = null } = {}) {
  const input = generation?.gpt_input ?? null;
  if (!input || typeof input !== 'object') {
    throw new Error(
      'An edited copy is read against the frozen GPT input of the generation it edits: without it there is no contract to hold the edit to.',
    );
  }

  return {
    contract_version: input.contract_version ?? null,
    pack_fingerprint: input?.evidence_pack?.pack_fingerprint ?? null,
    sections: Array.isArray(editedSections) ? jsonClone(editedSections) : editedSections,
  };
}

/**
 * The claim IDs an edited copy has dropped from a section the copy it started
 * from grounded. An edit may re-point grounding, but the evidence-backed meaning
 * of the generated copy is not the designer's to remove.
 */
export function groundingRemovals({ generation = null, editedSections = null } = {}) {
  const base = new Map(
    (generatedCopy(generation) || []).map((entry) => [
      entry?.section,
      new Set(Array.isArray(entry?.claim_ids) ? entry.claim_ids : []),
    ]),
  );

  const found = [];
  for (const entry of Array.isArray(editedSections) ? editedSections : []) {
    const section = typeof entry?.section === 'string' ? entry.section : null;
    const cited = new Set(Array.isArray(entry?.claim_ids) ? entry.claim_ids : []);
    for (const claimId of base.get(section) || []) {
      if (cited.has(claimId)) continue;
      found.push(violation(EDIT_RULE_REJECTION.GROUNDING_REMOVED, {
        section,
        detail: `claim_id_removed_from_the_copy:${claimId}`,
        claim_ids: [claimId],
      }));
    }
  }
  return found;
}

/**
 * Validate an edited copy exactly as the GPT draft was validated, and add the one
 * rule the edit layer holds of its own: grounding is never removed. The rule can
 * only add a rejection — the writer rules are the validator's, unchanged, and are
 * reported with their own codes.
 *
 * @param {Object} input
 * @param {Object} input.generation — the frozen generation record the edit edits
 * @param {Array<Object>} input.editedSections — the designer's copy
 * @returns {Object} a validateWriterOutput result, plus any edit-layer rejection
 */
export function validateEditedCopy({ generation = null, editedSections = null } = {}) {
  const result = validateWriterOutput({
    input: generation?.gpt_input ?? null,
    output: buildEditedDraft({ generation, editedSections }),
  });

  const removed = groundingRemovals({ generation, editedSections });
  if (removed.length === 0) return result;

  return { ...result, valid: false, violations: [...result.violations, ...removed] };
}