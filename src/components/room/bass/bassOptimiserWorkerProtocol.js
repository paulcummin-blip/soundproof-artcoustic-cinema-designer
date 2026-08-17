export const BASS_OPTIMISER_PROTOCOL_VERSION = "bass-optimiser-protocol-v1";
export const BASS_OPTIMISER_POOL_VERSION = "bass-optimiser-pool-v23-full-band-operating-window";
export const HOUSE_CURVE_ENGINE_VERSION = "house-curve-shape-fit-v35-capability-clipped-fit-target";
export const BASS_RESULT_SCHEMA_VERSION = 22;
export const BASS_OPTIMISER_POOL_PROPERTY = "pool";

export const BASS_OPTIMISER_VERSIONS = Object.freeze({
  protocolVersion: BASS_OPTIMISER_PROTOCOL_VERSION,
  poolVersion: BASS_OPTIMISER_POOL_VERSION,
  engineVersion: HOUSE_CURVE_ENGINE_VERSION,
  resultSchemaVersion: BASS_RESULT_SCHEMA_VERSION,
});

export const bassOptimiserVersionSignature = (versions = BASS_OPTIMISER_VERSIONS) => [
  versions.protocolVersion,
  versions.poolVersion,
  versions.engineVersion,
  versions.resultSchemaVersion,
].join("|");

export function describeOptimiserCompatibility(expected, actual, reason = "version-mismatch") {
  const value = (item) => item == null ? "missing" : String(item);
  return `${reason} (expected protocol=${value(expected?.protocolVersion)}, actual protocol=${value(actual?.protocolVersion)}; expected pool=${value(expected?.poolVersion)}, actual pool=${value(actual?.poolVersion)}; expected engine=${value(expected?.engineVersion)}, actual engine=${value(actual?.engineVersion)}; expected result-schema=${value(expected?.resultSchemaVersion)}, actual result-schema=${value(actual?.resultSchemaVersion)}; expected fingerprint=${value(expected?.fingerprint)}, actual fingerprint=${value(actual?.fingerprint)})`;
}

export function validateOptimiserVersions(actual, expected = BASS_OPTIMISER_VERSIONS) {
  const field = ["protocolVersion", "poolVersion", "engineVersion", "resultSchemaVersion"]
    .find((name) => actual?.[name] !== expected?.[name]);
  return field
    ? { valid: false, field, message: describeOptimiserCompatibility(expected, actual, `${field}-mismatch`) }
    : { valid: true, field: null, message: null };
}

const envelope = (type, requestId, fingerprint, identity, diagnosticToken = null, collectDiagnostics = null) => ({
  type, requestId, fingerprint, identity: identity || null, diagnosticToken, collectDiagnostics, ...BASS_OPTIMISER_VERSIONS,
});

export function createProgressMessage(requestId, fingerprint, progress, identity = null, diagnosticToken = null, collectDiagnostics = null) {
  return { ...envelope("progress", requestId, fingerprint, identity, diagnosticToken, collectDiagnostics), progress, postedAtMs: Date.now() };
}

export function createCompleteMessage(requestId, fingerprint, pool, identity = null, diagnosticToken = null, collectDiagnostics = null) {
  return { ...envelope("complete", requestId, fingerprint, identity, diagnosticToken, collectDiagnostics), [BASS_OPTIMISER_POOL_PROPERTY]: pool, postedAtMs: Date.now() };
}

export function createErrorMessage(requestId, fingerprint, error, identity = null, diagnosticToken = null, collectDiagnostics = null) {
  return { ...envelope("error", requestId, fingerprint, identity, diagnosticToken, collectDiagnostics), error, postedAtMs: Date.now() };
}