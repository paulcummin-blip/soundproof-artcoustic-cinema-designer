// RewDebugPanel.jsx — REW step debug UI (read-only display, no engine logic)
// All debug data is preserved. Layout only.

import React, { useState } from "react";
import RewParityTangentialDominanceAudit from './RewParityTangentialDominanceAudit';

// ── Tiny collapsible section wrapper ──────────────────────────────────────────
function DebugSection({ title, defaultOpen = false, accentColor = '#92400e', children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: 10, border: `1px solid ${accentColor}33`, borderRadius: 6, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: `${accentColor}12`,
          border: 'none',
          padding: '5px 10px',
          fontFamily: 'monospace',
          fontSize: 11,
          fontWeight: 700,
          color: accentColor,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 10, opacity: 0.7 }}>{open ? '▲ collapse' : '▼ expand'}</span>
      </button>
      {open && (
        <div style={{ padding: '8px 10px', overflowX: 'auto' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Compact Target Summary ────────────────────────────────────────────────────
function CompactTargetSummary({ stepDebug }) {
  const targets = [34.3, 40.4, 68.6];
  const SEARCH_WINDOW_HZ = 8;

  const blocks = targets.map(target => {
    const nearest = stepDebug.reduce((best, row) => {
      const d = Math.abs(row.frequencyHz - target);
      return best === null || d < Math.abs(best.frequencyHz - target) ? row : best;
    }, null);

    if (!nearest || Math.abs(nearest.frequencyHz - target) > SEARCH_WINDOW_HZ) {
      return { target, missing: true };
    }

    const ac = nearest.applicationComparison ?? {};
    const sb = nearest.summedBeforeModes ?? {};
    const pm = nearest.postModal ?? {};

    const summary = {
      target_hz:         target,
      frequencyHz:       nearest.frequencyHz,
      preModalMagnitude: sb.preModalMagnitude  ?? null,
      modalSumRe:        ac.modalSumRe         ?? null,
      modalSumIm:        ac.modalSumIm         ?? null,
      modalSumMag:       ac.modalSumMag        ?? null,
      livePostMag:       ac.livePostMag        ?? pm.magnitude ?? null,
      strongestModeMag:  ac.strongestModeMag   ?? null,
      lowModeSumRe:      ac.lowModeSumRe       ?? null,
      lowModeSumIm:      ac.lowModeSumIm       ?? null,
      lowModeSumOfMags:  ac.lowModeSumOfMags   ?? null,
      lowModes: (nearest.lowModes ?? []).map(m => ({
        freq:            m.freq,
        nx:              m.nx,
        ny:              m.ny,
        nz:              m.nz,
        combinedCoupling: m.combinedCoupling,
        transferRe:      m.transferRe,
        transferIm:      m.transferIm,
        magnitude:       m.magnitude,
      })),
    };

    return { target, missing: false, summary };
  });

  const fullText = blocks.map(b =>
    b.missing
      ? `// Target ${b.target} Hz — no debug row found within ±8 Hz`
      : JSON.stringify(b.summary, null, 2)
  ).join('\n\n');

  return (
    <div>
      <div style={{ fontSize: 10, color: '#b45309', fontWeight: 700, marginBottom: 6 }}>
        Three target regions — select all to copy exact values for DISCUSS prompts
      </div>
      <pre style={{
        background: '#1c1917',
        color: '#fef3c7',
        borderRadius: 6,
        padding: '10px 12px',
        fontSize: 10,
        fontFamily: 'monospace',
        overflowX: 'auto',
        whiteSpace: 'pre',
        lineHeight: 1.5,
        userSelect: 'all',
        cursor: 'text',
      }}>
        {fullText}
      </pre>
    </div>
  );
}

// ── Three Raw Mode Rows (primary working area) ────────────────────────────────
function ThreeRawModeRows({ stepDebug }) {
  const rows = stepDebug;
  const targets = [34.3, 40.4, 68.6];
  const SEARCH_WINDOW_HZ = 8;

  return (
    <div>
      <div style={{ fontSize: 10, color: '#0f766e', fontWeight: 700, marginBottom: 6 }}>
        Primary comparison rows — nearest available to each target frequency
      </div>
      {targets.map(target => {
        const nearest = rows.reduce((best, row) => {
          const d = Math.abs(row.frequencyHz - target);
          return best === null || d < Math.abs(best.frequencyHz - target) ? row : best;
        }, null);

        if (!nearest || Math.abs(nearest.frequencyHz - target) > SEARCH_WINDOW_HZ) {
          return (
            <div key={target} style={{ marginBottom: 10, padding: '6px 10px', background: '#f1f5f9', borderRadius: 6, fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
              No debug row found near {target} Hz
            </div>
          );
        }

        const payload = {
          frequencyHz:           nearest.frequencyHz,
          summedBeforeModes:     nearest.summedBeforeModes     ?? null,
          postModal:             nearest.postModal             ?? null,
          lowModes:              nearest.lowModes              ?? [],
          applicationComparison: nearest.applicationComparison ?? null,
        };

        return (
          <div key={target} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: '#0f766e', marginBottom: 3, fontSize: 10 }}>
              Target {target} Hz → nearest eval: {nearest.frequencyHz.toFixed(4)} Hz
            </div>
            <pre style={{
              background: '#042f2e',
              color: '#99f6e4',
              borderRadius: 6,
              padding: '10px 12px',
              fontSize: 10,
              fontFamily: 'monospace',
              overflowX: 'auto',
              whiteSpace: 'pre',
              lineHeight: 1.5,
              userSelect: 'all',
              cursor: 'text',
            }}>
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

// ── Strongest Active Mode table ───────────────────────────────────────────────
function StrongestActiveModeTable({ stepDebug }) {
  const hasData = stepDebug.some(r => r.strongestModeFreq != null && Math.abs(r.frequencyHz - 44.5) < 4);
  if (!hasData) return <div style={{ fontSize: 10, color: '#64748b' }}>No strongest-mode data in range.</div>;

  return (
    <div>
      <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap', fontSize: 10 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #bfdbfe', color: '#1e40af' }}>
            <th style={{ textAlign: 'left', padding: '2px 5px' }}>Freq</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>modeFreq</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>type</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>nx,ny,nz</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>Q</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>srcC</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>rcvC</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>combC</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>mTfRe</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>mTfIm</th>
            <th style={{ textAlign: 'right', padding: '2px 5px', borderLeft: '1px solid #bfdbfe', fontWeight: 700 }}>TfReFinal</th>
            <th style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700 }}>TfImFinal</th>
          </tr>
        </thead>
        <tbody>
          {stepDebug
            .filter(r => r.frequencyHz >= 43 && r.frequencyHz <= 50)
            .map((row) => {
              const isNearNull = Math.abs(row.frequencyHz - 44.5) < 1.5;
              const hasMode = row.strongestModeFreq != null;
              return (
                <tr key={row.frequencyHz} style={{ borderBottom: '1px solid #dbeafe', background: isNearNull ? '#eff6ff' : undefined }}>
                  <td style={{ padding: '2px 5px', color: '#1e40af', fontWeight: isNearNull ? 700 : 500 }}>{row.frequencyHz.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeFreq.toFixed(2) : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeType : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? `${row.strongestModeNx},${row.strongestModeNy},${row.strongestModeNz}` : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeQ.toFixed(2) : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeSourceCoupling.toFixed(4) : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeReceiverCoupling.toFixed(4) : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700 }}>{hasMode ? row.strongestModeCombinedCoupling.toFixed(4) : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeTransferRe.toFixed(4) : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeTransferIm.toFixed(4) : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '2px 5px', borderLeft: '1px solid #bfdbfe', fontWeight: 700, color: '#1d4ed8' }}>{row.modalTransferReFinal != null ? row.modalTransferReFinal.toFixed(4) : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700, color: '#1d4ed8' }}>{row.modalTransferImFinal != null ? row.modalTransferImFinal.toFixed(4) : '—'}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
      <div style={{ marginTop: 4, fontSize: 10, color: '#1e40af' }}>
        srcC/rcvC/combC = source/receiver/combined coupling. mTfRe/Im = single strongest mode transfer. TfReFinal/ImFinal = full accumulated modal transfer.
      </div>
    </div>
  );
}

// ── Fixed Low-Mode Contributions table ───────────────────────────────────────
function FixedLowModeTable({ stepDebug }) {
  const hasData = stepDebug.some(r => Array.isArray(r.lowModes) && r.lowModes.length > 0);
  if (!hasData) return <div style={{ fontSize: 10, color: '#64748b' }}>No low-mode data captured.</div>;

  return (
    <div>
      <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap', fontSize: 10 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #6ee7b7', color: '#065f46' }}>
            <th style={{ textAlign: 'left', padding: '2px 5px' }}>evalHz</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>modeHz</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>nx,ny,nz</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>type</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>Q</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>srcC</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>rcvC</th>
            <th style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700 }}>combC</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>orderW</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>tfRe</th>
            <th style={{ textAlign: 'right', padding: '2px 5px' }}>tfIm</th>
            <th style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700 }}>mag</th>
          </tr>
        </thead>
        <tbody>
          {stepDebug
            .filter(r => Array.isArray(r.lowModes) && r.lowModes.length > 0)
            .flatMap(r => r.lowModes.map(m => ({ evalHz: r.frequencyHz, ...m })))
            .map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #d1fae5', background: row.nx === 2 ? '#ecfdf5' : undefined }}>
                <td style={{ padding: '2px 5px', color: '#065f46', fontWeight: 600 }}>{row.evalHz.toFixed(2)}</td>
                <td style={{ textAlign: 'right', padding: '2px 5px' }}>{row.freq.toFixed(2)}</td>
                <td style={{ textAlign: 'right', padding: '2px 5px' }}>{row.nx},{row.ny},{row.nz}</td>
                <td style={{ textAlign: 'right', padding: '2px 5px' }}>{row.type}</td>
                <td style={{ textAlign: 'right', padding: '2px 5px' }}>{Number.isFinite(row.qValue) ? row.qValue.toFixed(2) : '—'}</td>
                <td style={{ textAlign: 'right', padding: '2px 5px' }}>{Number.isFinite(row.sourceCoupling) ? row.sourceCoupling.toFixed(4) : '—'}</td>
                <td style={{ textAlign: 'right', padding: '2px 5px' }}>
                  {Number.isFinite(row.receiverCoupling)
                    ? row.receiverCoupling.toFixed(4)
                    : '—'}
                </td>
                <td style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700, color: Math.abs(row.combinedCoupling) < 0.05 ? '#dc2626' : '#065f46' }}>{Number.isFinite(row.combinedCoupling) ? row.combinedCoupling.toFixed(4) : '—'}</td>
                <td style={{ textAlign: 'right', padding: '2px 5px', color: row.orderWeight < 1 ? '#b45309' : '#065f46', fontWeight: 600 }}>{row.orderWeight != null ? row.orderWeight.toFixed(2) : '—'}</td>
                <td style={{ textAlign: 'right', padding: '2px 5px' }}>{Number.isFinite(row.transferRe) ? row.transferRe.toFixed(5) : '—'}</td>
                <td style={{ textAlign: 'right', padding: '2px 5px' }}>{Number.isFinite(row.transferIm) ? row.transferIm.toFixed(5) : '—'}</td>
                <td style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700, color: '#047857' }}>{Number.isFinite(row.magnitude) ? row.magnitude.toFixed(5) : '—'}</td>
              </tr>
            ))
          }
        </tbody>
      </table>
      <div style={{ marginTop: 4, fontSize: 10, color: '#065f46' }}>
        combC red = near-null coupling (&lt;0.05). orderW amber = reduced weight (≥2 order). (2,0,0) rows shaded green.
      </div>
    </div>
  );
}

// ── Step Debug Table (full range with focus toggle) ───────────────────────────
function StepDebugTable({ stepDebug }) {
  const [showFull, setShowFull] = useState(false);

  const focusRows = stepDebug.filter(r => Math.abs(r.frequencyHz - 44.5) < 1.5);
  const displayRows = showFull ? stepDebug : focusRows;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <button
          onClick={() => setShowFull(f => !f)}
          style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid #fde68a',
            background: showFull ? '#fde68a' : '#fffbeb', cursor: 'pointer', fontFamily: 'monospace',
            color: '#92400e', fontWeight: 600,
          }}
        >
          {showFull ? 'Show focus rows only' : 'Show full captured range'}
        </button>
        <span style={{ fontSize: 10, color: '#92400e' }}>
          {showFull ? `${stepDebug.length} rows` : `${focusRows.length} rows (±1.5 Hz around 44.5 Hz)`}
        </span>
      </div>
      <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #fde68a', color: '#78350f' }}>
            <th style={{ textAlign: 'left', padding: '2px 6px' }}>Freq</th>
            <th style={{ textAlign: 'right', padding: '2px 6px' }}>directAmp</th>
            <th style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #fde68a' }}>reflRe</th>
            <th style={{ textAlign: 'right', padding: '2px 6px' }}>reflIm</th>
            <th style={{ textAlign: 'right', padding: '2px 6px', fontWeight: 700 }}>reflMag</th>
            <th style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #fde68a' }}>lfRe</th>
            <th style={{ textAlign: 'right', padding: '2px 6px' }}>lfIm</th>
            <th style={{ textAlign: 'right', padding: '2px 6px', fontWeight: 700 }}>lfMag</th>
            <th style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #fde68a', fontWeight: 700 }}>preModalMag</th>
            <th style={{ textAlign: 'right', padding: '2px 6px', fontWeight: 700 }}>postModalMag</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row) => {
            const isNearNull = Math.abs(row.frequencyHz - 44.5) < 1.5;
            const postMag = row.postModal ? row.postModal.magnitude : null;
            return (
              <tr key={row.frequencyHz} style={{ borderBottom: '1px solid #fef3c7', background: isNearNull ? '#fef08a' : undefined }}>
                <td style={{ padding: '2px 6px', color: '#92400e', fontWeight: isNearNull ? 700 : 600 }}>{row.frequencyHz.toFixed(2)}</td>
                <td style={{ textAlign: 'right', padding: '2px 6px' }}>{row.direct.amplitude.toFixed(4)}</td>
                <td style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #fde68a' }}>{row.summedWeightedReflectionsRe.toFixed(4)}</td>
                <td style={{ textAlign: 'right', padding: '2px 6px' }}>{row.summedWeightedReflectionsIm.toFixed(4)}</td>
                <td style={{ textAlign: 'right', padding: '2px 6px', fontWeight: 700, color: '#b45309' }}>{row.summedWeightedReflectionsMag.toFixed(4)}</td>
                <td style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #fde68a' }}>{row.lateFieldRe.toFixed(4)}</td>
                <td style={{ textAlign: 'right', padding: '2px 6px' }}>{row.lateFieldIm.toFixed(4)}</td>
                <td style={{ textAlign: 'right', padding: '2px 6px', fontWeight: 700, color: '#7c3aed' }}>{row.lateFieldMag.toFixed(4)}</td>
                <td style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #fde68a', fontWeight: 700 }}>{row.summedBeforeModes.preModalMagnitude.toFixed(4)}</td>
                <td style={{ textAlign: 'right', padding: '2px 6px', fontWeight: 700, color: postMag !== null ? '#15803d' : '#9ca3af' }}>
                  {postMag !== null ? postMag.toFixed(4) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 6, fontSize: 10, color: '#92400e' }}>
        Highlighted = ±1.5 Hz around 44.5 Hz. reflMag = weighted reflections vector magnitude. lfMag = late-field amplitude.
      </div>
    </div>
  );
}

// ── Application Comparison Raw Row ────────────────────────────────────────────
function AppComparisonRawRow({ stepDebug }) {
  const target = 44.90;
  const nearest = stepDebug.reduce((best, row) => {
    const d = Math.abs(row.frequencyHz - target);
    return best === null || d < Math.abs(best.frequencyHz - target) ? row : best;
  }, null);

  if (!nearest || Math.abs(nearest.frequencyHz - target) > 5) {
    return <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>No debug row found near 44.90 Hz</div>;
  }

  const payload = {
    frequencyHz:           nearest.frequencyHz,
    summedBeforeModes:     nearest.summedBeforeModes     ?? null,
    postModal:             nearest.postModal             ?? null,
    lowModes:              nearest.lowModes              ?? [],
    applicationComparison: nearest.applicationComparison ?? null,
  };

  return (
    <div>
      <div style={{ fontWeight: 700, color: '#7c3aed', marginBottom: 4, fontSize: 10 }}>
        Nearest eval to 44.90 Hz: {nearest.frequencyHz.toFixed(4)} Hz
      </div>
      <pre style={{
        background: '#1e1b4b', color: '#e0e7ff', borderRadius: 6,
        padding: '10px 12px', fontSize: 10, fontFamily: 'monospace',
        overflowX: 'auto', whiteSpace: 'pre', lineHeight: 1.5,
        userSelect: 'all', cursor: 'text',
      }}>
        {JSON.stringify(payload, null, 2)}
      </pre>
      <div style={{ marginTop: 4, fontSize: 10, color: '#7c3aed' }}>Select all to copy full JSON row.</div>
    </div>
  );
}

// ── 68.6 Hz Vector Breakdown ─────────────────────────────────────────────────
function VectorBreakdown686({ stepDebug }) {
  const target = 68.6;
  const nearest = stepDebug.reduce((best, row) => {
    const d = Math.abs(row.frequencyHz - target);
    return best === null || d < Math.abs(best.frequencyHz - target) ? row : best;
  }, null);

  if (!nearest || Math.abs(nearest.frequencyHz - target) > 8) {
    return <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>No debug row found near 68.6 Hz</div>;
  }

  const angleDeg = (re, im) => (
    Number.isFinite(re) && Number.isFinite(im)
      ? (Math.atan2(im, re) * 180) / Math.PI
      : null
  );

  const components = nearest.applicationComparison?.preModalComponents ?? {};
  const pre = nearest.summedBeforeModes ?? {};
  const app = nearest.applicationComparison ?? {};
  const post = nearest.postModal ?? {};

  const payload = {
    frequencyHz: nearest.frequencyHz,
    directMag: components.direct?.magnitude ?? null,
    reflectedMag: components.reflections?.magnitude ?? null,
    lateFieldMag: components.lateField?.magnitude ?? null,
    preModalMag: pre.preModalMagnitude ?? app.preModalMagnitude ?? null,
    modalSumMag: app.modalSumMag ?? null,
    postModalMag: post.magnitude ?? app.livePostMag ?? null,
    preModalAngleDeg: angleDeg(pre.sumRe ?? app.prevRe, pre.sumIm ?? app.prevIm),
    modalSumAngleDeg: angleDeg(app.modalSumRe, app.modalSumIm),
    postModalAngleDeg: angleDeg(post.sumRe ?? app.livePostRe, post.sumIm ?? app.livePostIm),
  };

  return (
    <pre style={{
      background: '#111827', color: '#d1fae5', borderRadius: 6,
      padding: '10px 12px', fontSize: 10, fontFamily: 'monospace',
      overflowX: 'auto', whiteSpace: 'pre', lineHeight: 1.5,
      userSelect: 'all', cursor: 'text',
    }}>
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function RewDebugPanel({ stepDebug, selectedSeatIds, disableModalPropagationPhase = false, propagationPhaseScale, roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  if (!stepDebug?.length) return null;

  return (
    <div style={{ border: '1px solid #f59e0b', borderRadius: 8, background: '#fffbeb', padding: 12, fontSize: 11, fontFamily: 'monospace' }}>
      {/* Temporary experiment banner */}
      {propagationPhaseScale === 1.0 && (
        <div style={{
          marginBottom: 10,
          padding: '6px 10px',
          borderRadius: 5,
          background: '#fef08a',
          border: '2px solid #ca8a04',
          color: '#713f12',
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: '0.02em',
        }}>
          ⚗ Propagation Phase Test Active (1.0) — Temporary REW parity experiment only
        </div>
      )}
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 2 }}>
        REW Step Debug — seat [{selectedSeatIds?.[0] ?? '—'}], sub[0]
      </div>
      <div style={{ marginBottom: 10, fontSize: 11, color: '#78350f' }}>
        <strong>Engine:</strong>{' '}
        <span style={{ background: '#213428', color: '#fff', borderRadius: 4, padding: '1px 7px' }}>
          Clean legacy transfer baseline
        </span>
        <div style={{ marginTop: 6 }}>
          <strong>Modal propagation phase disabled:</strong> {disableModalPropagationPhase ? 'YES' : 'NO'}
        </div>
      </div>

      {/* ① Compact Target Summary — PRIMARY, open by default */}
      <DebugSection title="Compact Target Summary" defaultOpen={true} accentColor="#b45309">
        <CompactTargetSummary stepDebug={stepDebug} />
      </DebugSection>

      {/* ② 68.6 Hz Vector Breakdown — closed by default */}
      <DebugSection title="68.6 Hz vector breakdown" defaultOpen={false} accentColor="#047857">
        <VectorBreakdown686 stepDebug={stepDebug} />
      </DebugSection>

      {/* ③ Three Raw Mode Rows — closed by default */}
      <DebugSection title="Three Raw Mode Rows" defaultOpen={false} accentColor="#0f766e">
        <ThreeRawModeRows stepDebug={stepDebug} />
      </DebugSection>

      {/* ② Strongest Active Mode — closed by default */}
      <DebugSection title="Strongest Active Mode" defaultOpen={false} accentColor="#1e40af">
        <StrongestActiveModeTable stepDebug={stepDebug} />
      </DebugSection>

      {/* ③ Fixed Low-Mode Contributions — closed by default */}
      <DebugSection title="Fixed Low-Mode Contributions" defaultOpen={false} accentColor="#065f46">
        <FixedLowModeTable stepDebug={stepDebug} />
      </DebugSection>

      {/* ④ Step Debug Table — closed by default */}
      <DebugSection title="Step Debug Table" defaultOpen={false} accentColor="#92400e">
        <StepDebugTable stepDebug={stepDebug} />
      </DebugSection>

      {/* ⑤ Application Comparison Raw Row — closed by default */}
      <DebugSection title="Application Comparison Raw Row" defaultOpen={false} accentColor="#7c3aed">
        <AppComparisonRawRow stepDebug={stepDebug} />
      </DebugSection>

      {/* ⑥ REW Parity Tangential Dominance Audit — closed by default */}
      <DebugSection title="REW Parity Tangential Dominance Audit" defaultOpen={false} accentColor="#be185d">
        <RewParityTangentialDominanceAudit
          roomDims={roomDims}
          seat={seat}
          sub={sub}
          surfaceAbsorption={surfaceAbsorption}
          activeSettings={activeSettings}
        />
      </DebugSection>
    </div>
  );
}