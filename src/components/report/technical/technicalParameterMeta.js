/**
 * technicalParameterMeta.js
 * --------------------------
 * Category and human-readable title mappings for the Technical Report
 * RP22 parameter redesign.
 *
 * Categories follow the three RP22 pillars, in the grouping the report prints:
 *   Spatial Resolution — P1–P11  (speaker placement, angles, zones)
 *   Dynamic Range      — P12–P16 (SPL capability, speaker count, noise floor,
 *                                 screen frequency-response variance)
 *   Timbre Matching    — P17–P21 (surround timbre, bass extension, bass
 *                                 response, seat-to-seat consistency, early
 *                                 reflections)
 *
 * P12, P13, P14, P15 and P16 are ALWAYS Dynamic Range parameters: the page
 * heading, the category divider and the card's own category label all read
 * from this one map, so the parameter pages and the group headings can never
 * disagree.
 */

export const PARAM_CATEGORIES = {
  1: "Spatial Resolution",
  2: "Spatial Resolution",
  3: "Spatial Resolution",
  4: "Spatial Resolution",
  5: "Spatial Resolution",
  6: "Spatial Resolution",
  7: "Spatial Resolution",
  8: "Spatial Resolution",
  9: "Spatial Resolution",
  10: "Spatial Resolution",
  11: "Spatial Resolution",
  12: "Dynamic Range",
  13: "Dynamic Range",
  14: "Dynamic Range",
  15: "Dynamic Range",
  16: "Dynamic Range",
  17: "Timbre Matching",
  18: "Timbre Matching",
  19: "Timbre Matching",
  20: "Timbre Matching",
  21: "Timbre Matching",
};

/**
 * Category colours — existing Sound Proof brand tones only.
 *   Spatial Resolution  deep green  #213428  (brand green)
 *   Dynamic Range       warm bronze #625143  (brand accent)
 *   Timbre Matching     cool slate  #3E4349  (brand slate)
 * Applied to the category heading strip, its colour bar and the small category
 * label on the parameter card. Deliberately three tones, so the report reads
 * as clearly grouped rather than busy.
 */
export const PARAM_CATEGORY_COLOURS = Object.freeze({
  "Spatial Resolution": "#213428",
  "Dynamic Range": "#625143",
  "Timbre Matching": "#3E4349",
  // Screen / Viewing Geometry is governed by RP23 and shares the neutral slate.
  "Screen / Viewing Geometry": "#3E4349",
});

const DEFAULT_CATEGORY_COLOUR = "#213428";

export const PARAM_HUMAN_TITLES = {
  1: "Distance to Nearest Wall",
  2: "Discrete Speaker Count",
  3: "Screen Speakers Outside Zones",
  4: "Screen Wall SPL Difference",
  5: "Horizontal Speaker Spacing",
  6: "Surround SPL Difference",
  7: "Wide Speaker Deviation",
  8: "Upfiring / Elevation Speakers",
  9: "Vertical Angle Between Uppers",
  10: "Upper Speaker SPL Difference",
  11: "Speakers Outside Zones",
  12: "Screen SPL Capability",
  13: "Non-Screen SPL Capability",
  14: "LFE SPL Capability",
  15: "Background Noise Floor",
  16: "Screen Frequency Response Variance",
  17: "Surround Frequency Response Variance",
  18: "Bass Extension",
  19: "Bass Response vs Target",
  20: "Bass Seat-to-Seat Consistency",
  21: "Early Reflections",
};

export function getCategoryForParam(paramId) {
  return PARAM_CATEGORIES[paramId] || "General";
}

export function getCategoryColour(category) {
  return PARAM_CATEGORY_COLOURS[category] || DEFAULT_CATEGORY_COLOUR;
}

export function getHumanTitleForParam(paramId) {
  return PARAM_HUMAN_TITLES[paramId] || `Parameter ${paramId}`;
}