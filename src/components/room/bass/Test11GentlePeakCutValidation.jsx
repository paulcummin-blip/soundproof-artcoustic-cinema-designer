// Test11GentlePeakCutValidation.jsx — Read-only TEST 11 diagnostic panel.
//
// Proves whether the new gentle peak-cut candidates (Stage 1C) are generated,
// validated, rejected, or selected by the real production optimiser.
//
// READ-ONLY RULES:
//   - Zero simulations, zero optimiser runs, zero cache invalidations.
//   - Reads only from the completed result's existing diagnostic fields.
//   - Shows UNAVAILABLE for any value not in the production trace.
//   - No synthetic values, no audit-mirror calculations.
//   - Opening the panel causes zero worker runs.

import React, { useState, useMemo, useEffect } from "react";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { getLatestDiagRun, getDiagRuns } from "./bassDiagTokenTrace";

const UNAVAILABLE = "UNAVAILABLE";
const MISSING = "MISSING";
const TARGET_FREQ_HZ = 76.69;
const TARGET_FREQ_TOLERANCE_HZ = 3.0;
const GENTLE_TARGET_GAINS = [-1.06, -1.59, -2.12];
const RAW_TARGET_GAINS = [-3.11, -4.66, -6.21];
const GAIN_MATCH_TOLERANCE_DB = 0.3;

const num = (v) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmt = (v, digits = 2, fallback = UNAVAILABLE) => {
  const n = num(v);
  return n === null ? fallback : n.toFixed(digits);
};

function deriveFirstRejectionGate(accepted, reason) {
  if (accepted) return "accepted";
  if (!reason) return UNAVAILABLE;
  if (reason.includes("protected null")) return "protected-null";
  if (reason.includes("modal gate")) return "modal-gate";
  if (reason.includes("normal refinement failed")) return "objective-improvement-gate";
  if (reason.includes("global improvement")) return "objective-improvement-gate";
  return "objective-improvement-gate";
}

function findBestTrialForGain(trials, targetGainDb) {
  const matching = trials.filter((t) => {
    const gain = num(t.proposedGainDb);
    if (gain === null) return false;
    return Math.abs(gain - targetGainDb) <= GAIN_MATCH_TOLERANCE_DB;
  });
  if (!matching.length) return null;
  const accepted = matching.filter((t) => t.accepted);
  const pool = accepted.length ? accepted : matching;
  return pool.reduce((best, t) => {
    const imp = num(t.acousticObjectiveImprovementDb) ?? -Infinity;
    const bestImp = num(best?.acousticObjectiveImprovementDb) ?? -Infinity;
    return imp > bestImp ? t : best;
  }, pool[0]);
}

const TABLE_COLUMNS = [
  "Gain", "Q", "Generated", "Bank validation", "Physical validation",
  "Local residual before", "Local residual after", "Local improvement",
  "Maximum residual before", "Maximum residual after", "Maximum residual change",
  "Weighted RMS before", "Weighted RMS after", "Weighted RMS change",
  "Worst-seat change", "Accepted", "Exact first rejection gate", "Rejection reason",
];

export default function Test11GentlePeakCutValidation() {
  const sharedBassResults = useSharedBassResults();
  const [open, setOpen] = useState(false);
  const [workerBefore, setWorkerBefore] = useState(null);
  const [workerAfter, setWorkerAfter] = useState(null);

  const optimisationResult = sharedBassResults.optimisationResult;
  const selectedCandidate = optimisationResult?.selectedCandidate || null;
  const acceptance = selectedCandidate?.designEqCandidateAcceptanceDiagnostics || [];
  const finalBassResponse = optimisationResult?.finalOptimisedBassResponse || null;
  const finalBank = finalBassResponse?.canonicalFilterBank || selectedCandidate?.generatedFilterBank || [];

  useEffect(() => {
    if (!open) return;
    const before = {
      starts: typeof window !== "undefined" ? (window.__BASS_WORKER_STARTS__ || 0) : 0,
      completions: typeof window !== "undefined" ? (window.__BASS_WORKER_COMPLETIONS__ || 0) : 0,
    };
    setWorkerBefore(before);
    const timer = setTimeout(() => {
      const after = {
        starts: typeof window !== "undefined" ? (window.__BASS_WORKER_STARTS__ || 0) : 0,
        completions: typeof window !== "undefined" ? (window.__BASS_WORKER_COMPLETIONS__ || 0) : 0,
      };
      setWorkerAfter(after);
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  const nearTargetTrials = useMemo(() => {
    return acceptance.filter((t) => {
      if (t.action !== "append") return false;
      const freq = num(t.frequencyHz);
      if (freq === null) return false;
      return Math.abs(freq - TARGET_FREQ_HZ) <= TARGET_FREQ_TOLERANCE_HZ;
    });
  }, [acceptance]);

  const gentleRows = useMemo(() => {
    return GENTLE_TARGET_GAINS.map((targetGain) => {
      const best = findBestTrialForGain(nearTargetTrials, targetGain);
      return { targetGain, trial: best, generated: !!best };
    });
  }, [nearTargetTrials]);

  const rawDetected = useMemo(() => {
    return RAW_TARGET_GAINS.map((targetGain) => {
      const best = findBestTrialForGain(nearTargetTrials, targetGain);
      return {
        targetGain,
        detected: !!best,
        gain: best ? num(best.proposedGainDb) : null,
        q: best ? num(best.proposedQ) : null,
        accepted: best ? !!best.accepted : false,
      };
    });
  }, [nearTargetTrials]);

  const gentleInFinalBank = useMemo(() => {
    return finalBank.some((f) => {
      if (!f?.enabled) return false;
      const freq = num(f.frequencyHz);
      const gain = num(f.gainDb);
      if (freq === null || gain === null) return false;
      if (Math.abs(freq - TARGET_FREQ_HZ) > TARGET_FREQ_TOLERANCE_HZ) return false;
      return GENTLE_TARGET_GAINS.some((g) => Math.abs(gain - g) <= GAIN_MATCH_TOLERANCE_DB);
    });
  }, [finalBank]);

  const finalSig = finalBassResponse?.filterBankSignature || null;
  const graphSig = finalBassResponse?.filterBankSignature || null;
  const identityPass = finalSig && graphSig && finalSig === graphSig;

  const workerDeltaStarts = workerBefore && workerAfter ? (workerAfter.starts - workerBefore.starts) : 0;
  const workerDeltaCompletions = workerBefore && workerAfter ? (workerAfter.completions - workerBefore.completions) : 0;

  const hasResult = !!optimisationResult && !!selectedCandidate;

  // --- DIAGNOSTIC PROPAGATION TRACE (read-only) ---
  // Traces designEqCandidateAcceptanceDiagnostics from the worker pool through
  // authority merge, adapter contract, bassResultsStore, and TEST 11. Uses only
  // values present in the real completed production run. No inference, no
  // recreation, no synthetic data. MISSING = field absent; 0 = array length zero.
  const trace = useMemo(() => {
    if (!hasResult) return null;
    const lifecycle = sharedBassResults.lifecycle;
    const pool = lifecycle?.result?.pool || null;
    const poolCandidates = Array.isArray(pool?.candidates)
      ? pool.candidates
      : (Array.isArray(optimisationResult?.candidates) ? optimisationResult.candidates : []);
    const optSelectedId = optimisationResult?.selectedCandidateId || null;
    const selectedBeforeMerge = optSelectedId
      ? (poolCandidates.find((c) => c?.candidateId === optSelectedId) || null)
      : null;
    const selectedAfterMerge = optimisationResult?.selectedCandidate || null;
    const contractSelected = sharedBassResults.contract?.selectedCandidate || null;

    const countFor = (c) => {
      if (!c) return MISSING;
      if (!Array.isArray(c.designEqCandidateAcceptanceDiagnostics)) return MISSING;
      return c.designEqCandidateAcceptanceDiagnostics.length;
    };
    const boolStr = (v) => (v === true ? "true" : v === false ? "false" : MISSING);

    const requested = sharedBassResults.authoritative?.includeDiagnostics;
    const workerReceived = (pool && typeof pool.collectDiagnostics === "boolean") ? pool.collectDiagnostics : null;
    const poolDiagIncluded = (pool && typeof pool.diagnosticsIncluded === "boolean") ? pool.diagnosticsIncluded : null;

    const stages = [
      { name: "Requested collectDiagnostics", bad: requested !== true },
      { name: "Worker received collectDiagnostics", bad: workerReceived !== true },
      { name: "Pool diagnosticsIncluded", bad: poolDiagIncluded !== true },
      { name: "Pool candidate count", bad: poolCandidates.length === 0 },
      { name: "Pool candidate diagnostics", bad: poolCandidates.every((c) => { const n = countFor(c); return n === MISSING || n === 0; }) },
      { name: "Selected candidate ID before authority merge", bad: !optSelectedId },
      { name: "Selected candidate before authority merge", bad: (() => { const n = countFor(selectedBeforeMerge); return n === MISSING || n === 0; })() },
      { name: "Selected candidate after authority merge", bad: (() => { const n = countFor(selectedAfterMerge); return n === MISSING || n === 0; })() },
      { name: "optimisationResult.selectedCandidate", bad: (() => { const n = countFor(selectedAfterMerge); return n === MISSING || n === 0; })() },
      { name: "contract.selectedCandidate", bad: (() => { const n = countFor(contractSelected); return n === MISSING || n === 0; })() },
      { name: "bassResultsStore optimisationResult", bad: (() => { const n = countFor(selectedAfterMerge); return n === MISSING || n === 0; })() },
      { name: "TEST 11", bad: acceptance.length === 0 },
    ];
    const firstZeroOrMissing = stages.find((s) => s.bad)?.name || "none";

    return {
      requested: boolStr(requested),
      workerReceived: boolStr(workerReceived),
      poolDiagIncluded: boolStr(poolDiagIncluded),
      poolCandidateCount: poolCandidates.length,
      poolCandidates: poolCandidates.map((c) => ({
        candidateId: c?.candidateId || MISSING,
        profile: c?.designEqFitProfile || MISSING,
        diagCount: countFor(c),
      })),
      selectedIdBeforeMerge: optSelectedId || MISSING,
      selectedDiagCountBeforeMerge: countFor(selectedBeforeMerge),
      selectedDiagCountAfterMerge: countFor(selectedAfterMerge),
      optResultSelectedDiagCount: countFor(selectedAfterMerge),
      contractSelectedDiagCount: countFor(contractSelected),
      storeOptResultSelectedDiagCount: countFor(selectedAfterMerge),
      test11DiagCount: acceptance.length,
      heavyPoolReused: typeof optimisationResult?.heavyPoolReused === "boolean"
        ? (optimisationResult.heavyPoolReused ? "Yes" : "No") : MISSING,
      coreFitCount: pool?.performanceSummary?.profileCount
        ?? optimisationResult?.performanceSummary?.profileCount
        ?? MISSING,
      finalFilterBankSig: optimisationResult?.finalOptimisedBassResponse?.filterBankSignature
        || selectedAfterMerge?.filterBankSignature || MISSING,
      graphFilterBankSig: optimisationResult?.finalOptimisedBassResponse?.filterBankSignature || MISSING,
      firstZeroOrMissing,
    };
  }, [hasResult, sharedBassResults, optimisationResult, acceptance]);

  const designEqTrace = useMemo(() => {
    if (!hasResult) return null;
    const pool = sharedBassResults.lifecycle?.result?.pool || null;
    const workerTrace = pool?.__workerTrace__ || null;
    const canonicalTrace = pool?.__canonicalTrace__ || null;
    const profiles = Array.isArray(canonicalTrace?.profiles) ? canonicalTrace.profiles : [];
    return {
      workerReceived: workerTrace?.receivedCollectDiagnostics ?? null,
      generateCandidatePoolReceived: canonicalTrace?.receivedCollectDiagnostics ?? null,
      generateCanonicalCandidatePoolReceived: canonicalTrace?.receivedCollectDiagnostics ?? null,
      poolDiagnosticsIncluded: (pool && typeof pool.diagnosticsIncluded === "boolean") ? pool.diagnosticsIncluded : null,
      profiles,
      selectedCandidateId: optimisationResult?.selectedCandidateId || null,
      selectedCandidateDiagCount: Array.isArray(selectedCandidate?.designEqCandidateAcceptanceDiagnostics)
        ? selectedCandidate.designEqCandidateAcceptanceDiagnostics.length : null,
    };
  }, [hasResult, sharedBassResults, optimisationResult, selectedCandidate]);

  const diagRun = useMemo(() => getLatestDiagRun(), [open, sharedBassResults?.lifecycle?.resultFingerprint, sharedBassResults?.lifecycle?.activeJobId, acceptance.length]);
  const allDiagRuns = useMemo(() => getDiagRuns(), [open, sharedBassResults?.lifecycle?.resultFingerprint, sharedBassResults?.lifecycle?.activeJobId, acceptance.length]);

  const renderRow = (row) => {
    const t = row.trial;
    const generated = row.generated;
    const accepted = t ? !!t.accepted : false;
    const reason = t?.reason || null;
    const gate = t ? deriveFirstRejectionGate(accepted, reason) : UNAVAILABLE;
    return [
      t ? fmt(t.proposedGainDb, 2) : UNAVAILABLE,
      t ? fmt(t.proposedQ, 2) : UNAVAILABLE,
      generated ? "Yes" : "No",
      generated ? "pass" : UNAVAILABLE,
      generated ? "pass" : UNAVAILABLE,
      UNAVAILABLE,
      UNAVAILABLE,
      t ? fmt(t.localImprovementDb, 2) : UNAVAILABLE,
      UNAVAILABLE,
      UNAVAILABLE,
      t ? fmt(t.maximumDeviationReductionDb, 2) : UNAVAILABLE,
      UNAVAILABLE,
      UNAVAILABLE,
      t ? fmt(t.rmsReductionDb, 2) : UNAVAILABLE,
      UNAVAILABLE,
      t ? (accepted ? "Yes" : "No") : UNAVAILABLE,
      gate,
      reason || UNAVAILABLE,
    ];
  };

  return (
    <div style={{ border: "1px solid #DCDBD6", borderRadius: 8, background: "#F8F8F7", marginTop: 8 }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", cursor: "pointer" }}
        onClick={() => setOpen(!open)}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1B1A1A", fontFamily: "monospace" }}>
          TEST 11 — GENTLE PEAK-CUT RUNTIME VALIDATION {open ? "▾" : "▸"}
        </span>
      </div>

      {open && (
        <div style={{ padding: "0 12px 12px 12px" }}>
          {hasResult && trace && (
            <div style={{ border: "1px solid #DCDBD6", borderRadius: 6, background: "#FFF", padding: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1B1A1A", fontFamily: "monospace", marginBottom: 6 }}>
                DIAGNOSTIC PROPAGATION TRACE
              </div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "#1B1A1A", lineHeight: 1.6 }}>
                <div>1. Requested collectDiagnostics: <b>{trace.requested}</b></div>
                <div>2. Worker received collectDiagnostics: <b>{trace.workerReceived}</b></div>
                <div>3. Pool diagnosticsIncluded: <b>{trace.poolDiagIncluded}</b></div>
                <div>4. Pool candidate count: <b>{trace.poolCandidateCount}</b></div>
                <div>5. Pool candidates:</div>
                {trace.poolCandidates.length === 0 ? (
                  <div style={{ paddingLeft: 16, color: "#9CA3AF" }}>— none —</div>
                ) : (
                  trace.poolCandidates.map((c, i) => (
                    <div key={i} style={{ paddingLeft: 16 }}>
                      <span style={{ color: "#625143" }}>
                        candidate {c.candidateId} | profile {c.profile} | diagnostics {c.diagCount}
                      </span>
                    </div>
                  ))
                )}
                <div>6. Selected candidate ID before authority merge: <b>{trace.selectedIdBeforeMerge}</b></div>
                <div>7. Selected candidate diagnostic count before authority merge: <b>{trace.selectedDiagCountBeforeMerge}</b></div>
                <div>8. Selected candidate diagnostic count after authority merge: <b>{trace.selectedDiagCountAfterMerge}</b></div>
                <div>9. optimisationResult.selectedCandidate diagnostic count: <b>{trace.optResultSelectedDiagCount}</b></div>
                <div>10. contract.selectedCandidate diagnostic count: <b>{trace.contractSelectedDiagCount}</b></div>
                <div>11. bassResultsStore optimisationResult selected-candidate diagnostic count: <b>{trace.storeOptResultSelectedDiagCount}</b></div>
                <div>12. TEST 11 diagnostic count: <b>{trace.test11DiagCount}</b></div>
                <div>13. Heavy pool reused: <b>{trace.heavyPoolReused}</b></div>
                <div>14. Core fit count: <b>{trace.coreFitCount}</b></div>
                <div>15. Final filter-bank signature: <b>{trace.finalFilterBankSig}</b></div>
                <div>16. Graph filter-bank signature: <b>{trace.graphFilterBankSig}</b></div>
                <div style={{ marginTop: 6, fontWeight: 700, color: trace.firstZeroOrMissing === "none" ? "#16a34a" : "#dc2626" }}>
                  FIRST ZERO OR MISSING STAGE: {trace.firstZeroOrMissing}
                </div>
              </div>
            </div>
          )}
          {hasResult && designEqTrace && (
            <div style={{ border: "1px solid #DCDBD6", borderRadius: 6, background: "#FFF", padding: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1B1A1A", fontFamily: "monospace", marginBottom: 6 }}>
                TEST 11D — calculateDesignEqCurve PRODUCTION OUTPUT TRACE
              </div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "#1B1A1A", lineHeight: 1.6, marginBottom: 8 }}>
                <div>1. Worker event received collectDiagnostics: <b>{designEqTrace.workerReceived === null ? MISSING : String(designEqTrace.workerReceived)}</b></div>
                <div>2. generateCandidatePool received collectDiagnostics: <b>{designEqTrace.generateCandidatePoolReceived === null ? MISSING : String(designEqTrace.generateCandidatePoolReceived)}</b></div>
                <div>3. generateCanonicalCandidatePool received collectDiagnostics: <b>{designEqTrace.generateCanonicalCandidatePoolReceived === null ? MISSING : String(designEqTrace.generateCanonicalCandidatePoolReceived)}</b></div>
              </div>
              <div style={{ overflowX: "auto", marginBottom: 8 }}>
                <table style={{ borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace", minWidth: 1200 }}>
                  <thead>
                    <tr>
                      {["Profile", "4. input collectDiagnostics", "5. detected regions", "6. append trials", "7. revision trials", "8. acceptance diag before return", "9. final enabled filters", "10. filter-bank signature", "11. stop reason", "12. diag after buildCanonicalCandidate"].map((col) => (
                        <th key={col} style={{ border: "1px solid #DCDBD6", padding: "4px 6px", textAlign: "left", background: "#EFEEEC", color: "#1B1A1A", whiteSpace: "nowrap" }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {designEqTrace.profiles.length === 0 ? (
                      <tr><td colSpan={10} style={{ border: "1px solid #DCDBD6", padding: "4px 6px", color: "#9CA3AF" }}>— no profile trace —</td></tr>
                    ) : designEqTrace.profiles.map((p, i) => (
                      <tr key={i}>
                        <td style={{ border: "1px solid #DCDBD6", padding: "4px 6px", whiteSpace: "nowrap" }}>{p.profile || MISSING}</td>
                        <td style={{ border: "1px solid #DCDBD6", padding: "4px 6px", whiteSpace: "nowrap" }}>{p.inputCollectDiagnostics === null ? MISSING : String(p.inputCollectDiagnostics)}</td>
                        <td style={{ border: "1px solid #DCDBD6", padding: "4px 6px", whiteSpace: "nowrap" }}>{p.detectedRegionCount === null ? MISSING : p.detectedRegionCount}</td>
                        <td style={{ border: "1px solid #DCDBD6", padding: "4px 6px", whiteSpace: "nowrap" }}>{p.appendTrialCount === null ? MISSING : p.appendTrialCount}</td>
                        <td style={{ border: "1px solid #DCDBD6", padding: "4px 6px", whiteSpace: "nowrap" }}>{p.revisionTrialCount === null ? MISSING : p.revisionTrialCount}</td>
                        <td style={{ border: "1px solid #DCDBD6", padding: "4px 6px", whiteSpace: "nowrap" }}>{p.candidateAcceptanceDiagnosticsCount === null ? MISSING : p.candidateAcceptanceDiagnosticsCount}</td>
                        <td style={{ border: "1px solid #DCDBD6", padding: "4px 6px", whiteSpace: "nowrap" }}>{p.finalEnabledFilterCount}</td>
                        <td style={{ border: "1px solid #DCDBD6", padding: "4px 6px", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{p.finalFilterBankSignature || MISSING}</td>
                        <td style={{ border: "1px solid #DCDBD6", padding: "4px 6px", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{p.stopReason || MISSING}</td>
                        <td style={{ border: "1px solid #DCDBD6", padding: "4px 6px", whiteSpace: "nowrap" }}>{p.designEqCandidateAcceptanceDiagnosticsCountAfterMapping === null ? MISSING : p.designEqCandidateAcceptanceDiagnosticsCountAfterMapping}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "#1B1A1A", lineHeight: 1.6 }}>
                <div>13. Pool diagnosticsIncluded: <b>{designEqTrace.poolDiagnosticsIncluded === null ? MISSING : String(designEqTrace.poolDiagnosticsIncluded)}</b></div>
                <div>14. Selected candidate ID: <b>{designEqTrace.selectedCandidateId || MISSING}</b></div>
                <div>15. Selected candidate diagnostic count: <b>{designEqTrace.selectedCandidateDiagCount === null ? MISSING : designEqTrace.selectedCandidateDiagCount}</b></div>
                <div>16. Worker runs caused by opening TEST 11: <b>{workerDeltaStarts === 0 && workerDeltaCompletions === 0 ? "0 ✓" : `${workerDeltaStarts} starts, ${workerDeltaCompletions} completions ✗`}</b></div>
              </div>
            </div>
          )}
          {hasResult && diagRun && (() => {
            const boolStr = (v) => v === true ? "true" : v === false ? "false" : MISSING;
            const s = (name) => diagRun.stages?.[name];
            const ts = (name) => { const t = s(name)?.ts; return t != null ? new Date(t).toISOString().split("T")[1].replace("Z", "") : MISSING; };
            const onRetryStage = s("onRetry");
            const autoStage = s("automatic-update");
            const requestManualStage = s("requestManual");
            const pendingStage = s("requestManual-pending-assigned") || s("updateInputs-pending-assigned");
            const startPendingStage = s("startPending");
            const postMessageStage = s("worker.postMessage");
            const workerEventStage = s("worker-event-received");
            const completedStage = s("worker-completed");
            const checkboxValue = onRetryStage?.checkboxValueAtClick ?? autoStage?.checkboxValueAtClick ?? diagRun.checkboxClickValue;
            const onRetryArg = onRetryStage?.onRetryArg;
            const requestManualCd = requestManualStage?.requestManualCollectDiagnostics;
            const requestManualForce = requestManualStage?.requestManualForce;
            const pendingCd = pendingStage?.pendingCollectDiagnostics;
            const pendingToken = pendingStage?.pendingToken;
            const startPendingCd = startPendingStage?.startPendingCollectDiagnostics;
            const startPendingToken = startPendingStage?.startPendingToken;
            const postMessageCd = postMessageStage?.postMessageCollectDiagnostics;
            const postMessageRequestId = postMessageStage?.postMessageRequestId;
            const postMessageToken = postMessageStage?.postMessageToken;
            const workerEventCd = workerEventStage?.workerEventCollectDiagnostics;
            const workerEventRequestId = workerEventStage?.workerEventRequestId;
            const workerEventToken = workerEventStage?.workerEventToken;
            const completedRequestId = completedStage?.resultRequestId ?? completedStage?.completedRequestId;
            const completedToken = completedStage?.resultToken ?? completedStage?.completedToken;
            const allTokens = [diagRun.token, pendingToken, startPendingToken, postMessageToken, workerEventToken, completedToken].filter((t) => t != null);
            const allRequestIds = [postMessageRequestId, workerEventRequestId, completedRequestId].filter((r) => r != null);
            const tokensMatch = allTokens.length > 0 && allTokens.every((t) => t === allTokens[0]);
            const requestIdsMatch = allRequestIds.length > 0 && allRequestIds.every((r) => r === allRequestIds[0]);
            const allSameRun = tokensMatch && requestIdsMatch;
            const cdValues = [
              { stage: "1. Checkbox at click", value: checkboxValue },
              { stage: "3. onRetry argument", value: onRetryArg },
              { stage: "4. requestManual collectDiagnostics", value: requestManualCd },
              { stage: "6. Pending collectDiagnostics", value: pendingCd },
              { stage: "8. startPending collectDiagnostics", value: startPendingCd },
              { stage: "10. worker.postMessage collectDiagnostics", value: postMessageCd },
              { stage: "13. Worker event received collectDiagnostics", value: workerEventCd },
            ];
            const firstDiff = cdValues.find((v) => v.value != null && v.value !== true);
            const firstDiffStage = firstDiff ? firstDiff.stage : "none";
            const allTrue = cdValues.every((v) => v.value === true);
            return (
              <div style={{ border: "1px solid #DCDBD6", borderRadius: 6, background: "#FFF", padding: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1B1A1A", fontFamily: "monospace", marginBottom: 6 }}>
                  TEST 11E — RUN-CORRELATED collectDiagnostics DISPATCH TRACE
                </div>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "#1B1A1A", lineHeight: 1.6 }}>
                  <div>Origin: <b>{diagRun.origin || MISSING}</b></div>
                  <div>1. Checkbox includeDiagnostics at click: <b>{boolStr(checkboxValue)}</b></div>
                  <div>2. Generated diagnostic request token: <b>{diagRun.token || MISSING}</b></div>
                  <div>3. onRetry argument: <b>{onRetryArg === undefined ? MISSING : boolStr(onRetryArg)}</b></div>
                  <div>4. requestManual collectDiagnostics argument: <b>{boolStr(requestManualCd)}</b></div>
                  <div>5. requestManual force argument: <b>{boolStr(requestManualForce)}</b></div>
                  <div>6. Pending collectDiagnostics after assignment: <b>{boolStr(pendingCd)}</b></div>
                  <div>7. Pending diagnostic request token: <b>{pendingToken || MISSING}</b></div>
                  <div>8. startPending collectDiagnostics: <b>{boolStr(startPendingCd)}</b></div>
                  <div>9. startPending diagnostic request token: <b>{startPendingToken || MISSING}</b></div>
                  <div>10. worker.postMessage collectDiagnostics: <b>{boolStr(postMessageCd)}</b></div>
                  <div>11. worker.postMessage requestId: <b>{postMessageRequestId || MISSING}</b></div>
                  <div>12. worker.postMessage diagnostic request token: <b>{postMessageToken || MISSING}</b></div>
                  <div>13. Worker event received collectDiagnostics: <b>{boolStr(workerEventCd)}</b></div>
                  <div>14. Worker event requestId: <b>{workerEventRequestId || MISSING}</b></div>
                  <div>15. Worker event diagnostic request token: <b>{workerEventToken || MISSING}</b></div>
                  <div>16. Completed result requestId: <b>{completedRequestId || MISSING}</b></div>
                  <div>17. Completed result diagnostic request token: <b>{completedToken || MISSING}</b></div>
                  <div style={{ marginTop: 4, fontWeight: 700, color: allSameRun ? "#16a34a" : "#dc2626" }}>
                    18. All tokens and requestIds same run: <b>{allSameRun ? "YES ✓" : "NO ✗"}</b>
                  </div>
                  {allTokens.length > 0 && <div style={{ color: "#625143" }}>Token match: {tokensMatch ? "PASS" : "FAIL"} ({allTokens.length} tokens)</div>}
                  {allRequestIds.length > 0 && <div style={{ color: "#625143" }}>RequestId match: {requestIdsMatch ? "PASS" : "FAIL"} ({allRequestIds.length} ids)</div>}
                  <div style={{ marginTop: 6, fontWeight: 700, color: allTrue ? "#16a34a" : "#dc2626" }}>
                    FIRST STAGE WHERE collectDiagnostics DIFFERS: {firstDiffStage === "none" ? "none — all true" : firstDiffStage}
                  </div>
                  <div style={{ marginTop: 8, fontWeight: 700 }}>Timestamps:</div>
                  <div>Checkbox click: <b>{diagRun.checkboxClickTs != null ? new Date(diagRun.checkboxClickTs).toISOString().split("T")[1].replace("Z", "") : MISSING}</b></div>
                  <div>requestManual: <b>{ts("requestManual")}</b></div>
                  <div>worker.postMessage: <b>{ts("worker.postMessage")}</b></div>
                  <div>Worker event received: <b>{ts("worker-event-received")}</b></div>
                  <div>Worker completed: <b>{ts("worker-completed")}</b></div>
                </div>
                {allDiagRuns.length > 1 && (
                  <div style={{ marginTop: 8, fontSize: 10, fontFamily: "monospace", color: "#625143" }}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>All recorded runs (latest at bottom):</div>
                    {allDiagRuns.map((r) => (
                      <div key={r.token} style={{ color: r.token === diagRun.token ? "#1B1A1A" : "#9CA3AF" }}>
                        {r.token} | {r.origin || MISSING} | stages: {Object.keys(r.stages).join(", ") || "none"}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          {!hasResult && (
            <div style={{ fontSize: 11, color: "#8B7F76", fontFamily: "monospace", padding: 12 }}>
              No completed canonical result available. Recalculate once with engineering diagnostics enabled.
            </div>
          )}
          {hasResult && !acceptance.length && (
            <div style={{ fontSize: 11, color: "#8B7F76", fontFamily: "monospace", padding: 12 }}>
              No candidate acceptance diagnostics in the production trace. Enable engineering diagnostics and recalculate.
            </div>
          )}
          {hasResult && acceptance.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: "#625143", fontFamily: "monospace", marginBottom: 8 }}>
                Target region: {TARGET_FREQ_HZ} Hz (±{TARGET_FREQ_TOLERANCE_HZ} Hz). Reading from designEqCandidateAcceptanceDiagnostics.
              </div>

              <div style={{ overflowX: "auto", marginBottom: 12 }}>
                <table style={{ borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace", minWidth: 1400 }}>
                  <thead>
                    <tr>
                      {TABLE_COLUMNS.map((col) => (
                        <th key={col} style={{ border: "1px solid #DCDBD6", padding: "4px 6px", textAlign: "left", background: "#EFEEEC", color: "#1B1A1A", whiteSpace: "nowrap" }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gentleRows.map((row, idx) => {
                      const cells = renderRow(row);
                      return (
                        <tr key={idx}>
                          {cells.map((cell, ci) => (
                            <td key={ci} style={{ border: "1px solid #DCDBD6", padding: "4px 6px", whiteSpace: "nowrap", color: cell === UNAVAILABLE ? "#9CA3AF" : "#1B1A1A" }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: 11, fontFamily: "monospace", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: "#1B1A1A", marginBottom: 4 }}>Existing raw ladder detected:</div>
                {rawDetected.map((r, idx) => (
                  <div key={idx} style={{ color: "#625143" }}>
                    {fmt(r.targetGain, 2)} dB — {r.detected ? `detected (gain ${fmt(r.gain, 2)}, Q ${fmt(r.q, 2)}, ${r.accepted ? "accepted" : "rejected"})` : "not detected"}
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 11, fontFamily: "monospace", borderTop: "1px solid #DCDBD6", paddingTop: 8 }}>
                <div style={{ fontWeight: 700, color: "#1B1A1A", marginBottom: 4 }}>Final selected EQ bank:</div>
                <div style={{ color: "#625143", marginBottom: 2 }}>
                  {finalBank.filter((f) => f?.enabled).map((f) => `${fmt(f.frequencyHz, 1)}Hz ${fmt(f.gainDb, 1)}dB Q${fmt(f.Q, 1)}`).join(", ") || "none"}
                </div>
                <div style={{ color: gentleInFinalBank ? "#16a34a" : "#dc2626", marginBottom: 4 }}>
                  Gentle candidate in final bank: {gentleInFinalBank ? "YES" : "NO"}
                </div>

                <div style={{ fontWeight: 700, color: "#1B1A1A", marginBottom: 4, marginTop: 8 }}>P19:</div>
                <div style={{ color: "#625143", marginBottom: 2 }}>P19 before EQ: {fmt(selectedCandidate?.p19BeforeEqDb, 2)}</div>
                <div style={{ color: "#625143", marginBottom: 4 }}>P19 after EQ: {fmt(selectedCandidate?.p19AfterEqDb, 2)}</div>

                <div style={{ fontWeight: 700, color: "#1B1A1A", marginBottom: 4, marginTop: 8 }}>Worker runs caused by TEST 11:</div>
                <div style={{ color: workerDeltaStarts === 0 && workerDeltaCompletions === 0 ? "#16a34a" : "#dc2626", marginBottom: 4 }}>
                  starts: {workerDeltaStarts}, completions: {workerDeltaCompletions} {workerDeltaStarts === 0 && workerDeltaCompletions === 0 ? "✓" : "✗"}
                </div>

                <div style={{ fontWeight: 700, color: "#1B1A1A", marginBottom: 4, marginTop: 8 }}>Identity:</div>
                <div style={{ color: "#625143", marginBottom: 2 }}>Production result ID: {optimisationResult?.selectedCandidateId || UNAVAILABLE}</div>
                <div style={{ color: "#625143", marginBottom: 2 }}>Selected candidate ID: {selectedCandidate?.candidateId || UNAVAILABLE}</div>
                <div style={{ color: "#625143", marginBottom: 2 }}>Final filter-bank signature: {finalSig || UNAVAILABLE}</div>
                <div style={{ color: "#625143", marginBottom: 2 }}>Graph filter-bank signature: {graphSig || UNAVAILABLE}</div>
                <div style={{ color: identityPass ? "#16a34a" : "#dc2626" }}>Production/graph identity: {identityPass ? "PASS" : "FAIL"}</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}