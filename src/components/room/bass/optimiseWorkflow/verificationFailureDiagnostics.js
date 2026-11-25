// verificationFailureDiagnostics.js
// ---------------------------------------------------------------------------
// Builds a BOUNDED diagnostic record when candidate verification fails, so the
// actual settingsMatch / resultMatch evidence survives the automatic rollback
// and can be read from the persisted bassAdiReceipt afterwards.
//
// Pure: no React, no side effects, no acoustic calculations. It reads values
// the verify path already holds and shapes them into a bounded record.
//
// The record is deliberately compact: per-source tuning, headline result
// metrics, per-seat P20 differences and the physical-context fingerprints.
// No curves, no response arrays, no raw payloads.
// ---------------------------------------------------------------------------

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round4 = (value) => (value == null ? null : Number(value.toFixed(4)));

/**
 * Compact per-source tuning: sourceId, delay, gain, polarity, phase.
 * Reads from either the expected tuning array or the authoritative sources.
 */
function compactTuning(tuningArray, sources) {
  if (Array.isArray(tuningArray) && tuningArray.length) {
    return tuningArray.map((t) => ({
      sourceId: t?.sourceId ?? null,
      delayMs: round4(num(t?.delayMs)),
      gainDb: round4(num(t?.gainDb)),
      polarity: t?.polarity ?? null,
      phaseControlDeg: round4(num(t?.phaseControlDeg ?? t?.phaseAdjust)),
    }));
  }
  if (Array.isArray(sources) && sources.length) {
    return sources.map((s) => ({
      sourceId: s?.id ?? null,
      delayMs: round4(num(s?.tuning?.delayMs)),
      gainDb: round4(num(s?.tuning?.gainDb)),
      polarity: s?.tuning?.polarity ?? null,
      phaseControlDeg: round4(num(s?.tuning?.phaseControlDeg)),
    }));
  }
  return [];
}

/**
 * Per-source tuning difference between expected and actual, bounded to
 * fields that cause a settings mismatch: delay, gain, polarity, phase.
 */
function tuningDifferences(expected, actual) {
  const rows = [];
  const byId = new Map(actual.map((s) => [s.sourceId, s]));
  for (const exp of expected) {
    const act = byId.get(exp.sourceId);
    if (!act) {
      rows.push({ sourceId: exp.sourceId, missing: true });
      continue;
    }
    const delayDelta = (num(exp.delayMs) ?? 0) - (num(act.delayMs) ?? 0);
    const gainDelta = (num(exp.gainDb) ?? 0) - (num(act.gainDb) ?? 0);
    const polMismatch = exp.polarity !== act.polarity;
    const phaseDelta = (num(exp.phaseControlDeg) ?? 0) - (num(act.phaseControlDeg) ?? 0);
    if (Math.abs(delayDelta) > 0.0001 || Math.abs(gainDelta) > 0.0001 || polMismatch || Math.abs(phaseDelta) > 0.01) {
      rows.push({
        sourceId: exp.sourceId,
        delayMs: { expected: exp.delayMs, actual: act.delayMs, delta: round4(delayDelta) },
        gainDb: { expected: exp.gainDb, actual: act.gainDb, delta: round4(gainDelta) },
        polarity: { expected: exp.polarity, actual: act.polarity, mismatch: polMismatch },
        phaseControlDeg: { expected: exp.phaseControlDeg, actual: act.phaseControlDeg, delta: round4(phaseDelta) },
      });
    }
  }
  return rows;
}

/**
 * Headline result metrics: P19, P20, P14, P18 — expected vs actual vs delta.
 */
function resultMetrics(expected, actual) {
  const fields = ["achievedP19VariationDb", "achievedP20VariationDb", "p14AchievedDb", "achievedP18Hz"];
  const rows = {};
  for (const f of fields) {
    const exp = num(expected?.[f]);
    const act = num(actual?.[f]);
    rows[f] = {
      expected: exp,
      actual: act,
      delta: exp != null && act != null ? round4(act - exp) : null,
    };
  }
  return rows;
}

/**
 * Per-seat P20 differences, bounded to seats whose variationDbRaw differs by
 * more than 0.01 dB. Returns at most 8 rows.
 */
function perSeatDifferences(expected, actual) {
  const before = Array.isArray(expected?.perSeatP20) ? expected.perSeatP20 : [];
  const after = Array.isArray(actual?.perSeatP20) ? actual.perSeatP20 : [];
  const byId = new Map(after.map((s) => [s.seatId, s]));
  const rows = [];
  for (const seat of before) {
    const match = byId.get(seat.seatId);
    if (!match) {
      rows.push({ seatId: seat.seatId, missing: true });
      continue;
    }
    const exp = num(seat.variationDbRaw);
    const act = num(match.variationDbRaw);
    if (exp != null && act != null && Math.abs(act - exp) > 0.01) {
      rows.push({
        seatId: seat.seatId,
        isPrimary: seat.isPrimary ?? null,
        expected: round4(exp),
        actual: round4(act),
        delta: round4(act - exp),
      });
    }
    if (rows.length >= 8) break;
  }
  return rows;
}

/**
 * A short stable fingerprint of the physical context for expected vs actual
 * comparison. Uses the existing stable() serialization if available, otherwise
 * a JSON stringify.
 */
function contextFingerprint(context) {
  if (!context) return null;
  try {
    const seen = new Set();
    return JSON.stringify(context, (_, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[circ]";
        seen.add(v);
      }
      return v;
    }).slice(0, 200);
  } catch {
    return null;
  }
}

/**
 * Build the bounded verification-failure diagnostic record.
 *
 * @param {object} params
 * @returns {object|null} null when there is insufficient data to record
 */
export function buildVerificationFailureDiagnostics({
  settingsMatch = null,
  resultMatch = null,
  reason = null,
  schedulingReason = null,
  error = null,
  expectedTuning = null,
  actualSources = null,
  expectedResult = null,
  actualResult = null,
  expectedPhysicalContext = null,
  actualPhysicalContext = null,
  fingerprints = {},
} = {}) {
  const expectedTuningCompact = compactTuning(expectedTuning, null);
  const actualTuningCompact = compactTuning(null, actualSources);
  const tuningDiffs = expectedTuningCompact.length > 0 && actualTuningCompact.length > 0
    ? tuningDifferences(expectedTuningCompact, actualTuningCompact)
    : [];

  return {
    capturedAt: new Date().toISOString(),
    settingsMatch,
    resultMatch,
    failedCondition: reason || schedulingReason || error || "unknown",
    schedulingReason: schedulingReason || null,
    error: error || null,
    tuning: {
      expected: expectedTuningCompact,
      actual: actualTuningCompact,
      differences: tuningDiffs,
    },
    resultMetrics: resultMetrics(expectedResult, actualResult),
    perSeatDifferences: perSeatDifferences(expectedResult, actualResult),
    physicalContext: {
      expectedFingerprint: contextFingerprint(expectedPhysicalContext),
      actualFingerprint: contextFingerprint(actualPhysicalContext),
      match: contextFingerprint(expectedPhysicalContext) === contextFingerprint(actualPhysicalContext),
    },
    fingerprints: {
      dispatch: fingerprints.dispatchFingerprint || null,
      targetCacheKey: fingerprints.targetCacheKey || null,
      resultFingerprint: fingerprints.resultFingerprint || null,
      currentJobFingerprint: fingerprints.currentJobFingerprint || null,
      currentCacheKey: fingerprints.currentCacheKey || null,
      preCommitCacheKey: fingerprints.preCommitCacheKey || null,
      actualResultFingerprint: fingerprints.actualResultFingerprint || null,
      actualCurrentJobFingerprint: fingerprints.actualCurrentJobFingerprint || null,
      actualCacheKey: fingerprints.actualCacheKey || null,
    },
  };
}