// staging-classification.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyStagingUpdate } from "../components/admin/speaker-library-update/classifyStagingUpdate.js";
import { STAGING_MODELS, STAGING_BRANDS_WITHOUT_MODELS } from "../components/admin/speaker-library-update/stagingWorkbookData.js";

const existingManufacturers = [
  { id: "m1", name: "M&K Sound" },
  { id: "m2", name: "Ascendo Immersive Audio" },
  { id: "m3", name: "KEF" },
  { id: "m4", name: "Monitor Audio" },
  { id: "m5", name: "Sonance" },
  { id: "m6", name: "James Loudspeaker" },
  { id: "m7", name: "Wisdom Audio" },
  { id: "m8", name: "Triad Speakers" },
  { id: "m9", name: "Bowers & Wilkins" },
  { id: "m10", name: "JBL Synthesis" },
  { id: "m11", name: "Klipsch" },
  { id: "m12", name: "Paradigm" },
];

const existingProducts = [
  { id: "p1", manufacturer_id: "m1", manufacturer_name: "M&K Sound", model: "S300" },
  { id: "p2", manufacturer_id: "m1", manufacturer_name: "M&K Sound", model: "MP300" },
  { id: "p3", manufacturer_id: "m1", manufacturer_name: "M&K Sound", model: "S150 MKII" },
  { id: "p4", manufacturer_id: "m2", manufacturer_name: "Ascendo Immersive Audio", model: "THE5 PASSIVE ON WALL" },
  { id: "p5", manufacturer_id: "m2", manufacturer_name: "Ascendo Immersive Audio", model: "THE6 PASSIVE ON WALL" },
  { id: "p6", manufacturer_id: "m2", manufacturer_name: "Ascendo Immersive Audio", model: "THE6 PRO PASSIVE ON WALL" },
  { id: "p7", manufacturer_id: "m2", manufacturer_name: "Ascendo Immersive Audio", model: "THE10 PASSIVE ON WALL" },
  { id: "p8", manufacturer_id: "m2", manufacturer_name: "Ascendo Immersive Audio", model: "THE12 PASSIVE ON WALL" },
  { id: "p9", manufacturer_id: "m2", manufacturer_name: "Ascendo Immersive Audio", model: "THE12 PRO PASSIVE ON WALL" },
  { id: "p10", manufacturer_id: "m9", manufacturer_name: "Bowers & Wilkins", model: "CT8.2 LCR" },
];

const result = classifyStagingUpdate({
  workbook: { models: STAGING_MODELS, brandsWithoutModels: STAGING_BRANDS_WITHOUT_MODELS },
  existing: { manufacturers: existingManufacturers, products: existingProducts },
});

test("M&K S300 and MP300 are existing-unchanged (not duplicated)", () => {
  const mk = result.existingUnchanged.filter((e) => e.manufacturer === "M&K Sound");
  assert.ok(mk.some((e) => e.model === "S300"));
  assert.ok(mk.some((e) => e.model === "MP300"));
});

test("S-150 mkII / S150 MKII spelling does not create a duplicate", () => {
  // S150 MKII is not in the workbook data rows; the workbook header carried it.
  // Ensure no new/needs-review entry for s150mkii.
  assert.ok(!result.newProducts.some((e) => /s150/i.test(e.model)));
  assert.ok(!result.needsReview.some((e) => /s150/i.test(e.model)));
});

test("M&K IW5, IW85, IW500 are clean new products", () => {
  for (const m of ["IW5", "IW85", "IW500"]) {
    assert.ok(result.newProducts.some((e) => e.manufacturer === "M&K Sound" && e.model === m), m);
  }
});

test("M&K IW19 is needs-review (brief attention), not auto-created", () => {
  assert.ok(result.needsReview.some((e) => e.manufacturer === "M&K Sound" && e.model === "IW19"));
  assert.ok(!result.newProducts.some((e) => e.model === "IW19"));
});

test("Ascendo ON-WALL suffix variants are needs-review, not duplicated", () => {
  for (const m of ["THE5 PASSIVE", "THE6 PASSIVE", "THE6 PRO PASSIVE", "THE12 PASSIVE", "THE12 PRO PASSIVE"]) {
    assert.ok(result.needsReview.some((e) => e.model === m), `${m} should be needs-review`);
  }
});

test("Ascendo THE15 PRO PASSIVE and THE12 Be PRO PASSIVE are clean new", () => {
  assert.ok(result.newProducts.some((e) => e.model === "THE15 PRO PASSIVE"));
  assert.ok(result.newProducts.some((e) => e.model === "THE12 Be PRO PASSIVE"));
});

test("Ascendo THE10 PRO PASSIVE is needs-review (brief attention)", () => {
  assert.ok(result.needsReview.some((e) => e.model === "THE10 PRO PASSIVE"));
  assert.ok(!result.newProducts.some((e) => e.model === "THE10 PRO PASSIVE"));
});

test("Monitor Audio Sinergy 100/200/300 are needs-review (cinergy naming)", () => {
  for (const m of ["Sinergy 100", "Sinergy 200", "Sinergy 300"]) {
    assert.ok(result.needsReview.some((e) => e.model === m), m);
  }
});

test("Monitor Audio W-series and Platinum are clean new products", () => {
  assert.ok(result.newProducts.some((e) => e.model === "W1M"));
  assert.ok(result.newProducts.some((e) => e.model === "Platinum In-Wall 3G"));
});

test("B&W CT8 LCR is needs-review (CT8.2 conflict)", () => {
  assert.ok(result.needsReview.some((e) => e.manufacturer === "Bowers & Wilkins" && e.model === "CT8 LCR"));
});

test("Triad is flagged as a manufacturer mapping to Triad Speakers", () => {
  assert.ok(result.manufacturerMappings.triad, "Triad mapping expected");
  assert.equal(result.manufacturerMappings.triad.candidates[0].name, "Triad Speakers");
  assert.equal(result.manufacturerMappings.triad.models.length, 22);
});

test("Triad products are needs-review (manufacturer identity pending)", () => {
  assert.ok(result.needsReview.filter((e) => e.manufacturer === "Triad").length === 22);
});

test("Brands without models: existing ones not duplicated", () => {
  assert.ok(result.existingManufacturers.some((e) => e.existingName === "Klipsch"));
  assert.ok(result.existingManufacturers.some((e) => e.existingName === "Paradigm"));
});

test("Brands without models: JBL is brand-ambiguous (JBL Synthesis)", () => {
  assert.ok(result.brandAmbiguous.some((e) => e.workbookName === "JBL" && e.candidates[0].name === "JBL Synthesis"));
});

test("Brands without models: new manufacturers identified", () => {
  for (const n of ["Sonos", "Episode", "Amina", "Steinway Lyngdorf", "Sonus Faber"]) {
    assert.ok(result.newManufacturers.some((e) => e.name === n), n);
  }
});

test("Counts sum to 67 models", () => {
  const total = result.counts.existingUnchanged + result.counts.newProducts + result.counts.needsReview;
  assert.equal(total, 67);
});