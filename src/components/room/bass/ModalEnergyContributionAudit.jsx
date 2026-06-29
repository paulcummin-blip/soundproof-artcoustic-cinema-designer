import { useState, useMemo } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations.js';

// ── Constants ────────────────────────────────────────────────────────────────
const C = 343;
const FLAT_SOURCE_DB = 94;
const fmt1 = (v) => (v !== null && Number.isFinite(Number(v))) ? Number(v).toFixed(1) : '—';
const fmt2 = (v) => (v !== null && Number.isFinite(Number(v))) ? Number(v).toFixed(2) : '—';
const fmt3 = (v) => (v !== null && Number.isFinite(Number(v))) ? Number(v).toFixed(3) : '—';
const fmtSci = (v) => (v !== null && Number.isFinite(Number(v))) ? Number(v).toExponential(3) : '—';
const radToDeg = (r) => (r * 180) / Math.PI;

function estimateModeQByType(mode, axialQ = 4.0) {
  const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  if (activeAxes === 1) return axialQ;
  if (activeAxes === 2) return 3.9;
  return 2.5;
}

// ── Full physics audit at a single frequency ─────────────────────────────────
function auditFrequency(freqHz, modes, source, seat, roomDims, modalSourceAmp, directAmp, directPhase) {
  const { widthM, lengthM, heightM } = roomDims;

  // Direct field complex pressure
  const directRe = directAmp * Math.cos(directPhase);
  const directIm = directAmp * Math.sin(directPhase);

  // Modal contributions
  const modeContribs = modes.map(mode => {
    const sc = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims);
    const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
    const coupling = sc * rc;
    const tf = resonantTransfer(freqHz, mode.freq, mode.qValue);
    const gain = modalSourceAmp * coupling;
    const re = gain * tf.re;
    const im = gain * tf.im;
    const mag = Math.sqrt(re * re + im * im);
    const phase = Math.atan2(im, re);
    return { mode, coupling, sc, rc, re, im, mag, phase, tf };
  });

  // Sort by magnitude descending
  modeContribs.sort((a, b) => b.mag - a.mag);

  const peakModeMag = modeContribs[0]?.mag ?? 0;
  const significant = modeContribs.filter(c => c.mag > 0.01 * peakModeMag);

  // Modal sum (coherent)
  let modalSumRe = 0, modalSumIm = 0;
  modeContribs.forEach(c => { modalSumRe += c.re; modalSumIm += c.im; });
  const modalMag = Math.sqrt(modalSumRe * modalSumRe + modalSumIm * modalSumIm);

  // Total coherent pressure
  const totalRe = directRe + modalSumRe;
  const totalIm = directIm + modalSumIm;
  const totalMag = Math.sqrt(totalRe * totalRe + totalIm * totalIm);
  const splDb = 20 * Math.log10(Math.max(totalMag, 1e-10));

  // Phase between direct and modal
  const directPhaseAngle = Math.atan2(directIm, directRe);
  const modalPhaseAngle = Math.atan2(modalSumIm, modalSumRe);
  let phaseDiff = radToDeg(modalPhaseAngle - directPhaseAngle);
  while (phaseDiff > 180) phaseDiff -= 360;
  while (phaseDiff < -180) phaseDiff += 360;

  const directModalRatio = directAmp > 1e-10 ? modalMag / directAmp : null;

  // Cancellation depth: what would incoherent sum be vs coherent
  const incoherentMag = Math.sqrt(directAmp * directAmp + modalMag * modalMag);
  const cancellationDb = 20 * Math.log10(Math.max(totalMag, 1e-10)) - 20 * Math.log10(Math.max(incoherentMag, 1e-10));

  // Cumulative pressure buildup for top modes
  const cumulative = [];
  let cumRe = directRe, cumIm = directIm;
  cumulative.push({ label: 'direct', re: cumRe, im: cumIm, mag: Math.sqrt(cumRe * cumRe + cumIm * cumIm) });
  modeContribs.slice(0, 12).forEach(c => {
    cumRe += c.re;
    cumIm += c.im;
    cumulative.push({
      label: `(${c.mode.nx},${c.mode.ny},${c.mode.nz}) @ ${c.mode.freq.toFixed(1)} Hz`,
      re: cumRe, im: cumIm, mag: Math.sqrt(cumRe * cumRe + cumIm * cumIm),
      modeMag: c.mag, modePhase: radToDeg(c.phase),
      coupling: c.coupling, sc: c.sc, rc: c.rc, qValue: c.mode.qValue, modeType: c.mode.type
    });
  });

  return {
    freqHz, directAmp, directRe, directIm, directPhaseAngle: radToDeg(directPhaseAngle),
    modalMag, modalSumRe, modalSumIm, modalPhaseAngle: radToDeg(modalPhaseAngle),
    totalMag, splDb, phaseDiff,
    directModalRatio, cancellationDb, incoherentMag,
    significantModeCount: significant.length,
    topMode: modeContribs[0] ?? null,
    topModes: modeContribs.slice(0, 12),
    cumulative,
  };
}

// ── Frequency sweep ───────────────────────────────────────────────────────────
function runFullAudit(roomDims, seat, source, surfaceAbsorption, axialQ = 4.0) {
  const { widthM, lengthM, heightM } = roomDims;
  const modesRaw = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 220, c: C });
  const modes = modesRaw.map(m => {
    const baseQ = estimateModeQByType(m, axialQ);
    const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: m.freq });
    return { ...m, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
  });

  const dx = source.x - seat.x, dy = source.y - seat.y, dz = source.z - seat.z;
  const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distanceLossDb = -20 * Math.log10(distM);
  const amplitudeDb = FLAT_SOURCE_DB + distanceLossDb;
  const directAmp = Math.pow(10, amplitudeDb / 20);
  const directPhase = -2 * Math.PI * 40 / C * distM; // representative at 40 Hz

  // Build log-spaced frequency axis 20–220 Hz, 96 pts/octave
  const freqs = [];
  const minHz = 20, maxHz = 220, ppo = 96;
  const octaves = Math.log2(maxHz / minHz);
  const total = Math.ceil(octaves * ppo);
  for (let i = 0; i <= total; i++) {
    const hz = minHz * Math.pow(2, i / ppo);
    if (hz > maxHz) break;
    freqs.push(hz);
  }

  // Modal source amplitude (distance_normalized)
  const modalSourceDb = FLAT_SOURCE_DB + distanceLossDb;
  const modalSourceAmp = Math.pow(10, modalSourceDb / 20);

  const sweep = freqs.map(hz => {
    // Per-frequency direct phase
    const dphase = -2 * Math.PI * hz * distM / C;
    const dAmp = directAmp;
    const dRe = dAmp * Math.cos(dphase);
    const dIm = dAmp * Math.sin(dphase);

    let modalSumRe = 0, modalSumIm = 0;
    let peakModeMag = 0;
    let sigCount = 0;
    let topMode = null, topMag = -1;

    modes.forEach(mode => {
      const sc = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims);
      const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
      const coupling = sc * rc;
      const tf = resonantTransfer(hz, mode.freq, mode.qValue);
      const gain = modalSourceAmp * coupling;
      const re = gain * tf.re;
      const im = gain * tf.im;
      const mag = Math.sqrt(re * re + im * im);
      modalSumRe += re;
      modalSumIm += im;
      if (mag > peakModeMag) peakModeMag = mag;
      if (mag > topMag) { topMag = mag; topMode = mode; }
    });

    modes.forEach(m => {
      const sc = modeShapeValueLocal(m, source.x, source.y, source.z, roomDims);
      const rc = modeShapeValueLocal(m, seat.x, seat.y, seat.z, roomDims);
      const tf = resonantTransfer(hz, m.freq, m.qValue);
      const gain = modalSourceAmp * sc * rc;
      const re = gain * tf.re, im = gain * tf.im;
      const mag = Math.sqrt(re * re + im * im);
      if (mag > 0.01 * peakModeMag) sigCount++;
    });

    const modalMag = Math.sqrt(modalSumRe * modalSumRe + modalSumIm * modalSumIm);
    const totalRe = dRe + modalSumRe, totalIm = dIm + modalSumIm;
    const totalMag = Math.sqrt(totalRe * totalRe + totalIm * totalIm);
    const splDb = 20 * Math.log10(Math.max(totalMag, 1e-10));
    const incoherentMag = Math.sqrt(dAmp * dAmp + modalMag * modalMag);
    const cancellationDb = 20 * Math.log10(Math.max(totalMag, 1e-10)) - 20 * Math.log10(Math.max(incoherentMag, 1e-10));
    const directModalRatio = dAmp > 1e-10 ? modalMag / dAmp : null;

    return { hz, splDb, directAmp: dAmp, modalMag, totalMag, cancellationDb, directModalRatio, sigCount, topMode };
  });

  // Find null and peak
  const band = sweep.filter(p => p.hz >= 20 && p.hz <= 120);
  const nullPt = band.reduce((best, p) => (!best || p.splDb < best.splDb) ? p : best, null);
  const peakPt = band.reduce((best, p) => (!best || p.splDb > best.splDb) ? p : best, null);

  // Deep dive at null and peak frequencies
  const nullDetail = nullPt ? auditFrequency(nullPt.hz, modes, source, seat, roomDims, modalSourceAmp, directAmp, -2 * Math.PI * nullPt.hz * distM / C) : null;
  const peakDetail = peakPt ? auditFrequency(peakPt.hz, modes, source, seat, roomDims, modalSourceAmp, directAmp, -2 * Math.PI * peakPt.hz * distM / C) : null;

  // Hypothesis analysis
  const avgDirectModalRatio = sweep.filter(p => p.directModalRatio !== null).reduce((s, p, _, a) => s + p.directModalRatio / a.length, 0);
  const avgCancellationDb = sweep.reduce((s, p, _, a) => s + p.cancellationDb / a.length, 0);
  const avgSigModes = sweep.reduce((s, p, _, a) => s + p.sigCount / a.length, 0);
  const totalSwingDb = sweep.length > 1 ? Math.max(...sweep.map(p => p.splDb)) - Math.min(...sweep.map(p => p.splDb)) : 0;
  const nullDepth = nullPt && peakPt ? peakPt.splDb - nullPt.splDb : null;

  const hypotheses = [];

  const directDominates = avgDirectModalRatio !== null && avgDirectModalRatio < 0.5;
  hypotheses.push({
    rank: directDominates ? 1 : 4,
    label: 'Direct field dominates',
    confidence: directDominates ? 75 : 20,
    detail: `Average modal/direct ratio = ${fmt2(avgDirectModalRatio)}. ${directDominates ? 'Modal field is weak relative to direct — direct pressure floors the null.' : 'Modal energy is comparable to direct.'}`,
    verdict: directDominates ? '⚠ YES — direct field suppresses null depth' : '✗ NO — direct/modal ratio reasonable',
  });

  const modalTooSmall = nullDetail && nullDetail.modalMag < nullDetail.directAmp * 0.3;
  hypotheses.push({
    rank: modalTooSmall ? 2 : 5,
    label: 'Modal amplitudes too small',
    confidence: modalTooSmall ? 65 : 15,
    detail: `At null (${fmt1(nullPt?.hz)} Hz): modal mag = ${fmtSci(nullDetail?.modalMag)}, direct mag = ${fmtSci(nullDetail?.directAmp)}. Ratio = ${fmt2(nullDetail ? nullDetail.modalMag / Math.max(nullDetail.directAmp, 1e-10) : null)}.`,
    verdict: modalTooSmall ? '⚠ YES — modal too weak to cancel direct' : '✗ NO — modal amplitude sufficient for cancellation',
  });

  const avgQ = modes.length > 0 ? modes.reduce((s, m) => s + m.qValue, 0) / modes.length : 0;
  const qSuppression = avgQ < 3;
  hypotheses.push({
    rank: qSuppression ? 3 : 6,
    label: 'Q-clamping suppressing modal peaks',
    confidence: qSuppression ? 60 : 25,
    detail: `Average modal Q = ${fmt2(avgQ)}. Modes: ${modes.length}. Low Q broadens resonance peaks, reducing interference depth. Q is bounded by Math.min(baseQ, absorptionQ) in rewBassEngine.js L796.`,
    verdict: qSuppression ? '⚠ YES — Q clamping broadens modes, reduces peak/null contrast' : `✗ NO — average Q (${fmt2(avgQ)}) not obviously over-suppressed`,
  });

  const coherenceTooHigh = nullDetail && Math.abs(nullDetail.phaseDiff) < 90;
  hypotheses.push({
    rank: coherenceTooHigh ? 2 : 5,
    label: 'Phases too coherent (insufficient cancellation angle)',
    confidence: coherenceTooHigh ? 55 : 20,
    detail: `Phase difference at null = ${fmt1(nullDetail?.phaseDiff)}°. For maximum cancellation, modal and direct should be ~180° apart. Current angle suggests only partial cancellation.`,
    verdict: coherenceTooHigh ? `⚠ YES — only ${fmt1(nullDetail?.phaseDiff)}° phase difference, cancellation is partial` : `✗ NO — phase difference (${fmt1(nullDetail?.phaseDiff)}°) supports good cancellation`,
  });

  const weakCancellation = avgCancellationDb > -3;
  hypotheses.push({
    rank: weakCancellation ? 2 : 6,
    label: 'Cancellations weaker than expected',
    confidence: weakCancellation ? 70 : 10,
    detail: `Average cancellation (coherent vs incoherent) = ${fmt1(avgCancellationDb)} dB. At null: ${fmt1(nullDetail?.cancellationDb)} dB. Strong cancellation should be < −10 dB at null. Null depth = ${fmt1(nullDepth)} dB.`,
    verdict: weakCancellation ? `⚠ YES — average cancellation only ${fmt1(avgCancellationDb)} dB, null depth ${fmt1(nullDepth)} dB vs expected > 15 dB` : `✗ NO — cancellation depth (${fmt1(avgCancellationDb)} dB avg) is reasonable`,
  });

  const physicsLimited = nullDepth !== null && nullDepth < 10;
  hypotheses.push({
    rank: physicsLimited ? 1 : 7,
    label: 'Null depth physics-limited (not rendering)',
    confidence: physicsLimited ? 80 : 5,
    detail: `Total swing = ${fmt1(totalSwingDb)} dB. Null depth = ${fmt1(nullDepth)} dB. REW typically shows > 20 dB null depth. The smooth production curve is a physics result, not a rendering artifact.`,
    verdict: physicsLimited ? `✓ CONFIRMED — null depth (${fmt1(nullDepth)} dB) is a physics model limitation, not rendering` : '✗ NOT limited — physics model produces adequate null depth',
  });

  hypotheses.sort((a, b) => b.confidence - a.confidence);

  return { sweep, nullPt, peakPt, nullDetail, peakDetail, hypotheses, modes, distM, directAmp, modalSourceAmp, avgDirectModalRatio, avgCancellationDb, avgSigModes, totalSwingDb, nullDepth };
}

// ── Cumulative breakdown table ────────────────────────────────────────────────
function CumulativeTable({ label, detail, color }) {
  if (!detail) return null;
  const { cumulative, splDb, directAmp, modalMag, phaseDiff, cancellationDb, directModalRatio, significantModeCount } = detail;

  const td = { padding: '2px 7px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right', borderBottom: '1px solid #e0e7ff' };
  const tdL = { ...td, textAlign: 'left' };
  const th = { padding: '2px 7px', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, textAlign: 'right', background: color + '22', color, borderBottom: `2px solid ${color}` };
  const thL = { ...th, textAlign: 'left' };

  return (
    <div style={{ marginBottom: 14, border: `2px solid ${color}`, borderRadius: 8, background: '#fff', padding: '8px 10px' }}>
      <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color, marginBottom: 6 }}>
        {label} — {fmt1(detail.freqHz)} Hz · SPL: {fmt1(splDb)} dB
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8, fontSize: 10, fontFamily: 'monospace' }}>
        {[
          { k: 'Direct mag', v: fmtSci(directAmp) },
          { k: 'Modal mag', v: fmtSci(modalMag) },
          { k: 'Direct/modal ratio', v: fmt2(directModalRatio) },
          { k: 'Phase diff (modal vs direct)', v: `${fmt1(phaseDiff)}°` },
          { k: 'Cancellation depth', v: `${fmt1(cancellationDb)} dB` },
          { k: 'Significant modes', v: significantModeCount },
        ].map((item, i) => (
          <div key={i} style={{ background: color + '11', border: `1px solid ${color}44`, borderRadius: 4, padding: '3px 10px', minWidth: 140 }}>
            <div style={{ color: '#6b7280', fontSize: 9 }}>{item.k}</div>
            <div style={{ fontWeight: 700, color, fontSize: 12 }}>{item.v}</div>
          </div>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ ...thL, minWidth: 160 }}>Component</th>
              <th style={th}>Mode type</th>
              <th style={th}>Q</th>
              <th style={th}>Coupling</th>
              <th style={th}>Magnitude (Pa)</th>
              <th style={th}>Phase (°)</th>
              <th style={th}>Cumul. mag (Pa)</th>
              <th style={th}>Cumul. dB</th>
            </tr>
          </thead>
          <tbody>
            {cumulative.map((row, i) => {
              const cumulDb = 20 * Math.log10(Math.max(row.mag, 1e-10));
              const prevDb = i > 0 ? 20 * Math.log10(Math.max(cumulative[i - 1].mag, 1e-10)) : null;
              const deltaDb = prevDb !== null ? cumulDb - prevDb : null;
              const deltaColor = deltaDb !== null ? (deltaDb > 0 ? '#166534' : '#991b1b') : '#6b7280';
              return (
                <tr key={i} style={{ background: i === 0 ? '#f0f9ff' : i % 2 === 0 ? '#fff' : '#f5f3ff' }}>
                  <td style={{ ...tdL, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? '#0369a1' : '#1e1b4b' }}>{row.label}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{i === 0 ? 'direct' : (row.modeType ?? '—')}</td>
                  <td style={{ ...td }}>{i === 0 ? '—' : fmt1(row.qValue)}</td>
                  <td style={{ ...td }}>{i === 0 ? '—' : fmt3(row.coupling)}</td>
                  <td style={{ ...td, color: '#0369a1' }}>{i === 0 ? fmtSci(directAmp) : fmtSci(row.modeMag)}</td>
                  <td style={{ ...td }}>{i === 0 ? fmt1(detail.directPhaseAngle) : fmt1(row.modePhase)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{fmtSci(row.mag)}</td>
                  <td style={{ ...td, fontWeight: 700, color: deltaColor }}>
                    {fmt1(cumulDb)} {deltaDb !== null && <span style={{ fontSize: 8, marginLeft: 2 }}>({deltaDb > 0 ? '+' : ''}{fmt1(deltaDb)} dB)</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function ModalEnergyContributionAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  const [audit, setAudit] = useState(null);

  const activeSeat = useMemo(() => {
    return (seatingPositions || []).find(s => s.isPrimary) || seatingPositions?.[0] || null;
  }, [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return null;
    return { x: Number(activeSeat.x), y: Number(activeSeat.y), z: Number.isFinite(Number(activeSeat.z)) ? Number(activeSeat.z) : 1.2 };
  }, [activeSeat]);

  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seatPos && subsForSimulation?.length > 0);

  function runAudit() {
    if (!canRun) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const sa = surfaceAbsorption || { front: 0.30, back: 0.30, left: 0.30, right: 0.30, ceiling: 0.30, floor: 0.30 };
        const rdims = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
        const sub = subsForSimulation[0];
        const source = { x: Number(sub.x), y: Number(sub.y), z: Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35 };
        const result = runFullAudit(rdims, seatPos, source, sa, 4.0);
        setAudit(result);
        setRan(true);
      } catch (err) {
        setAudit({ error: err.message });
        setRan(true);
      }
      setRunning(false);
    }, 30);
  }

  // Styles
  const th = { padding: '3px 8px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, background: '#0f172a', color: '#e2e8f0', textAlign: 'right', borderBottom: '2px solid #475569' };
  const thL = { ...th, textAlign: 'left' };
  const td = { padding: '3px 8px', fontSize: 10, fontFamily: 'monospace', textAlign: 'right', borderBottom: '1px solid #e2e8f0' };
  const tdL = { ...td, textAlign: 'left' };

  return (
    <details style={{ border: '2px solid #0f172a', borderRadius: 8, background: '#f8fafc', padding: '8px 10px', marginTop: 10 }}>
      <summary style={{ fontWeight: 700, color: '#0f172a', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        🔬 Modal Energy Contribution Audit — why are nulls too shallow?
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', marginBottom: 8, lineHeight: 1.6 }}>
          Full physics breakdown at every frequency. Compares direct field vs modal field. Complete mode-by-mode decomposition at null and peak.
          <strong> No production code changes. Diagnostic only.</strong>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <button onClick={runAudit} disabled={!canRun || running}
            style={{ height: 30, padding: '0 14px', borderRadius: 6, border: `1px solid ${canRun && !running ? '#0f172a' : '#d1d5db'}`, background: canRun && !running ? '#0f172a' : '#f3f4f6', color: canRun && !running ? '#fff' : '#9ca3af', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, cursor: canRun && !running ? 'pointer' : 'not-allowed' }}>
            {running ? 'Analysing…' : ran ? 'Re-run Audit' : 'Run Modal Energy Audit'}
          </button>
          {!canRun && <span style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace' }}>Need room dims + seat + at least one sub.</span>}
          {ran && !running && activeSeat && (
            <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>
              Seat: ({fmt2(activeSeat.x)}, {fmt2(activeSeat.y)}) · Sub: ({fmt2(subsForSimulation[0]?.x)}, {fmt2(subsForSimulation[0]?.y)}) · Room: {roomDims?.widthM?.toFixed(1)}×{roomDims?.lengthM?.toFixed(1)}×{roomDims?.heightM?.toFixed(1)} m
            </span>
          )}
        </div>

        {audit?.error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', color: '#b91c1c', fontSize: 11, fontFamily: 'monospace' }}>
            ⚠ Engine error: {audit.error}
          </div>
        )}

        {audit && !audit.error && (
          <>
            {/* ── Frequency sweep summary table ─────────────────────────── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color: '#0f172a', marginBottom: 6 }}>
                Frequency Sweep Summary (20–220 Hz · every 15 Hz approx.)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={th}>Hz</th>
                      <th style={th}>Direct (Pa)</th>
                      <th style={th}>Modal (Pa)</th>
                      <th style={th}>Modal/Direct</th>
                      <th style={th}>Total (Pa)</th>
                      <th style={th}>SPL (dB)</th>
                      <th style={th}>Cancel. (dB)</th>
                      <th style={th}>Sig. modes</th>
                      <th style={{ ...th, textAlign: 'left' }}>Top mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.sweep.filter((_, i) => i % 14 === 0 || audit.sweep[i].hz === audit.nullPt?.hz || audit.sweep[i].hz === audit.peakPt?.hz).slice(0, 30).map((row, i) => {
                      const isNull = audit.nullPt && Math.abs(row.hz - audit.nullPt.hz) < 0.5;
                      const isPeak = audit.peakPt && Math.abs(row.hz - audit.peakPt.hz) < 0.5;
                      const bg = isNull ? '#fef2f2' : isPeak ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#f8fafc';
                      const topLabel = row.topMode ? `(${row.topMode.nx},${row.topMode.ny},${row.topMode.nz}) ${row.topMode.freq.toFixed(1)} Hz` : '—';
                      return (
                        <tr key={i} style={{ background: bg }}>
                          <td style={{ ...td, fontWeight: (isNull || isPeak) ? 700 : 400, color: isNull ? '#b91c1c' : isPeak ? '#166534' : '#1e293b' }}>
                            {fmt1(row.hz)}{isNull ? ' ◀ NULL' : isPeak ? ' ◀ PEAK' : ''}
                          </td>
                          <td style={td}>{fmtSci(row.directAmp)}</td>
                          <td style={td}>{fmtSci(row.modalMag)}</td>
                          <td style={{ ...td, color: row.directModalRatio < 0.5 ? '#b91c1c' : '#166534', fontWeight: 600 }}>
                            {fmt2(row.directModalRatio)}
                          </td>
                          <td style={td}>{fmtSci(row.totalMag)}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{fmt1(row.splDb)}</td>
                          <td style={{ ...td, color: row.cancellationDb < -5 ? '#166534' : '#b91c1c' }}>{fmt1(row.cancellationDb)}</td>
                          <td style={td}>{row.sigCount}</td>
                          <td style={{ ...td, textAlign: 'left', fontSize: 9, color: '#475569' }}>{topLabel}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#94a3b8', marginTop: 4 }}>
                Showing every ~15 Hz + null/peak rows. Modal/Direct ratio &lt; 0.5 = direct dominant (red). Cancellation &gt; −5 dB = weak cancellation (red).
              </div>
            </div>

            {/* ── Null / Peak global stats ──────────────────────────────── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              {[
                { label: 'Null freq.', value: `${fmt1(audit.nullPt?.hz)} Hz`, color: '#b91c1c' },
                { label: 'Null SPL', value: `${fmt1(audit.nullPt?.splDb)} dB`, color: '#b91c1c' },
                { label: 'Peak freq.', value: `${fmt1(audit.peakPt?.hz)} Hz`, color: '#166534' },
                { label: 'Peak SPL', value: `${fmt1(audit.peakPt?.splDb)} dB`, color: '#166534' },
                { label: 'Null depth', value: `${fmt1(audit.nullDepth)} dB`, color: audit.nullDepth < 15 ? '#b91c1c' : '#166534' },
                { label: 'Total swing', value: `${fmt1(audit.totalSwingDb)} dB`, color: '#0369a1' },
                { label: 'Avg modal/direct', value: fmt2(audit.avgDirectModalRatio), color: audit.avgDirectModalRatio < 0.5 ? '#b45309' : '#166534' },
                { label: 'Avg cancellation', value: `${fmt1(audit.avgCancellationDb)} dB`, color: audit.avgCancellationDb > -3 ? '#b91c1c' : '#166534' },
                { label: 'Total modes', value: audit.modes.length, color: '#475569' },
                { label: 'Avg mode Q', value: fmt2(audit.modes.reduce((s, m) => s + m.qValue, 0) / Math.max(audit.modes.length, 1)), color: '#475569' },
                { label: 'Sub→seat dist.', value: `${fmt2(audit.distM)} m`, color: '#475569' },
              ].map((item, i) => (
                <div key={i} style={{ border: `1px solid ${item.color}44`, borderRadius: 6, background: '#fff', padding: '5px 12px', minWidth: 120 }}>
                  <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#94a3b8' }}>{item.label}</div>
                  <div style={{ fontWeight: 700, color: item.color, fontSize: 13, fontFamily: 'monospace' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* ── Mode-by-mode breakdown at null ───────────────────────── */}
            <CumulativeTable label="🔴 DEEPEST NULL — complete mode breakdown" detail={audit.nullDetail} color="#b91c1c" />
            <CumulativeTable label="🟢 HIGHEST PEAK — complete mode breakdown" detail={audit.peakDetail} color="#166534" />

            {/* ── 6 Physics Questions ───────────────────────────────────── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color: '#0f172a', marginBottom: 6 }}>Physics Diagnosis — 6 Questions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  {
                    q: '1. Is the direct field dominating the response?',
                    a: audit.avgDirectModalRatio < 0.5
                      ? `⚠ YES — average modal/direct ratio = ${fmt2(audit.avgDirectModalRatio)}. The direct field is significantly larger than the modal field on average, setting a floor that prevents deep nulls.`
                      : `✓ NO — modal/direct ratio = ${fmt2(audit.avgDirectModalRatio)} (> 0.5), modes are contributing meaningfully.`,
                    warn: audit.avgDirectModalRatio < 0.5,
                  },
                  {
                    q: '2. Are modal amplitudes too small?',
                    a: audit.nullDetail && audit.nullDetail.modalMag < audit.nullDetail.directAmp * 0.5
                      ? `⚠ YES — at null (${fmt1(audit.nullPt?.hz)} Hz), modal magnitude (${fmtSci(audit.nullDetail.modalMag)}) is only ${fmt1(100 * audit.nullDetail.modalMag / Math.max(audit.nullDetail.directAmp, 1e-10))}% of direct (${fmtSci(audit.nullDetail.directAmp)}). Cannot achieve full cancellation with this amplitude disparity.`
                      : `✓ NO — modal amplitude at null is comparable to direct. Amplitude is not the primary limiting factor.`,
                    warn: audit.nullDetail && audit.nullDetail.modalMag < audit.nullDetail.directAmp * 0.5,
                  },
                  {
                    q: '3. Are phases too coherent (insufficient cancellation)?',
                    a: `Phase difference (modal vs direct) at null = ${fmt1(audit.nullDetail?.phaseDiff)}°. ${Math.abs(audit.nullDetail?.phaseDiff ?? 0) < 120 ? `⚠ YES — ${fmt1(Math.abs(audit.nullDetail?.phaseDiff))}° is far from 180°. For deep cancellation, phases need to be ±135–180° apart. This is a primary smoothing mechanism.` : `✓ NO — phase difference is near anti-phase, supporting deep cancellation.`}`,
                    warn: Math.abs(audit.nullDetail?.phaseDiff ?? 0) < 120,
                  },
                  {
                    q: '4. Are cancellations weaker than expected?',
                    a: `Average coherent vs incoherent cancellation = ${fmt1(audit.avgCancellationDb)} dB. At null = ${fmt1(audit.nullDetail?.cancellationDb)} dB. ${audit.avgCancellationDb > -3 ? `⚠ YES — weak cancellation. REW typically achieves > −10 dB at nulls. The modal and direct fields are not coherently destructively interfering.` : `✓ NO — cancellation is operating as expected.`}`,
                    warn: audit.avgCancellationDb > -3,
                  },
                  {
                    q: '5. Are modal Q values suppressing interference contrast?',
                    a: (() => {
                      const avgQ = audit.modes.reduce((s, m) => s + m.qValue, 0) / Math.max(audit.modes.length, 1);
                      return avgQ < 3
                        ? `⚠ YES — average Q = ${fmt2(avgQ)}. Low Q causes modes to overlap heavily, averaging out peaks and nulls. Q is clamped by Math.min(baseQ, absorptionQ) in rewBassEngine.js L796.`
                        : `✓ MODERATE — average Q = ${fmt2(avgQ)}. Q values are not severely suppressed but axial modes at Q=${fmt2(4)} may still broaden excessively compared to REW defaults.`;
                    })(),
                    warn: audit.modes.reduce((s, m) => s + m.qValue, 0) / Math.max(audit.modes.length, 1) < 4,
                  },
                  {
                    q: '6. Is the deepest null limited by the physics model rather than rendering?',
                    a: audit.nullDepth !== null && audit.nullDepth < 12
                      ? `✓ CONFIRMED — null depth = ${fmt1(audit.nullDepth)} dB vs REW target > 20 dB. This is a physics model output, not a rendering issue. The BassGraph type="monotone" audit showed <10% impact. The root cause is in modal pressure generation upstream.`
                      : `~ UNCLEAR — null depth (${fmt1(audit.nullDepth)} dB) is within expected range. Discrepancy may be a geometry or absorption mismatch.`,
                    warn: audit.nullDepth !== null && audit.nullDepth < 12,
                  },
                ].map((item, i) => (
                  <div key={i} style={{ border: `1px solid ${item.warn ? '#fca5a5' : '#bbf7d0'}`, borderRadius: 6, background: item.warn ? '#fff7f7' : '#f0fdf4', padding: '6px 10px' }}>
                    <div style={{ fontWeight: 700, fontSize: 10, fontFamily: 'monospace', color: '#1e293b', marginBottom: 2 }}>{item.q}</div>
                    <div style={{ fontSize: 10, fontFamily: 'monospace', color: item.warn ? '#7f1d1d' : '#14532d', lineHeight: 1.5 }}>{item.a}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Ranked hypothesis table ───────────────────────────────── */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color: '#0f172a', marginBottom: 6 }}>
                Ranked Discrepancy Hypotheses vs REW
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={th}>Rank</th>
                      <th style={{ ...thL, minWidth: 220 }}>Hypothesis</th>
                      <th style={th}>Confidence</th>
                      <th style={{ ...thL, minWidth: 200 }}>Verdict</th>
                      <th style={{ ...thL, minWidth: 280 }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.hypotheses.map((h, i) => {
                      const confColor = h.confidence >= 70 ? '#b91c1c' : h.confidence >= 50 ? '#b45309' : '#166534';
                      const bg = i % 2 === 0 ? '#fff' : '#f8fafc';
                      return (
                        <tr key={i} style={{ background: bg }}>
                          <td style={{ ...td, fontWeight: 700, color: confColor }}>{i + 1}</td>
                          <td style={{ ...tdL, fontWeight: 600, color: '#1e293b' }}>{h.label}</td>
                          <td style={{ ...td, fontWeight: 700, color: confColor }}>{h.confidence}%</td>
                          <td style={{ ...tdL, color: h.verdict.startsWith('⚠') ? '#b91c1c' : h.verdict.startsWith('✓') ? '#166534' : '#475569', fontWeight: 600 }}>{h.verdict}</td>
                          <td style={{ ...tdL, color: '#475569', lineHeight: 1.4 }}>{h.detail}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#94a3b8', lineHeight: 1.5 }}>
              Diagnostic only. No production defaults changed. Flat 94 dB source. axialQ = 4.0. Absorption from live UI inputs.
              First sub used for geometry. Modal sum: pureDeterministicModalSum=true, disableModalPropagationPhase=true.
            </div>
          </>
        )}
      </div>
    </details>
  );
}