import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 051 — Textbook Analytical Solver Cross-Check (read-only, diagnostic only).
// Compares B44's production pipeline against an INDEPENDENT closed-form rectangular-room
// modal solution, built entirely inside this file — not REW. Does not call
// simulateBassResponseRewCore's modal path, legacyModalTransferLocal, or any production
// modal contribution object. Only simulateBassResponseRewCore itself is called once, to
// obtain the actual "B44 SPL" comparison column — the independent solver below is a fully
// self-contained re-derivation from first principles (rigid-wall eigenfunctions, Sabine Q,
// 2nd-order damped resonator transfer, pure modal Green's-function summation, dB only at the end).

const SPEED_OF_SOUND_MPS = 343;
const FREQ_MIN = 20;
const FREQ_MAX = 200;
const STEP_HZ = 1;
const REFERENCE_DB = 94;
const FIXED_ABSORPTION = 0.3; // uniform average absorption coefficient, independent solver only

const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const B44_ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  freqMinHz: FREQ_MIN,
  freqMaxHz: FREQ_MAX,
  pureDeterministicModalSum: true,
  disableLateField: true,
  disableModalPropagationPhase: true,
  modalSourceReferenceMode: "existing",
  qStrategy: "production",
};

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
    sub = { x: roomWidth * 0.33, y: 0.15, z: 0.35, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  }
  return { roomDims: { widthM: roomWidth, lengthM: roomLength, heightM: roomDims.heightM || 2.4 }, seat, sub };
}

// ── Independent, self-contained closed-form rectangular-room modal solver ──────────────────
// Every formula below is re-derived locally; nothing here imports or calls production code.

function independentModeFrequencies(widthM, lengthM, heightM, fMax) {
  const modes = [];
  const nMax = Math.ceil((fMax / SPEED_OF_SOUND_MPS) * 2 * Math.max(widthM, lengthM, heightM)) + 5;
  for (let nx = 0; nx <= nMax; nx++) {
    for (let ny = 0; ny <= nMax; ny++) {
      for (let nz = 0; nz <= nMax; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue;
        const f0 = (SPEED_OF_SOUND_MPS / 2) * Math.sqrt(
          (nx / widthM) ** 2 + (ny / lengthM) ** 2 + (nz / heightM) ** 2
        );
        if (!Number.isFinite(f0) || f0 <= 0 || f0 > fMax) continue;
        modes.push({ nx, ny, nz, f0 });
      }
    }
  }
  return modes;
}

// Rigid-wall pressure eigenfunction: Ψ(x,y,z) = cos(nxπx/W)·cos(nyπy/L)·cos(nzπz/H)
function independentEigenfunction(mode, x, y, z, widthM, lengthM, heightM) {
  const shapeX = mode.nx > 0 ? Math.cos((mode.nx * Math.PI * x) / widthM) : 1;
  const shapeY = mode.ny > 0 ? Math.cos((mode.ny * Math.PI * y) / lengthM) : 1;
  const shapeZ = mode.nz > 0 ? Math.cos((mode.nz * Math.PI * z) / heightM) : 1;
  return shapeX * shapeY * shapeZ;
}

// Textbook Sabine Q: T60 = 0.161·V/A (metric Sabine eq.), τ_energy = T60/13.815, Q = ω0·τ_energy.
// Uniform average absorption across all 6 surfaces — independent of production's topology weighting.
function independentModeQ(widthM, lengthM, heightM, f0, avgAbsorption) {
  const volume = widthM * lengthM * heightM;
  const surfaceArea = 2 * (widthM * lengthM + widthM * heightM + lengthM * heightM);
  const absorptionArea = surfaceArea * avgAbsorption;
  const t60 = (0.161 * volume) / Math.max(absorptionArea, 1e-6);
  const tauEnergy = t60 / 13.815;
  const q = 2 * Math.PI * f0 * tauEnergy;
  return Math.max(1, Math.min(80, q));
}

// Standard 2nd-order damped resonator transfer function: H(f) = 1 / (1 - (f/f0)² + j·f/(Q·f0))
function independentResonantTransfer(f, f0, q) {
  const ratio = f / f0;
  const realDen = 1 - ratio * ratio;
  const imagDen = f / (Math.max(q, 1e-6) * f0);
  const denomSq = realDen * realDen + imagDen * imagDen;
  return { re: realDen / denomSq, im: -imagDen / denomSq };
}

function computeIndependentTextbookSeries(roomDims, seat, sub, avgAbsorption) {
  const { widthM, lengthM, heightM } = roomDims;
  const modes = independentModeFrequencies(widthM, lengthM, heightM, FREQ_MAX + 20);
  const modesWithQ = modes.map((m) => ({ ...m, q: independentModeQ(widthM, lengthM, heightM, m.f0, avgAbsorption) }));
  const sourceAmplitude = Math.pow(10, REFERENCE_DB / 20);

  const freqs = [];
  for (let f = FREQ_MIN; f <= FREQ_MAX; f += STEP_HZ) freqs.push(f);

  return freqs.map((f) => {
    let sumRe = 0, sumIm = 0;
    modesWithQ.forEach((mode) => {
      const psiSource = independentEigenfunction(mode, sub.x, sub.y, sub.z, widthM, lengthM, heightM);
      const psiReceiver = independentEigenfunction(mode, seat.x, seat.y, seat.z, widthM, lengthM, heightM);
      const coupling = psiSource * psiReceiver;
      const { re, im } = independentResonantTransfer(f, mode.f0, mode.q);
      sumRe += sourceAmplitude * coupling * re;
      sumIm += sourceAmplitude * coupling * im;
    });
    const mag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
    return { frequency: f, spl: 20 * Math.log10(Math.max(mag, 1e-10)) };
  });
}
// ── End independent solver ───────────────────────────────────────────────────────────────────

function b44Series(engineResult) {
  return engineResult.freqsHz.map((f, i) => {
    const { re, im } = engineResult.complexPressure[i];
    return { frequency: f, spl: 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10)) };
  });
}

function nearestSpl(series, targetHz) {
  const p = series.reduce((best, pt) => (Math.abs(pt.frequency - targetHz) < Math.abs(best.frequency - targetHz) ? pt : best), series[0]);
  return p ? p.spl : null;
}

function firstPeakFreq(series) {
  const band = series.filter((p) => p.frequency >= 20 && p.frequency <= 100);
  for (let i = 1; i < band.length - 1; i++) {
    if (band[i].spl > band[i - 1].spl && band[i].spl > band[i + 1].spl) return band[i].frequency;
  }
  return null;
}

function firstNullFreq(series) {
  const band = series.filter((p) => p.frequency >= 20 && p.frequency <= 100);
  for (let i = 1; i < band.length - 1; i++) {
    if (band[i].spl < band[i - 1].spl && band[i].spl < band[i + 1].spl) return band[i].frequency;
  }
  return null;
}

function bandAverage(series, loHz, hiHz) {
  const band = series.filter((p) => p.frequency >= loHz && p.frequency <= hiHz);
  return band.length ? band.reduce((s, p) => s + p.spl, 0) / band.length : null;
}
function bandRipple(series, loHz, hiHz) {
  const band = series.filter((p) => p.frequency >= loHz && p.frequency <= hiHz);
  if (!band.length) return null;
  const vals = band.map((p) => p.spl);
  return Math.max(...vals) - Math.min(...vals);
}

function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }

export default function Case051TextbookAnalyticalSolverCrossCheckAudit() {
  const appState = useAppState();

  const result = useMemo(() => {
    const { roomDims, seat, sub } = resolveLiveInputs(appState);

    const engineResult = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, B44_ENGINE_OPTIONS);
    const b44 = b44Series(engineResult);
    const textbook = computeIndependentTextbookSeries(roomDims, seat, sub, FIXED_ABSORPTION);

    const rows = textbook.map((tRow) => {
      const bSpl = nearestSpl(b44, tRow.frequency);
      return { frequency: tRow.frequency, b44Spl: bSpl, textbookSpl: tRow.spl, delta: bSpl - tRow.spl };
    });

    const deltas = rows.map((r) => r.delta).filter(Number.isFinite);
    const maxError = Math.max(...deltas.map(Math.abs));
    const meanAbsError = deltas.reduce((s, d) => s + Math.abs(d), 0) / deltas.length;
    const rmsError = Math.sqrt(deltas.reduce((s, d) => s + d * d, 0) / deltas.length);

    const b44PeakFreq = firstPeakFreq(b44);
    const textbookPeakFreq = firstPeakFreq(textbook);
    const peakFreqDiff = (Number.isFinite(b44PeakFreq) && Number.isFinite(textbookPeakFreq)) ? b44PeakFreq - textbookPeakFreq : null;

    const b44NullFreq = firstNullFreq(b44);
    const textbookNullFreq = firstNullFreq(textbook);
    const nullFreqDiff = (Number.isFinite(b44NullFreq) && Number.isFinite(textbookNullFreq)) ? b44NullFreq - textbookNullFreq : null;

    const avg2060Diff = bandAverage(b44, 20, 60) - bandAverage(textbook, 20, 60);
    const ripple60120Diff = bandRipple(b44, 60, 120) - bandRipple(textbook, 60, 120);

    let verdict;
    if (!Number.isFinite(meanAbsError) || !Number.isFinite(maxError)) {
      verdict = "3. INDEPENDENT SOLVER INCONCLUSIVE";
    } else if (meanAbsError < 3 && maxError < 8) {
      verdict = "1. B44 MATCHES TEXTBOOK";
    } else {
      verdict = "2. B44 DOES NOT MATCH TEXTBOOK";
    }

    return { rows, maxError, meanAbsError, rmsError, peakFreqDiff, nullFreqDiff, avg2060Diff, ripple60120Diff, verdict };
  }, [appState?.roomDims, appState?.seatingPositions, appState?.frontSubsCfg, appState?.rearSubsCfg]);

  // Show a readable subset of the 181-row table (every 5 Hz) to keep the panel compact.
  const displayRows = result.rows.filter((r) => r.frequency % 5 === 0);

  return (
    <div style={{ border: "2px solid #7e22ce", borderRadius: 10, background: "#faf5ff", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#7e22ce", fontSize: 13, marginBottom: 6 }}>
        Case 051 — Textbook Analytical Solver Cross-Check (read-only)
      </div>
      <div style={{ color: "#6b21a8", marginBottom: 10 }}>
        Live room/seat/sub · B44 = production simulateBassResponseRewCore · Textbook = independent self-contained modal Green's-function solver (rigid-wall eigenfunctions, Sabine Q, 2nd-order resonator, complex sum, dB at the end only) · 20–200 Hz, 1 Hz spacing (5 Hz shown)
      </div>

      <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
          <thead>
            <tr style={{ background: "#e9d5ff", position: "sticky", top: 0 }}>
              {["Hz", "B44 SPL", "Textbook SPL", "Δ"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 5px", borderBottom: "1px solid #d8b4fe" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => (
              <tr key={r.frequency}>
                <td style={{ padding: "2px 5px", borderBottom: "1px solid #f3e8ff" }}>{r.frequency}</td>
                <td style={{ padding: "2px 5px", borderBottom: "1px solid #f3e8ff" }}>{fmt(r.b44Spl, 1)}</td>
                <td style={{ padding: "2px 5px", borderBottom: "1px solid #f3e8ff" }}>{fmt(r.textbookSpl, 1)}</td>
                <td style={{ padding: "2px 5px", borderBottom: "1px solid #f3e8ff", fontWeight: 700, color: Math.abs(r.delta) < 3 ? "#166534" : "#b91c1c" }}>{fmt(r.delta, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#e9d5ff", border: "1px solid #d8b4fe" }}>
        <div style={{ fontWeight: 700, color: "#7e22ce" }}>SUMMARY METRICS</div>
        <div style={{ marginTop: 4, color: "#6b21a8" }}>
          Max error: {fmt(result.maxError)} dB · Mean abs error: {fmt(result.meanAbsError)} dB · RMS error: {fmt(result.rmsError)} dB<br/>
          First peak freq diff: {fmt(result.peakFreqDiff, 1)} Hz · First null freq diff: {fmt(result.nullFreqDiff, 1)} Hz<br/>
          20–60 Hz avg diff: {fmt(result.avg2060Diff)} dB · 60–120 Hz ripple diff: {fmt(result.ripple60120Diff)} dB
        </div>
      </div>

      <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#581c87", color: "#faf5ff", border: "1px solid #7e22ce" }}>
        <div style={{ fontWeight: 700 }}>TEST: Does B44 match an independent closed-form textbook rectangular-room modal solution?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED: A correct implementation should track the textbook modal Green's-function solution within a few dB, with peaks/nulls at matching frequencies (B44's added direct+reflection paths are expected to shift absolute level but not gross structure).<br/>
          ACTUAL: mean abs error = {fmt(result.meanAbsError)} dB, max error = {fmt(result.maxError)} dB, RMS = {fmt(result.rmsError)} dB; peak freq diff = {fmt(result.peakFreqDiff, 1)} Hz, null freq diff = {fmt(result.nullFreqDiff, 1)} Hz.<br/>
          DELTA: {result.verdict.startsWith("1") ? "Within tolerance — structure and level are consistent with the textbook solution." : result.verdict.startsWith("2") ? "Errors exceed tolerance — B44's hybrid direct+reflection+modal architecture diverges from the pure modal textbook series." : "Insufficient finite data to compare."}<br/>
          SEVERITY: {result.verdict.startsWith("1") ? "INFORMATIONAL — no discrepancy" : result.verdict.startsWith("2") ? "MODERATE — structural difference expected/explained by additive direct+reflection paths" : "LOW — inconclusive"}<br/>
          NEXT FIX CANDIDATE: {result.verdict}
        </div>
      </div>
    </div>
  );
}