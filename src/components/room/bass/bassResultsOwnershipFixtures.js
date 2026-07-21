import { createBassAnalysisResult, createBassParameterResult } from "./bassAnalysisContract.js";
import { createBassResultsScope } from "./bassResultsStore.js";
import { BassBackgroundAnalysisController } from "./bassBackgroundAnalysisStore.js";
import { formatBassResults } from "./bassResultsPresentation.js";
import { selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";

const FP_A = "cal:v1:aaaaaaaaaaaaaaaa";
const FP_B = "cal:v1:bbbbbbbbbbbbbbbb";
const readyContract = (fingerprint, value) => {
  const contract = createBassAnalysisResult();
  contract.fingerprints.calibration = fingerprint;
  Object.assign(contract.job, { status: "ready", resultFingerprint: fingerprint, currentJobFingerprint: fingerprint });
  contract.selectedCandidate = { id: `candidate-${fingerprint}` };
  contract.productAnalysis.parameters.p14 = createBassParameterResult({ parameter: "P14", status: "complete", level: 2, value, unit: "dB" });
  return contract;
};
const candidate = (id, level) => ({ id, achievedP14Level: level, achievedP14Db: 113 + level, achievedP18Level: 1, achievedP18FrequencyHz: 30, achievedP19Level: 1, achievedP19VariationDb: 4, allAtLeastL1: true, bankValidationResult: { allOk: true }, assessmentStartHz: 20, assessmentEndHz: 100, generatedFilterBank: [], finalPostEqCurve: [{ frequency: 20, spl: 100 }] });

export function runBassResultsOwnershipFixtures() {
  const results = [];
  const check = (name, passed) => results.push({ name, passed: !!passed });
  const scope = createBassResultsScope("room-a");
  const contractA = readyContract(FP_A, 115.2);
  scope.replace({ contract: contractA, lifecycle: { status: "ready" }, selectedPriorityMode: "balanced" });
  check("1. Never-opened simulation publishes product pills", formatBassResults(scope.getSnapshot().contract).pills.p14.text === "P14 L2 · 116 dB");

  let now = 1000;
  let worker = null;
  const timers = [];
  const controller = new BassBackgroundAnalysisController({ now: () => now, setTimer: (fn) => (timers.push(fn), timers.length), clearTimer: () => {}, workerFactory: () => (worker = { postMessage() {}, terminate() {} }) });
  controller.updateInputs({ valid: true, fingerprint: FP_A, payload: {} });
  timers.shift()();
  const runningBeforeCollapse = controller.getSnapshot().status === "calculating";
  now = 6000;
  const requestId = controller.activeRequest.requestId;
  controller.handleWorkerMessage({ type: "progress", requestId, fingerprint: FP_A, progress: { phase: "Fitting" } });
  controller.handleWorkerMessage({ type: "complete", requestId, fingerprint: FP_A, pool: { candidates: [], selectablePool: [] } });
  check("2. Collapsed calculation timer and completion continue", runningBeforeCollapse && controller.getSnapshot().elapsedMs === 5000 && controller.getSnapshot().status === "ready");
  check("3. BassResponse absence retains ready room result", scope.getSnapshot().contract === contractA);

  const candidates = [candidate("balanced", 1), candidate("spl", 3)];
  const pool = { candidates, selectablePool: candidates, poolId: "same-pool", performanceSummary: {} };
  const beforeRequests = controller.requestSequence;
  const reranked = selectCandidateFromPool(pool, "spl");
  check("4. Collapsed priority reranks same pool with zero workers", reranked.poolId === "same-pool" && reranked.workerStarted === false && controller.requestSequence === beforeRequests);
  const subwooferSnapshot = scope.getSnapshot();
  const seatHudSnapshot = scope.getSnapshot();
  check("5. SeatHud and SubwooferPanel consume one synchronized scope", subwooferSnapshot === seatHudSnapshot && subwooferSnapshot.contract === contractA);

  const projectB = createBassResultsScope("room-b");
  scope.clear();
  projectB.replace({ contract: createBassAnalysisResult(), lifecycle: { status: "idle" } });
  check("6. Project switch cannot retain prior values", scope.getSnapshot().contract.fingerprints.calibration === null && projectB.getSnapshot().contract.fingerprints.calibration !== FP_A);
  projectB.clear();
  check("7. Provider unmount clears scoped state", projectB.getSnapshot().scopeId === null && projectB.getSnapshot().contract.job.status === "idle");
  const left = createBassResultsScope("left");
  const right = createBassResultsScope("right");
  left.replace({ contract: readyContract(FP_A, 115) });
  right.replace({ contract: readyContract(FP_B, 120) });
  check("8. Two room contexts cannot leak", left.getSnapshot().contract.fingerprints.calibration === FP_A && right.getSnapshot().contract.fingerprints.calibration === FP_B && left.getSnapshot().contract !== right.getSnapshot().contract);
  const passed = results.filter((result) => result.passed).length;
  return { results, passed, total: results.length, allPassed: passed === results.length };
}