import React, { useMemo, useState } from "react";
import { buildExactHouseCurveCaseCapture } from "./exactHouseCurveCaseCapture";

export default function ExactHouseCurveCaseCaptureButton({ captureInputs }) {
  const [status, setStatus] = useState("");
  const capture = useMemo(() => buildExactHouseCurveCaseCapture(captureInputs), [captureInputs]);
  const available = capture.captureValidation.valid;
  const unavailableReason = capture.captureValidation.failures.join("; ");
  const copyCase = async () => {
    try {
      if (!available) return;
      await navigator.clipboard.writeText(JSON.stringify(capture, null, 2));
      setStatus(`Copied ${capture.frequencyGrid.length} exact frequency points`);
    } catch (error) {
      setStatus(`Copy failed: ${error?.message || "clipboard unavailable"}`);
    }
  };
  return <div className="mt-2 flex items-center gap-2 rounded border border-amber-300 bg-amber-50 p-2">
    <button type="button" onClick={copyCase} disabled={!available} className="rounded border border-amber-700 bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
      Copy exact house-curve case
    </button>
    <span className="font-mono text-[10px] text-amber-900">{status || (available ? `Validated · ${capture.caseFingerprint}` : unavailableReason)}</span>
  </div>;
}