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
  const p18Entries = d.finalRspBassCurveNearestEntries || [];
  const rspEntries = d.rspBassResponseNearestEntries || [];
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
      <Row label="P18 input variable">{String(d.inputVariableName ?? "—")}</Row>
      <Row label="exact P18 argument">{String(d.exactArgument ?? "—")}</Row>
      <Row label="P18 input reference">{String(d.inputReference ?? "—")}</Row>
      <Row label="P18 input array length">{String(d.inputLength ?? "—")}</Row>
      <Row label="Design EQ at P18 call">{String(d.designEqEnabledAtP18Call ?? "—")}</Row>
      <Row label="finalRspBassCurve === rspBassResponse">{String(d.finalEqualsRspByReference ?? "—")}</Row>
      <Row label="rspBassResponse ref / length">{`${d.rspBassResponseReference ?? "—"} / ${d.rspBassResponseLength ?? "—"}`}</Row>
      <Row label="finalRspBassCurve ref / length">{`${d.finalRspBassCurveReference ?? "—"} / ${d.finalRspBassCurveLength ?? "—"}`}</Row>

      <div style={{ borderTop: "1px solid #fecaca", margin: "6px 0", paddingTop: 4 }}>
        <div style={{ fontWeight: 700, color: "#7f1d1d", marginBottom: 2 }}>First 10 exact P18 input entries</div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#1e293b" }}>{JSON.stringify(d.inputFirst10Entries || [], null, 2)}</pre>
      </div>

      <div style={{ borderTop: "1px solid #fecaca", margin: "6px 0", paddingTop: 4 }}>
        <div style={{ fontWeight: 700, color: "#7f1d1d", marginBottom: 2 }}>Exact nearest entries from the two live arrays</div>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr><th>Target</th><th>rspBassResponse entry</th><th>finalRspBassCurve / P18 entry</th></tr></thead>
          <tbody>{p18Entries.map((row, index) => (
            <tr key={row.targetHz}>
              <td>{row.targetHz} Hz</td>
              <td><pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(rspEntries[index]?.entry ?? null)}</pre></td>
              <td><pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(row.entry ?? null)}</pre></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div style={{ borderTop: "1px solid #fecaca", margin: "6px 0", paddingTop: 4 }}>
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