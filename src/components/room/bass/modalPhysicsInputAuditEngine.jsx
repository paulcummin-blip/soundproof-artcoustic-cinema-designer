// modalPhysicsInputAuditEngine.jsx
// Pure computation helpers for the Modal Physics Input Audit.
// STRICT DIAGNOSTIC: read-only. Does not modify rewBassEngine.js, modalCalculations.js,
// Q values, damping, weighting, summation order, or any production/saved-project state.
// Every variant below only changes ONE of: source coupling sampling, receiver coupling
// sampling, modal excitation normalisation, mode-set filtering, or small (diagnostic-only)
// position/room perturbations — reusing the exact production Q/coupling formulas.

import { computeRoomModesLocal, estimateModeQLocal, modeShapeValueLocal, resonantTransfer } from '@/bass/core/modalCalculations';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from '@/components/room/bass/LiveModalContributorAudit';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

export const TRACKED_MODE_KEY = { nx: 0, ny: 2, nz: 0 };
export const CHECK_FREQS = [29.5, 30, 32, 35, 40, 40.6, 45, 50, 57, 58];
export const RANK_FREQS = [30, 35, 40, 45, 50, 57, 58];

export function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function toDb(m) { return 20 * Math.log10(Math.max(m, 1e-10)); }

// Diagnostic-only replica of the production soft Q ceiling (rewBassEngine.js, __PRODUCTION_SOFT_Q_CAP__).
// Duplicated here (read-only) purely so the full mode set (not just the top-8 debug rows) can be
// reconstructed locally for filtering/averaging tests. Not wired back into production.
function diagnosticSmoothSoftQCap(freqHz) {
  const cap = 200 / Math.pow(Math.max(freqHz, 1), 0.52);
  return Math.max(8, Math.min(45, cap));
}
function diagnosticQForMode(mode, axialQ, roomDims, surfaceAbsorption) {
  const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  const baseQ = activeAxes === 1 ? axialQ : activeAxes === 2 ? 3.9 : 2.5;
  const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: mode.freq, mode });
  const softCap = diagnosticSmoothSoftQCap(mode.freq);
  // Matches production default path exactly: min(absorptionQ, softCap), baseQ unused in default path.
  void baseQ;
  return Math.max(1, Math.min(absorptionQ, softCap));
}

function buildModesWithQ(roomDims, fMax, axialQ, surfaceAbsorption) {
  return computeRoomModesLocal({ widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM, fMax, c: 343 })
    .map((mode) => ({ ...mode, order: Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz), qValue: diagnosticQForMode(mode, axialQ, roomDims, surfaceAbsorption) }));
}

// ── Coupling sampling strategies (source & receiver) ──────────────────────
function pointCoupling(mode, pos, roomDims) { return modeShapeValueLocal(mode, pos.x, pos.y, pos.z, roomDims); }
function axisAvgCoupling(mode, pos, roomDims, axis, deltaM) {
  const p1 = { ...pos, [axis]: pos[axis] - deltaM };
  const p2 = { ...pos, [axis]: pos[axis] + deltaM };
  return (pointCoupling(mode, p1, roomDims) + pointCoupling(mode, pos, roomDims) + pointCoupling(mode, p2, roomDims)) / 3;
}
function area5ptCoupling(mode, pos, roomDims, deltaM) {
  const pts = [pos, { ...pos, x: pos.x - deltaM }, { ...pos, x: pos.x + deltaM }, { ...pos, y: pos.y - deltaM }, { ...pos, y: pos.y + deltaM }];
  return pts.reduce((s, p) => s + pointCoupling(mode, p, roomDims), 0) / pts.length;
}
function rms5ptCoupling(mode, pos, roomDims, deltaM) {
  const pts = [pos, { ...pos, x: pos.x - deltaM }, { ...pos, x: pos.x + deltaM }, { ...pos, y: pos.y - deltaM }, { ...pos, y: pos.y + deltaM }];
  const vals = pts.map((p) => pointCoupling(mode, p, roomDims));
  const rms = Math.sqrt(vals.reduce((s, v) => s + v * v, 0) / vals.length);
  return Math.sign(vals[0] || 1) * rms;
}

// ── Modal contribution (mirrors production modalPressureContributionLocal, without the
//    deterministic REW-parity phase-jitter add-on, for a clean diagnostic comparison) ──
function modalContribution(frequencyHz, mode, combinedCoupling, modalSourceAmplitude, source, seat, phaseOpts) {
  const { re: transferReal, im: transferImag } = resonantTransfer(frequencyHz, mode.freq, mode.qValue);
  const gain = modalSourceAmplitude * combinedCoupling; // orderWeight is always 1.0 in production

  const dx = source.x - seat.x, dy = source.y - seat.y, dz = (source.z ?? 0.35) - (seat.z ?? 1.2);
  const distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const propagationPhase = phaseOpts.disableModalPropagationPhase ? 0
    : -2 * Math.PI * frequencyHz * (distanceM / 343) * phaseOpts.propagationPhaseScale;
  const cosP = Math.cos(propagationPhase), sinP = Math.sin(propagationPhase);
  const alignedRe = (transferReal * cosP) - (transferImag * sinP);
  const alignedIm = (transferReal * sinP) + (transferImag * cosP);

  const tuningPhase = (-2 * Math.PI * frequencyHz * (phaseOpts.delayMs / 1000)) + (phaseOpts.polarity === 180 ? Math.PI : 0);
  const tCos = Math.cos(tuningPhase), tSin = Math.sin(tuningPhase);
  const re = (gain * alignedRe * tCos) - (gain * alignedIm * tSin);
  const im = (gain * alignedRe * tSin) + (gain * alignedIm * tCos);
  return { re, im };
}

// ── Variant registry ───────────────────────────────────────────────────────
// Each variant returns a modal-sum vector for one frequency, given the full mode list,
// source/seat positions, roomDims and modalSourceAmplitude. Everything not explicitly
// varied (Q, storage, tuning, propagation phase) uses the exact production values.
export const VARIANT_GROUPS = [
  {
    group: 'B — Source coupling', variants: [
      { id: 'B2_sourceWidthAvg', label: 'B. Source width average (3pt, ±0.15m, x-axis)', sourceCoupling: (mode, source, roomDims) => axisAvgCoupling(mode, source, roomDims, 'x', 0.15) },
      { id: 'B3_sourceDepthAvg', label: 'B. Source depth average (3pt, ±0.15m, y-axis)', sourceCoupling: (mode, source, roomDims) => axisAvgCoupling(mode, source, roomDims, 'y', 0.15) },
      { id: 'B4_source5ptArea', label: 'B. Source 5-point area average (±0.15m)', sourceCoupling: (mode, source, roomDims) => area5ptCoupling(mode, source, roomDims, 0.15) },
    ],
  },
  {
    group: 'C — Receiver coupling', variants: [
      { id: 'C2_receiver5ptAvg', label: 'C. Receiver 5-point seat/mic average (±0.15m)', receiverCoupling: (mode, seat, roomDims) => area5ptCoupling(mode, seat, roomDims, 0.15) },
      { id: 'C3_receiverRmsAvg', label: 'C. Receiver RMS average (5pt, ±0.15m)', receiverCoupling: (mode, seat, roomDims) => rms5ptCoupling(mode, seat, roomDims, 0.15) },
    ],
  },
  {
    group: 'D — Combined source + receiver averaging', variants: [
      { id: 'D1_combinedAvg', label: 'D. Combined source + receiver averaging (5pt each, ±0.15m, no coupling floor)', sourceCoupling: (mode, source, roomDims) => area5ptCoupling(mode, source, roomDims, 0.15), receiverCoupling: (mode, seat, roomDims) => area5ptCoupling(mode, seat, roomDims, 0.15) },
    ],
  },
  {
    group: 'E — Modal excitation normalisation', variants: [
      { id: 'E1_perModeNorm', label: 'E. Per-mode normalised excitation (unit |coupling|, sign preserved)', excitationAdjust: (mode, combinedCoupling) => (combinedCoupling === 0 ? 0 : Math.sign(combinedCoupling)) },
      { id: 'E2_perFamilyNorm', label: 'E. Per-family normalised excitation', excitationAdjust: (mode, combinedCoupling, ctx) => (ctx.familyAvgAbs[mode.type] > 1e-9 ? combinedCoupling / ctx.familyAvgAbs[mode.type] : combinedCoupling) },
      { id: 'E3_perOrderNorm', label: 'E. Per-order normalised excitation', excitationAdjust: (mode, combinedCoupling, ctx) => (ctx.orderAvgAbs[mode.order] > 1e-9 ? combinedCoupling / ctx.orderAvgAbs[mode.order] : combinedCoupling) },
      { id: 'E4_unityExcitation', label: 'E. Unity modal excitation (coupling floor removed entirely)', excitationAdjust: () => 1.0 },
    ],
  },
  {
    group: 'F — Mode-order energy', variants: [
      { id: 'F1_axialOrder1', label: 'F. Axial order 1 only', modeFilter: (mode) => mode.type === 'axial' && mode.order === 1 },
      { id: 'F2_axialOrder2', label: 'F. Axial order 2 only', modeFilter: (mode) => mode.type === 'axial' && mode.order === 2 },
      { id: 'F3_axialOrder3Plus', label: 'F. Axial order 3+ only', modeFilter: (mode) => mode.type === 'axial' && mode.order >= 3 },
      { id: 'F4_tangentialOnly', label: 'F. Tangential only', modeFilter: (mode) => mode.type === 'tangential' },
      { id: 'F5_obliqueOnly', label: 'F. Oblique only', modeFilter: (mode) => mode.type === 'oblique' },
      { id: 'F6_allExceptTracked', label: 'F. All modes except tracked (0,2,0)', modeFilter: (mode) => !(mode.nx === TRACKED_MODE_KEY.nx && mode.ny === TRACKED_MODE_KEY.ny && mode.nz === TRACKED_MODE_KEY.nz) },
      { id: 'F7_trackedOnly', label: 'F. Tracked mode (0,2,0) only', modeFilter: (mode) => mode.nx === TRACKED_MODE_KEY.nx && mode.ny === TRACKED_MODE_KEY.ny && mode.nz === TRACKED_MODE_KEY.nz },
    ],
  },
  {
    group: 'G — Boundary placement sensitivity (±5cm sub/seat, ±2cm room)', variants: [
      { id: 'G1_subXplus5', label: 'G. Sub x +5cm', sourceOverride: (s) => ({ ...s, x: s.x + 0.05 }) },
      { id: 'G2_subXminus5', label: 'G. Sub x −5cm', sourceOverride: (s) => ({ ...s, x: s.x - 0.05 }) },
      { id: 'G3_subYplus5', label: 'G. Sub y +5cm', sourceOverride: (s) => ({ ...s, y: s.y + 0.05 }) },
      { id: 'G4_subYminus5', label: 'G. Sub y −5cm', sourceOverride: (s) => ({ ...s, y: s.y - 0.05 }) },
      { id: 'G5_seatXplus5', label: 'G. Seat x +5cm', seatOverride: (s) => ({ ...s, x: s.x + 0.05 }) },
      { id: 'G6_seatYplus5', label: 'G. Seat y +5cm', seatOverride: (s) => ({ ...s, y: s.y + 0.05 }) },
      { id: 'G7_roomLengthPlus2', label: 'G. Room length +2cm', roomOverride: (r) => ({ ...r, lengthM: r.lengthM + 0.02 }) },
      { id: 'G8_roomWidthPlus2', label: 'G. Room width +2cm', roomOverride: (r) => ({ ...r, widthM: r.widthM + 0.02 }) },
    ],
  },
  {
    group: 'H — Modal density', variants: [
      { id: 'H1_below80', label: 'H. Modes below 80 Hz only', modeFilter: (mode) => mode.freq < 80 },
      { id: 'H2_below120', label: 'H. Modes below 120 Hz only', modeFilter: (mode) => mode.freq < 120 },
      { id: 'H3_below200', label: 'H. Modes below 200 Hz only', modeFilter: (mode) => mode.freq < 200 },
      { id: 'H4_belowSchroeder', label: 'H. Modes below Schroeder frequency only', modeFilter: (mode, ctx) => mode.freq < ctx.schroederFrequency },
    ],
  },
  {
    group: 'J — REW-like physical plausibility', variants: [
      { id: 'J1_mildSourceAvg', label: 'J. Mild finite source averaging (3pt, ±0.10m)', sourceCoupling: (mode, source, roomDims) => area5ptCoupling(mode, source, roomDims, 0.10) },
      { id: 'J2_mildReceiverAvg', label: 'J. Mild finite receiver averaging (3pt, ±0.10m)', receiverCoupling: (mode, seat, roomDims) => area5ptCoupling(mode, seat, roomDims, 0.10) },
      { id: 'J3_mildOrderNorm', label: 'J. Mild mode-order normalisation (1/√order)', excitationAdjust: (mode, combinedCoupling) => combinedCoupling / Math.sqrt(mode.order) },
      { id: 'J4_mildHighOrderAxialReduction', label: 'J. Mild high-order axial reduction (×0.85, order≥2 axial)', excitationAdjust: (mode, combinedCoupling) => (mode.type === 'axial' && mode.order >= 2 ? combinedCoupling * 0.85 : combinedCoupling) },
      { id: 'J5_mildOverlapCompensation', label: 'J. Mild modal overlap compensation (coupling-domain, ±3Hz neighbour)', excitationAdjust: (mode, combinedCoupling, ctx) => combinedCoupling * (ctx.hasCloseNeighbour(mode) ? 0.9 : 1.0) },
      { id: 'J6_mildBoundaryLossCompensation', label: 'J. Mild boundary-loss compensation (coupling-domain, wall-proximity)', excitationAdjust: (mode, combinedCoupling, ctx) => combinedCoupling * ctx.boundaryLossFactor },
    ],
  },
];

function schroederFreq(roomDims) { return 2000 * Math.sqrt(0.4 / (roomDims.widthM * roomDims.lengthM * roomDims.heightM)); }

function wallProximityFactor(pos, roomDims) {
  const dLeft = pos.x, dRight = roomDims.widthM - pos.x, dFront = pos.y, dBack = roomDims.lengthM - pos.y;
  const minDist = Math.min(dLeft, dRight, dFront, dBack);
  // Mild diagnostic coupling-domain reduction for very close-to-wall placements only.
  return minDist < 0.3 ? 0.95 : 1.0;
}

function buildContext(modes, roomDims, source) {
  const familySums = {}, familyCounts = {};
  const orderSums = {}, orderCounts = {};
  modes.forEach((mode) => {
    const src = pointCoupling(mode, source, roomDims);
    const abs = Math.abs(src);
    familySums[mode.type] = (familySums[mode.type] || 0) + abs;
    familyCounts[mode.type] = (familyCounts[mode.type] || 0) + 1;
    orderSums[mode.order] = (orderSums[mode.order] || 0) + abs;
    orderCounts[mode.order] = (orderCounts[mode.order] || 0) + 1;
  });
  const familyAvgAbs = {}; Object.keys(familySums).forEach((k) => { familyAvgAbs[k] = familySums[k] / familyCounts[k]; });
  const orderAvgAbs = {}; Object.keys(orderSums).forEach((k) => { orderAvgAbs[k] = orderSums[k] / orderCounts[k]; });
  const hasCloseNeighbour = (mode) => modes.some((m2) => m2 !== mode && Math.abs(m2.freq - mode.freq) <= 3 && Math.abs(m2.freq - mode.freq) > 0.01);
  return { familyAvgAbs, orderAvgAbs, hasCloseNeighbour, schroederFrequency: schroederFreq(roomDims), boundaryLossFactor: wallProximityFactor(source, roomDims) };
}

function computeVariantModalSum(variant, frequencyHz, baseModes, source, seat, roomDims, modalSourceAmplitude, phaseOpts, ctx) {
  const effSource = variant.sourceOverride ? variant.sourceOverride(source) : source;
  const effSeat = variant.seatOverride ? variant.seatOverride(seat) : seat;
  const effRoomDims = variant.roomOverride ? variant.roomOverride(roomDims) : roomDims;
  const modes = (variant.sourceOverride || variant.seatOverride || variant.roomOverride)
    ? buildModesWithQ(effRoomDims, 200, 8.0, phaseOpts.surfaceAbsorption)
    : baseModes;

  let re = 0, im = 0;
  modes.forEach((mode) => {
    if (variant.modeFilter && !variant.modeFilter(mode, ctx)) return;
    const sc = variant.sourceCoupling ? variant.sourceCoupling(mode, effSource, effRoomDims) : pointCoupling(mode, effSource, effRoomDims);
    const rc = variant.receiverCoupling ? variant.receiverCoupling(mode, effSeat, effRoomDims) : pointCoupling(mode, effSeat, effRoomDims);
    let combined = sc * rc;
    if (variant.excitationAdjust) combined = variant.excitationAdjust(mode, combined, ctx);
    const contrib = modalContribution(frequencyHz, mode, combined, modalSourceAmplitude, effSource, effSeat, phaseOpts);
    re += contrib.re; im += contrib.im;
  });
  return { re, im };
}

// ── Main sweep runner ───────────────────────────────────────────────────────
export function runModalPhysicsInputAudit(freqStart, freqEnd, step, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const allVariants = VARIANT_GROUPS.flatMap((g) => g.variants);
  const seriesByVariant = { A_baseline: [] };
  allVariants.forEach((v) => { seriesByVariant[v.id] = []; });

  for (let f = freqStart; f <= freqEnd + 1e-9; f += step) {
    let baselineRe = 0, baselineIm = 0;
    const variantSums = {}; allVariants.forEach((v) => { variantSums[v.id] = { re: 0, im: 0 }; });

    subsForSimulation.forEach((sub) => {
      const options = buildLiveEngineOptions(f, surfaceAbsorption);
      const engineOut = simulateBassResponseRewCore(roomDims, seatPos, sub, LIVE_SOURCE_CURVE, options);
      const vec = engineOut.perFrequencyVectorDebug?.[0];
      if (!vec) return;
      baselineRe += vec.finalRe || 0; baselineIm += vec.finalIm || 0;
      const preModalRe = (vec.finalRe || 0) - (vec.modalSumRe || 0);
      const preModalIm = (vec.finalIm || 0) - (vec.modalSumIm || 0);

      const source = { x: Number(sub.x), y: Number(sub.y), z: Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35 };
      const seat = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number.isFinite(Number(seatPos.z)) ? Number(seatPos.z) : 1.2 };
      const tuning = { delayMs: Number(sub?.tuning?.delayMs) || 0, polarity: Number(sub?.tuning?.polarity) === 180 ? 180 : 0 };
      const phaseOpts = {
        disableModalPropagationPhase: options.disableModalPropagationPhase === true || options.rewParityModalPhase === true,
        propagationPhaseScale: options.rewParityModalPhase ? 0 : (Number.isFinite(Number(options.propagationPhaseScale)) ? Number(options.propagationPhaseScale) : 0.5),
        delayMs: tuning.delayMs, polarity: tuning.polarity, surfaceAbsorption,
      };
      const curveDb = 90; // matches LIVE_SOURCE_CURVE flat reference used by buildLiveEngineOptions callers
      const modalSourceAmplitude = Math.pow(10, curveDb / 20);

      const baseModes = buildModesWithQ(roomDims, 200, 8.0, surfaceAbsorption);
      const ctx = buildContext(baseModes, roomDims, source);

      allVariants.forEach((v) => {
        const { re, im } = computeVariantModalSum(v, f, baseModes, source, seat, roomDims, modalSourceAmplitude, phaseOpts, ctx);
        const predictedFinalRe = preModalRe + re;
        const predictedFinalIm = preModalIm + im;
        variantSums[v.id].re += predictedFinalRe;
        variantSums[v.id].im += predictedFinalIm;
      });
    });

    seriesByVariant.A_baseline.push({ frequencyHz: f, splDb: toDb(mag(baselineRe, baselineIm)) });
    allVariants.forEach((v) => { seriesByVariant[v.id].push({ frequencyHz: f, splDb: toDb(mag(variantSums[v.id].re, variantSums[v.id].im)) }); });
  }

  return { seriesByVariant, allVariants };
}

function findAt(series, targetHz) {
  return series.reduce((best, r) => (Math.abs(r.frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz) ? r : best), series[0]);
}

function summariseSeries(series) {
  const trough = series.reduce((best, r) => (r.splDb < best.splDb ? r : best), series[0]);
  const p57 = findAt(series, 57).splDb, p58 = findAt(series, 58).splDb;
  const s30 = findAt(series, 30).splDb, s40 = findAt(series, 40).splDb, s50 = findAt(series, 50).splDb;
  const band3040 = series.filter((r) => r.frequencyHz >= 30 && r.frequencyHz <= 40);
  const band3545 = series.filter((r) => r.frequencyHz >= 35 && r.frequencyHz <= 45);
  const avg = (arr) => arr.reduce((s, r) => s + r.splDb, 0) / Math.max(arr.length, 1);
  return {
    nullCentreHz: trough.frequencyHz, nullDepthDb: trough.splDb,
    slope3040: (s40 - s30) / 10, slope3050: (s50 - s30) / 20,
    peak57: p57, peak58: p58,
    avg3040: avg(band3040), avg3545: avg(band3545),
  };
}

export function buildOutputTable(result) {
  const rows = [{ id: 'A_baseline', label: 'A. Production baseline', series: result.seriesByVariant.A_baseline }]
    .concat(result.allVariants.map((v) => ({ id: v.id, label: v.label, series: result.seriesByVariant[v.id] })));

  return rows.map((row) => {
    const deltas = {};
    CHECK_FREQS.forEach((hz) => {
      const base = findAt(result.seriesByVariant.A_baseline, hz).splDb;
      const own = findAt(row.series, hz).splDb;
      deltas[hz] = row.id === 'A_baseline' ? 0 : own - base;
    });
    return { ...row, deltas, summary: summariseSeries(row.series) };
  });
}

export function rankCandidates(outputRows) {
  const baseline = outputRows.find((r) => r.id === 'A_baseline');
  const candidates = outputRows.filter((r) => r.id !== 'A_baseline').map((row) => {
    const d30 = row.deltas[30], d35 = row.deltas[35], d40 = row.deltas[40], d50 = row.deltas[50], d57 = row.deltas[57], d58 = row.deltas[58];
    const reduction3540 = -((d35 + d40) / 2); // positive = null recovery reduced (good)
    const constraint30 = Math.abs(d30) <= 1.0;
    const constraint3540 = reduction3540 >= 2.0;
    const constraint50 = Math.abs(d50) <= 2.0;
    const constraint57 = Math.abs(d57) <= 2.0;
    const constraint58 = Math.abs(d58) <= 2.0;
    const noNewNotch = row.summary.nullDepthDb >= baseline.summary.nullDepthDb - 3; // diagnostic guard: no new artificial deep notch
    const pass = constraint30 && constraint3540 && constraint50 && constraint57 && constraint58 && noNewNotch;
    return { ...row, reduction3540, pass, reasons: { constraint30, constraint3540, constraint50, constraint57, constraint58, noNewNotch } };
  });
  candidates.sort((a, b) => {
    if (a.pass !== b.pass) return a.pass ? -1 : 1;
    return b.reduction3540 - a.reduction3540;
  });
  const best = candidates.find((c) => c.pass) || null;
  return { candidates, best };
}