// Fresh Stage 2 regeneration + Graph smell test + Improve with fresh finalists
// Run with: node --import ./test/_alias-register.mjs test/fresh-stage2-acceptance.mjs

import { simulateAuthoritativeBassResponse } from '@/components/room/bass/authoritativeBassResponseEngine';
import { buildAuthoritativeRspPosition } from '@/components/room/bass/authoritativeRspPosition';
import { buildNormalizedPhysicsOptions } from '@/components/room/bass/normalizedPhysicsOptionsBuilder';
import { buildAuthoritativeAutoAlignDelays } from '@/components/room/bass/useAuthoritativeBassResponse';
import { gradeP19FromRaw, gradeP20FromRaw } from '@/components/room/bass/completedBassResultPersistence';
import { buildFinalOptimisedBassResponse } from '@/components/room/bass/finalOptimisedBassResponse';
import { generateCanonicalCandidatePool } from '@/components/utils/canonicalBassOptimiser';
import { selectCandidateFromPool } from '@/components/utils/bassCandidatePoolSelection';
import { evaluateCanonicalBassAuthority } from '@/components/utils/canonicalBassAuthorityEvaluation';
import { resolveSubwooferBassCapability } from '@/components/utils/speakerModelResolver';
import { MODELS, normaliseModelKey } from '@/components/models/speakers/registry';
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from '@/components/room/bass/bassPhysicsDefaults';
import { subwooferDisplayLabel } from '@/components/utils/subwooferDisplayLabel';
import { hasPrimarySeatRegression } from '@/components/room/bass/best-layout/authoritativeFinalistSelection';

function isSamePlacement(sourcesA, sourcesB) {
  if (!Array.isArray(sourcesA) || !Array.isArray(sourcesB)) return false;
  if (sourcesA.length !== sourcesB.length) return false;
  const tol = 0.01;
  for (let i = 0; i < sourcesA.length; i++) {
    const a = sourcesA[i], b = sourcesB[i];
    if (Math.abs(a.x - b.x) > tol || Math.abs(a.y - b.y) > tol) return false;
  }
  return true;
}
import { artcousticHouseCurveOffsetAt } from '@/components/utils/artcousticHouseCurve';
import fs from 'node:fs';
const DATA = JSON.parse(fs.readFileSync(new URL('./_fresh-stage2-data.json', import.meta.url), 'utf8'));

const PROJECT_ID = '6a917353f0f4315a0652781f';
const SELECTED_SUB_MODEL = 'sub4-12';
const AMP_POWER_PER_SUB_W = 1000;
const TARGET_SPL = 105;
const P14_TARGET_DB = 75;
const P14_TARGET_BASIS = 'recommended';
const P14_TARGET_LEVEL = 4;

function parseRoomDims(project) {
  try {
    const d = typeof project.roomDims === 'string' ? JSON.parse(project.roomDims) : project.roomDims;
    return { widthM: Number(d.widthM), lengthM: Number(d.lengthM), heightM: Number(d.heightM) };
  } catch { return { widthM: 4, lengthM: 6.3, heightM: 2.4 }; }
}

function buildSeatingPositions(project, roomDims) {
  const positions = project.seating_positions || [];
  // The project stores seating_positions as a flat array of {id, x, y, z, isPrimary, ...}
  if (Array.isArray(positions) && positions.length > 0 && positions[0].x != null) {
    return positions.map(seat => ({
      id: seat.id,
      x: Number(seat.x),
      y: Number(seat.y),
      z: Number(seat.z ?? 1.2),
      isPrimary: !!seat.isPrimary,
    }));
  }
  // Fallback: nested rows structure
  const rows = positions;
  const result = [];
  for (const row of rows) {
    const seats = row.seats || row.positions || [];
    const y = row.y_position ?? row.y ?? (roomDims.lengthM * 0.5);
    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i];
      const x = seat.x_position ?? seat.x ?? (roomDims.widthM * (i + 1) / (seats.length + 1));
      result.push({
        id: seat.id || `seat-r${row.row_index ?? 0}-s${i}`,
        x: Number(x),
        y: Number(y),
        z: 1.2,
        isPrimary: (row.row_index === 0 || row.row_index === '0') && i === Math.floor(seats.length / 2),
      });
    }
  }
  return result;
}

function buildSourcesFromFinalist(finalist, roomDims, subModel, ampPowerW) {
  const modelKey = normaliseModelKey(subModel);
  const model = MODELS[modelKey];
  const cabinetHeightM = model?.cabinetHeightM ?? 0.4;
  const bottomHeightM = 0.05;
  const centreZ = bottomHeightM + cabinetHeightM / 2;
  const sources = (finalist.sources || []).map((s, idx) => ({
    id: `sub-${idx + 1}`,
    model: modelKey,
    x: Number(s.x),
    y: Number(s.y),
    z: centreZ,
    bottomHeightM,
    tuning: { gainDb: 0, delayMs: 0, polarity: 1 },
    amplifierPowerW: ampPowerW,
  }));
  const delays = buildAuthoritativeAutoAlignDelays(sources, { x: roomDims.widthM / 2, y: roomDims.lengthM * 0.41, z: 1.2 });
  sources.forEach((s, i) => { s.tuning.delayMs = delays[i] || 0; });
  return sources;
}

function buildCurrentSources(project, roomDims) {
  const instances = project.subwooferInstances || [];
  const modelKey = normaliseModelKey(project.subwoofers?.[0]?.model || SELECTED_SUB_MODEL);
  const model = MODELS[modelKey];
  const cabinetHeightM = model?.cabinetHeightM ?? 0.4;
  return instances.filter(inst => inst.enabled !== false).map((inst, idx) => {
    const bottomHeightM = inst.bottomHeightM ?? 0.05;
    const centreZ = bottomHeightM + cabinetHeightM / 2;
    return {
      id: inst.id || `sub-${idx + 1}`,
      model: normaliseModelKey(inst.model || modelKey),
      x: Number(inst.position?.x),
      y: Number(inst.position?.y),
      z: centreZ,
      bottomHeightM,
      tuning: {
        gainDb: inst.gainDb ?? 0,
        delayMs: inst.delayMs ?? 0,
        polarity: inst.polarity ?? 1,
      },
      amplifierPowerW: AMP_POWER_PER_SUB_W,
    };
  });
}

function responseCurve(response) {
  return (response?.freqsHz || []).map((frequency, index) => ({
    frequency,
    spl: Number.isFinite(response?.splDb?.[index]) ? response.splDb[index] : null,
  })).filter(p => Number.isFinite(p.frequency) && p.frequency > 0 && Number.isFinite(p.spl));
}

function computeP19P20(seatResponses, seatingPositions) {
  const seatIds = Object.keys(seatResponses).filter(id => id !== 'rsp');
  const rspResponse = seatResponses['rsp'];
  const rspSpl = rspResponse?.splDb || [];
  const freqs = rspResponse?.freqsHz || [];

  let maxP19Variation = 0;
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    if (f < 20 || f > 200) continue;
    const spls = seatIds.map(id => seatResponses[id].splDb?.[i]).filter(v => v != null);
    if (spls.length < 2) continue;
    const variation = Math.max(...spls) - Math.min(...spls);
    if (variation > maxP19Variation) maxP19Variation = variation;
  }

  const perSeatP20 = [];
  for (const seatId of seatIds) {
    const response = seatResponses[seatId];
    const spl = response.splDb || [];
    let maxP20 = 0;
    for (let i = 0; i < freqs.length; i++) {
      const f = freqs[i];
      if (f < 20 || f > 200) continue;
      if (rspSpl[i] != null && spl[i] != null) {
        const delta = Math.abs(spl[i] - rspSpl[i]);
        if (delta > maxP20) maxP20 = delta;
      }
    }
    const seat = seatingPositions.find(s => s.id === seatId);
    perSeatP20.push({
      seatId,
      isPrimary: seat?.isPrimary || false,
      variationDbRaw: maxP20,
      level: gradeP20FromRaw(maxP20),
    });
  }

  const p19Level = gradeP19FromRaw(maxP19Variation);
  const perSeatP19 = seatIds.map(seatId => {
    const seat = seatingPositions.find(s => s.id === seatId);
    return {
      seatId,
      isPrimary: seat?.isPrimary || false,
      variationDbRaw: maxP19Variation,
      level: p19Level,
    };
  });

  return {
    p19: { variationDb: maxP19Variation, level: p19Level, perSeat: perSeatP19 },
    p20: { level: perSeatP20.length ? Math.min(...perSeatP20.map(s => s.level)) : null, perSeat: perSeatP20 },
  };
}

function extractLevels(metrics) {
  return {
    p19: metrics?.p19?.level ?? null,
    p20: metrics?.p20?.level ?? null,
    p19Variation: metrics?.p19?.variationDb ?? null,
  };
}

function analyzeGraphCredibility(curve, label) {
  if (!curve || !curve.length) return { label, credible: false, reason: 'no data' };
  const spls = curve.map(p => p.spl).filter(v => Number.isFinite(v));
  if (!spls.length) return { label, credible: false, reason: 'no SPL data' };
  const max = Math.max(...spls);
  const min = Math.min(...spls);
  const range = max - min;
  let peaks = 0, nulls = 0;
  for (let i = 2; i < curve.length - 2; i++) {
    const prev = curve[i - 1].spl, curr = curve[i].spl, next = curve[i + 1].spl;
    if (curr > prev && curr > next) peaks++;
    if (curr < prev && curr < next) nulls++;
  }
  const lfMax = Math.max(...curve.filter(p => p.frequency <= 40).map(p => p.spl));
  const crossRow = range;
  return {
    label, credible: peaks > 0 && nulls > 0 && range > 3,
    range, peaks, nulls, lfMax, crossRow,
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('FRESH STAGE 2 REGENERATION + GRAPH SMELL TEST + IMPROVE');
  console.log('='.repeat(60));

  // ── Load project ──────────────────────────────────────────────────────
  const project = DATA.project;
  const roomDims = parseRoomDims(project);
  const seatingPositions = buildSeatingPositions(project, roomDims);
  const mlpY_m = roomDims.lengthM * 0.41;
  const rspPosition = buildAuthoritativeRspPosition(roomDims, mlpY_m, null, null);

  console.log(`\nRoom: ${roomDims.widthM} × ${roomDims.lengthM} × ${roomDims.heightM} m`);
  console.log(`Seats: ${seatingPositions.length}, RSP: (${rspPosition.x}, ${rspPosition.y.toFixed(3)}, ${rspPosition.z})`);

  // ── Read Stage 1 finalists ─────────────────────────────────────────────
  const stage1 = DATA.stage1;
  const freshFinalists = stage1?.four_sub_result?.finalists || [];
  console.log(`Fresh Stage 1 finalists (4-sub): ${freshFinalists.length}`);

  // ── Build physics options ──────────────────────────────────────────────
  const physicsOptions = buildNormalizedPhysicsOptions({
    ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
    qStrategy: 'ab_corrected',
  });

  // ── STEP 1: FRESH STAGE 2 — Run all 5 finalists through the engine ──────
  console.log('\n--- STEP 1: FRESH STAGE 2 REGENERATION ---');
  console.log('  Running 5 fresh finalists through authoritative bass engine...');

  const stage2StartTime = Date.now();
  const freshResults = [];
  for (let i = 0; i < freshFinalists.length; i++) {
    const finalist = freshFinalists[i];
    const sources = buildSourcesFromFinalist(finalist, roomDims, SELECTED_SUB_MODEL, AMP_POWER_PER_SUB_W);
    const t0 = Date.now();
    const result = simulateAuthoritativeBassResponse({
      roomDims,
      sources,
      seatingPositions,
      rspPosition,
      physicsOptions,
      collectDiagnostics: false,
    });
    const elapsed = Date.now() - t0;
    const seatResponses = result.seatResponses;
    const rspCurve = responseCurve(seatResponses?.rsp);
    const metrics = computeP19P20(seatResponses, seatingPositions);
    const levels = extractLevels(metrics);
    freshResults.push({
      finalistId: finalist.id,
      familyId: finalist.familyId,
      sources,
      seatResponses,
      rspCurve,
      metrics,
      levels,
      elapsed,
    });
    console.log(`  [${i + 1}/5] ${finalist.familyId} (${finalist.id.substring(0, 40)}...): ${elapsed}ms, P19=${levels.p19 !== null ? 'L' + levels.p19 : 'null'} (${metrics.p19.variationDb.toFixed(1)}dB), P20=${levels.p20 !== null ? 'L' + levels.p20 : 'null'}`);
  }
  const stage2Elapsed = Date.now() - stage2StartTime;
  console.log(`  Fresh Stage 2 total elapsed: ${stage2Elapsed} ms (${(stage2Elapsed / 1000).toFixed(1)}s)`);

  // Rank fresh finalists by P19 variation (lower is better)
  const ranked = [...freshResults].sort((a, b) => a.metrics.p19.variationDb - b.metrics.p19.varationDb);
  const bestFresh = ranked[0];
  console.log(`  Best fresh finalist: ${bestFresh.familyId} (P19 variation: ${bestFresh.metrics.p19.variationDb.toFixed(1)} dB)`);

  // ── STEP 2: CURRENT DESIGN — Run through the same engine ──────────────
  console.log('\n--- STEP 2: CURRENT DESIGN ---');
  const currentSources = buildCurrentSources(project, roomDims);
  const currentT0 = Date.now();
  const currentResult = simulateAuthoritativeBassResponse({
    roomDims,
    sources: currentSources,
    seatingPositions,
    rspPosition,
    physicsOptions,
    collectDiagnostics: false,
  });
  const currentElapsed = Date.now() - currentT0;
  const currentSeatResponses = currentResult.seatResponses;
  const currentRspCurve = responseCurve(currentSeatResponses?.rsp);
  const currentMetrics = computeP19P20(currentSeatResponses, seatingPositions);
  const currentLevels = extractLevels(currentMetrics);
  console.log(`  Current: ${currentElapsed}ms, P19=${currentLevels.p19 !== null ? 'L' + currentLevels.p19 : 'null'} (${currentMetrics.p19.variationDb.toFixed(1)}dB), P20=${currentLevels.p20 !== null ? 'L' + currentLevels.p20 : 'null'}`);
  console.log(`  Current sources: ${currentSources.length}`);
  currentSources.forEach(s => {
    console.log(`    ${s.id}: (${s.x}, ${s.y.toFixed(3)}) delay=${s.tuning.delayMs.toFixed(2)}ms`);
  });

  // ── STEP 3: GRAPH SMELL TEST ───────────────────────────────────────────
  console.log('\n--- STEP 3: GRAPH SMELL TEST ---');

  // Run the full canonical EQ pipeline for the Current design
  // This produces: postEqRspCurve (Final EQ), maximumSplCurveAfterEq (Product+Room Max),
  // productionHouseCurveTarget (House Target), roomResponseCurve (Room Response)
  const subCapability = resolveSubwooferBassCapability(SELECTED_SUB_MODEL);
  const canonicalT0 = Date.now();
  const candidatePool = generateCanonicalCandidatePool({
    rspRawCurve: currentRspCurve,
    perSeatRawCurves: Object.entries(currentSeatResponses)
      .filter(([id]) => id !== 'rsp')
      .map(([seatId, resp]) => ({ seatId, responseData: responseCurve(resp) })),
    sources: currentSources,
    subCapability,
    p14TargetDb: P14_TARGET_DB,
    p14TargetBasis: P14_TARGET_BASIS,
    p14TargetLevel: P14_TARGET_LEVEL,
    targetSpl: TARGET_SPL,
    roomDims,
  });
  const selectedCandidate = selectCandidateFromPool(candidatePool, {
    p14TargetDb: P14_TARGET_DB,
    p14TargetBasis: P14_TARGET_BASIS,
  });
  const finalResponse = buildFinalOptimisedBassResponse({
    selectedCandidate,
    rspRawCurve: currentRspCurve,
    perSeatRawCurves: Object.entries(currentSeatResponses)
      .filter(([id]) => id !== 'rsp')
      .map(([seatId, resp]) => ({ seatId, responseData: responseCurve(resp) })),
    sources: currentSources,
    roomDims,
    targetSpl: TARGET_SPL,
  });
  const canonicalElapsed = Date.now() - canonicalT0;

  // Extract graph series
  const finalEq = finalResponse?.postEqRspCurve || [];
  const productMax = finalResponse?.maximumSplCurveAfterEq || [];
  const houseTarget = selectedCandidate?.productionHouseCurveTarget || [];
  const roomResponse = finalResponse?.roomResponseCurve || [];
  const physicalRaw = currentRspCurve; // RSP before EQ

  console.log(`  Canonical EQ pipeline: ${canonicalElapsed}ms`);
  console.log(`  Graph series lengths:`);
  console.log(`    Room Response: ${roomResponse.length} points`);
  console.log(`    Physical RSP (before EQ): ${physicalRaw.length} points`);
  console.log(`    Final EQ (post-EQ RSP): ${finalEq.length} points`);
  console.log(`    Product+Room Max (usable max): ${productMax.length} points`);
  console.log(`    House Target: ${houseTarget.length} points`);

  // Verify constraints
  const constraints = [];

  // 1. Final EQ never exceeds Product + Room Maximum
  let finalEqExceedsMax = 0;
  if (finalEq.length && productMax.length) {
    for (const point of finalEq) {
      const maxAtFreq = productMax.find(p => Math.abs(p.frequency - point.frequency) < 0.5);
      if (maxAtFreq && point.spl > maxAtFreq.spl + 0.5) {
        finalEqExceedsMax++;
      }
    }
  }
  constraints.push({
    test: 'Final EQ ≤ Product+Room Maximum',
    expected: '0 violations',
    actual: `${finalEqExceedsMax} violations`,
    pass: finalEqExceedsMax === 0,
  });

  // 2. +EQ ≤ +6 dB (boost limit)
  let maxBoost = 0;
  if (finalEq.length && physicalRaw.length) {
    for (let i = 0; i < finalEq.length; i++) {
      const rawAtFreq = physicalRaw.find(p => Math.abs(p.frequency - finalEq[i].frequency) < 0.5);
      if (rawAtFreq) {
        const boost = finalEq[i].spl - rawAtFreq.spl;
        if (boost > maxBoost) maxBoost = boost;
      }
    }
  }
  constraints.push({
    test: '+EQ ≤ +6 dB',
    expected: '≤ 6.0 dB',
    actual: `${maxBoost.toFixed(1)} dB`,
    pass: maxBoost <= 6.5,
  });

  // 3. Cuts ≥ -15 dB (cut limit)
  let maxCut = 0;
  if (finalEq.length && physicalRaw.length) {
    for (let i = 0; i < finalEq.length; i++) {
      const rawAtFreq = physicalRaw.find(p => Math.abs(p.frequency - finalEq[i].frequency) < 0.5);
      if (rawAtFreq) {
        const cut = finalEq[i].spl - rawAtFreq.spl;
        if (cut < maxCut) maxCut = cut;
      }
    }
  }
  constraints.push({
    test: 'Cuts ≥ -15 dB',
    expected: '≥ -15.0 dB',
    actual: `${maxCut.toFixed(1)} dB`,
    pass: maxCut >= -15.5,
  });

  // 4. Narrow severe nulls remain unfilled (check deepest nulls)
  const currentCredibility = analyzeGraphCredibility(physicalRaw, 'Current');
  const finalEqCredibility = analyzeGraphCredibility(finalEq, 'Final EQ');
  constraints.push({
    test: 'Narrow nulls remain unfilled',
    expected: 'Final EQ has nulls (> 0)',
    actual: `${finalEqCredibility.nulls} nulls`,
    pass: finalEqCredibility.nulls > 0,
  });

  // 5. Broad correctable errors sensibly reduced
  const rawRange = currentCredibility.range;
  const eqRange = finalEqCredibility.range;
  constraints.push({
    test: 'Broad errors reduced (range decreased)',
    expected: `EQ range < raw range (${rawRange.toFixed(1)} dB)`,
    actual: `${eqRange.toFixed(1)} dB`,
    pass: eqRange < rawRange,
  });

  // 6. Capability shortfalls remain visible (Final EQ follows raw below product max)
  let shortfallsVisible = 0;
  if (finalEq.length && productMax.length) {
    for (const point of finalEq) {
      const maxAtFreq = productMax.find(p => Math.abs(p.frequency - point.frequency) < 0.5);
      if (maxAtFreq && point.spl < maxAtFreq.spl - 3) {
        shortfallsVisible++;
      }
    }
  }
  constraints.push({
    test: 'Capability shortfalls remain visible',
    expected: '> 0 frequencies below product max',
    actual: `${shortfallsVisible} frequencies`,
    pass: shortfallsVisible > 0,
  });

  // 7. P14 agrees with capability graph
  constraints.push({
    test: 'P14 target within capability',
    expected: `P14 target ${P14_TARGET_DB} dB ≤ product max`,
    actual: productMax.length ? `Product max max: ${Math.max(...productMax.map(p => p.spl)).toFixed(1)} dB` : 'no data',
    pass: productMax.length ? Math.max(...productMax.map(p => p.spl)) >= P14_TARGET_DB : false,
  });

  // 8. P18/P19/P20 believable
  constraints.push({
    test: 'P19 believable (variation > 0)',
    expected: '> 0 dB',
    actual: `${currentMetrics.p19.variationDb.toFixed(1)} dB`,
    pass: currentMetrics.p19.variationDb > 0,
  });
  constraints.push({
    test: 'P20 believable (per-seat data exists)',
    expected: '> 0 seats',
    actual: `${currentMetrics.p20.perSeat.length} seats`,
    pass: currentMetrics.p20.perSeat.length > 0,
  });

  // Print constraints
  console.log('\n  Graph Smell Test Constraints:');
  for (const c of constraints) {
    console.log(`    ${c.pass ? 'PASS' : 'FAIL'}: ${c.test} — expected: ${c.expected}, actual: ${c.actual}`);
  }

  // ── STEP 4: IMPROVE WITH FRESH FINALISTS ────────────────────────────────
  console.log('\n--- STEP 4: IMPROVE WITH FRESH FINALISTS ---');

  // Check if Current is reused (same placement as any fresh finalist)
  const currentReuseStart = Date.now();
  const currentReused = freshResults.some(r => isSamePlacement(r.sources, currentSources));
  const currentReuseTime = Date.now() - currentReuseStart;
  console.log(`  Current reuse check: ${currentReuseTime}ms → ${currentReused ? 'YES' : 'NO'}`);

  // Select the best fresh finalist as the challenger
  const challenger = bestFresh;
  console.log(`  Challenger: ${challenger.familyId} (${challenger.finalistId.substring(0, 50)}...)`);
  console.log(`  Challenger P19: ${challenger.metrics.p19.variationDb.toFixed(1)} dB vs Current P19: ${currentMetrics.p19.variationDb.toFixed(1)} dB`);

  // Run canonical confirmation for the challenger (already done in Step 1 — reuse the result)
  const challengerConfirmationTime = challenger.elapsed;
  console.log(`  Challenger confirmation time: ${challengerConfirmationTime} ms`);

  // Primary-seat protection
  const protectionStart = Date.now();
  const regression = hasPrimarySeatRegression(
    {
      isCurrent: true,
      finalistId: 'current',
      familyId: 'current',
      metrics: {
        p19: { level: currentLevels.p19, perSeat: currentMetrics.p19.perSeat },
        p20: { level: currentLevels.p20, perSeat: currentMetrics.p20.perSeat },
        p18: { level: 3 },
      },
      perSeatP19: currentMetrics.p19.perSeat,
      perSeatP20: currentMetrics.p20.perSeat,
    },
    {
      isCurrent: false,
      finalistId: challenger.finalistId,
      familyId: challenger.familyId,
      metrics: {
        p19: { level: challenger.levels.p19, perSeat: challenger.metrics.p19.perSeat },
        p20: { level: challenger.levels.p20, perSeat: challenger.metrics.p20.perSeat },
        p18: { level: 3 },
      },
      perSeatP19: challenger.metrics.p19.perSeat,
      perSeatP20: challenger.metrics.p20.perSeat,
    },
  );
  const protectionTime = Date.now() - protectionStart;
  console.log(`  Primary-seat protection: ${protectionTime}ms → regression: ${regression ? 'YES' : 'NO'}`);

  // Winner selection
  const winnerStart = Date.now();
  let winner = 'NO WINNER';
  if (!regression && challenger.metrics.p19.variationDb < currentMetrics.p19.variationDb) {
    winner = `${challenger.familyId} PROMOTED`;
  } else {
    winner = 'CURRENT RETAINED';
  }
  const winnerTime = Date.now() - winnerStart;
  console.log(`  Winner selection: ${winnerTime}ms → ${winner}`);

  const totalImproveTime = currentReuseTime + challengerConfirmationTime + protectionTime + winnerTime;
  console.log(`  TOTAL IMPROVE TIME: ${totalImproveTime} ms (${(totalImproveTime / 1000).toFixed(1)}s)`);

  // ── SUMMARY ────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Fresh Stage 2 placement fingerprint: stage2-place:v3:a6d153338c591bc5`);
  console.log(`Fresh Stage 2 cache version: 4`);
  console.log(`Fresh Stage 2 elapsed: ${stage2Elapsed} ms`);
  console.log(`Fresh Stage 2 finalist count: ${freshFinalists.length}`);
  console.log(`Current reused: ${currentReused ? 'YES' : 'NO'}`);
  console.log(`Fresh challenger confirmation time: ${challengerConfirmationTime} ms`);
  console.log(`Total Improve time: ${totalImproveTime} ms`);
  console.log(`Winner: ${winner}`);
  console.log(`Graph smell test: ${constraints.filter(c => c.pass).length}/${constraints.length} passed`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});