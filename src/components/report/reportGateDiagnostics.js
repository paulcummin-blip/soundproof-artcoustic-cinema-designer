/**
 * reportGateDiagnostics.js
 * ------------------------
 * The report gate's own account of why a report opened, or why it did not.
 *
 * A report is blocked ONLY when the engineering authority it needs is genuinely
 * incomplete. This builds that answer in one object so a block can be read at a
 * glance instead of inferred: which authority exists, whether it is complete,
 * what is missing, which fingerprints the saved report was generated from and
 * whether they still match.
 *
 * Derivation only — no recalculation, no report content, no writes.
 */

/** The bass parameters. Missing bass items are called out separately. */
export const REPORT_GATE_BASS_PARAMETER_KEYS = Object.freeze(["p14", "p18", "p19", "p20"]);

/** Human label for a missing parameter key. */
export function reportGateParameterLabel(key) {
  if (!key) return "—";
  return key === "screen" ? "RP23 screen assessment" : String(key).toUpperCase();
}

function normaliseKeys(keys) {
  return Array.isArray(keys) ? keys.filter(Boolean).map(String) : [];
}

/**
 * @returns {{
 *   project_id: string|null,
 *   version_id: string|null,
 *   report_type: string,
 *   has_saved_engineering_authority: boolean,
 *   has_complete_engineering_snapshot: boolean,
 *   has_report_snapshot: boolean,
 *   missing_parameters: string[],
 *   missing_bass_parameters: string[],
 *   source_fingerprint: string|null,
 *   saved_fingerprint: string|null,
 *   snapshot_status: string|null,
 *   stale: boolean,
 *   gate_result: string,
 *   block_reason: string|null,
 * }}
 */
export function buildReportGateDiagnostics({
  projectId = null,
  versionId = null,
  reportType = "report",
  hasSavedEngineeringAuthority = false,
  hasCompleteEngineeringSnapshot = false,
  hasReportSnapshot = false,
  missingParameters = [],
  incompleteSeatParameters = [],
  sourceFingerprint = null,
  savedFingerprint = null,
  snapshotStatus = null,
  gateResult = "unknown",
  blockReason = null,
} = {}) {
  const missing = [...new Set([
    ...normaliseKeys(missingParameters),
    ...normaliseKeys(incompleteSeatParameters),
  ])];

  return {
    project_id: projectId || null,
    version_id: versionId || null,
    report_type: reportType,
    has_saved_engineering_authority: hasSavedEngineeringAuthority === true,
    has_complete_engineering_snapshot: hasCompleteEngineeringSnapshot === true,
    has_report_snapshot: hasReportSnapshot === true,
    missing_parameters: missing,
    missing_bass_parameters: missing.filter((key) => REPORT_GATE_BASS_PARAMETER_KEYS.includes(key)),
    source_fingerprint: sourceFingerprint || null,
    saved_fingerprint: savedFingerprint || null,
    snapshot_status: snapshotStatus || null,
    stale: snapshotStatus === "stale",
    gate_result: gateResult,
    block_reason: blockReason || null,
  };
}

const yesNo = (value) => (value ? "yes" : "no");
const dash = (value) => (value === null || value === undefined || value === "" ? "—" : String(value));

/** Ordered [label, value] rows for display. */
export function buildReportGateDiagnosticRows(diagnostics) {
  if (!diagnostics) return [];
  return [
    ["project_id", dash(diagnostics.project_id)],
    ["version_id", dash(diagnostics.version_id)],
    ["report_type", dash(diagnostics.report_type)],
    ["has_saved_engineering_authority", yesNo(diagnostics.has_saved_engineering_authority)],
    ["has_complete_engineering_snapshot", yesNo(diagnostics.has_complete_engineering_snapshot)],
    ["has_report_snapshot", yesNo(diagnostics.has_report_snapshot)],
    ["missing_parameters", diagnostics.missing_parameters.length
      ? diagnostics.missing_parameters.map(reportGateParameterLabel).join(", ")
      : "none"],
    ["missing_bass_parameters", diagnostics.missing_bass_parameters.length
      ? diagnostics.missing_bass_parameters.map(reportGateParameterLabel).join(", ")
      : "none"],
    ["source_fingerprint", dash(diagnostics.source_fingerprint)],
    ["saved_fingerprint", dash(diagnostics.saved_fingerprint)],
    ["snapshot_status", dash(diagnostics.snapshot_status)],
    ["stale", yesNo(diagnostics.stale)],
    ["gate_result", dash(diagnostics.gate_result)],
    ["block_reason", dash(diagnostics.block_reason)],
  ];
}

export default buildReportGateDiagnostics;