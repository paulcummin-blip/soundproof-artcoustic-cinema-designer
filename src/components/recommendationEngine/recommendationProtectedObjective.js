// recommendationProtectedObjective.js
// ---------------------------------------------------------------------------
// Evaluates the active design objective and determines whether the
// highest-ranked engineering candidate violates it.
//
// The Recommendation Engine does NOT filter candidates. It ranks all
// candidates, evaluates the protected objective, and if the best candidate
// violates it, notes the violation and recommends the best candidate that
// respects the designer's chosen objective.
//
// For Stage 1, the protected objective defaults to "protect_primary_seating"
// because the existing optimiser already applies primary seat protection.
// This module makes that protection explicit and visible.
// ---------------------------------------------------------------------------

import { PROTECTED_OBJECTIVE } from './recommendationTypes.js';
import { hasPrimarySeatRegression } from '@/components/room/bass/improveBassV2/materialityGate.js';

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || '').match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

/**
 * Evaluate the protected objective against the optimiser's results.
 *
 * @param {object} selection - the optimiser selection object
 * @param {object} winner - the selected winner
 * @param {object} currentResult - the baseline canonical result
 * @param {string} activeObjective - the active protected objective
 * @returns {{ activeObjective: string, violatedByBestCandidate: boolean, betterSolutionAvailable: string|null, recommendedInstead: string|null }}
 */
export function evaluateProtectedObjective(selection, winner, currentResult, activeObjective = PROTECTED_OBJECTIVE.PROTECT_PRIMARY_SEATING) {
  if (!selection || !winner || !currentResult) {
    return {
      activeObjective,
      violatedByBestCandidate: false,
      betterSolutionAvailable: null,
      recommendedInstead: null,
    };
  }

  // Check if the winner itself violates the protected objective
  const winnerRegression = hasPrimarySeatRegression(currentResult, winner);

  // Look at evaluations for safety-rejected candidates that might have been
  // engineering-superior but were rejected for safety reasons
  const evaluations = selection.evaluations || [];
  const safetyRejected = evaluations.filter((e) => e.status === 'safety-rejected');

  // Find the best engineering candidate among ALL confirmed results
  // (including safety-rejected) to see if a better one was available
  let bestEngineeringCandidate = null;
  let bestEngineeringCandidateEvaluation = null;

  const allResults = [
    ...(selection.confirmedResults || []),
    ...(selection.recommendations || []).map((r) => r.result),
  ];

  for (const candidate of allResults) {
    if (!candidate || candidate.candidateId === 'current') continue;
    const evaluation = evaluations.find((e) => e.candidateId === candidate.candidateId);
    // Skip the current winner
    if (candidate === winner || candidate.candidateId === winner.candidateId) continue;

    // Check if this candidate is engineering-superior to the winner
    const candidateFails = countFailingSeats(candidate);
    const winnerFails = countFailingSeats(winner);
    const isEngineeringSuperior = candidateFails < winnerFails
      || (candidateFails === winnerFails && hasBetterRawMetrics(candidate, winner));

    if (isEngineeringSuperior) {
      const regression = hasPrimarySeatRegression(currentResult, candidate);
      if (regression.regressed || evaluation?.status === 'safety-rejected') {
        // This is a better engineering candidate that violates the protected objective
        if (!bestEngineeringCandidate
          || countFailingSeats(candidate) < countFailingSeats(bestEngineeringCandidate)) {
          bestEngineeringCandidate = candidate;
          bestEngineeringCandidateEvaluation = evaluation;
        }
      }
    }
  }

  if (bestEngineeringCandidate) {
    const regression = hasPrimarySeatRegression(currentResult, bestEngineeringCandidate);
    const regressionDescription = regression.regressed
      ? `Would regress ${regression.parameter} from ${levelText(regression.currentLevel)} to ${levelText(regression.candidateLevel)} at ${regression.seatId}.`
      : 'Compromises the protected design objective.';

    return {
      activeObjective,
      violatedByBestCandidate: false, // The winner doesn't violate it — it was selected because it respects it
      betterSolutionAvailable: `Better engineering solution available (${bestEngineeringCandidate.candidateId}). ${regressionDescription}`,
      recommendedInstead: `Not recommended because it compromises the protected design objective (${activeObjective}). The recommended candidate respects this objective.`,
    };
  }

  // Check if the winner itself has a same-level raw regression (trade-off)
  const tradeOffs = selection.tradeOffs || [];
  if (tradeOffs.length > 0) {
    const tradeOff = tradeOffs[0];
    if (tradeOff?.tradeOff?.isTradeOff) {
      return {
        activeObjective,
        violatedByBestCandidate: false,
        betterSolutionAvailable: `A verified trade-off is available (${tradeOff.candidateId}). It improves one objective but reduces another.`,
        recommendedInstead: `The trade-off is presented as an alternative for the designer to evaluate.`,
      };
    }
  }

  return {
    activeObjective,
    violatedByBestCandidate: false,
    betterSolutionAvailable: null,
    recommendedInstead: null,
  };
}

function countFailingSeats(result) {
  const p19 = Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [];
  const p20 = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  const p19Fail = new Set(p19.filter((s) => numericLevel(s.level) === 0).map((s) => String(s.seatId)));
  const p20Fail = new Set(p20.filter((s) => numericLevel(s.level) === 0).map((s) => String(s.seatId)));
  const allIds = new Set([...p19.map((s) => String(s.seatId)), ...p20.map((s) => String(s.seatId))]);
  let count = 0;
  for (const id of allIds) {
    if (p19Fail.has(id) || p20Fail.has(id)) count++;
  }
  return count;
}

function hasBetterRawMetrics(candidate, winner) {
  const candidateWorst = Math.max(...(candidate.perSeatP19 || []).map((s) => Math.abs(Number(s.variationDbRaw) || 0)), 0);
  const winnerWorst = Math.max(...(winner.perSeatP19 || []).map((s) => Math.abs(Number(s.variationDbRaw) || 0)), 0);
  return candidateWorst < winnerWorst;
}

function levelText(level) {
  const n = numericLevel(level);
  return n > 0 ? `L${n}` : 'FAIL';
}