// adiShortlistSelection.js
// ---------------------------------------------------------------------------
// Global ADI Starting Layout shortlist.
//
// Pools eligible front/rear-wall candidates across the supported 1/2/4-sub
// quantities, ranks them GLOBALLY with the existing canonical Stage 2
// comparator, removes materially equivalent geometry, and returns up to three
// credible, materially distinct options — irrespective of quantity.
//
// Side-wall layouts are exceptional: they are considered only when fewer than
// three practical options exist AND the side/mixed candidate delivers an
// established whole-Level improvement over the best practical candidate
// globally, without regression in the other relevant Level. This reuses the
// existing `hasWholeLevelImprovement` qualification — no new dB threshold.
//
// READ-ONLY: reads Stage 2 canonical results and the design context. It
// evaluates nothing, recalculates nothing and changes no bass maths, no RP22
// scoring and no Apply authority. Every P19/P20 value comes from the
// candidate's own canonical evaluation at the active RSP and seating.
// ---------------------------------------------------------------------------

import { compareStage2Results } from "../stage2/stage2Ranking.js";
import {
  isSideOrMixedWallFamily,
  hasWholeLevelImprovement,
} from "../stage2/stage2PracticalPlacementPreference.js";
import { isCandidateEligibleForRecommendation } from "../stage2/stage2CandidateEligibility.js";
import {
  buildEvaluatedOption,
  buildImprovementDescription,
  buildCompromiseDescription,
} from "./evaluatedOptionPresentation.js";

const SHORTLIST_MAX = 3;
// Cabinet centres within 2 cm are materially equivalent — the same physical
// placement arrived at by different families. The canonical ranking already
// sorts best-first, so the first-seen equivalent wins.
const COORD_BUCKET_M = 0.02;

/**
 * Deterministic geometry key for material-equivalence deduplication.
 * Buckets cabinet centres to ~2 cm so near-identical placements collapse.
 * Different quantities naturally produce different keys (different coordinate
 * counts), so a 1-sub and 2-sub arrangement are never merged.
 * @private
 */
function geometryKey(result) {
  const coords = (Array.isArray(result?.coordinates) ? result.coordinates : [])
    .map((c) => ({
      x: Math.round(Number(c.x) / COORD_BUCKET_M),
      y: Math.round(Number(c.y) / COORD_BUCKET_M),
    }))
    .filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));
  if (!coords.length) return null;
  return coords.map((c) => `${c.x}:${c.y}`).sort().join("|");
}

function buildOption(result, seatPriorityMap, context, placementKind, runFingerprint) {
  const option = buildEvaluatedOption(result, seatPriorityMap, {
    ...context,
    placementKind,
  });
  if (!option) return null;
  option.fingerprint = runFingerprint || null;
  return option;
}

/**
 * Build the global ADI Starting Layout shortlist from a complete Stage 2 state.
 *
 * @param {object} stage2State — Stage 2 placement store state
 * @param {Map} seatPriorityMap — seatId → "primary" | "secondary"
 * @param {object} context — { roomDims, selectedSubModel, subwooferBottomHeightM }
 * @returns {object[]} up to three evaluated options (practical first, then
 *   qualifying side/mixed exceptions)
 */
export function buildAdiShortlist(stage2State, seatPriorityMap, context) {
  if (!stage2State || stage2State.status !== "complete") return [];
  const runFingerprint = stage2State.fingerprint || null;

  // Pool eligible ranked finalists across 1/2/4-sub quantities. The
  // evaluatedFinalists set is already the eligible, ranked pool per quantity
  // (stage2PlacementStore.buildCanonicalQuantitySnapshot).
  const buckets = [
    stage2State.one_sub_result,
    stage2State.two_sub_result,
    stage2State.four_sub_result,
  ];
  const pool = [];
  for (const bucket of buckets) {
    const ranked = Array.isArray(bucket?.evaluatedFinalists) ? bucket.evaluatedFinalists : [];
    for (const result of ranked) {
      if (!isCandidateEligibleForRecommendation(result)) continue;
      pool.push(result);
    }
  }
  if (!pool.length) return [];

  // Global canonical ranking — the same lexicographic comparator used by the
  // Stage 2 overall-best rule. P14 is a necessary constraint: only eligible
  // candidates (requestedP14Pass !== false) reached this pool.
  const globallyRanked = [...pool].sort(compareStage2Results);

  const practicalRanked = globallyRanked.filter((r) => !isSideOrMixedWallFamily(r.familyId));
  const sideMixedRanked = globallyRanked.filter((r) => isSideOrMixedWallFamily(r.familyId));

  const seenGeometry = new Set();
  const shortlist = [];

  // Practical front/rear candidates first — globally ranked, deduped by
  // materially equivalent geometry. Cabinets are physically against the
  // front/rear walls (Stage 2 resolved cabinet centres from wall references).
  for (const result of practicalRanked) {
    if (shortlist.length >= SHORTLIST_MAX) break;
    const key = geometryKey(result);
    if (!key || seenGeometry.has(key)) continue;
    seenGeometry.add(key);
    const option = buildOption(result, seatPriorityMap, context, "practical", runFingerprint);
    if (!option) continue;
    shortlist.push(option);
  }

  // Exceptional side/mixed-wall candidates: only when fewer than three
  // practical options exist AND the candidate delivers a whole-Level
  // improvement over the best practical candidate GLOBALLY, without regression
  // in the other relevant Level. Reuses existing qualification — no new
  // threshold, no marginal improvement displacing a credible front/rear
  // solution.
  if (shortlist.length < SHORTLIST_MAX && practicalRanked.length > 0) {
    const bestPracticalResult = practicalRanked[0];
    const bestPracticalOption = shortlist[0] || null;
    for (const result of sideMixedRanked) {
      if (shortlist.length >= SHORTLIST_MAX) break;
      const key = geometryKey(result);
      if (!key || seenGeometry.has(key)) continue;
      if (!hasWholeLevelImprovement(result, bestPracticalResult)) continue;
      seenGeometry.add(key);
      const option = buildOption(result, seatPriorityMap, context, "alternative", runFingerprint);
      if (!option) continue;
      if (bestPracticalOption) {
        option.improvement = buildImprovementDescription(option, bestPracticalOption);
        option.compromises = buildCompromiseDescription(option, bestPracticalOption);
      }
      shortlist.push(option);
    }
  }

  // No practical front/rear candidates exist at all: fall back to the global
  // acoustic winner so the designer is never left without a recommendation
  // when eligible candidates exist. The winner may be a side/mixed
  // arrangement — shown without an invented compliance claim.
  if (shortlist.length === 0) {
    for (const result of globallyRanked) {
      if (shortlist.length >= SHORTLIST_MAX) break;
      const key = geometryKey(result);
      if (!key || seenGeometry.has(key)) continue;
      seenGeometry.add(key);
      const option = buildOption(result, seatPriorityMap, context, "practical", runFingerprint);
      if (!option) continue;
      shortlist.push(option);
    }
  }

  return shortlist;
}