// BassGraphTooltip — designer-friendly hover tooltip for the bass response graph.
//
// Prioritises what a cinema designer needs at a glance:
//   • How loud is the system here? (Current SPL)
//   • Above or below target? (Target + difference)
//   • How much headroom remains? (Maximum usable SPL)
//   • Is the room helping or hurting? (Room contribution)
//   • Calibration offset (when enabled)
//
// Engineering calculations (flat reference, product-only max, raw product+room
// max, power-summed capability, internal values) are preserved in a
// collapsible <details> section — hidden by default, expandable on demand.
//
// Presentation-only: does NOT recompute, re-grade, or alter any authority data.
// All values are read from the already-computed chart data row.

import React from "react";

const COLORS = {
  green: "#16A34A",
  blue: "#2563EB",
  grey: "#64748B",
  brown: "#625143",
  orange: "#B45309",
  purple: "#7C3AED",
  dark: "#1B1A1A",
  muted: "#625143",
  border: "#DCDBD6",
  bg: "rgba(255,255,255,0.92)",
};

const isFinite = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

const formatHz = (v) => isFinite(v) ? `${Number(v).toFixed(1)} Hz` : "—";
const formatSpl = (v) => isFinite(v) ? `${Number(v).toFixed(1)} dBC` : "—";
const formatSignedDb = (v) => {
  if (!isFinite(v)) return "—";
  const n = Number(v);
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)} dB`;
};

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

function Divider() {
  return <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 6, paddingTop: 6 }} />;
}

/**
 * Derive a human-readable "curve" label from the selected series.
 * Shows "Reference Position (RSP)" for the RSP curve, or the seat label
 * for seat-specific curves.
 */
function deriveCurveLabel(series) {
  if (!series) return "Response";
  const label = series.tooltipLabel || series.label || series.id || "Response";
  // Shorten common labels for the header
  if (label.includes("RSP after EQ")) return "Reference Position (RSP)";
  if (label.includes("RSP before EQ")) return "Reference Position (RSP) — before EQ";
  if (label.includes("Physical RSP")) return "Reference Position (RSP) — before EQ";
  // Seat-specific curves: "R2S1 after EQ" → "Row 2 · Seat 1"
  const seatMatch = label.match(/^R(\d+)S(\d+)/);
  if (seatMatch) {
    const row = Number(seatMatch[1]);
    const seat = Number(seatMatch[2]);
    const suffix = label.includes("before EQ") ? " — before EQ" : label.includes("after EQ") ? " — after EQ" : "";
    return `Row ${row} · Seat ${seat}${suffix}`;
  }
  return label;
}

/**
 * Redesigned bass graph tooltip.
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

  // Identify the closest (selected) series from the first payload entry.
  const selectedDataKey = payload[0]?.dataKey;
  const selectedSeriesId = selectedDataKey
    ? String(selectedDataKey).replace(/^spl_/, "")
    : null;
  const selectedSeries = series.find((s) => s?.id === selectedSeriesId) || null;
  const selectedValue = selectedDataKey ? row[selectedDataKey] : null;

  // Categorise all visible series by kind for structured display.
  const findSeries = (kind) => series.find((s) => s?.kind === kind);
  const findValue = (kind) => {
    const s = findSeries(kind);
    return s ? row[`spl_${s.id}`] : null;
  };

  const postEqSeries = findSeries("post-eq");
  const postEqValue = findValue("post-eq");
  const houseCurveSeries = findSeries("house-curve") || findSeries("normalized-target");
  const houseCurveValue = houseCurveSeries ? row[`spl_${houseCurveSeries.id}`] : null;
  const maximumSplSeries = findSeries("maximum-spl");
  const maximumSplValue = findValue("maximum-spl");
  const maximumSplMargin = maximumSplSeries?.safetyMarginDb;
  const productMaximumSeries = findSeries("product-maximum");
  const productMaximumValue = findValue("product-maximum");
  const roomResponseSeries = findSeries("room-response");
  const roomResponseValue = findValue("room-response");
  const roomResponseReferenceDb = roomResponseSeries?.systemPowerReferenceDb;
  const rawSeries = findSeries("raw");
  const rawValue = rawSeries ? row[`spl_${rawSeries.id}`] : null;

  // The "current SPL" is the value of whichever curve the cursor is closest to.
  // If no specific series is identified, fall back to the post-EQ RSP.
  const currentValue = isFinite(selectedValue) ? Number(selectedValue) : (isFinite(postEqValue) ? Number(postEqValue) : null);
  const currentLabel = deriveCurveLabel(selectedSeries || postEqSeries);

  // Difference from target
  const diffFromTarget = isFinite(currentValue) && isFinite(houseCurveValue)
    ? Number(currentValue) - Number(houseCurveValue)
    : null;
  const aboveTarget = isFinite(diffFromTarget) ? diffFromTarget >= 0 : null;

  // Remaining headroom
  const remainingHeadroom = isFinite(maximumSplValue) && isFinite(currentValue)
    ? Number(maximumSplValue) - Number(currentValue)
    : null;
  const capabilityLimited = isFinite(remainingHeadroom) && remainingHeadroom < 0;

  // Room contribution: room response vs its flat power-summed reference
  const roomContribution = isFinite(roomResponseValue) && isFinite(roomResponseReferenceDb)
    ? Number(roomResponseValue) - Number(roomResponseReferenceDb)
    : null;

  // Calibration
  const hasCalibration = isFinite(operatingLevelOffsetDb) && Number(operatingLevelOffsetDb) !== 0;
  const calibrationDb = hasCalibration ? Number(operatingLevelOffsetDb) : null;

  // Engineering values
  const rawSimulatedDb = isFinite(rawValue) && hasCalibration
    ? Number(rawValue) - Number(operatingLevelOffsetDb)
    : (isFinite(rawValue) ? Number(rawValue) : null);
  const peqAppliedDb = isFinite(rawValue) && isFinite(postEqValue)
    ? Number(postEqValue) - Number(rawValue)
    : null;
  const residualDb = isFinite(postEqValue) && isFinite(houseCurveValue)
    ? Number(postEqValue) - Number(houseCurveValue)
    : null;
  const rawInRoomMaxDb = isFinite(maximumSplValue) && isFinite(maximumSplMargin)
    ? Number(maximumSplValue) + Number(maximumSplMargin)
    : null;
  const roomLayoutEffectDb = isFinite(rawInRoomMaxDb) && isFinite(productMaximumValue)
    ? Number(rawInRoomMaxDb) - Number(productMaximumValue)
    : null;

  return (
    <div style={{
      background: COLORS.bg, backdropFilter: "blur(6px)",
      border: `1px solid ${COLORS.border}`, borderRadius: 8,
      padding: 10, maxWidth: 280, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      fontFamily: "inherit",
    }}>
      {/* ── HEADER ── */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.muted }}>
          Frequency
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.dark, lineHeight: 1.2 }}>
          {freqDisplay}
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.muted, marginTop: 2 }}>
          {currentLabel}
        </div>
      </div>

      {/* ── CURRENT POINT ── */}
      <Divider />
      <SectionLabel color={COLORS.green}>Measured / Predicted SPL</SectionLabel>
      <Row label="SPL at cursor" value={formatSpl(currentValue)} valueColor={COLORS.green} />

      {/* ── TARGET ── */}
      {isFinite(houseCurveValue) && (
        <>
          <Divider />
          <SectionLabel color={COLORS.blue}>Target House Curve</SectionLabel>
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

      {/* ── HEADROOM ── */}
      {isFinite(maximumSplValue) && (
        <>
          <Divider />
          <SectionLabel color={COLORS.green}>Headroom</SectionLabel>
          <Row label="Maximum usable SPL" value={formatSpl(maximumSplValue)} valueColor={COLORS.green} />
          {capabilityLimited ? (
            <Row label="Status" value="Capability limited" valueColor={COLORS.orange} />
          ) : isFinite(remainingHeadroom) && (
            <Row label="Remaining headroom" value={formatSignedDb(remainingHeadroom)} valueColor={COLORS.green} />
          )}
        </>
      )}

      {/* ── ROOM EFFECT ── */}
      {isFinite(roomContribution) && (
        <>
          <Divider />
          <SectionLabel color={COLORS.blue}>Room Effect</SectionLabel>
          <Row label="Room contribution" value={formatSignedDb(roomContribution)} valueColor={COLORS.blue} />
          <div style={{ fontSize: 9, color: COLORS.muted, marginTop: 2, lineHeight: 1.4 }}>
            {roomContribution >= 0
              ? "Positive — room gain is boosting output at this frequency."
              : "Negative — room cancellation is reducing output at this frequency."}
          </div>
        </>
      )}

      {/* ── CALIBRATION ── */}
      {hasCalibration && (
        <>
          <Divider />
          <SectionLabel color={COLORS.grey}>Calibration</SectionLabel>
          <Row label="Operating level adjustment" value={formatSignedDb(calibrationDb)} valueColor={COLORS.grey} />
        </>
      )}

      {/* ── ENGINEERING DETAILS (collapsible) ── */}
      <details style={{ marginTop: 6, borderTop: `1px solid ${COLORS.border}`, paddingTop: 6 }}>
        <summary style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
          textTransform: "uppercase", color: COLORS.grey, cursor: "pointer",
          userSelect: "none", outline: "none",
        }}>
          Engineering Details
        </summary>
        <div style={{ marginTop: 4, display: "grid", gap: 2 }}>
          {isFinite(roomResponseReferenceDb) && (
            <Row label="Flat reference SPL" value={formatSpl(roomResponseReferenceDb)} valueColor={COLORS.grey} />
          )}
          {isFinite(productMaximumValue) && (
            <Row label="Product-only maximum" value={formatSpl(productMaximumValue)} valueColor={COLORS.grey} />
          )}
          {isFinite(rawInRoomMaxDb) && (
            <Row label="Raw product + room max" value={formatSpl(rawInRoomMaxDb)} valueColor={COLORS.grey} />
          )}
          {isFinite(roomLayoutEffectDb) && (
            <Row label="Room/layout effect on max" value={formatSignedDb(roomLayoutEffectDb)} valueColor={COLORS.grey} />
          )}
          {isFinite(rawSimulatedDb) && (
            <Row label="Raw simulated RSP" value={formatSpl(rawSimulatedDb)} valueColor={COLORS.grey} />
          )}
          {isFinite(peqAppliedDb) && (
            <Row label="PEQ applied" value={formatSignedDb(peqAppliedDb)} valueColor={COLORS.grey} />
          )}
          {isFinite(residualDb) && (
            <Row label="Final residual vs target" value={formatSignedDb(residualDb)} valueColor={COLORS.grey} />
          )}
          {/* Per-series raw values for complete traceability */}
          {series.filter((s) => isFinite(row[`spl_${s.id}`])).map((s) => (
            <Row
              key={s.id}
              label={s.tooltipLabel || s.label || s.id}
              value={formatSpl(row[`spl_${s.id}`])}
              valueColor={COLORS.grey}
            />
          ))}
        </div>
      </details>
    </div>
  );
}