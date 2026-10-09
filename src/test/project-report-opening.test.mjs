/**
 * project-report-opening.test.mjs
 * -------------------------------
 * Acceptance for the Project Report's opening three pages, against the REAL
 * frozen evidence of Marquee Home (version "Level 4 version"), extracted from
 * the published engineering publication into ./fixtures/marqueeAdiEvidence.json.
 *
 *   Page 1  Project Summary        — key facts, one project-specific paragraph
 *   Page 2  ADI Design Highlights  — ADI's selection from this design's evidence
 *   Page 3  System & Products      — role, model, quantity and the engineering link
 *
 * What is proved here:
 *   · the highlights are THIS design's, selected from its own evidence — never a
 *     fixed template;
 *   · every claim carries its own evidence, and only genuinely strong results are
 *     raised (L3 or better, weakest assessed seat governing);
 *   · P19 is stated at the reference seating position only, and P20 (L1) never
 *     becomes a room-wide bass claim;
 *   · weak and assumed parameters raise nothing;
 *   · page 1 and page 2 fit their fixed A4 composition — no clipping.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import fixture from "./fixtures/marqueeAdiEvidence.json";
import liveEvidence from "./fixtures/marqueeLiveAdiEvidence.json";
import {
  selectAdiHighlights,
  buildAdiDesignHighlights,
  buildSpecificationConnections,
} from "../components/report/projectReport/adiDesignHighlights.js";
import {
  estimateHighlightsMm,
  estimateProjectSummaryMm,
  fitHighlightsToBudget,
  PROJECT_REPORT_PAGE_BUDGET_MM,
} from "../components/report/projectReport/projectReportPageBudget.js";
import { buildProjectReportSummaryOpening } from "../components/report/projectReport/projectReportSummaryOpening.js";
import ProjectReportDesignSummary from "../components/report/projectReport/ProjectReportDesignSummary.jsx";
import AdiDesignHighlightsPage from "../components/report/projectReport/AdiDesignHighlightsPage.jsx";
import ProjectReportSystemOverview from "../components/report/projectReport/ProjectReportSystemOverview.jsx";

/**
 * The report's own canonical schedule for this version — the same rows the
 * Technical Report and the frozen Engineering Snapshot state for Marquee Home:
 * LCR Q8-5 × 3, surrounds/wides Q6-3 × 6, overheads Spitfire Cloud × 6,
 * subwoofers SUB4-12 × 2 front + × 2 rear, treatment Artcoustic Abfuser × 8.
 */
const PRODUCTS = {
  rows: [
    { key: "lcr", area: "LCR", value: "Q8-5 × 3" },
    { key: "surrounds", area: "Surrounds / wides", value: "Q6-3 × 6" },
    { key: "overheads", area: "Overheads", value: "Spitfire Cloud × 6" },
    { key: "subwoofers", area: "Subwoofers", value: "SUB4-12 × 2 (front), SUB4-12 × 2 (rear)" },
    { key: "acoustic_treatment", area: "Acoustic treatment", value: "Artcoustic Abfuser × 8" },
  ],
};

/**
 * The engineering evidence the highlights are selected from is the REAL published
 * publication (parameterAuthority, room results, seat results and RP23 viewing),
 * taken live from Marquee Home's published engineering summary. `fixture` carries
 * the project's own facts (room, screen, seating) used by pages 1 and 3.
 */
const engineeringSummary = liveEvidence.engineeringSummary;

const sources = {
  engineeringSummary,
  productsSelected: PRODUCTS,
  seatingPositions: liveEvidence.seatingPositions,
  dolbyConfig: liveEvidence.project?.dolby_config || fixture.project.dolby_config,
};

const BANNED_GENERIC = [
  "immersive sound",
  "excellent performance",
  "cinematic experience",
  "state-of-the-art",
  "world-class",
  "exceptional",
  "unrivalled",
  "best-in-class",
];

test("Marquee: ADI selects this design's strongest highlights, strongest first", () => {
  const { highlights, selected, rejected } = selectAdiHighlights(sources);

  // The whole published picture: the two output capabilities lead, the timbre and
  // architecture stories follow, then the extended bass, the placement measures
  // that genuinely hold and the per-row viewing result. P19 is provisional in its
  // own authority, so no bass-response story is raised at all.
  assert.deepEqual(selected, [
    "dynamic-capability",
    "tonal-consistency",
    "bass-output",
    "immersive-layout",
    "low-frequency-extension",
    "spatial-resolution",
    "viewing-geometry",
  ]);
  assert.equal(highlights.length, 7);

  // Every highlight states its own evidence and a short client explanation.
  for (const highlight of highlights) {
    assert.ok(highlight.evidence.length >= 1, `${highlight.id} carries evidence`);
    for (const item of highlight.evidence) {
      assert.ok(item.key, `${highlight.id} evidence has a source`);
      assert.ok(item.level || item.value, `${highlight.id} evidence states a level or a value`);
    }
    assert.ok(highlight.explanation.length > 40 && highlight.explanation.length < 300, `${highlight.id} copy is 1–2 short sentences`);
  }

  // The claims ADI deliberately did not make are audited with their reason.
  const rejectedIds = rejected.map((entry) => entry.id);
  assert.ok(rejectedIds.includes("room-wide-bass-consistency"));
  assert.ok(rejectedIds.includes("seat-placement-consistency"));
  assert.ok(rejectedIds.includes("background-noise"));
  assert.ok(rejectedIds.includes("early-reflections"));
  assert.ok(rejectedIds.includes("reference-seat-bass"));
  for (const entry of rejected) assert.ok(String(entry.reason).length > 20);
});

test("the dynamic highlight states the published P12 and P13 values", () => {
  const highlights = buildAdiDesignHighlights(sources);
  const dynamic = highlights.find((highlight) => highlight.id === "dynamic-capability");

  assert.equal(dynamic.category, "Dynamic Range");
  assert.equal(dynamic.weight, 3);
  assert.equal(dynamic.evidence[0].key, "P12 L4");
  assert.equal(dynamic.evidence[0].level, "L4");
  assert.match(dynamic.evidence[0].value, /116 dBC/);
  assert.equal(dynamic.evidence[1].level, "L4");
  assert.match(dynamic.evidence[1].value, /108 dBC/);
  assert.match(dynamic.explanation, /116 dBC/);
  assert.match(dynamic.explanation, /108 dBC/);
});

test("the tonal highlight holds across every assessed seat, not the best one", () => {
  const highlights = buildAdiDesignHighlights(sources);
  const tonal = highlights.find((highlight) => highlight.id === "tonal-consistency");

  assert.equal(tonal.weight, 3);
  assert.deepEqual(tonal.sources, ["P16", "P17"]);
  assert.equal(tonal.evidence[0].level, "L4");
  assert.equal(tonal.evidence[1].level, "L4");
  // The all-seat floor is stated, with the seat count it was measured over.
  assert.match(tonal.explanation, /all 9 assessed seating positions/);
  assert.match(tonal.evidence[0].value, /±0\.5 dB/);
});

test("bass is claimed from the LFE output authority — a provisional P19 and a weak P20 are never used", () => {
  const highlights = buildAdiDesignHighlights(sources);
  const bass = highlights.find((highlight) => highlight.id === "bass-output");

  assert.equal(bass.scope, "room");
  assert.deepEqual(bass.sources, ["P14"]);
  assert.equal(bass.evidence[0].key, "P14 L4");
  assert.match(bass.explanation, /reference seating position/);
  assert.doesNotMatch(bass.explanation, /across the room|throughout the room|every seat/i);

  // No bass-response story is raised while P19's own authority is provisional.
  assert.ok(!highlights.some((highlight) => highlight.id === "reference-seat-bass"));
  assert.ok(!highlights.some((highlight) => highlight.id === "bass-extension-and-response"));

  // No selected highlight rests on weak, assumed or provisional evidence.
  for (const highlight of highlights) {
    for (const source of highlight.sources) {
      assert.doesNotMatch(source, /P19|P20|P5|P6|P7|P10|P15|P21/, `${highlight.id} must not rest on ${source}`);
    }
    assert.doesNotMatch(JSON.stringify(highlight), /room-wide|throughout the room|equally strong/i);
  }
});

test("the viewing highlight states each row's own published RP23 result", () => {
  const highlights = buildAdiDesignHighlights(sources);
  const viewing = highlights.find((highlight) => highlight.id === "viewing-geometry");

  assert.equal(viewing.evidence.length, 2);
  assert.match(viewing.explanation, /front row/i);
  assert.match(viewing.explanation, /64\.6°/);
  assert.match(viewing.explanation, /rear row/i);
  assert.match(viewing.explanation, /45\.0°/);
  assert.equal(viewing.evidence[0].level, "L4");
  assert.equal(viewing.evidence[1].level, "L3");
});

test("the layout and product highlights state the system that was specified", () => {
  const highlights = buildAdiDesignHighlights(sources);
  const layout = highlights.find((highlight) => highlight.id === "immersive-layout");
  const products = highlights.find((highlight) => highlight.id === "product-selection");

  assert.match(layout.explanation, /9\.1\.6/);
  assert.match(layout.explanation, /6 overhead speakers/);
  assert.match(layout.explanation, /4 subwoofers/);
  assert.equal(layout.evidence[1].key, "P2 L4");

  assert.match(products.explanation, /Q8-5 × 3/);
  assert.match(products.explanation, /Q6-3 × 6/);
  assert.match(products.explanation, /Spitfire Cloud × 6/);
  assert.match(products.explanation, /SUB4-12 × 4/);
  assert.match(products.explanation, /Abfuser × 8/);
  assert.match(products.explanation, /P12 screen-stage capability/);
  assert.match(products.explanation, /P14 bass output capability/);
});

test("nothing generic is stated: every claim is a fact of this design", () => {
  const highlights = buildAdiDesignHighlights(sources);
  for (const highlight of highlights) {
    const text = `${highlight.title} ${highlight.explanation}`.toLowerCase();
    for (const phrase of BANNED_GENERIC) {
      assert.ok(!text.includes(phrase), `${highlight.id} must not use "${phrase}"`);
    }
  }
});

test("a genuinely strong placement picture raises the spatial highlight; a weak one does not, and the seat-scoped mix is never hidden", () => {
  // This design's own picture: the room-scope placement measures hold (P1, P3,
  // P4, P9, P11), so the story is raised — and each measure is stated on its own
  // published result, with the seat-by-seat placement results that are mixed
  // (P5, P6, P10) audited rather than folded into the claim.
  const { highlights, rejected } = selectAdiHighlights(sources);
  const spatial = highlights.find((highlight) => highlight.id === "spatial-resolution");
  assert.ok(spatial, "the placement measures that genuinely hold are stated");
  assert.equal(spatial.evidence.length, 3);
  assert.equal(spatial.level, "L3", "the weakest claimed measure governs the story");
  assert.match(spatial.explanation, /each stated on its own published result/);
  for (const source of spatial.sources) {
    assert.doesNotMatch(source, /P5|P6|P7|P10/, "a mixed seat-scoped measure is never part of the claim");
  }
  assert.ok(rejected.some((entry) => entry.id === "seat-placement-consistency" && /P5|P6|P10/.test(entry.reason)));

  // Downgrade the placement measures below the strength floor: nothing is stated.
  const weak = JSON.parse(JSON.stringify(engineeringSummary));
  for (const key of ["p1", "p3", "p4", "p7", "p9", "p11"]) {
    const entry = weak.parameterAuthority[key];
    if (entry?.seats) {
      for (const seatId of Object.keys(entry.seats)) entry.seats[seatId] = { ...entry.seats[seatId], level: "L2" };
    } else if (entry) {
      weak.parameterAuthority[key] = { ...entry, level: "L2" };
    }
  }
  const lowered = buildAdiDesignHighlights({ ...sources, engineeringSummary: weak });
  assert.ok(!lowered.some((highlight) => highlight.id === "spatial-resolution"), "weak placement results raise nothing");
});

// ── PAGE FIT: the fixed A4 composition ───────────────────────────────────────

test("page 1 (Project Summary) fits its page and carries no performance sections", () => {
  const opening = buildProjectReportSummaryOpening({
    projectDetails: fixture.project,
    productsSelected: PRODUCTS,
    seatingPositions: fixture.seatingPositions,
    engineeringSummary: fixture.engineeringSummary,
  });
  assert.ok(opening && opening.length > 80, "the project-specific paragraph exists");

  const usedMm = estimateProjectSummaryMm({ factCount: 7, paragraph: opening });
  assert.ok(
    usedMm <= PROJECT_REPORT_PAGE_BUDGET_MM.first,
    `page 1 uses about ${usedMm}mm of its ${PROJECT_REPORT_PAGE_BUDGET_MM.first}mm budget`,
  );

  const html = renderToStaticMarkup(React.createElement(ProjectReportDesignSummary, {
    projectDetails: fixture.project,
    roomDims: fixture.roomDims,
    seatingPositions: fixture.seatingPositions,
    screenWidthM: 3.99,
    productsSelected: PRODUCTS,
    summaryOpening: opening,
  }));

  assert.ok(html.includes("Project Summary"));
  assert.ok(html.includes("5.18 × 7.29 × 2.80"));
  assert.ok(html.includes("9.1.6"));
  assert.ok(html.includes("Q8-5 × 3"));
  assert.ok(html.includes("Artcoustic Abfuser × 8"));
  // The overflow symptom is gone: the performance sections are not on page 1.
  assert.ok(!html.includes("Timbre Matching"));
  assert.ok(!html.includes("Spatial Resolution"));
  assert.ok(!html.includes("Dynamic Range"));
});

test("page 2 (ADI Design Highlights) fits its page, and the fit guard reduces copy rather than clipping", () => {
  const highlights = buildAdiDesignHighlights(sources);
  const usedMm = estimateHighlightsMm(highlights);
  assert.ok(
    usedMm <= PROJECT_REPORT_PAGE_BUDGET_MM.page,
    `page 2 uses about ${usedMm}mm of its ${PROJECT_REPORT_PAGE_BUDGET_MM.page}mm budget`,
  );

  // The guard: an over-long list is reduced, never clipped, and never emptied.
  const oversized = Array.from({ length: 14 }, (_, index) => ({
    id: `oversized-${index}`,
    weight: 1,
    evidence: [],
    explanation: "x".repeat(300),
  }));
  const fitted = fitHighlightsToBudget(oversized, PROJECT_REPORT_PAGE_BUDGET_MM.page);
  assert.ok(fitted.length >= 1 && fitted.length < oversized.length);
  assert.ok(estimateHighlightsMm(fitted) <= PROJECT_REPORT_PAGE_BUDGET_MM.page);
});

test("pages 2 and 3 render this design's own content", () => {
  const highlights = buildAdiDesignHighlights(sources);

  const page2 = renderToStaticMarkup(React.createElement(AdiDesignHighlightsPage, { highlights }));
  assert.ok(page2.includes("ADI Design Highlights"));
  for (const highlight of highlights) {
    assert.ok(page2.includes(highlight.title), `${highlight.title} renders`);
  }
  assert.ok(page2.includes("P12 L4"));
  assert.ok(page2.includes("116 dBC"));
  assert.ok(page2.includes("P19 L4"));
  for (const phrase of BANNED_GENERIC) {
    assert.ok(!page2.toLowerCase().includes(phrase), `page 2 must not state "${phrase}"`);
  }

  const page3 = renderToStaticMarkup(React.createElement(ProjectReportSystemOverview, {
    projectDetails: fixture.project,
    productsSelected: PRODUCTS,
    engineeringSummary: fixture.engineeringSummary,
    rows: [],
  }));
  assert.ok(page3.includes("System &amp; Products") || page3.includes("System & Products"));
  assert.ok(page3.includes("Q8-5 × 3"));
  assert.ok(page3.includes("Q6-3 × 6"));
  assert.ok(page3.includes("Spitfire Cloud × 6"));
  assert.ok(page3.includes("SUB4-12 × 2 (front)"));
  assert.ok(page3.includes("Artcoustic Abfuser × 8"));
  assert.ok(page3.includes("RP22 P12 L4"));
  assert.ok(page3.includes("RP22 P14 L4"));
  assert.ok(page3.includes("15 speakers"));
});

test("each product's engineering link is stated only where the evidence supports it", () => {
  const strong = buildSpecificationConnections({
    productsSelected: PRODUCTS,
    engineeringSummary: fixture.engineeringSummary,
    dolbyConfig: fixture.project.dolby_layout || "9.1.6",
  });
  assert.match(strong.lcr, /RP22 P12 L4/);
  assert.match(strong.surrounds, /RP22 P13 L4/);
  assert.match(strong.subwoofers, /RP22 P14 L4/);
  assert.match(strong.acoustic_treatment, /reflection control/);

  // With a weak screen-stage result the LCR link must not cite a strength.
  const weak = JSON.parse(JSON.stringify(fixture.engineeringSummary));
  weak.roomResultsByParameter["12"] = { level: "L2", value: 96, formatted: "96 dBC" };
  const cautious = buildSpecificationConnections({
    productsSelected: PRODUCTS,
    engineeringSummary: weak,
    dolbyConfig: "9.1.6",
  });
  assert.match(cautious.lcr, /Screen stage/);
  assert.doesNotMatch(cautious.lcr, /RP22 P12/);
  assert.match(cautious.surrounds, /RP22 P13 L4/);
});