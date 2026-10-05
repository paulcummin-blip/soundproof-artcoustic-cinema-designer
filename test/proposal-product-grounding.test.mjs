/**
 * proposal-product-grounding.test.mjs
 * -----------------------------------
 * ACCEPTANCE — A PROPOSAL MAY NAME ONLY THE PRODUCTS SELECTED IN ITS VERSION.
 *
 * The guard is driven by the SAME frozen, version-specific system/product
 * authority the At a Glance package table reads, so a product that is not in the
 * version's system table cannot appear in the narrative — not from another
 * version, not from a remembered range, not from the catalogue.
 *
 *   A  single-version proposal: the version's own products may appear, an
 *      unselected product (Spitfire Cloud) may not
 *   B  regeneration uses the same grounding, so no unselected name survives
 *   C  a comparison is scoped per version: one version's product is never
 *      described as being in another version
 *   D  a forced unselected mention is corrected, and the result still holds no
 *      ungrounded product
 *   E  every product name left in the text is in the version's system table
 *
 * The module is pure and dependency-free, so it runs under plain `node`.
 *
 * Run: node test/proposal-product-grounding.test.mjs
 */

import assert from "node:assert/strict";
import {
  buildProductGrounding,
  buildProductVocabularyRule,
  groundProductMentions,
} from "../base44/shared/proposalProductGrounding.js";

/** The Level 1 version's frozen system authority — what At a Glance prints. */
const LEVEL_1 = {
  available: true,
  version: { id: "v-level-1", name: "Level 1 version" },
  room: { acoustic_treatment: { enabled: false, quantity: 0 } },
  system: {
    product_roles: [
      { role: "lcr", role_description: "Left/Centre/Right (screen wall)", model_label: "Q6-3" },
      { role: "surround", role_description: "Side surround", model_label: "Evolve 2-1" },
      { role: "overhead", role_description: "Overhead/height", model_label: "Architect 2-1" },
    ],
    subwoofer_strategy: { count: 2, models: ["sub4-12"], strategy_text: "2 × SUB4-12" },
  },
};

const LEVEL_1_NAMES = ["Q6-3", "Evolve 2-1", "Architect 2-1", "SUB4-12"];

const singleGrounding = buildProductGrounding({ snapshot: LEVEL_1, resolvedType: "system_summary" });
const rule = buildProductVocabularyRule(singleGrounding);

const check = (name, fn) => {
  try {
    fn();
    console.log(`PASS  ${name}`);
    return true;
  } catch (error) {
    console.log(`FAIL  ${name}\n      ${error.message}`);
    return false;
  }
};

const results = [];

/* A — the allowed vocabulary is the version's system authority, and nothing else */
results.push(check("A  allowedProducts is the Level 1 system table", () => {
  assert.equal(singleGrounding.available, true, "grounding must be built from the version");
  assert.deepEqual(singleGrounding.versions[0].allowedNames, LEVEL_1_NAMES,
    `expected exactly the system table products, got ${singleGrounding.versions[0].allowedNames.join(", ")}`);
  assert.ok(!singleGrounding.versions[0].allowedNames.includes("Spitfire Cloud"),
    "Spitfire Cloud is not selected in this version and must never be allowed");
  assert.match(rule, /Q6-3/, "the prompt rule must name the allowed products");
  assert.match(rule, /Evolve 2-1/);
  assert.match(rule, /Architect 2-1/);
  assert.match(rule, /SUB4-12/);
  assert.match(rule, /Never name a product from another version/, "the prompt rule must forbid other sources");
  assert.match(rule, /the selected Artcoustic loudspeakers/, "the prompt rule must offer generic wording");
}));

/* A — the offending copy: Spitfire Cloud is removed, the real products stay */
results.push(check("A  'Architect and Spitfire Cloud overhead array' is corrected", () => {
  const before = "<p>The overhead layer combines an Architect and Spitfire Cloud overhead array, so effects move above the seats.</p>";
  const after = groundProductMentions(before, singleGrounding);
  assert.equal(after.grounded, true, "the section must end grounded");
  assert.ok(after.violations.some((violation) => violation.name === "Spitfire Cloud"),
    "Spitfire Cloud must be reported as ungrounded");
  assert.ok(!/spitfire/i.test(after.html), `no Spitfire mention may survive: ${after.html}`);
  assert.match(after.html, /Architect/, "the version's own Architect 2-1 mention may stay");
  assert.match(after.html, /the selected Artcoustic overhead loudspeakers/,
    "the unselected product must be replaced with safe generic wording");
  console.log(`      BEFORE: ${before}`);
  console.log(`      AFTER : ${after.html}`);
}));

/* B — regeneration runs the same guard */
results.push(check("B  regenerated section carries no unselected product", () => {
  const regenerated = "<p>Timbre consistency comes from the Spitfire Cloud overhead array and the Q6-3 screen stage.</p>";
  const after = groundProductMentions(regenerated, singleGrounding);
  assert.equal(after.grounded, true);
  assert.ok(!/spitfire/i.test(after.html), `no Spitfire mention may survive: ${after.html}`);
  assert.match(after.html, /Q6-3/, "the version's own product may stay");
  console.log(`      AFTER : ${after.html}`);
}));

/* C — a comparison is scoped by version */
const comparisonVersions = [
  { version_id: "v-level-1", version_name: "Level 1 version", label: "Option A",
    speaker_package: [{ role: "lcr", model: "Q6-3" }, { role: "surround", model: "Evolve 2-1" }, { role: "overhead", model: "Architect 2-1" }],
    subwoofer_package: { strategy: "2 × SUB4-12" } },
  { version_id: "v-level-4", version_name: "Level 4 version", label: "Option B",
    speaker_package: [{ role: "lcr", model: "Q8-5" }, { role: "surround", model: "Evolve 6-3" }, { role: "overhead", model: "Spitfire Cloud" }],
    subwoofer_package: { strategy: "4 × SUB3-12" } },
];
const comparisonGrounding = buildProductGrounding({
  resolvedType: "comparison",
  versionEvidence: comparisonVersions,
  comparisonTable: {
    rows: [
      { key: "lcr", area: "LCR", values: ["Q6-3", "Q8-5"] },
      { key: "surrounds", area: "Surrounds / wides", values: ["Evolve 2-1", "Evolve 6-3"] },
      { key: "overheads", area: "Overheads", values: ["Architect 2-1", "Spitfire Cloud"] },
      { key: "subwoofers", area: "Subwoofers", values: ["2 × SUB4-12", "4 × SUB3-12"] },
    ],
  },
});

results.push(check("C  each version keeps its own products", () => {
  assert.equal(comparisonGrounding.versions.length, 2);
  assert.deepEqual(comparisonGrounding.versions[0].allowedNames, LEVEL_1_NAMES);
  assert.deepEqual(comparisonGrounding.versions[1].allowedNames, ["Q8-5", "Evolve 6-3", "Spitfire Cloud", "SUB3-12"]);
  assert.match(buildProductVocabularyRule(comparisonGrounding), /never let one version be described as using another version's product/);
}));

results.push(check("C  Version A's product is not described as being in Version B", () => {
  const before = "<p>The Level 4 version keeps the Q6-3 screen stage but adds Spitfire Cloud overheads.</p>";
  const after = groundProductMentions(before, comparisonGrounding);
  assert.equal(after.grounded, true);
  assert.ok(after.violations.some((violation) => violation.name === "Q6-3"),
    "Q6-3 is not in the Level 4 version and must be reported");
  assert.ok(!/Q6-3/.test(after.html), `Q6-3 may not be described as part of the Level 4 version: ${after.html}`);
  assert.match(after.html, /Spitfire Cloud/, "the Level 4 version's own overhead product may stay");
  console.log(`      BEFORE: ${before}`);
  console.log(`      AFTER : ${after.html}`);
}));

/* D — a forced mention is corrected before anything is saved */
results.push(check("D  a forced unselected mention is corrected, not stored", () => {
  const forced = "<p>The design pairs Q6-3 across the screen with Spitfire Cloud overheads and SUB4-12 subwoofers.</p>";
  const after = groundProductMentions(forced, singleGrounding);
  assert.equal(after.grounded, true, "the corrected section must be saveable");
  assert.ok(!/spitfire/i.test(after.html));
  const recheck = groundProductMentions(after.html, singleGrounding);
  assert.equal(recheck.violations.length, 0, "the saved text must hold no ungrounded product at all");
}));

/* D — a possessive on the removed name is carried, never broken */
results.push(check("D  possessive on a removed name reads correctly", () => {
  const before = "<p>Spitfire Cloud's overhead array sits above the seats.</p>";
  const after = groundProductMentions(before, singleGrounding);
  assert.equal(after.grounded, true);
  assert.ok(!/spitfire|cloud/i.test(after.html), `no Cloud mention may survive: ${after.html}`);
  assert.ok(!/''s/.test(after.html), `no broken possessive: ${after.html}`);
  assert.match(after.html, /loudspeakers' array/, `the possessive must move onto the generic wording: ${after.html}`);
  console.log(`      BEFORE: ${before}`);
  console.log(`      AFTER : ${after.html}`);
}));

/* E — At a Glance consistency: every name left is in the version's system table */
results.push(check("E  every product named is in the version's system table", () => {
  const body = "<p>The system uses Q6-3 across the screen, Evolve 2-1 around the seats, Architect 2-1 overhead and two SUB4-12 subwoofers, with Spitfire Cloud overheads added later.</p>";
  const after = groundProductMentions(body, singleGrounding);
  const allowed = singleGrounding.versions[0].allowedNames;
  const catalogue = ["Q6-3", "Q8-5", "Evolve 2-1", "Evolve 6-3", "Architect 2-1", "Spitfire Cloud", "SUB3-12", "SUB4-12", "Mikro", "Diablo"];
  for (const name of catalogue) {
    const present = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(after.html);
    if (present) assert.ok(allowed.includes(name), `${name} appears but is not in the system table`);
  }
  assert.equal(groundProductMentions(after.html, singleGrounding).violations.length, 0);
  assert.match(after.html, /Q6-3/);
  assert.match(after.html, /SUB4-12/);
  console.log(`      AFTER : ${after.html}`);
}));

const failed = results.filter((passed) => !passed).length;
console.log(`\nproposal-product-grounding: ${results.length - failed}/${results.length} checks passed`);
if (failed > 0) process.exitCode = 1;