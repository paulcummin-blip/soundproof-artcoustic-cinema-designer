import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";

// Case 072 / 077 — A&B Corrected Runtime Verification (temporary, read-only).
// Post-Case077: uses LIVE room/seat/sub/absorption/source-curve passed from BassResponse.jsx
// (the same data that feeds the visible Bass Response graph) — no hardcoded room.
//
// Compares three data sources, all on the LIVE project geometry:
//   A — Case 071-style external A&B recomputation (production qStrategy + external modal term)
//   B — live ab_corrected engine result (raw seat response feeding the graph, pre-smoothing)
//   C — actual plotted graph series (multiSeriesForGraph[0].data, post-smoothing)
//
// No equations, scaling, Q, geometry, or smoothing are changed. This panel only READS engine
// output and displays it. Rendered only when qStrategy === 'ab_corrected'.

const C = 343;
const TARGET_FREQS = [20, 29, 38, 58, 75, 100, 152];

// Case 071 Variant B options (flat-mode engine options, external A&B modal replacement)
const ENGINE_OPTIONS_CASE071 = {
  enableReflections: true,
  enableModes: true,
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

function fmt(v, d = 4) {
  if (!Number.isFinite(v)) return "—";
  return Number(v).toFixed(d);
}

function findNearestFreqIndex(freqsHz, target) {
  if (!Array.isArray(freqsHz) || freqsHz.length === 0) return 0;
  let bestIdx = 0;
  let bestDist = Math.abs(freqsHz[0] - target);
  for (let i = 1; i < freqsHz.length; i++) {
    const dist = Math.abs(freqsHz[i] - target);
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  }
  return bestIdx;
}

// Interpolate source curve dB at a given frequency (linear between bracketing points)
function sourceCurveDbAt(sourceCurve, hz) {
  if (!Array.isArray(sourceCurve) || sourceCurve.length === 0) return 94;
  if (hz <= sourceCurve[0].hz) return sourceCurve[0].db;
  const last = sourceCurve[sourceCurve.length - 1];
  if (hz >= last.hz) return last.db;
  for (let i = 0; i < sourceCurve.length - 1; i++) {
    const p0 = sourceCurve[i], p1 = sourceCurve[i + 1];
    if (hz >= p0.hz && hz <= p1.hz) {
      const t = p1.hz === p0.hz ? 0 : (hz - p0.hz) / (p1.hz - p0.hz);
      return p0.db + t * (p1.db - p0.db);
    }
  }
  return last.db;
}

// Case 071 Variant B — external A&B recomputation on LIVE geometry.
// Loops over all live subs and sums complex pressure, mirroring the graph path's multi-sub
// summation in BassResponse.jsx. Modal term is reconstructed externally from the engine's
// per-frequency contributor debug series; direct + reflection come from perFrequencyVectorDebug.
function runCase071VariantB(roomDims, seat, subs, surfaceAbsorption, sourceCurve) {
  const V = roomDims.widthM * roomDims.lengthM * roomDims.heightM;
  const optionsBase = { ...ENGINE_OPTIONS_CASE071, surfaceAbsorption };
  let freqsHz = null;
  let sumRe = null;
  let sumIm = null;

  subs.forEach((sub) => {
    const engineResult = simulateBassResponseRewCore(roomDims, seat, sub, sourceCurve, optionsBase);
    const { freqsHz: fH, perFrequencyVectorDebug, activeModalContributorDebugSeries } = engineResult;
    if (!freqsHz) {
      freqsHz = fH;
      sumRe = new Array(fH.length).fill(0);
      sumIm = new Array(fH.length).fill(0);
    }
    fH.forEach((frequencyHz, i) => {
      const preRow = perFrequencyVectorDebug[i];
      const contributorRow = activeModalContributorDebugSeries[i];
      const k = (2 * Math.PI * frequencyHz) / C;
      let modalRe = 0, modalIm = 0;
      (contributorRow?.contributors || []).forEach((cc) => {
        const f0 = cc.modeFrequencyHz, q = cc.qValue, coupling = cc.combinedCoupling;
        const kr = (2 * Math.PI * f0) / C;
        const realDen = kr * kr - k * k;
        const imagDen = (k * kr) / Math.max(q, 1e-6);
        const denomSq = realDen * realDen + imagDen * imagDen;
        const sUnit = Math.pow(10, sourceCurveDbAt(sourceCurve, frequencyHz) / 20);
        const gain = sUnit * coupling * (1 / V);
        modalRe += gain * (realDen / denomSq);
        modalIm += gain * (-imagDen / denomSq);
      });
      sumRe[i] += preRow.directRe + preRow.reflectionRe + modalRe;
      sumIm[i] += preRow.directIm + preRow.reflectionIm + modalIm;
    });
  });

  const rows = freqsHz.map((frequencyHz, i) => {
    const finalDb = 20 * Math.log10(Math.max(Math.sqrt(sumRe[i] * sumRe[i] + sumIm[i] * sumIm[i]), 1e-10));
    return { frequencyHz, finalDb };
  });
  return { freqsHz, rows };
}

export default function Case072AbCorrectedRuntimeVerification({
  roomDims, seat, subs, surfaceAbsorption, sourceCurve, qStrategy, graphData, rawSeatResponse,
}) {
  const { comparison, firstDivergence, ready, headerInfo } = useMemo(() => {
    const hasInputs = roomDims && roomDims.widthM && roomDims.lengthM && roomDims.heightM
      && seat && Array.isArray(subs) && subs.length > 0
      && Array.isArray(sourceCurve) && sourceCurve.length > 0
      && rawSeatResponse && Array.isArray(rawSeatResponse.freqsHz) && Array.isArray(rawSeatResponse.splDb)
      && Array.isArray(graphData) && graphData.length > 0;

    if (!hasInputs) {
      return { comparison: [], firstDivergence: null, ready: false, headerInfo: null };
    }

    const case071 = runCase071VariantB(roomDims, seat, subs, surfaceAbsorption, sourceCurve);

    const graphFreqs = graphData.map((p) => p.frequency);
    const comparison = TARGET_FREQS.map((targetHz) => {
      const idxA = findNearestFreqIndex(case071.freqsHz, targetHz);
      const idxB = findNearestFreqIndex(rawSeatResponse.freqsHz, targetHz);
      const idxC = findNearestFreqIndex(graphFreqs, targetHz);
      const aDb = case071.rows[idxA]?.finalDb;
      const bDb = rawSeatResponse.splDb[idxB];
      const cDb = graphData[idxC]?.spl;
      return {
        targetHz,
        aDb, bDb, cDb,
        abDelta: Number.isFinite(aDb) && Number.isFinite(bDb) ? aDb - bDb : null,
        bcDelta: Number.isFinite(bDb) && Number.isFinite(cDb) ? bDb - cDb : null,
      };
    });

    // Stop at first B-C divergence
    const tolerance = 0.01;
    let firstDivergence = null;
    for (const cmp of comparison) {
      if (cmp.bcDelta === null || Math.abs(cmp.bcDelta) > tolerance) {
        firstDivergence = {
          targetHz: cmp.targetHz,
          field: "B vs C (final dB)",
          bDb: cmp.bDb, cDb: cmp.cDb, delta: cmp.bcDelta,
        };
        break;
      }
    }

    const firstSub = subs[0] || {};
    const headerInfo = {
      room: `${fmt(roomDims.widthM, 2)}×${fmt(roomDims.lengthM, 2)}×${fmt(roomDims.heightM, 2)}m`,
      sub: `(${fmt(firstSub.x, 2)}, ${fmt(firstSub.y, 2)}, ${fmt(firstSub.z, 2)}) ${firstSub.modelKey || '—'} (n=${subs.length})`,
      seat: `(${fmt(seat.x, 2)}, ${fmt(seat.y, 2)}, ${fmt(seat.z, 2)})`,
      absorption: `F${fmt(surfaceAbsorption?.front, 2)} B${fmt(surfaceAbsorption?.back, 2)} L${fmt(surfaceAbsorption?.left, 2)} R${fmt(surfaceAbsorption?.right, 2)} C${fmt(surfaceAbsorption?.ceiling, 2)} Fl${fmt(surfaceAbsorption?.floor, 2)}`,
      sourceCurve: sourceCurve[0] ? `${sourceCurve[0].db}…${sourceCurve[sourceCurve.length - 1].db} dB` : '—',
    };

    return { comparison, firstDivergence, ready: true, headerInfo };
  }, [roomDims, seat, subs, surfaceAbsorption, sourceCurve, graphData, rawSeatResponse]);

  if (!ready || !headerInfo) {
    return (
      <div style={{ border: "2px solid #b45309", borderRadius: 10, background: "#fffbeb", padding: 14, fontFamily: "monospace", fontSize: 9.5, marginTop: 8 }}>
        <div style={{ fontWeight: 700, color: "#92400e", fontSize: 13, marginBottom: 6 }}>
          Case 077 — Live Graph Runtime Verification (temporary, read-only)
        </div>
        <div style={{ color: "#78350f" }}>Waiting for live room/seat/sub data…</div>
      </div>
    );
  }

  return (
    <div style={{ border: "2px solid #b45309", borderRadius: 10, background: "#fffbeb", padding: 14, fontFamily: "monospace", fontSize: 9.5, marginTop: 8 }}>
      <div style={{ fontWeight: 700, color: "#92400e", fontSize: 13, marginBottom: 6 }}>
        Case 077 — Live Graph Runtime Verification (temporary, read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#fef3c7", border: "1px solid #d97706", color: "#78350f", marginBottom: 10, fontSize: 9 }}>
        <b>LIVE geometry</b> — Room: {headerInfo.room} · Sub: {headerInfo.sub} · Seat: {headerInfo.seat}
        <br/>Absorption: {headerInfo.absorption} · Source curve: {headerInfo.sourceCurve} · No smoothing on A/B
        <br/>A = Case 071 external A&B recomputation (live geometry, production qStrategy + external modal)
        <br/>B = live ab_corrected raw seat response feeding the graph (pre-smoothing)
        <br/>C = actual plotted graph series (post-smoothing)
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
          <thead>
            <tr style={{ background: "#fef3c7" }}>
              <th style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #d97706", whiteSpace: "nowrap" }}>Target Hz</th>
              <th style={{ textAlign: "right", padding: "3px 4px", borderBottom: "1px solid #d97706", whiteSpace: "nowrap" }}>A — Case071 dB</th>
              <th style={{ textAlign: "right", padding: "3px 4px", borderBottom: "1px solid #d97706", whiteSpace: "nowrap" }}>B — Raw (ab_corrected) dB</th>
              <th style={{ textAlign: "right", padding: "3px 4px", borderBottom: "1px solid #d97706", whiteSpace: "nowrap" }}>C — Plotted dB</th>
              <th style={{ textAlign: "right", padding: "3px 4px", borderBottom: "1px solid #d97706", whiteSpace: "nowrap" }}>A−B Δ</th>
              <th style={{ textAlign: "right", padding: "3px 4px", borderBottom: "1px solid #d97706", whiteSpace: "nowrap" }}>B−C Δ</th>
              <th style={{ textAlign: "center", padding: "3px 4px", borderBottom: "1px solid #d97706", whiteSpace: "nowrap" }}>B=C?</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((cmp) => {
              const bcMatch = cmp.bcDelta !== null && Math.abs(cmp.bcDelta) <= 0.01;
              const isDivergence = firstDivergence && firstDivergence.targetHz === cmp.targetHz;
              return (
                <tr key={cmp.targetHz} style={{ background: isDivergence ? "#fecaca" : bcMatch ? "#f0fdf4" : "#fee2e2" }}>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>{cmp.targetHz}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>{fmt(cmp.aDb, 2)}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>{fmt(cmp.bDb, 2)}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>{fmt(cmp.cDb, 2)}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>{cmp.abDelta === null ? "—" : fmt(cmp.abDelta, 2)}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>{cmp.bcDelta === null ? "—" : fmt(cmp.bcDelta, 2)}</td>
                  <td style={{ padding: "2px 4px", textAlign: "center", fontWeight: 700 }}>{bcMatch ? "✓" : "✗"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {firstDivergence ? (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#fecaca", border: "1px solid #dc2626", color: "#7f1d1d" }}>
          <div style={{ fontWeight: 700, fontSize: 11 }}>FIRST B−C DIVERGENCE at {firstDivergence.targetHz} Hz — field: {firstDivergence.field}</div>
          <div style={{ marginTop: 4 }}>
            B (Raw ab_corrected): {String(firstDivergence.bDb)}
            <br/>C (Plotted graph): {String(firstDivergence.cDb)}
            {firstDivergence.delta !== null && <><br/>Δ (B−C): {fmt(firstDivergence.delta, 4)}</>}
            <br/><i>Variable: <code>graphData[].spl</code> vs <code>rawSeatResponse.splDb[]</code> — divergence indicates the smoothing/dedup layer in <code>multiSeriesForGraph</code> (BassResponse.jsx) alters plotted values vs raw engine output.</i>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#dcfce7", border: "1px solid #16a34a", color: "#14532d" }}>
          <div style={{ fontWeight: 700, fontSize: 11 }}>✓ B = C at all target frequencies — the audit panel reads the same live data that feeds the visible graph.</div>
        </div>
      )}
    </div>
  );
}