// installedSpaceAssumption.js
// ---------------------------------------------------------------------------
// ONE home for the ADI installed-speaker normalisation assumption.
//
// Manufacturers often publish an "in room" response, or no space declaration at
// all, and never state the measurement space. Sound Proof compares every
// competitor on its own half-space / installed-speaker convention, so the row is
// normalised as an EXPLICIT ADI assumption. It is never presented as a confirmed
// published basis, and it can only ever hold a row at confidence C.
//
//   stated half-space   → used as published (no assumption)
//   stated free-space   → converted once to half space (published conversion)
//   in room / unspecified / blank → the standard installed normalisation is
//                                   applied as an ADI assumption, at confidence C
//
// Shared by candidate review, the Speaker Database product/spec review and the
// RP22 comparison panel, so all three state exactly the same thing and the
// assumption can never be silently upgraded to B just because a model is
// wall-mounted or in-wall.
// ---------------------------------------------------------------------------

export const INSTALLED_SPACE_ASSUMPTION =
  "Measurement space not explicitly stated — Sound Proof standard installed / half-space normalisation applied as an ADI assumption";

// The evidence basis and confidence this assumption carries. A treated basis is
// an estimate: it can never be reported as published measured capability.
export const ADI_ESTIMATE_BASIS = "ADI estimate from official manufacturer data";
export const ASSUMED_SPACE_CONFIDENCE = "C";
export const ADI_ESTIMATE_ATTRIBUTION =
  `Confidence ${ASSUMED_SPACE_CONFIDENCE} · ${ADI_ESTIMATE_BASIS}`;

/** The full sentence shown wherever the comparison names its assumptions. */
export const INSTALLED_SPACE_ASSUMPTION_NOTE =
  `${INSTALLED_SPACE_ASSUMPTION} · ${ADI_ESTIMATE_ATTRIBUTION}`;

// The same statement in the space a narrow table cell has. Both wordings live
// here so the short label and the full sentence can never drift apart.
export const INSTALLED_SPACE_ASSUMPTION_SHORT =
  "ADI assumption · half-space installed normalisation applied";

// Only a stated space declaration is a confirmed basis. "in room", "unspecified"
// and a blank field are all unconfirmed — in room is a real published statement,
// but it is not a basis the comparison can be graded on.
export function spaceBasisConfirmed(measurementSpace) {
  const space = String(measurementSpace ?? "").trim().toLowerCase();
  return space === "half-space" || space === "free-space";
}

/** How the published space reads in the review UI. */
export function spaceSourceLabel(measurementSpace) {
  const space = String(measurementSpace ?? "").trim().toLowerCase();
  if (space === "half-space") return "Half space — stated by the manufacturer";
  if (space === "free-space") return "Full space — stated, converted once to half space";
  if (space === "in-room") return "In room — published, but not a confirmed comparison basis";
  return "Not stated by the manufacturer";
}

const result = (applied) => ({
  applied,
  confidence: applied ? ASSUMED_SPACE_CONFIDENCE : null,
  basis: applied ? ADI_ESTIMATE_BASIS : "",
  statement: INSTALLED_SPACE_ASSUMPTION,
  note: applied ? INSTALLED_SPACE_ASSUMPTION_NOTE : "",
});

/**
 * The assumption standing of a Speaker Specification (the review database shape).
 * @returns {object} { applied, confidence, basis, statement, note }
 */
export function installedSpaceAssumptionForSpecification(specification) {
  if (!specification) return result(false);
  return result(!spaceBasisConfirmed(specification.measurement_space));
}

/**
 * The same treatment for a mapped comparison row, read from the normalisation
 * provenance so the two shapes can never disagree.
 */
export function installedSpaceAssumptionForRow(row) {
  const assumed = row?.sensitivity_space_provenance === "half_space_assumed"
    || row?.max_spl_space_provenance === "half_space_assumed";
  return result(Boolean(assumed));
}