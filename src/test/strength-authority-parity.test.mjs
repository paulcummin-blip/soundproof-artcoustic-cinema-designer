/**
 * strength-authority-parity.test.mjs
 * ----------------------------------
 * REPORT PARITY for the ONE shared engineering-strength authority.
 *
 * The Project Report's ADI Design Highlights selector and the proposal writer's
 * strength selection must read the same ranked strengths. This test proves the
 * relationship BETWEEN the two before and after the report selector is pointed
 * at the shared implementation:
 *
 *   · the canonical authority (shared/strengthImportance + shared/strengthStories,
 *     i.e. base44/shared/strengthImportance.js and base44/shared/strengthStories.js)
 *     ranks the two real projects in the order the report states;
 *   · the report's own selector states those same stories, in that same order,
 *     trimmed only by the page budget.
 *
 * Fixtures are the real frozen evidence of the two projects:
 *   Genesis AV   — src/test/fixtures/genesisAdiEvidence.json
 *   Marquee Home — src/test/fixtures/marqueeLiveAdiEvidence.json
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/* Read the fixtures by path so the suite runs identically under the app's own
   runner and under vitest (no JSON import attribute needed). */
const readFixture = (name) => JSON.parse(
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8"),
);
const genesis = readFixture("genesisAdiEvidence.json");
const marquee = readFixture("marqueeLiveAdiEvidence.json");
import {
  selectAdiHighlights,
  buildSpecificationConnections,
} from "../components/report/projectReport/adiDesignHighlights.js";
import { MAX_HIGHLIGHTS } from "../components/report/projectReport/adiHighlightImportance.js";
import {
  collectEligibleEvidence,
  classifySpecTier,
  tierFloor,
} from "../../shared/strengthImportance.js";
import {
  buildCandidates,
  admitStrengthStories,
  rankStrengthStories,
} from "../../shared/strengthStories.js";

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

/** The canonical authority's own ranked strength stories for a design. */
function canonicalRanking(sources) {
  const evidence = collectEligibleEvidence(sources.engineeringSummary);
  const floor = tierFloor(classifySpecTier(evidence.distribution));
  const connections = buildSpecificationConnections({
    productsSelected: sources.productsSelected,
    engineeringSummary: sources.engineeringSummary,
    dolbyConfig: sources.dolbyConfig,
  });
  const { candidates } = buildCandidates(sources, { byKey: evidence.byKey, floor, connections });
  const { admitted } = admitStrengthStories(candidates, { floor });
  return {
    floor,
    ranked: rankStrengthStories(admitted, MAX_HIGHLIGHTS),
    candidates,
  };
}

const shape = (stories) => stories.map((story) => ({
  id: story.id,
  level: story.level,
  scope: story.scope,
  evidence_ids: story.sources,
}));

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

test("Genesis: the canonical authority and the report selector state the same strengths in the same order", () => {
  const canonical = canonicalRanking(GENESIS_SOURCES);
  const report = selectAdiHighlights(GENESIS_SOURCES);

  console.log("[PARITY GENESIS] canonical", JSON.stringify(shape(canonical.ranked)));
  console.log("[PARITY GENESIS] report", JSON.stringify(shape(report.highlights)));
  console.log("[PARITY GENESIS] omitted", JSON.stringify(report.rejected.map((row) => row.id)));

  assert.deepEqual(
    canonical.ranked.map((story) => story.id),
    GENESIS_ORDER,
    "the canonical authority must rank Genesis in the order the report states",
  );
  assert.deepEqual(
    report.selected,
    canonical.ranked.slice(0, report.selected.length).map((story) => story.id),
    "the report selector must state the canonical order",
  );
  assert.deepEqual(report.selected, GENESIS_ORDER);
});

test("Marquee: the canonical authority and the report selector state the same strengths in the same order", () => {
  const canonical = canonicalRanking(MARQUEE_SOURCES);
  const report = selectAdiHighlights(MARQUEE_SOURCES);

  console.log("[PARITY MARQUEE] canonical", JSON.stringify(shape(canonical.ranked)));
  console.log("[PARITY MARQUEE] report", JSON.stringify(shape(report.highlights)));
  console.log("[PARITY MARQUEE] omitted", JSON.stringify(report.rejected.map((row) => row.id)));

  assert.deepEqual(
    canonical.ranked.map((story) => story.id),
    MARQUEE_ORDER,
    "the canonical authority must rank Marquee in the order the report states",
  );
  assert.deepEqual(
    report.selected,
    canonical.ranked.slice(0, report.selected.length).map((story) => story.id),
    "the report selector must state the canonical order",
  );
  assert.deepEqual(report.selected, MARQUEE_ORDER);
});

test("The report states no weight, score or tier: only the published result and what it means", () => {
  for (const sources of [GENESIS_SOURCES, MARQUEE_SOURCES]) {
    const { highlights } = selectAdiHighlights(sources);
    const copy = highlights
      .map((story) => `${story.title} ${story.explanation} ${story.evidence.map((line) => `${line.key} ${line.value || ''}`).join(' ')}`)
      .join(' ')
      .toLowerCase();
    for (const word of ["asdr", "weight", "score", "tier", "rating"]) {
      assert.ok(!copy.includes(word), `client-facing highlight copy must not state "${word}"`);
    }
  }
});