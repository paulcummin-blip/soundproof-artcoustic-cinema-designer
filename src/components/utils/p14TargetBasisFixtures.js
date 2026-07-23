import { createBassAnalysisResult, createBassParameterResult } from "@/components/room/bass/bassAnalysisContract";
import { BassBackgroundAnalysisController } from "@/components/room/bass/bassBackgroundAnalysisStore";
import { buildComplianceBassPresentation } from "@/components/room/bass/bassCompliancePresentation";
import { buildPersistedBassAuthority, resolvePersistedBassAuthority } from "@/components/room/bass/completedBassResultPersistence";
import { computeCalibrationFingerprint, computeGeometryFingerprint, computeProductFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";
import { formatBassResults } from "@/components/room/bass/bassResultsPresentation";
import { serializeProject } from "@/components/utils/serializeProject";
import { formatP14Capability, gradeP14ForBasis } from "@/components/utils/p14CapabilityAuthority";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";

const FP_MIN = "cal:v1:1111111111111111";
const FP_REC = "cal:v1:2222222222222222";

function completedContract(fingerprint, basis, value, level) {
  const contract = createBassAnalysisResult();
  Object.assign(contract.job, { status: "ready", currentJobFingerprint: fingerprint, resultFingerprint: fingerprint, completedAtMs: 1 });
  contract.selectedCandidateId = `candidate-${basis}`;
  contract.selectedCandidate = { id: contract.selectedCandidateId, p14TargetBasis: basis };
  contract.productAnalysis.parameters.p14 = createBassParameterResult({ parameter: "P14", status: "complete", value, level, unit: "dBC", targetBasis: basis, targetBasisDetail: `Target basis: ${basis === "recommended" ? "Recommended" : "Minimum"}` });
  return contract;
}

export function runP14TargetBasisFixtures() {
  const checks = [];
  const check = (test, expected, actual, passed, delta = 0) => checks.push({ test, expected, actual, delta, passed: !!passed });

  const minimum = [[108.999, 0], [109, 1], [111.999, 1], [112, 2], [114.999, 2], [115, 3], [117.999, 3], [118, 4]];
  const recommended = [[113.999, 0], [114, 1], [116.999, 1], [117, 2], [119.999, 2], [120, 3], [122.999, 3], [123, 4]];
  minimum.forEach(([raw, expected]) => check(`Minimum boundary ${raw}`, expected, gradeP14ForBasis(raw, "minimum"), gradeP14ForBasis(raw, "minimum") === expected));
  recommended.forEach(([raw, expected]) => check(`Recommended boundary ${raw}`, expected, gradeP14ForBasis(raw, "recommended"), gradeP14ForBasis(raw, "recommended") === expected));

  const displayed = formatP14Capability(112.4);
  const minimum112 = gradeP14ForBasis(112.4, "minimum");
  const recommended112 = gradeP14ForBasis(112.4, "recommended");
  check("112.4 raw grading versus conservative display rounding", "112 dBC; Minimum L2; Recommended FAIL", `${displayed}; Minimum ${minimum112 ? `L${minimum112}` : "FAIL"}; Recommended ${recommended112 ? `L${recommended112}` : "FAIL"}`, displayed === "112 dBC" && minimum112 === 2 && recommended112 === 0);

  const minDefinitions = getRp22BassOperatingDefinitions("minimum");
  const recDefinitions = getRp22BassOperatingDefinitions("recommended");
  check("P18 and P19 definitions remain independent of P14 basis", "identical", minDefinitions.every((definition, index) => definition.p18LimitHz === recDefinitions[index].p18LimitHz && definition.p18CutoffDb === recDefinitions[index].p18CutoffDb && definition.p19ToleranceDb === recDefinitions[index].p19ToleranceDb) ? "identical" : "changed", minDefinitions.every((definition, index) => definition.p18LimitHz === recDefinitions[index].p18LimitHz && definition.p18CutoffDb === recDefinitions[index].p18CutoffDb && definition.p19ToleranceDb === recDefinitions[index].p19ToleranceDb));

  const base = { roomDims: { widthM: 4, lengthM: 6, heightM: 2.7 }, sources: [{ id: "s1", modelKey: "SUB2-12", x: 1, y: 0.5, z: 0.3 }], seatingPositions: [{ id: "seat", x: 2, y: 3, z: 1.2 }], p14TargetBasis: "minimum" };
  const rec = { ...base, p14TargetBasis: "recommended" };
  check("P14 basis changes calibration fingerprint", "different", computeCalibrationFingerprint(base) === computeCalibrationFingerprint(rec) ? "same" : "different", computeCalibrationFingerprint(base) !== computeCalibrationFingerprint(rec));
  check("P14 basis preserves geometry fingerprint", "same", computeGeometryFingerprint(base) === computeGeometryFingerprint(rec) ? "same" : "different", computeGeometryFingerprint(base) === computeGeometryFingerprint(rec));
  check("P14 basis preserves product fingerprint", "same", computeProductFingerprint(base) === computeProductFingerprint(rec) ? "same" : "different", computeProductFingerprint(base) === computeProductFingerprint(rec));

  const workers = [];
  const timers = [];
  const controller = new BassBackgroundAnalysisController({ workerFactory: () => { const worker = { postMessage(message) { worker.message = message; }, terminate() {} }; workers.push(worker); return worker; }, setTimer: (fn) => (timers.push(fn), timers.length), clearTimer: () => {} });
  controller.updateInputs({ valid: true, fingerprint: FP_MIN, payload: {}, identity: { fingerprint: FP_MIN } });
  controller.updateInputs({ valid: true, fingerprint: FP_REC, payload: {}, identity: { fingerprint: FP_REC } });
  timers.at(-1)?.();
  check("Basis change starts matching bass-analysis job", FP_REC, workers.at(-1)?.message?.fingerprint, workers.length === 1 && workers.at(-1)?.message?.fingerprint === FP_REC);
  controller.dispose();

  const oldContract = completedContract(FP_MIN, "minimum", 112.4, 2);
  const persistedOld = buildPersistedBassAuthority(null, FP_MIN, oldContract);
  const persistedUpdating = buildPersistedBassAuthority(persistedOld, FP_REC, null, true);
  const authority = resolvePersistedBassAuthority("project", persistedUpdating);
  check("Stale P14 basis cannot export", false, authority.exportable, authority.exportable === false && authority.contract === null);

  const saved = serializeProject({ name: "Fixture", roomDims: { widthM: 4, lengthM: 6, heightM: 2.7 }, splConfig: { p13Mode: "recommended", p14Mode: "recommended" }, p12Mode: "half-space", p12Level: 2 });
  const restoredSplConfig = saved.spl_config;
  check("Saved project restores P14 target basis", "recommended", restoredSplConfig?.p14Mode, restoredSplConfig?.p14Mode === "recommended");
  check("Existing P12/P13 persistence unchanged", "half-space/recommended", `${saved.spl_config?.p12_mode}/${restoredSplConfig?.p13Mode}`, saved.spl_config?.p12_mode === "half-space" && restoredSplConfig?.p13Mode === "recommended");

  const minimumContract = completedContract(FP_MIN, "minimum", 112.4, 2);
  const pill = formatBassResults(minimumContract).pills.p14.text;
  const compliance = buildComplianceBassPresentation(minimumContract).parameters.p14;
  const expectedText = "Estimated LFE Capability L2 · 112 dBC — Minimum target";
  const reportText = `Estimated LFE Capability ${compliance.level} · ${compliance.valueText} — ${compliance.targetBasisLabel} target`;
  check("Subwoofers/Bass/Compliance/PDF P14 authority parity", expectedText, `${pill} | ${reportText}`, pill === expectedText && reportText === expectedText);

  const passed = checks.filter((item) => item.passed).length;
  return { checks, passed, total: checks.length, allPassed: passed === checks.length };
}