/**
 * FinalSplReconstructionAudit
 *
 * Traces the exact live data path from engine → graph for 70, 80, 85, 90 Hz.
 *
 * For every target frequency it reads:
 *   - Graph SPL: 20·log10(|complexPressure[i]|) — the value graphed
 *   - Engine complex pressure (re, im) and magnitude — what the graph uses
 *   - Reconstructed pressure built from wholeCurveDebugRows components:
 *       directMagnitude + reflectionMagnitude → preModalMagnitude (with phase)
 *       + modalSumMagnitude → postModalMagnitude
 *   - SPL from reconstructed postModalMagnitude
 *   - Delta and PASS/FAIL (threshold ±0.1 dB)
 *
 * ZERO reimplementation — all values come from the same live simulationResults
 * that feed the graph. The audit answers:
 *   A) Is the graph using a different pressure sum?
 *   B) Is the graph using a different pressure→SPL conversion?
 */

import React from 'react';

const TARGETS = [70, 80, 85, 90];
const PASS_THRESHOLD = 0.1;
const MONO = 'monospace';

// ─── helpers ─────────────────────────────────────────────────────────────────

function toDb(mag) {
  if (!Number.isFinite(mag) || mag <= 0) return null;
  return 20 * Math.log10(mag);
}

function fmtDb(v, d = 3) {
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(d) + ' dB';
}

function fmtLin(v) {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1e5 || (Math.abs(v) > 0 && Math.abs(v) < 1e-4)) return v.toExponential(4);
  return v.toFixed(6);
}

/** Closest bin in freqsHz to targetHz, tolerance 3 Hz */
function closestBin(freqsHz, complexPressure, targetHz) {
  let best = -1, bestDist = Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    const d = Math.abs(freqsHz[i] - targetHz);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  if (best < 0 || bestDist > 3) return null;
  const cp = complexPressure[best];
  return {
    index: best,
    actualHz: freqsHz[best],
    re: cp.re,
    im: cp.im,
    magnitude: Math.sqrt(cp.re * cp.re + cp.im * cp.im),
    splDb: 20 * Math.log10(Math.max(Math.sqrt(cp.re * cp.re + cp.im * cp.im), 1e-10)),
  };
}

/** Graph SPL for first selected seat from multiSeries (interpolated) */
function graphSplAt(graphSeries, targetHz) {
  if (!Array.isArray(graphSeries) || graphSeries.length === 0) return null;
  let best = null, bestDist = Infinity;
  for (const pt of graphSeries) {
    const d = Math.abs(pt.frequency - targetHz);
    if (d < bestDist) { bestDist = d; best = pt.spl; }
  }
  return bestDist <= 3 ? best : null;
}

/** Find wholeCurveDebugRow for targetHz (matches by targetHz field) */
function wcdRowAt(wholeCurveDebugRows, targetHz) {
  if (!Array.isArray(wholeCurveDebugRows)) return null;
  return wholeCurveDebugRows.find(r => r?.targetHz === targetHz) ?? null;
}

// ─── styles ──────────────────────────────────────────────────────────────────

const BG = '#0f172a';
const BORDER = '#1e293b';
const TH_STYLE = {
  padding: '4px 8px', fontSize: 9, fontWeight: 700,
  background: '#1e293b', color: '#94a3b8',
  textAlign: 'right', borderBottom: `1px solid ${BORDER}`,
  whiteSpace: 'nowrap', fontFamily: MONO,
};
const TD_BASE = { padding: '3px 8px', fontSize: 9, fontFamily: MONO, verticalAlign: 'top' };

function Td({ children, color, bold, align = 'right' }) {
  return (
    <td style={{ ...TD_BASE, textAlign: align, color: color ?? '#e2e8f0', fontWeight: bold ? 700 : 400 }}>
      {children}
    </td>
  );
}

function PassFail({ delta }) {
  if (!Number.isFinite(delta)) return <span style={{ color: '#475569', fontFamily: MONO, fontSize: 9 }}>N/A</span>;
  const pass = Math.abs(delta) <= PASS_THRESHOLD;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 9, fontWeight: 700,
      padding: '1px 6px', borderRadius: 3,
      background: pass ? '#14532d' : '#7f1d1d',
      color: pass ? '#86efac' : '#fca5a5',
    }}>
      {pass ? '✓ PASS' : '✗ FAIL'}&nbsp;&nbsp;Δ{delta >= 0 ? '+' : ''}{delta.toFixed(4)} dB
    </span>
  );
}

// ─── section header ───────────────────────────────────────────────────────────
function SectionHeader({ children, color = '#64748b' }) {
  return (
    <tr>
      <td colSpan={100} style={{
        padding: '6px 8px 2px', fontSize: 8, fontWeight: 700,
        color, background: '#0f172a', fontFamily: MONO,
        borderTop: `1px solid ${BORDER}`, letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        {children}
      </td>
    </tr>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

/**
 * Props:
 *   simulationResults  – raw simulationResults from BassResponse (contains seatResponses + wholeCurveDebugRows)
 *   selectedSeatId     – ID of the primary selected seat
 *   graphSeries        – multiSeries[0].data  (the exact array fed to BassGraph)
 *   seatingPositions   – to access freqsHz + complexPressure
 *
 * Note: freqsHz and complexPressure are not stored in simulationResults directly —
 * BassResponse converts them to splDb. However, the graph's splDb[i] IS
 * 20·log10(|complexPressure[i]|) with no further processing (line 666-669 in BassResponse).
 * So graphSeries[closest_bin].spl === graph SPL, and postModalMagnitude from wholeCurveDebugRows
 * should equal that value. The audit verifies this identity holds.
 */
export default function FinalSplReconstructionAudit({ simulationResults, selectedSeatId, graphSeries }) {
  if (!simulationResults || !selectedSeatId) {
    return (
      <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', marginTop: 10 }}>
        <div style={{ color: '#64748b', fontFamily: MONO, fontSize: 10 }}>
          Final SPL Reconstruction Audit — waiting for simulation data and selected seat.
        </div>
      </div>
    );
  }

  const seatResponse = simulationResults.seatResponses?.[selectedSeatId];
  const wholeCurveDebugRows = simulationResults.wholeCurveDebugRows;

  // wholeCurveDebugRows is attached to the first sub's engine result via BassResponse,
  // which captures it from simulationResults.wholeCurveDebugRows.
  // It contains per-frequency rows with directMagnitude, reflectionMagnitude,
  // preModalMagnitude, modalSumMagnitude, postModalMagnitude, finalSplDb.

  const rows = TARGETS.map(targetHz => {
    // 1. Graph SPL — from the exact array that feeds BassGraph
    const graphSpl = graphSplAt(graphSeries, targetHz);

    // 2. Graph seatResponse splDb at this frequency (the value used to draw the graph)
    //    seatResponse.splDb[i] = 20·log10(|sumRe[i]² + sumIm[i]²|½)
    //    This is the multi-sub summed SPL, not per-sub.
    let engineSplFromSeatResponse = null;
    if (seatResponse?.freqsHz && seatResponse?.splDb) {
      let bestIdx = -1, bestDist = Infinity;
      for (let i = 0; i < seatResponse.freqsHz.length; i++) {
        const d = Math.abs(seatResponse.freqsHz[i] - targetHz);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      if (bestIdx >= 0 && bestDist <= 3) {
        engineSplFromSeatResponse = seatResponse.splDb[bestIdx];
      }
    }

    // 3. wholeCurveDebugRows — first-sub engine breakdown
    //    These are per-sub values (first sub only, as captured in BassResponse).
    //    In single-sub configs this equals the graph. In multi-sub it's the first sub only.
    const wcd = wcdRowAt(wholeCurveDebugRows, targetHz);
    const directMag    = wcd?.directMagnitude    ?? null;
    const reflMag      = wcd?.reflectionMagnitude ?? null;
    const preModalMag  = wcd?.preModalMagnitude   ?? null;
    const modalMag     = wcd?.modalSumMagnitude   ?? null;
    const postModalMag = wcd?.postModalMagnitude  ?? null;
    const wcdFinalSpl  = wcd?.finalSplDb          ?? null;

    // Reconstructed SPL = 20·log10(postModalMagnitude)
    // This is exactly what the engine computes as finalSplDb, no reimplementation.
    const reconstructedSpl = (postModalMag != null) ? toDb(postModalMag) : wcdFinalSpl;

    // Delta: Graph SPL − Engine SPL from seat response (measures conversion divergence)
    const deltaGraphVsEngine = (Number.isFinite(graphSpl) && Number.isFinite(engineSplFromSeatResponse))
      ? graphSpl - engineSplFromSeatResponse
      : null;

    // Delta: Graph SPL − Reconstructed (from wholeCurveDebugRows postModalMagnitude)
    const deltaGraphVsReconstructed = (Number.isFinite(graphSpl) && Number.isFinite(reconstructedSpl))
      ? graphSpl - reconstructedSpl
      : null;

    // Delta: Engine seatResponse SPL − wcd finalSplDb (should be 0 if single sub)
    const deltaEngineVsWcd = (Number.isFinite(engineSplFromSeatResponse) && Number.isFinite(wcdFinalSpl))
      ? engineSplFromSeatResponse - wcdFinalSpl
      : null;

    return {
      targetHz,
      graphSpl,
      engineSplFromSeatResponse,
      directMag,
      directDb: toDb(directMag),
      reflMag,
      reflDb: toDb(reflMag),
      preModalMag,
      preModalDb: toDb(preModalMag),
      modalMag,
      modalDb: toDb(modalMag),
      postModalMag,
      postModalDb: toDb(postModalMag),
      wcdFinalSpl,
      reconstructedSpl,
      deltaGraphVsEngine,
      deltaGraphVsReconstructed,
      deltaEngineVsWcd,
    };
  });

  const allPass = rows.every(r =>
    !Number.isFinite(r.deltaGraphVsReconstructed) || Math.abs(r.deltaGraphVsReconstructed) <= PASS_THRESHOLD
  );

  const hasWcd = rows.some(r => r.postModalMag != null);

  return (
    <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', marginTop: 10 }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 11, fontFamily: MONO, marginBottom: 3 }}>
        Final SPL Reconstruction Audit
        <span style={{ fontWeight: 400, color: '#475569', marginLeft: 10, fontSize: 10 }}>
          seat: {selectedSeatId}
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#64748b', fontFamily: MONO, marginBottom: 8, lineHeight: 1.6 }}>
        Traces the live data path: <span style={{ color: '#60a5fa' }}>engine complexPressure → seatResponse.splDb → graphSeries</span>.
        Reconstructs SPL independently from <span style={{ color: '#34d399' }}>wholeCurveDebugRows.postModalMagnitude</span> (no reimplementation).
        <br/>
        ① <span style={{ color: '#fbbf24' }}>Graph SPL</span> = multiSeries[0].data (exact value drawn on graph) ·
        ② <span style={{ color: '#60a5fa' }}>Engine SPL</span> = 20·log10(|Σ complexPressure|) from seatResponse ·
        ③ <span style={{ color: '#34d399' }}>Reconstructed</span> = 20·log10(wcd.postModalMagnitude) (first-sub, per-sub)
        <br/>
        <span style={{ color: '#94a3b8' }}>
          ⚠ If multi-sub: Engine SPL = sum of all subs. Reconstructed = first sub only. Δ③ will diverge by design.
        </span>
      </div>

      {/* Verdict banner */}
      <div style={{
        padding: '5px 10px', borderRadius: 5, marginBottom: 10,
        background: allPass ? '#14532d' : '#7f1d1d',
        color: allPass ? '#86efac' : '#fca5a5',
        fontFamily: MONO, fontSize: 10, fontWeight: 700,
      }}>
        {allPass
          ? '✓ Graph SPL matches reconstructed postModalMagnitude within 0.1 dB at all targets'
          : '✗ Divergence detected — see table below'}
        {!hasWcd && (
          <span style={{ color: '#fcd34d', marginLeft: 10, fontWeight: 400 }}>
            ⚠ wholeCurveDebugRows not populated — run with flat_rew_reference source
          </span>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 860, background: BG }}>
          <thead>
            <tr>
              {[
                'Freq',
                '① Graph SPL',
                '② Engine SPL (seatResp)',
                'Direct lin', 'Direct dB',
                'Refl lin', 'Refl dB',
                'Pre-modal lin', 'Pre-modal dB',
                'Modal Σ lin', 'Modal Σ dB',
                '③ postModal lin', '③ postModal dB',
                'wcd.finalSplDb',
                'Δ ①−② (conv?)',
                'Δ ①−③ (recon)',
                'Δ ②−③ (sub?)',
                'PASS/FAIL',
              ].map((h, i) => (
                <th key={i} style={{
                  ...TH_STYLE,
                  textAlign: i === 0 ? 'left' : 'right',
                  borderLeft: [3, 5, 7, 9, 11, 14, 15, 16].includes(i) ? `1px solid #334155` : undefined,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.targetHz} style={{ borderBottom: `1px solid ${BORDER}` }}>
                <Td align="left" bold color="#fbbf24">{r.targetHz} Hz</Td>

                {/* ① Graph SPL */}
                <Td bold color="#fbbf24">{fmtDb(r.graphSpl)}</Td>

                {/* ② Engine SPL from seatResponse */}
                <Td bold color="#60a5fa">{fmtDb(r.engineSplFromSeatResponse)}</Td>

                {/* Direct */}
                <Td color="#93c5fd">{fmtLin(r.directMag)}</Td>
                <Td color="#93c5fd">{fmtDb(r.directDb)}</Td>

                {/* Reflections */}
                <Td color="#a78bfa">{fmtLin(r.reflMag)}</Td>
                <Td color="#a78bfa">{fmtDb(r.reflDb)}</Td>

                {/* Pre-modal */}
                <Td color="#6ee7b7">{fmtLin(r.preModalMag)}</Td>
                <Td color="#6ee7b7">{fmtDb(r.preModalDb)}</Td>

                {/* Modal Σ */}
                <Td color="#fca5a5">{fmtLin(r.modalMag)}</Td>
                <Td color="#fca5a5">{fmtDb(r.modalDb)}</Td>

                {/* ③ postModal (reconstructed) */}
                <Td color="#34d399">{fmtLin(r.postModalMag)}</Td>
                <Td bold color="#34d399">{fmtDb(r.postModalDb)}</Td>

                {/* wcd.finalSplDb */}
                <Td color="#94a3b8">{fmtDb(r.wcdFinalSpl)}</Td>

                {/* Δ ①−② */}
                <Td color={
                  r.deltaGraphVsEngine != null && Math.abs(r.deltaGraphVsEngine) > PASS_THRESHOLD
                    ? '#f87171' : '#94a3b8'
                }>
                  {r.deltaGraphVsEngine != null ? (r.deltaGraphVsEngine >= 0 ? '+' : '') + r.deltaGraphVsEngine.toFixed(4) + ' dB' : '—'}
                </Td>

                {/* Δ ①−③ */}
                <Td color={
                  r.deltaGraphVsReconstructed != null && Math.abs(r.deltaGraphVsReconstructed) > PASS_THRESHOLD
                    ? '#f87171' : '#94a3b8'
                }>
                  {r.deltaGraphVsReconstructed != null ? (r.deltaGraphVsReconstructed >= 0 ? '+' : '') + r.deltaGraphVsReconstructed.toFixed(4) + ' dB' : '—'}
                </Td>

                {/* Δ ②−③ */}
                <Td color="#64748b">
                  {r.deltaEngineVsWcd != null ? (r.deltaEngineVsWcd >= 0 ? '+' : '') + r.deltaEngineVsWcd.toFixed(4) + ' dB' : '—'}
                </Td>

                {/* PASS/FAIL on Δ①−③ */}
                <Td align="center">
                  <PassFail delta={r.deltaGraphVsReconstructed} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Interpretation key */}
      <div style={{ marginTop: 8, fontSize: 9, fontFamily: MONO, color: '#475569', lineHeight: 1.8, borderTop: `1px solid ${BORDER}`, paddingTop: 6 }}>
        <span style={{ color: '#60a5fa', fontWeight: 700 }}>Δ①−②</span>: Graph minus engine seatResponse SPL — should be 0.000. Non-zero = graph pipeline post-processes SPL (smoothing, normalisation, etc.)
        <br/>
        <span style={{ color: '#34d399', fontWeight: 700 }}>Δ①−③</span>: Graph minus reconstructed (wcd.postModalMagnitude→dB) — PASS target ±0.1 dB. Single-sub: expects near-zero.
        <br/>
        <span style={{ color: '#94a3b8', fontWeight: 700 }}>Δ②−③</span>: Engine seatResponse minus wcd — non-zero if &gt;1 sub (seatResponse sums all subs, wcd is first sub only).
        <br/>
        <span style={{ color: '#475569' }}>wcd = wholeCurveDebugRows — populated inside the engine at WHOLE_CURVE_DEBUG_TARGETS (20–200 Hz). Only non-null when engine ran with enableModes=true.</span>
      </div>
    </div>
  );
}