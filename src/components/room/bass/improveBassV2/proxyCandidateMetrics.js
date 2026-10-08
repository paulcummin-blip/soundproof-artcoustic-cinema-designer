// proxyCandidateMetrics.js
// ---------------------------------------------------------------------------
// The challenger PROXY metrics, under names that state what each one measures.
//
// These are cheap recombined-response diagnostics. They decide only which
// challengers are worth CANONICAL confirmation — they are never P19 or P20:
//
//   proxyRspRange        worst-to-best SPL range of the RSP response
//                        → stands in for the RSP response-vs-target objective
//                          (canonical P19)
//   proxyWorstSeatRange  worst real seat's worst-to-best range
//                        → stands in for seat-to-seat consistency
//                          (canonical P20)
//   proxyAllSeatRange    mean real-seat range
//                        → broad all-seat indicator for the same objective
//   proxyBalancedRange   max(proxyRspRange, proxyWorstSeatRange)
//
// The previous names were inverted — `proxyP19` held the WORST-SEAT range and
// `proxyP20` held the RSP range — so promotion read the wrong metric for each
// objective. Nothing here is a P19/P20 grade, and nothing here changes scoring.
//
// Pure: no React, no side effects.
// ---------------------------------------------------------------------------

import { resumWithTuning } from "../stage2/stage2TuningSearch.js";

export const PROXY_BAND_MIN_HZ = 20;
export const PROXY_BAND_MAX_HZ = 120;

export function emptyProxyCandidateMetrics() {
  return {
    proxyRspRange: Infinity,
    proxyWorstSeatRange: Infinity,
    proxyAllSeatRange: Infinity,
    proxyBalancedRange: Infinity,
  };
}

/**
 * Score one tuning against a candidate's zero-tuning per-source per-seat
 * complex transfers. Lower is better for every returned metric.
 */
export function computeProxyCandidateMetrics(rawTransfer, tuning) {
  const empty = emptyProxyCandidateMetrics();
  if (!rawTransfer?.perSourcePerSeatComplexTransfers?.length) return empty;
  if (!Array.isArray(tuning) || !tuning.length) return empty;

  const seatIds = rawTransfer.seatIds || [];
  if (!seatIds.length) return empty;

  const seatResponses = resumWithTuning(
    rawTransfer.perSourcePerSeatComplexTransfers,
    tuning,
    seatIds,
  );

  const realSeatRanges = [];
  let rspRange = Infinity;

  for (const seatId of seatIds) {
    const response = seatResponses[seatId];
    if (!response?.freqsHz?.length) continue;

    const spls = [];
    for (let i = 0; i < response.freqsHz.length; i++) {
      const freq = response.freqsHz[i];
      if (freq >= PROXY_BAND_MIN_HZ && freq <= PROXY_BAND_MAX_HZ
        && Number.isFinite(response.splDb[i])) {
        spls.push(response.splDb[i]);
      }
    }
    if (!spls.length) continue;

    const range = Math.max(...spls) - Math.min(...spls);
    if (seatId === "rsp") rspRange = range;
    else realSeatRanges.push(range);
  }

  const worstSeatRange = realSeatRanges.length ? Math.max(...realSeatRanges) : Infinity;
  const allSeatRange = realSeatRanges.length
    ? realSeatRanges.reduce((sum, value) => sum + value, 0) / realSeatRanges.length
    : Infinity;
  // A design with no real seats yet still gets an RSP reading rather than none.
  const rsp = Number.isFinite(rspRange) ? rspRange : worstSeatRange;

  return {
    proxyRspRange: rsp,
    proxyWorstSeatRange: worstSeatRange,
    proxyAllSeatRange: allSeatRange,
    proxyBalancedRange: Math.max(rsp, worstSeatRange),
  };
}

/**
 * Read proxy metrics from a stored proxyResult. Old field names are read only
 * as a compatibility fallback for objects captured before this change.
 */
export function readProxyCandidateMetrics(proxyResult) {
  if (!proxyResult) return emptyProxyCandidateMetrics();
  // Legacy: proxyP20 held the RSP range, proxyP19 held the worst-seat range.
  const rsp = proxyResult.proxyRspRange ?? proxyResult.proxyP20 ?? Infinity;
  const worst = proxyResult.proxyWorstSeatRange ?? proxyResult.proxyP19 ?? Infinity;
  return {
    proxyRspRange: rsp,
    proxyWorstSeatRange: worst,
    proxyAllSeatRange: proxyResult.proxyAllSeatRange ?? (Number.isFinite(worst) ? worst : Infinity),
    proxyBalancedRange: proxyResult.proxyBalancedRange
      ?? proxyResult.proxyBalanced
      ?? Math.max(rsp, worst),
  };
}

/** Deterministic minimum: lowest metric, then candidate id. */
function pickMinimum(list, key) {
  return list.reduce((best, candidate) => {
    if (!best) return candidate;
    const a = candidate[key], b = best[key];
    if (a < b) return candidate;
    if (a === b && String(candidate.id) < String(best.id)) return candidate;
    return best;
  }, null);
}

/**
 * Promote challengers into canonical confirmation.
 *
 * Each objective gets the candidate its OWN proxy favours — the RSP-range
 * proxy promotes the likely best P19 candidate, the worst-seat proxy promotes
 * the likely best P20 candidate, and the balanced proxy promotes a compromise.
 * The inverted pairing (RSP metric feeding the P20 slot) is gone.
 *
 * @param {Array} candidates - challengers carrying proxyResult
 * @param {number} maxChallengers
 * @returns {Array} promoted challengers, each carrying the four proxy metrics
 */
export function promoteProxyChallengers(candidates, maxChallengers) {
  const challengers = (candidates || [])
    .filter((candidate) => !candidate.isCurrent && candidate.proxyResult)
    .map((candidate) => ({ ...candidate, ...readProxyCandidateMetrics(candidate.proxyResult) }));

  if (!challengers.length) return [];

  const promoted = [];
  const promotedIds = new Set();

  function tryAdd(candidate) {
    if (!candidate || promotedIds.has(candidate.id)) return false;
    if (promoted.length >= maxChallengers) return false;
    promoted.push(candidate);
    promotedIds.add(candidate.id);
    return true;
  }

  // 1. Likely best P19 — RSP response flatness.
  tryAdd(pickMinimum(challengers, "proxyRspRange"));
  // 2. Likely best P20 — worst-seat response flatness (seat consistency).
  tryAdd(pickMinimum(challengers, "proxyWorstSeatRange"));
  // 3. Balanced compromise.
  tryAdd(pickMinimum(challengers, "proxyBalancedRange"));

  // 4. Family diversity, then best balanced fill.
  const seenFamilies = new Set(promoted.map((entry) => entry.finalist?.familyId));
  const byFamilyDiversity = [...challengers]
    .filter((candidate) => !promotedIds.has(candidate.id))
    .sort((a, b) => a.proxyBalancedRange - b.proxyBalancedRange);
  for (const challenger of byFamilyDiversity) {
    if (promoted.length >= maxChallengers) break;
    const family = challenger.finalist?.familyId || "unknown";
    if (!seenFamilies.has(family)) {
      tryAdd(challenger);
      seenFamilies.add(family);
    }
  }

  if (promoted.length < maxChallengers) {
    const remaining = challengers
      .filter((candidate) => !promotedIds.has(candidate.id))
      .sort((a, b) => a.proxyBalancedRange - b.proxyBalancedRange);
    for (const challenger of remaining) {
      if (promoted.length >= maxChallengers) break;
      tryAdd(challenger);
    }
  }

  return promoted;
}