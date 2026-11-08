// stage2PracticalPlacementPreference.js
// ---------------------------------------------------------------------------
// Practical placement preference at the FINAL recommendation selection
// boundary, applied AFTER canonical engineering evaluation.
//
// Product policy: the default recommended arrangement for each quantity is the
// best physically feasible FRONT/REAR-wall arrangement. A side-wall or
// mixed-wall arrangement must not displace a conventional front/rear candidate
// solely because it ranks slightly better numerically (e.g. a within-Level
// floored-dB difference). It may displace it only when EXISTING authoritative
// engineering evidence establishes a compelling benefit that justifies the
// installation compromise.
//
// This module changes NO acoustic physics, NO RP22 scoring, NO Stage 1/2
// candidate generation, NO tuning and NO ranking maths. It only chooses which
// already-ranked finalist becomes the recommendation. The canonical acoustic
// ranking (compareStage2Results) is reused unchanged; the evaluated-finalist
// list and every candidate's P19/P20 evidence are preserved verbatim.
//
// Compelling benefit (existing evidence only — no new grade, no fixed dB
// threshold, no weighted score):
//   (a) A whole Primary P20 Performance Level improvement over the best
//       front/rear candidate, with no P19 RSP Level regression; OR
//   (b) A whole P19 RSP Performance Level improvement, with no Primary P20
//       Level regression; OR
//   (c) The conventional candidate carries a CONFIRMED shared destructive
//       null (existing sharedNullSafeguard severity "confirmed") and the
//       side/mixed candidate does NOT — the side/mixed resolves a serious
//       shared-null problem. Best-effort: only when raw transfers are
//       available from the caller.
//
// If no viable front/rear candidate exists, the existing acoustic winner
// stands (the fallback may consider side walls).
// ---------------------------------------------------------------------------

import { FAMILY_IDS } from "../stage1/stage1FamilyRegistry.js";
import { compareStage2Results } from "./stage2Ranking.js";
import { assessSharedNullSafeguard } from "./sharedNullSafeguard.js";

// Families whose canonical seed places one or more sources on a SIDE wall
// (xNorm ∈ {0,1}, yNorm strictly between 0 and 1) or mixes side-wall sources
// with front/rear-wall sources. These are the only families the practical
// preference ever defers; every other family (front/rear wall, corners,
// three-sub front/rear topologies, custom boundary) is conventional.
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
 * Decide whether a side/mixed candidate has a compelling engineering benefit
 * over the best conventional (front/rear) candidate, using ONLY existing
 * authoritative P19/P20 Levels and the existing shared-null safeguard.
 *
 * @private
 * @param {object} sideMixed — side/mixed-wall candidate result
 * @param {object} conventional — front/rear candidate result
 * @param {function|null} getRawTransfer — (result) => rawTransfer | null
 * @returns {boolean}
 */
function hasCompellingBenefit(sideMixed, conventional, getRawTransfer) {
  const sP19 = rspP19Level(sideMixed);
  const cP19 = rspP19Level(conventional);
  const sPrimP20 = worstPrimaryP20Level(sideMixed);
  const cPrimP20 = worstPrimaryP20Level(conventional);

  // (a) Whole Primary P20 Level improvement, no P19 RSP regression.
  if (sPrimP20 != null && cPrimP20 != null && sPrimP20 > cPrimP20) {
    if (sP19 == null || cP19 == null || sP19 >= cP19) return true;
  }
  // (b) Whole P19 RSP Level improvement, no Primary P20 regression.
  if (sP19 != null && cP19 != null && sP19 > cP19) {
    if (sPrimP20 == null || cPrimP20 == null || sPrimP20 >= cPrimP20) return true;
  }
  // (c) Confirmed shared-null resolution (best-effort, existing safeguard).
  if (getRawTransfer) {
    try {
      const convRaw = getRawTransfer(conventional);
      const sideRaw = getRawTransfer(sideMixed);
      if (convRaw && sideRaw) {
        const convNull = assessSharedNullSafeguard(convRaw, conventional);
        const sideNull = assessSharedNullSafeguard(sideRaw, sideMixed);
        if (convNull?.severity === "confirmed" && sideNull?.severity !== "confirmed") {
          return true;
        }
      }
    } catch {
      // Shared-null assessment is best-effort: unavailable evidence never
      // blocks the default front/rear preference.
    }
  }
  return false;
}

/**
 * Practical placement preference at the final recommendation selection
 * boundary, applied AFTER canonical ranking.
 *
 * Default: select the best physically feasible front/rear-wall arrangement.
 * A side/mixed-wall arrangement may displace it only when existing
 * engineering evidence establishes a compelling benefit.
 *
 * The canonical acoustic ranking is reused unchanged: `ranked` is already
 * sorted by compareStage2Results. The returned candidate is always a member
 * of `ranked`, so the evaluated-finalist list and every candidate's evidence
 * are preserved.
 *
 * @param {Array} ranked — results already sorted by compareStage2Results
 * @param {object} [opts]
 * @param {function} [opts.getRawTransfer] — (result) => rawTransfer | null
 *   Best-effort accessor for the cached placement raw transfer, used only for
 *   the shared-null exception. Null/omitted = shared-null evidence unavailable.
 * @returns {object|null} the policy-selected best finalist
 */
export function selectPracticalBest(ranked, opts = {}) {
  if (!Array.isArray(ranked) || !ranked.length) return null;
  const getRawTransfer = typeof opts.getRawTransfer === "function" ? opts.getRawTransfer : null;

  const bestConventional = ranked.find((r) => !isSideOrMixedWallFamily(r?.familyId)) || null;
  const bestSideMixed = ranked.find((r) => isSideOrMixedWallFamily(r?.familyId)) || null;

  // No conventional front/rear candidate — keep the existing acoustic winner
  // (the fallback may consider side walls, with no invented compliance claim).
  if (!bestConventional) return ranked[0];
  // No side/mixed candidate — conventional wins by default.
  if (!bestSideMixed) return bestConventional;

  // If the conventional candidate already ranks higher or ties acoustically,
  // keep it — no within-Level numerical edge can displace it.
  if (compareStage2Results(bestSideMixed, bestConventional) >= 0) return bestConventional;

  // The side/mixed candidate ranks higher acoustically. Apply the
  // compelling-benefit exception before letting it displace the front/rear.
  if (hasCompellingBenefit(bestSideMixed, bestConventional, getRawTransfer)) {
    return bestSideMixed;
  }
  return bestConventional;
}