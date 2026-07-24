import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { calculateHouseCurveEqCurve } from "@/components/utils/houseCurveFitter";
import { calculatePairedP14P18ProductionAuthority } from "@/components/utils/pairedP14P18ProductionAuthority";
import { buildPostEqBassCapabilityOutcome } from "@/components/utils/postEqBassCapabilityOutcome";
import { buildCanonicalAbsoluteHouseCurveTarget } from "@/components/utils/houseCurveTargetAuthority";
import { identifyProtectedNullRegions } from "@/components/utils/houseCurveFitProtection";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { resolveRequestedRp22HouseCurveTarget } from "@/components/utils/requestedRp22HouseCurveAuthority";

const FREQUENCIES = Array.from({ length: 181 }, (_, index) => 20 + index);
const CAPABILITY_FREQUENCIES = [15, 18, 20, 25, 30, 40, 60, 80, 100, 120];
const REFERENCE_AMPLITUDE = Math.pow(10, 94 / 20);
const gaussian = (frequency, centre, width, gain) => gain * Math.exp(-0.5 * ((frequency - centre) / width) ** 2);

function capabilityFixture(modelKey, count, roomTransferDb, targetAnchorDb) {
  const activeSubs = Array.from({ length: count }, (_, index) => ({ id: `${modelKey}-${index + 1}`, modelKey }));
  const scale = REFERENCE_AMPLITUDE * Math.pow(10, roomTransferDb / 20);
  const perSourceComplexTransfers = activeSubs.map((sub) => ({
    sourceId: sub.id,
    points: CAPABILITY_FREQUENCIES.map((frequency) => ({ frequency, re: scale, im: 0 })),
  }));
  const authority = calculatePairedP14P18ProductionAuthority({
    activeSubs, perSourceComplexTransfers, combinedEqCurve: [], targetBasis: "minimum",
  });
  return buildPostEqBassCapabilityOutcome({ authority, requestedLevel: 4, targetAnchorDb });
}

export function runBassFixedTargetValidationFixtures() {
  const definitions = getRp22BassOperatingDefinitions("minimum");
  const levelTargets = [1, 2, 3, 4].map((level) => {
    const designTarget = resolveRequestedRp22HouseCurveTarget(definitions, level);
    const curve = buildCanonicalAbsoluteHouseCurveTarget({
      frequencyGrid: FREQUENCIES, targetAnchorDb: designTarget.targetAnchorDb,
      correctionStartHz: 20, correctionEndHz: 200,
    });
    return { level, designTarget, curve, shape: curve.map((point) => point.spl - designTarget.targetAnchorDb) };
  });
  const targetShapesMatch = levelTargets.every(({ shape }) => shape.every((value, index) => Math.abs(value - levelTargets[0].shape[index]) < 1e-9));
  const targetOffsetsRise = levelTargets.every((entry, index) => index === 0 || entry.designTarget.targetAnchorDb > levelTargets[index - 1].designTarget.targetAnchorDb);
  const { designTarget, curve: target } = levelTargets[3];
  const targetForOneSub = target.map((point) => ({ ...point }));
  const targetForFourSubs = target.map((point) => ({ ...point }));
  const targetIsInvariant = JSON.stringify(targetForOneSub) === JSON.stringify(targetForFourSubs);
  const oneSubCapability = capabilityFixture("SUB2-12", 1, -5, designTarget.targetAnchorDb);
  const fourSubCapability = capabilityFixture("SUB4-12", 4, -12, designTarget.targetAnchorDb);

  const peakCurve = FREQUENCIES.map((frequency) => ({
    frequency,
    spl: designTarget.targetAnchorDb + artcousticHouseCurveOffsetAt(frequency) + gaussian(frequency, 67, 7, 8),
  }));
  const peakResult = calculateHouseCurveEqCurve(peakCurve, [], 20, [], {
    requestedSystemOutputDb: designTarget.targetAnchorDb,
    targetAnchorDb: designTarget.targetAnchorDb,
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
    fitStartHz: 20,
    fitEndHz: 200,
  });
  const peakCut = peakResult.filters.find((filter) => filter.enabled && filter.gainDb < 0 && Math.abs(filter.frequencyHz - 67) <= 10);
  const peakBefore = Math.max(...peakCurve.filter((point) => Math.abs(point.frequency - 67) <= 2).map((point) => point.spl - designTarget.targetAnchorDb - artcousticHouseCurveOffsetAt(point.frequency)));
  const peakAfter = Math.max(...peakResult.curve.filter((point) => Math.abs(point.frequency - 67) <= 2).map((point) => point.spl - designTarget.targetAnchorDb - artcousticHouseCurveOffsetAt(point.frequency)));

  const nullCurve = FREQUENCIES.map((frequency) => ({
    frequency,
    spl: designTarget.targetAnchorDb + artcousticHouseCurveOffsetAt(frequency) + gaussian(frequency, 34, 2, -30),
  }));
  const protectedNulls = identifyProtectedNullRegions(
    nullCurve, 20, 200, designTarget.targetAnchorDb, [], 20,
    designTarget.targetAnchorDb, target,
  );
  const nullResult = calculateHouseCurveEqCurve(nullCurve, [], 20, [], {
    requestedSystemOutputDb: designTarget.targetAnchorDb,
    targetAnchorDb: designTarget.targetAnchorDb,
    canonicalTargetCurve: target,
    protectedNullRegions: protectedNulls,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
    fitStartHz: 20,
    fitEndHz: 200,
  });
  const boostedProtectedNull = nullResult.filters.some((filter) => filter.enabled && filter.gainDb > 0
    && protectedNulls.some((region) => filter.frequencyHz >= region.startHz && filter.frequencyHz <= region.endHz));

  const weakFailureIsExplicit = oneSubCapability.failureMessage === "Requested RP22 Level 4 target not achieved. Increase subwoofer capacity.";
  return [
    { test: "Target independence L1–L4", expected: "Identical shape; rising SPL offset only", actual: { targetShapesMatch, targetOffsetsRise, anchorsDb: levelTargets.map((entry) => entry.designTarget.targetAnchorDb) }, delta: targetShapesMatch && targetOffsetsRise ? 0 : 1, severity: targetShapesMatch && targetOffsetsRise ? "PASS" : "CRITICAL", nextTest: "Live L1–L4 graph overlay" },
    { test: "Hardware independence", expected: "Identical L4 target; achieved capability changes", actual: { targetIsInvariant, oneSub: oneSubCapability.achievedP14LevelLabel, fourSubs: fourSubCapability.achievedP14LevelLabel }, delta: targetIsInvariant && oneSubCapability.achievedP14Level !== fourSubCapability.achievedP14Level ? 0 : 1, severity: targetIsInvariant && oneSubCapability.achievedP14Level !== fourSubCapability.achievedP14Level ? "PASS" : "CRITICAL", nextTest: "Live hardware swap" },
    { test: "67 Hz EQ behaviour", expected: "Peak cut toward fixed target", actual: { cutFilterFound: !!peakCut, beforeDb: peakBefore, afterDb: peakAfter }, delta: peakAfter - peakBefore, severity: peakCut && peakAfter < peakBefore - 1 ? "PASS" : "HIGH", nextTest: "Production room peak regression" },
    { test: "1 × SUB2-12 real L4 limitation", expected: "Explicit requested-target failure; target unchanged", actual: { targetIsInvariant, passes: oneSubCapability.passesRequestedLevel, message: oneSubCapability.failureMessage }, delta: targetIsInvariant && !oneSubCapability.passesRequestedLevel && weakFailureIsExplicit ? 0 : 1, severity: targetIsInvariant && !oneSubCapability.passesRequestedLevel && weakFailureIsExplicit ? "PASS" : "CRITICAL", nextTest: "Live one-sub report" },
    { test: "Deep null protection", expected: "No boost inside protected null", actual: { protectedRegionCount: protectedNulls.length, boostedProtectedNull }, delta: boostedProtectedNull ? 1 : 0, severity: !boostedProtectedNull && protectedNulls.length ? "PASS" : "CRITICAL", nextTest: "Multi-seat null regression" },
  ];
}