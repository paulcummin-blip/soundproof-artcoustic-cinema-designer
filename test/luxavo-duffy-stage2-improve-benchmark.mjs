// luxavo-duffy-stage2-improve-benchmark.mjs
//
// Stage 2 + Improve benchmark using pre-computed Stage 1 finalists.
// Run: node --import ./test/_alias-register.mjs test/luxavo-duffy-stage2-improve-benchmark.mjs

import fs from 'node:fs';
import {
  evaluateStage2Placement,
  evaluateStage2Confirmation,
  evaluateStage2ConfirmationWithTuning,
} from '@/components/room/bass/stage2/stage2CanonicalEvaluation';
import { searchDelayOnly, searchLevelAndDelay, searchPolarity, searchGainOnly } from '@/components/room/bass/stage2/stage2TuningSearch';
import { buildP14TargetCombinations } from '@/components/room/bass/p14TargetDefinitions';
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

const P14_TARGETS = buildP14TargetCombinations();
const TARGET = P14_TARGETS.find((t) => t.basis === 'minimum' && t.level === 2);
const P14_TARGET_BASIS = TARGET.basis;
const P14_TARGET_LEVEL = TARGET.level;
const P14_TARGET_DB = TARGET.db;
const P18_TARGET_BASIS = 'minimum';

const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
const fmt = (ms) => ms == null ? 'N/A' : `${ms.toFixed(1)} ms`;

// ── Load pre-computed Stage 1 finalists ──────────────────────────────────
const FINALISTS_2SUB = JSON.parse(fs.readFileSync('/tmp/luxavo-stage1-2sub.json', 'utf8'));

console.log('═'.repeat(72));
console.log('  LUXAVO/DUFFY STAGE 2 + IMPROVE BENCHMARK');
console.log('═'.repeat(72));
console.log(`  Room: ${ROOM_DIMS.widthM} × ${ROOM_DIMS.lengthM} × ${ROOM_DIMS.heightM} m`);
console.log(`  Subs: 2 × ${SELECTED_SUB_MODEL}, Target: ${P14_TARGET_BASIS} L${P14_TARGET_LEVEL} (${P14_TARGET_DB.toFixed(2)} dB)`);
console.log(`  Stage 1 finalists (2-sub): ${FINALISTS_2SUB.length}`);
console.log('─'.repeat(72));
console.log('  CLEARING STAGE 2 RESULT — fresh run (no cache)');
console.log('─'.repeat(72));

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 2 — Canonical placement evaluation (2-sub)
// ═══════════════════════════════════════════════════════════════════════════
let totalPlacementMs = 0, totalTuningMs = 0, totalConfirmationMs = 0, totalPersistenceMs = 0;
const stage2Results = [];

const stage2Start = now();

for (const finalist of FINALISTS_2SUB) {
  // ── 1. PLACEMENT (batch modal) ──
  const pStart = now();
  const rawTransfer = evaluateStage2Placement({
    finalist, roomDims: ROOM_DIMS, rspPosition: RSP_POSITION,
    seatingPositions: SEATING_POSITIONS, selectedSubModel: SELECTED_SUB_MODEL,
    amplifierPowerPerSubW: AMPLIFIER_POWER_PER_SUB_W, subwooferBottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M,
  });
  const pMs = now() - pStart;
  totalPlacementMs += pMs;
  if (!rawTransfer) { console.log(`  ${finalist.id}: PLACEMENT FAILED`); continue; }

  // ── 2. TUNING SEARCH ──
  const tStart = now();
  const hasPerSource = !!(rawTransfer.perSourcePerSeatComplexTransfers?.length);
  let delayFinalists = [], levelDelayFinalists = [];
  if (hasPerSource) {
    const rspT = rawTransfer.perSourcePerSeatComplexTransfers.filter((t) => t.seatId === 'rsp');
    const sSrc = rawTransfer.sources?.map((s) => ({ yNorm: s.yNorm ?? 0 })) || [];
    delayFinalists = (searchDelayOnly(rspT, sSrc)).finalists || [];
    levelDelayFinalists = (searchLevelAndDelay(rspT, sSrc)).finalists || [];
  }
  const tMs = now() - tStart;
  totalTuningMs += tMs;

  // ── 3. CANONICAL CONFIRMATION ──
  const cStart = now();
  const placementOnly = evaluateStage2Confirmation(rawTransfer, {
    p14TargetBasis: P14_TARGET_BASIS, p14TargetLevel: P14_TARGET_LEVEL,
    p14TargetDb: P14_TARGET_DB, p18TargetBasis: P18_TARGET_BASIS,
  });
  const delayResults = [], levelDelayResults = [];
  for (const df of delayFinalists.slice(0, 2)) {
    const r = evaluateStage2ConfirmationWithTuning(rawTransfer, {
      tuningVariant: 'delay-only', tuning: df.tuning,
      p14TargetBasis: P14_TARGET_BASIS, p14TargetLevel: P14_TARGET_LEVEL,
      p14TargetDb: P14_TARGET_DB, p18TargetBasis: P18_TARGET_BASIS,
    });
    if (r) delayResults.push(r);
  }
  for (const lf of levelDelayFinalists.slice(0, 2)) {
    const r = evaluateStage2ConfirmationWithTuning(rawTransfer, {
      tuningVariant: 'level-delay', tuning: lf.tuning,
      p14TargetBasis: P14_TARGET_BASIS, p14TargetLevel: P14_TARGET_LEVEL,
      p14TargetDb: P14_TARGET_DB, p18TargetBasis: P18_TARGET_BASIS,
    });
    if (r) levelDelayResults.push(r);
  }
  const cMs = now() - cStart;
  totalConfirmationMs += cMs;

  const allConf = [placementOnly, ...delayResults, ...levelDelayResults].filter(Boolean);
  const best = allConf.length > 0 ? allConf.reduce((b, r) => {
    if (!b) return r;
    if (!r.limited && b.limited) return r;
    if (r.limited && !b.limited) return b;
    return (r.achievedP19VariationDb ?? Infinity) < (b.achievedP19VariationDb ?? Infinity) ? r : b;
  }, null) : null;

  stage2Results.push({ finalistId: finalist.id, familyId: finalist.familyId, best, pMs, tMs, cMs, confCount: allConf.length, rawTransfer });
  console.log(`  ${finalist.id} (${finalist.familyId}): place=${fmt(pMs)} tune=${fmt(tMs)} confirm=${fmt(cMs)} (${allConf.length} variants) P14=${best?.p14AchievedDb?.toFixed(1) ?? 'N/A'} P19=${best?.achievedP19VariationDb?.toFixed(2) ?? 'N/A'}`);
}

// Build raw transfer cache (simulates placementFingerprint cache hit in production)
const rawTransferCache = new Map();
for (const r of stage2Results) { if (r.rawTransfer) rawTransferCache.set(r.finalistId, r.rawTransfer); }

// ── 4. PERSISTENCE (sync snapshot build) ──
const persistStart = now();
const snapshot = { two_sub_result: { evaluatedFinalists: stage2Results, finalistCount: stage2Results.length } };
const _ = JSON.stringify(snapshot).length;
totalPersistenceMs = now() - persistStart;

const stage2Total = now() - stage2Start;

console.log('\n' + '─'.repeat(72));
console.log('  STAGE 2 SUMMARY');
console.log('─'.repeat(72));
console.log(`  1. Batch modal preparation/evaluation: ${fmt(totalPlacementMs)}`);
console.log(`  2. Tuning search:                      ${fmt(totalTuningMs)}`);
console.log(`  3. Canonical confirmation:             ${fmt(totalConfirmationMs)}`);
console.log(`  4. Persistence/publication (sync):     ${fmt(totalPersistenceMs)}`);
console.log(`  5. Total Stage 2 elapsed:              ${fmt(stage2Total)}`);
console.log(`  6. Finalist count:                      ${stage2Results.length}`);
console.log('─'.repeat(72));

// ═══════════════════════════════════════════════════════════════════════════
// IMPROVE BASS V2
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(72));
console.log('  IMPROVE BASS V2 — NORMAL IMPROVE');
console.log('═'.repeat(72));

const W = ROOM_DIMS.widthM, L = ROOM_DIMS.lengthM;
const currentFinalist = {
  id: 'current-design', familyId: 'current',
  sources: [{ xNorm: 0.5 / W, yNorm: 0.5 / L }, { xNorm: 4.3 / W, yNorm: 0.5 / L }],
};

// Gather challengers (exclude same-as-current) — reuse cached raw transfers
// from Stage 2 (simulates placementFingerprint cache hit in production V2)
const challengers = [];
for (const finalist of FINALISTS_2SUB) {
  let same = true;
  for (let i = 0; i < finalist.sources.length; i++) {
    if (Math.abs(finalist.sources[i].xNorm * W - currentFinalist.sources[i].xNorm * W) > 0.01 || 
        Math.abs(finalist.sources[i].yNorm * L - currentFinalist.sources[i].yNorm * L) > 0.01) { same = false; break; }
  }
  if (same) continue;
  const rt = rawTransferCache.get(finalist.id); // cache hit (production behavior)
  if (rt) challengers.push({ id: finalist.id, finalist, rawTransfer: rt });
}
console.log(`  Challengers: ${challengers.length}`);

const improveStart = now();

// Proxy search: delay + polarity + trim
const proxyStart = now();
for (const ch of challengers) {
  const rt = ch.rawTransfer;
  if (!rt?.perSourcePerSeatComplexTransfers?.length) { ch.proxyResult = null; continue; }
  const rspT = rt.perSourcePerSeatComplexTransfers.filter((t) => t.seatId === 'rsp');
  const sources = rt.sources || [];
  if (sources.length <= 1) { ch.proxyResult = { tuning: [{ delayMs: 0, gainDb: 0, polarity: 0 }] }; continue; }
  const dResult = searchDelayOnly(rspT, sources);
  const delays = dResult.finalists[0]?.delays || new Array(sources.length).fill(0);
  const pResult = searchPolarity(rspT, delays, null);
  const polarities = pResult.polarities;
  const gResult = searchGainOnly(rspT, sources, delays, polarities);
  const gains = gResult.finalists[0]?.gains || new Array(sources.length).fill(0);
  const tuning = sources.map((_, i) => ({ delayMs: delays[i] || 0, gainDb: gains[i] || 0, polarity: polarities[i] || 0 }));
  ch.proxyResult = { tuning };
}
const proxyMs = now() - proxyStart;

// Promote top 3
const valid = challengers.filter((c) => c.proxyResult);
const promoted = valid.slice(0, 3);
console.log(`  Promoted: ${promoted.length}, Proxy search: ${fmt(proxyMs)}`);

// Canonical confirmation on promoted
const v2ConfStart = now();
const confirmed = [];
for (const ch of promoted) {
  const r = evaluateStage2ConfirmationWithTuning(ch.rawTransfer, {
    tuningVariant: 'delay-only', tuning: ch.proxyResult.tuning,
    p14TargetBasis: P14_TARGET_BASIS, p14TargetLevel: P14_TARGET_LEVEL,
    p14TargetDb: P14_TARGET_DB, p18TargetBasis: P18_TARGET_BASIS,
  });
  if (r) { r.isCurrent = false; r.candidateId = ch.id; confirmed.push(r); }
}
const v2ConfMs = now() - v2ConfStart;

// Current authority — V2 reuses existing non-stale authority (BLOCKER 2).
// Since Stage 2 just completed, the current design's authority is the best
// Stage 2 result (simulating the production non-stale authority reuse).
const currentAuth = stage2Results.length > 0 ? stage2Results[0].best : null;

let winner = null, winnerMsg = null;
if (confirmed.length === 0) {
  winnerMsg = 'No safer automatic improvement found — current design retained';
} else {
  const qr = { evaluatedFinalists: confirmed.map((r) => ({ ...r, finalistId: r.candidateId })) };
  const cl = currentAuth ? { metrics: { perSeatP19: currentAuth.perSeatP19 || [], perSeatP20: currentAuth.perSeatP20 || [], achievedP19VariationDb: currentAuth.achievedP19VariationDb, achievedP19Level: currentAuth.achievedP19Level, achievedP20VariationDb: currentAuth.achievedP20VariationDb, achievedP20Level: currentAuth.achievedP20Level } } : null;
  const sel = selectAuthoritativeFinalist(qr, null, cl);
  if (sel.isCurrent || !sel.winner) { winnerMsg = 'No safer automatic improvement found — current design retained'; }
  else if (currentAuth) {
    const reg = hasPrimarySeatRegression(sel.winner, currentAuth);
    if (reg.regressed) { winnerMsg = `Primary seat ${reg.seatId} ${reg.parameter} regression`; }
    else { winner = sel.winner; }
  } else { winner = sel.winner; }
}

const improveTotal = now() - improveStart;

console.log(`  V2 confirmation: ${fmt(v2ConfMs)} (${confirmed.length} challengers)`);
console.log(`  Winner: ${winner ? (winner.finalistId || winner.candidateId) : 'NONE'}`);
if (winnerMsg) console.log(`  Message: ${winnerMsg}`);
console.log(`  Improve button-to-result: ${fmt(improveTotal)}`);
console.log('═'.repeat(72));

// ── JSON REPORT ──
console.log('\n  JSON REPORT:');
console.log(JSON.stringify({
  stage2: { batchModalMs: totalPlacementMs, tuningSearchMs: totalTuningMs, confirmationMs: totalConfirmationMs, persistenceMs: totalPersistenceMs, totalElapsedMs: stage2Total, finalistCount: stage2Results.length },
  improve: { proxySearchMs: proxyMs, confirmationMs: v2ConfMs, buttonToResultMs: improveTotal, challengerCount: challengers.length, promotedCount: promoted.length, confirmedCount: confirmed.length, winner: winner ? (winner.finalistId || winner.candidateId) : null },
}, null, 2));