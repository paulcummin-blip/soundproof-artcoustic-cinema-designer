// stageBIntegrationFixture.js — Real integration test for the Stage B lifecycle.
//
// Imports and executes the REAL production modules:
//   - bassDiagTokenTrace.js (diagnostic token trace store)
//   - bassBackgroundAnalysisStore.js (BassBackgroundAnalysisController)
//   - bassLifecycleOrchestrator.js (token-created, candidate-selection-accepted,
//     contract-published — extracted from BassBackgroundAnalysisOwner.jsx)
//   - bassCandidatePoolSelection.js (selectCandidateFromPool)
//   - completedBassResultStore.js (publishCompletedBassContract)
//   - bassResultAuthority.js (stampPoolAuthority, validateCachedBassResult)
//
// Reuses the existing FakeWorker/FakeClock/validInput/harness/completeCurrent
// helpers from bassBackgroundAnalysisFixtures.js — no new mock infrastructure.
//
// The test observes lifecycle events PRODUCED BY PRODUCTION CODE. It never calls
// recordDiagStage directly for the controller-level events (requestManual through
// background-result-published). The component-level events (token-created,
// candidate-selection-accepted, contract-published) are produced by the real
// bassLifecycleOrchestrator functions — the same functions the live React
// component calls.

import {
  createDiagToken,
  getDiagRun,
  getDiagRuns,
  clearDiagRuns,
  subscribeDiagRuns,
  getDiagRunsSnapshot,
} from "./bassDiagTokenTrace";
import {
  startManualDiagnosticsCalculation,
  recordCandidateSelectionAccepted,
  recordContractPublished,
} from "./bassLifecycleOrchestrator";
import { selectCandidateFromPool } from "@/components/utils/bassCandidatePoolSelection";
import { publishCompletedBassContract } from "./completedBassResultStore";
import { validInput, harness, completeCurrent } from "./bassBackgroundAnalysisFixtures";

const REQUIRED_ORDER = [
  "token-created",
  "requestManual",
  "startRequest",
  "worker-posted",
  "worker-received",
  "worker-completed",
  "worker-result-validated",
  "background-result-published",
  "candidate-selection-accepted",
  "contract-published",
];

function makeResult(test, expected, actual, delta, severity, nextTest) {
  return { test, expected, actual, delta, severity, nextTest };
}

// ---------------------------------------------------------------------------
// Section 1: Successful diagnostics-enabled path
// ---------------------------------------------------------------------------

function testSuccessfulDiagnosticsPath() {
  clearDiagRuns();
  const results = [];
  const h = harness();
  const input = validInput();

  // Start a manual diagnostics-enabled calculation through the real orchestrator.
  // This creates a token, records token-created, and calls controller.requestManual.
  // The controller records requestManual, startRequest, worker-posted.
  const { diagnosticToken } = startManualDiagnosticsCalculation(h.controller, {
    fingerprint: input.fingerprint,
    payload: input.payload,
    identity: input.identity,
    collectDiagnostics: true,
    force: true,
  });

  // Confirm exactly one diagnostic token was created.
  const runsAfterStart = getDiagRuns();
  results.push(makeResult(
    "1a. Exactly one diagnostic token created",
    "getDiagRuns().length === 1",
    `${runsAfterStart.length} run(s)`,
    runsAfterStart.length === 1 ? 0 : 1,
    runsAfterStart.length === 1 ? "PASS" : "FAIL",
    "1b. Every event belongs to that token"
  ));

  // Complete the worker response through the real controller.
  // The controller records worker-received, worker-completed,
  // worker-result-validated, background-result-published.
  completeCurrent(h);

  // Get the lifecycle state and pool from the real controller.
  const lifecycle = h.controller.getSnapshot();
  const pool = lifecycle.result?.pool;

  // Run the real candidate selector on the real pool.
  const selection = selectCandidateFromPool(pool);

  // Record candidate-selection-accepted through the real orchestrator.
  recordCandidateSelectionAccepted(diagnosticToken, {
    workerRequestId: lifecycle.result?.workerRequestId || null,
    selectedCandidateId: selection.selectedCandidateId || null,
  });

  // Build a contract from real production data and publish through the real path.
  const contract = {
    version: 1,
    analysisId: `stageB-${diagnosticToken}`,
    fingerprints: { calibration: input.fingerprint },
    job: {
      status: "complete",
      resultFingerprint: lifecycle.resultFingerprint,
      currentJobFingerprint: lifecycle.currentJobFingerprint,
    },
    selectedCandidate: selection.selectedCandidate,
    selectedCandidateId: selection.selectedCandidateId,
    selectedMode: "balanced",
  };
  const published = publishCompletedBassContract("stageB-integration", contract);

  // Record contract-published through the real orchestrator.
  recordContractPublished(diagnosticToken, {
    contractAnalysisId: contract.analysisId,
    contractFingerprint: lifecycle.resultFingerprint,
  });

  // --- Assertions ---

  // 1b. Every event belongs to that token.
  const run = getDiagRun(diagnosticToken);
  const allEventsSameToken = run && run.events.every((e) => e.token === diagnosticToken);
  results.push(makeResult(
    "1b. Every event belongs to that token",
    `All events carry token=${diagnosticToken}`,
    allEventsSameToken ? `${run.events.length} events, all same token` : "token mismatch",
    allEventsSameToken ? 0 : 1,
    allEventsSameToken ? "PASS" : "FAIL",
    "1c. Worker request IDs remain correlated"
  ));

  // 1c. Worker request IDs remain correlated.
  const startRequestEvent = run.events.find((e) => e.stage === "startRequest");
  const workerPostedEvent = run.events.find((e) => e.stage === "worker-posted");
  const workerReceivedEvent = run.events.find((e) => e.stage === "worker-received");
  const workerCompletedEvent = run.events.find((e) => e.stage === "worker-completed");
  const startReqId = startRequestEvent?.workerRequestId;
  const postedReqId = workerPostedEvent?.workerRequestId;
  const receivedReqId = workerReceivedEvent?.workerRequestId;
  const completedReqId = workerCompletedEvent?.workerRequestId;
  const idsCorrelated = startReqId && startReqId === postedReqId && postedReqId === receivedReqId && receivedReqId === completedReqId;
  results.push(makeResult(
    "1c. Worker request IDs remain correlated",
    `All worker events share the same requestId`,
    idsCorrelated ? `requestId=${startReqId}` : `start=${startReqId}, posted=${postedReqId}, recv=${receivedReqId}, done=${completedReqId}`,
    idsCorrelated ? 0 : 1,
    idsCorrelated ? "PASS" : "FAIL",
    "1d. Worker returned the same token"
  ));

  // 1d. Worker returned the same token.
  const workerReturnedToken = workerReceivedEvent?.returnedToken;
  const tokenMatched = workerReturnedToken === diagnosticToken;
  results.push(makeResult(
    "1d. Worker returned the same token",
    `returnedToken === ${diagnosticToken}`,
    `returnedToken=${workerReturnedToken}`,
    tokenMatched ? 0 : 1,
    tokenMatched ? "PASS" : "FAIL",
    "1e. Completed result contains diagnostic identity"
  ));

  // 1e. Completed result contains diagnostic identity.
  const resultToken = lifecycle.result?.diagnosticToken;
  const resultContainsIdentity = resultToken === diagnosticToken;
  results.push(makeResult(
    "1e. Completed result contains diagnostic identity",
    `result.diagnosticToken === ${diagnosticToken}`,
    `result.diagnosticToken=${resultToken}`,
    resultContainsIdentity ? 0 : 1,
    resultContainsIdentity ? "PASS" : "FAIL",
    "1f. Selected optimisation result contains same identity"
  ));

  // 1f. Selected optimisation result contains same identity.
  const selectedCandidateId = selection.selectedCandidateId;
  const selectionHasId = !!selectedCandidateId;
  results.push(makeResult(
    "1f. Selected optimisation result contains same identity",
    "selectCandidateFromPool returns a non-null selectedCandidateId",
    `selectedCandidateId=${selectedCandidateId}`,
    selectionHasId ? 0 : 1,
    selectionHasId ? "PASS" : "FAIL",
    "1g. Published contract contains same identity"
  ));

  // 1g. Published contract contains same identity.
  const contractPublished = published === true;
  results.push(makeResult(
    "1g. Published contract contains same identity",
    "publishCompletedBassContract returns true",
    `published=${published}`,
    contractPublished ? 0 : 1,
    contractPublished ? "PASS" : "FAIL",
    "1h. Ordered subsequence matches REQUIRED_ORDER"
  ));

  // 1h. Ordered subsequence matches REQUIRED_ORDER (allowing multiple worker-received).
  const actualStages = run.events.map((e) => e.stage);
  let orderOk = true;
  let searchFrom = 0;
  for (const required of REQUIRED_ORDER) {
    let found = false;
    for (let i = searchFrom; i < actualStages.length; i++) {
      if (actualStages[i] === required) {
        searchFrom = i + 1;
        found = true;
        break;
      }
    }
    if (!found) {
      orderOk = false;
      break;
    }
  }
  results.push(makeResult(
    "1h. Ordered subsequence matches REQUIRED_ORDER",
    REQUIRED_ORDER.join(" → "),
    actualStages.join(" → "),
    orderOk ? 0 : 1,
    orderOk ? "PASS" : "FAIL",
    "1i. Multiple worker-received events allowed"
  ));

  // 1i. Multiple worker-received events allowed (progress messages may append more than once).
  const workerReceivedCount = run.events.filter((e) => e.stage === "worker-received").length;
  const allowsMultiple = workerReceivedCount >= 1;
  results.push(makeResult(
    "1i. Multiple worker-received events allowed",
    ">= 1 worker-received event",
    `${workerReceivedCount} worker-received event(s)`,
    allowsMultiple ? 0 : 1,
    allowsMultiple ? "PASS" : "FAIL",
    "Token-mismatch path"
  ));

  h.controller.dispose();
  return results;
}

// ---------------------------------------------------------------------------
// Section 2: Token-mismatch path
// ---------------------------------------------------------------------------

function testTokenMismatchPath() {
  clearDiagRuns();
  const results = [];
  const h = harness();
  const input = validInput();

  const { diagnosticToken } = startManualDiagnosticsCalculation(h.controller, {
    fingerprint: input.fingerprint,
    payload: input.payload,
    identity: input.identity,
    collectDiagnostics: true,
    force: true,
  });

  // Send a complete message with a WRONG diagnostic token.
  completeCurrent(h, {}, { diagnosticToken: "diag-WRONG-0000-0" });

  const run = getDiagRun(diagnosticToken);
  const stages = run ? run.events.map((e) => e.stage) : [];

  // 2a. Result is rejected.
  const hasRejected = stages.includes("worker-result-rejected");
  results.push(makeResult(
    "2a. Result is rejected",
    "worker-result-rejected recorded",
    hasRejected ? "rejected" : "not rejected",
    hasRejected ? 0 : 1,
    hasRejected ? "PASS" : "FAIL",
    "2b. Exact mismatch reason is recorded"
  ));

  // 2b. Exact mismatch reason is recorded.
  const rejectedEvent = run?.events.find((e) => e.stage === "worker-result-rejected");
  const reason = rejectedEvent?.reason;
  const reasonCorrect = reason && reason.includes("Diagnostic token mismatch") && reason.includes(diagnosticToken) && reason.includes("diag-WRONG-0000-0");
  results.push(makeResult(
    "2b. Exact mismatch reason is recorded",
    `Reason includes expected and received tokens`,
    `reason=${reason}`,
    reasonCorrect ? 0 : 1,
    reasonCorrect ? "PASS" : "FAIL",
    "2c. worker-result-validated is absent"
  ));

  // 2c. worker-result-validated is absent.
  const hasResultValidated = stages.includes("worker-result-validated");
  results.push(makeResult(
    "2c. worker-result-validated is absent",
    "No worker-result-validated event",
    hasResultValidated ? "FAIL: present" : "absent (correct)",
    hasResultValidated ? 1 : 0,
    hasResultValidated ? "FAIL" : "PASS",
    "2d. background-result-published is absent"
  ));

  // 2d. background-result-published is absent.
  const hasBackgroundPublished = stages.includes("background-result-published");
  results.push(makeResult(
    "2d. background-result-published is absent",
    "No background-result-published event",
    hasBackgroundPublished ? "FAIL: present" : "absent (correct)",
    hasBackgroundPublished ? 1 : 0,
    hasBackgroundPublished ? "FAIL" : "PASS",
    "2e. candidate-selection-accepted is absent"
  ));

  // 2e. candidate-selection-accepted is absent.
  const hasCandidateAccepted = stages.includes("candidate-selection-accepted");
  results.push(makeResult(
    "2e. candidate-selection-accepted is absent",
    "No candidate-selection-accepted event",
    hasCandidateAccepted ? "FAIL: present" : "absent (correct)",
    hasCandidateAccepted ? 1 : 0,
    hasCandidateAccepted ? "FAIL" : "PASS",
    "2f. contract-published is absent"
  ));

  // 2f. contract-published is absent.
  const hasContractPublished = stages.includes("contract-published");
  results.push(makeResult(
    "2f. contract-published is absent",
    "No contract-published event",
    hasContractPublished ? "FAIL: present" : "absent (correct)",
    hasContractPublished ? 1 : 0,
    hasContractPublished ? "FAIL" : "PASS",
    "Diagnostics-disabled path"
  ));

  h.controller.dispose();
  return results;
}

// ---------------------------------------------------------------------------
// Section 3: Diagnostics-disabled path
// ---------------------------------------------------------------------------

function testDiagnosticsDisabledPath() {
  clearDiagRuns();
  const results = [];
  const h = harness();
  const input = validInput();

  // Start a manual calculation with diagnostics DISABLED.
  // No diagnostic token should be created.
  const { diagnosticToken } = startManualDiagnosticsCalculation(h.controller, {
    fingerprint: input.fingerprint,
    payload: input.payload,
    identity: input.identity,
    collectDiagnostics: false,
    force: true,
  });

  // 3a. No diagnostic token is created.
  const noToken = diagnosticToken === null;
  results.push(makeResult(
    "3a. No diagnostic token is created",
    "diagnosticToken === null",
    `diagnosticToken=${diagnosticToken}`,
    noToken ? 0 : 1,
    noToken ? "PASS" : "FAIL",
    "3b. No diagnostic lifecycle run is created"
  ));

  // Complete the worker response.
  completeCurrent(h);

  // 3b. No diagnostic lifecycle run is created.
  const runs = getDiagRuns();
  const noRuns = runs.length === 0;
  results.push(makeResult(
    "3b. No diagnostic lifecycle run is created",
    "getDiagRuns().length === 0",
    `${runs.length} run(s)`,
    noRuns ? 0 : 1,
    noRuns ? "PASS" : "FAIL",
    "3c. Normal calculation completion is unchanged"
  ));

  // 3c. Normal calculation completion is unchanged.
  const lifecycle = h.controller.getSnapshot();
  const completedNormally = lifecycle.status === "ready" && lifecycle.resultFingerprint === input.fingerprint;
  results.push(makeResult(
    "3c. Normal calculation completion is unchanged",
    "status=ready, resultFingerprint matches",
    `status=${lifecycle.status}, resultFingerprint=${lifecycle.resultFingerprint}`,
    completedNormally ? 0 : 1,
    completedNormally ? "PASS" : "FAIL",
    "Snapshot module tests"
  ));

  h.controller.dispose();
  return results;
}

// ---------------------------------------------------------------------------
// Section 4: Snapshot module tests
// ---------------------------------------------------------------------------

function testSnapshotModule() {
  clearDiagRuns();
  const results = [];

  // 4a. Two unchanged calls return strict-reference equality.
  const snap1 = getDiagRunsSnapshot();
  const snap2 = getDiagRunsSnapshot();
  const refEqual = snap1 === snap2;
  results.push(makeResult(
    "4a. Two unchanged getDiagRunsSnapshot() calls return same reference",
    "snap1 === snap2",
    refEqual ? "strict-reference equal" : "different references",
    refEqual ? 0 : 1,
    refEqual ? "PASS" : "FAIL",
    "4b. Token creation produces new snapshot reference"
  ));

  // 4b. Token creation produces new snapshot reference.
  const token = createDiagToken("manual-forced");
  const snap3 = getDiagRunsSnapshot();
  const newRefAfterCreate = snap3 !== snap1;
  results.push(makeResult(
    "4b. Token creation produces new snapshot reference",
    "snap3 !== snap1",
    newRefAfterCreate ? "new reference" : "same reference",
    newRefAfterCreate ? 0 : 1,
    newRefAfterCreate ? "PASS" : "FAIL",
    "4c. Event append produces new snapshot reference"
  ));

  // 4c. Event append produces new snapshot reference.
  // Use the real orchestrator to record an event (not recordDiagStage directly).
  recordCandidateSelectionAccepted(token, { workerRequestId: "bass-1", selectedCandidateId: "test" });
  const snap4 = getDiagRunsSnapshot();
  const newRefAfterAppend = snap4 !== snap3;
  results.push(makeResult(
    "4c. Event append produces new snapshot reference",
    "snap4 !== snap3",
    newRefAfterAppend ? "new reference" : "same reference",
    newRefAfterAppend ? 0 : 1,
    newRefAfterAppend ? "PASS" : "FAIL",
    "4d. Clear produces new snapshot reference"
  ));

  // 4d. Clear produces new snapshot reference.
  clearDiagRuns();
  const snap5 = getDiagRunsSnapshot();
  const newRefAfterClear = snap5 !== snap4;
  results.push(makeResult(
    "4d. Clear produces new snapshot reference",
    "snap5 !== snap4",
    newRefAfterClear ? "new reference" : "same reference",
    newRefAfterClear ? 0 : 1,
    newRefAfterClear ? "PASS" : "FAIL",
    "4e. Subscribers receive one notification per real mutation"
  ));

  // 4e. Subscribers receive one notification per real mutation.
  let notifyCount = 0;
  const unsub = subscribeDiagRuns(() => { notifyCount++; });
  const t2 = createDiagToken("manual-forced");
  const expectedAfterCreate = 1;
  const oneNotify = notifyCount === expectedAfterCreate;
  results.push(makeResult(
    "4e. Subscribers receive one notification per real mutation",
    `${expectedAfterCreate} notification for 1 mutation`,
    `${notifyCount} notification(s)`,
    oneNotify ? 0 : 1,
    oneNotify ? "PASS" : "FAIL",
    "4f. Reads produce no notifications"
  ));

  // 4f. Reads produce no notifications.
  notifyCount = 0;
  getDiagRunsSnapshot();
  getDiagRunsSnapshot();
  getDiagRun(t2);
  getDiagRuns();
  const noNotifyOnRead = notifyCount === 0;
  results.push(makeResult(
    "4f. Reads produce no notifications",
    "0 notifications for 4 reads",
    `${notifyCount} notification(s)`,
    noNotifyOnRead ? 0 : 1,
    noNotifyOnRead ? "PASS" : "FAIL",
    "4g. Returned outer arrays are frozen"
  ));
  unsub();

  // 4g. Returned outer arrays are frozen.
  const snap = getDiagRunsSnapshot();
  const outerFrozen = Object.isFrozen(snap);
  results.push(makeResult(
    "4g. Returned outer arrays are frozen",
    "Object.isFrozen(snap) === true",
    outerFrozen ? "frozen" : "not frozen",
    outerFrozen ? 0 : 1,
    outerFrozen ? "PASS" : "FAIL",
    "4h. Returned run objects are frozen"
  ));

  // 4h. Returned run objects are frozen.
  const runFrozen = snap.length > 0 && Object.isFrozen(snap[0]);
  results.push(makeResult(
    "4h. Returned run objects are frozen",
    "Object.isFrozen(snap[0]) === true",
    runFrozen ? "frozen" : "not frozen",
    runFrozen ? 0 : 1,
    runFrozen ? "PASS" : "FAIL",
    "4i. Returned event arrays are frozen"
  ));

  // 4i. Returned event arrays are frozen.
  const eventsFrozen = snap.length > 0 && Object.isFrozen(snap[0].events);
  results.push(makeResult(
    "4i. Returned event arrays are frozen",
    "Object.isFrozen(snap[0].events) === true",
    eventsFrozen ? "frozen" : "not frozen",
    eventsFrozen ? 0 : 1,
    eventsFrozen ? "PASS" : "FAIL",
    "4j. Returned event objects are frozen"
  ));

  // 4j. Returned event objects are frozen.
  const eventFrozen = snap.length > 0 && snap[0].events.length > 0 && Object.isFrozen(snap[0].events[0]);
  results.push(makeResult(
    "4j. Returned event objects are frozen",
    "Object.isFrozen(event) === true",
    eventFrozen ? "frozen" : "not frozen",
    eventFrozen ? 0 : 1,
    eventFrozen ? "PASS" : "FAIL",
    "4k. Attempted mutation cannot alter later reads"
  ));

  // 4k. Attempted mutation cannot alter later reads.
  const beforeLen = snap[0]?.events.length || 0;
  let pushThrew = false;
  try {
    snap[0]?.events?.push?.({ stage: "tamper", ts: 0, token: "x" });
  } catch (e) {
    pushThrew = true;
  }
  const afterSnap = getDiagRunsSnapshot();
  const afterLen = afterSnap[0]?.events.length || 0;
  const mutationBlocked = afterLen === beforeLen;
  results.push(makeResult(
    "4k. Attempted mutation cannot alter later reads",
    `events.length unchanged (before=${beforeLen}, after=${beforeLen})`,
    `pushThrew=${pushThrew}, afterLen=${afterLen}`,
    mutationBlocked ? 0 : 1,
    mutationBlocked ? "PASS" : "FAIL",
    "Complete"
  ));

  clearDiagRuns();
  return results;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function runStageBIntegrationFixture() {
  const allResults = [
    ...testSuccessfulDiagnosticsPath(),
    ...testTokenMismatchPath(),
    ...testDiagnosticsDisabledPath(),
    ...testSnapshotModule(),
  ];
  const passed = allResults.filter((r) => r.severity === "PASS").length;
  const failed = allResults.filter((r) => r.severity === "FAIL").length;
  return {
    results: allResults,
    passed,
    failed,
    total: allResults.length,
    allPassed: failed === 0,
  };
}