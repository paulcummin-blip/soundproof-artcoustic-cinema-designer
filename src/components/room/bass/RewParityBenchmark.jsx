// RewParityBenchmark.jsx
// Single-room REW-parity benchmark for the current test case.
// Measurement layer only — no simulation maths are changed here.
//
// EDITABLE TARGETS: update REW_TARGETS_CURRENT_ROOM when new REW data is captured.
// All tolerances match the agreed pass criteria from the design discussion.

import React, { useMemo } from 'react';

// ─── REW reference targets — explicit, editable, current room only ────────────
// Replace these values whenever a new REW capture is taken for this room.
// Do NOT compute or interpolate these — they must be entered from real REW data.
export const REW_TARGETS_CURRENT_ROOM = {
  _room: 'Current test room — multi-screenshot REW capture 2026-04-18',
  _capturedAt: '2026-04-18',

  // 34 Hz region — slight peak near 33.5–34 Hz (REW cursor: 33.5 Hz @ 93.6 dB, baseline ~90 dB)
  hz34: {
    featureFrequencyHz: 33.5,   // Hz — REW cursor confirmed 33.5 Hz
    featureMagnitudeDb: 3.6,    // dB relative to 40-80 Hz median — slight peak above baseline
  },

  // 40 Hz region — broad interference dip (REW cursor: 40.6 Hz @ 72.9 dB, trend ~90 dB)
  hz40: {
    nullCentreHz:   40.6,   // Hz — REW cursor confirmed 40.6 Hz
    nullDepthDb:    -17.0,  // dB — depth relative to surrounding trend (~90 dB baseline)
    nullWidthHz:    10.0,   // Hz — broad interference dip, visually ~10 Hz wide at -10 dB
  },

  // 68 Hz region — moderate peak (REW cursor: 67.9 Hz @ 92.4 dB, trend ~88-89 dB)
  hz68: {
    peakFrequencyHz:   67.9,  // Hz — REW cursor confirmed 67.9 Hz
    peakProminenceDb:  4.0,   // dB — peak above surrounding trend
  },

  // Vector behaviour at null — not visible in REW screenshots provided
  vectorAtNull: {
    phaseShiftDeg: null,  // degrees — not yet captured from REW phase view
  },

  // Agreed tolerances (do not edit these without a design discussion)
  tolerances: {
    featureFrequencyHz: 0.5,   // ±0.5 Hz for any frequency match
    featureMagnitudeDb: 1.0,   // ±1.0 dB for 34/68 Hz magnitudes
    nullDepthDb:        2.0,   // ±2 dB for null minimum depth
    nullWidthHz:        5.0,   // ±5 Hz for null width at -10 dB relative to trend
    phaseShiftDeg:      15.0,  // ±15 degrees for phase shift across null
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Interpolate SPL at a given frequency from a {frequency, spl}[] series.
function interpolateSpl(series, targetHz) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.frequency - b.frequency);
  if (targetHz <= sorted[0].frequency) return sorted[0].spl;
  if (targetHz >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].spl;
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i], p2 = sorted[i + 1];
    if (!Number.isFinite(p1.spl) || !Number.isFinite(p2.spl)) continue;
    if (targetHz >= p1.frequency && targetHz <= p2.frequency) {
      const t = (targetHz - p1.frequency) / (p2.frequency - p1.frequency);
      return p1.spl + (p2.spl - p1.spl) * t;
    }
  }
  return null;
}

// Compute 40-80 Hz median to normalise a curve.
function computeMedian(series) {
  const band = (series || [])
    .filter(p => p.frequency >= 40 && p.frequency <= 80 && Number.isFinite(p.spl))
    .map(p => p.spl);
  if (band.length < 3) return 0;
  const sorted = [...band].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Find the minimum SPL in a window and return {frequency, spl}.
function findMinInWindow(series, centreHz, halfWindowHz) {
  const candidates = (series || []).filter(
    p => Math.abs(p.frequency - centreHz) <= halfWindowHz && Number.isFinite(p.spl)
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((min, p) => (p.spl < min.spl ? p : min));
}

// Find the maximum SPL in a window and return {frequency, spl}.
function findMaxInWindow(series, centreHz, halfWindowHz) {
  const candidates = (series || []).filter(
    p => Math.abs(p.frequency - centreHz) <= halfWindowHz && Number.isFinite(p.spl)
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((max, p) => (p.spl > max.spl ? p : max));
}

// Compute null width at (nullDepth + thresholdDb) — i.e. how wide the null is above its floor.
function computeNullWidth(series, nullCentreHz, nullDepthDb, thresholdDb = 10) {
  if (!Number.isFinite(nullDepthDb)) return null;
  const target = nullDepthDb + thresholdDb; // e.g. -18 + 10 = -8 dB
  const sorted = [...(series || [])]
    .filter(p => Number.isFinite(p.spl))
    .sort((a, b) => a.frequency - b.frequency);

  // Find left crossing (searching left from centre)
  let leftHz = null;
  for (let i = sorted.length - 1; i >= 1; i--) {
    if (sorted[i].frequency > nullCentreHz) continue;
    if (sorted[i].spl <= target && sorted[i - 1].spl > target) {
      const t = (target - sorted[i - 1].spl) / (sorted[i].spl - sorted[i - 1].spl);
      leftHz = sorted[i - 1].frequency + t * (sorted[i].frequency - sorted[i - 1].frequency);
      break;
    }
  }

  // Find right crossing (searching right from centre)
  let rightHz = null;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].frequency < nullCentreHz) continue;
    if (sorted[i].spl <= target && sorted[i + 1].spl > target) {
      const t = (target - sorted[i].spl) / (sorted[i + 1].spl - sorted[i].spl);
      rightHz = sorted[i].frequency + t * (sorted[i + 1].frequency - sorted[i].frequency);
      break;
    }
  }

  if (leftHz !== null && rightHz !== null) return rightHz - leftHz;
  return null;
}

// Compute phase (atan2) from a stepDebug row at a given frequency.
// Returns degrees, or null if no row available.
function getPhaseAtHz(stepDebug, targetHz) {
  if (!Array.isArray(stepDebug) || stepDebug.length === 0) return null;
  const nearest = stepDebug.reduce((best, row) => {
    const d = Math.abs(row.frequencyHz - targetHz);
    return best === null || d < Math.abs(best.frequencyHz - targetHz) ? row : best;
  }, null);
  if (!nearest || Math.abs(nearest.frequencyHz - targetHz) > 3) return null;

  // Prefer postModal complex, fall back to applicationComparison
  const pm = nearest.postModal;
  const ac = nearest.applicationComparison;

  const re = pm?.re ?? ac?.livePostRe ?? null;
  const im = pm?.im ?? ac?.livePostIm ?? null;

  if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
  return (Math.atan2(im, re) * 180) / Math.PI;
}

// ─── PassFail pill ────────────────────────────────────────────────────────────
function Pill({ pass }) {
  if (pass === null) return (
    <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', background: '#f1f5f9', borderRadius: 4, padding: '1px 6px' }}>
      NO DATA
    </span>
  );
  return pass
    ? <span style={{ fontSize: 10, fontWeight: 700, color: '#065f46', background: '#dcfce7', borderRadius: 4, padding: '1px 6px' }}>✓ PASS</span>
    : <span style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', background: '#fee2e2', borderRadius: 4, padding: '1px 6px' }}>✗ FAIL</span>;
}

// ─── Single result row ────────────────────────────────────────────────────────
function ResultRow({ label, b44, rew, tol, unit = '', higherIsBetter = false }) {
  const hasData = Number.isFinite(b44) && Number.isFinite(rew);
  const err = hasData ? b44 - rew : null;
  const pass = hasData ? Math.abs(err) <= tol : null;
  return (
    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
      <td style={{ padding: '3px 6px', fontSize: 10, color: '#374151' }}>{label}</td>
      <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>
        {Number.isFinite(b44) ? b44.toFixed(2) : '—'}{unit}
      </td>
      <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', color: '#6b7280' }}>
        {Number.isFinite(rew) ? rew.toFixed(2) : '—'}{unit}
      </td>
      <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', color: '#6b7280' }}>
        ±{tol}{unit}
      </td>
      <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', color: err !== null && Math.abs(err) > tol ? '#dc2626' : '#374151' }}>
        {err !== null ? (err >= 0 ? '+' : '') + err.toFixed(2) + unit : '—'}
      </td>
      <td style={{ padding: '3px 6px' }}><Pill pass={pass} /></td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RewParityBenchmark({ b44Series, stepDebug }) {
  const T = REW_TARGETS_CURRENT_ROOM;
  const TOL = T.tolerances;

  const results = useMemo(() => {
    if (!Array.isArray(b44Series) || b44Series.length === 0) return null;

    const median = computeMedian(b44Series);
    // Normalised series: subtract 40-80 Hz median so shape comparison is offset-independent
    const norm = b44Series.map(p => ({
      frequency: p.frequency,
      spl: Number.isFinite(p.spl) ? p.spl - median : null,
    }));

    // ── 34 Hz region — anchored to REW-defined 34.3 Hz (±2 Hz) ──────────────
    const hz34Feature = findMinInWindow(norm, T.hz34.featureFrequencyHz, 2);
    const hz34PeakAlt = findMaxInWindow(norm, T.hz34.featureFrequencyHz, 2);
    // Use whichever is the stronger feature (further from 0)
    const hz34Best = (hz34Feature && hz34PeakAlt)
      ? (Math.abs(hz34Feature.spl) >= Math.abs(hz34PeakAlt.spl) ? hz34Feature : hz34PeakAlt)
      : (hz34Feature || hz34PeakAlt);

    // ── 40 Hz null — anchored to REW problem region (±4 Hz) ──────────────────
    const hz40Null = findMinInWindow(norm, T.hz40.nullCentreHz, 4);
    const hz40NullDepth = hz40Null?.spl ?? null; // dB relative to median
    const hz40Width = hz40Null
      ? computeNullWidth(norm, hz40Null.frequency, hz40NullDepth, 10)
      : null;

    // ── 68 Hz region — anchored to REW-defined 68 Hz (±3 Hz) ────────────────
    const hz68Peak = findMaxInWindow(norm, T.hz68.peakFrequencyHz, 3);

    // Prominence = peak spl minus average of neighbours (±10 Hz excluding ±3 Hz)
    let hz68Prominence = null;
    if (hz68Peak) {
      const surrounds = norm.filter(p =>
        Math.abs(p.frequency - hz68Peak.frequency) >= 3 &&
        Math.abs(p.frequency - hz68Peak.frequency) <= 10 &&
        Number.isFinite(p.spl)
      );
      if (surrounds.length >= 2) {
        const avg = surrounds.reduce((s, p) => s + p.spl, 0) / surrounds.length;
        hz68Prominence = hz68Peak.spl - avg;
      }
    }

    // ── Vector / phase at null ─────────────────────────────────────────────
    const nullCentreHz = hz40Null?.frequency ?? T.hz40.nullCentreHz;
    const phaseLow  = getPhaseAtHz(stepDebug, nullCentreHz - 2);
    const phaseHigh = getPhaseAtHz(stepDebug, nullCentreHz + 2);
    let b44PhaseShift = null;
    if (Number.isFinite(phaseLow) && Number.isFinite(phaseHigh)) {
      let delta = phaseHigh - phaseLow;
      // Unwrap to (-180, 180]
      if (delta > 180) delta -= 360;
      if (delta <= -180) delta += 360;
      b44PhaseShift = delta;
    }

    // ── Phase-alignment diagnostic at REW null target frequency ──────────────
    // Uses REW_TARGETS_CURRENT_ROOM.hz40.nullCentreHz (NOT the B44-detected null centre).
    // pre-modal vector = summedBeforeModes; modal vector = postModal.modalSumRe/Im
    const rewNullTargetHz = T.hz40.nullCentreHz;
    let phaseAlignment = null;
    if (Array.isArray(stepDebug) && stepDebug.length > 0) {
      const nearestRow = stepDebug.reduce((best, row) => {
        const d = Math.abs(row.frequencyHz - rewNullTargetHz);
        return best === null || d < Math.abs(best.frequencyHz - rewNullTargetHz) ? row : best;
      }, null);

      if (nearestRow && Math.abs(nearestRow.frequencyHz - rewNullTargetHz) <= 5) {
        const sb = nearestRow.summedBeforeModes;
        const pm = nearestRow.postModal;
        const ac = nearestRow.applicationComparison;

        const preRe = sb?.sumRe ?? ac?.prevRe ?? null;
        const preIm = sb?.sumIm ?? ac?.prevIm ?? null;
        const modRe = pm?.modalSumRe ?? ac?.modalSumRe ?? null;
        const modIm = pm?.modalSumIm ?? ac?.modalSumIm ?? null;

        if (Number.isFinite(preRe) && Number.isFinite(preIm) &&
            Number.isFinite(modRe) && Number.isFinite(modIm)) {
          const preAngleDeg = (Math.atan2(preIm, preRe) * 180) / Math.PI;
          const modAngleDeg = (Math.atan2(modIm, modRe) * 180) / Math.PI;
          let angleDiff = Math.abs(preAngleDeg - modAngleDeg);
          // Reduce to 0–180 range
          if (angleDiff > 180) angleDiff = 360 - angleDiff;
          const cancellationPass = angleDiff >= 160 && angleDiff <= 200 ? true
            : angleDiff >= 0 && angleDiff <= 180 ? (Math.abs(angleDiff - 180) <= 20) : false;
          phaseAlignment = {
            rowHz: nearestRow.frequencyHz,
            preAngleDeg,
            modAngleDeg,
            angleDiff,
            pass: cancellationPass,
          };
        }
      }
    }

    return {
      median,
      phaseAlignment,
      // 34 Hz
      hz34: {
        b44FreqHz:   hz34Best?.frequency ?? null,
        b44MagDb:    hz34Best?.spl ?? null,
        rewFreqHz:   T.hz34.featureFrequencyHz,
        rewMagDb:    T.hz34.featureMagnitudeDb,
      },
      // 40 Hz null
      hz40: {
        b44NullCentreHz:  hz40Null?.frequency ?? null,
        b44NullDepthDb:   hz40NullDepth,
        b44NullWidthHz:   hz40Width,
        rewNullCentreHz:  T.hz40.nullCentreHz,
        rewNullDepthDb:   T.hz40.nullDepthDb,
        rewNullWidthHz:   T.hz40.nullWidthHz,
      },
      // 68 Hz peak
      hz68: {
        b44PeakFreqHz:    hz68Peak?.frequency ?? null,
        b44ProminenceDb:  hz68Prominence,
        rewPeakFreqHz:    T.hz68.peakFrequencyHz,
        rewProminenceDb:  T.hz68.peakProminenceDb,
      },
      // Vector
      vector: {
        b44PhaseShiftDeg: b44PhaseShift,
        rewPhaseShiftDeg: T.vectorAtNull.phaseShiftDeg,
        phaseLow,
        phaseHigh,
        nullCentreHz,
      },
    };
  }, [b44Series, stepDebug]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!results) {
    return (
      <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', padding: 8 }}>
        No B44 curve data — run simulation first.
      </div>
    );
  }

  const r = results;
  const TOL_ = REW_TARGETS_CURRENT_ROOM.tolerances;
  const noRewData = T.hz40.nullDepthDb === null;

  // Compute pass/fail per region (null = no REW data yet)
  const check = (b44Val, rewVal, tol) => {
    if (!Number.isFinite(b44Val) || !Number.isFinite(rewVal)) return null;
    return Math.abs(b44Val - rewVal) <= tol;
  };

  const checks = {
    hz34Freq:   check(r.hz34.b44FreqHz,          r.hz34.rewFreqHz,         TOL_.featureFrequencyHz),
    hz34Mag:    check(r.hz34.b44MagDb,           r.hz34.rewMagDb,          TOL_.featureMagnitudeDb),
    hz40Centre: check(r.hz40.b44NullCentreHz,    r.hz40.rewNullCentreHz,   TOL_.featureFrequencyHz),
    hz40Depth:  check(r.hz40.b44NullDepthDb,     r.hz40.rewNullDepthDb,    TOL_.nullDepthDb),
    hz40Width:  check(r.hz40.b44NullWidthHz,     r.hz40.rewNullWidthHz,    TOL_.nullWidthHz),
    hz68Freq:   check(r.hz68.b44PeakFreqHz,      r.hz68.rewPeakFreqHz,     TOL_.featureFrequencyHz),
    hz68Prom:   check(r.hz68.b44ProminenceDb,    r.hz68.rewProminenceDb,   TOL_.featureMagnitudeDb),
    vector:     check(r.vector.b44PhaseShiftDeg, r.vector.rewPhaseShiftDeg, TOL_.phaseShiftDeg),
  };

  const allChecks = Object.values(checks);
  const withData  = allChecks.filter(v => v !== null);
  const passed    = withData.filter(Boolean).length;
  const total     = withData.length;
  const overallPass = total > 0 && passed === total;
  const headerColor = total === 0 ? '#64748b' : overallPass ? '#065f46' : '#991b1b';
  const headerBg    = total === 0 ? '#f8fafc'  : overallPass ? '#dcfce7' : '#fee2e2';

  const tableHeaderStyle = {
    textAlign: 'left', padding: '3px 6px', fontSize: 10,
    fontWeight: 700, color: '#374151', background: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
  };

  return (
    <div style={{ fontFamily: 'monospace' }}>

      {/* Overall verdict */}
      <div style={{
        padding: '6px 10px', borderRadius: 6, marginBottom: 10,
        background: headerBg, border: `1px solid ${headerColor}44`,
        color: headerColor, fontWeight: 700, fontSize: 12,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>REW-Parity Benchmark — Current Room</span>
        <span>
          {total === 0
            ? 'AWAITING REW DATA'
            : `${passed} / ${total} checks pass${overallPass ? ' ✓' : ' ✗'}`}
        </span>
      </div>

      {noRewData && (
        <div style={{ fontSize: 10, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '4px 8px', marginBottom: 8 }}>
          ⚠ REW target values not yet populated. Edit <strong>REW_TARGETS_CURRENT_ROOM</strong> in{' '}
          <code>RewParityBenchmark.jsx</code> with real measured values.
        </div>
      )}

      {/* Normalisation info */}
      <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 8 }}>
        B44 normalised: 40–80 Hz median = {results.median.toFixed(2)} dB subtracted. Null centre used: {r.vector.nullCentreHz.toFixed(2)} Hz.
      </div>

      {/* Table */}
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...tableHeaderStyle, width: '35%' }}>Check</th>
            <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>B44</th>
            <th style={{ ...tableHeaderStyle, textAlign: 'right', color: '#6b7280' }}>REW target</th>
            <th style={{ ...tableHeaderStyle, textAlign: 'right', color: '#6b7280' }}>Tol</th>
            <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Δ</th>
            <th style={{ ...tableHeaderStyle }}>Result</th>
          </tr>
        </thead>
        <tbody>
          {/* 34 Hz region */}
          <tr><td colSpan={6} style={{ padding: '4px 6px', fontSize: 10, fontWeight: 700, color: '#1e40af', background: '#eff6ff' }}>34 Hz region</td></tr>
          <ResultRow label="Feature frequency" b44={r.hz34.b44FreqHz}   rew={r.hz34.rewFreqHz}  tol={TOL_.featureFrequencyHz} unit=" Hz" />
          <ResultRow label="Feature magnitude" b44={r.hz34.b44MagDb}    rew={r.hz34.rewMagDb}   tol={TOL_.featureMagnitudeDb} unit=" dB" />

          {/* 40 Hz null */}
          <tr><td colSpan={6} style={{ padding: '4px 6px', fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff' }}>40 Hz region — null</td></tr>
          <ResultRow label="Null centre"        b44={r.hz40.b44NullCentreHz}  rew={r.hz40.rewNullCentreHz}  tol={TOL_.featureFrequencyHz} unit=" Hz" />
          <ResultRow label="Null depth"         b44={r.hz40.b44NullDepthDb}   rew={r.hz40.rewNullDepthDb}   tol={TOL_.nullDepthDb}        unit=" dB" />
          <ResultRow label="Null width @−10 dB" b44={r.hz40.b44NullWidthHz}   rew={r.hz40.rewNullWidthHz}   tol={TOL_.nullWidthHz}        unit=" Hz" />

          {/* 68 Hz region */}
          <tr><td colSpan={6} style={{ padding: '4px 6px', fontSize: 10, fontWeight: 700, color: '#065f46', background: '#ecfdf5' }}>68 Hz region</td></tr>
          <ResultRow label="Peak frequency"   b44={r.hz68.b44PeakFreqHz}   rew={r.hz68.rewPeakFreqHz}   tol={TOL_.featureFrequencyHz} unit=" Hz" />
          <ResultRow label="Peak prominence"  b44={r.hz68.b44ProminenceDb} rew={r.hz68.rewProminenceDb} tol={TOL_.featureMagnitudeDb} unit=" dB" />

          {/* Vector / phase */}
          <tr><td colSpan={6} style={{ padding: '4px 6px', fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fffbeb' }}>Vector behaviour at null</td></tr>
          <ResultRow
            label={`Phase shift (${r.vector.nullCentreHz.toFixed(1)}−2 → +2 Hz)`}
            b44={r.vector.b44PhaseShiftDeg}
            rew={r.vector.rewPhaseShiftDeg}
            tol={TOL_.phaseShiftDeg}
            unit="°"
          />
        </tbody>
      </table>

      {/* Phase detail */}
      {(Number.isFinite(r.vector.phaseLow) || Number.isFinite(r.vector.phaseHigh)) && (
        <div style={{ marginTop: 6, fontSize: 10, color: '#92400e' }}>
          Phase low ({(r.vector.nullCentreHz - 2).toFixed(1)} Hz):{' '}
          {Number.isFinite(r.vector.phaseLow) ? r.vector.phaseLow.toFixed(1) + '°' : '—'}
          {' | '}
          Phase high ({(r.vector.nullCentreHz + 2).toFixed(1)} Hz):{' '}
          {Number.isFinite(r.vector.phaseHigh) ? r.vector.phaseHigh.toFixed(1) + '°' : '—'}
        </div>
      )}

      {/* Phase alignment at REW null target */}
      <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: '#f8f0ff', border: '1px solid #d8b4fe' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#6d28d9', marginBottom: 6 }}>
          Phase alignment at REW null target
        </div>
        {results.phaseAlignment ? (() => {
          const pa = results.phaseAlignment;
          return (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                <tr>
                  <td style={{ fontSize: 10, color: '#374151', padding: '2px 6px' }}>Target frequency (REW)</td>
                  <td style={{ fontSize: 10, fontFamily: 'monospace', textAlign: 'right', padding: '2px 6px' }}>{T.hz40.nullCentreHz.toFixed(1)} Hz</td>
                  <td style={{ fontSize: 10, color: '#6b7280', padding: '2px 6px' }}>nearest row: {pa.rowHz.toFixed(2)} Hz</td>
                </tr>
                <tr>
                  <td style={{ fontSize: 10, color: '#374151', padding: '2px 6px' }}>Pre-modal angle</td>
                  <td style={{ fontSize: 10, fontFamily: 'monospace', textAlign: 'right', padding: '2px 6px' }}>{pa.preAngleDeg.toFixed(1)}°</td>
                  <td style={{ fontSize: 10, color: '#6b7280', padding: '2px 6px' }}>atan2(sumIm, sumRe) before modal</td>
                </tr>
                <tr>
                  <td style={{ fontSize: 10, color: '#374151', padding: '2px 6px' }}>Modal vector angle</td>
                  <td style={{ fontSize: 10, fontFamily: 'monospace', textAlign: 'right', padding: '2px 6px' }}>{pa.modAngleDeg.toFixed(1)}°</td>
                  <td style={{ fontSize: 10, color: '#6b7280', padding: '2px 6px' }}>atan2(modalSumIm, modalSumRe)</td>
                </tr>
                <tr>
                  <td style={{ fontSize: 10, color: '#374151', padding: '2px 6px' }}>Angle difference</td>
                  <td style={{ fontSize: 10, fontFamily: 'monospace', textAlign: 'right', padding: '2px 6px', fontWeight: 700 }}>{pa.angleDiff.toFixed(1)}°</td>
                  <td style={{ fontSize: 10, color: '#6b7280', padding: '2px 6px' }}>wrapped 0–180°</td>
                </tr>
                <tr>
                  <td style={{ fontSize: 10, color: '#374151', padding: '2px 6px' }}>Cancellation target</td>
                  <td style={{ fontSize: 10, fontFamily: 'monospace', textAlign: 'right', padding: '2px 6px' }}>180° ± 20°</td>
                  <td style={{ fontSize: 10, padding: '2px 6px' }}><Pill pass={pa.pass} /></td>
                </tr>
              </tbody>
            </table>
          );
        })() : (
          <div style={{ fontSize: 10, color: '#6b7280' }}>
            No stepDebug rows near {T.hz40.nullCentreHz.toFixed(1)} Hz — run simulation with modes enabled.
          </div>
        )}
      </div>

      {/* Tolerance key */}
      <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #e5e7eb', fontSize: 10, color: '#6b7280' }}>
        Tolerances: freq ±{TOL_.featureFrequencyHz} Hz · mag ±{TOL_.featureMagnitudeDb} dB ·
        null depth ±{TOL_.nullDepthDb} dB · null width ±{TOL_.nullWidthHz} Hz · phase ±{TOL_.phaseShiftDeg}°
      </div>
    </div>
  );
}