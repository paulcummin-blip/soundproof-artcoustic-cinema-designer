// BassGraphTooltip — compact, non-interactive hover readout for the bass graph.
//
// Presentation-only: does NOT recompute, re-grade, or alter any authority data.
//
// CURSOR COORDINATES (headline):
//   FREQUENCY comes from the cursor X position (Recharts `label`, already
//   converted through the log frequency scale).
//   SPL comes from the cursor Y pixel position, converted through the
//   chart's current Y-axis domain via inverse Y-axis scale. This is a pure
//   graph-coordinate readout — it works over empty graph area, above/below
//   curves, and between curves, independent of any curve value.
//
// CURVE VALUES (secondary):
//   The active response curve (by priority: post-eq > seat-overlay > rsp >
//   raw > room > sub-max > product-max) is sampled at the cursor frequency
//   and shown below the headline. The House Target is a comparison reference.
//
// Layout:
//   FREQUENCY              SPL
//   113.3 Hz               105.0 dBC  (cursor Y)
//
//   FINAL EQ RESPONSE
//   96.4 dBC               (curve value at cursor frequency)
//
//   TARGET
//   102.6 dBC
//   Below target           -6.2 dB
//
//   CALIBRATION
//   Operating level adjustment -27.0 dB

import React from "react";
import { resolveTooltipCurveAuthority } from "./bassTooltipCurveAuthority";

const COLORS = {
  green: "#16A34A",
  blue: "#2563EB",
  grey: "#64748B",
  brown: "#625143",
  orange: "#B45309",
  dark: "#1B1A1A",
  muted: "#625143",
  border: "#DCDBD6",
  bg: "rgba(255,255,255,0.94)",
};

const isFinite = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

const formatHz = (v) => isFinite(v) ? `${Number(v).toFixed(1)} Hz` : "—";
const formatSpl = (v) => isFinite(v) ? `${Number(v).toFixed(1)} dBC` : "—";
const formatSignedDb = (v) => {
  if (!isFinite(v)) return "—";
  const n = Number(v);
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)} dB`;
};

function Divider() {
  return <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 7, paddingTop: 7 }} />;
}

function SectionLabel({ children, color }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
      textTransform: "uppercase", color, marginBottom: 3,
    }}>
      {children}
    </div>
  );
}

function Row({ label, value, valueColor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
      <span style={{ fontSize: 11, color: COLORS.muted }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: valueColor || COLORS.dark, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

/**
 * Convert cursor pixel Y to SPL (dBC) using the chart's Y-axis domain and
 * plot area geometry. Y-axis is inverted: top = yMax, bottom = yMin.
 *
 * @param {object} coordinate - Recharts cursor pixel position { x, y }
 * @param {object} viewBox   - Recharts plot area { x, y, width, height }
 * @param {number} yMin       - Y-axis minimum (bottom)
 * @param {number} yMax       - Y-axis maximum (top)
 * @returns {number|null} SPL in dBC, or null if geometry unavailable
 */
function computeCursorSpl(coordinate, viewBox, yMin, yMax) {
  if (!coordinate || !viewBox) return null;
  const cursorY = Number(coordinate.y);
  const plotTop = Number(viewBox.y);
  const plotHeight = Number(viewBox.height);
  if (!Number.isFinite(cursorY) || !Number.isFinite(plotTop) || !Number.isFinite(plotHeight) || plotHeight <= 0) return null;
  const fraction = (cursorY - plotTop) / plotHeight;
  const clamped = Math.max(0, Math.min(1, fraction));
  return yMax - clamped * (yMax - yMin);
}

/**
 * Compact bass graph hover tooltip.
 *
 * @param {boolean} active - whether the tooltip is active (cursor over chart)
 * @param {Array}  payload - Recharts payload entries (closest series with shared=false)
 * @param {number|string} label - the X-axis value (frequency)
 * @param {Array}  series - series metadata array [{id, kind, color, label, ...}]
 * @param {number} operatingLevelOffsetDb - calibration operating-level offset
 */
export default function BassGraphTooltip({
  active,
  payload,
  label,
  coordinate,
  viewBox,
  series = [],
  operatingLevelOffsetDb = 0,
  yDomain = [70, 140],
}) {
  if (!active) return null;

  const [yMin, yMax] = yDomain;

  // ── HEADLINE: cursor coordinates (not curve values) ──
  // Frequency from cursor X — Recharts `label` is the X-axis value at the
  // cursor position, already converted through the log frequency scale.
  const freqValue = isFinite(label) ? Number(label) : null;
  const freqDisplay = freqValue !== null ? formatHz(freqValue) : "—";

  // SPL from cursor Y — pixel → inverse Y-axis scale → dBC.
  // Works over empty graph area, above/below curves, and between curves.
  const cursorSpl = computeCursorSpl(coordinate, viewBox, yMin, yMax);
  const cursorSplDisplay = cursorSpl !== null ? formatSpl(cursorSpl) : "—";

  // ── SECONDARY: curve values at cursor frequency ──
  // The active response curve (by priority: post-eq > seat-overlay > rsp >
  // raw > room > sub-max > product-max), sampled at the cursor frequency.
  const row = payload?.[0]?.payload;
  const authority = row
    ? resolveTooltipCurveAuthority({
        row,
        series,
        fallbackDataKey: payload[0]?.dataKey || null,
      })
    : null;

  const finalEqSpl = authority?.responseSpl;
  const finalEqLabel = authority?.activeCurveLabel || "FINAL EQ RESPONSE";
  const houseCurveValue = authority?.targetSpl;
  const diffFromTarget = authority?.delta;
  const aboveTarget = authority?.aboveTarget;

  // Calibration (static line, no expansion)
  const hasCalibration = isFinite(operatingLevelOffsetDb) && Number(operatingLevelOffsetDb) !== 0;
  const calibrationDb = hasCalibration ? Number(operatingLevelOffsetDb) : null;

  // Delta label: "Above target" / "Below target" / "Vs target" (when equal)
  const deltaLabel = aboveTarget === null
    ? "Vs target"
    : diffFromTarget > 0
      ? "Above target"
      : diffFromTarget < 0
        ? "Below target"
        : "Vs target";
  const deltaColor = aboveTarget === null
    ? COLORS.grey
    : diffFromTarget > 0
      ? COLORS.orange
      : diffFromTarget < 0
        ? COLORS.blue
        : COLORS.grey;

  return (
    <div style={{
      background: COLORS.bg, backdropFilter: "blur(6px)",
      border: `1px solid ${COLORS.border}`, borderRadius: 8,
      padding: 10, maxWidth: 220, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      fontFamily: "inherit",
      // Ensure the card never captures pointer events — pure readout.
      pointerEvents: "none",
    }}>
      {/* ── HEADLINE: cursor X/Y coordinates ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.muted }}>
            Frequency
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.dark, lineHeight: 1.2 }}>
            {freqDisplay}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.green }}>
            SPL
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.green, lineHeight: 1.2 }}>
            {cursorSplDisplay}
          </div>
        </div>
      </div>

      {/* ── SECONDARY: Final EQ curve value at cursor frequency ── */}
      {isFinite(finalEqSpl) && (
        <>
          <Divider />
          <SectionLabel color={COLORS.dark}>{finalEqLabel}</SectionLabel>
          <Row label="Curve value" value={formatSpl(finalEqSpl)} valueColor={COLORS.dark} />
        </>
      )}

      {/* ── TARGET COMPARISON ── */}
      {isFinite(houseCurveValue) && (
        <>
          <Divider />
          <SectionLabel color={COLORS.blue}>Target</SectionLabel>
          <Row label="Target SPL" value={formatSpl(houseCurveValue)} valueColor={COLORS.blue} />
          {isFinite(diffFromTarget) && (
            <Row
              label={deltaLabel}
              value={formatSignedDb(diffFromTarget)}
              valueColor={deltaColor}
            />
          )}
        </>
      )}

      {/* ── CALIBRATION (static line) ── */}
      {hasCalibration && (
        <>
          <Divider />
          <SectionLabel color={COLORS.grey}>Calibration</SectionLabel>
          <Row label="Operating level adjustment" value={formatSignedDb(calibrationDb)} valueColor={COLORS.grey} />
        </>
      )}
    </div>
  );
}