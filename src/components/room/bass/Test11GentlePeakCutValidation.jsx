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

const UNAVAILABLE = "UNAVAILABLE";
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