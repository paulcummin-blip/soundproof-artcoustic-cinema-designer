// One ordering for safety-eligible, material canonical recommendations.
// P19, then P20, then P18, then P14. Seat priorities remain explicit.

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
// Signed ascending tuple. Worst primary-seat grade/raw first, then worst
// secondary-seat grade/raw, separately for P19 and P20. These internal
// comparisons do not create aggregate grades for display.
export function canonicalRecommendationTuple(result) {
  const tuple=[];
  for(const field of ["perSeatP19","perSeatP20"]){
    const rows=result?.[field] || [];
    for(const primary of [true,false]){
      const scope=rows.filter(s=>!!s.isPrimary===primary);
      tuple.push(scope.length?-Math.min(...scope.map(s=>numericLevel(s.level))):0);
      tuple.push(scope.length?Math.max(...scope.map(s=>s.variationDbRaw)):0);
    }
  }
  return [...tuple,-numericLevel(result?.p18AchievedLevel),result?.achievedP18Hz,
    -numericLevel(result?.p14AchievedLevel),-result?.p14AchievedDb];
}
export function compareCanonicalRecommendations(a,b) {
  const left=canonicalRecommendationTuple(a),right=canonicalRecommendationTuple(b);
  for(let i=0;i<left.length;i++)if(Math.abs(left[i]-right[i])>1e-8)return left[i]-right[i];
  return 0;
}

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
  if (result.candidateKind === 'calibration' || result.candidateId === 'calibration-only') return 'calibration';
  if (result.isPositionCandidate) return 'position';
  return 'position'; // global placement also moves positions
}

function computeLevelChanges(currentResult, candidateResult) {
  const changes = ["perSeatP19","perSeatP20"].map(field => {
    const before = new Map((currentResult?.[field] || []).map(s=>[String(s.seatId),s]));
    const seats=(candidateResult?.[field] || []).map(s=>({seatId:s.seatId,from:numericLevel(before.get(String(s.seatId))?.level),to:numericLevel(s.level)}));
    const improved=seats.filter(s=>s.to>s.from);
    const jump=improved.reduce((n,s)=>n+s.to-s.from,0);
    const lead=improved[0] || seats[0] || {from:0,to:0};
    return {...lead,jump,seats,fromLabel:levelText(lead.from),toLabel:levelText(lead.to)};
  });
  const [p19,p20]=changes;
  const p19Jump=p19.jump,p20Jump=p20.jump;

  return {
    p19,
    p20,
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
  return ["perSeatP19","perSeatP20"].every(field => {
    const before=new Map((currentResult?.[field] || []).map(s=>[String(s.seatId),s]));
    return (candidateResult?.[field] || []).every(s=>numericLevel(before.get(String(s.seatId))?.level)===numericLevel(s.level));
  });
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
  if (Array.isArray(selection.recommendations)) return selection.recommendations;

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
  if (calibrationResult && calibrationMaterial?.material && isMaterialImprovement(currentResult, calibrationResult).material) {
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
    if (result.candidateKind === "current" || result.candidateId === "current") continue;
    if (result === calibrationResult) continue;
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

  recommendations.sort((a,b) => compareCanonicalRecommendations(a.result,b.result)
    || (PRACTICAL_PRIORITY[a.interventionType] || 99)-(PRACTICAL_PRIORITY[b.interventionType] || 99)
    || String(a.result.candidateId).localeCompare(String(b.result.candidateId)));

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