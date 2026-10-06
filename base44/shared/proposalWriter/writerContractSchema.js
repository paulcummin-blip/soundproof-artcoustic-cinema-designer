/**
 * writerContractSchema.js (shared)
 * ---------------------------------
 * THE PHASE 2 WRITER CONTRACT.
 *
 * A proposal writer is given the frozen proposal evidence pack (Phase 1) and
 * this contract, and nothing else. The contract is versioned, so a draft can
 * always be traced to the exact agreement it was written against. It names:
 *
 *   - the nine sections a draft must return, and the word limit each one holds;
 *   - the writing rules the writer is held to;
 *   - the exact JSON shape returned, and the claim-ID grounding rule;
 *   - every reason a returned draft is rejected.
 *
 * Nothing here writes prose and nothing here calculates. It is the vocabulary of
 * the agreement, and it is deliberately small enough to read in one sitting.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The contract generation. A draft is only read against the revision it cites. */
export const WRITER_CONTRACT_VERSION = 1;

/**
 * The writer prompt generation this contract is issued with.
 *
 * Bumped to 2 when the writing authority gained the proposal sales authority and
 * the authority began to be carried as one block, and to 3 when the pack began
 * to carry scoped seat-group claims and the writer gained the rule that governs
 * them. A generation before and after either change must stay distinguishable in
 * the append-only audit history, so every new record stores this version. A
 * historical record keeps the version it was filed under and is never rewritten.
 *
 * The contract version is deliberately NOT bumped: the sections, the word
 * limits, the claim grounding rule and every rejection category are unchanged,
 * so a draft filed under generation 1 is still read against the same agreement.
 */
export const WRITER_PROMPT_VERSION = 'proposal-writer-prompt-3';

/** The only pack generation a draft may be written from. */
export const WRITER_ACCEPTED_PACK_SCHEMA_VERSION = 2;

/** The output is structured JSON. Nothing else is accepted. */
export const WRITER_OUTPUT_MODE = 'json_only';
export const WRITER_OUTPUT_SCHEMA_VERSION = 1;

/** The exact top-level keys of a returned draft. */
export const WRITER_OUTPUT_KEYS = Object.freeze(['contract_version', 'pack_fingerprint', 'sections']);

/** The exact keys of each returned section. */
export const WRITER_OUTPUT_SECTION_KEYS = Object.freeze(['section', 'text', 'claim_ids']);

/** The two ID prefixes a citation may carry: allowed claims, and blocked claims. */
export const ALLOWED_CLAIM_PREFIX = 'claim_';
export const BLOCKED_CLAIM_PREFIX = 'block_';

/**
 * Every reason a returned draft is rejected. A validator reports these codes and
 * nothing else, so a rejection is always machine-readable and never a matter of
 * opinion.
 */
export const WRITER_REJECTION = Object.freeze({
  /** The draft is not the JSON object this contract defines. */
  SCHEMA_VIOLATION: 'schema_violation',
  /** A cited claim ID is not one of the pack's allowed claims. */
  UNSUPPORTED_CLAIM: 'unsupported_claim',
  /** A cited claim ID is one of the pack's blocked claims. */
  BLOCKED_CLAIM: 'blocked_claim',
  /** A client-facing claim carries no claim ID at all. */
  MISSING_CLAIM_ID: 'missing_claim_id',
  /** A claim is asserted that the cited claims do not support. */
  INVENTED_BENEFIT: 'invented_benefit',
  /** A figure the pack does not state. */
  CHANGED_PARAMETER_VALUE: 'changed_parameter_value',
  /** A Performance Level the pack does not state for that parameter. */
  CHANGED_LEVEL: 'changed_level',
  /** A product the pack does not list for any option. */
  UNSELECTED_PRODUCT: 'unselected_product',
  /** A product belonging to the other option, presented as this one's. */
  EXTRA_PRODUCT: 'extra_product',
  /** A recommendation the pack does not allow. */
  UNSUPPORTED_RECOMMENDATION: 'unsupported_recommendation',
  /** An improvement claimed in an area the pack blocks as unchanged. */
  UNSUPPORTED_IMPROVEMENT: 'unsupported_improvement',
  /** A seat-to-seat bass consistency claim the P20 result does not support. */
  P20_BASS_CONTRADICTION: 'p20_bass_contradiction',
  /** A seat-group claim at a scope, or at a level, the pack does not state. */
  SCOPE_MISMATCH: 'scope_mismatch',
  /** A section over its word limit. */
  SECTION_TOO_LONG: 'section_too_long',
});

/**
 * The nine sections of a draft, in the order a pack presents them. Each carries
 * its own word limit and the one requirement that section exists to meet.
 */
export const WRITER_SECTIONS = Object.freeze([
  {
    section: 'decision_summary',
    title: 'Decision Summary',
    word_limit: 140,
    requirement: 'State the decision between the options in the pack\'s own framing, and only where the pack allows a framing.',
  },
  {
    section: 'what_stays_same',
    title: 'What Stays the Same',
    word_limit: 130,
    requirement: 'State only what every option shares, from the shared-result claims the pack allows.',
  },
  {
    section: 'what_changes',
    title: 'What Changes',
    word_limit: 180,
    requirement: 'State only the differences the pack records, and call one a gain only where the pack allows a gain.',
  },
  {
    section: 'key_performance_highlights',
    title: 'Key Performance Highlights',
    word_limit: 170,
    requirement: 'State the pack\'s recorded results, in the pack\'s own words, for the areas that carry a claim.',
  },
  {
    section: 'spatial_resolution',
    title: 'Spatial Resolution',
    word_limit: 170,
    requirement: 'Explain what the spatial results mean for the seating, within the claims the pack allows.',
  },
  {
    section: 'dynamic_range',
    title: 'Dynamic Range',
    word_limit: 170,
    requirement: 'Explain the dynamic-range results the pack records, and present no other.',
  },
  {
    section: 'timbre_matching',
    title: 'Timbre Matching',
    word_limit: 150,
    requirement: 'Explain the loudspeaker and coverage evidence the pack records, and claim nothing beyond it.',
  },
  {
    section: 'overall_design',
    title: 'Overall Design',
    word_limit: 190,
    requirement: 'Close on the design as a whole, using only the credibility and recommendation claims the pack allows.',
  },
  {
    section: 'appendix_notes',
    title: 'Appendix Notes',
    word_limit: 200,
    requirement: 'Note the report evidence the pack was built from, with no performance claim.',
  },
]);

/** The section IDs, in order. */
export const WRITER_SECTION_IDS = Object.freeze(WRITER_SECTIONS.map((entry) => entry.section));

/** The word limit of every section, keyed by section ID. */
export function writerWordLimits() {
  return Object.fromEntries(WRITER_SECTIONS.map((entry) => [entry.section, entry.word_limit]));
}

/**
 * The section requirements the writer reads: the same sections, each with the
 * grounding rule attached, so a section can never be written without knowing
 * that every claim in it must cite a claim ID.
 */
export function writerSectionRequirements() {
  return WRITER_SECTIONS.map((entry) => ({ ...entry, requires_grounding: true }));
}

/** One section definition, or null. */
export function writerSection(sectionId) {
  return WRITER_SECTIONS.find((entry) => entry.section === sectionId) || null;
}

/**
 * The output schema as the writer is given it: JSON only, these top-level keys,
 * these per-section keys, and these nine sections. There is no other shape.
 */
export function writerOutputSchema() {
  return {
    mode: WRITER_OUTPUT_MODE,
    schema_version: WRITER_OUTPUT_SCHEMA_VERSION,
    top_level_keys: [...WRITER_OUTPUT_KEYS],
    section_keys: [...WRITER_OUTPUT_SECTION_KEYS],
    claim_id_prefixes: [ALLOWED_CLAIM_PREFIX, BLOCKED_CLAIM_PREFIX],
    grounding_rule: 'every client-facing claim must cite one or more allowed claim IDs in that section\'s claim_ids',
    sections: WRITER_SECTIONS.map((entry) => ({ ...entry })),
  };
}

/**
 * The writing rules. Short, imperative and checkable: each one is either held by
 * a validation rule or by the pack the writer was given. The voice itself comes
 * from the shared Sound Proof writing authority, which the prompt carries
 * alongside these rules rather than duplicated here.
 */
export const WRITER_WRITING_RULES = Object.freeze([
  'Write only from the evidence pack. It is the sole source of every fact, figure, level and claim.',
  'Every client-facing claim must cite one or more allowed claim IDs in that section\'s claim_ids.',
  'Copy every figure, Performance Level and product name exactly as the pack states it. Never round, convert, restate or estimate.',
  'Never name a product the pack does not list for the option it belongs to.',
  'Never present a claim the pack blocks, and never describe a shared result as a change or a gain.',
  'Never recommend changing the design, and never describe the proposal as an upgrade path.',
  'Where P20 does not support seat-to-seat bass consistency, describe bass only as output authority, physical capability and the subwoofer specification.',
  'State a primary-seat or a secondary-seat result only where the pack states that scope\'s own claim, word it for that scope alone, and never present it as a result for the seating area or the room.',
  'Write to the client: benefit-led, dealer-safe language, with no internal parameter codes and no engineering jargon.',
  'Keep every paragraph to one to three sentences, and keep every section inside its word limit.',
  'Explain what each recorded result means for the room, rather than naming the number and moving on.',
  'Return structured JSON only, in the nine sections of this contract, with no extra fields and no commentary.',
]);

/** A rejection, in the one shape every rule reports. */
export function violation(code, { section = null, detail = null, claim_ids = [] } = {}) {
  return {
    code,
    section,
    detail,
    claim_ids: Array.isArray(claim_ids) ? claim_ids : [],
  };
}