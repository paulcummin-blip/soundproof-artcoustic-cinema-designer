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
//   7. "Power Handling 900 W" (no qualifier) is NOT recommended amplifier max
//      and NOT a continuous basis — preserved as an advisory note.
//   8. Only explicitly continuous figures enter the continuous-SPL field.
//   9. A record with published continuous SPL + confirmed half-space + 1W/1m
//      basis qualifies as FULL DATA even when power terminology is undefined.
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

test("Power Handling 900 W (no qualifier) is not recommended amplifier max and not continuous", () => {
  const raw = {
    reported: [
      item("power_handling_continuous_w", "900", "Power Handling 900 W", "ambiguous"),
    ],
  };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.power_w, undefined, "ambiguous power handling is not proposed as power_w");
  assert.equal(found.power_basis, undefined, "no continuous basis is invented");
  assert.ok(info.power_handling_note, "ambiguous power is surfaced as an advisory note");
  assert.equal(info.power_handling_note.value, "900");
  assert.equal(info.power_handling_note.category, "Power handling (basis not stated)");
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
    sensitivity_space_provenance: "half_space_published",
    max_spl_space_provenance: "half_space_published",
    sensitivity_reference: "1W/1m",
  };
  assert.equal(classifyDataAdequacy(rec).key, "FULL", "direct-SPL route with confirmed space + basis is FULL even without power");
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
    ],
    ambiguous: [
      item("power_handling_continuous_w", "900", "Power Handling 900 W", "ambiguous"),
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
  assert.equal(found.power_w, undefined, "ambiguous power not auto-proposed");
  assert.ok(info.power_handling_note, "power handling preserved as advisory");
});