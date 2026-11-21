// p17-coverage-dixon-validation.test.mjs
// Validation that the corrected normalised continuous coverage contribution
// makes genuine multi-speaker improvements visible in the raw P17 earned
// points, while respecting speaker-count normalisation and grade ceilings.
//
// Uses the actual saved Dixon P17 evidence (Avensys Custom Install, 9.1.6)
// across aiming configurations, verifying that:
//  1. A substantial multi-speaker improvement produces a positive raw-point
//     delta (visible in the full index, not concealed by rounding).
//  2. Small adjustments produce small changes.
//  3. Worsening coverage reduces the contribution.
//  4. The contribution is normalised by speaker count (no count bias).
//  5. Near-on-axis speakers contribute smoothly (no on-axis exclusion).
//
// Run: node --import ./test/_mount-loader.mjs test/p17-coverage-dixon-validation.test.mjs

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
function check(label, condition, detail) {
  const ok = !!condition;
  console.log(`    ${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const bedWin = { l4Deg: 38, l3Deg: 54, l2Deg: 72 };
const ohWin = { l4Deg: 24.1, l3Deg: 35.2, l2Deg: 40.9 };

function spk(role, angle, win) {
  const wn = win === bedWin
    ? (angle <= 38 ? 4 : angle <= 54 ? 3 : angle <= 72 ? 2 : 1)
    : (angle <= 24.1 ? 4 : angle <= 35.2 ? 3 : angle <= 40.9 ? 2 : 1);
  return { role, angleDeg: angle, windows: win, windowLevelNumber: wn };
}

// Pub1: poor wide aiming. Pub2: substantial improvement. Pub3: small adj from pub2.
const pub1_c1 = [
  spk('SL',0,bedWin), spk('SR',0,bedWin), spk('LW',53,bedWin), spk('RW',27,bedWin),
  spk('TFL',26,ohWin), spk('TFR',41.5,ohWin), spk('TML',14,ohWin), spk('TMR',38,ohWin),
  spk('TRL',25.5,ohWin), spk('TRR',41.5,ohWin),
];
const pub2_c1 = [
  spk('SL',0,bedWin), spk('SR',0,bedWin), spk('LW',16,bedWin), spk('RW',9,bedWin),
  spk('TFL',26,ohWin), spk('TFR',41.5,ohWin), spk('TML',14,ohWin), spk('TMR',38,ohWin),
  spk('TRL',25.5,ohWin), spk('TRR',41.5,ohWin),
];
const pub3_c1 = [
  spk('SL',0,bedWin), spk('SR',0,bedWin), spk('LW',14,bedWin), spk('RW',9,bedWin),
  spk('TFL',26,ohWin), spk('TFR',41.5,ohWin), spk('TML',14,ohWin), spk('TMR',38,ohWin),
  spk('TRL',25.5,ohWin), spk('TRR',41.5,ohWin),
];

console.log("\n=== DIXON P17 COVERAGE CONTRIBUTION VALIDATION ===\n");

// 1. Substantial improvement → positive raw-point delta
console.log("1. Substantial multi-speaker improvement (pub1 → pub2):\n");
{
  const pts1 = computeP17CoveragePoints('L2', pub1_c1);
  const pts2 = computeP17CoveragePoints('L2', pub2_c1);
  const delta = pts2 - pts1;
  const dpiDelta = delta / 10;
  const mq1 = computeP17MeanQuality(pub1_c1);
  const mq2 = computeP17MeanQuality(pub2_c1);
  console.log(`    meanQ: ${mq1.toFixed(4)} → ${mq2.toFixed(4)} (Δ=${(mq2-mq1).toFixed(4)})`);
  console.log(`    coveragePts: ${pts1.toFixed(2)} → ${pts2.toFixed(2)} (Δ=${delta.toFixed(2)} pts = ${dpiDelta.toFixed(3)} DPI)`);
  check("substantial improvement produces positive raw-point delta", delta > 0, `${delta.toFixed(2)} pts`);
  check("improvement is positive", delta > 0);
  check("mean quality increased", mq2 > mq1, `${mq1.toFixed(4)} → ${mq2.toFixed(4)}`);
}

// 2. Small adjustment → small change
console.log("\n2. Small adjustment (pub2 → pub3, LW 16°→14°):\n");
{
  const pts2 = computeP17CoveragePoints('L2', pub2_c1);
  const pts3 = computeP17CoveragePoints('L2', pub3_c1);
  const delta = pts3 - pts2;
  console.log(`    coveragePts: ${pts2.toFixed(2)} → ${pts3.toFixed(2)} (Δ=${delta.toFixed(2)} pts = ${(delta/10).toFixed(3)} DPI)`);
  // On-axis adjustments (both within the L4 window) produce zero change under
  // the deficiency-based policy: speakers already at/above the L4 floor have
  // zero deficiency, so small on-axis re-aiming does not dilute or inflate.
  check("small adjustment produces small or zero change (on-axis = no change)", delta >= 0 && delta < 5, `${delta.toFixed(2)} pts`);
  check("small adjustment DPI < 0.5", Math.abs(delta/10) < 0.5, `${(delta/10).toFixed(3)} DPI`);
}

// 3. Worsening → reduction
console.log("\n3. Worsening coverage (pub2 → pub1):\n");
{
  const pts2 = computeP17CoveragePoints('L2', pub2_c1);
  const pts1 = computeP17CoveragePoints('L2', pub1_c1);
  const delta = pts1 - pts2;
  console.log(`    coveragePts: ${pts2.toFixed(2)} → ${pts1.toFixed(2)} (Δ=${delta.toFixed(2)} pts)`);
  check("worsening reduces the contribution", delta < 0, `${delta.toFixed(2)} pts`);
}

// 4. Speaker-count normalisation
console.log("\n4. Speaker-count normalisation (same avg quality → same contribution):\n");
{
  // All speakers at 20° → identical quality regardless of count
  const q20 = continuousSpeakerQuality(spk('S', 20, bedWin));
  const spk20 = (n) => Array(n).fill(0).map(() => spk('S', 20, bedWin));
  const pts5 = computeP17CoveragePoints('L3', spk20(5));
  const pts7 = computeP17CoveragePoints('L3', spk20(7));
  const pts10 = computeP17CoveragePoints('L3', spk20(10));
  const pts15 = computeP17CoveragePoints('L3', spk20(15));
  console.log(`    5 speakers: ${pts5.toFixed(3)} | 7: ${pts7.toFixed(3)} | 10: ${pts10.toFixed(3)} | 15: ${pts15.toFixed(3)}`);
  check("5/7/10/15 speakers same avg quality → same contribution",
    Math.abs(pts5 - pts10) < 1e-9 && Math.abs(pts7 - pts10) < 1e-9 && Math.abs(pts15 - pts10) < 1e-9,
    `max-min=${(Math.max(pts5,pts7,pts10,pts15)-Math.min(pts5,pts7,pts10,pts15)).toFixed(6)}`);
}

// 5. Near-on-axis smooth saturation (no exclusion)
console.log("\n5. Near-on-axis smooth saturation (no exclusion):\n");
{
  // Improving a speaker 2°→1° must not lose points
  const pts2 = computeP17CoveragePoints('L3', [spk('S',2,bedWin), spk('S',2,bedWin), spk('S',2,bedWin), spk('S',2,bedWin), spk('S',2,bedWin)]);
  const pts1 = computeP17CoveragePoints('L3', [spk('S',1,bedWin), spk('S',1,bedWin), spk('S',1,bedWin), spk('S',1,bedWin), spk('S',1,bedWin)]);
  const pts0 = computeP17CoveragePoints('L3', [spk('S',0,bedWin), spk('S',0,bedWin), spk('S',0,bedWin), spk('S',0,bedWin), spk('S',0,bedWin)]);
  console.log(`    2°: ${pts2.toFixed(3)} | 1°: ${pts1.toFixed(3)} | 0°: ${pts0.toFixed(3)}`);
  check("2°→1° does not lose points (no on-axis reversal)", pts1 >= pts2 - 1e-9, `${pts2.toFixed(3)} → ${pts1.toFixed(3)}`);
  check("1°→0° does not lose points", pts0 >= pts1 - 1e-9, `${pts1.toFixed(3)} → ${pts0.toFixed(3)}`);
  check("on-axis speakers contribute (not excluded)", pts0 > 0, `${pts0.toFixed(3)} pts`);
}

// 6. Full adapter: scoped earned points respond
console.log("\n6. Full adapter: secondary scoped earned points respond to coverage:\n");
{
  const seats = [{id:'c1',priority:'secondary'},{id:'c5',priority:'secondary'}];
  const buildAuth = (perSpeaker) => ({ seats, p17: { c1: {rawValue:4.0,p17PerSpeaker:perSpeaker}, c5: {rawValue:4.0,p17PerSpeaker:perSpeaker} } });
  const r1 = calculateScopedRoomDesignRating(buildArtcousticDesignRatingAuthority(buildAuth(pub1_c1)), ['c1','c5']);
  const r2 = calculateScopedRoomDesignRating(buildArtcousticDesignRatingAuthority(buildAuth(pub2_c1)), ['c1','c5']);
  const r3 = calculateScopedRoomDesignRating(buildArtcousticDesignRatingAuthority(buildAuth(pub3_c1)), ['c1','c5']);
  const p1 = (r1.contributions||[]).find(c=>c.key==='p17');
  const p2 = (r2.contributions||[]).find(c=>c.key==='p17');
  const p3 = (r3.contributions||[]).find(c=>c.key==='p17');
  console.log(`    pub1: mult=${p1?.multiplier?.toFixed(2)} contPts=${p1?.continuousPoints?.toFixed(2)} earned=${p1?.earnedPoints?.toFixed(2)} DPI=${r1.designPerformanceIndex}`);
  console.log(`    pub2: mult=${p2?.multiplier?.toFixed(2)} contPts=${p2?.continuousPoints?.toFixed(2)} earned=${p2?.earnedPoints?.toFixed(2)} DPI=${r2.designPerformanceIndex}`);
  console.log(`    pub3: mult=${p3?.multiplier?.toFixed(2)} contPts=${p3?.continuousPoints?.toFixed(2)} earned=${p3?.earnedPoints?.toFixed(2)} DPI=${r3.designPerformanceIndex}`);
  const e12 = (p2?.earnedPoints||0)-(p1?.earnedPoints||0);
  const e23 = (p3?.earnedPoints||0)-(p2?.earnedPoints||0);
  check("pub1→pub2 earned points increased", e12 > 0, `Δ=${e12.toFixed(2)}`);
  check("pub2→pub3 small earned change", Math.abs(e23) <= 1, `Δ=${e23.toFixed(2)}`);
  check("continuousPts on contribution", p1?.continuousPoints != null);
  check("pub2 continuousPts > pub1", (p2?.continuousPoints||0) > (p1?.continuousPoints||0));
}

// 7. Monotonicity sweep
console.log("\n7. Monotonicity: worsening a speaker never increases coverage points:\n");
{
  let violations = 0;
  let prevPts = null;
  for (let a = 2; a < 70; a++) {
    const before = [spk('LW',a,bedWin), spk('RW',a,bedWin), ...pub2_c1.slice(0,8)];
    const after = [spk('LW',a+1,bedWin), spk('RW',a+1,bedWin), ...pub2_c1.slice(0,8)];
    const ptsB = computeP17CoveragePoints('L2', before);
    const ptsA = computeP17CoveragePoints('L2', after);
    if (ptsA > ptsB + 1e-9) { violations++; console.log(`    VIOLATION at ${a}°→${a+1}°: ${ptsB.toFixed(3)}→${ptsA.toFixed(3)}`); }
  }
  check("no monotonicity violations (2°→70° sweep)", violations === 0, violations ? `${violations} violation(s)` : "");
}

// 8. Grade-boundary monotonicity (L3→L4 no drop)
console.log("\n8. Grade boundary L3→L4: total P17 earned does not drop:\n");
{
  // 5 non-limiting speakers at 10° (excellent). Limiting speaker crosses L3→L4.
  const nonLimiting = Array(5).fill(0).map((_,i) => spk(`NL${i}`, 10, bedWin));
  const below = [spk('LIM', 38.5, bedWin), ...nonLimiting]; // limiting just past l4Deg → L3
  const above = [spk('LIM', 37.5, bedWin), ...nonLimiting]; // limiting just before l4Deg → L4

  const seats = [{id:'s1',priority:'primary'}];
  const authBelow = buildArtcousticDesignRatingAuthority({ seats, p17: { s1: { rawValue: 2.0, p17PerSpeaker: below } } });
  const authAbove = buildArtcousticDesignRatingAuthority({ seats, p17: { s1: { rawValue: 1.5, p17PerSpeaker: above } } });
  const rBelow = calculateScopedRoomDesignRating(authBelow, ['s1']);
  const rAbove = calculateScopedRoomDesignRating(authAbove, ['s1']);
  const eBelow = (rBelow.contributions||[]).find(c=>c.key==='p17')?.earnedPoints ?? 0;
  const eAbove = (rAbove.contributions||[]).find(c=>c.key==='p17')?.earnedPoints ?? 0;
  console.log(`    L3 (limiting 38.5°): earned=${eBelow.toFixed(2)}`);
  console.log(`    L4 (limiting 37.5°): earned=${eAbove.toFixed(2)}`);
  check("L3→L4 earned does not drop", eAbove >= eBelow - 1e-9, `Δ=${(eAbove-eBelow).toFixed(2)}`);
}

console.log(`\n${failures === 0 ? "ALL DIXON VALIDATION TESTS PASS" : `${failures} test(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);