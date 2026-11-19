// components/pricing/DesignRatingSummary.jsx
// ------------------------------------------
// Compact Artcoustic System Design Rating sidebar card.
//
// Presentation-only: heading, a Live Update / Completed status badge, the main
// Design Performance Index, and the Primary and Secondary scoped indices
// (Secondary only when secondary seats exist). The Design Performance Index
// calculation, RP22 grading, weights, thresholds and seating scopes are
// unchanged — every value is read from the same published engineering summary
// (Completed) or live partial rating (Live Update) the previous card read.
//
// Exclusion guards (missing room dimensions, incomplete design, bass pending,
// stale scope) are preserved exactly: a result is never shown on missing,
// provisional or stale evidence, and a result is never marked Completed merely
// because some parameters have calculated — Completed requires the published
// engineering summary.

import React from 'react';
import { Badge } from '@/components/ui/badge';

// Existing Sound Proof badge styling (Badge variant="outline" + brand tone).
// Subtle blue for Live Update, subtle green for Completed.
const STATUS_BADGE = {
  live: 'bg-[#EAF2FB] text-[#1F5FA8] border-[#C5DBF0]',
  completed: 'bg-[#E8F0E9] text-[#1F5A3A] border-[#C5DDD0]',
};

// Shared simplified card shell: heading + status badge + main DPI + Primary
// index + Secondary index (only when secondary seats exist).
function RatingCardShell({
  statusLabel,
  statusClass,
  mainIndex,
  primaryIndex,
  secondaryIndex,
  showSecondary,
}) {
  return (
    <div
      style={{
        padding: '12px 16px',
        background: '#FFFFFF',
        border: '1px solid #DCDBD6',
        borderRadius: '8px',
        margin: '0 16px 12px 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#3E4349', letterSpacing: '0.04em' }}>
          ARTCOUSTIC SYSTEM
          <br />
          DESIGN RATING
        </div>
        <Badge variant="outline" className={`font-body text-[9px] font-semibold uppercase tracking-[0.08em] ${statusClass}`}>
          {statusLabel}
        </Badge>
      </div>

      <div style={{ fontSize: 24, fontWeight: 700, color: '#213428', fontFamily: 'Didact Gothic, sans-serif', lineHeight: 1.1 }}>
        Design Performance Index {mainIndex ?? '—'}
      </div>

      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #ECEAE6' }}>
        <div style={{ fontSize: 8.5, fontWeight: 700, color: '#625143', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Primary Seating
        </div>
        <div style={{ marginTop: 2, fontSize: 13, fontWeight: 700, color: '#213428', letterSpacing: '0.03em' }}>
          Design Performance Index {primaryIndex ?? '—'}
        </div>
      </div>

      {showSecondary && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #ECEAE6' }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: '#625143', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Secondary Seating
          </div>
          <div style={{ marginTop: 2, fontSize: 13, fontWeight: 700, color: '#213428', letterSpacing: '0.03em' }}>
            Design Performance Index {secondaryIndex ?? '—'}
          </div>
        </div>
      )}
    </div>
  );
}

// Live Update card: the completed Design Rating is unavailable but current
// valid RP22 evidence exists. Reads the live partial rating's additive
// Design Performance Index only — no coverage text, no missing-parameter list.
function PartialRatingCard({ partial }) {
  const all = partial?.all || null;
  const primary = partial?.primary || null;
  const secondary = partial?.secondary || null;
  if (!all || (all.assessedWeight ?? 0) === 0) return null;
  const showSecondary = !!(secondary && (secondary.assessedWeight ?? 0) > 0);
  return (
    <RatingCardShell
      statusLabel="Live Update"
      statusClass={STATUS_BADGE.live}
      mainIndex={all.designPerformanceIndex}
      primaryIndex={primary?.designPerformanceIndex}
      secondaryIndex={secondary?.designPerformanceIndex}
      showSecondary={showSecondary}
    />
  );
}

/**
 * Compact Artcoustic System Design Rating sidebar card.
 */
export default function DesignRatingSummary({
  showAsdr = false,
  engineeringSummary = null,
  bassPending = false,
  asdrUnavailable = false,
  p14TargetUnselected = false,
  staleScope = false,
  roomDimsMissing = false,
  partialDesignRating = null,
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

  // Room dimensions required is a hard block — invalid geometry means no
  // current evidence is valid, so even the partial rating is withheld.
  if (roomDimsMissing) return unavailableCard('Room dimensions required');

  // Completed rating is authoritative when the published engineering summary
  // is available and assessed. Publication conditions are satisfied by the
  // presence of that summary — a result is never marked Completed merely
  // because some parameters have calculated.
  const completedAvailable = !!engineeringSummary
    && engineeringSummary?.project?.rating?.status !== 'NOT_ASSESSED';

  // Live Update: the completed rating is unavailable but current valid RP22
  // evidence exists. Missing, provisional and stale evidence is excluded by
  // the partial rating authority itself.
  const partial = partialDesignRating?.isPartial
    && (partialDesignRating.all?.assessedWeight ?? 0) > 0
    ? partialDesignRating
    : null;

  if (!completedAvailable && partial) {
    return <PartialRatingCard partial={partial} />;
  }

  if (asdrUnavailable) return unavailableCard('Incomplete Design');
  if (p14TargetUnselected && !engineeringSummary) return unavailableCard('Incomplete Design');

  // Bass pending (calculating or stale): the published engineering summary
  // may still be the previous design's result. Never display its floors as
  // current while bass authority is not ready — show "Calculating" until a
  // fingerprint-matched result lands. A retained-from-refresh result is not
  // pending, so the same-fingerprint retention path still shows normally.
  if (bassPending) return unavailableCard('Calculating bass analysis…');

  // Stale-scope guard: the published summary was calculated from a different
  // seat-priority set than the current live one. Do not display its
  // Primary/Secondary floors as current until a matching publication arrives.
  if (staleScope && engineeringSummary) return unavailableCard('Incomplete Design');

  // Direct read only: scoped Design Performance Indices are already present in
  // summariseEngineeringResults(). The sidebar never rebuilds them.
  const projectSummary = engineeringSummary?.project || null;
  const primarySummary = engineeringSummary?.primary || null;
  const secondarySummary = engineeringSummary?.secondary || null;

  const allRating = projectSummary?.rating || null;
  if (!allRating || allRating.status === 'NOT_ASSESSED') {
    return unavailableCard('Not assessed');
  }

  const primaryIndex = primarySummary?.designPerformanceIndex ?? null;
  const allIndex = projectSummary?.designPerformanceIndex ?? null;

  const secondaryRating = secondarySummary?.rating || null;
  const secondaryIsConfigured =
    secondaryRating
    && secondaryRating.status !== 'NOT_ASSESSED'
    && secondaryRating.status !== 'NOT_CONFIGURED';
  const secondaryIndex = secondaryIsConfigured
    ? (secondarySummary?.designPerformanceIndex ?? null)
    : null;

  return (
    <RatingCardShell
      statusLabel="Completed"
      statusClass={STATUS_BADGE.completed}
      mainIndex={allIndex}
      primaryIndex={primaryIndex}
      secondaryIndex={secondaryIndex}
      showSecondary={secondaryIsConfigured}
    />
  );
}