// sensitivityBasisAssumption.js
// ---------------------------------------------------------------------------
// ONE home for the ADI sensitivity-basis treatment of a competitor row.
//
// A manufacturer often publishes a sensitivity figure without saying what it was
// quoted against. When a sensitivity AND an impedance are both published, the
// figure is treated as 2.83 V / 1 m so the row can be compared at all. The value
// itself is never invented, a missing impedance is never assumed, and the
// treatment can never lift a row above confidence C.
//
// Shared by the RP22 comparison candidate list and the Speaker Database
// readiness list, so both report the same class for the same row.
// ---------------------------------------------------------------------------

import { parseSensitivityBasis } from "@/components/utils/spl/competitorNormalization";

export const ASSUMED_SENSITIVITY_BASIS = "Sensitivity basis not stated — treated as 2.83 V / 1 m";

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

/**
 * Apply the 2.83 V / 1 m treatment when the basis is undeclared.
 * @returns {object} { row, assumed } — the row unchanged when nothing is assumed.
 */
export function applySensitivityBasisAssumption(row) {
  const hasSensitivity = hasValue(row.sensitivity_value_db);
  const basisDeclared = parseSensitivityBasis(row.sensitivity_reference) !== null;
  const impedanceKnown = hasValue(row.sensitivity_impedance_used_ohm) || hasValue(row.rated_impedance_ohm);
  if (!hasSensitivity || basisDeclared || !impedanceKnown) return { row, assumed: false };
  return { row: { ...row, sensitivity_reference: "2.83V/1m" }, assumed: true };
}