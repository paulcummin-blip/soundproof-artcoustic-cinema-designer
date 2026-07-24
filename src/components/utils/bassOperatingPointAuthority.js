import { DESIGN_EQ_FIT_PROFILES } from "@/components/utils/designEqCalibration";
import {
  assessP14Capability,
  p14ThresholdsForBasis,
} from "@/components/utils/p14CapabilityAuthority";
import { calculatePairedP14P18ProductionAuthority } from "@/components/utils/pairedP14P18ProductionAuthority";

const clampLevel = (value) => Math.max(1, Math.min(4, Math.round(Number(value) || 4)));
const levelKey = (value) => `L${clampLevel(value)}`;

function pairedLevel(assessment, reserveDb) {
  const passingWithReserve = [4, 3, 2, 1].find((level) => {
    const result = assessment?.levels?.[`L${level}`];
    return result?.status === "PASS" && Number(result?.marginDb) >= reserveDb;
  });
  return passingWithReserve ?? 0;
}

function availableEqHeadroomDb() {
  const limits = Object.values(DESIGN_EQ_FIT_PROFILES)
    .map((profile) => Number(profile?.maximumAggregateBoostDb))
    .filter(Number.isFinite);
  return limits.length ? Math.min(...limits) : 0;
}

function selectOperatingGrade({ requestedLevel, achievableMinimumLevel, achievableRecommendedLevel }) {
  const requested = clampLevel(requestedLevel);
  const recommended = Math.min(requested, achievableRecommendedLevel);
  if (recommended > 0) return { level: recommended, basis: "recommended" };
  const minimum = Math.min(requested, achievableMinimumLevel);
  return { level: minimum, basis: minimum > 0 ? "minimum" : null };
}

export function assessBassOperatingPoint({
  activeSubs = [],
  perSourceComplexTransfers = [],
  requestedLevel = 4,
} = {}) {
  const requested = clampLevel(requestedLevel);
  const continuousAuthority = assessP14Capability({ activeSubs, combinedEqCurve: [] });
  const roomAuthority = calculatePairedP14P18ProductionAuthority({
    activeSubs,
    perSourceComplexTransfers,
    combinedEqCurve: [],
    targetBasis: "minimum",
  });
  const reserveDb = continuousAuthority?.safetyMarginDb ?? 0;
  const pairedMinimumLevel = pairedLevel(roomAuthority?.assessments?.minimum, reserveDb);
  const pairedRecommendedLevel = pairedLevel(roomAuthority?.assessments?.recommended, reserveDb);
  const roomAware = roomAuthority?.status !== "INCOMPLETE DATA";
  const achievableMinimumLevel = roomAware
    ? pairedMinimumLevel
    : continuousAuthority?.minimumLevel ?? 0;
  const achievableRecommendedLevel = roomAware
    ? pairedRecommendedLevel
    : continuousAuthority?.recommendedLevel ?? 0;
  const selected = selectOperatingGrade({
    requestedLevel: requested,
    achievableMinimumLevel,
    achievableRecommendedLevel,
  });
  const selectedThresholds = selected.basis ? p14ThresholdsForBasis(selected.basis) : null;
  const targetAnchorDb = selected.level > 0 ? selectedThresholds?.[levelKey(selected.level)] ?? null : null;
  const reason = selected.level < requested
    ? "Subwoofer capability limits maximum continuous LFE output."
    : null;

  return {
    requestedLevel: requested,
    achievableMinimumLevel,
    achievableRecommendedLevel,
    selectedOperatingLevel: selected.level,
    selectedOperatingBasis: selected.basis,
    targetAnchorDb,
    continuousBassCapabilityDb: continuousAuthority?.p14CapabilityDb ?? null,
    rawContinuousBassCapabilityDb: continuousAuthority?.rawCapabilityDb ?? null,
    safetyMarginDb: continuousAuthority?.safetyMarginDb ?? null,
    eqHeadroomConsumedDb: 0,
    eqHeadroomAvailableDb: availableEqHeadroomDb(),
    reason,
    roomAware,
    source: roomAware
      ? "position-aware-paired-capability-preflight"
      : "frequency-dependent-product-capability-preflight",
    continuousCapabilityAuthority: continuousAuthority,
    roomCapabilityAuthority: roomAuthority,
  };
}