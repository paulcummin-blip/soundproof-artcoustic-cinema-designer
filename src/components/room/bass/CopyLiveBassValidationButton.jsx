// CopyLiveBassValidationButton.jsx — Read-only, engineering-diagnostics-only
// export control.
//
// Behaviour:
//   - Hidden unless "Include engineering diagnostics" is enabled.
//   - Copies one plain-text report to the clipboard.
//   - Uses existing completed runtime data only.
//   - Triggers zero simulations and zero optimiser runs.
//   - Shows "INCOMPLETE" for any missing authority instead of substituting data.
//
// This component does NOT call any simulation, EQ, authority, scoring, cache,
// worker, or graph function. It reads from the shared bass results store and
// the app state, then calls the pure report builder.

import React, { useState } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { buildLiveBassValidationReport } from "@/components/room/bass/liveBassValidationReport";

export default function CopyLiveBassValidationButton() {
  const { designEqEnabled } = useAppState();
  const sharedBassResults = useSharedBassResults();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const authoritative = sharedBassResults.authoritative;
    const report = buildLiveBassValidationReport({
      roomDims: authoritative?.roomDims,
      rspPosition: authoritative?.rspPosition,
      seatingPositions: authoritative?.seatingPositions,
      sources: authoritative?.sources || authoritative?.subsForSimulation,
      splConfig: authoritative?.splConfig,
      requested: authoritative?.requested,
      fingerprints: authoritative?.fingerprints,
      optimisationResult: sharedBassResults.optimisationResult,
      lifecycle: sharedBassResults.lifecycle,
      designEqEnabled,
      rawRspCurve: authoritative?.rspRawCurve,
    });

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        // Fallback for non-secure contexts
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
      console.error("[CopyLiveBassValidation] clipboard write failed", err);
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
      }}
      title="Copy a read-only plain-text validation report from the current live project and completed canonical result. Triggers zero simulations."
    >
      {copied ? "Copied ✓" : "Copy Live Bass Validation"}
    </button>
  );
}