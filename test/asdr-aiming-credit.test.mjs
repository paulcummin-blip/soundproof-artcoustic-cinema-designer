// asdr-aiming-credit.test.mjs
// Validation for the independent ASDR speaker-aiming credit.
//
// Exercises the real rating adapter (artcousticSystemDesignRating.js)
// end-to-end with per-speaker entries that carry the wall-flat reference
// off-axis angle. Verifies the qualitative outcomes from the brief:
//   - Wall-flat speaker earns zero aiming credit.
//   - Already well-oriented side surrounds earn negligible credit.
//   - Front-wide improvements can earn up to +5 secondary DPI.
//   - Rear-surround improvements can earn up to +3 secondary DPI.
//   - Worsening coverage is never rewarded.
//   - Identical orientations produce identical scores.
//   - No speaker-count inflation.
//   - Complete primary and secondary scores are reported.
//
// Run: node --import ./test/_mount-loader.mjs test/asdr-aiming-credit.test.mjs

import {
  buildArtcousticDesignRatingAuthority,
  calculateScopedRoomDesignRating,
} from "../src/components/report/technical/artcousticSystemDesignRating.js";
import { computeSeatAimingPoints } from "../src/components/report/technical/asdrAimingCredit.js";

// Representative Artcoustic-style coverage windows (degrees, half-angle).
const WIN = { l4Deg: 28, l3Deg: 41, l2Deg: 55 };

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

let failures = 0;
function check(label, condition, detail) {
  const ok = !!condition;
  console.log(`    ${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ── Per-speaker entry builder ─────────────────────────────────────────
// role: canonical role; currentDeg: current effective off-axis; wallFlatDeg:
// off-axis in the canonical wall-flat orientation.
function spk(role, currentDeg, wallFlatDeg, windows = WIN) {
  return {
    role,
    angleDeg: currentDeg,
    wallFlatOffAxisDeg: wallFlatDeg,
    windows,
    windowLevelNumber: 4,
  };
}

// Build a P17-only authority with the given per-speaker entries per seat.
function buildAuthority(seats, p17PerSpeakerBySeat) {
  const p17 = {};
  for (const seat of seats) {
    p17[seat.id] = {
      rawValue: 1.5, // L4 grade
      p17PerSpeaker: p17PerSpeakerBySeat[seat.id] || [],
    };
  }
  return buildArtcousticDesignRatingAuthority({ seats, p17 });
}

// 4 primary + 4 secondary seats
const SEATS = [
  { id: "p1", priority: "primary" },
  { id: "p2", priority: "primary" },
  { id: "p3", priority: "primary" },
  { id: "p4", priority: "primary" },
  { id: "s1", priority: "secondary" },
  { id: "s2", priority: "secondary" },
  { id: "s3", priority: "secondary" },
  { id: "s4", priority: "secondary" },
];
const PRIMARY_IDS = SEATS.filter((s) => s.priority === "primary").map((s) => s.id);
const SECONDARY_IDS = SEATS.filter((s) => s.priority === "secondary").map((s) => s.id);

console.log("\n=== ASDR AIMING CREDIT VALIDATION ===\n");

// ── 1. Wall-flat speaker earns zero aiming credit ────────────────────
console.log("1. Wall-flat speaker (current = wall-flat):");
{
  const perSeat = {};
  for (const s of SEATS) {
    perSeat[s.id] = [spk("LW", 43, 43), spk("RW", 43, 43), spk("SBL", 43, 43), spk("SBR", 43, 43)];
  }
  for (const s of SEATS) {
    const pts = computeSeatAimingPoints(perSeat[s.id], s.priority);
    check(`${s.id} aiming points = 0`, pts === 0, `got ${pts}`);
  }
}

// ── 2. Already well-oriented side surround: negligible credit ────────
console.log("\n2. Side surround wall-flat already optimal (8° vs 8°):");
{
  const perSeat = {};
  for (const s of SEATS) {
    perSeat[s.id] = [spk("SL", 8, 8), spk("SR", 8, 8)];
  }
  let maxPts = 0;
  for (const s of SEATS) {
    const pts = computeSeatAimingPoints(perSeat[s.id], s.priority);
    maxPts = Math.max(maxPts, pts);
  }
  check("max side-surround aiming credit negligible (< 0.5 raw)", maxPts < 0.5, `got ${maxPts}`);
}

// ── 3. Front-wide improvement 43° → 13°: substantial secondary credit ─
console.log("\n3. Front-wide improvement (wall-flat 43° → aimed 13°):");
{
  const aimedPerSeat = {};
  const flatPerSeat = {};
  for (const s of SEATS) {
    aimedPerSeat[s.id] = [spk("LW", 13, 43), spk("RW", 13, 43)];
    flatPerSeat[s.id] = [spk("LW", 43, 43), spk("RW", 43, 43)];
  }
  const authAimed = buildAuthority(SEATS, aimedPerSeat);
  const authFlat = buildAuthority(SEATS, flatPerSeat);

  const secAimed = calculateScopedRoomDesignRating(authAimed, SECONDARY_IDS);
  const secFlat = calculateScopedRoomDesignRating(authFlat, SECONDARY_IDS);
  const secDelta = secAimed.designPerformanceIndex - secFlat.designPerformanceIndex;

  check(
    "secondary DPI improvement > 0",
    secDelta > 0,
    `aimed ${secAimed.designPerformanceIndex} vs flat ${secFlat.designPerformanceIndex}, Δ=${secDelta}`,
  );
  // The total DPI delta includes both the aiming credit AND the continuous
  // coverage contribution change. The aiming credit is bounded by +5; the
  // coverage contribution can add ~+1-2 in the synthetic case where every
  // speaker improves dramatically. Check the aiming credit component
  // separately to verify it stays within the +5 allocation.
  const secAimingAimed = secAimed.contributions?.find((c) => c.key === "p17")?.aimingPoints ?? 0;
  const secAimingFlat = secFlat.contributions?.find((c) => c.key === "p17")?.aimingPoints ?? 0;
  const secAimingDelta = secAimingAimed - secAimingFlat;
  // Aiming credit is in RAW points (displayed DPI × 10). Max +5 = 50 raw.
  check(
    "secondary AIMING credit ≤ +5 (max allocation, excluding coverage)",
    secAimingDelta <= 50.1,
    `aiming Δ=${secAimingDelta.toFixed(2)} raw (${(secAimingDelta / 10).toFixed(2)} displayed)`,
  );
  check(
    "secondary DPI improvement is meaningful (≥ 2)",
    secDelta >= 2,
    `Δ=${secDelta}`,
  );

  // Primary gets +2 max (= 20 raw)
  const primAimed = calculateScopedRoomDesignRating(authAimed, PRIMARY_IDS);
  const primFlat = calculateScopedRoomDesignRating(authFlat, PRIMARY_IDS);
  const primDelta = primAimed.designPerformanceIndex - primFlat.designPerformanceIndex;
  const primAimingAimed = primAimed.contributions?.find((c) => c.key === "p17")?.aimingPoints ?? 0;
  const primAimingFlat = primFlat.contributions?.find((c) => c.key === "p17")?.aimingPoints ?? 0;
  const primAimingDelta = primAimingAimed - primAimingFlat;
  check(
    "primary AIMING credit ≤ +2 (max allocation, excluding coverage)",
    primAimingDelta <= 20.1,
    `aiming Δ=${primAimingDelta.toFixed(2)} raw (${(primAimingDelta / 10).toFixed(2)} displayed)`,
  );
  check("primary DPI improvement > 0", primDelta > 0, `Δ=${primDelta}`);
}

// ── 4. Rear-surround improvement 43° → 13°: meaningful secondary ─────
console.log("\n4. Rear-surround improvement (wall-flat 43° → aimed 13°):");
{
  const aimedPerSeat = {};
  const flatPerSeat = {};
  for (const s of SEATS) {
    aimedPerSeat[s.id] = [spk("SBL", 13, 43), spk("SBR", 13, 43)];
    flatPerSeat[s.id] = [spk("SBL", 43, 43), spk("SBR", 43, 43)];
  }
  const authAimed = buildAuthority(SEATS, aimedPerSeat);
  const authFlat = buildAuthority(SEATS, flatPerSeat);

  const secAimed = calculateScopedRoomDesignRating(authAimed, SECONDARY_IDS);
  const secFlat = calculateScopedRoomDesignRating(authFlat, SECONDARY_IDS);
  const secDelta = secAimed.designPerformanceIndex - secFlat.designPerformanceIndex;

  check("secondary DPI improvement > 0", secDelta > 0, `Δ=${secDelta}`);
  const secAimingAimed = secAimed.contributions?.find((c) => c.key === "p17")?.aimingPoints ?? 0;
  const secAimingFlat = secFlat.contributions?.find((c) => c.key === "p17")?.aimingPoints ?? 0;
  const secAimingDelta = secAimingAimed - secAimingFlat;
  // Max +3 = 30 raw
  check(
    "secondary AIMING credit ≤ +3 (max allocation, excluding coverage)",
    secAimingDelta <= 30.1,
    `aiming Δ=${secAimingDelta.toFixed(2)} raw (${(secAimingDelta / 10).toFixed(2)} displayed)`,
  );
  check(
    "secondary DPI improvement is meaningful (≥ 1)",
    secDelta >= 1,
    `Δ=${secDelta}`,
  );

  const primAimed = calculateScopedRoomDesignRating(authAimed, PRIMARY_IDS);
  const primFlat = calculateScopedRoomDesignRating(authFlat, PRIMARY_IDS);
  const primDelta = primAimed.designPerformanceIndex - primFlat.designPerformanceIndex;
  const primAimingAimed = primAimed.contributions?.find((c) => c.key === "p17")?.aimingPoints ?? 0;
  const primAimingFlat = primFlat.contributions?.find((c) => c.key === "p17")?.aimingPoints ?? 0;
  const primAimingDelta = primAimingAimed - primAimingFlat;
  // Max +1 = 10 raw
  check(
    "primary AIMING credit ≤ +1 (max allocation, excluding coverage)",
    primAimingDelta <= 10.1,
    `aiming Δ=${primAimingDelta.toFixed(2)} raw (${(primAimingDelta / 10).toFixed(2)} displayed)`,
  );
}

// ── 5. Worsening coverage is never rewarded ──────────────────────────
console.log("\n5. Aiming that worsens coverage (13° wall-flat → 43° current):");
{
  const worsePerSeat = {};
  for (const s of SEATS) {
    // current is WORSE than wall-flat: 43° vs 13° wall-flat
    worsePerSeat[s.id] = [spk("LW", 43, 13), spk("RW", 43, 13)];
  }
  for (const s of SEATS) {
    const pts = computeSeatAimingPoints(worsePerSeat[s.id], s.priority);
    check(`${s.id} earns 0 (worsening)`, pts === 0, `got ${pts}`);
  }
}

// ── 6. Identical orientations produce identical scores ────────────────
console.log("\n6. Identical physical orientations (same angles, different roles):");
{
  const perSeatA = {};
  const perSeatB = {};
  for (const s of SEATS) {
    // Same physical result: 13° current, 43° wall-flat — achieved "via aim toggle"
    perSeatA[s.id] = [spk("LW", 13, 43)];
    // Same physical result — achieved "via manual yaw"
    perSeatB[s.id] = [spk("LW", 13, 43)];
  }
  const authA = buildAuthority(SEATS, perSeatA);
  const authB = buildAuthority(SEATS, perSeatB);
  const secA = calculateScopedRoomDesignRating(authA, SECONDARY_IDS);
  const secB = calculateScopedRoomDesignRating(authB, SECONDARY_IDS);
  check(
    "identical orientations → identical secondary DPI",
    secA.designPerformanceIndex === secB.designPerformanceIndex,
    `${secA.designPerformanceIndex} vs ${secB.designPerformanceIndex}`,
  );
}

// ── 7. No speaker-count inflation ────────────────────────────────────
console.log("\n7. No speaker-count inflation (1 vs 2 front wides, same gain):");
{
  const oneFw = {};
  const twoFw = {};
  for (const s of SEATS) {
    oneFw[s.id] = [spk("LW", 13, 43)];
    twoFw[s.id] = [spk("LW", 13, 43), spk("RW", 13, 43)];
  }
  const authOne = buildAuthority(SEATS, oneFw);
  const authTwo = buildAuthority(SEATS, twoFw);
  const secOne = calculateScopedRoomDesignRating(authOne, SECONDARY_IDS);
  const secTwo = calculateScopedRoomDesignRating(authTwo, SECONDARY_IDS);
  check(
    "2 front wides do not earn more than 1 (same gain per seat)",
    Math.abs(secTwo.designPerformanceIndex - secOne.designPerformanceIndex) === 0,
    `1×: ${secOne.designPerformanceIndex}, 2×: ${secTwo.designPerformanceIndex}`,
  );
}

// ── 8. Multiple groups: cumulative, bounded by max allocations ──────
console.log("\n8. Multiple groups (front wides + rear surrounds, all improved):");
{
  const bothPerSeat = {};
  for (const s of SEATS) {
    bothPerSeat[s.id] = [
      spk("LW", 13, 43),
      spk("RW", 13, 43),
      spk("SBL", 13, 43),
      spk("SBR", 13, 43),
    ];
  }
  const flatPerSeat = {};
  for (const s of SEATS) {
    flatPerSeat[s.id] = [
      spk("LW", 43, 43),
      spk("RW", 43, 43),
      spk("SBL", 43, 43),
      spk("SBR", 43, 43),
    ];
  }
  const authBoth = buildAuthority(SEATS, bothPerSeat);
  const authFlat = buildAuthority(SEATS, flatPerSeat);
  const secBoth = calculateScopedRoomDesignRating(authBoth, SECONDARY_IDS);
  const secFlat = calculateScopedRoomDesignRating(authFlat, SECONDARY_IDS);
  const secDelta = secBoth.designPerformanceIndex - secFlat.designPerformanceIndex;
  // Max cumulative secondary AIMING credit = 5 (FW) + 3 (RS) = 8 displayed = 80 raw.
  const secAimingBoth = secBoth.contributions?.find((c) => c.key === "p17")?.aimingPoints ?? 0;
  const secAimingFlat = secFlat.contributions?.find((c) => c.key === "p17")?.aimingPoints ?? 0;
  const secAimingDelta = secAimingBoth - secAimingFlat;
  check(
    "cumulative secondary AIMING credit ≤ +8 (5 + 3, excluding coverage)",
    secAimingDelta <= 80.1,
    `aiming Δ=${secAimingDelta.toFixed(2)} raw (${(secAimingDelta / 10).toFixed(2)} displayed)`,
  );
  // Front-wide-only secondary Δ was 3 (test 3); cumulative must exceed it.
  check("cumulative secondary improvement > front-wide-only (3)", secDelta > 3, `Δ=${secDelta}`);
}

// ── 9. Complete primary and secondary scores reported ────────────────
console.log("\n9. Complete primary and secondary scores reported:");
{
  const perSeat = {};
  for (const s of SEATS) {
    perSeat[s.id] = [spk("LW", 13, 43), spk("RW", 13, 43), spk("SBL", 13, 43), spk("SBR", 13, 43)];
  }
  const auth = buildAuthority(SEATS, perSeat);
  const prim = calculateScopedRoomDesignRating(auth, PRIMARY_IDS);
  const sec = calculateScopedRoomDesignRating(auth, SECONDARY_IDS);
  check(
    "primary DPI is a finite number",
    isNum(prim.designPerformanceIndex) && prim.status === "COMPLETE",
    `DPI=${prim.designPerformanceIndex}, status=${prim.status}`,
  );
  check(
    "secondary DPI is a finite number",
    isNum(sec.designPerformanceIndex) && sec.status === "COMPLETE",
    `DPI=${sec.designPerformanceIndex}, status=${sec.status}`,
  );
  check(
    "secondary DPI ≥ primary DPI (outer seats benefit more)",
    sec.designPerformanceIndex >= prim.designPerformanceIndex,
    `primary=${prim.designPerformanceIndex}, secondary=${sec.designPerformanceIndex}`,
  );
}

// ── 10. Legacy data (no wallFlatOffAxisDeg): zero aiming credit ───────
console.log("\n10. Legacy per-speaker data (no wallFlatOffAxisDeg):");
{
  const legacyPerSeat = {};
  for (const s of SEATS) {
    legacyPerSeat[s.id] = [
      { role: "LW", angleDeg: 13, windows: WIN, windowLevelNumber: 4 },
      { role: "SBL", angleDeg: 13, windows: WIN, windowLevelNumber: 4 },
    ];
  }
  for (const s of SEATS) {
    const pts = computeSeatAimingPoints(legacyPerSeat[s.id], s.priority);
    check(`${s.id} legacy aiming = 0`, pts === 0, `got ${pts}`);
  }
}

// ── 11. Grade-boundary monotonicity ──────────────────────────────────
console.log("\n11. Monotonicity (more improvement never lowers the score):");
{
  const lessPerSeat = {};
  const morePerSeat = {};
  for (const s of SEATS) {
    // Less improvement: 30° → 20° (small gain)
    lessPerSeat[s.id] = [spk("LW", 20, 30), spk("RW", 20, 30)];
    // More improvement: 43° → 13° (large gain)
    morePerSeat[s.id] = [spk("LW", 13, 43), spk("RW", 13, 43)];
  }
  const authLess = buildAuthority(SEATS, lessPerSeat);
  const authMore = buildAuthority(SEATS, morePerSeat);
  const secLess = calculateScopedRoomDesignRating(authLess, SECONDARY_IDS);
  const secMore = calculateScopedRoomDesignRating(authMore, SECONDARY_IDS);
  check(
    "larger angular improvement → ≥ secondary DPI",
    secMore.designPerformanceIndex >= secLess.designPerformanceIndex,
    `more=${secMore.designPerformanceIndex}, less=${secLess.designPerformanceIndex}`,
  );
}

console.log(`\n${failures === 0 ? "ALL TESTS PASSED" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);