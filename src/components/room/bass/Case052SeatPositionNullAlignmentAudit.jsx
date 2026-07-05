import React, { useState } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 052 — Seat-Position Null Alignment Test (read-only, diagnostic only, SAFE / manual-run).
// Checks whether B44 predicts the same destructive-null pattern as REW, but shifted in listener
// position, by sweeping seat Y across the current room while holding seat X and ear height fixed.
// No production code is changed. Nothing runs until the user clicks "Run Audit".

const ROOM_DIMS = { widthM: 3.5, lengthM: 5.9, heightM: 2.7 };
const ABSORPTION = 0.3;
const FREQ_MIN = 20;
const FREQ_MAX = 200;
const NULL_BAND_LO = 20;
const NULL_BAND_HI = 80;
const REW_OBSERVED_NULL_HZ = 45.6; // reference destructive null frequency reported from REW
const REW_MATCH_TOLERANCE_HZ = 3;
const SEAT_Y_START = 3.0;
const SEAT_Y_END = 4.2;
const SEAT_Y_STEP = 0.05;

const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: ABSORPTION, back: ABSORPTION, left: ABSORPTION, right: ABSORPTION, ceiling: ABSORPTION, floor: ABSORPTION },
  freqMinHz: FREQ_MIN,
  freqMaxHz: FREQ_MAX,
  pureDeterministicModalSum: true,
  disableLateField: true,
  disableModalPropagationPhase: true,
  modalSourceReferenceMode: "existing",
  qStrategy: "production",
};

function fmt(v, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d) : "—";
}

// Guarded helper — never touches series[0] unless length > 0 is already proven.
function nearestSpl(series, targetHz) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const valid = series.filter((p) => p && Number.isFinite(p.frequency) && Number.isFinite(p.spl));
  if (valid.length === 0) return null;
  let best = valid[0];
  for (let i = 1; i < valid.length; i++) {
    if (Math.abs(valid[i].frequency - targetHz) < Math.abs(best.frequency - targetHz)) best = valid[i];
  }
  return best.spl;
}

function bandSlice(series, loHz, hiHz) {
  if (!Array.isArray(series) || series.length === 0) return [];
  return series.filter((p) => p && Number.isFinite(p.frequency) && Number.isFinite(p.spl) && p.frequency >= loHz && p.frequency <= hiHz);
}

function findDeepestNull(series, loHz, hiHz) {
  const band = bandSlice(series, loHz, hiHz);
  if (band.length === 0) return { freq: null, spl: null, depth: null };
  let minPt = band[0];
  let maxSpl = band[0].spl;
  for (let i = 1; i < band.length; i++) {
    if (band[i].spl < minPt.spl) minPt = band[i];
    if (band[i].spl > maxSpl) maxSpl = band[i].spl;
  }
  const depth = Number.isFinite(maxSpl) && Number.isFinite(minPt.spl) ? maxSpl - minPt.spl : null;
  return { freq: minPt.frequency, spl: minPt.spl, depth };
}

function findFirstDestructiveNull(series, loHz, hiHz) {
  const band = bandSlice(series, loHz, hiHz);
  if (band.length < 3) return null;
  for (let i = 1; i < band.length - 1; i++) {
    if (band[i].spl < band[i - 1].spl && band[i].spl < band[i + 1].spl) return band[i].frequency;
  }
  return null;
}

function toSeries(engineResult) {
  if (!engineResult || !Array.isArray(engineResult.freqsHz) || !Array.isArray(engineResult.complexPressure)) return [];
  const len = Math.min(engineResult.freqsHz.length, engineResult.complexPressure.length);
  const out = [];
  for (let i = 0; i < len; i++) {
    const f = engineResult.freqsHz[i];
    const c = engineResult.complexPressure[i];
    if (!Number.isFinite(f) || !c || !Number.isFinite(c.re) || !Number.isFinite(c.im)) continue;
    const mag = Math.sqrt(c.re * c.re + c.im * c.im);
    out.push({ frequency: f, spl: 20 * Math.log10(Math.max(mag, 1e-10)) });
  }
  return out;
}

function resolveLiveSeatAndSub(appState) {
  const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
  const validSeat = seats.length > 0 ? (seats.find((s) => s && s.isPrimary) || seats[0]) : null;
  const seatX = validSeat && Number.isFinite(validSeat.x) ? validSeat.x : ROOM_DIMS.widthM / 2;
  const earZ = validSeat && Number.isFinite(validSeat.z) ? validSeat.z : 1.2;

  const frontCfg = appState?.frontSubsCfg;
  let sub;
  if (frontCfg && frontCfg.count > 0 && Array.isArray(frontCfg.positions) && frontCfg.positions.length > 0 && frontCfg.positions[0]) {
    const pos = frontCfg.positions[0];
    sub = {
      x: Number.isFinite(pos.x) ? pos.x : ROOM_DIMS.widthM - 0.15,
      y: Number.isFinite(pos.y) ? pos.y : 0.15,
      z: Number.isFinite(pos.z) ? pos.z : 0.35,
      modelKey: frontCfg.model || "SUB2-12",
      tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
    };
  } else {
    // Sub front right — default corner placement per test spec.
    sub = { x: ROOM_DIMS.widthM - 0.15, y: 0.15, z: 0.35, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  }
  return { seatX, earZ, sub };
}

export default function Case052SeatPositionNullAlignmentAudit() {
  const appState = useAppState();
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  let validityReason = null;
  try {
    const { seatX, earZ, sub } = resolveLiveSeatAndSub(appState);
    if (!Number.isFinite(seatX)) validityReason = "seat X position";
    else if (!Number.isFinite(earZ)) validityReason = "seat ear height";
    else if (!sub || !Number.isFinite(sub.x) || !Number.isFinite(sub.y)) validityReason = "subwoofer position";
  } catch (e) {
    validityReason = "room/seat/sub data";
  }
  const hasValidInputs = !validityReason;

  const runAudit = () => {
    setRunning(true);
    setError(null);
    try {
      const { seatX, earZ, sub } = resolveLiveSeatAndSub(appState);
      if (!Number.isFinite(seatX) || !Number.isFinite(earZ) || !sub || !Number.isFinite(sub.x) || !Number.isFinite(sub.y)) {
        throw new Error("Missing valid room/seat/sub data.");
      }

      const seatYValues = [];
      for (let y = SEAT_Y_START; y <= SEAT_Y_END + 1e-9; y += SEAT_Y_STEP) {
        seatYValues.push(Math.round(y * 100) / 100);
      }

      const computedRows = seatYValues.map((seatY) => {
        const seat = { x: seatX, y: seatY, z: earZ };
        const engineResult = simulateBassResponseRewCore(ROOM_DIMS, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
        const series = toSeries(engineResult);

        const deepest = findDeepestNull(series, NULL_BAND_LO, NULL_BAND_HI);
        const firstNullFreq = findFirstDestructiveNull(series, NULL_BAND_LO, NULL_BAND_HI);
        const spl30 = nearestSpl(series, 30);
        const spl456 = nearestSpl(series, 45.6);
        const matchesRew = Number.isFinite(firstNullFreq)
          ? (Math.abs(firstNullFreq - REW_OBSERVED_NULL_HZ) <= REW_MATCH_TOLERANCE_HZ ? "YES" : "NO")
          : "NO";

        return {
          seatY,
          deepestNullFreq: deepest.freq,
          deepestNullSpl: deepest.spl,
          nullDepth: deepest.depth,
          spl30,
          spl456,
          firstNullFreq,
          matchesRew,
        };
      });

      setRows(computedRows);
    } catch (e) {
      setError(e && e.message ? e.message : "Unknown error running audit.");
      setRows(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ border: "2px solid #b45309", borderRadius: 10, background: "#fffbeb", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#b45309", fontSize: 13, marginBottom: 6 }}>
        Case 052 — Seat-Position Null Alignment Test (read-only, manual-run)
      </div>
      <div style={{ color: "#92400e", marginBottom: 10 }}>
        Room 5.9m L × 3.5m W × 2.7m H · sub front-right · absorption 0.30 all surfaces · seat Y sweep {fmt(SEAT_Y_START, 2)}–{fmt(SEAT_Y_END, 2)}m, step {SEAT_Y_STEP}m, seat X and ear height held at current live values. Nothing runs until you click Run Audit.
      </div>

      <button
        type="button"
        onClick={runAudit}
        disabled={!hasValidInputs || running}
        style={{
          marginBottom: 10,
          padding: "10px 20px",
          fontSize: 12,
          fontWeight: 700,
          borderRadius: 6,
          border: "1px solid #92400e",
          cursor: (!hasValidInputs || running) ? "not-allowed" : "pointer",
          backgroundColor: (!hasValidInputs || running) ? "#d6d3d1" : "#b45309",
          color: (!hasValidInputs || running) ? "#57534e" : "#fffbeb",
          opacity: 1,
        }}
      >
        {running ? "Running…" : "Run Audit"}
      </button>

      {!hasValidInputs && (
        <div style={{ color: "#92400e", fontWeight: 600, marginBottom: 10 }}>
          Waiting for valid data — missing: {validityReason}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b" }}>
          ERROR: {error}
        </div>
      )}

      {!error && Array.isArray(rows) && rows.length > 0 && (
        <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
            <thead>
              <tr style={{ background: "#fde68a", position: "sticky", top: 0 }}>
                {["Seat Y (m)", "Deepest null Hz", "Deepest null SPL", "Null depth", "SPL@30Hz", "SPL@45.6Hz", "1st destructive null Hz", "REW match"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "3px 5px", borderBottom: "1px solid #fcd34d" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.seatY}>
                  <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.seatY, 2)}</td>
                  <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.deepestNullFreq, 1)}</td>
                  <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.deepestNullSpl, 1)}</td>
                  <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.nullDepth, 1)}</td>
                  <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.spl30, 1)}</td>
                  <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.spl456, 1)}</td>
                  <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.firstNullFreq, 1)}</td>
                  <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7", fontWeight: 700, color: r.matchesRew === "YES" ? "#166534" : "#b91c1c" }}>{r.matchesRew}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!error && Array.isArray(rows) && rows.length === 0 && (
        <div style={{ color: "#92400e" }}>No rows computed.</div>
      )}

      <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#78350f", color: "#fffbeb", border: "1px solid #b45309" }}>
        <div style={{ fontWeight: 700 }}>TEST: Does B44's destructive-null pattern shift correctly with seat position, matching REW's observed null but at the true listener location?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED: the first destructive null frequency should track REW's observed reference ({REW_OBSERVED_NULL_HZ} Hz) at the correct seat Y, not at a fixed generic seat position.<br/>
          ACTUAL: {Array.isArray(rows) && rows.length > 0 ? `swept ${rows.length} seat positions — see table for per-position null frequency/depth and REW match.` : "run the audit to populate results."}<br/>
          DELTA: {Array.isArray(rows) && rows.length > 0 ? `${rows.filter((r) => r.matchesRew === "YES").length} of ${rows.length} seat positions match the REW-observed null within ±${REW_MATCH_TOLERANCE_HZ} Hz.` : "—"}<br/>
          SEVERITY: {Array.isArray(rows) && rows.length > 0 ? (rows.some((r) => r.matchesRew === "YES") ? "INFORMATIONAL — match found at one or more seat Y values" : "MODERATE — no seat Y in the sweep matches the REW-observed null") : "—"}<br/>
          NEXT FIX CANDIDATE: {Array.isArray(rows) && rows.length > 0 ? (rows.some((r) => r.matchesRew === "YES") ? "Seat-position dependent null shift is directionally consistent with REW." : "Investigate whether B44's null position is offset from REW's at every tested seat Y (systematic listener-position mapping error).") : "Run the audit to generate a verdict."}
        </div>
      </div>
    </div>
  );
}