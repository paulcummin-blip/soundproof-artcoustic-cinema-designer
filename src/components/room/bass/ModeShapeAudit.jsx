/**
 * ModeShapeAudit — Diagnostic only. Does not touch simulation output.
 *
 * For each dominant mode, shows:
 *   - room dims, mode freq, source pos, seat pos
 *   - individual cosine terms for both source and receiver
 *   - Ψsource, Ψreceiver, Ψsource × Ψreceiver
 *
 * Uses modeShapeValueLocal() from modalCalculations — the exact same function
 * the engine calls — so this is a direct window into spatial coupling.
 */

import React from 'react';
import { modeShapeValueLocal } from '@/components/room/bass/core/modalCalculations';

const SPEED_OF_SOUND_MPS = 343;

const AUDIT_MODES = [
  { nx: 2, ny: 0, nz: 0, label: '(2,0,0)' },
  { nx: 0, ny: 3, nz: 0, label: '(0,3,0)' },
  { nx: 2, ny: 2, nz: 0, label: '(2,2,0)' },
  { nx: 0, ny: 4, nz: 0, label: '(0,4,0)' },
];

function modeFreq({ nx, ny, nz }, { widthM, lengthM, heightM }) {
  return (SPEED_OF_SOUND_MPS / 2) * Math.sqrt(
    Math.pow(nx / Math.max(widthM,  1e-9), 2) +
    Math.pow(ny / Math.max(lengthM, 1e-9), 2) +
    Math.pow(nz / Math.max(heightM, 1e-9), 2)
  );
}

// Returns each individual cosine term and the Ψ product
function shapeCosines(mode, x, y, z, roomDims) {
  const { widthM, lengthM, heightM } = roomDims;
  const cosX = mode.nx > 0 ? Math.cos(mode.nx * Math.PI * x / Math.max(widthM,  1e-9)) : 1;
  const cosY = mode.ny > 0 ? Math.cos(mode.ny * Math.PI * y / Math.max(lengthM, 1e-9)) : 1;
  const cosZ = mode.nz > 0 ? Math.cos(mode.nz * Math.PI * z / Math.max(heightM, 1e-9)) : 1;
  const psi  = cosX * cosY * cosZ;
  return { cosX, cosY, cosZ, psi };
}

function fmt(v, d = 5) {
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(d);
}

function psiColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  const a = Math.abs(v);
  if (a >= 0.8) return '#4ade80';
  if (a >= 0.4) return '#fbbf24';
  if (a >= 0.1) return '#fb923c';
  return '#f87171'; // near null — weak coupling
}

function productColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  const a = Math.abs(v);
  if (a >= 0.5) return '#4ade80';
  if (a >= 0.2) return '#fbbf24';
  if (a >= 0.05) return '#fb923c';
  return '#f87171';
}

const TH = {
  padding: '4px 8px', fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
  background: '#1c1917', color: '#d6d3d1', textAlign: 'left',
  borderBottom: '2px solid #292524', whiteSpace: 'nowrap',
};
const TD = { padding: '4px 8px', fontSize: 9, fontFamily: 'monospace', verticalAlign: 'top' };

const ROW_HIGHLIGHT = '#172554';

function CosineRow({ label, cosX, cosY, cosZ, nx, ny, nz, psi, highlight }) {
  return (
    <tr style={{ background: highlight ? ROW_HIGHLIGHT : undefined, borderBottom: '1px solid #1c1917' }}>
      <td style={{ ...TD, color: '#a8a29e', fontWeight: 700 }}>{label}</td>

      {/* cos(nπx/Lx) */}
      <td style={{ ...TD, color: nx > 0 ? '#e7e5e4' : '#44403c' }}>
        {nx > 0 ? fmt(cosX) : <span style={{ color: '#44403c' }}>1 (n=0)</span>}
      </td>

      {/* cos(mπy/Ly) */}
      <td style={{ ...TD, color: ny > 0 ? '#e7e5e4' : '#44403c' }}>
        {ny > 0 ? fmt(cosY) : <span style={{ color: '#44403c' }}>1 (m=0)</span>}
      </td>

      {/* cos(pπz/Lz) */}
      <td style={{ ...TD, color: nz > 0 ? '#e7e5e4' : '#44403c' }}>
        {nz > 0 ? fmt(cosZ) : <span style={{ color: '#44403c' }}>1 (p=0)</span>}
      </td>

      {/* Ψ */}
      <td style={{ ...TD, fontWeight: 700, color: psiColor(psi) }}>
        {fmt(psi)}
      </td>
    </tr>
  );
}

function ModeCard({ mode, roomDims, source, seat }) {
  const f0 = modeFreq(mode, roomDims);
  const src = shapeCosines(mode, source.x, source.y, source.z, roomDims);
  const rcv = shapeCosines(mode, seat.x,   seat.y,   seat.z,   roomDims);
  const product = src.psi * rcv.psi;

  // Also verify via the canonical function
  const psiSrcCanonical = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims);
  const psiRcvCanonical = modeShapeValueLocal(mode, seat.x,   seat.y,   seat.z,   roomDims);
  const productCanonical = psiSrcCanonical * psiRcvCanonical;
  const parity = Math.abs(product - productCanonical) < 1e-10;

  return (
    <div style={{
      marginBottom: 18, border: '1px solid #292524', borderRadius: 7,
      background: '#0f0e0d', overflow: 'hidden',
    }}>
      {/* Mode header */}
      <div style={{
        padding: '6px 12px', background: '#1c1917',
        borderBottom: '1px solid #292524',
        display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 800, color: '#e7e5e4', fontSize: 12, fontFamily: 'monospace' }}>
          {mode.label}
        </span>
        <span style={{ color: '#a8a29e', fontSize: 10, fontFamily: 'monospace' }}>
          f₀ = <strong style={{ color: '#fbbf24' }}>{f0.toFixed(2)} Hz</strong>
        </span>
        <span style={{ color: '#a8a29e', fontSize: 9, fontFamily: 'monospace' }}>
          (n={mode.nx}, m={mode.ny}, p={mode.nz})
        </span>
        <span style={{
          fontSize: 9, fontFamily: 'monospace', marginLeft: 'auto',
          color: parity ? '#4ade80' : '#f87171',
        }}>
          {parity ? '✓ parity OK' : '⚠ modeShapeValueLocal mismatch'}
        </span>
      </div>

      {/* Room + position context */}
      <div style={{
        padding: '5px 12px', borderBottom: '1px solid #1c1917',
        display: 'flex', gap: 24, flexWrap: 'wrap',
        fontSize: 9, fontFamily: 'monospace', color: '#78716c',
      }}>
        <span>Room: <strong style={{ color: '#d6d3d1' }}>
          {roomDims.widthM.toFixed(2)}W × {roomDims.lengthM.toFixed(2)}L × {roomDims.heightM.toFixed(2)}H m
        </strong></span>
        <span>Source: <strong style={{ color: '#93c5fd' }}>
          ({source.x.toFixed(3)}, {source.y.toFixed(3)}, {source.z.toFixed(3)}) m
        </strong></span>
        <span>Seat (MLP): <strong style={{ color: '#86efac' }}>
          ({seat.x.toFixed(3)}, {seat.y.toFixed(3)}, {seat.z.toFixed(3)}) m
        </strong></span>
      </div>

      {/* Cosine table */}
      <div style={{ overflowX: 'auto', padding: '8px 12px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 80 }}>Position</th>
              <th style={TH}>cos(n·π·x / Lx)</th>
              <th style={TH}>cos(m·π·y / Ly)</th>
              <th style={TH}>cos(p·π·z / Lz)</th>
              <th style={{ ...TH, color: '#fbbf24' }}>Ψ (product)</th>
            </tr>
          </thead>
          <tbody>
            <CosineRow
              label="Source"
              cosX={src.cosX} cosY={src.cosY} cosZ={src.cosZ}
              nx={mode.nx} ny={mode.ny} nz={mode.nz}
              psi={src.psi}
              highlight={false}
            />
            <CosineRow
              label="Seat"
              cosX={rcv.cosX} cosY={rcv.cosY} cosZ={rcv.cosZ}
              nx={mode.nx} ny={mode.ny} nz={mode.nz}
              psi={rcv.psi}
              highlight={false}
            />
          </tbody>
        </table>
      </div>

      {/* Coupling product summary */}
      <div style={{
        margin: '0 12px 10px',
        padding: '6px 12px', borderRadius: 5,
        background: '#1c1917', border: '1px solid #292524',
        display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center',
        fontFamily: 'monospace', fontSize: 10,
      }}>
        <span style={{ color: '#78716c' }}>
          Ψsource = <strong style={{ color: psiColor(src.psi) }}>{fmt(src.psi)}</strong>
        </span>
        <span style={{ color: '#78716c' }}>
          Ψreceiver = <strong style={{ color: psiColor(rcv.psi) }}>{fmt(rcv.psi)}</strong>
        </span>
        <span style={{ color: '#78716c', marginLeft: 'auto' }}>
          Ψsource × Ψreceiver =&nbsp;
          <strong style={{ fontSize: 12, color: productColor(product) }}>
            {fmt(product, 6)}
          </strong>
        </span>
        {!parity && (
          <span style={{ color: '#f87171', fontSize: 9 }}>
            canonical: {fmt(productCanonical, 6)}
          </span>
        )}
      </div>

      {/* Interpretation */}
      <div style={{
        margin: '0 12px 10px',
        fontSize: 9, fontFamily: 'monospace', color: '#44403c', lineHeight: 1.7,
      }}>
        {Math.abs(product) < 0.02 && (
          <span style={{ color: '#f87171' }}>
            ⚠ Near-null coupling — mode is spatially cancelled at this source/receiver pair.
            This mode should contribute near-zero energy at the listener.
          </span>
        )}
        {Math.abs(product) >= 0.02 && Math.abs(product) < 0.1 && (
          <span style={{ color: '#fb923c' }}>
            Weak coupling — mode will contribute modest energy.
          </span>
        )}
        {Math.abs(product) >= 0.1 && Math.abs(product) < 0.5 && (
          <span style={{ color: '#fbbf24' }}>
            Moderate coupling — mode will contribute noticeably to the field.
          </span>
        )}
        {Math.abs(product) >= 0.5 && (
          <span style={{ color: '#4ade80' }}>
            Strong coupling — mode is well-excited and well-received at MLP.
          </span>
        )}
      </div>
    </div>
  );
}

export default function ModeShapeAudit({ roomDims, subs, seat }) {
  const hasRoom = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);
  const hasSub  = subs && subs.length > 0;
  const hasSeat = !!(seat?.x !== undefined && seat?.y !== undefined && seat?.z !== undefined);

  // Use first sub as source; fallback to room centre
  const source = hasSub
    ? { x: subs[0].x ?? roomDims.widthM / 2, y: subs[0].y ?? 0.3, z: subs[0].z ?? 0.3 }
    : hasRoom
      ? { x: roomDims.widthM / 2, y: 0.3, z: 0.3 }
      : null;

  const receiver = hasSeat
    ? { x: seat.x, y: seat.y, z: seat.z }
    : hasRoom
      ? { x: roomDims.widthM / 2, y: roomDims.lengthM * 0.6, z: 1.2 }
      : null;

  return (
    <div style={{
      marginTop: 12, border: '1px solid #292524', borderRadius: 8,
      background: '#0c0a09', padding: '10px 12px',
    }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, fontFamily: 'monospace', marginBottom: 3 }}>
        Mode Shape Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no simulation engine call
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', fontFamily: 'monospace', marginBottom: 10, lineHeight: 1.7 }}>
        Verifies spatial coupling Ψsource × Ψreceiver for each dominant mode using modeShapeValueLocal() directly.<br />
        Near-zero product → mode is spatially nulled at this source/seat pair regardless of Q or transfer function.
      </div>

      {!hasRoom && (
        <div style={{ fontSize: 10, color: '#fbbf24', fontFamily: 'monospace', marginBottom: 8 }}>
          ⚠ Requires room dimensions.
        </div>
      )}

      {/* Fallback notices */}
      {hasRoom && !hasSub && (
        <div style={{ fontSize: 9, color: '#78716c', fontFamily: 'monospace', marginBottom: 6 }}>
          No sub position available — using room-centre source ({(roomDims.widthM / 2).toFixed(2)}, 0.30, 0.30) m.
        </div>
      )}
      {hasRoom && !hasSeat && (
        <div style={{ fontSize: 9, color: '#78716c', fontFamily: 'monospace', marginBottom: 6 }}>
          No seat/MLP position available — using estimated receiver ({(roomDims.widthM / 2).toFixed(2)}, {(roomDims.lengthM * 0.6).toFixed(2)}, 1.20) m.
        </div>
      )}

      {/* Mode cards */}
      {hasRoom && source && receiver && AUDIT_MODES.map(mode => (
        <ModeCard
          key={mode.label}
          mode={mode}
          roomDims={roomDims}
          source={source}
          seat={receiver}
        />
      ))}

      {/* Legend */}
      {hasRoom && (
        <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#44403c', lineHeight: 1.8, borderTop: '1px solid #1c1917', paddingTop: 6, marginTop: 4 }}>
          <strong style={{ color: '#78716c' }}>Ψ coupling colour key:</strong>{' '}
          <span style={{ color: '#4ade80' }}>≥ 0.8 strong</span> ·{' '}
          <span style={{ color: '#fbbf24' }}>≥ 0.4 moderate</span> ·{' '}
          <span style={{ color: '#fb923c' }}>≥ 0.1 low</span> ·{' '}
          <span style={{ color: '#f87171' }}>&lt; 0.1 weak/null</span><br />
          Product colour key (Ψs × Ψr):{' '}
          <span style={{ color: '#4ade80' }}>≥ 0.5 strong</span> ·{' '}
          <span style={{ color: '#fbbf24' }}>≥ 0.2 moderate</span> ·{' '}
          <span style={{ color: '#fb923c' }}>≥ 0.05 low</span> ·{' '}
          <span style={{ color: '#f87171' }}>&lt; 0.05 near-null</span>
        </div>
      )}
    </div>
  );
}