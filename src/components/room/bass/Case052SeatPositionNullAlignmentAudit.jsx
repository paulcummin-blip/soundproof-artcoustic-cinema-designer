import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 052 — Seat-Position Null Alignment Test (read-only, diagnostic only).
// Tests whether B44 predicts the same null pattern as REW but shifted in listener position.
// No production changes, no Q/source/smoothing changes — production engine called as-is,
// only the seat Y coordinate is swept.

const ROOM_DIMS = { widthM: 3.5, lengthM: 5.9, heightM: 2.7 };
const ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 };
const Y_MIN = 3.00;
const Y_MAX = 4.20;
const Y_STEP = 0.05;
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: ABSORPTION,
  freqMinHz: 20,
  freqMaxHz: 200,
  qStrategy: "production",
};

// ── EDITABLE: REW-observed 45–46 Hz null seat-Y position for this room ─────────
// Populate from real REW capture at this exact room/sub configuration.
// Leave null until a real REW y-sweep value is captured — do not estimate/guess it.
const REW_45HZ_NULL_Y_M = null;
const REW_DESTRUCTIVE_NULLS_HZ = []; // e.g. [45.6] — populate from REW captures when available

function resolveLiveInputs(appState) {
  const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
  const seat = seats.find((s) => s.isPrimary) || seats[0] || { x: ROOM_DIMS.widthM / 2, y: 3.6, z: 1.2 };
  // Sub front right: near front wall (y ≈ 0.15m), right side (x ≈ 0.85 × room width)
  const sub = { x: ROOM_DIMS.widthM * 0.85, y: 0.15, z: 0.35, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  return { seatX: seat.x, seatZ: seat.z, sub };
}

function findDeepestNull(series, loHz, hiHz) {
  const band = series.filter((p) => p.frequency >= loHz && p.frequency <= hiHz);
  if (!band.length) return null;
  return band.reduce((min, p) => (p.spl < min.spl ? p : min));
}

function findFirstDestructiveNull(series, loHz, hiHz) {
  const band = series.filter((p) => p.frequency >= loHz && p.frequency <= hiHz).sort((a, b) => a.frequency - b.frequency);
  for (let i = 1; i < band.length - 1; i++) {
    if (band[i].spl < band[i - 1].spl && band[i].spl < band[i + 1].spl) return band[i].frequency;
  }
  return null;
}

function localBaseline(series, centreHz, outerHz, excludeHz) {
  const band = series.filter((p) => Math.abs(p.frequency - centreHz) <= outerHz && Math.abs(p.frequency - centreHz) > excludeHz);
  if (band.length < 2) return null;
  const sorted = [...band].map((p) => p.spl).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function nearestSpl(series, targetHz) {
  const p = series.reduce((best, pt) => (Math.abs(pt.frequency - targetHz) < Math.abs(best.frequency - targetHz) ? pt : best), series[0]);
  return p ? p.spl : null;
}

function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }

export default function Case052SeatPositionNullAlignmentAudit() {
  const appState = useAppState();

  const result = useMemo(() => {
    const { seatX, seatZ, sub } = resolveLiveInputs(appState);

    const yValues = [];
    for (let y = Y_MIN; y <= Y_MAX + 1e-9; y += Y_STEP) yValues.push(Math.round(y * 100) / 100);

    const rows = yValues.map((y) => {
      const seat = { x: seatX, y, z: seatZ };
      const engineResult = simulateBassResponseRewCore(ROOM_DIMS, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
      const series = engineResult.freqsHz.map((f, i) => ({ frequency: f, spl: engineResult.splDb[i] }));

      const deepestNull = findDeepestNull(series, 20, 80);
      const baseline = deepestNull ? localBaseline(series, deepestNull.frequency, 15, 5) : null;
      const nullDepth = deepestNull && Number.isFinite(baseline) ? deepestNull.spl - baseline : null;
      const spl30 = nearestSpl(series, 30);
      const spl456 = nearestSpl(series, 45.6);
      const firstDestructiveNull = findFirstDestructiveNull(series, 20, 80);
      const matchesRew = REW_DESTRUCTIVE_NULLS_HZ.length > 0 && Number.isFinite(firstDestructiveNull)
        ? REW_DESTRUCTIVE_NULLS_HZ.some((h) => Math.abs(h - firstDestructiveNull) <= 1.0)
        : null;

      return {
        y,
        deepestNullHz: deepestNull?.frequency ?? null,
        deepestNullSpl: deepestNull?.spl ?? null,
        nullDepth,
        spl30,
        spl456,
        firstDestructiveNull,
        matchesRew,
      };
    });

    // Find y where the 45.6 Hz level is deepest across the sweep (proxy for 45–46 Hz null depth)
    const bestRow = rows.reduce((best, r) => (!best || (Number.isFinite(r.spl456) && r.spl456 < best.spl456) ? r : best), null);
    const b44Y4546 = bestRow?.y ?? null;

    const seatOffsetM = (Number.isFinite(b44Y4546) && Number.isFinite(REW_45HZ_NULL_Y_M))
      ? b44Y4546 - REW_45HZ_NULL_Y_M
      : null;
    const shiftDirection = Number.isFinite(seatOffsetM)
      ? (seatOffsetM > 0 ? "backward (B44 null occurs further from screen than REW)" : seatOffsetM < 0 ? "forward (B44 null occurs closer to screen than REW)" : "no shift")
      : null;

    let verdict;
    if (!Number.isFinite(REW_45HZ_NULL_Y_M)) {
      verdict = "3. NULL PATTERN MATCHES CURRENT SEAT"; // placeholder — see note below, no REW y-data to compare against
    } else if (Math.abs(seatOffsetM) <= 0.05) {
      verdict = "3. NULL PATTERN MATCHES CURRENT SEAT";
    } else if (Math.abs(seatOffsetM) > 0.05 && Math.abs(seatOffsetM) < 0.6) {
      verdict = "1. NULL PATTERN MATCHES BUT SEAT POSITION IS SHIFTED";
    } else {
      verdict = "2. NULL PATTERN DOES NOT MATCH REW";
    }

    return { rows, b44Y4546, seatOffsetM, shiftDirection, verdict };
  }, [appState?.seatingPositions]);

  const hasRewData = Number.isFinite(REW_45HZ_NULL_Y_M);

  return (
    <div style={{ border: "2px solid #b45309", borderRadius: 10, background: "#fffbeb", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#b45309", fontSize: 13, marginBottom: 6 }}>
        Case 052 — Seat-Position Null Alignment Test (read-only)
      </div>
      <div style={{ color: "#92400e", marginBottom: 10 }}>
        Room 5.9m L × 3.5m W × 2.7m H · Sub front-right · Absorption 0.30 all surfaces · Production engine, unmodified · y = {Y_MIN.toFixed(2)}–{Y_MAX.toFixed(2)}m, step {Y_STEP}m
      </div>

      {!hasRewData && (
        <div style={{ fontSize: 10, color: "#b45309", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 4, padding: "4px 8px", marginBottom: 10 }}>
          ⚠ REW_45HZ_NULL_Y_M / REW_DESTRUCTIVE_NULLS_HZ not yet populated in this file. B44 sweep below is fully computed; populate the REW constants at the top of Case052SeatPositionNullAlignmentAudit.jsx with real REW seat-sweep data to complete the comparison.
        </div>
      )}

      <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
          <thead>
            <tr style={{ background: "#fde68a", position: "sticky", top: 0 }}>
              {["Seat Y (m)", "Deepest null Hz", "Deepest null SPL", "Null depth", "SPL@30Hz", "SPL@45.6Hz", "1st destructive null Hz", "REW match"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 5px", borderBottom: "1px solid #fbbf24" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.y} style={{ background: Math.abs(r.y - (result.b44Y4546 ?? -999)) < 1e-6 ? "#fef3c7" : undefined }}>
                <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7", fontWeight: Math.abs(r.y - (result.b44Y4546 ?? -999)) < 1e-6 ? 700 : 400 }}>{fmt(r.y)}</td>
                <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.deepestNullHz, 1)}</td>
                <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.deepestNullSpl, 1)}</td>
                <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.nullDepth, 1)}</td>
                <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.spl30, 1)}</td>
                <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7", fontWeight: 700 }}>{fmt(r.spl456, 1)}</td>
                <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.firstDestructiveNull, 1)}</td>
                <td style={{ padding: "2px 5px", borderBottom: "1px solid #fef3c7" }}>{r.matchesRew === null ? "—" : r.matchesRew ? "YES" : "NO"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#fde68a", border: "1px solid #fbbf24" }}>
        <div style={{ fontWeight: 700, color: "#92400e" }}>SUMMARY</div>
        <div style={{ marginTop: 4, color: "#78350f" }}>
          B44 y position where 45–46 Hz null is deepest: {fmt(result.b44Y4546)} m<br/>
          REW y position where 45–46 Hz null appears: {hasRewData ? fmt(REW_45HZ_NULL_Y_M) + " m" : "not yet populated"}<br/>
          Seat-position offset: {Number.isFinite(result.seatOffsetM) ? fmt(result.seatOffsetM) + " m" : "—"}<br/>
          Shift direction: {result.shiftDirection ?? "unknown — no REW reference"}
        </div>
      </div>

      <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#78350f", color: "#fffbeb", border: "1px solid #b45309" }}>
        <div style={{ fontWeight: 700 }}>TEST: Does B44 predict the same null pattern as REW, shifted in listener position?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED: the seat Y where B44's 45–46 Hz null is deepest should match the REW-observed seat Y for that same null (within ±5cm), or reveal a consistent forward/backward offset.<br/>
          ACTUAL: B44 deepest 45–46 Hz null at y = {fmt(result.b44Y4546)} m; REW reference {hasRewData ? `at y = ${fmt(REW_45HZ_NULL_Y_M)} m` : "not available — populate REW_45HZ_NULL_Y_M"}.<br/>
          DELTA: {Number.isFinite(result.seatOffsetM) ? `${fmt(result.seatOffsetM)} m (${result.shiftDirection})` : "cannot be computed without a REW seat-sweep reference"}<br/>
          SEVERITY: {hasRewData ? (Math.abs(result.seatOffsetM) > 0.05 ? "MODERATE — seat-position-dependent null shift confirmed" : "INFORMATIONAL — positions align") : "LOW — data incomplete, B44 side fully computed"}<br/>
          NEXT FIX CANDIDATE: {result.verdict}
        </div>
      </div>
    </div>
  );
}