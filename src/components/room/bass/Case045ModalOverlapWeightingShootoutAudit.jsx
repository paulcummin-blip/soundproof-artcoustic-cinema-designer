import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";

// Case 045 — Modal Overlap Weighting Shootout (compact, read-only, diagnostic only).
// Tests whether B44 modes are too isolated vs REW by post-hoc reconstructing per-mode
// complex contributions from the REAL engine's debug output, then adding a small
// nearby-mode "overlap boost" term: overlapWeight = exp(-|f0_j - f0_k| / overlapHz).
// Does NOT modify rewBassEngine.js, modal frequencies, coupling, source amplitude,
// direct field, reflections, or graph rendering — purely a post-hoc reconstruction
// from simulateBassResponseRewCore's existing debug arrays (activeModalContributorDebugSeries).

const ROOM = { widthM: 4.5, lengthM: 5.0, heightM: 3.0 };
const SUB = { x: 2.50, y: 0.15, z: 0.35, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: 2.50, y: 4.00, z: 1.20 };
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const OVERLAP_HZ_VALUES = [5, 10, 15];
const OVERLAP_BOOST_SCALE = 0.15; // small contribution, per spec

const ENGINE_OPTIONS_BASE = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  freqMinHz: 20,
  freqMaxHz: 200,
  pureDeterministicModalSum: true,
  disableLateField: true,
  disableModalPropagationPhase: true,
  modalSourceReferenceMode: "existing",
};

function runEngine(qStrategy, rewModalBandwidthScale) {
  return simulateBassResponseRewCore(ROOM, SEAT, SUB, FLAT_CURVE, {
    ...ENGINE_OPTIONS_BASE,
    qStrategy,
    rewModalBandwidthScale,
  });
}

// Reconstruct per-frequency SPL curve with an overlap boost applied on top of an
// engine run's real per-mode contributor breakdown (activeModalContributorDebugSeries).
function applyOverlapBoost(engineResult, overlapHz) {
  const { freqsHz, complexPressure, activeModalContributorDebugSeries } = engineResult;
  const byFreq = new Map(activeModalContributorDebugSeries.map((row) => [row.frequencyHz, row]));

  return freqsHz.map((f, i) => {
    const row = byFreq.get(f);
    const total = complexPressure[i];
    if (!row || !Array.isArray(row.contributors) || row.contributors.length < 2) {
      const mag = Math.sqrt(total.re * total.re + total.im * total.im);
      return { frequency: f, spl: 20 * Math.log10(Math.max(mag, 1e-10)) };
    }
    const preRe = total.re - row.modalSumRe;
    const preIm = total.im - row.modalSumIm;

    let extraRe = 0;
    let extraIm = 0;
    const contributors = row.contributors;
    for (let a = 0; a < contributors.length; a++) {
      for (let b = 0; b < contributors.length; b++) {
        if (a === b) continue;
        const distHz = Math.abs(contributors[a].modeFrequencyHz - contributors[b].modeFrequencyHz);
        const overlapWeight = Math.exp(-distHz / overlapHz);
        extraRe += contributors[b].activeReal * overlapWeight * OVERLAP_BOOST_SCALE;
        extraIm += contributors[b].activeImag * overlapWeight * OVERLAP_BOOST_SCALE;
      }
    }

    const boostedRe = preRe + row.modalSumRe + extraRe;
    const boostedIm = preIm + row.modalSumIm + extraIm;
    const mag = Math.sqrt(boostedRe * boostedRe + boostedIm * boostedIm);
    return { frequency: f, spl: 20 * Math.log10(Math.max(mag, 1e-10)) };
  });
}

function toSeries(engineResult) {
  return engineResult.freqsHz.map((f, i) => ({
    frequency: f,
    spl: 20 * Math.log10(Math.max(Math.sqrt(engineResult.complexPressure[i].re ** 2 + engineResult.complexPressure[i].im ** 2), 1e-10)),
  }));
}

function nearestSpl(series, targetHz) {
  const p = series.reduce((best, pt) => (Math.abs(pt.frequency - targetHz) < Math.abs(best.frequency - targetHz) ? pt : best), series[0]);
  return p ? p.spl : null;
}

function firstPeakAndShoulder(series) {
  const band = series.filter((p) => p.frequency >= 20 && p.frequency <= 80);
  let peakIdx = -1;
  for (let i = 1; i < band.length - 1; i++) {
    if (band[i].spl > band[i - 1].spl && band[i].spl > band[i + 1].spl) { peakIdx = i; break; }
  }
  if (peakIdx === -1) return { peakSpl: null, shoulderDropDb: null };
  const peakSpl = band[peakIdx].spl;
  let minAfter = peakSpl;
  for (let i = peakIdx + 1; i < band.length; i++) {
    if (band[i].spl < minAfter) minAfter = band[i].spl;
    else if (band[i].spl > minAfter + 0.3) break; // stop once it recovers past the shoulder
  }
  return { peakSpl, shoulderDropDb: peakSpl - minAfter };
}

function bandAverage(series, loHz, hiHz) {
  const band = series.filter((p) => p.frequency >= loHz && p.frequency <= hiHz);
  if (band.length === 0) return null;
  return band.reduce((s, p) => s + p.spl, 0) / band.length;
}

function bandRipple(series, loHz, hiHz) {
  const band = series.filter((p) => p.frequency >= loHz && p.frequency <= hiHz);
  if (band.length === 0) return null;
  const vals = band.map((p) => p.spl);
  return Math.max(...vals) - Math.min(...vals);
}

function fmt(v, d = 1) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }

export default function Case045ModalOverlapWeightingShootoutAudit() {
  const result = useMemo(() => {
    const engineA = runEngine("production", 0.55);
    const engineB = runEngine("rew_modal_bandwidth", 0.55);
    const seriesA = toSeries(engineA);
    const seriesB = toSeries(engineB);

    const variants = [
      { id: "A", label: "A — Production", series: seriesA },
      { id: "B", label: "B — Q bandwidth 0.55", series: seriesB },
      ...OVERLAP_HZ_VALUES.map((hz) => ({
        id: `C-${hz}`,
        label: `C — Production + overlap boost (${hz} Hz)`,
        series: applyOverlapBoost(engineA, hz),
      })),
      ...OVERLAP_HZ_VALUES.map((hz) => ({
        id: `D-${hz}`,
        label: `D — Q bandwidth 0.55 + overlap boost (${hz} Hz)`,
        series: applyOverlapBoost(engineB, hz),
      })),
    ];

    const rows = variants.map((v) => {
      const spl30 = nearestSpl(v.series, 30);
      const { peakSpl, shoulderDropDb } = firstPeakAndShoulder(v.series);
      const avg2060 = bandAverage(v.series, 20, 60);
      const ripple60120 = bandRipple(v.series, 60, 120);
      return { ...v, spl30, peakSpl, shoulderDropDb, avg2060, ripple60120 };
    });

    // Directional "closer to REW?" heuristic: broader skirts show up as a smaller
    // peak-to-shoulder drop and lower 60-120Hz ripple, without moving the 30Hz/peak SPL
    // materially (mode frequencies are never changed by Q scaling, only bandwidth).
    const baseline = rows[0]; // Production
    rows.forEach((r) => {
      if (r.id === "A") { r.closerToRew = "—"; return; }
      const dropImproved = Number.isFinite(r.shoulderDropDb) && Number.isFinite(baseline.shoulderDropDb) && r.shoulderDropDb < baseline.shoulderDropDb - 0.3;
      const rippleImproved = Number.isFinite(r.ripple60120) && Number.isFinite(baseline.ripple60120) && r.ripple60120 < baseline.ripple60120 - 0.3;
      const freqStable = Math.abs((r.spl30 ?? 0) - (baseline.spl30 ?? 0)) < 6; // sanity: not wildly different level
      r.closerToRew = (dropImproved || rippleImproved) && freqStable ? "YES" : "NO";
    });

    const cCloser = rows.filter((r) => r.id.startsWith("C-")).some((r) => r.closerToRew === "YES");
    const dCloser = rows.filter((r) => r.id.startsWith("D-")).some((r) => r.closerToRew === "YES");
    const verdict = (cCloser || dCloser)
      ? "C/D show directional improvement — candidate for experimental selectable strategy"
      : "No directional improvement from modal overlap — retire modal overlap immediately";

    return { rows, verdict, cCloser, dCloser };
  }, []);

  return (
    <div style={{ border: "2px solid #6d28d9", borderRadius: 10, background: "#faf5ff", padding: 14, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: "#6d28d9", fontSize: 13, marginBottom: 6 }}>
        Case 045 — Modal Overlap Weighting Shootout (read-only)
      </div>
      <div style={{ color: "#7c3aed", marginBottom: 10 }}>
        Room 5.0×4.5×3.0 m · flat 94 dB source · overlapWeight = exp(-|Δf| / overlapHz) · boost scale {OVERLAP_BOOST_SCALE}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#ede9fe" }}>
              {["VARIANT", "30 Hz SPL", "First peak SPL", "Peak→shoulder drop", "20–60 Hz avg", "60–120 Hz ripple", "Closer to REW?"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #c4b5fd" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe", fontWeight: 700 }}>{r.label}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.spl30)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.peakSpl)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.shoulderDropDb)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.avg2060)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.ripple60120)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe", fontWeight: 700, color: r.closerToRew === "YES" ? "#166534" : r.closerToRew === "NO" ? "#b91c1c" : "#6b7280" }}>{r.closerToRew}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: "#ede9fe", border: "1px solid #c4b5fd" }}>
        <div style={{ fontWeight: 700, color: "#6d28d9" }}>TEST: Modal overlap weighting directional usefulness</div>
        <div style={{ marginTop: 4, color: "#5b21b6" }}>
          EXPECTED: C/D broaden resonance skirts (lower peak→shoulder drop, lower 60–120 Hz ripple) vs Production, without shifting 30 Hz level or mode frequencies (frequencies are never touched — only Q scaling/boost).<br/>
          ACTUAL: {result.cCloser ? "C shows directional improvement in at least one overlapHz." : "C shows no directional improvement."} {result.dCloser ? "D shows directional improvement in at least one overlapHz." : "D shows no directional improvement."}<br/>
          DELTA: see per-variant Peak→shoulder drop and 60–120 Hz ripple columns above vs Production (A) baseline.<br/>
          SEVERITY: {(result.cCloser || result.dCloser) ? "INFORMATIONAL — candidate found" : "LOW — no candidate found"}<br/>
          NEXT FIX CANDIDATE: {result.verdict}
        </div>
      </div>
    </div>
  );
}