/**
 * design-rating-section-completeness.test.mjs
 * -------------------------------------------
 * Proves the Design Rating completion outline is driven by the ONE canonical
 * engineering completeness authority — never by a displayed level, the Design
 * Performance Index, or the mere presence of a numeric value.
 *
 * Section membership must match the membership the section pills themselves are
 * built from (the floor authority), so a section's outline can never disagree
 * with the pill it outlines:
 *   Spatial Resolution P1–P11 · Dynamic Range P12–P16 ·
 *   Timbre Matching P17–P21 · Screen / Viewing Geometry RP23.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  assessDesignRatingSectionCompleteness,
  isDesignRatingSectionComplete,
  DESIGN_RATING_SECTIONS,
} from "../components/report/technical/designRatingSectionCompleteness.js";
import { designRatingSectionForParameterKey } from "../components/report/technical/designRatingPresentation.js";

const SEAT_IDS = ["seat-r1-c1", "seat-r1-c2"];
const SEAT_SCOPED_KEYS = ["p1", "p4", "p5", "p6", "p9", "p10", "p16", "p17", "p20"];
// P19 is RSP-scoped in the completeness contract: one published result, not
// per-seat rows.
const ROOM_SCOPED_KEYS = ["p2", "p3", "p7", "p8", "p11", "p12", "p13", "p14", "p15", "p18", "p19", "p21"];

const SECTIONS = [
  "Spatial Resolution", "Dynamic Range", "Timbre Matching", "Screen / Viewing Geometry",
];

function seatTerminal(level = "L3") {
  return {
    scope: "seat",
    state: "scored",
    level: null,
    seats: Object.fromEntries(SEAT_IDS.map((id) => [id, { state: "scored", level }])),
  };
}

/** A fully terminal parameter authority — every RP22 parameter + RP23 screen. */
function parameterAuthority(overrides = {}, level = "L3") {
  const authority = {};
  for (const key of ROOM_SCOPED_KEYS) authority[key] = { key, scope: "room", state: "scored", level };
  for (const key of SEAT_SCOPED_KEYS) authority[key] = { key, ...seatTerminal(level) };
  authority.screen = { key: "screen", ...seatTerminal(level) };
  return { ...authority, ...overrides };
}

function makeSummary({ overrides = {}, level = "L3" } = {}) {
  return {
    parameterAuthority: parameterAuthority(overrides, level),
    seatHudById: {},
    project: { seatIds: SEAT_IDS },
    bassAuthorityCurrent: true,
  };
}

function incompleteSections(summary) {
  return SECTIONS.filter((label) => isDesignRatingSectionComplete(summary, label) === false);
}

test("section membership follows the same categories the pills are built from", () => {
  assert.equal(designRatingSectionForParameterKey("p1"), "Spatial Resolution");
  assert.equal(designRatingSectionForParameterKey("P11"), "Spatial Resolution");
  assert.equal(designRatingSectionForParameterKey("p12"), "Dynamic Range");
  assert.equal(designRatingSectionForParameterKey("p16"), "Dynamic Range");
  assert.equal(designRatingSectionForParameterKey("p17"), "Timbre Matching");
  assert.equal(designRatingSectionForParameterKey("p21"), "Timbre Matching");
  assert.equal(designRatingSectionForParameterKey("screen"), "Screen / Viewing Geometry");
  assert.equal(designRatingSectionForParameterKey("unknown"), null);
  assert.equal(designRatingSectionForParameterKey(null), null);
  assert.deepEqual(DESIGN_RATING_SECTIONS, SECTIONS);
});

test("a fully terminal assessment marks every section complete", () => {
  const summary = makeSummary();
  const assessment = assessDesignRatingSectionCompleteness(summary);
  assert.equal(assessment.available, true);
  assert.equal(assessment.complete, true);
  for (const label of SECTIONS) {
    assert.equal(assessment.sections[label].complete, true);
    assert.deepEqual(assessment.sections[label].incompleteParameterKeys, []);
  }
});

test("only the incomplete section is marked incomplete — Spatial Resolution", () => {
  const summary = makeSummary({
    overrides: { p5: { key: "p5", scope: "seat", state: "provisional", level: null, seats: {} } },
  });
  assert.deepEqual(incompleteSections(summary), ["Spatial Resolution"]);
  const assessment = assessDesignRatingSectionCompleteness(summary);
  assert.ok(assessment.sections["Spatial Resolution"].incompleteParameterKeys.includes("p5"));
  assert.equal(assessment.complete, false);
});

test("only the incomplete section is marked incomplete — Dynamic Range", () => {
  const summary = makeSummary({
    overrides: { p13: { key: "p13", scope: "room", state: "provisional", level: null } },
  });
  assert.deepEqual(incompleteSections(summary), ["Dynamic Range"]);
});

test("only the incomplete section is marked incomplete — Timbre Matching", () => {
  const summary = makeSummary({
    overrides: { p18: { key: "p18", scope: "room", state: "provisional", level: null } },
  });
  assert.deepEqual(incompleteSections(summary), ["Timbre Matching"]);
});

test("only the incomplete section is marked incomplete — Screen / Viewing Geometry", () => {
  // One seat's RP23 viewing angle is still missing while the other is scored.
  const summary = makeSummary({
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
  });
  assert.deepEqual(incompleteSections(summary), ["Screen / Viewing Geometry"]);
});

test("a seat-scope parameter incomplete at one seat marks its own section", () => {
  const summary = makeSummary({
    overrides: {
      p9: {
        key: "p9",
        scope: "seat",
        state: "scored",
        level: null,
        seats: {
          "seat-r1-c1": { state: "scored", level: "L3" },
          "seat-r1-c2": { state: "provisional", level: null },
        },
      },
    },
  });
  assert.deepEqual(incompleteSections(summary), ["Spatial Resolution"]);
});

test("a genuine N/A parameter is terminal and never marks a section incomplete", () => {
  const summary = makeSummary({
    overrides: {
      p7: { key: "p7", scope: "room", state: "na", level: "N/A" },
      p9: {
        key: "p9",
        scope: "seat",
        state: "na",
        level: null,
        seats: {
          "seat-r1-c1": { state: "na", level: "N/A" },
          "seat-r1-c2": { state: "na", level: "N/A" },
        },
      },
    },
  });
  assert.deepEqual(incompleteSections(summary), []);
  assert.equal(assessDesignRatingSectionCompleteness(summary).complete, true);
});

test("completeness is never inferred from the displayed level", () => {
  // Completed L1 everywhere: terminal, so no section is incomplete.
  const allL1 = makeSummary({ level: "L1" });
  assert.deepEqual(incompleteSections(allL1), []);

  // Provisional results showing a strong-looking level are still incomplete.
  const provisionalStrong = makeSummary({
    level: "L4",
    overrides: { p5: { key: "p5", scope: "seat", state: "provisional", level: null, seats: {} } },
  });
  assert.deepEqual(incompleteSections(provisionalStrong), ["Spatial Resolution"]);
});

test("no published parameter authority fails neutral — no outline is invented", () => {
  const noAuthority = assessDesignRatingSectionCompleteness({ project: { seatIds: SEAT_IDS } });
  assert.equal(noAuthority.available, false);
  for (const label of SECTIONS) {
    assert.equal(noAuthority.sections[label].complete, true);
    assert.deepEqual(noAuthority.sections[label].incompleteParameterKeys, []);
  }
  const nullSummary = assessDesignRatingSectionCompleteness(null);
  assert.equal(nullSummary.available, false);
  assert.deepEqual(incompleteSections(null), []);
});

test("the authority is read-only: it changes nothing and computes no score", () => {
  const summary = makeSummary({
    overrides: { p13: { key: "p13", scope: "room", state: "provisional", level: null } },
  });
  const before = JSON.stringify(summary);
  const assessment = assessDesignRatingSectionCompleteness(summary);
  assert.equal(JSON.stringify(summary), before);
  // No rating, index or score is present in the result — only completeness.
  assert.deepEqual(
    Object.keys(assessment).sort(),
    ["available", "complete", "reason", "sections"],
  );
  for (const label of SECTIONS) {
    assert.deepEqual(
      Object.keys(assessment.sections[label]).sort(),
      ["complete", "incompleteParameterKeys"],
    );
  }
});