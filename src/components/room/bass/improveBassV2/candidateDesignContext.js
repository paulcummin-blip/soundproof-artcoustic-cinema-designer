// candidateDesignContext.js
// Candidate-owned design context for cross-quantity V2 evaluation.
//
// A cross-quantity candidate is a physically valid Stage 2 finalist whose
// subwoofer quantity differs from the installed design. This module packages
// everything the V2 evaluation needs to evaluate such a candidate without
// referring to the installed subwoofer instances: synthetic source identities,
// synthetic instances, listener positions, RSP, and crossover configuration.
//
// The candidate's sources, models, positions, orientations and heights are
// resolved by the existing Stage 2 worker (buildStage2Sources) from the
// finalist's normalised coordinates and the project-level physical params
// (selectedSubModel, subwooferBottomHeightM, frontOrientation, rearOrientation).
// This module does NOT duplicate that resolution — it provides the identity
// layer (source IDs, synthetic instances) that the main-thread binding and
// validation require.
//
// The worker is already source-count agnostic: evaluateStage2Placement and
// evaluateStage2ConfirmationWithTuning work with any finalist.sources count.
// The issue this module solves is that bindConfirmation and
// validateCandidateForRun bind to the installed snapshot.instanceIds. A
// cross-quantity candidate needs its own source IDs and instances so the
// confirmed result is associated with the candidate, not the installed design.

import { normaliseModelKey } from "@/components/utils/modelKeyNormaliser";

/**
 * Maximum cross-quantity candidates evaluated per requested quantity.
 * Bounds the shortlist so the V2 pipeline does not run an unrestricted
 * combinatorial search.
 */
export const MAX_CROSS_QUANTITY_CANDIDATES_PER_QUANTITY = 3;

/**
 * Build a complete candidate-owned design context for a cross-quantity finalist.
 *
 * @param {object} params
 * @param {string} params.finalistId
 * @param {number} params.quantity
 * @param {Array<{x:number,y:number}>} params.coordinates — physical cabinet centres (metres)
 * @param {string} params.selectedSubModel
 * @param {number} [params.subwooferBottomHeightM]
 * @param {Array} [params.seatingPositions]
 * @param {object} [params.rspPosition]
 * @param {object} [params.crossover]
 * @param {boolean} [params.autoAlignEnabled]
 * @returns {object} candidate design context
 */
export function buildCandidateDesignContext({
  finalistId,
  quantity,
  coordinates,
  selectedSubModel,
  subwooferBottomHeightM,
  seatingPositions,
  rspPosition,
  crossover,
  autoAlignEnabled,
}) {
  const safeCoords = Array.isArray(coordinates) ? coordinates : [];
  const sourceIds = safeCoords.map((_, i) => `cand-${finalistId}-src-${i + 1}`);
  const modelKey = normaliseModelKey(selectedSubModel);
  const fallbackHeight = Number.isFinite(Number(subwooferBottomHeightM))
    ? Math.max(0, Number(subwooferBottomHeightM))
    : 0;

  // Synthetic instances for effectiveConfigurationKey and future Apply paths.
  // These mirror the snapshot.allInstances format so the existing configuration
  // key and tuning binding work without modification.
  const instances = safeCoords.map((coord, i) => ({
    id: sourceIds[i],
    model: modelKey,
    enabled: true,
    position: {
      x: Number(coord?.x) || 0,
      y: Number(coord?.y) || 0,
      z: 0,
    },
    bottomHeightM: fallbackHeight,
    rotationDeg: 0,
    delayMs: 0,
    gainDb: 0,
    polarity: 0,
    phaseControlDeg: 0,
  }));

  return {
    isCrossQuantity: true,
    finalistId,
    quantity,
    sourceIds,
    instances,
    selectedSubModel: modelKey,
    subwooferBottomHeightM: fallbackHeight,
    seatingPositions: Array.isArray(seatingPositions) ? seatingPositions : [],
    rspPosition: rspPosition || null,
    crossover: crossover || null,
    autoAlignEnabled: autoAlignEnabled !== false,
    candidateIdentity: `cross-quantity:${quantity}sub:${finalistId}`,
  };
}

/**
 * Build a per-candidate validation context for the confirmed-candidate
 * validator. For a cross-quantity candidate, the source IDs and seats come from
 * the candidate's own design context; for a same-quantity candidate, they fall
 * back to the installed snapshot.
 *
 * @param {object} candidate — the candidate being confirmed (may carry designContext)
 * @param {object} fallbackContext — { seats, sourceIds, inputIdentity } for installed quantity
 * @returns {object} validation context for validateCandidateForRun
 */
export function validationContextForCandidate(candidate, fallbackContext) {
  const designContext = candidate?.designContext || null;
  if (!designContext) return fallbackContext;
  return {
    seats: designContext.seatingPositions.length
      ? designContext.seatingPositions
      : fallbackContext.seats,
    sourceIds: designContext.sourceIds,
    inputIdentity: fallbackContext.inputIdentity,
  };
}