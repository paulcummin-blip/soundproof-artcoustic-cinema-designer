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

/**
 * The four steps one difference is explained in.
 *
 * They are used ONCE per comparison, in the one section that owns that
 * difference's story (see the section note). Every other section refers back to
 * it in a clause and writes about its own subject. A client who reads the same
 * P12, P13 and P14 story in four consecutive sections is reading a report, not a
 * recommendation, and stops reading.
 */
export const COMPARISON_STORY_STRUCTURE = [
  '=== HOW A DIFFERENCE IS EXPLAINED — ONCE, IN THE SECTION THAT OWNS IT ===',
  'Each section owns ONE story, set out in the section note at the end of this rule. Where a difference belongs to that story, explain it in four SHORT steps:',
  '1. WHAT CHANGED: the loudspeaker, the subwoofer, the count or the position that differs, named exactly as supplied.',
  '2. WHICH PARAMETER IT AFFECTS: named in client-friendly words with its code once, for example "Screen Dynamic Range (P12)".',
  '3. WHAT EACH OPTION\'S VALUE IS, stated once: "106 dBC at Level 3 in the Level 1 version, 116 dBC at Level 4 in the Level 4 version".',
  '4. WHAT THE CLIENT GETS: one or two sentences on what that gives the room.',
  'No other section repeats this story. It may refer back in a clause at most ("the headroom difference covered in Dynamic Range"), and then writes about its own subject.',
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
  'Write short paragraphs of one to three sentences. Never write a paragraph longer than four sentences, and never a block of dense text.',
  'Respect the section\'s word ceiling stated in its section note. If the material does not fit, cut the weaker sentence: never let a section run on to a second page.',
  'Never repeat a point another section has already made. Each section makes its own point once, and a shared result is stated in the section that owns it rather than in every section.',
  'Never write "a difference is not automatically an improvement", "read each option\'s assessed value", "it depends on the client\'s priorities" or any other line that leaves the decision with the reader.',
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
    'FOR THIS SECTION (ceiling: 180 words): the opening. Say once what every option shares — the room, the screen, the seating plan and the layout — then say in one sentence that the difference between the options is capability and headroom rather than layout. Give each option one short paragraph: what it is for, and the single headline result that supports it.',
    'Do not explain the P12, P13 or P14 values here: Dynamic Range owns that story. Do not restate the calculated table, and do not rank the options as better or worse.',
  ].join('\n'),

  spatial_resolution: [
    'FOR THIS SECTION (ceiling: 150 words): the honest framing. Where every option already uses the same layout and reaches the same top level for discrete channel capability (P2), say so plainly and say that this is not where the choice lies. State what the options genuinely share: the channel count, the layout, the screen and the seating positions.',
    'Then give what actually differs at the positions, in one short paragraph: the loudspeaker models specified (P5, P7 and P9 where the evidence supplies them), and what a position or spacing difference gives the room where there is one.',
    'Do not oversell spatial difference when the layout is the same, and do not explain P12, P13 or P14 here: Dynamic Range owns the headroom story.',
  ].join('\n'),

  dynamic_range: [
    'FOR THIS SECTION (ceiling: 250 words): the main upgrade story, and the ONE place the headroom parameters are explained. Give each option its own Screen Dynamic Range (P12), Non-screen Dynamic Range (P13) and LFE and subwoofer Dynamic Range (P14) values and levels exactly as supplied, once each, and state the size of each difference.',
    'Then explain headroom in the client\'s terms: the margin between normal listening and the point where the system starts to sound strained. Say what more of it gives the room — dialogue that stays clear when music and effects build, large effects with more scale, the surround and height layers keeping their presence in busy scenes, bass that feels more effortless, and peaks that stay composed instead of the system sounding pushed at cinema playback levels.',
    'Do not restate what the options share, do not explain the products again, and do not repeat any part of this story in another section.',
  ].join('\n'),

  timbre_matching: [
    'FOR THIS SECTION (ceiling: 150 words): the tonal story, and nothing else. State the screen timbre (P16) and surround and overhead timbre (P17) position in one or two sentences — where both options are strong, say so plainly and move on — then say what tonal consistency gives the room as a sound travels from the screen into the surround and height layers.',
    'Do not repeat every P16 and P17 result, do not re-tell the headroom story, and give the bass its one honest sentence only where the evidence states a bass difference (P18, P19 or P20). Where bass consistency is the same in both options, say that it still needs calibration attention rather than claiming an improvement.',
  ].join('\n'),

  key_performance_highlights: [
    'FOR THIS SECTION: it carries the calculated comparison table. Write the introduction only. Say once what the options share, say in one clause where the differences lie, and say that the table below states each option\'s own calculated values. Do not restate a value, do not rank the options, and do not write a table.',
  ].join('\n'),

  overall_design: [
    'FOR THIS SECTION (ceiling: 180 words): the conclusion, not another report. Say what the smaller option still keeps, say what the larger option adds, and say plainly which client each option suits. Use no value that has not already been given, and introduce no new parameter.',
    'Do not restate the differences section by section, do not repeat a parameter story, and do not name a product that appears nowhere else in this comparison.',
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