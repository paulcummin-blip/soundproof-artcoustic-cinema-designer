// luxavo-duffy-fresh-stage2-benchmark.mjs
//
// Fresh Luxavo/Duffy Stage 2 benchmark through the NORMAL CURRENT PRODUCTION
// PATH after clearing/invalidating any existing Stage 2 result.
//
// Does NOT run:
//   - old/reference modal solver
//   - batch parity comparison
//   - diagnostics
//   - test-only duplicate calculations
//
// Measures actual:
//   1. batch modal preparation/evaluation (evaluateStage2Placement)
//   2. tuning search (searchDelayOnly + searchLevelAndDelay)
//   3. canonical confirmation for each finalist (evaluateStage2Confirmation + WithTuning)
//   4. persistence/publication (syncStage2PlacementCache — mocked, no DB)
//   5. total Stage 2 elapsed
//   6. finalist count
//
// Then runs normal Improve once using those fresh finalists and measures
// actual button-to-result time (proxy search + canonical confirmation on
// promoted challengers — the same functions the V2 worker calls).
//
// Run: node --import ./test/_alias-register.mjs test/luxavo-duffy-fresh-stage2-benchmark.mjs

import { runFullStage1Search } from '@/components/room/bass/stage1/stage1PlacementEngine';
import {
  evaluateStage2Placement,
  evaluateStage2Confirmation,
  evaluateStage2ConfirmationWithTuning,
} from '@/components/room/bass/stage2/stage2CanonicalEvaluation';
import { searchDelayOnly, searchLevelAndDelay } from '@/components/room/bass/stage2/stage2TuningSearch';
import { searchPolarity, searchGainOnly } from '@/components/room/bass/stage2/stage2TuningSearch';
import { buildP14TargetCombinations } from '@/components/room/bass/p14TargetDefinitions';
import { DEFAULT_BEST_SUB_LAYOUT_PHYSICS } from '@/components/room/bass/best-layout/bestSubLayoutPhysicsSnapshot';
import { DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from '@/components/utils/subwooferCapability';
import { selectAuthoritativeFinalist, hasPrimarySeatRegression } from '@/components/room/bass/best-layout/authoritativeFinalistSelection';

// ── Luxavo/Duffy reference room ──────────────────────────────────────────
const ROOM_DIMS = { widthM: 4.8, lengthM: 7.2, heightM: 2.7 };
const SEATING_POSITIONS = [
  { id: 'r1s1', x: 1.6, y: 2.8, z: 1.2, priority: 'primary' },
  { id: 'r1s2', x: 2.4, y: 2.8, z: 1.2, priority: 'primary' },
  { id: 'r1s3', x: 3.2, y: 2.8, z: 1.2, priority: 'primary' },
  { id: 'r2s1', x: 1.6, y: 4.6, z: 1.2, priority: 'secondary' },
  { id: 'r2s2', x: 2.4, y: 4.6, z: 1.2, priority: 'secondary' },
  { id: 'r2s3', x: 3.2, y: 4.6, z: 1.2, priority: 'secondary' },
];
const RSP_POSITION = { x: 2.4, y: 2.8, z: 1.2 };
const SELECTED_SUB_MODEL = 'SUB2-12';
const AMPLIFIER_POWER_PER_SUB_W = DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;
const SUBWOOFER_BOTTOM_HEIGHT_M = 0.0;

// P14 target: minimum L2 (109 dBC) — the Luxavo/Duffy reference target
const P14_TARGETS = buildP14TargetCombinations();
const TARGET = P14_TARGETS.find((t) => t.basis === 'minimum' && t.level === 2);
const P14_TARGET_BASIS = TARGET.basis;
const P14_TARGET_LEVEL = TARGET.level;
const P14_TARGET_DB = TARGET.db;
const P18_TARGET_BASIS = 'minimum';

// ── Timing helpers ──────────────────────────────────────────────────────
const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

function fmt(ms) { return ms == null ? 'N/A' : `${ms.toFixed(1)} ms`; }

// ── CLEAR / INVALIDATE existing Stage 2 result ───────────────────────────
// In production this is done by markStage2Idle / cache invalidation. Here we
// simply start fresh — no cache hydration, no persisted results.
console.log('═'.repeat(72));
console.log('  LUXAVO/DUFFY FRESH STAGE 2 BENCHMARK — NORMAL PRODUCTION PATH');
console.log('═'.repeat(72));
console.log(`  Room: ${ROOM_DIMS.widthM} × ${ROOM_DIMS.lengthM} × ${ROOM_DIMS.heightM} m`);
console.log(`  Seats: ${SEATING_POSITIONS.length} (2 rows × 3)`);
console.log(`  Subs: 2 × ${SELECTED_SUB_MODEL}`);
console.log(`  Target: ${P14_TARGET_BASIS} L${P14_TARGET_LEVEL} (${P14_TARGET_DB.toFixed(2)} dB)`);
console.log(`  Amplifier power per sub: ${AMPLIFIER_POWER_PER_SUB_W} W`);
console.log('─'.repeat(72));
console.log('  CLEARING STAGE 2 RESULT — fresh run (no cache hydration)');
console.log('─'.repeat(72));

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 1 — Placement search (product-independent, geometric)
// ═══════════════════════════════════════════════════════════════════════════
const stage1Start = now();
const stage1Result = runFullStage1Search({
  roomDims: ROOM_DIMS,
  rspPosition: RSP_POSITION,
  seatingPositions: SEATING_POSITIONS,
  physicsOptions: DEFAULT_BEST_SUB_LAYOUT_PHYSICS,
  generationId: { cancelled: false },
});
const stage1Elapsed = now() - stage1Start;

const stage1Finalists = {
  1: stage1Result.results.one_sub_result?.finalists || [],
  2: stage1Result.results.two_sub_result?.finalists || [],
  4: stage1Result.results.four_sub_result?.finalists || [],
};

console.log(`  Stage 1 elapsed: ${fmt(stage1Elapsed)}`);
console.log(`  Stage 1 finalists: 1-sub=${stage1Finalists[1].length}, 2-sub=${stage1Finalists[2].length}, 4-sub=${stage1Finalists[4].length}`);
console.log('─'.repeat(72));

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 2 — Canonical placement evaluation (2-sub quantity — matches room)
// ═══════════════════════════════════════════════════════════════════════════
//
// The production Stage 2 controller evaluates the SELECTED quantity first
// (2-sub for this room), then 4-sub, then 1-sub. For each quantity:
//   1. Placement phase: evaluateStage2Placement per finalist (batch modal)
//   2. Tuning search: searchDelayOnly + searchLevelAndDelay (main thread)
//   3. Confirmation phase: evaluateStage2Confirmation + WithTuning variants
//
// We replicate the production controller's two-phase flow for the 2-sub
// quantity (the room's actual sub count), then 4-sub and 1-sub.

const QUANTITY_ORDER = [2]; // selected quantity only (room has 2 subs)
const allStage2Results = {};
let totalFinalistCount = 0;
let totalPlacementMs = 0;
let totalTuningSearchMs = 0;
let totalConfirmationMs = 0;
let totalPersistenceMs = 0;

const stage2Start = now();

for (const qty of QUANTITY_ORDER) {
  const finalists = stage1Finalists[qty] || [];
  if (!finalists.length) continue;

  console.log(`\n  ── Quantity: ${qty}-sub (${finalists.length} finalists) ──`);

  const qtyResults = [];
  for (const finalist of finalists) {
    const finalistId = finalist.id;
    const familyId = finalist.familyId;

    // ── 1. PLACEMENT (batch modal preparation/evaluation) ──
    const placementStart = now();
    const rawTransfer = evaluateStage2Placement({
      finalist,
      roomDims: ROOM_DIMS,
      rspPosition: RSP_POSITION,
      seatingPositions: SEATING_POSITIONS,
      selectedSubModel: SELECTED_SUB_MODEL,
      amplifierPowerPerSubW: AMPLIFIER_POWER_PER_SUB_W,
      subwooferBottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M,
    });
    const placementMs = now() - placementStart;
    totalPlacementMs += placementMs;

    if (!rawTransfer) {
      console.log(`    ${finalistId} (${familyId}): PLACEMENT FAILED — ${fmt(placementMs)}`);
      continue;
    }

    // ── 2. TUNING SEARCH (main thread — delay + level+delay) ──
    const tuningStart = now();
    const hasPerSource = !!(rawTransfer.perSourcePerSeatComplexTransfers?.length);
    let delayFinalists = [];
    let levelDelayFinalists = [];
    if (hasPerSource) {
      const rspTransfers = rawTransfer.perSourcePerSeatComplexTransfers.filter((t) => t.seatId === 'rsp');
      const searchSources = rawTransfer.sources?.map((s) => ({ yNorm: s.yNorm ?? 0 })) || [];
      const delayResult = searchDelayOnly(rspTransfers, searchSources);
      delayFinalists = delayResult.finalists || [];
      const levelDelayResult = searchLevelAndDelay(rspTransfers, searchSources);
      levelDelayFinalists = levelDelayResult.finalists || [];
    }
    const tuningMs = now() - tuningStart;
    totalTuningSearchMs += tuningMs;

    // ── 3. CANONICAL CONFIRMATION ──
    const confirmationStart = now();

    // 3a. Placement-only confirmation (always)
    const placementOnlyResult = evaluateStage2Confirmation(rawTransfer, {
      p14TargetBasis: P14_TARGET_BASIS,
      p14TargetLevel: P14_TARGET_LEVEL,
      p14TargetDb: P14_TARGET_DB,
      p18TargetBasis: P18_TARGET_BASIS,
    });

    // 3b. Delay-only variant confirmations (up to 2)
    const delayVariantResults = [];
    for (const df of delayFinalists.slice(0, 2)) {
      const r = evaluateStage2ConfirmationWithTuning(rawTransfer, {
        tuningVariant: 'delay-only',
        tuning: df.tuning,
        p14TargetBasis: P14_TARGET_BASIS,
        p14TargetLevel: P14_TARGET_LEVEL,
        p14TargetDb: P14_TARGET_DB,
        p18TargetBasis: P18_TARGET_BASIS,
      });
      if (r) delayVariantResults.push(r);
    }

    // 3c. Level+delay variant confirmations (up to 2)
    const levelDelayVariantResults = [];
    for (const lf of levelDelayFinalists.slice(0, 2)) {
      const r = evaluateStage2ConfirmationWithTuning(rawTransfer, {
        tuningVariant: 'level-delay',
        tuning: lf.tuning,
        p14TargetBasis: P14_TARGET_BASIS,
        p14TargetLevel: P14_TARGET_LEVEL,
        p14TargetDb: P14_TARGET_DB,
        p18TargetBasis: P18_TARGET_BASIS,
      });
      if (r) levelDelayVariantResults.push(r);
    }

    const confirmationMs = now() - confirmationStart;
    totalConfirmationMs += confirmationMs;

    // Collect all confirmation results for this finalist
    const allConfirmations = [
      ...(placementOnlyResult ? [placementOnlyResult] : []),
      ...delayVariantResults,
      ...levelDelayVariantResults,
    ].filter(Boolean);

    // Pick the best confirmation for this finalist
    const best = allConfirmations.length > 0
      ? allConfirmations.reduce((best, r) => {
          if (!best) return r;
          // Simple: prefer non-limited, then lower P19 variation
          if (!r.limited && best.limited) return r;
          if (r.limited && !best.limited) return best;
          const rP19 = r.achievedP19VariationDb ?? Infinity;
          const bP19 = best.achievedP19VariationDb ?? Infinity;
          return rP19 < bP19 ? r : best;
        }, null)
      : null;

    qtyResults.push({
      finalistId,
      familyId,
      placementMs,
      tuningMs,
      confirmationMs,
      confirmationCount: allConfirmations.length,
      best,
    });
    totalFinalistCount++;

    const p14 = best?.p14AchievedDb ?? null;
    const p19 = best?.achievedP19VariationDb ?? null;
    const p20 = best?.achievedP20VariationDb ?? null;
    console.log(
      `    ${finalistId} (${familyId}): place=${fmt(placementMs)} tune=${fmt(tuningMs)} confirm=${fmt(confirmationMs)} (${allConfirmations.length} variants) P14=${p14?.toFixed(1) ?? 'N/A'} P19=${p19?.toFixed(2) ?? 'N/A'} P20=${p20?.toFixed(2) ?? 'N/A'}`,
    );
  }

  allStage2Results[qty] = qtyResults;
}

// ── 4. PERSISTENCE / PUBLICATION ──
// In production, the controller calls syncStage2PlacementCache (async DB
// write). We measure the sync portion (building the results snapshot) and
// note the async DB write as a fixed cost not included in the benchmark.
const persistenceStart = now();
const resultsSnapshot = {
  one_sub_result: { evaluatedFinalists: allStage2Results[1] || [], finalistCount: allStage2Results[1]?.length || 0 },
  two_sub_result: { evaluatedFinalists: allStage2Results[2] || [], finalistCount: allStage2Results[2]?.length || 0 },
  four_sub_result: { evaluatedFinalists: allStage2Results[4] || [], finalistCount: allStage2Results[4]?.length || 0 },
};
// Simulate the snapshot build cost (sync portion of syncStage2PlacementCache)
const _ = JSON.stringify(resultsSnapshot).length;
const persistenceMs = now() - persistenceStart;
totalPersistenceMs = persistenceMs;

const stage2TotalElapsed = now() - stage2Start;

console.log('\n' + '─'.repeat(72));
console.log('  STAGE 2 SUMMARY');
console.log('─'.repeat(72));
console.log(`  1. Batch modal preparation/evaluation: ${fmt(totalPlacementMs)}`);
console.log(`  2. Tuning search:                      ${fmt(totalTuningSearchMs)}`);
console.log(`  3. Canonical confirmation:             ${fmt(totalConfirmationMs)}`);
console.log(`  4. Persistence/publication (sync):     ${fmt(totalPersistenceMs)}`);
console.log(`  5. Total Stage 2 elapsed:               ${fmt(stage2TotalElapsed)}`);
console.log(`  6. Finalist count:                      ${totalFinalistCount}`);
console.log('─'.repeat(72));

// ═══════════════════════════════════════════════════════════════════════════
// IMPROVE BASS V2 — Normal Improve using fresh Stage 2 finalists
// ═══════════════════════════════════════════════════════════════════════════
//
// The V2 engine:
//   1. Snapshot current design (the 2 front subs at their current positions)
//   2. Gather challenger candidates from Stage 2 finalists (Current excluded)
//   3. Proxy search: delay + polarity + trim per challenger (main thread)
//   4. Promote 2-3 best challengers
//   5. Canonical confirmation on promoted challengers (same functions as Stage 2)
//   6. Winner selection with primary-seat protection
//
// We replicate the V2 main-thread work + canonical confirmation using the
// SAME production functions. The V2 worker only wraps these functions.

console.log('\n' + '═'.repeat(72));
console.log('  IMPROVE BASS V2 — NORMAL IMPROVE USING FRESH FINALISTS');
console.log('═'.repeat(72));

// Current design = 2 front subs (matching the Luxavo/Duffy reference room)
const currentInstances = [
  { id: 'front-left', model: 'SUB2-12', enabled: true, position: { x: 0.5, y: 0.5 }, delayMs: 0, gainDb: 0, polarity: 0, bottomHeightM: 0 },
  { id: 'front-right', model: 'SUB2-12', enabled: true, position: { x: 4.3, y: 0.5 }, delayMs: 0, gainDb: 0, polarity: 0, bottomHeightM: 0 },
];

// Build the current finalist for comparison
const W = ROOM_DIMS.widthM;
const L = ROOM_DIMS.lengthM;
const currentFinalist = {
  id: 'current-design',
  familyId: 'current',
  sources: currentInstances.map((inst) => ({
    xNorm: inst.position.x / W,
    yNorm: inst.position.y / L,
  })),
};

// Gather challengers from Stage 2 2-sub finalists (exclude Current)
const stage2TwoSubFinalists = (allStage2Results[2] || []).map((r) => ({
  id: r.finalistId,
  familyId: r.familyId,
  sources: stage1Finalists[2].find((f) => f.id === r.finalistId)?.sources || [],
}));

// Get the raw transfers for each challenger (already computed in Stage 2)
const challengerRawTransfers = new Map();
for (const finalist of stage1Finalists[2] || []) {
  // Re-evaluate placement for each challenger (V2 does this if not cached)
  const rt = evaluateStage2Placement({
    finalist,
    roomDims: ROOM_DIMS,
    rspPosition: RSP_POSITION,
    seatingPositions: SEATING_POSITIONS,
    selectedSubModel: SELECTED_SUB_MODEL,
    amplifierPowerPerSubW: AMPLIFIER_POWER_PER_SUB_W,
    subwooferBottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M,
  });
  if (rt) challengerRawTransfers.set(finalist.id, rt);
}

const challengers = [];
for (const finalist of stage1Finalists[2] || []) {
  // Skip if same placement as current
  let sameAsCurrent = true;
  for (let i = 0; i < finalist.sources.length; i++) {
    const fx = finalist.sources[i].xNorm * W;
    const fy = finalist.sources[i].yNorm * L;
    const cx = currentFinalist.sources[i]?.xNorm * W;
    const cy = currentFinalist.sources[i]?.yNorm * L;
    if (Math.abs(fx - cx) > 0.01 || Math.abs(fy - cy) > 0.01) { sameAsCurrent = false; break; }
  }
  if (sameAsCurrent) continue;
  const rt = challengerRawTransfers.get(finalist.id);
  if (!rt) continue;
  challengers.push({ id: finalist.id, finalist, rawTransfer: rt });
}

console.log(`  Challengers gathered: ${challengers.length} (Current excluded)`);

const improveStart = now();

// ── V2 Phase 3: Proxy search (delay + polarity + trim) per challenger ──
const proxySearchStart = now();
for (const ch of challengers) {
  const rt = ch.rawTransfer;
  if (!rt?.perSourcePerSeatComplexTransfers?.length) { ch.proxyResult = null; continue; }
  const rspTransfers = rt.perSourcePerSeatComplexTransfers.filter((t) => t.seatId === 'rsp');
  const sources = rt.sources || [];
  const sourceCount = sources.length;
  if (sourceCount <= 1) {
    ch.proxyResult = { tuning: [{ delayMs: 0, gainDb: 0, polarity: 0 }], score: Infinity };
    continue;
  }
  const delayResult = searchDelayOnly(rspTransfers, sources);
  const bestDelays = delayResult.finalists[0]?.delays || new Array(sourceCount).fill(0);
  const polarityResult = searchPolarity(rspTransfers, bestDelays, null);
  const bestPolarities = polarityResult.polarities;
  const trimResult = searchGainOnly(rspTransfers, sources, bestDelays, bestPolarities);
  const bestGains = trimResult.finalists[0]?.gains || new Array(sourceCount).fill(0);
  const tuning = [];
  for (let i = 0; i < sourceCount; i++) {
    tuning.push({ delayMs: bestDelays[i] || 0, gainDb: bestGains[i] || 0, polarity: bestPolarities[i] || 0 });
  }
  ch.proxyResult = { tuning, score: trimResult.finalists[0]?.score || Infinity };
}
const proxySearchMs = now() - proxySearchStart;

// ── V2 Phase 4: Promote 2-3 best challengers ──
const MAX_CHALLENGERS = 3;
const validChallengers = challengers.filter((c) => c.proxyResult);
validChallengers.sort((a, b) => (a.proxyResult.score ?? Infinity) - (b.proxyResult.score ?? Infinity));
const promoted = validChallengers.slice(0, MAX_CHALLENGERS);

console.log(`  Promoted challengers: ${promoted.length} (max ${MAX_CHALLENGERS})`);
console.log(`  Proxy search elapsed: ${fmt(proxySearchMs)}`);

// ── V2 Phase 5: Canonical confirmation on promoted challengers ──
const v2ConfirmationStart = now();
const confirmedResults = [];
for (const ch of promoted) {
  const result = evaluateStage2ConfirmationWithTuning(ch.rawTransfer, {
    tuningVariant: 'delay-only',
    tuning: ch.proxyResult.tuning,
    p14TargetBasis: P14_TARGET_BASIS,
    p14TargetLevel: P14_TARGET_LEVEL,
    p14TargetDb: P14_TARGET_DB,
    p18TargetBasis: P18_TARGET_BASIS,
  });
  if (result) {
    result.isCurrent = false;
    result.candidateId = ch.id;
    confirmedResults.push(result);
  }
}
const v2ConfirmationMs = now() - v2ConfirmationStart;

// ── V2 Phase 6: Winner selection with primary-seat protection ──
// Current authority = the placement-only result for the current design
const currentAuthority = evaluateStage2Placement({
  finalist: currentFinalist,
  roomDims: ROOM_DIMS,
  rspPosition: RSP_POSITION,
  seatingPositions: SEATING_POSITIONS,
  selectedSubModel: SELECTED_SUB_MODEL,
  amplifierPowerPerSubW: AMPLIFIER_POWER_PER_SUB_W,
  subwooferBottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M,
});
const currentConfirmation = currentAuthority
  ? evaluateStage2Confirmation(currentAuthority, {
      p14TargetBasis: P14_TARGET_BASIS,
      p14TargetLevel: P14_TARGET_LEVEL,
      p14TargetDb: P14_TARGET_DB,
      p18TargetBasis: P18_TARGET_BASIS,
    })
  : null;

let winner = null;
let winnerMessage = null;
if (confirmedResults.length === 0) {
  winnerMessage = 'No safer automatic improvement found — current design retained';
} else {
  // Use the production selectAuthoritativeFinalist
  const quantityResult = {
    evaluatedFinalists: confirmedResults.map((r) => ({ ...r, finalistId: r.candidateId || r.finalistId })),
  };
  const currentLayout = currentConfirmation
    ? {
        metrics: {
          perSeatP19: currentConfirmation.perSeatP19 || [],
          perSeatP20: currentConfirmation.perSeatP20 || [],
          achievedP19VariationDb: currentConfirmation.achievedP19VariationDb,
          achievedP19Level: currentConfirmation.achievedP19Level,
          achievedP20VariationDb: currentConfirmation.achievedP20VariationDb,
          achievedP20Level: currentConfirmation.achievedP20Level,
        },
        sources: currentInstances.map((inst, i) => ({ id: inst.id, tuning: { gainDb: 0 } })),
      }
    : null;

  const selection = selectAuthoritativeFinalist(quantityResult, null, currentLayout);
  if (selection.isCurrent || !selection.winner) {
    winnerMessage = 'No safer automatic improvement found — current design retained';
  } else {
    // Primary-seat protection
    if (currentConfirmation) {
      const regression = hasPrimarySeatRegression(selection.winner, currentConfirmation);
      if (regression.regressed) {
        winnerMessage = `No safer automatic improvement found — primary seat ${regression.seatId} ${regression.parameter} regression`;
      } else {
        winner = selection.winner;
      }
    } else {
      winner = selection.winner;
    }
  }
}

const improveTotalMs = now() - improveStart;

console.log(`  V2 canonical confirmation: ${fmt(v2ConfirmationMs)} (${confirmedResults.length} challengers)`);
console.log(`  Winner: ${winner ? winner.finalistId || winner.candidateId : 'NONE'}`);
if (winnerMessage) console.log(`  Message: ${winnerMessage}`);
console.log(`  Improve button-to-result time: ${fmt(improveTotalMs)}`);
console.log('═'.repeat(72));

// ═══════════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════════════════════
const report = {
  stage1: { elapsedMs: stage1Elapsed, finalists: { 1: stage1Finalists[1].length, 2: stage1Finalists[2].length, 4: stage1Finalists[4].length } },
  stage2: {
    batchModalMs: totalPlacementMs,
    tuningSearchMs: totalTuningSearchMs,
    confirmationMs: totalConfirmationMs,
    persistenceMs: totalPersistenceMs,
    totalElapsedMs: stage2TotalElapsed,
    finalistCount: totalFinalistCount,
  },
  improve: {
    proxySearchMs,
    confirmationMs: v2ConfirmationMs,
    buttonToResultMs: improveTotalMs,
    challengerCount: challengers.length,
    promotedCount: promoted.length,
    confirmedCount: confirmedResults.length,
    winner: winner ? (winner.finalistId || winner.candidateId) : null,
  },
};
console.log('\n  JSON REPORT:');
console.log(JSON.stringify(report, null, 2));