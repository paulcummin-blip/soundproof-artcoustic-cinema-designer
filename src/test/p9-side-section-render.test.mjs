/**
 * p9-side-section-render.test.mjs
 * ------------------------------
 * Headless render proof for both P9 surfaces, on the real Marquee geometry:
 * the screen page (ClientP9Overhead) and the print page (PrintP9Content) must
 * draw the same true side section, with the real row labels, the adjacent-row
 * angles and the limiting gap — and must no longer show the old nominal
 * "45° forward / 90° overhead / 45° rear" headings.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ClientP9Overhead from "../components/report/client/ClientP9Overhead.jsx";
import PrintP9Content from "../components/report/client/print/PrintP9Content.jsx";

const ROOM = { widthM: 5.18, lengthM: 7.29, heightM: 2.8 };
const RSP = { x: 0, y: 4.636746034861809, z: 1.2 };
const ROWS = [
  { rowName: "front", rowIndex: 0, avgY: 3.3350529631087165, avgZ: 2.65, roles: ["TFL", "TFR"] },
  { rowName: "mid", rowIndex: 1, avgY: 4.53358458961474, avgZ: 2.65, roles: ["TML", "TMR"] },
  { rowName: "rear", rowIndex: 2, avgY: 5.732116216120764, avgZ: 2.65, roles: ["TRL", "TRR"] },
];

function makeSnapshot(level) {
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
      elevDeg: (Math.atan2(row.avgZ - RSP.z, row.avgY - RSP.y) * 180) / Math.PI,
    };
  });
  return {
    rsp: RSP,
    earHeightM: 1.2,
    upperSpeakers,
    representativeRows,
    level,
    value: 44.52121685376999,
    worstGapDeg: 41.138,
  };
}

const SEATS = [
  { id: "seat-r1-c1", x: 1.69, y: 3.780110153632747, isPrimary: false, p9Level: "L4", p9Degrees: 44.5 },
  { id: "seat-r2-c3", x: 2.59, y: 5.5801, isPrimary: true, p9Level: "L3", p9Degrees: 53.1 },
];

function renderScreen(level) {
  return renderToStaticMarkup(
    React.createElement(ClientP9Overhead, {
      roomDims: ROOM,
      seats: SEATS,
      rsp: RSP,
      screenFrontPlaneM: 0.362,
      screenWidthM: 3.2,
      counts: { L4: 4, L3: 5, L2: 0, L1: 0, FAIL: 0, not_assessed: 0 },
      summary: "Overhead spacing levels are shown exactly as published for each seat.",
      placedSpeakers: [],
      p9Snapshot: makeSnapshot(level),
    }),
  );
}

test("screen P9 page draws the real rows, the RSP angles and the limiting gap", () => {
  const html = renderScreen(4);
  assert.ok(html.includes("Spatial Resolution"));
  assert.ok(html.includes("TFL / TFR"));
  assert.ok(html.includes("TML / TMR"));
  assert.ok(html.includes("TRL / TRR"));
  assert.ok(html.includes("FLOOR") && html.includes("CEILING"));
  assert.ok(html.includes("SCREEN") && html.includes("REAR"));
  assert.ok(html.includes("RSP"));
  assert.ok(html.includes("1.20 m ear height"));
  // The two adjacent-row gaps, from the RSP, with only adjacent pairs compared.
  assert.ok(html.includes("FRONT ↔ MIDDLE"));
  assert.ok(html.includes("MIDDLE ↔ REAR"));
  assert.ok(html.includes("38°"));
  assert.ok(html.includes("41°"));
  // The limiting gap is stated, with the published level (level arrives as 4).
  assert.ok(html.includes("LARGEST ADJACENT GAP"));
  assert.ok(html.includes("measured from the RSP"));
  assert.ok(html.includes(">L4<"));
  // The old nominal headings are gone.
  assert.ok(!html.includes("45° forward"));
  assert.ok(!html.includes("90° overhead"));
  assert.ok(!html.includes("45° rear"));
  // The per-seat authority is untouched and still published below the drawing.
  assert.ok(html.includes("P9 Overhead"));
  assert.ok(html.includes("L4 45°"));
  assert.ok(html.includes("L3 53°"));
  // No plan-view seat markers are drawn any more.
  assert.ok(!html.includes("Primary seats"));
});

test("print P9 page draws the same section and keeps its result pill", () => {
  const html = renderToStaticMarkup(
    React.createElement(PrintP9Content, { p9Snapshot: makeSnapshot(4), roomDims: ROOM }),
  );
  assert.ok(html.includes("client-report-print-svg"));
  assert.ok(html.includes("TFL / TFR") && html.includes("TRL / TRR"));
  assert.ok(html.includes("FRONT ↔ MIDDLE") && html.includes("MIDDLE ↔ REAR"));
  assert.ok(html.includes("LARGEST ADJACENT GAP"));
  assert.ok(html.includes(">L4<"));
  // Existing result pill, unchanged.
  assert.ok(html.includes("client-report-print-result__badge"));
  assert.ok(html.includes("Overhead Speaker Spacing"));
  assert.ok(html.includes("44.52121685376999") || html.includes("45° largest gap"));
});

test("both surfaces render without a drawing when the geometry is absent", () => {
  const screen = renderToStaticMarkup(
    React.createElement(ClientP9Overhead, {
      roomDims: ROOM,
      seats: SEATS,
      summary: "summary",
      p9Snapshot: null,
    }),
  );
  assert.ok(screen.includes("Side elevation unavailable"));
  assert.ok(screen.includes("P9 Overhead"));

  const print = renderToStaticMarkup(
    React.createElement(PrintP9Content, { p9Snapshot: null, roomDims: ROOM }),
  );
  assert.equal(print, "");
});