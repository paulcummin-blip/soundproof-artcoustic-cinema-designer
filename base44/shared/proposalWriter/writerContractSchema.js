/**
 * writerContractSchema.js (shared)
 * ---------------------------------
 * THE PHASE 2 WRITER CONTRACT.
 *
 * A proposal writer is given the frozen proposal evidence pack (Phase 1) and
 * this contract, and nothing else. The contract is versioned, so a draft can
 * always be traced to the exact agreement it was written against. It names:
 *
 *   - the ten sections a draft must return, and the word limit each one holds
 *     (the tenth, presented_options, is filled only where the pack supplies
 *     option guidance and is returned empty where it supplies none);
 *   - the writing rules the writer is held to;
 *   - the exact JSON shape returned, and the claim-ID grounding rule;
 *   - every reason a returned draft is rejected.
 *
 * Nothing here writes prose and nothing here calculates. It is the vocabulary of
 * the agreement, and it is deliberately small enough to read in one sitting.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/**
 * The contract generation. A draft is only read against the revision it cites.
 *
 * Bumped to 2 when the contract gained the presented_options section, so the
 * client-facing copy a comparison page carries is written and validated by the
 * same authority as the rest of the document. The nine earlier sections, their
 * word limits and the grounding rule are unchanged, so a draft filed under
 * generation 1 is still read against generation 1: the validator reads the
 * section set from the input it is given, never from this constant, and a
 * historical generation is never rewritten.
 */
export const WRITER_CONTRACT_VERSION = 2;

/**
 * The writer prompt generation this contract is issued with.
 *
 * Bumped to 2 when the writing authority gained the proposal sales authority and
 * the authority began to be carried as one block, to 3 when the pack began to
 * carry scoped seat-group claims and the writer gained the rule that governs
 * them, and to 4 when the proposal stage became strength-led: the copy now states
 * the strongest supported results positively, keeps every claim inside its own
 * scope, and carries no design-stage corrective commentary. A generation before
 * and after any of those changes must stay distinguishable in the append-only
 * audit history, so every new record stores this version. A historical record
 * keeps the version it was filed under and is never rewritten.
 *
 * Bumped to 6 when the sales authority gained the rule that a capability is
 * always finished by the experience it creates, the rule for the one result where
 * the lower-priced option leads, the ban on repeating a phrase between sections,
 * and the instruction to use the pack's scoped claims rather than leave them
 * unused; and when the blocked-area reading stopped treating the layer words a
 * capability belongs to ("screen headroom", "front stage headroom") as a claim
 * that the area itself changed.
 *
 * The contract version is deliberately NOT bumped: the sections, the word limits
 * and the claim grounding rule are unchanged, and every existing rejection keeps
 * its meaning, so a draft filed under generation 1 is still read against the same
 * agreement. One rejection was added, for the design-stage commentary a proposal
 * no longer carries.
 *
 * Bumped to 8 for the proposal sales-language pass: a single-option proposal
 * stops carrying the comparison's two headings (its sections are labelled Design
 * Overview and Why This Specification), the copy is written experience first,
 * value second and engineering proof third, the display is named as the frozen
 * authority names it (a TV as a TV, never as a screen, an aspect ratio or a
 * projector), the software-report register is refused, comparative capability
 * language is refused where there is no baseline to compare against, and an
 * installation-state claim is refused because the proposal is written before
 * installation. Section IDs, order and word limits are unchanged; four
 * rejections are added for the wording this pass forbids, so a draft filed under
 * generation 8 is distinguishable from every generation before it.
 */
// Generation 9 adds human-sales-language controls; evidence and grounding are unchanged.
//
// Bumped to 10 for the screen-stage rule: where the pack states a dual-centre
// stage, the copy names the left and right channels with their own model and the
// centre with its own cabinet count, and the collapsed "LCR <left/right model>"
// wording this replaces is refused by its own rejection. The sections, the word
// limits and the claim grounding rule are unchanged, so the contract version
// stays where it is and a draft filed under an earlier generation is still read
// against the same agreement.
// Bumped to 11 for the option-copy pass: where the brief supplies seating or
// layout options, the designer's own notes are handed to the writer as
// INSTRUCTIONS and the writer returns its own client-facing prose for them in
// the new presented_options section, where the approved validator checks it.
// The document's comparison pages carry that validated prose and never the
// designer's raw note.
// Bumped to 12 for the multi-cabinet arrangement and the positive register. Where
// the frozen evidence states a stage position built from more physical cabinets
// than that position has channels, the copy explains that arrangement once —
// naming the cabinets the evidence places and the ONE channel they reproduce —
// instead of omitting it or writing the cabinets as several channels; and the copy
// states what the design delivers rather than disclaiming its own claims. The
// sections, the word limits, the grounding rule and every earlier rejection keep
// their meaning, so a historical generation is still read against the agreement it
// was written under.
// Bumped to 13 for the design-context pass: the writer is given the verified ADI
// project interpretation and the designer's brief, the Design Summary introduces
// the cinema rather than opening on the top-ranked result in 2-3 sentences, the
// ranking decides emphasis rather than the order of the document, and no section
// is written as a bounded fragment with nothing to say. Section IDs, order and
// the claim grounding rule are unchanged, so a draft filed under an earlier
// generation is still read against the agreement it was written under.
// Bumped to 14 for the editorial-standard pass: the writer's role, the internal
// editorial plan, the Design Summary structure, the distinct job of each section,
// the house style and the brief-coverage responsibility are stated, and the
// Design Summary is given room to develop the cinema. Section identities, the
// word limits of the other sections and every validation rule are unchanged.
// Bumped to 15 for the design-philosophy pass: the writer is given the Sound Proof
// design philosophy (the best design satisfies the brief while balancing
// performance, practicality, aesthetics and cost, so a result below the highest
// available level is a legitimate design decision), the reasoning behind the
// recommendation, the value-engineering rule, the design team's own judgement
// written as we, and the engineering safeguards that keep an invented reason, an
// inferred improvement, an all-seat promise and a price-as-value claim out of the
// copy. Section identities, word limits, the claim grounding rule and every
// validation rule are unchanged, so a draft filed under an earlier generation is
// still read against the agreement it was written under.
// Bumped to 16 for the natural-writing pass: the editorial instructions are
// refined to the Sound Proof Natural Writing Standard. The copy is written as an
// experienced British cinema designer presenting a considered recommendation,
// with natural sentences and varied structure, no stock connective (Furthermore,
// Moreover, Additionally, Subsequently, In conclusion, It is important to note
// that), no paragraph opened again on the same mechanical subject, no generic
// marketing phrase, and no em dash anywhere. The whole document is reviewed as one
// document before it is returned, and calibration, commissioning and verification
// are not discussed: a predicted capability is stated confidently and accurately.
// Four rejections are added for the wording this pass forbids (the em dash, the
// stock connective, the repeated mechanical opener and the generic claim phrase).
// Section identities, word limits, the claim grounding rule and every existing
// rejection keep their meaning, so a draft filed under an earlier generation is
// still read against the agreement it was written under.
// Bumped to 17 for the Presented Options pass: the contract no longer requires
// the writer to state that the predicted acoustic performance is unchanged when
// seating or layout alternatives are presented. No allowed engineering claim
// establishes that a change of seating furniture leaves acoustic performance
// unchanged, so the mandate asked for a statement the evidence cannot ground and
// the validator refused it. The section now presents the options as practical and
// visual alternatives — comfort, seating style, appearance and the practical
// arrangement of the room, and the seating dimensions, sightlines and loudspeaker
// clearance where the pack states them — says that each arrangement works within
// the seating positions the design specifies, and states or implies nothing about
// acoustic performance unless an allowed claim supports it. Section identities,
// word limits, the claim grounding rule and every validation rule are unchanged:
// a draft filed under an earlier generation is still read against the agreement it
// was written under.
// Bumped to 20 for the presentation-and-identity pass: the guidance states that
// the project, client and reference names identify the document and are never the
// subject of a narrative sentence, that the opening section is written about the
// cinema itself, that Dynamic Range opens on the experience in the room with each
// output figure following as its proof, and that Overall Design closes on a fresh
// judgement rather than restating the Design Summary. Section identities, word
// limits, the claim grounding rule and every validation rule are unchanged, so a
// draft filed under an earlier generation is still read against its own agreement.
// Bumped to 21 for the professional-writing refinement: Dynamic Range opens on
// the experience of dynamic contrast (quiet detail through to demanding impact)
// with the output figures as proof of output capability alone and never as a
// list of levels, Timbre Matching leads with the tonal benefit the client hears
// across the seating area with the primary positions the priority while P16 and
// P17 keep their own speaker-group scope, Spatial Resolution explains why the
// loudspeaker positions matter from this design's own arrangement and seating
// rather than from quantities, angles or levels, Overall Design closes on a
// confident recommendation, and the sales authority states positively what a
// result below the highest available level contributes. Section identities, word
// limits, the claim grounding rule and every validation rule are unchanged, so a
// draft filed under an earlier generation is still read against its own
// agreement.
// Bumped to 22 for the final Spatial Resolution and Dynamic Range refinement.
// Spatial Resolution opens on the listening experience — sound placed where the
// action is, natural and continuous movement between loudspeakers, a soundfield
// extending beyond the picture and reaching around and above the audience, and
// an immersion that holds — and then explains the arrangement as what produces
// those benefits, never opening on a position that falls within a recommended
// limit or a placement zone. Dynamic Range explains BOTH ends of the range, the
// quiet end (subtle atmosphere, fine detail, delicate musical passages,
// dialogue) alongside the loud end (sudden impact, dynamic peaks, scale and
// physical presence), explains why the contrast between them matters, and gives
// the frozen P12/P13/P14 output figures once as supporting evidence of output
// capability alone: never as a list of levels, and never as proof of low-level
// resolution. Timbre Matching and Overall Design are untouched. Section
// identities, word limits, the claim grounding rule and every validation rule
// are unchanged, so a draft filed under an earlier generation is still read
// against its own agreement.
// Bumped to 23 for the story-not-mechanism pass: the single-option Design Overview
// is no longer asked for the layout's channel count or for where the overhead
// channels are placed (which produced a reckoning of channels and a statement about
// the layer the design does not have), and it now explains the arrangement in terms
// of what the client hears, naming no feature the design lacks and no measurement.
// The writer is given the client narrative register: no channel count as a selling
// point, no absent feature, no explanation of a mechanism, no boundary distance or
// parameter number in the main narrative, and the plain words for a room like this
// instead. A TV media room's Design Overview is briefed short and plain by its own
// authority. Section identities, the claim grounding rule, the word limits of every
// other section and every validation rule are unchanged, so a draft filed under an
// earlier generation is still read against the agreement it was written under.
// Bumped to 24 for the performance-language pass: the strength of the copy now
// follows the Performance Level the evidence states, from the one shared register
// (performanceLanguageAuthority.js). A higher level has earned stronger language,
// a passing result is never flattened into cautious words such as "useful",
// "adequate", "acceptable" or "reasonable", an L4 result is presented as the
// flagship result it is, and the language is never written stronger than the
// result in front of it. Section identities, word limits, the claim grounding rule
// and every validation rule are unchanged, so a draft filed under an earlier
// generation is still read against the agreement it was written under.
// Bumped to 26 for the natural language refinement pass: the writer is told to find
// the three or four aspects that matter most in this particular cinema and develop
// those properly rather than mentioning everything the analysis measured (this copy
// is a brief overview, not an equipment list, and the specifications are stated in
// the Project Summary and the evidence pages beside it), to write the way a designer
// would say it aloud rather than in the abstract register a report uses (with the
// abstract constructions it replaces, for example "the rear row retaining an
// involving view" and "making the film's setting extend beyond the front wall"),
// to explain an established engineering principle confidently without waiting for a
// high Performance Level while never turning a principle into a promised result, and
// to review its own copy with the designer's ear: would a professional cinema
// designer actually say this to a client, does it sound natural read aloud, does it
// explain why the design matters, does it communicate the pleasure of watching films
// in this room, and is anything awkward, repetitive or unnecessarily technical.
// Section identities, every word limit, the claim grounding rule and every
// validation rule are unchanged, so a draft filed under an earlier generation is
// still read against the agreement it was written under.
// Bumped to 27 for the editorial-reference refinement: the natural writing
// standard no longer shows the writer any example of awkward language, and it
// carries short approved passages instead, as editorial references that show the
// register at its best and are never templates. Every principle the standard
// stated is unchanged, the deterministic readings are untouched, and no section
// identity, word limit, claim ground, figure, level, product or validation rule
// moved, so a draft filed under an earlier generation is still read against the
// agreement it was written under.
export const WRITER_PROMPT_VERSION = 'proposal-writer-prompt-27';

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
  /**
   * A screen stage collapsed into one LCR, or a count of three screen
   * loudspeakers, on a design whose pack states a dual-centre stage: the left
   * and right channels named with their own model and the centre built from two
   * physical centre cabinets of their own. The copy would state equipment the
   * design does not have — a centre of the left/right model, or three
   * loudspeakers of a model the design has two of.
   */
  COLLAPSED_SCREEN_CHANNEL: 'collapsed_screen_channel',
  /** A recommendation the pack does not allow. */
  UNSUPPORTED_RECOMMENDATION: 'unsupported_recommendation',
  /** An improvement claimed in an area the pack blocks as unchanged. */
  UNSUPPORTED_IMPROVEMENT: 'unsupported_improvement',
  /** A seat-to-seat bass consistency claim the P20 result does not support. */
  P20_BASS_CONTRADICTION: 'p20_bass_contradiction',
  /** A seat-group claim at a scope, or at a level, the pack does not state. */
  SCOPE_MISMATCH: 'scope_mismatch',
  /**
   * An assumed or administrative parameter (P8, P15, P21) named in the copy
   * without the designer asking for it, or named without being labelled as an
   * assumption, or used as a performance differentiator.
   */
  ASSUMED_PARAMETER_MENTION: 'assumed_parameter_mention',
  /**
   * Design-stage commentary: the copy tells the client what still needs
   * attention, improvement, calibration, optimisation or further design work, or
   * suggests a future correction. The proposal states the finished design, so
   * this is never written. A refusal is also how a genuine material issue is
   * held for human review instead of becoming advice in the copy.
   */
  DESIGN_STAGE_COMMENTARY: 'design_stage_commentary',
  /**
   * A verification disclaimer on a capability: the copy makes a stated capability
   * wait for a future process ("subject to confirmation during calibration",
   * "final performance will be confirmed on site"), or asks the client to hold a
   * design prediction back until an eventual measurement. The proposal presents
   * the recommended design and its expected performance confidently, so this is
   * never written. Calibration or commissioning is still written where the
   * client's brief raises it or where it is an important practical
   * recommendation, and then as a plain statement of fact: internal accuracy is
   * untouched, and a predicted result is still never described as a measured one.
   */
  VERIFICATION_DISCLAIMER: 'verification_disclaimer',
  /**
   * The software-report register: the copy reports fields rather than talking to
   * a client ("assessed for", "this parameter", "performance result", "this
   * proposal details"), or writes filler such as "there are no changes to
   * report" where there is no comparison to report on.
   */
  REPORT_VOICE: 'report_voice',
  /**
   * Comparative capability language (increase, greater, improved, more capable,
   * additional headroom, higher output, upgrade, compared to) in a
   * SINGLE-OPTION proposal, where there is no baseline and no second option to
   * compare against. A comparison proposal legitimately compares.
   */
  UNSUPPORTED_COMPARATIVE: 'unsupported_comparative',
  /**
   * An installation-state claim ("installed", "installation"). The proposal is
   * written before installation: the design is specified, selected, designed,
   * modelled or proposed.
   */
  INSTALLATION_STATE_CLAIM: 'installation_state_claim',
  /**
   * Display terminology that misdescribes the frozen display: a TV written as a
   * screen, a projector, an aspect ratio, a viewable width or a screen size.
   */
  DISPLAY_TERMINOLOGY: 'display_terminology',
  /**
   * A seat-to-seat frequency-response result written as a match between
   * loudspeaker groups. P16 states how consistently the screen channels hold
   * their own tonal balance from seat to seat, and P17 the same for the wide,
   * surround and upper speakers: neither compares one loudspeaker group with
   * another, so their figures are never attached to a between-group match.
   */
  TIMBRE_INTER_GROUP_MATCH: 'timbre_inter_group_match',
  CROSS_SECTION_DUPLICATION: 'cross_section_duplication',
  TONAL_SCOPE_STRETCH: 'tonal_scope_stretch',
  INTERNAL_LEVEL_LANGUAGE: 'internal_level_language',
  UNEXPLAINED_ABBREVIATION: 'unexplained_abbreviation',
  SINGLE_OPTION_FRAMING: 'single_option_framing',
  /** A section over its word limit. */
  SECTION_TOO_LONG: 'section_too_long',
  /**
   * The pack supplied option guidance — the designer's own seating or layout
   * notes — and no client-facing option copy was returned for it. The guidance
   * is an instruction, so the copy has to be written: an empty or missing
   * presented_options section leaves a document page with nothing validated to
   * lead it, which is a refusal rather than a page.
   */
  OPTION_COPY_MISSING: 'option_copy_missing',
  /**
   * The multi-cabinet arrangement the pack states for a stage position: more
   * physical cabinets placed at ONE position than that position has channels. The
   * copy explains the arrangement once, naturally — the position, the cabinets the
   * evidence places, and the one channel they reproduce. Raised for copy that
   * never explains it, copy that writes the physical cabinets as several
   * independent channels, and copy that states a cabinet count the frozen
   * evidence does not place.
   */
  MULTI_CABINET_CHANNEL: 'multi_cabinet_channel',
  /**
   * The validation register: client copy defending its own claim rather than
   * stating what the design delivers ("this is not a claim", "no claim is made",
   * "it does not establish"). A proposal sells the supported result and leaves
   * every other parameter to the evidence that measures it, so an internal
   * validation note is never written into client prose. A legitimate qualification
   * the client needs is untouched.
   */
  VALIDATION_REGISTER: 'validation_register',
  /**
   * An em dash (U+2014) in client-facing copy. The proposal carries zero em
   * dashes: the sentence is punctuated another way or rewritten, and it is
   * rewritten by the writer, never silently edited here. The copy is read exactly
   * as written, so a technical value, a product identifier and an evidence
   * reference are left untouched.
   */
  EM_DASH_IN_NARRATIVE: 'em_dash_in_narrative',
  /**
   * A stock connective the standard refuses at the head of a sentence
   * (Furthermore, Moreover, Additionally, Subsequently, In conclusion, It is
   * important to note that). Natural transitions are written instead.
   */
  STOCK_CONNECTIVE: 'stock_connective',
  /**
   * The same mechanical paragraph opener repeated across the document (The system,
   * The design, This ensures, The result). The paragraphs are re-opened on the
   * design's own subject instead.
   */
  REPETITIVE_PARAGRAPH_OPENER: 'repetitive_paragraph_opener',
  /**
   * A generic claim phrase with no project content ("sophisticated cinematic
   * experience", "seamless immersive sound", "unparalleled performance",
   * "elevates the listening experience"). The standard replaces it with a
   * project-specific explanation of what was chosen, why it suits this room, what
   * the client gains and what the engineering supports, so the phrase is refused
   * rather than reworded with another adjective.
   */
  GENERIC_MARKETING_PHRASE: 'generic_marketing_phrase',
});

/**
 * The ten sections of a draft, in the order a pack presents them. Each carries
 * its own word limit and the one requirement that section exists to meet.
 *
 * `presented_options` is the one section whose text is conditionally required:
 * a pack that supplies option guidance must be answered with copy, and a pack
 * that supplies none must be answered with an empty string. That is stated per
 * section as `optional_without_guidance`, so the validator reads the rule from
 * the contract rather than deciding for itself.
 */
export const WRITER_SECTIONS = Object.freeze([
  {
    section: 'decision_summary',
    title: 'Decision Summary',
    title_single: 'Design Summary',
    requirement_single: 'Introduce the cinema itself, in developed natural paragraphs: the room and its proportions, its intended use where the interpretation states one, the display and why it suits the room, the seating arrangement, the system architecture, the most important design considerations, and the experience this design is intended to deliver. Write as an experienced cinema designer would write for a homeowner or architect. Do not list equipment, do not dump specifications, and do not restate the performance claim here. Never say this proposal outlines, this design presents, this option, decision or selected option. Where the project has real design substance, develop this in three or four paragraphs: the room and the scale of the experience, then the system and how it relates to the room, then the reasoning that makes this specification right for this project, then the result. Roughly 180 to 250 words at that depth, less where the design is genuinely simple, and never padded with invented detail to reach a length. This is the one section that establishes the whole cinema, so it takes the design\'s own story rather than the top-scoring result. Explain the reasoning the design_philosophy block records: what the client wants to achieve, which listening positions are prioritised, how the display and the seating were balanced, the practical constraints, the coverage and bass approaches, and why the finished design suits this brief. Never invent a reason, a priority, a budget or a decision the interpretation does not record, and never present the highest available level as the objective regardless of cost or practical consequence.',
    word_limit: 250,
    requirement: 'State the decision between the options in the pack\'s own framing, and only where the pack allows a framing.',
  },
  {
    section: 'what_stays_same',
    title: 'What Stays the Same',
    // A single-option proposal is not a comparison: the same section, the same
    // slot and the same word limit, labelled for what it actually says.
    title_single: 'Design Overview',
    word_limit: 180,
    requirement: 'State only what every option shares, from the shared-result claims the pack allows. Where the copy also contrasts the options, cite the shared-result claims for what is unchanged and the pack\'s factual-change or material-gain claims for what differs.',
    requirement_single: 'Explain how the system is arranged, in terms of what the client hears from each part: the loudspeaker layout, where the screen channels, the surrounds and any overhead loudspeakers the design actually has are placed, the seating and the display, and how those parts work together in this room. Describe the layout this design HAS: never state a channel count, never name a layer, a format or a loudspeaker the design does not include, and never explain how a mechanism works or why a measurement matters. Write from the design-identity and shared-result claims the pack allows, and from the interpretation\'s account of the architecture. Never mention another option or a baseline.',
  },
  {
    section: 'what_changes',
    title: 'What Changes',
    title_single: 'Why This Specification',
    word_limit: 220,
    requirement: 'State only the differences the pack records, and call one a gain only where the pack allows a gain.',
    requirement_single: 'Explain why this solution suits this project: the choices that were made, such as the loudspeaker family, the layout and the bass approach, and what each one gives the client in this room. Write from the ranked strength stories and the credibility claims the pack allows, and from the design decisions and constraints the interpretation states. Never state or imply a comparison with another option or a baseline, and never write filler such as "there are no changes to report". This is the judgement section of the document: explain why this solution suits this particular room, how the competing priorities were balanced, which decisions carry the most value, why a compromise is reasonable where the interpretation records one, and what the client gains from the finished design. Where the design already takes an improvement without substantial additional expenditure, say what it gives the client; where an opportunity remains a design choice, say nothing about it.',
  },
  {
    section: 'key_performance_highlights',
    title: 'Key Performance Highlights',
    requirement_single: 'State what engineering evidence supports this proposal: the recorded results the pack\'s claims carry, for the areas that carry a claim, in a small number of concise benefit-led sentences. Use the strength ranking to choose what is stated here, never to fix the order of the document. No dBC values, Hz values, angles, channel counts or grades: the proof belongs in the specialist sections. Never copy a complete evidence statement. No overall-seat equality claim.',
    word_limit: 190,
    requirement: 'State the pack\'s recorded results, in the pack\'s own words, for the areas that carry a claim.',
  },
  {
    section: 'spatial_resolution',
    title: 'Spatial Resolution',
    requirement_single: 'Open on the listening experience itself: sound placed precisely where the action is, so an effect comes from the point on screen it belongs to; movement between loudspeakers that sounds natural and continuous rather than handed from one speaker to the next; a soundfield that extends beyond the picture into the room and reaches around and above the audience; and an immersion that holds as a scene builds. Then explain how this design\'s loudspeaker arrangement produces those benefits: where the screen, surround, front-wide and overhead loudspeakers sit, how the seating relates to them, and what that placement is doing for the listener. Never open by confirming that positions fall within a recommended limit or a placement zone, and never let the section read as a compliance or placement check: state the arrangement as the reason the experience works. Bring the viewing geometry, the display and the seating into the same explanation, and use a result only where it strengthens the point rather than listing quantities, angles or levels. Stay within the claims the pack allows.',
    word_limit: 180,
    requirement: 'Explain what the spatial results mean for the seating, within the claims the pack allows.',
  },
  {
    section: 'dynamic_range',
    title: 'Dynamic Range',
    requirement_single: 'Explain both ends of dynamic range and why the contrast between them matters. The quiet end: subtle atmosphere, fine detail, delicate musical passages and dialogue that stay clear and intelligible without being pushed. The loud end: sudden impact, dynamic peaks, and the scale and physical presence of demanding soundtrack moments. The contrast is the point: a system that resolves low-level detail and then delivers real impact is what carries a soundtrack\'s emotional range, so explain what each end gives the listener in this room and why moving between them is what makes the moment land. Then give the exact frozen output figures at the reference seating position once, as supporting evidence of the output capability behind the loud moments, never as a list of calculated levels and never as proof of low-level resolution: output capability alone says nothing about how quietly detail is resolved, so any statement about the quiet end rests on the design and the evidence that actually supports it. Match each benefit to its frozen evidence and supported channel family. Where only bass output is a selected strength, describe the weight and impact of low-frequency effects. Keep P14 bass output, P18 extension, P19 response at the reference position and P20 consistency across seats distinct; describe each only from its own supported evidence. No absolute guarantees and no unnecessary qualifications.',
    word_limit: 170,
    requirement: 'Explain supported headroom for demanding film soundtracks, controlled reproduction of dynamic peaks and clear, confident presentation at the designed listening levels, using only the frozen dynamic-range evidence for each option and channel family. Keep bass output, extension, response at the reference position and consistency across seats distinct, each supported by its own evidence. No absolute guarantees.',
  },
  {
    section: 'timbre_matching',
    title: 'Timbre Matching',
    requirement_single: 'Explain the tonal benefit the client will hear: voices, music and effects keeping a familiar tonal character as the soundtrack develops, and a similarly balanced presentation across the seating area, with the primary listening positions the priority. State what that consistency gives them where they sit, and why it matters as a soundtrack moves around the cinema. State the tonal aim as the design\'s own approach, and state the measured tonal consistency only for the speaker group the evidence states it for, across only the seats that result covers. These frequency-response results state how consistently ONE loudspeaker group holds its own tonal balance from seat to seat, so they are never evidence that one group of loudspeakers matches another: never write a screen-to-surround or any other between-group match, and never attach their figures to a comparison between the screen, the surround and the overhead speakers. Natural handover wording is welcome as the design\'s own aim: describe a voice or an effect keeping its character as the loudspeakers hand it on, and let that stand as intent rather than as a measured match between the groups. Keep every seat statement explicitly limited to tonal character, not overall balance, bass or placement. Never imply the design\'s loudspeaker package differs from another option\'s, and never broaden tonal consistency into equal seats or an equal whole experience. No bass-extension detour and no both parameters wording.',
    word_limit: 170,
    requirement: 'Explain the loudspeaker and coverage evidence the pack records, and claim nothing beyond it. Where the copy describes a sound passing between loudspeakers, that is tonal continuity within the design and the design\'s own aim, never a claim that the loudspeaker package differs between the options and never a match measured between the speaker groups. The tonal results the pack carries are seat-to-seat frequency-response results, one speaker group each, so they are never used to claim that one group of loudspeakers matches another.',
  },
  {
    section: 'presented_options',
    title: 'Presented Options',
    // The designer's own seating or layout notes arrive as INSTRUCTIONS, never
    // as copy: this is the polished client-facing prose written from them, and
    // it is what the document's option pages carry.
    requirement_single: 'Where the brief supplies seating or layout options, present them in 2–3 natural sentences as practical alternatives within ONE design: what each arrangement gives the room, what it is like to sit in, how it looks and how it arranges the space. Describe the practical and visual differences the client is choosing between, in terms of comfort, seating style, appearance and the practical arrangement of the room, and where the pack states the seating dimensions, the sightlines or the clearance around the loudspeakers, use them to describe the arrangement rather than inventing one. State that each arrangement works within the seating positions this design specifies, and that the final choice rests on comfort and personal preference. Never state or imply that the options give identical, unchanged or equivalent acoustic performance, never introduce an acoustic-performance qualification of your own, and never present an option as a performance difference or a performance gain: where the copy states something about an area of the evidence it cites the allowed claim that supports it, and where the evidence supports nothing it is not written. Where the brief supplies no option, return an empty string for this section.',
    requirement: 'Where the pack supplies option guidance, present the options it describes in 2–3 natural sentences as practical alternatives within one design, describing each arrangement in terms of comfort, seating style, appearance and the practical arrangement of the room, and state plainly what the choice rests on. Never state or imply that the options give identical, unchanged or equivalent acoustic performance, and never introduce an acoustic-performance qualification of your own. Where the pack supplies no option guidance, return an empty string for this section.',
    word_limit: 170,
    optional_without_guidance: true,
  },
  {
    section: 'overall_design',
    title: 'Overall Design',
    requirement_single: 'Close on what the client should expect from the final design: connect this particular picture and viewing experience to the movement around and above the audience, the tonal character, and the supported bass and dynamic strengths, in this project\'s own terms rather than a general claim. Do not repeat any number, specification list or earlier sentence. Never claim a consistent overall experience for every viewer from tonal evidence. Close by bringing the design together: why these choices suit this particular cinema and what they give the client, written as the designer\'s own considered judgement rather than a summary of what the other sections have already said, and never as an announcement that the design is recommended.',
    word_limit: 200,
    requirement: 'Close on the design as a whole, using only the credibility claims the pack allows: where the pack also carries a recommendation claim it may be used, and where it does not, the closing states the design intent without one.',
  },
  {
    section: 'appendix_notes',
    title: 'Appendix Notes',
    requirement_single: 'Two brief source-only sentences: based on the frozen Project Report for this design; detailed RP22, RP23, product and room evidence is in the accompanying report. No performance claims or sales story.',
    word_limit: 200,
    requirement: 'Note the report evidence the pack was built from, with no performance claim.',
  },
]);

/** The section IDs, in order. */
export const WRITER_SECTION_IDS = Object.freeze(WRITER_SECTIONS.map((entry) => entry.section));

/** The proposal modes a frozen pack may carry. */
export const WRITER_PROPOSAL_MODES = Object.freeze(['single', 'comparison']);

/** True only for a pack the builder marked as a single-option proposal. */
export function isSingleOptionPack(mode) {
  return mode === 'single';
}

/**
 * The sections as the given proposal mode labels them. A single-option
 * proposal never carries the comparison's two headings; a comparison keeps them.
 * Section IDs, order and word limits are identical in both modes, so the
 * returned draft is the same shape either way.
 *
 * @param {string} [mode] — 'single' | 'comparison'
 */
export function writerSectionsForMode(mode = 'comparison') {
  const single = isSingleOptionPack(mode);
  return WRITER_SECTIONS.map((entry) => (single
    ? {
      ...entry,
      title: entry.title_single || entry.title,
      requirement: entry.requirement_single || entry.requirement,
    }
    : { ...entry }));
}

/** The word limit of every section, keyed by section ID. */
export function writerWordLimits() {
  return Object.fromEntries(WRITER_SECTIONS.map((entry) => [entry.section, entry.word_limit]));
}

/**
 * The section requirements the writer reads: the same sections, each with the
 * grounding rule attached, so a section can never be written without knowing
 * that every claim in it must cite a claim ID.
 */
export function writerSectionRequirements(mode = 'comparison') {
  return writerSectionsForMode(mode).map((entry) => ({ ...entry, requires_grounding: true }));
}

/** One section definition, or null. */
export function writerSection(sectionId) {
  return WRITER_SECTIONS.find((entry) => entry.section === sectionId) || null;
}

/**
 * The section set a returned draft is read against, taken from the input the
 * writer was ACTUALLY given rather than from today's contract.
 *
 * A generation filed before the contract gained presented_options still lists
 * its own sections, so it is validated — on a replay, months later — against the
 * exact agreement it was written under. A new input carries the whole contract.
 *
 * @param {Object} input — buildWriterInput output
 * @returns {Array<Object>}
 */
export function contractSectionsOf(input) {
  const listed = Array.isArray(input?.section_requirements) ? input.section_requirements : [];
  const known = listed
    .map((entry) => (entry && typeof entry.section === 'string' ? writerSection(entry.section) : null))
    .filter(Boolean);
  if (known.length === 0) return WRITER_SECTIONS.map((entry) => ({ ...entry }));
  return known.map((entry) => {
    const limit = Number(listed.find((row) => row?.section === entry.section)?.word_limit);
    return { ...entry, word_limit: Number.isFinite(limit) ? limit : entry.word_limit };
  });
}

/**
 * Whether the input carries the designer's own option guidance. When it does,
 * the draft must answer it with client-facing copy; when it does not, the
 * presented_options section is returned empty.
 */
export function inputHasOptionGuidance(input) {
  const groups = input?.option_guidance?.groups;
  return Array.isArray(groups) && groups.length > 0;
}

/**
 * The output schema as the writer is given it: JSON only, these top-level keys,
 * these per-section keys, and every section this contract requires. There is no
 * other shape.
 */
export function writerOutputSchema(mode = 'comparison') {
  return {
    mode: WRITER_OUTPUT_MODE,
    schema_version: WRITER_OUTPUT_SCHEMA_VERSION,
    top_level_keys: [...WRITER_OUTPUT_KEYS],
    section_keys: [...WRITER_OUTPUT_SECTION_KEYS],
    claim_id_prefixes: [ALLOWED_CLAIM_PREFIX, BLOCKED_CLAIM_PREFIX],
    grounding_rule: 'every client-facing claim must cite one or more allowed claim IDs in that section\'s claim_ids',
    sections: writerSectionsForMode(mode).map((entry) => ({ ...entry })),
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
  'The ranked strength stories you are given decide which engineering characteristics deserve emphasis: rank 1 is the strongest result the evidence states, and never decide for yourself which parameters matter. The ranking is not a compulsory order for the document: the design\'s own story sets the editorial order, and every story you state is stated by citing its own allowed_claim_ids.',
  'A verified ADI design interpretation is supplied in design_interpretation: the room, its intended use, the display and seating, the system architecture, the constraints, the reasons behind the design decisions, the strongest characteristics and the results that are reliable evidence. Read it and write from it. It explains the design and is never a source of figures: every figure, level, parameter and product still comes from the evidence pack and its allowed claims, the frozen evidence takes priority wherever the two differ, and where the interpretation states nothing you invent nothing.',
  'The designer\'s own brief is supplied in editorial_brief. Treat it as instructions about what to emphasise and what needs explaining. It never overrides the evidence, it never changes a figure, a level, a product or a claim, and it is never copied: no note, instruction, filename or caption from it appears in the draft.',
  'Sell what the design delivers, not how it was analysed. This is the proposal stage: state the finished design and what the client will experience, never the design-stage work that produced it.',
  'Open each story with the experience the client will have, then why they will value it, then the engineering proof. The number is the proof, never the story, so never lead a paragraph with a parameter number, a Performance Level, a channel count or a dB value.',
  'Write the section the pack asks for under its own label: where the pack is a single-option proposal it carries no comparison headings, so write the design the client is being offered and why this specification was chosen, and never write filler such as "there are no changes to report".',
  'Name the display exactly as the frozen evidence names it. Where the display is a TV, write the TV (for example 115" TV) and use it in the viewing story with the viewing angle and the front-row seating; never write a screen size, an aspect ratio, a viewable width or any projector word. A projection screen keeps its projector-screen language.',
  'Never write in the software-report register: no "assessed for", "this parameter", "according to the report", "performance result", "this proposal details", "established configuration" or "calculated design result".',
  'In a single-option proposal, never compare the design to a baseline or another option: no increase, greater, improved, more capable, additional headroom, higher output, upgrade or compared to. Describe the capability directly.',
  'The proposal describes the design that has been specified and what it will deliver. Never write as though its performance has already been demonstrated in this room: the engineering analysis is complete and frozen, and the design is proposed, specified, modelled and designed.',
  'This proposal is written before installation: write specified, selected, designed, modelled or proposed, never installed or installation, unless the frozen evidence says the system is installed.',
  'Every client-facing claim must cite one or more allowed claim IDs in that section\'s claim_ids.',
  'Where a section states what is shared and also contrasts the options, cite both: the shared-result claims for the unchanged facts and the factual-change or material-gain claims for the facts that differ.',
  'Copy every figure, Performance Level and product name exactly as the pack states it. Never round, convert, restate or estimate.',
  'Never name a product the pack does not list for the option it belongs to.',
  'Read multi_cabinet_channels: where frozen evidence specifies multiple physical cabinets reproducing one logical audio channel, explain the exact cabinet count and the one channel naturally once in the System Design Summary or specification. Attribute the arrangement to its own design in a comparison. Accept natural wording, not an equipment inventory.',
  'State supported dynamic-range benefits positively: headroom for demanding film soundtracks, controlled dynamic peaks and clear, confident presentation at the designed listening levels. Match each benefit to the frozen evidence and channel family; bass output is not bass extension, reference-position response or seat consistency.',
  'Never publish internal claim-defence, validation, testing or scoring commentary. A practical qualification the client needs is still written: when presenting seating alternatives, state that each arrangement works within the seating positions this design specifies, and never turn that into a statement about acoustic performance.',
  'Where the pack states a dual-centre screen stage, name the stage position by position: the left and right channels with their own model, and the centre with its own cabinet count and model (for example Front Left / Right: Q6-3 and Centre: 2 × C4-1 dual physical centre cabinets). Never write the three screen channels as one LCR of the left/right model, never write the centre as that model, and never write three loudspeakers of it: the centre is two physical cabinets fed from one centre channel, and the layout is unchanged.',
  'Where the pack supplies option guidance, that guidance is the designer\'s instruction and never copy: write your own polished client-facing prose from it, and never reproduce a note, an instruction or a filename in the draft. Where the pack supplies no option guidance, return the presented_options section as an empty string and write nothing into it.',
  'Present seating and layout options as practical alternatives within ONE design. Say what each arrangement gives the room in terms of comfort, seating style, appearance and the practical arrangement of the space, that each arrangement works within the seating positions this design specifies, and that the final choice rests on comfort and personal preference. Where the pack states the seating dimensions, the sightlines or the clearance around the loudspeakers, use them; never invent one. Never say or imply that the options give identical, unchanged or equivalent acoustic performance, never write an acoustic-performance qualification of your own, and never make a performance claim or a performance difference of a seating choice: where the copy states something about an area of the evidence it cites the allowed claim that supports it.',
  'Never present a claim the pack blocks, and never describe a shared result as a change or a gain.',
  'Never recommend changing the design, and never describe the proposal as an upgrade path.',
  'Never reference an assumed or administrative check (P8 upfiring/elevation speakers, P15 background noise floor, P21 early reflections): where the pack records one as requested, state it once, label it as an assumption, and never use it as a result or a differentiator.',
  'Where P20 does not support seat-to-seat bass consistency, describe bass only as output authority, physical capability and the subwoofer specification.',
  'State a primary-seat or a secondary-seat result only where the pack states that scope\'s own claim, word it for that scope alone, and never present it as a result for the seating area or the room.',
  'Sell what is strong: state a supported strength positively and stop there, and where one scope is the stronger, keep the claim to that scope rather than reporting the weaker one beside it.',
  'The proposal is not a design review: never write that something needs attention, improvement, calibration, optimisation or further design work, and never suggest a future correction, a recalibration or an upgrade path.',
  'Write to the client: benefit-led, dealer-safe language, with no internal parameter codes and no engineering jargon.',
  'No sentence of 10 or more words may appear verbatim in more than one section. Do not reuse complete evidence sentences with minor word substitutions. Facts may recur only for a genuinely different editorial purpose.',
  'Give each section its own job, and never carry the same three strengths through the document in the same words: Design Summary introduces the cinema; Design Overview explains how the system is arranged; Why This Specification explains why this solution suits the project; Key Performance Highlights sets out the engineering evidence; Spatial Resolution explains how the layout creates the immersion; Dynamic Range explains the capability and what it buys; Timbre Matching explains the tonal benefit; Overall Design closes on what the client should expect. Review the proposal as ONE document: every section contributes something the others do not, the closing Overall Design never restates the opening summary, and a repeated idea is acceptable only where it adds a genuinely different aspect of the design.',
  'Use each engineering figure normally once in main prose. Keep output figures in Dynamic Range, viewing angles in Spatial Resolution and extension proof where it explains deep bass. Repeat only where it adds real value, never in Overall Design.',
  'Never write L1, L2, L3, L4, L4 result or RP22 Level 4 in narrative prose. Never write (OH); write overhead channels. Structured grading tables and pills are not narrative prose.',
  'Tonal consistency across seats supports only tonal character, and it is stated for the speaker group and the seats its own result covers: never broaden it into equal seats, overall experience balance, bass consistency, placement consistency or whole-room balance, and never write it as a match between the screen, surround and overhead loudspeakers.',
  'Use the ranked story as evidence, not as a sentence to read aloud. Translate its meaning into natural client language while retaining its scope, exact facts and claim IDs.',
  'Keep Appendix Notes brief, factual and source-only: this proposal is based on the frozen Project Report for this design, with detailed RP22, RP23, product and room evidence in the accompanying report. No sales story, acoustic-treatment performance promise or engineering-model explanation.',
  'Close on this design\'s particular viewing experience, movement, tonal character and bass capability, not treats every seat as a priority, balances high-resolution spatial imaging with authoritative bass performance, high-quality experience for everyone or immersive and consistent experience for the home.',
  'Tell the story, never the mechanism. Never use a channel count as a selling point ("5 discrete channels"), never name a feature or a layer the design does not include ("no overhead channels are specified"), and never explain how a mechanism works: no "reproduce the system\'s low-frequency content", and no account of what nearby walls, reflections or room modes do. Keep an exact boundary distance, a spacing, an angle and any other parameter number out of the Design Summary, the Design Overview, Key Performance Highlights and the closing narrative, where the client is reading a design explanation rather than a measurement. Say what the client hears, and let the evidence support that account rather than become it.',
  'Keep every paragraph to one to three sentences, and keep every section inside its word limit.',
  'Explain what each recorded result means for the room, rather than naming the number and moving on.',
  'Where the brief asks for a result the pack carries as a supporting_result claim, state it in the section it belongs to, at exactly the scope, value and prediction status that claim carries, and cite its claim ID. A supporting result answers the client\'s own request: it is never presented as a strength, a headline or a comparison, and is never moved to a wider scope.',
  'No contents sentence ("the following sections explain"), and no generic closing about the design as a whole: finish on what this particular cinema gives the client, and never repeat a benefit another section has already made.',
  'Explain the professional judgement behind the design where the design_philosophy block records it: what the client wants to achieve, the prioritised listening positions, the display and seating balance, the constraints, the coverage and bass approaches, the strongest results, the lower results that are conscious trade-offs, and why the finished design suits the brief. Never invent a reason, a priority, a budget or a decision the interpretation does not record.',
  'The best design is the one that most effectively satisfies the brief while balancing performance, practicality, aesthetics and cost, so a result below the highest available level is a legitimate design decision rather than a failure. Never present the highest available level as the objective regardless of cost or practical consequence, and never treat a higher price as better value on its own.',
  'Value-engineering opportunities are internal reasoning, never copy: where the design already takes one, say what it gives the client; where one remains a design choice, say nothing about it. Never write an opportunity as an instruction to change the finished design, a next step, a future correction or an upgrade path.',
  'Where the copy expresses the design team\'s own judgement or recommendation, write we or our. The engineering facts themselves stay stated as fact, we never stands in the place of a measured result, and no conversation, a meeting, a site visit or a client instruction the brief does not state is ever implied. Use it naturally and selectively, for example "We have prioritised", "Based on our understanding of the brief" or "In our experience with rooms like this", and never announce a recommendation: no "Our recommendation is" and no "We recommend".',
  'Never infer that a design change improved a parameter unless the assessment supports it, never imply that every seat performs identically, and never state a benefit the evidence does not carry.',
  'Never use an em dash (U+2014) anywhere in client-facing copy: punctuate the sentence another way or rewrite it naturally, and never alter a figure, a product identifier or an evidence reference while doing so. The draft carries zero em dashes.',
  'Vary sentence structure and paragraph length, prefer direct active language, and use natural transitions. Never begin a sentence with Furthermore, Moreover, Additionally, Subsequently, In conclusion or It is important to note that, never open paragraph after paragraph on The system, The design, This ensures or The result, and never force a contraction into a formal passage.',
  'Never use a generic marketing phrase ("sophisticated cinematic experience", "seamless immersive sound", "unparalleled performance", "delivers exceptional immersion", "elevates the listening experience", "brings everything together"): replace it with a project-specific explanation of what was chosen, why it suits this room, what the client gains and what the engineering supports, and never invent a reason to do it.',
  'Before returning, read every section together as one document and refine the wording where it does not sound like a real cinema designer, where a sentence adds nothing, where a benefit is repeated, where a qualification is excessive or where the design intent is unclear. Never print that review, a note about a change or any explanation of your own editing.',
  'Return structured JSON only, in every section this contract requires, with no extra fields and no commentary.',
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