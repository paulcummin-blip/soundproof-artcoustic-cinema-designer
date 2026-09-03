const number = (value, fallback = Number.POSITIVE_INFINITY) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export function hasSideWallInvolvement(layout) {
  return (layout?.sources || []).some((source) =>
    source?.placement === "left" || source?.placement === "right");
}

export function compareFastPlacementCandidates(a, b) {
  const A = a?.metrics || {};
  const B = b?.metrics || {};
  const fields = [
    "priorityNullCount30To60",
    "worstPriorityNullDepthDb",
    "worstSeatVariationDb",
    "meanSeatVariationDb",
    "houseCurveCompatibilityDb",
    "destructiveBroadNullCount",
  ];
  for (const field of fields) {
    const delta = number(A[field]) - number(B[field]);
    if (Math.abs(delta) > 0.05) return delta;
  }
  const tierDelta = number(a?.practicalTier, 9) - number(b?.practicalTier, 9);
  if (tierDelta !== 0) return tierDelta;
  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

export function isSideWallGainMaterial({
  sideCandidate,
  practicalCandidate,
  quantity,
}) {
  if (!sideCandidate?.metrics || !practicalCandidate?.metrics) return false;
  const side = sideCandidate.metrics;
  const practical = practicalCandidate.metrics;
  const variationThresholdDb = Number(quantity) === 4 ? 2.5 : Number(quantity) === 2 ? 2 : 0.75;
  const variationGain = number(practical.worstSeatVariationDb, 0) - number(side.worstSeatVariationDb, 0);
  const smoothnessGain = number(practical.houseCurveCompatibilityDb, 0) - number(side.houseCurveCompatibilityDb, 0);
  const removesPriorityNull = number(practical.priorityNullCount30To60, 0) > number(side.priorityNullCount30To60, 0)
    && number(practical.worstPriorityNullDepthDb, 0) >= 8
    && number(side.worstPriorityNullDepthDb, 0) <= number(practical.worstPriorityNullDepthDb, 0) - 3;
  const poorToCredible = number(practical.worstSeatVariationDb, 0) > 9
    && number(side.worstSeatVariationDb, 0) <= 6;
  const materiallySmoother = smoothnessGain >= 2.5 && variationGain >= -0.5;

  return removesPriorityNull || variationGain >= variationThresholdDb || poorToCredible || materiallySmoother;
}

export function selectPracticalRecommendation(candidates, quantity) {
  const pool = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate?.metrics?.sourceCount === Number(quantity))
    .slice()
    .sort(compareFastPlacementCandidates);
  if (!pool.length) return null;

  const acousticWinner = pool[0];
  if (!hasSideWallInvolvement(acousticWinner) || Number(quantity) === 1) {
    return {
      ...acousticWinner,
      recommendationKind: hasSideWallInvolvement(acousticWinner) ? "side-wall-alternative" : "practical",
      practicalReason: hasSideWallInvolvement(acousticWinner)
        ? "The room-scored single-sub option uses an RP22-style side-wall quarter point."
        : "Highest-ranked practical canonical layout for this room and seating area.",
    };
  }

  const practicalWinner = pool.find((candidate) => !hasSideWallInvolvement(candidate));
  if (!practicalWinner || isSideWallGainMaterial({
    sideCandidate: acousticWinner,
    practicalCandidate: practicalWinner,
    quantity,
  })) {
    return {
      ...acousticWinner,
      recommendationKind: "side-wall-alternative",
      practicalReason: "Acoustic alternative — less practical placement. It is surfaced because the predicted improvement is material.",
    };
  }

  return {
    ...practicalWinner,
    recommendationKind: "practical-preferred",
    practicalReason: "Preferred practical front/rear-wall solution; the side-wall gain was too small to justify the installation compromise.",
  };
}
