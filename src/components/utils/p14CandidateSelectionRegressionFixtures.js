import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { generateCandidatePool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { gradeP14ForBasis } from "@/components/utils/p14CapabilityAuthority";
import { rankBassCandidates } from "@/components/utils/bassPriorityPolicies";

const ROOM = Object.freeze({ widthM: 6, lengthM: 8, heightM: 2.8 });
const RSP = Object.freeze({ x: 3, y: 5.5, z: 1.2 });
const SEATS = Object.freeze([
  { id: "seat-1", x: 2, y: 4.8, z: 1.2 },
  { id: "seat-2", x: 4, y: 4.8, z: 1.2 },
  { id: "seat-3", x: 2, y: 6.2, z: 1.2 },
  { id: "seat-4", x: 4, y: 6.2, z: 1.2 },
]);
const PHYSICS = buildNormalizedPhysicsOptions({
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  qStrategy: "ab_corrected",
  enableRewCoreReflections: true,
  roomDamping: 20,
  axialQ: 4,
});

const sub = (id, x, y) => ({
  id,
  modelKey: "sub2-12",
  x,
  y,
  z: 0.3,
  placement: y < 4 ? "front" : "rear",
  tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
});

export const P14_CANDIDATE_LAYOUTS = Object.freeze({
  "one-colocated": [sub("s1", 1.5, 1)],
  "two-colocated": [sub("s1", 1.5, 1), sub("s2", 1.5, 1)],
  "two-distributed": [sub("s1", 1.5, 1), sub("s2", 4.5, 1)],
  "four-colocated": [sub("s1", 1.5, 1), sub("s2", 1.5, 1), sub("s3", 1.5, 1), sub("s4", 1.5, 1)],
  "four-distributed": [sub("s1", 1, 1), sub("s2", 5, 1), sub("s3", 1, 7), sub("s4", 5, 7)],
});

function legacyWholeBankCandidate(candidate) {
  const productCapabilityDb = candidate.p14CapabilityDetails?.productCapabilityBeforeEqDb;
  const wholeBankBoostDb = candidate.p14CapabilityDetails?.wholeBankMaximumPositiveEqBoostDb ?? 0;
  const achievedP14Db = productCapabilityDb - wholeBankBoostDb;
  const achievedP14Level = gradeP14ForBasis(achievedP14Db, candidate.p14TargetBasis);
  return {
    ...candidate,
    achievedP14Db,
    achievedP14Level,
    achievedP14MinimumLevel: gradeP14ForBasis(achievedP14Db, "minimum"),
    achievedP14RecommendedLevel: gradeP14ForBasis(achievedP14Db, "recommended"),
    allAtLeastL1: achievedP14Level >= 1 && candidate.achievedP18Level >= 1 && candidate.achievedP19Level >= 1,
    meetsRequestedEnvelope: achievedP14Level >= candidate.requestedP14Level
      && candidate.achievedP18Level >= candidate.requestedP18Level
      && candidate.achievedP19Level >= candidate.requestedP19Level,
  };
}

function selectionSummary(selection) {
  const selected = selection.selected;
  return {
    candidateId: selected?.candidateId ?? null,
    eligible: selected?.allAtLeastL1 ?? false,
    p14RawDb: selected?.achievedP14Db ?? null,
    p14Level: selected?.achievedP14Level ?? 0,
    p18Hz: selected?.achievedP18FrequencyHz ?? null,
    p18Level: selected?.achievedP18Level ?? 0,
    p19Db: selected?.achievedP19VariationDb ?? null,
    p19Level: selected?.achievedP19Level ?? 0,
    p20Db: selected?.achievedP20VariationDb ?? null,
    p20Level: selected?.achievedP20Level ?? 0,
    dominanceApplied: selection.diagnostics.balancedFallbackDominanceApplied,
    dominatedCandidateCount: selection.diagnostics.dominatedCandidateCount,
    eligibilityGroup: selection.diagnostics.eligibilityGroup,
  };
}

export function runP14CandidateSelectionRegressionFixture(layoutId) {
  const activeSubs = P14_CANDIDATE_LAYOUTS[layoutId];
  if (!activeSubs) throw new Error(`Unknown P14 candidate layout: ${layoutId}`);
  const transfer = computeNormalizedRoomTransfer({ roomDims: ROOM, rspPosition: RSP, seatingPositions: SEATS, subsForSimulation: activeSubs, physicsOptions: PHYSICS });
  const retainedFrequencies = new Set(transfer.rspCurve.filter((_, index) => index % 4 === 0).map((point) => point.frequency));
  [20, 120, 200].forEach((frequency) => retainedFrequencies.add(frequency));
  const rawCurve = transfer.rspCurve.filter((point) => retainedFrequencies.has(point.frequency));
  const perSeatRawCurves = transfer.seatCurves.map((seat) => ({
    seatId: seat.originalSeatId,
    responseData: seat.responseData.filter((point) => retainedFrequencies.has(point.frequency)),
  }));
  const pool = generateCandidatePool({ rawCurve, perSeatRawCurves, activeSubs, usableLfHz: 20, transitionHz: 120 });
  const selectionPool = pool.selectablePool.length ? pool.selectablePool : pool.candidates;
  const before = rankBassCandidates(selectionPool.map(legacyWholeBankCandidate), "balanced");
  const after = rankBassCandidates(selectionPool, "balanced");
  return {
    layoutId,
    responsePointCount: rawCurve.length,
    candidateCount: pool.candidates.length,
    physicallyCredibleCount: pool.selectablePool.length,
    before: selectionSummary(before),
    after: selectionSummary(after),
    selectedCandidateChanged: before.selected?.candidateId !== after.selected?.candidateId,
  };
}