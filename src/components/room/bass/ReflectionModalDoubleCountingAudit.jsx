// ReflectionModalDoubleCountingAudit.jsx
// Temporary READ-ONLY diagnostic — determines whether production is double-counting
// low-frequency room energy by adding image-source reflections on top of modal pressure
// below the Schroeder frequency. Calls the actual production engine
// (simulateBassResponseRewCore) unmodified — only enableReflections/enableModes are toggled.
//
// Does NOT modify: production calculations, the graph, Q, damping, source curves, modal maths.
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
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }]; // flat reference — unchanged across all variants

function magToDb(mag) {
  return 20 * Math.log10(Math.max(mag, 1e-10));
}

function runVariant(frequencyHz, enableReflections, enableModes) {
  const result = simulateBassResponseRewCore(ROOM_DIMS, SEAT, SUB, FLAT_CURVE, {
    freqMinHz: frequencyHz,
    freqMaxHz: frequencyHz + 0.01,
    modeGenerationFMaxHz: 200,
    surfaceAbsorption: SURFACE_ABSORPTION,
    enableReflections,
    enableModes,
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
  const finalMag = Math.sqrt(finalRe * finalRe + finalIm * finalIm);
  const finalPhaseDeg = (Math.atan2(finalIm, finalRe) * 180) / Math.PI;

  return {
    hz: frequencyHz,
    totalSplDb: result.splDbRaw[0],
    directDb: magToDb(Math.sqrt(directRe * directRe + directIm * directIm)),
    reflectionDb: magToDb(Math.sqrt(reflectionRe * reflectionRe + reflectionIm * reflectionIm)),
    modalDb: magToDb(Math.sqrt(modalRe * modalRe + modalIm * modalIm)),
    finalRe,
    finalIm,
    finalMag,
    finalPhaseDeg,
  };
}

function VariantTable({ title, rows, colour }) {
  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: colour, marginBottom: 4 }}>{title}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #fdba74", color: colour, fontSize: 9, textTransform: "uppercase" }}>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Hz</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Total SPL</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Direct</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Reflection</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Modal</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Final Re</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Final Im</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Final Mag</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Final Phase°</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.hz} style={{ borderBottom: "1px solid #fed7aa", background: r.hz === 30 ? "#ffedd5" : undefined }}>
                <td style={{ textAlign: "right", padding: "1px 6px", fontWeight: 700 }}>{r.hz}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.totalSplDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.directDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.reflectionDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.modalDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{r.finalRe.toFixed(3)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{r.finalIm.toFixed(3)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{r.finalMag.toFixed(3)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.finalPhaseDeg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ReflectionModalDoubleCountingAudit() {
  const rowsA = useMemo(() => TEST_FREQS.map((hz) => runVariant(hz, true, true)), []);
  const rowsB = useMemo(() => TEST_FREQS.map((hz) => runVariant(hz, false, true)), []);
  const rowsC = useMemo(() => TEST_FREQS.map((hz) => runVariant(hz, true, false)), []);

  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");

  // Automatic per-frequency comparison: A vs B
  const comparisonRows = TEST_FREQS.map((hz) => {
    const a = rowsA.find((r) => r.hz === hz);
    const b = rowsB.find((r) => r.hz === hz);
    const delta = Number.isFinite(a?.totalSplDb) && Number.isFinite(b?.totalSplDb) ? b.totalSplDb - a.totalSplDb : null;
    const isNullRegion = hz === 29 || hz === 30;
    const expected = isNullRegion
      ? "B rises substantially vs A (null reduced/removed) if double-counting is present"
      : "B remains close to A (surrounding response preserved)";
    const actual = Number.isFinite(delta)
      ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} dB (B vs A)`
      : "—";
    let severity = "Low";
    if (isNullRegion) {
      severity = delta !== null && delta >= 3 ? "High" : delta !== null && delta >= 1 ? "Medium" : "Low";
    } else {
      severity = delta !== null && Math.abs(delta) >= 3 ? "Medium" : "Low";
    }
    return { hz, expected, actual, delta, severity };
  });

  // Pass condition evaluation
  const aAt29 = rowsA.find((r) => r.hz === 29)?.totalSplDb;
  const aAt30 = rowsA.find((r) => r.hz === 30)?.totalSplDb;
  const aAt31 = rowsA.find((r) => r.hz === 31)?.totalSplDb;
  const bAt29 = rowsB.find((r) => r.hz === 29)?.totalSplDb;
  const bAt30 = rowsB.find((r) => r.hz === 30)?.totalSplDb;
  const bAt31 = rowsB.find((r) => r.hz === 31)?.totalSplDb;

  const aNullDepth = Number.isFinite(aAt29) && Number.isFinite(aAt30) && Number.isFinite(aAt31)
    ? Math.max(aAt29, aAt31) - aAt30
    : null;
  const bNullDepth = Number.isFinite(bAt29) && Number.isFinite(bAt30) && Number.isFinite(bAt31)
    ? Math.max(bAt29, bAt31) - bAt30
    : null;

  const nullSubstantiallyReduced = Number.isFinite(aNullDepth) && Number.isFinite(bNullDepth) && aNullDepth > 3 && bNullDepth < aNullDepth - 3;
  const surroundingPreserved = comparisonRows
    .filter((r) => r.hz !== 29 && r.hz !== 30)
    .every((r) => r.delta === null || Math.abs(r.delta) < 3);

  const passConditionMet = nullSubstantiallyReduced && surroundingPreserved;
  const doubleCountingLabel = passConditionMet ? "REFLECTION / MODAL DOUBLE COUNTING LIKELY" : "DOUBLE COUNTING NOT SUPPORTED";

  const verdict = passConditionMet
    ? "Reflection/modal double-counting supported."
    : (Number.isFinite(aNullDepth) && Number.isFinite(bNullDepth) && Math.abs(aNullDepth - bNullDepth) < 1)
      ? "Reflection/modal double-counting not supported."
      : "Inconclusive.";

  return (
    <div style={{ border: "2px solid #7c2d12", borderRadius: 8, background: "#fff7ed", padding: "10px 12px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: "#7c2d12", fontSize: 12, marginBottom: 4 }}>
        Reflection Modal Double Counting Audit — temporary diagnostic (production engine, unmodified)
      </div>
      <div style={{ color: "#9a3412", fontSize: 9, marginBottom: 8, fontStyle: "italic" }}>
        Room 5.0m x 4.5m x 3.0m — sub centre-front — seat y=4.0m — absorption 0.30 all surfaces. Read-only: calls simulateBassResponseRewCore directly, toggling only enableReflections/enableModes.
      </div>

      <VariantTable title="A — Production: Direct + Reflections + Modal Pressure" rows={rowsA} colour="#7c2d12" />
      <VariantTable title="B — No Reflections: Direct + Modal Pressure only" rows={rowsB} colour="#166534" />
      <VariantTable title="C — Reflections Only: Direct + Reflections only (no modal)" rows={rowsC} colour="#1d4ed8" />

      <div style={{ border: "1px solid #fdba74", borderRadius: 6, background: "#fff", padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "#7c2d12", marginBottom: 6 }}>Automatic Comparison — Total SPL, A vs B</div>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #fed7aa", color: "#7c2d12", fontSize: 9, textTransform: "uppercase" }}>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Hz</th>
              <th style={{ textAlign: "left", padding: "2px 6px" }}>Expected</th>
              <th style={{ textAlign: "left", padding: "2px 6px" }}>Actual</th>
              <th style={{ textAlign: "left", padding: "2px 6px" }}>Severity</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((r) => (
              <tr key={r.hz} style={{ borderBottom: "1px solid #fed7aa", background: r.hz === 29 || r.hz === 30 ? "#ffedd5" : undefined }}>
                <td style={{ textAlign: "right", padding: "1px 6px", fontWeight: 700 }}>{r.hz}</td>
                <td style={{ padding: "1px 6px" }}>{r.expected}</td>
                <td style={{ padding: "1px 6px" }}>{r.actual}</td>
                <td style={{ padding: "1px 6px", fontWeight: r.severity === "High" ? 700 : 400, color: r.severity === "High" ? "#b91c1c" : r.severity === "Medium" ? "#b45309" : "#1c1917" }}>{r.severity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ border: "1px solid #fdba74", borderRadius: 6, background: "#fff", padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "#7c2d12", marginBottom: 4 }}>Pass Condition</div>
        <div style={{ color: "#1c1917", marginBottom: 4 }}>
          A null depth (29/31Hz avg − 30Hz): {fmt(aNullDepth)} dB &nbsp;|&nbsp; B null depth: {fmt(bNullDepth)} dB
        </div>
        <div style={{ fontWeight: 700, fontSize: 11, color: passConditionMet ? "#166534" : "#b91c1c" }}>
          {doubleCountingLabel}
        </div>
      </div>

      <div style={{ border: "2px solid #7c2d12", borderRadius: 6, background: "#fff7ed", padding: "8px 10px" }}>
        <div style={{ fontWeight: 700, color: "#7c2d12", marginBottom: 4 }}>Final Verdict</div>
        <div style={{ fontWeight: 700, fontSize: 12, color: "#1c1917" }}>{verdict}</div>
      </div>
    </div>
  );
}