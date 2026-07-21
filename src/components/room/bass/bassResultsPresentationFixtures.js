import { createBassAnalysisResult, createBassParameterResult } from "./bassAnalysisContract.js";
import { formatBassParameterValue, formatBassResults, engineeringDetailsVisible } from "./bassResultsPresentation.js";
import { selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";

const FP = "cal:v1:12345678abcdef12";
const ready = ({ seats = 2, cacheStatus = "miss", level = 1 } = {}) => {
  const result = createBassAnalysisResult();
  result.fingerprints.calibration = FP;
  Object.assign(result.job, { status: "ready", resultFingerprint: FP, currentJobFingerprint: FP, cacheStatus });
  result.selectedCandidate = { perSeatDiagnostics: [{ seatId: "s1", maxAbsDeviationDb: 4.2 }] };
  result.provenance.realSeatCount = seats;
  result.productAnalysis.parameters = {
    p14: createBassParameterResult({ parameter: "P14", status: "complete", level, value: 114.1, unit: "dB" }),
    p18: createBassParameterResult({ parameter: "P18", status: "complete", level: 2, value: 23.4, unit: "Hz" }),
    p19: createBassParameterResult({ parameter: "P19", status: "complete", level: 1, value: 4.7, unit: "dB" }),
    p20: seats < 2 ? createBassParameterResult({ parameter: "P20", status: "not_applicable" }) : createBassParameterResult({ parameter: "P20", status: "complete", level: 2, value: 3.8, unit: "dB" }),
  };
  return result;
};

const candidate = (id, p14 = 1) => ({ id, achievedP14Level: p14, achievedP14Db: 113 + p14, achievedP18Level: 1, achievedP18FrequencyHz: 30, achievedP19Level: 1, achievedP19VariationDb: 4, allAtLeastL1: true, bankValidationResult: { allOk: true }, assessmentStartHz: 20, assessmentEndHz: 100, generatedFilterBank: [], finalPostEqCurve: [{ frequency: 20, spl: 100 }] });

export function runBassResultsPresentationFixtures() {
  const checks = [];
  const check = (name, pass) => checks.push({ name, passed: !!pass });
  const idle = formatBassResults(createBassAnalysisResult(), 1000);
  check("1. Idle produces four dashes", Object.values(idle.pills).every((pill) => pill.text.endsWith("—")));
  for (const status of ["queued", "calculating"]) { const r = ready(); Object.assign(r.job, { status, startedAtMs: 1000, resultFingerprint: null }); const f = formatBassResults(r, 13000); check(`2. ${status} hides stale levels`, Object.values(f.pills).every((pill) => !pill.text.includes("L1") && !pill.text.includes("114.1"))); }
  { const r = ready(); Object.assign(r.job, { status: "calculating", startedAtMs: 1000, resultFingerprint: null }); check("3. Genuine elapsed time updates", formatBassResults(r, 13000).pills.p14.text === "P14 Updating · 12 s"); }
  { const f = formatBassResults(ready());   check("4. Ready values format correctly", f.pills.p14.text === "P14 L1 · 115 dB" && f.pills.p18.text === "P18 L2 · 23 Hz" && f.pills.p19.text === "P19 L1 · ±4 dB" && f.pills.p20.text === "P20 L3 · ±3 dB"); }
  check("5. FAIL retains value", formatBassResults(ready({ level: 0 })).pills.p14.text === "P14 FAIL · 115 dB");
  check("6. Single-seat P20 is N/A", formatBassResults(ready({ seats: 1 })).pills.p20.text === "P20 N/A");
  check("7. Multi-seat P20 floors display only", formatBassResults(ready()).pills.p20.text === "P20 L3 · ±3 dB");
  { const candidates = [candidate("a", 1), candidate("b", 2)]; const pool = { candidates, selectablePool: candidates, poolId: "pool", performanceSummary: {} }; const a = selectCandidateFromPool(pool, "balanced"); const b = selectCandidateFromPool(pool, "spl"); check("8. Priority switch reuses pool with zero workers", a.poolId === b.poolId && b.workerStarted === false && b.heavyPoolReused === true); }
  { const same = candidate("same", 2); const pool = { candidates: [same], selectablePool: [same], poolId: "pool", performanceSummary: {} }; check("9. Identical achievements stay identical", selectCandidateFromPool(pool, "balanced").achievedP14Db === selectCandidateFromPool(pool, "spl").achievedP14Db); }
  { const r = ready(); Object.assign(r.job, { status: "stale", queuedAtMs: 1000, resultFingerprint: null }); check("10. Changed inputs immediately update", formatBassResults(r, 2000).pills.p14.text.startsWith("P14 Updating")); }
  check("11. Cache restoration is ready without updating", formatBassResults(ready({ cacheStatus: "hit" })).statusText === "Restored from cache");
  { const r = ready(); r.job.resultFingerprint = "cal:v1:fedcba9876543210"; check("12. Stale fingerprint cannot populate pills", !formatBassResults(r).pills.p14.text.includes("114.1")); }
  { const r = ready(); const a = formatBassResults(r); const b = formatBassResults(r); const c = formatBassResults(r); check("13. All surfaces share identical formatting", JSON.stringify(a.pills) === JSON.stringify(b.pills) && JSON.stringify(b.pills) === JSON.stringify(c.pills)); }
  check("14. Engineering details default hidden and recover", !engineeringDetailsVisible(false) && engineeringDetailsVisible(true));

  const formatterCases = [
    ["P14 exact integer", "p14", 114.0, "114 dB"],
    ["P14 rounds 114.1 upward", "p14", 114.1, "115 dB"],
    ["P14 rounds 114.9 upward", "p14", 114.9, "115 dB"],
    ["P14 ignores positive integer noise", "p14", 114.0000000001, "114 dB"],
    ["P18 exact integer", "p18", 23.0, "23 Hz"],
    ["P18 rounds 23.4 downward", "p18", 23.4, "23 Hz"],
    ["P18 rounds 23.9 downward", "p18", 23.9, "23 Hz"],
    ["P18 ignores negative integer noise", "p18", 22.9999999999, "23 Hz"],
    ["P19 exact 4.0 magnitude", "p19", 4.0, "±4 dB"],
    ["P19 floors 4.1 magnitude", "p19", 4.1, "±4 dB"],
    ["P19 floors 4.7 magnitude", "p19", 4.7, "±4 dB"],
    ["P19 exact 5.0 magnitude", "p19", 5.0, "±5 dB"],
    ["P19 floors 5.9 magnitude", "p19", 5.9, "±5 dB"],
    ["P19 ignores positive integer noise", "p19", 4.0000000001, "±4 dB"],
  ];
  formatterCases.forEach(([name, key, value, expected], index) => {
    check(`${15 + index}. ${name}`, formatBassParameterValue(key, value) === expected);
  });
  check("29. Per-seat P19 uses shared magnitude flooring", formatBassResults(ready(), Date.now(), "s1").pills.p19.text === "Target · ±4 dB");
  check("30. P20 formatting uses shared flooring", formatBassParameterValue("p20", 3.8) === "±3 dB");
  { const r = ready(); Object.assign(r.job, { status: "error", resultFingerprint: null }); check("31. P20 job error remains explicit", formatBassResults(r).pills.p20.text === "P20 error"); }
  { const r = ready(); r.fingerprints.calibration = FP; r.job.currentJobFingerprint = `${FP}|engine:current`; r.job.resultFingerprint = `${FP}|engine:current`; check("32. Versioned cache-key completion is visible", formatBassResults(r).isReady && !formatBassResults(r).isUpdating); }
  const passed = checks.filter((item) => item.passed).length;
  return { results: checks, passed, total: checks.length, allPassed: passed === checks.length };
}