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
import { normaliseDesignContext } from './writerDesignContext.js';
import { buildEvidenceClassification } from './writerEvidenceClasses.js';
import { normaliseOptionGuidance } from './writerOptionGuidance.js';
import { requiredMultiCabinetChannels } from './writerMultiCabinetRules.js';
import {
  TIMBRE_METRIC_AUTHORITY,
  TIMBRE_METRIC_AUTHORITY_VERSION,
  TIMBRE_METRIC_RULE,
} from './writerTimbreMetricAuthority.js';
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
} from './writerContractSchema.js';
import { applyDesignSummaryBrief } from './designSummaryBrief.js';
import {
  buildNarrativeSteerBlock,
} from './writerNarrativeSteerRules.js';
import {
  CLIENT_NARRATIVE_REGISTER_RULE,
  PROPOSAL_PARAMETER_RESTRAINT_RULE,
} from '../clientNarrativeRegister.js';
import { clientStoryThemeRules } from '../narrativeThemeGrouping.js';

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
    // The experience themes this version's evidence tells: ONE entry per theme,
    // with the results that tell it, the facets of the bass story, the clause each
    // result has earned, the claims to cite and the seats each claim holds for.
    // The writer is given the themes so related results are told as one story.
    client_story_themes: (Array.isArray(option?.client_story_themes) ? option.client_story_themes : [])
      .map((theme) => ({ ...theme })),
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
    // A supporting result carries the exact scope and status the reports state
    // it at, so a draft states the result at that scope and never as a wider or
    // an installed one. Absent for every other claim kind.
    prediction_status: claim?.prediction_status ?? null,
    evidence_state: claim?.evidence_state ?? null,
    authority_source: claim?.authority_source ?? null,
    definition: claim?.definition ?? null,
    rows: Array.isArray(claim?.rows) ? claim.rows.map((row) => ({ ...row })) : [],
    requested_by: claim?.requested_by ?? null,
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
 * What the Presented Options section says where the project states no seating or
 * layout alternatives at all. The section is still returned, so a draft keeps one
 * shape, and it is returned empty: a document with no alternatives carries no
 * options copy.
 */
const NO_OPTION_GUIDANCE_REQUIREMENT =
  'This project states no seating or layout alternatives, so return this section as an empty string and write nothing into it.';

/**
 * Build the versioned writer input from a frozen evidence pack.
 *
 * @param {Object} input
 * @param {Object} input.pack — the frozen proposal evidence pack (Phase 1)
 * @param {string} [input.promptVersion]
 * @param {Object|null} [input.optionGuidance] — the designer's own seating or
 *   layout notes (buildOptionGuidance output). These are INSTRUCTIONS, never
 *   copy: the writer returns its own client-facing prose for them, and no note is
 *   ever printed.
 * @param {Object|null} [input.designContext] — buildWriterDesignContext output:
 *   the verified ADI project interpretation and the designer's editorial brief.
 *   With none, the writer is given the pack alone exactly as before.
 * @param {Object|null} [input.narrativeSteer] — the designer's narrative steer:
 *   the subjects they want weighed (preferred_topics) and the subjects kept out
 *   of the client-facing narrative (excluded_topics). Carried as SOFT PREFERENCES,
 *   never as requirements: a preferred topic is never turned into a section, a
 *   paragraph, a heading or a claim.
 * @returns {Object} the writer input, carrying its own content fingerprint
 */
export function buildWriterInput({
  pack,
  promptVersion = WRITER_PROMPT_VERSION,
  optionGuidance = null,
  designContext = null,
  narrativeSteer = null,
} = {}) {
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
  // The designer's own seating or layout notes are a BRIEF, never copy. They are
  // handed to the writer as instructions, and the Presented Options section is
  // required to carry copy only where they exist.
  const guidance = normaliseOptionGuidance(optionGuidance);
  const guidanceSupplied = guidance.groups.length > 0;
  // The design context: the interpretation the writer is to write FROM, and the
  // designer's brief. Both are carried as instructions and neither is copy.
  const context = normaliseDesignContext(designContext);
  // The sections the writer is given. Where the frozen evidence describes a TV
  // media room, the Design Summary is briefed short and plain by its own
  // authority: the requirement and the limit both come from there, and every
  // other design keeps the contract's own.
  const sections = applyDesignSummaryBrief(
    writerSectionRequirements(mode).map((entry) => (
      entry.section === 'presented_options' && !guidanceSupplied
        ? { ...entry, requirement: NO_OPTION_GUIDANCE_REQUIREMENT }
        : { ...entry }
    )),
    { pack, mode },
  );

  const core = {
    contract_version: WRITER_CONTRACT_VERSION,
    prompt_version: promptVersion,
    output: writerOutputSchema(mode),
    // What the sections are called in THIS proposal, and what each one is
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
    // The frozen pack itself: the writer's only source of facts, carried verbatim.
    evidence_pack: pack,
    // THE DESIGN CONTEXT. The interpretation explains the design; the pack
    // supplies every figure. A refused or missing interpretation is stated as
    // such rather than left blank, so the audit always shows what was read.
    design_interpretation: context.design_interpretation,
    editorial_brief: context.editorial_brief,
    // THE DESIGNER'S NARRATIVE STEER. What this proposal should weigh more
    // heavily, and what it should leave out of the client-facing narrative,
    // carried as SOFT PREFERENCES: subjects, never instructions and never a
    // section plan. A preferred topic adds no claim, forces no paragraph and may
    // legitimately go unwritten where the better story does not need it; the
    // designer's own brief always outranks it. An excluded topic is kept out of
    // the narrative and changes no evidence, no reported result and no table.
    narrative_steer: buildNarrativeSteerBlock(narrativeSteer),
    // THE RP22 PROFESSIONAL DESIGN CONTEXT. Established design principles that
    // apply to this project, carried as context for explaining WHY a decision suits
    // this room. It is never evidence, it states no figure, level or product, it
    // never establishes the reason a configuration was chosen, and the acoustics and
    // treatment rules inside it govern how those subjects may be written about.
    rp22_design_context: context.rp22_design_context,
    // THE DESIGNER'S OWN CLARIFICATION ANSWERS. They are INSTRUCTIONS, never copy:
    // the designer's explanation of a decision the frozen evidence records no reason
    // for, to be woven into the section each answer belongs to. They are never
    // evidence, they change no figure, level, product or claim, and a question the
    // designer passed carries no answer at all.
    clarification_answers: context.clarification_answers,
    // WHAT KIND of statement each part of the pack supports. A design fact is not a
    // result, the designer's intention is not an achievement, and a bass reading the
    // frozen reports do not publish is provisional and supports no positive
    // performance claim.
    evidence_classification: buildEvidenceClassification(pack),
    multi_cabinet_channels: {
      rule: 'Explain each required frozen arrangement naturally once in the System Design Summary or specification: the physical cabinet count, the position and the ONE logical audio channel. In comparisons name the appropriate design; never assign its arrangement to another option. This is a concise design explanation, not an equipment inventory.',
      required: requiredMultiCabinetChannels(pack),
      source: 'evidence_pack.options[].facts.system.front_stage',
    },
    // WHAT P16 AND P17 ACTUALLY MEASURE. The two tonal results are seat-to-seat
    // frequency-response results, one loudspeaker group each, and neither compares
    // one group with another. Carried as the metric authority the copy is written
    // under, so a seat-to-seat figure can never become an inter-speaker match.
    timbre_metric_authority: {
      rule: TIMBRE_METRIC_RULE,
      version: TIMBRE_METRIC_AUTHORITY_VERSION,
      metrics: TIMBRE_METRIC_AUTHORITY.map((entry) => ({ ...entry })),
      source: 'evidence_pack.options[].strength_stories; RP22 P16 and P17',
    },
    // ONE STORY PER EXPERIENCE THEME. Related high-weight results describe one
    // subject the client experiences as a single thing, so they are told as ONE
    // story rather than a paragraph each: the bass is read through output, depth,
    // control and consistency, and its consistency claim is stated only for the
    // seats the result supports. The theme rules are stated here, where the writer
    // reads its contract; each option's own themes travel in
    // evidence.options[].client_story_themes.
    client_story_themes: clientStoryThemeRules(),
    // The assumed-parameter rule the pack was built under, so a draft can be
    // validated against exactly the admission it was written against: with no
    // designer request, P8, P15 and P21 may not be referenced at all.
    assumed_parameter_policy: pack.assumed_parameter_policy || null,
    writing_rules: [...WRITER_WRITING_RULES],
    // The designer's own alternatives, exactly as they stated them. They are an
    // INSTRUCTION, never copy: they are the brief for the Presented Options
    // section, and no note, instruction or filename is ever printed.
    option_guidance: {
      rule: guidanceSupplied
        ? 'these entries are the designer\'s own instructions, never copy: write your own client-facing prose for presented_options from them, and never reproduce a note, an instruction, a filename or a caption in the draft'
        : 'this project states no seating or layout alternatives: return presented_options as an empty string',
      supplied: guidanceSupplied,
      groups: guidance.groups,
    },
    // The writer's own limits, read from the sections it is actually given, so a
    // section briefed with its own limit carries that limit into the validation
    // the returned draft is read against.
    word_limits: Object.fromEntries(sections.map((entry) => [entry.section, entry.word_limit])),
    section_requirements: sections.map((entry) => ({ ...entry, requires_grounding: true })),
    allowed_claims: (Array.isArray(pack.allowed_claims) ? pack.allowed_claims : []).map(allowedClaim),
    blocked_claims: (Array.isArray(pack.blocked_claims) ? pack.blocked_claims : []).map(blockedClaim),
    bass: {
      scope: bass.scope ?? null,
      note: bass.note ?? null,
      allowed: (Array.isArray(bass.allowed) ? bass.allowed : []).map((entry) => ({ ...entry })),
      blocked: (Array.isArray(bass.blocked) ? bass.blocked : []).map((entry) => ({ ...entry })),
    },
    // THE SUPPORTING RESULTS THE BRIEF ASKED FOR. A result the client asked for
    // is stated at its own scope and status, because the client asked for it —
    // and never as a strength, a headline or a comparison.
    supporting_results: {
      rule: 'a claim of kind supporting_result is a frozen result the client brief asked for and the reports state: state it once in the section it belongs to, at exactly the scope, value and prediction status that claim carries, citing its claim ID. It is never presented as a strength, never moved to a wider scope, and never written as an installed or measured outcome. Where an entry in audit.omitted records a request the reports do not state, write nothing for it',
      claims: (Array.isArray(pack.allowed_claims) ? pack.allowed_claims : [])
        .filter((claim) => claim?.kind === 'supporting_result')
        .map((claim) => claim.claim_id),
      audit: pack.supporting_results || null,
    },
    claim_grounding: {
      rule: 'every_client_facing_claim_cites_one_or_more_allowed_claim_ids',
      section_field: 'claim_ids',
      allowed_prefix: ALLOWED_CLAIM_PREFIX,
      blocked_prefix: BLOCKED_CLAIM_PREFIX,
    },
    // The ranked strength authority the writer is handed. Each option carries its
    // own ordered `strength_stories`; each story carries the claim ID it is stated
    // by. The ranking decides which strengths deserve emphasis, never the order of
    // the document: the design story sets the editorial order.
    story_grounding: {
      rule: 'the option\'s strength_stories, in rank order, decide which engineering characteristics deserve emphasis (rank 1 is the strongest); each story is stated by citing its own allowed_claim_ids; never choose which parameters matter; the ranking is not a compulsory order for the document',
      field: 'strength_stories',
      order: 'rank_ascending',
      claim_field: 'allowed_claim_ids',
      omitted_field: 'omitted_stories',
    },
    // The editorial rules of this pass, stated where the writer reads its
    // contract rather than only in the prompt: the register, the comparative ban
    // that follows from the proposal mode, and the installation default.
    editorial_rules: {
      validation_register: 'Client prose states supported benefits, never internal claim-defence, validation, testing or scoring commentary. Retain practical qualifications about listening positions and geometry.',
      experience_first: 'the design and the experience lead and the engineering proof follows: never open a paragraph with a parameter, a level, a channel count or a dB value. No order is imposed beyond that: move naturally between what has been specified, why the approach is appropriate, what it is intended to provide and what the frozen evidence supports, vary that progression from subject to subject, and never give each form of knowledge its own formulaic sentence',
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
      timbre_language: 'tonal continuity is described as a voice or an effect keeping its character as the loudspeakers hand it on: natural handover wording is welcome, and it is the design\'s own tonal aim rather than a match measured between the speaker groups. The tonal results are seat-to-seat frequency-response results, one speaker group each, so they are never written as a screen-to-surround or any other between-group match and their figures are never attached to one: see timbre_metric_authority. Never imply the design\'s loudspeaker package differs from another option\'s unless the pack records that change, and never broaden tonal consistency into equal seats or an equal whole experience',
      brief_completeness: 'a request the brief makes is met only where the copy states it: where the client asked for a result the pack carries as a supporting_result claim, the figure has to be on the page, and where the client asked about both seating rows, both rows are stated on their own result',
      closing: 'no contents sentence such as "the following sections explain", and no generic closing about the design as a whole: finish on what this particular cinema gives the client, and never repeat a benefit another section has already made',
      design_philosophy: 'explain the professional judgement the design_interpretation records: what the client wants to achieve, the prioritised listening positions, the display and seating balance, the constraints, the coverage and bass approaches, the strongest results, the lower results that are conscious trade-offs, and why the finished design suits the brief. Never invent a reason, a priority, a budget or a decision it does not record, and never present the highest available level as the objective regardless of cost. Design Summary explains the complete cinema and the reasoning behind it; Why This Specification carries the strongest expression of professional judgement. Where the interpretation records that the design already takes an improvement without substantial additional expenditure, say what it gives the client, and never write an opportunity as an instruction to change the finished design',
      narrative_register: CLIENT_NARRATIVE_REGISTER_RULE,
      evidence_in_narrative: PROPOSAL_PARAMETER_RESTRAINT_RULE,
      design_philosophy_voice: 'the proposal is written from the perspective of the cinema designer presenting their considered recommendation, and impersonal third-person language is not required. A judgement the interpretation records is written in the design team\'s own voice, using expressions such as "Based on our understanding of the brief" (only where an actual Client Brief is recorded), "Our recommendation is", "We believe this offers the best balance", "We have prioritised", "Our approach has been to" and "For this particular room, we recommend", varied rather than repeated. Every section explains why the recommended solution suits this project rather than describing technical performance alone. No meeting, conversation, client decision or budget constraint is ever invented, and no client instruction the brief does not state is implied. This is proposal-specific and takes precedence over the shared prohibition of the first person for a recommendation; the Technical Report keeps its own style. The engineering facts themselves stay stated as fact, and we is never written where a measured result is the evidence',
    },
  };

  // The same content fingerprint authority the pack uses, so an input and the
  // pack it was built from are identified the same way and can never drift.
  return { ...core, input_fingerprint: proposalEvidenceFingerprint(core) };
}

export default buildWriterInput;