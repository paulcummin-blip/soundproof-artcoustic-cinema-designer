import { assessP14Capability } from "@/components/utils/p14CapabilityAuthority";
import { computeParam18AchievedExtension } from "@/components/utils/rp22BassMetrics";
import { computeOfficialP19Assessment, computeOfficialP20Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { houseCurveP19Level } from "@/components/utils/houseCurveFitterCore";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { buildPostEqBassCapabilityOutcome } from "@/components/utils/postEqBassCapabilityOutcome";

const numericLevel = (label) => Number(String(label || "").replace("L", "")) || 0;

export function evaluateCanonicalBassAuthority({
  canonicalResult,
  activeSubs = [],
  usableLfHz = null,
  p14TargetBasis = "minimum",
  requestedLevel = 4,
} = {}) {
  if (!canonicalResult?.selectedCandidateId || !canonicalResult.canonicalPostEqRsp?.length) return null;

  const positiveEqDemandCurve = (canonicalResult.positiveEqDemandCurve || []).map((point) => ({
    frequency: point.frequency,
    spl: Number(point.demandDb ?? point.spl) || 0,
  }));

  // P14: approved continuous, frequency-dependent product capability less positive EQ demand.
  const p14 = assessP14Capability({
    activeSubs,
    combinedEqCurve: positiveEqDemandCurve,
    targetBasis: p14TargetBasis,
  });
  const achievedP14Db = p14?.value ?? null;
  const achievedP14Level = p14?.level ?? 0;

  // P18: same canonical post-EQ RSP/seat result, bounded by the same product capability.
  const p18 = computeParam18AchievedExtension({
    rspPostEqCurve: canonicalResult.canonicalPostEqRsp,
    perSeatPostEqCurves: canonicalResult.canonicalPostEqSeatResponses,
    activeSubs,
    configuredUsableLfHz: usableLfHz,
    p14TargetBasis,
  });
  const achievedP18FrequencyHz = p18?.value ?? null;
  const achievedP18Level = numericLevel(p18?.level);

  // P19: canonical post-EQ RSP versus the canonical target.
  const p19 = computeOfficialP19Assessment({
    rspPostEqCurve: canonicalResult.canonicalPostEqRsp,
    canonicalTargetCurve: canonicalResult.canonicalTargetCurve,
    assessmentStartHz: canonicalResult.assessmentStartHz,
    assessmentEndHz: canonicalResult.assessmentEndHz,
  });
  const achievedP19VariationDb = p19?.variationDbRaw ?? null;
  const achievedP19Level = houseCurveP19Level(achievedP19VariationDb);

  // P20: canonical post-EQ real seats versus the canonical post-EQ RSP.
  const p20 = computeOfficialP20Assessment({
    rspPostEqCurve: canonicalResult.canonicalPostEqRsp,
    perSeatPostEqCurves: canonicalResult.canonicalPostEqSeatResponses,
    assessmentStartHz: canonicalResult.assessmentStartHz,
    assessmentEndHz: canonicalResult.assessmentEndHz,
  });
  const achievedP20VariationDb = p20?.worstSeat?.variationDbRaw ?? null;
  const achievedP20Level = p20?.worstSeat?.level ?? 0;
  const p20Available = !!p20?.available;

  const definitions = getRp22BassOperatingDefinitions(p14TargetBasis);
  const requested = definitions.find((definition) => definition.value === requestedLevel) || definitions.at(-1);
  const postEqCapabilityAssessment = buildPostEqBassCapabilityOutcome({
    authority: null,
    requestedLevel,
    targetAnchorDb: requested?.p14TargetDb ?? null,
    scalarP14: p14,
    achievedP18Level,
    achievedP18FrequencyHz,
    achievedP19Level,
    achievedP19VariationDb,
    achievedP20Level,
    achievedP20VariationDb,
    p20Available,
  });

  return {
    achievedP14Db,
    achievedP14Level,
    achievedP14MinimumLevel: p14?.minimumLevel ?? 0,
    achievedP14RecommendedLevel: p14?.recommendedLevel ?? 0,
    minimumLevel: p14?.minimumLevel ?? 0,
    recommendedLevel: p14?.recommendedLevel ?? 0,
    limitingFrequencyHz: p14?.limitingFrequency ?? null,
    headroomConsumedByEqDb: p14?.headroomConsumedByEqDb ?? null,
    p14CapabilityDetails: p14,
    p14TargetBasis,
    achievedP18FrequencyHz,
    achievedP18Level,
    p18AchievedAuthority: p18 ? {
      ...p18,
      operatingP14CapabilityDb: achievedP14Db,
      operatingP14Level: achievedP14Level,
    } : null,
    p18Limitation: achievedP18FrequencyHz == null || achievedP18Level === 0
      ? "Canonical post-EQ extension does not achieve P18 Level 1"
      : null,
    achievedP19VariationDb,
    achievedP19Level,
    officialP19VariationDb: achievedP19VariationDb,
    officialP19WorstFrequencyHz: p19?.worstFrequencyHz ?? null,
    achievedP20VariationDb,
    achievedP20Level,
    worstP20SeatId: p20?.worstSeat?.seatId ?? null,
    perSeatP20Results: p20?.perSeatResults || [],
    p20Available,
    postEqCapabilityAssessment,
    limitation: postEqCapabilityAssessment.limitation,
  };
}