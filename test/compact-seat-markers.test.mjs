/**
 * compact-seat-markers.test.mjs
 * ------------------------------
 * Regression tests for the shared compact spacing-aware seat marker system.
 *
 * Verifies:
 *   A. Minimum pairwise spacing computed correctly
 *   B. Halo radius formula: min(normalDesign, safeFraction × minSpacing)
 *   C. SafeFraction prevents overlap
 *   D. All seats use the same halo radius (uniform size)
 *   E. Wide layout caps at normalDesignRadius
 *   F. Tight-layout fallback does NOT force a minimum radius that creates overlap
 *   G. BLA has exactly 3 fixed semantic segments
 *   H. Timbre has exactly 2 fixed semantic segments
 *   I. buildRingSegmentPath produces valid SVG path strings
 *   J. "Other seating" / "Other seats" removed; "Primary seat" / "Secondary seat" present
 *   K. ZONE_RADIUS_M (0.55) removed from all seat page components
 *   L. BLA editorial explanation paragraph removed
 *   M. getSeatCircleStyle no longer imported by seat page components
 *
 * Run: node --test test/compact-seat-markers.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeMinSeatSpacingPx,
  computeHaloRadiusPx,
  isHaloReadable,
  buildRingSegmentPath,
  THREE_SEGMENT_LAYOUT,
  TWO_SEGMENT_LAYOUT,
  THREE_SEGMENT_LEGEND,
  TWO_SEGMENT_LEGEND,
  NORMAL_DESIGN_RADIUS_PX,
  SAFE_FRACTION,
  READABLE_HALO_THRESHOLD_PX,
} from "../src/components/report/client/seatMarkerGeometry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, "../src/components/report/client");

// ── A: minimum pairwise spacing ────────────────────────────────────────────

test("computeMinSeatSpacingPx returns the minimum pairwise Euclidean distance", () => {
  const points = [
    { px: 0, py: 0 },
    { px: 100, py: 0 },
    { px: 50, py: 50 },
  ];
  // Distances: (0,0)-(100,0) = 100, (0,0)-(50,50) ≈ 70.7, (100,0)-(50,50) ≈ 70.7
  assert.equal(computeMinSeatSpacingPx(points), Math.sqrt(50 * 50 + 50 * 50));
});

test("computeMinSeatSpacingPx returns Infinity for fewer than 2 seats", () => {
  assert.equal(computeMinSeatSpacingPx([]), Infinity);
  assert.equal(computeMinSeatSpacingPx([{ px: 10, py: 10 }]), Infinity);
});

// ── B: halo radius formula ──────────────────────────────────────────────────

test("computeHaloRadiusPx = min(normalDesignRadius, safeFraction × minSpacing)", () => {
  // Wide spacing: safeRadius > normalDesignRadius → capped at normalDesignRadius
  const wideSeats = [
    { px: 0, py: 0 },
    { px: 200, py: 0 },
  ];
  const wideRadius = computeHaloRadiusPx(wideSeats);
  assert.equal(wideRadius, NORMAL_DESIGN_RADIUS_PX, "wide layout caps at normalDesignRadius");

  // Tight spacing: safeRadius < normalDesignRadius → uses safeRadius
  const tightSeats = [
    { px: 0, py: 0 },
    { px: 50, py: 0 },
  ];
  const tightRadius = computeHaloRadiusPx(tightSeats);
  const expectedTight = SAFE_FRACTION * 50;
  assert.equal(tightRadius, expectedTight, "tight layout uses safeFraction × minSpacing");
});

// ── C: SafeFraction prevents overlap ───────────────────────────────────────

test("SafeFraction prevents adjacent halo overlap", () => {
  // Two seats 80px apart (simulates ~0.8m at typical report scale)
  const seats = [
    { px: 0, py: 0 },
    { px: 80, py: 0 },
  ];
  const haloR = computeHaloRadiusPx(seats);
  // Two halos of radius haloR, centres 80px apart → gap = 80 - 2×haloR
  const gap = 80 - 2 * haloR;
  assert.ok(gap > 0, `halos must not overlap: gap=${gap}, haloR=${haloR}`);
  // With safeFraction=0.42: haloR = min(28, 0.42×80) = min(28, 33.6) = 28
  // gap = 80 - 56 = 24 > 0 ✓
});

test("SafeFraction prevents overlap at very tight spacing", () => {
  const seats = [
    { px: 0, py: 0 },
    { px: 30, py: 0 },
  ];
  const haloR = computeHaloRadiusPx(seats);
  const gap = 30 - 2 * haloR;
  assert.ok(gap > 0, `halos must not overlap even at tight spacing: gap=${gap}, haloR=${haloR}`);
  // haloR = min(28, 0.42×30) = min(28, 12.6) = 12.6
  // gap = 30 - 25.2 = 4.8 > 0 ✓
});

// ── D: uniform size ─────────────────────────────────────────────────────────

test("All seats in one diagram use the same halo radius", () => {
  const seats = [
    { px: 0, py: 0 },
    { px: 80, py: 0 },
    { px: 40, py: 60 },
    { px: 160, py: 30 },
  ];
  const haloR = computeHaloRadiusPx(seats);
  // The function returns a single number — all seats use it.
  // Verify it's a finite positive number.
  assert.ok(Number.isFinite(haloR) && haloR > 0);
});

// ── E: wide layout cap ───────────────────────────────────────────────────────

test("Wide layout does not grow beyond normalDesignRadius", () => {
  const seats = [
    { px: 0, py: 0 },
    { px: 1000, py: 0 },
  ];
  const haloR = computeHaloRadiusPx(seats);
  assert.equal(haloR, NORMAL_DESIGN_RADIUS_PX, "radius must not grow huge for wide spacing");
});

// ── F: tight-layout fallback does not force a minimum ───────────────────────

test("Tight-layout fallback does NOT enlarge radius to a minimum that creates overlap", () => {
  // Extremely tight: 20px apart
  const seats = [
    { px: 0, py: 0 },
    { px: 20, py: 0 },
  ];
  const haloR = computeHaloRadiusPx(seats);
  // haloR = min(28, 0.42×20) = min(28, 8.4) = 8.4
  // This is below READABLE_HALO_THRESHOLD_PX (14) → fallback should be used.
  // But the radius is NOT enlarged to 14 — it stays at 8.4.
  assert.ok(haloR < READABLE_HALO_THRESHOLD_PX, "tight layout radius should be below threshold");
  assert.ok(haloR < 14, "radius must NOT be enlarged to 14px minimum");
  // Verify no overlap even at this tiny radius
  const gap = 20 - 2 * haloR;
  assert.ok(gap > 0, `no overlap even at fallback: gap=${gap}, haloR=${haloR}`);
  // isHaloReadable should return false
  assert.equal(isHaloReadable(haloR), false);
});

// ── G: BLA has exactly 3 segments ────────────────────────────────────────────

test("BLA three-segment layout has exactly 3 fixed segments", () => {
  assert.equal(THREE_SEGMENT_LAYOUT.length, 3);
  const keys = THREE_SEGMENT_LAYOUT.map((s) => s.key).sort();
  assert.deepEqual(keys, ["p10", "p4", "p6"]);
});

test("BLA segment legend has exactly 3 entries", () => {
  assert.equal(THREE_SEGMENT_LEGEND.length, 3);
});

test("BLA TOP segment is P4 Screen (centred at 270°)", () => {
  const p4 = THREE_SEGMENT_LAYOUT.find((s) => s.key === "p4");
  assert.ok(p4);
  const centre = (p4.startAngle + p4.endAngle) / 2;
  // Handle wrap: 225+315=540/2=270 ✓
  assert.equal(centre, 270);
});

test("BLA LOWER-LEFT segment is P6 Surround (centred at 150°)", () => {
  const p6 = THREE_SEGMENT_LAYOUT.find((s) => s.key === "p6");
  assert.ok(p6);
  const centre = (p6.startAngle + p6.endAngle) / 2;
  assert.equal(centre, 150);
});

test("BLA LOWER-RIGHT segment is P10 Overhead (centred at 30°)", () => {
  const p10 = THREE_SEGMENT_LAYOUT.find((s) => s.key === "p10");
  assert.ok(p10);
  // Wrap-around: 345 to 75 → sweep = 75-345+360 = 90 → centre = 345+45 = 390 % 360 = 30
  let sweep = p10.endAngle - p10.startAngle;
  if (sweep < 0) sweep += 360;
  let centre = (p10.startAngle + sweep / 2) % 360;
  assert.equal(centre, 30);
});

// ── H: Timbre has exactly 2 segments ─────────────────────────────────────────

test("Timbre two-segment layout has exactly 2 fixed segments", () => {
  assert.equal(TWO_SEGMENT_LAYOUT.length, 2);
  const keys = TWO_SEGMENT_LAYOUT.map((s) => s.key).sort();
  assert.deepEqual(keys, ["p16", "p17"]);
});

test("Timbre segment legend has exactly 2 entries", () => {
  assert.equal(TWO_SEGMENT_LEGEND.length, 2);
});

// ── I: buildRingSegmentPath ──────────────────────────────────────────────────

test("buildRingSegmentPath produces valid SVG path starting with M and containing A commands", () => {
  const d = buildRingSegmentPath(50, 50, 10, 20, 0, 90);
  assert.ok(d.startsWith("M "), "path must start with M");
  assert.ok(d.includes("A "), "path must contain arc command");
  assert.ok(d.endsWith("Z"), "path must end with Z (close)");
});

test("buildRingSegmentPath handles wrap-around angles", () => {
  const d = buildRingSegmentPath(50, 50, 10, 20, 345, 75);
  assert.ok(d.startsWith("M "), "wrap-around path must start with M");
  assert.ok(d.includes("A "), "wrap-around path must contain arc command");
});

// ── J: terminology ──────────────────────────────────────────────────────────

test("PRIORITY_LEGEND uses 'Primary seat' and 'Secondary seat' (not 'Other')", () => {
  const styleSrc = fs.readFileSync(
    path.join(CLIENT_DIR, "visualReportSeatStyle.js"),
    "utf8"
  );
  assert.ok(styleSrc.includes("Primary seat"), "must contain 'Primary seat'");
  assert.ok(styleSrc.includes("Secondary seat"), "must contain 'Secondary seat'");
  assert.ok(!styleSrc.includes("Other seating"), "must NOT contain 'Other seating'");
});

test("BLA and Timbre count summaries use 'Secondary' (not 'Other')", () => {
  const blaSrc = fs.readFileSync(
    path.join(CLIENT_DIR, "ClientBestListeningArea.jsx"),
    "utf8"
  );
  const timbreSrc = fs.readFileSync(
    path.join(CLIENT_DIR, "ClientTimbreConsistency.jsx"),
    "utf8"
  );
  assert.ok(blaSrc.includes("Secondary"), "BLA must use 'Secondary'");
  assert.ok(!blaSrc.includes("Other ${otherCount"), "BLA must not use 'Other' in count");
  assert.ok(timbreSrc.includes("Secondary"), "Timbre must use 'Secondary'");
  assert.ok(!timbreSrc.includes("Other ${otherCount"), "Timbre must not use 'Other' in count");
});

// ── K: ZONE_RADIUS_M removed ─────────────────────────────────────────────────

test("ZONE_RADIUS_M (0.55) removed from all seat page components", () => {
  const files = [
    "ClientBestListeningArea.jsx",
    "ClientTimbreConsistency.jsx",
    "ClientP9Overhead.jsx",
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(CLIENT_DIR, f), "utf8");
    assert.ok(!src.includes("ZONE_RADIUS_M"), `${f} must not contain ZONE_RADIUS_M`);
    assert.ok(!src.includes("0.55"), `${f} must not contain 0.55`);
  }
});

// ── L: BLA editorial explanation removed ────────────────────────────────────

test("BLA editorial explanation paragraph removed from screen render", () => {
  const src = fs.readFileSync(
    path.join(CLIENT_DIR, "ClientBestListeningArea.jsx"),
    "utf8"
  );
  assert.ok(!src.includes("Main client explanation"), "explanation block comment removed");
  assert.ok(!src.includes("{explanation}"), "explanation variable render removed");
});

test("BLA print fallback text removed (no explanatory prose beneath diagram)", () => {
  const src = fs.readFileSync(
    path.join(CLIENT_DIR, "ClientReportPage.jsx"),
    "utf8"
  );
  assert.ok(
    !src.includes("Lowest achieved level across RP22 Parameters 4, 6 and 10"),
    "BLA print fallback text must be removed — no explanatory prose beneath diagram"
  );
  assert.ok(
    !src.includes("Seats are shaded by their lowest achieved level"),
    "old editorial fallback removed"
  );
  // The BLA section (type === "best-listening-area") must not have a print-result block
  // Other page types (timbre, soundstage, etc.) still use print-result — that's correct.
  const blaStart = src.indexOf('printData?.type === "best-listening-area"');
  const nextStart = src.indexOf('printData?.type === "timbre-consistency"');
  assert.ok(blaStart > -1 && nextStart > blaStart, "BLA section must exist and be followed by Timbre");
  const blaSection = src.slice(blaStart, nextStart);
  assert.ok(!blaSection.includes("client-report-print-result"),
    "BLA section must not contain a print-result block");
});

// ── M: getSeatCircleStyle no longer imported by seat pages ──────────────────

test("getSeatCircleStyle no longer imported by BLA, Timbre, or P9", () => {
  const files = [
    "ClientBestListeningArea.jsx",
    "ClientTimbreConsistency.jsx",
    "ClientP9Overhead.jsx",
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(CLIENT_DIR, f), "utf8");
    assert.ok(!src.includes("getSeatCircleStyle"), `${f} must not import getSeatCircleStyle`);
  }
});

test("SeatMarker and PositionMarker imported by seat page components", () => {
  const blaSrc = fs.readFileSync(path.join(CLIENT_DIR, "ClientBestListeningArea.jsx"), "utf8");
  const timbreSrc = fs.readFileSync(path.join(CLIENT_DIR, "ClientTimbreConsistency.jsx"), "utf8");
  const p9Src = fs.readFileSync(path.join(CLIENT_DIR, "ClientP9Overhead.jsx"), "utf8");
  const p1Src = fs.readFileSync(path.join(CLIENT_DIR, "ClientRecommendedSeatingPosition.jsx"), "utf8");
  const rp23Src = fs.readFileSync(path.join(CLIENT_DIR, "ClientScreenSeating.jsx"), "utf8");

  assert.ok(blaSrc.includes("SeatMarker"), "BLA imports SeatMarker");
  assert.ok(blaSrc.includes("computeHaloRadiusPx"), "BLA imports computeHaloRadiusPx");
  assert.ok(timbreSrc.includes("SeatMarker"), "Timbre imports SeatMarker");
  assert.ok(timbreSrc.includes("computeHaloRadiusPx"), "Timbre imports computeHaloRadiusPx");
  assert.ok(p9Src.includes("SeatMarker"), "P9 imports SeatMarker");
  assert.ok(p9Src.includes("computeHaloRadiusPx"), "P9 imports computeHaloRadiusPx");
  assert.ok(p1Src.includes("PositionMarker"), "P1 imports PositionMarker");
  assert.ok(p1Src.includes("computeHaloRadiusPx"), "P1 imports computeHaloRadiusPx");
  assert.ok(rp23Src.includes("PositionMarker"), "RP23 imports PositionMarker");
  assert.ok(rp23Src.includes("computeHaloRadiusPx"), "RP23 imports computeHaloRadiusPx");
});

// ── N: P1/RP23 background zones preserved ───────────────────────────────────

test("P1 distance zones and RP23 viewing zones are preserved", () => {
  const p1Src = fs.readFileSync(path.join(CLIENT_DIR, "ClientRecommendedSeatingPosition.jsx"), "utf8");
  const rp23Src = fs.readFileSync(path.join(CLIENT_DIR, "ClientScreenSeating.jsx"), "utf8");

  assert.ok(p1Src.includes("ZONES"), "P1 still has ZONES constant");
  assert.ok(p1Src.includes("LEVEL_FILLS"), "P1 still uses LEVEL_FILLS");
  assert.ok(rp23Src.includes("zones"), "RP23 still renders zones");
  assert.ok(rp23Src.includes("RP22_GRADE_TOKENS"), "RP23 uses canonical grade tokens");
});

// ── O: RSP coordinate unchanged ─────────────────────────────────────────────

test("RSP marker geometry preserved in BLA, Timbre, P9", () => {
  const files = [
    "ClientBestListeningArea.jsx",
    "ClientTimbreConsistency.jsx",
    "ClientP9Overhead.jsx",
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(CLIENT_DIR, f), "utf8");
    assert.ok(src.includes("RSP_RING_R"), `${f} preserves RSP marker`);
    assert.ok(src.includes("resolveRspLabelPlacement"), `${f} preserves RSP label placement`);
  }
});

test("RSP label collision uses new compact radius (haloRadius), not old ZONE_R_PX", () => {
  const files = [
    "ClientBestListeningArea.jsx",
    "ClientTimbreConsistency.jsx",
    "ClientP9Overhead.jsx",
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(CLIENT_DIR, f), "utf8");
    assert.ok(src.includes("haloRadius + PRIMARY_STROKE_WIDTH"), `${f} uses haloRadius for RSP obstacle`);
    assert.ok(!src.includes("r: ZONE_R_PX"), `${f} must not use ZONE_R_PX for RSP obstacle`);
  }
});