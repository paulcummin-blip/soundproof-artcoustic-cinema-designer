// components/room/LcrAcousticCentreGuidanceCard.jsx
// Report-style guidance card for the LCR acoustic-centre height.
// Pure presentational — receives the active height guidance object and renders
// Recommended / Allowed range / Current / Status in a clean, scannable layout.

import React from 'react';
import { formatHeightM } from '@/components/utils/acoustics/acousticCentreBand';

const STATUS_META = {
  ideal: { label: 'Ideal', color: '#2d7a4f' },
  below: { label: 'Below range', color: '#b45309' },
  above: { label: 'Above range', color: '#b45309' },
  unknown: { label: 'Unknown', color: '#6b7280' },
};

function Row({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: 11, color: '#888' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: strong ? 700 : 600, color: '#1B1A1A' }}>{value}</span>
    </div>
  );
}

export default function LcrAcousticCentreGuidanceCard({ guidance }) {
  if (!guidance?.isValid) return null;

  const { status, minHeightM, maxHeightM, idealHeightM, currentAcousticCentreM, placementOffsetM, mode } = guidance;
  const meta = STATUS_META[status] || STATUS_META.unknown;

  const title = mode === 'tv_soundbar'
    ? 'TV SOUNDBAR HEIGHT GUIDANCE'
    : mode === 'tv_separate_lcr'
      ? 'TV L/R HEIGHT GUIDANCE'
      : 'ACOUSTIC CENTRE GUIDANCE';

  return (
    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#F8F8F7', border: '1px solid #E6E4DD' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#625143', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Recommended — visually prominent */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: '#888' }}>Recommended</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#213428' }}>{formatHeightM(idealHeightM)}</span>
        </div>

        {mode === 'tv_soundbar' ? (
          <>
            <Row label="Offset below TV" value={formatHeightM(placementOffsetM)} />
            <Row label="Current" value={currentAcousticCentreM !== null ? formatHeightM(currentAcousticCentreM) : '—'} />
          </>
        ) : mode === 'tv_separate_lcr' ? (
          <Row label="Current" value={currentAcousticCentreM !== null ? formatHeightM(currentAcousticCentreM) : '—'} />
        ) : (
          <>
            <Row label="Allowed range" value={`${formatHeightM(minHeightM)} – ${formatHeightM(maxHeightM)}`} />
            <Row label="Current" value={currentAcousticCentreM !== null ? formatHeightM(currentAcousticCentreM) : '—'} />
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2, paddingTop: 6, borderTop: '1px solid #E6E4DD' }}>
          <span style={{ fontSize: 11, color: '#888' }}>Status</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{meta.label}</span>
        </div>
      </div>
    </div>
  );
}