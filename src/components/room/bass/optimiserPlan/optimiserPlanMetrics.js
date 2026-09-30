// optimiserPlanMetrics.js
// ---------------------------------------------------------------------------
// Pure readers for the metrics the Optimisation Plan persists.
//
// Everything here already exists on the optimiser's confirmed candidate results
// (perSeatP19 / perSeatP20 / achievedP19VariationDb / achievedP20VariationDb /
// p14AchievedDb / achievedP18Hz). This module only REFORMATS them — it never
// recalculates, re-grades, or estimates a value that is not already present.
// ---------------------------------------------------------------------------

// null / undefined / "" stay UNAVAILABLE. Number(null) is 0 and Number("") is 0,
// so a plain Number.isFinite(Number(value)) check would silently publish a
// missing metric as a real 0.00 dB reading.
const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/** Worst P20 seat of a candidate result: highest seat variation. */
export function worstP20Seat(result) {
  const seats = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  let worst = null;
  for (const seat of seats) {
    const variation = num(seat?.variationDbRaw ?? seat?.wholeDbDeviation);
    if (variation == null) continue;
    if (!worst || variation > worst.variationDb) {
      worst = {
        seatId: seat.seatId ?? null,
        variationDb: variation,
        level: num(seat?.level),
        frequencyHz: num(seat?.worstFrequencyHz),
      };
    }
  }
  return worst;
}

/** Worst P19 seat of a candidate result (when the result carries seat detail). */
export function worstP19Seat(result) {
  const seats = Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [];
  let worst = null;
  for (const seat of seats) {
    const deviation = num(seat?.wholeDbDeviation ?? seat?.variationDbRaw);
    if (deviation == null) continue;
    const magnitude = Math.abs(deviation);
    if (!worst || magnitude > Math.abs(worst.deviationDb)) {
      worst = {
        seatId: seat.seatId ?? null,
        deviationDb: deviation,
        level: num(seat?.level),
        frequencyHz: num(seat?.worstFrequencyHz),
      };
    }
  }
  return worst;
}

/**
 * Compact per-seat P19/P20 rows, in the order the seats appear on the result.
 * Only seats the result actually carries are written — a seat that was not
 * evaluated is absent, never estimated.
 */
export function summariseSeats(result) {
  const rows = [];
  const byId = new Map();
  const ensure = (seatId) => {
    if (!seatId) return null;
    if (!byId.has(seatId)) {
      const row = {
        seatId,
        p19VariationDb: null,
        p19Level: null,
        p20VariationDb: null,
        p20Level: null,
        p20WorstFrequencyHz: null,
      };
      byId.set(seatId, row);
      rows.push(row);
    }
    return byId.get(seatId);
  };

  (Array.isArray(result?.perSeatP20) ? result.perSeatP20 : []).forEach((seat) => {
    const row = ensure(seat?.seatId);
    if (!row) return;
    row.p20VariationDb = num(seat?.variationDbRaw ?? seat?.wholeDbDeviation);
    row.p20Level = num(seat?.level);
    row.p20WorstFrequencyHz = num(seat?.worstFrequencyHz);
  });

  (Array.isArray(result?.perSeatP19) ? result.perSeatP19 : []).forEach((seat) => {
    const row = ensure(seat?.seatId);
    if (!row) return;
    row.p19VariationDb = num(seat?.wholeDbDeviation ?? seat?.variationDbRaw);
    row.p19Level = num(seat?.level);
  });

  return rows;
}

/**
 * Snapshot the P19/P20 headline of a candidate or baseline result.
 * Returns null when the result carries no authority metrics at all.
 */
export function summariseResult(result) {
  if (!result) return null;
  const p20Seat = worstP20Seat(result);
  const p19Seat = worstP19Seat(result);
  const summary = {
    p19Level: num(result.p19Level ?? result.achievedP19Level),
    p19VariationDb: num(result.achievedP19VariationDb ?? p19Seat?.deviationDb),
    p20Level: num(result.p20Level ?? result.achievedP20Level),
    p20VariationDb: num(result.achievedP20VariationDb ?? (
      p20Seat ? p20Seat.variationDb : num(result.achievedP20VariationDb)
    )),
    worstSeatId: p20Seat?.seatId ?? null,
    worstFrequencyHz: p20Seat?.frequencyHz ?? null,
    p14AchievedDb: num(result.p14AchievedDb),
    achievedP18Hz: num(result.achievedP18Hz),
    operatingOutputDb: num(result.operatingOutputDb),
    seats: summariseSeats(result),
  };
  const hasAny = Object.entries(summary)
    .some(([key, value]) => (key === "seats" ? value.length > 0 : value != null));
  return hasAny ? summary : null;
}

/**
 * The lever's OWN evaluated effect: the candidate result measured from the
 * current design, against the baseline. Null when no such evaluation exists —
 * a null effect is never replaced with the combined candidate's improvement.
 */
export function leverEffectFrom(result, baseline) {
  const after = summariseResult(result);
  if (!after) return null;
  const before = summariseResult(baseline);
  const round = (value) => (value == null ? null : Math.round(value * 100) / 100);
  return {
    p19Level: after.p19Level,
    p19VariationDb: after.p19VariationDb,
    p19DeltaDb: before && after.p19VariationDb != null && before.p19VariationDb != null
      ? round(after.p19VariationDb - before.p19VariationDb)
      : null,
    p20Level: after.p20Level,
    p20VariationDb: after.p20VariationDb,
    p20DeltaDb: before && after.p20VariationDb != null && before.p20VariationDb != null
      ? round(after.p20VariationDb - before.p20VariationDb)
      : null,
    worstSeatId: after.worstSeatId,
    worstFrequencyHz: after.worstFrequencyHz,
    p14AchievedDb: after.p14AchievedDb,
    p14DeltaDb: before && after.p14AchievedDb != null && before.p14AchievedDb != null
      ? round(after.p14AchievedDb - before.p14AchievedDb)
      : null,
    operatingOutputDb: after.operatingOutputDb,
    outputDeltaDb: before && after.operatingOutputDb != null && before.operatingOutputDb != null
      ? round(after.operatingOutputDb - before.operatingOutputDb)
      : null,
    achievedP18Hz: after.achievedP18Hz,
  };
}

/**
 * The authoritative P20 headline published for a design, read from the completed
 * bass authority. Read only — never recalculated, never estimated. Used to show
 * the MEASURED before/after after a lever is applied.
 */
export function readAuthoritativeP20Headline(completedBassAuthority) {
  const parameters = completedBassAuthority?.contract?.productAnalysis?.parameters || {};
  const p20 = parameters.p20 || null;
  const variation = num(p20?.variationDbRaw ?? p20?.value);
  if (variation == null) return null;
  return {
    variationDb: variation,
    level: num(p20?.level),
    worstSeatId: p20?.worstSeatId ?? null,
    worstFrequencyHz: num(p20?.worstFrequencyHz),
    fingerprint: completedBassAuthority?.contract?.job?.resultFingerprint || null,
  };
}

/** The verified trade-off already classified for a candidate, or null. */
export function existingTradeOff(result) {
  const tradeOff = result?.tradeOff;
  if (!tradeOff || typeof tradeOff !== 'object') return null;
  return {
    isTradeOff: tradeOff.isTradeOff !== false,
    reason: tradeOff.reason ?? null,
  };
}