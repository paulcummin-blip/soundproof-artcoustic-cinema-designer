import { simulateAuthoritativeBassResponse } from "@/components/room/bass/authoritativeBassResponseEngine";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "@/components/room/bass/bassPhysicsDefaults";
import { buildAuthoritativeAutoAlignDelays, buildAuthoritativeBassSources, buildAuthoritativeResponseCurves } from "@/components/room/bass/useAuthoritativeBassResponse";
import { bassInputAdapter } from "@/components/utils/subwooferInstanceMigration";
import { generateCandidatePool, selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { buildCurveSignature } from "@/components/room/bass/bassResultAuthority";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";

const ROOM = Object.freeze({ widthM: 5, lengthM: 5, heightM: 2.4 });
const RSP = Object.freeze({ id: "rsp", x: 2.5, y: 2.59, z: 1.2 });
const SEATS = Object.freeze([
  { id: "seat-r1-c1", x: 1.3, y: 2.59, z: 1.2 },
  { id: "seat-r1-c2", x: 2.1, y: 2.59, z: 1.2 },
  { id: "seat-r1-c3", x: 2.9, y: 2.59, z: 1.2 },
  { id: "seat-r1-c4", x: 3.7, y: 2.59, z: 1.2 },
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
const SAMPLE_FREQUENCIES = [69, 97, 118, 125, 135, 145];

function nearest(curve, frequency) {
  return curve.reduce((best, point) =>
    Math.abs(point.frequency - frequency) < Math.abs(best.frequency - frequency) ? point : best
  );
}

function summariseCandidate(selected, targetDb) {
  const candidate = selected.selectedCandidate;
  if (!candidate) return { targetDb, selected: false };
  const target = candidate.productionHouseCurveTarget || [];
  const finalCurve = candidate.finalPostEqCurve || [];
  const samples = SAMPLE_FREQUENCIES.map((frequency) => {
    const post = nearest(finalCurve, frequency);
    const targetSpl = interpolateCanonicalTarget(target, post.frequency);
    return {
      frequencyHz: post.frequency,
      residualDb: post.spl - targetSpl,
    };
  });
  return {
    targetDb,
    selected: true,
    candidateId: candidate.candidateId,
    profile: candidate.designEqFitProfile,
    p14Db: candidate.achievedP14Db,
    p18Hz: candidate.achievedP18FrequencyHz,
    p19Db: candidate.achievedP19VariationDb,
    p20Db: candidate.achievedP20VariationDb,
    filterSignature: candidate.filterBankSignature,
    broadValleyRebalance: candidate.houseCurveDiagnostics?.broadValleyRebalance || null,
    samples,
  };
}

export function runLiveBassTestOptimiserFixture(requestedTargets = [109, 115, 123]) {
  const adapted = bassInputAdapter(INSTANCES, {
    frontOrientation: "vertical",
    rearOrientation: "vertical",
  });
  const frontSubsLive = adapted.filter((item) => item.legacyGroup === "front");
  const rearSubsLive = adapted.filter((item) => item.legacyGroup === "rear");
  const frontSubsCfg = { orientation: "vertical" };
  const rearSubsCfg = { orientation: "vertical" };
  const autoAlignDelays = buildAuthoritativeAutoAlignDelays({
    enabled: true,
    rspPosition: RSP,
    frontSubsLive,
    rearSubsLive,
    frontSubsCfg,
    rearSubsCfg,
  });
  const sources = buildAuthoritativeBassSources({
    frontSubsLive,
    rearSubsLive,
    frontSubsCfg,
    rearSubsCfg,
    autoAlignDelays,
  });
  const simulation = simulateAuthoritativeBassResponse({
    roomDims: ROOM,
    seatingPositions: SEATS,
    rspPosition: RSP,
    sources,
    physics: PHYSICS,
    qStrategyOverride: "ab_corrected",
  });
  const { rspRawCurve, perSeatRawCurves } = buildAuthoritativeResponseCurves(simulation.seatResponses);
  const transitionHz = 2000 * Math.sqrt(0.4 / (ROOM.widthM * ROOM.lengthM * ROOM.heightM));
  const cases = [
    { targetDb: 109, basis: "minimum", level: 1 },
    { targetDb: 115, basis: "minimum", level: 3 },
    { targetDb: 123, basis: "recommended", level: 4 },
  ].filter(({ targetDb }) => requestedTargets.includes(targetDb))
    .map(({ targetDb, basis, level }) => {
    const pool = generateCandidatePool({
      rawCurve: rspRawCurve,
      perSeatRawCurves,
      activeSubs: sources,
      usableLfHz: 20,
      transitionHz,
      correctionEndHz: 200,
      selectedP14TargetDb: targetDb,
      p14TargetBasis: basis,
      p14TargetLevel: level,
      p18TargetBasis: "minimum",
    });
    return summariseCandidate(selectCandidateFromPool(pool), targetDb);
  });
  return {
    rawCurveSignature: buildCurveSignature(rspRawCurve),
    expectedLiveRawCurveSignature: "curve:360:9ce9f140",
    rawSignatureMatchesLive: buildCurveSignature(rspRawCurve) === "curve:360:9ce9f140",
    sourceCount: sources.length,
    autoAlignDelays,
    transitionHz,
    cases,
  };
}
