// src/components/utils/rp22OfficialTitles.js
// ---------------------------------------------------------------------------
// Single canonical authority for the concise official RP22 Performance Level
// parameter titles (RP22 Parameter Index wording).
//
// These short titles are used as the collapsed-row title in the Compliance
// Report matrix and as the headline of the expanded parameter card. They are
// intentionally separate from:
//   - RP22_CATALOG `title`  (long-form official name, retained for the
//                            expanded card's detailed description context)
//   - RP22_CATALOG `notes` / presentation `short` (explanatory prose, retained
//                            verbatim inside the expanded card body)
//   - technicalParameterMeta PARAM_HUMAN_TITLES (Technical Report's own
//                            short labels — different wording, not touched)
//
// Presentation only — no maths, grading, scope, or thresholds.
// ---------------------------------------------------------------------------

export const RP22_OFFICIAL_SHORT_TITLES = Object.freeze({
  1: "Minimum distance between the listening area and the room walls",
  2: "Decoder/renderer capability and discretely rendered speaker configuration, excl. subwoofers",
  3: "Number of screen wall speakers allowed outside of recommended zonal locations",
  4: "Maximum SPL difference between screen wall speakers",
  5: "Maximum allowable horizontal angle between adjacent surround speakers",
  6: "Maximum SPL difference between surround speakers",
  7: "Wide speakers maximum allowable horizontal deviation from median angle",
  8: "Upfiring/elevation speakers allowed?",
  9: "Maximum allowable vertical angle between adjacent height speakers",
  10: "Maximum SPL difference between upper/height speakers",
  11: "Number of surround/wide/upper speakers allowed outside of recommended locations",
  12: "Screen Speakers SPL capability at RSP",
  13: "Non-screen Speakers SPL capability at RSP",
  14: "LFE frequencies total SPL capability at RSP",
  15: "Background noise floor",
  16: "Seat-to-seat frequency response variance across all screen wall speakers",
  17: "Seat-to-seat frequency response variance across all surround and height/elevation speakers",
  18: "In-room bass extension -3 dB cut off frequency",
  19: "Frequency response below the room's transition frequency",
  20: "Seat-to-seat frequency response variance below the room's transition frequency",
  21: "Level of early reflections relative to direct sound",
});

export function getOfficialRp22Title(paramId) {
  const id = Number(paramId);
  return RP22_OFFICIAL_SHORT_TITLES[id] || `Parameter ${id}`;
}