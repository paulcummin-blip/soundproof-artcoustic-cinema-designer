/**
 * dominantModeAuditLogic.js
 *
 * Pure analysis functions for the Dominant Mode Root Cause Audit.
 * No React. No side effects. Uses actual engine output only.
 */
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

const Q_SCALE    = 0.8;
const TANG_SCALE = 0.8;
const AXIAL_SCALE   = 1.0;
const OBLIQUE_SCALE = 1.0;

const FLAT_SOURCE_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

export const TARGET_FREQUENCIES = [70, 80, 85, 90];

export const REW_BENCHMARK = { 70: 86.8, 80: 79.7, 85: 90.8, 90: null };

// ─── engine call ─────────────────────────────────────────────────────────────

export function runAuditSim(roomDims, seat, sub, surfaceAbsorption, activeSettings) {
  const seatZ      = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const baseAxialQ = activeSettings?.axialQ ?? 8;

  return simulateBassResponseRewCore(
    { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
    { x: seat.x, y: seat.y, z: seatZ },
    sub,
    FLAT_SOURCE_CURVE,
    {
      enableReflections:            false,
      enableModes:                  true,
      surfaceAbsorption,
      freqMinHz:                    20,
      freqMaxHz:                    200,
      smoothing:                    'none',
      modalSourceReferenceMode:     activeSettings?.modalSourceReferenceMode ?? 'existing',
      modalGainScalar:              activeSettings?.modalGainScalar          ?? 1.0,
      axialQ:                       baseAxialQ * Q_SCALE,
      modalStorageMode:             'none',
      propagationPhaseScale:        0,
      pureDeterministicModalSum:    true,
      disableModalPropagationPhase: true,
      modalCoherenceMode:           'coherent',
      highOrderAxialScale:          activeSettings?.highOrderAxialScale          ?? 1.0,
      rewParityModalMagnitudeScale: activeSettings?.rewParityModalMagnitudeScale ?? 1.0,
      debugReflectionOrder:         1,
      disableLateField:             true,
      tangentialFamilyScale:        TANG_SCALE,
      axialFamilyScale:             AXIAL_SCALE,
      obliqueFamilyScale:           OBLIQUE_SCALE,
    }
  );
}

// ─── find closest bin ────────────────────────────────────────────────────────

export function findBin(series, targetHz, toleranceHz = 3) {
  if (!Array.isArray(series) || series.length === 0) return null;
  let best = null, bestDist = Infinity;
  for (const bin of series) {
    const d = Math.abs(bin.frequencyHz - targetHz);
    if (d < bestDist) { bestDist = d; best = bin; }
  }
  return bestDist <= toleranceHz ? best : null;
}

// ─── SPL interpolation ───────────────────────────────────────────────────────

export function interpolateSpl(freqsHz, splDbRaw, targetHz) {
  if (!freqsHz || !splDbRaw) return null;
  let best = null, bestDist = Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    const d = Math.abs(freqsHz[i] - targetHz);
    if (d < bestDist) { bestDist = d; best = splDbRaw[i]; }
  }
  return bestDist <= 3 ? best : null;
}

// ─── per-frequency analysis ───────────────────────────────────────────────────

export function analyseFrequency(targetHz, bin, freqsHz, splDbRaw) {
  if (!bin || !bin.contributors || bin.contributors.length === 0) return null;

  const totalRe  = bin.modalSumRe ?? 0;
  const totalIm  = bin.modalSumIm ?? 0;
  const totalMag = Math.sqrt(totalRe * totalRe + totalIm * totalIm);
  const simSpl   = interpolateSpl(freqsHz, splDbRaw, targetHz);
  const rewTarget = REW_BENCHMARK[targetHz] ?? null;
  const error     = (simSpl != null && rewTarget != null) ? simSpl - rewTarget : null;

  // Sum of all absolute magnitudes (for %)
  const totalAbsMag = bin.contributors.reduce((s, c) => s + (c.activeMagnitude ?? 0), 0);

  // Top 15 by activeMagnitude
  const top15 = [...bin.contributors]
    .sort((a, b) => (b.activeMagnitude ?? 0) - (a.activeMagnitude ?? 0))
    .slice(0, 15)
    .map((c, i) => {
      const mag        = c.activeMagnitude ?? 0;
      const couplingMag = Math.abs(c.combinedCoupling ?? 0);
      const transferMag = c.activeTransferMagnitudeAtNull ?? 0;
      return {
        rank:          i + 1,
        nx:            c.nx,
        ny:            c.ny,
        nz:            c.nz,
        family:        c.modeType,
        modeHz:        c.modeFrequencyHz,
        q:             c.qValue,
        sourceCoupling:   c.sourceCoupling ?? 0,
        receiverCoupling: c.receiverCoupling ?? 0,
        combinedCoupling: c.combinedCoupling ?? 0,
        transferMag,
        mag,
        phaseDeg:      c.activePhaseAngleDeg ?? 0,
        pctOfTotal:    totalAbsMag > 0 ? (mag / totalAbsMag) * 100 : 0,
      };
    });

  // Root cause: top 10, normalised coupling/transfer/contribution
  const top10 = top15.slice(0, 10);
  const maxCoupling    = Math.max(...top10.map(m => Math.abs(m.combinedCoupling)), 1e-12);
  const maxTransfer    = Math.max(...top10.map(m => m.transferMag), 1e-12);
  const maxContrib     = Math.max(...top10.map(m => m.mag), 1e-12);

  const rootCause = top10.map(m => ({
    nx: m.nx, ny: m.ny, nz: m.nz,
    family: m.family,
    couplingNorm:    (Math.abs(m.combinedCoupling) / maxCoupling) * 100,
    transferNorm:    (m.transferMag / maxTransfer) * 100,
    contribNorm:     (m.mag / maxContrib) * 100,
    couplingRaw:     Math.abs(m.combinedCoupling),
    transferRaw:     m.transferMag,
    contribRaw:      m.mag,
  }));

  // Family summary
  const families = ['axial', 'tangential', 'oblique'];
  const familySummary = {};
  families.forEach(fam => {
    const famModes = bin.contributors.filter(c => c.modeType === fam);
    const famContribTotal  = famModes.reduce((s, c) => s + (c.activeMagnitude ?? 0), 0);
    const famCouplingTotal = famModes.reduce((s, c) => s + Math.abs(c.combinedCoupling ?? 0), 0);
    const famTransferTotal = famModes.reduce((s, c) => s + (c.activeTransferMagnitudeAtNull ?? 0), 0);
    const allCouplingTotal = bin.contributors.reduce((s, c) => s + Math.abs(c.combinedCoupling ?? 0), 0);
    const allTransferTotal = bin.contributors.reduce((s, c) => s + (c.activeTransferMagnitudeAtNull ?? 0), 0);
    familySummary[fam] = {
      contribPct:   totalAbsMag > 0    ? (famContribTotal  / totalAbsMag)    * 100 : 0,
      couplingPct:  allCouplingTotal > 0 ? (famCouplingTotal / allCouplingTotal) * 100 : 0,
      transferPct:  allTransferTotal > 0 ? (famTransferTotal / allTransferTotal) * 100 : 0,
    };
  });

  // Dominance scores
  const top1Pct  = top15[0]  ? top15[0].pctOfTotal  : 0;
  const top3Pct  = top15.slice(0, 3).reduce((s, m) => s + m.pctOfTotal, 0);
  const top5Pct  = top15.slice(0, 5).reduce((s, m) => s + m.pctOfTotal, 0);

  return {
    targetHz,
    totalRe, totalIm, totalMag, simSpl, rewTarget, error,
    top15, rootCause, familySummary,
    dominance: { top1Pct, top3Pct, top5Pct },
  };
}

// ─── recommendation engine ────────────────────────────────────────────────────

export function buildRecommendation(freqResults) {
  const valid = freqResults.filter(Boolean);
  if (valid.length === 0) return null;

  // Aggregate coupling vs transfer percentile across all frequencies
  let totalCouplingScore = 0;
  let totalTransferScore  = 0;
  let totalFamilyImbalance = 0;
  let sampleCount = 0;

  valid.forEach(f => {
    const top3 = f.rootCause.slice(0, 3);
    top3.forEach(m => {
      totalCouplingScore  += m.couplingNorm;
      totalTransferScore  += m.transferNorm;
      sampleCount++;
    });
    // Family imbalance: max family dominance
    const pcts = Object.values(f.familySummary).map(s => s.contribPct);
    totalFamilyImbalance += Math.max(...pcts);
  });

  const avgCoupling  = sampleCount > 0 ? totalCouplingScore / sampleCount : 0;
  const avgTransfer  = sampleCount > 0 ? totalTransferScore / sampleCount : 0;
  const avgFamilyDom = valid.length > 0 ? totalFamilyImbalance / valid.length : 0;

  // Average dominance score (top3 % across freqs)
  const avgTop3Pct = valid.reduce((s, f) => s + f.dominance.top3Pct, 0) / valid.length;

  // Primary driver determination
  let driver, confidence, explanation;
  const couplingDominant  = avgCoupling > avgTransfer * 1.15;
  const transferDominant  = avgTransfer > avgCoupling * 1.15;
  const familyDominant    = avgFamilyDom > 70;
  const fewModesDominant  = avgTop3Pct > 60;

  if (couplingDominant && familyDominant) {
    driver      = 'Coupling';
    confidence  = 'High';
    explanation = `Top modes show consistently high coupling terms (avg normalised coupling ${avgCoupling.toFixed(1)}%). One family accounts for over ${avgFamilyDom.toFixed(0)}% of contribution — source/listener position favours that family strongly.`;
  } else if (transferDominant && fewModesDominant) {
    driver      = 'Transfer magnitude';
    confidence  = 'High';
    explanation = `Top 3 modes account for ${avgTop3Pct.toFixed(0)}% of modal energy on average. Transfer magnitude dominates (avg ${avgTransfer.toFixed(1)}%) — these modes are at or near resonance at the target frequencies.`;
  } else if (couplingDominant) {
    driver      = 'Coupling';
    confidence  = 'Medium';
    explanation = `Coupling term leads transfer in normalised comparison (${avgCoupling.toFixed(1)}% vs ${avgTransfer.toFixed(1)}%). Source and listener positions are near pressure antinodes for dominant modes.`;
  } else if (transferDominant) {
    driver      = 'Transfer magnitude';
    confidence  = 'Medium';
    explanation = `Transfer magnitude leads coupling (${avgTransfer.toFixed(1)}% vs ${avgCoupling.toFixed(1)}%). Dominant modes are resonantly excited at target frequencies — Q reduction may reduce their amplitude.`;
  } else if (familyDominant) {
    driver      = 'Family weighting';
    confidence  = 'Medium';
    explanation = `One modal family dominates at ${avgFamilyDom.toFixed(0)}% average contribution. Coupling and transfer are balanced — the imbalance is structural rather than positional.`;
  } else {
    driver      = 'Mixed';
    confidence  = 'Low';
    explanation = `Coupling (${avgCoupling.toFixed(1)}%) and transfer (${avgTransfer.toFixed(1)}%) are within 15% of each other across target frequencies. No single dominant cause identified from measured values.`;
  }

  return { driver, confidence, explanation, avgCoupling, avgTransfer, avgFamilyDom, avgTop3Pct };
}