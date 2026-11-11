// adiShortlistSelection.js
// ---------------------------------------------------------------------------
// Global ADI Starting Layout shortlist.
//
// Pools eligible candidates across the supported 1/2/4-sub quantities, ranks
// them GLOBALLY with the existing canonical Stage 2 comparator, removes
// materially equivalent geometry, and returns up to three credible, materially
// distinct options — irrespective of quantity.
//
// PRACTICAL CLASSIFICATION is derived from each candidate's ACTUAL cabinet
// footprint (isPracticalWallContactPlacement): a cabinet is a normal
// front/rear-wall installation only when its near face lies against the wall
// within the established placement tolerance. A family name alone never
// determines practicality — an inset RP22_E arrangement whose cabinet faces
// sit ~390 mm from the walls is NOT classified as practical, regardless of
// its family. Its valid acoustic evidence is preserved for diagnostic
// comparison (it may appear as an alternative when it qualifies).
//
// SIDE-WALL EXCEPTION ORDERING: a qualifying exceptional side/mixed/inset
// candidate is evaluated against the best practical candidate BEFORE the
// shortlist is filled, so it may displace a weaker practical option rather
// than being locked out by a three-practical shortlist. The existing
// whole-RP22-Level improvement requirement (hasWholeLevelImprovement) gates
// qualification — no new dB threshold. The global maximum of three cards and
// the preference for practical front/rear installations are preserved: a
// non-practical candidate that does NOT deliver a whole-Level improvement over
// the best practical never enters the shortlist.
//
// READ-ONLY: reads Stage 2 canonical results and the design context. It
// evaluates nothing, recalculates nothing and changes no bass maths, no RP22
// scoring and no Apply authority. Every P19/P20 value comes from the
// candidate's own canonical evaluation at the active RSP and seating.
// ---------------------------------------------------------------------------

import { compareStage2Results } from "../stage2/stage2Ranking.js";
import {
  hasWholeLevelImprovement,
  isPracticalWallContactPlacement,
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

// Dedup is tracked by TWO independent sets: material-equivalence geometry
// (bucketed cabinet centres) and candidate identity (finalistId). Two
// candidates sharing the same geometry are the same physical placement; two
// with the same finalistId are the same candidate. Either match deduplicates
// (the first-seen, best-ranked instance wins). Uses existing identity and
// geometry only — no new acoustic threshold.

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
 *   qualifying side/mixed/inset exceptions)
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

  // Classify practicality from ACTUAL cabinet wall-contact, not family name.
  const practicalRanked = globallyRanked.filter((r) => isPracticalWallContactPlacement(r, context));
  const nonPracticalRanked = globallyRanked.filter((r) => !isPracticalWallContactPlacement(r, context));

  // The best practical candidate is the reference for the whole-Level
  // improvement qualification. When no practical candidate exists, the global
  // acoustic winner stands (fallback below).
  const bestPracticalResult = practicalRanked[0] || null;

  const seenGeometry = new Set();
  const seenFinalistIds = new Set();
  const shortlist = [];

  // Walk the GLOBAL ranking (best-first). Practical candidates enter
  // directly; non-practical candidates enter ONLY when they deliver a
  // whole-Level improvement over the best practical candidate. This lets a
  // qualifying exceptional candidate displace a weaker practical option
  // (because it ranks higher globally) rather than being locked out by a
  // three-practical shortlist. The max-3 cap and the preference for practical
  // installations are preserved: a non-practical candidate without a
  // whole-Level improvement never enters.
  for (const result of globallyRanked) {
    if (shortlist.length >= SHORTLIST_MAX) break;
    const gKey = geometryKey(result);
    const finalistId = result?.finalistId || null;
    if (gKey && seenGeometry.has(gKey)) continue;
    if (finalistId && seenFinalistIds.has(finalistId)) continue;

    const isPractical = isPracticalWallContactPlacement(result, context);
    if (!isPractical) {
      // Non-practical (side/mixed/inset): qualify against the best practical.
      if (!bestPracticalResult) {
        // No practical candidate exists at all — the fallback path below
        // handles this. Skip non-practical here so the fallback owns it.
        continue;
      }
      if (!hasWholeLevelImprovement(result, bestPracticalResult)) continue;
    }

    if (gKey) seenGeometry.add(gKey);
    if (finalistId) seenFinalistIds.add(finalistId);
    const placementKind = isPractical ? "practical" : "alternative";
    const option = buildOption(result, seatPriorityMap, context, placementKind, runFingerprint);
    if (!option) continue;

    // For an alternative, attach the improvement/compromise description
    // relative to the best practical option (when one exists).
    if (!isPractical && bestPracticalResult) {
      const bestPracticalOption = buildOption(bestPracticalResult, seatPriorityMap, context, "practical", runFingerprint);
      if (bestPracticalOption) {
        option.improvement = buildImprovementDescription(option, bestPracticalOption);
        option.compromises = buildCompromiseDescription(option, bestPracticalOption);
      }
    }
    shortlist.push(option);
  }

  // No practical front/rear candidates exist at all: fall back to the global
  // acoustic winner so the designer is never left without a recommendation
  // when eligible candidates exist. The winner may be a side/mixed/inset
  // arrangement — shown without an invented compliance claim.
  if (shortlist.length === 0) {
    for (const result of globallyRanked) {
      if (shortlist.length >= SHORTLIST_MAX) break;
      const gKey = geometryKey(result);
      const finalistId = result?.finalistId || null;
      if (gKey && seenGeometry.has(gKey)) continue;
      if (finalistId && seenFinalistIds.has(finalistId)) continue;
      if (gKey) seenGeometry.add(gKey);
      if (finalistId) seenFinalistIds.add(finalistId);
      const option = buildOption(result, seatPriorityMap, context, "practical", runFingerprint);
      if (!option) continue;
      shortlist.push(option);
    }
  }

  return shortlist;
}