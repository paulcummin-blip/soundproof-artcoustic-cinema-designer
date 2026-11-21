// Validates that the always-visible selected-speaker explanation matches the
// actual normalised calculation for representative models across manufacturers,
// and that models with different calculation authorities get distinct (not
// generic) explanation text. Uses the same active-database snapshot as the
// classification sweep.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalizeCompetitor } from "@/components/utils/spl/competitorNormalization.js";
import { classifyDataAdequacy } from "@/components/spl/dataAdequacyClassification.js";
import { buildSelectedSpeakerExplanation } from "@/components/spl/selectedSpeakerExplanationModel.js";

const SNAPSHOT_PATH = path.resolve("test/fixtures/active-competitors-snapshot.json");

function loadSnapshot() {
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
}

function findRecord(records, manufacturerSub, modelSub) {
  return records.find(
    (r) => r.manufacturer.includes(manufacturerSub) && r.model.includes(modelSub)
  );
}

// One representative model per calculation authority, drawn from the active
// database. Each is expected to land on a different adequacy + explanation
// authority, so their explanation text must be visibly distinct.
const REPRESENTATIVE = [
  { brand: "Ascendo", model: "THE6 PRO PASSIVE ON WALL", expectAuthority: "published_continuous", expectAdequacy: "FULL" },
  { brand: "Triad", model: "Bronze OnWall", expectAuthority: "assumed_peak", expectAdequacy: "GOOD" },
  { brand: "James", model: "BE806 MKII", expectAuthority: "none", expectAdequacy: "GOOD" },
  { brand: "Wisdom", model: "L8i", expectAuthority: "assumed_peak", expectAdequacy: "GOOD", provisional: true },
  { brand: "Bowers", model: "CT7.3", expectAuthority: null, expectAdequacy: "INCOMPLETE" },
];

test("explanation sweep: each representative model matches its calculation", () => {
  const records = loadSnapshot();
  const explanations = [];
  for (const spec of REPRESENTATIVE) {
    const raw = findRecord(records, spec.brand, spec.model);
    assert.ok(raw, `record present: ${spec.brand} ${spec.model}`);
    const n = normalizeCompetitor(raw);
    const adequacy = classifyDataAdequacy(n);
    assert.equal(adequacy.key, spec.expectAdequacy,
      `${spec.brand} ${spec.model} adequacy ${adequacy.key} (expected ${spec.expectAdequacy})`);
    if (spec.expectAuthority) {
      assert.equal(n.max_spl_authority_type, spec.expectAuthority,
        `${spec.brand} ${spec.model} authority ${n.max_spl_authority_type} (expected ${spec.expectAuthority})`);
    }
    if (spec.provisional) {
      assert.equal(n.provisional_peak_assumed, true, `${spec.brand} ${spec.model} is provisional-peak`);
    }
    const exp = buildSelectedSpeakerExplanation(n);
    assert.ok(exp, `explanation built for ${spec.brand} ${spec.model}`);
    assert.equal(exp.label, adequacy.label, `label matches adequacy for ${spec.brand} ${spec.model}`);
    assert.ok(exp.why && exp.why.length > 0, `why text present for ${spec.brand} ${spec.model}`);
    explanations.push({ spec, exp, n });
  }

  // Distinctness: no two representative models with different authorities share
  // identical `why` or `calculated` text. The explanation must reflect the
  // actual calculation, not a generic string.
  for (let i = 0; i < explanations.length; i++) {
    for (let j = i + 1; j < explanations.length; j++) {
      const a = explanations[i];
      const b = explanations[j];
      if (a.spec.expectAuthority !== b.spec.expectAuthority || a.spec.provisional !== b.spec.provisional) {
        assert.notEqual(a.exp.why, b.exp.why,
          `distinct why: ${a.spec.brand} ${a.spec.model} vs ${b.spec.brand} ${b.spec.model}`);
      }
    }
  }
});

test("explanation sweep: published vs calculated vs peak-derived vs unavailable are distinguished", () => {
  const records = loadSnapshot();

  // Published continuous (FULL): explanation states the figure is used directly.
  const ascendo = normalizeCompetitor(findRecord(records, "Ascendo", "THE6 PRO PASSIVE ON WALL"));
  const ascendoExp = buildSelectedSpeakerExplanation(ascendo);
  assert.match(ascendoExp.calculated, /used directly/i, "FULL explanation states figure used directly");

  // Calculated from sensitivity + power (GOOD, no SPL): explanation states an
  // approximate SPL from published sensitivity/power inputs.
  const james = normalizeCompetitor(findRecord(records, "James", "BE806 MKII"));
  const jamesExp = buildSelectedSpeakerExplanation(james);
  assert.match(jamesExp.calculated, /Approximately.*at 1 m from/i, "calculated explanation gives approximate SPL from inputs");

  // Peak-derived (GOOD, assumed_peak): explanation states the peak-to-continuous allowance.
  const triad = normalizeCompetitor(findRecord(records, "Triad", "Bronze OnWall"));
  const triadExp = buildSelectedSpeakerExplanation(triad);
  assert.match(triadExp.calculated, /peak-to-continuous allowance/i, "peak explanation states the allowance");

  // Provisional peak power (GOOD): explanation states the continuous-equivalent estimate.
  const wisdom = normalizeCompetitor(findRecord(records, "Wisdom", "L8i"));
  const wisdomExp = buildSelectedSpeakerExplanation(wisdom);
  assert.match(wisdomExp.calculated, /continuous-equivalent power/i, "provisional explanation states the estimate");

  // Unavailable (LIMITED): explanation states what cannot be determined.
  const bw = normalizeCompetitor(findRecord(records, "Bowers", "CT7.3"));
  const bwExp = buildSelectedSpeakerExplanation(bw);
  assert.ok(bwExp.dontKnow && bwExp.dontKnow.length > 0, "LIMITED explanation states unavailable information");
});

test("explanation sweep: Wisdom L8i explanation derives values from the record, not hardcoded", () => {
  const records = loadSnapshot();
  const raw = findRecord(records, "Wisdom", "L8i");
  const n = normalizeCompetitor(raw);
  const exp = buildSelectedSpeakerExplanation(n);
  // The assumed continuous-equivalent power must appear (50% of published peak).
  assert.ok(n.assumed_continuous_power_w != null, "L8i has an assumed continuous power");
  assert.match(exp.calculated, new RegExp(String(Math.round(n.assumed_continuous_power_w))), "assumed wattage appears in explanation");
  assert.equal(exp.label, "GOOD DATA", "L8i explanation label is GOOD DATA");
});