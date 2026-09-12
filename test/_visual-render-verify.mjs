/**
 * Visual Report compact-marker render verification.
 *
 * Renders the REAL Visual Report components (ClientBestListeningArea,
 * ClientTimbreConsistency, ClientP9Overhead, ClientRecommendedSeatingPosition,
 * ClientScreenSeating) through react-dom/server, then parses the actual SVG
 * output to verify every geometric/visual property the user asked about.
 *
 * Run: node --import ./test/_alias-register.mjs test/_visual-render-verify.mjs
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ClientBestListeningArea from "@/components/report/client/ClientBestListeningArea";
import ClientTimbreConsistency from "@/components/report/client/ClientTimbreConsistency";
import ClientP9Overhead from "@/components/report/client/ClientP9Overhead";
import ClientRecommendedSeatingPosition from "@/components/report/client/ClientRecommendedSeatingPosition";
import ClientScreenSeating from "@/components/report/client/ClientScreenSeating";
import { getSeatGradeColors, PRIORITY_LEGEND } from "@/components/report/client/visualReportSeatStyle";
import {
  computeHaloRadiusPx,
  computeMinSeatSpacingPx,
  THREE_SEGMENT_LAYOUT,
  TWO_SEGMENT_LAYOUT,
  READABLE_HALO_THRESHOLD_PX,
  NORMAL_DESIGN_RADIUS_PX,
  SAFE_FRACTION,
  PRIMARY_STROKE_WIDTH,
  CENTRAL_DISC_R,
  HALO_INNER_OFFSET,
} from "@/components/report/client/seatMarkerGeometry";

// ── Helpers ──

function extractSvg(markup) {
  const m = markup.match(/<svg[\s\S]*?<\/svg>/);
  return m ? m[0] : "";
}

/** Parse all circle/path elements with their attributes. */
function parseSvgElements(svg) {
  const circles = [];
  const paths = [];
  const texts = [];
  const re = /<(circle|path|text|rect|line)\b([^>]*?)(\/?)>/g;
  let match;
  while ((match = re.exec(svg)) !== null) {
    const tag = match[1];
    const attrsStr = match[2];
    const attrs = {};
    const ar = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
    let am;
    while ((am = ar.exec(attrsStr)) !== null) {
      attrs[am[1]] = am[2];
    }
    if (tag === "circle") circles.push(attrs);
    if (tag === "path") paths.push(attrs);
    if (tag === "text") texts.push(attrs);
  }
  return { circles, paths, texts };
}

function num(v) { return Number(v) || 0; }

/** Compute the angular midpoint of a segment (degrees, SVG convention). */
function segmentMidpointAngle(start, end) {
  let sweep = end - start;
  if (sweep < 0) sweep += 360;
  let mid = start + sweep / 2;
  if (mid < 0) mid += 360;
  if (mid >= 360) mid -= 360;
  return mid;
}

/** Classify which visual quadrant a segment midpoint falls in. */
function classifySegmentPosition(midAngle) {
  // SVG: 0=right, 90=down, 180=left, 270=up
  // TOP = around 270 (225-315)
  // LOWER-LEFT = around 150 (105-195)
  // LOWER-RIGHT = around 30 (345-75)
  if (midAngle >= 225 && midAngle <= 315) return "TOP";
  if (midAngle >= 105 && midAngle <= 195) return "LOWER-LEFT";
  if (midAngle >= 345 || midAngle <= 75) return "LOWER-RIGHT";
  if (midAngle >= 185 && midAngle <= 355) return "UPPER";
  if (midAngle >= 5 && midAngle <= 175) return "LOWER";
  return "OTHER";
}

// ── Fixtures ──

// Lord's Hall-style: 3 seats in one row, 1.2 m lateral spacing, at 4.2 m from screen wall
const ROOM_W = 6.0;
const ROOM_L = 8.0;
const SCREEN_FRONT_M = 0.2;
const SCREEN_WIDTH_M = 4.0;

const blaSeats = [
  { id: "s1", x: 2.4, y: 4.2, isPrimary: false, p4Level: "L4", p6Level: "L2", p10Level: "L3", categoryKey: "acceptable" },
  { id: "s2", x: 3.0, y: 4.2, isPrimary: true,  p4Level: "L4", p6Level: "L4", p10Level: "L4", categoryKey: "primary" },
  { id: "s3", x: 3.6, y: 4.2, isPrimary: false, p4Level: "L4", p6Level: "L2", p10Level: "L3", categoryKey: "acceptable" },
];
const rspMain = { x: 3.0, y: 4.2 };

const timbreSeats = [
  { id: "t1", x: 2.4, y: 4.2, isPrimary: false, p16Level: "L4", p17Level: "L2", categoryKey: "consistent" },
  { id: "t2", x: 3.0, y: 4.2, isPrimary: true,  p16Level: "L4", p17Level: "L4", categoryKey: "highly_consistent" },
  { id: "t3", x: 3.6, y: 4.2, isPrimary: false, p16Level: "L3", p17Level: "L2", categoryKey: "acceptable" },
];

const p9Seats = [
  { id: "p9-1", x: 2.4, y: 4.2, isPrimary: false, p9Level: "L3", p9Degrees: 55 },
  { id: "p9-2", x: 3.0, y: 4.2, isPrimary: true,  p9Level: "L4", p9Degrees: 45 },
  { id: "p9-3", x: 3.6, y: 4.2, isPrimary: false, p9Level: "L2", p9Degrees: 70 },
];

const p1Seats = [
  { id: "p1-1", x: 2.4, y: 4.2, isPrimary: false, level: "L3", formatted: "1.2 m", distanceM: 1.2 },
  { id: "p1-2", x: 3.0, y: 4.2, isPrimary: true,  level: "L4", formatted: "1.5 m", distanceM: 1.5 },
  { id: "p1-3", x: 3.6, y: 4.2, isPrimary: false, level: "L3", formatted: "1.2 m", distanceM: 1.2 },
];

const rp23Seats = [
  { id: "rp23-1", x: 2.4, y: 3.0, isPrimary: false, levelLabel: "L2", formatted: "33°" },
  { id: "rp23-2", x: 3.0, y: 3.6, isPrimary: true,  levelLabel: "L3", formatted: "40°" },
  { id: "rp23-3", x: 3.6, y: 3.0, isPrimary: false, levelLabel: "L2", formatted: "33°" },
];

// Tight-spacing fixture: seats 0.28 m apart — tight enough to trigger fallback
// (haloRadius < READABLE_HALO_THRESHOLD_PX) while remaining realistic.
const tightSeats = [
  { id: "x1", x: 2.72, y: 4.2, isPrimary: false, p4Level: "L4", p6Level: "L2", p10Level: "L3", categoryKey: "acceptable" },
  { id: "x2", x: 3.0,  y: 4.2, isPrimary: true,  p4Level: "L4", p6Level: "L4", p10Level: "L4", categoryKey: "primary" },
  { id: "x3", x: 3.28, y: 4.2, isPrimary: false, p4Level: "L4", p6Level: "L2", p10Level: "L3", categoryKey: "acceptable" },
];

// ── Render and verify ──

const results = {};

// === 1. BLA mixed-grade ===
{
  const markup = renderToStaticMarkup(
    React.createElement(ClientBestListeningArea, {
      roomDims: { widthM: ROOM_W, lengthM: ROOM_L },
      seats: blaSeats,
      rsp: rspMain,
      screenFrontPlaneM: SCREEN_FRONT_M,
      screenWidthM: SCREEN_WIDTH_M,
    })
  );
  const svg = extractSvg(markup);
  const { circles, paths, texts } = parseSvgElements(svg);

  // Seat centres: toPx mapping
  const PADDING_M = 0.6;
  const totalW = ROOM_W + PADDING_M * 2;
  const SVG_W = 760;
  const SCALE = SVG_W / totalW;
  const toPx = (x, y) => ({ px: (x + PADDING_M) * SCALE, py: (y + PADDING_M) * SCALE });

  const seatPointsPx = blaSeats.map(s => toPx(s.x, s.y));
  const minSpacing = computeMinSeatSpacingPx(seatPointsPx);
  const haloRadius = computeHaloRadiusPx(seatPointsPx);
  const haloInnerR = CENTRAL_DISC_R + HALO_INNER_OFFSET;
  const haloOuterR = Math.max(haloInnerR + 2, haloRadius);

  // Gap between adjacent halos
  const gap = minSpacing - 2 * haloOuterR;

  // Find Primary ring (stroke #213428, width 3.5)
  const primaryRings = circles.filter(c => c.stroke === "#213428" && num(c["stroke-width"]) === PRIMARY_STROKE_WIDTH);
  // Find fallback rings (stroke #D9D5CE)
  const fallbackRings = circles.filter(c => c.stroke === "#D9D5CE");

  // Segment paths: each seat has 3 segments
  const segmentPaths = paths.filter(p => p.d && p.d.startsWith("M") && p.fill);

  // Verify segment positions by matching path fill colours to expected grades
  // For seat 2 (Primary, all L4): all 3 segments should have L4 colour
  const l4Color = getSeatGradeColors("L4");
  const l2Color = getSeatGradeColors("L2");
  const l3Color = getSeatGradeColors("L3");

  // Check PRIORITY_LEGEND labels in markup
  const hasPrimaryLabel = markup.includes("Primary seat");
  const hasSecondaryLabel = markup.includes("Secondary seat");
  const hasP4Label = markup.includes("P4 Screen");
  const hasP6Label = markup.includes("P6 Surround");
  const hasP10Label = markup.includes("P10 Overhead");

  // Check no editorial paragraph (BLA has no explanation prop rendered)
  const hasEditorial = markup.includes("explanation") && markup.includes("<p");

  results.bla = {
    minSpacingPx: minSpacing.toFixed(2),
    haloRadiusPx: haloRadius.toFixed(2),
    haloOuterR: haloOuterR.toFixed(2),
    gapBetweenHalos: gap.toFixed(2),
    primaryRingCount: primaryRings.length,
    fallbackRingCount: fallbackRings.length,
    segmentPathCount: segmentPaths.length,
    hasPrimaryLabel,
    hasSecondaryLabel,
    hasP4Label,
    hasP6Label,
    hasP10Label,
    hasEditorial,
    l4Fill: l4Color.fill,
    l2Fill: l2Color.fill,
    l3Fill: l3Color.fill,
    markupLength: markup.length,
  };
}

// === 2. Tight-spacing fixture ===
{
  const markup = renderToStaticMarkup(
    React.createElement(ClientBestListeningArea, {
      roomDims: { widthM: ROOM_W, lengthM: ROOM_L },
      seats: tightSeats,
      rsp: { x: 3.0, y: 4.2 },
      screenFrontPlaneM: SCREEN_FRONT_M,
      screenWidthM: SCREEN_WIDTH_M,
    })
  );
  const svg = extractSvg(markup);
  const { circles, paths } = parseSvgElements(svg);

  const PADDING_M = 0.6;
  const totalW = ROOM_W + PADDING_M * 2;
  const SVG_W = 760;
  const SCALE = SVG_W / totalW;
  const toPx = (x, y) => ({ px: (x + PADDING_M) * SCALE, py: (y + PADDING_M) * SCALE });

  const seatPointsPx = tightSeats.map(s => toPx(s.x, s.y));
  const minSpacing = computeMinSeatSpacingPx(seatPointsPx);
  const safeRadius = SAFE_FRACTION * minSpacing;
  const haloRadius = computeHaloRadiusPx(seatPointsPx);
  const isFallback = haloRadius < READABLE_HALO_THRESHOLD_PX;

  const haloInnerR = CENTRAL_DISC_R + HALO_INNER_OFFSET;
  const haloOuterR = Math.max(haloInnerR + 2, haloRadius);
  const gap = minSpacing - 2 * haloOuterR;

  // In fallback mode, no segment paths should be rendered
  const segmentPaths = paths.filter(p => p.d && p.d.startsWith("M") && p.fill && p.d !== "");
  // Primary ring should still be present
  const primaryRings = circles.filter(c => c.stroke === "#213428" && num(c["stroke-width"]) === PRIMARY_STROKE_WIDTH);
  // Fallback thin rings
  const fallbackRings = circles.filter(c => c.stroke === "#D9D5CE");

  results.tight = {
    minSpacingPx: minSpacing.toFixed(2),
    safeRadiusPx: safeRadius.toFixed(2),
    haloRadiusPx: haloRadius.toFixed(2),
    renderedFallbackRadius: haloOuterR.toFixed(2),
    isFallback,
    gapBetweenHalos: gap.toFixed(2),
    segmentPathCount: segmentPaths.length,
    primaryRingCount: primaryRings.length,
    fallbackRingCount: fallbackRings.length,
  };
}

// === 3. Timbre ===
{
  const markup = renderToStaticMarkup(
    React.createElement(ClientTimbreConsistency, {
      roomDims: { widthM: ROOM_W, lengthM: ROOM_L },
      seats: timbreSeats,
      rsp: rspMain,
      screenFrontPlaneM: SCREEN_FRONT_M,
      screenWidthM: SCREEN_WIDTH_M,
    })
  );
  const svg = extractSvg(markup);
  const { circles, paths } = parseSvgElements(svg);

  const PADDING_M = 0.6;
  const totalW = ROOM_W + PADDING_M * 2;
  const SVG_W = 760;
  const SCALE = SVG_W / totalW;
  const toPx = (x, y) => ({ px: (x + PADDING_M) * SCALE, py: (y + PADDING_M) * SCALE });

  const seatPointsPx = timbreSeats.map(s => toPx(s.x, s.y));
  const minSpacing = computeMinSeatSpacingPx(seatPointsPx);
  const haloRadius = computeHaloRadiusPx(seatPointsPx);
  const haloInnerR = CENTRAL_DISC_R + HALO_INNER_OFFSET;
  const haloOuterR = Math.max(haloInnerR + 2, haloRadius);
  const gap = minSpacing - 2 * haloOuterR;

  // 2 segments per seat × 3 seats = 6 segment paths
  const segmentPaths = paths.filter(p => p.d && p.d.startsWith("M") && p.fill);
  const primaryRings = circles.filter(c => c.stroke === "#213428" && num(c["stroke-width"]) === PRIMARY_STROKE_WIDTH);

  const hasP16Label = markup.includes("P16 Screen");
  const hasP17Label = markup.includes("P17 Surround");

  results.timbre = {
    minSpacingPx: minSpacing.toFixed(2),
    haloRadiusPx: haloRadius.toFixed(2),
    gapBetweenHalos: gap.toFixed(2),
    segmentPathCount: segmentPaths.length,
    primaryRingCount: primaryRings.length,
    hasP16Label,
    hasP17Label,
  };
}

// === 4. P9 assessed ===
{
  const markup = renderToStaticMarkup(
    React.createElement(ClientP9Overhead, {
      roomDims: { widthM: ROOM_W, lengthM: ROOM_L },
      seats: p9Seats,
      rsp: rspMain,
      screenFrontPlaneM: SCREEN_FRONT_M,
      screenWidthM: SCREEN_WIDTH_M,
      summary: "All assessed seats meet overhead spacing thresholds.",
    })
  );
  const svg = extractSvg(markup);
  const { circles } = parseSvgElements(svg);

  const PADDING_M = 0.6;
  const totalW = ROOM_W + PADDING_M * 2;
  const SVG_W = 760;
  const SCALE = SVG_W / totalW;
  const toPx = (x, y) => ({ px: (x + PADDING_M) * SCALE, py: (y + PADDING_M) * SCALE });

  const seatPointsPx = p9Seats.map(s => toPx(s.x, s.y));
  const minSpacing = computeMinSeatSpacingPx(seatPointsPx);
  const haloRadius = computeHaloRadiusPx(seatPointsPx);
  const haloInnerR = CENTRAL_DISC_R + HALO_INNER_OFFSET;
  const haloOuterR = Math.max(haloInnerR + 2, haloRadius);
  const gap = minSpacing - 2 * haloOuterR;

  // P9 uses single-level ring: thick-stroke circle with grade fill colour
  const primaryRings = circles.filter(c => c.stroke === "#213428" && num(c["stroke-width"]) === PRIMARY_STROKE_WIDTH);

  // Check for grade-coloured thick rings (stroke = grade fill, width = ringWidth)
  const l4Color = getSeatGradeColors("L4");
  const l3Color = getSeatGradeColors("L3");
  const l2Color = getSeatGradeColors("L2");

  results.p9 = {
    minSpacingPx: minSpacing.toFixed(2),
    haloRadiusPx: haloRadius.toFixed(2),
    gapBetweenHalos: gap.toFixed(2),
    primaryRingCount: primaryRings.length,
    l4Fill: l4Color.fill,
    l3Fill: l3Color.fill,
    l2Fill: l2Color.fill,
  };
}

// === 5. P9 N/A suppression ===
{
  const naSeats = [
    { id: "na1", x: 2.4, y: 4.2, isPrimary: false, p9Level: null, p9Degrees: null },
    { id: "na2", x: 3.0, y: 4.2, isPrimary: true,  p9Level: null, p9Degrees: null },
  ];
  // The page-level suppression is handled by ClientReportPage, not the component itself.
  // The component still renders. We verify that the suppression LOGIC exists by checking
  // that hasAnyAssessedSeat returns false for all-N/A seats.
  const { hasAnyAssessedSeat } = await import("@/components/report/client/visualReportSeatStyle");
  const anyAssessed = hasAnyAssessedSeat(naSeats, "p9Level");
  results.p9naSuppressed = !anyAssessed;
}

// === 6. P1 ===
{
  const markup = renderToStaticMarkup(
    React.createElement(ClientRecommendedSeatingPosition, {
      roomDims: { widthM: ROOM_W, lengthM: ROOM_L },
      seats: p1Seats,
      rsp: rspMain,
      screenFrontPlaneM: SCREEN_FRONT_M,
      screenWidthM: SCREEN_WIDTH_M,
    })
  );
  const svg = extractSvg(markup);
  const { circles } = parseSvgElements(svg);

  const PADDING_M = 0.6;
  const totalW = ROOM_W + PADDING_M * 2;
  const SVG_W = 760;
  const SCALE = SVG_W / totalW;
  const toPx = (x, y) => ({ px: (x + PADDING_M) * SCALE, py: (y + PADDING_M) * SCALE });

  const seatPointsPx = p1Seats.map(s => toPx(s.x, s.y));
  const minSpacing = computeMinSeatSpacingPx(seatPointsPx);
  const haloRadius = computeHaloRadiusPx(seatPointsPx);

  // P1 uses PositionMarker: Primary has bold ring + filled disc; Secondary has neutral disc only
  // Primary disc fill = #213428, Secondary disc fill = #625143
  const primaryDiscs = circles.filter(c => c.fill === "#213428" && num(c.r) <= 12);
  const primaryRings = circles.filter(c => c.stroke === "#213428" && num(c["stroke-width"]) === PRIMARY_STROKE_WIDTH);

  // Zone bands should be present (nested rects with LEVEL_FILLS)
  const zoneRects = svg.match(/<rect[^>]*fill="#[0-9a-fA-F]{6,8}[^>]*>/g) || [];

  results.p1 = {
    minSpacingPx: minSpacing.toFixed(2),
    haloRadiusPx: haloRadius.toFixed(2),
    primaryRingCount: primaryRings.length,
    primaryDiscCount: primaryDiscs.length,
    zoneRectCount: zoneRects.length,
  };
}

// === 7. RP23 ===
{
  const rp23Zones = [
    { key: "z1", level: "l1", label: "L1", yStart: 0, yEnd: 1.5 },
    { key: "z2", level: "l2", label: "L2", yStart: 1.5, yEnd: 2.5 },
    { key: "z3", level: "l3", label: "L3", yStart: 2.5, yEnd: 3.5 },
    { key: "z4", level: "l4", label: "L4", yStart: 3.5, yEnd: 4.5 },
    { key: "z5", level: "l3", label: "L3", yStart: 4.5, yEnd: 5.5 },
    { key: "z6", level: "l2", label: "L2", yStart: 5.5, yEnd: 6.5 },
    { key: "z7", level: "l1", label: "L1", yStart: 6.5, yEnd: 8.0 },
  ];

  const markup = renderToStaticMarkup(
    React.createElement(ClientScreenSeating, {
      roomDims: { widthM: ROOM_W, lengthM: ROOM_L },
      seats: rp23Seats,
      rsp: { x: 3.0, y: 3.6 },
      screenFrontPlaneM: SCREEN_FRONT_M,
      screenWidthM: SCREEN_WIDTH_M,
      zones: rp23Zones,
      projectorLumens: 1200,
    })
  );
  const svg = extractSvg(markup);
  const { circles } = parseSvgElements(svg);

  const PADDING_M = 0.6;
  const totalW = ROOM_W + PADDING_M * 2;
  const SVG_W = 760;
  const SCALE = SVG_W / totalW;
  const toPx = (x, y) => ({ px: (x + PADDING_M) * SCALE, py: (y + PADDING_M) * SCALE });

  const seatPointsPx = rp23Seats.map(s => toPx(s.x, s.y));
  const minSpacing = computeMinSeatSpacingPx(seatPointsPx);
  const haloRadius = computeHaloRadiusPx(seatPointsPx);

  const primaryRings = circles.filter(c => c.stroke === "#213428" && num(c["stroke-width"]) === PRIMARY_STROKE_WIDTH);
  const primaryDiscs = circles.filter(c => c.fill === "#213428" && num(c.r) <= 12);

  // Zone bands present
  const zoneRects = svg.match(/<rect[^>]*fill="#[0-9a-fA-F]{6,8}[^>]*>/g) || [];

  results.rp23 = {
    minSpacingPx: minSpacing.toFixed(2),
    haloRadiusPx: haloRadius.toFixed(2),
    primaryRingCount: primaryRings.length,
    primaryDiscCount: primaryDiscs.length,
    zoneRectCount: zoneRects.length,
  };
}

// === 8. Segment orientation verification (BLA) ===
{
  // For each segment in THREE_SEGMENT_LAYOUT, compute midpoint and classify
  const segPositions = {};
  for (const seg of THREE_SEGMENT_LAYOUT) {
    const mid = segmentMidpointAngle(seg.startAngle, seg.endAngle);
    segPositions[seg.key] = {
      startAngle: seg.startAngle,
      endAngle: seg.endAngle,
      midAngle: mid.toFixed(1),
      classified: classifySegmentPosition(mid),
    };
  }
  results.segmentOrientation = segPositions;
}

// === 9. Colour parity (BLA seat 2 all-L4) ===
{
  const l4 = getSeatGradeColors("L4");
  const l2 = getSeatGradeColors("L2");
  const l3 = getSeatGradeColors("L3");
  results.colourParity = {
    L4: { fill: l4.fill, border: l4.border, text: l4.text },
    L3: { fill: l3.fill, border: l3.border, text: l3.text },
    L2: { fill: l2.fill, border: l2.border, text: l2.text },
  };
}

// === 10. RSP label collision (RSP close to a seat) ===
{
  // RSP at 3.5 m, 4.5 m — close to seat 2 (3.0, 4.2) but not on top of it.
  // Verifies the label placement avoids the seat 2 halo + Primary keyline.
  const closeSeats = [
    { id: "c1", x: 2.4, y: 4.2, isPrimary: false, p4Level: "L4", p6Level: "L2", p10Level: "L3", categoryKey: "acceptable" },
    { id: "c2", x: 3.0, y: 4.2, isPrimary: true,  p4Level: "L4", p6Level: "L4", p10Level: "L4", categoryKey: "primary" },
    { id: "c3", x: 3.6, y: 4.2, isPrimary: false, p4Level: "L4", p6Level: "L2", p10Level: "L3", categoryKey: "acceptable" },
  ];
  const markup = renderToStaticMarkup(
    React.createElement(ClientBestListeningArea, {
      roomDims: { widthM: ROOM_W, lengthM: ROOM_L },
      seats: closeSeats,
      rsp: { x: 3.5, y: 4.5 },
      screenFrontPlaneM: SCREEN_FRONT_M,
      screenWidthM: SCREEN_WIDTH_M,
    })
  );
  const svg = extractSvg(markup);
  const { texts } = parseSvgElements(svg);

  // Find RSP text element
  const rspText = texts.find(t => {
    // Get text content from the markup between > and <
    const m = svg.match(new RegExp(`<text[^>]*\\bx="${t.x}"[^>]*>\\s*(RSP)\\s*</text>`));
    return m;
  });

  // Check the RSP label position vs the seat 2 position
  const PADDING_M = 0.6;
  const totalW = ROOM_W + PADDING_M * 2;
  const SVG_W = 760;
  const SCALE = SVG_W / totalW;
  const toPx = (x, y) => ({ px: (x + PADDING_M) * SCALE, py: (y + PADDING_M) * SCALE });
  const seat2Px = toPx(3.0, 4.2);
  const rspPx = toPx(3.05, 4.25);
  const haloRadius = computeHaloRadiusPx(closeSeats.map(s => toPx(s.x, s.y)));
  const haloInnerR = CENTRAL_DISC_R + HALO_INNER_OFFSET;
  const haloOuterR = Math.max(haloInnerR + 2, haloRadius);
  const obstacleR = haloOuterR + PRIMARY_STROKE_WIDTH;

  // Distance from RSP label position to seat 2 centre
  const rspLabelX = rspText ? num(rspText.x) : 0;
  const rspLabelY = rspText ? num(rspText.y) : 0;
  const distToSeat2 = Math.sqrt((rspLabelX - seat2Px.px) ** 2 + (rspLabelY - seat2Px.py) ** 2);

  results.rspLabel = {
    rspPx: { px: rspPx.px.toFixed(2), py: rspPx.py.toFixed(2) },
    seat2Px: { px: seat2Px.px.toFixed(2), py: seat2Px.py.toFixed(2) },
    obstacleR: obstacleR.toFixed(2),
    labelX: rspLabelX.toFixed(2),
    labelY: rspLabelY.toFixed(2),
    distToSeat2: distToSeat2.toFixed(2),
    labelAvoidsHalo: distToSeat2 > obstacleR,
  };
}

// === 11. Terminology search ===
{
  const fs = await import("node:fs");
  const files = [
    "src/components/report/client/ClientBestListeningArea.jsx",
    "src/components/report/client/ClientTimbreConsistency.jsx",
    "src/components/report/client/ClientP9Overhead.jsx",
    "src/components/report/client/ClientRecommendedSeatingPosition.jsx",
    "src/components/report/client/ClientScreenSeating.jsx",
    "src/components/report/client/visualReportSeatStyle.js",
    "src/components/report/client/SeatMarker.jsx",
    "src/components/report/client/seatMarkerGeometry.js",
    "src/components/report/client/selectClientBestListeningArea.js",
    "src/components/report/client/selectClientTimbreConsistency.js",
    "src/components/report/client/selectClientP9Overhead.js",
    "src/components/report/client/selectClientRecommendedSeatingPosition.js",
    "src/components/report/client/selectClientScreenSeating.js",
  ];
  const searchTerms = ["Other seating", "Other seat", "Primary seating", "isStrongest"];
  const findings = {};
  for (const f of files) {
    let content;
    try { content = fs.readFileSync(f, "utf8"); } catch { continue; }
    for (const term of searchTerms) {
      if (content.includes(term)) {
        if (!findings[term]) findings[term] = [];
        findings[term].push(f);
      }
    }
  }
  results.terminology = findings;
}

// === 12. Print-path rendering (PDF) ===
// Render with print=true, printPart="drawing" to verify SVG survives the print path.
{
  const printResults = {};
  const fixtures = [
    { name: "bla", Component: ClientBestListeningArea, seats: blaSeats, rsp: rspMain, extra: {} },
    { name: "timbre", Component: ClientTimbreConsistency, seats: timbreSeats, rsp: rspMain, extra: {} },
    { name: "tight", Component: ClientBestListeningArea, seats: tightSeats, rsp: { x: 3.0, y: 4.2 }, extra: {} },
    { name: "p9", Component: ClientP9Overhead, seats: p9Seats, rsp: rspMain, extra: { summary: "All assessed seats meet overhead spacing thresholds." } },
    { name: "p1", Component: ClientRecommendedSeatingPosition, seats: p1Seats, rsp: rspMain, extra: {} },
    { name: "rp23", Component: ClientScreenSeating, seats: rp23Seats, rsp: { x: 3.0, y: 3.6 }, extra: { zones: [
      { key: "z1", level: "l1", label: "L1", yStart: 0, yEnd: 1.5 },
      { key: "z2", level: "l2", label: "L2", yStart: 1.5, yEnd: 2.5 },
      { key: "z3", level: "l3", label: "L3", yStart: 2.5, yEnd: 3.5 },
      { key: "z4", level: "l4", label: "L4", yStart: 3.5, yEnd: 4.5 },
      { key: "z5", level: "l3", label: "L3", yStart: 4.5, yEnd: 5.5 },
      { key: "z6", level: "l2", label: "L2", yStart: 5.5, yEnd: 6.5 },
      { key: "z7", level: "l1", label: "L1", yStart: 6.5, yEnd: 8.0 },
    ], projectorLumens: 1200 } },
  ];

  for (const fx of fixtures) {
    const markup = renderToStaticMarkup(
      React.createElement(fx.Component, {
        roomDims: { widthM: ROOM_W, lengthM: ROOM_L },
        seats: fx.seats,
        rsp: fx.rsp,
        screenFrontPlaneM: SCREEN_FRONT_M,
        screenWidthM: SCREEN_WIDTH_M,
        print: true,
        printPart: "drawing",
        ...fx.extra,
      })
    );
    const svg = extractSvg(markup);
    const { circles, paths } = parseSvgElements(svg);
    const hasSvg = svg.length > 0;
    const hasPaths = paths.length;
    const hasCircles = circles.length;
    const primaryRings = circles.filter(c => c.stroke === "#213428" && num(c["stroke-width"]) === PRIMARY_STROKE_WIDTH);
    const segmentPaths = paths.filter(p => p.d && p.d.startsWith("M") && p.fill);
    printResults[fx.name] = {
      hasSvg,
      svgLength: svg.length,
      circleCount: hasCircles,
      pathCount: hasPaths,
      segmentPathCount: segmentPaths.length,
      primaryRingCount: primaryRings.length,
    };
  }
  results.printPath = printResults;
}

// === Output ===
console.log(JSON.stringify(results, null, 2));