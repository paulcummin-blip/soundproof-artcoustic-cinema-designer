// EqDiscoveryAuditPanel.jsx — Read-only EQ Discovery Audit panel.
//
// Collapsible, engineering-only. Hidden unless "Include engineering diagnostics"
// is enabled. Runs the audit engine on the completed canonical result.
// Triggers zero simulations, zero optimiser runs, zero cache invalidations.

import React, { useState, useMemo, useCallback } from "react";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { runEqDiscoveryAudit } from "@/components/room/bass/eqDiscoveryAuditEngine";
import { buildEqDiscoveryAuditReport } from "@/components/room/bass/eqDiscoveryAuditReport";
import EqDiscoveryAuditSections from "@/components/room/bass/EqDiscoveryAuditSectionsView";

const fmt = (v, digits = 2, fallback = "—") => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : fallback;
};

export default function EqDiscoveryAuditPanel() {
  const sharedBassResults = useSharedBassResults();
  const [open, setOpen] = useState(false);
  const [audit, setAudit] = useState(null);
  const [running, setRunning] = useState(false);
  const [workerBefore, setWorkerBefore] = useState(null);
  const [workerAfter, setWorkerAfter] = useState(null);
  const [copied, setCopied] = useState(false);

  const optimisationResult = sharedBassResults.optimisationResult;
  const authoritative = sharedBassResults.authoritative;
  const fingerprints = authoritative?.fingerprints;
  const rawRspCurve = authoritative?.rspRawCurve;

  const handleRun = useCallback(() => {
    setRunning(true);
    // Record worker lifecycle before
    const before = {
      starts: typeof window !== "undefined" ? (window.__BASS_WORKER_STARTS__ || 0) : 0,
      completions: typeof window !== "undefined" ? (window.__BASS_WORKER_COMPLETIONS__ || 0) : 0,
    };
    setWorkerBefore(before);

    // Run the audit — pure, read-only, zero simulations
    const result = runEqDiscoveryAudit({ optimisationResult, fingerprints, rawRspCurve });
    setAudit(result);

    // Record worker lifecycle after
    const after = {
      starts: typeof window !== "undefined" ? (window.__BASS_WORKER_STARTS__ || 0) : 0,
      completions: typeof window !== "undefined" ? (window.__BASS_WORKER_COMPLETIONS__ || 0) : 0,
    };
    setWorkerAfter(after);
    setRunning(false);
  }, [optimisationResult, fingerprints, rawRspCurve]);

  const handleCopy = useCallback(() => {
    const report = buildEqDiscoveryAuditReport({
      optimisationResult,
      fingerprints,
      rawRspCurve,
      workerDelta: {
        starts: (workerAfter?.starts || 0) - (workerBefore?.starts || 0),
        completions: (workerAfter?.completions || 0) - (workerBefore?.completions || 0),
      },
    });
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(report);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = report;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[CopyEqDiscoveryAudit] clipboard write failed", err);
    }
  }, [optimisationResult, fingerprints, rawRspCurve, workerBefore, workerAfter]);

  const workerDeltaStarts = (workerAfter?.starts || 0) - (workerBefore?.starts || 0);
  const workerDeltaCompletions = (workerAfter?.completions || 0) - (workerBefore?.completions || 0);

  return (
    <div style={{ border: "1px solid #DCDBD6", borderRadius: 8, background: "#F8F8F7", marginTop: 8 }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", cursor: "pointer" }}
        onClick={() => setOpen(!open)}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1B1A1A", fontFamily: "monospace" }}>
          EQ Discovery Audit {open ? "▾" : "▸"}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleRun}
            disabled={running || !optimisationResult}
            style={{
              height: 26, padding: "0 10px", borderRadius: 6,
              border: "1px solid #213428", background: running ? "#213428" : "#fff",
              color: running ? "#fff" : "#213428", fontSize: 11, fontFamily: "monospace",
              cursor: running || !optimisationResult ? "not-allowed" : "pointer", fontWeight: 600, whiteSpace: "nowrap",
            }}
            title="Run the read-only EQ discovery audit. Zero simulations triggered."
          >
            {running ? "Running..." : "Run EQ Discovery Audit"}
          </button>
          <button
            onClick={handleCopy}
            disabled={!audit?.available}
            style={{
              height: 26, padding: "0 10px", borderRadius: 6,
              border: "1px solid #213428", background: copied ? "#213428" : "#fff",
              color: copied ? "#fff" : "#213428", fontSize: 11, fontFamily: "monospace",
              cursor: !audit?.available ? "not-allowed" : "pointer", fontWeight: 600, whiteSpace: "nowrap",
            }}
            title="Copy the read-only EQ discovery audit report to clipboard."
          >
            {copied ? "Copied ✓" : "Copy EQ Discovery Audit"}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ padding: "0 12px 12px 12px" }}>
          {!optimisationResult && (
            <div style={{ fontSize: 11, color: "#8B7F76", fontFamily: "monospace", padding: 12 }}>
              No completed canonical result available. Recalculate once with engineering diagnostics enabled.
            </div>
          )}
          {optimisationResult && !audit && (
            <div style={{ fontSize: 11, color: "#8B7F76", fontFamily: "monospace", padding: 12 }}>
              Click "Run EQ Discovery Audit" to generate the audit. This triggers zero simulations.
            </div>
          )}
          {audit && !audit.available && (
            <div style={{ fontSize: 11, color: "#b45309", fontFamily: "monospace", padding: 12 }}>
              Audit unavailable: {audit.reason}
            </div>
          )}
          {audit?.available && (
            <>
              {/* Worker delta indicator */}
              <div style={{ fontSize: 10, color: workerDeltaStarts === 0 && workerDeltaCompletions === 0 ? "#16a34a" : "#dc2626", fontFamily: "monospace", marginBottom: 8 }}>
                Worker delta — starts: {workerDeltaStarts}, completions: {workerDeltaCompletions} {workerDeltaStarts === 0 && workerDeltaCompletions === 0 ? "✓" : "✗"}
              </div>
              <EqDiscoveryAuditSections audit={audit} />
            </>
          )}
        </div>
      )}
    </div>
  );
}