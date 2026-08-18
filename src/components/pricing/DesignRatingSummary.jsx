// components/pricing/DesignRatingSummary.jsx
// ------------------------------------------
// Compact Artcoustic System Design Rating sidebar card.
//
// Stage C: All recommendation content has been moved to the interactive
// Technical Report / RP22 Compliance Report page. This sidebar is now a
// concise ASDR status summary only — no recommendations, no counts, no
// dropdowns.
//
// Shows three scoped ASDR results (Primary, Secondary, All) from the
// already-computed rating.scopedRatings, one supporting sentence derived
// from the Primary scoped contribution profile, and four Primary-scope
// performance summaries (Spatial Resolution, Dynamic Range, Timbre
// Matching, Screen / Viewing Geometry).
//
// No recommendation generation, ranking, scoring, RP22/RP23 logic, or
// scoped-rating authority is reimplemented here. The scopedRatings object
// is consumed as-is from useAppDesignRating.

import React from 'react';
import {
  getRoomDesignRatingDesignation,
  getDesignRatingSupportingSentence,
  getDesignPerformanceIndex,
  getCategoryAchievedSummaries,
} from '@/components/report/technical/designRatingPresentation';

/**
 * Compact Artcoustic System Design Rating sidebar card.
 * @param {boolean} showAsdr — whether the ASDR card is visible
 * @param {Object|null} rating — full roomRating from useAppDesignRating (includes .scopedRatings)
 * @param {Object|null} recommendations — unused (kept for Layout.jsx compatibility; recommendations moved to Technical Report)
 */
export default function DesignRatingSummary({
  showAsdr = false,
  rating = null,
  recommendations = null,
  bassPending = false,
}) {
  if (!showAsdr) return null;

  // While bass analysis is pending and no final rating has been published
  // yet, show a calculating state instead of a partial numeric score.
  if (bassPending && !rating) {
    return (
      <div
        style={{
          padding: '12px 16px',
          background: '#FFFFFF',
          border: '1px solid #DCDBD6',
          borderRadius: '8px',
          margin: '0 16px 12px 16px',
        }}
        title="Bass analysis in progress"
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: '#3E4349', marginBottom: 8, letterSpacing: '0.04em' }}>
          ARTCOUSTIC SYSTEM
          <br />
          DESIGN RATING
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#625143' }}>
          Calculating bass analysis…
        </div>
      </div>
    );
  }

  const scopedRatings = rating?.scopedRatings || null;
  const primaryRating = scopedRatings?.primary || null;
  const secondaryRating = scopedRatings?.secondary || null;
  const allRating = scopedRatings?.all || rating || null;

  const isNotAssessed = !allRating || allRating.status === 'NOT_ASSESSED';

  const primaryDesignation = primaryRating ? getRoomDesignRatingDesignation(primaryRating) : null;
  const primaryIndex = primaryRating ? getDesignPerformanceIndex(primaryRating) : null;
  const primarySentence = primaryRating ? getDesignRatingSupportingSentence(primaryRating) : null;
  const primaryCategories = primaryRating ? getCategoryAchievedSummaries(primaryRating) : [];

  const secondaryIsConfigured =
    secondaryRating &&
    secondaryRating.status !== 'NOT_ASSESSED' &&
    secondaryRating.status !== 'NOT_CONFIGURED';
  const secondaryDesignation = secondaryIsConfigured ? getRoomDesignRatingDesignation(secondaryRating) : null;
  const secondaryIndex = secondaryIsConfigured ? getDesignPerformanceIndex(secondaryRating) : null;

  const allDesignation = allRating ? getRoomDesignRatingDesignation(allRating) : null;
  const allIndex = allRating ? getDesignPerformanceIndex(allRating) : null;

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
        <div style={{ fontSize: 18, fontWeight: 700, color: '#9B9890' }}>
          NOT ASSESSED
        </div>
      ) : (
        <div>
          {/* ── Primary Seating — strongest visual emphasis ── */}
          <div>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: '#625143', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Primary Seating
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#213428', lineHeight: 1.2, marginTop: 2 }}>
              {primaryDesignation || '—'}
            </div>
            {primarySentence && (
              <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.4, color: '#3E4349' }}>
                {primarySentence}
              </div>
            )}
            <div style={{ marginTop: 4, fontSize: 10, fontWeight: 600, color: '#625143', letterSpacing: '0.03em' }}>
              Design Performance Index {primaryIndex ?? '—'}
            </div>
          </div>

          {/* ── Secondary Seating — compact ── */}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #ECEAE6' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: '#625143', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Secondary Seating
            </div>
            {secondaryIsConfigured ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#213428', lineHeight: 1.2, marginTop: 2 }}>
                  {secondaryDesignation || '—'}
                </div>
                <div style={{ marginTop: 2, fontSize: 10, fontWeight: 600, color: '#625143', letterSpacing: '0.03em' }}>
                  Design Performance Index {secondaryIndex ?? '—'}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9B9890', marginTop: 2 }}>
                Not configured
              </div>
            )}
          </div>

          {/* ── All Seating — compact ── */}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #ECEAE6' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: '#625143', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              All Seating
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#213428', lineHeight: 1.2, marginTop: 2 }}>
              {allDesignation || '—'}
            </div>
            <div style={{ marginTop: 2, fontSize: 10, fontWeight: 600, color: '#625143', letterSpacing: '0.03em' }}>
              Design Performance Index {allIndex ?? '—'}
            </div>
          </div>

          {/* ── Four performance summaries from Primary scope ── */}
          {primaryCategories.length > 0 && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
              {primaryCategories.map((cat) => (
                <div key={cat.label} style={{ borderTop: '1px solid #ECEAE6', paddingTop: 4 }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: '#625143', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {cat.label}
                  </div>
                  {cat.lines.length > 0 ? (
                    cat.lines.map((line, i) => (
                      <div key={i} style={{ fontSize: 10, fontWeight: 600, color: '#213428' }}>
                        {line}
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#9B9890' }}>—</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}