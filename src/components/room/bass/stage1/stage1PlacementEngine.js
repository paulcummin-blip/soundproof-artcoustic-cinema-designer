// stage1PlacementEngine.js
// Stage 1 search orchestration: generate → evaluate → screen → fine search → rank.
// Product-independent. Reuses computeNormalizedRoomTransfer and prepareModeBank.

import { prepareModeBank } from "@/bass/core/rewBassEngine";
import { computeNormalizedRoomTransfer } from "../normalizedRoomTransferEngine";
import { DEFAULT_BEST_SUB_LAYOUT_PHYSICS } from "../best-layout/bestSubLayoutPhysicsSnapshot";
import {
  STAGE1_SCREENING_FREQ_MIN_HZ,
  STAGE1_SCREENING_FREQ_MAX_HZ,
  STAGE1_POINTS_PER_OCTAVE,
  STAGE1_FINALIST_COUNT,
  STAGE1_DIVERSITY_MIN_DISPLACEMENT_NORM,
  STAGE1_FALLBACK_SOURCE_HEIGHT_M,
} from "./stage1Constants";
import { generateStage1Candidates, generateFineCandidates } from "./stage1CandidateGenerator";
import { screenCandidate, compareScreeningResults } from "./stage1Screening";
import { FAMILY_IDS } from "./stage1FamilyRegistry";
import { validateAProhibition } from "./stage1GeometryValidator";

const round = (v, d = 3) => Number(Number(v || 0).toFixed(d));

function normToRoom(source, roomDims) {
  return {
    x: source.xNorm * roomDims.widthM,
    y: source.yNorm * roomDims.lengthM,
    z: STAGE1_FALLBACK_SOURCE_HEIGHT_M,
  };
}

function candidateToSources(candidate, roomDims) {
  return candidate.sources.map((s, i) => ({
    id: `stage1-src-${i + 1}`,
    x: s.xNorm * roomDims.widthM,
    y: s.yNorm * roomDims.lengthM,
    z: STAGE1_FALLBACK_SOURCE_HEIGHT_M,
    placement: "front",
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
  }));
}

/**
 * Evaluate a single candidate: compute normalized room transfer + screening.
 */
function evaluateCandidate(candidate, roomDims, rspPosition, seatingPositions, physicsOptions, preparedModes) {
  const sources = candidateToSources(candidate, roomDims);
  const transfer = computeNormalizedRoomTransfer({
    roomDims,
    rspPosition,
    seatingPositions,
    subsForSimulation: sources,
    physicsOptions,
    pointsPerOctave: STAGE1_POINTS_PER_OCTAVE,
    preparedModes,
  });
  if (transfer.status !== "complete") return null;
  const screening = screenCandidate({ transferResult: transfer, seatingPositions, candidate });
  return { ...candidate, screening, transfer };
}

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
 * Run Stage 1 search for a single quantity.
 * @param {object} params
 * @returns {object} Stage 1 result for this quantity
 */
export function runStage1SearchForQuantity({ roomDims, rspPosition, seatingPositions, physicsOptions, quantity, generationId }) {
  const started = performance.now();
  const W = Number(roomDims.widthM);
  const L = Number(roomDims.lengthM);
  const H = Number(roomDims.heightM);

  // Prepare mode bank once (room-dependent only)
  const engineOptions = {
    ...physicsOptions,
    freqMinHz: STAGE1_SCREENING_FREQ_MIN_HZ,
    freqMaxHz: 200, // engine needs wider range for modes; screening filters to 20-80
    smoothing: "none",
    pointsPerOctave: STAGE1_POINTS_PER_OCTAVE,
  };
  const preparedModes = prepareModeBank(roomDims, engineOptions);

  // ── Coarse search ───────────────────────────────────────────────────
  const { candidates: coarseCandidates, rejected, familyCoverage } = generateStage1Candidates(quantity);

  const coarseResults = [];
  for (const candidate of coarseCandidates) {
    if (generationId && generationId.cancelled) return null;
    const evaluated = evaluateCandidate(candidate, roomDims, rspPosition, seatingPositions, physicsOptions, preparedModes);
    if (evaluated) coarseResults.push(evaluated);
  }

  coarseResults.sort(compareScreeningResults);

  // ── Fine search for parameterised families ──────────────────────────
  const fineResults = [];
  const parameterisedFamilies = [FAMILY_IDS.C_FRONT_PAIR, FAMILY_IDS.RP22_C, FAMILY_IDS.RP22_D];
  for (const familyId of parameterisedFamilies) {
    if (generationId && generationId.cancelled) return null;
    // Only fine-search if this family is in the enabled set for this quantity
    const hasFamily = coarseResults.some((r) => r.familyId === familyId);
    if (!hasFamily) continue;
    const bestInFamily = coarseResults.find((r) => r.familyId === familyId);
    if (!bestInFamily) continue;
    const bestParam = extractBestParam(bestInFamily);
    const fineCandidates = generateFineCandidates(familyId, bestParam);
    for (const candidate of fineCandidates) {
      if (generationId && generationId.cancelled) return null;
      // Skip if duplicate of coarse candidate
      const exists = coarseResults.some((r) => r.id === candidate.id);
      if (exists) continue;
      const evaluated = evaluateCandidate(candidate, roomDims, rspPosition, seatingPositions, physicsOptions, preparedModes);
      if (evaluated) fineResults.push(evaluated);
    }
  }

  // ── Combine and rank ────────────────────────────────────────────────
  const allResults = [...coarseResults, ...fineResults];

  // Deduplicate by id
  const seen = new Map();
  for (const r of allResults) seen.set(r.id, r);
  const deduped = Array.from(seen.values());
  deduped.sort(compareScreeningResults);

  // ── Select finalists with diversity ─────────────────────────────────
  const finalists = selectFinalists(deduped, quantity);

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
  };
}

/**
 * Run full Stage 1 search for all quantities (1, 2, 4).
 * Suggested order: 2-sub, 4-sub, 1-sub.
 */
export function runFullStage1Search({ roomDims, rspPosition, seatingPositions, physicsOptions, generationId }) {
  const overallStart = performance.now();
  const physics = physicsOptions || DEFAULT_BEST_SUB_LAYOUT_PHYSICS;
  const quantities = [2, 4, 1];
  const quantityResultKeys = {
    1: "one_sub_result",
    2: "two_sub_result",
    4: "four_sub_result",
  };
  const results = {};

  for (const quantity of quantities) {
    if (generationId && generationId.cancelled) return null;
    const result = runStage1SearchForQuantity({
      roomDims, rspPosition, seatingPositions, physicsOptions: physics, quantity, generationId,
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