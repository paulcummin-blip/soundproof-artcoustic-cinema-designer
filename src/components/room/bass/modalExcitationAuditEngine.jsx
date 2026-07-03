// modalExcitationAuditEngine.jsx
// Pure computation helpers for the Modal Excitation Audit.
// STRICT DIAGNOSTIC: read-only. Reconstructs each stage of modal excitation (source coupling,
// receiver coupling, combined excitation, distance term, modal gain, radiation/source curve,
// pre-transfer complex value, post-transfer complex value) using the exact canonical primitives
// (modeShapeValueLocal, resonantTransfer, estimateModeQLocal) from modalCalculations.js and the
// live engine's own Q soft-cap formula — the same primitives rewBassEngine.js itself calls.
// Cross-checked against the live engine's own activeReal/activeImag debug output (Stage 8) to
// confirm the reconstruction is faithful. No production/graph/physics changes — measurements only.

import { estimateModeQLocal, modeShapeValueLocal, resonantTransfer } from '@/bass/core/modalCalculations';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from '@/components/room/bass/liveBassAuditOptions';

const SPEED_OF_SOUND_MPS = 343;

export const TRACKED_MODES = [
  { nx: 0, ny: 1, nz: 0 },
  { nx: 0, ny: 2, nz: 0 },
  { nx: 0, ny: 3, nz: 0 },
  { nx: 0, ny: 4, nz: 0 },
  { nx: 2, ny: 0, nz: 0 },
  { nx: 2, ny: 2, nz: 0 },
];

export const TARGET_FREQS = [29.5, 30, 32, 35, 40, 40.6, 45, 50, 57, 58];

function keyOf(nx, ny, nz) { return `${nx},${ny},${nz}`; }
function familyOf(nx, ny, nz) {
  const active = [nx > 0, ny > 0, nz > 0].filter(Boolean).length;
  return active === 1 ? 'axial' : active === 2 ? 'tangential' : 'oblique';
}
function modeNativeFreq(nx, ny, nz, roomDims, c = SPEED_OF_SOUND_MPS) {
  const widthM = Number(roomDims?.widthM) || 1, lengthM = Number(roomDims?.lengthM) || 1, heightM = Number(roomDims?.heightM) || 1;
  return (c / 2) * Math.sqrt(Math.pow(nx / widthM, 2) + Math.pow(ny / lengthM, 2) + Math.pow(nz / heightM, 2));
}
// Matches __PRODUCTION_SOFT_Q_CAP__ in rewBassEngine.js exactly.
function smoothSoftQCap(freqHz) {
  const A = 200, n = 0.52;
  const cap = A / Math.pow(Math.max(freqHz, 1), n);
  return Math.max(8, Math.min(45, cap));
}
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function phaseDeg(re, im) { return (Math.atan2(im, re) * 180) / Math.PI; }
function toDb(m) { return 20 * Math.log10(Math.max(m, 1e-10)); }

function interpCurveDb(curve, hz) {
  const pts = curve.map((p) => ({ hz: Number(p.hz), db: Number(p.db) })).sort((a, b) => a.hz - b.hz);
  if (hz <= pts[0].hz) return pts[0].db;
  if (hz >= pts[pts.length - 1].hz) return pts[pts.length - 1].db;
  for (let i = 0; i < pts.length - 1; i++) {
    if (hz >= pts[i].hz && hz <= pts[i + 1].hz) {
      const r = (hz - pts[i].hz) / (pts[i + 1].hz - pts[i].hz);
      return pts[i].db + (pts[i + 1].db - pts[i].db) * r;
    }
  }
  return pts[0].db;
}

export function buildModeMeta(roomDims, surfaceAbsorption) {
  return TRACKED_MODES.map(({ nx, ny, nz }) => {
    const modeFrequencyHz = modeNativeFreq(nx, ny, nz, roomDims);
    const family = familyOf(nx, ny, nz);
    const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: modeFrequencyHz, mode: { nx, ny, nz } });
    const qValue = Math.max(1, Math.min(absorptionQ, smoothSoftQCap(modeFrequencyHz)));
    return { key: keyOf(nx, ny, nz), nx, ny, nz, family, modeFrequencyHz, qValue };
  });
}

// Reconstructs all 8 stages for one mode at one frequency, using the live engine's actual
// modal source amplitude decomposition (buildLiveEngineOptions => modalSourceReferenceMode:
// 'distance_normalized', disableModalPropagationPhase: true, modalStorageMode: 'none',
// pureDeterministicModalSum: true — so Stage 8 reduces to modalGain * resonantTransfer exactly,
// matching the engine's own activeReal/activeImag with no propagation-phase rotation).
function computeStages(mode, frequencyHz, roomDims, seatPos, source, curve) {
  const curveDb = interpCurveDb(curve, frequencyHz);
  const gainDb = source?.tuning?.gainDb ?? 0;
  const modalGainScalar = 1.0; // production default in live engine options

  // Stage 1 — raw source modal coupling (before gain/transfer/phase)
  const stage1 = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims);
  // Stage 2 — receiver modal coupling (before multiplication)
  const stage2 = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z, roomDims);
  // Stage 3 — combined excitation (source × receiver)
  const stage3 = stage1 * stage2;

  // Stage 4 — distance term (modalSourceReferenceMode: 'distance_normalized' branch)
  const dx = source.x - seatPos.x, dy = source.y - seatPos.y, dz = (source.z ?? 0.35) - (seatPos.z ?? 1.2);
  const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distanceLossDb = -20 * Math.log10(distanceM);
  const stage4 = Math.pow(10, distanceLossDb / 20);

  // Stage 5 — modal gain (modalGainScalar × sub gain, dimensionless)
  const stage5 = modalGainScalar * Math.pow(10, gainDb / 20);

  // Stage 6 — radiation/source curve (curve dB amplitude alone)
  const stage6 = Math.pow(10, curveDb / 20);

  const modalSourceAmplitude1m = stage6 * stage5 * stage4;
  const modalGain = modalSourceAmplitude1m * stage3;

  // Stage 7 — complex pressure BEFORE resonantTransfer(): propagation phase disabled in the
  // live engine options, and no resonance/frequency-dependent phase exists yet at this point —
  // so this stage is a real-only excitation amplitude with zero phase, by definition.
  const stage7 = { re: modalGain, im: 0, mag: Math.abs(modalGain), phaseDeg: 0 };

  // Stage 8 — complex pressure AFTER resonantTransfer()
  const tf = resonantTransfer(frequencyHz, mode.modeFrequencyHz, mode.qValue);
  const stage8Re = modalGain * tf.re;
  const stage8Im = modalGain * tf.im;
  const stage8 = { re: stage8Re, im: stage8Im, mag: mag(stage8Re, stage8Im), phaseDeg: phaseDeg(stage8Re, stage8Im) };

  return {
    stage1, stage2, stage3, stage4, stage5, stage6, stage7, stage8,
    modalSourceAmplitude1m, modalGain, distanceM,
  };
}

// Cross-check: compares reconstructed Stage 8 against the live engine's own activeReal/activeImag
// for the same mode/frequency, to confirm the reconstruction is faithful (not a fresh formulation).
function crossCheckAgainstEngine(mode, frequencyHz, roomDims, seatPos, source) {
  const options = buildLiveEngineOptions(frequencyHz, roomDims?.surfaceAbsorption);
  const engineOut = simulateBassResponseRewCore(roomDims, seatPos, source, LIVE_SOURCE_CURVE, options);
  const debugRow = engineOut.activeModalContributorDebugSeries?.[0];
  const contributor = debugRow?.contributors?.find((c) => c.nx === mode.nx && c.ny === mode.ny && c.nz === mode.nz);
  const finalRe = engineOut.perFrequencyVectorDebug?.[0]?.finalRe ?? 0;
  const finalIm = engineOut.perFrequencyVectorDebug?.[0]?.finalIm ?? 0;
  return {
    engineActiveReal: contributor?.activeReal ?? null,
    engineActiveImag: contributor?.activeImag ?? null,
    engineFinalMag: mag(finalRe, finalIm),
  };
}

export function runModalExcitationAudit(roomDims, seatPos, source, curve, surfaceAbsorption) {
  const roomDimsWithAbsorption = { ...roomDims, surfaceAbsorption };
  const modeMeta = buildModeMeta(roomDims, surfaceAbsorption);

  const table = modeMeta.map((mode) => {
    const rows = TARGET_FREQS.map((freqHz) => {
      const stages = computeStages(mode, freqHz, roomDims, seatPos, source, curve);
      const cross = crossCheckAgainstEngine(mode, freqHz, roomDimsWithAbsorption, seatPos, source);
      const finalMag = cross.engineFinalMag || 1e-10;
      const pct = (v) => (Math.abs(v) / finalMag) * 100;
      const reconReconciles = cross.engineActiveReal !== null
        ? Math.abs(stages.stage8.re - cross.engineActiveReal) < 1e-6 * Math.max(1, Math.abs(cross.engineActiveReal))
          && Math.abs(stages.stage8.im - cross.engineActiveImag) < 1e-6 * Math.max(1, Math.abs(cross.engineActiveImag))
        : null;
      return {
        frequencyHz: freqHz,
        ...stages,
        finalMag,
        pctStage1: pct(stages.stage1), pctStage2: pct(stages.stage2), pctStage3: pct(stages.stage3),
        pctStage4: pct(stages.stage4), pctStage5: pct(stages.stage5), pctStage6: pct(stages.stage6),
        pctStage7: pct(stages.stage7.mag), pctStage8: pct(stages.stage8.mag),
        reconReconciles,
        engineActiveReal: cross.engineActiveReal, engineActiveImag: cross.engineActiveImag,
      };
    });
    return { mode, rows };
  });

  // ── Normalisation test ──
  const shapeMax = 1; // cos(...) max magnitude is always 1, regardless of mode order
  const normalisation = TARGET_FREQS.map((freqHz) => {
    const perMode = table.map(({ mode, rows }) => {
      const row = rows.find((r) => r.frequencyHz === freqHz);
      const raw = row.stage3; // combined excitation = "raw excitation" under test
      return {
        key: mode.key,
        raw,
        byShapeMax: raw / shapeMax,
        bySourceOnly: row.stage1 !== 0 ? raw / row.stage1 : null, // leaves receiverCoupling
        byReceiverOnly: row.stage2 !== 0 ? raw / row.stage2 : null, // leaves sourceCoupling
        bySourceTimesReceiver: raw !== 0 ? raw / raw : null, // trivially 1 for every mode
      };
    });
    const m010 = perMode.find((m) => m.key === '0,1,0');
    const m020 = perMode.find((m) => m.key === '0,2,0');
    const belowResonance = freqHz < (table.find((t) => t.mode.key === '0,2,0')?.mode.modeFrequencyHz ?? Infinity);
    const collapseCheck = (variantKey) => {
      if (!m010 || !m020 || m010[variantKey] === null || m020[variantKey] === null) return null;
      const denom = Math.max(Math.abs(m010[variantKey]), 1e-10);
      return Math.abs(m020[variantKey] - m010[variantKey]) / denom < 0.10;
    };
    return {
      frequencyHz: freqHz, belowResonance, perMode,
      collapseByShapeMax: belowResonance ? collapseCheck('byShapeMax') : null,
      collapseBySourceOnly: belowResonance ? collapseCheck('bySourceOnly') : null,
      collapseByReceiverOnly: belowResonance ? collapseCheck('byReceiverOnly') : null,
      collapseBySourceTimesReceiver: belowResonance ? collapseCheck('bySourceTimesReceiver') : null,
    };
  });

  // ── Family test ──
  const families = ['axial', 'tangential', 'oblique'];
  const familyTest = families.map((family) => {
    const modesInFamily = table.filter((t) => t.mode.family === family);
    if (modesInFamily.length === 0) return { family, hasData: false, avgExcitation: null, modeKeys: [] };
    const allVals = modesInFamily.flatMap((t) => t.rows.map((r) => Math.abs(r.stage3)));
    const avgExcitation = allVals.reduce((s, v) => s + v, 0) / allVals.length;
    return { family, hasData: true, avgExcitation, modeKeys: modesInFamily.map((t) => t.mode.key) };
  });

  // ── Automatic ranking: which stage's % contribution grows most across 29.5→40Hz (the excess band) ──
  const stageIds = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7', 'stage8'];
  const dominantModeEntry = table.find((t) => t.mode.key === '0,1,0') || table[0];
  const rowAt = (freqHz) => dominantModeEntry.rows.find((r) => r.frequencyHz === freqHz);
  const rowLow = rowAt(29.5), rowHigh = rowAt(40);
  const stageRanking = stageIds.map((sid) => {
    const pctKey = `pct${sid[0].toUpperCase()}${sid.slice(1)}`;
    const low = rowLow?.[pctKey] ?? 0;
    const high = rowHigh?.[pctKey] ?? 0;
    return { stage: sid, pctAt29_5: low, pctAt40: high, growth: high - low };
  }).sort((a, b) => b.growth - a.growth);

  // ── Final result: largest unexplained jump between consecutive stage magnitudes at 40 Hz ──
  const chainAt40 = rowHigh ? [
    { stage: 1, label: 'Source coupling', mag: Math.abs(rowHigh.stage1) },
    { stage: 2, label: 'Receiver coupling', mag: Math.abs(rowHigh.stage2) },
    { stage: 3, label: 'Combined excitation', mag: Math.abs(rowHigh.stage3) },
    { stage: 4, label: 'Distance term applied', mag: Math.abs(rowHigh.stage3 * rowHigh.stage4) },
    { stage: 5, label: 'Modal gain applied', mag: Math.abs(rowHigh.stage3 * rowHigh.stage4 * rowHigh.stage5) },
    { stage: 6, label: 'Radiation/source curve applied', mag: Math.abs(rowHigh.modalSourceAmplitude1m * rowHigh.stage3) },
    { stage: 7, label: 'Pre-transfer complex pressure', mag: rowHigh.stage7.mag },
    { stage: 8, label: 'Post-transfer complex pressure', mag: rowHigh.stage8.mag },
  ] : [];
  const jumps = [];
  for (let i = 1; i < chainAt40.length; i++) {
    const prevMag = Math.max(chainAt40[i - 1].mag, 1e-12);
    const jumpDb = 20 * Math.log10(Math.max(chainAt40[i].mag, 1e-12) / prevMag);
    jumps.push({ fromStage: chainAt40[i - 1].stage, toStage: chainAt40[i].stage, label: chainAt40[i].label, jumpDb });
  }
  const largestJump = jumps.length ? jumps.reduce((best, j) => (Math.abs(j.jumpDb) > Math.abs(best.jumpDb) ? j : best), jumps[0]) : null;
  const EXPLAIN_THRESHOLD_DB = 6;
  const hasExplanation = largestJump && Math.abs(largestJump.jumpDb) >= EXPLAIN_THRESHOLD_DB;

  return { table, normalisation, familyTest, stageRanking, jumps, largestJump, hasExplanation };
}