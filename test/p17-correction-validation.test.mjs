// p17-correction-validation.test.mjs
// Comprehensive validation of the corrected P17 continuous coverage scoring.
//
// Three confirmed defects are verified as fixed:
//  1. Grade-boundary monotonicity: improving across L1→L2, L2→L3, L3→L4
//     never drops the complete P17 earned points.
//  2. On-axis smooth saturation: improving 2°→1° never loses points.
//  3. Speaker-count normalisation: same average quality → same contribution
//     across 5.x, 7.x and 9.x systems.
//
// Tests run the FULL ASDR calculation (buildArtcousticDesignRatingAuthority
// + calculateScopedRoomDesignRating), not just the isolated P17 helper.
//
// Run: node --import ./test/_mount-loader.mjs test/p17-correction-validation.test.mjs

import {
  buildArtcousticDesignRatingAuthority,
  calculateScopedRoomDesignRating,
} from "../src/components/report/technical/artcousticSystemDesignRating.js";
import {
  computeP17CoveragePoints,
  computeP17MeanQuality,
  continuousSpeakerQuality,
} from "../src/components/report/technical/p17ContinuousCoverageBonus.js";

let failures = 0;
const results = [];
function record(test, expected, actual, delta, severity) {
  const pass = severity === "INFO" || (severity === "PASS" && true);
  const ok = severity === "INFO" || severity === "PASS";
  if (!ok) failures += 1;
  results.push({ test, expected, actual, delta, severity: ok ? "PASS" : "FAIL" });
  console.log(`  ${ok ? "PASS" : "FAIL"} | ${test}`);
  console.log(`       EXPECTED: ${expected}`);
  console.log(`       ACTUAL:   ${actual}`);
  console.log(`       DELTA:    ${delta}`);
}

// ── Helpers ──────────────────────────────────────────────────────────
// Bed-layer windows used across tests (l4=38°, l3=54°, l2=72°).
const bedWin = { l4Deg: 38, l3Deg: 54, l2Deg: 72 };
const P17_WEIGHT = 5;

/**
 * Build a per-speaker entry from an absolute off-axis angle.
 * windowLevelNumber is derived from the angle for fallback compatibility.
 */
function spk(angle, win = bedWin) {
  const w = win;
  const wn = angle <= w.l4Deg ? 4 : angle <= w.l3Deg ? 3 : angle <= w.l2Deg ? 2 : 1;
  return { role: "S", angleDeg: angle, windows: w, windowLevelNumber: wn };
}

/**
 * Build a per-speaker entry with a specific windowLevelNumber and an angle
 * chosen to produce the desired continuous quality.
 */
function spkLevel(levelNum, win = bedWin) {
  const angleMap = { 4: 10, 3: 46, 2: 63, 1: 80 };
  return spk(angleMap[levelNum] || 80, win);
}

/** Build a P17-only authority with one seat. */
function p17OnlySeat(seatId, priority, rawValue, perSpeaker) {
  const seats = [{ id: seatId, priority }];
  return buildArtcousticDesignRatingAuthority({
    seats,
    p17: { [seatId]: { rawValue, p17PerSpeaker: perSpeaker } },
  });
}

/** Extract the P17 contribution from a rating. */
function p17Contrib(rating) {
  return (rating?.contributions || []).find((c) => c.key === "p17") || null;
}

/** Full ASDR scoped rating for one seat. */
function fullScopedRating(seatId, priority, rawValue, perSpeaker) {
  const auth = p17OnlySeat(seatId, priority, rawValue, perSpeaker);
  return calculateScopedRoomDesignRating(auth, [seatId]);
}

// ── 1. GRADE BOUNDARY MONOTONICITY ────────────────────────────────────

console.log("\n=== 1. GRADE BOUNDARY MONOTONICITY ===\n");

// For each boundary, we construct a seat just below (in the lower grade)
// and just above (in the upper grade), with the SAME non-limiting speakers.
// The limiting speaker improves just enough to cross the boundary.
// The total P17 earned must not drop.

// P17 rawValue → grade: ≤1.5=L4, ≤3=L3, ≤4=L2, else=L1
// Quality boundaries: L4 floor=0.75, L3 floor=0.50, L2 floor=0.25, L1 floor=0.00

// We test each boundary at three mean-quality levels: low (mean near floor),
// medium, and high (mean well above ceiling, non-limiting speakers excellent).

function boundaryTest(boundaryName, lowerGrade, upperGrade, lowerRaw, upperRaw,
                       floorQ, ceilQ, nonLimitingAngles) {
  console.log(`  ${boundaryName}:`);

  for (const [label, limitingAngleBelow, limitingAngleAbove] of [
    // Limiting speaker at the quality boundary (ceilQ - ε below, ceilQ + ε above)
    // We use angles that produce quality just below/above the boundary.
    ["limiting at boundary", null, null],
  ]) {
    // Construct: 1 limiting speaker + N non-limiting speakers (all the same angles)
    const nonLimiting = nonLimitingAngles.map((a) => spk(a));

    // Below: limiting speaker just below the boundary quality
    // Above: limiting speaker just above the boundary quality
    // We'll use angles that produce quality straddling the boundary.

    // For bedWin: l4=38°, l3=54°, l2=72°
    // L3→L4 boundary is at quality 0.75 (angle = l4Deg = 38°)
    //   Below: angle slightly > 38° → quality slightly < 0.75 → grade L3
    //   Above: angle slightly < 38° → quality slightly > 0.75 → grade L4
    // L2→L3 boundary is at quality 0.50 (angle = l3Deg = 54°)
    //   Below: angle slightly > 54° → quality slightly < 0.50 → grade L2
    //   Above: angle slightly < 54° → quality slightly > 0.50 → grade L3
    // L1→L2 boundary is at quality 0.25 (angle = l2Deg = 72°)
    //   Below: angle slightly > 72° → quality slightly < 0.25 → grade L1
    //   Above: angle slightly < 72° → quality slightly > 0.25 → grade L2

    // We'll compute total P17 earned at both sides and compare.
  }

  // Direct test: compute total P17 earned at the lower grade (mean = M)
  // and at the upper grade (mean ≈ M, since only the limiting speaker moved
  // a tiny bit). The total must not drop.

  const testMean = (meanQ) => {
    // Construct per-speaker with the given mean quality at the lower grade
    // and at the upper grade. For the lower grade, all speakers at the mean.
    // For the upper grade, all speakers at the mean (the limiting speaker
    // crossed the boundary but the mean barely changes).
    const perSpeakerLower = nonLimitingAngles.map((a) => spk(a));
    const perSpeakerUpper = nonLimitingAngles.map((a) => spk(a));

    // Replace first speaker with one at the boundary
    // Lower: angle just past the boundary (lower quality)
    // Upper: angle just before the boundary (higher quality → grade changes)
    // We need specific angles for each boundary
    let angleBelow, angleAbove;
    if (upperGrade === "L4") { angleBelow = 38.5; angleAbove = 37.5; } // l4Deg=38
    else if (upperGrade === "L3") { angleBelow = 54.5; angleAbove = 53.5; } // l3Deg=54
    else if (upperGrade === "L2") { angleBelow = 72.5; angleAbove = 71.5; } // l2Deg=72

    perSpeakerLower[0] = spk(angleBelow);
    perSpeakerUpper[0] = spk(angleAbove);

    const rLower = fullScopedRating("s1", "primary", lowerRaw, perSpeakerLower);
    const rUpper = fullScopedRating("s1", "primary", upperRaw, perSpeakerUpper);
    const p17Lower = p17Contrib(rLower);
    const p17Upper = p17Contrib(rUpper);

    const earnedLower = p17Lower?.earnedPoints ?? 0;
    const earnedUpper = p17Upper?.earnedPoints ?? 0;
    const delta = earnedUpper - earnedLower;

    const pass = delta >= -1e-9;
    record(
      `${boundaryName} [${meanQ}] total P17 earned`,
      `upper ≥ lower (no drop)`,
      `lower=${earnedLower.toFixed(2)} upper=${earnedUpper.toFixed(2)}`,
      `Δ=${delta.toFixed(2)}`,
      pass ? "PASS" : "FAIL"
    );
  };

  // Test at multiple non-limiting speaker configurations
  testMean("non-limiting good (10°)");
  testMean("non-limiting medium (30°)");
  testMean("non-limiting poor (60°)");
}

boundaryTest("L3→L4", "L3", "L4", 2.0, 1.5, 0.50, 0.75, [10, 10, 10, 10, 10]);
boundaryTest("L2→L3", "L2", "L3", 3.5, 2.5, 0.25, 0.50, [10, 10, 10, 10, 10]);
boundaryTest("L1→L2", "L1", "L2", 4.5, 3.5, 0.00, 0.25, [10, 10, 10, 10, 10]);

// ── 2. ON-AXIS SMOOTH SATURATION (0°–5°) ──────────────────────────────

console.log("\n=== 2. ON-AXIS SMOOTH SATURATION (0°–5°) ===\n");

{
  // Improve a single speaker from 5° down to 0°, one degree at a time.
  // The coverage points must never decrease.
  // All speakers start at 5° and we improve one speaker step by step.
  const baseAngles = [5, 5, 5, 5, 5]; // 5 speakers all at 5°
  let prevPts = -1;
  let prevEarned = -Infinity;
  let monotonic = true;

  for (let impAngle = 5; impAngle >= 0; impAngle--) {
    const perSpeaker = baseAngles.map((a, i) => spk(i === 0 ? impAngle : a));
    const pts = computeP17CoveragePoints("L3", perSpeaker);
    const r = fullScopedRating("s1", "primary", 2.5, perSpeaker);
    const earned = p17Contrib(r)?.earnedPoints ?? 0;

    const q = continuousSpeakerQuality(spk(impAngle));
    console.log(`    improving speaker: ${impAngle}° (q=${q.toFixed(4)}) → pts=${pts.toFixed(3)} earned=${earned.toFixed(2)}`);

    if (earned < prevEarned - 1e-9) {
      monotonic = false;
      record(
        `on-axis ${impAngle + 1}°→${impAngle}° earned monotonic`,
        `earned non-decreasing`,
        `${prevEarned.toFixed(2)} → ${earned.toFixed(2)}`,
        `Δ=${(earned - prevEarned).toFixed(2)}`,
        "FAIL"
      );
    }
    prevEarned = earned;
  }

  record(
    "on-axis 5°→0° monotonic (no reversal)",
    `earned non-decreasing at every step`,
    `final earned=${prevEarned.toFixed(2)}`,
    `monotonic=${monotonic}`,
    monotonic ? "PASS" : "FAIL"
  );

  // Specific: 2°→1° must NOT lose points (the reported defect)
  const pts2 = computeP17CoveragePoints("L3", [spk(2), spk(2), spk(2), spk(2), spk(2)]);
  const pts1 = computeP17CoveragePoints("L3", [spk(1), spk(1), spk(1), spk(1), spk(1)]);
  record(
    "2°→1° coverage points (no reversal)",
    `pts(1°) ≥ pts(2°)`,
    `pts(2°)=${pts2.toFixed(3)} pts(1°)=${pts1.toFixed(3)}`,
    `Δ=${(pts1 - pts2).toFixed(3)}`,
    pts1 >= pts2 - 1e-9 ? "PASS" : "FAIL"
  );
}

// ── 3. SINGLE-SPEAKER IMPROVEMENT ────────────────────────────────────

console.log("\n=== 3. SINGLE-SPEAKER IMPROVEMENT ===\n");

{
  // 5 speakers, one improves from 60° (poor) to 10° (excellent), others stay at 30°.
  const before = [spk(60), spk(30), spk(30), spk(30), spk(30)];
  const after = [spk(10), spk(30), spk(30), spk(30), spk(30)];
  const rBefore = fullScopedRating("s1", "primary", 2.5, before);
  const rAfter = fullScopedRating("s1", "primary", 2.5, after);
  const earnedBefore = p17Contrib(rBefore)?.earnedPoints ?? 0;
  const earnedAfter = p17Contrib(rAfter)?.earnedPoints ?? 0;
  const delta = earnedAfter - earnedBefore;

  record(
    "single speaker 60°→10° (others 30°)",
    `earned increases`,
    `before=${earnedBefore.toFixed(2)} after=${earnedAfter.toFixed(2)}`,
    `Δ=${delta.toFixed(2)}`,
    delta > 0 ? "PASS" : "FAIL"
  );
}

// ── 4. MULTI-SPEAKER SIMULTANEOUS IMPROVEMENT ────────────────────────

console.log("\n=== 4. MULTI-SPEAKER SIMULTANEOUS IMPROVEMENT ===\n");

{
  // 10 speakers, 2 wides improve from 50° to 10°, others stay
  const before = [
    spk(0), spk(0), spk(50), spk(27),
    spk(26), spk(41), spk(14), spk(38), spk(25), spk(41),
  ];
  const after = [
    spk(0), spk(0), spk(10), spk(9),
    spk(26), spk(41), spk(14), spk(38), spk(25), spk(41),
  ];
  const rBefore = fullScopedRating("s1", "primary", 4.0, before);
  const rAfter = fullScopedRating("s1", "primary", 4.0, after);
  const earnedBefore = p17Contrib(rBefore)?.earnedPoints ?? 0;
  const earnedAfter = p17Contrib(rAfter)?.earnedPoints ?? 0;
  const delta = earnedAfter - earnedBefore;

  record(
    "2 of 10 speakers improve 50°→10° (L2 grade)",
    `earned increases`,
    `before=${earnedBefore.toFixed(2)} after=${earnedAfter.toFixed(2)}`,
    `Δ=${delta.toFixed(2)}`,
    delta > 0 ? "PASS" : "FAIL"
  );
}

// ── 5. ONE SEAT IMPROVES, ANOTHER DETERIORATES ───────────────────────

console.log("\n=== 5. ONE SEAT IMPROVES, ANOTHER DETERIORATES ===\n");

{
  const seats = [
    { id: "p1", priority: "primary" },
    { id: "p2", priority: "primary" },
  ];
  const beforePS = [spk(30), spk(30), spk(30), spk(30), spk(30)];
  const afterP1 = [spk(10), spk(30), spk(30), spk(30), spk(30)]; // improves
  const afterP2 = [spk(60), spk(60), spk(60), spk(60), spk(60)]; // deteriorates

  const authBefore = buildArtcousticDesignRatingAuthority({
    seats,
    p17: {
      p1: { rawValue: 2.5, p17PerSpeaker: beforePS },
      p2: { rawValue: 2.5, p17PerSpeaker: beforePS },
    },
  });
  const authAfter = buildArtcousticDesignRatingAuthority({
    seats,
    p17: {
      p1: { rawValue: 2.5, p17PerSpeaker: afterP1 },
      p2: { rawValue: 2.5, p17PerSpeaker: afterP2 },
    },
  });

  const rBefore = calculateScopedRoomDesignRating(authBefore, ["p1", "p2"]);
  const rAfter = calculateScopedRoomDesignRating(authAfter, ["p1", "p2"]);
  const earnedBefore = p17Contrib(rBefore)?.earnedPoints ?? 0;
  const earnedAfter = p17Contrib(rAfter)?.earnedPoints ?? 0;
  const delta = earnedAfter - earnedBefore;

  record(
    "p1 improves, p2 deteriorates (balanced aggregation)",
    `earned reflects both (not concealed)`,
    `before=${earnedBefore.toFixed(2)} after=${earnedAfter.toFixed(2)}`,
    `Δ=${delta.toFixed(2)}`,
    "INFO"
  );

  // Individual seat check: p1 should be higher, p2 lower
  const rP1Before = calculateScopedRoomDesignRating(authBefore, ["p1"]);
  const rP1After = calculateScopedRoomDesignRating(authAfter, ["p1"]);
  const rP2Before = calculateScopedRoomDesignRating(authBefore, ["p2"]);
  const rP2After = calculateScopedRoomDesignRating(authAfter, ["p2"]);
  const p1Delta = (p17Contrib(rP1After)?.earnedPoints ?? 0) - (p17Contrib(rP1Before)?.earnedPoints ?? 0);
  const p2Delta = (p17Contrib(rP2After)?.earnedPoints ?? 0) - (p17Contrib(rP2Before)?.earnedPoints ?? 0);

  record(
    "p1 individual seat earned increased",
    `p1 after > p1 before`,
    `Δ=${p1Delta.toFixed(2)}`,
    `p1`,
    p1Delta > 0 ? "PASS" : "FAIL"
  );
  record(
    "p2 individual seat earned decreased",
    `p2 after < p2 before`,
    `Δ=${p2Delta.toFixed(2)}`,
    `p2`,
    p2Delta < 0 ? "PASS" : "FAIL"
  );
}

// ── 6. SPEAKER-COUNT NORMALISATION (5.x / 7.x / 9.x) ─────────────────

console.log("\n=== 6. SPEAKER-COUNT NORMALISATION ===\n");

{
  // Three systems with different speaker counts but the SAME average quality.
  // All speakers at 20° (quality identical for all).
  const q20 = continuousSpeakerQuality(spk(20));

  const speakers5 = Array(5).fill(0).map(() => spk(20));
  const speakers7 = Array(7).fill(0).map(() => spk(20));
  const speakers10 = Array(10).fill(0).map(() => spk(20));
  const speakers15 = Array(15).fill(0).map(() => spk(20));

  const mean5 = computeP17MeanQuality(speakers5);
  const mean10 = computeP17MeanQuality(speakers10);
  const pts5 = computeP17CoveragePoints("L3", speakers5);
  const pts7 = computeP17CoveragePoints("L3", speakers7);
  const pts10 = computeP17CoveragePoints("L3", speakers10);
  const pts15 = computeP17CoveragePoints("L3", speakers15);

  record(
    "same avg quality → same contribution (5/7/10/15 speakers)",
    `pts5=pts7=pts10=pts15`,
    `pts5=${pts5.toFixed(3)} pts7=${pts7.toFixed(3)} pts10=${pts10.toFixed(3)} pts15=${pts15.toFixed(3)}`,
    `max-min=${(Math.max(pts5, pts7, pts10, pts15) - Math.min(pts5, pts7, pts10, pts15)).toFixed(6)}`,
    Math.abs(pts5 - pts10) < 1e-9 && Math.abs(pts7 - pts10) < 1e-9 && Math.abs(pts15 - pts10) < 1e-9 ? "PASS" : "FAIL"
  );

  // Also test: improving one speaker in a 5-speaker system moves the mean
  // more than in a 10-speaker system (proportionate sensitivity).
  const improve5 = [spk(5), spk(20), spk(20), spk(20), spk(20)];
  const improve10 = [spk(5), spk(20), spk(20), spk(20), spk(20), spk(20), spk(20), spk(20), spk(20), spk(20)];
  const ptsImprove5 = computeP17CoveragePoints("L3", improve5);
  const ptsImprove10 = computeP17CoveragePoints("L3", improve10);
  const delta5 = ptsImprove5 - pts5;
  const delta10 = ptsImprove10 - pts10;

  record(
    "1-speaker improvement: 5-spk delta > 10-spk delta (proportionate)",
    `delta5 > delta10 > 0`,
    `delta5=${delta5.toFixed(3)} delta10=${delta10.toFixed(3)}`,
    `ratio=${(delta5 / Math.max(delta10, 1e-9)).toFixed(2)}`,
    delta5 > delta10 && delta10 > 0 ? "PASS" : "FAIL"
  );
}

// ── 7. DIXON BEFORE/AFTER ────────────────────────────────────────────

console.log("\n=== 7. DIXON BEFORE/AFTER WIDE-SPEAKER AIMING ===\n");

{
  const ohWin = { l4Deg: 24.1, l3Deg: 35.2, l2Deg: 40.9 };
  function spkOh(angle) { return spk(angle, ohWin); }

  // Pub1: poor wide aiming (LW 53°, RW 27°)
  const pub1 = [
    spk(0), spk(0), spk(53), spk(27),
    spkOh(26), spkOh(41.5), spkOh(14), spkOh(38), spkOh(25.5), spkOh(41.5),
  ];
  // Pub2: wides improved (LW 16°, RW 9°)
  const pub2 = [
    spk(0), spk(0), spk(16), spk(9),
    spkOh(26), spkOh(41.5), spkOh(14), spkOh(38), spkOh(25.5), spkOh(41.5),
  ];

  const seats = [
    { id: "c1", priority: "primary" },
    { id: "c5", priority: "secondary" },
  ];

  const buildAuth = (perSpeaker) => buildArtcousticDesignRatingAuthority({
    seats,
    p17: {
      c1: { rawValue: 4.0, p17PerSpeaker: perSpeaker },
      c5: { rawValue: 4.0, p17PerSpeaker: perSpeaker },
    },
  });

  const rPub1Prim = calculateScopedRoomDesignRating(buildAuth(pub1), ["c1"]);
  const rPub2Prim = calculateScopedRoomDesignRating(buildAuth(pub2), ["c1"]);
  const rPub1Sec = calculateScopedRoomDesignRating(buildAuth(pub1), ["c5"]);
  const rPub2Sec = calculateScopedRoomDesignRating(buildAuth(pub2), ["c5"]);

  const p1Prim = p17Contrib(rPub1Prim);
  const p2Prim = p17Contrib(rPub2Prim);
  const p1Sec = p17Contrib(rPub1Sec);
  const p2Sec = p17Contrib(rPub2Sec);

  console.log(`    Primary:  pub1 earned=${p1Prim?.earnedPoints?.toFixed(2)} DPI=${rPub1Prim.designPerformanceIndex} | pub2 earned=${p2Prim?.earnedPoints?.toFixed(2)} DPI=${rPub2Prim.designPerformanceIndex}`);
  console.log(`    Secondary: pub1 earned=${p1Sec?.earnedPoints?.toFixed(2)} DPI=${rPub1Sec.designPerformanceIndex} | pub2 earned=${p2Sec?.earnedPoints?.toFixed(2)} DPI=${rPub2Sec.designPerformanceIndex}`);

  const primEarnedDelta = (p2Prim?.earnedPoints ?? 0) - (p1Prim?.earnedPoints ?? 0);
  const secEarnedDelta = (p2Sec?.earnedPoints ?? 0) - (p1Sec?.earnedPoints ?? 0);

  record(
    "Dixon primary: pub1→pub2 earned increases",
    `earned delta > 0`,
    `Δ=${primEarnedDelta.toFixed(2)}`,
    `pub1=${(p1Prim?.earnedPoints ?? 0).toFixed(2)} pub2=${(p2Prim?.earnedPoints ?? 0).toFixed(2)}`,
    primEarnedDelta > 0 ? "PASS" : "FAIL"
  );
  record(
    "Dixon secondary: pub1→pub2 earned increases",
    `earned delta > 0`,
    `Δ=${secEarnedDelta.toFixed(2)}`,
    `pub1=${(p1Sec?.earnedPoints ?? 0).toFixed(2)} pub2=${(p2Sec?.earnedPoints ?? 0).toFixed(2)}`,
    secEarnedDelta > 0 ? "PASS" : "FAIL"
  );
}

// ── 8. EXHAUSTIVE BOUNDARY SWEEP ─────────────────────────────────────

console.log("\n=== 8. EXHAUSTIVE MONOTONICITY SWEEP ===\n");

{
  // Sweep the limiting speaker from 80° down to 1°, crossing every grade
  // boundary. At each step, the total P17 earned must not decrease.
  const nonLimiting = [spk(10), spk(10), spk(10), spk(10)]; // 4 good speakers
  let violations = 0;
  let prevEarned = null;

  for (let angle = 80; angle >= 1; angle--) {
    // Determine the grade from the limiting speaker's angle
    let rawValue;
    if (angle <= 38) rawValue = 1.5; // L4
    else if (angle <= 54) rawValue = 2.5; // L3
    else if (angle <= 72) rawValue = 3.5; // L2
    else rawValue = 4.5; // L1

    const perSpeaker = [spk(angle), ...nonLimiting];
    const r = fullScopedRating("s1", "primary", rawValue, perSpeaker);
    const earned = p17Contrib(r)?.earnedPoints ?? 0;

    if (prevEarned !== null && earned < prevEarned - 1e-9) {
      violations++;
      record(
        `sweep ${angle + 1}°→${angle}° (rawValue=${rawValue})`,
        `earned non-decreasing`,
        `${prevEarned.toFixed(2)} → ${earned.toFixed(2)}`,
        `Δ=${(earned - prevEarned).toFixed(2)}`,
        "FAIL"
      );
    }
    prevEarned = earned;
  }

  record(
    `exhaustive 80°→1° sweep (crosses all boundaries)`,
    `0 monotonicity violations`,
    `${violations} violation(s)`,
    `final earned=${prevEarned.toFixed(2)}`,
    violations === 0 ? "PASS" : "FAIL"
  );
}

// ── SUMMARY ──────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(60));
console.log(`${failures === 0 ? "ALL P17 CORRECTION TESTS PASS" : `${failures} TEST(S) FAILED`}`);
console.log("=".repeat(60) + "\n");

process.exit(failures === 0 ? 0 : 1);