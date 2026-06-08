import React from 'react';
import RP22GradingPill from '@/components/ui/RP22GradingPill';

const MAX_VISIBLE_ROWS = 5;

// Room-level params (from gradedParameters.primary — single aggregate value per room)
// P5 deliberately excluded: it also exists at seat-level and is handled there
const ROOM_LEVEL_PARAMS = new Set([3, 7, 11, 12, 13, 15]);

const PARAM_LABELS = {
  1:  'P1 Nearest Boundary',
  3:  'P3 Screen Speaker Zones',
  4:  'P4 Screen SPL Balance',
  5:  'P5 Surround Gap',
  6:  'P6 Surround Consistency',
  7:  'P7 Front Wide Angle',
  9:  'P9 Overhead Vertical Gap',
  10: 'P10 Overhead SPL Spread',
  11: 'P11 Zone Compliance',
  12: 'P12 Screen SPL Capability',
  13: 'P13 Non-screen SPL',
  15: 'P15 Noise Floor',
  16: 'P16 LCR Off-axis HF',
  17: 'P17 Surround Off-axis HF',
  23: 'RP23 Viewing Angle',
};

// ─── Pure data helpers ────────────────────────────────────────────────────────

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

// ─── Change summary — compares levels only, ignores numeric value changes ─────

function buildChangeSummary(baseLevels, liveLevels) {
  let changed = 0;
  let upCount = 0;
  let downCount = 0;
  let maxDelta = 0;

  baseLevels.forEach((bl, i) => {
    const bLvl = normalizeLevel(bl);
    const lLvl = normalizeLevel(liveLevels[i]);
    // Only count as changed if both levels are known AND the level itself changed
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

  return { changed, total: baseLevels.length, maxDelta, direction, upCount, downCount };
}

// ─── Auto-discover all changed parameters ────────────────────────────────────
// Works for any drag type — seats, speakers, subs, room elements.
// Level-only: numeric value changes within the same level are not shown.

function buildAllParamData(baseline, live) {
  if (!baseline || !live) return [];

  const bRp22seats = getRealSeats(baseline.perSeatRp22);
  const lRp22seats = getRealSeats(live.perSeatRp22);
  const bRp23 = Object.values(baseline.perSeatRp23 || {});
  const lRp23 = Object.values(live.perSeatRp23 || {});
  const rp22Count = Math.min(bRp22seats.length, lRp22seats.length);
  const rp23Count = Math.min(bRp23.length, lRp23.length);

  const results = [];

  // 1. Seat-level RP22 params (auto-discovered from perSeatRp22)
  const seatParamNums = new Set();
  for (const seat of [...bRp22seats, ...lRp22seats]) {
    Object.keys(seat.rp22 || {}).forEach(k => seatParamNums.add(Number(k)));
  }

  for (const paramNum of seatParamNums) {
    if (rp22Count === 0) continue;
    const baseLevels = bRp22seats.slice(0, rp22Count).map(s => s.rp22?.[paramNum]?.level ?? null);
    const liveLevels = lRp22seats.slice(0, rp22Count).map(s => s.rp22?.[paramNum]?.level ?? null);
    const summary = buildChangeSummary(baseLevels, liveLevels);
    if (summary.changed > 0) {
      results.push({ paramNum, baseLevels, liveLevels, summary, scope: 'seat' });
    }
  }

  // 2. Room-level RP22 params (from gradedParameters.primary, excluding seat-level params)
  const bPrimary = baseline.gradedParameters?.primary || {};
  const lPrimary = live.gradedParameters?.primary || {};
  const roomParamNums = new Set(
    [...Object.keys(bPrimary), ...Object.keys(lPrimary)]
      .map(Number)
      .filter(n => ROOM_LEVEL_PARAMS.has(n))
  );

  for (const paramNum of roomParamNums) {
    const bLevel = bPrimary[paramNum]?.level ?? null;
    const lLevel = lPrimary[paramNum]?.level ?? null;
    const baseLevels = [bLevel];
    const liveLevels = [lLevel];
    const summary = buildChangeSummary(baseLevels, liveLevels);
    if (summary.changed > 0) {
      results.push({ paramNum, baseLevels, liveLevels, summary, scope: 'room' });
    }
  }

  // 3. RP23 viewing angle (per seat)
  if (rp23Count > 0) {
    const baseLevels = bRp23.slice(0, rp23Count).map(s => s.level ?? null);
    const liveLevels = lRp23.slice(0, rp23Count).map(s => s.level ?? null);
    const summary = buildChangeSummary(baseLevels, liveLevels);
    if (summary.changed > 0) {
      results.push({ paramNum: 23, baseLevels, liveLevels, summary, scope: 'seat' });
    }
  }

  // Sort: biggest absolute level change first; improvements before regressions of equal magnitude
  results.sort((a, b) => {
    const aDelta = Math.abs(a.summary.maxDelta);
    const bDelta = Math.abs(b.summary.maxDelta);
    if (bDelta !== aDelta) return bDelta - aDelta;
    return b.summary.direction === 'up' ? 1 : -1;
  });

  return results;
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
      <div style={{ fontSize: 16, lineHeight: 1, color, fontWeight: 700 }}>{arrow}</div>
      <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 1 }}>
        {sign}{maxDelta}
      </div>
    </div>
  );
}

function ScopeBadge({ scope, changed, total }) {
  if (scope === 'room') {
    return (
      <span style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
        backgroundColor: '#EFF6FF', color: '#1D4ED8',
        borderRadius: 4, padding: '1px 5px',
        border: '1px solid #BFDBFE',
      }}>
        Room
      </span>
    );
  }
  // Seat-level
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

function ParamRow({ paramNum, baseLevels, liveLevels, scope, isLast }) {
  const summary = buildChangeSummary(baseLevels, liveLevels);
  if (summary.changed === 0) return null;

  return (
    <div style={{
      paddingBottom: isLast ? 0 : 10,
      marginBottom: isLast ? 0 : 10,
      borderBottom: isLast ? 'none' : '1px solid #F3F4F6',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Left: label + before/after */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#374151',
              letterSpacing: '0.02em', textTransform: 'uppercase',
            }}>
              {PARAM_LABELS[paramNum] || `Param ${paramNum}`}
            </span>
            <ScopeBadge scope={scope} changed={summary.changed} total={summary.total} />
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

// ─── Summary row (compact — no before/after pills) ───────────────────────────

function SummaryParamRow({ paramNum, summary, scope, isLast }) {
  if (summary.changed === 0) return null;
  const { maxDelta, direction, changed, total } = summary;
  const seatsLabel = scope === 'room' ? 'Room' : changed === total ? `${total} seat${total !== 1 ? 's' : ''}` : `${changed}/${total} seats`;

  // Count ups and downs from the summary
  const upCount = direction === 'up' ? changed : direction === 'mixed' ? summary.upCount ?? 0 : 0;
  const downCount = direction === 'down' ? changed : direction === 'mixed' ? summary.downCount ?? 0 : 0;

  let indicator;
  if (direction === 'up') {
    indicator = (
      <div style={{ textAlign: 'center', minWidth: 36 }}>
        <div style={{ fontSize: 14, lineHeight: 1, color: '#16A34A', fontWeight: 700 }}>↑</div>
        <div style={{ fontSize: 10, color: '#16A34A', fontWeight: 600, marginTop: 1 }}>+{changed}</div>
      </div>
    );
  } else if (direction === 'down') {
    indicator = (
      <div style={{ textAlign: 'center', minWidth: 36 }}>
        <div style={{ fontSize: 14, lineHeight: 1, color: '#DC2626', fontWeight: 700 }}>↓</div>
        <div style={{ fontSize: 10, color: '#DC2626', fontWeight: 600, marginTop: 1 }}>-{changed}</div>
      </div>
    );
  } else {
    // mixed: show green up + red down side-by-side
    indicator = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, lineHeight: 1, color: '#16A34A', fontWeight: 700 }}>↑</div>
          <div style={{ fontSize: 10, color: '#16A34A', fontWeight: 600, marginTop: 1 }}>+{upCount}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, lineHeight: 1, color: '#DC2626', fontWeight: 700 }}>↓</div>
          <div style={{ fontSize: 10, color: '#DC2626', fontWeight: 600, marginTop: 1 }}>-{downCount}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: isLast ? 0 : 8, marginBottom: isLast ? 0 : 8, borderBottom: isLast ? 'none' : '1px solid #F3F4F6' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#374151', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          {PARAM_LABELS[paramNum] || `Param ${paramNum}`}
        </span>
        <span style={{ fontSize: 9, color: '#9CA3AF', marginLeft: 6 }}>{seatsLabel}</span>
      </div>
      {indicator}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SeatingDragImpactCard({ baseline, live, cardTitle, mode = "detailed" }) {
  if (!baseline || !live) return null;

  const paramData = buildAllParamData(baseline, live);
  if (paramData.length === 0) return null;

  const visibleParams = paramData.slice(0, MAX_VISIBLE_ROWS);
  const hiddenCount = paramData.length - visibleParams.length;

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
          {cardTitle || 'Live Impact'}
        </div>
        <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 400 }}>
          Parameters affected by current movement
        </div>
      </div>

      {/* Parameter rows */}
      {visibleParams.map((d, idx) => (
        mode === "summary"
          ? <SummaryParamRow key={d.paramNum} paramNum={d.paramNum} summary={d.summary} scope={d.scope} isLast={idx === visibleParams.length - 1 && hiddenCount === 0} />
          : <ParamRow key={d.paramNum} paramNum={d.paramNum} baseLevels={d.baseLevels} liveLevels={d.liveLevels} scope={d.scope} isLast={idx === visibleParams.length - 1 && hiddenCount === 0} />
      ))}

      {/* Overflow indicator */}
      {hiddenCount > 0 && (
        <div style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid #F3F4F6',
          fontSize: 9,
          color: '#9CA3AF',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          + {hiddenCount} more affected
        </div>
      )}
    </div>
  );
}