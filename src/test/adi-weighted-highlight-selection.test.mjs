/**
 * adi-weighted-highlight-selection.test.mjs
 * -----------------------------------------
 * Acceptance for the ADI Design Highlights selector's canonical importance
 * ranking, against the REAL frozen evidence of two projects:
 *
 *   Genesis AV   — src/test/fixtures/genesisAdiEvidence.json
 *   Marquee Home — src/test/fixtures/marqueeLiveAdiEvidence.json
 *
 * What is proved here:
 *   · the selector ranks stories by the ONE canonical importance source (the
 *     Artcoustic System Design Rating's own parameter weights), with the achieved
 *     level breaking ties inside an importance band — a materially important L3
 *     outranks a low-importance L4;
 *   · eligibility is strict: provisional, assumed and non-terminal evidence is
 *     excluded from both the ranking and the weighted distribution;
 *   · the internal spec tier adapts the highlight floor to the design's own
 *     quality, and L1 is never a positive highlight;
 *   · P19 is never raised while its own authority is provisional;
 *   · no weight, score, tier or ASDR language reaches the client-facing copy.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import genesis from "./fixtures/genesisAdiEvidence.json";
import marquee from "./fixtures/marqueeLiveAdiEvidence.json";
import {
  selectAdiHighlights,
  buildAdiDesignHighlights,
} from "../components/report/projectReport/adiDesignHighlights.js";
import {
  PARAM_WEIGHTS,
  MIN_HIGHLIGHTS,
  MAX_HIGHLIGHTS,
} from "../components/report/projectReport/adiHighlightImportance.js";
import { estimateHighlightsMm, PROJECT_REPORT_PAGE_BUDGET_MM } from "../components/report/projectReport/projectReportPageBudget.js";

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
  engineeringSummary: genesis.engineeringSummary,
  productsSelected: GENESIS_PRODUCTS,
  seatingPositions: genesis.seatingPositions,
  dolbyConfig: genesis.project?.dolby_config || "9.1.6",
  displayType: "tv",
};

const MARQUEE_SOURCES = {
  engineeringSummary: marquee.engineeringSummary,
  productsSelected: MARQUEE_PRODUCTS,
  seatingPositions: marquee.seatingPositions,
  dolbyConfig: marquee.project?.dolby_config || "9.1.6",
  displayType: "projector_screen",
};

const FORBIDDEN_CLIENT_WORDS = [
  "asdr",
  "weight",
  "weighted",
  "score",
  "scored",
  "higher-spec",
  "mid-spec",
  "lower-spec",
  "design performance index",
  "rating",
];

/** A summary with one provisional / one assumed parameter swapped in. */
function withState(summary, key, patch) {
  const copy = JSON.parse(JSON.stringify(summary));
  copy.parameterAuthority[key] = { ...copy.parameterAuthority[key], ...patch };
  return copy;
}

test("Genesis: the selector reads its internal spec tier from the eligible weighted evidence", () => {
  const { specTier, distribution, selected } = selectAdiHighlights(GENESIS_SOURCES);

  console.log("[GENESIS]", JSON.stringify({
    specTier,
    distribution,
    selected,
  }));

  // Eligible evidence only: P8, P15 and P21 are permanent assumptions and P19's
  // authority is provisional, so none of them contributes weight.
  assert.equal(specTier, "lower");
  assert.equal(distribution.totalWeight, 113);
  assert.deepEqual(distribution.byLevel, { L4: 29, L3: 9, L2: 42, L1: 33 });
  assert.ok(distribution.shareL2Plus > 0.5);
  assert.ok(distribution.shareL3Plus < 0.5, "Genesis is not a mid-spec design");
});

test("Genesis: the strongest genuine stories are selected in rank order", () => {
  const { selected, highlights } = selectAdiHighlights(GENESIS_SOURCES);

  assert.deepEqual(selected, [
    "tonal-consistency",
    "immersive-layout",
    "bass-output",
    "spatial-resolution",
    "viewing-geometry",
  ]);
  assert.ok(highlights.length >= MIN_HIGHLIGHTS && highlights.length <= MAX_HIGHLIGHTS);

  const tonal = highlights[0];
  assert.equal(tonal.level, "L4");
  assert.equal(tonal.category, "Timbre Matching");
  assert.match(tonal.explanation, /all 8 assessed seating positions/);
  assert.match(tonal.evidence[0].value, /±0\.5 dB/);

  const architecture = highlights[1];
  assert.equal(architecture.id, "immersive-layout");
  assert.equal(architecture.level, "L4");
  assert.match(architecture.explanation, /9\.1\.6/);
  assert.equal(architecture.evidence[1].key, "P2 L4");

  const bassOutput = highlights[2];
  assert.equal(bassOutput.level, "L3");
  assert.match(bassOutput.evidence[0].value, /115 dBC/);

  // A materially important L3 (P14) ranks above the low-importance L4 placement
  // story: importance leads, the level only breaks ties inside its band.
  assert.ok(highlights.indexOf(bassOutput) < highlights.findIndex((h) => h.id === "spatial-resolution"));

  // The page fits.
  assert.ok(estimateHighlightsMm(highlights) <= PROJECT_REPORT_PAGE_BUDGET_MM.page);
});

test("Genesis: spatial placement names each measure, and the viewing strength is the front row only", () => {
  const highlights = buildAdiDesignHighlights(GENESIS_SOURCES);
  const spatial = highlights.find((highlight) => highlight.id === "spatial-resolution");

  assert.ok(spatial, "the room-scope placement strengths are raised");
  assert.deepEqual(spatial.sources.sort(), ["P11", "P3", "P7"]);
  assert.equal(spatial.level, "L4");
  // Each measure carries its own published result rather than one blanket claim.
  for (const item of spatial.evidence) assert.ok(item.level === "L4" && item.value, JSON.stringify(item));
  assert.match(spatial.explanation, /each stated on its own published result/);
  assert.doesNotMatch(spatial.explanation, /every seat|throughout the room|uniformly/i);

  const viewing = highlights.find((highlight) => highlight.id === "viewing-geometry");
  assert.equal(viewing.level, "L4");
  assert.equal(viewing.scope, "row");
  assert.equal(viewing.evidence.length, 1, "only the front row is claimed");
  assert.match(viewing.title, /Front row viewing immersion/);
  assert.match(viewing.explanation, /front row views the TV at 57\.3°/);
  assert.doesNotMatch(viewing.explanation, /every row|all rows|rear row/i);
});

test("Genesis: the weaker results are audited, not hidden", () => {
  const { rejected, highlights } = selectAdiHighlights(GENESIS_SOURCES);
  const byId = Object.fromEntries(rejected.map((entry) => [entry.id, entry.reason]));

  assert.match(byId["reference-seat-bass"], /P19 is provisional/);
  assert.match(byId["low-frequency-extension"], /P18 is L2/);
  assert.match(byId["room-wide-bass-consistency"], /P20 is L1/);
  assert.match(byId["background-noise"], /assumed design assumption/);
  assert.match(byId["early-reflections"], /assumed performance level/);
  assert.match(byId["spatial-resolution"], /P5 L1, P6 L1, P10 L2/);
  for (const reason of Object.values(byId)) assert.ok(String(reason).length > 20);

  // No highlight rests on L1, on an assumed parameter, or on provisional P19.
  for (const highlight of highlights) {
    for (const source of highlight.sources) {
      assert.doesNotMatch(source, /P5|P6|P10|P15|P18|P19|P20|P21/, `${highlight.id} must not rest on ${source}`);
    }
    assert.ok(highlight.level !== "L1");
  }
});

test("Marquee: the selector reads its own internal spec tier and selects the strongest stories", () => {
  const { specTier, distribution, selected, highlights } = selectAdiHighlights(MARQUEE_SOURCES);

  console.log("[MARQUEE]", JSON.stringify({
    specTier,
    distribution,
    selected,
  }));

  assert.equal(specTier, "mid");
  assert.equal(distribution.totalWeight, 117);
  assert.ok(distribution.shareL3Plus >= 0.75);
  assert.deepEqual(selected, [
    "dynamic-capability",
    "tonal-consistency",
    "bass-output",
    "immersive-layout",
    "low-frequency-extension",
    "spatial-resolution",
    "viewing-geometry",
  ]);

  const dynamic = highlights[0];
  assert.equal(dynamic.level, "L4");
  assert.equal(dynamic.weight, 3);
  assert.match(dynamic.evidence[0].value, /116 dBC/);
  assert.match(dynamic.evidence[1].value, /108 dBC/);
  assert.ok(estimateHighlightsMm(highlights) <= PROJECT_REPORT_PAGE_BUDGET_MM.page);
});

test("Marquee: both seating rows are claimed at their own RP23 result", () => {
  const highlights = buildAdiDesignHighlights(MARQUEE_SOURCES);
  const viewing = highlights.find((highlight) => highlight.id === "viewing-geometry");

  assert.equal(viewing.evidence.length, 2);
  assert.match(viewing.title, /every row/);
  assert.match(viewing.explanation, /front row views the screen at 64\.6°/);
  assert.match(viewing.explanation, /rear row views the screen at 45\.0°/);
  assert.equal(viewing.level, "L3", "the weakest claimed row governs the story");
  assert.equal(viewing.evidence[0].level, "L4");
  assert.equal(viewing.evidence[1].level, "L3");
});

test("nothing about weighting, scoring or tiers reaches the client-facing copy", () => {
  for (const sources of [GENESIS_SOURCES, MARQUEE_SOURCES]) {
    for (const highlight of buildAdiDesignHighlights(sources)) {
      const text = `${highlight.title} ${highlight.category} ${highlight.explanation} ${highlight.evidence
        .map((item) => `${item.key} ${item.value || ""}`)
        .join(" ")}`.toLowerCase();
      for (const phrase of FORBIDDEN_CLIENT_WORDS) {
        assert.ok(!text.includes(phrase), `${highlight.id} must not state "${phrase}"`);
      }
    }
  }
});

test("eligibility is strict: provisional, assumed and non-terminal evidence raises nothing", () => {
  // P19 provisional — no bass response story at all, in either project.
  for (const sources of [GENESIS_SOURCES, MARQUEE_SOURCES]) {
    const { selected, rejected } = selectAdiHighlights(sources);
    assert.ok(!selected.includes("reference-seat-bass"));
    assert.ok(!selected.includes("bass-extension-and-response"));
    assert.ok(rejected.some((entry) => entry.id === "reference-seat-bass"));
  }

  // Making P12 provisional removes the dynamic story and its weight from the
  // distribution entirely.
  const provisionalDynamic = withState(MARQUEE_SOURCES.engineeringSummary, "p12", { state: "provisional" });
  const { selected, distribution } = selectAdiHighlights({
    ...MARQUEE_SOURCES,
    engineeringSummary: provisionalDynamic,
  });
  assert.ok(!selected.includes("dynamic-capability"));
  assert.equal(distribution.totalWeight, 117 - PARAM_WEIGHTS.p12);

  // An assumed parameter never becomes a highlight, whatever level it carries.
  const assumed = withState(GENESIS_SOURCES.engineeringSummary, "p15", { state: "scored", level: "L4" });
  const assumedHighlights = buildAdiDesignHighlights({ ...GENESIS_SOURCES, engineeringSummary: assumed });
  for (const highlight of assumedHighlights) {
    assert.doesNotMatch(highlight.sources.join(","), /P15/);
  }
});

test("the adaptive floor follows the design's quality and never manufactures L1 strengths", () => {
  const genesis = selectAdiHighlights(GENESIS_SOURCES);
  const marquee = selectAdiHighlights(MARQUEE_SOURCES);

  // Both designs already carry enough genuine strengths, so no L2 story is raised.
  for (const result of [genesis, marquee]) {
    assert.ok(result.highlights.every((highlight) => highlight.level !== "L2" && highlight.level !== "L1"));
    assert.ok(result.rejected.some((entry) => entry.id === "lower-level-strengths"));
  }

  // A design with almost no genuine strength falls back to its strongest results
  // and fills the page with supporting evidence — it is never padded with L1.
  const weak = JSON.parse(JSON.stringify(MARQUEE_SOURCES.engineeringSummary));
  for (const key of ["p2", "p12", "p13", "p14", "p18", "p16", "p17", "screen"]) {
    weak.parameterAuthority[key] = { ...weak.parameterAuthority[key], state: "scored", level: "L1" };
    if (weak.parameterAuthority[key].seats) {
      for (const seatId of Object.keys(weak.parameterAuthority[key].seats)) {
        weak.parameterAuthority[key].seats[seatId] = { ...weak.parameterAuthority[key].seats[seatId], state: "scored", level: "L1" };
      }
    }
  }
  const weakResult = selectAdiHighlights({ ...MARQUEE_SOURCES, engineeringSummary: weak });
  assert.ok(weakResult.highlights.length >= 1);
  assert.ok(weakResult.highlights.every((highlight) => highlight.level !== "L1"), "L1 is never a positive highlight");
  assert.ok(weakResult.highlights.length <= MAX_HIGHLIGHTS);
});