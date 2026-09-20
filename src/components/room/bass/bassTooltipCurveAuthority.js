// bassTooltipCurveAuthority.js
//
// Pure curve-authority resolver for the Bass Response graph tooltip.
//
// Determines which response curve is "active" (the primary response being
// measured), reads its SPL from the pre-interpolated chartData row, and
// independently reads the House Target SPL from the same row.
//
// The House Target is NEVER the primary response SPL — it is always a
// comparison reference. The active response is the highest-priority VISIBLE
// response curve:
//   real-seat-overlay > post-eq > rsp > raw > room-response > maximum-spl > product-maximum
//
// Interpolation method: the chartData row is already pre-interpolated by
// mergeBassGraphSeries (bassGraphSeriesAlignment.js) using LOG-SPACE LINEAR
// interpolation:
//   ratio = log(f / f_low) / log(f_high / f_low)
//   value = v_low + (v_high - v_low) * ratio
// The tooltip reads the pre-interpolated value at the nearest chartData
// frequency point — no additional interpolation is needed. The value matches
// the plotted curve exactly because both consume the same chartData row.
//
// Smoothing parity: the chartData is built from visibleMultiSeries which is
// built by buildBassGraphSeries with the current smoothingMode. The tooltip
// reads from the same row, so it automatically reflects the displayed smoothing.

const RESPONSE_KIND_PRIORITY = [
  // real-seat-overlay takes priority over post-eq: when a specific seat is
  // selected (e.g. R1S2), the tooltip must interrogate that seat's response,
  // not the RSP EQ curve.
  { kind: "real-seat-overlay", label: "SEAT RESPONSE" },
  { kind: "post-eq", label: "FINAL EQ RESPONSE" },
  { kind: "rsp", label: "RSP RESPONSE" },
  { kind: "raw", label: "RAW RESPONSE" },
  { kind: "room-response", label: "ROOM RESPONSE" },
  { kind: "maximum-spl", label: "SUBWOOFER MAXIMUM" },
  { kind: "product-maximum", label: "PRODUCT + ROOM MAXIMUM" },
];

const TARGET_KINDS = new Set(["house-curve", "normalized-target"]);

const isFin = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/**
 * Resolve the tooltip curve authority at the cursor frequency.
 *
 * @param {Object}  row            - The chartData row at the cursor frequency (payload[0].payload)
 * @param {Array}   series         - Visible series metadata array (multiSeries)
 * @param {string|null} fallbackDataKey - payload[0].dataKey (non-multi mode fallback)
 * @returns {{ frequency, activeCurveLabel, responseSpl, targetSpl, delta, aboveTarget } | null}
 */
export function resolveTooltipCurveAuthority({ row, series = [], fallbackDataKey = null }) {
  if (!row) return null;

  const frequency = isFin(row.frequency) ? Number(row.frequency) : null;
  const seriesList = Array.isArray(series) ? series : [];

  // ── Active response curve: highest-priority visible response series ──
  let activeSeries = null;
  let activeLabel = null;
  for (const { kind, label } of RESPONSE_KIND_PRIORITY) {
    const found = seriesList.find((s) => s?.kind === kind);
    if (found) {
      activeSeries = found;
      // For real-seat-overlay, include the seat id in the label if available
      activeLabel = kind === "real-seat-overlay" && found.label
        ? `${found.label} RESPONSE`
        : label;
      break;
    }
  }

  // Response SPL from the active response curve's column in the chartData row
  let responseSpl = null;
  if (activeSeries) {
    const v = row[`spl_${activeSeries.id}`];
    if (isFin(v)) responseSpl = Number(v);
  }
  // Fallback for non-multi mode (series=[]): use the payload's own dataKey
  // (splGood / splBad / spl — these are actual response values, never the target)
  if (responseSpl === null && fallbackDataKey) {
    const v = row[fallbackDataKey];
    if (isFin(v)) responseSpl = Number(v);
  }

  // ── House Target SPL (independent of response — comparison only) ──
  const targetSeries = seriesList.find((s) => TARGET_KINDS.has(s?.kind)) || null;
  let targetSpl = null;
  if (targetSeries) {
    const v = row[`spl_${targetSeries.id}`];
    if (isFin(v)) targetSpl = Number(v);
  }

  // ── Delta (response - target, computed independently) ──
  let delta = null;
  let aboveTarget = null;
  if (responseSpl !== null && targetSpl !== null) {
    delta = responseSpl - targetSpl;
    aboveTarget = delta >= 0;
  }

  return {
    frequency,
    activeCurveLabel: activeLabel,
    responseSpl,
    targetSpl,
    delta,
    aboveTarget,
  };
}