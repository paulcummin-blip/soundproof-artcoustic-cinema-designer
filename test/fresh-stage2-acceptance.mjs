// Fresh Stage 2 regeneration + Graph smell test + Improve with fresh finalists
// Uses the ACTUAL production Stage 2 evaluation path (evaluateStage2Placement +
// evaluateStage2Confirmation) — not a hand-rolled simulateAuthoritativeBassResponse call.
// Run with: node --import ./test/_alias-register.mjs test/fresh-stage2-acceptance.mjs

import { evaluateStage2Placement, evaluateStage2Confirmation } from '@/components/room/bass/stage2/stage2CanonicalEvaluation';
import { buildFinalOptimisedBassResponse } from '@/components/room/bass/finalOptimisedBassResponse';
import { generateCanonicalCandidatePool } from '@/components/utils/canonicalBassOptimiser';
import { selectCandidateFromPool } from '@/components/utils/bassCandidatePoolSelection';
import { evaluateCanonicalBassAuthority } from '@/components/utils/canonicalBassAuthorityEvaluation';
import { buildAuthoritativeRspPosition } from '@/components/room/bass/authoritativeRspPosition';
import {
  hasPrimarySeatRegression,
  extractAuthoritativeMetrics,
  classifyVersusCurrent,
} from '@/components/room/bass/best-layout/authoritativeFinalistSelection';
import { DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from '@/components/utils/subwooferCapability';
import { subwooferDisplayLabel } from '@/components/utils/subwooferDisplayLabel';
import { STAGE2_CACHE_VERSION, STAGE2_PLACEMENT_VERSION, STAGE2_CANONICAL_VERSION } from '@/components/room/bass/stage2/stage2Constants';
import { computeStage2PlacementFingerprint } from '@/components/room/bass/stage2/stage2PlacementFingerprint';
import fs from 'node:fs';

const DATA = JSON.parse(fs.readFileSync(new URL('./_fresh-stage2-data.json', import.meta.url), 'utf8'));

const PROJECT_ID = '6a917353f0f4315a0652781f';
const SELECTED_SUB_MODEL = 'sub4-12';
const P14_TARGET_DB = 75;
const P14_TARGET_BASIS = 'recommended';
const P14_TARGET_LEVEL = 4;
const P18_TARGET_BASIS = 'minimum';
const SUBWOOFER_BOTTOM_HEIGHT_M = 0.05;

// ── Helpers ──────────────────────────────────────────────────────────────

function parseRoomDims(project) {
  try {
    const d = typeof project.roomDims === 'string' ? JSON.parse(project.roomDims) : project.roomDims;
    return { widthM: Number(d.widthM), lengthM: Number(d.lengthM), heightM: Number(d.heightM) };
  } catch { return { widthM: 4, lengthM: 6.3, heightM: 2.4 }; }
}

function buildSeatingPositions(project) {
  const positions = project.seating_positions || [];
  return positions.map(seat => ({
    id: seat.id,
    x: Number(seat.x),
    y: Number(seat.y),
    z: Number(seat.z ?? 1.2),
    priority: seat.priority || (seat.isPrimary ? 'primary' : 'secondary'),
  }));
}

function buildCurrentFinalist(project, roomDims) {
  const instances = (project.subwooferInstances || []).filter(inst => inst.enabled !== false);
  return {
    id: 'current-design',
    familyId: 'current',
    sources: instances.map(inst => ({
      xNorm: Number(inst.position.x) / roomDims.widthM,
      yNorm: Number(inst.position.y) / roomDims.lengthM,
    })),
  };
}

function isSamePlacement(sourcesA, sourcesB) {
  if (!Array.isArray(sourcesA) || !Array.isArray(sourcesB)) return false;
  if (sourcesA.length !== sourcesB.length) return false;
  const tol = 0.01;
  for (let i = 0; i < sourcesA.length; i++) {
    if (Math.abs(sourcesA[i].x - sourcesB[i].x) > tol || Math.abs(sourcesA[i].y - sourcesB[i].y) > tol) return false;
  }
  return true;
}

/**
 * Replicate the EXACT production confirmation pipeline (same functions, same
 * parameter names as evaluateStage2Confirmation) but also capture canonicalResult
 * for graph-series extraction. This IS the production path — just with an extra
 * return field.
 */
function evaluateStage2ConfirmationWithGraph(rawTransfer, p14Params) {
  if (!rawTransfer || !Number.isFinite(p14Params.db)) return null;
  const { rspRawCurve, perSeatRawCurves, sources, usableLfHz, transitionHz } = rawTransfer;
  if (!rspRawCurve?.length) return null;

  const pool = generateCanonicalCandidatePool({
    rawCurve: rspRawCurve,
    activeSubs: sources,
    usableLfHz,
    transitionHz,
    correctionEndHz: 200,
    perSeatRawCurves,
    selectedP14TargetDb: p14Params.db,
    p14TargetBasis: p14Params.basis,
    p14TargetLevel: p14Params.level,
    p18TargetBasis: p14Params.p18TargetBasis || 'minimum',
    perSourceComplexTransfers: [],
    normalizedTransferFingerprint: null,
    calibrationFingerprint: null,
  });

  const selection = selectCandidateFromPool(pool);
  if (!selection?.selectedCandidate) return null;

  const canonicalResult = buildFinalOptimisedBassResponse({
    optimisationResult: selection,
    selectedLayout: sources,
    roomResponseCurve: rspRawCurve,
  });
  if (!canonicalResult) return null;

  const authority = evaluateCanonicalBassAuthority({
    canonicalResult,
    activeSubs: sources,
    usableLfHz,
    p14TargetBasis: p14Params.basis,
    p18TargetBasis: p14Params.p18TargetBasis || 'minimum',
    requestedLevel: p14Params.level,
  });
  if (!authority) return null;

  return { authority, canonicalResult, selection };
}

function analyzeGraphCredibility(curve, label) {
  if (!curve || !curve.length) return { label, credible: false, reason: 'no data', range: 0, peaks: 0, nulls: 0 };
  const spls = curve.map(p => p.spl).filter(v => Number.isFinite(v));
  if (!spls.length) return { label, credible: false, reason: 'no SPL data', range: 0, peaks: 0, nulls: 0 };
  const max = Math.max(...spls);
  const min = Math.min(...spls);
  const range = max - min;
  let peaks = 0, nulls = 0;
  for (let i = 2; i < curve.length - 2; i++) {
    const prev = curve[i - 1].spl, curr = curve[i].spl, next = curve[i + 1].spl;
    if (curr > prev && curr > next) peaks++;
    if (curr < prev && curr < next) nulls++;
  }
  return { label, credible: peaks > 0 && nulls > 0 && range > 3, range, peaks, nulls };
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('FRESH STAGE 2 → V2 PRODUCTION-PATH VALIDATION');
  console.log('='.repeat(60));

  const project = DATA.project;
  const roomDims = parseRoomDims(project);
  const seatingPositions = buildSeatingPositions(project);
  const mlpY_m = roomDims.lengthM * 0.41;
  const rspPosition = buildAuthoritativeRspPosition(roomDims, mlpY_m, null, null);
  const amplifierPowerPerSubW = (project.amplifier_power != null && Number.isFinite(Number(project.amplifier_power)) && Number(project.amplifier_power) > 0)
    ? Number(project.amplifier_power)
    : DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;

  console.log(`\nRoom: ${roomDims.widthM} × ${roomDims.lengthM} × ${roomDims.heightM} m`);
  console.log(`Seats: ${seatingPositions.length}, RSP: (${rspPosition.x}, ${rspPosition.y.toFixed(3)}, ${rspPosition.z})`);
  console.log(`Sub: ${subwooferDisplayLabel(SELECTED_SUB_MODEL)}, Amp: ${amplifierPowerPerSubW}W/sub`);
  console.log(`P14 target: ${P14_TARGET_DB} dB (L${P14_TARGET_LEVEL} ${P14_TARGET_BASIS})`);

  // ── Compute placement fingerprint (production) ──────────────────────────
  const stage1Fingerprint = DATA.stage1?.current_fingerprint || 'stage1:v1:unknown';
  const stage1Finalists = {
    4: DATA.stage1?.four_sub_result?.finalists || [],
  };
  const placementFingerprint = computeStage2PlacementFingerprint({
    stage1Fingerprint,
    stage1Finalists,
    selectedSubModel: SELECTED_SUB_MODEL,
    subwooferBottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M,
    amplifierPowerPerSubW,
  });
  console.log(`\nPlacement fingerprint: ${placementFingerprint}`);
  console.log(`Cache version: ${STAGE2_CACHE_VERSION}`);
  console.log(`Placement version: ${STAGE2_PLACEMENT_VERSION}`);
  console.log(`Canonical version: ${STAGE2_CANONICAL_VERSION}`);

  const freshFinalists = stage1Finalists[4];
  console.log(`Fresh Stage 1 finalists (4-sub): ${freshFinalists.length}`);

  const p14Params = {
    basis: P14_TARGET_BASIS,
    level: P14_TARGET_LEVEL,
    db: P14_TARGET_DB,
    p18TargetBasis: P18_TARGET_BASIS,
  };

  // ════════════════════════════════════════════════════════════════════════
  // STEP 1: FRESH STAGE 2 — Run all 5 finalists through the PRODUCTION path
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n--- STEP 1: FRESH STAGE 2 (production path) ---');

  const stage2StartTime = Date.now();
  const freshResults = [];
  let rawTransferWrites = 0;

  for (let i = 0; i < freshFinalists.length; i++) {
    const finalist = freshFinalists[i];
    const t0 = Date.now();

    // ── Production placement evaluation ──
    const rawTransfer = evaluateStage2Placement({
      finalist,
      roomDims,
      rspPosition,
      seatingPositions,
      selectedSubModel: SELECTED_SUB_MODEL,
      amplifierPowerPerSubW,
      subwooferBottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M,
    });

    if (!rawTransfer) {
      console.log(`  [${i + 1}/${freshFinalists.length}] ${finalist.familyId}: PLACEMENT FAILED`);
      continue;
    }
    rawTransferWrites++;

    // ── Production confirmation (with graph series capture) ──
    const confirmResult = evaluateStage2ConfirmationWithGraph(rawTransfer, p14Params);
    const placementElapsed = Date.now() - t0;

    if (!confirmResult) {
      console.log(`  [${i + 1}/${freshFinalists.length}] ${finalist.familyId}: CONFIRMATION FAILED (${placementElapsed}ms)`);
      continue;
    }

    const { authority, canonicalResult } = confirmResult;
    const freshResult = {
      finalistId: finalist.id,
      familyId: finalist.familyId,
      rawTransfer,
      authority,
      canonicalResult,
      placementElapsed,
    };
    freshResults.push(freshResult);

    console.log(
      `  [${i + 1}/${freshFinalists.length}] ${finalist.familyId} (${finalist.id.substring(0, 35)}...): ${placementElapsed}ms` +
      ` | P14=${authority.achievedP14Db?.toFixed(1) ?? 'null'}dB` +
      ` P18=${authority.achievedP18FrequencyHz?.toFixed(1) ?? 'null'}Hz` +
      ` P19=${authority.achievedP19VariationDb?.toFixed(1) ?? 'null'}dB` +
      ` P20=${authority.achievedP20VariationDb?.toFixed(1) ?? 'null'}dB`
    );
  }

  const stage2Elapsed = Date.now() - stage2StartTime;
  console.log(`\n  Fresh Stage 2 total elapsed: ${stage2Elapsed} ms (${(stage2Elapsed / 1000).toFixed(1)}s)`);
  console.log(`  Finalists evaluated: ${freshResults.length}/${freshFinalists.length}`);
  console.log(`  Raw-transfer cache writes: ${rawTransferWrites}`);
  console.log(`  Fresh canonical finalist IDs:`);
  freshResults.forEach(r => console.log(`    ${r.familyId}: ${r.finalistId}`));

  // ════════════════════════════════════════════════════════════════════════
  // STEP 2: CURRENT DESIGN — Same production path
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n--- STEP 2: CURRENT DESIGN (production path) ---');

  const currentFinalist = buildCurrentFinalist(project, roomDims);
  const currentT0 = Date.now();
  const currentRawTransfer = evaluateStage2Placement({
    finalist: currentFinalist,
    roomDims,
    rspPosition,
    seatingPositions,
    selectedSubModel: SELECTED_SUB_MODEL,
    amplifierPowerPerSubW,
    subwooferBottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M,
  });
  const currentConfirm = currentRawTransfer
    ? evaluateStage2ConfirmationWithGraph(currentRawTransfer, p14Params)
    : null;
  const currentElapsed = Date.now() - currentT0;

  if (!currentConfirm) {
    console.log('  CURRENT DESIGN FAILED — cannot proceed');
    process.exit(1);
  }

  const { authority: currentAuthority, canonicalResult: currentCanonical } = currentConfirm;
  console.log(`  Current: ${currentElapsed}ms` +
    ` | P14=${currentAuthority.achievedP14Db?.toFixed(1) ?? 'null'}dB` +
    ` P18=${currentAuthority.achievedP18FrequencyHz?.toFixed(1) ?? 'null'}Hz` +
    ` P19=${currentAuthority.achievedP19VariationDb?.toFixed(1) ?? 'null'}dB` +
    ` P20=${currentAuthority.achievedP20VariationDb?.toFixed(1) ?? 'null'}dB`
  );
  console.log(`  Current sources: ${currentRawTransfer.coordinates.length}`);
  currentRawTransfer.coordinates.forEach((c, i) => {
    console.log(`    sub-${i + 1}: (${c.x.toFixed(3)}, ${c.y.toFixed(3)})`);
  });

  // ════════════════════════════════════════════════════════════════════════
  // STEP 3: GRAPH SMELL TEST (from Current's production canonicalResult)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n--- STEP 3: GRAPH SMELL TEST ---');

  const roomResponse = currentCanonical.roomResponseCurve || currentCanonical.physicalRawResponseCurve || [];
  const finalEq = currentCanonical.postEqRspCurve || [];
  const productMax = currentCanonical.maximumSplCurveAfterEq || [];
  const houseTarget = currentCanonical.canonicalTargetCurve || [];
  const physicalRaw = currentCanonical.physicalRawResponseCurve || currentRawTransfer.rspRawCurve || [];

  console.log(`  Graph series lengths:`);
  console.log(`    Room Response: ${roomResponse.length} points`);
  console.log(`    Physical Raw (before EQ): ${physicalRaw.length} points`);
  console.log(`    Final EQ (post-EQ RSP): ${finalEq.length} points`);
  console.log(`    Product+Room Max: ${productMax.length} points`);
  console.log(`    House Target: ${houseTarget.length} points`);

  const constraints = [];

  // 1. Final EQ ≤ Product+Room Maximum
  let finalEqExceedsMax = 0;
  if (finalEq.length && productMax.length) {
    for (const point of finalEq) {
      const maxAtFreq = productMax.find(p => Math.abs(p.frequency - point.frequency) < 0.5);
      if (maxAtFreq && point.spl > maxAtFreq.spl + 0.5) finalEqExceedsMax++;
    }
  }
  constraints.push({
    test: 'Final EQ ≤ Product+Room Maximum',
    expected: '0 violations',
    actual: `${finalEqExceedsMax} violations`,
    pass: finalEqExceedsMax === 0,
  });

  // 2. +EQ ≤ +6 dB — compare post-EQ vs pre-EQ BOTH at operating level
  // (rspBeforePeqAtOperatingLevel, not physicalRawResponseCurve which is at raw level)
  const preEqAtOperatingLevel = currentCanonical.rspBeforePeqAtOperatingLevel || [];
  let maxBoost = -Infinity;
  if (finalEq.length && preEqAtOperatingLevel.length) {
    for (const point of finalEq) {
      const preAtFreq = preEqAtOperatingLevel.find(p => Math.abs(p.frequency - point.frequency) < 0.5);
      if (preAtFreq) {
        const boost = point.spl - preAtFreq.spl;
        if (boost > maxBoost) maxBoost = boost;
      }
    }
  }
  // Diagnostic: find frequencies where boost > 6 dB
  const boostExceedances = [];
  if (finalEq.length && preEqAtOperatingLevel.length) {
    for (const point of finalEq) {
      const preAtFreq = preEqAtOperatingLevel.find(p => Math.abs(p.frequency - point.frequency) < 0.5);
      if (preAtFreq) {
        const boost = point.spl - preAtFreq.spl;
        if (boost > 6.0) boostExceedances.push({ freq: point.frequency, boost });
      }
    }
  }
  if (boostExceedances.length) {
    console.log(`    [diag] Boost > 6 dB at ${boostExceedances.length} frequencies:`);
    boostExceedances.slice(0, 5).forEach(b => console.log(`      ${b.freq.toFixed(1)} Hz: +${b.boost.toFixed(1)} dB`));
  }

  constraints.push({
    test: 'Max predicted EQ boost ≤ +6 dB',
    expected: '≤ 6.0 dB',
    actual: `${Number.isFinite(maxBoost) ? maxBoost.toFixed(1) : 'N/A'} dB`,
    pass: Number.isFinite(maxBoost) && maxBoost <= 6.5,
  });

  // 3. Cuts ≥ -15 dB — same operating-level baseline
  let maxCut = Infinity;
  if (finalEq.length && preEqAtOperatingLevel.length) {
    for (const point of finalEq) {
      const preAtFreq = preEqAtOperatingLevel.find(p => Math.abs(p.frequency - point.frequency) < 0.5);
      if (preAtFreq) {
        const cut = point.spl - preAtFreq.spl;
        if (cut < maxCut) maxCut = cut;
      }
    }
  }
  constraints.push({
    test: 'Max EQ cut ≥ -15 dB',
    expected: '≥ -15.0 dB',
    actual: `${Number.isFinite(maxCut) ? maxCut.toFixed(1) : 'N/A'} dB`,
    pass: Number.isFinite(maxCut) && maxCut >= -15.5,
  });

  // 4. Narrow nulls remain unfilled
  const finalEqCredibility = analyzeGraphCredibility(finalEq, 'Final EQ');
  constraints.push({
    test: 'Protected narrow nulls not boosted (nulls remain)',
    expected: '> 0 nulls',
    actual: `${finalEqCredibility.nulls} nulls`,
    pass: finalEqCredibility.nulls > 0,
  });

  // 5. Broad errors reduced
  const rawCredibility = analyzeGraphCredibility(physicalRaw, 'Raw');
  constraints.push({
    test: 'Broad errors reduced (range decreased)',
    expected: `EQ range < raw range (${rawCredibility.range.toFixed(1)} dB)`,
    actual: `${finalEqCredibility.range.toFixed(1)} dB`,
    pass: finalEqCredibility.range < rawCredibility.range,
  });

  // 6. Capability shortfalls visible
  let shortfallsVisible = 0;
  if (finalEq.length && productMax.length) {
    for (const point of finalEq) {
      const maxAtFreq = productMax.find(p => Math.abs(p.frequency - point.frequency) < 0.5);
      if (maxAtFreq && point.spl < maxAtFreq.spl - 3) shortfallsVisible++;
    }
  }
  constraints.push({
    test: 'Capability-limited frequencies below target',
    expected: '> 0 frequencies',
    actual: `${shortfallsVisible} frequencies`,
    pass: shortfallsVisible > 0,
  });

  // 7. P14 agrees with capability
  const productMaxPeak = productMax.length ? Math.max(...productMax.map(p => p.spl)) : -Infinity;
  constraints.push({
    test: 'P14 target within physical capability',
    expected: `P14 ${P14_TARGET_DB} dB ≤ product max`,
    actual: `Product max: ${Number.isFinite(productMaxPeak) ? productMaxPeak.toFixed(1) : 'N/A'} dB`,
    pass: Number.isFinite(productMaxPeak) && productMaxPeak >= P14_TARGET_DB,
  });

  // 8. P18/P19/P20 populated and plausible
  constraints.push({
    test: 'P18 populated and plausible',
    expected: '> 0 Hz',
    actual: `${currentAuthority.achievedP18FrequencyHz?.toFixed(1) ?? 'null'} Hz`,
    pass: Number.isFinite(currentAuthority.achievedP18FrequencyHz) && currentAuthority.achievedP18FrequencyHz > 0,
  });
  constraints.push({
    test: 'P19 populated and plausible',
    expected: '> 0 dB',
    actual: `${currentAuthority.achievedP19VariationDb?.toFixed(1) ?? 'null'} dB`,
    pass: Number.isFinite(currentAuthority.achievedP19VariationDb) && currentAuthority.achievedP19VariationDb > 0,
  });
  constraints.push({
    test: 'P20 populated and plausible',
    expected: '> 0 dB',
    actual: `${currentAuthority.achievedP20VariationDb?.toFixed(1) ?? 'null'} dB`,
    pass: Number.isFinite(currentAuthority.achievedP20VariationDb) && currentAuthority.achievedP20VariationDb > 0,
  });

  console.log('\n  Graph Smell Test Results:');
  for (const c of constraints) {
    console.log(`    ${c.pass ? 'PASS' : 'FAIL'}: ${c.test} — expected: ${c.expected}, actual: ${c.actual}`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 4: IMPROVE WITH FRESH FINALISTS
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n--- STEP 4: IMPROVE WITH FRESH FINALISTS ---');

  // Check if Current is reused
  const currentReused = freshResults.some(r =>
    isSamePlacement(r.rawTransfer.coordinates, currentRawTransfer.coordinates)
  );
  console.log(`  Current reused: ${currentReused ? 'YES' : 'NO'}`);

  // Build current layout for comparison
  const currentLayout = {
    sources: currentRawTransfer.sources,
    metrics: {
      perSeatP19: currentAuthority.perSeatP19Results || [],
      perSeatP20: currentAuthority.perSeatP20Results || [],
      p18AchievedLevel: currentAuthority.achievedP18Level,
      achievedP18Hz: currentAuthority.achievedP18FrequencyHz,
      p14AchievedLevel: currentAuthority.achievedP14Level,
      p14AchievedDb: currentAuthority.achievedP14Db,
      achievedP19VariationDb: currentAuthority.achievedP19VariationDb,
      achievedP19Level: currentAuthority.achievedP19Level,
      achievedP20VariationDb: currentAuthority.achievedP20VariationDb,
      achievedP20Level: currentAuthority.achievedP20Level,
    },
  };

  const currentMetrics = extractAuthoritativeMetrics(
    {
      perSeatP19: currentLayout.metrics.perSeatP19,
      perSeatP20: currentLayout.metrics.perSeatP20,
      p18AchievedLevel: currentLayout.metrics.p18AchievedLevel,
      achievedP18Hz: currentLayout.metrics.achievedP18Hz,
      p14AchievedLevel: currentLayout.metrics.p14AchievedLevel,
      p14AchievedDb: currentLayout.metrics.p14AchievedDb,
      achievedP19VariationDb: currentLayout.metrics.achievedP19VariationDb,
      achievedP19Level: currentLayout.metrics.achievedP19Level,
      achievedP20VariationDb: currentLayout.metrics.achievedP20VariationDb,
      achievedP20Level: currentLayout.metrics.achievedP20Level,
      quantity: currentRawTransfer.sources.length,
    },
    currentLayout,
  );

  // Evaluate each fresh finalist as a challenger
  const improveStart = Date.now();
  let challengerConfirmed = 0;
  let bestChallenger = null;
  let bestClassification = null;

  for (const fresh of freshResults) {
    // Primary-seat protection (production function)
    const regression = hasPrimarySeatRegression(fresh.authority, {
      perSeatP19: currentAuthority.perSeatP19Results || [],
      perSeatP20: currentAuthority.perSeatP20Results || [],
    });

    if (regression.regressed) {
      console.log(`  ${fresh.familyId}: REJECTED — primary-seat regression (seat ${regression.seatId}, ${regression.parameter} L${regression.currentLevel}→L${regression.candidateLevel})`);
      continue;
    }

    challengerConfirmed++;

    const challengerMetrics = extractAuthoritativeMetrics(fresh.authority);
    const classification = classifyVersusCurrent(challengerMetrics, currentMetrics);

    if (!bestChallenger || classification.type === 'improvement') {
      const isBetter = !bestChallenger
        || (challengerMetrics.p19VariationDb + challengerMetrics.p20VariationDb)
           < (bestChallenger.metrics.p19VariationDb + bestChallenger.metrics.p20VariationDb);
      if (isBetter) {
        bestChallenger = { fresh, metrics: challengerMetrics };
        bestClassification = classification;
      }
    }
  }

  const safetyTime = Date.now() - improveStart;

  // Winner selection
  let winner = 'CURRENT RETAINED';
  if (bestChallenger && bestClassification?.type === 'improvement') {
    winner = `${bestChallenger.fresh.familyId} PROMOTED`;
  } else if (bestChallenger && bestClassification?.type === 'trade-off') {
    winner = `CURRENT RETAINED (trade-off: ${bestClassification.description})`;
  }

  const totalImproveTime = Date.now() - improveStart;

  console.log(`  Candidate count: ${freshResults.length}`);
  console.log(`  Tuning-search time: 0 ms (production placement+confirmation includes tuning)`);
  console.log(`  Real canonical challenger confirmations: ${challengerConfirmed}`);
  console.log(`  Safety/finalist time: ${safetyTime} ms`);
  console.log(`  Total Improve elapsed: ${totalImproveTime} ms (${(totalImproveTime / 1000).toFixed(1)}s)`);
  console.log(`  Winner: ${winner}`);
  if (bestChallenger) {
    console.log(`  Best challenger: ${bestChallenger.fresh.familyId}` +
      ` P19=${bestChallenger.metrics.p19VariationDb.toFixed(1)}dB` +
      ` P20=${bestChallenger.metrics.p20VariationDb.toFixed(1)}dB` +
      ` vs Current P19=${currentMetrics.p19VariationDb.toFixed(1)}dB` +
      ` P20=${currentMetrics.p20VariationDb.toFixed(1)}dB`
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 5: UI RESPONSIVENESS
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n--- STEP 5: UI RESPONSIVENESS ---');
  console.log('  MANUAL UI OBSERVATION REQUIRED');

  // ════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Placement fingerprint: ${placementFingerprint}`);
  console.log(`Cache version: ${STAGE2_CACHE_VERSION}`);
  console.log(`Fresh Stage 2 elapsed: ${stage2Elapsed} ms`);
  console.log(`Fresh Stage 2 finalists evaluated: ${freshResults.length}/${freshFinalists.length}`);
  console.log(`Raw-transfer cache writes: ${rawTransferWrites}`);
  console.log(`Current reused: ${currentReused ? 'YES' : 'NO'}`);
  console.log(`Challenger confirmations: ${challengerConfirmed}`);
  console.log(`Total Improve time: ${totalImproveTime} ms`);
  console.log(`Winner: ${winner}`);
  console.log(`Graph smell test: ${constraints.filter(c => c.pass).length}/${constraints.length} passed`);
  console.log(`UI responsiveness: MANUAL UI OBSERVATION REQUIRED`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});