import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot, ResponsiveContainer } from "recharts";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";
import { REW_TRACE_ANCHORS_HZ_DB } from "@/components/room/bass/case058RewDigitisedTrace.js";

// Case 058 — Automatic REW Curve Digitisation & Full-Curve Parity (read-only, diagnostic only).
// Compares the ENTIRE digitised REW response curve against B44 production, sampled every
// 0.5 Hz from 20-200 Hz, for THIS room only. Ignores every prior REW reference point
// (Cases 052-057). No production/solver/Q/reflection/smoothing/SPL/position changes.

const ROOM = { widthM: 3.50, lengthM: 5.90, heightM: 2.70 };
const ABSORPTION_ALL = 0.30;
const CURVE_DB = 94;
const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];
const SAMPLE_STEP_HZ = 0.5;
const FREQ_MIN = 20, FREQ_MAX = 200;
const FREQ_OFFSET_SEARCH_HZ = 5;
const FREQ_OFFSET_STEP_HZ = 0.1;
const PEAK_NULL_MATCH_TOLERANCE_HZ = 5;

const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: ABSORPTION_ALL, back: ABSORPTION_ALL, left: ABSORPTION_ALL, right: ABSORPTION_ALL, ceiling: ABSORPTION_ALL, floor: ABSORPTION_ALL },
  freqMinHz: FREQ_MIN,
  freqMaxHz: FREQ_MAX,
  smoothing: "none",
  pureDeterministicModalSum: true,
  disableLateField: true,
  disableModalPropagationPhase: true,
  modalSourceReferenceMode: "existing",
  qStrategy: "production",
  debugReflectionOrder: 1,
};

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : "—"; }

function resolveLiveSeatAndSub(appState) {
  const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
  const seat = seats.find((s) => s && s.isPrimary) || seats[0] || { x: ROOM.widthM / 2, y: ROOM.lengthM * 0.6, z: 1.2 };
  const sub = { x: ROOM.widthM - 0.30, y: 0.15, z: 0.35, modelKey: appState?.frontSubsCfg?.model || "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  return { seat: { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 }, sub };
}

function interpolateAnchors(anchors, hz) {
  if (hz <= anchors[0][0]) return anchors[0][1];
  if (hz >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [f0, v0] = anchors[i], [f1, v1] = anchors[i + 1];
    if (hz >= f0 && hz <= f1) {
      const t = (hz - f0) / (f1 - f0);
      return v0 + (v1 - v0) * t;
    }
  }
  return anchors[anchors.length - 1][1];
}

function buildDigitisedRewSeries() {
  const series = [];
  for (let f = FREQ_MIN; f <= FREQ_MAX + 1e-9; f += SAMPLE_STEP_HZ) {
    series.push({ frequency: Math.round(f * 10) / 10, spl: interpolateAnchors(REW_TRACE_ANCHORS_HZ_DB, f) });
  }
  return series;
}

function sampleAt(series, hz) {
  return series.reduce((best, p) => (Math.abs(p.frequency - hz) < Math.abs(best.frequency - hz) ? p : best), series[0]).spl;
}

function findPeaksAndDips(series) {
  const peaks = [], dips = [];
  for (let i = 1; i < series.length - 1; i++) {
    if (series[i].spl > series[i - 1].spl && series[i].spl >= series[i + 1].spl) peaks.push(series[i]);
    if (series[i].spl < series[i - 1].spl && series[i].spl <= series[i + 1].spl) dips.push(series[i]);
  }
  return { peaks, dips };
}

function matchFeatures(rewFeatures, b44Features, tolerance) {
  const used = new Set();
  const matches = [];
  rewFeatures.forEach((rf) => {
    let best = null, bestDist = Infinity;
    b44Features.forEach((bf, idx) => {
      if (used.has(idx)) return;
      const d = Math.abs(bf.frequency - rf.frequency);
      if (d < bestDist) { bestDist = d; best = { ...bf, idx }; }
    });
    if (best && bestDist <= tolerance) {
      used.add(best.idx);
      matches.push({
        rewFrequency: rf.frequency, b44Frequency: best.frequency, freqDiff: best.frequency - rf.frequency,
        rewSpl: rf.spl, b44Spl: best.spl, splDiff: best.spl - rf.spl,
      });
    }
  });
  return matches;
}

export default function Case058AutomaticRewCurveDigitisationAudit() {
  const appState = useAppState();

  const result = useMemo(() => {
    const rewSeries = buildDigitisedRewSeries();

    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const engineResult = simulateBassResponseRewCore(ROOM, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const b44RawSeries = engineResult.freqsHz.map((f, i) => {
      const cp = engineResult.complexPressure[i];
      return { frequency: f, spl: 20 * Math.log10(Math.max(Math.sqrt(cp.re * cp.re + cp.im * cp.im), 1e-10)) };
    });
    // Resample B44 onto the same 0.5 Hz grid as the digitised REW trace for direct comparison.
    const b44Series = rewSeries.map((p) => ({ frequency: p.frequency, spl: sampleAt(b44RawSeries, p.frequency) }));

    // --- Gain offset: mean(REW - B44) over full overlap, shape unchanged ---
    const gainOffset = rewSeries.reduce((sum, p, i) => sum + (p.spl - b44Series[i].spl), 0) / rewSeries.length;

    // --- Frequency offset: brute-force shift search minimising RMS after gain correction ---
    let bestFreqOffset = 0, bestRms = Infinity;
    for (let shift = -FREQ_OFFSET_SEARCH_HZ; shift <= FREQ_OFFSET_SEARCH_HZ; shift += FREQ_OFFSET_STEP_HZ) {
      let sumSq = 0, count = 0;
      rewSeries.forEach((p) => {
        const shiftedHz = p.frequency + shift;
        if (shiftedHz < FREQ_MIN || shiftedHz > FREQ_MAX) return;
        const b44Val = sampleAt(b44RawSeries, shiftedHz) + gainOffset;
        sumSq += (p.spl - b44Val) ** 2;
        count++;
      });
      const rms = count > 0 ? Math.sqrt(sumSq / count) : Infinity;
      if (rms < bestRms) { bestRms = rms; bestFreqOffset = shift; }
    }

    // --- Parity metrics using gain+frequency-corrected B44 against raw digitised REW ---
    let sumSq = 0, sumAbs = 0, maxErr = 0, n = 0;
    let sumRew = 0, sumB44 = 0, sumRewSq = 0, sumB44Sq = 0, sumRewB44 = 0;
    const correctedSeries = rewSeries.map((p) => {
      const b44Val = sampleAt(b44RawSeries, p.frequency + bestFreqOffset) + gainOffset;
      const err = p.spl - b44Val;
      sumSq += err * err;
      sumAbs += Math.abs(err);
      maxErr = Math.max(maxErr, Math.abs(err));
      n++;
      sumRew += p.spl; sumB44 += b44Val;
      sumRewSq += p.spl * p.spl; sumB44Sq += b44Val * b44Val;
      sumRewB44 += p.spl * b44Val;
      return { frequency: p.frequency, rewSpl: p.spl, b44Spl: b44Val };
    });
    const rmsError = Math.sqrt(sumSq / n);
    const avgError = sumAbs / n;
    const covariance = (sumRewB44 / n) - (sumRew / n) * (sumB44 / n);
    const rewStd = Math.sqrt((sumRewSq / n) - (sumRew / n) ** 2);
    const b44Std = Math.sqrt((sumB44Sq / n) - (sumB44 / n) ** 2);
    const correlation = (rewStd > 1e-9 && b44Std > 1e-9) ? covariance / (rewStd * b44Std) : null;

    // --- Peak/null detection & matching (raw, uncorrected curves — real-world comparison) ---
    const rewFeatures = findPeaksAndDips(rewSeries);
    const b44Features = findPeaksAndDips(b44Series);
    const matchedPeaks = matchFeatures(rewFeatures.peaks, b44Features.peaks, PEAK_NULL_MATCH_TOLERANCE_HZ);
    const matchedDips = matchFeatures(rewFeatures.dips, b44Features.dips, PEAK_NULL_MATCH_TOLERANCE_HZ);

    const nullFreqError = matchedDips.length > 0 ? matchedDips[0].freqDiff : null;
    const nullDepthError = matchedDips.length > 0 ? matchedDips[0].splDiff : null;
    const peakFreqError = matchedPeaks.length > 0 ? matchedPeaks[0].freqDiff : null;
    const peakSplError = matchedPeaks.length > 0 ? matchedPeaks[0].splDiff : null;

    // --- Largest error point for overlay marker ---
    const worstPoint = correctedSeries.reduce((worst, p) => (Math.abs(p.rewSpl - p.b44Spl) > Math.abs(worst.rewSpl - worst.b44Spl) ? p : worst), correctedSeries[0]);

    // Overlay chart series: raw (uncorrected) REW + B44 for visual honesty (no gain/freq correction applied to the plotted curves).
    const overlaySeries = rewSeries.map((p, i) => ({ frequency: p.frequency, rew: p.spl, b44: b44Series[i].spl }));

    return {
      rewSeries, b44Series, gainOffset, bestFreqOffset, rmsError, maxErr, avgError, correlation,
      nullFreqError, nullDepthError, peakFreqError, peakSplError,
      matchedPeaks, matchedDips, worstPoint, overlaySeries, seat, sub,
    };
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  const severity = result.rmsError > 6 ? "HIGH" : result.rmsError > 3 ? "MODERATE" : "LOW";
  const verdict = result.rmsError > 6
    ? "Full-curve parity is poor — significant systematic deviation across the band. Investigate the largest-error region before further theory tests."
    : result.rmsError > 3
      ? "Full-curve parity is moderate — localized deviations remain (see matched peak/null table)."
      : "Full-curve parity is good — production tracks the digitised REW curve closely across 20-200 Hz.";

  return (
    <div style={{ border: "2px solid #1e293b", borderRadius: 10, background: "#f8fafc", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 13, marginBottom: 6 }}>
        Case 058 — Automatic REW Curve Digitisation & Full-Curve Parity (read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#e2e8f0", border: "1px solid #94a3b8", color: "#1e293b", marginBottom: 10 }}>
        Ignores every prior REW reference (Cases 052–057). Digitised REW trace sampled every {SAMPLE_STEP_HZ} Hz from {FREQ_MIN}-{FREQ_MAX} Hz from the attached screenshot's plotted curve (visual anchor-point digitisation, interpolated — see case058RewDigitisedTrace.js). Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m, sub front-right, live seat, 0.30 absorption all surfaces, no smoothing, production settings only.
      </div>

      <div style={{ height: 320, marginBottom: 12, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 6, padding: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={result.overlaySeries} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="frequency" type="number" domain={[FREQ_MIN, FREQ_MAX]} scale="log" tickFormatter={(v) => `${Math.round(v)}`} />
            <YAxis domain={[60, 120]} />
            <Tooltip formatter={(v) => `${fmt(v, 1)} dB`} labelFormatter={(v) => `${fmt(v, 1)} Hz`} />
            <Legend />
            <Line type="monotone" dataKey="rew" name="REW (digitised)" stroke="#f97316" dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line type="monotone" dataKey="b44" name="B44 production" stroke="#1e293b" dot={false} strokeWidth={2} isAnimationActive={false} />
            {result.matchedPeaks.map((m, i) => (
              <ReferenceDot key={`peak-${i}`} x={m.rewFrequency} y={m.rewSpl} r={4} fill="#16a34a" stroke="none" />
            ))}
            {result.matchedDips.map((m, i) => (
              <ReferenceDot key={`dip-${i}`} x={m.rewFrequency} y={m.rewSpl} r={4} fill="#2563eb" stroke="none" />
            ))}
            {result.worstPoint && (
              <ReferenceDot x={result.worstPoint.frequency} y={result.worstPoint.rewSpl} r={5} fill="#dc2626" stroke="none" />
            )}
          </LineChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 8, color: "#475569", marginTop: 4 }}>
          Green = matched peaks · Blue = matched nulls · Red = largest single-point error ({fmt(result.worstPoint?.frequency, 1)} Hz, Δ={fmt(Math.abs(result.worstPoint?.rewSpl - result.worstPoint?.b44Spl), 1)} dB).
        </div>
      </div>

      <div style={{ marginBottom: 10, overflowX: "auto" }}>
        <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>MATCHED PEAKS</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, marginBottom: 8 }}>
          <thead><tr style={{ background: "#e2e8f0" }}>{["REW Hz", "B44 Hz", "Δ Hz", "REW dB", "B44 dB", "Δ dB"].map(h => <th key={h} style={{ textAlign: "left", padding: "2px 5px", borderBottom: "1px solid #94a3b8" }}>{h}</th>)}</tr></thead>
          <tbody>
            {result.matchedPeaks.map((m, i) => (
              <tr key={i}>
                <td style={{ padding: "2px 5px" }}>{fmt(m.rewFrequency, 1)}</td>
                <td style={{ padding: "2px 5px" }}>{fmt(m.b44Frequency, 1)}</td>
                <td style={{ padding: "2px 5px" }}>{fmt(m.freqDiff, 1)}</td>
                <td style={{ padding: "2px 5px" }}>{fmt(m.rewSpl, 1)}</td>
                <td style={{ padding: "2px 5px" }}>{fmt(m.b44Spl, 1)}</td>
                <td style={{ padding: "2px 5px" }}>{fmt(m.splDiff, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>MATCHED NULLS</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
          <thead><tr style={{ background: "#e2e8f0" }}>{["REW Hz", "B44 Hz", "Δ Hz", "REW dB", "B44 dB", "Δ dB"].map(h => <th key={h} style={{ textAlign: "left", padding: "2px 5px", borderBottom: "1px solid #94a3b8" }}>{h}</th>)}</tr></thead>
          <tbody>
            {result.matchedDips.map((m, i) => (
              <tr key={i}>
                <td style={{ padding: "2px 5px" }}>{fmt(m.rewFrequency, 1)}</td>
                <td style={{ padding: "2px 5px" }}>{fmt(m.b44Frequency, 1)}</td>
                <td style={{ padding: "2px 5px" }}>{fmt(m.freqDiff, 1)}</td>
                <td style={{ padding: "2px 5px" }}>{fmt(m.rewSpl, 1)}</td>
                <td style={{ padding: "2px 5px" }}>{fmt(m.b44Spl, 1)}</td>
                <td style={{ padding: "2px 5px" }}>{fmt(m.splDiff, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#1e293b", color: "#f8fafc", border: "1px solid #475569" }}>
        <div style={{ fontWeight: 700 }}>TEST: Does the full B44 production response curve (20–200 Hz) match the digitised REW curve for this room?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED = digitised REW curve (this room only, {ENGINE_OPTIONS.debugReflectionOrder ? "" : ""}sub front-right, live seat, 0.30 absorption, no smoothing).<br/>
          ACTUAL = B44 production response, identical inputs.<br/>
          RMS ERROR: {fmt(result.rmsError, 2)} dB<br/>
          MAX ERROR: {fmt(result.maxErr, 2)} dB<br/>
          GAIN OFFSET: {fmt(result.gainOffset, 2)} dB<br/>
          FREQUENCY OFFSET: {fmt(result.bestFreqOffset, 2)} Hz<br/>
          CORRELATION: {fmt(result.correlation, 3)}<br/>
          MATCHED PEAKS: {result.matchedPeaks.length}<br/>
          MATCHED NULLS: {result.matchedDips.length}<br/>
          SEVERITY: {severity}<br/>
          NEXT FIX CANDIDATE: {verdict}
        </div>
      </div>
    </div>
  );
}