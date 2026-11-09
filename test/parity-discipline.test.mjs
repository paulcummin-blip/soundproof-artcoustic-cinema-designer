// parity-discipline.test.mjs
// ---------------------------------------------------------------------------
// Validates the Artcoustic-parity tightening of the competitor Read Source path
// and data-adequacy labelling. Does NOT test the P12/P13 engine itself — only
// that the extraction→review→label discipline treats competitor evidence on the
// same basis as Artcoustic and does not give competitors favourable assumptions.
//
//   1. Peak SPL basis is never collapsed to continuous.
//   2. Power categories are distinguished, not converted by wattage.
//   3. The RMS "Power Handling (RMS): 150 W max" example is NOT classified as a
//      recommended amplifier maximum.
//   4. SPL_BASES exposes a distinct peak option.
//   5. FULL / GOOD / INCOMPLETE boundaries are correct and carry the request's
//      explanatory meanings.
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractionToFound, mapMaxSplBasis } from "@/components/spl/adiParityMapping";
import { SPL_BASES } from "@/components/spl/comparisonFieldOptions";
import { classifyDataAdequacy, DATA_ADEQUACY } from "@/components/spl/dataAdequacyClassification";

function item(field, value, raw_text = "", status = "reported") {
  return { field, value, status, raw_text };
}

test("peak SPL basis is not collapsed to continuous", () => {
  assert.equal(mapMaxSplBasis("peak"), "peak", "mapMaxSplBasis must keep peak distinct");
  const raw = { reported: [item("max_continuous_spl_db", "112", "Peak SPL: 112 dB"), item("max_spl_basis", "peak", "Peak SPL")] };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.max_spl_basis, "peak", "peak must stay peak, not become continuous");
  assert.equal(info.max_spl_basis.value, "peak");
});

test("continuous power rating is retained with its category, not converted to amplifier max", () => {
  const raw = { reported: [item("power_handling_continuous_w", "150", "Power Handling (RMS): 5 watts minimum; 150 watts maximum")] };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.power_w, "150");
  assert.equal(found.power_basis, "continuous");
  assert.equal(info.power_w.basis, "continuous");
  assert.equal(info.power_w.category, "Continuous");
  assert.notEqual(found.power_basis, "amplifier", "RMS power handling must NOT be classified as recommended amplifier maximum");
});

test("AES power is a continuous-basis rating, retained as AES category", () => {
  const raw = { reported: [item("aes_power_w", "300", "AES Power: 300 W")] };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.power_w, "300");
  assert.equal(found.power_basis, "continuous");
  assert.equal(info.power_w.category, "AES");
});

test("IEC long-term power is a continuous-basis rating", () => {
  const raw = { reported: [item("long_term_iec_power_w", "250", "Long-term IEC: 250 W")] };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.power_w, "250");
  assert.equal(found.power_basis, "continuous");
  assert.equal(info.power_w.category, "Long-term IEC");
});

test("recommended amplifier maximum is a separate, weaker basis", () => {
  const raw = { reported: [item("recommended_amp_max_w", "150", "Recommended amplifier: 25-150 W")] };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.power_w, "150");
  assert.equal(found.power_basis, "amplifier");
  assert.equal(info.power_w.category, "Recommended amplifier max");
});

test("SPL_BASES exposes a distinct peak option separate from continuous", () => {
  const values = SPL_BASES.map((o) => o.value);
  assert.ok(values.includes("peak"), "SPL_BASES must include peak");
  assert.ok(values.includes("continuous"));
  const peak = SPL_BASES.find((o) => o.value === "peak");
  assert.match(peak.label, /peak|short-term/i, "peak label must signal it is not continuous");
});

test("FULL requires published measured SPL plus confirmed space and basis", () => {
  const rec = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: 110,
    sensitivity_space_provenance: "half_space_stated",
    max_spl_space_provenance: "half_space_stated",
    sensitivity_reference: "1W/1m",
  };
  assert.equal(classifyDataAdequacy(rec).key, "FULL");
});

test("GOOD when a controlled assumption remains (assumed half space)", () => {
  const rec = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: 110,
    sensitivity_space_provenance: "half_space_assumed",
    max_spl_space_provenance: "half_space_assumed",
    sensitivity_reference: "1W/1m",
  };
  assert.equal(classifyDataAdequacy(rec).key, "GOOD");
});

test("INCOMPLETE when not eligible for P12/P13", () => {
  const rec = { p12_p13_eligible: false };
  const label = classifyDataAdequacy(rec);
  assert.equal(label.key, "INCOMPLETE");
  assert.match(label.meaning, /Incomplete data/i);
  assert.match(label.meaning, /fair P12\/P13 comparison not available/i);
});

test("adequacy labels carry the request's explanatory meanings", () => {
  assert.match(DATA_ADEQUACY.FULL.meaning, /same evidence basis used for Artcoustic/i);
  assert.match(DATA_ADEQUACY.GOOD.meaning, /controlled assumption/i);
  assert.match(DATA_ADEQUACY.INCOMPLETE.meaning, /fair P12\/P13 comparison not available/i);
});