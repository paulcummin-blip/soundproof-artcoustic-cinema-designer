/**
 * writerInputBuilder.js (shared)
 * -------------------------------
 * THE Phase 2 writer input: the one versioned object a proposal writer is given.
 *
 * It carries the frozen evidence pack itself, the nine section requirements and
 * their word limits, the writing rules, the allowed claims with their IDs, the
 * blocked claims, the bass contract, and the grounding rule a returned draft is
 * held to. Nothing is generated here and nothing is calculated: the input is the
 * pack plus the contract, assembled deterministically.
 *
 * The sections are labelled for the proposal mode the pack was built in. A
 * single-option proposal is not a comparison, so it carries no comparison
 * headings: the same two section IDs are labelled Design Overview and Why This
 * Specification, with the requirement each one then holds. Section IDs, order and
 * word limits are identical in both modes, so the returned draft is the same
 * shape either way.
 *
 * The input is deterministic for a given pack — it carries no timestamp of its
 * own — so the same evidence always produces the same input, the same
 * fingerprint, and so a draft can always be traced to exactly what it read.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. No GPT call is made here.
 */

import { proposalEvidenceFingerprint } from '../proposalEvidence/proposalEvidenceBuilder.js';
import {
  ALLOWED_CLAIM_PREFIX,
  BLOCKED_CLAIM_PREFIX,
  WRITER_ACCEPTED_PACK_SCHEMA_VERSION,
  WRITER_CONTRACT_VERSION,
  WRITER_PROMPT_VERSION,
  WRITER_WRITING_RULES,
  isSingleOptionPack,
  writerOutputSchema,
  writerSectionRequirements,
  writerWordLimits,
} from './writerContractSchema.js';

/** One option as the writer may name it: internal identifiers only. */
function optionRef(option) {
  return {
    version_id: option?.version_id ?? null,
    version_name: option?.version_name ?? null,
    label: option?.label ?? null,
    // The ranked strength stories this version supports, exactly as the pack
    // froze them. The writer is GIVEN the ranking and never decides it.
    strength_stories: (Array.isArray(option?.strength_stories) ? option.strength_stories : [])
      .map((story) => ({ ...story })),
    omitted_stories: (Array.isArray(option?.omitted_stories) ? option.omitted_stories : [])
      .map((story) => ({ ...story })),
  };
}

/** One allowed claim, as the writer reads it: the ID and what it may say. */
function allowedClaim(claim) {
  return {
    claim_id: claim?.claim_id ?? null,
    area: claim?.area ?? null,
    label: claim?.label ?? null,
    kind: claim?.kind ?? null,
    statement: claim?.statement ?? null,
    option: claim?.option ? { ...claim.option } : null,
    favours: claim?.favours === true,
    // The seating scope this claim holds at, where it is a scoped result. A
    // draft may make a primary- or secondary-seat claim only where the pack
    // states that scope's own result, and a whole-seat claim may never rest on a
    // narrower one.
    scope: claim?.scope ?? null,
    seat_count: claim?.seat_count ?? null,
    level: claim?.level ?? null,
    wording_class: claim?.wording_class ?? null,
    wording: claim?.wording ?? null,
    authority_fingerprint: claim?.authority_fingerprint ?? null,
    scope_fingerprint: claim?.scope_fingerprint ?? null,
    // The Performance Levels the reports state behind this claim, so a client
    // adjective can be held to the level it is claimed at.
    levels: Array.isArray(claim?.basis?.levels)
      ? claim.basis.levels.map((level) => String(level))
      : [],
  };
}

/** One blocked claim, as the writer reads it: the rule and what it forbids. */
function blockedClaim(block) {
  return {
    block_id: block?.block_id ?? null,
    scope: block?.scope ?? null,
    area: block?.area ?? null,
    reason: block?.reason ?? null,
    prohibited: block?.prohibited ?? null,
  };
}

/**
 * Build the versioned writer input from a frozen evidence pack.
 *
 * @param {Object} input
 * @param {Object} input.pack — the frozen proposal evidence pack (Phase 1)
 * @param {string} [input.promptVersion]
 * @returns {Object} the writer input, carrying its own content fingerprint
 */
export function buildWriterInput({ pack, promptVersion = WRITER_PROMPT_VERSION } = {}) {
  if (!pack || typeof pack !== 'object') {
    throw new Error('A frozen proposal evidence pack is required: the writer is given no other source.');
  }
  if (pack.schema_version !== WRITER_ACCEPTED_PACK_SCHEMA_VERSION) {
    throw new Error(
      `This pack is generation ${pack.schema_version}; the writer contract reads generation ${WRITER_ACCEPTED_PACK_SCHEMA_VERSION}.`,
    );
  }

  const options = (Array.isArray(pack.options) ? pack.options : []).map(optionRef);
  const bass = pack.bass_claims || {};
  // The proposal mode the frozen pack was built in: 'single' or 'comparison'.
  const mode = pack.mode ?? null;
  const single = isSingleOptionPack(mode);
  const sections = writerSectionRequirements(mode);

  const core = {
    contract_version: WRITER_CONTRACT_VERSION,
    prompt_version: promptVersion,
    output: writerOutputSchema(mode),
    // What the nine sections are called in THIS proposal, and what each one is
    // required to say. A single-option proposal is not a comparison, so it
    // carries no comparison headings and compares the design to nothing.
    section_structure: {
      proposal_mode: mode,
      comparison: !single,
      rule: single
        ? 'this is a single-option proposal: it states the design being offered and why it was chosen, and compares the design to nothing'
        : 'this is a comparison proposal: it states what the options share and what changes between them',
      labels: Object.fromEntries(sections.map((entry) => [entry.section, entry.title])),
    },
    evidence: {
      pack_schema_version: pack.schema_version,
      pack_fingerprint: pack.pack_fingerprint ?? null,
      mode,
      options,
      areas: (Array.isArray(pack.areas) ? pack.areas : []).map((entry) => ({ ...entry })),
    },
    // The frozen pack itself: the writer's only source, carried verbatim.
    evidence_pack: pack,
    // The assumed-parameter rule the pack was built under, so a draft can be
    // validated against exactly the admission it was written against: with no
    // designer request, P8, P15 and P21 may not be referenced at all.
    assumed_parameter_policy: pack.assumed_parameter_policy || null,
    writing_rules: [...WRITER_WRITING_RULES],
    word_limits: writerWordLimits(),
    section_requirements: sections.map((entry) => ({ ...entry, requires_grounding: true })),
    allowed_claims: (Array.isArray(pack.allowed_claims) ? pack.allowed_claims : []).map(allowedClaim),
    blocked_claims: (Array.isArray(pack.blocked_claims) ? pack.blocked_claims : []).map(blockedClaim),
    bass: {
      scope: bass.scope ?? null,
      note: bass.note ?? null,
      allowed: (Array.isArray(bass.allowed) ? bass.allowed : []).map((entry) => ({ ...entry })),
      blocked: (Array.isArray(bass.blocked) ? bass.blocked : []).map((entry) => ({ ...entry })),
    },
    claim_grounding: {
      rule: 'every_client_facing_claim_cites_one_or_more_allowed_claim_ids',
      section_field: 'claim_ids',
      allowed_prefix: ALLOWED_CLAIM_PREFIX,
      blocked_prefix: BLOCKED_CLAIM_PREFIX,
    },
    // The ranked strength authority the writer is handed. Each option carries its
    // own ordered `strength_stories`; each story carries the claim ID it is stated
    // by. The writer writes these stories and nothing it decides for itself.
    story_grounding: {
      rule: 'write the option\'s ranked strength_stories in rank order; each story is stated by citing its own allowed_claim_ids; never choose which parameters matter',
      field: 'strength_stories',
      order: 'rank_ascending',
      claim_field: 'allowed_claim_ids',
      omitted_field: 'omitted_stories',
    },
    // The editorial rules of this pass, stated where the writer reads its
    // contract rather than only in the prompt: the register, the comparative ban
    // that follows from the proposal mode, and the installation default.
    editorial_rules: {
      experience_first: 'experience first, then why it matters, then the engineering proof: never open a paragraph with a parameter, a level, a channel count or a dB value',
      display: 'name the display exactly as the frozen evidence names it; where it is a TV write the TV and never a screen size, aspect ratio, viewable width or projector word',
      report_voice: 'never write assessed at, published result, results are derived from, technical evaluation of, engineering model, performance results, stated on its own result or according to the report in main prose; Appendix is concise source attribution only',
      duplication: 'no sentence of ten or more words repeated across sections; no near-verbatim evidence-sentence reuse; a repeated fact must do a different editorial job',
      figures: 'normally use each figure once: benefit-led Highlights, proof in Dynamic Range, experience-led closing without figures',
      tonal_scope: 'all-seat tonal consistency is only tonal character, not whole-experience equality, balanced seats, bass consistency or placement consistency',
      plain_language: 'no raw L1/L2/L3/L4 or RP22 Level language in prose; no (OH), write overhead channels',
      comparative: single
        ? 'single-option proposal: never compare to a baseline or another option (no increase, greater, improved, more capable, additional headroom, higher output, upgrade or compared to)'
        : 'comparison proposal: comparing the options is the point, so state the differences directly',
      installation_default: 'written before installation: specified, selected, designed, modelled or proposed, never installed or installation, unless the frozen evidence says the system is installed',
    },
  };

  // The same content fingerprint authority the pack uses, so an input and the
  // pack it was built from are identified the same way and can never drift.
  return { ...core, input_fingerprint: proposalEvidenceFingerprint(core) };
}

export default buildWriterInput;