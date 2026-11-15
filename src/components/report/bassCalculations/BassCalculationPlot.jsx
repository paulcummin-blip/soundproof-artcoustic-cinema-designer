// BassCalculationPlot.jsx
// ---------------------------------------------------------------------------
// Compact SVG line chart for one quadrant of the Bass Calculations page.
//
// Same log-frequency axis and fixed dB window as the Technical Report's
// BassResponsePlot, but sized for a 2 × 2 grid and able to plot up to three
// curves (data + target, or multiple subwoofer capability curves). Pure
// presentation: every curve arrives from bassCalculationsAuthority.

import React from "react";
import { REPORT_FONT_BODY } from "@/components/report/typography/reportTypography";

const VIEW_W = 620;
const VIEW_H = 420;
const MARGIN = { left: 64, right: 18, top: 24, bottom: 54 };
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom;

const AXIS_COLOR = "#3E4349";
const GRID_COLOR = "#E7E5E0";
const TEXT = "#1B1A1A";
const MUTED = "#625143";

const X_LABELS = [20, 30, 50, 80, 120, 200];

const finite = (v) => Number.isFinite(Number(v));

const xScale = (freq, domain) => {
  const [min, max] = domain;
  const safe = Math.max(Number(freq), min);
  const ratio = (Math.log10(safe) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
  return MARGIN.left + ratio * PLOT_W;
};

const yScale = (spl, domain) => {
  const [min, max] = domain;
  const ratio = (Number(spl) - min) / (max - min);
  return MARGIN.top + PLOT_H * (1 - ratio);
};

const curvePath = (data, xDomain, yDomain) => {
  let path = "";
  let open = false;
  for (const p of data) {
    if (!finite(p?.frequency) || !finite(p?.spl)) {
      open = false;
      continue;
    }
    const x = xScale(p.frequency, xDomain).toFixed(2);
    const y = yScale(p.spl, yDomain).toFixed(2);
    path += `${open ? "L" : "M"}${x} ${y} `;
    open = true;
  }
  return path.trim();
};

const autoYDomain = (curves, fallback = [70, 140]) => {
  let min = Infinity;
  let max = -Infinity;
  for (const c of curves) {
    for (const p of c || []) {
      if (!finite(p?.spl)) continue;
      if (p.spl < min) min = p.spl;
      if (p.spl > max) max = p.spl;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return fallback;
  const lo = Math.floor((min - 5) / 10) * 10;
  const hi = Math.ceil((max + 5) / 10) * 10;
  if (hi - lo < 20) return fallback;
  return [lo, hi];
};

/**
 * @param {object} props
 * @param {Array} props.series - [{ id, label, color, data, dash, width }]
 * @param {number[]} [props.xDomain=[15, 200]]
 * @param {number[]} [props.yDomain] - auto-detected when omitted
 */
export default function BassCalculationPlot({
  series = [],
  xDomain = [15, 200],
  yDomain = null,
}) {
  const allCurves = series.map((s) => s.data || []);
  const yDom = yDomain || autoYDomain(allCurves);
  const xTicks = X_LABELS.filter((f) => f >= xDomain[0] && f <= xDomain[1]);
  const yTicks = [];
  for (let db = Math.ceil(yDom[0] / 10) * 10; db <= yDom[1]; db += 10) yTicks.push(db);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      role="img"
      style={{ display: "block", width: "100%", height: "auto", fontFamily: REPORT_FONT_BODY }}
    >
      <rect x={MARGIN.left} y={MARGIN.top} width={PLOT_W} height={PLOT_H} fill="#FFFFFF" stroke={GRID_COLOR} />

      {yTicks.map((db) => (
        <line key={`y-${db}`} x1={MARGIN.left} x2={MARGIN.left + PLOT_W} y1={yScale(db, yDom)} y2={yScale(db, yDom)} stroke={GRID_COLOR} strokeWidth="1" />
      ))}
      {xTicks.map((f) => (
        <line key={`x-${f}`} x1={xScale(f, xDomain)} x2={xScale(f, xDomain)} y1={MARGIN.top} y2={MARGIN.top + PLOT_H} stroke={GRID_COLOR} strokeWidth="1" />
      ))}

      {series.map((entry) => (
        <path
          key={entry.id}
          d={curvePath(entry.data || [], xDomain, yDom)}
          fill="none"
          stroke={entry.color || "#213428"}
          strokeWidth={entry.width || 2}
          strokeDasharray={entry.dash || undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      <line x1={MARGIN.left} x2={MARGIN.left} y1={MARGIN.top} y2={MARGIN.top + PLOT_H} stroke={AXIS_COLOR} strokeWidth="1.5" />
      <line x1={MARGIN.left} x2={MARGIN.left + PLOT_W} y1={MARGIN.top + PLOT_H} y2={MARGIN.top + PLOT_H} stroke={AXIS_COLOR} strokeWidth="1.5" />

      {yTicks.map((db) => (
        <text key={`yl-${db}`} x={MARGIN.left - 10} y={yScale(db, yDom) + 4} textAnchor="end" fill={MUTED} fontSize="13">
          {db}
        </text>
      ))}
      <text x={20} y={MARGIN.top + PLOT_H / 2} fill={TEXT} fontSize="14" fontWeight="600" textAnchor="middle" transform={`rotate(-90 20 ${MARGIN.top + PLOT_H / 2})`}>
        SPL (dB)
      </text>

      {xTicks.map((f) => (
        <text key={`xl-${f}`} x={xScale(f, xDomain)} y={MARGIN.top + PLOT_H + 22} textAnchor="middle" fill={MUTED} fontSize="13">
          {f}
        </text>
      ))}
      <text x={MARGIN.left + PLOT_W / 2} y={VIEW_H - 14} fill={TEXT} fontSize="14" fontWeight="600" textAnchor="middle">
        Frequency (Hz)
      </text>
    </svg>
  );
}