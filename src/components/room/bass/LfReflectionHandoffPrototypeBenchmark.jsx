// LfReflectionHandoffPrototypeBenchmark.jsx
// Temporary READ-ONLY benchmark for the lfReflectionHandoffPrototype option added to
// rewBassEngine.js. Runs the production engine twice per case (prototype OFF vs ON)
// and reports TEST/EXPECTED/ACTUAL/DELTA/SEVERITY/NEXT TEST only. No fix is recommended
// here — measurement only, per the prototype parity test brief.

import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";

const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const SURFACE_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };
const FREQS = [28, 29, 30, 31, 32, 33, 34, 35];

function runCase({ widthM, lengthM, heightM, subX, subY, seatX, seatY, prototype }) {
  const roomDims = { widthM, lengthM, heightM };
  const seat = { x: seatX, y: seatY, z: 1.2 };
  const sub = { x: subX, y: subY, z: 0.35, modelKey: "test-sub", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  const rows = FREQS.map((hz) => {
    const result = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, {
      freqMinHz: hz,
      freqMaxHz: hz + 0.01,
      modeGenerationFMaxHz: 200,
      surfaceAbsorption: SURFACE_ABSORPTION,
      enableReflections: true,
      enableModes: true,
      lfReflectionHandoffPrototype: prototype,
    });
    return { hz, db: result.splDbRaw[0] };
  });
  return rows;
}

function localExtrema(rows) {
  let minHz = null, minDb = Infinity, maxHz = null, maxDb = -Infinity;
  rows.forEach((r) => {
    if (r.db < minDb) { minDb = r.db; minHz = r.hz; }
    if (r.db > maxDb) { maxDb = r.db; maxHz = r.hz; }
  });
  return { minHz, minDb, maxHz, maxDb };
}

function evaluateCase(label, params) {
  const off = runCase({ ...params, prototype: false });
  const on = runCase({ ...params, prototype: true });
  const extOff = localExtrema(off);
  const extOn = localExtrema(on);
  const row30Off = off.find((r) => r.hz === 30);
  const row30On = on.find((r) => r.hz === 30);
  const row34On = on.find((r) => r.hz === 34);

  const nullReducedOrRemoved = (extOn.minDb - extOff.minDb) > 1;
  const risingTrend = row34On && row30On ? (row34On.db - row30On.db) > 1 : false;
  // "new artificial peak/null" = an extremum appearing at a different Hz than production's,
  // with a magnitude difference > 3dB versus the production value at that same Hz.
  const newArtifact = off.some((offRow) => {
    const onRow = on.find((r) => r.hz === offRow.hz);
    if (!onRow) return false;
    const isExtremaHz = offRow.hz !== extOff.minHz && offRow.hz !== extOff.maxHz
      && (onRow.hz === extOn.minHz || onRow.hz === extOn.maxHz);
    return isExtremaHz && Math.abs(onRow.db - offRow.db) > 3;
  });

  const passes = nullReducedOrRemoved && risingTrend && !newArtifact;

  return { label, off, on, extOff, extOn, row30Off, row30On, nullReducedOrRemoved, risingTrend, newArtifact, passes };
}

export default function LfReflectionHandoffPrototypeBenchmark() {
  const results = useMemo(() => {
    const cases = [];

    // Case 1: 5.0m x 4.5m x 3.0m, centre-front sub, seat y=4.0m
    cases.push(evaluateCase("Case 1 — 5.0x4.5x3.0m, centre-front sub, seat y=4.0m", {
      widthM: 4.5, lengthM: 5.0, heightM: 3.0,
      subX: 4.5 / 2, subY: 0.1,
      seatX: 4.5 / 2, seatY: 4.0,
    }));

    // Case 2/3: 4.5m x 6.5m x 2.8m null case (~29-30Hz), previously forgiving/null-missing vs REW.
    // Case 4: same room, R1S1/R1S2/R1S3 multi-seat spread at row y=4.0m.
    const room234 = { widthM: 4.5, lengthM: 6.5, heightM: 2.8 };
    const subX234 = 4.5 / 2, subY234 = 0.1;
    cases.push(evaluateCase("Case 2/3 — 4.5x6.5x2.8m null case (R1S2, centre seat, y=4.0m)", {
      ...room234, subX: subX234, subY: subY234, seatX: 4.5 / 2, seatY: 4.0,
    }));
    cases.push(evaluateCase("Case 4 — 4.5x6.5x2.8m, R1S1 (y=4.0m, x=0.9m)", {
      ...room234, subX: subX234, subY: subY234, seatX: 0.9, seatY: 4.0,
    }));
    cases.push(evaluateCase("Case 4 — 4.5x6.5x2.8m, R1S2 (y=4.0m, x=2.25m)", {
      ...room234, subX: subX234, subY: subY234, seatX: 2.25, seatY: 4.0,
    }));
    cases.push(evaluateCase("Case 4 — 4.5x6.5x2.8m, R1S3 (y=4.0m, x=3.6m)", {
      ...room234, subX: subX234, subY: subY234, seatX: 3.6, seatY: 4.0,
    }));

    return cases;
  }, []);

  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");

  return (
    <div style={{ border: "2px solid #7c2d12", borderRadius: 8, background: "#fff7ed", padding: "10px 12px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: "#7c2d12", fontSize: 12, marginBottom: 4 }}>
        LF Reflection Handoff Prototype Benchmark — temporary diagnostic (prototype parity test, measurement only)
      </div>
      <div style={{ color: "#9a3412", fontSize: 9, marginBottom: 8, fontStyle: "italic" }}>
        lfReflectionHandoffPrototype: false = production unchanged. true = reflections 0 below Schroeder,
        linear fade over Schroeder→Schroeder+40Hz, unchanged above. No fix recommended — this is measurement only.
      </div>

      {results.map((r) => (
        <div key={r.label} style={{ border: "1px solid #fdba74", borderRadius: 6, background: "#fff", padding: "8px 10px", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: "#9a3412", marginBottom: 6 }}>{r.label}</div>

          <div style={{ overflowX: "auto", marginBottom: 6 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #fdba74", color: "#9a3412", fontSize: 9, textTransform: "uppercase" }}>
                  <th style={{ textAlign: "left", padding: "2px 6px" }}>Variant</th>
                  {FREQS.map((hz) => <th key={hz} style={{ textAlign: "right", padding: "2px 6px" }}>{hz}Hz</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "2px 6px", fontWeight: 700 }}>OFF (prod)</td>
                  {r.off.map((row) => <td key={row.hz} style={{ textAlign: "right", padding: "2px 6px" }}>{fmt(row.db)}</td>)}
                </tr>
                <tr>
                  <td style={{ padding: "2px 6px", fontWeight: 700 }}>ON (prototype)</td>
                  {r.on.map((row) => <td key={row.hz} style={{ textAlign: "right", padding: "2px 6px" }}>{fmt(row.db)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          <div>OFF local min: {fmt(r.extOff.minDb)}dB @ {r.extOff.minHz}Hz | ON local min: {fmt(r.extOn.minDb)}dB @ {r.extOn.minHz}Hz</div>
          <div>30Hz: OFF {fmt(r.row30Off?.db)}dB → ON {fmt(r.row30On?.db)}dB</div>

          <div style={{ marginTop: 6, borderTop: "1px dashed #fdba74", paddingTop: 6 }}>
            <div><b>Test:</b> {r.label}, prototype OFF vs ON at 28-35Hz.</div>
            <div><b>Expected:</b> 30Hz phantom null reduced/removed, 30-34Hz rising trend (matches REW story), no new &gt;3dB artefact.</div>
            <div><b>Actual:</b> Null {r.nullReducedOrRemoved ? "reduced/removed" : "unchanged/worse"} ({fmt(r.extOff.minDb)}dB→{fmt(r.extOn.minDb)}dB); 30-34Hz trend {r.risingTrend ? "rising" : "not rising"}; {r.newArtifact ? "new >3dB artefact detected" : "no new artefact detected"}.</div>
            <div><b>Delta:</b> {r.passes ? "Prototype behaviour matches pass criteria for this case." : "Prototype does not fully meet pass criteria for this case."}</div>
            <div><b>Severity:</b> {r.passes ? "Informative — candidate case" : "Unresolved for this case"}</div>
            <div><b>Next test:</b> No fix recommended yet — measurement only, per brief.</div>
          </div>
        </div>
      ))}
    </div>
  );
}