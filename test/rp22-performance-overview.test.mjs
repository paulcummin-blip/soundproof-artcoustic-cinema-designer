// rp22-performance-overview.test.mjs
// Validates the pillar limiting-level projection rules:
//   - Spatial P1–P11, Dynamic Range P12–P16, Timbre Matching P17–P21.
//   - Seat-scoped params: worst level among PRIMARY seats (Primary) and
//     SECONDARY seats (Secondary) independently.
//   - Room-scoped params: count for BOTH groups (room-wide).
//   - RSP-scoped (P19): Primary ONLY, never attributed to Secondary.
//   - Unassessed / N/A / null params are skipped (never L1 or FAIL).
//   - Multiple parameters sharing the limiting level are all listed.
//   - Improving the limiting parameter updates the overview.
//
// Run: node --import ./test/_alias-loader.mjs test/rp22-performance-overview.test.mjs

import assert from "node:assert/strict";
import {
  buildPillarOverview,
  PILLAR_ORDER,
} from "../src/components/rp22/performanceOverviewPillarLimits.js";

const RANK = { FAIL: 0, L1: 1, L2: 2, L3: 3, L4: 4 };

// Seat result helper: primary unless secondary.
const seat = (row, column, level, isPrimary) => ({
  seatId: `seat-r${row}-c${column}`,
  row, column,
  isPrimary: isPrimary !== false,
  level,
});

// Build a minimal liveSummary shape consumed by buildPillarOverview.
function makeSummary({ seatResults = {}, roomResults = {} } = {}) {
  return {
    reportCounts: { seatResultsByParameter: seatResults },
    roomResultsByParameter: roomResults,
  };
}

// ── 1. Seat-scoped: primary and secondary limiting independently ────────────
// P5 (Horizontal Speaker Spacing, Seat) primary seats L2/L3, secondary L4/L1.
// Worst primary = L2 (rank2 < rank3? no: min rank. L2=2, L3=3 → min=2=L2). Worst
// secondary = L1 (rank1, worst valid). L4=4 is best so excluded as not limiting.
{
  const summary = makeSummary({
    seatResults: {
      p5: [
        seat(1, 1, "L2", true),   // primary
        seat(1, 2, "L3", true),   // primary
        seat(2, 1, "L4", false),  // secondary (best)
        seat(2, 2, "L1", false),  // secondary (worst valid)
      ],
    },
  });
  const ov = buildPillarOverview(summary);
  const spatial = ov["Spatial Resolution"];
  assert.equal(spatial.primary.level, "L2", "P5 primary worst = L2");
  assert.equal(spatial.secondary.level, "L1", "P5 secondary worst = L1");
  // Primary limiter lists the primary seat at L2 (Row 1 Seat 1).
  assert.equal(spatial.primary.limiters.length, 1);
  assert.equal(spatial.primary.limiters[0].paramId, 5);
  assert.deepEqual(spatial.primary.limiters[0].seats, [{ row: 1, column: 1 }]);
  assert.equal(spatial.secondary.limiters[0].seats.length, 1);
  assert.deepEqual(spatial.secondary.limiters[0].seats, [{ row: 2, column: 2 }]);
  console.log("✓ seat-scoped primary/secondary independent limiting");
}

// ── 2. RSP-scoped P19: Primary only, never Secondary ───────────────────────
// P19 (Bass Response vs Target, RSP) at FAIL. Must limit Primary Timbre Matching
// to FAIL but must NOT appear in Secondary (no other Timbre params assessed).
{
  const summary = makeSummary({
    roomResults: { 19: { level: "FAIL", formatted: "—", value: null } },
  });
  const ov = buildPillarOverview(summary);
  const timbre = ov["Timbre Matching"];
  assert.equal(timbre.primary.level, "FAIL", "P19 FAIL limits primary Timbre");
  assert.equal(timbre.primary.limiters.length, 1);
  assert.equal(timbre.primary.limiters[0].paramId, 19);
  assert.equal(timbre.primary.limiters[0].scope, "RSP");
  assert.equal(timbre.secondary.level, null, "P19 never attributed to secondary");
  assert.equal(timbre.secondary.limiters.length, 0);
  console.log("✓ RSP-only P19 excluded from Secondary, limits Primary");
}

// ── 3. Assumed parameters P15 and P21 are excluded from the overview ────────
// P15 (Background Noise Floor, Room) is a designer-assumed level. It must NOT
// limit Dynamic Range and must NOT appear in the limiting-parameter detail.
// P21 (Early Reflections, Room) is likewise assumed and excluded from Timbre.
{
  const summary = makeSummary({
    roomResults: {
      15: { level: "L1", formatted: "NCB 26", value: null },
      21: { level: "L1", formatted: "-8 dB", value: null },
    },
  });
  const ov = buildPillarOverview(summary);
  const dr = ov["Dynamic Range"];
  assert.equal(dr.primary.level, null, "assumed P15 does not limit primary Dynamic Range");
  assert.equal(dr.secondary.level, null, "assumed P15 does not limit secondary Dynamic Range");
  assert.equal(dr.primary.limiters.length, 0, "P15 not in primary limiting detail");
  assert.equal(dr.secondary.limiters.length, 0, "P15 not in secondary limiting detail");
  const timbre = ov["Timbre Matching"];
  assert.equal(timbre.primary.level, null, "assumed P21 does not limit primary Timbre Matching");
  assert.equal(timbre.secondary.level, null, "assumed P21 does not limit secondary Timbre Matching");
  assert.equal(timbre.primary.limiters.length, 0, "P21 not in primary limiting detail");
  assert.equal(timbre.secondary.limiters.length, 0, "P21 not in secondary limiting detail");
  console.log("✓ assumed P15 and P21 excluded from overview limiting calculation");
}

// ── 4. Unassessed / N/A params skipped (never L1 or FAIL) ───────────────────
// No assessed params anywhere → all pillars null for both groups.
{
  const summary = makeSummary({
    seatResults: { p1: [seat(1, 1, "N/A", true), seat(1, 1, "—", false)] },
    roomResults: { 2: { level: null }, 12: { level: "N/A" } },
  });
  const ov = buildPillarOverview(summary);
  for (const pillar of PILLAR_ORDER) {
    assert.equal(ov[pillar].primary.level, null, `${pillar} primary null when unassessed`);
    assert.equal(ov[pillar].secondary.level, null, `${pillar} secondary null when unassessed`);
  }
  console.log("✓ unassessed / N/A parameters skipped (no false L1/FAIL)");
}

// ── 5. Multiple parameters sharing the limiting level are all listed ────────
// P12 (Room, L2) and P16 (Seat, secondary L2) both limit Secondary Dynamic Range
// to L2. Both must be listed.
{
  const summary = makeSummary({
    roomResults: { 12: { level: "L2" } },
    seatResults: {
      p16: [seat(1, 1, "L4", true), seat(2, 1, "L2", false), seat(2, 2, "L3", false)],
    },
  });
  const ov = buildPillarOverview(summary);
  const dr = ov["Dynamic Range"];
  assert.equal(dr.secondary.level, "L2", "secondary Dynamic Range limited to L2");
  const ids = dr.secondary.limiters.map((l) => l.paramId).sort((a, b) => a - b);
  assert.deepEqual(ids, [12, 16], "both P12 (room) and P16 (seat) limit secondary");
  console.log("✓ multiple parameters sharing the limiting level all listed");
}

// ── 6. Improving the limiting parameter updates the overview ────────────────
// Start: P5 secondary has an L1 seat → secondary Spatial = L1.
// Improve that seat to L3 → secondary Spatial should no longer be L1; with no
// other assessed Spatial param, it becomes L3 (the new worst).
{
  let summary = makeSummary({
    seatResults: { p5: [seat(2, 2, "L1", false)] },
  });
  let ov = buildPillarOverview(summary);
  assert.equal(ov["Spatial Resolution"].secondary.level, "L1");
  // Improve the limiting seat.
  summary = makeSummary({
    seatResults: { p5: [seat(2, 2, "L3", false)] },
  });
  ov = buildPillarOverview(summary);
  assert.equal(ov["Spatial Resolution"].secondary.level, "L3", "improving the limiting seat updates the overview");
  console.log("✓ improving a limiting parameter updates the overview");
}

// ── 7. FAIL is the worst, below L1 ───────────────────────────────────────────
// A FAIL in a pillar overrides any L1–L4 as the limiting level.
{
  const summary = makeSummary({
    roomResults: { 12: { level: "L2" } },
    seatResults: { p16: [seat(2, 1, "FAIL", false)] },
  });
  const ov = buildPillarOverview(summary);
  assert.equal(ov["Dynamic Range"].secondary.level, "FAIL", "FAIL is the worst limiting level");
  console.log("✓ FAIL is the worst limiting level");
}

console.log("\nAll RP22 Performance Overview projection tests passed.");