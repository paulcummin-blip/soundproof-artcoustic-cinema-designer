/**
 * proposalEditFixtures.mjs (test fixture)
 * ----------------------------------------
 * The copies the Phase 4 edit tests save: a tone-only edit that must pass, and
 * the edits that must be blocked — a changed figure for each of P12, P13, P14,
 * P18, P19 and P20, a moved Performance Level, an unselected product, a claim the
 * P20 result does not support, a section stripped of its grounding, a section
 * removed, and a heading the contract does not have.
 *
 * Every copy starts from the compliant draft the Phase 2 fixtures build out of a
 * real frozen pack's own claim wording, so each edit differs from the validated
 * copy in exactly the way the test is about and in no other. No GPT call is made
 * and no entity is written.
 */

import { createEditHistory } from '../../base44/shared/proposalEdit/proposalEditRepository.js';
import { createGenerationHistory } from '../../base44/shared/proposalGeneration/proposalGenerationRepository.js';
import { validDraft } from './proposalWriterFixtures.mjs';
import { attempt, evidenceFor } from './proposalGenerationFixtures.mjs';

export const EDIT_BY = 'designer@example.com';
export const EDIT_AT_FIRST = '2026-10-06T11:00:00.000Z';
export const EDIT_AT_SECOND = '2026-10-06T11:10:00.000Z';
export const EDIT_AT_THIRD = '2026-10-06T11:20:00.000Z';
export const EDIT_AT_FOURTH = '2026-10-06T11:30:00.000Z';

/** The validated draft's sections, as a copy the designer can start editing from. */
export function sectionsOf(input) {
  return validDraft(input).sections.map((entry) => ({ ...entry, claim_ids: [...entry.claim_ids] }));
}

function mapSection(sections, section, change) {
  return sections.map((entry) => (entry.section === section ? { ...entry, ...change(entry) } : entry));
}

/** The copy with one section's text replaced. */
export function withText(input, section, text) {
  return mapSection(sectionsOf(input), section, () => ({ text }));
}

/** The copy with one section carrying an extra sentence. */
export function withSentence(input, section, sentence) {
  return mapSection(sectionsOf(input), section, (entry) => ({ text: `${entry.text} ${sentence}` }));
}

/** The copy with one section removed altogether. */
export function withoutSection(input, section) {
  return sectionsOf(input).filter((entry) => entry.section !== section);
}

/** The copy with one section left carrying no claim IDs at all. */
export function withoutClaimIds(input, section) {
  return mapSection(sectionsOf(input), section, () => ({ claim_ids: [] }));
}

/** The copy with an extra key on a section: a heading the writer contract does not define. */
export function withHeading(input, section, heading) {
  return mapSection(sectionsOf(input), section, () => ({ heading }));
}

const APPENDIX_SHORT = 'Sources: the Visual Report and the Technical Report saved for each option.';

/**
 * A tone-only edit: the pack's own sentences read in the other order, and the
 * appendix shortened and reworded. Every fact, figure, level and product is
 * untouched, and every claim ID is unchanged.
 */
export function toneSections(input) {
  const sections = sectionsOf(input);

  const decision = sections.find((entry) => entry.section === 'decision_summary');
  const sentences = decision.text.split(/(?<=[.!?;])\s+/).filter(Boolean);
  if (sentences.length > 1) decision.text = [...sentences].reverse().join(' ');

  const appendix = sections.find((entry) => entry.section === 'appendix_notes');
  appendix.text = `${APPENDIX_SHORT} Every figure quoted here comes from those reports.`;

  return sections;
}

/** A second, different tone edit: one shortened sentence on the appendix. */
export function shortenedSections(input) {
  return withText(input, 'appendix_notes', APPENDIX_SHORT);
}

/**
 * A figure the reports do not state, for each parameter a client-facing claim is
 * made about. Every value here is one no report in the fixture pack states, so a
 * copy carrying it is a changed parameter value rather than a rephrasing.
 */
export const CHANGED_PARAMETER_SENTENCES = Object.freeze({
  P12: 'P12 now reaches 118 dBC.',
  P13: 'P13 now reaches 102 dBC.',
  P14: 'P14 now reaches 106 dB.',
  P18: 'P18 now extends to 22 Hz.',
  P19: 'P19 now holds +/-1 dB.',
  P20: 'P20 now holds +/-0.5 dB.',
});

/** The copy that states a figure for one parameter that its reports do not state. */
export function changedParameterSections(input, parameter) {
  return withSentence(input, 'key_performance_highlights', CHANGED_PARAMETER_SENTENCES[parameter]);
}

/** The copy that moves one parameter to a Performance Level its reports do not state. */
export function changedLevelSections(input) {
  return withSentence(input, 'key_performance_highlights', 'P13 holds Level 3.');
}

/** The copy that names a product no option in the pack lists. */
export function unselectedProductSections(input) {
  return withSentence(input, 'timbre_matching', 'The system also adds SUB9-99 x 4.');
}

/** The copy that claims the seat-to-seat bass consistency P20 does not support. */
export function blockedClaimSections(input) {
  return withSentence(input, 'overall_design', 'The Level 4 design solves bass consistency across the room.');
}

/* ── The world a Phase 4 test works in ─────────────────────────────────────── */

/**
 * A valid generation, the store that holds it, and an edit history over it. The
 * generation is real: a frozen evidence pack, the GPT input built from it, and a
 * draft that passed the validator.
 */
export function editWorld() {
  const { pack, input } = evidenceFor();
  const generations = createGenerationHistory();
  const generation = generations.append(attempt({ pack }));
  const edits = createEditHistory({ generations: generations.records() });
  return { pack, input, generations, generation, edits };
}

/** Save one manual edit of a generation. */
export function writeEdit(store, generation, sections, at = EDIT_AT_FIRST) {
  return store.appendEdit({
    generationId: generation.generation_id,
    editedSections: sections,
    editedBy: EDIT_BY,
    editedAt: at,
  });
}

/** The rejection codes a record reported. */
export function codesOf(record) {
  return record.validation_errors.map((entry) => entry.code);
}