import { simulateAuthoritativeBassResponse } from "@/components/room/bass/authoritativeBassResponseEngine";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "@/components/room/bass/bassPhysicsDefaults";
import { buildAuthoritativeAutoAlignDelays, buildAuthoritativeBassSources, buildAuthoritativeResponseCurves } from "@/components/room/bass/useAuthoritativeBassResponse";
import { bassInputAdapter } from "@/components/utils/subwooferInstanceMigration";
import { generateCandidatePool, selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { buildCurveSignature } from "@/components/room/bass/bassResultAuthority";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";
import { computeOfficialP19Assessment, computeOfficialP20Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { assessP18AgainstRequiredExtension } from "@/components/utils/bassDesignPhilosophyAuthority";
import { assessP18Extension } from "@/components/utils/p18ExtensionAuthority";

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
  const p18 = assessP18AgainstRequiredExtension({
    rspPostEqCurve: finalCurve,
    canonicalTargetCurve: target,
    perSeatPostEqCurves: candidate.perSeatPostEqCurves || [],
    selectedP14TargetDb: targetDb,
    requiredExtensionHz: 35,
    p18CutoffDb: 3,
    configuredUsableLfHz: 20,
  });
  const p18Grade = assessP18Extension(p18?.achievedExtensionHz, "minimum");
  const p19 = computeOfficialP19Assessment({
    rspPostEqCurve: finalCurve,
    canonicalTargetCurve: target,
    assessmentStartHz: candidate.assessmentStartHz,
    assessmentEndHz: candidate.assessmentEndHz,
  });
  const p20 = computeOfficialP20Assessment({
    rspPostEqCurve: finalCurve,
    perSeatPostEqCurves: candidate.perSeatPostEqCurves || [],
    assessmentStartHz: candidate.assessmentStartHz,
    assessmentEndHz: candidate.assessmentEndHz,
  });
  const samples = SAMPLE_FREQUENCIES.map((frequency) => {
    const post = nearest(finalCurve, frequency);
    const targetSpl = interpolateCanonicalTarget(target, post.frequency);
    const sampleSpl = (curve) => Array.isArray(curve) && curve.length ? nearest(curve, post.frequency).spl : null;
    return {
      frequencyHz: post.frequency,
      targetSpl,
      rawPhysicalSpl: sampleSpl(candidate.rawResponseCurve),
      requestedPreEqSpl: sampleSpl(candidate.requestedPreEqOperatingCurve),
      achievedPreEqSpl: sampleSpl(candidate.rspBeforePeqAtOperatingLevel),
      combinedEqDb: sampleSpl(candidate.combinedEqCurve),
      unconstrainedPostEqSpl: sampleSpl(candidate.unconstrainedPostEqCurve),
      maximumUsableInRoomSpl: sampleSpl(candidate.maximumSplCurveAfterEq),
      productOperatingEnvelopeSpl: sampleSpl(candidate.productOperatingEnvelopeCurve),
      finalPostEqSpl: post.spl,
      capabilityLimited: post.capabilityLimited === true,
      residualDb: post.spl - targetSpl,
    };
  });
  const filters = (candidate.generatedFilterBank || []).filter((filter) => filter?.enabled);
  const p14AvailableDb = Number.isFinite(candidate.productOperatingMarginDb)
    ? targetDb + candidate.productOperatingMarginDb
    : null;
  return {
    targetDb,
    selected: true,
    candidateId: candidate.candidateId,
    profile: candidate.designEqFitProfile,
    p14AvailableDb,
    p14MarginDb: candidate.productOperatingMarginDb,
    p14Pass: Number.isFinite(candidate.productOperatingMarginDb)
      ? candidate.productOperatingMarginDb >= 0
      : null,
    p18Hz: p18?.achievedExtensionHz ?? null,
    p18IndependentLevel: p18Grade.level,
    p18Level: p18Grade.level,
    p19Db: p19?.variationDbRaw ?? null,
    p19DisplayDb: p19?.displayVariationDb ?? null,
    p19Level: p19?.level ?? null,
    p20Db: p20?.worstSeat?.variationDbRaw ?? null,
    p20DisplayDb: p20?.worstSeat?.displayVariationDb ?? null,
    p20Level: p20?.worstSeat?.level ?? null,
    filterSignature: candidate.filterBankSignature,
    filterCount: filters.length,
    filters: filters.map((filter) => ({
      frequencyHz: filter.frequencyHz,
      gainDb: filter.gainDb,
      q: filter.q ?? filter.Q,
    })),
    bankLimits: candidate.aggregateBankLimits || null,
    rawMaximumResidualDb: candidate.houseCurveDiagnostics?.broadValleyRebalance?.selected?.maximumResidualAfterDb
      ?? candidate.fitMetrics?.maximumResidualDb
      ?? null,
    rmsResidualDb: candidate.fitMetrics?.rmsResidualDb ?? null,
    shapeRmsResidualDb: candidate.fitMetrics?.shapeRmsResidualDb ?? null,
    broadValleyRebalance: candidate.houseCurveDiagnostics?.broadValleyRebalance ? {
      changed: candidate.houseCurveDiagnostics.broadValleyRebalance.changed,
      reason: candidate.houseCurveDiagnostics.broadValleyRebalance.reason,
      selected: candidate.houseCurveDiagnostics.broadValleyRebalance.selected,
      diagnostics: candidate.houseCurveDiagnostics.broadValleyRebalance.diagnostics,
      verification: candidate.houseCurveDiagnostics.broadValleyRebalance.verification ? {
        testedBanks: candidate.houseCurveDiagnostics.broadValleyRebalance.verification.testedBanks,
        realSeatUnsafe: candidate.houseCurveDiagnostics.broadValleyRebalance.verification.realSeatUnsafe,
        rspLevelRegression: candidate.houseCurveDiagnostics.broadValleyRebalance.verification.rspLevelRegression,
        rspRmsWorsening: candidate.houseCurveDiagnostics.broadValleyRebalance.verification.rspRmsWorsening,
        bestValleySample: candidate.houseCurveDiagnostics.broadValleyRebalance.verification.bestValleySample,
        bestRepurposedSample: candidate.houseCurveDiagnostics.broadValleyRebalance.verification.bestRepurposedSample,
        bestAppendedSample: candidate.houseCurveDiagnostics.broadValleyRebalance.verification.bestAppendedSample,
        samples: candidate.houseCurveDiagnostics.broadValleyRebalance.verification.samples,
      } : null,
    } : null,
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
  const byTarget = Object.fromEntries(cases.map((item) => [item.targetDb, item]));
  const hasComparisonSet = [109, 115, 123].every((targetDb) => byTarget[targetDb]);
  const checks = hasComparisonSet ? [
    {
      name: "109, 115 and 123 dBC produce distinct room-derived filter banks",
      passed: new Set([byTarget[109].filterSignature, byTarget[115].filterSignature, byTarget[123].filterSignature]).size === 3,
    },
    {
      name: "All selected banks stay within the ten-filter and aggregate transfer limits",
      passed: cases.every((item) => item.filterCount <= 10 && item.bankLimits?.allOk === true),
    },
    {
      name: "Product capability remains setup-specific rather than target-dependent",
      passed: Math.max(...cases.map((item) => item.p14AvailableDb)) - Math.min(...cases.map((item) => item.p14AvailableDb)) < 0.1,
    },
    {
      name: "P14 passes at 109 and 115 dBC but fails above the product envelope at 123 dBC",
      passed: byTarget[109].p14Pass === true && byTarget[115].p14Pass === true && byTarget[123].p14Pass === false,
    },
    {
      name: "Achieved P18 extension worsens as selected P14 output rises",
      passed: byTarget[109].p18Hz < byTarget[115].p18Hz && byTarget[115].p18Hz < byTarget[123].p18Hz,
    },
    {
      name: "P18 remains independently graded when P14 itself fails",
      passed: byTarget[123].p18IndependentLevel === 2 && byTarget[123].p18Level === 2,
    },
    {
      name: "P19 fit degrades materially near and beyond the product envelope",
      passed: byTarget[123].p19Db > byTarget[115].p19Db && byTarget[123].p19Level === 0,
    },
  ] : [];
  return {
    rawCurveSignature: buildCurveSignature(rspRawCurve),
    expectedLiveRawCurveSignature: "curve:360:9ce9f140",
    rawSignatureMatchesLive: buildCurveSignature(rspRawCurve) === "curve:360:9ce9f140",
    sourceCount: sources.length,
    autoAlignDelays,
    transitionHz,
    cases,
    checks,
    allPassed: hasComparisonSet ? checks.every((item) => item.passed) : null,
  };
}
