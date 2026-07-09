// TEMP DEBUG ONLY — runs the SUB2-12 P18 test harness live in the browser
// using the imported app modules (Vite/React runtime, NOT Node).
// Renders raw / post-EQ SPL at key frequencies + the P18 returned object.

import React, { useState } from "react";
import { simulateResponseWithExtrasWrapper } from "@/components/bass/bassSimulationEngine";
import { applyDesignEqCurve, computeParam18BassExtension } from "@/components/utils/rp22BassMetrics";

const FREQS = [10, 15, 20, 22, 25, 31.5, 40, 60, 80, 100];

function valAt(curve, f) {
  if (!Array.isArray(curve) || curve.length === 0) return null;
  if (f <= curve[0].frequency) return curve[0].spl;
  if (f >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  for (let i = 0; i < curve.length - 1; i++) {
    if (f >= curve[i].frequency && f <= curve[i + 1].frequency) {
      const span = curve[i + 1].frequency - curve[i].frequency;
      if (span === 0) return curve[i].spl;
      const r = (f - curve[i].frequency) / span;
      return curve[i].spl + (curve[i + 1].spl - curve[i].spl) * r;
    }
  }
  return null;
}

const fmt = (v) => (v !== null && Number.isFinite(Number(v))) ? Number(v).toFixed(2) : "—";

export default function Sub2P18TestButton() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    setError(null);
    try {
      const roomDimensions = { width: 4, length: 6, height: 2.6 };
      const seatPosition = { x: 2.0, y: 1.6, z: 1.2 };
      const subwoofers = [{
        position: { x: 2.0, y: 0.1, z: 0.35 },
        model: "sub2-12",
        enabled: true,
        gainDb: 0,
        phaseAdjust: 0,
        delay: 0,
        polarity: 1,
      }];

      const { responseData, rp22Analysis } = simulateResponseWithExtrasWrapper(
        subwoofers,
        seatPosition,
        roomDimensions
      );

      const rawAt = {};
      for (const f of FREQS) rawAt[f] = valAt(responseData, f);

      const postEqCurve = applyDesignEqCurve(responseData);
      const postEqAt = {};
      for (const f of FREQS) postEqAt[f] = valAt(postEqCurve, f);

      const p18 = computeParam18BassExtension(postEqCurve);

      setResult({
        responseDataLength: Array.isArray(responseData) ? responseData.length : 0,
        rawAt,
        postEqAt,
        p18,
        rp22Analysis,
      });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ border: "2px solid #16a34a", borderRadius: 8, background: "#f0fdf4", padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: "#166534", fontSize: 12, fontFamily: "monospace", marginBottom: 6 }}>
        🧪 SUB2-12 P18 Test Harness (temp debug)
      </div>
      <button
        onClick={run}
        disabled={running}
        style={{ height: 30, padding: "0 12px", borderRadius: 6, border: "1px solid #166534", background: running ? "#bbf7d0" : "#16a34a", color: "#fff", fontSize: 11, fontFamily: "monospace", cursor: running ? "wait" : "pointer", fontWeight: 700 }}
      >
        {running ? "Running…" : "Run SUB2 P18 Test"}
      </button>

      {error && (
        <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 10, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
          ERROR: {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 8, fontSize: 10, fontFamily: "monospace", color: "#14532d" }}>
          <div style={{ marginBottom: 4 }}>responseData length: {result.responseDataLength}</div>

          <div style={{ fontWeight: 700, marginTop: 6 }}>RAW:</div>
          {FREQS.map((f) => (
            <div key={`raw-${f}`}>{f} Hz = {fmt(result.rawAt[f])}</div>
          ))}

          <div style={{ fontWeight: 700, marginTop: 6 }}>POST EQ:</div>
          {FREQS.map((f) => (
            <div key={`peq-${f}`}>{f} Hz = {fmt(result.postEqAt[f])}</div>
          ))}

          <div style={{ fontWeight: 700, marginTop: 6 }}>P18:</div>
          <div style={{ whiteSpace: "pre-wrap", color: "#1c1917", background: "#fff", border: "1px solid #bbf7d0", borderRadius: 4, padding: 6, marginTop: 2 }}>
            {JSON.stringify(result.p18, null, 2)}
          </div>

          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: "pointer", color: "#166534" }}>rp22Analysis</summary>
            <div style={{ whiteSpace: "pre-wrap", color: "#1c1917", background: "#fff", border: "1px solid #bbf7d0", borderRadius: 4, padding: 6, marginTop: 4 }}>
              {JSON.stringify(result.rp22Analysis, null, 2)}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}