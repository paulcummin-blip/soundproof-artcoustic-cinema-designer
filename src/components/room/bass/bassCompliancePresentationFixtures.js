// C6.2D1 — Central Bass Presentation Gate fixtures.
// Tests bassCompliancePresentation.js fail-closed behaviour for NOT_VERIFIED authority.
import { createBassAnalysisResult, createBassParameterResult } from "./bassAnalysisContract";
import { buildComplianceBassPresentation, buildComplianceBassExportData } from "./bassCompliancePresentation";

const FP = "cal:v1:c6d1verified0001";

function buildVerifiedContract() {
  const contract = createBassAnalysisResult();
  Object.assign(contract.job, { status: "complete", currentJobFingerprint: FP, resultFingerprint: FP, completedAtMs: 100 });
  contract.selectedCandidateId = "candidate-verified";
  contract.metricPublication = { canonicalMetricPublicationValid: true, publicationRejectionReason: null };
  const p14 = createBassParameterResult({ parameter: "P14", status: "complete", level: 3, value: 121.3, unit: "dBC", targetBasis: "recommended", targetBasisDetail: "Target basis: Recommended" });
  Object.assign(p14, { achievedCapabilityDb: 121.3, requestedTargetDb: 123, headroomOrShortfallDb: -1.7, achievedLevel: 3, selectedLevel: 4, pass: false, p14CapabilitySource: "canonicalMetricAuthority" });
  contract.productAnalysis.parameters = {
    p14,
    p18: createBassParameterResult({ parameter: "P18", status: "complete", level: 3, value: 18.9 }),
    p19: createBassParameterResult({ parameter: "P19", status: "complete", level: 1, value: 4.7 }),
    p20: createBassParameterResult({ parameter: "P20", status: "complete", level: 2, value: 4.9 }),
  };
  contract.selectedCandidate = { perSeatP20Results: [{ seatId: "s1", variationDbRaw: 0.2, displayVariationDb: 0, level: "L4" }] };
  return contract;
}

function buildNotVerifiedContract() {
  const contract = buildVerifiedContract();
  contract.metricPublication = { canonicalMetricPublicationValid: false, publicationRejectionReason: "graph-parity-failed" };
  return contract;
}

export function runBassCompliancePresentationFixtures() {
  const checks = [];
  const check = (test, expected, actual, passed) => checks.push({ test, expected, actual, passed: !!passed });

  // --- Case A: Verified authority ---
  const verifiedContract = buildVerifiedContract();
  const verifiedAuthority = { contract: verifiedContract, authoritative: true, publicationRejectionReason: null };
  const verifiedPresentation = buildComplianceBassPresentation({ completedBassAuthority: verifiedAuthority });
  const verifiedExport = buildComplianceBassExportData({ completedBassAuthority: verifiedAuthority });

  check("A1. Verified P14 valueText is normal", true, verifiedPresentation.parameters.p14.valueText !== "NOT VERIFIED", verifiedPresentation.parameters.p14.valueText !== "NOT VERIFIED");
  check("A2. Verified P14 isAuthoritative", true, verifiedPresentation.parameters.p14.isAuthoritative, verifiedPresentation.parameters.p14.isAuthoritative === true);
  check("A3. Verified P18 level normal", "L3", verifiedPresentation.parameters.p18.level, verifiedPresentation.parameters.p18.level === "L3");
  check("A4. Verified export authority", "VALID", verifiedExport.authority, verifiedExport.authority === "VALID");
  check("A5. Verified export source", "completed-authoritative-bass-result", verifiedExport.source, verifiedExport.source === "completed-authoritative-bass-result");
  check("A6. Verified publicationVerified", true, verifiedPresentation.publicationVerified, verifiedPresentation.publicationVerified === true);

  // --- Case B: NOT_VERIFIED authority ---
  const notVerifiedContract = buildNotVerifiedContract();
  const notVerifiedAuthority = { contract: notVerifiedContract, authoritative: true, publicationRejectionReason: "graph-parity-failed" };
  const notVerifiedPresentation = buildComplianceBassPresentation({ completedBassAuthority: notVerifiedAuthority });
  const notVerifiedExport = buildComplianceBassExportData({ completedBassAuthority: notVerifiedAuthority });

  check("B1. NotVerified P14 valueText", "NOT VERIFIED", notVerifiedPresentation.parameters.p14.valueText, notVerifiedPresentation.parameters.p14.valueText === "NOT VERIFIED");
  check("B2. NotVerified P14 level", "NOT VERIFIED", notVerifiedPresentation.parameters.p14.level, notVerifiedPresentation.parameters.p14.level === "NOT VERIFIED");
  check("B3. NotVerified P14 isAuthoritative", false, notVerifiedPresentation.parameters.p14.isAuthoritative, notVerifiedPresentation.parameters.p14.isAuthoritative === false);
  check("B4. NotVerified P14 rawValue retained", 121.3, notVerifiedPresentation.parameters.p14.rawValue, notVerifiedPresentation.parameters.p14.rawValue === 121.3);
  check("B5. NotVerified rejection reason retained", "graph-parity-failed", notVerifiedPresentation.parameters.p14.publicationRejectionReason, notVerifiedPresentation.parameters.p14.publicationRejectionReason === "graph-parity-failed");
  check("B6. NotVerified export authority", "NOT_VERIFIED", notVerifiedExport.authority, notVerifiedExport.authority === "NOT_VERIFIED");
  check("B7. NotVerified export source not authoritative", true, notVerifiedExport.source !== "completed-authoritative-bass-result", notVerifiedExport.source !== "completed-authoritative-bass-result");
  check("B8. NotVerified export rejection reason", "graph-parity-failed", notVerifiedExport.publicationRejectionReason, notVerifiedExport.publicationRejectionReason === "graph-parity-failed");
  check("B9. NotVerified P18 valueText", "NOT VERIFIED", notVerifiedPresentation.parameters.p18.valueText, notVerifiedPresentation.parameters.p18.valueText === "NOT VERIFIED");

  // --- Case C: Structurally complete contract with missing authority wrapper ---
  const bareContract = buildVerifiedContract();
  const barePresentation = buildComplianceBassPresentation({ completedBassAuthority: { contract: bareContract } });
  check("C1. Bare contract fails closed", "NOT VERIFIED", barePresentation.parameters.p14.valueText, barePresentation.parameters.p14.valueText === "NOT VERIFIED");
  check("C2. Bare contract isAuthoritative false", false, barePresentation.parameters.p14.isAuthoritative, barePresentation.parameters.p14.isAuthoritative === false);
  check("C3. Bare contract publicationVerified false", false, barePresentation.publicationVerified, barePresentation.publicationVerified === false);

  // --- Case D: P14 field propagation (verified) ---
  const p14 = verifiedPresentation.parameters.p14;
  check("D1. P14 achievedCapabilityDb", 121.3, p14.achievedCapabilityDb, p14.achievedCapabilityDb === 121.3);
  check("D2. P14 requestedTargetDb", 123, p14.requestedTargetDb, p14.requestedTargetDb === 123);
  check("D3. P14 achievedLevel", 3, p14.achievedLevel, p14.achievedLevel === 3);
  check("D4. P14 selectedLevel", 4, p14.selectedLevel, p14.selectedLevel === 4);
  check("D5. P14 pass", false, p14.pass, p14.pass === false);
  check("D6. P14 headroomOrShortfallDb", -1.7, p14.headroomOrShortfallDb, p14.headroomOrShortfallDb === -1.7);
  check("D7. P14 p14CapabilitySource", "canonicalMetricAuthority", p14.p14CapabilitySource, p14.p14CapabilitySource === "canonicalMetricAuthority");
  check("D8. P14 main value is achieved capability (not requested target)", true, p14.rawValue === 121.3 && p14.rawValue !== 123, p14.rawValue === 121.3 && p14.rawValue !== 123);

  // --- Case D2: P14 field propagation (NOT_VERIFIED — raw diagnostic retained) ---
  const nvP14 = notVerifiedPresentation.parameters.p14;
  check("D2-1. NotVerified P14 achievedCapabilityDb retained", 121.3, nvP14.achievedCapabilityDb, nvP14.achievedCapabilityDb === 121.3);
  check("D2-2. NotVerified P14 requestedTargetDb retained", 123, nvP14.requestedTargetDb, nvP14.requestedTargetDb === 123);
  check("D2-3. NotVerified P14 achievedLevel retained", 3, nvP14.achievedLevel, nvP14.achievedLevel === 3);
  check("D2-4. NotVerified P14 selectedLevel retained", 4, nvP14.selectedLevel, nvP14.selectedLevel === 4);
  check("D2-5. NotVerified P14 pass retained", false, nvP14.pass, nvP14.pass === false);
  check("D2-6. NotVerified P14 headroomOrShortfallDb retained", -1.7, nvP14.headroomOrShortfallDb, nvP14.headroomOrShortfallDb === -1.7);
  check("D2-7. NotVerified P14 p14CapabilitySource retained", "canonicalMetricAuthority", nvP14.p14CapabilitySource, nvP14.p14CapabilitySource === "canonicalMetricAuthority");

  // --- Case A: Unverified P18 carrying status: not_applicable ---
  // C6.2D1A: Publication gate takes precedence over not_applicable for P14/P18/P19.
  const unverifiedNaContract = buildVerifiedContract();
  unverifiedNaContract.metricPublication = { canonicalMetricPublicationValid: false, publicationRejectionReason: "graph-parity-failed" };
  unverifiedNaContract.productAnalysis.parameters.p18 = createBassParameterResult({ parameter: "P18", status: "not_applicable", level: null, value: null });
  const unverifiedNaAuthority = { contract: unverifiedNaContract, authoritative: true, publicationRejectionReason: "graph-parity-failed" };
  const unverifiedNaPresentation = buildComplianceBassPresentation({ completedBassAuthority: unverifiedNaAuthority });
  check("A1. Unverified P18 not_applicable valueText", "NOT VERIFIED", unverifiedNaPresentation.parameters.p18.valueText, unverifiedNaPresentation.parameters.p18.valueText === "NOT VERIFIED");
  check("A2. Unverified P18 not_applicable level", "NOT VERIFIED", unverifiedNaPresentation.parameters.p18.level, unverifiedNaPresentation.parameters.p18.level === "NOT VERIFIED");
  check("A3. Unverified P18 isAuthoritative", false, unverifiedNaPresentation.parameters.p18.isAuthoritative, unverifiedNaPresentation.parameters.p18.isAuthoritative === false);
  check("A4. Unverified P18 rejection reason retained", "graph-parity-failed", unverifiedNaPresentation.parameters.p18.publicationRejectionReason, unverifiedNaPresentation.parameters.p18.publicationRejectionReason === "graph-parity-failed");

  // --- Case B: P20 carrying status: not_applicable (verified) ---
  // C6.2D1A: P20 may return N/A when genuinely not applicable, before the publication gate.
  const p20NaContract = buildVerifiedContract();
  p20NaContract.productAnalysis.parameters.p20 = createBassParameterResult({ parameter: "P20", status: "not_applicable", level: null, value: null });
  const p20NaAuthority = { contract: p20NaContract, authoritative: true, publicationRejectionReason: null };
  const p20NaPresentation = buildComplianceBassPresentation({ completedBassAuthority: p20NaAuthority });
  check("B1. Verified P20 not_applicable valueText", "N/A", p20NaPresentation.parameters.p20.valueText, p20NaPresentation.parameters.p20.valueText === "N/A");
  check("B2. Verified P20 not_applicable level", "N/A", p20NaPresentation.parameters.p20.level, p20NaPresentation.parameters.p20.level === "N/A");

  // --- Case B2: P20 carrying status: not_applicable (NOT verified) ---
  // P20 N/A should still take precedence even when publication is invalid.
  const p20NaUnverifiedContract = buildVerifiedContract();
  p20NaUnverifiedContract.metricPublication = { canonicalMetricPublicationValid: false, publicationRejectionReason: "graph-parity-failed" };
  p20NaUnverifiedContract.productAnalysis.parameters.p20 = createBassParameterResult({ parameter: "P20", status: "not_applicable", level: null, value: null });
  const p20NaUnverifiedPresentation = buildComplianceBassPresentation({ completedBassAuthority: { contract: p20NaUnverifiedContract, authoritative: true, publicationRejectionReason: "graph-parity-failed" } });
  check("B2-1. Unverified P20 not_applicable valueText", "N/A", p20NaUnverifiedPresentation.parameters.p20.valueText, p20NaUnverifiedPresentation.parameters.p20.valueText === "N/A");
  check("B2-2. Unverified P20 not_applicable level", "N/A", p20NaUnverifiedPresentation.parameters.p20.level, p20NaUnverifiedPresentation.parameters.p20.level === "N/A");

  // --- Case C: Structurally complete contract with missing authority wrapper ---
  // C6.2D1A: Must get deterministic rejection reason, not null.
  const bareContract2 = buildVerifiedContract();
  const bareAuthorityMissing = { contract: bareContract2 }; // no authoritative field
  const bareMissingPresentation = buildComplianceBassPresentation({ completedBassAuthority: bareAuthorityMissing });
  check("C1. Missing authority publicationVerified", false, bareMissingPresentation.publicationVerified, bareMissingPresentation.publicationVerified === false);
  check("C2. Missing authority rejection reason", "completed-authority-not-authoritative", bareMissingPresentation.publicationRejectionReason, bareMissingPresentation.publicationRejectionReason === "completed-authority-not-authoritative");
  check("C3. Missing authority P14 valueText", "NOT VERIFIED", bareMissingPresentation.parameters.p14.valueText, bareMissingPresentation.parameters.p14.valueText === "NOT VERIFIED");

  // --- Case C2: Authority wrapper entirely missing (null) ---
  const nullAuthorityPresentation = buildComplianceBassPresentation({ completedBassAuthority: { contract: bareContract2 } });
  // contract exists but authority wrapper has no authoritative field
  check("C2-1. Null authoritative field rejection reason", "completed-authority-not-authoritative", nullAuthorityPresentation.publicationRejectionReason, nullAuthorityPresentation.publicationRejectionReason === "completed-authority-not-authoritative");

  // --- Case C3: Authoritative=true but metricPublication missing ---
  const noPublicationContract = buildVerifiedContract();
  delete noPublicationContract.metricPublication;
  const noPublicationPresentation = buildComplianceBassPresentation({ completedBassAuthority: { contract: noPublicationContract, authoritative: true, publicationRejectionReason: null } });
  check("C3-1. Missing metricPublication rejection reason", "metric-publication-receipt-missing", noPublicationPresentation.publicationRejectionReason, noPublicationPresentation.publicationRejectionReason === "metric-publication-receipt-missing");
  check("C3-2. Missing metricPublication P14 valueText", "NOT VERIFIED", noPublicationPresentation.parameters.p14.valueText, noPublicationPresentation.parameters.p14.valueText === "NOT VERIFIED");

  // --- Case C4: Authoritative=true, metricPublication exists but canonicalMetricPublicationValid !== true ---
  const invalidPublicationContract = buildVerifiedContract();
  invalidPublicationContract.metricPublication = { canonicalMetricPublicationValid: false, publicationRejectionReason: null }; // no stored reason
  const invalidPublicationPresentation = buildComplianceBassPresentation({ completedBassAuthority: { contract: invalidPublicationContract, authoritative: true, publicationRejectionReason: null } });
  check("C4-1. Invalid publication fallback rejection reason", "metric-publication-not-verified", invalidPublicationPresentation.publicationRejectionReason, invalidPublicationPresentation.publicationRejectionReason === "metric-publication-not-verified");

  // --- Case E: Export cleanup — invalid export contains required fields ---
  const invalidExport = buildComplianceBassExportData({ completedBassAuthority: notVerifiedAuthority });
  check("E1. Invalid export authority", "NOT_VERIFIED", invalidExport.authority, invalidExport.authority === "NOT_VERIFIED");
  check("E2. Invalid export non-authoritative source", "completed-bass-result-not-verified", invalidExport.source, invalidExport.source === "completed-bass-result-not-verified");
  check("E3. Invalid export rejection reason", "graph-parity-failed", invalidExport.publicationRejectionReason, invalidExport.publicationRejectionReason === "graph-parity-failed");
  check("E4. Invalid export P14 rawValue retained", 121.3, invalidExport.parameters.p14.rawValue, invalidExport.parameters.p14.rawValue === 121.3);
  check("E5. Invalid export P14 level NOT authoritative", "NOT VERIFIED", invalidExport.parameters.p14.level, invalidExport.parameters.p14.level === "NOT VERIFIED");
  check("E6. Invalid export P18 level NOT authoritative", "NOT VERIFIED", invalidExport.parameters.p18.level, invalidExport.parameters.p18.level === "NOT VERIFIED");

  const passed = checks.filter((item) => item.passed).length;
  return { checks, passed, total: checks.length, allPassed: passed === checks.length };
}