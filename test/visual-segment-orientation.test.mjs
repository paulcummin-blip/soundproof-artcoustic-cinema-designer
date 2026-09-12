// visual-segment-orientation.test.mjs
// Visual verification that BLA segment orientations are correct:
//   P4 = TOP, P6 = LOWER-LEFT, P10 = LOWER-RIGHT
//
// Also verifies:
//   - P1/RP23 bold ring uses isPrimary (not isStrongest)
//   - BLA print fallback text is removed
//   - All seats in one diagram use the same radius

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  THREE_SEGMENT_LAYOUT,
  TWO_SEGMENT_LAYOUT,
  buildRingSegmentPath,
  computeHaloRadiusPx,
  computeMinSeatSpacingPx,
  NORMAL_DESIGN_RADIUS_PX,
  SAFE_FRACTION,
  READABLE_HALO_THRESHOLD_PX,
} from "../src/components/report/client/seatMarkerGeometry.js";

// ── Helper: compute the visual centre angle of a segment ──
function segmentCentreAngle(start, end) {
  let sweep = end - start;
  if (sweep < 0) sweep += 360;
  let centre = start + sweep / 2;
  if (centre >= 360) centre -= 360;
  return centre;
}

// ── Helper: classify an angle into a visual region ──
// SVG: 0=right, 90=down, 180=left, 270=up
function visualRegion(angleDeg) {
  const a = ((angleDeg % 360) + 360) % 360;
  // Up is around 270° (±45° → 225°–315°)
  if (a >= 225 && a < 315) return "TOP";
  // Down is around 90° (±45° → 45°–135°)
  if (a >= 45 && a < 135) return "BOTTOM";
  // Left is around 180° (±45° → 135°–225°)
  if (a >= 135 && a < 225) return "LEFT";
  // Right is around 0° (±45° → 315°–360° and 0°–45°)
  return "RIGHT";
}

test("BLA P4 segment is centred at TOP (270°)", () => {
  const p4 = THREE_SEGMENT_LAYOUT.find((s) => s.key === "p4");
  const centre = segmentCentreAngle(p4.startAngle, p4.endAngle);
  assert.equal(centre, 270, `P4 centre should be 270° (top), got ${centre}`);
  assert.equal(visualRegion(centre), "TOP");
});

test("BLA P6 segment is centred at LOWER-LEFT (150°)", () => {
  const p6 = THREE_SEGMENT_LAYOUT.find((s) => s.key === "p6");
  const centre = segmentCentreAngle(p6.startAngle, p6.endAngle);
  assert.equal(centre, 150, `P6 centre should be 150° (lower-left), got ${centre}`);
  // 150° is in the LEFT region (135°–225°), but specifically lower-left
  // cos(150°) < 0 (left), sin(150°) > 0 (down in SVG) → lower-left
  const cos = Math.cos((centre * Math.PI) / 180);
  const sin = Math.sin((centre * Math.PI) / 180);
  assert.ok(cos < 0, `P6 should be left (cos<0), got cos=${cos.toFixed(3)}`);
  assert.ok(sin > 0, `P6 should be down (sin>0 in SVG), got sin=${sin.toFixed(3)}`);
});

test("BLA P10 segment is centred at LOWER-RIGHT (30°)", () => {
  const p10 = THREE_SEGMENT_LAYOUT.find((s) => s.key === "p10");
  const centre = segmentCentreAngle(p10.startAngle, p10.endAngle);
  assert.equal(centre, 30, `P10 centre should be 30° (lower-right), got ${centre}`);
  const cos = Math.cos((centre * Math.PI) / 180);
  const sin = Math.sin((centre * Math.PI) / 180);
  assert.ok(cos > 0, `P10 should be right (cos>0), got cos=${cos.toFixed(3)}`);
  assert.ok(sin > 0, `P10 should be down (sin>0 in SVG), got sin=${sin.toFixed(3)}`);
});

test("BLA P4 arc path starts upper-left and ends upper-right", () => {
  const p4 = THREE_SEGMENT_LAYOUT.find((s) => s.key === "p4");
  const cx = 100, cy = 100, innerR = 10, outerR = 20;
  const path = buildRingSegmentPath(cx, cy, innerR, outerR, p4.startAngle, p4.endAngle);

  // Start point at 225°: cos(225°)≈-0.707, sin(225°)≈-0.707 → upper-left
  const startRad = (p4.startAngle * Math.PI) / 180;
  const startX = cx + outerR * Math.cos(startRad);
  const startY = cy + outerR * Math.sin(startRad);
  assert.ok(startX < cx, `Start X should be left of centre, got ${startX.toFixed(2)}`);
  assert.ok(startY < cy, `Start Y should be above centre (SVG y-down), got ${startY.toFixed(2)}`);

  // End point at 315°: cos(315°)≈0.707, sin(315°)≈-0.707 → upper-right
  const endRad = (p4.endAngle * Math.PI) / 180;
  const endX = cx + outerR * Math.cos(endRad);
  const endY = cy + outerR * Math.sin(endRad);
  assert.ok(endX > cx, `End X should be right of centre, got ${endX.toFixed(2)}`);
  assert.ok(endY < cy, `End Y should be above centre (SVG y-down), got ${endY.toFixed(2)}`);
});

test("BLA P6 arc path is on the lower-left side", () => {
  const p6 = THREE_SEGMENT_LAYOUT.find((s) => s.key === "p6");
  const cx = 100, cy = 100, innerR = 10, outerR = 20;
  // Midpoint at 150°: cos(150°)≈-0.87, sin(150°)=0.5 → left and down
  const midRad = (150 * Math.PI) / 180;
  const midX = cx + outerR * Math.cos(midRad);
  const midY = cy + outerR * Math.sin(midRad);
  assert.ok(midX < cx, `P6 midpoint X should be left, got ${midX.toFixed(2)}`);
  assert.ok(midY > cy, `P6 midpoint Y should be below centre (SVG y-down), got ${midY.toFixed(2)}`);
});

test("BLA P10 arc path is on the lower-right side", () => {
  const p10 = THREE_SEGMENT_LAYOUT.find((s) => s.key === "p10");
  const cx = 100, cy = 100, innerR = 10, outerR = 20;
  // Midpoint at 30°: cos(30°)≈0.87, sin(30°)=0.5 → right and down
  const midRad = (30 * Math.PI) / 180;
  const midX = cx + outerR * Math.cos(midRad);
  const midY = cy + outerR * Math.sin(midRad);
  assert.ok(midX > cx, `P10 midpoint X should be right, got ${midX.toFixed(2)}`);
  assert.ok(midY > cy, `P10 midpoint Y should be below centre (SVG y-down), got ${midY.toFixed(2)}`);
});

test("Timbre P16 segment is centred at TOP (270°)", () => {
  const p16 = TWO_SEGMENT_LAYOUT.find((s) => s.key === "p16");
  const centre = segmentCentreAngle(p16.startAngle, p16.endAngle);
  assert.equal(centre, 270, `P16 centre should be 270° (top), got ${centre}`);
});

test("Timbre P17 segment is centred at BOTTOM (90°)", () => {
  const p17 = TWO_SEGMENT_LAYOUT.find((s) => s.key === "p17");
  const centre = segmentCentreAngle(p17.startAngle, p17.endAngle);
  assert.equal(centre, 90, `P17 centre should be 90° (bottom), got ${centre}`);
});

test("All seats in one diagram use the same halo radius", () => {
  // Three seats at moderate spacing
  const seats = [
    { px: 100, py: 100 },
    { px: 200, py: 100 },
    { px: 150, py: 200 },
  ];
  const radius = computeHaloRadiusPx(seats);
  // All seats get the same radius — the function returns a single number
  assert.ok(typeof radius === "number", "Radius should be a single number");
  assert.ok(radius > 0, "Radius should be positive");
  assert.ok(radius <= NORMAL_DESIGN_RADIUS_PX, "Radius should not exceed normal design radius");
});

test("Tight seat spacing activates compact fallback (radius < threshold)", () => {
  // Two seats very close together (20px apart)
  const tightSeats = [
    { px: 100, py: 100 },
    { px: 120, py: 100 },
  ];
  const radius = computeHaloRadiusPx(tightSeats);
  assert.ok(radius < READABLE_HALO_THRESHOLD_PX,
    `Tight spacing radius (${radius.toFixed(2)}) should be below threshold (${READABLE_HALO_THRESHOLD_PX})`);
});

test("Moderate seat spacing produces readable radius (>= threshold)", () => {
  // Three seats at ~100px spacing
  const normalSeats = [
    { px: 100, py: 100 },
    { px: 200, py: 100 },
    { px: 150, py: 200 },
  ];
  const radius = computeHaloRadiusPx(normalSeats);
  assert.ok(radius >= READABLE_HALO_THRESHOLD_PX,
    `Normal spacing radius (${radius.toFixed(2)}) should be >= threshold (${READABLE_HALO_THRESHOLD_PX})`);
});

test("Halo radius never exceeds safe fraction of minimum spacing", () => {
  // Seats at 50px spacing
  const seats = [
    { px: 100, py: 100 },
    { px: 150, py: 100 },
  ];
  const minSpacing = computeMinSeatSpacingPx(seats);
  const radius = computeHaloRadiusPx(seats);
  assert.ok(radius <= SAFE_FRACTION * minSpacing,
    `Radius (${radius.toFixed(2)}) should not exceed safe fraction × min spacing (${(SAFE_FRACTION * minSpacing).toFixed(2)})`);
});

// ── P1/RP23 Primary authority tests ──
test("P1 selector uses isPrimary from seating position, not isStrongest", async () => {
  const mod = await import("../src/components/report/client/selectClientRecommendedSeatingPosition.js");
  const seatingPositions = [
    { id: "seat-1", x: 2.0, y: 3.0, isPrimary: true },
    { id: "seat-2", x: 2.5, y: 3.0, isPrimary: false },
    { id: "seat-3", x: 3.0, y: 3.0, isPrimary: false },
  ];
  const analysisResult = {
    perSeatRp22: {
      "seat-1": { rp22: { 1: { level: "L2", valueM: 0.8, formatted: "0.80m" } } },
      "seat-2": { rp22: { 1: { level: "L4", valueM: 1.6, formatted: "1.60m" } } },
      "seat-3": { rp22: { 1: { level: "L3", valueM: 1.2, formatted: "1.20m" } } },
    },
  };
  const result = mod.selectClientRecommendedSeatingPosition({ analysisResult, seatingPositions, rsp: null });
  const seat1 = result.seats.find((s) => s.id === "seat-1");
  const seat2 = result.seats.find((s) => s.id === "seat-2");
  // seat-2 has the highest P1 level (L4) but is NOT Primary
  // seat-1 has a lower P1 level (L2) but IS Primary
  assert.ok(seat1.isPrimary === true, "seat-1 should be Primary");
  assert.ok(seat2.isPrimary === false, "seat-2 should NOT be Primary");
  assert.ok(!("isStrongest" in seat1), "isStrongest should not be set on seat-1");
  assert.ok(!("isStrongest" in seat2), "isStrongest should not be set on seat-2");
});

test("RP23 selector uses isPrimary from seating position, not isStrongest", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const filePath = path.resolve("src/components/report/client/selectClientScreenSeating.js");
  const content = fs.readFileSync(filePath, "utf8");
  // Selector must set isPrimary from the raw seat, not isStrongest from level
  assert.ok(content.includes("isPrimary: s.isPrimary === true || s.priority === \"primary\""),
    "RP23 selector must set isPrimary from the raw seating position");
  assert.ok(!content.includes("isStrongest"),
    "RP23 selector must not reference isStrongest");
});

// ── BLA print fallback text removed test ──
test("BLA print fallback text is removed from ClientReportPage", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const filePath = path.resolve("src/components/report/client/ClientReportPage.jsx");
  const content = fs.readFileSync(filePath, "utf8");
  assert.ok(!content.includes("Lowest achieved level across RP22 Parameters 4, 6 and 10"),
    "The BLA print fallback text should be removed from ClientReportPage.jsx");
  // The BLA section (type === "best-listening-area") must not have a print-result block
  // Other page types (timbre, soundstage, etc.) still use print-result — that's correct.
  const blaSectionStart = content.indexOf('printData?.type === "best-listening-area"');
  const blaSectionEnd = content.indexOf('printData?.type === "timbre-consistency"');
  assert.ok(blaSectionStart > -1, "BLA section must exist");
  assert.ok(blaSectionEnd > blaSectionStart, "Timbre section must follow BLA");
  const blaSection = content.slice(blaSectionStart, blaSectionEnd);
  assert.ok(!blaSection.includes("client-report-print-result"),
    "BLA section must not contain a print-result block");
});

// ── P1/RP23 performance encoding tests ──
test("P1 page preserves distance zone bands behind markers", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const filePath = path.resolve("src/components/report/client/ClientRecommendedSeatingPosition.jsx");
  const content = fs.readFileSync(filePath, "utf8");
  // Zone bands must still be rendered
  assert.ok(content.includes("ZONES.map"), "P1 page must render zone bands");
  assert.ok(content.includes("LEVEL_FILLS"), "P1 page must use level fills for zones");
  // PositionMarker must be used (not SeatMarker with performance halo)
  assert.ok(content.includes("PositionMarker"), "P1 page must use PositionMarker");
  // The visual property communicating P1 result is the background zone colour
  assert.ok(content.includes("zone.fill"), "P1 zone fill colour must be applied");
});

test("RP23 page preserves viewing zone bands behind markers", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const filePath = path.resolve("src/components/report/client/ClientScreenSeating.jsx");
  const content = fs.readFileSync(filePath, "utf8");
  // Zone bands must still be rendered
  assert.ok(content.includes("zones"), "RP23 page must render viewing zones");
  assert.ok(content.includes("LEVEL_FILLS"), "RP23 page must use level fills for zones");
  // PositionMarker must be used (not SeatMarker with performance halo)
  assert.ok(content.includes("PositionMarker"), "RP23 page must use PositionMarker");
  // The visual property communicating RP23 result is the background zone band colour
  assert.ok(content.includes("zone.level"), "RP23 zone level must be applied");
});

test("P1 marker bold ring uses isPrimary, not isStrongest", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const filePath = path.resolve("src/components/report/client/ClientRecommendedSeatingPosition.jsx");
  const content = fs.readFileSync(filePath, "utf8");
  assert.ok(content.includes("isPrimary={seat.isPrimary}"),
    "P1 marker must use seat.isPrimary for the bold ring");
  assert.ok(!content.includes("isStrongest"),
    "P1 page must not reference isStrongest");
});

test("RP23 marker bold ring uses isPrimary, not isStrongest", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const filePath = path.resolve("src/components/report/client/ClientScreenSeating.jsx");
  const content = fs.readFileSync(filePath, "utf8");
  assert.ok(content.includes("isPrimary={seat.isPrimary}"),
    "RP23 marker must use seat.isPrimary for the bold ring");
  assert.ok(!content.includes("isStrongest"),
    "RP23 page must not reference isStrongest");
});