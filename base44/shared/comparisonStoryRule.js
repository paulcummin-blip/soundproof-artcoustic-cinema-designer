/**
 * comparisonStoryRule.js (shared)
 * -------------------------------
 * How a System Design Comparison explains a difference to a client.
 *
 * A comparison is not a list of equipment, and it is not a list of parameters.
 * For every difference that matters the writer must connect four things, in this
 * order:
 *
 *   1. what changed
 *   2. which RP22 / RP23 parameter carries the result
 *   3. what each option's own value and level actually is
 *   4. why the client should care, in the room
 *
 * The calculated comparison table is the authority on the values
 * (comparisonTable.js). This module only tells the writer how to explain them, so
 * a comparison reads as a designer explaining two systems rather than as a
 * feature list. Shared by the backend generators (generateProposal and
 * regenerateProposalSection), so a comparison reads the same however it was
 * produced.
 *
 * Pure: no React, no side effects, no runtime-specific APIs.
 */

/** The four steps every major difference is explained in. */
export const COMPARISON_STORY_STRUCTURE = [
  '=== EXPLAIN EVERY MAJOR DIFFERENCE IN FOUR STEPS ===',
  'For each difference that matters, in this order:',
  '1. WHAT CHANGED: the loudspeaker, the subwoofer, the count or the layout that differs, named exactly as supplied.',
  '2. WHICH PARAMETER IT AFFECTS: the RP22 or RP23 parameter that carries the result, named in client-friendly words with its number once, for example "RP22 Parameter 12, Screen Dynamic Range".',
  '3. WHAT THE VALUE IS: each option\'s own value and level exactly as supplied, for example "106 dBC at Level 3 in the Level 1 version, 116 dBC at Level 4 in the Level 4 version", together with the size of the change.',
  '4. WHY THE CLIENT SHOULD CARE: what that value gives the room. Connect the product change to the parameter, the parameter to the value, and the value to the experience in the room. Never state a value without saying what it gives the room, and never describe an experience without the value that supports it.',
].join('\n');

/** The parameters a comparison may name, where the evidence supplies them. */
export const COMPARISON_PARAMETER_VOCABULARY = [
  '=== PARAMETERS TO NAME, WHERE THE EVIDENCE SUPPLIES THEM ===',
  'P2 discrete channel capability; P5 horizontal speaker spacing; P7 front wide position; P9 overhead spacing; P12 Screen Dynamic Range; P13 Non-screen Dynamic Range; P14 LFE and subwoofer Dynamic Range; P16 screen timbre; P17 surround and overhead timbre; P18 bass extension; P19 bass response at the listening position; P20 bass seat-to-seat consistency; RP23 viewing geometry.',
  'Name each one in client-friendly words with its code once ("Parameter 12, Screen Dynamic Range"), then keep using the plain words. Use them as evidence inside the story, never as a list, and never mention a parameter the supplied evidence does not carry. Never reference P15, never mention an assumed parameter, ignore P8 completely and do not mention P21.',
].join('\n');

/** How the reports the client already holds are referenced. */
export const COMPARISON_REFERENCE_STYLE = [
  '=== HOW TO REFERENCE THE EVIDENCE ===',
  'Ground the story in the reports the client also holds, naturally and sparingly, for example:',
  '- "RP22 Parameter 12 in the Technical Report shows ..."',
  '- "The Visual Report shows ..."',
  '- "The P20 seat map shows ..."',
  '- "RP23 viewing geometry remains strong in both versions ..."',
  'Never cite a file name, a page number or a link, and use two or three references in a section at most rather than one in every paragraph.',
].join('\n');

/** The language a comparison is written in. */
export const COMPARISON_LANGUAGE_RULES = [
  '=== LANGUAGE ===',
  'Never open a sentence with "The system is designed to", "This design provides", "The screen does", "The speakers do", "The subwoofers provide", "This ensures", "The system delivers" or "This allows".',
  'Never write a table, a grid of values or a performance summary: the report renders its one calculated table itself. Never write "measured", "proven" or "confirmed" for a calculated result; use "predicted", "calculated" or "shown in the Technical Report".',
  'Never write "not just X, but Y". Never define an RP22 parameter at length, never list parameters dryly, and never make a claim without the value that supports it.',
  'Say "far higher", "much more" or "significantly" only together with the values that show it, and never at all where the difference is small.',
  'Prefer: "The main upgrade is ...", "This matters because ...", "For the listener, that means ...", "The calculated difference is ...", "Parameter 12 shows ...", "The Level 4 version gives the room ...", "The Level 1 version still keeps ...".',
].join('\n');

/** What the options share, and how a shared result is presented. */
export const COMPARISON_SHARED_GROUND_RULE = [
  '=== WHAT THE OPTIONS SHARE ===',
  'Where every option uses the same channel layout and already reaches the top RP22 level for discrete channel capability (Parameter 2), state that shared result as a strength both options hold, and say plainly that the difference is not speaker count: it is how much performance each channel can deliver once the soundtrack becomes demanding.',
  'A shared layout, the channel count and the room geometry are never presented as a limitation, and adding channels is never proposed as the upgrade.',
].join('\n');

/** How the bass difference is explained. */
export const COMPARISON_BASS_RULE = [
  '=== BASS ===',
  'Subwoofer count is never the point on its own. Explain the engineering margin the arrangement creates behind Parameters 14, 18, 19 and 20, and what that margin gives the room: deeper extension, more control, more authority, and bass that holds up at real cinema levels.',
  'Describe bass between seats as more even, with less difference between the strongest and weakest seat, only where the P20 result is supplied for every option as reliable, current and positive. Where it is not supplied, leave seat-to-seat consistency out entirely and never claim it. Never claim perfect bass, and never describe the smaller arrangement as inadequate.',
].join('\n');

/** How the smaller option is treated. */
export const COMPARISON_ENTRY_OPTION_RULE = [
  '=== THE SMALLER OPTION ===',
  'Never describe the smaller option as poor, limited or a compromise to be corrected. State what it keeps, where the evidence shows the options share it: the room, the screen, the seating geometry, the immersive layout, and a fully credible result. Then explain what the larger option adds on top of it.',
].join('\n');

/**
 * The parameter story each comparison section carries. Sections not listed here
 * (cover, project images) carry the shared rules only.
 */
const SECTION_FOCUS = Object.freeze({
  system_design_summary: [
    'FOR THIS SECTION: state once what every option shares, then give each option its own facts and the performance headline it reaches, with the value that supports it. Introduce the options without ranking them, and do not restate the calculated table.',
  ].join('\n'),

  spatial_resolution: [
    'FOR THIS SECTION, the parameter story is spatial. Name the shared channel capability (Parameter 2) as a strength both options already hold where the evidence says so, then explain what actually changes: the loudspeaker models and the positions they occupy, horizontal spacing (P5), front wide position (P7), overhead spacing (P9) and screen consistency (P4) where the evidence supplies them.',
    'Say what the extra positions, the wider stage or the closer spacing give the room: a larger image, movement that travels through the room rather than jumping between speakers, and effects that stay anchored to the screen where they belong.',
  ].join('\n'),

  dynamic_range: [
    'FOR THIS SECTION, the parameter story is headroom. Give each option its own Screen Dynamic Range (P12), Non-screen Dynamic Range (P13) and, where it is reliable, LFE and subwoofer Dynamic Range (P14) values and levels exactly as supplied, and state the size of the difference.',
    'Then explain what that headroom buys at the listening level the design assumes: scale and presence at the front of the room, dialogue that stays clean when the soundtrack becomes demanding, music that opens up, effects that keep their impact, and peaks that stay composed instead of the system sounding pushed.',
  ].join('\n'),

  timbre_matching: [
    'FOR THIS SECTION, the parameter story is tonal. Explain the matched loudspeaker families behind screen timbre (P16) and surround and overhead timbre (P17), and, where the bass evidence is reliable, bass extension (P18), bass response at the listening position (P19) and bass consistency between seats (P20).',
    'Say what matched voicing gives the room as a sound moves from the screen into the surrounds and overhead, and give the bass paragraph its own values and meaning rather than a claim about more bass.',
  ].join('\n'),

  key_performance_highlights: [
    'FOR THIS SECTION: it carries the calculated comparison table. Write the introduction only. Say once what the options share, say in one clause where the differences lie, and say that the table below states each option\'s own calculated values. Do not restate a value, do not rank the options, and do not write a table.',
  ].join('\n'),

  overall_design: [
    'FOR THIS SECTION, bring the differences together for the decision. Name where each option is strongest and what the smaller option still keeps, using the values already discussed and no new ones. Leave the client clear about what each option gives the room, without ranking one as best and without repeating the earlier sections.',
  ].join('\n'),
});

/**
 * The comparison writing rule for one section, or the shared rules alone when the
 * section has no parameter story of its own.
 *
 * @param {string} sectionType
 * @returns {string}
 */
export function buildComparisonSectionRule(sectionType) {
  const focus = SECTION_FOCUS[sectionType] || '';
  return [
    COMPARISON_STORY_STRUCTURE,
    COMPARISON_PARAMETER_VOCABULARY,
    COMPARISON_REFERENCE_STYLE,
    COMPARISON_LANGUAGE_RULES,
    COMPARISON_SHARED_GROUND_RULE,
    COMPARISON_BASS_RULE,
    COMPARISON_ENTRY_OPTION_RULE,
    focus,
  ].filter(Boolean).join('\n\n');
}

export default buildComparisonSectionRule;