// Case 098 — REW Marker Validation Panel (Temporary, Read-Only)
//
// READ-ONLY diagnostic panel. No engine modifications, no production changes,
// no graph modifications, no parameter writes.
//
// Runs the B44 engine in isolation against a FIXED reference room (5.0 × 5.0 × 2.4 m)
// and compares the output to 8 manually captured REW marker points.
//
// Two side-by-side columns — A&B corrected vs Production — verify which strategy
// is genuinely closer to the REW reference at the marker frequencies.
//
// This panel is self-contained: it does NOT consume live project state and does
// NOT affect the visible Bass Response graph. Temporary — removable once the
// A&B vs Production evidence is no longer needed.

import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";

// ── Fixed reference room config (Case 098) ──
const ROOM = { widthM: 5.0, lengthM: 5.0, heightM: 2.4 };
const SEAT = { x: 2.5, y: 3.0, z: 1.2 }; // centred, 3.0 m from front wall, seated ear height
const SUB = { x: 0.5, y: 0.5, z: 0.0, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } }; // left front corner, floor
const SURFACE_ABSORPTION = {
  front: 0.30, back: 0.30, left: 0.30, right: 0.30, ceiling: 0.30, floor: 0.30,
};

// Flat 94 dB source curve — matches REW Room Simulator flat reference.
const SOURCE_CURVE = [
  { hz: 20, db: 94 },
  { hz: 50, db: 94 },
  { hz: 100, db: 94 },
  { hz: 200, db: 94 },
];

// ── REW marker points (manually captured) ──
const REW_MARKERS = [
  { hz: 30.1, db: 94.2 },
  { hz: 40.0, db: 78.7 },
  { hz: 50.0, db: 81.7 },
  { hz: 60.0, db: 90.8 },
  { hz: 70.0, db: 104.9 },
  { hz: 80.1, db: 89.2 },
  { hz: 90.0, db: 92.4 },
  { hz: 100.3, db: 92.4 },
];

// ── Engine option presets (identical to Case 090 runIsolatedEngine baseline) ──
const ENGINE_OPTIONS_AB = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: SURFACE_ABSORPTION,
  freqMinHz: 20,
  freqMaxHz: 200,
  smoothing: "none",
  modalSourceReferenceMode: "distance_normalized",
  modalGainScalar: 1.0,
  axialQ: 4.0,
  modalStorageMode: "none",
  propagationPhaseScale: 0,
  debugMode200Multiplier: 1.0,
  debugReflectionOrder: 1,
  reflectionGainScale: 1.0,
  debugModalHSign: "normal",
  modalCoherenceMode: "coherent",
  highOrderAxialScale: 1.0,
  pureDeterministicModalSum: true,
  disableModalPropagationPhase: true,
  disableLateField: true,
  qStrategy: "ab_corrected",
  rewModalBandwidthScale: 0.55,
};

const ENGINE_OPTIONS_PRODUCTION = { ...ENGINE_OPTIONS_AB, qStrategy: "production" };

// ── Sampling helpers ──
function sampleDbAt(series, targetHz) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.hz - b.hz);
  if (targetHz <= sorted[0].hz) return sorted[0].db;
  if (targetHz >= sorted[sorted.length - 1].hz) return sorted[sorted.length - 1].db;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (targetHz >= sorted[i].hz && targetHz <= sorted[i + 1].hz) {
      const ratio = (targetHz - sorted[i].hz) / (sorted[i + 1].hz - sorted[i].hz);
      return sorted[i].db + (sorted[i + 1].db - sorted[i].db) * ratio;
    }
  }
  return null;
}

function splSeriesFromComplex(freqsHz, complexPressure) {
  return freqsHz.map((hz, i) => {
    const cp = complexPressure[i];
    const mag = Math.sqrt((cp?.re || 0) ** 2 + (cp?.im || 0) ** 2);
    return { hz, db: 20 * Math.log10(Math.max(mag, 1e-10)) };
  });
}

function runEngine(options) {
  try {
    const r = simulateBassResponseRewCore(ROOM, SEAT, SUB, SOURCE_CURVE, options);
    return splSeriesFromComplex(r.freqsHz, r.complexPressure);
  } catch (e) {
    return [];
  }
}

// ── Marker-level metrics ──
function computeMarkerMetrics(splSeries) {
  if (!splSeries.length) return { rows: [], rmsError: null, maxError: null, meanError: null, corr: null, worstHz: null };

  const rows = REW_MARKERS.map((m) => {
    const b44 = sampleDbAt(splSeries, m.hz);
    const delta = b44 != null ? b44 - m.db : null;
    return { hz: m.hz, rew: m.db, b44, delta };
  });

  const valid = rows.filter((r) => r.delta != null);
  const n = valid.length;
  if (!n) return { rows, rmsError: null, maxError: null, meanError: null, corr: null, worstHz: null };

  let sumDelta = 0, sumSq = 0, maxAbs = 0, worstHz = null;
  let sumB44 = 0, sumREW = 0, sumBB = 0, sumRR = 0, sumBR = 0;
  valid.forEach((r) => {
    sumDelta += r.delta;
    sumSq += r.delta * r.delta;
    if (Math.abs(r.delta) > maxAbs) { maxAbs = Math.abs(r.delta); worstHz = r.hz; }
    sumB44 += r.b44; sumREW += r.rew;
    sumBB += r.b44 * r.b44; sumRR += r.rew * r.rew; sumBR += r.b44 * r.rew;
  });

  const rmsError = Math.sqrt(sumSq / n);
  const maxError = maxAbs;
  const meanError = sumDelta / n;
  const num = n * sumBR - sumB44 * sumREW;
  const den = Math.sqrt((n * sumBB - sumB44 * sumB44) * (n * sumRR - sumREW * sumREW));
  const corr = den === 0 ? null : num / den;

  return { rows, rmsError, maxError, meanError, corr, worstHz };
}

function fmt(v, digits = 2, fallback = "—") {
  if (v === null || v === undefined || !Number.isFinite(v)) return fallback;
  return v.toFixed(digits);
}

function deltaColor(v) {
  if (v == null || !Number.isFinite(v)) return "#625143";
  const a = Math.abs(v);
  if (a < 1.0) return "#15803d";
  if (a < 3.0) return "#b45309";
  return "#dc2626";
}

// ── Styling ──
const styles = {
  card: { border: "2px dashed #4338ca", borderRadius: 14, padding: 10, background: "#f5f3ff", marginTop: 8 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "monospace" },
  th: { textAlign: "center", padding: "4px 6px", borderBottom: "1px solid #C0BCB5", color: "#3E4349", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" },
  thLeft: { textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #C0BCB5", color: "#3E4349", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" },
  td: { padding: "4px 6px", textAlign: "center", color: "#1B1A1A" },
  tdLeft: { padding: "4px 6px", textAlign: "left", color: "#1B1A1A" },
  tdBold: { padding: "4px 6px", textAlign: "center", color: "#213428", fontWeight: 700 },
  note: { fontSize: 10, color: "#8B7F76", marginTop: 6, fontFamily: "monospace" },
};

// ── Main Panel ──
export default function Case098RewMarkerValidationPanel() {
  const ab = useMemo(() => computeMarkerMetrics(runEngine(ENGINE_OPTIONS_AB)), []);
  const prod = useMemo(() => computeMarkerMetrics(runEngine(ENGINE_OPTIONS_PRODUCTION)), []);

  const abBetter =
    ab.rmsError != null && prod.rmsError != null && ab.rmsError <= prod.rmsError;

  return (
    <div style={styles.card}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#4338ca", fontFamily: "monospace", marginBottom: 8 }}>
        CASE 098 — REW Marker Validation Panel (Temporary · Read-Only)
      </div>
      <div style={{ fontSize: 10, color: "#625143", fontFamily: "monospace", marginBottom: 10 }}>
        Fixed room: {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m · seat ({SEAT.x}, {SEAT.y}, {SEAT.z}) ·
        sub left-front corner ({SUB.x}, {SUB.y}, {SUB.z}) · absorption 0.30 · no smoothing · 1 sub
      </div>

      {/* Per-marker table */}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.thLeft}>Freq</th>
            <th style={styles.th}>REW SPL</th>
            <th style={styles.th} colSpan={2}>A&B Corrected</th>
            <th style={styles.th} colSpan={2}>Production</th>
          </tr>
          <tr>
            <th style={styles.thLeft}></th>
            <th style={styles.th}>(dB)</th>
            <th style={styles.th}>B44 (dB)</th>
            <th style={styles.th}>Δ</th>
            <th style={styles.th}>B44 (dB)</th>
            <th style={styles.th}>Δ</th>
          </tr>
        </thead>
        <tbody>
          {ab.rows.map((r, i) => {
            const p = prod.rows[i];
            return (
              <tr key={r.hz} style={{ background: i % 2 ? "#F8F8F7" : "#fff" }}>
                <td style={styles.tdLeft}>{r.hz.toFixed(1)} Hz</td>
                <td style={styles.td}>{fmt(r.rew, 1)}</td>
                <td style={styles.td}>{fmt(r.b44, 1)}</td>
                <td style={{ ...styles.td, color: deltaColor(r.delta), fontWeight: 700 }}>{fmt(r.delta, 2, "")}</td>
                <td style={styles.td}>{fmt(p.b44, 1)}</td>
                <td style={{ ...styles.td, color: deltaColor(p.delta), fontWeight: 700 }}>{fmt(p.delta, 2, "")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Aggregate metrics comparison */}
      <div style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: "#4338ca", fontFamily: "monospace" }}>
        Aggregate Metrics (across {REW_MARKERS.length} markers)
      </div>
      <table style={{ ...styles.table, marginTop: 4 }}>
        <thead>
          <tr>
            <th style={styles.thLeft}>Metric</th>
            <th style={styles.th}>A&B Corrected</th>
            <th style={styles.th}>Production</th>
            <th style={styles.th}>Winner</th>
          </tr>
        </thead>
        <tbody>
          {[
            { label: "RMS Error (dB)", ab: ab.rmsError, prod: prod.rmsError, lower: true },
            { label: "Max Error (dB)", ab: ab.maxError, prod: prod.maxError, lower: true },
            { label: "Mean Error (dB)", ab: ab.meanError, prod: prod.meanError, lower: true },
            { label: "Correlation", ab: ab.corr, prod: prod.corr, lower: false },
          ].map((row, i) => {
            const abWins = row.lower ? row.ab < row.prod : row.ab > row.prod;
            return (
              <tr key={row.label} style={{ background: i % 2 ? "#F8F8F7" : "#fff" }}>
                <td style={styles.tdLeft}>{row.label}</td>
                <td style={styles.td}>{fmt(row.ab, 3)}</td>
                <td style={styles.td}>{fmt(row.prod, 3)}</td>
                <td style={{ ...styles.td, color: abWins ? "#15803d" : "#dc2626", fontWeight: 700 }}>
                  {abWins ? "A&B" : "Prod"}
                </td>
              </tr>
            );
          })}
          <tr style={{ background: "#fff7ed" }}>
            <td style={styles.tdLeft}>Worst Marker (Hz)</td>
            <td style={styles.tdBold}>{fmt(ab.worstHz, 1)}</td>
            <td style={styles.tdBold}>{fmt(prod.worstHz, 1)}</td>
            <td style={styles.td}>—</td>
          </tr>
        </tbody>
      </table>

      <div style={styles.note}>
        Verdict: {abBetter
          ? "A&B corrected is genuinely closer to REW at the marker frequencies."
          : "Production is closer to REW at the marker frequencies — A&B is NOT better here."}{" "}
        Worst A&B marker: {fmt(ab.worstHz, 1)} Hz · Worst Production marker: {fmt(prod.worstHz, 1)} Hz
      </div>
    </div>
  );
}