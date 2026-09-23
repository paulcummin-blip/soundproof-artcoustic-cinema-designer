// recommendationAction.js
// ---------------------------------------------------------------------------
// Produces the recommended engineering action from the optimiser's winner.
//
// The action is described in engineering terms — never RP22 levels. It uses
// the existing "What changed" and gain rationale builders to describe the
// physical/calibration change in plain engineering language.
// ---------------------------------------------------------------------------

import { LEVER_CLASS, LEVER, INTERVENTION_TYPE } from './recommendationTypes.js';

function classifyIntervention(winner) {
  if (!winner) return INTERVENTION_TYPE.CALIBRATION;
  if (winner.candidateOrigin === 'combined' || winner.candidateOrigin === 'combined-calibration-seating') {
    return INTERVENTION_TYPE.COMBINED;
  }
  if (winner.candidateKind === 'calibration' || winner.candidateId === 'calibration-only') {
    return INTERVENTION_TYPE.CALIBRATION;
  }
  if (winner.candidateKind === 'seating') {
    return INTERVENTION_TYPE.SEATING;
  }
  if (winner.isPositionCandidate) {
    return INTERVENTION_TYPE.POSITION;
  }
  return INTERVENTION_TYPE.POSITION;
}

function describeCalibrationAction(winner, currentResult) {
  if (!winner) return 'No calibration action available.';

  const parts = [];

  // Check delay change
  const currentTuning = currentResult?.appliedTuning || currentResult?.tuning || [];
  const winnerTuning = winner.appliedTuning || winner.tuning || [];

  const delayChanges = [];
  const phaseChanges = [];
  const gainChanges = [];
  const polarityChanges = [];

  for (let i = 0; i < winnerTuning.length; i++) {
    const wt = winnerTuning[i] || {};
    const ct = currentTuning[i] || {};
    const wd = Number(wt.delayMs) || 0;
    const cd = Number(ct.delayMs) || 0;
    if (Math.abs(wd - cd) > 0.1) {
      delayChanges.push(`Sub ${i + 1}: ${wd > cd ? '+' : ''}${(wd - cd).toFixed(1)} ms`);
    }
    const wp = Number(wt.phaseControlDeg ?? wt.phaseAdjust) || 0;
    const cp = Number(ct.phaseControlDeg ?? ct.phaseAdjust) || 0;
    if (Math.abs(wp - cp) > 0.1) {
      phaseChanges.push(`Sub ${i + 1}: ${wp.toFixed(0)}°`);
    }
    const wg = Number(wt.gainDb) || 0;
    const cg = Number(ct.gainDb) || 0;
    if (Math.abs(wg - cg) > 0.1) {
      gainChanges.push(`Sub ${i + 1}: ${wg > cg ? '+' : ''}${(wg - cg).toFixed(1)} dB`);
    }
    const wpol = Number(wt.polarity) || 0;
    const cpol = Number(ct.polarity) || 0;
    if ((wpol < 0) !== (cpol < 0)) {
      polarityChanges.push(`Sub ${i + 1} inverted`);
    }
  }

  if (delayChanges.length) parts.push(`Adjust delay — ${delayChanges.join(', ')}.`);
  if (phaseChanges.length) parts.push(`Adjust phase — ${phaseChanges.join(', ')} at 80 Hz.`);
  if (gainChanges.length) parts.push(`Adjust relative level — ${gainChanges.join(', ')}.`);
  if (polarityChanges.length) parts.push(`Invert polarity — ${polarityChanges.join(', ')}.`);

  // EQ
  if (winner.canonicalAuthorityReceipt?.filterBankSignature
    && currentResult?.canonicalAuthorityReceipt?.filterBankSignature
    && winner.canonicalAuthorityReceipt.filterBankSignature !== currentResult.canonicalAuthorityReceipt.filterBankSignature) {
    parts.push('Apply updated common calibration EQ.');
  }

  if (parts.length === 0) {
    // Check if it's a phase-only or gain-only change
    const groupedPhase = winner.groupedPhase;
    const groupedDelay = winner.groupedDelay;
    if (groupedPhase) {
      parts.push(`Adjust grouped phase — ${groupedPhase.phaseAtReferenceDeg?.toFixed(0) || 0}° at 80 Hz.`);
    } else if (groupedDelay) {
      const adjMs = Number(groupedDelay.adjustmentMs) || 0;
      if (Math.abs(adjMs) > 0.01) {
        parts.push(`Adjust grouped delay — ${adjMs > 0 ? '+' : ''}${adjMs.toFixed(1)} ms.`);
      }
    }
  }

  return parts.length > 0 ? parts.join(' ') : 'Apply calibration adjustment.';
}

function describePositionAction(winner) {
  const movement = winner?.movementDescription;
  if (movement) return `Move subwoofers — ${movement}.`;

  const coords = winner?.coordinates || winner?.positionCoordinates;
  if (!Array.isArray(coords) || coords.length === 0) {
    return 'Adjust subwoofer positions.';
  }

  const parts = coords.map((c, i) => {
    const x = Number(c.x) || 0;
    const y = Number(c.y) || 0;
    return `Sub ${i + 1} to (${x.toFixed(2)}, ${y.toFixed(2)}) m`;
  });

  return `Move subwoofers — ${parts.join('; ')}.`;
}

function describeSeatingAction(winner) {
  const offsetMm = Number(winner?.seatingOffsetMm) || 0;
  if (offsetMm === 0) return 'Adjust seating positions.';
  const direction = offsetMm > 0 ? 'towards the screen' : 'away from the screen';
  return `Move the seating ${(Math.abs(offsetMm) / 1000).toFixed(2)} m ${direction}.`;
}

function describeCombinedAction(winner, currentResult) {
  const parts = [];

  const intervention = classifyIntervention(winner);
  if (intervention === INTERVENTION_TYPE.POSITION || winner?.isPositionCandidate) {
    parts.push(describePositionAction(winner));
  }
  if (intervention === INTERVENTION_TYPE.SEATING || winner?.seatingOffsetMm) {
    parts.push(describeSeatingAction(winner));
  }

  // Always include calibration for combined
  const calPart = describeCalibrationAction(winner, currentResult);
  if (calPart && calPart !== 'Apply calibration adjustment.') {
    parts.push(calPart);
  }

  return parts.length > 0 ? parts.join(' ') : 'Apply combined calibration and positioning changes.';
}

/**
 * Build the recommended action from the optimiser's winner.
 *
 * @param {object} winner - the optimiser's winning candidate result
 * @param {object} currentResult - the baseline canonical result
 * @returns {{ description: string, interventionType: string, candidateId: string }}
 */
export function buildRecommendedAction(winner, currentResult) {
  if (!winner) {
    return {
      description: 'No engineering action recommended.',
      interventionType: INTERVENTION_TYPE.CALIBRATION,
      candidateId: null,
    };
  }

  const interventionType = classifyIntervention(winner);
  let description;

  switch (interventionType) {
    case INTERVENTION_TYPE.CALIBRATION:
      description = describeCalibrationAction(winner, currentResult);
      break;
    case INTERVENTION_TYPE.POSITION:
      description = describePositionAction(winner);
      break;
    case INTERVENTION_TYPE.SEATING:
      description = describeSeatingAction(winner);
      break;
    case INTERVENTION_TYPE.COMBINED:
      description = describeCombinedAction(winner, currentResult);
      break;
    default:
      description = 'Apply the recommended engineering change.';
  }

  return {
    description,
    interventionType,
    candidateId: winner.candidateId || null,
  };
}