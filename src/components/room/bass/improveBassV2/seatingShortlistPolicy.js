// seatingShortlistPolicy.js
// Canonical seating shortlist policy — validated N=8 with grade-first
// canonical comparison and smaller-movement tie-break.
//
// The proxy is a PRUNING stage only. It ranks candidates and selects the
// top N for canonical confirmation. It must NOT publish the final winner.
// Final authority belongs to canonical confirmation.
//
// Policy:
//   1. Take the top 8 proxy candidates by proxy P19 (lower = better).
//   2. Canonically confirm all 8 (or fewer if fewer valid candidates exist).
//   3. Apply materiality gate (zero-fail-first: fail-count reduction is
//      always material; moved fails are not; blanket primary-seat regression
//      veto has been removed).
//   4. Zero-fail-first canonical ordering: failing-seat count first, then
//      primary-seat floor (worst-first), then raw margins.
//   6. Smaller-movement tie-break: when canonical outcomes are equivalent,
//      prefer the candidate with the smaller abs(seating offset).
//      Direction is irrelevant: -100 mm and +100 mm are equivalent magnitude.
//   7. Final fallback: stable candidate ID ordering.

import { isMaterialImprovement } from "./materialityGate.js";
import { compareZeroFailFirst } from "./zeroFailOptimiser.js";

export const SEATING_SHORTLIST_SIZE = 8;

/**
 * Select the top N proxy candidates by proxy P19 (lower = better).
 * If fewer than N valid candidates exist, return all available.
 * The offset=0 candidate is excluded by the caller (validCandidates filter).
 *
 * @param {Array} proxyResults - [{ offsetMm, proxyP19, proxyP20, ... }]
 * @param {number} n - shortlist size (default 8)
 * @returns {Array} top N candidates sorted by proxy P19 ascending
 */
export function selectSeatingShortlist(proxyResults, n = SEATING_SHORTLIST_SIZE) {
  const valid = (proxyResults || []).filter(
    (c) => c && Number.isFinite(c.proxyP19),
  );
  const sorted = [...valid].sort((a, b) => a.proxyP19 - b.proxyP19);
  return sorted.slice(0, Math.max(0, n));
}

/**
 * Compare two confirmed seating candidates for final winner selection.
 *
 * Zero-fail-first: failing-seat count compared first, then primary-seat
 * floor (worst-first), then raw margins (via compareZeroFailFirst).
 * Smaller-movement tie-break: prefer abs(offsetMm) when canonical
 * outcomes are equivalent. Direction-agnostic.
 * Final fallback: stable candidate ID.
 *
 * @param {object} a - { result, seatingOffsetMm, ... }
 * @param {object} b - { result, seatingOffsetMm, ... }
 * @returns {number} negative if a is better, positive if b is better
 */
export function compareSeatingCandidates(a, b) {
  const canonical = compareZeroFailFirst(a.result, b.result);
  if (Math.abs(canonical) > 1e-8) return canonical;

  // Smaller-movement tie-break (direction-agnostic)
  const aMovement = Math.abs(Number(a.seatingOffsetMm) || 0);
  const bMovement = Math.abs(Number(b.seatingOffsetMm) || 0);
  if (Math.abs(aMovement - bMovement) > 1e-8) return aMovement - bMovement;

  // Final fallback: stable candidate ID
  return String(a.result?.candidateId || "").localeCompare(
    String(b.result?.candidateId || ""),
  );
}

/**
 * Select the seating winner from canonically confirmed candidates.
 *
 * Applies in order:
 *   1. Materiality gate (zero-fail-first: isMaterialImprovement)
 *   2. Zero-fail-first canonical ordering (compareZeroFailFirst)
 *   3. Smaller-movement tie-break (abs(offsetMm), direction-agnostic)
 *   4. Stable candidate ID (final fallback)
 *
 * @param {Array} confirmedCandidates - [{ result, seatingOffsetMm, seatingPositions }]
 * @param {object} baseline - existing authority (Current control)
 * @returns {{ winner: object|null, evaluations: Array, ranked: Array }}
 */
export function selectSeatingWinner(confirmedCandidates, baseline) {
  if (!baseline) return { winner: null, evaluations: [], ranked: [] };

  const evaluations = [];
  const eligible = [];

  for (const candidate of confirmedCandidates || []) {
    if (!candidate?.result) continue;

    // Zero-fail-first: no blanket primary-seat regression veto.
    // Materiality gate handles fail-count reduction and moved-fail detection.
    // Materiality gate
    const materiality = isMaterialImprovement(baseline, candidate.result);
    evaluations.push({
      candidateId: candidate.result.candidateId,
      offsetMm: candidate.seatingOffsetMm,
      status: materiality.material ? "material" : "below-materiality",
      materiality,
    });

    if (materiality.material) {
      eligible.push(candidate);
    }
  }

  if (eligible.length === 0) {
    return { winner: null, evaluations, ranked: [] };
  }

  // Grade-first canonical ranking with smaller-movement tie-break
  const ranked = [...eligible].sort((a, b) => compareSeatingCandidates(a, b));

  return { winner: ranked[0], evaluations, ranked };
}