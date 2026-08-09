/**
 * technicalParameterMeta.js
 * --------------------------
 * Category and human-readable title mappings for the Technical Report
 * RP22 parameter redesign.
 *
 * Categories follow the three RP22 pillars:
 *   Spatial Resolution — speaker placement, angles, zones
 *   Dynamic Range      — SPL capability, speaker count, noise, extension
 *   Timbre Matching    — SPL consistency, frequency response variance
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
  16: "Timbre Matching",
  17: "Timbre Matching",
  18: "Timbre Matching",
  19: "Timbre Matching",
  20: "Timbre Matching",
  21: "Timbre Matching",
};

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

export function getHumanTitleForParam(paramId) {
  return PARAM_HUMAN_TITLES[paramId] || `Parameter ${paramId}`;
}