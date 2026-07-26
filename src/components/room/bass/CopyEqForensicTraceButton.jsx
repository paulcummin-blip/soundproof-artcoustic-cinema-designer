// CopyEqForensicTraceButton.jsx — Read-only, engineering-diagnostics-only
// EQ forensic trace export control.
//
// Behaviour:
//   - Hidden unless "Include engineering diagnostics" is enabled.
//   - Copies one plain-text forensic trace report to the clipboard.
//   - Uses existing completed runtime data only.
//   - Triggers zero simulations, zero optimiser runs, zero cache invalidations,
//     and zero fingerprint changes.
//   - Prints "INCOMPLETE" / "UNAVAILABLE" for any missing stage.
//   - Never infers missing values from static code.
//
// This component does NOT call any simulation, EQ, authority, scoring, cache,
// worker, or graph function. It reads from the shared bass results store and
// the app state, then calls the pure report builder.

import React, { useState } from "react";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { buildEqForensicTraceReport } from "@/components/room/bass/eqForensicTraceReport";

export default function CopyEqForensicTraceButton() {
  const sharedBassResults = useSharedBassResults();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const authoritative = sharedBassResults.authoritative;
    const report = buildEqForensicTraceReport({
      optimisationResult: sharedBassResults.optimisationResult,
      fingerprints: authoritative?.fingerprints,
      rawRspCurve: authoritative?.rspRawCurve,
      splConfig: authoritative?.splConfig,
      requested: authoritative?.requested,
    });

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
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
      console.error("[CopyEqForensicTrace] clipboard write failed", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      style={{
        height: 26,
        padding: "0 10px",
        borderRadius: 6,
        border: "1px solid #213428",
        background: copied ? "#213428" : "#fff",
        color: copied ? "#fff" : "#213428",
        fontSize: 11,
        fontFamily: "monospace",
        cursor: "pointer",
        fontWeight: 600,
        whiteSpace: "nowrap",
        marginLeft: 6,
      }}
      title="Copy a read-only EQ forensic trace from the current completed canonical result. Triggers zero simulations."
    >
      {copied ? "Copied ✓" : "Copy EQ Forensic Trace"}
    </button>
  );
}