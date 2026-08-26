// components/pricing/DesignRatingSummary.jsx
// ------------------------------------------
// Compact Artcoustic System Design Rating sidebar card.
//
// Hierarchy: the four design categories lead (Spatial Resolution, Dynamic
// Range, Timbre Matching, Screen / Viewing Geometry), followed by a divider
// and the overall Design Performance Index summary for Primary / Secondary /
// All seating scopes.
//
// Category results use the MODAL achieved level (most frequently achieved
// level across the relevant parameters/seats) — never an average. Screen /
// Viewing Geometry retains RP23 terminology. No ASDR/DPI maths, thresholds,
// weights, parameter authority, or category membership are changed.

import React from 'react';
import RP22GradingPill from '@/components/ui/RP22GradingPill';
import {
  getRoomDesignRatingDesignation,
  getDesignPerformanceIndex,
  getCategoryModalSummaries,
  formatModalLevels,
  formatLevelDistribution,
} from '@/components/report/technical/designRatingPresentation';

const SCREEN_DESCRIPTOR = {
  L4: 'Exceptional Performance',
  L3: 'Reference Performance',
  L2: 'Good Performance',
  L1: 'Acceptable Performance',
  FAIL: 'Design Improvement Recommended',
};

function levelNum(key) {
  return Number(String(key).replace('L', ''));
}

// Lowest achieved level from a modal distribution, or null.
function lowestLevelFromDistribution(distribution) {
  if (!distribution) return null;
  for (const key of ['L1', 'L2', 'L3', 'L4']) {
    if ((distribution[key] || 0) > 0) return key;
  }
  return null;
}

// One category block — Primary + Secondary seat-scoped modal results.
// Stable two-column grid: label left, result pill right (shared right edge).
function CategoryBlock({ label, primary, secondary, isScreen }) {
  const renderScopeLine = (scope, isPrimary) => {
    if (!scope?.hasContribs) {
      return (
        <div style={{ fontSize: 10, fontWeight: 600, color: '#9B9890' }}>
          {isPrimary ? 'Primary Seats — not assessed' : 'Not configured'}
        </div>
      );
    }

    // Screen / Viewing Geometry — standard RP23 pill + descriptor underneath.
    if (isScreen) {
      const lvl = scope.screenLevel;
      if (!lvl) {
        return (
          <div style={{ fontSize: 10, fontWeight: 600, color: '#9B9890' }}>
            {isPrimary ? 'Primary Seats — not assessed' : 'Not configured'}
          </div>
        );
      }
      const isFail = lvl === 'FAIL';
      const lead = isPrimary
        ? (isFail ? 'Primary Seats FAIL' : 'Primary Seats achieve')
        : (isFail ? 'Secondary Seats FAIL' : 'Secondary Seats — no lower than');
      const pillLabel = isFail ? 'RP23 FAIL' : `RP23 L${levelNum(lvl)}`;
      const descriptor = isFail ? null : (SCREEN_DESCRIPTOR[lvl] ?? null);
      return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '2px 8px' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#625143' }}>{lead}</span>
            <RP22GradingPill level={lvl} compact>{pillLabel}</RP22GradingPill>
          </div>
          {descriptor && (
            <div style={{ fontSize: 9, color: '#9B9890', marginTop: 1 }}>{descriptor}</div>
          )}
        </div>
      );
    }

    // Acoustic categories — modal level method.
    if (scope.hasFail) {
      const lead = isPrimary ? 'Primary Seats FAIL' : 'Secondary Seats FAIL';
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '2px 8px' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#625143' }}>{lead}</span>
          <RP22GradingPill level="FAIL" compact />
        </div>
      );
    }

    const modalText = formatModalLevels(scope.modalLevels);
    const pillLevel = scope.modalLevels && scope.modalLevels.length === 1 ? scope.modalLevels[0] : null;
    const lead = isPrimary ? 'Primary Seats achieve' : 'Secondary Seats — no lower than';
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '2px 8px' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#625143' }}>{lead}</span>
        {pillLevel ? (
          <RP22GradingPill level={pillLevel} compact />
        ) : (
          <span style={{ fontSize: 10, fontWeight: 600, color: '#213428', justifySelf: 'end' }}>{modalText || '—'}</span>
        )}
      </div>
    );
  };

  // Optional "Lowest contributing result" line — only for acoustic categories
  // when the lowest achieved level is below the modal level.
  let lowestLine = null;
  if (!isScreen && primary?.hasContribs && !primary?.hasFail) {
    const lowest = lowestLevelFromDistribution(primary.distribution);
    const modalLowest = primary.modalLevels && primary.modalLevels.length > 0
      ? primary.modalLevels.reduce((min, k) => (levelNum(k) < levelNum(min) ? k : min), primary.modalLevels[0])
      : null;
    if (lowest && modalLowest && levelNum(lowest) < levelNum(modalLowest)) {
      lowestLine = (
        <div style={{ fontSize: 9, color: '#9B9890', marginTop: 2 }}>
          Lowest contributing result: {lowest}
        </div>
      );
    }
  }

  return (
    <div style={{ paddingTop: 6, borderTop: '1px solid #ECEAE6' }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: '#625143', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 3 }}>
        {label}
      </div>
      {renderScopeLine(primary, true)}
      {secondary?.hasContribs && (
        <div style={{ marginTop: 2 }}>{renderScopeLine(secondary, false)}</div>
      )}
      {lowestLine}
    </div>
  );
}

/**
 * Compact Artcoustic System Design Rating sidebar card.
 */
export default function DesignRatingSummary({
  showAsdr = false,
  rating = null,
  recommendations = null,
  bassPending = false,
  asdrUnavailable = false,
  p14TargetUnselected = false,
}) {
  if (!showAsdr) return null;

  const unavailableCard = (message) => (
    <div
      style={{
        padding: '12px 16px',
        background: '#FFFFFF',
        border: '1px solid #DCDBD6',
        borderRadius: '8px',
        margin: '0 16px 12px 16px',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: '#3E4349', marginBottom: 8, letterSpacing: '0.04em' }}>
        ARTCOUSTIC SYSTEM
        <br />
        DESIGN RATING
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#625143' }}>{message}</div>
    </div>
  );

  if (asdrUnavailable) return unavailableCard('Add LCR, surrounds and subwoofer to calculate rating');
  if (p14TargetUnselected && !rating) return unavailableCard('Select Bass Target to complete design rating');
  if (bassPending && !rating) return unavailableCard('Calculating bass analysis…');

  const scopedRatings = rating?.scopedRatings || null;
  const primaryRating = scopedRatings?.primary || null;
  const secondaryRating = scopedRatings?.secondary || null;
  const allRating = scopedRatings?.all || rating || null;

  const isNotAssessed = !allRating || allRating.status === 'NOT_ASSESSED';

  const primaryCats = primaryRating ? getCategoryModalSummaries(primaryRating) : [];
  const secondaryCats = secondaryRating ? getCategoryModalSummaries(secondaryRating) : [];

  const secondaryIsConfigured =
    secondaryRating &&
    secondaryRating.status !== 'NOT_ASSESSED' &&
    secondaryRating.status !== 'NOT_CONFIGURED';

  const primaryDesignation = primaryRating ? getRoomDesignRatingDesignation(primaryRating) : null;
  const primaryIndex = primaryRating ? getDesignPerformanceIndex(primaryRating) : null;
  const secondaryDesignation = secondaryIsConfigured ? getRoomDesignRatingDesignation(secondaryRating) : null;
  const secondaryIndex = secondaryIsConfigured ? getDesignPerformanceIndex(secondaryRating) : null;
  const allDesignation = allRating ? getRoomDesignRatingDesignation(allRating) : null;
  const allIndex = allRating ? getDesignPerformanceIndex(allRating) : null;

  const CATEGORY_LABELS = ['Spatial Resolution', 'Dynamic Range', 'Timbre Matching', 'Screen / Viewing Geometry'];

  const renderScopeSummary = (label, designation, index, emphasize) => (
    <div style={{ marginTop: emphasize ? 0 : 6, paddingTop: emphasize ? 0 : 6, borderTop: emphasize ? 'none' : '1px solid #ECEAE6' }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: '#625143', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: emphasize ? 14 : 12, fontWeight: 700, color: '#213428', lineHeight: 1.2, marginTop: 2 }}>
        {designation || '—'}
      </div>
      <div style={{ marginTop: 2, fontSize: 10, fontWeight: 600, color: '#625143', letterSpacing: '0.03em' }}>
        Design Performance Index {index ?? '—'}
      </div>
    </div>
  );

  return (
    <div
      style={{
        padding: '12px 16px',
        background: '#FFFFFF',
        border: '1px solid #DCDBD6',
        borderRadius: '8px',
        margin: '0 16px 12px 16px',
        maxHeight: '48vh',
        overflowY: 'auto',
      }}
      title="Proprietary Sound Proof design metric. Not part of CEDIA RP22 or RP23."
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: '#3E4349', marginBottom: 8, letterSpacing: '0.04em' }}>
        ARTCOUSTIC SYSTEM
        <br />
        DESIGN RATING
      </div>

      {isNotAssessed ? (
        <div style={{ fontSize: 18, fontWeight: 700, color: '#9B9890' }}>NOT ASSESSED</div>
      ) : (
        <div>
          {/* ── Four design categories — lead story ── */}
          {CATEGORY_LABELS.map((label) => {
            const idx = primaryCats.findIndex((c) => c.label === label);
            if (idx < 0) return null;
            return (
              <CategoryBlock
                key={label}
                label={label}
                primary={primaryCats[idx]}
                secondary={secondaryCats[idx]}
                isScreen={primaryCats[idx]?.isScreen}
              />
            );
          })}

          {/* ── Divider ── */}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '2px solid #DCDBD6' }} />

          {/* ── Overall Design Performance Index summary ── */}
          {renderScopeSummary('Primary Seating', primaryDesignation, primaryIndex, true)}
          {secondaryIsConfigured
            ? renderScopeSummary('Secondary Seating', secondaryDesignation, secondaryIndex, false)
            : (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #ECEAE6' }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: '#625143', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Secondary Seating
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#9B9890', marginTop: 2 }}>Not configured</div>
              </div>
            )}
          {renderScopeSummary('All Seating', allDesignation, allIndex, false)}
        </div>
      )}
    </div>
  );
}