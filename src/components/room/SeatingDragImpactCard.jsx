import React from 'react';
import { rp23DisplayAngleDeg, rp23LevelForAngleDeg } from '@/components/utils/viewingAngleUtils';
import RP22GradingPill from '@/components/ui/RP22GradingPill';

// Parameters monitored during seat-block dragging (in priority order for display)
const MONITORED_PARAMS = [23, 1, 5, 6, 9, 10, 12, 13, 16, 17];
const MAX_SHOWN = 5;

const PARAM_LABELS = {
  23: 'RP23 Viewing Angle',
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

// Extract a single param's { level, formatted, numericValue } from the full RP22 result
function extractParam(rp22, paramNum) {
  if (!rp22) return null;

  // RP23 viewing angle
  if (paramNum === 23) {
    const p = rp22.perSeatRp23?.['mlp'];
    if (!p || p.level == null) return null;
    return {
      level: p.level,
      formatted: p.formatted ?? (Number.isFinite(p.angleDeg) ? `${p.angleDeg.toFixed(1)}°` : null),
      numericValue: Number.isFinite(p.angleDeg) ? p.angleDeg : null,
    };
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

export default function SeatingDragImpactCard({ baseline, live, screen, screenFrontPlaneM, baselineMlp, liveMlp }) {
  if (!baseline || !live) return null;

  // Local RP23 calculation — mirrors buildSeatHudSnapshot, uses live screen + MLP data
  const calcRp23 = (mlpPt) => {
    if (!mlpPt || !screen || !Number.isFinite(screenFrontPlaneM)) return null;
    const screenWidthM = ((screen.visibleWidthInches || 0) * 0.0254);
    const dist = Math.abs(mlpPt.y - screenFrontPlaneM);
    if (dist <= 0.1 || screenWidthM <= 0) return null;
    const angleDeg = 2 * Math.atan((screenWidthM / 2) / dist) * (180 / Math.PI);
    const displayDeg = rp23DisplayAngleDeg(angleDeg);
    const level = rp23LevelForAngleDeg(angleDeg) || 'FAIL';
    return { level, formatted: displayDeg != null ? `${displayDeg}°` : '—', numericValue: angleDeg };
  };

  const bRp23Calc = calcRp23(baselineMlp);
  const lRp23Calc = calcRp23(liveMlp);

  const extractParamFull = (rp22data, paramNum, isBaseline) => {
    if (paramNum === 23) return isBaseline ? bRp23Calc : lRp23Calc;
    return extractParam(rp22data, paramNum);
  };

  const changed = MONITORED_PARAMS.filter(p => {
    const b = extractParamFull(baseline, p, true);
    const l = extractParamFull(live, p, false);
    if (!b || !l) return false;
    const bLvl = normalizeLevel(b.level);
    const lLvl = normalizeLevel(l.level);
    if (bLvl !== lLvl) return true;
    if (b.formatted && l.formatted && b.formatted !== l.formatted) return true;
    const tol = NUMERIC_TOLERANCE[p] ?? 0.1;
    if (b.numericValue != null && l.numericValue != null &&
        Math.abs(b.numericValue - l.numericValue) >= tol) return true;
    return false;
  });
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
        const b = extractParamFull(baseline, paramNum, true);
        const l = extractParamFull(live, paramNum, false);
        if (!b || !l) return null;

        const bLvl = normalizeLevel(b.level);
        const lLvl = normalizeLevel(l.level);
        const levelChanged = bLvl !== lLvl;
        const improving = levelChanged && lLvl > bLvl;
        const worsening = levelChanged && lLvl < bLvl;
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
                <RP22GradingPill level={b.level} />
                <span style={{ color: improving ? '#4ADE80' : '#F87171', fontSize: 13, lineHeight: 1 }}>
                  {improving ? '↑' : '↓'}
                </span>
                <RP22GradingPill level={l.level} />
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

      {/* TEMPORARY DEBUG ROW */}
      {(() => {
        const bRp23 = extractParamFull(baseline, 23, true);
        const lRp23 = extractParamFull(live, 23, false);
        const bP1   = extractParam(baseline, 1);
        const lP1   = extractParam(live, 1);
        const rp23B = bRp23?.numericValue;
        const rp23L = lRp23?.numericValue;
        const p1B   = bP1?.numericValue;
        const p1L   = lP1?.numericValue;
        const rp23Delta = (rp23B != null && rp23L != null) ? Math.abs(rp23B - rp23L) : null;
        const p1Delta   = (p1B   != null && p1L   != null) ? Math.abs(p1B   - p1L)   : null;
        const fmt = (v) => v != null ? v.toFixed(2) : 'null';
        return (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: 9, color: '#6B7280', fontFamily: 'monospace', lineHeight: 1.6 }}>
            RP23: {fmt(rp23B)} → {fmt(rp23L)} Δ{fmt(rp23Delta)}<br/>
            P1: {fmt(p1B)} → {fmt(p1L)} Δ{fmt(p1Delta)}
          </div>
        );
      })()}
    </div>
  );
}