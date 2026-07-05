import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 046 — Modal Contribution Normalisation Shootout (compact, read-only, diagnostic only).
// Tests whether B44's modal contribution amplitudes are over/under-normalised before
// summation. All variants are reconstructed post-hoc from the REAL engine's per-mode
// debug output (activeModalContributorDebugSeries) — rewBassEngine.js, mode frequencies,
// source/receiver coupling, coupling signs, and resonantTransfer() are never touched.
// Only the RELATIVE MAGNITUDE of each already-computed modal contribution is reweighted
// before re-summation. No energy is invented — every variant redistributes/compresses the
// engine's own contributor vectors.

const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
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

function magPhase(re, im) {
  return { mag: Math.sqrt(re * re + im * im), angle: Math.atan2(im, re) };
}

// Variant B: equalise magnitude across ALL contributors (conserves total energy).
function normaliseEqualEnergy(contributors) {
  const n = contributors.length;
  if (n === 0) return { re: 0, im: 0 };
  const energy = contributors.reduce((s, c) => s + (c.activeReal ** 2 + c.activeImag ** 2), 0);
  const equalMag = Math.sqrt(energy / n);
  let re = 0, im = 0;
  contributors.forEach((c) => {
    const { angle } = magPhase(c.activeReal, c.activeImag);
    re += equalMag * Math.cos(angle);
    im += equalMag * Math.sin(angle);
  });
  return { re, im };
}

// Variant C: equalise magnitude WITHIN each modal family group (axial/tangential/oblique) separately.
function normaliseByFamily(contributors) {
  const groups = { axial: [], tangential: [], oblique: [] };
  contributors.forEach((c) => { (groups[c.modeType] || (groups[c.modeType] = [])).push(c); });
  let re = 0, im = 0;
  Object.values(groups).forEach((group) => {
    const contrib = normaliseEqualEnergy(group);
    re += contrib.re;
    im += contrib.im;
  });
  return { re, im };
}

// Variant D: equalise magnitude WITHIN each 1/3-octave band of mode frequency.
function normaliseByBand(contributors) {
  const bands = new Map();
  contributors.forEach((c) => {
    const bandIdx = Math.round(Math.log2(Math.max(c.modeFrequencyHz, 1)) * 3);
    if (!bands.has(bandIdx)) bands.set(bandIdx, []);
    bands.get(bandIdx).push(c);
  });
  let re = 0, im = 0;
  bands.forEach((group) => {
    const contrib = normaliseEqualEnergy(group);
    re += contrib.re;
    im += contrib.im;
  });
  return { re, im };
}

// Variants E/F: sign-preserving power compression per component.
function compressPower(contributors, power) {
  let re = 0, im = 0;
  contributors.forEach((c) => {
    re += Math.sign(c.activeReal) * Math.pow(Math.abs(c.activeReal), power);
    im += Math.sign(c.activeImag) * Math.pow(Math.abs(c.activeImag), power);
  });
  return { re, im };
}

function reconstructSeries(engineResult, normaliseFn) {
  const { freqsHz, complexPressure, activeModalContributorDebugSeries } = engineResult;
  const byFreq = new Map(activeModalContributorDebugSeries.map((row) => [row.frequencyHz, row]));
  return freqsHz.map((f, i) => {
    const total = complexPressure[i];
    const row = byFreq.get(f);
    if (!row || !Array.isArray(row.contributors) || row.contributors.length === 0) {
      const mag = Math.sqrt(total.re * total.re + total.im * total.im);
      return { frequency: f, spl: 20 * Math.log10(Math.max(mag, 1e-10)) };
    }
    const preRe = total.re - row.modalSumRe;
    const preIm = total.im - row.modalSumIm;
    const { re: modRe, im: modIm } = normaliseFn ? normaliseFn(row.contributors) : { re: row.modalSumRe, im: row.modalSumIm };
    const finalRe = preRe + modRe;
    const finalIm = preIm + modIm;
    const mag = Math.sqrt(finalRe * finalRe + finalIm * finalIm);
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
    else if (band[i].spl > minAfter + 0.3) break;
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

function resolveLiveInputs(appState) {
  const roomDims = appState?.roomDims || { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
  const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
  const seat = seats.find((s) => s.isPrimary) || seats[0] || { x: (roomDims.widthM || 4.5) / 2, y: (roomDims.lengthM || 6) * 0.6, z: 1.2 };

  const frontCfg = appState?.frontSubsCfg;
  const rearCfg = appState?.rearSubsCfg;
  const roomWidth = roomDims.widthM || 4.5;
  const roomLength = roomDims.lengthM || 6.0;

  let sub = null;
  if (frontCfg?.count > 0) {
    const pos = frontCfg.positions?.[0] || { x: roomWidth * 0.33, y: 0.15 };
    sub = { x: pos.x, y: pos.y, z: Number.isFinite(pos.z) ? pos.z : 0.35, modelKey: frontCfg.model || "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  } else if (rearCfg?.count > 0) {
    const pos = rearCfg.positions?.[0] || { x: roomWidth * 0.33, y: roomLength - 0.15 };
    sub = { x: pos.x, y: pos.y, z: Number.isFinite(pos.z) ? pos.z : 0.35, modelKey: rearCfg.model || "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  } else {
    // Fallback reference sub — no subwoofer configured yet in the live project.
    sub = { x: roomWidth * 0.33, y: 0.15, z: 0.35, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  }

  return { roomDims: { widthM: roomWidth, lengthM: roomLength, heightM: roomDims.heightM || 2.4 }, seat, sub };
}

export default function Case046ModalContributionNormalisationShootoutAudit() {
  const appState = useAppState();

  const result = useMemo(() => {
    const { roomDims, seat, sub } = resolveLiveInputs(appState);

    const engineA = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, { ...ENGINE_OPTIONS_BASE, qStrategy: "production" });
    const seriesA = toSeries(engineA);

    const variants = [
      { id: "A", label: "A — Production", series: seriesA },
      { id: "B", label: "B — Normalise by total modal energy", series: reconstructSeries(engineA, normaliseEqualEnergy) },
      { id: "C", label: "C — Normalise by modal family", series: reconstructSeries(engineA, normaliseByFamily) },
      { id: "D", label: "D — Normalise by 1/3-octave band", series: reconstructSeries(engineA, normaliseByBand) },
      { id: "E", label: "E — Compress mag^0.85", series: reconstructSeries(engineA, (c) => compressPower(c, 0.85)) },
      { id: "F", label: "F — Compress mag^0.70", series: reconstructSeries(engineA, (c) => compressPower(c, 0.70)) },
    ];

    const rows = variants.map((v) => {
      const spl30 = nearestSpl(v.series, 30);
      const { peakSpl, shoulderDropDb } = firstPeakAndShoulder(v.series);
      const avg2060 = bandAverage(v.series, 20, 60);
      const ripple60120 = bandRipple(v.series, 60, 120);
      return { ...v, spl30, peakSpl, shoulderDropDb, avg2060, ripple60120, modeFreqShifted: "NO" };
    });

    const baseline = rows[0];
    rows.forEach((r) => {
      if (r.id === "A") { r.closerToRew = "—"; return; }
      const dropImproved = Number.isFinite(r.shoulderDropDb) && Number.isFinite(baseline.shoulderDropDb) && r.shoulderDropDb < baseline.shoulderDropDb - 0.3;
      const rippleImproved = Number.isFinite(r.ripple60120) && Number.isFinite(baseline.ripple60120) && r.ripple60120 < baseline.ripple60120 - 0.3;
      const levelStable = Math.abs((r.spl30 ?? 0) - (baseline.spl30 ?? 0)) < 6;
      r.closerToRew = (dropImproved || rippleImproved) && levelStable ? "YES" : "NO";
    });

    const bImproved = rows.find((r) => r.id === "B")?.closerToRew === "YES";
    const cImproved = rows.find((r) => r.id === "C")?.closerToRew === "YES";
    const dImproved = rows.find((r) => r.id === "D")?.closerToRew === "YES";
    const eImproved = rows.find((r) => r.id === "E")?.closerToRew === "YES";
    const fImproved = rows.find((r) => r.id === "F")?.closerToRew === "YES";

    let verdict;
    if (eImproved || fImproved) verdict = "2. Compression is promising";
    else if (cImproved || dImproved) verdict = "3. Family/band normalisation is promising";
    else if (bImproved) verdict = "1. Modal contribution normalisation is promising";
    else verdict = "4. Normalisation is not useful";

    return { rows, verdict };
  }, [appState?.roomDims, appState?.seatingPositions, appState?.frontSubsCfg, appState?.rearSubsCfg]);

  return (
    <div style={{ border: "2px solid #b45309", borderRadius: 10, background: "#fffbeb", padding: 14, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: "#b45309", fontSize: 13, marginBottom: 6 }}>
        Case 046 — Modal Contribution Normalisation Shootout (read-only)
      </div>
      <div style={{ color: "#92400e", marginBottom: 10 }}>
        Live room/seat/sub · flat 94 dB source · absorption 0.30 all surfaces (fixed reference) · mode frequencies never altered
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#fef3c7" }}>
              {["VARIANT", "30 Hz SPL", "First peak SPL", "Peak→shoulder drop", "20–60 Hz avg", "60–120 Hz ripple", "Freq shifted?", "Closer to REW?"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #fcd34d" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7", fontWeight: 700 }}>{r.label}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.spl30)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.peakSpl)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.shoulderDropDb)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.avg2060)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.ripple60120)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{r.modeFreqShifted}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7", fontWeight: 700, color: r.closerToRew === "YES" ? "#166534" : r.closerToRew === "NO" ? "#b91c1c" : "#6b7280" }}>{r.closerToRew}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: "#fef3c7", border: "1px solid #fcd34d" }}>
        <div style={{ fontWeight: 700, color: "#b45309" }}>TEST: Modal contribution normalisation directional usefulness</div>
        <div style={{ marginTop: 4, color: "#92400e" }}>
          EXPECTED: B/C/D/E/F broaden the 20–60 Hz shoulder (lower peak→shoulder drop, lower ripple) vs Production without shifting mode frequencies or 30 Hz level.<br/>
          ACTUAL: see per-variant columns above vs Production (A) baseline.<br/>
          DELTA: Peak→shoulder drop and 60–120 Hz ripple deltas per variant, tabulated.<br/>
          SEVERITY: {result.verdict.startsWith("4") ? "LOW — no candidate found" : "INFORMATIONAL — candidate found"}<br/>
          NEXT FIX CANDIDATE: {result.verdict}
        </div>
      </div>
    </div>
  );
}