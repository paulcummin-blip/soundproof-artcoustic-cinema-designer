// stage2ConfirmationCoverage.js
// ---------------------------------------------------------------------------
// Validates that a saved Stage 2 cache carries the confirmation coverage
// required by the current front/rear coverage safeguard policy.
//
// The safeguard (stage2PlacementStore.startConfirmationForQuantity) requires
// that when the leading raw (placement-ranked) candidate uses a side/mixed-
// wall family, the best already-evaluated, physically feasible front/rear-wall
// candidate also receives canonical confirmation — even without a raw tie. A
// saved cache produced BEFORE the safeguard may have a side/mixed winner with
// zero front/rear canonical receipts (Room B: RP22_G winner, five G
// confirmations, no RP22_F confirmation). Under the current policy that saved
// result is INCOMPLETE and must not be hydrated as a fully current
// recommendation.
//
// This check mirrors the safeguard's decision using ONLY persisted evidence:
//   - raw_transfers (placement-phase results, P14-independent) → reconstruct
//     placement ranking tuples (buildPlacementRankingTuple) to identify the
//     raw winner and the best feasible front/rear alternative, exactly as
//     startConfirmationForQuantity does over its in-memory placementResults.
//   - *_sub_result.evaluatedFinalists + rejectedCandidates (canonical
//     confirmation receipts) → verify the front/rear candidate received a
//     canonical confirmation receipt, by finalistId. Both successful and
//     physically-rejected receipts count: a rejected receipt means the
//     candidate DID receive canonical processing (the worker ran) and the
//     eligibility authority correctly excludes it from the recommendation.
//     Only a candidate with ZERO receipts is a coverage gap.
//
// No acoustic simulation, no RP22 scoring, no candidate generation, no ranking
// maths. Pure evidence inspection. A cache with no raw_transfers cannot be
// coverage-checked (the raw winner cannot be reconstructed) and is reported as
// complete so a pre-raw-transfer cache is not falsely rejected on coverage
// grounds — the existing identity/version/fingerprint checks remain its gate.
//
// Limitation (targeted continuation): when a gap is found, the existing
// controller architecture does not support restoring a saved result's
// completed confirmations into a fresh run so that ONLY the missing
// confirmations are scheduled. The hook therefore falls through to a fresh
// schedule() which reuses the cached raw transfers (no Stage 1 / physical
// placement rerun) and re-runs the safeguard's confirmation set (best +
// front/rear + tie alternate). This is the documented broader-rerun fallback.
// ---------------------------------------------------------------------------

import { buildPlacementRankingTuple, comparePlacementResults } from "./stage2PlacementRanking";
import { isSideOrMixedWallFamily } from "./stage2PracticalPlacementPreference";

const QUANTITY_KEYS = [
  [1, "one_sub_result"],
  [2, "two_sub_result"],
  [3, "three_sub_result"],
  [4, "four_sub_result"],
];

/**
 * Collect raw transfers for a quantity from the persisted raw_transfers map.
 * @private
 */
function rawTransfersForQuantity(rawTransfers, qty) {
  if (!rawTransfers || typeof rawTransfers !== "object") return [];
  const out = [];
  for (const rt of Object.values(rawTransfers)) {
    if (rt && Number(rt.quantity) === Number(qty)) out.push(rt);
  }
  return out;
}

/**
 * Build placement-result entries (with placementRanking) for a quantity from
 * persisted raw transfers, mirroring startConfirmationForQuantity's input.
 * Only transfers with a finalistId and familyId are usable for the safeguard
 * decision. @private
 */
function buildPlacementEntries(rawTransfers, qty) {
  const transfers = rawTransfersForQuantity(rawTransfers, qty);
  return transfers
    .map((rt) => {
      const seatPriorityMap = new Map(Array.isArray(rt.seatPriorityMap) ? rt.seatPriorityMap : []);
      const placementRanking = buildPlacementRankingTuple(rt, seatPriorityMap);
      return { finalistId: rt.finalistId, rawTransfer: rt, placementRanking };
    })
    .filter((p) => p.finalistId && p.rawTransfer?.familyId);
}

/**
 * Set of finalistIds that received a canonical confirmation receipt (success
 * OR physical rejection) for a quantity, from the saved snapshot. A receipt
 * means the worker ran a confirmation job for that finalistId. @private
 */
function confirmationReceiptIds(quantitySnapshot) {
  const ids = new Set();
  if (!quantitySnapshot) return ids;
  const evaluated = [
    ...(Array.isArray(quantitySnapshot.evaluatedFinalists) ? quantitySnapshot.evaluatedFinalists : []),
    ...(Array.isArray(quantitySnapshot.rejectedCandidates) ? quantitySnapshot.rejectedCandidates : []),
  ];
  for (const r of evaluated) {
    if (r && r.finalistId) ids.add(String(r.finalistId));
  }
  return ids;
}

/**
 * Determine the confirmation coverage gaps for a hydrated Stage 2 cache.
 *
 * For each quantity that has a saved result, mirrors the safeguard decision:
 * if the raw (placement-ranked) winner is side/mixed and a feasible front/rear
 * candidate exists among the persisted placements, the front/rear candidate
 * must have a canonical confirmation receipt in the saved snapshot. A missing
 * receipt is a coverage gap — the saved result is incomplete under the current
 * policy.
 *
 * @param {object} hydrated — hydrated Stage 2 cache (from hydrateStage2PlacementCache)
 * @returns {{ complete: boolean, gaps: Record<number, {qty:number, missingFinalistId:string, familyId:string}> }}
 *   complete = true when no coverage gaps exist (or none can be determined
 *   because raw_transfers is absent).
 */
export function getStage2ConfirmationCoverageGaps(hydrated) {
  const gaps = {};
  if (!hydrated) return { complete: true, gaps };

  const rawTransfers = hydrated.raw_transfers || null;
  // Without persisted raw transfers the raw winner cannot be reconstructed.
  // Do not falsely reject a pre-raw-transfer cache on coverage grounds — the
  // existing identity/version/fingerprint checks remain its gate.
  if (!rawTransfers || typeof rawTransfers !== "object") {
    return { complete: true, gaps };
  }

  for (const [qty, key] of QUANTITY_KEYS) {
    const snapshot = hydrated[key];
    if (!snapshot) continue; // no saved result for this quantity — not requested

    const placements = buildPlacementEntries(rawTransfers, qty);
    if (placements.length === 0) continue; // no placement evidence — cannot check

    const ranked = [...placements].sort(comparePlacementResults);
    const best = ranked[0];
    if (!best) continue;

    const bestIsSideMixed = isSideOrMixedWallFamily(best.rawTransfer?.familyId);
    if (!bestIsSideMixed) continue; // safeguard does not apply

    const frontRear = ranked.find((p) =>
      p !== best && !isSideOrMixedWallFamily(p.rawTransfer?.familyId)) || null;
    if (!frontRear) continue; // no feasible front/rear alternative — fallback stands

    const receiptIds = confirmationReceiptIds(snapshot);
    if (!receiptIds.has(String(frontRear.finalistId))) {
      gaps[qty] = {
        qty,
        missingFinalistId: String(frontRear.finalistId),
        familyId: frontRear.rawTransfer?.familyId || null,
      };
    }
  }

  return { complete: Object.keys(gaps).length === 0, gaps };
}

/**
 * Convenience: true when the hydrated cache has full confirmation coverage
 * (no gap for any quantity with a saved result).
 */
export function hasStage2ConfirmationCoverage(hydrated) {
  return getStage2ConfirmationCoverageGaps(hydrated).complete;
}