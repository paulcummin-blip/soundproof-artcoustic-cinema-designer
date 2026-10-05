/**
 * reportWritingStyleContract.js (shared)
 * --------------------------------------
 * The fixed writing contract for the client-facing System Design reports
 * (System Design Summary and System Design Comparison).
 *
 * This is a CONTRACT, not a preference. Every AI-generated System Design report
 * prompt MUST include it, for first-draft generation and for section
 * regeneration, so the generated prose always reads the same way.
 *
 * It is appended to the prompt AFTER the engineering data has been assembled and
 * immediately BEFORE the model writes, so it is the last thing the model reads.
 * It also instructs the model to run a final self-check before returning.
 *
 * VOICE: designer-led and room-focused. The report reads as a professional
 * design proposal written by the experienced cinema designer who designed the
 * room: it explains the room, the design choices and the expected experience,
 * and the subject of a sentence is the room, the design, the system, the
 * seating area or the listening result. It is never addressed to the client as
 * "you". This differs from NEUTRAL_VOICE_RULES (the internal AI Client Summary
 * and the Visual Report), which is third-person too but records the design
 * rather than proposing it. Those surfaces are unchanged;
 * buildWritingStyleContract() is only used by the System Design reports.
 *
 * The contract governs prose only. It never changes engineering values, table
 * values, RP22/RP23 levels, Design Ratings or product names: Sound Proof builds
 * every table value from calculated data, and the AI writes the words around it.
 *
 * Pure: no React, no side effects, no runtime-specific APIs. Safe to import
 * from any backend function.
 */

import { PROPOSAL_STAGE_BOUNDARY } from './proposalStageBoundary.js';
import { P20_USE_RULE, P20_OMIT_RULE } from './adiReportEvidenceRules.js';
import { SOUND_PROOF_WRITING_AUTHORITY, WRITING_AUTHORITY_SELF_CHECK } from './soundProofWritingAuthority.js';
import { buildHighChannelContractBlock } from './highChannelDensityRule.js';

/** Banned words and phrases. Never used in generated prose. */
export const BANNED_WORDS = [
  'Elevate',
  'Delve',
  'Hustle and bustle',
  'Revolutionize',
  'Revolutionary',
  'Foster',
  'Realm',
  'Remnant',
  'Subsequently',
  'Nestled',
  'Enigma',
  'Whispering',
  'Sights unseen',
  'Sounds unheard',
  'A testament to',
  'Dance',
  'Metamorphosis',
  'Indelible',
  'Leverage',
  'Synergy',
  'Synergize',
  'Scalable',
  'Optimize',
  'Optimise',
  'Empower',
  'Innovative',
  'Disruptive',
  'Robust',
  'Seamless',
  'Holistic',
  'Cutting-edge',
  'Next-generation',
  'User-centric',
  'Agile',
  'Dynamic',
  'Frictionless',
  'Value-driven',
  'Data-driven',
  'Scalability',
  'Mission-critical',
  'Thought leadership',
  'Turnkey',
  'Paradigm shift',
  'Game-changer',
  'Game changer',
  'Ecosystem',
  // The author's banned list. If a sentence sounds like marketing, rewrite it.
  'Paradigm',
  'Game-changing',
  'Best-in-class',
  'Best in class',
  'Utilise',
  'Utilize',
  'Transformational',
  'Immersive experience',
  'Deep dive',
  'Move the needle',
  'Circle back',
  'Actionable insights',
  'Ideation',
  'Pain point',
  'Deliverables',
  // Report copy: claims that read as marketing rather than as design
  // explanation, and section labels that are never a real section.
  'Reference-grade',
  'Reference grade',
  'Fluidly',
  'Unified approach',
  'Future considerations',
  'Fully immersive',
  'Truly cinematic',
  'Quick win',
  'Elevator pitch',
  'Framework',
  'Drill down',
  // Vague or inflated phrasing. The report explains, it never inflates.
  'Next level',
  'Premium experience',
  'Ultimate experience',
  'Unparalleled',
  'World-class',
  'World class',
  'State of the art',
  'It is important to note',
  'In conclusion',
  'To sum up',
  'Not just X, but Y',
  // Claims that read as a brochure rather than a design explanation.
  'Reference-style',
  'High-performance foundation',
  'Expansive audio',
  'Unified sound',
  // Over-used, unspecific language flagged against the approved tone references.
  'Convincing sense of movement',
  'Future-proof',
  'Future-ready',
  'Future proof',
  'Future ready',
  'Generic upgrade',
];

/**
 * The subjects a System Design sentence is written about. The client is never
 * one of them: the report explains the room and the design, it does not talk to
 * the client.
 */
export const DESIGN_LED_SUBJECTS = [
  'the room',
  'the design',
  'the system',
  'the seating area',
  'the experience',
  'this layout',
  'the result',
];

/**
 * Constructions blocked by default in System Design prose: direct address to
 * the client and the first-person design voice. Used by the copy audit, and
 * stated in the contract so the model never writes them.
 */
export const DESIGN_LED_BLOCKED_PHRASES = [
  'you',
  'your',
  "you'll",
  'you will',
  'we designed',
  'we recommend',
];

/**
 * THE DESIGN INDEX IS INTERNAL. It is a designer diagnostic, never a
 * client-facing result: it is not mentioned in proposal copy, not a Key
 * Performance Highlights row, not evidence in a System Design Summary or
 * Comparison, and never expressed as a percentage.
 *
 * These two rules are the contract's hard rules, stated exactly as approved.
 */
export const DESIGN_INDEX_HARD_RULES = [
  'Never mention Design Index in client-facing proposal copy. Design Index is an internal designer diagnostic and must remain internal.',
  'Never express Design Index as a percentage in proposal copy.',
].join('\n');

/**
 * The Design Index scope rule, stated exactly as approved. Carried by the shared
 * contract so every report surface reads the same rule: the index is not
 * proposal evidence, and in the Technical Report it is an internal technical
 * diagnostic that is never expressed as a percentage.
 */
export const DESIGN_INDEX_SCOPE_RULE = 'Design Index is not client-facing proposal evidence. It must not appear in proposal summaries or proposal comparisons. It may appear in the Technical Report only as an internal technical diagnostic, and never as a percentage.';

/**
 * The names and shapes that would give the internal Design Index away in
 * client-facing copy. Shared by the evidence builder, the table row builders and
 * the frontend row guard, so the exclusion has one authority.
 */
export const DESIGN_INDEX_BANNED_TERMS = [
  'Design Index',
  'Design Performance Index',
  'Design Score',
  'Design Rating',
  'Primary score',
  'Primary index',
  '(Primary)',
];

/** True when a client-facing row is about the internal Design Index. */
export function isDesignIndexRow(row) {
  if (!row) return false;
  const key = String(row.key || '').trim().toLowerCase();
  if (key === 'dpi' || key.startsWith('dpi_') || key === 'design_index') return true;
  const label = `${row.area || ''} ${row.label || ''}`.toLowerCase();
  return DESIGN_INDEX_BANNED_TERMS.some((term) => label.includes(term.toLowerCase()));
}

/**
 * True when client-facing copy names the internal Design Index, or states a
 * design result as a percentage.
 *
 * Used by the regeneration path (so refining an older section removes the
 * mention instead of preserving it) and by the copy guard tests.
 */
export function mentionsDesignIndex(text) {
  const source = String(text || '').toLowerCase();
  if (DESIGN_INDEX_BANNED_TERMS.some((term) => source.includes(term.toLowerCase()))) return true;
  return /\b\d+(?:\.\d+)?\s*(?:%|per ?cent)/.test(source);
}

/**
 * The designer-led, room-focused voice for the System Design reports. Mandatory.
 *
 * The reader may be a homeowner, an architect, an interior designer or a
 * project manager. They are intelligent and they are not engineers. The report
 * is a design proposal written by the designer who designed the room, not a
 * message to the client and not a technical audit.
 */
export const DESIGN_LED_VOICE_RULES = [
  'VOICE: DESIGNER-LED AND ROOM-FOCUSED (mandatory, applies to every sentence):',
  'The report should read as a professional design proposal written by an experienced cinema designer. It should explain the room, the design choices and the expected experience. It should not speak directly to the client as "you" unless quoting or referencing a clearly client-specific requirement.',
  '- Write as the experienced residential cinema designer who designed this room, explaining the room, the design decisions and the listening result.',
  '- The subject of a sentence is the room, the design, the system, the seating area, the screen wall, the experience, the design intent or the listening result. It is never the client.',
  '- Write in the active voice. Keep sentences short and natural.',
  '- Assume an intelligent reader. Never talk down, never over-explain an obvious result, and never explain what a result is when you can explain what it means.',
  '- Never write like a marketer, a consultant, an AI or an engineering specification.',
  '- Never write like a detached technical audit either: the report explains the design intent and what it delivers, it does not only record the supplied results.',
  '- Calm, confident, measured, practical, grounded. Positive where the design supports it.',
  '',
  'PREFERRED CONSTRUCTIONS (write like this):',
  '- "The room is designed around ...", "The system uses ...", "The seating area benefits from ..."',
  '- "The design improves ...", "This layout gives the room ...", "The result is ..."',
  '- "The experience should feel ...", "The main compromise is ...", "The speaker choice supports ..."',
  '',
  'SUBJECTS (use these as the subject of a sentence):',
  DESIGN_LED_SUBJECTS.map((subject) => `- ${subject}`).join('\n'),
  '',
  'NEVER USE THESE IN GENERATED PROSE (blocked by default):',
  DESIGN_LED_BLOCKED_PHRASES.map((phrase) => `- "${phrase}"`).join('\n'),
  '- Any other direct address to the client, and any possessive form of it.',
  '- Never state a design decision or a recommendation in the first person: not "we designed", not "we recommend", not "we selected".',
  '- Practical observation is the one permitted first person, and it is welcome: "We have found that rooms like this...", "In our experience...". It describes what experience has shown about a room like this one; it never states what the design should be.',
].join('\n');

/**
 * Neutral professional voice: the mandatory voice rules for the surfaces that
 * describe a design in the third person (the internal AI Client Summary and the
 * Visual Report). Unchanged, and not used by the System Design reports.
 */
export const NEUTRAL_VOICE_RULES = [
  'NEUTRAL VOICE (mandatory, applies to every sentence):',
  '- Write in the third person. Address the document, never the reader: no "you", "your", "yours" or "you will".',
  '- Name the subject directly: "The cinema", "The room", "The screen", "The system", "The design".',
  '- Describe experience through listeners: "Listeners will hear ...", "Across the seating area ...", "This can be improved ...".',
  '- "The screen" is always used, never "your screen". "The cinema" replaces "your cinema" and "the room" replaces "your room".',
  '- Never write "your cinema", "your room", "your screen", "your system", "you will hear", "you can improve" or "where you sit".',
  '- Keep the tone professional and human. Neutral is not cold: the reader still understands exactly what the design delivers.',
].join('\n');

/**
 * Legacy personal phrasings and the neutral wording that replaces them.
 * Used by the copy audit to measure second-person language in the surfaces that
 * remain neutral (the AI Client Summary and the Visual Report).
 */
export const NEUTRAL_VOICE_SUBSTITUTIONS = [
  ['your cinema', 'the cinema'],
  ['your room', 'the room'],
  ['your screen', 'the screen'],
  ['your system', 'the system'],
  ['you will hear', 'listeners will hear'],
  ['you can improve', 'this can be improved'],
  ['where you sit', 'across the seating area'],
  ['you hear', 'listeners hear'],
];

/**
 * The writing rules the model must follow, in report order: what the report is
 * for, the design philosophy, the priorities, how to treat products, room
 * constraints, value and performance, the Design Index exclusion, language and
 * the final self-check.
 */

const TONE_REFERENCE = [
  '=== TONE (matched against approved earlier summaries, do not deviate) ===',
  'Write like an experienced cinema designer explaining the room to a client. Not like marketing copy, not like a consultant, not like a generic AI proposal, not like a brochure or a sales deck.',
  'Target: clear, direct, practical, grounded, technically credible, positive where supported, honest about limitations.',
  'The approved earlier summaries work because they start with the actual room, screen and system; explain why the system suits that room; use RP22/RP23 evidence only when it helps the client understand the design; highlight positives without overstating; explain compromises calmly; use short, direct paragraphs; and avoid generic premium language.',
  '',
  'REPLACE GENERIC CLAIMS WITH SPECIFIC DESIGN LOGIC:',
  '- Instead of "The system provides a convincing sense of movement," write: "Fifteen discrete channels give the processor real loudspeaker positions around and above the audience. This helps effects move through the room rather than jumping between widely spaced speakers."',
  '- Instead of "The room delivers a reference-style experience," write: "The screen and loudspeaker layout give this room the scale of a dedicated cinema, particularly through the central seats."',
  '- Instead of "The system is designed for future growth," write only if relevant: "If more output is required later, the natural upgrade would be to move further up the same loudspeaker family while keeping the room layout intact." Otherwise omit the point.',
  '',
  '=== SYSTEM DESIGN SUMMARY OPENING (mandatory shape) ===',
  'The opening paragraphs must be concrete to this project before any evaluative language. Cover, using the real project values and in this rough order: screen size and format, system layout (configuration and channel count), seating arrangement, the main loudspeaker families used, and what the design is trying to achieve for this specific room. Only after that may the prose characterise the result.',
].join('\n');

const WHAT_THE_REPORT_MUST_ANSWER = [
  '=== WHAT THE REPORT MUST ANSWER ===',
  'Explain the design. The numbers support the story. They are not the story.',
  'By the end of the report the client should be able to answer:',
  '1. What has been designed?',
  '2. Why has it been designed this way?',
  '3. What will the client experience?',
  '4. Where is the design strongest?',
  '5. What limitations come from the room, the budget or the brief?',
  '6. What sensible upgrade or alternative exists, if relevant?',
].join('\n');

const DESIGN_PHILOSOPHY = [
  '=== DESIGN PHILOSOPHY ===',
  '- Always describe the room as one complete system. Screen size, seating position, viewing distance, speaker layout, loudspeaker choice, subwoofer placement, Dynamic Range, Spatial Resolution and Timbre Matching all influence each other.',
  '- Never present the report as an equipment list.',
  '- Never present RP22 as the story.',
  '- Never translate parameters one by one.',
  '- The central message of every section: every major design decision has a reason, and the components were selected to work together.',
].join('\n');

const PRIORITIES = [
  '=== PRIORITIES (cover these in every report) ===',
  '- what matters most in this room',
  '- why the selected design makes sense',
  '- what the investment delivers',
  '- what the client gains from the chosen specification',
  '- where the main compromises are',
  '- what could be improved later',
].join('\n');

const CHALLENGE_ASSUMPTIONS = [
  '=== HONEST EXPLANATION, NOT REDESIGN ===',
  '- Explain the selected design honestly, including a real limitation, without reopening the design. This report is written after the design is complete.',
  '- Where the calculated evidence shows a limitation, state what causes it and what it means in the room. Never offer an alternative layout, an added product or a different approach as a correction to the design that was selected.',
  '- A 5.1 system can be described as clean, simple and credible for its budget. Never imply it performs like a full immersive system.',
  '- If a room has two seating rows and the front row is clearly stronger, say so.',
  '- If a four-subwoofer design materially improves consistency across seats, explain that the benefit is control and consistency, not simply more bass.',
  '- If a large screen needs careful projector selection, say so clearly.',
  '- If a lower-cost option keeps the same tonal consistency but gives up Dynamic Range, explain that trade-off plainly.',
  '- If a higher specification is genuinely stronger, explain what the extra investment buys.',
  '- Where a result is Level 1 or Level 2, never present it as a strength: say plainly what it gives the room and what limits it, and never call it excellent, outstanding or ideal.',
].join('\n');

const THEMES = [
  '=== THE THREE THEMES (the report is built around these) ===',
  'Build every section around Spatial Resolution, Dynamic Range and Timbre Matching. Use RP22 results only as evidence inside those themes.',
  'Spatial Resolution: how the system places sound around and above the listener. Relevant evidence where it helps the client understand the design: discrete channel count (P2), screen consistency (P4), horizontal spacing (P5), surround level consistency (P6), front wide position (P7), overhead spacing (P9) and overhead level consistency (P10).',
  'Dynamic Range: headroom, clarity and scale. Screen Dynamic Range (P12) and Non-screen Dynamic Range (P13) are the main evidence. Use the LFE and subwoofer result (P14) only where bass output is reliable and relevant. Never reference P15.',
  'Timbre Matching: why the system should sound like one coherent loudspeaker system. Screen timbre (P16) and surround timbre (P17) are the main evidence. Use bass extension (P18), bass response (P19) and bass consistency across seats (P20) only where the evidence is reliable and useful.',
  `Bass consistency: ${P20_USE_RULE} ${P20_OMIT_RULE}`,
  'Hard exclusions: never mention an assumed parameter. Never reference P15. Ignore P8 completely. Do not mention P21.',
  'Do not let a parameter code become the point of a sentence. Use plain-language names and at most one parameter code in a section.',
].join('\n');

const PRODUCT_REFERENCES = [
  '=== PRODUCT REFERENCES ===',
  '- When a product is mentioned, explain why it was chosen. Never list products without context.',
  '- Explain a loudspeaker range through what it delivers: headroom, controlled dispersion, dynamic capability, tonal consistency or visual integration.',
  '- Explain a subwoofer through placement, control, extension, headroom and how it interacts with the room. Never describe it as simply "more bass".',
  '- Explain an overhead or in-ceiling range through overhead reproduction, coverage and low visual impact.',
  '- Never invent a product, a specification or a price.',
].join('\n');

const DESIGN_INDEX_RULES = [
  '=== DESIGN INDEX (INTERNAL ONLY) ===',
  ...DESIGN_INDEX_HARD_RULES.split('\n').map((rule) => `- ${rule}`),
  `- ${DESIGN_INDEX_SCOPE_RULE}`,
  `- Never write any of these in the prose or in a table cell: ${DESIGN_INDEX_BANNED_TERMS.join(', ')}.`,
  '- The index is a designer diagnostic. It is not a client-facing result, it is not an RP22 score, and it is never evidence in a section, a table row or a recommendation.',
  '- Where a paragraph previously rested on the index, make the point from the design evidence instead: spatial resolution, dynamic range, timbre matching, the screen and speaker relationship, seating coverage, product choice and reason, or a clearly supported RP22 result.',
  '- Do not invent a replacement score, and never state a percentage as a design result.',
].join('\n');

const CONSTRAINTS_AND_VALUE = [
  '=== ROOM CONSTRAINTS ===',
  '- Use the real room constraints as part of the design story: windows, doors, low ceiling, rear wall proximity, multiple seating rows, furniture, cabinetry, sightlines, room width and room length.',
  '- Explain what the constraint changes. Never make the room sound defective. Describe a constraint as a design factor.',
  '',
  '=== VALUE ENGINEERING (lower-cost options) ===',
  '- Never apologise for reducing specification. Explain what remains, what changes, what is lost and who the lower specification suits.',
  '- Typical changes: less Dynamic Range, reduced speaker density, less precise movement, fewer overhead positions, reduced bass consistency, lower output headroom.',
  '',
  '=== HIGHER SPECIFICATIONS ===',
  '- Explain what the additional investment buys: more headroom, higher Dynamic Range, more channels, better Spatial Resolution, more overhead positions, front wides, better bass consistency, and better performance across more seats.',
  '- Never describe a higher specification as excessive. It is the logical result of pursuing higher performance.',
  '',
  DESIGN_INDEX_RULES,
].join('\n');

const LANGUAGE = [
  '=== LANGUAGE ===',
  'SHOULD:',
  '- Use clear, direct language. Keep sentences short and natural.',
  '- Use the active voice.',
  '- Use practical, specific explanations.',
  '- Keep the room, the design, the system, the seating area and the listening result as the subject of the sentence.',
  '- Include numbers where they help: screen size, viewing distance, viewing angle, channel count, dBC capability, RP22 level, seat count.',
  '- Carry at most one or two supplied values in a paragraph. Every value is predicted or calculated: never call it measured, proven or confirmed.',

  '- Vary how sentences open. Never repeat the same opening construction within a section.',
  '- Select the most relevant results for this room and write about those. Selection and meaning matter more than completeness.',
  '- Prefer short paragraphs.',
  '',
  'AVOID:',
  '- Em dashes. Use commas, full stops or semicolons only.',
  '- Corporate language, generic marketing copy, vague claims and cliches.',
  '- "Not just X, but Y".',
  '- "In conclusion", "to sum up", "it is important to note".',
  '- Over-explaining an obvious result.',
  '- Paragraphs that read like a list of measurements.',
  '- Working through every parameter in a section.',
  '- Metaphors, analogies and cliches.',
  '- Filler phrases that connect ideas loosely.',
  '- Extra adjectives and adverbs.',
  '- Hashtags, markdown and asterisks.',
  '- Unsupported claims.',
  '- "Optimise" or "optimize", except when describing literal engineering optimisation of the system.',
  '- Making a lower-cost option sound poor when it is still a valid design.',
  '- Quoting a level without explaining what the client experiences because of it.',
  '- Repeating the same descriptive word through a section, for example "immersive" or "cinematic" more than once.',
  '- Any closing phrase that restates the report.',
].join('\n');

const HIGHLIGHTS_TABLE = [
  '=== KEY PERFORMANCE HIGHLIGHTS TABLE ===',
  '- Always include the Key Performance Highlights table. Sound Proof builds the rows and the Result values from calculated data. You write only the final cell of each row, describing what the room gains from that result.',
  '- A single report table is: Performance area | Result | What the room gains.',
  '- Use 8 to 14 rows where the design supports them. Include only the results that help the reader understand this room. An empty or padded row is worse than a shorter table.',
  '- Never add, remove, reorder or change a row, a level or a value.',
  '- Never give a row for an assumed parameter, and never a row for P8, P15 or P21. A bass consistency row appears only when Sound Proof supplied one: it is supplied only when the result is current, positive and useful.',
  '- The final cell is one short, specific sentence written in the voice above. It says what that result gives the room, not what the parameter is called.',
  '- For a comparison report the table is calculated per option: Performance area | Option A | Option B | What changes, with one column per selected version. Every value comes from that version\'s frozen engineering evidence, and the change column is derived by Sound Proof.',
  '- In a comparison you write the introduction only. Never restate a table value, never add or reorder a row, and never describe a difference the table does not show. Explain the differences in the prose around the table, in the order below.',
].join('\n');

const REPORT_BEHAVIOUR = [
  '=== REPORT BEHAVIOUR ===',
  '- You write prose only. Sound Proof builds all table values from calculated data.',
  '- Never write a table, a value grid or a second performance summary in a narrative section, and never repeat the calculated table: the report renders that one table itself.',
  '- Every value is predicted, modelled or calculated. Never describe it as measured, proven or confirmed.',
  '- Never invent data.',
  '- Never change an RP22 or RP23 level, a dB value, a viewing angle, a distance or a product name.',
  '- If the evidence is missing, omit the claim.',
  '- Use the designer\'s Emphasis Notes to decide what to focus on, but never to alter an engineering result.',
].join('\n');

const FINAL_SELF_CHECK = [
  '=== FINAL QUALITY CHECK (run this silently before returning) ===',
  '1. Does this explain the design rather than describe parameters?',
  '2. Is the report specific to this room?',
  '3. Does it focus on Spatial Resolution, Dynamic Range and Timbre Matching?',
  '4. Are the RP22 results used as evidence, not as the story?',
  '5. Does it identify the strongest part of the design?',
  '6. Does it explain the compromises clearly?',
  '7. Does it suggest practical upgrades where they are useful?',
  '8. Does it avoid overclaiming?',
  '9. Does it avoid em dashes? Remove every one.',
  '10. Does it sound like an experienced cinema designer explaining the room and the design?',
  '11. Are all banned words and phrases removed?',
  '12. Is every number supported by the supplied Sound Proof data?',
  '13. Is the room, the design or the system the subject of every sentence, with no direct address to the client and no marketing, consultant or AI phrasing left?',
  '14. Is the Design Index, a design score, a design rating or any percentage completely absent, in the prose and in every table cell?',
  '15. Does no section end with a generic closing phrase?',
  '16. Is there no markdown, hashtag or asterisk in the response?',
  '17. Is there no "you", "your", "we designed" or "we recommend" anywhere in the prose?',
  '18. Is this explaining the chosen design rather than redesigning it?',
  '19. Is every upgrade suggestion supported by a saved version, the project data, a compared option or the designer brief, and phrased as a future option rather than a correction?',
  '20. Is bass consistency included only where it is current, positive and useful, and never as criticism of the design?',
  '21. Is there no post-design clever recommendation anywhere, including a placement change, an added product, a processor change or a calibration change?',
  '22. Is the report still built around Spatial Resolution, Dynamic Range and Timbre Matching?',
  '23. Are the parameters used as evidence rather than as the story?',
  '24. Does the opening state the real screen size/format, system layout, seating arrangement and main product families before any evaluative language?',
  '25. Is every generic claim ("convincing sense of movement", "reference-style", "future-proof", "strong foundation") replaced with the specific channel count, position or mechanism that actually causes it, or removed?',
  ...WRITING_AUTHORITY_SELF_CHECK.map((question, index) => `${26 + index}. ${question}`),
].join('\n');

/**
 * The style contract text injected into every System Design report prompt.
 * @returns {string}
 */
export function buildWritingStyleContract(options = {}) {
  // The high-channel-density upgrade rule applies only to a high-density design
  // (9.1.6, or 15 or more discrete channels). It is '' for every other design, so
  // a lower-channel report keeps its supported upgrade guidance.
  const highChannelBlock = buildHighChannelContractBlock(options);
  return [
    '=== WRITING STYLE CONTRACT (applies to every sentence of generated prose) ===',
    '',
    SOUND_PROOF_WRITING_AUTHORITY,
    '',
    TONE_REFERENCE,
    '',
    WHAT_THE_REPORT_MUST_ANSWER,
    '',
    DESIGN_LED_VOICE_RULES,
    '',
    DESIGN_PHILOSOPHY,
    '',
    PRIORITIES,
    '',
    CHALLENGE_ASSUMPTIONS,
    '',
    PROPOSAL_STAGE_BOUNDARY,
    '',
    THEMES,
    '',
    PRODUCT_REFERENCES,
    '',
    CONSTRAINTS_AND_VALUE,
    '',
    HIGHLIGHTS_TABLE,
    '',
    LANGUAGE,
    '',
    'BANNED WORDS AND PHRASES (never use any of these in your prose):',
    BANNED_WORDS.join(', '),
    '',
    'Some of these words may appear in engineering data, product data or labels fixed by Sound Proof, for example the RP22 category name "Dynamic Range". Never rewrite, rename or drop a fixed factual label, and never change a supplied value. The ban applies to your own generated prose only.',
    '',
    REPORT_BEHAVIOUR,
    '',
    FINAL_SELF_CHECK,
    '',
    ...(highChannelBlock ? [highChannelBlock, ''] : []),
    '=== OUTPUT FORMAT ===',
    'Return structured report content only, suitable for the app editor.',
    'Do not include markdown formatting.',
  ].join('\n');
}