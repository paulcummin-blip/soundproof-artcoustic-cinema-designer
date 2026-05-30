import React from 'react';
import RP22GradingPill from '@/components/ui/RP22GradingPill';

// Parameters monitored during seating drag — extend here to add future params
const DRAG_PARAMS = [23, 1, 16, 17];

const PARAM_LABELS = {
  23: 'RP23 Viewing Angle',
  1:  'P1 Nearest Boundary',
  16: 'P16 LCR Off-axis HF',
  17: 'P17 Surround Off-axis HF',
};

// ─── Pure data helpers (unchanged from previous version) ─────────────────────

function normalizeLevel(level) {
  if (level === null || level === undefined || level === '—') return null;
  const str = String(level);
  if (str === 'FAIL') return -1;
  if (str.startsWith('L')) {
    const n = parseInt(str.slice(1), 10);
    return isNaN(n) ? null : n;
  }
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

function getRealSeats(perSeatMap) {
  return Object.values(perSeatMap || {}).filter(entry => entry?.seatId !== 'mlp');
}

// ─── Change summary helpers ───────────────────────────────────────────────────

// Returns { changed: number, total: number, maxDelta: number, direction: 'up'|'down'|'mixed' }
function buildChangeSummary(baseLevels, liveLevels) {
  let changed = 0;
  let upCount = 0;
  let downCount = 0;
  let maxDelta = 0;

  baseLevels.forEach((bl, i) => {
    const bLvl = normalizeLevel(bl);
    const lLvl = normalizeLevel(liveLevels[i]);
    if (bLvl == null || lLvl == null || bLvl === lLvl) return;
    changed++;
    const delta = lLvl - bLvl;
    if (Math.abs(delta) > Math.abs(maxDelta)) maxDelta = delta;
    if (delta > 0) upCount++;
    else downCount++;
  });

  const direction =
    upCount > 0 && downCount === 0 ? 'up' :
    downCount > 0 && upCount === 0 ? 'down' : 'mixed';

  return { changed, total: baseLevels.length, maxDelta, direction };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PillRow({ levels }) {
  if (!levels || levels.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
      {levels.map((lvl, i) => (
        <RP22GradingPill key={i} level={lvl} />
      ))}
    </div>
  );
}

function ChangeIndicator({ summary }) {
  const { maxDelta, direction, changed } = summary;
  if (changed === 0) return <span style={{ color: '#9CA3AF', fontSize: 11 }}>—</span>;

  const color = direction === 'up' ? '#16A34A' : direction === 'down' ? '#DC2626' : '#D97706';
  const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '↕';
  const sign  = maxDelta > 0 ? '+' : '';

  return (
    <div style={{ textAlign: 'center', minWidth: 36 }}>
      <div style={{ fontSize: 16, lineHeight: 1, color, fontWeight: 700 }}>
        {arrow}
      </div>
      <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 1 }}>
        {sign}{maxDelta}
      </div>
    </div>
  );
}

function SeatCountBadge({ changed, total }) {
  if (changed === total) {
    return (
      <span style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
        backgroundColor: '#FEF3C7', color: '#92400E',
        borderRadius: 4, padding: '1px 5px',
        border: '1px solid #FDE68A',
      }}>
        {total} seat{total !== 1 ? 's' : ''} affected
      </span>
    );
  }
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
      backgroundColor: '#F3F4F6', color: '#6B7280',
      borderRadius: 4, padding: '1px 5px',
      border: '1px solid #E5E7EB',
    }}>
      {changed} of {total} affected
    </span>
  );
}

function ParamRow({ paramNum, baseLevels, liveLevels, isLast }) {
  const summary = buildChangeSummary(baseLevels, liveLevels);
  if (summary.changed === 0) return null;

  return (
    <div style={{
      paddingBottom: isLast ? 0 : 10,
      marginBottom: isLast ? 0 : 10,
      borderBottom: isLast ? 'none' : '1px solid #F3F4F6',
    }}>
      {/* Row: left content + right indicator */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Left: label + before/after */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Param name + seat count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#374151',
              letterSpacing: '0.02em', textTransform: 'uppercase',
            }}>
              {PARAM_LABELS[paramNum] || `Param ${paramNum}`}
            </span>
            <SeatCountBadge changed={summary.changed} total={summary.total} />
          </div>

          {/* BEFORE row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{
              fontSize: 9, fontWeight: 600, color: '#9CA3AF',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              width: 38, flexShrink: 0,
            }}>
              Before
            </span>
            <PillRow levels={baseLevels} />
          </div>

          {/* AFTER row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 9, fontWeight: 600, color: '#1D4ED8',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              width: 38, flexShrink: 0,
            }}>
              After
            </span>
            <PillRow levels={liveLevels} />
          </div>
        </div>

        {/* Right: change indicator */}
        <div style={{ display: 'flex', alignItems: 'center', paddingTop: 18, flexShrink: 0 }}>
          <ChangeIndicator summary={summary} />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SeatingDragImpactCard({ baseline, live }) {
  if (!baseline || !live) return null;

  // Ordered real-seat arrays (index-based to handle coordinate-derived IDs during drag)
  const bRp22 = getRealSeats(baseline.perSeatRp22);
  const lRp22 = getRealSeats(live.perSeatRp22);
  const bRp23 = Object.values(baseline.perSeatRp23 || {});
  const lRp23 = Object.values(live.perSeatRp23 || {});

  const rp22Count = Math.min(bRp22.length, lRp22.length);
  const rp23Count = Math.min(bRp23.length, lRp23.length);
  if (rp22Count === 0 && rp23Count === 0) return null;

  const getLevel = (isBaseline, paramNum, idx) => {
    if (paramNum === 23) {
      if (idx >= rp23Count) return null;
      return (isBaseline ? bRp23[idx] : lRp23[idx])?.level ?? null;
    }
    if (idx >= rp22Count) return null;
    return (isBaseline ? bRp22[idx] : lRp22[idx])?.rp22?.[paramNum]?.level ?? null;
  };

  const seatCountForParam = (paramNum) => paramNum === 23 ? rp23Count : rp22Count;

  // Build data for all params, then filter to those with actual level changes
  const paramData = DRAG_PARAMS
    .map(paramNum => {
      const count = seatCountForParam(paramNum);
      const baseLevels = Array.from({ length: count }, (_, i) => getLevel(true, paramNum, i));
      const liveLevels = Array.from({ length: count }, (_, i) => getLevel(false, paramNum, i));
      const summary    = buildChangeSummary(baseLevels, liveLevels);
      return { paramNum, baseLevels, liveLevels, summary };
    })
    .filter(d => d.summary.changed > 0);

  if (paramData.length === 0) return null;

  // Sort: biggest absolute change first; improvements before regressions of equal magnitude
  paramData.sort((a, b) => {
    const aDelta = Math.abs(a.summary.maxDelta);
    const bDelta = Math.abs(b.summary.maxDelta);
    if (bDelta !== aDelta) return bDelta - aDelta;
    // Tie-break: improvements first
    return b.summary.direction === 'up' ? 1 : -1;
  });

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      right: 12,
      minWidth: 220,
      maxWidth: 320,
      backgroundColor: '#FFFFFF',
      borderRadius: 10,
      boxShadow: '0 2px 12px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
      border: '1px solid #E5E7EB',
      padding: '12px 14px',
      zIndex: 40,
      pointerEvents: 'none',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #F3F4F6' }}>
        <div style={{
          fontSize: 10, fontWeight: 800, color: '#111827',
          letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2,
        }}>
          Live Seating Impact
        </div>
        <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 400 }}>
          Parameters affected by current seat movement
        </div>
      </div>

      {/* Parameter rows */}
      {paramData.map((d, idx) => (
        <ParamRow
          key={d.paramNum}
          paramNum={d.paramNum}
          baseLevels={d.baseLevels}
          liveLevels={d.liveLevels}
          isLast={idx === paramData.length - 1}
        />
      ))}
    </div>
  );
}