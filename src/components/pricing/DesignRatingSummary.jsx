// components/pricing/DesignRatingSummary.jsx
// ------------------------------------------
// Compact Artcoustic System Design Rating sidebar card.
//
// Hierarchy: the four design categories lead (Spatial Resolution, Dynamic
// Range, Timbre Matching, Screen / Viewing Geometry), followed by a divider
// and the overall Design Performance Index summary for Primary / Secondary /
// All seating scopes.
//
// Category results use the FLOOR (lowest achieved level) across all included
// parameters in each category — never an average, never the modal/most-common
// level. The weakest applicable parameter governs. Screen / Viewing Geometry
// retains RP23 terminology. No ASDR/DPI maths, thresholds, weights, parameter
// authority, or category membership are changed.

import React from 'react';
import RP22GradingPill from '@/components/ui/RP22GradingPill';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import {
  getRoomDesignRatingDesignation,
  getDesignPerformanceIndex,
  getCategoryFloorSummaries,
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

// Format a contribution key ("p11") as the concise parameter label ("P11").
function paramLabel(key) {
  const num = String(key || '').replace(/^p/i, '');
  return num ? `P${num}` : String(key || '');
}

// Return the included parameters whose achieved level equals the category
// floor for this scope. For a FAIL floor, returns the FAIL parameters.
// Screen / Viewing Geometry is excluded (RP23, separately governed).
function getLimitingParams(scope) {
  if (!scope || !scope.paramDetails || scope.isScreen) return [];
  const floor = scope.floorLevel;
  if (!floor) return [];
  return scope.paramDetails.filter((p) => p.level === floor);
}

// Tooltip body: category title + one row per limiting parameter.
function FloorTooltipBody({ label, isPrimary, limiting }) {
  return (
    <div style={{ minWidth: 150 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#625143', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 5 }}>
        {label} · {isPrimary ? 'Primary' : 'Secondary'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {limiting.map((p) => (
          <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#213428' }}>{paramLabel(p.key)}</span>
            <RP22GradingPill level={p.level} compact />
          </div>
        ))}
      </div>
    </div>
  );
}

// Wrap a pill in a hover/focus tooltip showing the limiting parameters,
// but only when there are limiting parameters to show.
function FloorPillWithTooltip({ pill, scope, label, isPrimary }) {
  const limiting = getLimitingParams(scope);
  if (limiting.length === 0) return pill;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} style={{ cursor: 'help', outline: 'none', display: 'inline-flex' }}>{pill}</span>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        align="start"
        sideOffset={6}
        className="bg-white text-foreground border border-[#DCDBD6] shadow-md px-3 py-2 z-50 rounded-md"
      >
        <FloorTooltipBody label={label} isPrimary={isPrimary} limiting={limiting} />
      </TooltipContent>
    </Tooltip>
  );
}

// One category block — Primary + Secondary seat-scoped floor results.
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
    // Separately governed by RP23 authority; not affected by floor method.
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

    // RP22 performance categories — floor (lowest achieved level) method.
    // The pill itself IS the conservative lowest-category result.
    const floor = scope.floorLevel;
    if (scope.hasFail || floor === 'FAIL') {
      const lead = isPrimary ? 'Primary Seats' : 'Secondary Seats';
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '2px 8px' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#625143' }}>{lead}</span>
          <FloorPillWithTooltip
            pill={<RP22GradingPill level="FAIL" compact />}
            scope={scope}
            label={label}
            isPrimary={isPrimary}
          />
        </div>
      );
    }

    const lead = isPrimary ? 'Primary Seats — no lower than' : 'Secondary Seats — no lower than';
    const pill = floor ? (
      <RP22GradingPill level={floor} compact />
    ) : (
      <span style={{ fontSize: 10, fontWeight: 600, color: '#213428', justifySelf: 'end' }}>—</span>
    );
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '2px 8px' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#625143' }}>{lead}</span>
        <FloorPillWithTooltip pill={pill} scope={scope} label={label} isPrimary={isPrimary} />
      </div>
    );
  };

  return (
    <div style={{ paddingTop: 10, borderTop: '1px solid #E0DDD7' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: '#1B1A1A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      {renderScopeLine(primary, true)}
      {secondary?.hasContribs && (
        <div style={{ marginTop: 2 }}>{renderScopeLine(secondary, false)}</div>
      )}
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

  const primaryCats = primaryRating ? getCategoryFloorSummaries(primaryRating) : [];
  const secondaryCats = secondaryRating ? getCategoryFloorSummaries(secondaryRating) : [];

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
    <TooltipProvider delayDuration={200}>
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
    </TooltipProvider>
  );
}