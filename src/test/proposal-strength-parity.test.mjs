/**
 * proposal-strength-parity.test.mjs
 * ---------------------------------
 * PROPOSAL FROZEN-STRENGTH SELECTOR PARITY.
 *
 * The acceptance test for the ONE shared engineering-strength authority, run over
 * each of the two canonical saved Project Reports:
 *
 *   A · the selector the REPORT prints, read from the saved report's RECORDED
 *       FROZEN PUBLICATION authority
 *   B · the selector the PROPOSAL writer will read, driven by the SAME saved
 *       report's frozen `reportEvidence`
 *
 * Story ids, order, level, scope and evidence ids must match exactly — and P19
 * must be excluded on both sides, because each recorded publication carries P19
 * as provisional.
 *
 * Fixtures are the real artifacts:
 *   src/test/fixtures/genesisAdiEvidence.json        Genesis frozen publication
 *   src/test/fixtures/marqueeLiveAdiEvidence.json    Marquee frozen publication
 *   src/test/fixtures/genesisReportEvidence.json     Genesis saved reportEvidence
 *   src/test/fixtures/marqueeReportEvidence.json     Marquee saved reportEvidence
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const readFixture = (name) => JSON.parse(
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8"),
);
const genesisPublication = readFixture("genesisAdiEvidence.json");
const marqueePublication = readFixture("marqueeLiveAdiEvidence.json");
const genesisEvidence = readFixture("genesisReportEvidence.json");
const marqueeEvidence = readFixture("marqueeReportEvidence.json");

import {
  selectAdiHighlights,
  buildSpecificationConnections,
} from "../components/report/projectReport/adiDesignHighlights.js";
import { MAX_HIGHLIGHTS } from "../components/report/projectReport/adiHighlightImportance.js";
import {
  collectEligibleEvidence,
  classifySpecTier,
  tierFloor,
  summaryFromReportEvidence,
} from "../../shared/strengthImportance.js";
import {
  buildCandidates,
  admitStrengthStories,
  rankStrengthStories,
} from "../../shared/strengthStories.js";
import {
  STORY_LAYER_KEYS,
  buildStrengthSourcesFromReportEvidence,
  evidenceSystemConnections,
  selectStrengthStoriesFromReportEvidence,
} from "../../shared/strengthEvidenceContext.js";

/* The publication side's product schedule. The frozen evidence states the same
   schedule, and test A cross-checks the two, so neither side can drift. */
const GENESIS_PRODUCTS = {
  rows: [
    { key: "lcr", area: "LCR", value: "Q6-3 × 2, C4-1 × 2" },
    { key: "surrounds", area: "Surrounds / wides", value: "Evolve 2-1 × 6" },
    { key: "overheads", area: "Overheads", value: "Architect 2-1 × 6" },
    { key: "subwoofers", area: "Subwoofers", value: "SUB3-12 × 2 (front), SUB3-12 × 2 (rear)" },
    { key: "acoustic_treatment", area: "Acoustic treatment", value: "Artcoustic Abfuser × 6" },
  ],
};

const MARQUEE_PRODUCTS = {
  rows: [
    { key: "lcr", area: "LCR", value: "Q8-5 × 3" },
    { key: "surrounds", area: "Surrounds / wides", value: "Q6-3 × 6" },
    { key: "overheads", area: "Overheads", value: "Spitfire Cloud × 6" },
    { key: "subwoofers", area: "Subwoofers", value: "SUB4-12 × 2 (front), SUB4-12 × 2 (rear)" },
    { key: "acoustic_treatment", area: "Acoustic treatment", value: "Artcoustic Abfuser × 8" },
  ],
};

const GENESIS_SOURCES = {
  engineeringSummary: genesisPublication.engineeringSummary,
  productsSelected: GENESIS_PRODUCTS,
  seatingPositions: genesisPublication.seatingPositions,
  dolbyConfig: genesisPublication.project?.dolby_config || "9.1.6",
  displayType: "tv",
};

const MARQUEE_SOURCES = {
  engineeringSummary: marqueePublication.engineeringSummary,
  productsSelected: MARQUEE_PRODUCTS,
  seatingPositions: marqueePublication.seatingPositions,
  dolbyConfig: marqueePublication.project?.dolby_config || "9.1.6",
  displayType: "projector_screen",
};

/** The shared selector read the report's own way: from the frozen publication. */
function rankFromPublication(sources) {
  const evidence = collectEligibleEvidence(sources.engineeringSummary);
  const floor = tierFloor(classifySpecTier(evidence.distribution));
  const connections = buildSpecificationConnections({
    productsSelected: sources.productsSelected,
    engineeringSummary: sources.engineeringSummary,
    dolbyConfig: sources.dolbyConfig,
  });
  const { candidates } = buildCandidates(sources, { byKey: evidence.byKey, floor, connections });
  const { admitted } = admitStrengthStories(candidates, { floor });
  return { floor, byKey: evidence.byKey, ranked: rankStrengthStories(admitted, MAX_HIGHLIGHTS) };
}

/** The comparison shape: story identity, level, scope and the evidence it rests on. */
const shape = (stories) => stories.map((story) => ({
  id: story.id,
  level: story.level,
  scope: story.scope,
  evidence_ids: story.sources,
}));

const evidenceLines = (story) => (story?.evidence || []).map((line) => `${line.key} ${line.level ?? ''}`);

const GENESIS_ORDER = [
  "tonal-consistency",
  "immersive-layout",
  "bass-output",
  "spatial-resolution",
  "viewing-geometry",
];

const MARQUEE_ORDER = [
  "dynamic-capability",
  "tonal-consistency",
  "bass-output",
  "immersive-layout",
  "low-frequency-extension",
  "spatial-resolution",
  "viewing-geometry",
];

/* ── A · Architecture mapping: the frozen system facts reach the story builder ── */

test("A · Genesis: the frozen system facts map into the immersive-layout story", () => {
  const context = buildStrengthSourcesFromReportEvidence(genesisEvidence);
  const system = genesisEvidence.system;

  assert.equal(context.dolbyConfig, system.layout, "the frozen system format must reach the story builder");
  assert.equal(context.dolbyConfig, "9.1.6");
  assert.deepEqual(
    evidenceSystemConnections(genesisEvidence).counts,
    { lcr: 4, surrounds: 6, overheads: 6, subwoofers: 4, acoustic_treatment: 6 },
    "the layer counts must come from the frozen schedule",
  );
  assert.equal(evidenceSystemConnections(genesisEvidence).counts.overheads, system.overhead_channels);
  assert.equal(evidenceSystemConnections(genesisEvidence).counts.subwoofers, system.subwoofer_count);
  assert.equal(system.total_discrete_channels, 15);
  assert.equal(context.displayType, genesisEvidence.screen.display_type);

  const { ranked } = selectStrengthStoriesFromReportEvidence(genesisEvidence);
  const immersive = ranked.find((story) => story.id === "immersive-layout");
  assert.ok(immersive, "the immersive-layout story must be built from the frozen evidence");
  assert.equal(immersive.level, "L4");
  assert.equal(immersive.scope, "room");
  assert.deepEqual(immersive.sources, ["P2", "architecture"]);
  const keys = (immersive.evidence || []).map((line) => line.key);
  assert.deepEqual(keys, ["9.1.6", "P2", "6 overheads"]);
  assert.ok(immersive.explanation.includes("6 overhead speakers") && immersive.explanation.includes("4 subwoofers"));
});

test("A · Marquee: the frozen system facts map into the immersive-layout story", () => {
  const context = buildStrengthSourcesFromReportEvidence(marqueeEvidence);
  assert.equal(context.dolbyConfig, marqueeEvidence.system.layout);
  assert.equal(context.dolbyConfig, "9.1.6");
  assert.deepEqual(
    evidenceSystemConnections(marqueeEvidence).counts,
    { lcr: 3, surrounds: 6, overheads: 6, subwoofers: 4, acoustic_treatment: 8 },
  );

  const { ranked } = selectStrengthStoriesFromReportEvidence(marqueeEvidence);
  const immersive = ranked.find((story) => story.id === "immersive-layout");
  assert.ok(immersive);
  assert.equal(immersive.level, "L4");
  assert.equal(immersive.scope, "room");
  assert.deepEqual(immersive.sources, ["P2", "architecture"]);
  assert.deepEqual((immersive.evidence || []).map((line) => line.key), ["9.1.6", "P2", "6 overheads"]);
});

test("A · the frozen schedule states the same products the report states", () => {
  for (const [evidence, products, counts] of [
    [genesisEvidence, GENESIS_PRODUCTS, { lcr: 4, surrounds: 6, overheads: 6, subwoofers: 4, acoustic_treatment: 6 }],
    [marqueeEvidence, MARQUEE_PRODUCTS, { lcr: 3, surrounds: 6, overheads: 6, subwoofers: 4, acoustic_treatment: 8 }],
  ]) {
    for (const key of STORY_LAYER_KEYS) {
      const stated = products.rows.find((row) => row.key === key);
      const entry = (evidence.system.products_selected_by_layer[key] || [])
        .map((line) => `${line.model} × ${line.quantity}`)
        .join(', ');
      assert.ok(entry.length > 0, `${key} must be stated by the frozen schedule`);
      assert.ok(
        stated.value.toLowerCase().includes(String(evidence.system.products_selected_by_layer[key][0].model).toLowerCase()),
        `${key}: the schedule model must be the frozen evidence's own`,
      );
    }
    const layers = STORY_LAYER_KEYS.reduce((sum, key) => {
      sum[key] = (evidence.system.products_selected_by_layer[key] || [])
        .reduce((total, line) => total + Number(line.quantity || 0), 0);
      return sum;
    }, {});
    assert.deepEqual(layers, counts);
  }
});

/* ── B · A provisional P19 is never promoted into a strength ─────────────────── */

test("B · Genesis: P19 is provisional in its own frozen authority and is excluded", () => {
  const selection = selectStrengthStoriesFromReportEvidence(genesisEvidence);
  assert.equal(selection.byKey.p19.eligible, false);
  assert.equal(selection.byKey.p19.state, "provisional");
  assert.ok(
    !selection.ranked.some((story) => (story.sources || []).some((id) => id.includes("P19"))),
    "no selected story may rest on P19",
  );
  for (const story of selection.candidates) {
    assert.ok(!(story.sources || []).includes("P19"), `story ${story.id} must not rest on P19`);
  }
  assert.ok(selection.rejected.some((entry) => entry.id === "reference-seat-bass"));
  assert.ok(selection.rejected.some((entry) => entry.id === "parameter-p19"));
});

test("B · Marquee: P19 is provisional in its own frozen authority and is excluded", () => {
  const selection = selectStrengthStoriesFromReportEvidence(marqueeEvidence);
  assert.equal(selection.byKey.p19.eligible, false);
  assert.equal(selection.byKey.p19.state, "provisional");
  assert.ok(!selection.ranked.some((story) => (story.sources || []).some((id) => id.includes("P19"))));
  assert.ok(selection.rejected.some((entry) => entry.id === "reference-seat-bass"));
});

/* ── C · A level with no state is never scored ───────────────────────────────── */

test("C · a historical row carrying a level but no state is never scored", () => {
  const legacy = {
    evidence_version: 1,
    report_type: "project",
    parameters: [
      { key: "P14", parameter_id: 14, scope: "room", level: "L4", value: "120 dBC" },
      {
        key: "P19", parameter_id: 19, scope: "rsp", level: "L4", value: "±0 dB",
        // The underlying result row says it is complete — which is NOT the
        // parameter's terminal authority, and must never stand in for one.
        source_row: { status: "complete", isAuthoritative: true },
      },
    ],
    seat_scopes: { all: { parameters: { p14: { level: "L4", parameter_scope: "room" } } } },
    seating: { per_seat: [] },
    system: { layout: "9.1.6" },
  };
  const summary = summaryFromReportEvidence(legacy);
  assert.equal(summary.parameterAuthority.p14.state, "unavailable");
  assert.equal(summary.parameterAuthority.p19.state, "unavailable");
  assert.equal(collectEligibleEvidence(summary).byKey.p14.eligible, false);
  assert.equal(collectEligibleEvidence(summary).byKey.p19.eligible, false);

  const selection = selectStrengthStoriesFromReportEvidence(legacy);
  assert.equal(selection.byKey.p19.eligible, false);
  assert.ok(!selection.candidates.some((story) => story.id === "bass-output"));
  assert.ok(!selection.candidates.some((story) => story.id === "bass-extension-and-response"));
  assert.ok(selection.rejected.some((entry) => entry.id === "parameter-p19"));
});

/* ── D · A terminal P19 is eligible ──────────────────────────────────────────── */

test("D · a P19 that states a scored terminal state is eligible for a strength", () => {
  const terminal = {
    evidence_version: 1,
    report_type: "project",
    parameters: [
      { key: "P18", parameter_id: 18, scope: "room", level: "L3", value: "30 Hz", state: "scored" },
      { key: "P19", parameter_id: 19, scope: "rsp", level: "L4", value: "±0 dB", state: "scored" },
    ],
    seat_scopes: { all: { parameters: {} } },
    seating: { per_seat: [] },
    system: { layout: "9.1.6" },
  };
  const selection = selectStrengthStoriesFromReportEvidence(terminal);
  assert.equal(selection.byKey.p18.eligible, true);
  assert.equal(selection.byKey.p19.eligible, true);
  assert.equal(selection.byKey.p19.state, "scored");
  assert.equal(selection.byKey.p19.level, "L4");
  const combined = selection.ranked.find((story) => story.id === "bass-extension-and-response");
  assert.ok(combined, "a settled P18 and P19 state the combined bass story");
  assert.equal(combined.level, "L3");
  assert.equal(combined.scope, "rsp");
  assert.deepEqual(combined.sources, ["P18", "P19"]);
});

/* ── E · Genesis full parity ─────────────────────────────────────────────────── */

test("E · Genesis: publication-authority and reportEvidence selections are identical", () => {
  const publication = selectAdiHighlights(GENESIS_SOURCES);
  const fromPublication = rankFromPublication(GENESIS_SOURCES);
  const fromEvidence = selectStrengthStoriesFromReportEvidence(genesisEvidence);

  console.log("[PROPOSAL PARITY GENESIS] publication", JSON.stringify(shape(fromPublication.ranked)));
  console.log("[PROPOSAL PARITY GENESIS] evidence", JSON.stringify(shape(fromEvidence.ranked)));
  console.log("[PROPOSAL PARITY GENESIS] report highlights", JSON.stringify(shape(publication.highlights)));
  console.log("[PROPOSAL PARITY GENESIS] omissions",
    JSON.stringify(fromPublication.floor), JSON.stringify(fromEvidence.floor),
    JSON.stringify(publication.rejected.map((row) => row.id)),
    JSON.stringify(fromEvidence.rejected.map((row) => row.id)));

  assert.equal(fromEvidence.floor, fromPublication.floor, "the adaptive floor must be read identically");
  assert.deepEqual(shape(fromEvidence.ranked), shape(fromPublication.ranked));
  assert.deepEqual(shape(publication.highlights), shape(fromEvidence.ranked));
  assert.deepEqual(fromEvidence.ranked.map((story) => story.id), GENESIS_ORDER);
  assert.deepEqual(
    fromEvidence.ranked.map(evidenceLines),
    fromPublication.ranked.map(evidenceLines),
  );
  assert.deepEqual(
    fromEvidence.rejected.map((entry) => entry.id),
    publication.rejected.map((entry) => entry.id),
  );
  assert.equal(
    fromEvidence.rejected.find((entry) => entry.id === "reference-seat-bass").reason,
    publication.rejected.find((entry) => entry.id === "reference-seat-bass").reason,
  );
});

/* ── F · Marquee full parity ─────────────────────────────────────────────────── */

test("F · Marquee: publication-authority and reportEvidence selections are identical", () => {
  const publication = selectAdiHighlights(MARQUEE_SOURCES);
  const fromPublication = rankFromPublication(MARQUEE_SOURCES);
  const fromEvidence = selectStrengthStoriesFromReportEvidence(marqueeEvidence);

  console.log("[PROPOSAL PARITY MARQUEE] publication", JSON.stringify(shape(fromPublication.ranked)));
  console.log("[PROPOSAL PARITY MARQUEE] evidence", JSON.stringify(shape(fromEvidence.ranked)));
  console.log("[PROPOSAL PARITY MARQUEE] omissions",
    JSON.stringify(fromPublication.floor), JSON.stringify(fromEvidence.floor),
    JSON.stringify(publication.rejected.map((row) => row.id)),
    JSON.stringify(fromEvidence.rejected.map((row) => row.id)));

  assert.equal(fromEvidence.floor, fromPublication.floor);
  assert.deepEqual(shape(fromEvidence.ranked), shape(fromPublication.ranked));
  assert.deepEqual(shape(publication.highlights), shape(fromEvidence.ranked));
  assert.deepEqual(fromEvidence.ranked.map((story) => story.id), MARQUEE_ORDER);
  assert.deepEqual(
    fromEvidence.ranked.map(evidenceLines),
    fromPublication.ranked.map(evidenceLines),
  );
  assert.deepEqual(
    fromEvidence.rejected.map((entry) => entry.id),
    publication.rejected.map((entry) => entry.id),
  );
});

/* ── G · No live fallback ────────────────────────────────────────────────────── */

test("G · the evidence-side selector reads no live project, version or room state", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../base44/shared/strengthEvidenceContext.js", import.meta.url)),
    "utf8",
  );
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
  assert.ok(imports.length > 0);
  for (const specifier of imports) {
    assert.ok(
      !specifier.startsWith("@/") && !specifier.includes("api/") && !specifier.includes("base44Client"),
      `the evidence context must not import app state: ${specifier}`,
    );
  }
  // The rule is about the CODE, so the module's own documentation is stripped
  // first: the comments state what the module must not do.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of ["ProjectVersion", "published_fingerprint", "RoomDesigner", "ActiveProject", "base44", "require("]) {
    assert.ok(!code.includes(forbidden), `the evidence context must not reach for ${forbidden}`);
  }

  // The evidence is the ONLY input: a poisoned live pointer changes nothing, the
  // frozen evidence is never mutated, and no live seating plan is read.
  const poisoned = {
    ...genesisEvidence,
    project_id: "live-project",
    current_version_id: "live-version",
    published_fingerprint: "eng:v1:live",
  };
  const plain = selectStrengthStoriesFromReportEvidence(genesisEvidence);
  const poisonedSelection = selectStrengthStoriesFromReportEvidence(poisoned);
  assert.deepEqual(shape(poisonedSelection.ranked), shape(plain.ranked));
  assert.deepEqual(poisonedSelection.sources.seatingPositions, []);
  assert.equal(JSON.stringify(genesisEvidence), JSON.stringify(genesisEvidence));

  const frozen = JSON.parse(JSON.stringify(genesisEvidence));
  const deepFreeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  };
  const frozenSelection = selectStrengthStoriesFromReportEvidence(deepFreeze(frozen));
  assert.deepEqual(shape(frozenSelection.ranked), shape(plain.ranked));
});

/* ── H · A future capture freezes the canonical state beside the result ──────── */

test("H · a fresh capture preserves each parameter's canonical state from the frozen publication", async () => {
  const { buildReportEvidence } = await import("../components/report/reportEvidenceAuthority.js");
  const authority = genesisPublication.engineeringSummary.parameterAuthority;

  const captured = {
    identity: { projectId: "p", versionId: "v" },
    room: { dimensions: { length_m: 6, width_m: 4.5, height_m: 2.4 } },
    seats: [],
    system: {},
    // The report's own parameter rows, in the shape the report reader returns
    // them: a published result, and no state of their own.
    report_parameters: [
      { key: "P14", parameter_id: 14, scope: "room", level: "L3", value: "115 dBC" },
      {
        key: "P19", parameter_id: 19, scope: "rsp", level: "L4", value: "±0 dB",
        supporting_per_seat: [{ seat_id: "seat-r1-c1", level: "L4" }],
      },
    ],
    report_engineering_summary: { parameterAuthority: authority },
  };

  const provisional = buildReportEvidence({ reportType: "project", captured });
  const provisionalP19 = provisional.parameters.find((row) => row.parameter_id === 19);
  assert.equal(provisionalP19.state, "provisional", "a provisional publication freezes P19 as provisional");
  assert.equal(provisionalP19.level, "L4", "the published result itself is never changed");
  assert.equal(provisionalP19.value, "±0 dB");
  assert.equal(provisionalP19.supporting_per_seat[0].state, "scored", "the seat row carries the frozen per-seat state");
  assert.equal(provisional.parameters.find((row) => row.parameter_id === 14).state, "scored");
  assert.equal(
    summaryFromReportEvidence(provisional).parameterAuthority.p19.state,
    "provisional",
    "the frozen evidence reader must read the same state",
  );

  // The same capture against a publication whose P19 is settled.
  const settled = buildReportEvidence({
    reportType: "project",
    captured: {
      ...captured,
      report_engineering_summary: {
        parameterAuthority: { ...authority, p19: { ...authority.p19, state: "scored" } },
      },
    },
  });
  assert.equal(settled.parameters.find((row) => row.parameter_id === 19).state, "scored");
  assert.equal(summaryFromReportEvidence(settled).parameterAuthority.p19.state, "scored");
});