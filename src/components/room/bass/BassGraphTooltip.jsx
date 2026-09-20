// BassGraphTooltip — compact, non-interactive hover readout for the bass graph.
//
// Presentation-only: does NOT recompute, re-grade, or alter any authority data.
// All values are read from the already-computed chart data row (which already
// reflects the displayed smoothing — 1/3 octave or otherwise) via the pure
// resolveTooltipCurveAuthority helper.
//
// CURVE AUTHORITY:
//   The primary SPL comes from the ACTIVE RESPONSE CURVE (by priority:
//   post-eq > seat-overlay > rsp > raw > room > sub-max > product-max),
//   NEVER from the House Target. The House Target is always a comparison
//   reference, sampled independently at the same cursor frequency.
//
// Layout:
//   FREQUENCY              [ACTIVE CURVE LABEL]
//   113.3 Hz               96.4 dBC
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
  series = [],
  operatingLevelOffsetDb = 0,
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  // ── Resolve curve authority via the pure helper ──
  // The primary SPL comes from the active response curve (by priority),
  // NOT from payload[0] (which is merely the closest series to the cursor).
  const authority = resolveTooltipCurveAuthority({
    row,
    series,
    fallbackDataKey: payload[0]?.dataKey || null,
  });

  if (!authority) return null;

  const freqDisplay = isFinite(authority.frequency)
    ? formatHz(authority.frequency)
    : (isFinite(label) ? formatHz(label) : String(label));

  const currentValue = authority.responseSpl;
  const houseCurveValue = authority.targetSpl;
  const diffFromTarget = authority.delta;
  const aboveTarget = authority.aboveTarget;
  const activeCurveLabel = authority.activeCurveLabel || "RESPONSE";

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
      {/* ── PRIMARY HOVER READOUT: FREQUENCY + ACTIVE CURVE SPL ── */}
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
            {activeCurveLabel}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.green, lineHeight: 1.2 }}>
            {formatSpl(currentValue)}
          </div>
        </div>
      </div>

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