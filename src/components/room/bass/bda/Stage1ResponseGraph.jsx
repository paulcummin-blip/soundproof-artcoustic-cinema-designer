// Stage1ResponseGraph.jsx
// ---------------------------------------------------------------------------
// Mini predicted relative room-response graph for a Stage 1 recommendation
// card. Displays the RSP curve (solid), the average Primary-seat curve
// (dashed), and the Primary seat-to-seat variation band (shaded), all in the
// 20–80 Hz range with a consistent dB axis across all three cards.
//
// Curves are labelled as "Predicted relative room response" — not measured
// SPL or final product-specific performance. No curves are independently
// flattened, exaggerated or artificially smoothed.
//
// @param {object} preview — normalised preview ({ rspCurve, primaryAverage,
//   primaryBand: { min, max }, primaryCount, secondaryCount })
// @param {number} yMin — common dB axis minimum across all three cards
// @param {number} yMax — common dB axis maximum across all three cards
// ---------------------------------------------------------------------------

import React from "react";

const FREQ_MIN = 20;
const FREQ_MAX = 80;
const GRAPH_HEIGHT = 64;
const GRAPH_PADDING = { top: 4, right: 4, bottom: 14, left: 4 };

function freqToX(freq, width) {
  const innerW = width - GRAPH_PADDING.left - GRAPH_PADDING.right;
  const t = (freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN);
  return GRAPH_PADDING.left + t * innerW;
}

function dbToY(db, yMin, yMax, height) {
  const innerH = height - GRAPH_PADDING.top - GRAPH_PADDING.bottom;
  const t = (db - yMin) / (yMax - yMin);
  return GRAPH_PADDING.top + (1 - t) * innerH;
}

function buildPath(curve, yMin, yMax, width, height) {
  const points = (curve || []).filter((p) => Number.isFinite(p.spl) && p.frequency >= FREQ_MIN && p.frequency <= FREQ_MAX);
  if (points.length < 2) return "";
  return points.map((p, i) => {
    const x = freqToX(p.frequency, width);
    const y = dbToY(p.spl, yMin, yMax, height);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function buildBandPath(minCurve, maxCurve, yMin, yMax, width, height) {
  const minPts = (minCurve || []).filter((p) => Number.isFinite(p.spl) && p.frequency >= FREQ_MIN && p.frequency <= FREQ_MAX);
  const maxPts = (maxCurve || []).filter((p) => Number.isFinite(p.spl) && p.frequency >= FREQ_MIN && p.frequency <= FREQ_MAX);
  if (minPts.length < 2 || maxPts.length < 2) return "";
  const top = maxPts.map((p, i) => {
    const x = freqToX(p.frequency, width);
    const y = dbToY(p.spl, yMin, yMax, height);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const bottom = minPts.slice().reverse().map((p) => {
    const x = freqToX(p.frequency, width);
    const y = dbToY(p.spl, yMin, yMax, height);
    return `L${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `${top} ${bottom} Z`;
}

export default function Stage1ResponseGraph({ preview, yMin, yMax, width = 240 }) {
  const height = GRAPH_HEIGHT;
  if (!preview || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return (
      <div className="rounded border border-[#E7E4DF] bg-[#F8F7F4]" style={{ height }}>
        <div className="flex items-center justify-center h-full text-[9px] text-[#8A7B6A]">
          Response preview recovering…
        </div>
      </div>
    );
  }

  const rspPath = buildPath(preview.rspCurve, yMin, yMax, width, height);
  const avgPath = buildPath(preview.primaryAverage, yMin, yMax, width, height);
  const bandPath = buildPath(preview.primaryBand?.min, preview.primaryBand?.max, yMin, yMax, width, height);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded border border-[#E7E4DF] bg-[#F8F7F4]" style={{ height }}>
        {/* Primary seat-to-seat variation band */}
        {bandPath && <path d={bandPath} fill="#213428" fillOpacity={0.12} stroke="none" />}
        {/* RSP curve (solid) */}
        {rspPath && <path d={rspPath} fill="none" stroke="#213428" strokeWidth={1.5} />}
        {/* Primary average (dashed) */}
        {avgPath && <path d={avgPath} fill="none" stroke="#625143" strokeWidth={1} strokeDasharray="3,2" />}
        {/* X-axis labels */}
        <text x={freqToX(20, width)} y={height - 3} fontSize="7" fill="#8A7B6A" textAnchor="start">20 Hz</text>
        <text x={freqToX(80, width)} y={height - 3} fontSize="7" fill="#8A7B6A" textAnchor="end">80 Hz</text>
      </svg>
      <div className="flex items-center gap-3 mt-0.5 text-[8px] text-[#8A7B6A]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-[1.5px] bg-[#213428]" />
          RSP
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-[1.5px] border-t border-dashed border-[#625143]" />
          Primary avg
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-[6px] bg-[#213428] opacity-20" />
          Seat variation
        </span>
      </div>
      <div className="text-[8px] text-[#8A7B6A] mt-0.5">
        Predicted relative room response · not product-specific SPL
      </div>
    </div>
  );
}