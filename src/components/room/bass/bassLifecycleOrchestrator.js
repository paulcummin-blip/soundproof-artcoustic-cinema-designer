// bassLifecycleOrchestrator.js — Production lifecycle recording functions.
//
// Extracted from BassBackgroundAnalysisOwner.jsx so the exact same production
// code that records diagnostic lifecycle events in the live React app can be
// exercised by the Stage B integration fixture without a React runtime.
//
// These functions are the SOLE producers of the component-level diagnostic
// events (token-created, candidate-selection-accepted, contract-published).
// The controller-level events (requestManual through background-result-published)
// are produced by BassBackgroundAnalysisController and are NOT recorded here.
//
// No physics, EQ, filters, candidates, RP22, graph data, or P14/P18/P19/P20
// logic lives in this module — it only records lifecycle trace events.

import { createDiagToken, recordDiagStage } from "./bassDiagTokenTrace";

/**
 * Start a manual diagnostics-enabled calculation.
 * Creates a diagnostic token, records token-created, and dispatches the
 * request to the controller. Returns the token and the controller action.
 *
 * This is the exact sequence BassBackgroundAnalysisOwner.onRetry executes.
 */
export function startManualDiagnosticsCalculation(
  controller,
  { fingerprint, payload, identity, collectDiagnostics = true, force = true }
) {
  const diagnosticToken = collectDiagnostics ? createDiagToken("manual-forced") : null;
  if (diagnosticToken) {
    recordDiagStage(diagnosticToken, "token-created", { origin: "manual-forced", collectDiagnostics: true });
  }
  const action = controller.requestManual({
    fingerprint,
    payload,
    identity,
    collectDiagnostics: collectDiagnostics === true,
    force: force === true,
    diagnosticToken,
  });
  return { diagnosticToken, action };
}

/**
 * Record candidate-selection-accepted for a diagnostic token.
 * Called after selectCandidateFromPool produces a valid selected candidate.
 */
export function recordCandidateSelectionAccepted(
  token,
  { workerRequestId = null, selectedCandidateId = null } = {}
) {
  if (!token) return;
  recordDiagStage(token, "candidate-selection-accepted", { workerRequestId, selectedCandidateId });
}

/**
 * Record contract-published for a diagnostic token.
 * Called after publishCompletedBassContract returns true.
 */
export function recordContractPublished(
  token,
  { contractAnalysisId = null, contractFingerprint = null } = {}
) {
  if (!token) return;
  recordDiagStage(token, "contract-published", { contractAnalysisId, contractFingerprint });
}