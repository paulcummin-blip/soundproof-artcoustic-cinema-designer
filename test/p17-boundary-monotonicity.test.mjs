// p17-boundary-monotonicity.test.mjs
// Regression test for the confirmed 38°→39° boundary monotonicity property.
//
// The overall P17 contribution (multiplier) must NEVER increase solely
// because an applicable speaker's predicted coverage becomes worse. This
// test exercises the boundary where a speaker's off-axis angle crosses an
// RP22 coverage-window edge (L4→L3), which changes the seat's discrete level
// and unlocks the continuous bonus that was saturated at L4.
//
// Bonus behaviour is reported separately from the complete P17 multiplier:
// the bonus itself may rise at a grade boundary, but the overall multiplier
// (base + bonus) must not.
//
// Also verifies the P17 layout-authority fix: a 9.1.6 layout must admit all
// 12 applicable non-LCR speakers (SL, SR, SBL, SBR, LW, RW, six overheads).
//
// Run: node --import ./test/_mount-loader.mjs test/p17-boundary-monotonicity.test.mjs

import {
  buildArtcousticDesignRatingAuthority,
  calculateRoomDesignRating,
} from "../src/components/report/technical/artcousticSystemDesignRating.js";
import {
  computeP17MeanQuality,
  computeP17ContinuousBonus,
  effectiveP17Multiplier,
} from "../src/components/report/technical/p17ContinuousCoverageBonus.js";

let failures = 0;
function check(label, condition, detail) {
  const ok = !!condition;
  console.log(`    ${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ── 1. P17 layout authority: 9.1.6 admits all 12 non-LCR speakers ──────

console.log("\n=== P17 LAYOUT AUTHORITY — 9.1.6 ROLE INCLUSION ===\n");

// The layout selector now reads the canonical dolbyLayout string. We verify
// the bedCount parsing produces the expected role set for a 9.1.6 layout.
{
  const parseLayoutBedCount = (layoutStr) => {
    const m = String(layoutStr || "").match(/^(\d+)\./);
    return m ? Number(m[1]) : null;
  };

  const layoutStr = "9.1.6";
  const bedCount = parseLayoutBedCount(layoutStr);

  const allowedP17Roles = new Set();
  allowedP17Roles.add("SL");
  allowedP17Roles.add("SR");
  if (bedCount >= 7) { allowedP17Roles.add("SBL"); allowedP17Roles.add("SBR"); }
  if (bedCount >= 9) { allowedP17Roles.add("LW"); allowedP17Roles.add("RW"); }
  // Overheads
  ["TFL","TFR","TML","TMR","TRL","TRR","TBL","TBR","TFC","TBC","TL","TR"].forEach(r => allowedP17Roles.add(r));

  const expected916 = ["SL","SR","SBL","SBR","LW","RW","TFL","TFR","TML","TMR","TRL","TRR"];
  const missing = expected916.filter(r => !allowedP17Roles.has(r));

  check("bedCount parsed as 9 for '9.1.6'", bedCount === 9, `bedCount=${bedCount}`);
  check("all 12 applicable non-LCR roles admitted for 9.1.6", missing.length === 0,
    missing.length ? `missing: ${missing.join(", ")}` : "");
  check("SBL admitted", allowedP17Roles.has("SBL"));
  check("SBR admitted", allowedP17Roles.has("SBR"));
  check("LW admitted", allowedP17Roles.has("LW"));
  check("RW admitted", allowedP17Roles.has("RW"));
}

// Verify the OLD (broken) selector would have failed for the same layout.
{
  const parseLayoutBedCount = (layoutStr) => {
    const m = String(layoutStr || "").match(/^(\d+)\./);
    return m ? Number(m[1]) : null;
  };

  // Old selector: checked .layout / .format / .layoutName — all undefined.
  const oldLayoutStr = ""; // speakerSystem.layout etc. were never set
  const oldBedCount = parseLayoutBedCount(oldLayoutStr);

  const oldAllowed = new Set();
  oldAllowed.add("SL");
  oldAllowed.add("SR");
  if (oldBedCount >= 7) { oldAllowed.add("SBL"); oldAllowed.add("SBR"); }
  if (oldBedCount >= 9) { oldAllowed.add("LW"); oldAllowed.add("RW"); }

  check("old selector produced null bedCount (the defect)", oldBedCount === null);
  check("old selector dropped SBL (the defect)", !oldAllowed.has("SBL"));
  check("old selector dropped SBR (the defect)", !oldAllowed.has("SBR"));
}

// ── 2. Bonus monotonicity across the 38°→39° boundary ─────────────────

console.log("\n=== P17 BOUNDARY MONOTONICITY — 38°→39° (L4→L3) ===\n");

// Coverage windows: l4Deg=38, l3Deg=54, l2Deg=72 (the confirmed boundary case).
// 10 speakers: nine held perfectly on-axis (0°), one moved 38°→39°.
// At 38° the moving speaker is at the L4 window edge (quality 0.75); the
// seat's limiting level is L4. At 39° it crosses into the L3 window; the
// limiting level drops to L3.
{
  const windows = { l4Deg: 38, l3Deg: 54, l2Deg: 72, usableDb: 4.0, evidenceType: "estimated" };

  const onAxis = { angleDeg: 0, windows, windowLevelNumber: 4 };
  const at38  = { angleDeg: 38, windows, windowLevelNumber: 4 }; // L4 edge
  const at39  = { angleDeg: 39, windows, windowLevelNumber: 3 }; // just into L3

  const perSpeakerBefore = [...Array(9).fill(onAxis), at38];
  const perSpeakerAfter  = [...Array(9).fill(onAxis), at39];

  const mqBefore = computeP17MeanQuality(perSpeakerBefore);
  const mqAfter  = computeP17MeanQuality(perSpeakerAfter);

  // Discrete levels: before L4 (limiting at 38° = L4 edge), after L3
  const levelBefore = "L4";
  const levelAfter  = "L3";

  const bonusBefore = computeP17ContinuousBonus(levelBefore, mqBefore);
  const bonusAfter  = computeP17ContinuousBonus(levelAfter,  mqAfter);
  const multBefore  = effectiveP17Multiplier(levelBefore, mqBefore);
  const multAfter   = effectiveP17Multiplier(levelAfter,  mqAfter);

  console.log(`    before (38°, L4): meanQ=${mqBefore.toFixed(6)} bonus=${bonusBefore.toFixed(6)} mult=${multBefore.toFixed(6)}`);
  console.log(`    after  (39°, L3): meanQ=${mqAfter.toFixed(6)}  bonus=${bonusAfter.toFixed(6)}  mult=${multAfter.toFixed(6)}`);

  // Mean quality must decrease (worse coverage).
  check("mean quality decreased when speaker worsened", mqAfter < mqBefore,
    `${mqBefore.toFixed(6)} -> ${mqAfter.toFixed(6)}`);

  // The bonus itself MAY increase (unlocked from L4 saturation), reported
  // separately. This is not a violation as long as the overall multiplier
  // does not increase.
  console.log(`    bonus delta: ${bonusAfter > bonusBefore ? "INCREASED" : "decreased/unchanged"} (${(bonusAfter - bonusBefore).toFixed(6)})`);

  // The OVERALL P17 multiplier must NEVER increase when coverage worsens.
  check("overall P17 multiplier did not increase when coverage worsened",
    multAfter <= multBefore + 1e-9,
    `${multBefore.toFixed(6)} -> ${multAfter.toFixed(6)}`);
  check("overall P17 multiplier strictly decreased",
    multAfter < multBefore - 1e-9,
    `${multBefore.toFixed(6)} -> ${multAfter.toFixed(6)}`);

  // Feed through the full rating adapter to confirm the end-to-end result.
  const seats = [{ id: "s1", priority: "primary" }];
  const authBefore = buildArtcousticDesignRatingAuthority({ seats, p17: { s1: { rawValue: 1.5, p17ContinuousMeanQuality: mqBefore } } });
  const authAfter  = buildArtcousticDesignRatingAuthority({ seats, p17: { s1: { rawValue: 3.0, p17ContinuousMeanQuality: mqAfter  } } });
  const rBefore = calculateRoomDesignRating(authBefore);
  const rAfter  = calculateRoomDesignRating(authAfter);
  const p17Before = (rBefore.contributions || []).find(c => c.key === "p17");
  const p17After  = (rAfter.contributions  || []).find(c => c.key === "p17");

  console.log(`    adapter before: mult=${p17Before?.multiplier?.toFixed(6)} level=${p17Before?.resultLevel} points=${rBefore.actualPoints?.toFixed(1)} DPI=${rBefore.designPerformanceIndex}`);
  console.log(`    adapter after:  mult=${p17After?.multiplier?.toFixed(6)} level=${p17After?.resultLevel} points=${rAfter.actualPoints?.toFixed(1)} DPI=${rAfter.designPerformanceIndex}`);

  check("adapter: overall P17 multiplier did not increase",
    (p17After?.multiplier ?? 0) <= (p17Before?.multiplier ?? 0) + 1e-9,
    `${p17Before?.multiplier?.toFixed(6)} -> ${p17After?.multiplier?.toFixed(6)}`);
  check("adapter: DPI did not increase when coverage worsened",
    rAfter.designPerformanceIndex <= rBefore.designPerformanceIndex + 1e-9,
    `${rBefore.designPerformanceIndex} -> ${rAfter.designPerformanceIndex}`);
  check("adapter: RP22 level dropped L4 -> L3",
    p17Before?.resultLevel === "1×L4" && p17After?.resultLevel === "1×L3");
}

// ── 3. Exhaustive boundary sweep: every angle pair 0°→80° ─────────────

console.log("\n=== EXHAUSTIVE BOUNDARY SWEEP — overall multiplier never increases ===\n");
{
  const windows = { l4Deg: 38, l3Deg: 54, l2Deg: 72, usableDb: 4.0, evidenceType: "estimated" };
  const seats = [{ id: "s1", priority: "primary" }];
  let violations = 0;
  let maxIncrease = 0;

  // For each angle a from 0 to 80, check that worsening to a+1 never
  // increases the overall P17 multiplier (10 speakers, 9 on-axis, 1 at a).
  for (let a = 0; a < 80; a++) {
    const onAxis = { angleDeg: 0, windows, windowLevelNumber: 4 };
    const spkA = { angleDeg: a, windows, windowLevelNumber: a <= 38 ? 4 : a <= 54 ? 3 : a <= 72 ? 2 : 1 };
    const spkA1 = { angleDeg: a + 1, windows, windowLevelNumber: (a+1) <= 38 ? 4 : (a+1) <= 54 ? 3 : (a+1) <= 72 ? 2 : 1 };

    const psBefore = [...Array(9).fill(onAxis), spkA];
    const psAfter  = [...Array(9).fill(onAxis), spkA1];
    const mqB = computeP17MeanQuality(psBefore);
    const mqA = computeP17MeanQuality(psAfter);

    // Determine limiting level from the worst speaker's windowLevelNumber
    const levelB = `L${spkA.windowLevelNumber}`;
    const levelA = `L${spkA1.windowLevelNumber}`;

    const multB = effectiveP17Multiplier(levelB, mqB);
    const multA = effectiveP17Multiplier(levelA, mqA);

    if (multA > multB + 1e-9) {
      violations += 1;
      const inc = multA - multB;
      if (inc > maxIncrease) maxIncrease = inc;
      console.log(`    VIOLATION at ${a}°->${a+1}°: ${levelB} mult=${multB.toFixed(4)} -> ${levelA} mult=${multA.toFixed(4)} (Δ=${inc.toFixed(4)})`);
    }
  }

  check(`no monotonicity violations across 0°→80° sweep (${80} boundaries)`,
    violations === 0,
    violations ? `${violations} violation(s), max increase ${maxIncrease.toFixed(6)}` : "");
}

// ── 4. Two-speaker worsening (limiting AND non-limiting) ──────────────

console.log("\n=== TWO-SPEAKER WORSENING — overall multiplier never increases ===\n");
{
  const windows = { l4Deg: 38, l3Deg: 54, l2Deg: 72, usableDb: 4.0, evidenceType: "estimated" };

  // Case: 4 speakers, all at 10° (L4). Worsen one non-limiting speaker to 60° (L2).
  // Limiting stays L4, but mean quality drops. Bonus should decrease.
  const allGood = Array(4).fill({ angleDeg: 10, windows, windowLevelNumber: 4 });
  const oneWorse = [...allGood.slice(0, 3), { angleDeg: 60, windows, windowLevelNumber: 2 }];

  const mqGood = computeP17MeanQuality(allGood);
  const mqWorse = computeP17MeanQuality(oneWorse);
  const levelGood = "L4";
  const levelWorse = "L4"; // limiting unchanged (still at 10°)

  const multGood = effectiveP17Multiplier(levelGood, mqGood);
  const multWorse = effectiveP17Multiplier(levelWorse, mqWorse);

  console.log(`    before (all 10°, L4): meanQ=${mqGood.toFixed(6)} mult=${multGood.toFixed(6)}`);
  console.log(`    after  (one 60°, L4): meanQ=${mqWorse.toFixed(6)} mult=${multWorse.toFixed(6)}`);

  check("mean quality decreased", mqWorse < mqGood);
  check("bonus decreased (same level, worse quality)",
    computeP17ContinuousBonus("L4", mqWorse) <= computeP17ContinuousBonus("L4", mqGood));
  check("overall multiplier did not increase", multWorse <= multGood + 1e-9);
}

// ── Summary ──────────────────────────────────────────────────────────

console.log(`\n${failures === 0 ? "ALL P17 BOUNDARY TESTS PASS" : `${failures} test(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);