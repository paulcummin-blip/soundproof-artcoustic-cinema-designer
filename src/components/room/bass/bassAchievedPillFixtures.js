import { formatOfficialBassResults } from "./bassResultsPresentation.js";
import {
  BASS_ANALYSIS_CONTRACT_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "../../../../base44/shared/bassAuthorityVersion.js";

function completedAuthority() {
  const fingerprint = "cal:v5:1234567890abcdef|engine:v31";
  return {
    authoritative: true,
    authorityStatus: "AUTHORITATIVE",
    contract: {
      version: BASS_ANALYSIS_CONTRACT_VERSION,
      metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
      job: {
        status: "complete",
        metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
        resultFingerprint: fingerprint,
        currentJobFingerprint: fingerprint,
      },
      selectedCandidateId: "candidate-achieved-pill",
      selectedCandidate: {
        id: "candidate-achieved-pill",
        perSeatP19Results: [],
        perSeatP20Results: [],
      },
      provenance: { realSeatCount: 0 },
      metricPublication: { canonicalMetricPublicationValid: true },
      productAnalysis: {
        parameters: {
          p14: {
            status: "complete",
            level: 2,
            value: 112,
            achievedCapabilityDb: 118.4,
            targetBasis: "minimum",
            targetBasisDetail: "Minimum target",
          },
          p18: {
            status: "complete",
            level: 3,
            value: 20.4,
            targetBasis: "minimum",
            targetBasisDetail: "Minimum thresholds",
          },
          p19: { status: "complete", level: 2, value: 3 },
          p20: { status: "not_applicable", level: null, value: null },
        },
      },
    },
  };
}

export function runBassAchievedPillFixtures() {
  const checks = [];
  const check = (name, passed, actual = null) => checks.push({ name, passed: passed === true, actual });
  const authority = completedAuthority();

  const minimum = formatOfficialBassResults(
    authority, { status: "ready" }, [], Date.now(), false,
    { p14TargetBasis: "minimum", p18TargetBasis: "minimum" },
  );
  check("P14 shows achieved level and achieved value",
    minimum.pills.p14.resultText === "L4 · 118 dBC", minimum.pills.p14.resultText);
  check("P18 shows level then achieved value",
    minimum.pills.p18.resultText === "L3 · 20 Hz", minimum.pills.p18.resultText);

  const recommended = formatOfficialBassResults(
    authority, { status: "ready" }, [], Date.now(), false,
    { p14TargetBasis: "recommended", p18TargetBasis: "recommended" },
  );
  check("P14 regrades achieved value for selected basis",
    recommended.pills.p14.resultText === "L2 · 118 dBC", recommended.pills.p14.resultText);
  check("P18 regrades achieved extension without recalculation",
    recommended.pills.p18.resultText === "L2 · 20 Hz", recommended.pills.p18.resultText);

  const passed = checks.filter((item) => item.passed).length;
  return { checks, passed, total: checks.length, allPassed: passed === checks.length };
}
