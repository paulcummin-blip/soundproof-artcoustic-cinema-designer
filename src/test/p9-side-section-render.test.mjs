/**
 * p9-side-section-render.test.mjs
 * ------------------------------
 * Headless render proof for both P9 surfaces, on the real Marquee geometry: the
 * screen page (ClientP9Overhead) and the print page (PrintP9Content) must both
 * carry the two-part composition —
 *
 *   TOP    "How P9 is measured": the real section with both seating rows' own
 *          geometry, each labelled with its published result.
 *   BOTTOM "P9 results by seat": every seat's own angle and canonical level.
 *
 * — and one project result panel naming the limiting SEAT. The old single-RSP
 * fan (and its "measured from the RSP" chip) must be gone entirely.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ClientP9Overhead from "../components/report/client/ClientP9Overhead.jsx";
import PrintP9Content from "../components/report/client/print/PrintP9Content.jsx";

const ROOM = { widthM: 5.18, lengthM: 7.29, heightM: 2.8 };
const RSP = { x: 2.59, y: 4.636746034861809, z: 1.2 };

const ROWS = [
  { rowName: "front", rowIndex: 0, avgY: 3.3350529631087165, avgZ: 2.65, roles: ["TFL", "TFR"] },
  { rowName: "mid", rowIndex: 1, avgY: 4.53358458961474, avgZ: 2.65, roles: ["TML", "TMR"] },
  { rowName: "rear", rowIndex: 2, avgY: 5.732116216120764, avgZ: 2.65, roles: ["TRL", "TRR"] },
];

const SEAT_ROWS = [
  {
    y: 3.780110153632747,
    z: 1.2,
    angle: 44.5,
    level: "L4",
    seats: [
      { id: "seat-r1-c1", x: 1.69, priority: "secondary" },
      { id: "seat-r1-c2", x: 2.29, priority: "primary" },
      { id: "seat-r1-c3", x: 2.8899999999999997, priority: "primary" },
      { id: "seat-r1-c4", x: 3.4899999999999998, priority: "secondary" },
    ],
  },
  {
    y: 5.580110153632747,
    z: 1.6,
    angle: 53.1,
    level: "L3",
    seats: [
      { id: "seat-r2-c1", x: 1.39, priority: "secondary" },
      { id: "seat-r2-c2", x: 1.9899999999999998, priority: "secondary" },
      { id: "seat-r2-c3", x: 2.59, priority: "primary" },
      { id: "seat-r2-c4", x: 3.1899999999999995, priority: "secondary" },
      { id: "seat-r2-c5", x: 3.79, priority: "secondary" },
    ],
  },
];

function makeSeats() {
  return SEAT_ROWS.flatMap((row) =>
    row.seats.map((seat) => ({
      id: seat.id,
      x: seat.x,
      y: row.y,
      z: row.z,
      priority: seat.priority,
      isPrimary: seat.priority === "primary",
      p9Level: row.level,
      p9Degrees: row.angle,
      applicable: true,
    })),
  );
}

function makeSnapshot() {
  const upperSpeakers = [];
  const representativeRows = ROWS.map((row) => {
    for (const role of row.roles) {
      upperSpeakers.push({ role, position: { x: 1.2190787269681738, y: row.avgY, z: row.avgZ } });
    }
    return {
      rowName: row.rowName,
      rowIndex: row.rowIndex,
      avgY: row.avgY,
      avgZ: row.avgZ,
      elevDeg: Math.atan2(row.avgZ - RSP.z, row.avgY - RSP.y) * 180 / Math.PI,
    };
  });
  return {
    rsp: RSP,
    earHeightM: 1.2,
    upperSpeakers,
    representativeRows,
    level: "L3",
    value: 53.1424,
    worstGapDeg: 53.1424,
  };
}

const SUMMARY = "All seats achieve L3 overhead speaker spacing.";

function renderScreen() {
  return renderToStaticMarkup(
    React.createElement(ClientP9Overhead, {
      roomDims: ROOM,
      seats: makeSeats(),
      summary: SUMMARY,
      p9Snapshot: makeSnapshot(),
    }),
  );
}

test("screen P9 page explains the geometry from both seating rows, then lists every seat", () => {
  const html = renderScreen();

  // Part one: the geometry explanation.
  assert.ok(html.includes("Spatial Resolution"));
  assert.ok(html.includes("RP22 Parameter 9"));
  assert.ok(html.includes("How P9 is measured"));
  assert.ok(html.includes("FLOOR") && html.includes("CEILING"));
  assert.ok(html.includes("SCREEN") && html.includes("REAR"));
  assert.ok(html.includes("TFL / TFR") && html.includes("TML / TMR") && html.includes("TRL / TRR"));
  // Both seating rows are drawn from their own listening point.
  assert.ok(html.includes("FRONT ROW") && html.includes("REAR ROW"));
  assert.ok(html.includes("FRONT ↔ MIDDLE") && html.includes("MIDDLE ↔ REAR"));
  // Each row carries its published result and canonical level.
  assert.ok(html.includes("44.5°") && html.includes("53.1°"));

  // Part two: every seat with its own angle and level.
  assert.ok(html.includes("P9 results by seat"));
  assert.ok(html.includes(SUMMARY));
  assert.ok(html.includes("Front row · 4 seats") && html.includes("Rear row · 5 seats"));
  assert.equal((html.match(/data-p9-seat=/g) || []).length, 9);
  assert.equal((html.match(/data-p9-priority="primary"/g) || []).length, 3);
  assert.equal((html.match(/data-p9-priority="secondary"/g) || []).length, 6);
  assert.ok(html.includes("Row 1 - Seat 1") && html.includes("Row 2 - Seat 5"));

  // The project result names the limiting SEAT, never the RSP.
  assert.ok(html.includes("Project limiting seat result"));
  assert.ok(html.includes("Maximum vertical angle between adjacent overhead speaker rows."));
  assert.ok(html.includes("Limiting seat: Rear row · Row 2 - Seat 1"));

  // No single-RSP fan, and no RSP wording anywhere on the page.
  assert.ok(!html.includes("RSP"));
  assert.ok(!html.includes("LARGEST ADJACENT GAP"));
  assert.ok(!html.includes("measured from the RSP"));
  assert.ok(!html.includes("45° forward") && !html.includes("90° overhead") && !html.includes("45° rear"));
});

test("print P9 page carries the same two parts and the same limiting result", () => {
  const html = renderToStaticMarkup(
    React.createElement(PrintP9Content, {
      p9Snapshot: makeSnapshot(),
      roomDims: ROOM,
      seats: makeSeats(),
      summary: SUMMARY,
    }),
  );

  assert.ok(html.includes("client-report-print-heading__title"));
  assert.ok(html.includes("How P9 is measured"));
  assert.ok(html.includes("client-report-print-svg"));
  assert.ok(html.includes("FRONT ROW") && html.includes("REAR ROW"));
  assert.ok(html.includes("TFL / TFR") && html.includes("TRL / TRR"));

  assert.ok(html.includes("P9 results by seat"));
  assert.equal((html.match(/data-p9-seat=/g) || []).length, 9);

  // Existing print result card, carrying the seat-scoped project result.
  assert.ok(html.includes("client-report-print-result__badge"));
  assert.ok(html.includes("Project limiting seat result: 53.1° · L3"));
  assert.ok(html.includes("Maximum vertical angle between adjacent overhead speaker rows."));
  assert.ok(!html.includes("RSP"));
});

test("both surfaces render nothing when there is no evidence to draw from", () => {
  const noSeats = renderToStaticMarkup(
    React.createElement(ClientP9Overhead, {
      roomDims: ROOM,
      seats: [],
      summary: SUMMARY,
      p9Snapshot: makeSnapshot(),
    }),
  );
  assert.equal(noSeats, "");

  const noSnapshot = renderToStaticMarkup(
    React.createElement(PrintP9Content, { p9Snapshot: null, roomDims: ROOM, seats: makeSeats() }),
  );
  assert.equal(noSnapshot, "");
});