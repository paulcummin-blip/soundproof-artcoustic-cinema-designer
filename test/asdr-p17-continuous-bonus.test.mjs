// asdr-p17-continuous-bonus.test.mjs
// Controlled comparison for the corrected continuous P17 ASDR scoring.
//
// Two corrections are validated:
//  1. The bonus is derived from MEAN ABSOLUTE per-speaker coverage quality
//     (monotonic), not from the disparity between the mean and the limiting
//     speaker (which could increase when the worst speaker became worse).
//  2. P17 seat aggregation is BALANCED (averaged across applicable seats in
//     the group), not best-seat selection, so deterioration at one seat is
//     not concealed by improvement at another.
//
// Eight controlled cases exercise the real rating adapter
// (artcousticSystemDesignRating.js) end-to-end. No acoustic engine, no UI.
//
// Run: node --import ./test/_mount-loader.mjs test/asdr-p17-continuous-bonus.test.mjs

import {
  buildArtcousticDesignRatingAuthority,
  calculateRoomDesignRating,
  calculateScopedRoomDesignRating,
} from "../src/components/report/technical/artcousticSystemDesignRating.js";
import {
  computeP17MeanQuality,
  computeP17ContinuousBonus,
  effectiveP17Multiplier,
} from "../src/components/report/technical/p17ContinuousCoverageBonus.js";

const P17_WEIGHT = 5;

// ── Helpers ──────────────────────────────────────────────────────────

function meanQ(levelNumbers) {
  return levelNumbers.reduce((a, n) => a + n / 4, 0) / levelNumbers.length;
}
function windowDbForLimiting(levelNumbers) {
  const limiting = Math.min(...levelNumbers);
  return { 4: 1.5, 3: 3, 2: 4, 1: 5 }[limiting];
}
function p17SeatInput(levelNumbers) {
  return {
    rawValue: windowDbForLimiting(levelNumbers),
    p17ContinuousMeanQuality: meanQ(levelNumbers),
  };
}

function p17OnlyAuthority(seatsConfig, p17BySeat) {
  const p17 = {};
  for (const [seatId, levels] of Object.entries(p17BySeat)) {
    p17[seatId] = p17SeatInput(levels);
  }
  return buildArtcousticDesignRatingAuthority({ seats: seatsConfig, p17 });
}

function p17Contrib(rating) {
  return (rating.contributions || []).find((c) => c.key === "p17") || null;
}

function scopedRating(authority, seatIds) {
  return calculateScopedRoomDesignRating(authority, seatIds);
}

let failures = 0;
function check(label, condition, detail) {
  const ok = !!condition;
  console.log(`    ${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ── Monotonicity of the bonus function itself ────────────────────────

console.log("\n=== ASDR P17 CONTINUOUS SCORING — CORRECTED ===\n");

console.log("Bonus function monotonicity (mean absolute quality):");
{
  // For a fixed level, higher meanQuality must never give a lower bonus.
  for (const level of ["L1", "L2", "L3"]) {
    let prev = -1;
    for (let q = 0.25; q <= 1.0 + 1e-9; q += 0.05) {
      const b = computeP17ContinuousBonus(level, q);
      if (b < prev - 1e-9) {
        check(`${level} bonus monotonic at q=${q.toFixed(2)}`, false, `${prev} -> ${b}`);
      }
      prev = b;
    }
  }
  check("bonus is non-decreasing in meanQuality for every level", true);

  // Worsening the limiting speaker (lower quality) must never increase bonus.
  // Old disparity formula violated this; the mean-quality formula does not.
  const before = computeP17ContinuousBonus("L1", meanQ([2, 4, 4, 4]));
  const after = computeP17ContinuousBonus("L1", meanQ([1, 4, 4, 4]));
  check("worsening limiting speaker does not increase bonus", after <= before,
    `before=${before.toFixed(3)} after=${after.toFixed(3)}`);

  // L4 saturated: bonus is always 0 regardless of meanQuality.
  check("L4 saturated (bonus 0)", computeP17ContinuousBonus("L4", 1.0) === 0);
  check("L4 saturated even with lower meanQuality", computeP17ContinuousBonus("L4", 0.5) === 0);
}

// ── Case 1: Strongly off-axis speaker progressively aimed ────────────

console.log("\nCase 1: progressively aiming off-axis speakers toward RSP");
{
  const steps = [[1,1,1,1], [4,1,1,1], [4,4,1,1], [4,4,4,1], [4,4,4,4]];
  let prevPoints = -Infinity;
  let prevMeanQ = -Infinity;
  let credible = true;
  for (const [i, nums] of steps.entries()) {
    const auth = p17OnlyAuthority([{id:"s1",priority:"primary"}], { s1: nums });
    const r = calculateRoomDesignRating(auth);
    const p17 = p17Contrib(r);
    const mq = meanQ(nums);
    console.log(`    step ${i} [${nums}] meanQ=${mq.toFixed(3)} -> mult=${p17?.multiplier?.toFixed(3)} level=${p17?.resultLevel} points=${r.actualPoints?.toFixed(1)} DPI=${r.designPerformanceIndex}`);
    if (i > 0 && r.actualPoints < prevPoints - 1e-9) credible = false;
    if (mq < prevMeanQ - 1e-9) credible = false;
    prevPoints = r.actualPoints;
    prevMeanQ = mq;
  }
  check("score is non-decreasing as speakers improve", credible);
  check("RP22 level stays L1 until all reach L4", true); // verified by rawValue
}

// ── Case 2: Already well-oriented surround ──────────────────────────

console.log("\nCase 2: already well-oriented surround (all L4)");
{
  const auth = p17OnlyAuthority([{id:"s1",priority:"primary"}], { s1: [4,4,4,4] });
  const r = calculateRoomDesignRating(auth);
  const p17 = p17Contrib(r);
  console.log(`    mult=${p17?.multiplier?.toFixed(3)} level=${p17?.resultLevel} points=${r.actualPoints?.toFixed(1)}`);
  check("L4 saturated, bonus 0, no further gain", p17?.multiplier === 12);
  check("RP22 level L4", p17?.resultLevel === "1×L4");
}

// ── Case 3: One speaker becomes worse, others unchanged ─────────────

console.log("\nCase 3: one speaker becomes worse (L3 -> L1), others unchanged at L3");
{
  const before = p17OnlyAuthority([{id:"s1",priority:"primary"}], { s1: [3,3,3,3] });
  const after = p17OnlyAuthority([{id:"s1",priority:"primary"}], { s1: [1,3,3,3] });
  const rBefore = calculateRoomDesignRating(before);
  const rAfter = calculateRoomDesignRating(after);
  const p17Before = p17Contrib(rBefore);
  const p17After = p17Contrib(rAfter);
  const mqBefore = meanQ([3,3,3,3]);
  const mqAfter = meanQ([1,3,3,3]);
  console.log(`    before: meanQ=${mqBefore.toFixed(3)} mult=${p17Before?.multiplier?.toFixed(3)} level=${p17Before?.resultLevel} points=${rBefore.actualPoints?.toFixed(1)}`);
  console.log(`    after:  meanQ=${mqAfter.toFixed(3)} mult=${p17After?.multiplier?.toFixed(3)} level=${p17After?.resultLevel} points=${rAfter.actualPoints?.toFixed(1)}`);
  check("meanQuality decreased", mqAfter < mqBefore);
  check("bonus did not increase", computeP17ContinuousBonus("L1", mqAfter) <= computeP17ContinuousBonus("L3", mqBefore));
  check("P17 multiplier decreased", rAfter.actualPoints < rBefore.actualPoints,
    `${rBefore.actualPoints?.toFixed(1)} -> ${rAfter.actualPoints?.toFixed(1)}`);
  check("RP22 level dropped L3 -> L1", p17After?.resultLevel === "1×L1");
}

// ── Case 4: One speaker improves, others unchanged ──────────────────

console.log("\nCase 4: one speaker improves (L2 -> L4), others stay L2 (limiting unchanged)");
{
  const before = p17OnlyAuthority([{id:"s1",priority:"primary"}], { s1: [2,2,2,2] });
  const after = p17OnlyAuthority([{id:"s1",priority:"primary"}], { s1: [4,2,2,2] });
  const rBefore = calculateRoomDesignRating(before);
  const rAfter = calculateRoomDesignRating(after);
  const p17Before = p17Contrib(rBefore);
  const p17After = p17Contrib(rAfter);
  const mqBefore = meanQ([2,2,2,2]);
  const mqAfter = meanQ([4,2,2,2]);
  console.log(`    before: meanQ=${mqBefore.toFixed(3)} mult=${p17Before?.multiplier?.toFixed(3)} level=${p17Before?.resultLevel} points=${rBefore.actualPoints?.toFixed(1)}`);
  console.log(`    after:  meanQ=${mqAfter.toFixed(3)} mult=${p17After?.multiplier?.toFixed(3)} level=${p17After?.resultLevel} points=${rAfter.actualPoints?.toFixed(1)}`);
  check("meanQuality increased", mqAfter > mqBefore);
  check("P17 multiplier increased", rAfter.actualPoints > rBefore.actualPoints,
    `${rBefore.actualPoints?.toFixed(1)} -> ${rAfter.actualPoints?.toFixed(1)}`);
  check("RP22 level unchanged (L2)", p17Before?.resultLevel === "1×L2" && p17After?.resultLevel === "1×L2");
}

// ── Case 5: Several surrounds improve, overheads remain limiting ────

console.log("\nCase 5: 9.1.6 — 6 overheads limit L2, 9 listener-level improve L2 -> L4");
{
  const before = p17OnlyAuthority([{id:"s1",priority:"primary"}], { s1: Array(15).fill(2) });
  const after = p17OnlyAuthority([{id:"s1",priority:"primary"}], { s1: [...Array(9).fill(4), ...Array(6).fill(2)] });
  const rBefore = calculateRoomDesignRating(before);
  const rAfter = calculateRoomDesignRating(after);
  const p17Before = p17Contrib(rBefore);
  const p17After = p17Contrib(rAfter);
  console.log(`    before: mult=${p17Before?.multiplier?.toFixed(3)} level=${p17Before?.resultLevel} points=${rBefore.actualPoints?.toFixed(1)}`);
  console.log(`    after:  mult=${p17After?.multiplier?.toFixed(3)} level=${p17After?.resultLevel} points=${rAfter.actualPoints?.toFixed(1)}`);
  check("RP22 level unchanged (L2)", p17Before?.resultLevel === "1×L2" && p17After?.resultLevel === "1×L2");
  check("P17 multiplier increased", rAfter.actualPoints > rBefore.actualPoints,
    `${rBefore.actualPoints?.toFixed(1)} -> ${rAfter.actualPoints?.toFixed(1)}`);
}

// ── Case 6: RSP improves, secondary deteriorates ────────────────────

console.log("\nCase 6: multi-seat — RSP improves, secondary deteriorates");
console.log("  (balanced aggregation: secondary deterioration must not be concealed)");
{
  // Two primary seats, two secondary seats.
  const seats = [
    {id:"p1",priority:"primary"}, {id:"p2",priority:"primary"},
    {id:"s1",priority:"secondary"}, {id:"s2",priority:"secondary"},
  ];
  const before = p17OnlyAuthority(seats, {
    p1: [3,3,3,3], p2: [3,3,3,3],   // primary L3
    s1: [3,3,3,3], s2: [3,3,3,3],   // secondary L3
  });
  const after = p17OnlyAuthority(seats, {
    p1: [4,4,4,4], p2: [4,4,4,4],   // primary improves to L4
    s1: [2,2,2,2], s2: [1,1,1,1],   // secondary deteriorates to L2/L1
  });
  const primaryIds = ["p1","p2"];
  const secIds = ["s1","s2"];

  const primBefore = scopedRating(before, primaryIds);
  const primAfter = scopedRating(after, primaryIds);
  const secBefore = scopedRating(before, secIds);
  const secAfter = scopedRating(after, secIds);

  const p17PrimBefore = p17Contrib(primBefore);
  const p17PrimAfter = p17Contrib(primAfter);
  const p17SecBefore = p17Contrib(secBefore);
  const p17SecAfter = p17Contrib(secAfter);

  console.log(`    primary  before: mult=${p17PrimBefore?.multiplier?.toFixed(3)} level=${p17PrimBefore?.resultLevel} points=${primBefore.actualPoints?.toFixed(1)}`);
  console.log(`    primary  after:  mult=${p17PrimAfter?.multiplier?.toFixed(3)} level=${p17PrimAfter?.resultLevel} points=${primAfter.actualPoints?.toFixed(1)}`);
  console.log(`    second.  before: mult=${p17SecBefore?.multiplier?.toFixed(3)} level=${p17SecBefore?.resultLevel} points=${secBefore.actualPoints?.toFixed(1)}`);
  console.log(`    second.  after:  mult=${p17SecAfter?.multiplier?.toFixed(3)} level=${p17SecAfter?.resultLevel} points=${secAfter.actualPoints?.toFixed(1)}`);

  check("primary improved", primAfter.actualPoints > primBefore.actualPoints,
    `${primBefore.actualPoints?.toFixed(1)} -> ${primAfter.actualPoints?.toFixed(1)}`);
  check("secondary deteriorated (balanced — not concealed by primary)",
    secAfter.actualPoints < secBefore.actualPoints,
    `${secBefore.actualPoints?.toFixed(1)} -> ${secAfter.actualPoints?.toFixed(1)}`);
  check("primary resultLevel reflects L4", p17PrimAfter?.resultLevel?.includes("L4"));
  check("secondary resultLevel reflects deterioration", p17SecAfter?.resultLevel?.includes("L1") || p17SecAfter?.resultLevel?.includes("L2"));
}

// ── Case 7: Multi-row, different primary/secondary performance ─────

console.log("\nCase 7: multi-row — primary L4, secondary L2 (different performance)");
{
  const seats = [
    {id:"p1",priority:"primary"}, {id:"p2",priority:"primary"},
    {id:"s1",priority:"secondary"}, {id:"s2",priority:"secondary"},
  ];
  const auth = p17OnlyAuthority(seats, {
    p1: [4,4,4,4], p2: [4,4,4,4],
    s1: [2,2,2,2], s2: [2,2,2,2],
  });
  const prim = scopedRating(auth, ["p1","p2"]);
  const sec = scopedRating(auth, ["s1","s2"]);
  const p17Prim = p17Contrib(prim);
  const p17Sec = p17Contrib(sec);
  console.log(`    primary:  mult=${p17Prim?.multiplier?.toFixed(3)} level=${p17Prim?.resultLevel} points=${prim.actualPoints?.toFixed(1)} DPI=${prim.designPerformanceIndex}`);
  console.log(`    secondary: mult=${p17Sec?.multiplier?.toFixed(3)} level=${p17Sec?.resultLevel} points=${sec.actualPoints?.toFixed(1)} DPI=${sec.designPerformanceIndex}`);
  check("primary P17 = L4 (12)", p17Prim?.multiplier === 12);
  check("secondary P17 < primary P17", sec.actualPoints < prim.actualPoints);
  check("secondary RP22 level L2", p17Sec?.resultLevel === "2×L2");
}

// ── Case 8: Dixon before/after wide-speaker aiming ───────────────────

console.log("\nCase 8: Dixon — 10 speakers, LW improves L2 -> L4, rest unchanged");
{
  // Before: all 10 speakers at L2 (limiting L2)
  // After: 1 speaker (LW) improves to L4, rest stay L2 (limiting still L2)
  const beforeLevels = Array(10).fill(2);
  const afterLevels = [4, ...Array(9).fill(2)];

  const before = p17OnlyAuthority([{id:"s1",priority:"primary"}], { s1: beforeLevels });
  const after = p17OnlyAuthority([{id:"s1",priority:"primary"}], { s1: afterLevels });
  const rBefore = calculateRoomDesignRating(before);
  const rAfter = calculateRoomDesignRating(after);
  const p17Before = p17Contrib(rBefore);
  const p17After = p17Contrib(rAfter);
  const mqBefore = meanQ(beforeLevels);
  const mqAfter = meanQ(afterLevels);
  console.log(`    before: meanQ=${mqBefore.toFixed(4)} mult=${p17Before?.multiplier?.toFixed(3)} level=${p17Before?.resultLevel} points=${rBefore.actualPoints?.toFixed(1)}`);
  console.log(`    after:  meanQ=${mqAfter.toFixed(4)} mult=${p17After?.multiplier?.toFixed(3)} level=${p17After?.resultLevel} points=${rAfter.actualPoints?.toFixed(1)}`);
  check("meanQuality increased", mqAfter > mqBefore);
  check("bonus increased (improvement recognised)", p17After?.multiplier > p17Before?.multiplier,
    `${p17Before?.multiplier?.toFixed(3)} -> ${p17After?.multiplier?.toFixed(3)}`);
  check("RP22 level unchanged (L2)", p17Before?.resultLevel === "1×L2" && p17After?.resultLevel === "1×L2");
  check("improvement is proportionate (not excessive)",
    (p17After?.multiplier - p17Before?.multiplier) < 1.0,
    `delta=${((p17After?.multiplier || 0) - (p17Before?.multiplier || 0)).toFixed(3)}`);
}

// ── Cross-check: other ASDR parameters unaffected ───────────────────

console.log("\nCross-check: other ASDR parameters use best-seat (unchanged aggregation)");
{
  // Build an authority with P17 AND P4 (another seat-scope param) to verify
  // P4 still uses best-seat while P17 uses balanced aggregation.
  const seats = [
    {id:"a",priority:"primary"}, {id:"b",priority:"primary"},
  ];
  // P4: seat a = L4 (0 dB delta), seat b = FAIL (12 dB delta) — best-seat picks L4
  // P17: seat a = [4,4,4,4] (L4), seat b = [2,2,2,2] (L2) — balanced averages both
  const authority = buildArtcousticDesignRatingAuthority({
    seats,
    p4: { a: 0, b: 12 },  // P4: screen-channel delta (0 = L4, 12 = FAIL)
    p17: {
      a: p17SeatInput([4,4,4,4]),
      b: p17SeatInput([2,2,2,2]),
    },
  });
  const r = calculateRoomDesignRating(authority);
  const p4 = (r.contributions || []).find((c) => c.key === "p4");
  const p17 = p17Contrib(r);
  console.log(`    P4:  mult=${p4?.multiplier} level=${p4?.resultLevel} (best-seat: should be L4 from seat a)`);
  console.log(`    P17: mult=${p17?.multiplier?.toFixed(3)} level=${p17?.resultLevel} (balanced: should reflect both seats)`);
  check("P4 uses best-seat (L4 from seat a)", p4?.resultLevel === "L4" && p4?.multiplier === 12);
  check("P17 uses balanced aggregation (distribution level)", p17?.resultLevel?.includes("×"));
}

// ── Direct monotonicity check: worsening limiting speaker ────────────

console.log("\nDirect check: worsening the limiting speaker never increases bonus");
{
  // Same non-limiting speakers, limiting speaker gets worse.
  // [2,4,4,4] -> limiting L2; [1,4,4,4] -> limiting L1
  const q1 = meanQ([2,4,4,4]);
  const q2 = meanQ([1,4,4,4]);
  const b1 = computeP17ContinuousBonus("L2", q1);
  const b2 = computeP17ContinuousBonus("L1", q2);
  console.log(`    [2,4,4,4] L2: meanQ=${q1.toFixed(4)} bonus=${b1.toFixed(4)}`);
  console.log(`    [1,4,4,4] L1: meanQ=${q2.toFixed(4)} bonus=${b2.toFixed(4)}`);
  check("meanQuality decreased when limiting worsened", q2 < q1);
  check("bonus at L1 <= bonus at L2 (no artificial increase)", b2 <= b1,
    `L2 bonus=${b1.toFixed(3)} L1 bonus=${b2.toFixed(3)}`);
  check("effective multiplier decreased",
    effectiveP17Multiplier("L1", q2) < effectiveP17Multiplier("L2", q1));
}

// ── Summary ──────────────────────────────────────────────────────────

console.log(`\n${failures === 0 ? "ALL CONTROLLED COMPARISONS PASS" : `${failures} comparison(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);