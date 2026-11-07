// stage1PlacementEngine.js
// Stage 1 search orchestration: generate → evaluate → screen → fine search → rank.
// Product-independent. Evaluation is dispatched to a bounded pool of workers via
// runBoundedConfirmations; generation, ranking, finalist selection and
// A-prohibition validation are unchanged from the serial engine.
//
// PHASE BARRIER (mandatory):
//   COARSE GENERATION → COARSE EVALUATION (bounded concurrent) → WAIT FOR ALL
//   → COARSE RANKING / SHORTLIST → FINE GENERATION FROM SHORTLIST
//   → FINE EVALUATION (bounded concurrent) → WAIT FOR ALL → FINALIST SELECTION.
//   No fine candidate is evaluated before the coarse shortlist is complete.

import { DEFAULT_BEST_SUB_LAYOUT_PHYSICS } from "../best-layout/bestSubLayoutPhysicsSnapshot";
import {
  STAGE1_FINALIST_COUNT,
  STAGE1_DIVERSITY_MIN_DISPLACEMENT_NORM,
  STAGE1_CONCURRENCY,
  STAGE1_FALLBACK_SOURCE_HEIGHT_M,
} from "./stage1Constants";
import { generateStage1Candidates, generateFineCandidates } from "./stage1CandidateGenerator";
import { compareScreeningResults } from "./stage1Screening";
import { FAMILY_IDS } from "./stage1FamilyRegistry";
import { isThreeSubFamily, threeSubFamilyBestParam } from "./stage1ThreeSubFamilies.js";
import { validateAProhibition } from "./stage1GeometryValidator";
import { runBoundedConfirmations } from "../improveBassV2/runBoundedConfirmations.js";
import { isWallReferencePoint, COORDINATE_SPACE } from "../stage2/installableWallCentreAuthority";
import { dedupeByPhysicalArrangement } from "./stage1PhysicalArrangementFingerprint";

const round = (v, d = 3) => Number(Number(v || 0).toFixed(d));
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Extract the best parameter q from a parameterised family candidate.
 */
function extractBestParam(candidate) {
  if (!candidate?.sources?.length) return 0.25;
  // For C_FRONT_PAIR / RP22_C / RP22_D: first source xNorm is q (or 1-q)
  const s = candidate.sources[0];
  const q = s.xNorm < 0.5 ? s.xNorm : 1 - s.xNorm;
  return q;
}

/**
 * Select finalists with family diversity.
 * Walks the ranked list, retaining the best from each family, then filling
 * remaining slots with materially different candidates.
 */
function selectFinalists(ranked, quantity) {
  const maxFinalists = STAGE1_FINALIST_COUNT[quantity] || 5;
  const finalists = [];
  const familiesSeen = new Set();

  // First pass: best from each family
  for (const candidate of ranked) {
    if (finalists.length >= maxFinalists) break;
    if (!familiesSeen.has(candidate.familyId)) {
      finalists.push(candidate);
      familiesSeen.add(candidate.familyId);
    }
  }

  // Second pass: fill with materially different candidates
  for (const candidate of ranked) {
    if (finalists.length >= maxFinalists) break;
    if (familiesSeen.has(candidate.familyId)) {
      // Same family — check material difference from existing finalists of same family
      const sameFamilyFinalists = finalists.filter((f) => f.familyId === candidate.familyId);
      const isMateriallyDifferent = sameFamilyFinalists.every((f) => {
        const maxDisp = Math.max(...candidate.sources.map((cs, i) => {
          const fs = f.sources[i];
          if (!fs) return 1;
          return Math.sqrt((cs.xNorm - fs.xNorm) ** 2 + (cs.yNorm - fs.yNorm) ** 2);
        }));
        return maxDisp >= STAGE1_DIVERSITY_MIN_DISPLACEMENT_NORM;
      });
      if (isMateriallyDifferent) {
        finalists.push(candidate);
        familiesSeen.add(candidate.familyId);
      }
    }
  }

  return finalists.slice(0, maxFinalists);
}

/**
 * Build the runFn closure for runBoundedConfirmations: dispatch one candidate
 * to the evaluation pool and time it. Rejects on worker error so the bounded
 * runner records an isolated failure (never aborts siblings).
 */
function makeEvaluationRunFn(pool) {
  return async function runFn(candidate) {
    const t0 = now();
    const result = await pool.evaluate(candidate);
    return { result, workerMs: now() - t0 };
  };
}

/**
 * Collect non-null evaluated candidates from bounded-runner results, in
 * ORIGINAL job order. Null results (incomplete transfers) and isolated
 * failures are skipped — exactly the serial engine's `if (evaluated) push`
 * behaviour, with order preserved by runBoundedConfirmations' index-based
 * result array.
 */
function collectEvaluated(entries) {
  const out = [];
  for (const entry of entries) {
    if (entry && entry.ok && entry.result != null) out.push(entry.result);
  }
  return out;
}

/**
 * Run Stage 1 search for a single quantity.
 * @param {object} params
 * @param {object} params.pool - A Stage 1 evaluation pool (has evaluate(candidate)).
 * @param {number} [params.stage1Concurrency] - Max concurrent evaluations (default 3).
 * @returns {Promise<object>} Stage 1 result for this quantity.
 */
export async function runStage1SearchForQuantity({
  roomDims,
  rspPosition,
  seatingPositions,
  physicsOptions,
  quantity,
  generationId,
  pool,
  stage1Concurrency = STAGE1_CONCURRENCY,
}) {
  const started = performance.now();
  const W = Number(roomDims.widthM);
  const L = Number(roomDims.lengthM);

  const isAborted = () => !!(generationId && generationId.cancelled);
  const runFn = makeEvaluationRunFn(pool);

  // ── Coarse search ───────────────────────────────────────────────────
  const { candidates: coarseCandidates, rejected, familyCoverage } = generateStage1Candidates(quantity);

  // Guard: if already cancelled before the coarse phase launches, do not
  // enter the bounded runner (it would never launch a job and never settle).
  if (isAborted()) return null;

  const coarseRun = await runBoundedConfirmations({
    jobs: coarseCandidates,
    maxConcurrency: stage1Concurrency,
    runFn,
    isAborted,
  });
  if (isAborted()) return null;

  const coarseResults = collectEvaluated(coarseRun.results);
  coarseResults.sort(compareScreeningResults);

  // ── Fine search for parameterised families ──────────────────────────
  // Fine candidates depend on the coarse shortlist (bestInFamily / bestParam),
  // so the fine phase CANNOT start before the coarse phase completes. The
  // phase barrier is the `await` on the coarse run above.
  const parameterisedFamilies = [
    FAMILY_IDS.C_FRONT_PAIR,
    FAMILY_IDS.FRONT_THIRD_PAIR,
    FAMILY_IDS.REAR_QUARTER_PAIR,
    FAMILY_IDS.REAR_THIRD_PAIR,
    FAMILY_IDS.RP22_C,
    FAMILY_IDS.FOUR_THIRD_PAIRS,
    FAMILY_IDS.RP22_D,
    // Three-source families refine the mirrored pair they were built around.
    FAMILY_IDS.THREE_FRONT_SINGLE_REAR_PAIR,
    FAMILY_IDS.THREE_FRONT_PAIR_REAR_SINGLE,
  ];

  // Build the fine job list in family-then-candidate order (the same nested
  // order the serial engine iterated), skipping duplicates of coarse
  // candidates. Cancellation is honoured between families.
  const fineJobs = [];
  for (const familyId of parameterisedFamilies) {
    if (isAborted()) return null;
    const hasFamily = coarseResults.some((r) => r.familyId === familyId);
    if (!hasFamily) continue;
    const bestInFamily = coarseResults.find((r) => r.familyId === familyId);
    if (!bestInFamily) continue;
    const bestParam = isThreeSubFamily(familyId)
      ? threeSubFamilyBestParam(bestInFamily)
      : extractBestParam(bestInFamily);
    const fineCandidates = generateFineCandidates(familyId, bestParam);
    for (const candidate of fineCandidates) {
      const exists = coarseResults.some((r) => r.id === candidate.id);
      if (exists) continue;
      fineJobs.push(candidate);
    }
  }

  if (isAborted()) return null;

  const fineRun = await runBoundedConfirmations({
    jobs: fineJobs,
    maxConcurrency: stage1Concurrency,
    runFn,
    isAborted,
  });
  if (isAborted()) return null;

  const fineResults = collectEvaluated(fineRun.results);

  // ── Combine and rank ────────────────────────────────────────────────
  const allResults = [...coarseResults, ...fineResults];

  // Deduplicate by id
  const seen = new Map();
  for (const r of allResults) seen.set(r.id, r);
  const deduped = Array.from(seen.values());
  deduped.sort(compareScreeningResults);

  // ── Collapse physical duplicates before the shortlist limit ────────
  // Different search-family names can resolve to the same physical
  // arrangement (same quantity, same multiset of cabinet centres). The id
  // encodes the family name, so id-based dedup leaves both; the family-
  // diversity finalist pass would then waste a slot on a physical
  // duplicate. Collapsing here — on the actual evaluated coordinates,
  // permutation-invariant, keeping the highest-ranked representative —
  // removes duplicates BEFORE the shortlist limit is applied, so a
  // duplicate family can no longer exclude a genuinely distinct candidate.
  // No acoustic physics, scoring weights or Stage 2 geometry are touched.
  const physicallyDistinct = dedupeByPhysicalArrangement(deduped);

  // ── Select finalists with diversity ─────────────────────────────────
  const finalists = selectFinalists(physicallyDistinct, quantity);

  // ── A-prohibition validation on finalists ──────────────────────────
  let aProhibitionPass = true;
  for (const f of finalists) {
    const validation = validateAProhibition(f.sources);
    if (!validation.passes) {
      aProhibitionPass = false;
      break;
    }
  }

  const elapsedMs = performance.now() - started;

  // Build compact result (no heavy transfer data — just screening + coordinates)
  const compactFinalists = finalists.map((f) => ({
    id: f.id,
    familyId: f.familyId,
    sources: f.sources.map((s) => ({
      xNorm: s.xNorm,
      yNorm: s.yNorm,
      // Each source's coordinate domain is determined by its position: a
      // point on a wall boundary (xNorm 0/1 or yNorm 0/1) is a WALL reference
      // Stage 2 offsets into the room; an inset point is already a cabinet
      // centre and is used directly. The domain is explicit, never inferred
      // after the fact, so a valid inset position is resolved rather than
      // rejected as a malformed wall reference.
      coordinateSpace: isWallReferencePoint(s.xNorm, s.yNorm)
        ? COORDINATE_SPACE.WALL_REFERENCE
        : COORDINATE_SPACE.CABINET_CENTRE,
      x: round(s.xNorm * W, 3),
      y: round(s.yNorm * L, 3),
      z: STAGE1_FALLBACK_SOURCE_HEIGHT_M,
    })),
    screening: f.screening,
    searchTier: f.searchTier,
    symmetryState: f.symmetryState,
    seedDisplacement: f.seedDisplacement,
  }));

  return {
    quantity,
    status: "complete",
    candidateCount: deduped.length,
    coarseCandidateCount: coarseResults.length,
    fineCandidateCount: fineResults.length,
    rejectedCount: rejected.length,
    familyCoverage,
    finalists: compactFinalists,
    aProhibitionValidation: aProhibitionPass ? "PASS" : "FAIL",
    bEvaluated: false,
    searchTimingMs: round(elapsedMs, 1),
    tiersExhausted: ["coarse", "fine"],
    // Diagnostic-only instrumentation (coarse/fine phase breakdown).
    coarseStats: coarseRun.stats,
    fineStats: fineRun.stats,
  };
}

/**
 * Run full Stage 1 search for all quantities (1, 2, 3, 4).
 * Suggested order: 2-sub, 4-sub, 1-sub.
 * @param {object} params
 * @param {object} params.pool - A Stage 1 evaluation pool shared across all
 *   quantities (created once by the Stage 1 worker).
 * @param {number} [params.stage1Concurrency] - Max concurrent evaluations per phase.
 */
export async function runFullStage1Search({
  roomDims,
  rspPosition,
  seatingPositions,
  physicsOptions,
  generationId,
  scopeQuantity = null,
  recommendationQuantities = null,
  pool,
  stage1Concurrency = STAGE1_CONCURRENCY,
}) {
  const overallStart = performance.now();
  const physics = physicsOptions || DEFAULT_BEST_SUB_LAYOUT_PHYSICS;
  // The three-source quantity is appended, never inserted: the order the existing
  // quantities are searched in is unchanged.
  // A selected-quantity run searches only the installed quantity (all its families
  // and candidates still run). Compare passes no scope and searches every quantity.
  // A cross-quantity recommendation run searches exactly its quantity set
  // (1, 2, 4 — 3 is excluded from this workflow but remains supported elsewhere).
  let quantities;
  if (Array.isArray(recommendationQuantities) && recommendationQuantities.length > 0) {
    quantities = recommendationQuantities.slice().sort((a, b) => a - b);
  } else if ([1, 2, 3, 4].includes(scopeQuantity)) {
    quantities = [scopeQuantity];
  } else {
    quantities = [2, 4, 1, 3];
  }
  const quantityResultKeys = {
    1: "one_sub_result",
    2: "two_sub_result",
    3: "three_sub_result",
    4: "four_sub_result",
  };
  const results = {};

  for (const quantity of quantities) {
    if (generationId && generationId.cancelled) return null;
    const result = await runStage1SearchForQuantity({
      roomDims,
      rspPosition,
      seatingPositions,
      physicsOptions: physics,
      quantity,
      generationId,
      pool,
      stage1Concurrency,
    });
    if (generationId && generationId.cancelled) return null;
    if (result) results[quantityResultKeys[quantity]] = result;
  }

  const totalMs = performance.now() - overallStart;
  return {
    results,
    totalWallClockMs: round(totalMs, 1),
  };
}