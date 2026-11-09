// dataAdequacyClassification.js
// ---------------------------------------------------------------------------
// Admin-facing data-adequacy labels for the RP22 competitor library:
// FULL / GOOD / INCOMPLETE.
//
// These describe whether the manufacturer evidence supports a defensible
// P12/P13 result. They are NOT the engine's A/B/C/D confidence classes and are
// not derived from them — they are classified directly from the normalised
// record's own provenance fields, so the label can never drift from the data
// that produced it.
//
//   FULL        — published measured capability with a confirmed measurement
//                 space and a confirmed sensitivity basis: a like-for-like
//                 comparison at least equivalent to Artcoustic's evidence.
//   GOOD        — a defensible numerical result is possible, but at least one
//                 controlled assumption or normalisation is required (calculated
//                 SPL, assumed half-space, or an assumed sensitivity basis).
//   INCOMPLETE  — not enough reliable information for a defensible P12/P13
//                 result. The row stays selectable but comparison is unavailable.
// ---------------------------------------------------------------------------

export const DATA_ADEQUACY = Object.freeze({
  FULL: {
    key: "FULL",
    label: "FULL DATA",
    short: "FULL",
    tone: "#213428",
    meaning: "Manufacturer publishes sufficient transparent information to calculate P12/P13 on substantially the same evidence basis used for Artcoustic. No material additional assumptions are required.",
  },
  GOOD: {
    key: "GOOD",
    label: "GOOD DATA",
    short: "GOOD",
    tone: "#9A6E00",
    meaning: "Sufficient manufacturer information for a useful, defensible P12/P13 calculation, but some ambiguity or controlled assumption remains (e.g. measurement space not stated, sensitivity normalised, power terminology less rigorously defined, or manufacturer-calculated capability).",
  },
  INCOMPLETE: {
    key: "INCOMPLETE",
    label: "INCOMPLETE DATA",
    short: "INCOMPLETE",
    tone: "#B23A3A",
    meaning: "Incomplete data — fair P12/P13 comparison not available. Insufficient manufacturer-published information to calculate a fair P12/P13 result.",
  },
});

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

/**
 * Classify one normalised competitor record (the shape normalizeCompetitor
 * returns — the same object loadComparisonCandidates puts on candidate.record).
 * @param {object} record normalised competitor record
 * @returns {{ key, label, short, tone }}
 */
export function classifyDataAdequacy(record) {
  if (!record || record.p12_p13_eligible !== true) return DATA_ADEQUACY.INCOMPLETE;

  // A defensible numerical result is possible. Now: is it FULL or GOOD?
  const publishedSpl = hasValue(record.halfspace_published_max_continuous_spl_db_1m);
  const spaceConfirmed = record.sensitivity_space_provenance !== "half_space_assumed"
    && record.max_spl_space_provenance !== "half_space_assumed";
  const basisConfirmed = record.sensitivity_reference === "1W/1m"
    || record.sensitivity_reference === "2.83V/1m";

  // FULL requires published measured capability AND no controlled assumptions
  // behind the space or the sensitivity basis.
  if (publishedSpl && spaceConfirmed && basisConfirmed) return DATA_ADEQUACY.FULL;
  return DATA_ADEQUACY.GOOD;
}