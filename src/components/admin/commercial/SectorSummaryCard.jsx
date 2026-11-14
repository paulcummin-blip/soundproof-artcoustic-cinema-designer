/**
 * SectorSummaryCard.jsx
 * --------------------
 * One clickable sector summary card for the Commercial Intelligence overview.
 * Shows account count, project count, live pipeline count, and verified
 * monetary pipeline value.
 */

import React from 'react';
import { formatGBPValue } from '@/lib/commercial/commercialDashboard/verifiedValue';

const ACCENTS = {
  premium_partners: '#213428',
  trade_accounts: '#625143',
  richer_sounds: '#2C5AA0',
  international: '#3E4349',
  unclassified: '#9A9A9A',
};

export default function SectorSummaryCard({ sectorModel, onClick, active }) {
  if (!sectorModel) return null;
  const accent = ACCENTS[sectorModel.key] || '#3E4349';

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        cursor: 'pointer',
        background: active ? '#F8F8F7' : '#FFFFFF',
        border: `1px solid ${active ? accent : '#DCDBD6'}`,
        borderRadius: 12,
        padding: 20,
        transition: 'all 0.15s ease',
        boxShadow: active ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 4, height: 20, background: accent, borderRadius: 2 }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1B1A1A' }}>
          {sectorModel.label}
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#625143', marginBottom: 14 }}>
        {sectorModel.description}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Stat label="Accounts" value={sectorModel.accountCount} />
        <Stat label="Projects" value={sectorModel.projectCount} />
        <Stat label="Live pipeline" value={sectorModel.liveCount} />
        <Stat label="Won" value={sectorModel.wonCount} />
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #DCDBD6' }}>
        <div style={{ fontSize: 11, color: '#625143', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
          Verified pipeline value (inc VAT)
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#213428' }}>
          {formatGBPValue(sectorModel.monetaryPipelineValue)}
        </div>
        <div style={{ fontSize: 11, color: '#625143', marginTop: 2 }}>
          {sectorModel.monetaryPipelineProjectCount} project{sectorModel.monetaryPipelineProjectCount === 1 ? '' : 's'} with verified value
        </div>
      </div>
      {sectorModel.key === 'unclassified' && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#9A6A00', fontWeight: 600 }}>
          ⚠ Territory not verified — needs admin review
        </div>
      )}
    </button>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#625143', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1B1A1A' }}>
        {value}
      </div>
    </div>
  );
}