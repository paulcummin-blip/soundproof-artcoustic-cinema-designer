/**
 * clientNarrativePriority.js (shared)
 * -----------------------------------
 * THE ADI CLIENT NARRATIVE PRIORITY.
 *
 * One writing priority, shared by every client-facing surface that already reads
 * the Sound Proof writing authority:
 *   - the Project Report Design Intent and its client-facing interpretation
 *   - the Proposal (System Design Summary, Spatial Resolution, Dynamic Range,
 *     Timbre Matching, Overall Design and the Key Performance explanatory copy)
 *   - the ADI Improve Wording editorial pass, in its own condensed form
 *
 * It states WHERE A CLIENT PARAGRAPH STARTS: with what the room is designed to
 * deliver, then how the room, the screen and the seating support it, then how the
 * loudspeaker and bass arrangement supports that, and only then the engineering
 * evidence that proves it. RP22 is the evidence beneath the story; it is never
 * the structure of the story.
 *
 * This is a WRITING PRIORITY and nothing else. It adds no fact, no figure, no
 * level, no product, no scope and no reason. Every grounding, blocked-claim,
 * evidence, product, approval and validation rule that already governs these
 * documents still stands exactly as it is, and the validator still refuses a
 * claim the frozen evidence does not support.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/**
 * THE CORE PRIORITY. Experience outward, evidence beneath.
 */
export const CLIENT_NARRATIVE_PRIORITY = [
  '=== CLIENT NARRATIVE PRIORITY (experience, then design, then evidence) ===',
  '',
  'Write from the client experience outward. The narrative hierarchy is fixed, and it is never inverted:',
  '1. What the room is designed to deliver.',
  '2. How the room, the screen and the seating support that experience.',
  '3. How the loudspeaker and bass arrangement support it.',
  '4. Spatial Resolution.',
  '5. Dynamic Range.',
  '6. Timbre Matching.',
  '7. The strongest engineering evidence.',
  '8. The relevant constraints and trade-offs.',
  '9. Equipment detail, only where it explains a design decision.',
  '',
  'RP22 and RP23 are the engineering evidence beneath the story. They are not the client story, and a parameter-by-parameter walk through the evidence is never the shape of a client-facing section.',
  '',
  'ROOM DESIGN IS PART OF THE SYSTEM',
  'Performance in this room is shaped by the room dimensions, the screen size, the seating position, the row spacing, the riser and ear heights, the ceiling height, the loudspeaker positions, the subwoofer positions, the treatment and the architectural constraints. Never write as though the equipment list alone creates the result. Explain the relationship between them.',
  'WEAK: "A 120-inch screen has been specified."',
  'BETTER: "The screen size and the seating distances have been considered together to give the room strong cinematic picture scale."',
  '',
  'DECISION, THEN REASON, THEN CLIENT CONSEQUENCE',
  'For an important design decision, prefer: the decision, why it was made, and what it means for the client.',
  'WEAK: "The rear row is 1.6 m high."',
  'BETTER: "The rear row is raised to maintain sightlines while keeping the seating and overhead geometry working together."',
  'State a reason ONLY where the current project evidence, a current project clarification or approved learned ADI design knowledge supports it. Where no reason is recorded, state the design and its result and give no reason at all. A plausible-sounding reason is never a substitute for a recorded one.',
  '',
  'THE THREE CLIENT PILLARS REMAIN THE STRUCTURE',
  '- SPATIAL RESOLUTION: where sound is placed, and how naturally it moves around and above the audience.',
  '- DYNAMIC RANGE: the difference between quiet detail and demanding peaks, and whether the system has the capability to reproduce both convincingly.',
  '- TIMBRE MATCHING: whether voices, instruments and effects keep a familiar tonal character as they move between loudspeakers and across the assessed seating.',
  'These remain the primary structure for explaining sound quality. They are never replaced by a parameter-by-parameter narrative.',
  '',
  'WHAT THE ENGINEERING BUYS THE CLIENT',
  'Where the current design or approved ADI design knowledge supports it, help the reader understand what the engineering buys them: screen and seating coordination giving picture scale; front wides giving continuity between the screen stage and the side stage; six overheads giving front, middle and rear height continuity across multiple rows; seating away from the rear wall giving better loudspeaker geometry and fewer boundary problems; multiple subwoofers giving improved control and consistency; output headroom giving soundtrack scale without strain; tonal consistency giving a familiar character across seats and speaker groups.',
  'Add none of these unless the current design or approved ADI design knowledge supports them.',
  '',
  'PLAIN LANGUAGE',
  'Write so a homeowner, an architect, an interior designer or a builder can understand why the result matters without knowing what P5, P10, P19 or P20 means. A parameter number may appear where it is specifically useful in an evidence table. Narrative prose never depends on parameter numbers to explain the design.',
].join('\n');

/**
 * THE SEAT HONESTY RULE. Never imply that every seat performs identically unless
 * the evidence actually states it.
 */
export const CLIENT_SEAT_HONESTY_RULE = [
  '=== SEAT PERFORMANCE (never imply identical seats) ===',
  'Never imply that every seat performs identically unless the actual evidence supports that statement.',
  'Where performance varies: prioritise the designated Primary seats; explain Secondary-seat variation honestly; do not let one weaker Secondary seat make the whole design sound unsuccessful; and do not hide meaningful variation.',
  'PREFER: "Performance is strongest across the primary seats, with greater variation towards the outer secondary positions."',
  'NOT: "All seats provide the same experience."',
  'NOT: "The room fails because one secondary seat is weaker."',
].join('\n');

/**
 * THE TRADE-OFF RULE. A real constraint is a considered design decision, never an
 * apology.
 */
export const CLIENT_TRADE_OFF_RULE = [
  '=== TRADE-OFFS ARE DESIGN DECISIONS, NOT APOLOGIES ===',
  'Present a real constraint as a considered design decision.',
  'Never write: "Unfortunately", "Sadly" or "The design fails to".',
  'PREFER: "The rear row sets the practical limit on surround spacing, so the design prioritises strong coverage across the primary seats while retaining useful performance throughout the second row."',
  'Make a statement of that kind only where the project evidence supports it.',
].join('\n');

/**
 * THE EVIDENCE LANGUAGE RULE. Specific relationships instead of superlatives, and
 * a predicted design result that is never turned into a finished measurement.
 */
export const CLIENT_EVIDENCE_LANGUAGE_RULE = [
  '=== EVIDENCE, NOT SUPERLATIVES ===',
  'Prefer a specific relationship and the measured or predicted evidence over generic praise.',
  'Avoid exceptional, remarkable, incredible, highly immersive, perfect, premium, world-class, powerful capability and considerable reserve unless the evidence and the agreed Sound Proof vocabulary specifically justify them.',
  'PREFER: "The screen channels provide substantial headroom for dialogue, music and major on-screen effects."',
  'NOT: "The system delivers exceptional cinema performance."',
  '',
  'DESIGN TARGET AND FINISHED MEASUREMENT',
  'Keep the language technically accurate: designed to, predicted, calculated, modelled and specified capability are the words for a design result. Never turn a predicted design result into a measured claim about a finished room.',
  'Maintain that distinction quietly through accurate wording. Do not repeat calibration or verification disclaimers through the client narrative: this is a design and sales document, and a disclaimer added after every capability is not an improvement.',
].join('\n');

/**
 * THE EQUIPMENT RULE. The design leads; equipment explains a decision.
 */
export const CLIENT_EQUIPMENT_RULE = [
  '=== EQUIPMENT SUPPORTS THE STORY ===',
  'Never lead general client copy with a model and quantity list.',
  'Use an equipment name only where it explains a specific design decision, where it is important to the client understanding, or where the section is specifically about the specification.',
  'The client should understand that this is an engineered room design, not an equipment shopping list.',
].join('\n');

/**
 * THE GROUNDING RULE, restated for this priority. It permits no new invention in
 * exchange for a better narrative.
 */
export const CLIENT_NARRATIVE_GROUNDING_RULE = [
  '=== THE GROUNDING RULE (unchanged and absolute) ===',
  'Do not invent a client priority, a room-use reason, an equipment-selection rationale, a seating rationale, an acoustic rationale, a benefit or a compromise.',
  'Where a useful reason is not available, either omit it, or it belongs to the existing clarification and ADI design-knowledge workflow. Never fill the gap with plausible-sounding copy.',
].join('\n');

/**
 * THE SECTION EMPHASIS. Each client-facing section answers one client question.
 * This states which question, and the order in which the answer is built. It
 * changes no section structure, no word limit and no evidence rule: it decides
 * what the section's own copy leads on.
 */
export const CLIENT_SECTION_EMPHASIS = Object.freeze([
  {
    section: 'system_design_summary',
    label: 'System Design Summary (Design Summary / Design Overview / Why This Specification)',
    answer: 'What has been designed for this room, and why does it suit it?',
    priority: [
      'the room, the picture and the seating',
      'the system architecture',
      'the main design decisions',
      'why those decisions suit this brief',
    ],
    limit: 'It is never an RP22 summary.',
  },
  {
    section: 'spatial_resolution',
    label: 'Spatial Resolution',
    answer: 'How does sound occupy and move through the room?',
    priority: [
      'screen anchoring',
      'the wides and the surrounds',
      'the rear soundfield',
      'overhead movement',
      'the seat geometry that matters to the spatial result',
      'the viewing relationship only where it supports the spatial story',
    ],
    limit: '',
  },
  {
    section: 'dynamic_range',
    label: 'Dynamic Range',
    answer: 'Can the system move convincingly from quiet detail to demanding peaks?',
    priority: [
      'the screen stage',
      'the surrounding channels',
      'the bass capability',
    ],
    limit: 'Dynamic Range is treated as a whole-system story and never as a bass-only story.',
  },
  {
    section: 'timbre_matching',
    label: 'Timbre Matching',
    answer: 'Does the tonal character remain familiar as sound moves and as listeners change seats?',
    priority: [
      'the screen group',
      'the surround and overhead group',
      'the primary and secondary seats where the evidence supports them',
    ],
    limit: 'Never imply that every speaker group measures identically.',
  },
  {
    section: 'overall_design',
    label: 'Overall Design',
    answer: 'Why is this the right overall design for this room and this brief?',
    priority: [
      'the picture',
      'the seating',
      'the sound',
      'the strongest design strengths',
      'the important practical compromise where one is relevant',
    ],
    limit: 'This is the professional closing judgement: it does not repeat all the preceding results, and it ends with confidence rather than marketing language.',
  },
  {
    section: 'key_performance_highlights',
    label: 'Key Performance Highlights',
    answer: 'What does the strongest evidence give this cinema?',
    priority: [
      'the experience the result protects',
      'the result that supports it',
    ],
    limit: 'The explanatory wording says what the result gives the room, never what the parameter is called.',
  },
  {
    section: 'design_intent',
    label: 'Design Intent',
    answer: 'What is this cinema for, and why is it built this way?',
    priority: [
      'what the room is designed to deliver',
      'how the room, the screen and the seating support it',
      'how the loudspeaker and bass arrangement supports it',
      'the strongest evidence behind it',
    ],
    limit: 'The equipment supports the story; it never opens it.',
  },
]);

/**
 * The emphasis for the named sections, as prompt lines. Sections the caller does
 * not name are not printed, so a surface only reads what it writes.
 *
 * @param {Array<string>} sections
 * @returns {Array<string>}
 */
export function clientSectionEmphasisLines(sections = []) {
  const wanted = new Set((Array.isArray(sections) ? sections : []).map((entry) => String(entry)));
  const lines = ['=== WHAT EACH SECTION ANSWERS (and what it leads on) ==='];
  let printed = false;

  for (const entry of CLIENT_SECTION_EMPHASIS) {
    if (!wanted.has(entry.section)) continue;
    printed = true;
    lines.push(
      `${entry.label.toUpperCase()}`,
      `Question it answers: ${entry.answer}`,
      `Lead on, in this order: ${entry.priority.join(', then ')}.`,
    );
    if (entry.limit) lines.push(`Limit: ${entry.limit}`);
  }

  return printed ? lines : [];
}

/**
 * THE WRITING SMELL TEST. Run privately before returning client copy. It is a
 * reasoning check, never printed, never answered in order.
 */
export const CLIENT_NARRATIVE_SMELL_TEST = Object.freeze([
  'Would an experienced cinema designer actually say this to a client?',
  'Does it explain WHY the design works, not simply WHAT is installed?',
  'Is the experience clear before the technical evidence?',
  'Can a non-technical client understand why the important evidence matters?',
  'Does it avoid pretending every seat is identical?',
  'Are constraints described honestly without making the whole design sound unsuccessful?',
  'Has generic promotional language been replaced by project-specific meaning?',
  'Does the copy sound like a considered room design rather than an equipment list?',
]);

/**
 * The whole priority as one block: the core priority, the seat, trade-off,
 * evidence, equipment and grounding rules, and the section emphasis the caller
 * names.
 *
 * @param {Object} [options]
 * @param {Array<string>} [options.sections] — the sections this surface writes
 * @returns {string}
 */
export function buildClientNarrativePriorityBlock({ sections = [] } = {}) {
  const emphasis = clientSectionEmphasisLines(sections);
  return [
    CLIENT_NARRATIVE_PRIORITY,
    '',
    CLIENT_SEAT_HONESTY_RULE,
    '',
    CLIENT_TRADE_OFF_RULE,
    '',
    CLIENT_EVIDENCE_LANGUAGE_RULE,
    '',
    CLIENT_EQUIPMENT_RULE,
    '',
    ...(emphasis.length > 0 ? [...emphasis, ''] : []),
    CLIENT_NARRATIVE_GROUNDING_RULE,
  ].join('\n');
}

/**
 * THE EDITORIAL FORM, for the ADI Improve Wording pass.
 *
 * An editorial pass rewrites meaning that is already settled, so its version of
 * this priority is narrower: it may lead with an experience the copy already
 * states, and it may never introduce an experience, a reason, a benefit or a
 * consequence the copy does not already carry. Reordering emphasis inside the
 * existing meaning is the improvement; inventing one is the failure.
 */
export const ADI_NARRATIVE_EMPHASIS = [
  'NARRATIVE PRIORITY (how to order the meaning that is already here)',
  '  - Where the copy states both an experience and the evidence behind it, lead with the experience and let the evidence confirm it.',
  '  - Where the copy states a design decision and its reason, keep the decision, the reason and what it means for the client together and in that order.',
  '  - Where the copy explains the room, the screen or the seating, keep the relationship between them; do not reduce it to a bare measurement.',
  '  - Where the copy states a constraint, keep it as a considered design decision, never as an apology.',
  '  - Where the copy distinguishes the primary seats from the others, keep that distinction and never widen it into every seat.',
  '  - Keep Spatial Resolution, Dynamic Range and Timbre Matching as the three sound stories; never rebuild the copy as a parameter walk.',
  '  - Remove a superlative the evidence in the copy does not carry, and state the specific relationship in its place.',
  '  - Never open on an equipment list. Where a model name already appears, keep it where it explains a decision and let the design lead.',
  '',
  'WHAT THIS PRIORITY MAY NEVER DO',
  '  - It may not add an experience, a benefit, a reason, a consequence, a priority or a compromise the copy does not already state.',
  '  - It may not move a fact, a figure or a limitation out of the copy to make the narrative flow better.',
  '  - Where the copy states no reason for a decision, the improved copy states none either.',
].join('\n');

export default buildClientNarrativePriorityBlock;