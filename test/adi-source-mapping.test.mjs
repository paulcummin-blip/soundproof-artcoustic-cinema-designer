// adi-source-mapping.test.mjs
// ---------------------------------------------------------------------------
// Regression tests for the ADI source-extraction → P12/P13 parity mapping.
// Covers the Ascendo THE12 Be PRO PASSIVE defects:
//   1. "123 dB (Cont.) / 135 dB (Peak)" is split into continuous + peak.
//   2. "Measured Data (Half Space 2pi)" reports half-space (not assumed).
//   3. "97 dB / 1 W/1m 2 pi" → sensitivity 97, 1W/1m, half-space.
//   4. Peak-only SPL stays out of the continuous field.
//   5. "Max SPL" with no continuous qualifier stays out of the continuous field.
//   6. Manufacturer-calculated SPL is proposed (calculated basis).
//   7. "Power Handling 900 W" (no qualifier) is stored as manufacturer power
//      handling (reported), not recommended amplifier max.
//   8. Only explicitly continuous figures enter the continuous-SPL field.
//   9. A record with published continuous SPL + confirmed half-space + 1W/1m
//      basis qualifies as FULL DATA even when power terminology is undefined.
//  Triad TS-IRLCR5 defects:
//  10. "Anechoic Frequency Response" must NOT establish measurement_space as
//      free-space — it is a frequency-response context, not an SPL space.
//  11. "Max RMS SPL (AES75/1m) (dBZ) 104.7" maps to continuous SPL, not peak
//      and not unmapped — "RMS" is the duration qualifier, "Max" modifies level.
//  12. "rms" basis maps to "continuous" (existing field, no new classification).
//  13. No +6 dB space correction and no −6 dB peak allowance on the RMS figure.
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractionToFound, mapMaxSplBasis } from "@/components/spl/adiParityMapping";
import { matchEnumValue } from "../base44/shared/speakerSourceReading.js";
import { classifyDataAdequacy } from "@/components/spl/dataAdequacyClassification";

function item(field, value, raw_text = "", status = "reported") {
  return { field, value, status, raw_text };
}

test("123 dB (Cont.) / 135 dB (Peak) splits into continuous + peak", () => {
  const raw = {
    reported: [
      item("max_continuous_spl_db", "123", "Measured Data 123 dB (Cont.) / 135 dB (Peak)"),
      item("max_peak_spl_db", "135", "Measured Data 123 dB (Cont.) / 135 dB (Peak)"),
      item("max_spl_basis", "continuous", "Measured Data"),
    ],
  };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.max_spl_db, "123", "continuous SPL 123 is proposed");
  assert.equal(found.max_peak_spl_db, "135", "peak SPL 135 is proposed separately");
  assert.equal(found.max_spl_basis, "continuous", "basis is continuous, not peak");
  assert.equal(info.max_peak_spl_db.value, "135");
});

test("Measured Data (Half Space 2pi) reports half-space, not assumed", () => {
  assert.equal(matchEnumValue("measurement_space", "Half Space 2pi", { measurement_space: ["free-space", "half-space", "in-room", "unspecified"] }), "half-space");
  assert.equal(matchEnumValue("measurement_space", "2 pi", { measurement_space: ["free-space", "half-space", "in-room", "unspecified"] }), "half-space");
  assert.equal(matchEnumValue("measurement_space", "2π", { measurement_space: ["free-space", "half-space", "in-room", "unspecified"] }), "half-space");
  assert.equal(matchEnumValue("measurement_space", "2pi", { measurement_space: ["free-space", "half-space", "in-room", "unspecified"] }), "half-space");
  assert.equal(matchEnumValue("measurement_space", "4π", { measurement_space: ["free-space", "half-space", "in-room", "unspecified"] }), "free-space");
});

test("97 dB / 1 W/1m 2 pi → sensitivity 97, 1W/1m, half-space", () => {
  assert.equal(matchEnumValue("sensitivity_basis", "1 W/1m", { sensitivity_basis: ["1W/1m", "2.83V/1m", "unknown"] }), "1W/1m");
  assert.equal(matchEnumValue("sensitivity_basis", "1W/1m 2 pi", { sensitivity_basis: ["1W/1m", "2.83V/1m", "unknown"] }), "1W/1m");
  assert.equal(matchEnumValue("measurement_space", "2 pi", { measurement_space: ["free-space", "half-space", "in-room", "unspecified"] }), "half-space");
  const raw = {
    reported: [
      item("sensitivity_db", "97", "Efficiency 97 dB / 1 W/1 m 2 pi"),
      item("sensitivity_basis", "1W/1m", "1 W/1 m"),
      item("measurement_space", "half-space", "2 pi"),
    ],
  };
  const { found } = extractionToFound(raw);
  assert.equal(found.sensitivity_db, "97");
  assert.equal(found.sensitivity_reference, "1W/1m");
  assert.equal(found.measurement_space, "half-space");
});

test("peak-only SPL stays out of the continuous-SPL field", () => {
  const raw = {
    reported: [
      item("max_peak_spl_db", "135", "Peak SPL: 135 dB"),
      item("max_spl_basis", "peak", "Peak SPL"),
    ],
  };
  const { found } = extractionToFound(raw);
  assert.equal(found.max_spl_db, undefined, "no continuous SPL proposed from a peak-only source");
  assert.equal(found.max_peak_spl_db, "135", "peak figure is proposed separately");
  assert.equal(found.max_spl_basis, "peak");
});

test("Max SPL with no continuous qualifier stays out of the continuous field", () => {
  const raw = {
    reported: [
      item("max_peak_spl_db", "120", "Max SPL: 120 dB"),
      item("max_spl_basis", "peak", "Max SPL"),
    ],
  };
  const { found } = extractionToFound(raw);
  assert.equal(found.max_spl_db, undefined, "Max SPL without a continuous qualifier must not enter the continuous field");
  assert.equal(found.max_peak_spl_db, "120");
  assert.equal(mapMaxSplBasis("peak"), "peak");
});

test("manufacturer-calculated SPL is proposed with calculated basis", () => {
  const raw = {
    reported: [
      item("max_continuous_spl_db", "118", "Max SPL (calculated): 118 dB"),
      item("max_spl_basis", "calculated", "calculated"),
    ],
  };
  const { found } = extractionToFound(raw);
  assert.equal(found.max_spl_db, "118", "calculated continuous SPL is proposed");
  assert.equal(found.max_spl_basis, "calculated");
});

test("Power Handling 900 W (no qualifier) is stored as manufacturer power handling", () => {
  const raw = {
    reported: [
      item("power_handling_continuous_w", "900", "Power Handling 900 W"),
    ],
  };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.power_w, "900", "manufacturer power handling is proposed as power_w");
  assert.equal(found.power_basis, "continuous", "power basis is continuous-source");
  assert.equal(info.power_w.category, "Manufacturer Power Handling",
    "category preserves the manufacturer wording without inventing a standard");
  assert.ok(!info.power_handling_note, "no basis-not-stated advisory when the manufacturer stated the figure");
});

test("only explicitly continuous figures enter the continuous-SPL field", () => {
  // A peak figure filed in max_continuous_spl_db with a peak basis is not
  // treated as continuous — the basis governs, not the field the LLM chose.
  const raw = {
    reported: [
      item("max_continuous_spl_db", "112", "Peak SPL: 112 dB"),
      item("max_spl_basis", "peak", "Peak SPL"),
    ],
  };
  const { found } = extractionToFound(raw);
  assert.equal(found.max_spl_db, undefined, "a peak-basis figure never enters the continuous field");
  assert.equal(found.max_spl_basis, "peak");
});

test("FULL DATA when published continuous SPL + reported half-space + 1W/1m, power undefined", () => {
  const rec = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: 123,
    max_spl_authority_type: "published_continuous",
    sensitivity_space_provenance: "half_space_published",
    max_spl_space_provenance: "half_space_published",
    sensitivity_reference: "1W/1m",
  };
  assert.equal(classifyDataAdequacy(rec).key, "FULL", "direct-SPL route with published continuous SPL is FULL even without power");
});

test("Ascendo full extraction maps to FULL DATA inputs", () => {
  const raw = {
    reported: [
      item("sensitivity_db", "97", "Efficiency 97 dB / 1 W/1 m 2 pi"),
      item("sensitivity_basis", "1W/1m", "1 W/1 m"),
      item("nominal_impedance_ohm", "8", "Impedance 8 Ω"),
      item("max_continuous_spl_db", "123", "Measured Data 123 dB (Cont.) / 135 dB (Peak)"),
      item("max_peak_spl_db", "135", "Measured Data 123 dB (Cont.) / 135 dB (Peak)"),
      item("max_spl_basis", "continuous", "Measured Data"),
      item("measurement_space", "half-space", "Measured Data (Half Space 2pi)"),
      item("power_handling_continuous_w", "900", "Power Handling 900 W"),
    ],
  };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.sensitivity_db, "97");
  assert.equal(found.sensitivity_reference, "1W/1m");
  assert.equal(found.impedance_ohm, "8");
  assert.equal(found.max_spl_db, "123");
  assert.equal(found.max_peak_spl_db, "135");
  assert.equal(found.max_spl_basis, "continuous");
  assert.equal(found.measurement_space, "half-space");
  assert.equal(found.power_w, "900", "manufacturer power handling is proposed");
  assert.equal(info.power_w.category, "Manufacturer Power Handling",
    "category preserves the manufacturer wording without inventing a standard");
  assert.ok(!info.power_handling_note, "no basis-not-stated advisory for reported power handling");
});

// ---------------------------------------------------------------------------
// Triad TS-IRLCR5 regression: anechoic frequency response must not establish
// Full Space, and "Max RMS SPL" must map to continuous capability.
// ---------------------------------------------------------------------------

const MEASUREMENT_SPACE_ENUM = { measurement_space: ["free-space", "half-space", "in-room", "unspecified"] };

test("anechoic does not map to free-space in measurement_space enum matching", () => {
  // "Anechoic" on its own must NOT establish free-space. Only explicit
  // "Full Space" / "4π" / "4 pi" should map to free-space.
  assert.equal(
    matchEnumValue("measurement_space", "anechoic", MEASUREMENT_SPACE_ENUM),
    "",
    "'anechoic' alone must not map to any measurement_space value",
  );
  assert.equal(
    matchEnumValue("measurement_space", "Anechoic Frequency Response", MEASUREMENT_SPACE_ENUM),
    "",
    "'Anechoic Frequency Response' must not map to free-space",
  );
  // Explicit Full Space / 4π still map correctly.
  assert.equal(
    matchEnumValue("measurement_space", "Full Space", MEASUREMENT_SPACE_ENUM),
    "free-space",
  );
  assert.equal(
    matchEnumValue("measurement_space", "4π", MEASUREMENT_SPACE_ENUM),
    "free-space",
  );
  // Half Space / 2π still map correctly.
  assert.equal(
    matchEnumValue("measurement_space", "Half Space", MEASUREMENT_SPACE_ENUM),
    "half-space",
  );
  assert.equal(
    matchEnumValue("measurement_space", "2π", MEASUREMENT_SPACE_ENUM),
    "half-space",
  );
});

test("Max RMS SPL maps to continuous SPL, not peak and not unmapped", () => {
  // The LLM should extract "Max RMS SPL (AES75/1m) (dBZ) 104.7" as
  // max_continuous_spl_db = 104.7 with max_spl_basis = "continuous".
  // The "Peak SPL: 122.7 dB" stays separate in max_peak_spl_db.
  const raw = {
    reported: [
      item("sensitivity_db", "87", "Sensitivity 87 dB at 2.83 V / 1 m"),
      item("sensitivity_basis", "2.83V/1m", "2.83 V / 1 m"),
      item("nominal_impedance_ohm", "6", "Impedance 6 Ω"),
      item("max_continuous_spl_db", "104.7", "Max RMS SPL (AES75/1m) (dBZ) 104.7"),
      item("max_peak_spl_db", "122.7", "Peak SPL 122.7 dB"),
      item("max_spl_basis", "continuous", "Max RMS SPL"),
      // measurement_space is NOT reported — the source only says "Anechoic
      // Frequency Response", which does not establish a space for SPL.
      item("power_handling_continuous_w", "180", "Continuous Power Handling 180 W"),
      item("recommended_amp_max_w", "200", "Recommended Amplifier 200 W"),
      item("peak_power_w", "360", "Peak Power Handling 360 W"),
    ],
  };
  const { found, info } = extractionToFound(raw);

  // The RMS figure enters the continuous field — it is the capability authority.
  assert.equal(found.max_spl_db, "104.7", "Max RMS SPL enters the continuous SPL field");
  assert.equal(found.max_spl_basis, "continuous", "RMS basis is classified as continuous");
  // The peak figure stays separate — no −6 dB subtraction from the RMS figure.
  assert.equal(found.max_peak_spl_db, "122.7", "Peak SPL stays separate");
  // The continuous figure was not collapsed from the peak (no −6 dB applied).
  assert.notEqual(found.max_spl_db, 116.7, "no −6 dB peak allowance on the RMS figure");
  // measurement_space is not proposed (source did not state it for SPL).
  assert.equal(found.measurement_space, undefined, "no measurement_space proposed from anechoic frequency response");
  // No unmapped warning for the RMS SPL concept.
  assert.ok(!info.potential_unmapped, "Max RMS SPL is not flagged as unmapped");
  // Sensitivity and impedance are proposed normally.
  assert.equal(found.sensitivity_db, "87");
  assert.equal(found.sensitivity_reference, "2.83V/1m");
  assert.equal(found.impedance_ohm, "6");
});

test("rms basis maps to continuous in mapMaxSplBasis", () => {
  // The LLM may return "rms" as the basis label for "Max RMS SPL". It maps
  // to the existing 'continuous' basis — no new classification introduced.
  assert.equal(mapMaxSplBasis("rms"), "continuous");
  assert.equal(mapMaxSplBasis("RMS"), "continuous");
  assert.equal(mapMaxSplBasis("continuous"), "continuous");
  assert.equal(mapMaxSplBasis("peak"), "peak");
});

test("rms maps to continuous in matchEnumValue for max_spl_basis", () => {
  const SPL_BASIS_ENUM = { max_spl_basis: ["AES", "IEC", "continuous", "peak", "manufacturer unspecified", "calculated", "unknown"] };
  assert.equal(matchEnumValue("max_spl_basis", "rms", SPL_BASIS_ENUM), "continuous");
  assert.equal(matchEnumValue("max_spl_basis", "RMS", SPL_BASIS_ENUM), "continuous");
  assert.equal(matchEnumValue("max_spl_basis", "continuous", SPL_BASIS_ENUM), "continuous");
  assert.equal(matchEnumValue("max_spl_basis", "peak", SPL_BASIS_ENUM), "peak");
});

test("Triad TS-IRLCR5 full extraction: no space correction, continuous RMS authority", () => {
  // Simulates the ADI extraction from the Triad datasheet where the only
  // "anechoic" mention is in "Anechoic Frequency Response" — not an SPL
  // measurement-space declaration. measurement_space is left unspecified.
  const raw = {
    reported: [
      item("sensitivity_db", "87", "Sensitivity: 87 dB at 2.83 V / 1 m"),
      item("sensitivity_basis", "2.83V/1m", "2.83 V / 1 m"),
      item("nominal_impedance_ohm", "6", "Impedance: 6 Ω"),
      item("max_continuous_spl_db", "104.7", "Max RMS SPL (AES75/1m) (dBZ) 104.7"),
      item("max_peak_spl_db", "122.7", "Peak SPL 122.7 dB"),
      item("max_spl_basis", "continuous", "Max RMS SPL"),
      item("power_handling_continuous_w", "180", "Continuous Power Handling: 180 W"),
      item("recommended_amp_max_w", "200", "Recommended Amplifier: 200 W"),
      item("peak_power_w", "360", "Peak Power Handling: 360 W"),
    ],
  };
  const { found } = extractionToFound(raw);

  // No measurement_space is proposed — defaults to assumed Half Space
  // (no +6 dB correction) in the downstream normaliser.
  assert.equal(found.measurement_space, undefined,
    "anechoic frequency response does not establish measurement_space");

  // The RMS figure is the continuous capability authority — no −6 dB
  // peak allowance and no +6 dB space correction.
  assert.equal(found.max_spl_db, "104.7",
    "Max RMS SPL is the continuous SPL, preserved at full precision");
  assert.equal(found.max_spl_basis, "continuous",
    "RMS is classified as continuous, not peak or manufacturer unspecified");
  assert.equal(found.max_peak_spl_db, "122.7",
    "Peak SPL is preserved separately at full precision");
});

test("explicit Full Space still maps to free-space when stated for SPL", () => {
  // When the source genuinely states "Full Space" or "4π" for the SPL
  // measurement (not just "anechoic" for frequency response), it still
  // maps to free-space and receives the +6 dB correction downstream.
  assert.equal(
    matchEnumValue("measurement_space", "Full Space", MEASUREMENT_SPACE_ENUM),
    "free-space",
  );
  assert.equal(
    matchEnumValue("measurement_space", "4pi", MEASUREMENT_SPACE_ENUM),
    "free-space",
  );
});