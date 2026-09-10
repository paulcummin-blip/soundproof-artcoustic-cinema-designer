// Yarm 5-seat per-seat P19 divergence diagnostic.
//
// Reproduces the exact Yarm production path through the canonical bass optimiser
// with a 2-row, 5-seat layout. Confirms the per-seat product-limit attenuation
// fix produces divergent P19 values across seats (no longer all identical).
//
// Run: node --import ./test/_alias-register.mjs experiments/post-fix-p19-validation/yarm-5seat-per-seat-diagnostic.mjs
import {
  generateCanonicalCandidatePool,
} from "../../src/components/utils/canonicalBassOptimiser.js";
import { selectCandidateFromPool } from "../../src/components/utils/bassCandidatePoolSelection.js";
import { bassInputAdapter } from "../../src/components/utils/subwooferInstanceMigration.js";
import {
  buildAuthoritativeAutoAlignDelays,
  buildAuthoritativeBassSources,
  buildAuthoritativeResponseCurves,
} from "../../src/components/room/bass/useAuthoritativeBassResponse.js";
import { simulateAuthoritativeBassResponse } from "../../src/components/room/bass/authoritativeBassResponseEngine.js";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "../../src/components/room/bass/bassPhysicsDefaults.js";
import { computeOfficialP19Assessment, computeOfficialP20Assessment } from "../../src/components/utils/bassAuthoritativeAssessment.js";

const ROOM = Object.freeze({ widthM: 5, lengthM: 5, heightM: 2.4 });
const RSP = Object.freeze({ id: "rsp", x: 2.5, y: 2.59, z: 1.2 });

// 5 seats in 2 rows — matches the original Yarm diagnostic trace.
const SEATS = Object.freeze([
  { id: "r1-c1", x: 1.3, y: 2.59, z: 1.2 },
  { id: "r1-c2", x: 2.1, y: 2.59, z: 1.2 },
  { id: "r1-c3", x: 2.9, y: 2.59, z: 1.2 },
  { id: "r2-c1", x: 1.7, y: 4.39, z: 1.2 },
  { id: "r2-c2", x: 3.3, y: 4.39, z: 1.2 },
]);

const INSTANCES = Object.freeze([
  { id: "migrated-front-0", model: "SUB2-12", enabled: true, position: { x: 0.2676079985449544, y: 0.16304347826086957 }, bottomHeightM: 0.05386865295056209, legacyGroup: "front", gainDb: 0, delayMs: 0, polarity: 1 },
  { id: "migrated-front-1", model: "SUB2-12", enabled: true, position: { x: 4.703940642339301, y: 0.1375 }, bottomHeightM: 0.05386865295056209, legacyGroup: "front", gainDb: 0, delayMs: 0, polarity: 1 },
  { id: "sub-rear-1", model: "SUB2-12", enabled: true, position: { x: 0.27298523153691634, y: 4.845058626465661 }, bottomHeightM: 0.05, legacyGroup: "rear", gainDb: 0, delayMs: 0, polarity: 1 },
  { id: "sub-rear-2", model: "SUB2-12", enabled: true, position: { x: 4.735284802102963, y: 4.8625 }, bottomHeightM: 0.05, legacyGroup: "rear", gainDb: 0, delayMs: 0, polarity: 1 },
]);

const PHYSICS = Object.freeze({
  ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
  rewSourceCurveMode: "product",
  disableLateField: true,
  disableModalPropagationPhase: true,
  rewParityModalMagnitudeScale: 1,
  runtimeVectorCapture: false,
});

const TARGET_DB = 115;
const TRANSITION_HZ = 2000 * Math.sqrt(0.4 / (ROOM.widthM * ROOM.lengthM * ROOM.heightM));

function nearest(curve, frequency) {
  return curve.reduce((best, point) =>
    Math.abs(point.frequency - frequency) < Math.abs(best.frequency - frequency) ? point : best,
  );
}

const adapted = bassInputAdapter(INSTANCES, { frontOrientation: "vertical", rearOrientation: "vertical" });
const frontSubsLive = adapted.filter((item) => item.legacyGroup === "front");
const rearSubsLive = adapted.filter((item) => item.legacyGroup === "rear");
const autoAlignDelays = buildAuthoritativeAutoAlignDelays({
  enabled: true, rspPosition: RSP, frontSubsLive, rearSubsLive,
  frontSubsCfg: { orientation: "vertical" }, rearSubsCfg: { orientation: "vertical" },
});
const sources = buildAuthoritativeBassSources({
  frontSubsLive, rearSubsLive,
  frontSubsCfg: { orientation: "vertical" }, rearSubsCfg: { orientation: "vertical" },
  autoAlignDelays,
});
const simulation = simulateAuthoritativeBassResponse({
  roomDims: ROOM, seatingPositions: SEATS, rspPosition: RSP, sources, physics: PHYSICS,
  qStrategyOverride: "ab_corrected",
});
const { rspRawCurve, perSeatRawCurves } = buildAuthoritativeResponseCurves(simulation.seatResponses);

const pool = generateCanonicalCandidatePool({
  rawCurve: rspRawCurve,
  perSeatRawCurves,
  activeSubs: sources,
  usableLfHz: 20,
  transitionHz: TRANSITION_HZ,
  correctionEndHz: 200,
  selectedP14TargetDb: TARGET_DB,
  p14TargetBasis: "minimum",
  p14TargetLevel: 3,
  p18TargetBasis: "minimum",
});
const poolDebug = {
  poolType: Array.isArray(pool) ? "array" : typeof pool,
  poolLen: Array.isArray(pool) ? pool.length : (pool?.candidates?.length ?? null),
  firstKeys: Array.isArray(pool) && pool[0] ? Object.keys(pool[0]).slice(0, 20) : (pool?.candidates?.[0] ? Object.keys(pool.candidates[0]).slice(0,20) : null),
};
const selection = selectCandidateFromPool(pool);
const candidate = selection?.selectedCandidate || selection;

const finalPost = candidate?.finalPostEqCurve || [];
const perSeat = candidate?.perSeatPostEqCurves || [];
const target = candidate?.productionHouseCurveTarget || [];
const assessmentStartHz = candidate?.assessmentStartHz;
const assessmentEndHz = candidate?.assessmentEndHz;

const p19 = computeOfficialP19Assessment({
  rspPostEqCurve: finalPost, canonicalTargetCurve: target,
  assessmentStartHz, assessmentEndHz,
});
const p20 = computeOfficialP20Assessment({
  rspPostEqCurve: finalPost, perSeatPostEqCurves: perSeat,
  assessmentStartHz, assessmentEndHz,
});

const seatP19 = perSeat.map((seat) => {
  const smoothed = seat.responseData; // assessment uses smoothing internally
  const seatP19Result = computeOfficialP19Assessment({
    rspPostEqCurve: smoothed, canonicalTargetCurve: target,
    assessmentStartHz, assessmentEndHz,
  });
  const p15 = nearest(seat.responseData, 15);
  return {
    seatId: seat.seatId,
    p19VariationDb: seatP19Result?.variationDbRaw ?? null,
    p19WorstHz: seatP19Result?.worstFrequencyHz ?? null,
    spl15Hz: p15?.spl ?? null,
  };
});

const p20PerSeat = (p20?.perSeatResults || []).map((s) => ({
  seatId: s.seatId,
  p20VariationDb: s.variationDbRaw ?? null,
}));

console.log(JSON.stringify({
  targetDb: TARGET_DB,
  poolDebug,
  candidateType: candidate ? typeof candidate : null,
  candidateKeys: candidate ? Object.keys(candidate).slice(0, 30) : null,
  candidateId: candidate?.candidateId ?? null,
  rspP19: p19?.variationDbRaw ?? null,
  rspP19WorstHz: p19?.worstFrequencyHz ?? null,
  p20Primary: p20?.primaryVariationDb ?? null,
  p20Max: p20?.maxVariationDb ?? null,
  seatP19,
  p20PerSeat,
  allSeatsIdenticalP19: seatP19.length > 1 && seatP19.every((s) => s.p19VariationDb === seatP19[0].p19VariationDb),
}, null, 2));