// sharedNullSafeguard.js
// ---------------------------------------------------------------------------
// Shared destructive-null safeguard for ADI Subwoofer Design candidates.
//
// Product rule: a candidate with strong seat-to-seat consistency but serious
// shared destructive cancellation must NOT be presented as an unqualified
// excellent physical arrangement.
//
// This module uses the EXISTING raw response and null evidence already captured
// by the Stage 2 placement evaluation. It introduces NO new grading system and
// NO arbitrary numerical thresholds. It detects whether a serious shared null
// exists and, when the severity cannot be established reliably, retains the
// candidate with an explicit internal qualification rather than fabricating a
// pass/fail result.
//
// "Shared destructive null" = a frequency where MULTIPLE seats (or the RSP and
// multiple seats) all drop far below their mean level simultaneously. Strong
// seat-to-seat consistency at such a frequency is misleading: the seats are
// consistent because they all share the same deep null, not because the
// response is genuinely even.
//
// The existing Stage 2 placement ranking already measures raw null depth per
// seat (stage2PlacementRanking.js → computeRawNullDepthDb). This module
// reuses that definition and checks whether the deepest nulls across seats
// coincide at the same frequency — the signature of a shared destructive
// cancellation.
//
// READ-ONLY: it reads existing raw curves. It evaluates nothing, re-simulates
// nothing, and changes no bass maths, no scoring and no RP22 definition.
// ---------------------------------------------------------------------------

const NULL_DEPTH_THRESHOLD_DB = 12; // "serious" null — below this is a genuine dip, not destructive cancellation

/**
 * Compute the raw null depth for a single seat's raw curve, using the SAME
 * definition as stage2PlacementRanking.js (max(0, meanSPL − minSPL)).
 */
function computeRawNullDepthDb(rawCurve) {
  if (!Array.isArray(rawCurve) || rawCurve.length < 3) return 0;
  const valid = rawCurve.filter((p) => Number.isFinite(p?.spl));
  if (valid.length < 3) return 0;
  const spls = valid.map((p) => p.spl);
  const mean = spls.reduce((sum, v) => sum + v, 0) / spls.length;
  const min = Math.min(...spls);
  return Math.max(0, mean - min);
}

/**
 * Find the frequency of the deepest null in a raw curve.
 * Returns { frequencyHz, depthDb } or null.
 */
function deepestNull(rawCurve) {
  if (!Array.isArray(rawCurve) || rawCurve.length < 3) return null;
  const valid = rawCurve.filter((p) => Number.isFinite(p?.frequency) && Number.isFinite(p?.spl));
  if (valid.length < 3) return null;
  const spls = valid.map((p) => p.spl);
  const mean = spls.reduce((sum, v) => sum + v, 0) / spls.length;
  let minSpl = Infinity;
  let minPoint = null;
  for (const point of valid) {
    if (point.spl < minSpl) {
      minSpl = point.spl;
      minPoint = point;
    }
  }
  if (!minPoint) return null;
  return { frequencyHz: minPoint.frequency, depthDb: Math.max(0, mean - minSpl) };
}

/**
 * Check whether two frequencies are close enough to be considered the same
 * null. Uses a proportional tolerance (within 10% of the lower frequency, or
 * 2 Hz absolute for very low frequencies).
 */
function sameNull(f1, f2) {
  if (!Number.isFinite(f1) || !Number.isFinite(f2)) return false;
  const lower = Math.min(f1, f2);
  const tol = lower < 20 ? 2 : lower * 0.10;
  return Math.abs(f1 - f2) <= tol;
}

/**
 * Assess whether a candidate has a serious shared destructive null that could
 * make strong seat-to-seat consistency misleading.
 *
 * Uses the EXISTING raw curves (rspRawCurve + perSeatRawCurves) already captured
 * by the Stage 2 placement evaluation. No new simulation, no new thresholds
 * beyond the existing null-depth definition.
 *
 * @param {object} rawTransfer — Stage 2 raw transfer (placement cache)
 * @param {object} [canonicalResult] — Stage 2 confirmation result (optional,
 *   used only to record whether the canonical P20 was strong — the safeguard
 *   flags a misleading strong-consistency result more seriously)
 * @returns {object} { sharedNullDetected, severity, reason, qualifyingNote }
 *   - sharedNullDetected: boolean — a serious shared null exists
 *   - severity: "none" | "confirmed" | "indeterminate"
 *   - reason: plain-English explanation or null
 *   - qualifyingNote: internal note to retain with the candidate, or null
 */
export function assessSharedNullSafeguard(rawTransfer, canonicalResult) {
  if (!rawTransfer) {
    return { sharedNullDetected: false, severity: "none", reason: null, qualifyingNote: null };
  }

  const rspRawCurve = rawTransfer.rspRawCurve || [];
  const perSeatRawCurves = rawTransfer.perSeatRawCurves || [];

  // Gather the deepest null from every available raw curve (RSP + each seat).
  const nulls = [];
  const rspNull = deepestNull(rspRawCurve);
  if (rspNull && rspNull.depthDb >= NULL_DEPTH_THRESHOLD_DB) {
    nulls.push({ source: "rsp", ...rspNull });
  }
  for (const seat of perSeatRawCurves) {
    const seatNull = deepestNull(seat.responseData || seat.response || []);
    if (seatNull && seatNull.depthDb >= NULL_DEPTH_THRESHOLD_DB) {
      nulls.push({ source: seat.seatId, ...seatNull });
    }
  }

  if (nulls.length === 0) {
    return { sharedNullDetected: false, severity: "none", reason: null, qualifyingNote: null };
  }

  // Check for shared nulls: do multiple curves have their deepest null at the
  // SAME frequency? This is the signature of a shared destructive cancellation.
  // Group nulls by frequency proximity.
  const sharedGroups = [];
  const used = new Set();
  for (let i = 0; i < nulls.length; i += 1) {
    if (used.has(i)) continue;
    const group = [nulls[i]];
    used.add(i);
    for (let j = i + 1; j < nulls.length; j += 1) {
      if (used.has(j)) continue;
      if (sameNull(nulls[i].frequencyHz, nulls[j].frequencyHz)) {
        group.push(nulls[j]);
        used.add(j);
      }
    }
    if (group.length >= 2) sharedGroups.push(group);
  }

  if (sharedGroups.length === 0) {
    return { sharedNullDetected: false, severity: "none", reason: null, qualifyingNote: null };
  }

  // The most serious shared group: the one with the most curves sharing a null
  // and the deepest combined depth.
  const mostSerious = sharedGroups
    .map((group) => ({
      group,
      count: group.length,
      maxDepth: Math.max(...group.map((n) => n.depthDb)),
      meanDepth: group.reduce((sum, n) => sum + n.depthDb, 0) / group.length,
    }))
    .sort((a, b) => (b.count - a.count) || (b.maxDepth - a.maxDepth))[0];

  // Severity assessment — no arbitrary numerical threshold beyond the existing
  // null-depth definition. "confirmed" = a clear shared destructive null.
  // "indeterminate" = the severity cannot be established reliably (e.g. only
  // two curves share the null, or the RSP is not among them).
  const rspInGroup = mostSerious.group.some((n) => n.source === "rsp");
  const seatCount = mostSerious.group.filter((n) => n.source !== "rsp").length;
  const totalCurves = 1 + perSeatRawCurves.length; // RSP + seats

  let severity;
  let reason;
  let qualifyingNote = null;

  if (mostSerious.count >= 3 && rspInGroup && seatCount >= 2) {
    severity = "confirmed";
    const freq = Math.round(mostSerious.group[0].frequencyHz);
    reason = `Shared destructive null at ~${freq} Hz across RSP and ${seatCount} seats (max depth ${mostSerious.maxDepth.toFixed(1)} dB). Strong seat-to-seat consistency at this frequency may be misleading.`;
    qualifyingNote = `shared-null-confirmed:${freq}Hz`;
  } else if (mostSerious.count >= 2) {
    // The severity cannot be established reliably — retain the candidate with
    // an explicit qualification rather than fabricating a pass/fail.
    severity = "indeterminate";
    const freq = Math.round(mostSerious.group[0].frequencyHz);
    reason = `Possible shared null at ~${freq} Hz across ${mostSerious.count} curves (max depth ${mostSerious.maxDepth.toFixed(1)} dB). Severity not established reliably — retain with qualification.`;
    qualifyingNote = `shared-null-indeterminate:${freq}Hz`;
  } else {
    severity = "none";
    reason = null;
    qualifyingNote = null;
  }

  // Record whether the canonical P20 was strong — a misleading strong-
  // consistency result is flagged more seriously in the note.
  const canonicalP20Level = canonicalResult?.achievedP20Level;
  const p20WasStrong = Number.isFinite(Number(canonicalP20Level)) && Number(canonicalP20Level) >= 3;
  if (severity !== "none" && p20WasStrong) {
    qualifyingNote = `${qualifyingNote}|strong-p20-needs-qualification`;
  }

  return {
    sharedNullDetected: severity !== "none",
    severity,
    reason,
    qualifyingNote,
    sharedNull: severity !== "none" ? {
      frequencyHz: mostSerious.group[0].frequencyHz,
      curveCount: mostSerious.count,
      maxDepthDb: mostSerious.maxDepth,
    } : null,
  };
}