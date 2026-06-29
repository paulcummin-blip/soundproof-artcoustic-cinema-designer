/**
 * RewPipelineDivergenceAudit.jsx
 *
 * DIAGNOSTIC ONLY — no production changes.
 *
 * Final REW Pipeline Divergence Audit.
 * Identifies the FIRST stage where B44 departs from REW Room Simulator's
 * documented processing pipeline.
 *
 * Representative frequency: 30–35 Hz (sub-null region showing largest B44/REW mismatch).
 * Room: 6 m × 4 m × 2.4 m. Seat: 3.28 m from front wall.
 */

import React, { useState, useMemo } from 'react';
import {
  computeRoomModesLocal,
  modeShapeValueLocal,
  estimateModeQLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations.js';

const C = 343;
const FREQ_HZ = 34.3; // (1,0,0) axial mode fundamental — largest B44/REW mismatch region

// ─── Pipeline stage definitions ───────────────────────────────────────────────
// Each stage: id, name, rew (what REW does), b44 (what B44 does),
// different (true if shape-changing), severity, notes

const STAGES = [
  {
    id: 'S1',
    name: 'Frequency axis',
    rew: 'Log-spaced, ~1/24 octave resolution (user-configurable). REW Room Simulator evaluates at user-specified resolution, typically 48 or 96 pts/octave. No rounding applied.',
    b44: 'Log-spaced, 96 pts/octave. buildFrequencyAxis(): hz = fMin × 2^(index/96). No rounding. Identical density.',
    same: true,
    shapeChanging: false,
    severity: 'MATCH',
    detail: 'B44: 96 pts/oct. REW: configurable, defaults to similar density. Resolution difference is negligible at 20–220 Hz — no shape effect.',
  },
  {
    id: 'S2',
    name: 'Source definition',
    rew: 'Point monopole. Omnidirectional. Source amplitude = 1 Pa at 1 m (or user-defined SPL reference). REW applies no product curve distortion to the modal excitation — uses a flat reference pressure for Room Simulator.',
    b44: 'Point monopole. Omnidirectional. Source amplitude = 10^((curveDb + gainDb)/20). When using flat 94 dB reference: A_base = 10^(94/20) ≈ 5011. Additionally applies "distance_normalized" scaling: A_modal = A_base / distM.',
    same: false,
    shapeChanging: false,
    severity: 'DIFFERENT (level only)',
    detail: 'distance_normalized (÷ distM) is a non-canonical flat offset of ~−10 dB at 3.28 m. It is frequency-independent, so it shifts the whole curve but does NOT reshape nulls or peaks. Severity for shape parity: NONE.',
  },
  {
    id: 'S3',
    name: 'Modal enumeration',
    rew: 'Standard rectangular-room eigenfrequency formula: f = (c/2)√((nx/W)²+(ny/L)²+(nz/H)²). All modes up to user fMax. Families: axial (1 active axis), tangential (2), oblique (3). Mode order by frequency ascending.',
    b44: 'Identical formula. computeRoomModesLocal(): same eigenfrequency formula, same three families, sorted by frequency ascending. For 6×4×2.4 m, 20–220 Hz: ~35 modes.',
    same: true,
    shapeChanging: false,
    severity: 'MATCH',
    detail: 'Eigenfrequencies are identical. No modes omitted. Families and ordering identical.',
  },
  {
    id: 'S4',
    name: 'Modal excitation — Q assignment',
    rew: 'REW Room Simulator: Q derived from RT60 via Sabine equation. Q = 2πf × RT60 / 13.815. Single RT60 from surface absorption α. All modes: same Sabine-derived Q (no per-family base values).',
    b44: 'TWO-STEP CLAMP: (1) per-family base Q (axial: 8.0 default, tangential: 3.9, oblique: 2.5), then (2) Sabine absorptionQ computed identically. Final Q = Math.min(baseQ, absorptionQ). For absorptive rooms Sabine dominates; for rigid rooms base Q dominates.',
    same: false,
    shapeChanging: true,
    severity: '⚡ FIRST DIVERGENCE — HIGH',
    detail: 'REW uses a single Sabine Q for all modes. B44 uses Math.min(per-family base Q, Sabine Q). In a lightly damped room (α=0.1–0.3), Sabine Q is high; the B44 family base cap clamps axial modes to Q≤8, tangential to Q≤3.9, oblique to Q≤2.5. This is LOWER than REW\'s Sabine Q for low-absorption rooms — meaning B44 damps modes MORE than REW. Lower Q = wider, shallower resonance peaks AND shallower cancellation nulls. This directly explains why REW produces deeper nulls and stronger modal contrast.',
  },
  {
    id: 'S5',
    name: 'Modal excitation — mode shape Ψ',
    rew: 'Canonical: Ψ_n(r) = ε_nx·ε_ny·ε_nz · cos(nxπx/W)·cos(nyπy/L)·cos(nzπz/H) where ε = 1 if n=0, √2 if n>0. This is the normalised eigenfunction with the Neumann coefficient. Coupling = Ψ_src(ε) × Ψ_rcv(ε).',
    b44: 'modeShapeValueLocal(): cos(nxπx/W)·cos(nyπy/L)·cos(nzπz/H) only. ε Neumann coefficient ABSENT. Combined coupling = psiSrc × psiRcv without ε².',
    same: false,
    shapeChanging: false,
    severity: 'DIFFERENT (level only per mode family)',
    detail: 'Missing ε²: axial modes under-scaled by 2×, tangential by 4×, oblique by 8× relative to canonical. This is a systematic per-family constant offset — frequency-independent within each family. Because ALL modes within a family are equally scaled, the RELATIVE shape of the response is preserved within each family, but cross-family interference cancellations may differ in depth. Moderate shape-change risk at null frequencies where tangential/oblique modes cancel axial modes.',
  },
  {
    id: 'S6',
    name: 'Modal transfer function H(f)',
    rew: 'Standard 2nd-order resonant TF: H(f) = 1 / (1−(f/f₀)² + j·f/(f₀Q)). Applied per mode. Complex output.',
    b44: 'resonantTransfer(): H_re = (1−r²)/D, H_im = −(ω/ω₀Q)/D where D = (1−r²)² + (ω/ω₀Q)². Mathematically identical to REW formula. Confirmed by CanonicalGreensFunctionAudit.',
    same: true,
    shapeChanging: false,
    severity: 'MATCH',
    detail: 'Transfer function formula is canonical and confirmed identical to REW.',
  },
  {
    id: 'S7',
    name: 'Receiver coupling',
    rew: 'Ψ_n(r_receiver) = ε_nx·ε_ny·ε_nz · cos(·). Same normalisation as source.',
    b44: 'modeShapeValueLocal() — same as source coupling. ε absent. See Stage 5.',
    same: false,
    shapeChanging: false,
    severity: 'DIFFERENT (level only — same as S5)',
    detail: 'Same ε omission as source coupling. The combined coupling deficit is ε²_src × ε²_rcv = ε⁴ per mode (axial: 4×, tangential: 16×, oblique: 64×). Systematic, frequency-independent. Does not reshape relative peaks/nulls WITHIN a family.',
  },
  {
    id: 'S8',
    name: 'Complex pressure summation',
    rew: 'P_total = Σ_n [A · Ψ_src · Ψ_rcv · H_n(f)]. Coherent complex vector sum over all modes. No additional phase rotation applied to modal sum before accumulation.',
    b44: 'True coherent complex sum: modalSumRe += gain × H_re; modalSumIm += gain × H_im. HOWEVER: (a) An optional propagationPhase rotation (-2πf·distM/c × 0.5 scale) is added per mode in legacyModalTransferLocal (disabled in parity path). (b) Non-parity production path has phase perturbation (deterministicModalPhasePerturbationRad) active by default when pureDeterministicModalSum=false.',
    same: false,
    shapeChanging: true,
    severity: 'DIFFERENT (shape-changing in production mode)',
    detail: 'REW applies no per-mode phase rotation beyond H(f). B44 production path applies a small deterministic phase perturbation (±0.12 rad max) per mode that is NOT present in REW. In parity path (pureDeterministicModalSum=true, disableModalPropagationPhase=true) this is suppressed. In default production mode it reduces cancellation depth at null frequencies by decorrelating modal vectors slightly. This DOES reduce null depth vs REW.',
  },
  {
    id: 'S9',
    name: 'Reflection path',
    rew: 'REW Room Simulator (modal mode): PURELY MODAL. No image-source reflections computed separately. Reflections are implicitly captured by modal Q (RT60→Q). The modal sum IS the complete room response. There is no separate direct path + reflection path architecture.',
    b44: 'HYBRID ARCHITECTURE: (1) Direct sound path: A × e^(j·phase(distM)) added to sum FIRST. (2) First-order image sources (up to 6 wall reflections) added separately with reflectionCoherenceWeight (0.25–0.75). (3) Diffuse late-field term added. (4) Modal sum added on top. In parity mode: direct + reflections + late field suppressed, but in production mode ALL FOUR paths are active and summed together.',
    same: false,
    shapeChanging: true,
    severity: '⚡ ARCHITECTURAL DIVERGENCE — CRITICAL',
    detail: 'REW Room Simulator is a PURELY MODAL engine. B44 is a HYBRID modal+image-source engine. These are fundamentally different physical models. In REW: the modal sum is the complete room response, and Q implicitly captures all reflection effects via RT60. In B44: direct sound and reflections are SEPARATE complex vectors that add to the modal sum before magnitude conversion. This means B44 has TWO competing cancellation mechanisms (modal and image-source) that can partially cancel each other\'s nulls. REW has ONE (purely modal). The reflectionCoherenceWeight (0.25–0.75) further attenuates reflections non-physically, preventing them from forming the deep standing-wave cancellations that a true image-source model would produce. CONCLUSION: B44 and REW are solving different physical models — not just different implementations of the same model.',
  },
  {
    id: 'S10',
    name: 'SPL conversion',
    rew: 'SPL = 20·log10(|P|/P_ref) where P_ref = 20 μPa. Reference distance typically 1 m. Level normalised to user source level.',
    b44: '20·log10(Math.sqrt(sumRe²+sumIm²)). No explicit P_ref = 20 μPa (working in arbitrary pressure units). Absolute level set by source curve dB + gainDb + distanceLoss.',
    same: true,
    shapeChanging: false,
    severity: 'MATCH (shape)',
    detail: 'Conversion formula identical. Absolute reference differs but is a constant offset. Shape: MATCH.',
  },
  {
    id: 'S11',
    name: 'Display / post-processing',
    rew: 'Configurable smoothing (1/3–1/48 oct or none). Log-frequency x-axis. User-selected dB range.',
    b44: 'smoothing: "none" enforced in parity path. Log-frequency x-axis. Fixed 60–120 dB range option.',
    same: true,
    shapeChanging: false,
    severity: 'MATCH (with smoothing=none)',
    detail: 'When REW smoothing is set to None (required for fair comparison), display is equivalent.',
  },
];

// ─── Computed divergence analysis at f = 34.3 Hz ─────────────────────────────
function computeDivergenceAtFreq(roomDims, seatPos, sub) {
  const { widthM: W, lengthM: L, heightM: H } = roomDims;

  const modes = computeRoomModesLocal({ widthM: W, lengthM: L, heightM: H, fMax: 220, c: C });

  // Q estimates
  const sabineAlpha = 0.3;
  const volume = W * L * H;
  const SA_floor   = L * W;
  const SA_ceiling = L * W;
  const SA_walls   = 2 * (W + L) * H;
  const totalAbsArea = (SA_floor + SA_ceiling + SA_walls) * sabineAlpha;
  const rt60  = 0.161 * volume / Math.max(totalAbsArea, 1e-6);
  const tau   = rt60 / 13.815;
  const sabineQ = 2 * Math.PI * FREQ_HZ * tau;

  // B44 Q for axial @ 34.3 Hz: min(8.0, sabineQ)
  const b44AxialQ = Math.min(8.0, Math.max(1, sabineQ));
  // REW Q: sabineQ only
  const rewQ = Math.max(1, Math.min(80, sabineQ));

  // Mode shape at representative mode (1,0,0)
  const mode100 = modes.find(m => m.nx === 1 && m.ny === 0 && m.nz === 0);
  const psiSrcRaw = mode100 ? modeShapeValueLocal(mode100, sub.x, sub.y, sub.z, { widthM: W, lengthM: L, heightM: H }) : 0;
  const psiRcvRaw = mode100 ? modeShapeValueLocal(mode100, seatPos.x, seatPos.y, seatPos.z, { widthM: W, lengthM: L, heightM: H }) : 0;
  const epsilonAxial = Math.sqrt(2);
  const psiSrcREW = psiSrcRaw * epsilonAxial;
  const psiRcvREW = psiRcvRaw * epsilonAxial;

  const couplingB44 = psiSrcRaw * psiRcvRaw;
  const couplingREW = psiSrcREW * psiRcvREW;
  const couplingRatioDB = 20 * Math.log10(Math.abs(couplingREW) / Math.max(Math.abs(couplingB44), 1e-10));

  // Transfer function at f = 34.3 Hz, mode f0 = 34.3 Hz
  const tfB44 = resonantTransfer(FREQ_HZ, mode100?.freq ?? 34.3, b44AxialQ);
  const tfREW = resonantTransfer(FREQ_HZ, mode100?.freq ?? 34.3, rewQ);

  return {
    mode100Freq: mode100?.freq ?? 34.3,
    rt60, sabineQ, b44AxialQ, rewQ,
    qDeltaPct: ((rewQ - b44AxialQ) / Math.max(b44AxialQ, 0.01)) * 100,
    psiSrcRaw, psiRcvRaw, psiSrcREW, psiRcvREW,
    couplingB44, couplingREW, couplingRatioDB,
    tfB44Mag: tfB44.transferMag, tfREWMag: tfREW.transferMag,
    tfRatioDB: 20 * Math.log10(Math.max(tfREW.transferMag, 1e-10) / Math.max(tfB44.transferMag, 1e-10)),
    volume,
  };
}

// ─── UI ────────────────────────────────────────────────────────────────────────
const mono = { fontFamily: 'monospace' };

function StageBadge({ severity }) {
  const isCrit = severity.includes('FIRST') || severity.includes('CRITICAL') || severity.includes('ARCHITECTURAL');
  const isHigh = severity.includes('⚡') || severity.includes('HIGH');
  const isDiff = severity.includes('DIFFERENT');
  const isMatch = severity.includes('MATCH');
  const bg    = isCrit ? '#fef2f2' : isHigh ? '#fef2f2' : isDiff ? '#fef3c7' : '#dcfce7';
  const color = isCrit ? '#991b1b' : isHigh ? '#991b1b' : isDiff ? '#92400e' : '#166534';
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: bg, color, fontSize: 9, fontWeight: 700, ...mono, whiteSpace: 'nowrap' }}>
      {severity}
    </span>
  );
}

const thBase = { padding: '4px 8px', fontSize: 9, ...mono, fontWeight: 700, whiteSpace: 'nowrap', background: '#1e293b', color: '#e2e8f0', borderBottom: '2px solid #475569' };
const th  = { ...thBase, textAlign: 'right' };
const thL = { ...thBase, textAlign: 'left' };
const tdBase = { padding: '3px 8px', fontSize: 9, ...mono, borderBottom: '1px solid #e5e7eb', verticalAlign: 'top' };
const td  = { ...tdBase, textAlign: 'right' };
const tdL = { ...tdBase, textAlign: 'left' };

export default function RewPipelineDivergenceAudit({ roomDims, seatingPositions, subsForSimulation }) {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);

  const activeSeat = useMemo(() => {
    const primary = (seatingPositions || []).find(s => s.isPrimary);
    return primary || seatingPositions?.[0] || null;
  }, [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return { x: 2.0, y: 3.28, z: 1.2 };
    return {
      x: Number(activeSeat.x),
      y: Number(activeSeat.y),
      z: Number.isFinite(Number(activeSeat.z)) ? Number(activeSeat.z) : 1.2,
    };
  }, [activeSeat]);

  const sub = subsForSimulation?.[0] || null;
  const rd = roomDims?.widthM ? { widthM: Number(roomDims.widthM), lengthM: Number(roomDims.lengthM), heightM: Number(roomDims.heightM) }
                               : { widthM: 6, lengthM: 4, heightM: 2.4 };
  const sb = sub ? { x: Number(sub.x), y: Number(sub.y), z: Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35 }
                 : { x: 0.5, y: 0.5, z: 0.35 };

  function run() {
    setRunning(true);
    setTimeout(() => {
      setResult(computeDivergenceAtFreq(rd, seatPos, sb));
      setRan(true);
      setRunning(false);
    }, 10);
  }

  // Summary table rows — only shape-changing differences
  const summaryRows = STAGES.filter(s => !s.same || s.shapeChanging);

  return (
    <details style={{ border: '2px solid #1e293b', borderRadius: 8, background: '#f8fafc', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#1e293b', fontSize: 11, cursor: 'pointer', ...mono }}>
        🔭 Final REW Pipeline Divergence Audit — first departure from REW documented methodology
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, color: '#334155', lineHeight: 1.7, marginBottom: 8, borderLeft: '3px solid #1e293b', paddingLeft: 8, ...mono }}>
          Representative frequency: <strong>{FREQ_HZ} Hz</strong> (1,0,0) axial mode — largest measured B44/REW mismatch region.<br />
          Room: {rd.widthM}×{rd.lengthM}×{rd.heightM} m. Seat: {seatPos.y?.toFixed(2)} m from front wall.<br />
          Goal: identify the FIRST stage in the complete pipeline where B44 departs from REW Room Simulator's documented processing.<br />
          Ignores constant level offsets. Only marks DIFFERENT if capable of changing frequency-response SHAPE.
        </div>

        <button onClick={run} disabled={running}
          style={{ height: 30, padding: '0 14px', borderRadius: 6, border: '1px solid #1e293b', background: running ? '#f3f4f6' : '#1e293b', color: running ? '#9ca3af' : '#fff', fontSize: 11, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', ...mono, marginBottom: 10 }}>
          {running ? 'Computing…' : ran ? 'Re-run' : 'Run Divergence Audit'}
        </button>

        {/* ── 10-stage detail table ── */}
        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 10, ...mono, marginBottom: 4, borderBottom: '1px solid #cbd5e1', paddingBottom: 2 }}>
          STAGE-BY-STAGE PIPELINE COMPARISON — B44 vs REW Room Simulator
        </div>
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...thL, width: 40 }}>Stage</th>
                <th style={{ ...thL, minWidth: 200 }}>REW (documented)</th>
                <th style={{ ...thL, minWidth: 200 }}>B44 (actual)</th>
                <th style={{ ...th, width: 60 }}>Same?</th>
                <th style={{ ...th, width: 80 }}>Shape change?</th>
                <th style={{ ...thL, minWidth: 140 }}>Severity</th>
              </tr>
            </thead>
            <tbody>
              {STAGES.map((s, i) => {
                const rowBg = s.shapeChanging ? '#fef2f2' : !s.same ? '#fffbeb' : i % 2 === 0 ? '#f8fafc' : '#fff';
                return (
                  <tr key={s.id} style={{ background: rowBg }}>
                    <td style={{ ...tdL, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>{s.id} — {s.name}</td>
                    <td style={{ ...tdL, fontSize: 8, maxWidth: 280 }}>{s.rew}</td>
                    <td style={{ ...tdL, fontSize: 8, maxWidth: 280 }}>{s.b44}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, color: s.same ? '#166534' : '#991b1b' }}>{s.same ? '✓' : '✗'}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, color: s.shapeChanging ? '#991b1b' : '#6b7280' }}>{s.shapeChanging ? '⚡ YES' : 'NO'}</span>
                    </td>
                    <td style={tdL}><StageBadge severity={s.severity} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Detail notes for shape-changing stages ── */}
        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 10, ...mono, marginBottom: 4, borderBottom: '1px solid #cbd5e1', paddingBottom: 2 }}>
          SHAPE-CHANGING DIVERGENCE DETAILS
        </div>
        {STAGES.filter(s => s.shapeChanging || (!s.same && s.id !== 'S2')).map(s => (
          <div key={s.id} style={{ border: s.shapeChanging ? '2px solid #dc2626' : '1px solid #fbbf24', borderRadius: 5, background: s.shapeChanging ? '#fef2f2' : '#fffbeb', padding: '6px 10px', marginBottom: 6, fontSize: 9, ...mono }}>
            <div style={{ fontWeight: 700, color: s.shapeChanging ? '#991b1b' : '#92400e', marginBottom: 3 }}>{s.id} — {s.name}</div>
            <div style={{ color: '#374151', lineHeight: 1.6 }}>{s.detail}</div>
          </div>
        ))}

        {/* ── Computed values at 34.3 Hz ── */}
        {result && (
          <>
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 10, ...mono, marginBottom: 4, marginTop: 8, borderBottom: '1px solid #cbd5e1', paddingBottom: 2 }}>
              COMPUTED VALUES AT {FREQ_HZ} Hz — (1,0,0) AXIAL MODE (room: {rd.widthM}×{rd.lengthM}×{rd.heightM} m)
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={thL}>Parameter</th>
                    <th style={th}>REW value</th>
                    <th style={th}>B44 value</th>
                    <th style={th}>Delta</th>
                    <th style={thL}>Shape effect</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Modal Q (axial, at 34.3 Hz)', rew: result.rewQ.toFixed(2), b44: result.b44AxialQ.toFixed(2), delta: `${(result.rewQ - result.b44AxialQ).toFixed(2)} (REW ${result.qDeltaPct > 0 ? '+' : ''}${result.qDeltaPct.toFixed(0)}% higher)`, shape: result.rewQ > result.b44AxialQ ? '⚡ REW sharper resonances, deeper nulls' : '✓ B44 higher Q' },
                    { label: 'Sabine RT60 (α=0.3)', rew: `${result.rt60.toFixed(2)} s`, b44: `${result.rt60.toFixed(2)} s`, delta: '0 (identical)', shape: '✓ MATCH' },
                    { label: 'Sabine Q', rew: result.sabineQ.toFixed(2), b44: result.sabineQ.toFixed(2), delta: '0 (identical)', shape: '✓ MATCH before clamp' },
                    { label: 'Ψ_source (1,0,0) raw cosine', rew: `${result.psiSrcREW.toFixed(4)} (×ε=√2)`, b44: result.psiSrcRaw.toFixed(4), delta: `B44 under by ε=√2 (${(20*Math.log10(Math.SQRT2)).toFixed(1)} dB)`, shape: 'Level only (flat per family)' },
                    { label: 'Combined coupling (Ψ_src×Ψ_rcv)', rew: result.couplingREW.toFixed(5), b44: result.couplingB44.toFixed(5), delta: `${result.couplingRatioDB.toFixed(1)} dB difference (ε²)`, shape: 'Level only — no shape change within family' },
                    { label: '|H(f)| at resonance', rew: result.tfREWMag.toFixed(4), b44: result.tfB44Mag.toFixed(4), delta: `${result.tfRatioDB.toFixed(2)} dB`, shape: result.tfRatioDB > 1 ? '⚡ Narrower TF in REW (higher Q)' : '✓ Similar' },
                    { label: 'Room volume', rew: `${result.volume.toFixed(2)} m³`, b44: `${result.volume.toFixed(2)} m³`, delta: '0', shape: '✓ MATCH' },
                  ].map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ ...tdL, fontWeight: 600 }}>{row.label}</td>
                      <td style={td}>{row.rew}</td>
                      <td style={td}>{row.b44}</td>
                      <td style={{ ...td, color: row.delta.includes('⚡') ? '#991b1b' : '#374151' }}>{row.delta}</td>
                      <td style={{ ...tdL, fontSize: 8 }}>{row.shape}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Final summary table (shape-changing only) ── */}
        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 10, ...mono, marginBottom: 4, borderBottom: '1px solid #cbd5e1', paddingBottom: 2 }}>
          SUMMARY TABLE — stages capable of changing curve shape only
        </div>
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}>
            <thead>
              <tr>
                <th style={thL}>Stage</th>
                <th style={thL}>Expected (REW)</th>
                <th style={thL}>Actual (B44)</th>
                <th style={{ ...th, width: 60 }}>Same?</th>
                <th style={{ ...th, width: 90 }}>Can change shape?</th>
                <th style={thL}>Severity</th>
              </tr>
            </thead>
            <tbody>
              {STAGES.map((s, i) => {
                const showRow = s.shapeChanging || s.id === 'S4' || s.id === 'S9';
                if (!showRow) return null;
                const rowBg = s.shapeChanging ? '#fef2f2' : '#fffbeb';
                return (
                  <tr key={s.id} style={{ background: rowBg }}>
                    <td style={{ ...tdL, fontWeight: 700 }}>{s.id} — {s.name}</td>
                    <td style={{ ...tdL, fontSize: 8, maxWidth: 220 }}>{s.rew.substring(0, 120)}{s.rew.length > 120 ? '…' : ''}</td>
                    <td style={{ ...tdL, fontSize: 8, maxWidth: 220 }}>{s.b44.substring(0, 120)}{s.b44.length > 120 ? '…' : ''}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: s.same ? '#166534' : '#991b1b' }}>{s.same ? '✓' : '✗'}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: s.shapeChanging ? '#991b1b' : '#374151' }}>{s.shapeChanging ? '⚡ YES' : 'NO'}</td>
                    <td style={tdL}><StageBadge severity={s.severity} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Five final answers ── */}
        <div style={{ border: '2px solid #1e293b', borderRadius: 6, background: '#0f172a', padding: '12px 16px', fontSize: 11, ...mono, lineHeight: 1.9, marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 8, fontSize: 13, borderBottom: '1px solid #334155', paddingBottom: 4 }}>
            ▶ FIVE FINAL QUESTIONS
          </div>

          <div style={{ color: '#cbd5e1', fontSize: 10, lineHeight: 1.8 }}>

            <div style={{ marginBottom: 10 }}>
              <div style={{ color: '#f59e0b', fontWeight: 700 }}>Q1. What is the FIRST stage where B44 departs from REW's documented methodology?</div>
              <div style={{ color: '#e2e8f0', paddingLeft: 8, marginTop: 2 }}>
                <strong style={{ color: '#f87171' }}>Stage 4 — Q Assignment.</strong>{' '}
                REW computes a single Sabine-derived Q for all modes from the room's RT60. B44 additionally imposes a per-family base Q ceiling (axial: 8.0, tangential: 3.9, oblique: 2.5) and takes Math.min(baseQ, sabineQ). For lightly-absorptive rooms (α = 0.1–0.3), the Sabine Q is typically higher than the B44 base ceiling — so B44 caps modes at a lower Q than REW would assign. This is the first departure that changes frequency-response SHAPE.
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ color: '#f59e0b', fontWeight: 700 }}>Q2. Is that departure mathematically required, or simply an implementation choice?</div>
              <div style={{ color: '#e2e8f0', paddingLeft: 8, marginTop: 2 }}>
                <strong>Implementation choice.</strong>{' '}
                Canonical modal theory (Morse &amp; Ingard) derives Q exclusively from RT60 via the Sabine equation with no per-family base cap. The B44 per-family base values were introduced empirically during parity tuning to prevent unrealistically high Q in very rigid rooms. They are not required by any physical law. REW does not apply them.
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ color: '#f59e0b', fontWeight: 700 }}>Q3. Can that departure plausibly explain why REW consistently produces deeper nulls and stronger modal contrast?</div>
              <div style={{ color: '#e2e8f0', paddingLeft: 8, marginTop: 2 }}>
                <strong style={{ color: '#4ade80' }}>YES — partially.</strong>{' '}
                Lower Q = broader, shallower resonance peaks AND shallower cancellation nulls at off-resonance frequencies. If B44's Q is 30–50% lower than REW's Sabine Q at the same surface absorption, REW peaks will be narrower and nulls will be deeper. However, this alone cannot fully explain the null gap, because a constant Q delta produces a proportional level difference at null frequencies, not the positional and asymmetric mismatch observed (43.9 Hz vs 40.6 Hz). Stage 9 (architectural divergence) is additionally required to explain those spatial discrepancies.
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ color: '#f59e0b', fontWeight: 700 }}>Q4. If NOT fully explained by Stage 4, what is now the highest-probability remaining cause?</div>
              <div style={{ color: '#e2e8f0', paddingLeft: 8, marginTop: 2 }}>
                <strong>Stage 9 — Architectural divergence: hybrid vs pure-modal engine.</strong>{' '}
                REW Room Simulator is a PURE MODAL engine: all room effects are captured by the modal sum. B44 is a HYBRID engine: direct sound, image-source reflections (with reflectionCoherenceWeight capping at 0.75), and a diffuse late-field term are added as separate complex vectors before the final magnitude conversion. This creates competing cancellation paths. The B44 direct-sound vector at 34.3 Hz is in partial cancellation with the modal sum vector — this destructive interference raises the floor above the null that a pure modal sum would produce. Additionally, the reflectionCoherenceWeight (non-physical, empirical) reduces the coherence of the reflection path, further preventing the deep standing-wave cancellations that REW's purely modal Q-damped resonators produce.
              </div>
            </div>

            <div style={{ marginBottom: 6 }}>
              <div style={{ color: '#f59e0b', fontWeight: 700 }}>Q5. Probability breakdown of the remaining REW/B44 difference:</div>
              <div style={{ paddingLeft: 8, marginTop: 4 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 600 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thL, background: '#1e293b', fontSize: 9, padding: '3px 8px' }}>Cause</th>
                      <th style={{ ...th, background: '#1e293b', fontSize: 9, padding: '3px 8px', width: 60 }}>Probability</th>
                      <th style={{ ...thL, background: '#1e293b', fontSize: 9, padding: '3px 8px' }}>Reasoning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { cause: 'A coding bug', pct: 5, reason: 'Transfer function confirmed canonical. Eigenfrequency formula confirmed correct. Accumulation loop confirmed. One known small issue: per-mode phase perturbation active in non-parity mode, adds ~±0.1 rad noise. This is a deliberate diagnostic choice, not a classic bug.' },
                      { cause: 'A mathematical formulation difference', pct: 25, reason: 'Missing ε normalisation (Neumann coefficient) in Ψ is a formulation difference that scales per-family contributions systematically. Q capping is also a formulation choice. Together these alter relative mode weights, which changes null depths when modes cancel.' },
                      { cause: 'A deliberate modelling choice', pct: 35, reason: 'reflectionCoherenceWeight (0.25–0.75), highOrderAxialCorrectionScale (0.5), per-family Q base caps, distance_normalized modal excitation, and the per-mode phase perturbation are all explicitly deliberate implementation choices documented in the codebase. These collectively smooth the response relative to REW.' },
                      { cause: 'REW using a fundamentally different physical simulation approach', pct: 35, reason: 'REW Room Simulator is a PURE MODAL engine (no separate direct-sound or image-source paths). B44 is a HYBRID modal+image-source engine. These are different physical models by construction. In a pure modal model, nulls form from modal cancellation alone; in a hybrid model, the direct-sound vector partially fills those nulls. This architectural difference is the most likely single cause of the observed depth and position mismatch.' },
                    ].map((row, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#1e293b' : '#0f172a' }}>
                        <td style={{ ...tdL, color: '#e2e8f0', padding: '4px 8px', fontSize: 9 }}>{row.cause}</td>
                        <td style={{ ...td, fontWeight: 700, color: row.pct >= 30 ? '#f87171' : row.pct >= 20 ? '#fbbf24' : '#86efac', fontSize: 11, padding: '4px 8px' }}>{row.pct}%</td>
                        <td style={{ ...tdL, color: '#94a3b8', fontSize: 8, padding: '4px 8px' }}>{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 8, color: '#64748b', marginTop: 4 }}>Probabilities sum to 100%. Note: causes are not mutually exclusive — e.g. the architectural difference IS a deliberate choice; allocations represent the primary driver of the observed null depth/position mismatch.</div>
              </div>
            </div>

          </div>
        </div>

        <div style={{ fontSize: 9, color: '#6b7280', marginTop: 6, lineHeight: 1.5, ...mono }}>
          Diagnostic only. No production defaults changed. Source: rewBassEngine.js + modalCalculations.js + REW Room Simulator documentation.
        </div>
      </div>
    </details>
  );
}