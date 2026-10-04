/**
 * systemDesignSummarySections.js (shared)
 * ---------------------------------------
 * The section structure of the CLIENT-FACING SYSTEM DESIGN REPORT
 * (System Design Summary and System Design Comparison).
 *
 * This is not a general proposal document. It is the designer explaining a
 * system design to the client, built around the three core RP22 design
 * structures: Spatial Resolution, Dynamic Range and Timbre Matching.
 *
 * Written in the design-led voice (see reportWritingStyleContract.js): the
 * report is written by the designer about the room, the design and the listening
 * result, and the numbers support the story.
 *
 * Shared by the backend report generators (generateProposal and
 * regenerateProposalSection) so both write from the same structure.
 *
 * The frontend mirrors this vocabulary in
 * src/components/proposal/proposalSections.js for the editor UI.
 *
 * Pure: no React, no side effects, no runtime-specific APIs.
 */

import { UPGRADE_PATH_RULE, PROPOSAL_STAGE_RULE } from './proposalStageBoundary.js';
import { buildHighChannelSectionRule } from './highChannelDensityRule.js';

export const HIGHLIGHTS_SECTION_TYPE = 'key_performance_highlights';

/**
 * The section titles a COMPARISON report uses in place of the single-system
 * ones.
 *
 * A comparison is not describing one system. It presents multiple SYSTEM
 * OPTIONS and explains how they differ, so two of its sections are named for
 * what they actually do:
 *
 *   System Design Summary       -> System Options Summary
 *   Key Performance Highlights  -> Key Differences
 *
 * A single-version report keeps its own titles and is never renamed.
 *
 * The frontend mirrors this map in
 * src/components/proposal/proposalSections.js (the two cannot import from each
 * other) and a test asserts the two agree word for word.
 */
export const COMPARISON_SECTION_TITLES = Object.freeze({
  system_design_summary: 'System Options Summary',
  [HIGHLIGHTS_SECTION_TYPE]: 'Key Differences',
});

/**
 * The title one section carries for a report type. Only a comparison renames a
 * section: every other report type keeps the title it was written with.
 */
export function resolveSectionTitle(sectionType, title, proposalType = 'system_summary') {
  if (proposalType !== 'comparison') return title;
  return COMPARISON_SECTION_TITLES[sectionType] || title;
}

/** The editable sections of a System Design report, in report order. */
export const SYSTEM_SUMMARY_SECTIONS = [
  { type: 'cover', key: 'cover', title: 'Cover', canEditBody: false },
  { type: 'system_design_summary', key: 'system_design_summary', title: 'System Design Summary', canEditBody: true },
  { type: 'spatial_resolution', key: 'spatial_resolution', title: 'Spatial Resolution', canEditBody: true },
  { type: 'dynamic_range', key: 'dynamic_range', title: 'Dynamic Range', canEditBody: true },
  { type: 'timbre_matching', key: 'timbre_matching', title: 'Timbre Matching', canEditBody: true },
  { type: HIGHLIGHTS_SECTION_TYPE, key: HIGHLIGHTS_SECTION_TYPE, title: 'Key Performance Highlights', canEditBody: true },
  { type: 'overall_design', key: 'overall_design', title: 'Overall Design', canEditBody: true },
  { type: 'room_images', key: 'room_images', title: 'Project Images', canEditBody: true },
];

/**
 * The behaviour of a System Design Comparison report. Applied to every section
 * of a comparison, after that section's own instruction.
 */
export const COMPARISON_REPORT_INSTRUCTIONS = [
  'This is a System Design Comparison. Use the same voice, tone and structure as a single system report.',
  'First explain what stays the same between the options. Then explain what changes. Then explain the listening consequence: what the room actually gains or gives up.',
  'Work through the difference in this order: Dynamic Range, Spatial Resolution, Timbre Matching, the viewing experience, and bass consistency where the evidence is trusted.',
  'Where one option is clearly stronger, explain why, without attacking the alternative.',
  'Where one option improves bass consistency across the seating area, explain that as more even bass between seats: less difference between the strongest and weakest seat. Never describe the other option as wrong, and never present the comparison as a correction.',
  'Do not automatically recommend the largest system unless the evidence supports it.',
  'The calculated comparison table is the authority on what differs. Never say two options are the same, equivalent or unchanged in an area where the table states different values, and never describe the options as performing alike where the table shows a difference.',
  'Write to the decision: state what changes, what it gives the room, and what the client is choosing between. Short, direct sentences. Lead with the differences and keep the shared ground brief.',
  'Never present the comparison as an equipment table, and never rank the options as "best".',
  'Write about the system options, never about one system: say "both versions use", "the Level 1 version uses" or "the Level 4 version adds", and never "this design", "the system" or "the selected system".',
  'Name each option by the exact version name supplied. State a fact the options share once, as shared, rather than repeating it for each option.',
].join('\n');

/**
 * Per-section writing instructions for the System Design report.
 *
 * Every instruction references only the RP22 parameters that are actually
 * present in the supplied Sound Proof calculated data, so the model never
 * writes about a parameter that was not assessed for this design.
 */
export const SYSTEM_SUMMARY_SECTION_PROMPTS = {
  system_design_summary: `Open the report by describing the design.

Open with the room, the screen and the system concept: the screen size and type, the viewing distance, the RP23 viewing result where it is relevant, the system format, and the main loudspeaker families. Say why the room has been designed this way.

Then cover, in this order:
- what has been designed for this room, and what it is trying to achieve
- why the design takes this form, including the seating and viewing context, how many seats there are for a reason, and how the room is used
- the main loudspeaker and subwoofer package, by family or model, and why each was chosen
- how those parts work together as one system rather than as separate components
- what the room delivers as a result, and how that experience should feel

Do not open with an equipment list, and do not describe a product in isolation unless you are explaining why that product was chosen.

Use the supplied Sound Proof calculated data wherever it applies, and never invent a value.

This section is prose only. Do not write a list, a table, a highlights list or a performance summary of any kind, and do not introduce the Key Performance Highlights table: the report has one structured evidence section, and this is not it.
3 to 4 short paragraphs.`,

  spatial_resolution: `Explain Spatial Resolution as the result of speaker count and speaker positions, and what that means for how sound moves around and above the listener.

Choose the two or three results that matter most for this room from the Spatial Resolution results present in the supplied Sound Proof calculated data, for example discrete channel count, screen consistency, horizontal spacing, surround level consistency, front wide position, overhead spacing and overhead level consistency. Do not work through them all.

Name each chosen result in plain language with its achieved level and measured value exactly as supplied, using no more than one parameter code in the section, and explain what the room gains because of it.

Evidence to choose from, where it was assessed reliably: discrete channel count (P2) for how many physical positions the sound can come from, screen consistency (P4) for stable dialogue and screen-channel agreement, horizontal spacing (P5) for movement between adjacent speakers, surround level consistency (P6), front wide position (P7) for movement between the screen and the side walls, overhead spacing (P9) for front-to-rear movement overhead, and overhead level consistency (P10). Do not mention P8.

Explain the listening result first, then the result that supports it. For example: the largest gap between adjacent speakers is 50 degrees, reaching RP22 Level 4, so effects have more physical positions to move through and movement around the room feels continuous rather than jumping between speakers.

Lead with the strongest area of the design. Mention one clear limitation honestly, in client-friendly language, without undermining the design, and say what causes it. Where the data supports it, note a sensible upgrade path.
Do not list parameters mechanically and do not include a table.
3 to 4 short paragraphs.`,

  dynamic_range: `Explain Dynamic Range as headroom rather than loudness: the ability to reproduce quiet detail and sudden peaks at the same time.

Choose the results that matter most for this room from the Dynamic Range results present in the supplied Sound Proof calculated data, for example screen dynamic range, non-screen dynamic range and the subwoofer system output. Do not work through them all, and use no more than one parameter code in the section.

Use the dBC values and the RP22 levels exactly as supplied, and explain in plain language how that headroom benefits dialogue, music and film effects at the listening level the design assumes.

Screen Dynamic Range (P12) and Non-screen Dynamic Range (P13) are the main evidence. Use the LFE and subwoofer result (P14) only where the bass output is reliable and relevant. Never reference P15.

Explain that Dynamic Range is not about playing louder: it is about how clean and unforced the system sounds. Cover the benefits that apply here, for example dialogue staying clear, music opening up, action scenes keeping their impact, peaks staying clean, the system avoiding a compressed sound, the loudspeakers never running near their limits, and the front stage and surrounds staying balanced as the level rises.

If one part of the system is weaker than another, explain that clearly and calmly, and say why.

If the system is modest, describe the benefit honestly without overstating it. If the system is high performance, make that clear and say what the extra capability buys. Where the data supports one, note a sensible upgrade path.
3 to 4 short paragraphs, no table.`,

  timbre_matching: `Explain Timbre Matching as tonal consistency: the same voice, instrument or effect sounding the same as it moves around the room.

Choose the results that matter most for this room from the Timbre Matching results present in the supplied Sound Proof calculated data, for example screen timbre, surround timbre, and the bass behaviour that shapes tonal balance. Do not work through them all, and use no more than one parameter code in the section.

Explain why matched loudspeaker families and consistent voicing matter to the listening result, using the supplied speaker family data, and describe what those choices give the room.

Screen timbre (P16) and surround timbre (P17) are the main evidence. Use bass extension (P18) and bass response (P19) only where the bass evidence is reliable and useful. Use bass consistency across seats (P20) only where it is supplied as reliable, positive and useful, and never claim perfect bass.

Explain why the room should sound like one system rather than a collection of loudspeakers: common drive-unit families, consistent voicing, controlled dispersion, the sub and satellite approach, similar tonal character as effects move, stable dialogue across seats, and consistency between the screen, surround and overhead layers.

Make it practical, for example: a voice or effect may begin on the screen, move into the surrounds and continue overhead, and when those loudspeakers share the same tonal character the sound stays believable throughout that movement.

Where a reliable bass result exists, add a short bass performance paragraph explaining why the subwoofer positions were chosen. For a four-subwoofer design, explain that the main gain is usually consistency across seats rather than extra volume. Where a bass consistency result is supplied, explain it as more even bass across the seating area and less difference between the strongest and weakest seat. Do not raise a bass change of any kind: the layout was chosen deliberately, and a weak or missing consistency result is left out rather than reported.

Keep it practical. Mention a clear limitation honestly where the data shows one, and note a sensible upgrade path where the data supports it.
3 to 4 short paragraphs, no table.`,

  // The table itself is built by Sound Proof from calculated data, never by the
  // model. Only the introduction is written prose.
  [HIGHLIGHTS_SECTION_TYPE]: `Write the introduction to the Key Performance Highlights table in 1 or 2 short sentences, as simple HTML with a <p> tag.

Say that this is the measured summary of the design, and that each row states what the result means in the room. Do not list the rows, do not restate a value, and do not write a table.

If no calculated rows are supplied for this design, write 2 to 3 short paragraphs describing the performance this design delivers, using only the results present in the supplied Sound Proof calculated data, and still do not write a table.`,

  overall_design: `Write the Overall Design section: a concise summary of the whole design, and the strongest paragraph in the report.

Bring the room back together: the image scale on the screen, how the loudspeakers are laid out around and above the listener, the dynamic headroom available, the tonal consistency across the system, the seats where the design performs best, and one clear upgrade opportunity where one exists.

Explain why the design works as a complete system. Every major decision has a reason, and the components were chosen to work together.

Where the design is strongest, say so plainly. State any clear limitation honestly, explain what causes it, and say what a later upgrade would change, only where the supplied data supports it.

For a modest system, explain the benefits clearly, do not claim more than the evidence shows, and point to sensible upgrades. For a high performance system, state the quality clearly and do not undersell it.

Do not repeat the previous sections. Do not end with a generic closing phrase. The final paragraphs should leave the reader confident that the design decisions are deliberate.

This section is prose only. Never repeat the Key Performance Highlights table, never list its rows, and do not write a list, a table or a second performance summary: that table is the report's one structured evidence section. Name the strongest part of the design and the main compromise in the prose instead.
2 to 4 short paragraphs.`,

  room_images: `Write a brief introduction for the project images section, in the voice above. The images follow this introduction. 1 paragraph.`,
};

/**
 * The opening section of a COMPARISON report: it introduces the system options
 * side by side, so the report never reads as if there were one system.
 */
export const SYSTEM_OPTIONS_SUMMARY_PROMPT = `Open the comparison by introducing the system options the client is choosing between. This report compares options, so it never describes one system and never says "this design", "the system" or "the selected system".

Write one short opening paragraph that:
- states how many system options the report compares, naming each one with its exact supplied version name
- states once what every option shares - the room, the screen and the seating layout - where the supplied data shows they are the same, and says the differences lie elsewhere
- where every option uses the same channel layout, states that shared layout as a strength the options have in common (it is already at the top RP22 level for discrete channel capability), not as a difference and never as a limitation
- names, in one sentence, where those differences lie: system scale, loudspeaker and subwoofer specification, and the performance that follows

Then write one short paragraph for each option, in the supplied version order. Lead each one with an <h3> heading that is exactly that version's supplied name, followed by that option's own facts: the system format, the loudspeaker package, the subwoofer arrangement, and the performance result that follows. Say plainly what that option is.

Describe the options and do not choose between them here: do not rank them, recommend one, or express a preference.

State what is shared once, at the start, rather than repeating it in each option's paragraph.

Do not restate the comparison table's values and do not write a second performance summary: the differences themselves are stated in the Key Differences section that follows.

Use only the supplied Sound Proof calculated data and never invent a value.
1 opening paragraph, then one short paragraph per option.`;

/**
 * @param {string} sectionType
 * @param {string} sectionTitle
 * @param {object|null} layout
 * @param {string} proposalType - 'comparison' writes the section as multiple
 *   system options; every other type writes it as the one system.
 * @returns {string} writing instruction for one System Design report section
 */
export function getSystemSummarySectionPrompt(sectionType, sectionTitle, layout = null, proposalType = 'system_summary') {
  const instruction = proposalType === 'comparison' && sectionType === 'system_design_summary'
    ? SYSTEM_OPTIONS_SUMMARY_PROMPT
    : SYSTEM_SUMMARY_SECTION_PROMPTS[sectionType]
    || `Write the ${sectionTitle} section of a client-facing system design report. 2 to 3 short paragraphs.`;
  // Every section is part of one client-facing explanation of a completed
  // design, so the proposal-stage and upgrade-path rules apply to all of them.
  // For a high-channel-count design the high-density rule follows, which
  // suspends any "note a sensible upgrade path" line in that section.
  return [
    instruction,
    '',
    PROPOSAL_STAGE_RULE,
    '',
    UPGRADE_PATH_RULE,
    buildHighChannelSectionRule(layout),
  ].filter(Boolean).join('\n');
}