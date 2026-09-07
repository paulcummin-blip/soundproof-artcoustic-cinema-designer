// positionRanking.js
// Stage 11B: Lexicographic ranking for position search candidates.
//
// 10-level priority:
//   1. No primary-seat regression
//   2. Highest worst-seat P19/P20 displayed levels
//   3. Greater number of seats at higher P19/P20 levels
//   4. Level improvements before decimal improvements
//   5. Worst-seat raw deviation
//   6. Overall seat consistency
//   7. P14/headroom preservation
//   8. Symmetry (symmetric > asymmetric > individual)
//   9. Smaller physical movement
//   10. Simpler tuning

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function worstSeatDeviation(result) {
  const p19 = Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [];
  const p20 = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  let worst = 0;
  for (const seat of [...p19, ...p20]) {
    const v = Math.abs(Number(seat?.variationDbRaw) || 0);
    if (v > worst) worst = v;
  }
  return worst;
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

function countSeatsAtLevelOrHigher(perSeat, targetLevel) {
  if (!Array.isArray(perSeat)) return 0;
  return perSeat.filter((s) => numericLevel(s.level) >= targetLevel).length;
}

function maxMovementDistance(winnerCoords, currentPositions) {
  let maxDist = 0;
  for (let i = 0; i < winnerCoords.length; i++) {
    const wc = winnerCoords[i];
    const cp = currentPositions?.[i];
    if (!cp) continue;
    const dist = Math.hypot(Number(wc.x) - Number(cp.x), Number(wc.y) - Number(cp.y));
    if (dist > maxDist) maxDist = dist;
  }
  return maxDist;
}

function phaseRank(phase) {
  if (phase === "symmetric") return 0;
  if (phase === "asymmetric-pair") return 1;
  if (phase === "individual") return 2;
  return 3;
}

function tuningComplexity(tuning) {
  if (!Array.isArray(tuning)) return 0;
  let complexity = 0;
  for (const t of tuning) {
    if (Math.abs(Number(t?.delayMs) || 0) > 0.1) complexity += 1;
    if (Math.abs(Number(t?.gainDb) || 0) > 0.1) complexity += 1;
    if (Number(t?.polarity) < 0) complexity += 1;
  }
  return complexity;
}

/**
 * Compare two confirmed position candidates lexicographically.
 *
 * @param {object} candidateA - confirmed result with metadata
 * @param {object} candidateB - confirmed result with metadata
 * @param {object} currentResult - current/baseline canonical result
 * @param {object} currentPositions - current sub positions
 * @returns {number} negative if A is better, positive if B is better
 */
export function comparePositionCandidates(a, b, currentResult, currentPositions) {
  const ra = a.result || a;
  const rb = b.result || b;

  // 1. No primary-seat regression (both must pass — if one regresses, it's worse)
  const aReg = hasPrimarySeatRegression(ra, currentResult);
  const bReg = hasPrimarySeatRegression(rb, currentResult);
  if (aReg && !bReg) return 1;
  if (!aReg && bReg) return -1;

  // 2. Highest worst-seat P19/P20 displayed levels
  const aWorstP19 = numericLevel(ra.achievedP19Level);
  const bWorstP19 = numericLevel(rb.achievedP19Level);
  const aWorstP20 = numericLevel(ra.achievedP20Level);
  const bWorstP20 = numericLevel(rb.achievedP20Level);

  const aMinLevel = Math.min(aWorstP19, aWorstP20);
  const bMinLevel = Math.min(bWorstP19, bWorstP20);
  if (aMinLevel !== bMinLevel) return bMinLevel - aMinLevel; // higher is better

  // 3. Greater number of seats at higher P19/P20 levels
  const aSeatsP19 = countSeatsAtLevelOrHigher(ra.perSeatP19, aMinLevel + 1);
  const bSeatsP19 = countSeatsAtLevelOrHigher(rb.perSeatP19, bMinLevel + 1);
  if (aSeatsP19 !== bSeatsP19) return bSeatsP19 - aSeatsP19;

  const aSeatsP20 = countSeatsAtLevelOrHigher(ra.perSeatP20, aMinLevel + 1);
  const bSeatsP20 = countSeatsAtLevelOrHigher(rb.perSeatP20, bMinLevel + 1);
  if (aSeatsP20 !== bSeatsP20) return bSeatsP20 - aSeatsP20;

  // 4. Level improvements before decimal improvements (already handled by levels above)

  // 5. Worst-seat raw deviation (lower is better)
  const aWorstDev = worstSeatDeviation(ra);
  const bWorstDev = worstSeatDeviation(rb);
  if (Math.abs(aWorstDev - bWorstDev) > 0.05) return aWorstDev - bWorstDev;

  // 6. Overall seat consistency (worst primary deviation, lower is better)
  const aPrimaryDev = worstPrimarySeatDeviation(ra);
  const bPrimaryDev = worstPrimarySeatDeviation(rb);
  if (Math.abs(aPrimaryDev - bPrimaryDev) > 0.05) return aPrimaryDev - bPrimaryDev;

  // 7. P14/headroom preservation (higher is better)
  const aP14 = numericLevel(ra.p14AchievedLevel);
  const bP14 = numericLevel(rb.p14AchievedLevel);
  if (aP14 !== bP14) return bP14 - aP14;

  // 8. Symmetry (lower phase rank is better)
  const aPhase = phaseRank(a.phase || a.candidatePhase);
  const bPhase = phaseRank(b.phase || b.candidatePhase);
  if (aPhase !== bPhase) return aPhase - bPhase;

  // 9. Smaller physical movement
  const aMove = maxMovementDistance(a.coordinates || ra.coordinates, currentPositions);
  const bMove = maxMovementDistance(b.coordinates || rb.coordinates, currentPositions);
  if (Math.abs(aMove - bMove) > 0.005) return aMove - bMove;

  // 10. Simpler tuning
  const aTuning = tuningComplexity(a.appliedTuning || ra.appliedTuning);
  const bTuning = tuningComplexity(b.appliedTuning || rb.appliedTuning);
  return aTuning - bTuning;
}

function hasPrimarySeatRegression(candidateResult, currentResult) {
  if (!currentResult) return false;
  const currentP19 = new Map((currentResult.perSeatP19 || []).map((s) => [String(s.seatId), s]));
  const currentP20 = new Map((currentResult.perSeatP20 || []).map((s) => [String(s.seatId), s]));

  for (const seat of (candidateResult.perSeatP19 || [])) {
    if (!seat.isPrimary) continue;
    const cur = currentP19.get(String(seat.seatId));
    if (!cur) continue;
    if (numericLevel(seat.level) < numericLevel(cur.level)) return true;
  }
  for (const seat of (candidateResult.perSeatP20 || [])) {
    if (!seat.isPrimary) continue;
    const cur = currentP20.get(String(seat.seatId));
    if (!cur) continue;
    if (numericLevel(seat.level) < numericLevel(cur.level)) return true;
  }
  return false;
}

// Re-export for convenience
export { hasPrimarySeatRegression };

/**
 * Select the best position candidate from confirmed results.
 * Returns null if no candidate beats the current design.
 */
export function selectBestPositionCandidate(confirmedResults, currentResult, currentPositions) {
  const valid = confirmedResults.filter((r) => !hasPrimarySeatRegression(r.result || r, currentResult));
  if (!valid.length) return null;

  valid.sort((a, b) => comparePositionCandidates(a, b, currentResult, currentPositions));
  return valid[0];
}