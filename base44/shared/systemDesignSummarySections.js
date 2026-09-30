/**
 * systemDesignSummarySections.js (shared)
 * ---------------------------------------
 * The section structure of the CLIENT-FACING SYSTEM DESIGN SUMMARY.
 *
 * This is not a general proposal document. It is a sales summary of the
 * system design, built around the three core RP22 design structures:
 * Spatial Resolution, Dynamic Range and Timbre Matching.
 *
 * Shared by the backend report generators (generateProposal and
 * regenerateProposalSection) so both write from the same structure.
 *
 * The frontend mirrors this vocabulary in
 * src/components/proposal/proposalSections.js for the editor UI.
 *
 * Pure: no React, no side effects, no runtime-specific APIs.
 */

export const HIGHLIGHTS_SECTION_TYPE = 'key_performance_highlights';

/** The editable sections of a System Design Summary, in report order. */
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
 * Per-section writing instructions for the System Design Summary.
 *
 * Every instruction references only the RP22 parameters that are actually
 * present in the supplied Sound Proof calculated data, so the model never
 * writes about a parameter that was not assessed for this design.
 */
export const SYSTEM_SUMMARY_SECTION_PROMPTS = {
  system_design_summary: `Open the report as an experienced cinema designer describing this design to the client.

Cover, in this order:
- the screen or display, and what it means for this room
- the system layout, including the channel configuration and the speaker roles
- the seating and viewing context, including how many seats there are and how the client uses the room
- the main loudspeaker and subwoofer package, by family or model
- how those parts work together as one system
- what this design is trying to achieve for the client

Use the supplied Sound Proof calculated data wherever it applies, and never invent a value.

Open with the room, the screen and the system concept: the screen type and size, the viewing distance, the RP23 viewing result where it is relevant, the system format, and the main loudspeaker families. Say why the room has been designed this way.

Do not open with an equipment list, and do not describe a product in isolation unless you are explaining why that product was chosen.
3 to 4 short paragraphs.`,

  spatial_resolution: `Explain Spatial Resolution as a result of speaker count and speaker positions, and what that means for sound movement and immersion.

Choose the two or three results that matter most for this room from the Spatial Resolution results present in the supplied Sound Proof calculated data, for example discrete channel count, screen consistency, surround spacing, surround level consistency, front wide position, overhead spacing and overhead level consistency. Do not work through them all.

Name each chosen result in plain language with its achieved level and measured value exactly as supplied, using no more than one parameter code in the section, and explain what the client will hear because of it.

Evidence to choose from, where it was assessed reliably: discrete channel count (P2) for how many physical positions the sound can come from, screen consistency (P4) for stable dialogue and screen-channel agreement, surround spacing (P5) for movement between adjacent speakers, surround level consistency (P6), front wide position (P7) for movement between the screen and the side walls, overhead spacing (P9) for front-to-rear movement overhead, and overhead level consistency (P10). Do not mention P8.

Explain the client experience first, then the result that supports it. For example: the maximum horizontal gap between adjacent speakers is 50 degrees, reaching RP22 Level 4, which gives effects more physical positions to move through, so movement around the room feels continuous rather than jumping between speakers.

Lead with the strongest area. Mention one clear limitation honestly, in client-friendly language, without undermining the design. Where the data supports it, note a sensible upgrade path.
Do not list parameters mechanically and do not include a table.
3 to 4 short paragraphs.`,

  dynamic_range: `Explain Dynamic Range as headroom rather than loudness: the ability to reproduce quiet detail and sudden peaks at the same time.

Choose the results that matter most for this room from the Dynamic Range results present in the supplied Sound Proof calculated data, for example screen dynamic range, non-screen dynamic range and the subwoofer system output. Do not work through them all, and use no more than one parameter code in the section.

Use the dBC values and the RP22 levels exactly as supplied, and explain in plain language how that headroom benefits dialogue, music and film effects at the level the client will listen at.

Screen Dynamic Range (P12) and non-screen Dynamic Range (P13) are the main evidence. Use the LFE and subwoofer result (P14) only where the bass output is reliable. Never reference P15.

Explain that Dynamic Range is not simply about playing louder: it is about headroom. Cover the benefits that apply here, for example dialogue staying clear, music opening up, action scenes keeping their impact, peaks staying clean, the system avoiding a compressed sound, the speakers not needing to run near their limits, and the front stage and surround system staying balanced.

If one part of the system is weaker than another, explain that clearly and calmly.

If the system is modest, describe the benefit honestly without overstating it. If the system is high performance, make that clear. Where the data supports one, note a sensible upgrade path.
3 to 4 short paragraphs, no table.`,

  timbre_matching: `Explain Timbre Matching as tonal consistency: the same voice, instrument or effect sounding the same as it moves around the room.

Choose the results that matter most for this room from the Timbre Matching results present in the supplied Sound Proof calculated data, for example screen timbre and frequency response consistency, surround and overhead timbre consistency, and the bass behaviour that shapes tonal balance. Do not work through them all, and use no more than one parameter code in the section.

Explain why matched speaker families and consistent voicing matter to what the client hears, using the supplied speaker family data, and say what the client will hear because of the results you chose.

Screen timbre (P16) and surround timbre (P17) are the main evidence. Use bass extension (P18) and bass response (P19) only where the bass is reliable and useful. Never reference P20, and never claim perfect bass.

Explain why the room should sound like one system rather than a collection of speakers: common Artcoustic drive-unit families, consistent voicing, controlled dispersion, the sub and satellite approach, similar tonal character as effects move, stable dialogue across seats, and consistency between the screen, surround and overhead layers.

Make it practical, for example: a voice or effect may begin on the screen, move into the surrounds and continue overhead, and when those speakers share the same tonal character the sound stays believable throughout that movement.

Where a reliable bass result exists, add a short bass performance paragraph explaining why the subwoofer positions were chosen. For a four-subwoofer system, explain that the main gain is usually consistency rather than extra volume.

Keep the tone practical and client-facing. Mention a clear limitation honestly where the data shows one, and note a sensible upgrade path where the data supports it.
3 to 4 short paragraphs, no table.`,

  // Used only when a design has no calculated highlight rows to build the
  // table from. The table itself is built by Sound Proof, never by the model.
  [HIGHLIGHTS_SECTION_TYPE]: `Write the Key Performance Highlights section as 2 to 3 short paragraphs describing the measured performance of this design. Do not write a table, and do not invent any value. Reference only the results supplied in the Sound Proof calculated data.`,

  overall_design: `Write the Overall Design section: a concise client-facing summary of the design, and the strongest paragraph in the report.

Cover:
- the main positives, leading with the strongest area of the design
- how the system is balanced as a whole
- where this system is strongest, using the supplied RP22 and RP23 levels and the project results that matter most for this room
- any clear limitation, stated honestly without undermining the design
- easy-win upgrade options, only where the supplied data supports them, for example additional overheads, rear surrounds, a larger subwoofer, or more capable screen speakers

For a modest system, explain the benefits clearly, do not claim perfection, and point to sensible upgrades. For a high performance system, state the quality clearly and do not undersell it. Use phrases such as strong cinema layout, high speaker density or very strong tonal consistency only when the data supports them.

Do not repeat the previous sections. Bring the room back together: image scale, speaker layout, dynamic headroom, tonal consistency, the main listening positions, and a clear upgrade opportunity where one exists. The final paragraphs should leave the client confident that the design decisions are deliberate.

Do not end with a generic closing phrase. 2 to 4 short paragraphs.`,

  room_images: `Write a brief introduction for the project images section. The images follow this introduction. 1 paragraph.`,
};

/**
 * @param {string} sectionType
 * @param {string} sectionTitle
 * @returns {string} writing instruction for one System Design Summary section
 */
export function getSystemSummarySectionPrompt(sectionType, sectionTitle) {
  return SYSTEM_SUMMARY_SECTION_PROMPTS[sectionType]
    || `Write the ${sectionTitle} section of a client-facing system design summary. 2 to 3 short paragraphs.`;
}