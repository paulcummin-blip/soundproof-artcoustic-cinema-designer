// components/pricing/DesignRatingSummary.jsx
import React from 'react';

/**
 * Compact Artcoustic System Design Rating card for the sidebar.
 * Same visual weight/footprint as the System Price summary card.
 * Shows displayPercentage, status, and coverage.
 *
 * Props:
 *   showAsdr   — boolean, whether to render (false = return null)
 *   rating     — { status, displayPercentage, coveragePercent } | null
 */
export default function DesignRatingSummary({ showAsdr = false, rating = null }) {
  if (!showAsdr) return null;

  const status = rating?.status || 'NOT_ASSESSED';
  const pct = rating?.displayPercentage;
  const coverage = rating?.coveragePercent;

  const displayPct = pct != null ? Math.round(pct) : null;
  const displayCoverage = coverage != null ? Math.round(coverage) : null;

  const isProvisional = status === 'PROVISIONAL';
  const isNotAssessed = status === 'NOT_ASSESSED';

  return (
    <div
      style={{
        padding: '12px 16px',
        background: '#FFFFFF',
        border: '1px solid #DCDBD6',
        borderRadius: '8px',
        margin: '0 16px 12px 16px',
      }}
      title="Proprietary Sound Proof design metric. Not part of CEDIA RP22 or RP23."
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: '#3E4349', marginBottom: 8, letterSpacing: '0.04em' }}>
        ARTCOUSTIC SYSTEM
        <br />
        DESIGN RATING
      </div>

      <div>
        {isNotAssessed ? (
          <div style={{ fontSize: 18, fontWeight: 700, color: '#9B9890' }}>
            NOT ASSESSED
          </div>
        ) : (
          <div style={{ fontSize: 22, fontWeight: 700, color: '#213428' }}>
            {displayPct != null ? `${displayPct}%` : '—'}
          </div>
        )}
      </div>

      <div style={{ fontSize: 10, color: '#625143', marginTop: 4 }}>
        {isNotAssessed
          ? ''
          : isProvisional
          ? `PROVISIONAL${displayCoverage != null ? ` · ${displayCoverage}% COVERAGE` : ''}`
          : displayCoverage != null
          ? `${displayCoverage}% COVERAGE`
          : ''}
      </div>
    </div>
  );
}