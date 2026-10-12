/**
 * designPhilosophyAuthority.js (shared)
 * -------------------------------------
 * THE SOUND PROOF DESIGN PHILOSOPHY: the professional judgement behind a
 * recommendation.
 *
 * Sound Proof explains not only what has been designed, but why that solution is
 * the right one for this project. This module is the ONE statement of that
 * judgement, shared by the two places it has to reach:
 *
 *   - Stage 1, the ADI project interpretation, which records the reasoning it
 *     derives from the project (`adiProjectInterpretation.js` formats it into the
 *     interpretation prompt block through the helpers below);
 *   - the proposal writer's editorial instructions, which turn that reasoning
 *     into client-facing copy (`buildProposalWritingAuthority` composition in
 *     `writerPromptBuilder.js` carries SOUND_PROOF_DESIGN_PHILOSOPHY).
 *
 * WHAT IT IS NOT. It is not an engineering authority and not a validation rule.
 * It changes no calculation, no RP22 or RP23 result, no claim and no rejection:
 * the frozen engineering evidence remains the sole authority for every figure,
 * level, product and claim, and the existing validation rules are untouched. This
 * module governs the reasoning a writer is allowed to put around that evidence.
 *
 * Pure: no React, no SDK, no runtime-specific APIs, no timestamps.
 */

/** The philosophy generation, recorded with any interpretation that carries it. */
export const DESIGN_PHILOSOPHY_VERSION = '1.0';

/**
 * THE CORE PRINCIPLE, in one sentence. Used wherever the philosophy is stated
 * compactly, and by the Stage 1 interpretation.
 */
export const DESIGN_PHILOSOPHY_PRINCIPLE =
  'The best cinema is not necessarily the cinema with the highest possible scores: '
  + 'the best design is the one that most effectively satisfies the client brief while balancing '
  + 'performance, practicality, aesthetics and cost.';

/**
 * The three reasons a design may legitimately sit below the highest available
 * level. Each is a design decision, not necessarily a failure.
 */
export const LEGITIMATE_LOWER_RESULT_REASONS = Object.freeze(['Practicality', 'Aesthetics', 'Price']);

/**
 * The value-engineering families: the placement, seating and architecture
 * decisions that can sometimes be improved without substantial additional
 * expenditure. Each is an OPPORTUNITY to investigate, never a promise of a free
 * improvement, and never an instruction to change a finished design.
 *
 * An entry marked `administrative` is an assumed or administrative check: it is
 * never written as a result or a differentiator, so it is recorded for the
 * internal log only and is never handed to a writer as an opportunity.
 */
export const VALUE_ENGINEERING_PARAMETERS = Object.freeze([
  { parameter_id: 1, label: 'Seating distance from the room boundaries' },
  { parameter_id: 3, label: 'Loudspeaker positions against the recommended positions' },
  { parameter_id: 7, label: 'Front-wide positioning' },
  { parameter_id: 8, label: 'Design geometry', administrative: true },
  { parameter_id: 11, label: 'Placement geometry' },
  { parameter_id: 2, label: 'Channel count within the available processing capacity' },
]);

/**
 * What is never established by the project data, and therefore never asserted.
 * Stated plainly so a writer knows these are absent rather than merely unknown.
 */
export const DESIGN_PHILOSOPHY_NOT_ESTABLISHED = Object.freeze([
  'the client budget',
  'any conversation, meeting, site visit or instruction the brief does not state',
  'a reason behind a loudspeaker position or a seating position the interpretation does not explain',
  'a comparison against a design that was never assessed',
]);

/**
 * The rules that govern the reasoning in client-facing copy. Each one is a
 * discipline on the writing, never a new claim: the frozen evidence still governs
 * every fact.
 */
export const DESIGN_PHILOSOPHY_RULES = Object.freeze([
  DESIGN_PHILOSOPHY_PRINCIPLE,
  'a result below the highest available level is a legitimate design decision where practicality, '
    + 'aesthetics or price explains it: state the result and what it means for this room rather than '
    + 'presenting the highest available level as the objective regardless of cost or practical consequence',
  'every reason the copy gives must come from the design decisions, constraints, priorities and results '
    + 'the interpretation records: never invent a client conversation, a budget, a constraint, a priority '
    + 'or a design decision, and never invent the reason behind a loudspeaker or a seating position',
  'where a lower result is stated and the interpretation records no reason for it, state the result and '
    + 'write no reason',
  'value-engineering opportunities are internal reasoning: they are never written as an instruction to '
    + 'change the design, never as an upgrade path, and never as a promise of a free improvement',
  'a more expensive solution is never presented as better value on price alone',
  'the frozen engineering evidence stays authoritative: never infer that a design change improved a '
    + 'parameter unless the assessment supports it, and never imply every seat performs identically',
  'a structure recorded at the lowest passing level is this project\'s leading structure, not a strong '
    + 'result: state the level it reached and claim no tonal, spatial or dynamic benefit beyond the result '
    + 'itself, and never present a relative rank as a strength',
]);

/**
 * THE DESIGN PHILOSOPHY, as the proposal writer (GPT-6 Astra) reads it. One block,
 * carried whole in the writer prompt.
 */
export const SOUND_PROOF_DESIGN_PHILOSOPHY = [
  '=== THE SOUND PROOF DESIGN PHILOSOPHY (the judgement behind the recommendation) ===',
  '',
  'Sound Proof explains not only what has been designed, but the professional judgement behind the recommended solution.',
  '',
  'THE CORE PRINCIPLE',
  DESIGN_PHILOSOPHY_PRINCIPLE,
  'A design that sits below the highest available level is not automatically a failure. Practicality, aesthetics and price are three legitimate reasons for a design decision, and each of them is a considered choice.',
  'Never present the highest available level as the objective regardless of cost or practical consequence, and never treat a more expensive solution as better value on price alone.',
  '',
  'THE JUDGEMENT THE COPY EXPLAINS',
  'Where the interpretation records it, the copy explains: what the client wants to achieve; which listening positions are prioritised; how the display and the seating have been balanced; the practical constraints of the room; how loudspeaker coverage was considered; the bass approach; which results are strongest; which lower results are conscious trade-offs; and why the finished design is appropriate to this brief.',
  'Every one of those statements comes from the interpretation and the frozen evidence. Never invent a client conversation, a budget, a constraint, a priority or a decision, and never invent the reason behind a loudspeaker or a seating position the interpretation does not explain.',
  'Where the evidence does not establish why a result sits where it does, state the result and stop. An invented reason is a false claim, and the validator refuses it.',
  '',
  'DESIGN SUMMARY',
  'The Design Summary explains the complete cinema and the reasoning behind the recommendation: the room and its intended use, the display and the seating, the architecture of the system, and why this combination suits this project.',
  '',
  'WHY THIS SPECIFICATION',
  'Why This Specification carries the strongest expression of professional judgement in the document. It explains why this solution suits the room, how the competing priorities were balanced, which decisions carry the most value, why a compromise is reasonable where the interpretation records one, and what the client gains from the finished design. It reads as a considered recommendation from an experienced cinema designer, never as a list of products.',
  '',
  'VALUE ENGINEERING',
  'Prefer the improvements that can be made without substantial additional expenditure where they are practical and beneficial: the seating distance from the room boundaries, the loudspeaker positions against the recommended positions, the front-wide positions where the design has them, and the geometry that carries them. A channel-count improvement can offer strong value where the processing capacity is already available.',
  'These are opportunities identified from the existing assessment, never promises of a free improvement. This proposal describes the finished design: never write an opportunity as an instruction to change the design, never write that something still needs doing, and never describe the proposal as an upgrade path. Where the design already takes an opportunity, say what it gives the client; where it does not, say nothing about it.',
  'The copy itself never uses the words improvement, improved, upgrading or upgrade, because a single-option proposal compares the design to nothing. Explain the value of a decision in the client\'s own terms instead.',
  '',
  'WRITING THE RECOMMENDATION',
  'Write in a natural professional voice. Where a recommendation the interpretation records is expressed, write it in the design team\'s own voice: We recommend, Our approach, We have prioritised. A document that states the design as fact but never states why it was chosen reads as a specification rather than a recommendation.',
  'This instruction is proposal-specific and takes precedence over the shared authority\'s prohibition of the first person for a design decision or a recommendation. It changes nothing about the Technical Report, which keeps its own established style: this philosophy is carried by the proposal writer alone.',
  'What stays forbidden is writing we where a measured result is the evidence, and implying an action, an opinion, a conversation, a meeting or a site visit the brief does not state. The engineering facts themselves remain stated as fact.',
  'Never imply a conversation, a meeting, a site visit or a client instruction the brief does not state.',
  '',
  'ENGINEERING SAFEGUARDS',
  'The frozen engineering evidence stays authoritative. Never infer that a design change improved a parameter unless the assessment supports it. Never imply that every seat performs identically. Never state a benefit the evidence does not carry.',
  '=== END SOUND PROOF DESIGN PHILOSOPHY ===',
].join('\n');

/**
 * The philosophy as the Stage 1 interpretation states it, as fact and as a rule
 * rather than as a demand on the copy. Contains no em dashes, so generated prose
 * cannot inherit one.
 *
 * @param {Object} philosophy — the interpretation's derived design_philosophy
 * @returns {Array<string>} lines, ready to be joined into a prompt block
 */
export function designPhilosophyLines(philosophy) {
  if (!philosophy || typeof philosophy !== 'object') return [];
  const priorities = philosophy.priorities || {};
  const reasoning = philosophy.reasoning || {};
  const value = reasoning.value_engineering || {};
  const list = (values) => (values || []).filter(Boolean).join('; ') || 'None identified.';
  const rows = (values) => (values || [])
    .map((entry) => `${entry.label || entry.area}${entry.level ? ` (${entry.level})` : ''}`)
    .filter(Boolean).join('; ') || 'None identified.';

  return [
    '',
    'Design philosophy (the judgement behind this design):',
    `  Principle: ${philosophy.principle || DESIGN_PHILOSOPHY_PRINCIPLE}`,
    `  Legitimate reasons a result may sit below the highest available level: ${list(philosophy.legitimate_reasons)}`,
    `  Why this design suits the brief: ${philosophy.why_appropriate || 'Not determined'}`,
    `  Prioritised listening positions: ${priorities.prioritised || 'Not determined'}`,
    `  Display and seating balance: ${priorities.display_and_seating || 'Not determined'}`,
    `  Coverage approach: ${priorities.coverage || 'Not determined'}`,
    `  Bass approach: ${priorities.bass || 'Not determined'}`,
    `  Strongest results (with the level each reached): ${list((reasoning.strongest_results || []).map((entry) => `${entry.area}${entry.level ? ` (${entry.level})` : ''}`))}`,
    `  Lower results (conscious trade-offs): ${rows(reasoning.lower_results)}`,
    `  Value already taken without substantial cost: ${rows(value.already_captured)}`,
    `  Value-engineering opportunities that remain a design choice: ${rows(value.remaining_design_choices)}`,
    `  Not established, so never asserted: ${list(philosophy.not_established)}`,
    '  Rules for using this reasoning in copy:',
    ...(philosophy.rules || DESIGN_PHILOSOPHY_RULES).map((rule) => `  - ${rule}`),
  ];
}

export default SOUND_PROOF_DESIGN_PHILOSOPHY;