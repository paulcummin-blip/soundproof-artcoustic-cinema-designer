import { BASS_RESULT_SCHEMA_VERSION, HOUSE_CURVE_ENGINE_VERSION } from "./bassResultAuthority";

const fmt = (value) => Number.isFinite(value) ? value.toFixed(2) : "—";
const seconds = (milliseconds) => Number.isFinite(milliseconds) ? `${fmt(milliseconds / 1000)} s` : "—";

export function shouldShowLiveResultAuthorityDiagnostic({ engineeringDiagnosticsEnabled }) {
  return engineeringDiagnosticsEnabled === true;
}

export function buildLiveResultAuthorityDiagnosticModel({ result, contract, graphCandidateId, lifecycle } = {}) {
  const candidate = result?.selectedCandidate || null;
  const comparison = result?.selectionDiagnostics?.houseCurveCandidateComparison;
  const selectedCandidateId = result?.selectedCandidateId || null;
  const identityPass = !!selectedCandidateId
    && selectedCandidateId === contract?.selectedCandidateId
    && selectedCandidateId === graphCandidateId
    && selectedCandidateId === result?.productionCandidateId;
  const cacheDecision = lifecycle?.cacheRejectionReason
    ? `${lifecycle?.cacheStatus || "none"} (${lifecycle.cacheRejectionReason})`
    : lifecycle?.cacheStatus || result?.cacheSource || "none";
  return {
    jobId: lifecycle?.activeJobId || "—",
    status: lifecycle?.workerStatus || lifecycle?.status || "—",
    lastStage: lifecycle?.progressStage || "—",
    elapsed: seconds(lifecycle?.elapsedMs),
    heartbeatAge: seconds(lifecycle?.lastHeartbeatAgeMs),
    engineVersion: lifecycle?.requestIdentity?.engineVersion || result?.engineVersion || HOUSE_CURVE_ENGINE_VERSION,
    schemaVersion: lifecycle?.requestIdentity?.resultSchemaVersion || result?.resultSchemaVersion || BASS_RESULT_SCHEMA_VERSION,
    requestFingerprint: lifecycle?.currentJobFingerprint || "—",
    returnedFingerprint: lifecycle?.returnedFingerprint || "—",
    cacheDecision,
    replacementCount: lifecycle?.replacementRunCount ?? 0,
    terminalError: lifecycle?.errorMessage || "—",
    canonicalMode: result?.selectedMode || lifecycle?.requestIdentity?.canonicalPriorityMode || "—",
    selectedCandidateId: selectedCandidateId || "—",
    profile: candidate?.designEqFitProfile || "—",
    startStrategy: candidate?.startStrategy || "—",
    selectedStart: candidate?.selectedStart || "—",
    filterBankSignature: candidate?.filterBankSignature || "—",
    houseCurveMax: fmt(comparison?.houseCurve?.max),
    houseCurveRms: fmt(comparison?.houseCurve?.rms),
    winnerMax: fmt(comparison?.winner?.max),
    winnerRms: fmt(comparison?.winner?.rms),
    selectionReason: result?.selectionReason || "—",
    hasCandidate: !!candidate,
    identityPass,
  };
}