import { createBassAnalysisResult, createBassParameterResult } from "./bassAnalysisContract.js";
import { formatBassResults } from "./bassResultsPresentation.js";
import { buildComplianceBassExportData, buildComplianceBassPresentation } from "./bassCompliancePresentation.js";
import { attachAuthoritativeP19ToSeatSnapshot, attachAuthoritativeP20ToSeatSnapshot, buildSeatHudParameterRows } from "@/components/room/seatHudPresentation";
import { RP22_SEAT_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";
import { buildPersistedBassAuthority, resolvePersistedBassAuthority } from "./completedBassResultPersistence.js";

const FP = "cal:v1:ownership123456";
const contractFixture = () => {
  const contract = createBassAnalysisResult();
  Object.assign(contract.job, { status: "complete", currentJobFingerprint: FP, resultFingerprint: FP, completedAtMs: 100 });
  contract.selectedCandidateId = "candidate-authoritative";
  contract.selectedCandidate = {
    perSeatP19Results: [
      { seatId: "s1", variationDbRaw: 2.2, level: 3 },
      { seatId: "s2", variationDbRaw: 3.2, level: 2 },
    ],
    perSeatP20Results: [
      { seatId: "s1", variationDbRaw: 0.2, displayVariationDb: 0, level: "L4" },
      { seatId: "s2", variationDbRaw: 4.9, displayVariationDb: 4, level: "L2" },
    ],
  };
  contract.productAnalysis.parameters = {
    p14: createBassParameterResult({ parameter: "P14", status: "complete", level: 3, value: 116.2, recommendedLevel: 1, recommendedDetail: "Recommended target: L1 achieved" }),
    p18: createBassParameterResult({ parameter: "P18", status: "complete", level: 3, value: 18.9 }),
    p19: createBassParameterResult({ parameter: "P19", status: "complete", level: 1, value: 4.7 }),
    p20: createBassParameterResult({ parameter: "P20", status: "complete", level: 2, value: 4.9 }),
  };
  return contract;
};

const baseSnapshot = { rp22: Object.fromEntries(RP22_SEAT_PARAMETERS.map(({ number }) => [`p${number}`, { formatted: `${number}`, level: "L2" }])) };
const withBassSeat = (contract, seatId, isRsp) => attachAuthoritativeP20ToSeatSnapshot(
  attachAuthoritativeP19ToSeatSnapshot(baseSnapshot, seatId, isRsp, contract.productAnalysis.parameters.p19, contract.selectedCandidate.perSeatP19Results),
  seatId,
  contract.selectedCandidate.perSeatP20Results,
);

export function runBassResultOwnershipParityFixtures() {
  const checks = [];
  const check = (name, passed) => checks.push({ name, passed: !!passed });
  const contract = contractFixture();
  const simulation = formatBassResults(contract);
  const compliance = buildComplianceBassPresentation(contract);
  const pdf = buildComplianceBassExportData(contract);
  const expectedSeatOrder = "1,4,5,6,9,10,16,17,19,20";
  const rows = buildSeatHudParameterRows(baseSnapshot);

  check("1. Seat HUD contains P19 and P20 in canonical order", rows.map((row) => row.parameter.number).join(",") === expectedSeatOrder);
  check("2. Seat HUD excludes P14 P18 and P21", !rows.some((row) => [14, 18, 21].includes(row.parameter.number)));
  const emptyRows = buildSeatHudParameterRows({ rp22: {} });
  check("3. Every seat-scoped row remains present when unavailable", emptyRows.map((row) => row.parameter.number).join(",") === expectedSeatOrder && emptyRows.every((row) => row.valueText === "—"));

  const rsp = withBassSeat(contract, "s1", true);
  const other = withBassSeat(contract, "s2", false);
  check("4. RSP P19 uses official authoritative result", rsp.rp22.p19.formatted === "±4 dB" && rsp.rp22.p19.source === "official-authoritative-rsp-p19");
  check("5. Real-seat P19 uses existing authoritative seat metric", other.rp22.p19.formatted === "±3 dB" && other.rp22.p19.source === "authoritative-per-seat-house-curve");
  const missingP19 = attachAuthoritativeP19ToSeatSnapshot(baseSnapshot, "missing", false, contract.productAnalysis.parameters.p19, contract.selectedCandidate.perSeatP19Results);
  check("6. Missing real-seat P19 remains a visible dash", buildSeatHudParameterRows(missingP19).find((row) => row.parameter.number === 19)?.valueText === "—");
  check("7. Selecting another seat changes only seat-local bass metrics", rsp.rp22.p1 === other.rp22.p1 && rsp.rp22.p19.formatted !== other.rp22.p19.formatted && rsp.rp22.p20.formatted !== other.rp22.p20.formatted);
  check("8. Non-RSP P19 never overwrites official report P19", other.rp22.p19.value !== contract.productAnalysis.parameters.p19.value && compliance.parameters.p19.valueText === "±4 dB");
  check("9. Numeric P20 zero displays canonically", rsp.rp22.p20.formatted === "±0 dB" && rsp.rp22.p20.level === "L4");

  check("10. Bass Simulation compliance and PDF share exact parameter values and levels", ["p14", "p18", "p19", "p20"].every((key) => pdf.parameters[key].valueText === compliance.parameters[key].valueText && pdf.parameters[key].level === compliance.parameters[key].level && simulation.pills[key].text.includes(compliance.parameters[key].valueText)));
  check("10a. P14 raw authority and recommended detail are identical on all surfaces", simulation.parameterValues.p14 === compliance.parameters.p14.rawValue && compliance.parameters.p14.rawValue === pdf.parameters.p14.rawValue && simulation.pills.p14.detail === compliance.parameters.p14.detail && compliance.parameters.p14.detail === pdf.parameters.p14.detail);
  check("11. All three surfaces share fingerprint and selected candidate", simulation.resultFingerprint === FP && compliance.resultFingerprint === FP && pdf.resultFingerprint === FP && simulation.selectedCandidateId === contract.selectedCandidateId && compliance.selectedCandidateId === contract.selectedCandidateId && pdf.selectedCandidateId === contract.selectedCandidateId);

  const persisted = buildPersistedBassAuthority(null, FP, contract);
  const newPageAuthority = resolvePersistedBassAuthority("project-1", JSON.parse(JSON.stringify(persisted)));
  check("12. New page context restores identical completed result", newPageAuthority.exportable && newPageAuthority.contract.job.resultFingerprint === FP && newPageAuthority.contract.selectedCandidateId === contract.selectedCandidateId);
  const updating = resolvePersistedBassAuthority("project-1", buildPersistedBassAuthority(persisted, "cal:v1:newfingerprint", null));
  check("13. Export is blocked without a current completed fingerprint", !updating.exportable && updating.status === "updating" && updating.contract === null && updating.staleContract?.job?.resultFingerprint === FP);
  const refreshingSameFingerprint = resolvePersistedBassAuthority("project-1", buildPersistedBassAuthority(persisted, FP, null, true));
  check("14. A recalculating matching fingerprint remains stale and non-exportable", !refreshingSameFingerprint.exportable && refreshingSameFingerprint.staleContract?.job?.resultFingerprint === FP);
  check("15. PDF reads completed authority without independent bass calculation", pdf.completed && pdf.source === "completed-authoritative-bass-result" && pdf.independentBassCalculation === false);

  const passed = checks.filter((item) => item.passed).length;
  return { checks, passed, total: checks.length, allPassed: passed === checks.length };
}