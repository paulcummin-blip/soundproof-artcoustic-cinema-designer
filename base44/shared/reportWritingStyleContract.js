/**
 * reportWritingStyleContract.js (shared)
 * --------------------------------------
 * The fixed writing style contract for the Client Design Report
 * (System Design Summary and System Design Comparison).
 *
 * This is a CONTRACT, not a preference. Every AI-generated client-facing
 * report prompt MUST include it, for both first-draft generation and section
 * regeneration, so the generated prose always reads the same way.
 *
 * It is appended to the prompt AFTER the engineering data has been assembled
 * and immediately BEFORE the model writes, so it is the last thing the model
 * reads. It also instructs the model to run a final self-check before
 * returning.
 *
 * The contract governs prose only. It never changes engineering values, table
 * values, RP22/RP23 levels, Design Ratings or product names: Sound Proof
 * builds every table value from calculated data, and the AI writes the words
 * around it.
 *
 * Pure: no React, no side effects, no runtime-specific APIs. Safe to import
 * from any backend function.
 */

/** Banned words and phrases. Never used in generated prose. */
export const BANNED_WORDS = [
  'Elevate',
  'Delve',
  'Hustle and bustle',
  'Revolutionize',
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
  'Scalable',
  'Optimize',
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
  'Ecosystem',
  'Deep dive',
  'Move the needle',
  'Circle back',
  'Actionable insights',
  'Ideation',
  'Pain point',
  'Deliverables',
  'Quick win',
  'Elevator pitch',
  'Framework',
  'Drill down',
  'Synergize',
  // Vague or inflated phrasing. The report explains, it never inflates.
  'Next level',
  'Premium experience',
  'Ultimate experience',
  'Unparalleled',
  'State of the art',
  'It is important to note',
  'In conclusion',
  'To sum up',
  'Not just X, but Y',
];

/**
 * Neutral professional voice: the mandatory voice rules for every piece of
 * client-facing proposal and client-summary copy.
 *
 * The report writes about the design, not at the reader. It names the subject
 * directly (the cinema, the room, the screen, the system) and describes
 * experience through listeners. "Your screen" is always "the screen".
 *
 * Exported so the AI client summary prompts and the Key Performance Highlights
 * prompt use the same rules as this contract, from one authority.
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
 * Used by the copy audit to measure second-person language in report copy.
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
 * The style contract text injected into every client-facing report prompt.
 * @returns {string}
 */
export function buildWritingStyleContract() {
  return [
    '=== WRITING STYLE CONTRACT (applies to every sentence of generated prose) ===',
    '',
    'SHOULD:',
    '- Use clear, direct language.',
    '- Keep sentences short and sharp.',
    '- Write in active voice.',
    '- Give practical, specific advice.',
    '- Include data, numbers, RP22/RP23 levels, dB values, screen sizes, viewing angles, channel counts and concrete examples when they are supplied in the data above.',
    '- Write in the neutral professional voice defined below. The design is the subject of the sentence, never the reader.',
    '- Describe the experience through listeners: what they will hear, and where.',
    '- Explain what the client will experience, not just what the system measures.',
    '- Lead with what the design does well, then explain the trade-offs honestly.',
    '- When a compromise exists, explain it plainly without undermining the design.',
    '- Include a sensible upgrade path when the supplied data supports one.',
    '- Stay credible: supportive of the sale, never overclaiming.',
    '- Keep the three RP22 design structures at the centre of the narrative: Spatial Resolution, Dynamic Range and Timbre Matching.',
    '- Vary how sentences open. Never repeat the same opening construction within a section.',
    '- Select the most relevant results for this room and write about those. Selection and meaning matter more than completeness.',
    '- Carry at most one or two measured values in a paragraph.',
    '- Use plain-language names for results in preference to parameter codes, and use no more than one parameter code in a section.',
    '- Sound like an experienced cinema designer writing for a client.',
    '- Keep the tone human, calm and professional.',
    '- Prefer short paragraphs.',
    '- Use tables for key performance highlights and comparisons.',
    '',
    NEUTRAL_VOICE_RULES,
    '',
    '=== ROLE AND STRUCTURE ===',
    '- Write as the cinema designer responsible for this project, explaining the design directly to the client.',
    '- This is a sales summary of a design: not a compliance report, not an engineering specification and not marketing copy.',
    '- Tell the design story first, then use results as evidence inside it. Never translate parameters one by one.',
    '- Keep the narrative on the three RP22 design structures: Spatial Resolution, Dynamic Range and Timbre Matching.',
    '- Name a result only where it is the clearest evidence for something the client will hear, and explain what it means as you go.',
    '- Explain why the room has been designed this way, what the investment delivers, where the performance is strongest, where the room sets the limits, and which decisions matter most.',
    '- Treat architectural constraints as design factors. Never make the room sound defective.',
    '- Where a lower-cost option is relevant, explain what remains, what changes and who it suits. Never apologise for it and never criticise it.',
    '- Where a higher specification is relevant, explain what the additional investment buys. It is the logical result of pursuing more performance, not excess.',
    '- Whenever a product is mentioned, explain why that product was chosen.',
    '',
    'AVOID:',
    '- Em dashes. Use commas, periods or semicolons only.',
    '- Filler phrases that connect ideas loosely.',
    '- Starting sentences with "The design achieves", "The design provides", "The design offers" or "The design delivers".',
    '- Working through every parameter in a section. Write about the results that matter for this room.',
    '- Paragraphs that read like a list of measurements.',
    '- Constructions like "not just X, but Y".',
    '- Metaphors, analogies and cliches.',
    '- Addressing the reader: "you", "your", "you will hear", "you can improve", "where you sit".',
    '- "Your cinema", "your room", "your screen" or "your system". Name the cinema, the room, the screen and the system directly.',
    '- Vague or sweeping claims.',
    '- "In conclusion," "to sum up," "closing," or any similar closing phrase.',
    '- Extra adjectives or adverbs.',
    '- Hashtags.',
    '- Markdown.',
    '- Asterisks.',
    '- Overly polished marketing language.',
    '- Generic AI wording.',
    '- Unsupported claims.',
    '- Making lower-cost options sound poor if they are still valid designs.',
    '- Writing about a result because it exists, or letting a parameter number become the point of a sentence.',
    '- Quoting a level without explaining what the client hears because of it.',
    '- "Optimise" or "optimize", except when describing literal engineering optimisation of the system.',
    '- "It is important to note", "in conclusion", "to sum up" or any similar phrase.',
    '- Em dashes in any form, including the long dash character itself.',
    '',
    'BANNED WORDS AND PHRASES (never use any of these in your prose):',
    BANNED_WORDS.join(', '),
    '',
    'Some of these words may appear in engineering data, product data or labels fixed by Sound Proof, for example the RP22 category name "Dynamic Range". Never rewrite, rename or drop a fixed factual label, and never change a supplied value. The ban applies to your own generated prose only.',
    '',
    '=== REPORT BEHAVIOUR ===',
    '- You write prose only. Sound Proof builds all table values from calculated data.',
    '- Never invent data.',
    '- Never change an RP22/RP23 level, a dB value, a viewing angle or a product name.',
    '- Never state an internal score, index or percentage. Sound Proof scores and the Design Index are internal only, they are not a percentage, and they never appear in client-facing copy.',
    '- If the evidence is missing, omit the claim.',
    '- Use the designer\'s Emphasis Notes to decide what to focus on, but never to alter engineering results.',
    '',
    '=== FINAL SELF-CHECK BEFORE RETURNING ===',
    '1. Remove all em dashes.',
    '2. Remove all banned words and phrases from the prose.',
    '3. Check that every numeric claim is supported by the supplied Sound Proof data.',
    '4. Check that the text reads like an experienced cinema designer writing for a client.',
    '5. Check that no markdown, hashtags or asterisks are included.',
    '6. Check that no section ends with a generic closing phrase.',
    '7. Check that each paragraph is concise.',
    '8. Check that sentence openings vary, and that no sentence opens with "The design achieves", "The design provides", "The design offers" or "The design delivers".',
    '9. Check that no paragraph reads like a list of measurements. If one does, rewrite it into flowing client-facing prose.',
    '10. Check that no paragraph carries more than two measured values, and that the section uses no more than one parameter code.',
    '11. Check that no internal score, index or percentage appears anywhere in the copy.',
    '12. Check that the report tells the design story first, and that Spatial Resolution, Dynamic Range and Timbre Matching carry the narrative.',
    '13. Check that no result is mentioned only because it exists, and that no level is quoted without explaining what the client hears because of it.',
    '14. Check that no assumed parameter is referenced anywhere.',
    '15. Check that every sentence is in the third person, that no "your" anything remains, and that "the screen", "the cinema", "the room" and "the system" are used in its place.',
    '',
    '=== OUTPUT FORMAT ===',
    'Return structured report content only, suitable for the app editor.',
    'Do not include markdown formatting.',
  ].join('\n');
}