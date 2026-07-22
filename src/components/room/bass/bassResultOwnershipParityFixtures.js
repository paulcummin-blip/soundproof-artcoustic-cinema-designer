import { createBassAnalysisResult, createBassParameterResult } from "./bassAnalysisContract.js";
import { formatBassResults } from "./bassResultsPresentation.js";
import { buildComplianceBassExportData, buildComplianceBassPresentation } from "./bassCompliancePresentation.js";
import { attachAuthoritativeP20ToSeatSnapshot, buildSeatHudParameterRows } from "@/components/room/seatHudPresentation";
import { RP22_SEAT_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";

const FP = "cal:v1:ownership123456";
const contractFixture = () => {
  const contract = createBassAnalysisResult();
  Object.assign(contract.job, { status: "complete", currentJobFingerprint: FP, resultFingerprint: FP });
  contract.selectedCandidateId = "candidate-authoritative";
  contract.selectedCandidate = { perSeatP20Results: [
    { seatId: "s1", variationDbRaw: 2.2, displayVariationDb: "±2 dB", level: "L3" },
    { seatId: "s2", variationDbRaw: 3.8, displayVariationDb: "±3 dB", level: "L2" },
  ] };
  contract.productAnalysis.parameters = {
    p14: createBassParameterResult({ parameter: "P14", status: "complete", level: 2, value: 116.2 }),
    p18: createBassParameterResult({ parameter: "P18", status: "complete", level: 3, value: 18.9 }),
    p19: createBassParameterResult({ parameter: "P19", status: "complete", level: 1, value: 4.7 }),
    p20: createBassParameterResult({ parameter: "P20", status: "complete", level: 2, value: 3.8 }),
  };
  return contract;
};

const baseSnapshot = { rp22: Object.fromEntries(RP22_SEAT_PARAMETERS.map(({ number }) => [`p${number}`, { formatted: `${number}`, level: "L2" }])) };

export function runBassResultOwnershipParityFixtures() {
  const checks = [];
  const check = (name, passed) => checks.push({ name, passed: !!passed });
  const contract = contractFixture();
  const simulation = formatBassResults(contract);
  const compliance = buildComplianceBassPresentation(contract);
  const pdf = buildComplianceBassExportData(contract);
  check("1. Bass Simulation compliance and PDF share P14-P20 display", ["p14", "p18", "p19", "p20"].every((key) => pdf.parameters[key].valueText === compliance.parameters[key].valueText && pdf.parameters[key].level === compliance.parameters[key].level && simulation.pills[key].text.includes(compliance.parameters[key].valueText)));
  check("2. All consumers share fingerprint and selected candidate", simulation.resultFingerprint === FP && compliance.resultFingerprint === FP && pdf.resultFingerprint === FP && simulation.selectedCandidateId === "candidate-authoritative" && compliance.selectedCandidateId === "candidate-authoritative" && pdf.selectedCandidateId === "candidate-authoritative");
  check("3. Seat HUD presentation has no global bass strip", !buildSeatHudParameterRows(baseSnapshot).some((row) => [14, 18, 19].includes(row.parameter.number)));
  check("4. Seat HUD contains every catalogued seat parameter", buildSeatHudParameterRows(baseSnapshot).map((row) => row.parameter.number).join(",") === RP22_SEAT_PARAMETERS.map((row) => row.number).join(","));
  check("5. Seat HUD contains no room-scoped parameter", buildSeatHudParameterRows(baseSnapshot).every((row) => row.parameter.scope === "Seat"));
  const s1 = attachAuthoritativeP20ToSeatSnapshot(baseSnapshot, "s1", contract.selectedCandidate.perSeatP20Results);
  const s2 = attachAuthoritativeP20ToSeatSnapshot(baseSnapshot, "s2", contract.selectedCandidate.perSeatP20Results);
  check("6. Changing seat changes only selected-seat result", s1.rp22.p20.formatted === "±2 dB" && s2.rp22.p20.formatted === "±3 dB" && s1.rp22.p1 === s2.rp22.p1);
  check("7. Selected-seat P20 matches compliance tile source", s1.rp22.p20.formatted === contract.selectedCandidate.perSeatP20Results[0].displayVariationDb && s1.rp22.p20.level === "L3");
  check("8. Selected-seat data cannot replace official P19 RSP", !s1.rp22.p19 && compliance.parameters.p19.valueText === "±4 dB");
  const missing = attachAuthoritativeP20ToSeatSnapshot(baseSnapshot, "missing", contract.selectedCandidate.perSeatP20Results);
  check("9. Missing seat values display dash", buildSeatHudParameterRows(missing).find((row) => row.parameter.number === 20)?.valueText === "—");
  check("10. PDF reads completed result without independent calculation", pdf.completed && pdf.source === "completed-authoritative-bass-result" && pdf.independentBassCalculation === false);

  const passed = checks.filter((item) => item.passed).length;
  return { checks, passed, total: checks.length, allPassed: passed === checks.length };
}