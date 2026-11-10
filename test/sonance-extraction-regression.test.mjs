// sonance-extraction-regression.test.mjs
// ---------------------------------------------------------------------------
// Regression tests for the RP22 comparison source-reading extraction pipeline.
// Confirms that the extraction → parity-mapping → data-adequacy path correctly
// handles manufacturer datasheets that state Power Handling as a min/max range
// without a continuous/RMS/IEC/AES qualifier.
//
// Regression cases:
//   Sonance R1  — 90 dB @ 2.83V/1m, 8 Ω, "Power Handling: 5W min; 150W max"
//   Sonance R2  — 92 dB @ 2.83V/1m, 6 Ω, "Power Handling: 5W min; 200W max"
//   Wisdom P2i  — sensitivity + impedance + published max SPL → GOOD DATA
//   Triad TS-IWSAT6 — continuous SPL + peak SPL → GOOD/FULL per transparency rules
//
// Does NOT test the P12/P13 engine — only the extraction→mapping→label discipline.
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractionToFound, mapMaxSplBasis } from "@/components/spl/adiParityMapping";
import { classifyDataAdequacy, DATA_ADEQUACY } from "@/components/spl/dataAdequacyClassification";
import { matchEnumValue } from "../base44/shared/speakerSourceReading.js";

function item(field, value, raw_text = "", status = "reported") {
  return { field, value, status, raw_text };
}

// ---------------------------------------------------------------------------
// Sonance R1 — "Power Handling: 5 Watts minimum; 150 Watts maximum"
// The extraction should report 150W as power_handling_continuous_w (reported),
// NOT as recommended_amp_max_w, and NOT as ambiguous.
// ---------------------------------------------------------------------------

test("Sonance R1: Power Handling min/max range is reported as power_handling_continuous_w, not amplifier", () => {
  const raw = {
    reported: [
      item("sensitivity_db", "90", "Sensitivity: 90dB SPL (2.83V/1 meter)"),
      item("sensitivity_basis", "2.83V/1m", "2.83V/1 meter"),
      item("nominal_impedance_ohm", "8", "Impedance: 8 ohms nominal; 6 ohms minimum"),
      item("minimum_impedance_ohm", "6", "6 ohms minimum"),
      item("power_handling_continuous_w", "150", "Power Handling: 5 Watts minimum; 150 Watts maximum"),
    ],
    potential_unmapped: [],
  };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.sensitivity_db, "90", "sensitivity 90 is proposed");
  assert.equal(found.sensitivity_reference, "2.83V/1m", "sensitivity basis 2.83V/1m is proposed");
  assert.equal(found.impedance_ohm, "8", "nominal impedance 8 is proposed");
  assert.equal(found.power_w, "150", "power maximum 150 is proposed");
  assert.equal(found.power_basis, "continuous", "power basis is continuous (speaker rating), not amplifier");
  assert.notEqual(found.power_basis, "amplifier", "150W must NOT be classified as recommended amplifier maximum");
  assert.equal(info.power_w.category, "Manufacturer Power Handling", "category preserves the manufacturer terminology");
  assert.equal(info.power_w.basis, "continuous");
  assert.equal(info.power_w.quote, "Power Handling: 5 Watts minimum; 150 Watts maximum", "literal source label preserved as evidence");
});

test("Sonance R1: qualifies for GOOD DATA (sensitivity + impedance + power, space assumed)", () => {
  // Simulate the normalised record the comparison produces from the Sonance R1
  // extraction: sensitivity 90 dB @ 2.83V/1m, 8 Ω, 150 W power handling, space
  // unstated → Half Space assumed.
  const rec = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: null, // no published max SPL
    sensitivity_space_provenance: "half_space_assumed",
    max_spl_space_provenance: "half_space_assumed",
    sensitivity_reference: "2.83V/1m",
  };
  const adequacy = classifyDataAdequacy(rec);
  assert.equal(adequacy.key, "GOOD", "Sonance R1 with sensitivity + impedance + power and assumed space is GOOD DATA");
  assert.notEqual(adequacy.key, "INCOMPLETE", "must not be INCOMPLETE when power handling is captured");
});

test("Sonance R1: measurement space unstated resolves to Half Space assumed (no +6 dB correction)", () => {
  // The source does not state measurement space. The extraction returns
  // measurement_space as "unspecified" (or not_found), which maps to "unspecified"
  // in the enum. This is the "Half Space — assumed by Sound Proof" path.
  assert.equal(
    matchEnumValue("measurement_space", "unspecified", { measurement_space: ["free-space", "half-space", "in-room", "unspecified"] }),
    "unspecified",
    "unstated space resolves to unspecified (assumed half space)",
  );
  // A 2π statement would be reported half-space, not assumed.
  assert.equal(
    matchEnumValue("measurement_space", "2 pi", { measurement_space: ["free-space", "half-space", "in-room", "unspecified"] }),
    "half-space",
  );
});

// ---------------------------------------------------------------------------
// Sonance R2 — "Power Handling: 5 Watts minimum; 200 Watts maximum"
// ---------------------------------------------------------------------------

test("Sonance R2: Power Handling min/max range with 200W max is reported as power_handling_continuous_w", () => {
  const raw = {
    reported: [
      item("sensitivity_db", "92", "Sensitivity: 92dB SPL (2.83V/1 meter)"),
      item("sensitivity_basis", "2.83V/1m", "2.83V/1 meter"),
      item("nominal_impedance_ohm", "6", "Impedance: 6 ohms nominal; 4 ohms minimum"),
      item("minimum_impedance_ohm", "4", "4 ohms minimum"),
      item("power_handling_continuous_w", "200", "Power Handling: 5 Watts minimum; 200 Watts maximum"),
    ],
    potential_unmapped: [],
  };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.sensitivity_db, "92");
  assert.equal(found.sensitivity_reference, "2.83V/1m");
  assert.equal(found.impedance_ohm, "6");
  assert.equal(found.power_w, "200", "power maximum 200 is proposed");
  assert.equal(found.power_basis, "continuous", "200W is a speaker power rating, not recommended amplifier");
  assert.notEqual(found.power_basis, "amplifier", "200W must NOT be classified as recommended amplifier maximum");
  assert.equal(info.power_w.category, "Manufacturer Power Handling");
  assert.equal(info.power_w.quote, "Power Handling: 5 Watts minimum; 200 Watts maximum");
});

test("Sonance R2: qualifies for GOOD DATA", () => {
  const rec = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: null,
    sensitivity_space_provenance: "half_space_assumed",
    max_spl_space_provenance: "half_space_assumed",
    sensitivity_reference: "2.83V/1m",
  };
  assert.equal(classifyDataAdequacy(rec).key, "GOOD");
});

// ---------------------------------------------------------------------------
// Sonance: the extraction must NOT classify Power Handling as recommended amp
// ---------------------------------------------------------------------------

test("Sonance: Power Handling range is never mapped to recommended_amp_max_w", () => {
  // If the LLM incorrectly placed 150 in recommended_amp_max_w, the parity
  // mapping would classify it as "amplifier" — this test confirms that the
  // correct extraction (power_handling_continuous_w) produces "continuous" basis.
  const correctExtraction = {
    reported: [
      item("power_handling_continuous_w", "150", "Power Handling: 5 Watts minimum; 150 Watts maximum"),
    ],
  };
  const { found } = extractionToFound(correctExtraction);
  assert.equal(found.power_basis, "continuous");

  // Contrast with an actual recommended amplifier range
  const ampRange = {
    reported: [
      item("recommended_amp_max_w", "150", "Recommended amplifier: 25-150 W"),
      item("recommended_amp_min_w", "25", "Recommended amplifier: 25-150 W"),
    ],
  };
  const { found: ampFound } = extractionToFound(ampRange);
  assert.equal(ampFound.power_basis, "amplifier", "recommended amplifier range is amplifier basis");
  assert.notEqual(found.power_basis, ampFound.power_basis, "Power Handling and Recommended Amplifier must produce different bases");
});

// ---------------------------------------------------------------------------
// Sonance: potential_unmapped surfaces concepts the LLM could not map
// ---------------------------------------------------------------------------

test("potential_unmapped concepts are surfaced in the parity mapping info", () => {
  const raw = {
    reported: [
      item("sensitivity_db", "90", "Sensitivity: 90dB SPL (2.83V/1 meter)"),
    ],
    potential_unmapped: [
      { concept: "Power Handling", raw_text: "Power Handling: 5 Watts minimum; 150 Watts maximum" },
    ],
  };
  const { info } = extractionToFound(raw);
  assert.ok(info.potential_unmapped, "potential_unmapped is surfaced");
  assert.equal(info.potential_unmapped.length, 1);
  assert.equal(info.potential_unmapped[0].concept, "Power Handling");
  assert.equal(info.potential_unmapped[0].quote, "Power Handling: 5 Watts minimum; 150 Watts maximum");
});

test("empty potential_unmapped produces no warning", () => {
  const raw = {
    reported: [item("sensitivity_db", "90", "Sensitivity: 90dB")],
    potential_unmapped: [],
  };
  const { info } = extractionToFound(raw);
  assert.ok(!info.potential_unmapped, "empty potential_unmapped does not produce a warning");
});

// ---------------------------------------------------------------------------
// Wisdom P2i — sensitivity + impedance + published max SPL → GOOD DATA
// ---------------------------------------------------------------------------

test("Wisdom P2i: sensitivity + impedance + published max SPL with assumed space → GOOD DATA", () => {
  const raw = {
    reported: [
      item("sensitivity_db", "89", "Sensitivity: 89 dB"),
      item("sensitivity_basis", "2.83V/1m", "2.83 V / 1 m"),
      item("nominal_impedance_ohm", "8", "Impedance: 8 Ω"),
      item("max_continuous_spl_db", "108", "Max Continuous SPL: 108 dB"),
      item("max_spl_basis", "continuous", "Continuous"),
    ],
    potential_unmapped: [],
  };
  const { found } = extractionToFound(raw);
  assert.equal(found.sensitivity_db, "89");
  assert.equal(found.impedance_ohm, "8");
  assert.equal(found.max_spl_db, "108", "published max SPL is proposed");
  assert.equal(found.max_spl_basis, "continuous");

  // With a published continuous SPL + assumed half space → GOOD DATA
  const rec = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: 108,
    sensitivity_space_provenance: "half_space_assumed",
    max_spl_space_provenance: "half_space_assumed",
    sensitivity_reference: "2.83V/1m",
  };
  assert.equal(classifyDataAdequacy(rec).key, "GOOD");
});

// ---------------------------------------------------------------------------
// Triad TS-IWSAT6 — continuous SPL + peak SPL
// ---------------------------------------------------------------------------

test("Triad TS-IWSAT6: continuous SPL and peak SPL are both captured", () => {
  const raw = {
    reported: [
      item("sensitivity_db", "91", "Sensitivity: 91 dB"),
      item("sensitivity_basis", "2.83V/1m", "2.83 V / 1 m"),
      item("nominal_impedance_ohm", "8", "Impedance: 8 Ω"),
      item("max_continuous_spl_db", "110", "Continuous SPL: 110 dB"),
      item("max_peak_spl_db", "116", "Peak SPL: 116 dB"),
      item("max_spl_basis", "continuous", "Continuous"),
    ],
    potential_unmapped: [],
  };
  const { found } = extractionToFound(raw);
  assert.equal(found.max_spl_db, "110", "continuous SPL captured");
  assert.equal(found.max_peak_spl_db, "116", "peak SPL captured separately");
  assert.equal(found.max_spl_basis, "continuous");
});

test("Triad TS-IWSAT6: with confirmed half-space → FULL DATA", () => {
  const rec = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: 110,
    sensitivity_space_provenance: "half_space_published",
    max_spl_space_provenance: "half_space_published",
    sensitivity_reference: "2.83V/1m",
  };
  assert.equal(classifyDataAdequacy(rec).key, "FULL", "confirmed space + basis + published SPL is FULL");
});

test("Triad TS-IWSAT6: with assumed half-space → GOOD DATA", () => {
  const rec = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: 110,
    sensitivity_space_provenance: "half_space_assumed",
    max_spl_space_provenance: "half_space_assumed",
    sensitivity_reference: "2.83V/1m",
  };
  assert.equal(classifyDataAdequacy(rec).key, "GOOD");
});

// ---------------------------------------------------------------------------
// All four regression cases use the same extraction pipeline
// ---------------------------------------------------------------------------

test("all four regression cases produce consistent power basis classification", () => {
  // Sonance R1 — power handling range
  const sonanceR1 = extractionToFound({
    reported: [
      item("sensitivity_db", "90", "Sensitivity: 90dB SPL (2.83V/1 meter)"),
      item("sensitivity_basis", "2.83V/1m", "2.83V/1 meter"),
      item("nominal_impedance_ohm", "8", "Impedance: 8 ohms nominal"),
      item("power_handling_continuous_w", "150", "Power Handling: 5 Watts minimum; 150 Watts maximum"),
    ],
  });

  // Sonance R2 — power handling range
  const sonanceR2 = extractionToFound({
    reported: [
      item("sensitivity_db", "92", "Sensitivity: 92dB SPL (2.83V/1 meter)"),
      item("sensitivity_basis", "2.83V/1m", "2.83V/1 meter"),
      item("nominal_impedance_ohm", "6", "Impedance: 6 ohms nominal"),
      item("power_handling_continuous_w", "200", "Power Handling: 5 Watts minimum; 200 Watts maximum"),
    ],
  });

  // Wisdom P2i — published max SPL
  const wisdomP2i = extractionToFound({
    reported: [
      item("sensitivity_db", "89", "Sensitivity: 89 dB"),
      item("sensitivity_basis", "2.83V/1m", "2.83 V / 1 m"),
      item("nominal_impedance_ohm", "8", "Impedance: 8 Ω"),
      item("max_continuous_spl_db", "108", "Max Continuous SPL: 108 dB"),
      item("max_spl_basis", "continuous", "Continuous"),
    ],
  });

  // Triad TS-IWSAT6 — continuous + peak SPL
  const triad = extractionToFound({
    reported: [
      item("sensitivity_db", "91", "Sensitivity: 91 dB"),
      item("sensitivity_basis", "2.83V/1m", "2.83 V / 1 m"),
      item("nominal_impedance_ohm", "8", "Impedance: 8 Ω"),
      item("max_continuous_spl_db", "110", "Continuous SPL: 110 dB"),
      item("max_peak_spl_db", "116", "Peak SPL: 116 dB"),
      item("max_spl_basis", "continuous", "Continuous"),
    ],
  });

  // All four have sensitivity + impedance — the minimum for a defensible comparison
  for (const [name, result] of Object.entries({ sonanceR1, sonanceR2, wisdomP2i, triad })) {
    assert.ok(result.found.sensitivity_db, `${name}: sensitivity must be present`);
    assert.ok(result.found.impedance_ohm, `${name}: impedance must be present`);
    assert.ok(result.found.sensitivity_reference, `${name}: sensitivity basis must be present`);
  }

  // Sonance cases have power; Wisdom and Triad have published SPL
  assert.ok(sonanceR1.found.power_w, "Sonance R1: power must be captured");
  assert.ok(sonanceR2.found.power_w, "Sonance R2: power must be captured");
  assert.ok(wisdomP2i.found.max_spl_db, "Wisdom P2i: max SPL must be captured");
  assert.ok(triad.found.max_spl_db, "Triad: continuous SPL must be captured");
});