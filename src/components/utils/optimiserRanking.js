// optimiserRanking.js — Pure, deterministic canonical ranking for bass optimiser candidates.
// Every physically valid candidate is compared with the response-anchored house-curve shape.
// Compliance grades and requested intent never influence fitness.

const filterCount = (candidate) => {
  const bank = candidate?.generatedFilterBank;
  return Array.isArray(bank) ? bank.filter((filter) => filter?.enabled).length : 0;
};

const fixedIntentMetric = (candidate, key, fallback = Number.MAX_SAFE_INTEGER) => {
  const value = candidate?.[key];
  return Number.isFinite(value) ? value : fallback;
};

// Candidate fitness is exclusively distance from the fixed requested target,
// followed by raw seat/placement quality and EQ cost. Achieved RP22 grades are
// intentionally diagnostic-only and never participate in this comparator.
function compareForFixedDesignerIntent(a, b) {
  const metrics = [
    "houseCurveRankingRmsResidualDb", "houseCurveRankingMaxResidualDb",
    "houseCurveRankingMeanAbsoluteResidualDb", "worstSeatMaxDeviationDb",
    "meanSeatMaxDeviationDb",
  ];
  for (const key of metrics) {
    const difference = fixedIntentMetric(a, key) - fixedIntentMetric(b, key);
    if (difference !== 0) return difference;
  }
  return filterCount(a) - filterCount(b);
}

const COMPARATORS = {
  spl: compareForFixedDesignerIntent,
  extension: compareForFixedDesignerIntent,
  accuracy: compareForFixedDesignerIntent,
  balanced: compareForFixedDesignerIntent,
};

// Non-mutating single-pass best-candidate selection from a pool.
export function selectBestCandidate(pool, priorityMode) {
  const mode = ["balanced", "spl", "extension", "accuracy"].includes(priorityMode) ? priorityMode : "balanced";
  const compare = COMPARATORS[mode];
  if (!Array.isArray(pool) || pool.length === 0) return { selected: null, selectionReason: "Empty pool" };
  const eligiblePool = pool.filter((candidate) => candidate?.physicalEqAuthorityPassed !== false
    && candidate?.bankValidationResult?.allOk !== false);
  if (eligiblePool.length === 0) return { selected: null, selectionReason: "No physically valid candidates" };
  let best = eligiblePool[0];
  for (let i = 1; i < eligiblePool.length; i++) {
    if (compare(eligiblePool[i], best) < 0) best = eligiblePool[i];
  }
  return {
    selected: best,
    selectionReason: `Selected by canonical shape-residual ranking from ${eligiblePool.length} physically valid candidates; compliance grades excluded.`,
  };
}

// Deterministic fixed-intent regression: changing achieved grades cannot change
// rank, while lower residual against the requested L4 curve must win.
export function runRankingFixtures() {
  const candidate = (id, residualDb, achievedLevel) => ({
    id,
    requestedP14Level: "L4",
    requestedP18Level: "L4",
    requestedP19Level: "L4",
    achievedP14Level: achievedLevel,
    achievedP18Level: achievedLevel,
    achievedP19Level: achievedLevel,
    houseCurveRankingRmsResidualDb: residualDb,
    houseCurveRankingMaxResidualDb: residualDb,
    houseCurveRankingMeanAbsoluteResidualDb: residualDb,
    worstSeatMaxDeviationDb: residualDb + 0.5,
    meanSeatMaxDeviationDb: residualDb + 0.25,
    generatedFilterBank: [],
    bankValidationResult: { allOk: true },
    physicalEqAuthorityPassed: true,
  });
  const closestL4Attempt = candidate("closest-l4-attempt", 4, 2);
  const perfectL2AgainstL2Only = candidate("perfect-l2-only", 10, 2);
  const selected = selectBestCandidate([perfectL2AgainstL2Only, closestL4Attempt], "balanced").selected;
  const changedGrade = { ...closestL4Attempt, achievedP14Level: 4, achievedP18Level: 4, achievedP19Level: 4 };
  return {
    requestedL4ClosestCandidateWins: selected === closestL4Attempt,
    achievedGradeDoesNotChangeFitness: compareForFixedDesignerIntent(closestL4Attempt, changedGrade) === 0,
  };
}