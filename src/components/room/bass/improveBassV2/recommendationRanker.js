// recommendationRanker.js
// Pure ranking of confirmed Improve Bass V2 results into ordered
// recommendation cards.
//
// Ranking hierarchy (per user spec):
//   1. RP22 LEVEL CHANGE — any recommendation that improves an actual displayed
//      RP22 parameter level outranks one that only improves raw dB within the
//      same level. More parameter-level improvements first, then larger level
//      jump.
//   2. SAME-LEVEL — rank by the largest MATERIAL useful improvement (raw
//      worst-seat deviation reduction). A materially better raw result
//      outranks a weaker same-level result.
//   3. SAME-LEVEL BROADLY EQUIVALENT — practical priority:
//      calibration (phase/delay/gain) < subwoofer position < seating position.
//      The least disruptive solution wins when the acoustic outcome is
//      effectively equivalent.
//
// IMPORTANT: The engine tests phase/delay/gain TOGETHER in a combined
// searchDelayPolarityTrim call. They are NOT tested separately. The
// calibration recommendation is a single combined "Adjust calibration" card,
// not separate phase/delay/gain cards.
//
// The canonical winner from selectWinnerWithProtection remains the authority.
// It is always shown as the #1 recommendation. Other material improvements are
// ranked below using the hierarchy above.

import { isMaterialImprovement } from './materialityGate.js';

// Practical priority — lower = less disruptive = preferred for equivalent results
const PRACTICAL_PRIORITY = {
  calibration: 1,
  position: 2,
  seating: 3,
};

// Threshold for "broadly equivalent" raw improvements.
// If the difference in raw improvement is <= this, practical priority decides.
// If the difference is > this, the larger improvement wins.
const BROADLY_EQUIVALENT_THRESHOLD_DB = 0.5;

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || '').match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function levelText(level) {
  const n = numericLevel(level);
  return n > 0 ? `L${n}` : 'FAIL';
}

function worstPrimarySeatDeviation(result) {
  const p19 = (Array.isArray(result?.perSeatP19) ? result.perSeatP19 : []).filter((s) => s.isPrimary);
  const p20 = (Array.isArray(result?.perSeatP20) ? result.perSeatP20 : []).filter((s) => s.isPrimary);
  let worst = 0;
  for (const seat of [...p19, ...p20]) {
    const v = Math.abs(Number(seat?.variationDbRaw) || 0);
    if (v > worst) worst = v;
  }
  return worst;
}

function classifyIntervention(result) {
  if (!result) return 'position';
  if (result.isCurrent || result.candidateId === 'calibration-only') return 'calibration';
  if (result.isPositionCandidate) return 'position';
  return 'position'; // global placement also moves positions
}

function computeLevelChanges(currentResult, candidateResult) {
  const curP19 = numericLevel(currentResult?.achievedP19Level);
  const candP19 = numericLevel(candidateResult?.achievedP19Level);
  const curP20 = numericLevel(currentResult?.achievedP20Level);
  const candP20 = numericLevel(candidateResult?.achievedP20Level);

  const p19Jump = Math.max(0, candP19 - curP19);
  const p20Jump = Math.max(0, candP20 - curP20);

  return {
    p19: { from: curP19, to: candP19, fromLabel: levelText(curP19), toLabel: levelText(candP19), jump: p19Jump },
    p20: { from: curP20, to: candP20, fromLabel: levelText(curP20), toLabel: levelText(candP20), jump: p20Jump },
    totalJumps: p19Jump + p20Jump,
    paramCount: (p19Jump > 0 ? 1 : 0) + (p20Jump > 0 ? 1 : 0),
    hasLevelChange: p19Jump > 0 || p20Jump > 0,
  };
}

function computeRawImprovement(currentResult, candidateResult) {
  const curWorst = worstPrimarySeatDeviation(currentResult);
  const candWorst = worstPrimarySeatDeviation(candidateResult);
  return Math.max(0, curWorst - candWorst);
}

function sameLevel(currentResult, candidateResult) {
  const curP19 = numericLevel(currentResult?.achievedP19Level);
  const candP19 = numericLevel(candidateResult?.achievedP19Level);
  const curP20 = numericLevel(currentResult?.achievedP20Level);
  const candP20 = numericLevel(candidateResult?.achievedP20Level);
  return curP19 === candP19 && curP20 === candP20;
}

/**
 * Rank all material confirmed results into ordered recommendation cards.
 *
 * @param {object} selection - V2 selection object from the engine:
 *   { confirmedResults, calibrationResult, calibrationMaterial,
 *     calibrationTuning, currentResult, winner, materialityReason }
 * @returns {Array} ranked recommendations, each with:
 *   { rank, tier, interventionType, interventionLabel, interventionSubLabel,
 *     result, levelChanges, rawImprovement, sameLevel, materialityReason,
 *     isWinner }
 */
export function rankRecommendations(selection) {
  if (!selection) return [];

  const {
    confirmedResults = [],
    calibrationResult,
    calibrationMaterial,
    currentResult,
    winner,
  } = selection;

  if (!currentResult) return [];

  const recommendations = [];

  // Add calibration-only result if material
  if (calibrationResult && calibrationMaterial?.material) {
    const levelChanges = computeLevelChanges(currentResult, calibrationResult);
    const rawImprovement = computeRawImprovement(currentResult, calibrationResult);
    recommendations.push({
      result: calibrationResult,
      interventionType: 'calibration',
      interventionLabel: 'Adjust calibration',
      interventionSubLabel: 'Phase / delay / gain',
      levelChanges,
      rawImprovement,
      sameLevel: sameLevel(currentResult, calibrationResult),
      materialityReason: calibrationMaterial.reason,
      isWinner: !!winner && winner === calibrationResult,
    });
  }

  // Add confirmed challenger results that are material
  for (const result of confirmedResults) {
    if (result.isCurrent) continue; // skip current/calibration-only (added above)
    if (!currentResult) continue;

    const mat = isMaterialImprovement(currentResult, result);
    if (!mat.material) continue;

    const interventionType = classifyIntervention(result);
    const levelChanges = computeLevelChanges(currentResult, result);
    const rawImprovement = computeRawImprovement(currentResult, result);

    recommendations.push({
      result,
      interventionType,
      interventionLabel: interventionType === 'position' ? 'Adjust subwoofer positions' : 'Adjust calibration',
      interventionSubLabel: result.movementDescription || null,
      levelChanges,
      rawImprovement,
      sameLevel: sameLevel(currentResult, result),
      materialityReason: mat.reason,
      isWinner: !!winner && (winner === result || (winner?.candidateId && result.candidateId === winner.candidateId)),
    });
  }

  // Sort by the user's hierarchy:
  // 1. Level change: more parameter-level improvements first, then larger total jump
  // 2. Same level: larger raw improvement (unless broadly equivalent)
  // 3. Same-level broadly equivalent: practical priority (calibration < position)
  recommendations.sort((a, b) => {
    // 1a. More parameter-level improvements first
    if (a.levelChanges.paramCount !== b.levelChanges.paramCount) {
      return b.levelChanges.paramCount - a.levelChanges.paramCount;
    }
    // 1b. Larger total level jump first
    if (a.levelChanges.totalJumps !== b.levelChanges.totalJumps) {
      return b.levelChanges.totalJumps - a.levelChanges.totalJumps;
    }
    // 2. Same level: larger raw improvement (unless broadly equivalent)
    const rawDiff = b.rawImprovement - a.rawImprovement;
    if (Math.abs(rawDiff) > BROADLY_EQUIVALENT_THRESHOLD_DB) {
      return rawDiff; // materially better raw result wins
    }
    // 3. Same-level broadly equivalent: practical priority (lower = less disruptive)
    const aPri = PRACTICAL_PRIORITY[a.interventionType] || 99;
    const bPri = PRACTICAL_PRIORITY[b.interventionType] || 99;
    return aPri - bPri;
  });

  // Ensure the canonical winner is always #1 (authority override)
  if (winner) {
    const winnerIdx = recommendations.findIndex(
      (r) => r.isWinner || r.result === winner
        || (r.result?.candidateId && winner.candidateId && r.result.candidateId === winner.candidateId),
    );
    if (winnerIdx > 0) {
      const [winnerRec] = recommendations.splice(winnerIdx, 1);
      recommendations.unshift(winnerRec);
    }
  }

  // Assign tier labels
  const tierLabels = ['BEST IMPROVEMENT', 'NEXT BEST', 'SMALLER IMPROVEMENT'];
  return recommendations.map((rec, i) => ({
    ...rec,
    rank: i + 1,
    tier: tierLabels[Math.min(i, 2)] || 'SMALLER IMPROVEMENT',
  }));
}

/**
 * Check whether a recommendation changes an RP22 parameter level.
 * @param {object} rec - recommendation from rankRecommendations
 * @returns {boolean}
 */
export function hasLevelChange(rec) {
  return rec?.levelChanges?.hasLevelChange === true;
}

/**
 * Format the level change text for a recommendation card.
 * @param {object} rec - recommendation from rankRecommendations
 * @returns {string} e.g. "P19: FAIL → L1, P20: L1 → L2" or "Same RP22 level"
 */
export function formatLevelChangeText(rec) {
  if (!rec?.levelChanges) return '';
  const { p19, p20 } = rec.levelChanges;
  const parts = [];
  if (p19.jump > 0) parts.push(`P19: ${p19.fromLabel} → ${p19.toLabel}`);
  if (p20.jump > 0) parts.push(`P20: ${p20.fromLabel} → ${p20.toLabel}`);
  if (parts.length === 0) return 'Same RP22 level';
  return parts.join(', ');
}