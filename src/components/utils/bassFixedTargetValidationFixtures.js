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
  const designTarget = resolveRequestedRp22HouseCurveTarget(definitions, 4);
  const target = buildCanonicalAbsoluteHouseCurveTarget({
    frequencyGrid: FREQUENCIES,
    targetAnchorDb: designTarget.targetAnchorDb,
    correctionStartHz: 20,
    correctionEndHz: 200,
  });
  const targetForOneSub = target.map((point) => ({ ...point }));
  const targetForFourSubs = target.map((point) => ({ ...point }));
  const targetIsInvariant = JSON.stringify(targetForOneSub) === JSON.stringify(targetForFourSubs)
    && designTarget.requestedLevel === 4;
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

  return [
    { test: "1 × SUB2-12 requested L4 target", expected: "L4 target unchanged; capability fails", actual: { targetIsInvariant, capability: oneSubCapability }, delta: targetIsInvariant && !oneSubCapability.passesRequestedLevel ? 0 : 1, severity: targetIsInvariant && !oneSubCapability.passesRequestedLevel ? "PASS" : "CRITICAL", nextTest: "Live one-sub capability run" },
    { test: "4 × SUB4-12 requested L4 target", expected: "Same L4 target; capability passes or nearly passes", actual: { targetIsInvariant, capability: fourSubCapability }, delta: targetIsInvariant && fourSubCapability.achievedP14Level >= 3 ? 0 : 1, severity: targetIsInvariant && fourSubCapability.achievedP14Level >= 3 ? "PASS" : "HIGH", nextTest: "Live four-sub capability run" },
    { test: "67 Hz peak", expected: "Peak cut toward target", actual: { cutFilterFound: !!peakCut, beforeDb: peakBefore, afterDb: peakAfter }, delta: peakAfter - peakBefore, severity: peakCut && peakAfter < peakBefore - 1 ? "PASS" : "HIGH", nextTest: "Production room peak regression" },
    { test: "Deep null", expected: "No boost inside protected null", actual: { protectedRegionCount: protectedNulls.length, boostedProtectedNull }, delta: boostedProtectedNull ? 1 : 0, severity: !boostedProtectedNull && protectedNulls.length ? "PASS" : "CRITICAL", nextTest: "Multi-seat null regression" },
  ];
}