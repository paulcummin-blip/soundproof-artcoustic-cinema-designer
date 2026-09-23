// recommendationAlternatives.js
// ---------------------------------------------------------------------------
// Generates the "Alternatives Considered" section from the optimiser's
// ranked candidates and evaluations.
//
// Every non-selected candidate retains:
//   - why it lost
//   - engineering difference
//   - installation impact
//   - protected-objective impact
//
// This is generated from the optimiser output — it never invents explanations.
// ---------------------------------------------------------------------------

import { WHY_LOST, INTERVENTION_TYPE } from './recommendationTypes.js';
import { compareZeroFailFirst, countFailingSeats } from '@/components/room/bass/improveBassV2/zeroFailOptimiser.js';

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || '').match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function levelText(level) {
  const n = numericLevel(level);
  return n > 0 ? `L${n}` : 'FAIL';
}

function describeEngineeringDifference(currentResult, candidateResult) {
  if (!currentResult || !candidateResult) return 'No comparison available.';

  const parts = [];

  // Failing seat change
  const currentFails = countFailingSeats(currentResult);
  const candidateFails = countFailingSeats(candidateResult);
  if (candidateFails < currentFails) {
    parts.push(`Eliminated ${currentFails - candidateFails} failing seat${currentFails - candidateFails > 1 ? 's' : ''}`);
  } else if (candidateFails > currentFails) {
    parts.push(`Added ${candidateFails - currentFails} failing seat${candidateFails - currentFails > 1 ? 's' : ''}`);
  }

  // P19 level changes
  const p19Before = new Map((currentResult.perSeatP19 || []).map((s) => [String(s.seatId), s]));
  const p19Improvements = [];
  const p19Regressions = [];
  for (const seat of (candidateResult.perSeatP19 || [])) {
    const before = p19Before.get(String(seat.seatId));
    if (!before) continue;
    const fromL = numericLevel(before.level);
    const toL = numericLevel(seat.level);
    if (toL > fromL) {
      p19Improvements.push(`${seat.isPrimary ? 'Primary' : 'Secondary'} P19 ${levelText(fromL)} → ${levelText(toL)}`);
    } else if (toL < fromL) {
      p19Regressions.push(`${seat.isPrimary ? 'Primary' : 'Secondary'} P19 ${levelText(fromL)} → ${levelText(toL)}`);
    }
  }

  // P20 level changes
  const p20Before = new Map((currentResult.perSeatP20 || []).map((s) => [String(s.seatId), s]));
  const p20Improvements = [];
  const p20Regressions = [];
  for (const seat of (candidateResult.perSeatP20 || [])) {
    const before = p20Before.get(String(seat.seatId));
    if (!before) continue;
    const fromL = numericLevel(before.level);
    const toL = numericLevel(seat.level);
    if (toL > fromL) {
      p20Improvements.push(`${seat.isPrimary ? 'Primary' : 'Secondary'} P20 ${levelText(fromL)} → ${levelText(toL)}`);
    } else if (toL < fromL) {
      p20Regressions.push(`${seat.isPrimary ? 'Primary' : 'Secondary'} P20 ${levelText(fromL)} → ${levelText(toL)}`);
    }
  }

  if (p19Improvements.length) parts.push(p19Improvements.join(', '));
  if (p20Improvements.length) parts.push(p20Improvements.join(', '));
  if (p19Regressions.length) parts.push(`Regressed: ${p19Regressions.join(', ')}`);
  if (p20Regressions.length) parts.push(`Regressed: ${p20Regressions.join(', ')}`);

  // Worst seat raw deviation change
  const worstBefore = Math.max(...(currentResult.perSeatP19 || []).map((s) => Math.abs(Number(s.variationDbRaw) || 0)), 0);
  const worstAfter = Math.max(...(candidateResult.perSeatP19 || []).map((s) => Math.abs(Number(s.variationDbRaw) || 0)), 0);
  if (Math.abs(worstBefore - worstAfter) > 0.1) {
    const better = worstAfter < worstBefore;
    parts.push(`Worst seat deviation ${worstBefore.toFixed(1)} → ${worstAfter.toFixed(1)} dB${better ? ' (improved)' : ' (worse)'}`);
  }

  return parts.length > 0 ? parts.join('. ') : 'No significant engineering difference.';
}

function describeInstallationImpact(candidate) {
  if (!candidate) return 'Unknown installation impact.';

  const intervention = candidate.interventionType
    || (candidate.candidateOrigin === 'combined' ? 'combined'
      : candidate.candidateKind === 'calibration' ? 'calibration'
        : candidate.candidateKind === 'seating' ? 'seating'
          : candidate.isPositionCandidate ? 'position'
            : 'position');

  switch (intervention) {
    case 'calibration':
      return 'Calibration-only change — no physical installation required.';
    case 'position':
      return candidate.movementDescription
        ? `Physical subwoofer repositioning: ${candidate.movementDescription}.`
        : 'Physical subwoofer repositioning required.';
    case 'seating':
      const offsetMm = Math.abs(Number(candidate.seatingOffsetMm) || 0);
      return offsetMm > 0
        ? `Seating relocation by ${(offsetMm / 1000).toFixed(2)} m required.`
        : 'Seating relocation required.';
    case 'combined':
      return 'Combined calibration and physical changes required.';
    default:
      return 'Installation impact unknown.';
  }
}

function determineWhyLost(winner, candidate, evaluation) {
  if (!winner || !candidate) return WHY_LOST.ENGINEERING_INFERIOR;

  // Safety-rejected candidates
  if (evaluation?.status === 'safety-rejected') {
    return WHY_LOST.SAFETY_REJECTED;
  }

  // Below-materiality candidates
  if (evaluation?.status === 'below-materiality') {
    return WHY_LOST.BELOW_MATERIALITY;
  }

  // Trade-off candidates
  if (evaluation?.status === 'trade-off') {
    return WHY_LOST.PROTECTED_OBJECTIVE_VIOLATION;
  }

  // Compare using the optimiser's comparator
  const comparison = compareZeroFailFirst(candidate, winner);
  if (comparison > 0) {
    return WHY_LOST.ENGINEERING_INFERIOR;
  }
  if (comparison === 0) {
    // Check practicality — simpler intervention wins
    const winnerIntervention = classifyIntervention(winner);
    const candidateIntervention = classifyIntervention(candidate);
    const PRACTICAL_PRIORITY = { calibration: 1, position: 2, seating: 3, combined: 4 };
    const winnerPriority = PRACTICAL_PRIORITY[winnerIntervention] || 99;
    const candidatePriority = PRACTICAL_PRIORITY[candidateIntervention] || 99;
    if (candidatePriority > winnerPriority) {
      return WHY_LOST.PRACTICALITY;
    }
    return WHY_LOST.EQUIVALENCE_TIE;
  }

  return WHY_LOST.ENGINEERING_INFERIOR;
}

function classifyIntervention(result) {
  if (!result) return 'position';
  if (result.candidateOrigin === 'combined' || result.candidateOrigin === 'combined-calibration-seating') return 'combined';
  if (result.candidateKind === 'calibration' || result.candidateId === 'calibration-only') return 'calibration';
  if (result.candidateKind === 'seating') return 'seating';
  if (result.isPositionCandidate) return 'position';
  return 'position';
}

function describeProtectedObjectiveImpact(candidate, evaluation) {
  if (!evaluation) return null;

  if (evaluation.status === 'safety-rejected') {
    const level = evaluation.level;
    if (level?.parameter) {
      return `Compromises ${level.parameter} safety: ${level.current} → ${level.candidate}.`;
    }
    if (evaluation.muted?.mutedCount > 0) {
      return `Mutes ${evaluation.muted.mutedCount} subwoofer(s).`;
    }
    return 'Compromises safety requirements.';
  }

  if (evaluation.status === 'trade-off' && evaluation.tradeOff) {
    const to = evaluation.tradeOff;
    if (to.improvement && to.worsening) {
      const impLabel = to.improvement.parameter === 'P19' ? 'primary response' : 'seat consistency';
      const worseLabel = to.worsening.parameter === 'P19' ? 'primary response' : 'seat consistency';
      return `Improves ${impLabel} but reduces ${worseLabel}.`;
    }
    return 'Creates a verified trade-off between objectives.';
  }

  return null;
}

/**
 * Build the alternatives considered from the optimiser's ranked candidates.
 *
 * @param {object} selection - the optimiser selection object
 * @param {object} winner - the selected winner
 * @param {object} currentResult - the baseline canonical result
 * @returns {Array} array of alternative objects
 */
export function buildAlternativesConsidered(selection, winner, currentResult) {
  if (!selection) return [];

  const recommendations = selection.recommendations || [];
  const evaluations = selection.evaluations || [];
  const evaluationMap = new Map(evaluations.map((e) => [e.candidateId, e]));

  const alternatives = [];

  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i];
    if (rec.isWinner) continue; // Skip the winner

    const candidate = rec.result;
    if (!candidate || candidate.candidateId === 'current') continue;

    const evaluation = evaluationMap.get(candidate.candidateId);
    const whyLost = determineWhyLost(winner, candidate, evaluation);

    alternatives.push({
      candidateId: candidate.candidateId,
      rank: i + 1,
      whyLost,
      engineeringDifference: describeEngineeringDifference(currentResult, candidate),
      installationImpact: describeInstallationImpact(candidate),
      protectedObjectiveImpact: describeProtectedObjectiveImpact(candidate, evaluation),
    });
  }

  // Also include safety-rejected candidates that were not in recommendations
  for (const evaluation of evaluations) {
    if (evaluation.status === 'safety-rejected' || evaluation.status === 'trade-off') {
      if (alternatives.some((a) => a.candidateId === evaluation.candidateId)) continue;
      const candidate = (selection.confirmedResults || []).find((r) => r?.candidateId === evaluation.candidateId);
      if (!candidate) continue;

      alternatives.push({
        candidateId: evaluation.candidateId,
        rank: null,
        whyLost: evaluation.status === 'safety-rejected' ? WHY_LOST.SAFETY_REJECTED : WHY_LOST.PROTECTED_OBJECTIVE_VIOLATION,
        engineeringDifference: describeEngineeringDifference(currentResult, candidate),
        installationImpact: describeInstallationImpact(candidate),
        protectedObjectiveImpact: describeProtectedObjectiveImpact(candidate, evaluation),
      });
    }
  }

  return alternatives;
}