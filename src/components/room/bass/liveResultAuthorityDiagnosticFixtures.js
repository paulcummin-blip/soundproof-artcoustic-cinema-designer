import {
  buildLiveResultAuthorityDiagnosticModel,
  shouldShowLiveResultAuthorityDiagnostic,
} from "./liveResultAuthorityDiagnosticModel";

export function runLiveResultAuthorityDiagnosticFixtures() {
  const checks = [];
  const check = (name, passed) => checks.push({ name, passed: !!passed });

  const calculating = {
    status: "calculating",
    workerStatus: "active",
    activeJobId: "bass-1",
    progressStage: "house-curve start 2/2",
    elapsedMs: 21000,
    lastHeartbeatAgeMs: 900,
    currentJobFingerprint: "request-key",
    cacheStatus: "miss",
    replacementRunCount: 0,
    requestIdentity: { engineVersion: "engine-v2", resultSchemaVersion: 2 },
  };
  const calculatingModel = buildLiveResultAuthorityDiagnosticModel({ result: null, lifecycle: calculating });
  check("1. Calculating diagnostic visible with Design EQ off", shouldShowLiveResultAuthorityDiagnostic({
    engineeringDiagnosticsEnabled: true,
    designEqEnabled: false,
    result: null,
    lifecycle: calculating,
  }));
  check("2. Null result retains lifecycle fields", calculatingModel.jobId === "bass-1"
    && calculatingModel.status === "active"
    && calculatingModel.lastStage === "house-curve start 2/2"
    && calculatingModel.elapsed === "21.00 s"
    && calculatingModel.selectedCandidateId === "—");

  const stalledModel = buildLiveResultAuthorityDiagnosticModel({
    result: null,
    lifecycle: { ...calculating, stalled: true, workerStatus: "stalled", lastHeartbeatAgeMs: 16000 },
  });
  check("3. Stalled diagnostic remains visible", shouldShowLiveResultAuthorityDiagnostic({
    engineeringDiagnosticsEnabled: true,
    designEqEnabled: false,
    lifecycle: { status: "calculating", stalled: true },
  }) && stalledModel.status === "stalled" && stalledModel.heartbeatAge === "16.00 s");

  const errorModel = buildLiveResultAuthorityDiagnosticModel({
    result: null,
    lifecycle: { ...calculating, status: "error", workerStatus: "error", errorMessage: "watchdog expired" },
  });
  check("4. Error diagnostic remains visible", shouldShowLiveResultAuthorityDiagnostic({
    engineeringDiagnosticsEnabled: true,
    designEqEnabled: false,
    lifecycle: { status: "error" },
  }) && errorModel.status === "error" && errorModel.terminalError === "watchdog expired");
  check("5. Engineering control remains authoritative", !shouldShowLiveResultAuthorityDiagnostic({
    engineeringDiagnosticsEnabled: false,
    designEqEnabled: true,
    result: {},
  }));

  const passed = checks.filter((item) => item.passed).length;
  return { results: checks, passed, total: checks.length, allPassed: passed === checks.length };
}