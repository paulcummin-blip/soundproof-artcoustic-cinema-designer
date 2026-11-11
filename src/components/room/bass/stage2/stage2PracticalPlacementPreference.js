// stage2PracticalPlacementPreference.js
// ---------------------------------------------------------------------------
// Practical placement preference + exceptional side/mixed-wall alternatives at
// the FINAL recommendation selection boundary, applied AFTER canonical
// engineering evaluation.
//
// Product policy:
//   - The normal recommendation for each quantity is the best physically
//     feasible FRONT/REAR-wall arrangement. A side/mixed-wall arrangement NEVER
//     displaces it as the recommendation, regardless of any raw numerical
//     advantage. The practical front/rear option is always visible.
//   - A side/mixed-wall arrangement may be presented as an ADDITIONAL
//     "Alternative placement" card only when EXISTING authoritative engineering
//     evidence establishes an actual improvement in a displayed Sound Proof
//     P19 RSP or Primary P20 Performance Level, with no regression in the
//     other relevant Level. An improvement affecting only Secondary seating
//     never qualifies on its own.
//
// This module changes NO acoustic physics, NO RP22 scoring, NO Stage 1/2
// candidate generation, NO tuning and NO ranking maths. It only chooses which
// already-ranked finalists become the normal recommendation and the optional
// alternatives. The canonical acoustic ranking (compareStage2Results) is reused
// unchanged; the evaluated-finalist list and every candidate's P19/P20
// evidence are preserved verbatim.
//
// Uses the existing Sound Proof whole-number, round-down grading convention —
// the Levels already stamped on each Stage 2 result. No new grade, no fixed dB
// threshold, no weighted score.
// ---------------------------------------------------------------------------

import { FAMILY_IDS } from "../stage1/stage1FamilyRegistry.js";
import { buildOverlapSources } from "./physicalCandidateGeometry.js";
import { WALL_BUFFER_M } from "@/components/utils/subwooferInstanceMigration";

// Families whose canonical seed places one or more sources on a SIDE wall
// (xNorm ∈ {0,1}, yNorm strictly between 0 and 1) or mixes side-wall sources
// with front/rear-wall sources. These are the only families ever considered as
// exceptional alternatives; every other family is conventional.
const SIDE_OR_MIXED_FAMILY_IDS = new Set([
  FAMILY_IDS.ONE_SIDE_QUARTER,
  FAMILY_IDS.RP22_G,            // left/right wall midpoints
  FAMILY_IDS.RP22_D,            // side-wall quarter positions
  FAMILY_IDS.RP22_B_LAST_RESORT, // four wall midpoints (front + rear + side)
]);

/**
 * Whether a family places subwoofers on a side wall or mixes side-wall with
 * front/rear-wall sources. Conventional front/rear, corner, three-sub and
 * custom-boundary families return false.
 */
export function isSideOrMixedWallFamily(familyId) {
  return SIDE_OR_MIXED_FAMILY_IDS.has(familyId);
}

/**
 * Worst (minimum) P20 Performance Level among PRIMARY seats, read from the
 * existing ranking summary. Null when no primary seats are present.
 * @private
 */
function worstPrimaryP20Level(result) {
  const seats = result?.rankingData?.primarySummary?.seats;
  if (!Array.isArray(seats) || !seats.length) return null;
  let worst = Infinity;
  for (const seat of seats) {
    const level = Number(seat?.p20Level);
    if (Number.isFinite(level) && level < worst) worst = level;
  }
  return Number.isFinite(worst) ? worst : null;
}

/**
 * The authoritative RSP P19 Performance Level (one aggregate result).
 * @private
 */
function rspP19Level(result) {
  const level = Number(result?.achievedP19Level);
  return Number.isFinite(level) ? level : null;
}

/**
 * Decide whether a side/mixed candidate has a whole-Level improvement over
 * the practical (front/rear) candidate, with no regression in the other
 * relevant Level. Primary-weighted: a Secondary-only improvement never
 * qualifies.
 *
 * Qualifying improvements (existing stamped Levels only):
 *   (a) A whole Primary P20 Performance Level improvement, with no P19 RSP
 *       Level regression; OR
 *   (b) A whole P19 RSP Performance Level improvement, with no Primary P20
 *       Level regression.
 *
 * @private
 * @param {object} sideMixed — side/mixed-wall candidate result
 * @param {object} practical — practical front/rear candidate result
 * @returns {boolean}
 */
export function hasWholeLevelImprovement(sideMixed, practical) {
  const sP19 = rspP19Level(sideMixed);
  const cP19 = rspP19Level(practical);
  const sPrimP20 = worstPrimaryP20Level(sideMixed);
  const cPrimP20 = worstPrimaryP20Level(practical);

  // Need at least one Level pair to compare; if both are missing, no
  // evidence-based improvement can be established.
  if ((sP19 == null || cP19 == null) && (sPrimP20 == null || cPrimP20 == null)) {
    return false;
  }

  // (a) Whole Primary P20 Level improvement, no P19 RSP regression.
  if (sPrimP20 != null && cPrimP20 != null && sPrimP20 > cPrimP20) {
    if (sP19 == null || cP19 == null || sP19 >= cP19) return true;
  }
  // (b) Whole P19 RSP Level improvement, no Primary P20 regression.
  if (sP19 != null && cP19 != null && sP19 > cP19) {
    if (sPrimP20 == null || cPrimP20 == null || sPrimP20 >= cPrimP20) return true;
  }
  return false;
}

/**
 * Practical placement preference at the final recommendation selection
 * boundary, applied AFTER canonical ranking.
 *
 * Always returns the best physically feasible front/rear-wall arrangement.
 * A side/mixed-wall arrangement never displaces it. When no conventional
 * candidate exists, the existing acoustic winner stands (the fallback may be
 * a side-wall arrangement, with no invented compliance claim).
 *
 * The canonical acoustic ranking is reused unchanged: `ranked` is already
 * sorted by compareStage2Results. The returned candidate is always a member
 * of `ranked`, so the evaluated-finalist list and every candidate's evidence
 * are preserved.
 *
 * @param {Array} ranked — results already sorted by compareStage2Results
 * @param {object} [_opts] — reserved (ignored); kept for call-site stability
 * @returns {object|null} the practical best finalist
 */
export function selectPracticalBest(ranked, _opts = {}) {
  if (!Array.isArray(ranked) || !ranked.length) return null;
  const bestConventional = ranked.find((r) => !isSideOrMixedWallFamily(r?.familyId)) || null;
  if (bestConventional) return bestConventional;
  // No conventional front/rear candidate — keep the existing acoustic winner.
  return ranked[0];
}

/**
 * Select qualifying exceptional side/mixed-wall alternatives for a quantity,
 * relative to the practical best. An alternative qualifies only when it
 * delivers an actual whole-Level improvement in P19 RSP or Primary P20, with
 * no regression in the other relevant Level. Secondary-only improvements do
 * not qualify.
 *
 * `ranked` is the eligible, ranked evaluated-finalist set for the quantity
 * (already filtered and sorted by the shared Stage 2 authority). The
 * practical best is excluded. Results are returned in ranked order (best
 * first), deduplicated by finalistId so no duplicate or near-identical
 * alternative is surfaced. No new acoustic work, no new grade — only the
 * existing stamped Levels are compared.
 *
 * @param {Array} ranked — eligible ranked finalists for the quantity
 * @param {object} practicalBest — the practical best finalist
 * @returns {Array} qualifying side/mixed alternatives (Stage 2 results)
 */
/**
 * Tolerance for how far a cabinet's near face may be from the expected wall
 * buffer (WALL_BUFFER_M = 10 mm) and still count as wall-mounted. Generous
 * enough to accept the placement guide's resolved wall-reference positions
 * (whose near face sits exactly at WALL_BUFFER_M), tight enough to reject an
 * inset cabinet whose face is hundreds of millimetres from the wall.
 * @private
 */
const WALL_CONTACT_TOLERANCE_M = 0.05;

/**
 * Classify a Stage 2 candidate as a PRACTICAL front/rear-wall installation by
 * inspecting its ACTUAL cabinet footprint — not its family name.
 *
 * A cabinet is wall-mounted on the front or rear wall only when its near face
 * (centre minus the orientation-adjusted half-extent along Y) sits at
 * approximately WALL_BUFFER_M from that wall. A cabinet whose face is inset
 * (e.g. ~390 mm from the wall) is NOT a practical wall-contact installation,
 * regardless of its RP22 family name or which half of the room it sits in.
 *
 * Every cabinet in the arrangement must be against a front or rear wall for
 * the placement to count as practical. A side-wall or mid-room cabinet fails.
 *
 * This reuses the existing cabinet geometry resolution
 * (physicalCandidateGeometry.buildOverlapSources) and the existing wall
 * buffer constant — no new geometry calculation, no acoustic maths, no RP22
 * scoring. It only classifies what the shortlist presents as "practical".
 *
 * @param {object} result — Stage 2 canonical finalist result
 * @param {object} context — { roomDims, selectedSubModel, subwooferBottomHeightM }
 * @returns {boolean} true when every cabinet is against a front or rear wall
 */
export function isPracticalWallContactPlacement(result, context) {
  const coords = Array.isArray(result?.coordinates) ? result.coordinates : [];
  if (!coords.length) return false;
  const roomDims = context?.roomDims || null;
  const W = Number(roomDims?.widthM);
  const L = Number(roomDims?.lengthM);
  if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(L) || L <= 0) return false;
  const model = result?.selectedProduct || context?.selectedSubModel || null;
  if (!model) return false;

  const { sources, dimensionsResolved } = buildOverlapSources({
    coordinates: coords,
    model,
    roomDims,
    bottomHeightM: Number.isFinite(Number(context?.subwooferBottomHeightM))
      ? Number(context.subwooferBottomHeightM) : 0,
  });
  if (!dimensionsResolved || sources.length !== coords.length) return false;

  for (const source of sources) {
    const y = Number(source.y);
    const halfY = Number(source.cabinetDepthM) / 2; // effective depth along Y
    if (!Number.isFinite(y) || !Number.isFinite(halfY) || halfY <= 0) return false;
    // Near-face distance from the front wall (y=0) and rear wall (y=L).
    const frontFaceDist = y - halfY;
    const rearFaceDist = L - y - halfY;
    const onFront = Math.abs(frontFaceDist - WALL_BUFFER_M) <= WALL_CONTACT_TOLERANCE_M;
    const onRear = Math.abs(rearFaceDist - WALL_BUFFER_M) <= WALL_CONTACT_TOLERANCE_M;
    if (!onFront && !onRear) return false; // not against a front or rear wall
  }
  return true;
}

export function selectQualifyingAlternatives(ranked, practicalBest) {
  if (!Array.isArray(ranked) || !ranked.length) return [];
  const practicalId = practicalBest?.finalistId || null;
  const seen = new Set();
  const out = [];
  for (const result of ranked) {
    if (!result) continue;
    if (practicalId && result.finalistId === practicalId) continue;
    if (!isSideOrMixedWallFamily(result.familyId)) continue;
    if (seen.has(result.finalistId)) continue;
    if (!hasWholeLevelImprovement(result, practicalBest)) continue;
    seen.add(result.finalistId);
    out.push(result);
  }
  return out;
}