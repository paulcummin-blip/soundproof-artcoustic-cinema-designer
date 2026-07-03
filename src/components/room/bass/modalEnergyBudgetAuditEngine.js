// modalEnergyBudgetAuditEngine.js
// Pure, read-only diagnostic engine — measures where final pressure comes from
// (direct vs reflection vs modal) using the unmodified production engine.
// No physics, coefficients, or graph changes. Reuses the exact live engine options
// (buildLiveEngineOptions) already used by other production-matching audits.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from '@/components/room/bass/liveBassAuditOptions';

export const TARGET_HZ = [29.5, 30, 32, 35, 40, 40.6, 45, 50, 57, 58];

function mag(re, im) {
  return Math.sqrt((re || 0) * (re || 0) + (im || 0) * (im || 0));
}

// Runs the production engine at a narrow window around frequencyHz and extracts
// the read-only per-frequency vector breakdown (direct/reflection/modal/final)
// plus the per-mode active contributor breakdown, both already exposed by the
// engine for diagnostic purposes (perFrequencyVectorDebug / activeModalContributorDebugSeries).
function runAtFrequency(roomDims, seatPos, source, surfaceAbsorption, frequencyHz) {
  const options = buildLiveEngineOptions(frequencyHz, surfaceAbsorption);
  const result = simulateBassResponseRewCore(roomDims, seatPos, source, LIVE_SOURCE_CURVE, options);

  // Closest per-frequency vector row
  const vecRows = result.perFrequencyVectorDebug || [];
  let bestVec = null, bestVecDist = Infinity;
  vecRows.forEach((row) => {
    const dist = Math.abs(row.frequencyHz - frequencyHz);
    if (dist < bestVecDist) { bestVecDist = dist; bestVec = row; }
  });

  // Closest active modal contributor breakdown (per-mode data before summation)
  const contributorSeries = result.activeModalContributorDebugSeries || [];
  let bestContrib = null, bestContribDist = Infinity;
  contributorSeries.forEach((row) => {
    const dist = Math.abs(row.frequencyHz - frequencyHz);
    if (dist < bestContribDist) { bestContribDist = dist; bestContrib = row; }
  });

  if (!bestVec) return null;

  const directMag = mag(bestVec.directRe, bestVec.directIm);
  const reflectionMag = mag(bestVec.reflectionRe, bestVec.reflectionIm);
  const modalMag = mag(bestVec.modalSumRe, bestVec.modalSumIm);
  const finalMag = mag(bestVec.finalRe, bestVec.finalIm);

  const totalForPct = directMag + reflectionMag + modalMag;
  const directPct = totalForPct > 0 ? (directMag / totalForPct) * 100 : null;
  const reflectionPct = totalForPct > 0 ? (reflectionMag / totalForPct) * 100 : null;
  const modalPct = totalForPct > 0 ? (modalMag / totalForPct) * 100 : null;

  const modes = (bestContrib?.contributors || []).map((c) => ({
    key: `${c.nx},${c.ny},${c.nz}`,
    modeFrequencyHz: c.modeFrequencyHz,
    modeType: c.modeType,
    transferMagnitude: c.modalTransferMagnitude ?? c.activeTransferMagnitudeAtNull ?? null,
    sourceCoupling: c.sourceCoupling,
    receiverCoupling: c.receiverCoupling,
    combinedModalPressure: c.activeMagnitude,
  }));
  const modesTotalMag = modes.reduce((sum, m) => sum + (Number.isFinite(m.combinedModalPressure) ? m.combinedModalPressure : 0), 0);
  const modesWithPct = modes.map((m) => ({
    ...m,
    pctOfModalField: modesTotalMag > 0 && Number.isFinite(m.combinedModalPressure) ? (m.combinedModalPressure / modesTotalMag) * 100 : null,
  }));

  return {
    frequencyHz,
    directMag,
    reflectionMag,
    modalMag,
    finalMag,
    modalOverDirect: directMag > 0 ? modalMag / directMag : null,
    reflectionOverDirect: directMag > 0 ? reflectionMag / directMag : null,
    modalOverFinal: finalMag > 0 ? modalMag / finalMag : null,
    reflectionOverFinal: finalMag > 0 ? reflectionMag / finalMag : null,
    directOverFinal: finalMag > 0 ? directMag / finalMag : null,
    directPct,
    reflectionPct,
    modalPct,
    modes: modesWithPct,
  };
}

export function runModalEnergyBudgetAudit(roomDims, seatsById, source, surfaceAbsorption) {
  const seatResults = {};
  Object.entries(seatsById).forEach(([label, seat]) => {
    if (!seat) {
      seatResults[label] = null;
      return;
    }
    const seatPos = { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 };
    seatResults[label] = TARGET_HZ.map((hz) => runAtFrequency(roomDims, seatPos, source, surfaceAbsorption, hz));
  });
  return seatResults;
}

export function buildDominanceRanking(rows) {
  return [...rows]
    .filter((r) => r && Number.isFinite(r.modalPct))
    .sort((a, b) => b.modalPct - a.modalPct);
}

export function buildFinalSummary(rows) {
  const valid = rows.filter((r) => r);
  const modalOverDirectVals = valid.map((r) => r.modalOverDirect).filter((v) => Number.isFinite(v));
  const modalOverFinalVals = valid.map((r) => r.modalOverFinal).filter((v) => Number.isFinite(v));
  const modalPctVals = valid.map((r) => r.modalPct).filter((v) => Number.isFinite(v));
  const reflectionOverDirectVals = valid.map((r) => r.reflectionOverDirect).filter((v) => Number.isFinite(v));

  const avg = (arr) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const peakRow = valid.reduce((best, r) => (Number.isFinite(r.modalPct) && (!best || r.modalPct > best.modalPct)) ? r : best, null);
  const lowRow = valid.reduce((worst, r) => (Number.isFinite(r.modalPct) && (!worst || r.modalPct < worst.modalPct)) ? r : worst, null);

  return {
    avgModalOverDirect: avg(modalOverDirectVals),
    avgModalOverFinal: avg(modalOverFinalVals),
    peakModalPct: peakRow?.modalPct ?? null,
    peakModalHz: peakRow?.frequencyHz ?? null,
    lowestModalPct: lowRow?.modalPct ?? null,
    lowestModalHz: lowRow?.frequencyHz ?? null,
    avgReflectionOverDirect: avg(reflectionOverDirectVals),
  };
}