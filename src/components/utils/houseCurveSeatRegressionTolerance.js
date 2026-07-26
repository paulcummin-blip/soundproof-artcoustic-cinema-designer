const CURRENT_BASELINE_TOLERANCE_DB = 0.5;

export function resolveSeatRegressionToleranceDb(rspImprovementDb, {
  isCorrectiveCut = false,
  protectedNull = false,
  bankLimits = null,
} = {}) {
  const safeCut = isCorrectiveCut
    && !protectedNull
    && bankLimits?.boostLimitOk !== false
    && bankLimits?.sourceDomainHeadroomOk !== false;

  if (!safeCut || !Number.isFinite(rspImprovementDb) || rspImprovementDb < 3) {
    return CURRENT_BASELINE_TOLERANCE_DB;
  }
  // Major peak corrections (>= 3 dB RSP improvement) need more seat regression
  // room — a +5 dB modal peak at the RSP often corresponds to a valley at some
  // seats, and cutting it worsens those seats. The previous 1.0/1.5 dB tolerance
  // blocked all major cuts in multi-seat rooms, leaving the EQ bank empty.
  return rspImprovementDb >= 5 ? 2.5 : 2;
}

export function evaluateSeatRegressionTolerance({
  seatMetrics = [],
  baselineSeatMaxDeviations = new Map(),
  protectedNullRegions = [],
  isProtectedFrequency,
  rspImprovementDb,
  isCorrectiveCut,
  protectedNull,
  bankLimits,
}) {
  const allowedRegressionDb = resolveSeatRegressionToleranceDb(rspImprovementDb, {
    isCorrectiveCut,
    protectedNull,
    bankLimits,
  });
  let worstSeatId = null;
  let worstSeatRegressionDb = -Infinity;

  for (const metric of seatMetrics) {
    if (metric.seatId === "rsp") continue;
    const baselineDeviationDb = baselineSeatMaxDeviations.get(metric.seatId);
    if (!Number.isFinite(baselineDeviationDb)) continue;
    const points = (metric.residualPoints || []).filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions));
    const candidateDeviationDb = points.length
      ? Math.max(...points.map((point) => Math.abs(point.deviationDb)))
      : metric.maxAbsDeviationDb;
    const regressionDb = candidateDeviationDb - baselineDeviationDb;
    if (regressionDb > worstSeatRegressionDb) {
      worstSeatRegressionDb = regressionDb;
      worstSeatId = metric.seatId;
    }
  }

  const measuredRegressionDb = Number.isFinite(worstSeatRegressionDb) ? worstSeatRegressionDb : 0;
  return {
    passed: measuredRegressionDb <= allowedRegressionDb + 1e-9,
    allowedRegressionDb,
    worstSeatId,
    worstSeatRegressionDb: measuredRegressionDb,
    toleranceRaised: allowedRegressionDb > CURRENT_BASELINE_TOLERANCE_DB,
  };
}