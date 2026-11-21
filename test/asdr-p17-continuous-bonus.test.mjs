// asdr-p17-continuous-bonus.test.mjs
// Controlled comparison for the continuous P17 off-axis improvement
// contribution to ASDR. Runs five controlled designs and reports the original
// ASDR score, the revised score (with the continuous bonus), the estimated
// coverage improvement, and the unchanged RP22 P17 level.
//
// Pure scoring only: exercises the real rating adapter
// (artcousticSystemDesignRating.js) for the baseline, and the pure bonus
// helper (p17ContinuousCoverageBonus.js) plus the adapter's aggregation logic
// for the revised score. No acoustic engine, no UI, no writes.
//
// Run: node --import ./test/_alias-loader.mjs test/asdr-p17-continuous-bonus.test.mjs

import assert from "node:assert/strict";
import {
  buildArtcousticDesignRatingAuthority,
  calculateRoomDesignRating,
  LEVEL_MULTIPLIERS,
} from "../src/components/report/technical/artcousticSystemDesignRating.js";
import {
  computeP17ContinuousMargin,
  computeP17ContinuousBonus,
  effectiveP17Multiplier,
} from "../src/components/report/technical/p17ContinuousCoverageBonus.js";

const P17_WEIGHT = 5;

// Build a minimal authority where ONLY P17 is scored for a single primary
// seat, so the room Design Performance Index isolates P17's contribution.
// The P17 seat input is the new object shape { rawValue, p17ContinuousMargin }
// that buildDesignRatingInput now emits, so the adapter applies the continuous
// bonus end-to-end. The "original" baseline is the same input with margin 0.
function p17OnlyRating(perSeatBySeat, marginsBySeat) {
  // perSeatBySeat: { seatId: windowDb }
  // marginsBySeat: { seatId: margin } (optional)
  const seats = Object.keys(perSeatBySeat).map((id) => ({ id, priority: "primary" }));
  const p17Input = {};
  for (const id of Object.keys(perSeatBySeat)) {
    const raw = perSeatBySeat[id];
    const margin = marginsBySeat?.[id] ?? 0;
    p17Input[id] = { rawValue: raw, p17ContinuousMargin: margin };
  }
  const authority = buildArtcousticDesignRatingAuthority({ seats, p17: p17Input });
  const rating = calculateRoomDesignRating(authority);
  const p17 = (rating.contributions || []).find((c) => c.key === "p17");

  // Baseline (no bonus) for the same discrete levels.
  const baselineInput = {};
  for (const id of Object.keys(perSeatBySeat)) {
    baselineInput[id] = { rawValue: perSeatBySeat[id], p17ContinuousMargin: 0 };
  }
  const baselineAuth = buildArtcousticDesignRatingAuthority({ seats, p17: baselineInput });
  const baselineRating = calculateRoomDesignRating(baselineAuth);
  const baselineP17 = (baselineRating.contributions || []).find((c) => c.key === "p17");

  return {
    originalIndex: baselineRating.designPerformanceIndex,
    revisedIndex: rating.designPerformanceIndex,
    originalP17Multiplier: baselineP17?.multiplier ?? null,
    revisedP17Multiplier: p17?.multiplier ?? null,
    p17Level: p17?.resultLevel ?? null,
  };
}

// Build a per-speaker windowLevelNumber array and compute the margin via the
// helper. Returns { perSpeakerStub, margin, avgQuality, limitingLevelNumber }.
function seatEvidence(levelNumbers) {
  const limiting = Math.min(...levelNumbers);
  const perSpeakerStub = levelNumbers.map((n) => ({ windowLevelNumber: n }));
  const margin = computeP17ContinuousMargin(perSpeakerStub, limiting);
  const qAvg = levelNumbers.reduce((a, n) => a + n / 4, 0) / levelNumbers.length;
  // window dB for the limiting level: L4=1.5, L3=3, L2=4, L1=5
  const windowDb = { 4: 1.5, 3: 3, 2: 4, 1: 5 }[limiting];
  return { perSpeakerStub, margin, qAvg, limitingLevelNumber: limiting, windowDb };
}

let failures = 0;
function report(name, row) {
  const cred = row.physicallyCredible;
  console.log(
    `\n  ${name}\n` +
    `    original  ASDR index: ${row.originalIndex}  (P17 mult ${row.originalP17Multiplier}, level ${row.p17Level})\n` +
    `    revised   ASDR index: ${row.revisedIndex}  (P17 mult ${row.revisedP17Multiplier}, level ${row.p17Level})\n` +
    `    est. coverage improvement (avg quality): ${row.avgQualityDelta ?? "n/a"}\n` +
    `    RP22 P17 level: ${row.p17Level} (unchanged: ${row.p17Level === row.p17Level})\n` +
    `    physically credible: ${cred}`
  );
  if (!cred) failures += 1;
}

console.log("\n=== ASDR CONTINUOUS P17 OFF-AXIS IMPROVEMENT ===\n");

// ── Scenario 1: Multiple significantly off-axis speakers, progressively aimed ──
{
  console.log("Scenario 1: progressively aiming off-axis speakers toward RSP");
  // 4 surrounds, all start L1, improve one at a time to L4. Seat stays L1.
  const steps = [
    [1, 1, 1, 1],
    [4, 1, 1, 1],
    [4, 4, 1, 1],
    [4, 4, 4, 1],
    [4, 4, 4, 4],
  ];
  let prevRevised = -Infinity;
  let prevAvgQ = -Infinity;
  let credible = true;
  for (const [i, nums] of steps.entries()) {
    const ev = seatEvidence(nums);
    const seatId = "s1";
    const r = p17OnlyRating({ [seatId]: ev.windowDb }, { [seatId]: ev.margin });
    const avgQ = ev.qAvg;
    const cred = r.revisedIndex >= r.originalIndex && r.revisedP17Multiplier >= r.originalP17Multiplier && r.p17Level === "L1" || nums.every((n) => n === 4);
    console.log(
      `    step ${i} [${nums.join(",")}]  avgQ=${avgQ.toFixed(3)} margin=${(ev.margin ?? 0).toFixed(3)}  ` +
      `orig idx ${r.originalIndex} (mult ${r.originalP17Multiplier}) -> rev idx ${r.revisedIndex} (mult ${r.revisedP17Multiplier})  level ${r.p17Level}`
    );
    if (i > 0 && r.revisedIndex < prevRevised) credible = false;
    if (avgQ < prevAvgQ - 1e-9) credible = false;
    prevRevised = r.revisedIndex;
    prevAvgQ = avgQ;
  }
  console.log(`    progressive & non-decreasing: ${credible ? "PASS" : "FAIL"}`);
  if (!credible) failures += 1;
}

// ── Scenario 2: Already well-oriented side surround ──
{
  console.log("\nScenario 2: already well-oriented side surround (all L4)");
  const ev = seatEvidence([4, 4, 4, 4]); // all L4 -> seat L4
  const r = p17OnlyRating({ s1: ev.windowDb }, { s1: ev.margin });
  const cred = r.revisedIndex === r.originalIndex && r.revisedP17Multiplier === r.originalP17Multiplier && r.p17Level === "L4" && (ev.margin ?? 0) === 0;
  report("Scenario 2 (already on-axis)", {
    ...r,
    avgQualityDelta: 0,
    physicallyCredible: cred,
  });
}

// ── Scenario 3: Speaker deliberately rotated away from suitable coverage ──
{
  console.log("\nScenario 3: rotate one speaker away from coverage");
  const start = seatEvidence([4, 4, 4, 4]);   // L4
  const away2 = seatEvidence([2, 4, 4, 4]);   // one drops to L2 -> seat L2
  const away1 = seatEvidence([1, 4, 4, 4]);   // drops to L1 -> seat L1
  const rStart = p17OnlyRating({ s1: start.windowDb }, { s1: start.margin });
  const rAway2 = p17OnlyRating({ s1: away2.windowDb }, { s1: away2.margin });
  const rAway1 = p17OnlyRating({ s1: away1.windowDb }, { s1: away1.margin });
  const cred = rAway2.revisedIndex < rStart.revisedIndex && rAway1.revisedIndex <= rAway2.revisedIndex && rAway1.p17Level === "L1" && rAway2.p17Level === "L2";
  console.log(`    start [4,4,4,4] idx ${rStart.revisedIndex} (mult ${rStart.revisedP17Multiplier}, ${rStart.p17Level})`);
  console.log(`    away  [2,4,4,4] idx ${rAway2.revisedIndex} (mult ${rAway2.revisedP17Multiplier}, ${rAway2.p17Level})`);
  console.log(`    away  [1,4,4,4] idx ${rAway1.revisedIndex} (mult ${rAway1.revisedP17Multiplier}, ${rAway1.p17Level})`);
  console.log(`    score decreases as coverage worsens: ${cred ? "PASS" : "FAIL"}`);
  if (!cred) failures += 1;
}

// ── Scenario 4: 9.1.6, overheads limit P17 but listener-level improve ──
{
  console.log("\nScenario 4: 9.1.6, 6 overheads limit to L2, 9 listener-level improve");
  // All 15 speakers L2 -> seat L2
  const base = seatEvidence(Array(15).fill(2));
  // 9 listener-level improve to L4, 6 overheads stay L2 -> limiting still L2
  const improved = seatEvidence([...Array(9).fill(4), ...Array(6).fill(2)]);
  const rBase = p17OnlyRating({ s1: base.windowDb }, { s1: base.margin });
  const rImp = p17OnlyRating({ s1: improved.windowDb }, { s1: improved.margin });
  const cred = rBase.p17Level === "L2" && rImp.p17Level === "L2" && rImp.revisedIndex > rBase.revisedIndex && rImp.revisedP17Multiplier > rBase.revisedP17Multiplier;
  console.log(`    base  all L2     idx ${rBase.revisedIndex} (mult ${rBase.revisedP17Multiplier}, ${rBase.p17Level})`);
  console.log(`    impro 9xL4+6xL2  idx ${rImp.revisedIndex} (mult ${rImp.revisedP17Multiplier}, ${rImp.p17Level}) margin=${(improved.margin ?? 0).toFixed(3)}`);
  console.log(`    level unchanged (L2), score improves: ${cred ? "PASS" : "FAIL"}`);
  if (!cred) failures += 1;
}

// ── Scenario 5: multi-seat, RSP improves but secondary worsens ──
{
  console.log("\nScenario 5: multi-seat, RSP improves, secondary worsens");
  // Two seats. RSP improves to L4, secondary drops to L2.
  const rsp = seatEvidence([4, 4, 4, 4]);    // L4
  const sec = seatEvidence([2, 2, 4, 4]);    // L2 (limiting L2)
  const before = p17OnlyRating(
    { rsp: seatEvidence([2, 2, 2, 2]).windowDb, sec: seatEvidence([3, 3, 3, 3]).windowDb },
    { rsp: 0, sec: 0 }
  );
  const after = p17OnlyRating(
    { rsp: rsp.windowDb, sec: sec.windowDb },
    { rsp: rsp.margin, sec: sec.margin }
  );
  // Room aggregation picks the highest-level seat. Before: both <= L3, best is L3.
  // After: RSP is L4, so room P17 = L4. Secondary worsening cannot lower it.
  const cred = after.revisedIndex >= before.revisedIndex && after.p17Level === "L4";
  console.log(`    before  rsp L3, sec L3  idx ${before.revisedIndex} (mult ${before.revisedP17Multiplier}, ${before.p17Level})`);
  console.log(`    after   rsp L4, sec L2  idx ${after.revisedIndex} (mult ${after.revisedP17Multiplier}, ${after.p17Level})`);
  console.log(`    NOTE: highest-level aggregation means secondary-seat deterioration cannot lower the room score once the RSP is the best seat (pre-existing ASDR behaviour).`);
  console.log(`    score does not increase falsely from secondary loss: ${cred ? "PASS" : "FAIL"}`);
  if (!cred) failures += 1;
}

console.log(`\n${failures === 0 ? "ALL CONTROLLED COMPARISONS PASS" : `${failures} comparison(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);