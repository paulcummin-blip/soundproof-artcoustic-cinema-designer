import React, { useMemo, useState } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 057 — Correct REW Reference Baseline Reset (read-only, diagnostic only).
// Retires the stale 45.6 Hz REW target from Cases 052-056 and rebuilds the comparison
// baseline against the CURRENT room only, using manually-entered REW reference points
// (editable below, pre-filled from the attached REW screenshot). No theory tests are run
// here — this case only re-establishes ground truth for future cases to compare against.

const ROOM = { widthM: 3.50, lengthM: 5.90, heightM: 2.70 }; // W × L × H per this case's stated room
const ABSORPTION_ALL = 0.30;
const CURVE_DB = 94;
const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];

const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: ABSORPTION_ALL, back: ABSORPTION_ALL, left: ABSORPTION_ALL, right: ABSORPTION_ALL, ceiling: ABSORPTION_ALL, floor: ABSORPTION_ALL },
  freqMinHz: 20,
  freqMaxHz: 200,
  smoothing: "none",
  pureDeterministicModalSum: true,
  disableLateField: true,
  disableModalPropagationPhase: true,
  modalSourceReferenceMode: "existing",
  qStrategy: "production",
  debugReflectionOrder: 1,
};

// REW reference points read from the attached screenshot — editable, since these are
// manually extracted values, not auto-parsed.
const DEFAULT_REW_REFERENCE = {
  firstMajorDipHz: 38,
  firstMajorDipSpl: 77,
  firstMajorPeakHz: 28,
  firstMajorPeakSpl: 98,
  spl30Hz: 95,
  spl38Hz: 77,
  spl59Hz: 103,
  spl75Hz: 83,
  spl100Hz: 95,
};

function fmt(v, d = 1) { return Number.isFinite(v) ? Number(v).toFixed(d) : "—"; }

function resolveLiveSeatAndSub(appState) {
  const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
  const seat = seats.find((s) => s && s.isPrimary) || seats[0] || { x: ROOM.widthM / 2, y: ROOM.lengthM * 0.6, z: 1.2 };
  // Sub: front-right corner of the stated room, standard floor clearance.
  const sub = { x: ROOM.widthM - 0.30, y: 0.15, z: 0.35, modelKey: appState?.frontSubsCfg?.model || "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  return { seat: { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 }, sub };
}

function findFirstMajorPeakAndDip(series) {
  // Local extrema across the whole 20-200Hz sweep.
  const peaks = [];
  const dips = [];
  for (let i = 1; i < series.length - 1; i++) {
    if (series[i].spl > series[i - 1].spl && series[i].spl > series[i + 1].spl) peaks.push(series[i]);
    if (series[i].spl < series[i - 1].spl && series[i].spl < series[i + 1].spl) dips.push(series[i]);
  }
  return {
    firstPeak: peaks.sort((a, b) => a.frequency - b.frequency)[0] || null,
    firstDip: dips.sort((a, b) => a.frequency - b.frequency)[0] || null,
  };
}

export default function Case057CorrectRewReferenceBaselineResetAudit() {
  const appState = useAppState();
  const [rewRef, setRewRef] = useState(DEFAULT_REW_REFERENCE);

  const b44 = useMemo(() => {
    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const engineResult = simulateBassResponseRewCore(ROOM, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const series = engineResult.freqsHz.map((f, i) => {
      const cp = engineResult.complexPressure[i];
      return { frequency: f, spl: 20 * Math.log10(Math.max(Math.sqrt(cp.re * cp.re + cp.im * cp.im), 1e-10)) };
    });
    const splAt = (targetHz) => {
      const p = series.reduce((best, pt) => Math.abs(pt.frequency - targetHz) < Math.abs(best.frequency - targetHz) ? pt : best, series[0]);
      return p ? p.spl : null;
    };
    const { firstPeak, firstDip } = findFirstMajorPeakAndDip(series);
    return {
      seat, sub,
      firstMajorDipHz: firstDip?.frequency ?? null,
      firstMajorDipSpl: firstDip?.spl ?? null,
      firstMajorPeakHz: firstPeak?.frequency ?? null,
      firstMajorPeakSpl: firstPeak?.spl ?? null,
      spl30Hz: splAt(30),
      spl38Hz: splAt(38),
      spl59Hz: splAt(59),
      spl75Hz: splAt(75),
      spl100Hz: splAt(100),
    };
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  const rows = [
    ["First major dip frequency (Hz)", rewRef.firstMajorDipHz, b44.firstMajorDipHz, "firstMajorDipHz"],
    ["First major dip SPL (dB)", rewRef.firstMajorDipSpl, b44.firstMajorDipSpl, "firstMajorDipSpl"],
    ["First major peak frequency (Hz)", rewRef.firstMajorPeakHz, b44.firstMajorPeakHz, "firstMajorPeakHz"],
    ["First major peak SPL (dB)", rewRef.firstMajorPeakSpl, b44.firstMajorPeakSpl, "firstMajorPeakSpl"],
    ["SPL @ 30 Hz (dB)", rewRef.spl30Hz, b44.spl30Hz, "spl30Hz"],
    ["SPL @ 38 Hz (dB)", rewRef.spl38Hz, b44.spl38Hz, "spl38Hz"],
    ["SPL @ 59 Hz (dB)", rewRef.spl59Hz, b44.spl59Hz, "spl59Hz"],
    ["SPL @ 75 Hz (dB)", rewRef.spl75Hz, b44.spl75Hz, "spl75Hz"],
    ["SPL @ 100 Hz (dB)", rewRef.spl100Hz, b44.spl100Hz, "spl100Hz"],
  ];

  const worstDelta = rows.reduce((max, [, rewV, b44V]) => {
    const d = Number.isFinite(rewV) && Number.isFinite(b44V) ? Math.abs(rewV - b44V) : 0;
    return Math.max(max, d);
  }, 0);

  return (
    <div style={{ border: "2px solid #713f12", borderRadius: 10, background: "#fefce8", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#713f12", fontSize: 13, marginBottom: 6 }}>
        Case 057 — Correct REW Reference Baseline Reset (read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#fef08a", border: "1px solid #ca8a04", color: "#713f12", marginBottom: 10 }}>
        ⚠ The 45.6 Hz REW target used in Cases 052–056 is RETIRED as stale. This case establishes the new baseline for room {fmt(ROOM.widthM, 2)}m W × {fmt(ROOM.lengthM, 2)}m L × {fmt(ROOM.heightM, 2)}m H, sub at front-right corner, live seat, 0.30 absorption all surfaces, no smoothing. Cases 052–056 conclusions are NOT used here. No theory tests are run in this case.
      </div>

      <div style={{ marginBottom: 10, fontSize: 9 }}>
        Sub used: x={fmt(b44.sub.x, 2)} y={fmt(b44.sub.y, 2)} z={fmt(b44.sub.z, 2)} (front-right corner) · Seat used: x={fmt(b44.seat.x, 2)} y={fmt(b44.seat.y, 2)} z={fmt(b44.seat.z, 2)} (current live seat)
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "#713f12", marginBottom: 4 }}>REW REFERENCE POINTS (editable — extracted from attached screenshot)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {Object.entries(rewRef).map(([key, value]) => (
            <label key={key} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 9 }}>
              {key}
              <input
                type="number"
                value={value}
                onChange={(e) => setRewRef((prev) => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                style={{ padding: "2px 4px", border: "1px solid #ca8a04", borderRadius: 4, fontFamily: "monospace", fontSize: 10 }}
              />
            </label>
          ))}
        </div>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
          <thead>
            <tr style={{ background: "#fef08a" }}>
              {["Reference point", "EXPECTED (REW)", "ACTUAL (B44)", "DELTA"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 5px", borderBottom: "1px solid #ca8a04" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, rewV, b44V]) => {
              const delta = Number.isFinite(rewV) && Number.isFinite(b44V) ? b44V - rewV : null;
              return (
                <tr key={label}>
                  <td style={{ padding: "2px 5px" }}>{label}</td>
                  <td style={{ padding: "2px 5px" }}>{fmt(rewV, 1)}</td>
                  <td style={{ padding: "2px 5px" }}>{fmt(b44V, 1)}</td>
                  <td style={{ padding: "2px 5px", fontWeight: 700, color: Math.abs(delta) > 6 ? "#b91c1c" : Math.abs(delta) > 3 ? "#b45309" : "#166534" }}>{delta === null ? "—" : (delta > 0 ? "+" : "") + fmt(delta, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#713f12", color: "#fefce8", border: "1px solid #ca8a04" }}>
        <div style={{ fontWeight: 700 }}>TEST: Does B44 production match the current REW reference for this room (5.90m L × 3.50m W × 2.70m H, sub front-right corner, live seat, 0.30 absorption, no smoothing)?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED = current REW reference only (editable values above, NOT the retired 45.6 Hz target).<br/>
          ACTUAL = B44 production, same room/seat/sub/absorption/smoothing — see table.<br/>
          DELTA: worst absolute mismatch across all reference points = {fmt(worstDelta, 1)} dB.<br/>
          SEVERITY: {worstDelta > 6 ? "HIGH — significant mismatch against the new baseline" : worstDelta > 3 ? "MODERATE — noticeable mismatch" : "LOW — production tracks the new REW baseline closely"}<br/>
          NEXT FIX CANDIDATE: baseline re-established for this room. Re-run targeted theory tests (phase, coupling, direct/reflection) against THESE reference points only in subsequent cases — do not reuse Cases 052–056 conclusions, they were computed against the retired target.
        </div>
      </div>
    </div>
  );
}