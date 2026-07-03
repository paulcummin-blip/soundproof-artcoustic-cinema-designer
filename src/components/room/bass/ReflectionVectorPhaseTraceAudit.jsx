// ReflectionVectorPhaseTraceAudit.jsx
// Temporary READ-ONLY diagnostic — audits the exact phase relationship between the
// direct vector, image-source reflection vector, modal vector, and final production
// vector for the fixed REW parity case. Calls the production engine
// (simulateBassResponseRewCore) unmodified — no graph, coefficient, or maths changes.
//
// Fixed test case: room 5.0m x 4.5m x 3.0m, sub centre-front, seat y=4.0m,
// absorption 0.30 all surfaces, frequencies 28-35Hz.

import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";

const TEST_FREQS = [28, 29, 30, 31, 32, 33, 34, 35];
const ROOM_DIMS = { widthM: 4.5, lengthM: 5.0, heightM: 3.0 };
const SUB = { x: 4.5 / 2, y: 0.1, z: 0.35, modelKey: "test-sub", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: 4.5 / 2, y: 4.0, z: 1.2 };
const SURFACE_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }]; // flat reference — unchanged

function magToDb(mag) {
  return 20 * Math.log10(Math.max(mag, 1e-10));
}
function phaseDeg(re, im) {
  return (Math.atan2(im, re) * 180) / Math.PI;
}
function angleDiffDeg(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function runProduction(frequencyHz) {
  // A: production — direct + reflections + modal (unmodified)
  const result = simulateBassResponseRewCore(ROOM_DIMS, SEAT, SUB, FLAT_CURVE, {
    freqMinHz: frequencyHz,
    freqMaxHz: frequencyHz + 0.01,
    modeGenerationFMaxHz: 200,
    surfaceAbsorption: SURFACE_ABSORPTION,
    enableReflections: true,
    enableModes: true,
  });
  const vec = result.perFrequencyVectorDebug[0] || {};
  const directRe = vec.directRe ?? 0;
  const directIm = vec.directIm ?? 0;
  const reflectionRe = vec.reflectionRe ?? 0;
  const reflectionIm = vec.reflectionIm ?? 0;
  const modalRe = vec.modalSumRe ?? 0;
  const modalIm = vec.modalSumIm ?? 0;
  const finalRe = vec.finalRe ?? 0;
  const finalIm = vec.finalIm ?? 0;

  const directMag = Math.sqrt(directRe * directRe + directIm * directIm);
  const reflectionMag = Math.sqrt(reflectionRe * reflectionRe + reflectionIm * reflectionIm);
  const modalMag = Math.sqrt(modalRe * modalRe + modalIm * modalIm);
  const finalMag = Math.sqrt(finalRe * finalRe + finalIm * finalIm);

  const directPhase = phaseDeg(directRe, directIm);
  const reflectionPhase = phaseDeg(reflectionRe, reflectionIm);
  const modalPhase = phaseDeg(modalRe, modalIm);
  const finalPhase = phaseDeg(finalRe, finalIm);

  const combinedDirectReflectionRe = directRe + reflectionRe;
  const combinedDirectReflectionIm = directIm + reflectionIm;
  const combinedDirectReflectionPhase = phaseDeg(combinedDirectReflectionRe, combinedDirectReflectionIm);

  const scalarSumMag = directMag + reflectionMag + modalMag;
  const vectorSumMag = finalMag;
  const cancellationLossDb = magToDb(scalarSumMag) - magToDb(vectorSumMag);

  return {
    hz: frequencyHz,
    directRe, directIm, directMagDb: magToDb(directMag), directPhase,
    reflectionRe, reflectionIm, reflectionMagDb: magToDb(reflectionMag), reflectionPhase,
    modalRe, modalIm, modalMagDb: magToDb(modalMag), modalPhase,
    finalRe, finalIm, finalSplDb: result.splDbRaw[0], finalPhase,
    phaseDiffDirectReflection: angleDiffDeg(directPhase, reflectionPhase),
    phaseDiffDirectModal: angleDiffDeg(directPhase, modalPhase),
    phaseDiffReflectionModal: angleDiffDeg(reflectionPhase, modalPhase),
    phaseDiffCombinedVsModal: angleDiffDeg(combinedDirectReflectionPhase, modalPhase),
    cancellationLossDb,
  };
}

// Variant B — reflections disabled, used only to test whether removing reflections
// improves the 30Hz value (for the pass/fail logic's second branch).
function runNoReflections(frequencyHz) {
  const result = simulateBassResponseRewCore(ROOM_DIMS, SEAT, SUB, FLAT_CURVE, {
    freqMinHz: frequencyHz,
    freqMaxHz: frequencyHz + 0.01,
    modeGenerationFMaxHz: 200,
    surfaceAbsorption: SURFACE_ABSORPTION,
    enableReflections: false,
    enableModes: true,
  });
  return result.splDbRaw[0];
}

export default function ReflectionVectorPhaseTraceAudit() {
  const rows = useMemo(() => TEST_FREQS.map((hz) => runProduction(hz)), []);
  const noReflectionAt30 = useMemo(() => runNoReflections(30), []);

  const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

  const row30 = rows.find((r) => r.hz === 30);
  const aAt30 = row30?.finalSplDb;

  // Pass/fail logic evaluated at 30Hz
  const phaseOpposesAt30 =
    (Number.isFinite(row30?.phaseDiffReflectionModal) && row30.phaseDiffReflectionModal >= 120 && row30.phaseDiffReflectionModal <= 180) ||
    (Number.isFinite(row30?.phaseDiffCombinedVsModal) && row30.phaseDiffCombinedVsModal >= 120 && row30.phaseDiffCombinedVsModal <= 180);
  const cancellationHigh = Number.isFinite(row30?.cancellationLossDb) && row30.cancellationLossDb > 6;
  const removingReflectionsImproves = Number.isFinite(noReflectionAt30) && Number.isFinite(aAt30) && (noReflectionAt30 - aAt30) > 1;
  const reflectionSignificant = Number.isFinite(row30?.reflectionMagDb) && Number.isFinite(row30?.modalMagDb) && (row30.reflectionMagDb - row30.modalMagDb > -15);

  let verdictLabel;
  if (phaseOpposesAt30 && cancellationHigh) {
    verdictLabel = "REFLECTION VECTOR PHASE IS CAUSING THE 30HZ NULL.";
  } else if (removingReflectionsImproves && !phaseOpposesAt30) {
    verdictLabel = "REFLECTION MAGNITUDE CONTRIBUTION CONFIRMED, PHASE CAUSE NOT CONFIRMED.";
  } else if (!reflectionSignificant) {
    verdictLabel = "REFLECTION PATH NOT PRIMARY CAUSE.";
  } else {
    verdictLabel = "REFLECTION PATH NOT PRIMARY CAUSE.";
  }

  const testStr = "Phase relationship between direct, reflection, modal, and final production vectors at 30Hz (fixed REW parity case).";
  const expectedStr = "If reflections destructively combine with the modal field, reflection phase should be 120-180° from modal (or direct+modal) at 30Hz, with >6dB vector cancellation loss vs scalar sum.";
  const actualStr = `Reflection vs modal phase diff = ${fmt(row30?.phaseDiffReflectionModal)}°, combined(direct+reflection) vs modal = ${fmt(row30?.phaseDiffCombinedVsModal)}°, cancellation loss = ${fmt(row30?.cancellationLossDb)} dB. Removing reflections changes 30Hz SPL from ${fmt(aAt30)} to ${fmt(noReflectionAt30)} dB.`;
  const deltaStr = `${fmt(Number.isFinite(noReflectionAt30) && Number.isFinite(aAt30) ? noReflectionAt30 - aAt30 : null)} dB (no-reflections minus production at 30Hz)`;
  const severityStr = verdictLabel.startsWith("REFLECTION VECTOR PHASE") ? "Critical" : verdictLabel.startsWith("REFLECTION MAGNITUDE") ? "Medium" : "Low";
  const nextTestStr = verdictLabel.startsWith("REFLECTION VECTOR PHASE")
    ? "Isolate which image-source order/wall pair contributes the opposing phase at 30Hz."
    : verdictLabel.startsWith("REFLECTION MAGNITUDE")
      ? "Audit reflection magnitude scaling (coherence weighting, absorption coefficients) independent of phase."
      : "Investigate modal-only mechanisms (Q, coupling, mode density) as the null's primary cause.";

  return (
    <div style={{ border: "2px solid #4c1d95", borderRadius: 8, background: "#f5f3ff", padding: "10px 12px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: "#4c1d95", fontSize: 12, marginBottom: 4 }}>
        Reflection Vector Phase Trace Audit — temporary diagnostic (production engine, unmodified)
      </div>
      <div style={{ color: "#5b21b6", fontSize: 9, marginBottom: 8, fontStyle: "italic" }}>
        Room 5.0m x 4.5m x 3.0m — sub centre-front — seat y=4.0m — absorption 0.30. Read-only: values below are exact production vectors from simulateBassResponseRewCore (perFrequencyVectorDebug), no reconstruction.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #c4b5fd", color: "#4c1d95", fontSize: 9, textTransform: "uppercase" }}>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Hz</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Dir Re</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Dir Im</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Dir dB</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Dir °</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Refl Re</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Refl Im</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Refl dB</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Refl °</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Modal Re</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Modal Im</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Modal dB</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Modal °</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Fin Re</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Fin Im</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Fin SPL</th>
              <th style={{ textAlign: "right", padding: "2px 5px" }}>Fin °</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.hz} style={{ borderBottom: "1px solid #ddd6fe", background: r.hz === 30 ? "#ede9fe" : undefined }}>
                <td style={{ textAlign: "right", padding: "1px 5px", fontWeight: 700 }}>{r.hz}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{r.directRe.toFixed(3)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{r.directIm.toFixed(3)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{fmt(r.directMagDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{fmt(r.directPhase)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{r.reflectionRe.toFixed(3)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{r.reflectionIm.toFixed(3)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{fmt(r.reflectionMagDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{fmt(r.reflectionPhase)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{r.modalRe.toFixed(3)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{r.modalIm.toFixed(3)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{fmt(r.modalMagDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{fmt(r.modalPhase)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{r.finalRe.toFixed(3)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{r.finalIm.toFixed(3)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{fmt(r.finalSplDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 5px" }}>{fmt(r.finalPhase)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "#4c1d95", marginBottom: 4 }}>Automatic Vector Diagnosis</div>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #c4b5fd", color: "#4c1d95", fontSize: 9, textTransform: "uppercase" }}>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Hz</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Dir vs Refl °</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Dir vs Modal °</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Refl vs Modal °</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>(Dir+Refl) vs Modal °</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Cancellation Loss dB</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.hz} style={{ borderBottom: "1px solid #ddd6fe", background: r.hz === 30 ? "#ede9fe" : undefined }}>
                <td style={{ textAlign: "right", padding: "1px 6px", fontWeight: 700 }}>{r.hz}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.phaseDiffDirectReflection)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.phaseDiffDirectModal)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.phaseDiffReflectionModal)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.phaseDiffCombinedVsModal)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px", fontWeight: r.cancellationLossDb > 6 ? 700 : 400, color: r.cancellationLossDb > 6 ? "#b91c1c" : "#1c1917" }}>{fmt(r.cancellationLossDb)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ border: "1px solid #c4b5fd", borderRadius: 6, background: "#fff", padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "#4c1d95", marginBottom: 4 }}>Pass/Fail Diagnosis (30Hz)</div>
        <div style={{ fontWeight: 700, fontSize: 11, color: verdictLabel.startsWith("REFLECTION VECTOR PHASE") ? "#b91c1c" : verdictLabel.startsWith("REFLECTION MAGNITUDE") ? "#b45309" : "#166534" }}>
          {verdictLabel}
        </div>
      </div>

      <div style={{ border: "2px solid #4c1d95", borderRadius: 6, background: "#fff", padding: "8px 10px" }}>
        <div style={{ fontWeight: 700, color: "#4c1d95", marginBottom: 4 }}>Final Verdict</div>
        <div>TEST: {testStr}</div>
        <div>EXPECTED: {expectedStr}</div>
        <div>ACTUAL: {actualStr}</div>
        <div>DELTA: {deltaStr}</div>
        <div>SEVERITY: {severityStr}</div>
        <div>NEXT TEST: {nextTestStr}</div>
      </div>
    </div>
  );
}