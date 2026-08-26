/**
 * DesignRatingCategoryFloor.jsx
 * ------------------------------
 * Shared four-category floor-authority grid for the in-app Technical / Design
 * Review page. Consumes the SAME getCategoryFloorSummaries() authority as the
 * Room Designer sidebar (DesignRatingSummary.jsx) — no separate report-only
 * calculation. Presentation-only; does NOT modify ASDR/DPI maths, RP22 grading,
 * RP23 grading, or category membership.
 *
 * Hierarchy: Spatial Resolution, Dynamic Range, Timbre Matching, Screen /
 * Viewing Geometry lead. Each category shows Primary / Secondary seat-scoped
 * floor results with standard RP22GradingPill / RP23 pills. Hover tooltips
 * list the limiting parameters (parameters at the floor level).
 */

import React from 'react';
import RP22GradingPill from '@/components/ui/RP22GradingPill';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { getCategoryFloorSummaries } from '@/components/report/technical/designRatingPresentation';

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const COLORS = {
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  muted: "#9B9890",
  border: "#E6E4DD",
  borderStrong: "#D9D5CE",
  fail: "#8B2E2E",
};

const SCREEN_DESCRIPTOR = {
  L4: 'Exceptional Performance',
  L3: 'Reference Performance',
  L2: 'Good Performance',
  L1: 'Acceptable Performance',
  FAIL: 'Design Improvement Recommended',
};

const CATEGORY_LABELS = [
  'Spatial Resolution',
  'Dynamic Range',
  'Timbre Matching',
  'Screen / Viewing Geometry',
];

function levelNum(key) {
  return Number(String(key).replace('L', ''));
}

function paramLabel(key) {
  const num = String(key || '').replace(/^p/i, '');
  return num ? `P${num}` : String(key || '');
}

function getLimitingParams(scope) {
  if (!scope || !scope.paramDetails || scope.isScreen) return [];
  const floor = scope.floorLevel;
  if (!floor) return [];
  return scope.paramDetails.filter((p) => p.level === floor);
}

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

function ScopeLine({ scope, label, isPrimary }) {
  const rowStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    alignItems: 'center',
    gap: '2px 12px',
    padding: '7px 0',
    borderTop: `1px solid ${COLORS.border}`,
  };

  if (!scope?.hasContribs) {
    return (
      <div style={rowStyle}>
        <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted, fontFamily: FONT_BODY }}>
          {isPrimary ? 'Primary Seats — not assessed' : 'Not configured'}
        </span>
      </div>
    );
  }

  // Screen / Viewing Geometry — RP23 pill + descriptor.
  if (scope.isScreen) {
    const lvl = scope.screenLevel;
    if (!lvl) {
      return (
        <div style={rowStyle}>
          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted, fontFamily: FONT_BODY }}>
            {isPrimary ? 'Primary Seats — not assessed' : 'Not configured'}
          </span>
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
      <div style={rowStyle}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.secondary, fontFamily: FONT_BODY }}>{lead}</span>
          {descriptor && (
            <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: FONT_BODY, marginTop: 1 }}>{descriptor}</div>
          )}
        </div>
        <RP22GradingPill level={lvl} compact>{pillLabel}</RP22GradingPill>
      </div>
    );
  }

  // RP22 performance categories — floor (lowest achieved level).
  const floor = scope.floorLevel;
  if (scope.hasFail || floor === 'FAIL') {
    const lead = isPrimary ? 'Primary Seats' : 'Secondary Seats';
    return (
      <div style={rowStyle}>
        <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.secondary, fontFamily: FONT_BODY }}>{lead}</span>
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
    <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.primary, justifySelf: 'end' }}>—</span>
  );
  return (
    <div style={rowStyle}>
      <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.secondary, fontFamily: FONT_BODY }}>{lead}</span>
      <FloorPillWithTooltip pill={pill} scope={scope} label={label} isPrimary={isPrimary} />
    </div>
  );
}

function CategoryBlock({ label, primary, secondary }) {
  return (
    <div>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: COLORS.secondary,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontFamily: FONT_BODY,
        paddingBottom: 2,
      }}>
        {label}
      </div>
      <ScopeLine scope={primary} label={label} isPrimary={true} />
      {secondary?.hasContribs && <ScopeLine scope={secondary} label={label} isPrimary={false} />}
    </div>
  );
}

/**
 * Four-category floor-authority grid. Accepts the full roomDesignRating
 * (with .scopedRatings) — the same object the sidebar consumes.
 */
export default function DesignRatingCategoryFloor({ rating }) {
  const scopedRatings = rating?.scopedRatings || null;
  const primaryRating = scopedRatings?.primary || null;
  const secondaryRating = scopedRatings?.secondary || null;

  const primaryCats = primaryRating ? getCategoryFloorSummaries(primaryRating) : [];
  const secondaryCats = secondaryRating ? getCategoryFloorSummaries(secondaryRating) : [];

  return (
    <TooltipProvider delayDuration={200}>
      <div
        style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {CATEGORY_LABELS.map((label) => {
          const idx = primaryCats.findIndex((c) => c.label === label);
          if (idx < 0) return null;
          return (
            <CategoryBlock
              key={label}
              label={label}
              primary={primaryCats[idx]}
              secondary={secondaryCats[idx]}
            />
          );
        })}
      </div>
    </TooltipProvider>
  );
}