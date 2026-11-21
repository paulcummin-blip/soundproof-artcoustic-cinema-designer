// p17-coverage-dixon-validation.test.mjs
// Validation that the properly-scaled continuous coverage contribution makes
// genuine multi-speaker improvements visible in the Design Performance Index.
//
// Uses the actual saved Dixon P17 evidence (Avensys Custom Install, 9.1.6)
// across four aiming configurations, verifying that:
//  1. A substantial multi-speaker improvement produces ~2 displayed DPI.
//  2. Small adjustments produce small changes.
//  3. Worsening coverage reduces the contribution.
//  4. An unchanged design does not receive a general baseline increase.
//  5. Speakers already at excellent coverage receive little or no extra reward.
//
// Run: node --import ./test/_mount-loader.mjs test/p17-coverage-dixon-validation.test.mjs

import {
  buildArtcousticDesignRatingAuthority,
  calculateScopedRoomDesignRating,
} from "../src/components/report/technical/artcousticSystemDesignRating.js";
import {
  computeP17CoveragePoints,
  computeP17MeanQuality,
  P17_COVERAGE_CONSTANTS,
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

// 1. Substantial improvement → ~2 DPI
console.log("1. Substantial multi-speaker improvement (pub1 → pub2):\n");
{
  const pts1 = computeP17CoveragePoints('L2', pub1_c1);
  const pts2 = computeP17CoveragePoints('L2', pub2_c1);
  const delta = pts2 - pts1;
  const dpiDelta = delta / 10;
  const mq1 = computeP17MeanQuality(pub1_c1);
  const mq2 = computeP17MeanQuality(pub2_c1);
  console.log(`    meanQ: ${mq1.toFixed(4)} → ${mq2.toFixed(4)} (old delta=${((mq2-mq1)*5.333).toFixed(2)} mult pts)`);
  console.log(`    coveragePts: ${pts1.toFixed(2)} → ${pts2.toFixed(2)} (Δ=${delta.toFixed(2)} pts = ${dpiDelta.toFixed(2)} DPI)`);
  check("substantial improvement produces ~2 DPI", dpiDelta >= 1.5 && dpiDelta <= 3.0, `${dpiDelta.toFixed(2)} DPI`);
  check("improvement is positive", delta > 0);
  check("old meanQ delta would have been <0.2 DPI", Math.abs((mq2-mq1)*5.333*5/10) < 0.2, `old DPI delta=${((mq2-mq1)*5.333*5/10).toFixed(3)}`);
}

// 2. Small adjustment → small change
console.log("\n2. Small adjustment (pub2 → pub3, LW 16°→14°):\n");
{
  const pts2 = computeP17CoveragePoints('L2', pub2_c1);
  const pts3 = computeP17CoveragePoints('L2', pub3_c1);
  const delta = pts3 - pts2;
  console.log(`    coveragePts: ${pts2.toFixed(2)} → ${pts3.toFixed(2)} (Δ=${delta.toFixed(2)} pts = ${(delta/10).toFixed(3)} DPI)`);
  check("small adjustment produces small positive change", delta > 0 && delta < 5, `${delta.toFixed(2)} pts`);
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

// 4. Unchanged design: no baseline increase
console.log("\n4. Unchanged design / no baseline inflation:\n");
{
  const allPoor = [
    spk('SL',30,bedWin), spk('SR',30,bedWin), spk('LW',50,bedWin), spk('RW',50,bedWin),
    spk('TFL',30,ohWin), spk('TFR',40,ohWin), spk('TML',30,ohWin), spk('TMR',40,ohWin),
    spk('TRL',30,ohWin), spk('TRR',40,ohWin),
  ];
  const poorPts = computeP17CoveragePoints('L2', allPoor);
  const pub1Pts = computeP17CoveragePoints('L2', pub1_c1);
  console.log(`    all-poor design: ${poorPts.toFixed(2)} pts | pub1 (poor wide): ${pub1Pts.toFixed(2)} pts`);
  check("all-poor-coverage design gets 0 contribution", poorPts === 0, `${poorPts.toFixed(2)} pts`);
  check("pub1 contribution is small (not a large baseline)", pub1Pts < 5, `${pub1Pts.toFixed(2)} pts`);
}

// 5. Excellent speakers receive little extra
console.log("\n5. On-axis speakers excluded (already excellent):\n");
{
  const nearOnAxis = [
    spk('SL',0,bedWin), spk('SR',0,bedWin), spk('LW',1,bedWin), spk('RW',2,bedWin),
    spk('TFL',3,ohWin), spk('TFR',4,ohWin), spk('TML',2,ohWin), spk('TMR',3,ohWin),
    spk('TRL',2,ohWin), spk('TRR',4,ohWin),
  ];
  const pts = computeP17CoveragePoints('L2', nearOnAxis);
  // SL, SR at 0° are excluded (on-axis threshold). LW at 1° also excluded (≤1°).
  // The remaining 7 speakers at 2-4° have excellent coverage → near max contribution.
  // Verify the contribution is positive (others contribute) and that on-axis
  // speakers don't inflate it beyond the bound.
  const withOnAxis = computeP17CoveragePoints('L2', [
    spk('SL',0,bedWin), spk('SR',0,bedWin), spk('LW',0,bedWin), spk('RW',0,bedWin),
    spk('TFL',0,ohWin), spk('TFR',0,ohWin), spk('TML',0,ohWin), spk('TMR',0,ohWin),
    spk('TRL',0,ohWin), spk('TRR',0,ohWin),
  ]);
  console.log(`    near-on-axis (SL/SR 0°, others 1-4°): ${pts.toFixed(2)} pts | all-on-axis (all 0°): ${withOnAxis.toFixed(2)} pts`);
  check("on-axis speakers (0°) excluded — all-on-axis gets 0", withOnAxis === 0, `${withOnAxis.toFixed(2)} pts`);
  check("others contribute (near-on-axis > 0)", pts > 0, `${pts.toFixed(2)} pts`);
}

// 6. Full adapter: scoped DPI responds
console.log("\n6. Full adapter: secondary scoped DPI responds to coverage:\n");
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
  const d12 = (r2.designPerformanceIndex||0)-(r1.designPerformanceIndex||0);
  const d23 = (r3.designPerformanceIndex||0)-(r2.designPerformanceIndex||0);
  check("pub1→pub2 DPI increased", d12 > 0, `Δ=${d12}`);
  check("pub1→pub2 DPI delta >= 1", d12 >= 1, `Δ=${d12}`);
  check("pub2→pub3 small DPI change", Math.abs(d23) <= 1, `Δ=${d23}`);
  check("continuousPts on contribution", p1?.continuousPoints != null);
  check("pub2 continuousPts > pub1", (p2?.continuousPoints||0) > (p1?.continuousPoints||0));
}

// 7. Monotonicity sweep
console.log("\n7. Monotonicity: worsening a speaker never increases coverage points:\n");
{
  let violations = 0;
  for (let a = 2; a < 70; a++) {
    const before = [spk('LW',a,bedWin), spk('RW',a,bedWin), ...pub2_c1.slice(0,8)];
    const after = [spk('LW',a+1,bedWin), spk('RW',a+1,bedWin), ...pub2_c1.slice(0,8)];
    const ptsB = computeP17CoveragePoints('L2', before);
    const ptsA = computeP17CoveragePoints('L2', after);
    if (ptsA > ptsB + 1e-9) { violations++; console.log(`    VIOLATION at ${a}°→${a+1}°: ${ptsB.toFixed(3)}→${ptsA.toFixed(3)}`); }
  }
  check("no monotonicity violations (2°→70° sweep)", violations === 0, violations ? `${violations} violation(s)` : "");
}

console.log(`\n${failures === 0 ? "ALL DIXON VALIDATION TESTS PASS" : `${failures} test(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);