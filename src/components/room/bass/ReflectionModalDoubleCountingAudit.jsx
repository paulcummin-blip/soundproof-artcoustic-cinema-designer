// ReflectionModalDoubleCountingAudit.jsx
// Temporary read-only A/B/C audit — calls the actual production engine
// (simulateBassResponseRewCore) unmodified, three times per frequency, with only
// enableReflections/enableModes toggled. No production code changed. No fixes applied.
//
// Fixed test case: room 5.0m(L) x 4.5m(W) x 3.0m(H), sub centre-front, seat y=4.0m,
// absorption 0.30 all surfaces, frequencies 28-35Hz.

import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";

const TEST_FREQS = [28, 29, 30, 31, 32, 33, 34, 35];
const ROOM_DIMS = { widthM: 4.5, lengthM: 5.0, heightM: 3.0 };
const SUB = { x: 4.5 / 2, y: 0.1, z: 0.35, modelKey: "test-sub", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: 4.5 / 2, y: 4.0, z: 1.2 };
const SURFACE_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }]; // flat reference — unchanged across all variants

function runVariant(frequencyHz, enableReflections, enableModes) {
  const result = simulateBassResponseRewCore(ROOM_DIMS, SEAT, SUB, FLAT_CURVE, {
    freqMinHz: frequencyHz,
    freqMaxHz: frequencyHz + 0.01,
    modeGenerationFMaxHz: 200,
    surfaceAbsorption: SURFACE_ABSORPTION,
    enableReflections,
    enableModes,
  });
  return result.splDbRaw[0];
}

export default function ReflectionModalDoubleCountingAudit() {
  const rows = useMemo(
    () =>
      TEST_FREQS.map((hz) => ({
        hz,
        aDb: runVariant(hz, true, true), // A: production default — direct + reflections + modes
        bDb: runVariant(hz, false, true), // B: reflections disabled — direct + modes only
        cDb: runVariant(hz, true, false), // C: reflections only — direct + reflections only
      })),
    []
  );

  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");

  const aAt29 = rows.find((r) => r.hz === 29)?.aDb;
  const aAt30 = rows.find((r) => r.hz === 30)?.aDb;
  const aAt31 = rows.find((r) => r.hz === 31)?.aDb;
  const aNull30 = Number.isFinite(aAt29) && Number.isFinite(aAt30) && Number.isFinite(aAt31) && aAt30 < aAt29 && aAt30 < aAt31;

  const bAt29 = rows.find((r) => r.hz === 29)?.bDb;
  const bAt30 = rows.find((r) => r.hz === 30)?.bDb;
  const bAt31 = rows.find((r) => r.hz === 31)?.bDb;
  const bNull30 = Number.isFinite(bAt29) && Number.isFinite(bAt30) && Number.isFinite(bAt31) && bAt30 < bAt29 && bAt30 < bAt31;
  const bPeak30 = Number.isFinite(bAt29) && Number.isFinite(bAt30) && Number.isFinite(bAt31) && bAt30 > bAt29 && bAt30 > bAt31;

  const passConditionMet = aNull30 && !bNull30;

  return (
    <div style={{ border: "2px solid #7c2d12", borderRadius: 8, background: "#fff7ed", padding: "10px 12px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: "#7c2d12", fontSize: 12, marginBottom: 4 }}>
        Reflection/Modal Double-Counting A/B Audit — temporary diagnostic (production engine, unmodified)
      </div>
      <div style={{ color: "#9a3412", fontSize: 9, marginBottom: 8, fontStyle: "italic" }}>
        Room 5.0m(L) x 4.5m(W) x 3.0m(H) — sub centre-front — seat y=4.0m — absorption 0.30. Calls simulateBassResponseRewCore directly, toggling only enableReflections/enableModes.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 480 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #fdba74", color: "#7c2d12", fontSize: 9, textTransform: "uppercase" }}>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Hz</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>A: direct+refl+modes</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>B: direct+modes only</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>C: direct+refl only</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.hz} style={{ borderBottom: "1px solid #fed7aa", background: r.hz === 30 ? "#ffedd5" : undefined }}>
                <td style={{ textAlign: "right", padding: "1px 6px", fontWeight: 700, color: "#7c2d12" }}>{r.hz}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.aDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.bDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.cDb)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ border: "1px solid #fdba74", borderRadius: 6, background: "#fff", padding: "8px 10px" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            <tr><td style={{ padding: "2px 6px", fontWeight: 700, width: 90 }}>Test</td><td style={{ padding: "2px 6px" }}>Production engine (simulateBassResponseRewCore, unmodified) with reflections+modes (A) vs modes-only (B) vs reflections-only (C), same room/sub/seat/absorption, 28–35Hz.</td></tr>
            <tr><td style={{ padding: "2px 6px", fontWeight: 700 }}>Expected</td><td style={{ padding: "2px 6px" }}>If double-counting is the cause: A shows a null at 30Hz, B (reflections disabled) removes the null and shows a REW-like peak instead.</td></tr>
            <tr><td style={{ padding: "2px 6px", fontWeight: 700 }}>Actual</td><td style={{ padding: "2px 6px" }}>
              A {aNull30 ? "shows" : "does not show"} a local null at 30Hz (dB(29)={fmt(aAt29)}, dB(30)={fmt(aAt30)}, dB(31)={fmt(aAt31)}).{" "}
              B {bPeak30 ? "shows a local peak" : bNull30 ? "still shows a null" : "shows neither a clear peak nor null"} at 30Hz (dB(29)={fmt(bAt29)}, dB(30)={fmt(bAt30)}, dB(31)={fmt(bAt31)}).
            </td></tr>
            <tr><td style={{ padding: "2px 6px", fontWeight: 700 }}>Delta</td><td style={{ padding: "2px 6px" }}>
              A null depth vs B at 30Hz: {Number.isFinite(aAt30) && Number.isFinite(bAt30) ? (aAt30 - bAt30).toFixed(1) : "—"} dB
            </td></tr>
            <tr><td style={{ padding: "2px 6px", fontWeight: 700 }}>Severity</td><td style={{ padding: "2px 6px" }}>
              {passConditionMet ? "Critical — confirmed: disabling reflections removes the 29–30Hz null and restores a REW-like peak. Reflection/modal double-counting is the root cause." : "Medium — pass condition not met; reflections alone do not explain the null at this test case, requiring further isolation."}
            </td></tr>
            <tr><td style={{ padding: "2px 6px", fontWeight: 700 }}>Next test</td><td style={{ padding: "2px 6px" }}>
              {passConditionMet ? "Isolate which reflection order/phase term (image-source distance phase vs modal resonant-transfer phase) causes the destructive combination at 30Hz specifically." : "Re-run this same A/B with late-field also disabled, to rule out late-field/reflection interaction rather than reflection/modal interaction alone."}
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}