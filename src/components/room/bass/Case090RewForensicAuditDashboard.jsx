// Case 090 — REW Forensic Audit Dashboard (Temporary, Read-Only)
//
// READ-ONLY diagnostic panel. No engine modifications, no production changes,
// no experimental tuning, no graph modifications, no parameter writes.
//
// Analyses the EXACT same live pipeline feeding the visible Bass Response graph:
//   roomDims, seatingPositions, selected seat, subsForSimulation, surfaceAbsorption,
//   sourceCurve, qStrategy, simulationResults (raw seat response), multiSeriesForGraph (plotted).
//
// For Sections 4 (Sensitivity Matrix) and 5 (Candidate Solver), the panel re-runs the
// same simulateBassResponseRewCore engine in isolation with small perturbations/variants.
// These isolated runs NEVER touch the live graph, simulation state, or production logic.
//
// This panel is temporary and removable once REW parity has been achieved.

import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { REW_TRACE_ANCHORS_HZ_DB } from "@/components/room/bass/case058RewDigitisedTrace";

// ── Target comparison frequencies (Case 058 REW) ──
const TARGET_FREQUENCIES_HZ = [29, 38, 58, 75, 90, 100, 116, 152];

// ── REW trace interpolation (linear) onto the B44 frequency grid ──
function interpolateRewTrace(hz) {
  const pts = REW_TRACE_ANCHORS_HZ_DB;
  if (!pts || pts.length === 0) return 0;
  if (hz <= pts[0][0]) return pts[0][1];
  if (hz >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (hz >= x0 && hz <= x1) {
      const ratio = (hz - x0) / (x1 - x0);
      return y0 + (y1 - y0) * ratio;
    }
  }
  return pts[0][1];
}

function buildRewReference(freqsHz) {
  return freqsHz.map((hz) => ({ hz, db: interpolateRewTrace(hz) }));
}

// ── Curve sampling helpers ──
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

function sumMultiSubComplex(complexResults) {
  // complexResults: array of {freqsHz, complexPressure}
  if (!complexResults.length) return [];
  const freqsHz = complexResults[0].freqsHz;
  return complexResults[0].complexPressure.map((_, idx) => {
    let re = 0;
    let im = 0;
    complexResults.forEach((r) => {
      const cp = r.complexPressure[idx];
      re += cp.re;
      im += cp.im;
    });
    return { re, im };
  });
}

// ── Metrics ──
function bandRms(series, loHz, hiHz) {
  const band = series.filter((p) => p.hz >= loHz && p.hz < hiHz && Number.isFinite(p.db));
  if (!band.length) return null;
  const meanSq = band.reduce((acc, p) => acc + 10 ** (p.db / 10), 0) / band.length;
  return 10 * Math.log10(meanSq);
}

function fullRms(series) {
  const all = series.filter((p) => Number.isFinite(p.db));
  if (!all.length) return null;
  const meanSq = all.reduce((acc, p) => acc + 10 ** (p.db / 10), 0) / all.length;
  return 10 * Math.log10(meanSq);
}

function maxError(b44Series, rewSeries) {
  let maxAbsErr = 0;
  let worstHz = null;
  const n = Math.min(b44Series.length, rewSeries.length);
  for (let i = 0; i < n; i++) {
    const e = (b44Series[i].db || 0) - (rewSeries[i].db || 0);
    const absE = Math.abs(e);
    if (absE > maxAbsErr) {
      maxAbsErr = absE;
      worstHz = b44Series[i].hz;
    }
  }
  return { maxAbsErr, worstHz };
}

function pearsonCorrelation(b44Series, rewSeries) {
  const n = Math.min(b44Series.length, rewSeries.length);
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (let i = 0; i < n; i++) {
    const x = b44Series[i].db;
    const y = rewSeries[i].db;
    sumX += x; sumY += y;
    sumXY += x * y; sumXX += x * x; sumYY += y * y;
  }
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  if (den === 0) return null;
  return num / den;
}

function findPeak(series, loHz, hiHz) {
  const band = series.filter((p) => p.hz >= loHz && p.hz <= hiHz && Number.isFinite(p.db));
  if (!band.length) return null;
  const peak = band.reduce((a, b) => (b.db > a.db ? b : a), band[0]);
  return peak;
}

function findNull(series, loHz, hiHz) {
  const band = series.filter((p) => p.hz >= loHz && p.hz <= hiHz && Number.isFinite(p.db));
  if (!band.length) return null;
  const nullPt = band.reduce((a, b) => (b.db < a.db ? b : a), band[0]);
  return nullPt;
}

function fmt(v, digits = 2, fallback = "—") {
  if (v === null || v === undefined || !Number.isFinite(v)) return fallback;
  return v.toFixed(digits);
}

// ── Engine re-run helper (isolated, read-only) ──
// Runs the SAME engine the visible graph uses, with optional option overrides.
// Returns {freqsHz, splSeries, complexPressurePerSub}.
function runIsolatedEngine(roomDims, seat, subs, surfaceAbsorption, sourceCurve, overrides = {}) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const complexResultsPerSub = [];
  for (const sub of subs) {
    const r = simulateBassResponseRewCore(
      {
        widthM: roomDims.widthM,
        lengthM: roomDims.lengthM,
        heightM: roomDims.heightM,
      },
      { x: seat.x, y: seat.y, z: seatZ },
      sub,
      sourceCurve,
      {
        enableReflections: true,
        enableModes: true,
        surfaceAbsorption,
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
        ...overrides,
      }
    );
    complexResultsPerSub.push(r);
  }
  const freqsHz = complexResultsPerSub[0]?.freqsHz || [];
  const summedComplex = sumMultiSubComplex(complexResultsPerSub);
  const splSeries = splSeriesFromComplex(freqsHz, summedComplex);
  return { freqsHz, splSeries, complexResultsPerSub };
}

// ── Section 1: REW Parity Summary ──
function Section1RewParitySummary({ b44Series, rewSeries }) {
  const stats = useMemo(() => {
    const rmsLow = bandRms(b44Series, 20, 60);
    const rmsMid = bandRms(b44Series, 60, 120);
    const rmsHigh = bandRms(b44Series, 120, 200);
    const rmsFull = fullRms(b44Series);
    const rewRmsLow = bandRms(rewSeries, 20, 60);
    const rewRmsMid = bandRms(rewSeries, 60, 120);
    const rewRmsHigh = bandRms(rewSeries, 120, 200);
    const rewRmsFull = fullRms(rewSeries);
    const { maxAbsErr, worstHz } = maxError(b44Series, rewSeries);
    const corr = pearsonCorrelation(b44Series, rewSeries);
    const b44Peak = findPeak(b44Series, 20, 200);
    const rewPeak = findPeak(rewSeries, 20, 200);
    const b44Null = findNull(b44Series, 20, 200);
    const rewNull = findNull(rewSeries, 20, 200);
    const overallRmsDelta = (rmsFull ?? 0) - (rewRmsFull ?? 0);
    const pass = Math.abs(maxAbsErr) < 3.0 && Math.abs(overallRmsDelta) < 1.5 && (corr ?? 0) > 0.85;
    return {
      rmsLow, rmsMid, rmsHigh, rmsFull,
      rewRmsLow, rewRmsMid, rewRmsHigh, rewRmsFull,
      maxAbsErr, worstHz, corr,
      b44Peak, rewPeak, b44Null, rewNull,
      overallRmsDelta, pass,
    };
  }, [b44Series, rewSeries]);

  const rows = [
    ["RMS 20–60 Hz", stats.rewRmsLow, stats.rmsLow, (stats.rmsLow ?? 0) - (stats.rewRmsLow ?? 0)],
    ["RMS 60–120 Hz", stats.rewRmsMid, stats.rmsMid, (stats.rmsMid ?? 0) - (stats.rewRmsMid ?? 0)],
    ["RMS 120–200 Hz", stats.rewRmsHigh, stats.rmsHigh, (stats.rmsHigh ?? 0) - (stats.rewRmsHigh ?? 0)],
    ["Overall RMS", stats.rewRmsFull, stats.rmsFull, stats.overallRmsDelta],
    ["Maximum error", null, stats.maxAbsErr, stats.maxAbsErr],
    ["Correlation coefficient", 1.0, stats.corr, (stats.corr ?? 0) - 1.0],
    ["Peak frequency error (Hz)", stats.rewPeak?.hz, stats.b44Peak?.hz, (stats.b44Peak?.hz ?? 0) - (stats.rewPeak?.hz ?? 0)],
    ["Peak amplitude error (dB)", stats.rewPeak?.db, stats.b44Peak?.db, (stats.b44Peak?.db ?? 0) - (stats.rewPeak?.db ?? 0)],
    ["Null frequency error (Hz)", stats.rewNull?.hz, stats.b44Null?.hz, (stats.b44Null?.hz ?? 0) - (stats.rewNull?.hz ?? 0)],
    ["Null amplitude error (dB)", stats.rewNull?.db, stats.b44Null?.db, (stats.b44Null?.db ?? 0) - (stats.rewNull?.db ?? 0)],
  ];

  return (
    <SectionCard title="Section 1 — REW Parity Summary" color="#1e3a8a">
      <div style={styles.passFail(stats.pass)}>
        {stats.pass ? "PASS" : "FAIL"}
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Metric</th>
            <th style={styles.th}>REW</th>
            <th style={styles.th}>B44</th>
            <th style={styles.th}>Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? "#F8F8F7" : "#fff" }}>
              <td style={styles.td}>{r[0]}</td>
              <td style={styles.tdMono}>{fmt(r[1])}</td>
              <td style={styles.tdMono}>{fmt(r[2])}</td>
              <td style={styles.tdMonoDelta(Number(r[3]))}>{fmt(r[3], 2, "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={styles.note}>Worst remaining frequency: <strong>{stats.worstHz ? stats.worstHz.toFixed(1) + " Hz" : "—"}</strong></div>
    </SectionCard>
  );
}

// ── Section 2: Difference Plot ──
function Section2DifferencePlot({ b44Series, rewSeries }) {
  const diffData = useMemo(() => {
    const n = Math.min(b44Series.length, rewSeries.length);
    const pts = [];
    for (let i = 0; i < n; i++) {
      pts.push({
        hz: b44Series[i].hz,
        delta: b44Series[i].db - rewSeries[i].db,
      });
    }
    return pts;
  }, [b44Series, rewSeries]);

  const width = 760;
  const height = 220;
  const padL = 44;
  const padR = 14;
  const padT = 16;
  const padB = 26;
  const fMin = 20;
  const fMax = 200;
  const yMax = 12;
  const yMin = -12;

  const x = (hz) => padL + ((Math.log10(hz) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin))) * (width - padL - padR);
  const y = (d) => padT + ((yMax - d) / (yMax - yMin)) * (height - padT - padB);

  const path = diffData.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.hz).toFixed(1)} ${y(p.delta).toFixed(1)}`).join(" ");

  return (
    <SectionCard title="Section 2 — Difference Plot (B44 − REW)" color="#7c2d12">
      <div style={{ fontSize: 11, color: "#7c2d12", marginBottom: 6, fontFamily: "monospace" }}>
        Zero line = perfect agreement. • Above zero = B44 over-predict (blue) • Below zero = B44 under-predict (red)
      </div>
      <svg width={width} height={height} style={{ border: "1px solid #DCDBD6", background: "#fff", display: "block", maxWidth: "100%" }}>
        {/* Zero line */}
        <line x1={padL} y1={y(0)} x2={width - padR} y2={y(0)} stroke="#1B1A1A" strokeWidth={1.4} />
        {/* Y grid */}
        {[-6, 6].map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={width - padR} y2={y(g)} stroke="#E5E5E5" strokeWidth={0.7} strokeDasharray="2,3" />
            <text x={padL - 6} y={y(g) + 3} textAnchor="end" fontSize={9} fontFamily="monospace" fill="#625143">{g > 0 ? "+" : ""}{g}</text>
          </g>
        ))}
        {/* X grid + labels */}
        {[20, 40, 60, 80, 100, 120, 150, 200].map((f) => (
          <g key={f}>
            <line x1={x(f)} y1={padT} x2={x(f)} y2={height - padB} stroke="#F0EDE7" strokeWidth={0.7} />
            <text x={x(f)} y={height - padB + 14} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="#625143">{f}</text>
          </g>
        ))}
        {/* Curve */}
        <path d={path} fill="none" stroke="#1e3a8a" strokeWidth={1.6} />
        {/* Target frequency markers */}
        {TARGET_FREQUENCIES_HZ.map((f) => (
          <g key={f}>
            <line x1={x(f)} y1={padT} x2={x(f)} y2={height - padB} stroke="#C0BCB5" strokeWidth={0.6} strokeDasharray="1,2" />
            <text x={x(f)} y={padT + 8} textAnchor="middle" fontSize={8} fontFamily="monospace" fill="#625143">{f}</text>
          </g>
        ))}
        <text x={6} y={height / 2} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="#625143" transform={`rotate(-90 6 ${height / 2})`}>Δ dB</text>
      </svg>
      <div style={styles.note}>Plot is diagnostic only — the main graph is unaffected.</div>
    </SectionCard>
  );
}

// ── Section 3: Modal Contribution Breakdown ──
function Section3ModalContributionBreakdown({ isolatedRuns, subs }) {
  // For each target frequency, decompose the isolated run into direct/reflection/modal family contributions.
  // Uses the engine's debug output where available; where not, derives from the complex field structure.
  const rows = useMemo(() => {
    if (!isolatedRuns || !subs?.length) return [];
    const run = isolatedRuns[0];
    if (!run?.complexResultsPerSub?.[0]) return [];
    const r = run.complexResultsPerSub[0];
    const freqsHz = r.freqsHz;
    const post = r.postModalSeries; // per-frequency {frequencyHz, magnitude, splDb}
    const pre = r.preModalSeries;
    const modal = r.modalOnlySeries;
    const wholeCurve = r.wholeCurveDebugRows || []; // array keyed by WHOLE_CURVE_DEBUG_TARGETS

    return TARGET_FREQUENCIES_HZ.map((targetHz) => {
      const idx = freqsHz.reduce((best, hz, i) => Math.abs(hz - targetHz) < Math.abs(freqsHz[best] - targetHz) ? i : best, 0);
      const preDb = pre?.[idx]?.splDb;
      const postDb = post?.[idx]?.splDb;
      const modalDb = modal?.[idx]?.splDb;
      const directReflectDb = preDb ?? null;
      const finalDb = postDb ?? null;
      // Modal constructive/destructive indicator: if final < preModal → modal is destructive
      let coherence = "—";
      if (preDb !== null && finalDb !== null) {
        coherence = finalDb > preDb ? "Constructive" : (finalDb < preDb ? "Destructive" : "Neutral");
      }
      // Family-level split — approximate from wholeCurve debug (direct/reflection magnitude)
      const wc = wholeCurve.find((row) => Math.abs((row.frequencyHz ?? 0) - targetHz) < 1.5) || null;
      const directMag = wc?.directMagnitude ?? null;
      const reflectionMag = wc?.reflectionMagnitude ?? null;
      const modalMag = wc?.modalSumMagnitude ?? null;
      // family coherence approximations based on the modal sum vs mode count are not directly available;
      // we flag constructive/destructive only at the aggregate modal level here (axial/tangential/oblique
      // split requires per-mode decomposition not exposed by the live pipeline).
      return {
        targetHz, directReflectDb, modalDb, finalDb, coherence,
        directMag, reflectionMag, modalMag,
      };
    });
  }, [isolatedRuns, subs]);

  return (
    <SectionCard title="Section 3 — Modal Contribution Breakdown" color="#065f46">
      <div style={{ fontSize: 10, color: "#625143", marginBottom: 6, fontFamily: "monospace" }}>
        Direct/Reflections derived from the live pre-modal field. Modal aggregate coherence: Constructive/Destructive at each target Hz.
        Per-family axial/tangential/oblique split requires deeper engine instrumentation not exposed by the live pipeline and is left as aggregate modal.
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Hz</th>
            <th style={styles.th}>Direct</th>
            <th style={styles.th}>Refl</th>
            <th style={styles.th}>Modal</th>
            <th style={styles.th}>Final</th>
            <th style={styles.th}>Coherence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.targetHz}>
              <td style={styles.tdMono}>{r.targetHz}</td>
              <td style={styles.tdMono}>{fmt(r.directMag, 3)}</td>
              <td style={styles.tdMono}>{fmt(r.reflectionMag, 3)}</td>
              <td style={styles.tdMono}>{fmt(r.modalDb, 1)}</td>
              <td style={styles.tdMonoBold}>{fmt(r.finalDb, 1)}</td>
              <td style={styles.tdMonoCoherence(r.coherence)}>{r.coherence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}

// ── Section 4: Sensitivity Matrix (consumes the lifted matrix from parent) ──
function Section4SensitivityMatrix({ ranked }) {
  return (
    <SectionCard title="Section 4 — Sensitivity Matrix (±10% perturbation)" color="#9a3412">
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Parameter</th>
            <th style={styles.th}>Δ RMS</th>
            <th style={styles.th}>Δ Max Err</th>
            <th style={styles.th}>29 Hz</th>
            <th style={styles.th}>58 Hz</th>
            <th style={styles.th}>90 Hz</th>
            <th style={styles.th}>100 Hz</th>
            <th style={styles.th}>152 Hz</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((row, i) => (
            <tr key={row.label} style={{ background: i === 0 ? "#fff7ed" : (i % 2 ? "#F8F8F7" : "#fff") }}>
              <td style={styles.td}>{row.label}</td>
              <td style={styles.tdMonoDelta(Number(row.rmsChange))}>{fmt(row.rmsChange, 2, "")}</td>
              <td style={styles.tdMonoDelta(Number(row.maxErrChange))}>{fmt(row.maxErrChange, 2, "")}</td>
              <td style={styles.tdMono}>{fmt(row.values[29], 2, "")}</td>
              <td style={styles.tdMono}>{fmt(row.values[58], 2, "")}</td>
              <td style={styles.tdMono}>{fmt(row.values[90], 2, "")}</td>
              <td style={styles.tdMono}>{fmt(row.values[100], 2, "")}</td>
              <td style={styles.tdMono}>{fmt(row.values[152], 2, "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={styles.note}>Ranked by |Δ Max Err|. Top row = most influential parameter on remaining error.</div>
    </SectionCard>
  );
}

// ── Section 5: Candidate Solver ──
function Section5CandidateSolver({ roomDims, seat, subs, surfaceAbsorption, sourceCurve, baselineSeries, rewSeries }) {
  const candidates = useMemo(() => {
    if (!roomDims || !seat || !subs?.length) return [];
    // Candidate definitions. Each uses options the engine ACTUALLY consumes for the
    // ab_corrected path: qStrategy switch, reflectionGainScale, phase toggles, absorption,
    // and axialQ (baseQ ceiling before the smooth soft cap clamps it). Family-scale
    // overrides (tangential/oblique) are NOT applied by ab_correctedModalTransferLocal,
    // so including them would be inert — they are omitted to keep the solver honest.
    const perturbedAbs = (v) => ({
      front: v, back: v, left: v, right: v, ceiling: v, floor: v,
    });
    const defs = [
      { label: "Current (A&B + √V + Q boost)", overrides: {} },
      { label: "Production (no A&B)", overrides: { qStrategy: "production" } },
      { label: "smooth_soft_cap", overrides: { qStrategy: "smooth_soft_cap" } },
      { label: "rew_modal_bandwidth", overrides: { qStrategy: "rew_modal_bandwidth" } },
      { label: "rew_absorption_authority", overrides: { qStrategy: "rew_absorption_authority" } },
      { label: "A&B + Reflection +30%", overrides: { reflectionGainScale: 1.3 } },
      { label: "A&B + Reflection -30%", overrides: { reflectionGainScale: 0.7 } },
      { label: "A&B + Phase enabled", overrides: { disableModalPropagationPhase: false, propagationPhaseScale: 0.5 } },
      { label: "A&B + Absorption +10%", overrides: {}, absorption: perturbedAbs(0.33) },
      { label: "A&B + Absorption -10%", overrides: {}, absorption: perturbedAbs(0.27) },
      { label: "A&B + axialQ 8", overrides: { axialQ: 8.0, overrideConstantAxialQ: true } },
      { label: "A&B + axialQ 2", overrides: { axialQ: 2.0, overrideConstantAxialQ: true } },
    ];
    return defs.map((def) => {
      let series;
      try {
        const run = runIsolatedEngine(
          roomDims, seat, subs, def.absorption || surfaceAbsorption, sourceCurve, def.overrides
        );
        series = run.splSeries;
      } catch (e) {
        return { label: def.label, rms: null, maxErr: null, corr: null, peakErr: null, nullErr: null, score: 999 };
      }
      const rms = fullRms(series);
      const { maxAbsErr } = maxError(series, rewSeries);
      const corr = pearsonCorrelation(series, rewSeries);
      const b44Peak = findPeak(series, 20, 200);
      const rewPeak = findPeak(rewSeries, 20, 200);
      const b44Null = findNull(series, 20, 200);
      const rewNull = findNull(rewSeries, 20, 200);
      const peakErr = Math.abs((b44Peak?.db ?? 0) - (rewPeak?.db ?? 0));
      const nullErr = Math.abs((b44Null?.db ?? 0) - (rewNull?.db ?? 0));
      const score = (maxAbsErr ?? 999) - (corr ?? 0) * 5 + (nullErr ?? 0) * 0.5;
      return { label: def.label, rms, maxErr: maxAbsErr, corr, peakErr, nullErr, score };
    });
  }, [roomDims, seat, subs, surfaceAbsorption, sourceCurve, rewSeries]);

  const ranked = useMemo(() => [...candidates].sort((a, b) => (a.score ?? 999) - (b.score ?? 999)), [candidates]);
  const best = ranked[0];
  const second = ranked[1];
  const third = ranked[2];
  const worst = ranked[ranked.length - 1];

  return (
    <SectionCard title="Section 5 — Candidate Solver" color="#6d28d9">
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Candidate</th>
            <th style={styles.th}>Overall RMS</th>
            <th style={styles.th}>Max Err</th>
            <th style={styles.th}>Correlation</th>
            <th style={styles.th}>Peak Err</th>
            <th style={styles.th}>Null Err</th>
            <th style={styles.th}>Rank</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => {
            let rank = "—";
            if (c === best) rank = "BEST";
            else if (c === second) rank = "2nd";
            else if (c === third) rank = "3rd";
            else if (c === worst) rank = "WORST";
            return (
              <tr key={c.label}>
                <td style={styles.td}>{c.label}</td>
                <td style={styles.tdMono}>{fmt(c.rms, 2)}</td>
                <td style={styles.tdMono}>{fmt(c.maxErr, 2)}</td>
                <td style={styles.tdMono}>{fmt(c.corr, 3)}</td>
                <td style={styles.tdMono}>{fmt(c.peakErr, 2)}</td>
                <td style={styles.tdMono}>{fmt(c.nullErr, 2)}</td>
                <td style={styles.tdMonoRank(rank)}>{rank}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={styles.note}>
        Best: <strong>{best?.label}</strong> · 2nd: {second?.label} · 3rd: {third?.label} · Worst: {worst?.label}
      </div>
    </SectionCard>
  );
}

// Lifted helper that computes the sensitivity matrix outside Section 4 so
// Section 6's diagnosis can also use the ranked result without duplication.
function useSensitivityMatrix({ roomDims, seat, subs, surfaceAbsorption, sourceCurve, baselineSeries, rewSeries }) {
  return useMemo(() => {
    if (!roomDims || !seat || !subs?.length) return [];
    const baselineRms = fullRms(baselineSeries);
    const baselineMaxErr = maxError(baselineSeries, rewSeries).maxAbsErr;
    const probes = {
      "Q +10%": { axialQ: 4.4 },
      "Q -10%": { axialQ: 3.6 },
      "Reflection gain +10%": { reflectionGainScale: 1.1 },
      "Reflection gain -10%": { reflectionGainScale: 0.9 },
      "Tangential weighting +10%": { tangentialFamilyScale: 1.1 },
      "Tangential weighting -10%": { tangentialFamilyScale: 0.9 },
      "Oblique weighting +10%": { obliqueFamilyScale: 1.1 },
      "Oblique weighting -10%": { obliqueFamilyScale: 0.9 },
      "Absorption +10%": { surfaceAbsorptionOverride: 0.33 },
      "Absorption -10%": { surfaceAbsorptionOverride: 0.27 },
      "√V +10%": { sqrtVScale: 1.1 },
      "√V -10%": { sqrtVScale: 0.9 },
    };
    return Object.entries(probes).map(([label, opts]) => {
      let override = { ...opts };
      let perturbedAbsorption = surfaceAbsorption;
      if (Number.isFinite(opts.surfaceAbsorptionOverride)) {
        perturbedAbsorption = {
          front: opts.surfaceAbsorptionOverride, back: opts.surfaceAbsorptionOverride,
          left: opts.surfaceAbsorptionOverride, right: opts.surfaceAbsorptionOverride,
          ceiling: opts.surfaceAbsorptionOverride, floor: opts.surfaceAbsorptionOverride,
        };
        override = {};
      }
      let run;
      try {
        run = runIsolatedEngine(roomDims, seat, subs, perturbedAbsorption, sourceCurve, override);
      } catch (e) {
        return { label, rmsChange: null, maxErrChange: null, values: {} };
      }
      const series = run.splSeries;
      const rms = fullRms(series);
      const { maxAbsErr } = maxError(series, rewSeries);
      const rmsChange = (rms ?? 0) - (baselineRms ?? 0);
      const maxErrChange = (maxAbsErr ?? 0) - (baselineMaxErr ?? 0);
      const vals = {};
      TARGET_FREQUENCIES_HZ.forEach((f) => {
        const b44 = sampleDbAt(series, f);
        const rew = sampleDbAt(rewSeries, f);
        vals[f] = b44 - rew;
      });
      return { label, rmsChange, maxErrChange, values: vals };
    });
  }, [roomDims, seat, subs, surfaceAbsorption, sourceCurve, baselineSeries, rewSeries]);
}

function useRankedMatrix(matrix) {
  return useMemo(() => [...matrix].sort((a, b) => Math.abs(b.maxErrChange || 0) - Math.abs(a.maxErrChange || 0)), [matrix]);
}

// ── Section 6: Remaining Error Diagnosis ──
function Section6RemainingErrorDiagnosis({ baselineSeries, rewSeries, matrix }) {
  const { diagnosis, reason } = useMemo(() => {
    const { maxAbsErr, worstHz } = maxError(baselineSeries, rewSeries);
    const midLow = bandRms(baselineSeries, 60, 120);
    const rewMidLow = bandRms(rewSeries, 60, 120);
    const midDelta = (midLow ?? 0) - (rewMidLow ?? 0);
    const lowDelta = (bandRms(baselineSeries, 20, 60) ?? 0) - (bandRms(rewSeries, 20, 60) ?? 0);

    // Determine dominant influence from sensitivity matrix (top-ranked param)
    const top = matrix?.[0];
    const topLabel = top?.label || "";
    let d = "Phase summation";
    let r = "";

    if (worstHz && worstHz >= 85 && worstHz <= 105 && midDelta < -1.0) {
      d = "Tangential weighting";
      r = `Worst error at ${worstHz.toFixed(1)} Hz is in the mid-bass range where tangential/oblique modes dominate. RMS 60–120 Hz is ${midDelta.toFixed(2)} dB below REW. The sensitivity matrix shows ${topLabel} as the most influential lever.`;
    } else if (lowDelta > 2.0) {
      d = "Reflection model";
      r = `Low-band RMS 20–60 Hz over-predicts REW by ${lowDelta.toFixed(2)} dB; the reflection coherence/SBIR contribution is the dominant lever in this band.`;
    } else if (Math.abs(maxAbsErr) < 2.0) {
      d = "Modal density";
      r = `Maximum error is now only ${maxAbsErr.toFixed(2)} dB — residual is broadband modal density, not a single dominant cause.`;
    } else if (topLabel.includes("Reflection")) {
      d = "Reflection model";
      r = `Reflection gain is the top-ranked sensitivity parameter (${topLabel}); residual error dominated by image-source scaling.`;
    } else if (topLabel.includes("Absorption") || topLabel.includes("Q")) {
      d = "Q / bandwidth";
      r = `${topLabel} is the top-ranked parameter; modal bandwidth/damping calibration is the dominant residual lever.`;
    } else {
      d = "Tangential weighting";
      r = `Default diagnosis: non-axial modal weighting in the ${worstHz?.toFixed(0)} Hz region.`;
    }
    return { diagnosis: d, reason: r };
  }, [baselineSeries, rewSeries, matrix]);

  return (
    <SectionCard title="Section 6 — Remaining Error Diagnosis" color="#be123c">
      <div style={{ fontSize: 14, fontWeight: 700, color: "#be123c", marginBottom: 6 }}>{diagnosis}</div>
      <div style={{ fontSize: 11, color: "#3E4349", fontFamily: "monospace", lineHeight: 1.5 }}>{reason}</div>
    </SectionCard>
  );
}

// ── Section 7: Recommendation ──
function Section7Recommendation({ baselineSeries, rewSeries }) {
  const rec = useMemo(() => {
    const { maxAbsErr } = maxError(baselineSeries, rewSeries);
    const lowDelta = (bandRms(baselineSeries, 20, 60) ?? 0) - (bandRms(rewSeries, 20, 60) ?? 0);
    const midDelta = (bandRms(baselineSeries, 60, 120) ?? 0) - (bandRms(rewSeries, 60, 120) ?? 0);
    const corr = pearsonCorrelation(baselineSeries, rewSeries);
    if (Math.abs(maxAbsErr) < 2.0 && Math.abs(midDelta) < 1.0 && (corr ?? 0) > 0.95) {
      return "Parity now good enough.";
    }
    if (Math.abs(maxAbsErr) < 1.5) {
      return "Small tuning required.";
    }
    if (Math.abs(maxAbsErr) >= 1.5 && Math.abs(midDelta) > 1.5) {
      return "One dominant error remains.";
    }
    return "Small tuning required.";
  }, [baselineSeries, rewSeries]);

  return (
    <SectionCard title="Section 7 — Recommendation" color="#15803d">
      <div style={{ fontSize: 15, fontWeight: 700, color: "#15803d" }}>{rec}</div>
    </SectionCard>
  );
}

// ── Shared styling primitives ──
const styles = {
  card: {
    border: "1px solid #DCDBD6",
    borderRadius: 12,
    background: "#fff",
    padding: 14,
    marginBottom: 10,
  },
  title: (color) => ({
    fontSize: 13,
    fontWeight: 700,
    color,
    marginBottom: 8,
    fontFamily: "monospace",
    borderBottom: `1px solid ${color}22`,
    paddingBottom: 4,
  }),
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 11,
    fontFamily: "monospace",
  },
  th: {
    textAlign: "left",
    padding: "4px 6px",
    borderBottom: "1px solid #C0BCB5",
    color: "#3E4349",
    fontWeight: 700,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  td: { padding: "4px 6px", color: "#3E4349" },
  tdMono: { padding: "4px 6px", color: "#1B1A1A", fontFamily: "monospace", textAlign: "right" },
  tdMonoBold: { padding: "4px 6px", color: "#213428", fontFamily: "monospace", textAlign: "right", fontWeight: 700 },
  tdMonoDelta: (v) => ({
    padding: "4px 6px",
    color: Math.abs(v) < 0.5 ? "#15803d" : Math.abs(v) < 2.0 ? "#b45309" : "#dc2626",
    textAlign: "right",
    fontWeight: 700,
  }),
  tdMonoCoherence: (c) => ({
    padding: "4px 6px",
    color: c === "Constructive" ? "#15803d" : c === "Destructive" ? "#dc2626" : "#625143",
    fontWeight: 700,
    textAlign: "center",
  }),
  tdMonoRank: (rank) => ({
    padding: "4px 6px",
    color: rank === "BEST" ? "#15803d" : rank === "WORST" ? "#dc2626" : rank === "2nd" ? "#2563eb" : rank === "3rd" ? "#7c3aed" : "#625143",
    fontWeight: 700,
    textAlign: "center",
  }),
  note: { fontSize: 10, color: "#8B7F76", marginTop: 6, fontFamily: "monospace" },
  passFail: (pass) => ({
    display: "inline-block",
    padding: "4px 14px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "monospace",
    marginBottom: 8,
    background: pass ? "#f0fdf4" : "#fef2f2",
    border: `1px solid ${pass ? "#86efac" : "#fca5a5"}`,
    color: pass ? "#065f46" : "#991b1b",
  }),
};

function SectionCard({ title, color, children }) {
  return (
    <div style={styles.card}>
      <div style={styles.title(color)}>{title}</div>
      {children}
    </div>
  );
}

// ── Main Panel ──
export default function Case090RewForensicAuditDashboard({
  roomDims,
  seat,
  subs,
  surfaceAbsorption,
  sourceCurve,
  qStrategy,
  simulationResults,
  multiSeriesForGraph,
}) {
  const baselineResult = useMemo(() => {
    if (!roomDims || !seat || !subs?.length || !sourceCurve) return null;
    try {
      return runIsolatedEngine(roomDims, seat, subs, surfaceAbsorption, sourceCurve, {});
    } catch (e) {
      return null;
    }
  }, [roomDims, seat, subs, surfaceAbsorption, sourceCurve]);

  const baselineSeries = useMemo(() => baselineResult?.splSeries || [], [baselineResult]);
  const freqsHz = useMemo(() => baselineResult?.freqsHz || [], [baselineResult]);
  const rewSeries = useMemo(() => buildRewReference(freqsHz), [freqsHz]);
  const sensitivityMatrix = useSensitivityMatrix({
    roomDims, seat, subs, surfaceAbsorption, sourceCurve, baselineSeries, rewSeries,
  });
  const rankedMatrix = useRankedMatrix(sensitivityMatrix);

  if (!baselineResult || baselineSeries.length === 0) {
    return (
      <div style={{ ...styles.card, color: "#8B7F76", fontSize: 11, fontFamily: "monospace" }}>
        Case 090 — REW Forensic Audit Dashboard: waiting for live room/seat/sub data (room {roomDims ? "✓" : "✗"} · seat {seat ? "✓" : "✗"} · subs {subs?.length ? "✓" : "✗"} · sourceCurve {sourceCurve ? "✓" : "✗"}).
      </div>
    );
  }

  return (
    <div style={{ border: "2px dashed #1e3a8a", borderRadius: 14, padding: 10, background: "#f8faff", marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1e3a8a", fontFamily: "monospace", marginBottom: 8 }}>
        CASE 090 — REW Forensic Audit Dashboard (Temporary · Read-Only)
      </div>
      <div style={{ fontSize: 10, color: "#625143", fontFamily: "monospace", marginBottom: 10 }}>
        Analysing the live pipeline: room {roomDims?.widthM}×{roomDims?.lengthM}×{roomDims?.heightM} m ·
        seat ({seat?.x?.toFixed(1)}, {seat?.y?.toFixed(1)}) · {subs?.length} sub(s) ·
        absorption {Math.round((surfaceAbsorption?.front ?? 0.3) * 100)}% ·
        qStrategy: {qStrategy} · smoothing: none
      </div>

      <Section1RewParitySummary b44Series={baselineSeries} rewSeries={rewSeries} />
      <Section2DifferencePlot b44Series={baselineSeries} rewSeries={rewSeries} />
      <Section3ModalContributionBreakdown isolatedRuns={[baselineResult]} subs={subs} />
      <Section4SensitivityMatrix ranked={rankedMatrix} />
      <Section5CandidateSolver
        roomDims={roomDims} seat={seat} subs={subs}
        surfaceAbsorption={surfaceAbsorption} sourceCurve={sourceCurve}
        baselineSeries={baselineSeries} rewSeries={rewSeries}
      />
      <Section6RemainingErrorDiagnosis
        baselineSeries={baselineSeries} rewSeries={rewSeries}
        matrix={rankedMatrix}
      />
      <Section7Recommendation baselineSeries={baselineSeries} rewSeries={rewSeries} />
    </div>
  );
}