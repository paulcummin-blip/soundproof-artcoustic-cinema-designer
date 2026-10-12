/**
 * rp22DesignContext.js (shared)
 * -----------------------------
 * THE RP22 PROFESSIONAL DESIGN CONTEXT: the established design principles behind
 * a professional cinema solution, offered to ADI and to the proposal writer as
 * CONTEXT for explaining why a design is appropriate.
 *
 * WHY IT EXISTS. Sound Proof explains not only what has been designed but why the
 * solution is right for the project. The Sound Proof design philosophy supplies
 * the judgement; this module supplies the professional design reasoning that
 * practice already establishes, so the copy can explain a decision in the terms an
 * experienced cinema designer would use, rather than reporting the design's
 * numbers back to the client.
 *
 * WHAT IT IS NOT, AND THIS IS THE WHOLE POINT:
 *
 *   - it is not an engineering authority: it states no figure, level, score,
 *     product, measurement or performance claim;
 *   - it is not a second writing system: it adds a context block and nothing else;
 *   - it never establishes WHY a particular designer chose a configuration. RP22
 *     describes objectives and possible methods, never this project's reason. A
 *     channel count, an overhead count or a subwoofer count is evidence of what the
 *     design CONTAINS, never of why it was chosen;
 *   - it changes no calculation, no RP22 or RP23 result, no claim and no rejection.
 *
 * Each principle carries its own RP22 v1.2 section reference, the conditions under
 * which it applies, what it does NOT establish, the frozen project evidence it
 * reads, and the safe explanatory use of it. Only the principles that apply to the
 * project are handed over.
 *
 * HOW APPLICABILITY IS DECIDED, in this order and never the other way round:
 *
 *   1. the EXPLICIT channel layout of the frozen design (bed channels, overhead
 *      channels, the subwoofer count), plus the frozen seating geometry, the frozen
 *      RP22 parameter results, the recorded product roles and any recorded
 *      treatment. This is the geometry, and it is the authority;
 *   2. the VERIFIED design interpretation, where the caller holds it, and only where
 *      it states a count the frozen layout does not: it states the same frozen facts,
 *      so it can add and never override;
 *   3. the layout LABEL ("9.1.6") as a last resort, and only where the frozen
 *      evidence carries no explicit layout at all. A format string is not geometry,
 *      so a physical arrangement is never inferred from a label while the geometry
 *      is there to be read.
 *
 * Pure: no React, no SDK, no timestamps, no runtime-specific APIs.
 */

import { toNumber } from './adiNarrativeFacts.js';

/** The context generation, recorded wherever the context is carried. */
export const RP22_CONTEXT_VERSION = '1.0';

/** The document this context is read from. Cited, never paraphrased as authority. */
export const RP22_SOURCE = Object.freeze({
  document: 'CEDIA/CTA-RP22 Immersive Audio Design Recommended Practice',
  version: '1.2',
  published: 'September 2023',
  url: 'https://cedia.org/site/assets/files/6057/cedia-cta_rp22_v1_2_sept_2023.pdf',
});

/**
 * How well each section reference was checked. Stated so a reference never claims
 * more than was verified: a heading or an excerpt was read; a contents listing is
 * the section's number and title only.
 */
export const RP22_LOCATOR = Object.freeze({
  EXCERPT: 'section_excerpt_verified',
  HEADING: 'section_heading_verified',
  CONTENTS: 'contents_listing',
});

/**
 * How a principle may be used. A: general guidance. B: applies only once the
 * frozen project geometry confirms it. C: needs this designer's own explanation.
 * D: any performance statement needs the project's own calculation or measurement.
 */
export const RP22_CLASS = Object.freeze({
  GENERAL: 'A',
  GEOMETRY_DEPENDENT: 'B',
  DESIGNER_EXPLANATION: 'C',
  COMPUTED_ONLY: 'D',
});

/**
 * THE PRINCIPLES. Eight, each covering one of the priority knowledge areas, each
 * with its own applicability, limits, evidence and safe use.
 */
export const RP22_PRINCIPLES = Object.freeze([
  Object.freeze({
    principle_id: 'holistic_design',
    area: 'holistic_design_and_compromises',
    title: 'Holistic design and intelligent compromises',
    section: '3.3, 3.3.1',
    locator: RP22_LOCATOR.EXCERPT,
    classification: RP22_CLASS.GENERAL,
    requires: ['any_design'],
    principle: 'A cinema is designed as one system: the decisions interact and improving one objective can constrain another, so the design is revisited as a whole. The best performing systems are the ones with the most intelligent set of compromises, and the aim is performance balanced against practicality, aesthetics and cost.',
    applicability: 'Applies to every design.',
    limitations: 'It establishes that a trade-off may be intelligent. It never establishes that a particular lower result WAS a deliberate compromise, and never that a compromise is acceptable to the client.',
    project_evidence: 'The interpretation record: the constraints, the priorities, the strongest results, and the lower results it states a reason for.',
    safe_use: 'Explain the balance the design strikes and why the combination suits this room. Name a trade-off as deliberate only where the interpretation or the designer records a reason for it; otherwise state the result and stop.',
  }),
  Object.freeze({
    principle_id: 'seating_and_coverage',
    area: 'seating_priorities_and_coverage',
    title: 'Seating priorities and audience coverage',
    section: '4.1.1, 4.1.2, 4.1.3, 3.2.1',
    locator: RP22_LOCATOR.EXCERPT,
    classification: RP22_CLASS.GEOMETRY_DEPENDENT,
    requires: ['seating'],
    principle: 'The reference seating position is a declared design reference, and the listening area is all of the seats. Seat-to-seat consistency is a design objective in its own right, so a good reference position does not by itself establish that every seat performs the same.',
    applicability: 'Applies where the design has at least one seating position.',
    limitations: 'A room-level or reference-position result is never a promise for every seat, and an audience-coverage objective is never evidence of a measured outcome.',
    project_evidence: 'The frozen seating: the row and seat counts, the declared reference position, the assessed viewing and per-seat results, and the scope each result is stated at.',
    safe_use: 'Explain which position the design is assessed from and how the seating has been arranged for the audience. State a result at the scope the evidence states it at, and never widen one position\'s result into a whole-room or all-seat claim.',
  }),
  Object.freeze({
    principle_id: 'surround_placement',
    area: 'surround_quantity_and_multi_row_positioning',
    title: 'Surround quantity and multi-row positioning',
    section: '5.5, 5.6',
    locator: RP22_LOCATOR.CONTENTS,
    classification: RP22_CLASS.GEOMETRY_DEPENDENT,
    requires: ['bed_channels>=5'],
    principle: 'The surround and rear speakers are placed to carry sound around the audience, and the placement has to work for the whole seating area rather than one seat. Their positions within the recommended zones are what creates continuous movement; more speakers at poorer positions do not.',
    applicability: 'Applies where the design has a bed layout of five channels or more.',
    limitations: 'A channel count never establishes smooth movement, and a position assessed as limited is not explained by the count.',
    project_evidence: 'The frozen layout and bed channel count, the recorded speaker positions, and the assessed horizontal spacing and placement results.',
    safe_use: 'Explain how the arrangement carries sound around and past the audience. Where a spacing result is limited, describe it as the practical speaker positions and the seating geometry setting the result, and claim no more than the assessed result supports.',
  }),
  Object.freeze({
    principle_id: 'front_wides',
    area: 'front_wide_loudspeaker_purpose',
    title: 'Front-wide loudspeaker purpose',
    section: '5.7',
    locator: RP22_LOCATOR.HEADING,
    classification: RP22_CLASS.GEOMETRY_DEPENDENT,
    requires: ['front_wides'],
    principle: 'Front wides bridge the angular gap between the screen channels and the side surrounds, so that sound travelling across the front of the room passes through the room rather than jumping from the screen to the side walls. Whether the ideal position is available depends on the room: a doorway, an opening or the furniture can constrain it.',
    applicability: 'Applies where the design has front-wide speakers.',
    limitations: 'It never establishes why a wide ended up where it is, and a constrained position is a geometry outcome rather than a fault in the design.',
    project_evidence: 'The recorded front-wide positions, the assessed front-wide placement result, and any recorded room element or designer note that constrains the wall.',
    safe_use: 'Explain what the wides contribute to movement between the screen and the sides. Where the evidence records a compromise and the designer records the reason, state it plainly; where no reason is recorded, state the outcome and write no reason.',
  }),
  Object.freeze({
    principle_id: 'overhead_layout',
    area: 'overhead_quantity_positioning_and_listening_area',
    title: 'Overhead quantity, positioning and the listening area',
    section: '5.8, 5.8.1, 5.8.2, 5.8.3',
    locator: RP22_LOCATOR.HEADING,
    classification: RP22_CLASS.GEOMETRY_DEPENDENT,
    requires: ['overheads'],
    principle: 'The upper speakers are positioned to serve the shape and extent of the listening area, and the number of them is adapted to that area rather than chosen for a format label. The arrangement, not the label, is what places sound above the audience.',
    applicability: 'Applies where the design has one or more overhead channels.',
    limitations: 'A layout label is never evidence that every seat receives the same overhead coverage, and an overhead count is never evidence of why that count was chosen.',
    project_evidence: 'The frozen overhead channel count and layout, the recorded overhead positions, the seating geometry and the assessed overhead spacing result.',
    safe_use: 'Explain that the overhead arrangement is set out to cover the seating area, using the assessed spacing result where it exists. Never state a coverage outcome from the count alone, and never explain the count as a deliberate choice unless the designer records one.',
  }),
  Object.freeze({
    principle_id: 'speaker_selection',
    area: 'speaker_selection_dispersion_and_timbre',
    title: 'Speaker selection, dispersion and timbre',
    section: '6.1, 6.1.1',
    locator: RP22_LOCATOR.HEADING,
    classification: RP22_CLASS.COMPUTED_ONLY,
    requires: ['timbre_evidence'],
    principle: 'Speaker performance is judged by how the loudspeaker behaves off axis as well as on it, because the audience hears the off-axis response as much as the direct sound. Similar spectral and phase behaviour across the channels is what lets a voice or an effect keep its character as it moves from one loudspeaker to another.',
    applicability: 'Applies where the design has assessed timbre or spectral results, or recorded loudspeaker selections.',
    limitations: 'Sharing a manufacturer or a series is not evidence of a measured timbre match, and a nominal dispersion figure is not a room-level coverage verification.',
    project_evidence: 'The assessed timbre and spectral results, and the recorded loudspeaker selections the reports state.',
    safe_use: 'Explain why consistent tonal character matters as sound moves around the cinema, using the assessed timbre result. Describe tonal continuity as a loudspeaker handing a voice or an effect on, and never widen it into equal seats or an equal whole experience.',
  }),
  Object.freeze({
    principle_id: 'subwoofer_optimisation',
    area: 'subwoofer_quantity_positioning_and_room_modes',
    title: 'Subwoofer quantity, positioning and room modes',
    section: '7.1, 7.2, 7.3, 7.3.1, 7.3.2',
    locator: RP22_LOCATOR.EXCERPT,
    classification: RP22_CLASS.COMPUTED_ONLY,
    requires: ['subwoofers'],
    principle: 'The objective with low frequencies is for the level and response to be consistent across all seats with no audible resonances, which is a different aim from a flat response at one seat or a couple more decibels of output. Room modes make the response differ from seat to seat, so the subwoofer arrangement and the seating positions are chosen together, and additional subwoofers arranged and aligned deliberately can reduce that variation.',
    applicability: 'Applies where the design has one or more subwoofers.',
    limitations: 'A subwoofer count never establishes seat-to-seat consistency, and a multi-subwoofer arrangement is a method rather than a proven outcome.',
    project_evidence: 'The frozen subwoofer count and the recorded arrangement, the assessed bass results the reports publish, and the scope each of those results is stated at.',
    safe_use: 'Explain the bass approach and what the published bass result states at its own scope. Claim seat-to-seat consistency only where the consistency result itself supports it, and never explain the subwoofer count as a decision that produced it.',
  }),
  Object.freeze({
    principle_id: 'physical_before_electronic',
    area: 'physical_design_before_electronic_optimisation',
    title: 'Physical design before electronic optimisation',
    section: '7.3, 7.3.3, 7.4, 11.1',
    locator: RP22_LOCATOR.EXCERPT,
    classification: RP22_CLASS.COMPUTED_ONLY,
    requires: ['subwoofers'],
    principle: 'Room dimensions, the seating positions and the subwoofer positions are the physical design; equalisation is applied afterwards and cannot make every physical arrangement equivalent. Room correction works with a suitable physical design rather than replacing it.',
    applicability: 'Applies where the design has one or more subwoofers.',
    limitations: 'It is never evidence that a design has been calibrated, that a room has been measured, or that a predicted result has been achieved in the room.',
    project_evidence: 'The frozen room and seating geometry, the recorded subwoofer positions, and whether the engineering authority states an applied calibration.',
    safe_use: 'Explain that the physical arrangement has been designed for this room and this geometry, and state what it provides for the design. Never describe a design-stage prediction as a measured or commissioned result, and never append a verification disclaimer to the capability it provides.',
  }),
]);

/**
 * THE ACOUSTICS POLICY AT THE DESIGN STAGE. Sound Proof designs rooms that may not
 * exist yet, so absorption, decay, background noise and isolation are frequently
 * estimated or assumed. These rules keep that honest and keep the subject out of
 * the way in a normal client proposal.
 */
export const RP22_ACOUSTICS_SALES_STAGE_POLICY = Object.freeze({
  stage: 'design_stage',
  statement: 'Sound Proof is principally a design-stage tool: the room may not yet exist, so acoustic absorption, reflection decay, background noise and sound isolation may be estimated or assumed rather than measured.',
  rules: Object.freeze([
    'acoustic absorption, reflection decay, background noise and sound isolation are not prominent subjects in a normal client proposal: mention one only where the frozen evidence makes it relevant to a decision the design already records',
    'never imply that specified acoustic treatment has already achieved a particular acoustic result',
    'never describe an assumed P15 or P21 level as measured, as achieved, or as a result of anything: it is an assumption recorded by the designer',
    'a specified treatment quantity is a design decision, never evidence of the acoustic outcome it was specified for',
    'where the room has not been measured, the copy states the design as designed and claims no measured acoustic outcome',
  ]),
});

/**
 * ACOUSTIC TREATMENT, RESTRAINED. Where the bass assessment identifies a problem
 * that suitable treatment might help address, ADI may suggest considering
 * treatment. It is an option, and it is never an outcome.
 */
export const RP22_TREATMENT_GUIDANCE = Object.freeze({
  applies_when: 'the frozen bass assessment identifies a problem that suitable acoustic treatment might help address',
  permitted_subjects: Object.freeze([
    'Artcoustic Abfusers',
    'purpose-designed bass traps',
    'other suitable acoustic treatment',
  ]),
  section: '7.4, 9.2.1',
  rules: Object.freeze([
    'suggest a potential benefit only where it is consistent with the frequencies involved and the known treatment data, and keep the suggestion restrained',
    'never guarantee an improvement, and never promise that treatment will resolve the problem',
    'never claim an improved P19 or P20 result from acoustic treatment unless the engineering model actually evaluates and supports that improvement',
    'never embellish acoustic-treatment benefits, and never describe treatment as delivering a result the assessment does not state',
    'treatment is offered as something to consider within the design, never as an instruction to change the finished design and never as a next step the client must take',
  ]),
});

/**
 * EVIDENCE SAFETY. The separation the writer is held to, stated once.
 */
export const RP22_EVIDENCE_SAFETY_RULES = Object.freeze([
  'RP22 explains general design principles. It never establishes the reason a particular designer selected a configuration.',
  'never infer a design decision from an equipment count: a channel count, an overhead count or a subwoofer count is evidence of what the design contains, never of why it was chosen',
  'keep RP22 guidance, verified project engineering, designer-supplied intentions and approved master-admin knowledge separate: none of them stands in for another',
  'an applicable principle is context for explaining the design; it is never a result, a level, a score, a measurement or a performance claim',
  'where the frozen evidence records no reason for a decision, state the design and its result, and write no reason at all',
  'the context strengthens the explanation of the recommended system and never introduces a verification disclaimer: a capability is stated confidently from the frozen evidence, and calibration or commissioning is mentioned only where the client\'s brief raises it or where it is an important practical recommendation',
]);

/** The one rule the writer is held to over the whole context block. */
export const RP22_CONTEXT_RULE =
  'this is professional design context for explaining why a design decision suits this room. It is never engineering evidence, '
  + 'it states no figure, level, product or performance result, and it never establishes the reason this designer chose a configuration: '
  + 'every figure, level, product and claim still comes from the frozen evidence pack, and the frozen evidence governs wherever the two differ';

/**
 * The signals the principles are matched against. Read from the frozen snapshot,
 * or from the frozen pack's own facts, and never from a live project record.
 *
 * @param {Object} [input.interpretation] — the VERIFIED interpretation of this
 *   version, where the caller holds it: read last, and only for a count the frozen
 *   layout does not state.
 */
export function readRp22Signals({ snapshot = null, facts = null, interpretation = null } = {}) {
  // THE EXPLICIT CHANNEL LAYOUT IS THE AUTHORITY for what this design physically
  // contains. The layout is read from the frozen snapshot, or from the frozen pack's
  // own facts: the writer is handed the pack, and the two state the same design.
  const layout = snapshot?.system?.channel_layout || facts?.system?.channel_layout || null;
  // A layout label is a format string, not geometry: it is read only where the
  // frozen evidence carries no explicit layout at all.
  const labelOnly = layout === null || layout === undefined;
  const configuration = labelOnly
    ? String(snapshot?.system?.configuration?.dolby_config || facts?.system?.format || '')
    : '';
  const formatParts = labelOnly ? configuration.split('.') : [];
  const fromLabel = (index) => (formatParts.length > index ? toNumber(formatParts[index]) : null);
  // The verified interpretation states the same frozen facts in its own evidence.
  const interpretationSystem = interpretation?.supporting_evidence?.system
    || interpretation?.reliable_evidence?.system
    || null;
  const seatScopes = facts?.seat_scopes || {};
  const parameters = Array.isArray(facts?.parameters) ? facts.parameters : [];
  const byParameter = new Map(parameters.map((row) => [Number(row?.parameter_id), row]));
  const headlineLevel = (id) => {
    const row = (Array.isArray(snapshot?.rp22?.parameter_headlines) ? snapshot.rp22.parameter_headlines : [])
      .find((entry) => Number(entry?.parameter_id) === id);
    return row?.achieved_level ?? null;
  };
  // A pack carries its parameters as rows; a snapshot states them as headlines.
  // Either way the level is read, and an unstated result stays absent.
  const levelOf = (id) => byParameter.get(id)?.level ?? headlineLevel(id) ?? null;

  const overhead = toNumber(layout?.overhead_channels)
    ?? (labelOnly ? fromLabel(2) : null);
  const bed = toNumber(layout?.bed_channels)
    ?? (labelOnly ? fromLabel(0) : null);
  const subwoofers = toNumber(layout?.subwoofer_count)
    ?? toNumber(snapshot?.system?.subwoofer_strategy?.count)
    ?? toNumber(facts?.system?.subwoofer_strategy?.count)
    ?? toNumber(snapshot?.system?.configuration?.subwoofer_count)
    ?? toNumber(interpretationSystem?.subwoofer_count);
  // The seating geometry is read from the frozen seating block, in the pack's own
  // facts or from the snapshot: the row and seat counts are what the seating and
  // listening-area principle applies to, so a recorded seat count is read even where
  // no row count is stated.
  const rows = toNumber(facts?.room?.seating?.row_count)
    ?? toNumber(facts?.seating?.rows)
    ?? toNumber(snapshot?.room?.seating?.row_count);
  const seats = toNumber(facts?.room?.seating?.seat_count)
    ?? toNumber(facts?.seating?.seats)
    ?? toNumber(snapshot?.room?.seating?.total_seats);
  const treatment = snapshot?.room?.acoustic_treatment || facts?.room?.acoustic_treatment || null;

  return {
    available: Boolean(snapshot?.available === true || facts),
    overhead_channels: overhead,
    bed_channels: bed,
    subwoofer_count: subwoofers,
    rows,
    seats,
    front_wides: Boolean(levelOf(7)
      || (toNumber(layout?.wide_channels) ?? 0) > 0),
    timbre_evidence: Boolean(levelOf(16) || levelOf(17)
      || (Array.isArray(facts?.system?.products) && facts.system.products.length > 0)
      || Boolean(facts?.system?.product_roles)),
    bass_result: Boolean(levelOf(18) || levelOf(19) || levelOf(20)
      || Object.keys(seatScopes).length > 0),
    treatment_specified: Boolean(treatment?.enabled === true && toNumber(treatment?.quantity) > 0),
  };
}

/** Whether one principle applies to the signals read from this project. */
export function principleApplies(principle, signals) {
  return (principle?.requires || []).every((requirement) => {
    switch (requirement) {
      case 'any_design': return true;
      // The seating geometry is read as the frozen seats and rows, so a design
      // whose seats are recorded without a row count still carries the seating
      // principle rather than losing it to a missing count.
      case 'seating': return (signals.seats ?? 0) > 0 || (signals.rows ?? 0) > 0;
      case 'bed_channels>=5': return (signals.bed_channels ?? 0) >= 5;
      case 'front_wides': return signals.front_wides === true;
      case 'overheads': return (signals.overhead_channels ?? 0) > 0;
      case 'timbre_evidence': return signals.timbre_evidence === true;
      case 'subwoofers': return (signals.subwoofer_count ?? 0) > 0;
      default: return false;
    }
  });
}

/** The principle a clarification question area belongs to, where one does. */
export const RP22_QUESTION_AREAS = Object.freeze({
  overhead_speaker_reason: 'overhead_layout',
  subwoofer_arrangement_reason: 'subwoofer_optimisation',
  seating_priority_reason: 'seating_and_coverage',
});

/**
 * The reference position the FROZEN evidence declares, or null.
 *
 * RP22 treats the reference seating position as a declared design reference. Where
 * the frozen evidence declares a row-specific reference, the priority is already
 * established and ADI has nothing to ask. A position derived automatically from the
 * screen geometry declares no row priority, so it establishes nothing here.
 */
export function declaredReferencePosition(snapshot) {
  const rsp = snapshot?.room?.rsp || snapshot?.rsp || null;
  const mode = String(rsp?.mode || '').trim();
  const declared = new Set([
    'front_row_center', 'middle_row_center', 'back_row_center',
    'all_rows_average', 'manual_position', 'seat_bound',
  ]);
  if (mode && declared.has(mode)) return mode;
  if (rsp?.designated_seat_id) return 'seat_bound';
  const basis = String(snapshot?.room?.seating?.mlp_basis || '').trim();
  return null;
}

/**
 * Whether ADI may put one clarification question. Two RP22-derived decisions:
 *
 *   - a question about ACOUSTIC TREATMENT is never put at the design stage: the
 *     room may not exist, treatment is estimated rather than measured, and a
 *     treatment decision is not a subject a client proposal explains;
 *   - the SEATING PRIORITY is asked only where the frozen evidence does not already
 *     declare the reference position, because asking a designer to declare a
 *     reference the design already declares is information already established.
 *
 * Every other question stands: a general principle never suppresses a question
 * about this project's own decision.
 */
export function rp22QuestionDecision({ question_id, snapshot = null } = {}) {
  if (question_id === 'acoustic_treatment_reason') {
    return { ask: false, reason: 'acoustics_are_not_a_design_stage_client_proposal_subject' };
  }
  if (question_id === 'seating_priority_reason') {
    const declared = declaredReferencePosition(snapshot);
    if (declared) {
      return { ask: false, reason: 'the_reference_position_is_already_declared_in_the_frozen_evidence' };
    }
  }
  return { ask: true, reason: null };
}

/**
 * The RP22 context for a set of selected versions: only the principles that apply
 * to at least one of them, with the acoustics policy, the treatment guidance and
 * the evidence-safety rules.
 *
 * @param {Object} input
 * @param {Object} [input.snapshot] — one frozen Engineering Snapshot
 * @param {Object} [input.facts] — one frozen pack facts object
 * @param {Array<Object>} [input.sources] — several { snapshot, facts } entries,
 *   for a comparison: a principle applies where it holds for any selected version.
 *   An entry may carry its own `interpretation`; the top-level one is used otherwise
 * @param {Object} [input.interpretation] — the VERIFIED interpretation, read only
 *   for a count the frozen layout does not state
 * @returns {Object} the frozen context, carrying its own version and source
 */
export function buildRp22DesignContext({ snapshot = null, facts = null, sources = null, interpretation = null } = {}) {
  const entries = (Array.isArray(sources) && sources.length > 0
    ? sources
    : [{ snapshot, facts }])
    .filter((entry) => entry && (entry.snapshot || entry.facts));
  const signals = entries.map((entry) => readRp22Signals({
    snapshot: entry.snapshot,
    facts: entry.facts,
    interpretation: entry.interpretation || interpretation,
  }));
  const present = signals.filter((entry) => entry.available);

  const principles = present.length === 0
    ? []
    : RP22_PRINCIPLES.filter((principle) => present.some((entry) => principleApplies(principle, entry)));

  return {
    version: RP22_CONTEXT_VERSION,
    source: { ...RP22_SOURCE },
    available: principles.length > 0,
    rule: RP22_CONTEXT_RULE,
    principles: principles.map((principle) => ({
      principle_id: principle.principle_id,
      area: principle.area,
      title: principle.title,
      section: principle.section,
      locator: principle.locator,
      classification: principle.classification,
      principle: principle.principle,
      applicability: principle.applicability,
      limitations: principle.limitations,
      project_evidence: principle.project_evidence,
      safe_use: principle.safe_use,
    })),
    acoustics_policy: {
      stage: RP22_ACOUSTICS_SALES_STAGE_POLICY.stage,
      statement: RP22_ACOUSTICS_SALES_STAGE_POLICY.statement,
      rules: [...RP22_ACOUSTICS_SALES_STAGE_POLICY.rules],
      treatment_specified_in_design: present.some((entry) => entry.treatment_specified === true),
    },
    treatment_guidance: {
      applies_when: RP22_TREATMENT_GUIDANCE.applies_when,
      section: RP22_TREATMENT_GUIDANCE.section,
      permitted_subjects: [...RP22_TREATMENT_GUIDANCE.permitted_subjects],
      rules: [...RP22_TREATMENT_GUIDANCE.rules],
    },
    evidence_safety: [...RP22_EVIDENCE_SAFETY_RULES],
  };
}

/**
 * The context as prompt lines for the Stage 1 interpretation. It states the safe
 * use and the limitation of each applicable principle and nothing else: no figure,
 * no level, no product. Contains no em dashes.
 */
export function rp22ContextLines(context) {
  if (!context || context.available !== true) return [];
  const lines = [
    '',
    `RP22 professional design context (RP22 v${RP22_SOURCE.version}, ${RP22_SOURCE.published}: established design principles, never a project result):`,
    `  Source: ${RP22_SOURCE.document} v${RP22_SOURCE.version}`,
    '  These explain HOW a professional cinema design is reasoned about. They never establish why THIS designer chose this configuration, and they carry no figure, level or product.',
    ...context.principles.flatMap((principle) => [
      `  - ${principle.title} [RP22 ${principle.section}, classification ${principle.classification}]: ${principle.principle}`,
      `    Safe use: ${principle.safe_use}`,
      `    Does not establish: ${principle.limitations}`,
    ]),
    '  Acoustics at the design stage:',
    ...(context.acoustics_policy?.rules || []).map((rule) => `    - ${rule}`),
    '  Acoustic treatment, restrained:',
    ...(context.treatment_guidance?.rules || []).map((rule) => `    - ${rule}`),
    '  Evidence safety:',
    ...(context.evidence_safety || []).map((rule) => `    - ${rule}`),
  ];
  return lines;
}

export default buildRp22DesignContext;