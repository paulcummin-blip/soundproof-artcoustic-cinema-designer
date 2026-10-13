/**
 * project-report-presentation-fixes.test.mjs
 * ------------------------------------------
 * Acceptance for the Project Report presentation fixes, against the REAL frozen
 * published evidence of Marquee Home (the same live publication the opening-pages
 * suite uses):
 *
 *   1. ADI Design Highlights — the groups are separated by the room the page's own
 *      A4 budget leaves spare, within the composition's own limits: comfortable
 *      and adaptive, never stretched to fill the sheet, never tighter than the
 *      composition, and never beyond the page budget. Title and introduction keep
 *      their positions.
 *   2. System & Products — the Viewing Geometry table shares the System
 *      Specification table's grid: same row-name column, same content width and
 *      right edge, headings over their own values, both rows aligned identically,
 *      the RP23 pill in one consistent column. No value, level or score changes.
 *   3. Report number formatting — each parameter is stated by its own existing
 *      authoritative display convention: P18 as the RP22 whole-Hz result, the
 *      bass-response deviation as the publication's own ± dB result. No raw
 *      calculated float reaches either page, and no value, grading or calculation
 *      is changed.
 *
 * Rendering is the real React pages, so what is asserted is the markup the A4
 * pages actually print.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import fixture from "./fixtures/marqueeAdiEvidence.json";
import liveEvidence from "./fixtures/marqueeLiveAdiEvidence.json";
import {
  buildAdiDesignHighlights,
  buildSpecificationConnections,
  selectAdiHighlights,
} from "../components/report/projectReport/adiDesignHighlights.js";
import {
  COMPACT_BLOCK_MM,
  COMPACT_HIGHLIGHT_GAP_MAX_MM,
  HIGHLIGHT_GAP_MAX_MM,
  HIGHLIGHT_PILL_HEADROOM_MM,
  PAGE_BLOCK_MM,
  PROJECT_REPORT_PAGE_BUDGET_MM,
  estimateHighlightContentMm,
  estimateHighlightsMm,
  fitHighlightsToBudget,
  resolveHighlightGapMm,
} from "../components/report/projectReport/projectReportPageBudget.js";
import {
  statedParameterValue,
  statedSummaryValue,
  statePublishedValues,
} from "../components/report/projectReport/projectReportPublishedValues.js";
import AdiDesignHighlightsPage from "../components/report/projectReport/AdiDesignHighlightsPage.jsx";
import ProjectReportSystemOverview from "../components/report/projectReport/ProjectReportSystemOverview.jsx";

const PRODUCTS = {
  rows: [
    { key: "lcr", area: "LCR", value: "Q8-5 × 3" },
    { key: "surrounds", area: "Surrounds / wides", value: "Q6-3 × 6" },
    { key: "overheads", area: "Overheads", value: "Spitfire Cloud × 6" },
    { key: "subwoofers", area: "Subwoofers", value: "SUB4-12 × 2 (front), SUB4-12 × 2 (rear)" },
    { key: "acoustic_treatment", area: "Acoustic treatment", value: "Artcoustic Abfuser × 8" },
  ],
};

const engineeringSummary = liveEvidence.engineeringSummary;

const sources = {
  engineeringSummary,
  productsSelected: PRODUCTS,
  seatingPositions: liveEvidence.seatingPositions,
  dolbyConfig: liveEvidence.project?.dolby_config || fixture.project.dolby_config,
};

/** Two rows with their own published RP23 results, as the report states them. */
const VIEWING_ROWS = [
  { rowIndex: 1, label: "Front row", seats: [{ level: "L4", angleDeg: 64.6 }, { level: "L4", angleDeg: 63.1 }] },
  { rowIndex: 2, label: "Rear row", seats: [{ level: "L1", angleDeg: 45.0 }] },
];

const renderPage2 = (highlights, print = true) => renderToStaticMarkup(
  React.createElement(AdiDesignHighlightsPage, { highlights, print }),
);

const renderPage3 = (print = true) => renderToStaticMarkup(
  React.createElement(ProjectReportSystemOverview, {
    projectDetails: fixture.project,
    productsSelected: PRODUCTS,
    engineeringSummary,
    rows: VIEWING_ROWS,
    print,
  }),
);

/** The viewing-geometry section of page 3's markup, on its own. */
function geometrySection(markup) {
  const start = markup.indexOf("Viewing geometry by row");
  assert.ok(start > -1, "the geometry table renders");
  return markup.slice(start);
}

test("the rendered pages, as composed", () => {
  // The settled composition of both real page-2 cases, in millimetres, against
  // the fixed A4 frame (271mm) and the page budget (228mm), with the pill
  // headroom included — the numbers the page actually lays out to.
  const all = buildAdiDesignHighlights(sources);
  const five = all.slice(0, 5);
  const fiveGap = resolveHighlightGapMm(five);
  const fiveContent = PAGE_BLOCK_MM.heading + five.reduce((total, h) => total + estimateHighlightContentMm(h), 0);
  const sevenGap = resolveHighlightGapMm(all);
  const sevenContent = PAGE_BLOCK_MM.heading + all.reduce((total, h) => total + estimateHighlightContentMm(h, { compact: true }), 0);

  console.log(`[REPORT-PAGES] page2 five-story: gap=${fiveGap}mm, used=${(fiveContent + 4 * fiveGap).toFixed(1)}mm of ${PROJECT_REPORT_PAGE_BUDGET_MM.page}mm budget (frame ${271}mm) | page2 seven-story: gap=${sevenGap}mm, used=${(sevenContent + 6 * sevenGap).toFixed(1)}mm`);
  assert.ok(fiveContent + 4 * fiveGap + HIGHLIGHT_PILL_HEADROOM_MM <= PROJECT_REPORT_PAGE_BUDGET_MM.page);
  assert.ok(sevenContent + 6 * sevenGap + HIGHLIGHT_PILL_HEADROOM_MM <= PROJECT_REPORT_PAGE_BUDGET_MM.page);
});

/* ------------------------------------------------------------------ *
 * 1 · ADI DESIGN HIGHLIGHTS — comfortable, adaptive group spacing
 * ------------------------------------------------------------------ */

test("five highlight groups take the page's spare height, and the page stays inside its A4 budget", () => {
  const all = buildAdiDesignHighlights(sources);
  const five = all.slice(0, 5);
  assert.ok(five.length === 5 && all.length > 5, "a five-group page is a real composition of this design");

  const gap = resolveHighlightGapMm(five);
  const usedMm = PAGE_BLOCK_MM.heading
    + five.reduce((total, highlight) => total + estimateHighlightContentMm(highlight), 0);

  // Comfortable: well clear of the fixed 3.4mm the page used before…
  assert.ok(gap > 3.4, `the settled gap is comfortable, not the old fixed 3.4mm (${gap}mm)`);
  // …bounded by the composition's own ceiling, so the copy is never stretched…
  assert.ok(gap <= HIGHLIGHT_GAP_MAX_MM, `the gap never exceeds its ceiling (${gap}mm)`);
  // …and never spending height the page does not have: the settled page keeps its
  // headroom for the canonical level pills, well inside the fixed A4 frame.
  assert.ok(usedMm + (five.length - 1) * gap <= PROJECT_REPORT_PAGE_BUDGET_MM.page);
  assert.ok(usedMm + (five.length - 1) * gap + 12 <= PROJECT_REPORT_PAGE_BUDGET_MM.page, "no clipping: pill headroom holds");
});

test("a fuller page stays tighter, and the spacing is never tighter than the composition itself", () => {
  const seven = buildAdiDesignHighlights(sources);
  assert.equal(seven.length, 7);

  const compactGap = resolveHighlightGapMm(seven);
  assert.ok(compactGap >= COMPACT_BLOCK_MM.highlightGap, "never tighter than the compact composition's gap");
  assert.ok(compactGap <= COMPACT_HIGHLIGHT_GAP_MAX_MM, "within the compact ceiling");
  assert.ok(compactGap < HIGHLIGHT_GAP_MAX_MM, "a fuller page stays tighter than a five-group page");

  // The fuller page also stays inside its budget with the pills in place.
  const sevenUsedMm = PAGE_BLOCK_MM.heading
    + seven.reduce((total, highlight) => total + estimateHighlightContentMm(highlight, { compact: true }), 0);
  assert.ok(sevenUsedMm + (seven.length - 1) * compactGap + 12 <= PROJECT_REPORT_PAGE_BUDGET_MM.page, "no clipping: pill headroom holds");

  // A page whose own content leaves no room keeps exactly the composition's gap:
  // nothing is squeezed below it, and nothing is stretched.
  const crowded = Array.from({ length: 7 }, (_, index) => ({
    id: `crowded-${index}`,
    evidence: [{ key: "P12", level: "L4", value: "116 dBC" }],
    explanation: "x".repeat(400),
  }));
  assert.equal(resolveHighlightGapMm(crowded), COMPACT_BLOCK_MM.highlightGap);

  // Two short stories on an otherwise empty page are never stretched down the
  // sheet: the ceiling holds.
  const short = [{ id: "a", evidence: [], explanation: "short." }, { id: "b", evidence: [], explanation: "short." }];
  assert.equal(resolveHighlightGapMm(short), HIGHLIGHT_GAP_MAX_MM);
});

test("page 2 renders the settled spacing, with the title and introduction in their existing positions", () => {
  const highlights = buildAdiDesignHighlights(sources);
  const gap = resolveHighlightGapMm(highlights);
  const page2 = renderPage2(highlights);

  assert.match(page2, new RegExp(`gap:${gap}mm`), `the page prints the settled ${gap}mm spacing`);
  assert.ok(
    page2.indexOf("client-report-print-heading") < page2.indexOf("display:flex"),
    "the heading block still sits above the groups",
  );
  assert.ok(page2.includes("client-report-print-heading__title"), "the title keeps its own class");
  assert.ok(page2.includes("published RP22 and RP23 results"), "the introduction is unchanged");
  assert.ok(!page2.includes("3.4mm"), "the old fixed spacing is gone");
});

test("a whole published figure is stated exactly as the shared story states it — nothing is rounded", () => {
  const dynamic = buildAdiDesignHighlights(sources).find((highlight) => highlight.id === "dynamic-capability");

  // The shared story builder states P12's own published figure; 116 is a whole
  // number, so the report's display boundary leaves it exactly as it is.
  assert.equal(dynamic.evidence[0].value, "Screen speakers · 116");
  assert.match(String(statedSummaryValue(engineeringSummary, 12)), /^116/);
});

test("the page budget, fit protection and page count are unchanged", () => {
  const highlights = buildAdiDesignHighlights(sources);

  // The selection is exactly what it was: the gap spends spare height only, so no
  // story is dropped and no page is added.
  assert.deepEqual(selectAdiHighlights(sources).selected, [
    "dynamic-capability",
    "tonal-consistency",
    "bass-output",
    "immersive-layout",
    "low-frequency-extension",
    "spatial-resolution",
    "viewing-geometry",
  ]);

  // The card estimate still accounts each card's content plus the composition's
  // own gap, and the fitted page still fits its budget.
  // The card estimate is still each card's own content plus the composition's own
  // base gap: the settled spacing spends spare height only.
  const expected = PAGE_BLOCK_MM.heading
    + highlights.reduce((total, highlight) => (
      total + estimateHighlightContentMm(highlight, { compact: true }) + COMPACT_BLOCK_MM.highlightGap
    ), 0);
  assert.equal(estimateHighlightsMm(highlights), expected);
  assert.ok(estimateHighlightsMm(highlights) <= PROJECT_REPORT_PAGE_BUDGET_MM.page);

  // A page that genuinely cannot fit still gives up its weakest story rather than
  // clipping — the fit protection is untouched.
  const oversized = Array.from({ length: 12 }, (_, index) => ({
    id: `oversized-${index}`,
    evidence: [{ key: "P12", level: "L4", value: "116 dBC" }],
    explanation: "x".repeat(300),
  }));
  const fitted = fitHighlightsToBudget(oversized, PROJECT_REPORT_PAGE_BUDGET_MM.page);
  assert.ok(fitted.length >= 1 && fitted.length < oversized.length);
  assert.ok(estimateHighlightsMm(fitted) <= PROJECT_REPORT_PAGE_BUDGET_MM.page);
});

/* ----------------------------------------------------------- *
 * 2 · SYSTEM & PRODUCTS — the geometry table shares the grid
 * ----------------------------------------------------------- */

/** A cell's own text, with its markup stripped: "Front row", "63.1° – 64.6°", "L4". */
function cellText(cell) {
  return String(cell).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * The grid's column tracks, in order. Split at TOP-LEVEL spaces only, so a calc()
 * or minmax() track counts as one — a track's own internal spaces are not separators.
 */
function gridTracks(template) {
  const tracks = [];
  let depth = 0;
  let current = '';
  for (const char of String(template).trim()) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (/\s/.test(char) && depth === 0) {
      if (current) tracks.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) tracks.push(current);
  return tracks;
}

/**
 * The grid's DIRECT children, in document order — the cells each row contributes.
 * A depth scan, not a pattern match, so a cell holding markup is still one cell.
 */
function gridCells(section) {
  const open = section.search(/<div style="[^"]*display:grid/);
  assert.ok(open > -1, 'the geometry table declares its own grid');
  const body = section.slice(open);
  const re = /<div\b[^>]*>|<\/div>/g;
  const cells = [];
  let depth = 0;
  let start = 0;
  let match;
  while ((match = re.exec(body))) {
    if (match[0].startsWith('</')) {
      if (depth === 2) cells.push(body.slice(start, re.lastIndex));
      depth -= 1;
      if (depth === 0) break;
    } else {
      depth += 1;
      if (depth === 2) start = match.index;
    }
  }
  return cells;
}

test("the geometry table is ONE grid of FOUR tracks, matching the cells each row contributes", () => {
  const section = geometrySection(renderPage3(true));

  // One grid holds the whole table — headings and both rows — so every row is laid
  // out by the same columns.
  assert.equal((section.match(/display:grid/g) || []).length, 1, 'one grid lays out the whole table');

  const template = section.match(/grid-template-columns:([^;"]+)/);
  assert.ok(template, 'the table states its own column tracks');
  const trackCount = gridTracks(template[1]).length;

  const cells = gridCells(section);
  const rowCount = cells.length / 4;
  assert.equal(cells.length % 4, 0, 'every row contributes the same four cells');
  assert.equal(rowCount, 3, 'one heading row and one row per seating row');

  // THE INVARIANT THIS REGRESSION BROKE: a track count larger than the cells a row
  // contributes leaves a spare track, and the next row's first cell is pulled up
  // into the row above. The two must match exactly.
  assert.equal(trackCount, 4, `four tracks for Row, Seats, Viewing angle, RP23 (found ${trackCount})`);
  assert.equal(trackCount, cells.length / rowCount, 'the tracks match the cells a row contributes');

  // The four headings read in column order…
  assert.deepEqual(cells.slice(0, 4).map(cellText), ['Row', 'Seats', 'Viewing angle', 'RP23']);

  // …and each row states its own four cells in that same order — label, seats,
  // viewing angle, RP23 — so no value can sit under another column's heading and
  // no row can be split across two lines.
  assert.deepEqual(cells.slice(4, 8).map(cellText).slice(0, 3), ['Front row', '2', '63.1° – 64.6°']);
  assert.match(cellText(cells[7]), /L4/);
  assert.deepEqual(cells.slice(8, 12).map(cellText).slice(0, 3), ['Rear row', '1', '45.0°']);
  assert.match(cellText(cells[11]), /L1/);

  // The columns are aligned to the schedule's own, and stated from it: the row name
  // stands in the schedule's Role column at the schedule's own column gap, so SEATS
  // begins exactly where MODEL & QUANTITY begins; the seats column then stops two
  // gaps short of the schedule's engineering-link column, so VIEWING ANGLE begins on
  // that column's own left edge; RP23 is sized by its content and right-aligned, so
  // the table ends on the schedule's right boundary.
  const [rowTrack, seatsTrack, angleTrack, rp23Track] = gridTracks(template[1]);
  assert.equal(rowTrack, '34mm', "the row name column is the schedule's role column");
  assert.equal(
    seatsTrack,
    'calc(100% - 34mm - 58mm - 24px)',
    'seats runs from the schedule’s MODEL & QUANTITY column to its engineering-link column',
  );
  assert.equal(angleTrack, 'minmax(0, 1fr)', 'the angle column takes what the RP23 column leaves');
  assert.equal(rp23Track, 'auto', 'RP23 is sized by its own content, flush with the right edge');
  assert.match(section, /gap:2mm 12px/, "the table uses the schedule's own column gap");

  const screenPage = geometrySection(renderPage3(false));
  const screenTemplate = screenPage.match(/grid-template-columns:([^;"]+)/);
  assert.ok(screenTemplate, 'the screen table states its own column tracks');
  const [screenRowTrack, screenSeatsTrack, screenAngleTrack, screenRp23Track] = gridTracks(screenTemplate[1]);
  assert.equal(screenRowTrack, '150px');
  assert.equal(screenSeatsTrack, 'calc(100% - 150px - 240px - 24px)');
  assert.equal(screenAngleTrack, 'minmax(0, 1fr)');
  assert.equal(screenRp23Track, 'auto');
  assert.match(screenPage, /gap:8px 12px/, "the screen table uses the schedule's own column gap");

  // The schedule itself is untouched — the very columns the geometry table reads.
  assert.match(renderPage3(true), /width:34mm/, 'the schedule still uses the 34mm role column');
  assert.match(renderPage3(true), /width:58mm/, "the schedule's engineering-link column is unchanged");
  assert.match(renderPage3(false), /width:240px/, "the schedule's screen engineering-link column is unchanged");
});

test("the RP23 column ends on the schedule's right edge, and the other columns read left-aligned", () => {
  const section = geometrySection(renderPage3(true));

  // Only the RP23 column is right-aligned — its heading and each row's pill — so
  // the table ends on the same right boundary as the specification above it.
  assert.equal((section.match(/text-align:right/g) || []).length, 3);
  assert.match(section, /<div style="[^"]*text-align:right[^"]*">RP23<\/div>/);
  assert.doesNotMatch(section, /text-align:right[^>]*>(?:(?!<\/div>).)*Seats/s);
  assert.doesNotMatch(section, /text-align:right[^"]*">Viewing angle/);

  // Both rows' own RP23 results render in that one column, as the canonical pill.
  assert.match(section, /text-align:right[^>]*>(?:(?!<\/div>).)*L4/s);
  assert.match(section, /text-align:right[^>]*>(?:(?!<\/div>).)*L1/s);
});

test("the geometry table's values and typography are unchanged", () => {
  const printMarkup = geometrySection(renderPage3(true));

  // The same stated values, the same heading typography, the same row labels.
  assert.ok(printMarkup.includes("64.6"), "the front row's angle is unchanged");
  assert.ok(printMarkup.includes("45.0"), "the rear row's angle is unchanged");
  assert.ok(printMarkup.includes("letter-spacing:0.08em"), "the heading typography is unchanged");
  assert.ok(printMarkup.includes("text-transform:uppercase"));
  assert.doesNotMatch(printMarkup, /\bL[1-4]\b(?!<\/span>)/, "no row prints its level as plain text");
});

/* --------------------------------------------------- *
 * 3 · REPORT NUMBER FORMATTING — no exposed floats
 * --------------------------------------------------- */

test("P18 is stated as the RP22 whole-Hz result, on both pages, from the same published row as its level", () => {
  // The evidence carries the raw calculated figure…
  const rawRow = engineeringSummary.roomResultsByParameter?.[18] ?? engineeringSummary.roomResultsByParameter?.["18"];
  assert.ok(rawRow, "the publication carries a P18 row");
  assert.match(String(rawRow.value), /^\d+\.\d{6,}$/, "the published figure is the raw calculated result");

  // …and the report states it by its own convention: the whole-Hz result.
  assert.equal(statedSummaryValue(engineeringSummary, 18), "16 Hz");

  const page2 = renderPage2(buildAdiDesignHighlights(sources));
  const page3 = renderPage3(true);

  assert.match(page2, /Extension to 16 Hz/, "page 2 states the whole-Hz result");
  assert.match(page3, /Extension to 16 Hz/, "page 3 states the whole-Hz result");
  for (const [name, markup] of [["page 2", page2], ["page 3", page3]]) {
    assert.ok(!markup.includes(String(rawRow.value)), `${name} never prints the raw calculated figure`);
    assert.doesNotMatch(markup, /\d+\.\d{6,}/, `${name} exposes no floating-point value`);
  }

  // The level beside the value is untouched — only the number's presentation moved.
  const connection = buildSpecificationConnections({
    productsSelected: PRODUCTS,
    engineeringSummary,
    dolbyConfig: sources.dolbyConfig,
  });
  const p18Line = connection.subwoofers.find((line) => String(line.parameter).includes("P18"));
  assert.equal(p18Line.level, "L3");
  assert.match(p18Line.text, /16 Hz/);
});

test("a published figure already stated whole is left exactly as it is — no universal rounding rule", () => {
  // A whole published figure keeps the publication's own value…
  assert.equal(statedParameterValue({ value: 116, valueText: "116 dBC" }, 12), "116");
  assert.equal(statedParameterValue({ value: 108, formatted: "108 dBC" }, 13), "108");
  // …and only a fractional calculated figure is restated as its own published text.
  assert.equal(statedParameterValue({ value: 116.42, valueText: "116 dBC" }, 12), "116 dBC");
  // The whole-Hz floor belongs to P18 alone: no other parameter is floored, and
  // each keeps its own existing display convention.
  assert.equal(statedParameterValue({ value: 24.38521520063696, valueText: "24 Hz" }, 18), "24 Hz");
  assert.equal(statedParameterValue({ value: 47.8123, valueText: "48°" }, 7), "48°");

  // The published connection lines keep the values they always stated.
  const connection = buildSpecificationConnections({
    productsSelected: PRODUCTS,
    engineeringSummary,
    dolbyConfig: sources.dolbyConfig,
  });
  assert.match(connection.lcr[0].text, /116/);
  assert.match(connection.surrounds[0].text, /108/);
});

test("the bass-response deviation is restated by the publication's own display convention", () => {
  // The publication states its results as room results, keyed by parameter.
  const rawRow = engineeringSummary.roomResultsByParameter?.P19
    ?? engineeringSummary.roomResultsByParameter?.[19];
  assert.ok(rawRow, "the publication carries a P19 row");
  assert.match(String(rawRow.value), /^\d+\.\d{6,}$/, "the stored ratio is a raw calculated figure");
  assert.equal(statedSummaryValue(engineeringSummary, 19), "±0 dB");

  // A story resting on that result states the published convention, in its copy
  // and in its evidence, and keeps its level and its identity.
  const published = statePublishedValues({
    id: "reference-seat-bass",
    sources: ["P19"],
    evidence: [{ key: "P19", level: "L4", value: String(rawRow.value) }],
    explanation: `the corrected response sits ${rawRow.value} of the design target at the reference seating position.`,
  }, engineeringSummary);

  assert.equal(published.evidence[0].level, "L4");
  assert.equal(published.evidence[0].value, "±0 dB");
  assert.match(published.explanation, /sits ±0 dB of the design target/);
  assert.ok(!published.explanation.includes(String(rawRow.value)));
});

test("a stated figure that already carries its own unit is never written twice", () => {
  const alreadyStated = statePublishedValues({
    id: "dynamic-capability",
    sources: ["P12", "P13"],
    evidence: [{ key: "P12", level: "L4", value: "116 dBC" }],
    explanation: "the system reaches 116 dBC and 108 dBC across the seats.",
  }, engineeringSummary);

  assert.equal(alreadyStated.evidence[0].value, "116 dBC");
  assert.match(alreadyStated.explanation, /116 dBC and 108 dBC/);
  assert.doesNotMatch(alreadyStated.explanation, /dBC dBC/);
});