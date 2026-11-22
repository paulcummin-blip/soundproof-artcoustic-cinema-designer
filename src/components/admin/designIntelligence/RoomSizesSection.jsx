/**
 * RoomSizesSection.jsx
 * ---------------------
 * Floor area in m², four quartile bands, average and median, and the
 * number of valid rooms. Excludes unconfirmed or invalid dimensions.
 */

import React from 'react';
import { BRAND, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import { formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import IntelligenceCard, { StatCard } from './IntelligenceCard';
import { buildRoomSizeSummary } from '@/lib/commercial/designIntelligence/roomSizeAnalysis';

export default function RoomSizesSection({ families }) {
  const summary = buildRoomSizeSummary(families);

  return (
    <IntelligenceCard
      title="Room Sizes"
      subtitle="Floor area in m². Excludes unconfirmed dimensions (room_dimensions_edited must be true) and non-positive values."
    >
      {summary.validRoomCount === 0 ? (
        <div style={{ fontSize: 13, color: BRAND.muted }}>
          No valid room dimensions in this sector.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
          }}>
            <StatCard label="Valid rooms" value={formatNumber(summary.validRoomCount)} />
            <StatCard label="Average" value={`${summary.average ? summary.average.toFixed(1) : '—'} m²`} />
            <StatCard label="Median" value={`${summary.median ? summary.median.toFixed(1) : '—'} m²`} />
            <StatCard label="Smallest" value={`${summary.min ? summary.min.toFixed(1) : '—'} m²`} />
            <StatCard label="Largest" value={`${summary.max ? summary.max.toFixed(1) : '—'} m²`} />
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Quartile bands (interpolated)
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {summary.quartileBands.map((band) => (
                <div key={band.label} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: '#F8F8F7',
                  border: `1px solid ${BRAND.border}`,
                  borderRadius: 8,
                  fontSize: 13,
                }}>
                  <span style={{ fontWeight: 600, color: BRAND.text }}>{band.label}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: BRAND.muted }}>
                      {band.max === Infinity
                        ? `> ${band.min ? band.min.toFixed(1) : '—'} m²`
                        : `${band.min ? band.min.toFixed(1) : '—'} – ${band.max ? band.max.toFixed(1) : '—'} m²`}
                    </span>
                    <Pill tone="neutral">{band.count} project(s)</Pill>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 11, color: BRAND.muted }}>
            Quartiles use the linear interpolation method. A minimum of 4 valid rooms is required for interpolated boundaries.
          </div>
        </div>
      )}
    </IntelligenceCard>
  );
}