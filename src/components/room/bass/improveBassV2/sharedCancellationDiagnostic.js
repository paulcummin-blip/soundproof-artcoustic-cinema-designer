// sharedCancellationDiagnostic.js
// Read-only diagnostic over the processed individual-seat post-EQ curves to
// identify significant cancellations that remain common to the priority seats.
//
// This is diagnostic evidence only — it is NOT a new RP22 parameter, NOT a
// numerical grade, and NOT an EQ permission. A strong Primary P20 result must
// not conceal a serious common cancellation. EQ cannot be assumed to correct
// a deep destructive null merely because headroom exists.
//
// The diagnostic inspects the post-EQ per-seat curves (the same processed
// curves the canonical authority graded) and reports:
//   - frequencies where multiple priority seats share a deep deficit
//   - the seats and depths involved
//   - whether the shared deficit is within the assessment band
//
// It never changes a grade, a score, or an EQ permission.

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/**
 * Build a frequency-indexed map of post-EQ per-seat SPL values.
 *
 * @param {Array} perSeatP20 — from the confirmed result (carries worstFrequencyHz)
 * @param {object} confirmation — full confirmation (for post-EQ curves if available)
 * @returns {Map} seatId → Map(frequency → splDb)
 */
function buildSeatFrequencyMap(perSeatP20, confirmation) {
  const seatMap = new Map();
  const seats = Array.isArray(perSeatP20) ? perSeatP20 : [];

  // The per-seat P20 rows carry the worst frequency and variation, but not the
  // full curve. The full post-EQ curves live on the canonical result's
  // finalOptimisedBassResponse (postEqPerSeatCurves). When available, use those;
  // otherwise, use the per-seat worst frequency as a single-point diagnostic.
  const postEqCurves = confirmation?.finalOptimisedBassResponse?.postEqPerSeatCurves
    || confirmation?.postEqPerSeatCurves
    || [];

  if (Array.isArray(postEqCurves) && postEqCurves.length > 0) {
    for (const curve of postEqCurves) {
      const seatId = String(curve.seatId || "");
      if (!seatId) continue;
      const freqMap = new Map();
      for (const point of (curve.responseData || [])) {
        const freq = num(point?.frequency);
        const spl = num(point?.spl);
        if (freq != null && spl != null) freqMap.set(freq, spl);
      }
      if (freqMap.size > 0) seatMap.set(seatId, freqMap);
    }
  }

  // Fallback: use the per-seat worst frequency as a single point
  if (seatMap.size === 0) {
    for (const seat of seats) {
      const seatId = String(seat?.seatId || "");
      if (!seatId) continue;
      const freq = num(seat?.worstFrequencyHz);
      const variation = num(seat?.variationDbRaw ?? seat?.wholeDbDeviation);
      if (freq != null && variation != null) {
        const freqMap = new Map();
        // The variation is a deviation magnitude — store it as a negative
        // deficit indicator (higher variation = deeper cancellation)
        freqMap.set(freq, -Math.abs(variation));
        seatMap.set(seatId, freqMap);
      }
    }
  }

  return seatMap;
}

/**
 * Diagnose shared cancellations across priority seats.
 *
 * @param {object} confirmation — canonically confirmed result
 * @param {object} [options] — { assessmentStartHz, assessmentEndHz, deficitThresholdDb }
 * @returns {object} diagnostic evidence
 */
export function diagnoseSharedCancellations(confirmation, options = {}) {
  const perSeatP20 = confirmation?.perSeatP20 || [];
  const seats = Array.isArray(perSeatP20) ? perSeatP20 : [];
  const primarySeats = seats.filter((s) => s.isPrimary);
  const secondarySeats = seats.filter((s) => !s.isPrimary);

  const assessmentStartHz = num(options.assessmentStartHz);
  const assessmentEndHz = num(options.assessmentEndHz);
  const deficitThresholdDb = num(options.deficitThresholdDb) ?? -6; // default: 6 dB deficit

  const seatFreqMap = buildSeatFrequencyMap(perSeatP20, confirmation);

  // Per-seat reference level. For a genuine post-EQ curve (many points) the
  // reference is the seat's mean SPL over the assessment band; a deficit is a
  // dip relative to that mean. For the single-point fallback the stored value
  // IS the signed deficit, so the reference is 0 and the absolute threshold
  // applies directly. Without this, genuine curves (absolute SPL ~100 dB)
  // never fall below a fixed −6 dB threshold and the diagnostic is silent.
  const seatReference = new Map();
  const seatIsCurve = new Map();
  for (const seat of primarySeats) {
    const seatId = String(seat.seatId);
    const freqMap = seatFreqMap.get(seatId);
    if (!freqMap) continue;
    if (freqMap.size > 1) {
      const spls = [];
      for (const [freq, spl] of freqMap.entries()) {
        const inBand = assessmentStartHz == null || assessmentEndHz == null
          || (freq >= assessmentStartHz && freq <= assessmentEndHz);
        if (inBand) spls.push(spl);
      }
      seatReference.set(seatId, spls.length ? spls.reduce((a, b) => a + b, 0) / spls.length : null);
      seatIsCurve.set(seatId, true);
    } else {
      seatIsCurve.set(seatId, false);
    }
  }

  // Collect all frequencies where at least 2 priority seats have a deficit
  // at the same frequency (within a small frequency tolerance).
  const sharedDeficits = [];

  if (primarySeats.length >= 2 && seatFreqMap.size >= 2) {
    // Get the set of frequencies present across all primary seats
    const allFreqs = new Set();
    for (const freqMap of seatFreqMap.values()) {
      for (const freq of freqMap.keys()) allFreqs.add(freq);
    }

    for (const freq of allFreqs) {
      const seatsWithDeficit = [];
      for (const seat of primarySeats) {
        const seatId = String(seat.seatId);
        const freqMap = seatFreqMap.get(seatId);
        if (!freqMap) continue;
        // Find the SPL at this frequency (exact match or nearest within 1 Hz)
        const spl = freqMap.get(freq) ?? findNearest(freqMap, freq, 1);
        if (spl == null) continue;
        const isCurve = seatIsCurve.get(seatId);
        const ref = seatReference.get(seatId);
        // Full curve: dip relative to the seat's mean SPL. Fallback: the
        // stored value IS the signed deficit, so compare against 0.
        const isDeficit = isCurve
          ? (ref != null && spl <= ref + deficitThresholdDb)
          : (spl <= deficitThresholdDb);
        if (isDeficit) {
          seatsWithDeficit.push({
            seatId,
            splDb: spl,
            referenceDb: isCurve ? ref : null,
            deficitDb: isCurve && ref != null ? spl - ref : spl,
          });
        }
      }

      if (seatsWithDeficit.length >= 2) {
        const inBand = (assessmentStartHz == null || assessmentEndHz == null)
          || (freq >= assessmentStartHz && freq <= assessmentEndHz);
        sharedDeficits.push({
          frequencyHz: freq,
          seatCount: seatsWithDeficit.length,
          seats: seatsWithDeficit,
          inAssessmentBand: inBand,
        });
      }
    }
  }

  // Sort by frequency
  sharedDeficits.sort((a, b) => a.frequencyHz - b.frequencyHz);

  // Determine whether any shared deficit is serious (>= 2 primary seats,
  // within the assessment band, deficit exceeds threshold)
  const seriousSharedCancellations = sharedDeficits.filter(
    (d) => d.inAssessmentBand && d.seatCount >= 2,
  );

  return {
    hasSharedCancellations: sharedDeficits.length > 0,
    hasSeriousSharedCancellations: seriousSharedCancellations.length > 0,
    sharedDeficits,
    primarySeatCount: primarySeats.length,
    secondarySeatCount: secondarySeats.length,
    assessmentBand: { startHz: assessmentStartHz, endHz: assessmentEndHz },
    diagnosticOnly: true, // never a grade or parameter
  };
}

function findNearest(freqMap, targetFreq, toleranceHz) {
  let nearest = null;
  let minDist = Infinity;
  for (const [freq, spl] of freqMap.entries()) {
    const dist = Math.abs(freq - targetFreq);
    if (dist < minDist && dist <= toleranceHz) {
      minDist = dist;
      nearest = spl;
    }
  }
  return nearest;
}