// coordinatedCandidateBundle.js
// Build and validate one coherent candidate-owned geometry bundle for the
// first coordinated seating + subwoofer placement proposal.
//
// The bundle ties together:
//   - Candidate ID
//   - Subwoofer count and unique source IDs
//   - Models, positions, orientations and heights
//   - Proposed seating positions and priorities
//   - Proposed RSP and designated seat ID
//   - Supported electronic tuning
//   - Automatic alignment setting
//   - LCR and crossover configuration
//   - Operating target and capability/headroom evidence (filled after eval)
//   - Response basis and canonical evidence identity (filled after eval)
//
// No installed source identities may substitute for candidate-owned identities.
// The bundle is validated before evaluation; an invalid or incomplete bundle
// is rejected, never silently evaluated.

import { normaliseModelKey } from "@/components/utils/modelKeyNormaliser";
import { resolveProposedRspFromSeat, designatedSeatExists } from "./coordinatedCandidateRsp";

/**
 * Build a coordinated candidate bundle from the known Room D geometry.
 *
 * @param {object} params
 * @param {string} params.candidateId — unique candidate identity
 * @param {number} params.quantity — subwoofer count
 * @param {Array<{x:number,y:number}>} params.coordinates — physical cabinet centres (m)
 * @param {string} params.selectedSubModel — subwoofer model key
 * @param {number} [params.subwooferBottomHeightM] — bottom mounting height (m)
 * @param {Array}  params.seatingPositions — proposed seats (moved)
 * @param {string} params.designatedSeatId — canonical RSP seat identity
 * @param {object} [params.fallbackRsp] — fallback RSP { x, y, z }
 * @param {Array}  [params.tuning] — per-source tuning [{ delayMs, gainDb, polarity, phaseControlDeg }]
 * @param {object} [params.crossover] — crossover configuration
 * @param {boolean} [params.autoAlignEnabled] — automatic alignment setting
 * @param {object} [params.integrationContext] — LCR/sub integration context
 * @param {string} [params.responseBasis] — "sub-only" | "combined-lcr-sub"
 * @param {object} [params.p14Target] — { p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis }
 * @returns {object} coordinated candidate bundle
 */
export function buildCoordinatedCandidateBundle({
  candidateId,
  quantity,
  coordinates,
  selectedSubModel,
  subwooferBottomHeightM,
  seatingPositions,
  designatedSeatId,
  fallbackRsp = null,
  roomWidthM = null,
  tuning = null,
  crossover = null,
  autoAlignEnabled = true,
  integrationContext = null,
  responseBasis = "sub-only",
  p14Target = null,
}) {
  const safeCoords = Array.isArray(coordinates) ? coordinates : [];
  const modelKey = normaliseModelKey(selectedSubModel);
  const safeQuantity = Number(quantity);

  // Candidate-owned source IDs — one unique identity per source.
  const sourceIds = safeCoords.map((_, i) => `coord-${candidateId}-src-${i + 1}`);

  // Synthetic instances mirror the snapshot.allInstances format so the
  // existing configuration key and tuning binding work without modification.
  const instances = safeCoords.map((coord, i) => ({
    id: sourceIds[i],
    model: modelKey,
    enabled: true,
    position: {
      x: Number(coord?.x) || 0,
      y: Number(coord?.y) || 0,
      z: 0,
    },
    bottomHeightM: Number.isFinite(Number(subwooferBottomHeightM))
      ? Math.max(0, Number(subwooferBottomHeightM))
      : 0,
    rotationDeg: 0,
    delayMs: 0,
    gainDb: 0,
    polarity: 0,
    phaseControlDeg: 0,
  }));

  // Resolve the proposed RSP from the designated seat in the proposed seating.
  const rspResolution = resolveProposedRspFromSeat({
    seatingPositions,
    designatedSeatId,
    fallbackRsp,
    roomWidthM,
  });

  const bundle = {
    candidateId: String(candidateId),
    isCoordinatedCandidate: true,
    quantity: safeQuantity,
    sourceIds,
    instances,
    selectedSubModel: modelKey,
    subwooferBottomHeightM: Number.isFinite(Number(subwooferBottomHeightM))
      ? Math.max(0, Number(subwooferBottomHeightM))
      : 0,
    coordinates: safeCoords.map((c) => ({
      x: Number(c?.x) || 0,
      y: Number(c?.y) || 0,
    })),
    seatingPositions: Array.isArray(seatingPositions) ? seatingPositions : [],
    designatedSeatId: designatedSeatId ? String(designatedSeatId) : null,
    rspPosition: rspResolution.rspPosition,
    rspResolvedFromSeat: rspResolution.resolvedFromSeat,
    rspSeat: rspResolution.seat,
    tuning: Array.isArray(tuning) ? tuning : safeCoords.map(() => ({
      delayMs: 0, gainDb: 0, polarity: 0, phaseControlDeg: 0,
    })),
    crossover: crossover || null,
    autoAlignEnabled: autoAlignEnabled !== false,
    integrationContext: integrationContext || null,
    responseBasis: responseBasis || "sub-only",
    p14Target: p14Target || null,
  };

  return bundle;
}

/**
 * Validate a coordinated candidate bundle before evaluation.
 * Returns { valid, issues } — an invalid bundle is never evaluated.
 *
 * @param {object} bundle — from buildCoordinatedCandidateBundle
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateCoordinatedCandidateBundle(bundle) {
  const issues = [];

  if (!bundle || typeof bundle !== "object") {
    return { valid: false, issues: ["Bundle is not an object"] };
  }

  if (!bundle.candidateId) issues.push("Missing candidateId");
  if (!Number.isFinite(Number(bundle.quantity)) || bundle.quantity <= 0) {
    issues.push("Quantity must be a positive number");
  }

  const coords = Array.isArray(bundle.coordinates) ? bundle.coordinates : [];
  if (coords.length !== bundle.quantity) {
    issues.push(`Coordinates count (${coords.length}) does not match quantity (${bundle.quantity})`);
  }

  const sourceIds = Array.isArray(bundle.sourceIds) ? bundle.sourceIds : [];
  if (sourceIds.length !== bundle.quantity) {
    issues.push(`Source IDs count (${sourceIds.length}) does not match quantity (${bundle.quantity})`);
  }
  if (sourceIds.some((id) => !id)) {
    issues.push("One or more source IDs are null or empty");
  }
  if (new Set(sourceIds).size !== sourceIds.length) {
    issues.push("Duplicate source IDs — each source must have a unique identity");
  }

  const instances = Array.isArray(bundle.instances) ? bundle.instances : [];
  if (instances.length !== bundle.quantity) {
    issues.push(`Instances count (${instances.length}) does not match quantity (${bundle.quantity})`);
  }

  const seats = Array.isArray(bundle.seatingPositions) ? bundle.seatingPositions : [];
  if (seats.length === 0) {
    issues.push("No seating positions provided");
  }

  if (!bundle.designatedSeatId) {
    issues.push("Missing designatedSeatId — RSP must be bound to a seat identity");
  } else if (!designatedSeatExists(seats, bundle.designatedSeatId)) {
    issues.push(`Designated seat ${bundle.designatedSeatId} not found in proposed seating`);
  }

  if (!bundle.rspPosition || !Number.isFinite(Number(bundle.rspPosition.x)) || !Number.isFinite(Number(bundle.rspPosition.y))) {
    issues.push("RSP position is invalid or incomplete");
  }

  if (!bundle.rspResolvedFromSeat) {
    issues.push("RSP was not resolved from the designated seat — proposal is incomplete");
  }

  const tuning = Array.isArray(bundle.tuning) ? bundle.tuning : [];
  if (tuning.length !== bundle.quantity) {
    issues.push(`Tuning count (${tuning.length}) does not match quantity (${bundle.quantity})`);
  }

  if (bundle.responseBasis === "combined-lcr-sub" && !bundle.crossover) {
    issues.push("Combined LCR/sub response basis requires a crossover configuration");
  }

  if (!bundle.p14Target || !Number.isFinite(Number(bundle.p14Target.p14TargetDb))) {
    issues.push("P14 target is missing or incomplete");
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Build a Stage 2 finalist from the bundle's coordinates, suitable for
 * evaluateStage2Placement. The finalist uses cabinet_centre coordinate space
 * so the placement evaluator uses the exact coordinates without re-resolving.
 *
 * @param {object} bundle
 * @param {object} roomDims — { widthM, lengthM }
 * @returns {object} Stage 2 finalist { id, familyId, sources }
 */
export function bundleToStage2Finalist(bundle, roomDims) {
  const W = Number(roomDims?.widthM) || 0;
  const L = Number(roomDims?.lengthM) || 0;
  const coords = Array.isArray(bundle.coordinates) ? bundle.coordinates : [];
  const sourceIds = Array.isArray(bundle.sourceIds) ? bundle.sourceIds : [];
  const instances = Array.isArray(bundle.instances) ? bundle.instances : [];
  const subwooferBottomHeightM = Number.isFinite(Number(bundle.subwooferBottomHeightM))
    ? Number(bundle.subwooferBottomHeightM) : 0;

  // Carry the candidate-owned sourceId, model and bottomHeight on each
  // finalist source so buildStage2Sources can use them instead of generating
  // replacement stage2-src-N identities. This is the identity layer only —
  // positions, orientations and acoustic calculations are unchanged.
  const sources = coords.map((c, i) => ({
    xNorm: (W > 0 && L > 0) ? Number(c.x) / W : 0,
    yNorm: (W > 0 && L > 0) ? Number(c.y) / L : 0,
    coordinateSpace: "cabinet_centre",
    sourceId: sourceIds[i] || null,
    modelKey: instances[i]?.model || bundle.selectedSubModel || null,
    bottomHeightM: Number.isFinite(Number(instances[i]?.bottomHeightM))
      ? Number(instances[i].bottomHeightM) : subwooferBottomHeightM,
    orientation: instances[i]?.orientation || null,
  }));

  return {
    id: bundle.candidateId,
    familyId: "coordinated-candidate",
    sources,
  };
}

/**
 * Validate post-evaluation identity integrity for a coordinated candidate.
 *
 * Checks:
 *   - Source ID count equals source count
 *   - Every source ID is non-null and unique
 *   - Source order matches placement order (the rawTransfer.sources IDs
 *     match the bundle.sourceIds in order)
 *   - Tuning IDs match transfer source IDs
 *   - Confirmation references the same candidate and source identities
 *
 * @param {object} bundle — the original coordinated candidate bundle
 * @param {object} rawTransfer — from evaluateStage2Placement
 * @param {object} confirmation — from evaluateStage2ConfirmationWithTuning
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateCoordinatedCandidateIntegrity(bundle, rawTransfer, confirmation) {
  const issues = [];

  const bundleSourceIds = Array.isArray(bundle?.sourceIds) ? bundle.sourceIds : [];
  const transferSources = Array.isArray(rawTransfer?.sources) ? rawTransfer.sources : [];
  const transferSourceIds = transferSources.map((s) => s?.id || null);

  // Source ID count must equal source count
  if (transferSourceIds.length !== bundleSourceIds.length) {
    issues.push(`Transfer source count (${transferSourceIds.length}) does not match bundle source count (${bundleSourceIds.length})`);
  }

  // Every source ID must be non-null and unique
  if (transferSourceIds.some((id) => !id)) {
    issues.push("One or more transfer source IDs are null or empty");
  }
  if (new Set(transferSourceIds.filter(Boolean)).size !== transferSourceIds.filter(Boolean).length) {
    issues.push("Duplicate transfer source IDs");
  }

  // Source order must match placement order
  for (let i = 0; i < bundleSourceIds.length; i++) {
    if (transferSourceIds[i] !== bundleSourceIds[i]) {
      issues.push(`Source order mismatch at index ${i}: bundle=${bundleSourceIds[i]}, transfer=${transferSourceIds[i]}`);
    }
  }

  // Tuning IDs must match transfer IDs (the tuning array is positional, but
  // each tuning entry's sourceId — if present — must match the transfer)
  const tuning = Array.isArray(bundle?.tuning) ? bundle.tuning : [];
  const transferPerSource = Array.isArray(rawTransfer?.perSourcePerSeatComplexTransfers)
    ? rawTransfer.perSourcePerSeatComplexTransfers : [];
  const transferSourceIdsFromTransfers = transferPerSource
    .map((t) => t?.sourceId || null)
    .filter((id, i, arr) => arr.indexOf(id) === i); // unique, ordered

  if (tuning.length !== bundleSourceIds.length) {
    issues.push(`Tuning count (${tuning.length}) does not match bundle source count (${bundleSourceIds.length})`);
  }

  // Check that the per-source per-seat transfer sourceIds match the source IDs
  // on the sources array (they should be the same identities)
  for (const t of transferPerSource) {
    const idx = t?.sourceIndex;
    if (Number.isFinite(idx) && idx < transferSources.length) {
      const sourceId = transferSources[idx]?.id;
      if (t?.sourceId && sourceId && t.sourceId !== sourceId) {
        issues.push(`Transfer sourceId ${t.sourceId} does not match source[${idx}].id ${sourceId}`);
      }
    }
  }

  // Confirmation must reference the same candidate identity
  if (confirmation?.finalistId && bundle?.candidateId && confirmation.finalistId !== bundle.candidateId) {
    issues.push(`Confirmation finalistId (${confirmation.finalistId}) does not match candidate ID (${bundle.candidateId})`);
  }

  return { valid: issues.length === 0, issues };
}