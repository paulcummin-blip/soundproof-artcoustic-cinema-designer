// BassGraphTooltip — compact, non-interactive hover readout for the bass graph.
//
// Presentation-only: does NOT recompute, re-grade, or alter any authority data.
// All values are read from the already-computed chart data row (which already
// reflects the displayed smoothing — 1/3 octave or otherwise).
//
// Layout:
//   FREQUENCY       SPL
//   80.7 Hz         103.4 dBC
//
//   TARGET
//   103.4 dBC
//   Δ +0.0 dB
//
//   CALIBRATION
//   Operating level adjustment -27.0 dB
//
// No expandable sections, no submenus, no interaction required.

import React from "react";

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
 * @param {Array}  series - series metadata array [{id, kind, color, label, tooltipLabel, ...}]
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

  const actualFreq = row?.frequency;
  const freqDisplay = isFinite(actualFreq)
    ? formatHz(actualFreq)
    : (isFinite(label) ? formatHz(label) : String(label));

  // Identify the closest (hovered) series from the first payload entry.
  // The SPL shown must correspond to the currently hovered response curve.
  const selectedDataKey = payload[0]?.dataKey;
  const selectedSeriesId = selectedDataKey
    ? String(selectedDataKey).replace(/^spl_/, "")
    : null;
  const selectedSeries = series.find((s) => s?.id === selectedSeriesId) || null;
  const selectedValue = selectedDataKey ? row[selectedDataKey] : null;

  // House curve target (kind: "house-curve" or "normalized-target")
  const houseCurveSeries = series.find((s) => s?.kind === "house-curve") || series.find((s) => s?.kind === "normalized-target");
  const houseCurveValue = houseCurveSeries ? row[`spl_${houseCurveSeries.id}`] : null;

  // The displayed SPL is the value of the hovered curve at the cursor frequency.
  // Falls back to post-EQ RSP only if no specific series is identified.
  const currentValue = isFinite(selectedValue)
    ? Number(selectedValue)
    : (() => {
        const postEq = series.find((s) => s?.kind === "post-eq");
        const v = postEq ? row[`spl_${postEq.id}`] : null;
        return isFinite(v) ? Number(v) : null;
      })();

  // Difference from target
  const diffFromTarget = isFinite(currentValue) && isFinite(houseCurveValue)
    ? Number(currentValue) - Number(houseCurveValue)
    : null;
  const aboveTarget = isFinite(diffFromTarget) ? diffFromTarget >= 0 : null;

  // Calibration (static line, no expansion)
  const hasCalibration = isFinite(operatingLevelOffsetDb) && Number(operatingLevelOffsetDb) !== 0;
  const calibrationDb = hasCalibration ? Number(operatingLevelOffsetDb) : null;

  return (
    <div style={{
      background: COLORS.bg, backdropFilter: "blur(6px)",
      border: `1px solid ${COLORS.border}`, borderRadius: 8,
      padding: 10, maxWidth: 220, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      fontFamily: "inherit",
      // Ensure the card never captures pointer events — pure readout.
      pointerEvents: "none",
    }}>
      {/* ── PRIMARY HOVER READOUT: FREQUENCY + SPL together ── */}
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
              label={aboveTarget ? "Above target" : "Below target"}
              value={formatSignedDb(diffFromTarget)}
              valueColor={aboveTarget ? COLORS.orange : COLORS.blue}
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