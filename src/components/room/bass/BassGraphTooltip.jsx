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
//   Operating level adjustment -27 dB   (whole-number; exact values in Expert)
//
// RESIDUAL PRESENTATION (design-facing rule)
//   A residual under 1 dB is not meaningful here and is stated as
//   "No meaningful deviation". Residuals of 1 dB or more are stated in
//   whole-number dB ("Below target 1 dB"). No decimal dB appears in the
//   user-facing tooltip; exact signed values remain in Expert details only.
//
// EXPERT DETAIL (Engineering Mode only)
//   Distinguishes the initial operating-level adjustment, the final global
//   alignment trim and the final effective adjustment, alongside the correction
//   smoothing, capability-limit and protected-null flags, the graph smoothing
//   basis, the official P19 basis, and the persisted per-frequency correction
//   trace. When the loaded result predates the trace, it says so instead of
//   inventing values.

import React from "react";
import { resolveTooltipCurveAuthority } from "./bassTooltipCurveAuthority";
import { useEngineeringMode } from "@/components/state/useEngineeringMode";
import { bassSmoothingLabel } from "./bassGraphSmoothing";
import {
  buildExpertTraceRows,
  formatResidualStatement,
  formatWholeDb,
  formatWholeSpl,
} from "./bassResidualPresentation";
import {
  CORRECTION_TRACE_UNAVAILABLE_COPY,
  OFFICIAL_P19_SMOOTHING_BASIS,
  readCorrectionTraceAtFrequency,
} from "./correctionTraceAuthority";

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
// Design-facing dB is whole-number only. Exact values live in Expert details.
const formatSpl = (v) => (isFinite(v) ? formatWholeSpl(v) : "—");
const formatSignedDb = (v) => formatWholeDb(v);

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
  correctionTrace = null,
  smoothingMode = "none",
  yDomain = [70, 140],
}) {
  // Expert rows appear only in Engineering Mode — never in the simple readout.
  // The store hook is called before the early return so the hook order is fixed.
  const { engineeringMode } = useEngineeringMode();

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

  const isPlacementPreview = series.some((s) => s?.kind === "room-response-preview");
  // Recharts includes both preview curves in the tooltip payload, with the
  // previous result first. Resolve the curve nearest the cursor instead.
  const previewCurve = isPlacementPreview
    ? series
        .map((item) => ({ item, spl: row?.[`spl_${item.id}`] }))
        .filter(({ spl }) => isFinite(spl))
        .sort((a, b) => Math.abs(Number(a.spl) - cursorSpl) - Math.abs(Number(b.spl) - cursorSpl))[0]
    : null;
  const finalEqSpl = isPlacementPreview ? previewCurve?.spl : authority?.responseSpl;
  const finalEqLabel = isPlacementPreview
    ? (previewCurve?.item?.label || "Room Response Preview")
    : (authority?.activeCurveLabel || "FINAL EQ RESPONSE");
  const houseCurveValue = authority?.targetSpl;
  const diffFromTarget = authority?.delta;
  const aboveTarget = authority?.aboveTarget;

  // Calibration (static line, no expansion)
  const hasCalibration = !isPlacementPreview && isFinite(operatingLevelOffsetDb) && Number(operatingLevelOffsetDb) !== 0;
  const calibrationDb = hasCalibration ? Number(operatingLevelOffsetDb) : null;

  // Residual statement: a sub-1 dB residual is not a fault and is never shown
  // as a decimal deviation. 1 dB or more is stated in whole-number dB.
  const residualStatement = isFinite(diffFromTarget)
    ? formatResidualStatement(diffFromTarget)
    : null;
  const residualColor = aboveTarget === null || residualStatement === "No meaningful deviation"
    ? COLORS.grey
    : (diffFromTarget > 0 ? COLORS.orange : COLORS.blue);

  // Expert detail: the persisted correction trace at the cursor frequency.
  const traceRecord = engineeringMode && freqValue !== null
    ? readCorrectionTraceAtFrequency(correctionTrace, freqValue)
    : null;
  const expertRows = engineeringMode
    ? buildExpertTraceRows({
        trace: correctionTrace,
        record: traceRecord,
        displaySmoothingLabel: bassSmoothingLabel(smoothingMode),
        officialBasisLabel: bassSmoothingLabel(OFFICIAL_P19_SMOOTHING_BASIS),
      })
    : [];

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
          {residualStatement && (
            <Row label="Target" value={residualStatement} valueColor={residualColor} />
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

      {/* ── EXPERT: calculation trace (Engineering Mode only) ── */}
      {engineeringMode && (
        <>
          <Divider />
          <SectionLabel color={COLORS.brown}>Calculation trace</SectionLabel>
          {expertRows.map(([label, value], index) => (
            <Row key={index} label={label} value={value} valueColor={COLORS.brown} />
          ))}
          {!traceRecord && (
            <div style={{ fontSize: 10, lineHeight: 1.45, color: COLORS.muted, marginTop: 3 }}>
              {CORRECTION_TRACE_UNAVAILABLE_COPY}
            </div>
          )}
        </>
      )}
    </div>
  );
}