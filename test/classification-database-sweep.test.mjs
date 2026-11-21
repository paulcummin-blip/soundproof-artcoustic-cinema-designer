// Database-wide sweep: runs the shared normalizer + the revised adequacy
// classifier against every active CompetitorSpeaker record, compares to the
// prior classifier, and reports every classification change by manufacturer
// and model. Also asserts the invariants the revision must satisfy.
//
// The snapshot at test/fixtures/active-competitors-snapshot.json is written by
// exec_tool from the Production database (active=true records only).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalizeCompetitor } from "@/components/utils/spl/competitorNormalization.js";
import {
  classifyDataAdequacy,
  DATA_ADEQUACY,
} from "@/components/spl/dataAdequacyClassification.js";

// Prior classifier — the rule before this revision. Reconstructed verbatim
// from the only behavioural change: provisional-peak-assumed rows were ALWAYS
// LIMITED, regardless of sensitivity. Everything else is identical to the
// current code so the diff isolates exactly what the revision changed.
function classifyPrior(record) {
  if (!record || record.p12_p13_eligible !== true) return DATA_ADEQUACY.INCOMPLETE;
  if (record.provisional_peak_assumed === true) return DATA_ADEQUACY.INCOMPLETE;
  const authority = record.max_spl_authority_type;
  if (authority === "published_continuous") {
    if (record.missing_sensitivity_with_power_rating === true) return DATA_ADEQUACY.INCOMPLETE;
    return DATA_ADEQUACY.FULL;
  }
  if (authority === "published_peak" || authority === "assumed_peak") return DATA_ADEQUACY.GOOD;
  if (authority === "none") return DATA_ADEQUACY.GOOD;
  return DATA_ADEQUACY.GOOD;
}

const SNAPSHOT_PATH = path.resolve("test/fixtures/active-competitors-snapshot.json");

function loadSnapshot() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(
      "Missing test/fixtures/active-competitors-snapshot.json. Run the exec_tool snapshot first."
    );
  }
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
}

function sweep(records) {
  const rows = [];
  for (const raw of records) {
    const normalized = normalizeCompetitor(raw);
    const next = classifyDataAdequacy(normalized);
    const prior = classifyPrior(normalized);
    rows.push({
      manufacturer: raw.manufacturer,
      model: raw.model,
      prior: prior.key,
      next: next.key,
      changed: prior.key !== next.key,
      authority: normalized.max_spl_authority_type,
      provisionalPeak: normalized.provisional_peak_assumed === true,
      hasSensitivity: normalized.halfspace_sensitivity_db_1w_1m != null,
      eligible: normalized.p12_p13_eligible === true,
    });
  }
  return rows;
}

test("database sweep: snapshot loads and covers all active records", () => {
  const records = loadSnapshot();
  assert.ok(records.length > 0, "snapshot is not empty");
  assert.ok(records.every((r) => r.active === true), "every record is active");
});

test("database sweep: report classification changes by manufacturer/model", () => {
  const records = loadSnapshot();
  const rows = sweep(records);
  const changes = rows.filter((r) => r.changed);

  // Stable, readable report grouped by manufacturer then model.
  const byMfr = new Map();
  for (const c of changes) {
    if (!byMfr.has(c.manufacturer)) byMfr.set(c.manufacturer, []);
    byMfr.get(c.manufacturer).push(c);
  }
  const provisional = rows.filter((r) => r.provisionalPeak);
  const provisionalWithSens = provisional.filter((r) => r.hasSensitivity);
  const provisionalNoSens = provisional.filter((r) => !r.hasSensitivity);
  const lines = [];
  lines.push(`Active records checked: ${rows.length}`);
  lines.push(`Provisional peak-assumed rows: ${provisional.length} (with sensitivity: ${provisionalWithSens.length}, without: ${provisionalNoSens.length})`);
  lines.push(`Classification changes: ${changes.length}`);
  for (const mfr of [...byMfr.keys()].sort()) {
    lines.push(`  ${mfr}`);
    for (const c of byMfr.get(mfr).sort((a, b) => a.model.localeCompare(b.model))) {
      lines.push(`    ${c.model}: ${c.prior} -> ${c.next}`);
    }
  }
  // Visible in the test runner's stdout.
  console.log("\n=== Classification Sweep Report ===\n" + lines.join("\n") + "\n");

  // The revision only ever promotes provisional-peak-assumed rows that have a
  // defensible sensitivity. No other row should change, and no row should be
  // downgraded.
  for (const c of changes) {
    assert.equal(c.prior, "INCOMPLETE", `only LIMITED rows change: ${c.manufacturer} ${c.model}`);
    assert.equal(c.next, "GOOD", `only promote to GOOD: ${c.manufacturer} ${c.model}`);
    assert.equal(c.provisionalPeak, true, `only provisional-peak rows change: ${c.manufacturer} ${c.model}`);
    assert.equal(c.hasSensitivity, true, `only rows with sensitivity promote: ${c.manufacturer} ${c.model}`);
  }
});

test("database sweep: Wisdom Audio L8i qualifies for GOOD DATA", () => {
  const records = loadSnapshot();
  const l8i = records.find(
    (r) => /wisdom/i.test(r.manufacturer) && /l8i/i.test(r.model)
  );
  assert.ok(l8i, "Wisdom Audio L8i is present in the active database");
  const n = normalizeCompetitor(l8i);
  const adequacy = classifyDataAdequacy(n);
  assert.equal(adequacy.key, "GOOD", "Wisdom L8i is GOOD DATA under the revised rule");
  assert.equal(n.provisional_peak_assumed, true, "L8i rests on the peak-power assumption");
  assert.ok(n.halfspace_sensitivity_db_1w_1m != null, "L8i has a defensible sensitivity");
});

test("database sweep: no FULL DATA model is downgraded", () => {
  const records = loadSnapshot();
  const rows = sweep(records);
  for (const r of rows) {
    if (r.prior === "FULL") {
      assert.equal(r.next, "FULL", `FULL model must stay FULL: ${r.manufacturer} ${r.model}`);
    }
  }
});

test("database sweep: models missing sensitivity stay LIMITED", () => {
  const records = loadSnapshot();
  const rows = sweep(records);
  for (const r of rows) {
    if (r.provisionalPeak && !r.hasSensitivity) {
      assert.equal(r.next, "INCOMPLETE", `no-sensitivity provisional row stays LIMITED: ${r.manufacturer} ${r.model}`);
    }
  }
});

test("database sweep: Ascendo published-continuous models stay FULL", () => {
  const records = loadSnapshot();
  const ascendo = records.filter((r) => /ascendo/i.test(r.manufacturer));
  for (const r of ascendo) {
    const n = normalizeCompetitor(r);
    if (n.max_spl_authority_type === "published_continuous" && !n.missing_sensitivity_with_power_rating) {
      assert.equal(classifyDataAdequacy(n).key, "FULL", `Ascendo ${r.model} stays FULL`);
    }
  }
});

test("database sweep: manufacturer coverage of representative brands", () => {
  const records = loadSnapshot();
  const manufacturers = records.map((r) => r.manufacturer);
  // Match by substring so full trading names ("Ascendo Immersive Audio",
  // "James Loudspeaker") satisfy the representative-brand check.
  const required = ["Wisdom", "Triad", "James", "KEF", "Ascendo", "Bowers"];
  const missing = required.filter((m) => !manufacturers.some((x) => x.includes(m)));
  assert.deepEqual(missing, [], `representative manufacturers present (missing: ${missing.join(", ")})`);
});