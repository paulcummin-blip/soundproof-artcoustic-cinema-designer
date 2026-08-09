import React, { useMemo } from 'react';

// ---------------------------------------------------------------------------
// SpeakerPositionPlan
// A print-ready installer set-out drawing for the RP22 report (Page 6).
// Adopts Page 18 drawing language: Futura PT Light headings, Didact Gothic body,
// strong room boundary, restrained dimensions, clean drawing/data separation.
// Drawings first — no standalone schedule tables.
// ---------------------------------------------------------------------------

const HEADING_FONT = '"Futura PT Light", "Century Gothic", sans-serif';
const BODY_FONT = '"Didact Gothic", "Century Gothic", sans-serif';

const COLORS = {
  text: '#1B1A1A',
  muted: '#625143',
  border: '#D9D5CE',
  dim: '#8b8b8b',
  divider: '#E6E4DD',
};

function fmtM(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)} m` : '—';
}

export default function SpeakerPositionPlan({
  projectName,
  clientName,
  planImageDataUrl,
  roomWidthM,
  roomLengthM,
  screenFrontPlaneM,
  projector,
}) {
  // ── Projector throw (D2.1 canonical: lens to screen) ────────────────────
  const throwDistM = useMemo(() => {
    const lensY = Number(projector?.y_lens_m);
    const screenY = Number(screenFrontPlaneM);
    if (!Number.isFinite(lensY) || !Number.isFinite(screenY)) return null;
    return Math.abs(lensY - screenY);
  }, [projector, screenFrontPlaneM]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', background: '#FFFFFF', padding: '8mm 10mm', fontFamily: BODY_FONT, color: COLORS.text }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, borderBottom: `1.5px solid ${COLORS.text}`, paddingBottom: 5 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: HEADING_FONT, color: COLORS.text, letterSpacing: '0.01em' }}>
            SPEAKER POSITION PLAN
          </div>
          {(projectName || clientName) && (
            <div style={{ fontSize: 9, color: COLORS.muted, marginTop: 2 }}>
              {projectName && <span style={{ fontWeight: 600 }}>{projectName}</span>}
              {projectName && clientName && <span style={{ margin: '0 6px', color: COLORS.border }}>|</span>}
              {clientName && <span>{clientName}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 7, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Drawing</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: COLORS.text }}>SP-01</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 7, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: COLORS.text }}>NOT FOR SCALING</div>
          </div>
        </div>
      </div>

      {/* ── Plan image ── */}
      <div style={{ width: '100%', border: `1px solid ${COLORS.border}`, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
        {planImageDataUrl ? (
          <img src={planImageDataUrl} alt="Speaker position plan" style={{ width: '100%', display: 'block', maxHeight: '115mm', objectFit: 'contain' }} />
        ) : (
          <div style={{ height: '115mm', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 10 }}>
            Plan capture unavailable
          </div>
        )}
      </div>

      {/* ── Coordinate datum + key dimensions ── */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, fontSize: 8, color: COLORS.muted, gap: 10 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <strong style={{ color: COLORS.text }}>Coordinate datum:</strong>{' '}
          X from left wall · Y from front datum · Z centre height AFFL
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <span style={{ whiteSpace: 'nowrap' }}><strong style={{ color: COLORS.text }}>Room:</strong> {fmtM(roomWidthM)} × {fmtM(roomLengthM)}</span>
          {Number.isFinite(Number(screenFrontPlaneM)) && <span style={{ whiteSpace: 'nowrap' }}><strong style={{ color: COLORS.text }}>Screen plane:</strong> {fmtM(screenFrontPlaneM)}</span>}
          {throwDistM != null && <span style={{ whiteSpace: 'nowrap' }}><strong style={{ color: COLORS.text }}>Throw:</strong> {throwDistM.toFixed(2)} m</span>}
        </div>
      </div>

      {/* ── Notes ── */}
      <div style={{ marginTop: 'auto', paddingTop: 6, borderTop: `1px solid ${COLORS.divider}`, fontSize: 7.5, color: COLORS.muted, lineHeight: 1.5 }}>
        <div>Dimensions govern. Do not scale from drawing.</div>
        <div>All positions are generated from the current Sound Proof design.</div>
        <div>Coordinates refer to speaker/subwoofer centres unless stated otherwise.</div>
        <div>Verify final site dimensions and mounting requirements before installation.</div>
      </div>

    </div>
  );
}