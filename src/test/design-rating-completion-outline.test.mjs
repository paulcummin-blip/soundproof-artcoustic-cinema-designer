/**
 * design-rating-completion-outline.test.mjs
 * -----------------------------------------
 * Headless render proof for the Design Rating completion outline.
 *
 * The card's own published floors build the pills (real floor authority); the
 * canonical completeness authority decides which section is outlined. The
 * outline is 2px muted red (#9A5A52) and outline-only: the pill's own fill and
 * level colour are untouched, and no text, icon or warning is added.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getCategoryFloorSummaries } from "../components/report/technical/designRatingPresentation.js";

// The Design Rating card pulls in UI primitives (the tooltip) that read
// `window` at module load. Node has no window, so provide the minimal browser
// globals and import the card after them.
globalThis.window = globalThis.window || {
  self: {},
  top: {},
  addEventListener() {},
  removeEventListener() {},
  location: { href: "http://localhost/", pathname: "/", search: "" },
  matchMedia: () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }),
};
globalThis.document = globalThis.document || {
  documentElement: { dataset: {}, style: {}, classList: { add() {}, remove() {} } },
  body: { appendChild() {}, removeChild() {}, style: {} },
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {} }),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
};

const { default: DesignRatingSummary } = await import("../components/pricing/DesignRatingSummary.jsx");

const OUTLINE = "#9A5A52";
const LABELS = ["Spatial Resolution", "Dynamic Range", "Timbre Matching", "Screen / Viewing Geometry"];
const SEAT_IDS = ["seat-r1-c1", "seat-r1-c2"];
const SEAT_SCOPED_KEYS = ["p1", "p4", "p5", "p6", "p9", "p10", "p16", "p17", "p20"];
const ROOM_SCOPED_KEYS = ["p2", "p3", "p7", "p8", "p11", "p12", "p13", "p14", "p15", "p18", "p19", "p21"];

// One scored contribution per section, so every section renders its own pill.
const L3_CONTRIBUTIONS = [
  { key: "p1", parameter: 1, resultLevel: "L3", effectiveWeight: 6 },
  { key: "p2", parameter: 2, resultLevel: "L3", effectiveWeight: 8 },
  { key: "p5", parameter: 5, resultLevel: "L3", effectiveWeight: 6 },
  { key: "p13", parameter: 13, resultLevel: "L3", effectiveWeight: 7 },
  { key: "p17", parameter: 17, resultLevel: "L3", effectiveWeight: 5 },
  { key: "p18", parameter: 18, resultLevel: "L3", effectiveWeight: 12 },
  { key: "screen", parameter: "screen", resultLevel: "L3", effectiveWeight: 7 },
];

const L4_CONTRIBUTIONS = L3_CONTRIBUTIONS.map((c) => ({ ...c, resultLevel: "L4" }));
const L1_CONTRIBUTIONS = L3_CONTRIBUTIONS.map((c) => ({ ...c, resultLevel: "L1" }));

function seatTerminal(level = "L3") {
  return {
    scope: "seat",
    state: "scored",
    level: null,
    seats: Object.fromEntries(SEAT_IDS.map((id) => [id, { state: "scored", level }])),
  };
}

function parameterAuthority(overrides = {}, level = "L3") {
  const authority = {};
  for (const key of ROOM_SCOPED_KEYS) authority[key] = { key, scope: "room", state: "scored", level };
  for (const key of SEAT_SCOPED_KEYS) authority[key] = { key, ...seatTerminal(level) };
  authority.screen = { key: "screen", ...seatTerminal(level) };
  return { ...authority, ...overrides };
}

function scopeSummary(contributions, designPerformanceIndex) {
  const rating = { status: "COMPLETE", contributions };
  return {
    designPerformanceIndex,
    rating,
    categories: getCategoryFloorSummaries(rating),
  };
}

function makeSummary({
  contributions = L3_CONTRIBUTIONS,
  overrides = {},
  indices = { primary: 42, secondary: 30, all: 51 },
} = {}) {
  return {
    parameterAuthority: parameterAuthority(overrides),
    seatHudById: {},
    primary: scopeSummary(contributions, indices.primary),
    secondary: scopeSummary(contributions, indices.secondary),
    project: {
      seatIds: SEAT_IDS,
      designPerformanceIndex: indices.all,
      rating: { status: "COMPLETE", contributions },
    },
  };
}

/** Render the card and split its markup into one block per section. */
function renderSectionBlocks(summary) {
  const html = renderToStaticMarkup(
    React.createElement(DesignRatingSummary, { showAsdr: true, engineeringSummary: summary }),
  );
  const starts = LABELS.map((label) => html.indexOf(label));
  for (let i = 0; i < LABELS.length; i += 1) assert.ok(starts[i] >= 0, `${LABELS[i]} is missing`);
  const blocks = {};
  LABELS.forEach((label, i) => {
    blocks[label] = html.slice(starts[i], i + 1 < LABELS.length ? starts[i + 1] : html.length);
  });
  return { html, blocks };
}

const outlines = (block) => block.split(OUTLINE).length - 1;

test("incomplete Spatial Resolution outlines both Spatial pills and nothing else", () => {
  const { blocks } = renderSectionBlocks(
    makeSummary({
      overrides: { p5: { key: "p5", scope: "seat", state: "provisional", level: null, seats: {} } },
    }),
  );
  assert.equal(outlines(blocks["Spatial Resolution"]), 2); // Primary + Secondary
  assert.equal(outlines(blocks["Dynamic Range"]), 0);
  assert.equal(outlines(blocks["Timbre Matching"]), 0);
  assert.equal(outlines(blocks["Screen / Viewing Geometry"]), 0);
});

test("incomplete Dynamic Range outlines only the Dynamic Range pills", () => {
  const { blocks } = renderSectionBlocks(
    makeSummary({ overrides: { p13: { key: "p13", scope: "room", state: "provisional", level: null } } }),
  );
  assert.equal(outlines(blocks["Dynamic Range"]), 2);
  assert.equal(outlines(blocks["Spatial Resolution"]), 0);
  assert.equal(outlines(blocks["Timbre Matching"]), 0);
  assert.equal(outlines(blocks["Screen / Viewing Geometry"]), 0);
});

test("incomplete Timbre Matching outlines only the Timbre pills", () => {
  const { blocks } = renderSectionBlocks(
    makeSummary({ overrides: { p18: { key: "p18", scope: "room", state: "provisional", level: null } } }),
  );
  assert.equal(outlines(blocks["Timbre Matching"]), 2);
  assert.equal(outlines(blocks["Spatial Resolution"]), 0);
  assert.equal(outlines(blocks["Dynamic Range"]), 0);
  assert.equal(outlines(blocks["Screen / Viewing Geometry"]), 0);
});

test("incomplete Screen / Viewing Geometry outlines only the RP23 pills", () => {
  const { blocks } = renderSectionBlocks(
    makeSummary({
      overrides: {
        screen: {
          key: "screen",
          scope: "seat",
          state: "scored",
          level: null,
          seats: {
            "seat-r1-c1": { state: "scored", level: "L3" },
            "seat-r1-c2": { state: "provisional", level: null },
          },
        },
      },
    }),
  );
  assert.equal(outlines(blocks["Screen / Viewing Geometry"]), 2);
  assert.ok(blocks["Screen / Viewing Geometry"].includes("RP23 L3"));
  assert.equal(outlines(blocks["Spatial Resolution"]), 0);
  assert.equal(outlines(blocks["Dynamic Range"]), 0);
  assert.equal(outlines(blocks["Timbre Matching"]), 0);
});

test("the outline is 2px and outline-only: fill and level colour are unchanged", () => {
  const { blocks } = renderSectionBlocks(
    makeSummary({
      overrides: { p5: { key: "p5", scope: "seat", state: "provisional", level: null, seats: {} } },
    }),
  );
  const block = blocks["Spatial Resolution"];
  assert.ok(block.includes("outline:2px solid #9A5A52"));
  assert.ok(!block.includes("warning"));
  // The L3 pill token is intact: same fill, same level border, same label.
  assert.ok(block.includes("background:#EDEEEF"));
  assert.ok(block.includes("border:1px solid #7B8088"));
  assert.ok(block.includes(">L3</span>"));
});

test("a completed assessment carries no outline and its values are unchanged", () => {
  const { html, blocks } = renderSectionBlocks(makeSummary());
  for (const label of LABELS) assert.equal(outlines(blocks[label]), 0);
  assert.ok(!html.includes(OUTLINE));
  // Design Performance Index values pass through untouched.
  assert.ok(html.includes("Design Performance Index 42"));
  assert.ok(html.includes("Design Performance Index 30"));
  assert.ok(html.includes("Design Performance Index 51"));
});

test("a completed L1 section remains normal, with no outline", () => {
  const { html, blocks } = renderSectionBlocks(makeSummary({ contributions: L1_CONTRIBUTIONS }));
  for (const label of LABELS) assert.equal(outlines(blocks[label]), 0);
  assert.ok(html.includes(">L1</span>"));
  assert.ok(html.includes("no lower than"));
});

test("an incomplete provisional L4 still shows the outline", () => {
  const { blocks } = renderSectionBlocks(
    makeSummary({
      contributions: L4_CONTRIBUTIONS,
      overrides: { p5: { key: "p5", scope: "seat", state: "provisional", level: null, seats: {} } },
    }),
  );
  assert.equal(outlines(blocks["Spatial Resolution"]), 2);
  assert.ok(blocks["Spatial Resolution"].includes(">L4</span>"));
  assert.equal(outlines(blocks["Timbre Matching"]), 0);
});

test("no explanatory text, icon or warning is added anywhere on the card", () => {
  const { html } = renderSectionBlocks(
    makeSummary({
      overrides: {
        p5: { key: "p5", scope: "seat", state: "provisional", level: null, seats: {} },
        p13: { key: "p13", scope: "room", state: "provisional", level: null },
      },
    }),
  );
  assert.ok(html.includes(OUTLINE)); // the outline is doing the talking
  const lower = html.toLowerCase();
  for (const phrase of [
    "warning", "not complete", "not yet complete", "incomplete", "provisional",
    "not calculated", "pending", "attention", "unfinished", "⚠",
  ]) {
    assert.ok(!lower.includes(phrase), `unexpected copy: ${phrase}`);
  }
});

test("no parameter authority means no outline and no invented incompleteness", () => {
  const { html, blocks } = renderSectionBlocks({
    seatHudById: {},
    primary: scopeSummary(L3_CONTRIBUTIONS, 42),
    secondary: scopeSummary(L3_CONTRIBUTIONS, 30),
    project: { seatIds: SEAT_IDS, designPerformanceIndex: 51, rating: { status: "COMPLETE", contributions: L3_CONTRIBUTIONS } },
  });
  assert.ok(!html.includes(OUTLINE));
  for (const label of LABELS) assert.equal(outlines(blocks[label]), 0);
});