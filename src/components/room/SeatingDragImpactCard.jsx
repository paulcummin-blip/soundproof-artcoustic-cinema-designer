import React from 'react';
import { getLevelColor, getLevelText } from '@/components/utils/rp22LevelCalculation';

// Parameters monitored during seat-block dragging (in priority order for display)
// 23 = RP23 viewing angle (treated as a special param, read from perSeatRp23)
const MONITORED_PARAMS = [23, 1, 5, 6, 9, 10, 12, 13, 16, 17];
const MAX_SHOWN = 5;

const PARAM_LABELS = {
  23: 'Viewing angle (RP23)',
  1:  'Nearest boundary distance',
  5:  'Surround gap (largest)',
  6:  'Surround SPL consistency',
  9:  'Overhead vertical gap',
  10: 'Overhead SPL spread',
  12: 'Screen SPL at RSP',
  13: 'Non-screen SPL at RSP',
  16: 'LCR off-axis HF loss',
  17: 'Surround off-axis HF loss',
};

// Normalise level to integer: "L3" → 3, 3 → 3, "—" → null
function normalizeLevel(level) {
  if (level === null || level === undefined || level === '—') return null;
  if (typeof level === 'number') return level;
  const str = String(level);
  if (str.startsWith('L')) {
    const n = parseInt(str.slice(1), 10);
    return isNaN(n) ? null : n;
  }
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

function getLevelLabel(level) {
  const n = normalizeLevel(level);
  if (n === null) return '—';
  return getLevelText(n) || `Level ${n}`;
}

function getLevelColors(level) {
  const n = normalizeLevel(level);
  const colors = getLevelColor(n);
  return { bg: colors.fill, text: colors.text };
}

// Extract a single param's { level, formatted, numericValue } from the full RP22 result
function extractParam(rp22, paramNum) {
  if (!rp22) return null;

  // RP23 viewing angle — read from perSeatRp23
  if (paramNum === 23) {
    const p = rp22.perSeatRp23?.['mlp'] ?? null;
    if (!p || p.level == null) return null;
    return { level: p.level, formatted: p.formatted ?? null, numericValue: p.angleDeg ?? null };
  }

  // Global (room-level) params
  if (paramNum === 12 || paramNum === 13) {
    const p = rp22.gradedParameters?.primary?.[paramNum];
    if (!p || p.level == null) return null;
    return { level: p.level, formatted: p.formatted ?? (p.value != null ? String(p.value) : null), numericValue: p.value ?? null };
  }

  // Per-seat: prefer synthetic 'mlp' RSP seat, fallback to first primary seat
  const perSeat = rp22.perSeatRp22 || {};
  const seat =
    perSeat['mlp'] ??
    Object.values(perSeat).find(s => s?.isPrimary) ??
    null;
  if (!seat) return null;

  const p = seat.rp22?.[paramNum];
  if (!p) return null;

  // Extract the best available raw numeric value
  const numericValue = p.valueM ?? p.valueDeg ?? p.valueDb ?? p.value ?? null;

  return { level: p.level, formatted: p.formatted ?? null, numericValue };
}

// Per-parameter numeric tolerance for raw-value change detection
const NUMERIC_TOLERANCE = {
  23: 0.5,   // RP23: viewing angle — 0.5°
  1:  0.01,  // P1: nearest wall — 1cm
  5:  0.5,   // P5: surround gap — 0.5°
  6:  0.1,   // P6: surround SPL consistency — 0.1 dB
  9:  0.5,   // P9: overhead vertical gap — 0.5°
  10: 0.1,   // P10: overhead SPL spread — 0.1 dB
  12: 0.5,   // P12: screen SPL — 0.5 dB
  13: 0.5,   // P13: non-screen SPL — 0.5 dB
  16: 0.1,   // P16: LCR HF off-axis — 0.1 dB
  17: 0.1,   // P17: surround HF off-axis — 0.1 dB
};

function didChange(baseline, live, paramNum) {
  const b = extractParam(baseline, paramNum);
  const l = extractParam(live, paramNum);
  if (!b || !l) return false;

  const bLvl = normalizeLevel(b.level);
  const lLvl = normalizeLevel(l.level);
  if (bLvl !== lLvl) return true;

  // Flag if the formatted value string changed
  if (b.formatted && l.formatted && b.formatted !== l.formatted) return true;

  // Flag if raw numeric value changed beyond tolerance
  const tol = NUMERIC_TOLERANCE[paramNum] ?? 0.1;
  if (b.numericValue != null && l.numericValue != null &&
      Math.abs(b.numericValue - l.numericValue) >= tol) return true;

  return false;
}

export default function SeatingDragImpactCard({ baseline, live }) {
  if (!baseline || !live) return null;

  const changed = MONITORED_PARAMS.filter(p => didChange(baseline, live, p));
  if (changed.length === 0) return null;

  const shown = changed.slice(0, MAX_SHOWN);
  const extra = Math.max(0, changed.length - MAX_SHOWN);

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 256,
        backgroundColor: 'rgba(22, 22, 24, 0.91)',
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
        Live RP22 impact
      </div>

      {shown.map(paramNum => {
        const b = extractParam(baseline, paramNum);
        const l = extractParam(live, paramNum);
        if (!b || !l) return null;

        const bLvl = normalizeLevel(b.level);
        const lLvl = normalizeLevel(l.level);
        const levelChanged = bLvl !== lLvl;
        const improving = levelChanged && lLvl > bLvl;
        const worsening = levelChanged && lLvl < bLvl;
        const bColors = getLevelColors(b.level);
        const lColors = getLevelColors(l.level);
        const valueChanged = b.formatted && l.formatted && b.formatted !== l.formatted;

        return (
          <div
            key={paramNum}
            style={{
              marginBottom: 7,
              paddingBottom: 7,
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {/* Param name */}
            <div style={{ fontSize: 11, color: '#D1D5DB', marginBottom: 3, fontWeight: 500, lineHeight: 1.3 }}>
              <span style={{ color: '#6B7280', marginRight: 4, fontFamily: 'monospace' }}>P{paramNum}</span>
              {PARAM_LABELS[paramNum]}
            </div>

            {/* Level change */}
            {levelChanged && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: valueChanged ? 2 : 0 }}>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 3,
                  backgroundColor: bColors.bg, color: bColors.text, fontWeight: 600,
                }}>
                  {getLevelLabel(b.level)}
                </span>
                <span style={{ color: improving ? '#4ADE80' : '#F87171', fontSize: 13, lineHeight: 1 }}>
                  {improving ? '↑' : '↓'}
                </span>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 3,
                  backgroundColor: lColors.bg, color: lColors.text, fontWeight: 600,
                }}>
                  {getLevelLabel(l.level)}
                </span>
              </div>
            )}

            {/* Value change */}
            {valueChanged && (
              <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: levelChanged ? 0 : 0 }}>
                {b.formatted}
                <span style={{ margin: '0 4px', opacity: 0.6 }}>→</span>
                <span style={{ color: worsening ? '#FCA5A5' : improving ? '#86EFAC' : '#E5E7EB', fontWeight: 500 }}>
                  {l.formatted}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {extra > 0 && (
        <div style={{ fontSize: 10, color: '#4B5563', paddingTop: 2 }}>
          + {extra} more affected
        </div>
      )}
    </div>
  );
}