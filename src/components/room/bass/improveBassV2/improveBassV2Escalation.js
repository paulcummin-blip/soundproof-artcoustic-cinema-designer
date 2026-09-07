// improveBassV2Escalation.js
// Stage 11B: Iterative physical position escalation logic.
//
// Extracted from improveBassV2Engine.js to keep the engine under 2000 lines.
// Provides per-phase candidate generation, screening, promotion, transfer
// computation, proxy search, and canonical confirmation helpers.
//
// Escalation hierarchy:
//   Phase A — Symmetric → confirm → test materiality
//   Phase B — Asymmetric pair (only if A not material) → confirm → test
//   Phase C — Individual (only if B not material) → confirm → test
//
// Each phase promotes only 2-3 candidates into the expensive V2 pipeline.
// Funnel instrumentation tracks: generated → screened → promoted → confirmed.

import { generateSymmetricCandidates, generateAsymmetricPairCandidates, generateIndividualCandidatesForPhase } from "./positionCandidateGenerator.js";
import { screenPositionCandidates, promoteScreenedCandidates } from "./positionScreeningEngine.js";
import { isMaterialImprovement } from "./materialityGate.js";
import { isSamePlacement } from "./improveBassV2Engine.js";
import { setPositionSearchPhase } from "./improveBassV2Store.js";

const MAX_PROMOTED_PER_PHASE = 3;

// ── Per-phase generation + screening ─────────────────────────────────────

/**
 * Run one position search phase: generate → screen → promote.
 * Returns only the 2-3 promoted candidates plus funnel metrics.
 */
export function runPositionScreenPhase(phase, currentPositions, roomDims, cabinetDims, seatingPositions, rspPosition, subwooferBottomHeightM) {
  const screeningPhysics = { qStrategy: "ab_corrected" };
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

  let candidates = [];
  if (phase === "symmetric") {
    candidates = generateSymmetricCandidates(currentPositions, roomDims, cabinetDims);
  } else if (phase === "asymmetric-pair") {
    candidates = generateAsymmetricPairCandidates(currentPositions, roomDims, cabinetDims);
  } else if (phase === "individual") {
    candidates = generateIndividualCandidatesForPhase(currentPositions, roomDims, cabinetDims);
  }

  const generated = candidates.length;
  if (generated === 0) {
    return {
      promoted: [],
      funnel: { generated: 0, screened: 0, promotedToV2: 0 },
      timingMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
    };
  }

  const screened = screenPositionCandidates(
    candidates, roomDims, seatingPositions, rspPosition,
    subwooferBottomHeightM, cabinetDims.heightM, screeningPhysics,
  );

  const promotedRaw = promoteScreenedCandidates(screened.ranked, MAX_PROMOTED_PER_PHASE);

  // Convert to gatherCandidates format with origin tagging
  const W = Number(roomDims.widthM) || 0;
  const L = Number(roomDims.lengthM) || 0;
  const currentFinalist = {
    sources: currentPositions.map((p) => ({
      xNorm: W > 0 ? p.x / W : 0,
      yNorm: L > 0 ? p.y / L : 0,
    })),
  };

  const promoted = [];
  for (const c of promotedRaw) {
    const finalist = {
      id: c.id,
      familyId: `position-${phase}`,
      sources: c.coordinates.map((coord) => ({
        xNorm: W > 0 ? coord.x / W : 0,
        yNorm: L > 0 ? coord.y / L : 0,
      })),
    };
    // Skip if duplicates current placement
    if (isSamePlacement(finalist, currentFinalist, roomDims)) continue;

    promoted.push({
      id: c.id,
      finalist,
      isCurrent: false,
      rawTransfer: null,
      isPositionCandidate: true,
      candidateOrigin: phase === "symmetric" ? "local-symmetric"
        : phase === "asymmetric-pair" ? "local-asymmetric-pair"
        : "local-individual",
      phase,
      movement: c.movement,
      coordinates: c.coordinates,
    });
  }

  return {
    promoted,
    funnel: {
      generated,
      screened: generated, // all generated are screened
      promotedToV2: promoted.length,
    },
    timingMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
  };
}

// ── Candidate origin tagging for global candidates ───────────────────────

/**
 * Tag global Stage 2 candidates with their origin.
 */
export function tagGlobalCandidates(candidates) {
  return candidates.map((c) => ({
    ...c,
    candidateOrigin: c.candidateOrigin || "global-placement",
  }));
}

// ── Materiality check for a phase ─────────────────────────────────────────

/**
 * Check if any confirmed result from the current phase is a material
 * improvement over the existing authority. Uses CANONICAL results only.
 *
 * @param {Array} confirmedResults - all confirmed results so far
 * @param {object} existingAuthority - current design canonical authority
 * @returns {{ material: boolean, winner: object|null, reason: string }}
 */
export function checkPhaseMateriality(confirmedResults, existingAuthority) {
  if (!existingAuthority) return { material: false, winner: null, reason: "No existing authority" };

  const challengers = confirmedResults.filter((r) => !r.isCurrent);
  if (!challengers.length) return { material: false, winner: null, reason: "No challengers" };

  for (const result of challengers) {
    const mat = isMaterialImprovement(existingAuthority, result);
    if (mat.material) {
      return { material: true, winner: result, reason: mat.reason };
    }
  }

  return { material: false, winner: null, reason: "No material improvement found" };
}

// ── Build per-phase exhaustion state ─────────────────────────────────────

/**
 * Build the detailed per-phase exhaustion state for the selection.
 */
export function buildPositionOptimisationState(phasesRun, funnel, existingAuthority, finalWinner) {
  const state = {
    attempted: phasesRun.length > 0,
    symmetric: {
      attempted: phasesRun.includes("symmetric"),
      generated: funnel.symmetric?.generated || 0,
      screened: funnel.symmetric?.screened || 0,
      promoted: funnel.symmetric?.promotedToV2 || 0,
      confirmed: funnel.symmetric?.confirmed || 0,
      exhausted: phasesRun.includes("symmetric"),
    },
    asymmetricPair: {
      attempted: phasesRun.includes("asymmetric-pair"),
      generated: funnel.asymmetricPair?.generated || 0,
      screened: funnel.asymmetricPair?.screened || 0,
      promoted: funnel.asymmetricPair?.promotedToV2 || 0,
      confirmed: funnel.asymmetricPair?.confirmed || 0,
      exhausted: phasesRun.includes("asymmetric-pair"),
    },
    individual: {
      attempted: phasesRun.includes("individual"),
      generated: funnel.individual?.generated || 0,
      screened: funnel.individual?.screened || 0,
      promoted: funnel.individual?.promotedToV2 || 0,
      confirmed: funnel.individual?.confirmed || 0,
      exhausted: phasesRun.includes("individual"),
    },
    materialSubImprovementFound: false,
    subOptimisationExhausted: false,
    bestPracticalSubResult: finalWinner || null,
  };

  // Materiality: only if the final winner is a position candidate and is material
  if (finalWinner && existingAuthority) {
    if (finalWinner.isPositionCandidate) {
      const mat = isMaterialImprovement(existingAuthority, finalWinner);
      state.materialSubImprovementFound = mat.material;
    }
  }

  // Exhaustion: all attempted phases are exhausted AND no material improvement
  // If a material symmetric winner stopped escalation, that is NOT "exhausted"
  const allAttemptedExhausted =
    (!state.symmetric.attempted || state.symmetric.exhausted) &&
    (!state.asymmetricPair.attempted || state.asymmetricPair.exhausted) &&
    (!state.individual.attempted || state.individual.exhausted);

  state.subOptimisationExhausted = allAttemptedExhausted && !state.materialSubImprovementFound;

  return state;
}