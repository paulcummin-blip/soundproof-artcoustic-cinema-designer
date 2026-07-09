// P18DebugPanel.jsx
// TEMPORARY debug-only panel. Surfaces live P18 intermediates from the actual
// UI path (useRP22AnalysisEngine -> computeParam18BassExtension -> gradedParameters.primary[18]).
// No styling work, no logic changes — read-only instrumentation.

import React from "react";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const fmt = (v, d = 2) => (isNum(v) ? Number(v).toFixed(d) : "—");
const safe = (v) => (v === undefined ? null : v);

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "1px 0" }}>
      <div style={{ width: 200, color: "#475569", flexShrink: 0 }}>{label}</div>
      <div style={{ color: "#0f172a", fontWeight: 600 }}>{children}</div>
    </div>
  );
}

export default function P18DebugPanel({ p18Debug, subModel }) {
  const d = p18Debug || {};
  const spl = d.splAtFreqs || {};
  const freqs = [10, 15, 16, 20, 22, 25, 31.5, 40, 60, 80, 100];
  const returned = d.returnedP18 || null;
  const graded = d.gradedPrimary18 || null;

  return (
    <div style={{
      border: "2px dashed #dc2626",
      borderRadius: 6,
      background: "#fff5f5",
      padding: "10px 12px",
      margin: "8px 0",
      fontFamily: "monospace",
      fontSize: 11,
    }}>
      <div style={{ fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>
        ⚡ TEMP P18 Debug Panel (live UI path)
      </div>

      <Row label="selected sub model">{String(subModel ?? "—")}</Row>
      <Row label="RSP seat id">{String(d.rspSeatId ?? "—")}</Row>
      <Row label="responseData length">{String(d.responseDataLength ?? "—")}</Row>

      <div style={{ borderTop: "1px solid #fecaca", margin: "6px 0", paddingTop: 4 }}>
        <div style={{ fontWeight: 700, color: "#7f1d1d", marginBottom: 2 }}>SPL at frequency (finalRspBassCurve)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1px 12px" }}>
          {freqs.map((f) => (
            <div key={f}>
              <span style={{ color: "#64748b" }}>{f} Hz: </span>
              <span style={{ fontWeight: 600 }}>{fmt(spl[f], 1)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid #fecaca", margin: "6px 0", paddingTop: 4 }}>
        <Row label="refDb">{fmt(d.refDb, 2)}</Row>
        <Row label="thresholdDb">{fmt(d.thresholdDb, 2)}</Row>
        <Row label="sorted[0] (freq / spl)">
          {d.sorted0 ? `${fmt(d.sorted0.frequency, 2)} Hz / ${fmt(d.sorted0.spl, 2)} dB` : "—"}
        </Row>
        <Row label="P18 branch taken">{String(d.branch ?? "—")}</Row>
      </div>

      <div style={{ borderTop: "1px solid #fecaca", margin: "6px 0", paddingTop: 4 }}>
        <div style={{ fontWeight: 700, color: "#7f1d1d", marginBottom: 2 }}>returned P18 object</div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#1e293b" }}>
{JSON.stringify(returned, (k, v) => (k === "__debug" ? "[see above]" : safe(v)), 2)}
        </pre>
      </div>

      <div style={{ borderTop: "1px solid #fecaca", margin: "6px 0", paddingTop: 4 }}>
        <div style={{ fontWeight: 700, color: "#7f1d1d", marginBottom: 2 }}>gradedParameters.primary[18]</div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#1e293b" }}>
{JSON.stringify(graded, (k, v) => safe(v), 2)}
        </pre>
      </div>
    </div>
  );
}