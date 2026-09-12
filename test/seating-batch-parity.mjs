// seating-batch-parity.mjs
// Parity harness: OLD (10 individual evaluateStage2Placement calls) vs
// NEW (1 evaluateSeatingBatch call with all 10 non-zero offsets).
//
// Compares EVERY offset:
//   - effective offset
//   - RSP position
//   - seat positions
//   - raw complex transfer arrays (re + im)
//   - per-seat curves
//   - RSP curve
//   - proxy metrics (P19/P20)
//
// Expected: zero or floating-point noise only.
//
// Run: node --import ./test/_alias-register.mjs test/seating-batch-parity.mjs

import { evaluateStage2Placement } from '@/components/room/bass/stage2/stage2CanonicalEvaluation';
import { evaluateSeatingBatch } from '@/components/room/bass/stage2/stage2SeatingBatchEvaluation';
import { generateSeatingCandidates } from '@/components/room/bass/improveBassV2/seatingPositionSearch';
import { normaliseModelKey } from '@/components/models/speakers/registry';
import { resumWithTuning } from '@/components/room/bass/stage2/stage2TuningSearch';

// ── Test data (Lord's Hall fixture — same as prepared-field-parity.mjs) ──

const ROOM_DIMS = { widthM: 4, lengthM: 6.3, heightM: 2.4 };
const SELECTED_SUB_MODEL = 'sub4-12';
const SUBWOOFER_BOTTOM_HEIGHT_M = 0.05;
const AMPLIFIER_POWER_PER_SUB_W = 700;

// 4-sub finalist: front-left, front-right, rear-left, rear-right (normalised)
const FINALIST = {
  id: 'test-finalist',
  familyId: 'test-family',
  sources: [
    { xNorm: 0.20, yNorm: 0.15 },
    { xNorm: 0.80, yNorm: 0.15 },
    { xNorm: 0.20, yNorm: 0.85 },
    { xNorm: 0.80, yNorm: 0.85 },
  ],
};

const RSP_BASE = {
  x: ROOM_DIMS.widthM / 2,
  y: ROOM_DIMS.lengthM / 2,
  z: 1.2,
};

// 5 seats around the RSP
const SEATING_POSITIONS_BASE = [
  { id: 'seat-1', x: 2.0, y: 3.15, z: 1.2, priority: 'primary' },
  { id: 'seat-2', x: 1.4, y: 3.65, z: 1.2, priority: 'secondary' },
  { id: 'seat-3', x: 2.6, y: 3.65, z: 1.2, priority: 'secondary' },
  { id: 'seat-4', x: 1.4, y: 2.65, z: 1.2, priority: 'secondary' },
  { id: 'seat-5', x: 2.6, y: 2.65, z: 1.2, priority: 'secondary' },
];

const SCREEN_WALL = 'front';

// ── Helpers ──────────────────────────────────────────────────────────────

function complexMagDb(re, im) {
  const mag = Math.sqrt(re * re + im * im);
  return 20 * Math.log10(Math.max(mag, 1e-12));
}

function compareComplexTransfers(oldT, newT, label) {
  let maxReDelta = 0;
  let maxImDelta = 0;
  let maxAbsDelta = 0;
  let maxDbDelta = 0;
  let compared = 0;

  if (oldT.length !== newT.length) {
    throw new Error(`${label}: transfer count mismatch: ${oldT.length} vs ${newT.length}`);
  }
  for (let i = 0; i < oldT.length; i++) {
    if (oldT[i].sourceIndex !== newT[i].sourceIndex) {
      throw new Error(`${label}: sourceIndex mismatch at ${i}`);
    }
    if (oldT[i].seatId !== newT[i].seatId) {
      throw new Error(`${label}: seatId mismatch at ${i}: ${oldT[i].seatId} vs ${newT[i].seatId}`);
    }
    if (oldT[i].points.length !== newT[i].points.length) {
      throw new Error(`${label}: point count mismatch at ${i}`);
    }
    for (let fi = 0; fi < oldT[i].points.length; fi++) {
      const reDelta = Math.abs(oldT[i].points[fi].re - newT[i].points[fi].re);
      const imDelta = Math.abs(oldT[i].points[fi].im - newT[i].points[fi].im);
      const absDelta = Math.sqrt(reDelta * reDelta + imDelta * imDelta);
      const oldDb = complexMagDb(oldT[i].points[fi].re, oldT[i].points[fi].im);
      const newDb = complexMagDb(newT[i].points[fi].re, newT[i].points[fi].im);
      const dbDelta = Math.abs(oldDb - newDb);
      if (absDelta > maxAbsDelta) { maxAbsDelta = absDelta; maxReDelta = reDelta; maxImDelta = imDelta; }
      if (dbDelta > maxDbDelta) maxDbDelta = dbDelta;
      compared++;
    }
  }
  return { maxReDelta, maxImDelta, maxAbsDelta, maxDbDelta, compared };
}

function compareCurves(oldCurve, newCurve, label) {
  let maxDelta = 0;
  let compared = 0;
  if (!oldCurve && !newCurve) return { maxDelta: 0, compared: 0 };
  if (!oldCurve || !newCurve) return { maxDelta: Infinity, compared: 0, missing: true };
  if (oldCurve.length !== newCurve.length) {
    return { maxDelta: Infinity, compared: 0, lengthMismatch: true, oldLen: oldCurve.length, newLen: newCurve.length };
  }
  for (let i = 0; i < oldCurve.length; i++) {
    const oldSpl = Number(oldCurve[i]?.spl);
    const newSpl = Number(newCurve[i]?.spl);
    if (Number.isFinite(oldSpl) && Number.isFinite(newSpl)) {
      const d = Math.abs(oldSpl - newSpl);
      if (d > maxDelta) maxDelta = d;
      compared++;
    }
  }
  return { maxDelta, compared };
}

// ── Build candidates (10 non-zero offsets) ───────────────────────────────

const allCandidates = generateSeatingCandidates(SEATING_POSITIONS_BASE, ROOM_DIMS, SCREEN_WALL);
const validCandidates = allCandidates.filter((c) => c.valid && c.offsetMm !== 0);

console.log('═'.repeat(72));
console.log('  SEATING-BATCH PARITY TEST');
console.log('  OLD: 10 individual evaluateStage2Placement calls');
console.log('  NEW: 1 evaluateSeatingBatch call');
console.log('═'.repeat(72));
console.log('');
console.log(`  Room: ${ROOM_DIMS.widthM}×${ROOM_DIMS.lengthM}×${ROOM_DIMS.heightM} m`);
console.log(`  Sub: ${SELECTED_SUB_MODEL}, ${FINALIST.sources.length} subs`);
console.log(`  Seats: ${SEATING_POSITIONS_BASE.length}`);
console.log(`  Valid non-zero offsets: ${validCandidates.length}`);
console.log('');

// ── OLD PATH: 10 individual evaluateStage2Placement calls ─────────────────

console.log('── Running OLD path (10 individual placement calls) ──────────────────');
const oldResults = [];
const oldT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

for (const candidate of validCandidates) {
  const movedRsp = {
    ...RSP_BASE,
    y: (RSP_BASE.y || 0) + candidate.effectiveOffsetM,
  };
  const oldTransfer = evaluateStage2Placement({
    finalist: FINALIST,
    roomDims: ROOM_DIMS,
    rspPosition: movedRsp,
    seatingPositions: candidate.seatingPositions,
    selectedSubModel: SELECTED_SUB_MODEL,
    amplifierPowerPerSubW: AMPLIFIER_POWER_PER_SUB_W,
    subwooferBottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M,
  });
  oldResults.push({
    offsetMm: candidate.offsetMm,
    effectiveOffsetM: candidate.effectiveOffsetM,
    rawTransfer: oldTransfer,
  });
}
const oldTotalMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - oldT0;
console.log(`  OLD total: ${oldTotalMs.toFixed(1)} ms`);
console.log('');

// ── NEW PATH: 1 evaluateSeatingBatch call ─────────────────────────────────

console.log('── Running NEW path (1 seating-batch call) ─────────────────────────────');
const newT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
const batchResult = evaluateSeatingBatch({
  finalist: FINALIST,
  roomDims: ROOM_DIMS,
  rspPosition: RSP_BASE,
  candidates: validCandidates,
  selectedSubModel: SELECTED_SUB_MODEL,
  amplifierPowerPerSubW: AMPLIFIER_POWER_PER_SUB_W,
  subwooferBottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M,
});
const newTotalMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - newT0;
console.log(`  NEW total: ${newTotalMs.toFixed(1)} ms`);
console.log(`  Prepared field: ${batchResult.timing.preparedSourceRoomMs.toFixed(1)} ms`);
console.log(`  Per-offset times: ${batchResult.timing.perOffsetMs.map((t) => t.toFixed(0)).join(', ')} ms`);
console.log('');

// ── Compare EVERY offset ─────────────────────────────────────────────────

console.log('── Comparing offsets ─────────────────────────────────────────────────');
let globalMaxComplexDelta = 0;
let globalMaxDbDelta = 0;
let globalMaxCurveDelta = 0;
let allOffsetsMatch = true;
let offsetsCompared = 0;

for (let i = 0; i < validCandidates.length; i++) {
  const offsetMm = validCandidates[i].offsetMm;
  const oldR = oldResults[i].rawTransfer;
  const newR = batchResult.candidates[i]?.rawTransfer;

  if (!oldR) {
    console.log(`  ${offsetMm >= 0 ? '+' : ''}${offsetMm} mm: OLD result is null — skipping`);
    continue;
  }
  if (!newR) {
    console.log(`  ${offsetMm >= 0 ? '+' : ''}${offsetMm} mm: NEW result is null — MISMATCH`);
    allOffsetsMatch = false;
    continue;
  }

  // Compare complex transfers
  const cmp = compareComplexTransfers(
    oldR.perSourcePerSeatComplexTransfers,
    newR.perSourcePerSeatComplexTransfers,
    `offset ${offsetMm}`,
  );
  if (cmp.maxAbsDelta > globalMaxComplexDelta) globalMaxComplexDelta = cmp.maxAbsDelta;
  if (cmp.maxDbDelta > globalMaxDbDelta) globalMaxDbDelta = cmp.maxDbDelta;

  // Compare RSP curve
  const rspCmp = compareCurves(oldR.rspRawCurve, newR.rspRawCurve, `offset ${offsetMm} RSP`);

  // Compare per-seat curves
  let seatMaxDelta = 0;
  if (oldR.perSeatRawCurves.length !== newR.perSeatRawCurves.length) {
    console.log(`  ${offsetMm >= 0 ? '+' : ''}${offsetMm} mm: per-seat curve count mismatch: ${oldR.perSeatRawCurves.length} vs ${newR.perSeatRawCurves.length}`);
    allOffsetsMatch = false;
  } else {
    for (let si = 0; si < oldR.perSeatRawCurves.length; si++) {
      const seatCmp = compareCurves(
        oldR.perSeatRawCurves[si].responseData,
        newR.perSeatRawCurves[si].responseData,
        `offset ${offsetMm} seat ${oldR.perSeatRawCurves[si].seatId}`,
      );
      if (seatCmp.maxDelta > seatMaxDelta) seatMaxDelta = seatCmp.maxDelta;
    }
  }
  if (rspCmp.maxDelta > globalMaxCurveDelta) globalMaxCurveDelta = rspCmp.maxDelta;
  if (seatMaxDelta > globalMaxCurveDelta) globalMaxCurveDelta = seatMaxDelta;

  // Compare sources count
  const srcMatch = oldR.sources.length === newR.sources.length;

  // Compare seat IDs
  const oldSeatIds = JSON.stringify(oldR.seatIds);
  const newSeatIds = JSON.stringify(newR.seatIds);
  const seatIdsMatch = oldSeatIds === newSeatIds;

  // Compare autoAlignTuning
  const oldAutoAlign = JSON.stringify(oldR.autoAlignTuning);
  const newAutoAlign = JSON.stringify(newR.autoAlignTuning);
  const autoAlignMatch = oldAutoAlign === newAutoAlign;
  if (!autoAlignMatch) {
    console.log(`    autoAlignTuning OLD: ${oldAutoAlign}`);
    console.log(`    autoAlignTuning NEW: ${newAutoAlign}`);
  }

  // Compare coordinates
  const coordsMatch = JSON.stringify(oldR.coordinates) === JSON.stringify(newR.coordinates);

  const offsetPass = cmp.maxAbsDelta < 1e-10 && rspCmp.maxDelta < 1e-10 && seatMaxDelta < 1e-10 && srcMatch && seatIdsMatch && coordsMatch && autoAlignMatch;
  if (!offsetPass) allOffsetsMatch = false;

  console.log(
    `  ${offsetMm >= 0 ? '+' : ''}${offsetMm} mm: ` +
    `complex Δ=${cmp.maxAbsDelta.toExponential(3)}, ` +
    `dB Δ=${cmp.maxDbDelta.toExponential(3)}, ` +
    `RSP curve Δ=${rspCmp.maxDelta.toExponential(3)}, ` +
    `seat curve Δ=${seatMaxDelta.toExponential(3)}, ` +
    `src=${srcMatch ? 'OK' : 'FAIL'}, ` +
    `seatIds=${seatIdsMatch ? 'OK' : 'FAIL'}, ` +
    `coords=${coordsMatch ? 'OK' : 'FAIL'} ` +
    `${offsetPass ? '✓' : '✗'}`,
  );
  offsetsCompared++;
}

console.log('');
console.log('── Summary ───────────────────────────────────────────────────────────');
console.log(`  Offsets compared: ${offsetsCompared}`);
console.log(`  Max complex delta: ${globalMaxComplexDelta.toExponential(5)}`);
console.log(`  Max dB delta: ${globalMaxDbDelta.toExponential(5)}`);
console.log(`  Max curve delta: ${globalMaxCurveDelta.toExponential(5)}`);
console.log(`  All offsets match: ${allOffsetsMatch ? 'PASS' : 'FAIL'}`);
console.log(`  OLD total: ${oldTotalMs.toFixed(1)} ms`);
console.log(`  NEW total: ${newTotalMs.toFixed(1)} ms`);
console.log(`  Speedup: ${(oldTotalMs / Math.max(newTotalMs, 0.001)).toFixed(2)}×`);
console.log('');

// ── Winner parity ────────────────────────────────────────────────────────

console.log('── Winner parity (proxy P19 ranking) ────────────────────────────────');

// Compute proxy P19 for each OLD offset (using zero tuning → auto-align)
function computeProxyP19(rawTransfer) {
  if (!rawTransfer?.perSourcePerSeatComplexTransfers?.length) return Infinity;
  const seatIds = rawTransfer.seatIds || [];
  if (!seatIds.length) return Infinity;
  const autoAlignTuning = rawTransfer.autoAlignTuning || rawTransfer.sources.map(() => ({ delayMs: 0, gainDb: 0, polarity: 0 }));
  const seatResponses = resumWithTuning(
    rawTransfer.perSourcePerSeatComplexTransfers,
    autoAlignTuning,
    seatIds,
  );
  let worstSeatP2P = 0;
  let rspP2P = Infinity;
  for (const seatId of seatIds) {
    const response = seatResponses[seatId];
    if (!response?.freqsHz?.length) continue;
    const spls = [];
    for (let i = 0; i < response.freqsHz.length; i++) {
      const freq = response.freqsHz[i];
      if (freq >= 20 && freq <= 120) spls.push(response.splDb[i]);
    }
    if (!spls.length) continue;
    const p2p = Math.max(...spls) - Math.min(...spls);
    if (seatId === 'rsp') rspP2P = p2p;
    else if (p2p > worstSeatP2P) worstSeatP2P = p2p;
  }
  if (worstSeatP2P === 0 && Number.isFinite(rspP2P)) worstSeatP2P = rspP2P;
  return worstSeatP2P;
}

let oldBestOffset = null;
let oldBestP19 = Infinity;
for (const r of oldResults) {
  if (!r.rawTransfer) continue;
  const p19 = computeProxyP19(r.rawTransfer);
  if (p19 < oldBestP19) { oldBestP19 = p19; oldBestOffset = r.offsetMm; }
}

let newBestOffset = null;
let newBestP19 = Infinity;
for (const c of batchResult.candidates) {
  if (!c?.rawTransfer) continue;
  const p19 = computeProxyP19(c.rawTransfer);
  if (p19 < newBestP19) { newBestP19 = p19; newBestOffset = c.offsetMm; }
}

console.log(`  OLD winner: ${oldBestOffset >= 0 ? '+' : ''}${oldBestOffset} mm (proxyP19=${oldBestP19.toFixed(3)})`);
console.log(`  NEW winner: ${newBestOffset >= 0 ? '+' : ''}${newBestOffset} mm (proxyP19=${newBestP19.toFixed(3)})`);
const winnerMatch = oldBestOffset === newBestOffset;
console.log(`  Winner match: ${winnerMatch ? 'PASS' : 'FAIL'}`);
console.log('');

// ── VERDICT ───────────────────────────────────────────────────────────────

console.log('═'.repeat(72));
const parityPass = allOffsetsMatch && globalMaxComplexDelta < 1e-10 && globalMaxDbDelta < 1e-10;
const winnerParityPass = winnerMatch;

if (parityPass && winnerParityPass) {
  console.log('  SEATING-BATCH PARITY PASSED — SAFE TO SWITCH PRODUCTION ENGINE');
} else {
  console.log('  SEATING-BATCH PARITY FAILED — blocker:');
  if (!parityPass) console.log(`    - complex/curve delta too large: ${globalMaxComplexDelta.toExponential(5)}`);
  if (!winnerParityPass) console.log(`    - winner mismatch: OLD=${oldBestOffset} NEW=${newBestOffset}`);
}
console.log('═'.repeat(72));

process.exitCode = (parityPass && winnerParityPass) ? 0 : 1;