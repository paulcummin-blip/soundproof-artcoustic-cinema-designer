import React from 'react';
import RP22GradingPill from '@/components/ui/RP22GradingPill';

// Parameters shown during seating drag, in display order
const DRAG_PARAMS = [23, 1, 16, 17];

const PARAM_LABELS = {
  23: 'RP23 Viewing Angle',
  1:  'P1 Nearest boundary',
  16: 'P16 LCR off-axis HF',
  17: 'P17 Surround off-axis HF',
};

// Normalise level to a comparable integer: "L3"→3, 3→3, "FAIL"→-1, null/"—"→null
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

// Get an ordered array of real seat entries (exclude the synthetic 'mlp' RSP entry)
function getRealSeats(perSeatMap) {
  return Object.values(perSeatMap || {}).filter(entry => entry?.seatId !== 'mlp');
}

export default function SeatingDragImpactCard({ baseline, live }) {
  if (!baseline || !live) return null;

  // Index-ordered real seat arrays — indexed comparison is robust when seats move (IDs may be coordinate-based)
  const bRp22 = getRealSeats(baseline.perSeatRp22);
  const lRp22 = getRealSeats(live.perSeatRp22);
  const bRp23 = Object.values(baseline.perSeatRp23 || {}); // already real-seats-only in engine
  const lRp23 = Object.values(live.perSeatRp23 || {});

  const rp22Count = Math.min(bRp22.length, lRp22.length);
  const rp23Count = Math.min(bRp23.length, lRp23.length);
  if (rp22Count === 0 && rp23Count === 0) return null;

  // Get the level for a given param / seat index from the right data source
  const getLevel = (isBaseline, paramNum, idx) => {
    if (paramNum === 23) {
      if (idx >= rp23Count) return null;
      return (isBaseline ? bRp23[idx] : lRp23[idx])?.level ?? null;
    }
    if (idx >= rp22Count) return null;
    return (isBaseline ? bRp22[idx] : lRp22[idx])?.rp22?.[paramNum]?.level ?? null;
  };

  const seatCountForParam = (paramNum) => paramNum === 23 ? rp23Count : rp22Count;

  // Only include a param if at least one seat changed Level (not just numeric value)
  const changedParams = DRAG_PARAMS.filter(paramNum => {
    const count = seatCountForParam(paramNum);
    return count > 0 && Array.from({ length: count }).some((_, idx) => {
      const bLvl = normalizeLevel(getLevel(true, paramNum, idx));
      const lLvl = normalizeLevel(getLevel(false, paramNum, idx));
      return bLvl !== null && lLvl !== null && bLvl !== lLvl;
    });
  });

  if (changedParams.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        minWidth: 200,
        maxWidth: 340,
        backgroundColor: 'rgba(22, 22, 24, 0.92)',
        borderRadius: 8,
        padding: '10px 12px 8px',
        zIndex: 40,
        pointerEvents: 'none',
        backdropFilter: 'blur(6px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 8 }}>
        Live seating impact
      </div>

      {changedParams.map(paramNum => {
        const count = seatCountForParam(paramNum);
        const baselineLevels = Array.from({ length: count }, (_, i) => getLevel(true, paramNum, i));
        const liveLevels     = Array.from({ length: count }, (_, i) => getLevel(false, paramNum, i));

        return (
          <div
            key={paramNum}
            style={{
              marginBottom: 7,
              paddingBottom: 7,
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {/* Param label */}
            <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 5, fontWeight: 500 }}>
              {PARAM_LABELS[paramNum]}
            </div>

            {/* All seat pills: baseline pills → live pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>

              {/* Baseline seat pills */}
              <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {baselineLevels.map((level, i) => (
                  <RP22GradingPill key={i} level={level} />
                ))}
              </div>

              {/* Arrow */}
              <span style={{ color: '#6B7280', fontSize: 11, flexShrink: 0 }}>→</span>

              {/* Live seat pills — highlight seats that changed */}
              <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {liveLevels.map((level, i) => {
                  const bLvl = normalizeLevel(baselineLevels[i]);
                  const lLvl = normalizeLevel(level);
                  const changed  = bLvl !== null && lLvl !== null && bLvl !== lLvl;
                  const improving = changed && lLvl > bLvl;
                  return (
                    <div key={i} style={{ position: 'relative', display: 'inline-flex' }}>
                      <RP22GradingPill level={level} />
                      {changed && (
                        <span style={{
                          position: 'absolute',
                          top: -5,
                          right: -4,
                          fontSize: 7,
                          lineHeight: 1,
                          color: improving ? '#4ADE80' : '#F87171',
                          pointerEvents: 'none',
                        }}>
                          {improving ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}