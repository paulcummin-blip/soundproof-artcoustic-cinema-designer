import { calculatePairedP14P18ProductionAuthority } from "@/components/utils/pairedP14P18ProductionAuthority";
import { buildPairedP14P18CandidateSummary } from "@/components/utils/pairedP14P18CandidateSummary";
import { rankBassCandidates } from "@/components/utils/bassPriorityPolicies";

const summaryKeys = [
  "status", "selectedTargetBasis", "minimumWinningLevel", "recommendedWinningLevel",
  "selectedWinningLevel", "selectedP18ExtensionHz", "limitingFrequencyHz", "marginDb",
  "shortfallDb", "broadMiss", "severeNull", "authorityMethod", "authorityVersion", "schemaVersion",
];

export function runPairedP14P18CandidateAttachmentFixtures() {
  const checks = [];
  const check = (name, passed) => checks.push({ name, passed: !!passed });
  const referenceAmplitude = Math.pow(10, 94 / 20);
  const authority = calculatePairedP14P18ProductionAuthority({
    targetBasis: "recommended",
    activeSubs: [{
      id: "summary-source",
      modelKey: "synthetic",
      shadowCapabilityCurve: [{ frequency: 15, spl: 124 }, { frequency: 120, spl: 124 }],
    }],
    perSourceComplexTransfers: [{
      sourceId: "summary-source",
      points: [{ frequency: 15, re: referenceAmplitude, im: 0 }, { frequency: 120, re: referenceAmplitude, im: 0 }],
    }],
  });
  const summary = buildPairedP14P18CandidateSummary(authority);

  check("Summary has the exact required keys", JSON.stringify(Object.keys(summary)) === JSON.stringify(summaryKeys));
  check("Summary status comes from authority", summary.status === authority.status);
  check("Summary basis comes from authority", summary.selectedTargetBasis === authority.selectedTargetBasis);
  check("Summary Minimum winner comes from authority", summary.minimumWinningLevel === authority.assessments.minimum.winningLevel);
  check("Summary Recommended winner comes from authority", summary.recommendedWinningLevel === authority.assessments.recommended.winningLevel);
  check("Summary selected winner comes from authority", summary.selectedWinningLevel === authority.assessments.recommended.winningLevel);
  check("Summary selected extension comes from authority", summary.selectedP18ExtensionHz === authority.assessments.recommended.p18.extensionHz);
  check("Summary limiting metrics come from authority", ["limitingFrequencyHz", "marginDb", "shortfallDb", "broadMiss", "severeNull"].every((key) => summary[key] === authority.limitingResult[key]));
  check("Summary identity comes from authority", summary.authorityMethod === authority.authority.method && summary.authorityVersion === authority.authority.version && summary.schemaVersion === authority.schemaVersion);

  const base = {
    candidateId: "unchanged", candidateSignature: "unchanged", achievedP14Level: 1,
    achievedP18Level: 1, achievedP19Level: 1, achievedP14Db: 110,
    achievedP18FrequencyHz: 30, achievedP19VariationDb: 4, allAtLeastL1: true,
    bankValidationResult: { allOk: true }, generatedFilterBank: [], finalPostEqCurve: [],
  };
  const diagnostic = { ...base, pairedP14P18Authority: authority, pairedP14P18Summary: summary };
  for (const mode of ["balanced", "house_curve_accuracy", "depth", "spl"]) {
    check(`${mode} selection ignores paired diagnostics`, rankBassCandidates([base], mode).selected?.candidateId === rankBassCandidates([diagnostic], mode).selected?.candidateId);
  }

  const passed = checks.filter((item) => item.passed).length;
  return { checks, passed, total: checks.length, allPassed: passed === checks.length };
}