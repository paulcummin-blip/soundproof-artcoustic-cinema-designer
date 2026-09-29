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
    '- Speak to the reader using "you" and "your" where it feels natural.',
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
    'AVOID:',
    '- Em dashes. Use commas, periods or semicolons only.',
    '- Filler phrases that connect ideas loosely.',
    '- Starting sentences with "The design achieves", "The design provides", "The design offers" or "The design delivers".',
    '- Working through every parameter in a section. Write about the results that matter for this room.',
    '- Paragraphs that read like a list of measurements.',
    '- Constructions like "not just X, but Y".',
    '- Metaphors, analogies and cliches.',
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
    '',
    '=== OUTPUT FORMAT ===',
    'Return structured report content only, suitable for the app editor.',
    'Do not include markdown formatting.',
  ].join('\n');
}