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
3 to 4 short paragraphs.`,

  spatial_resolution: `Explain Spatial Resolution as a result of speaker count and speaker positions, and what that means for sound movement and immersion.

Reference only the RP22 parameters that are present in the supplied Sound Proof calculated data, in this order where they exist:
- P2 discrete channel count
- P4 screen consistency
- P5 horizontal spacing
- P6 surround level consistency
- P7 front wide position
- P9 overhead spacing
- P10 overhead level consistency

For each parameter you reference, state the achieved level and the measured result exactly as supplied, then explain in plain language what the client will hear because of it.

Put strengths first. Mention any clear limitation honestly and in client-friendly language, without undermining the design.
Do not list parameters mechanically and do not include a table.
3 to 4 short paragraphs.`,

  dynamic_range: `Explain Dynamic Range as headroom rather than loudness: the ability to reproduce quiet detail and sudden peaks at the same time.

Reference only the RP22 parameters that are present in the supplied Sound Proof calculated data:
- P12 screen Dynamic Range
- P13 non-screen Dynamic Range
- P14 LFE and subwoofer output where relevant

Include the dBC values and the RP22 levels exactly as supplied when they are available. Explain how that headroom benefits dialogue, music and film effects at the level the client will listen at.

If the system is modest, describe the benefit honestly without overstating it. If the system is high performance, make that clear.
3 to 4 short paragraphs, no table.`,

  timbre_matching: `Explain Timbre Matching as tonal consistency: the same voice, instrument or effect sounding the same as it moves around the room.

Reference only the RP22 parameters that are present in the supplied Sound Proof calculated data:
- P16 screen timbre and screen frequency response consistency
- P17 surround and overhead timbre consistency
- P18 bass extension where relevant
- P19 bass response where relevant
- P20 bass seat-to-seat consistency where relevant

Explain why matched speaker families and consistent voicing matter to what the client hears, using the supplied speaker family data.

Keep the tone practical and client-facing. 3 to 4 short paragraphs, no table.`,

  // Used only when a design has no calculated highlight rows to build the
  // table from. The table itself is built by Sound Proof, never by the model.
  [HIGHLIGHTS_SECTION_TYPE]: `Write the Key Performance Highlights section as 2 to 3 short paragraphs describing the measured performance of this design. Do not write a table, and do not invent any value. Reference only the results supplied in the Sound Proof calculated data.`,

  overall_design: `Write the Overall Design section: a concise client-facing summary of the design, and the strongest paragraph in the report.

Cover:
- the main positives, leading with the strongest area of the design
- how the system is balanced as a whole
- where this system is strongest, using the Design Index values and RP22 levels supplied
- any clear limitation, stated honestly without undermining the design
- easy-win upgrade options, only where the supplied data supports them, for example additional overheads, rear surrounds, a larger subwoofer, or more capable screen speakers

For a modest system, explain the benefits clearly, do not claim perfection, and point to sensible upgrades. For a high performance system, state the quality clearly and do not undersell it. Use phrases such as strong cinema layout, high speaker density, very strong tonal consistency or state of the art for a room of this type only when the data supports them.

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