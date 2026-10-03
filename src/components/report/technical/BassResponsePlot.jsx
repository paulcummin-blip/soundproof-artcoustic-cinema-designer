// BassResponsePlot.jsx
// ---------------------------------------------------------------------------
// The Technical Report's bass response graph, drawn as plain SVG.
//
// Pure presentation: every curve, marker and domain arrives from
// bassResponseGraphAuthority (which reads the same frozen authorities the app
// graph reads). Nothing here calculates, smooths or re-interprets a curve.
//
// Log frequency axis, the same fixed dB window the app graph locks (70–140 dB),
// labelled axes, target line, and the transition / limiting frequency markers
// stated in words.
// ---------------------------------------------------------------------------

import React from "react";
import { REPORT_FONT_BODY } from "@/components/report/typography/reportTypography";

const VIEW_W = 1200;
const VIEW_H = 700;
const MARGIN = { left: 92, right: 28, top: 38, bottom: 86 };
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom;

const AXIS_COLOR = "#3E4349";
const GRID_COLOR = "#E7E5E0";
const TEXT = "#1B1A1A";
const MUTED = "#625143";

const X_LABELS = [15, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300];

const finite = (value) => Number.isFinite(Number(value));

/** Log-frequency → x, inside the plot box. */
const xScale = (frequency, domain) => {
  const [min, max] = domain;
  const safe = Math.max(Number(frequency), min);
  const ratio = (Math.log10(safe) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
  return MARGIN.left + ratio * PLOT_W;
};

/** dB → y, inside the plot box. */
const yScale = (spl, domain) => {
  const [min, max] = domain;
  const ratio = (Number(spl) - min) / (max - min);
  return MARGIN.top + PLOT_H * (1 - ratio);
};

/** A polyline path for one curve; breaks at non-finite points. */
const curvePath = (data, xDomain, yDomain) => {
  let path = "";
  let open = false;
  for (const point of data) {
    if (!finite(point?.frequency) || !finite(point?.spl)) {
      open = false;
      continue;
    }
    const x = xScale(point.frequency, xDomain).toFixed(2);
    const y = yScale(point.spl, yDomain).toFixed(2);
    path += `${open ? "L" : "M"}${x} ${y} `;
    open = true;
  }
  return path.trim();
};

export default function BassResponsePlot({
  series = [],
  xDomain = [15, 200],
  yDomain = [70, 140],
  markers = {},
  chartId = "bass-response",
}) {
  const xTicks = X_LABELS.filter((frequency) => frequency >= xDomain[0] && frequency <= xDomain[1]);
  const yTicks = [];
  for (let db = yDomain[0]; db <= yDomain[1]; db += 10) yTicks.push(db);

  const band = markers.assessmentBand || {};
  const bandVisible = finite(band.startHz) && finite(band.endHz) && band.endHz > band.startHz;
  const markerLines = [
    finite(markers.transitionHz)
      ? { frequency: Number(markers.transitionHz), label: `Transition ≈ ${Math.round(Number(markers.transitionHz))} Hz`, color: "#625143" }
      : null,
    finite(markers.limitingFrequencyHz)
      ? { frequency: Number(markers.limitingFrequencyHz), label: `Limiting ≈ ${Math.round(Number(markers.limitingFrequencyHz))} Hz`, color: "#B45309" }
      : null,
    finite(markers.p18FrequencyHz)
      ? { frequency: Number(markers.p18FrequencyHz), label: `P18 −3 dB ≈ ${Math.round(Number(markers.p18FrequencyHz))} Hz`, color: "#1D4ED8" }
      : null,
  ]
    .filter(Boolean)
    .filter((marker) => marker.frequency >= xDomain[0] && marker.frequency <= xDomain[1]);

  return (
    <svg
      data-bass-graph={chartId}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      role="img"
      style={{ display: "block", width: "100%", height: "auto", fontFamily: REPORT_FONT_BODY }}
    >
      <rect x={MARGIN.left} y={MARGIN.top} width={PLOT_W} height={PLOT_H} fill="#FFFFFF" stroke={GRID_COLOR} />

      {bandVisible && (
        <rect
          x={xScale(band.startHz, xDomain)}
          y={MARGIN.top}
          width={Math.max(1, xScale(band.endHz, xDomain) - xScale(band.startHz, xDomain))}
          height={PLOT_H}
          fill="#213428"
          opacity="0.05"
        />
      )}

      {yTicks.map((db) => (
        <line
          key={`y-${db}`}
          x1={MARGIN.left}
          x2={MARGIN.left + PLOT_W}
          y1={yScale(db, yDomain)}
          y2={yScale(db, yDomain)}
          stroke={GRID_COLOR}
          strokeWidth="1"
        />
      ))}
      {xTicks.map((frequency) => (
        <line
          key={`x-${frequency}`}
          x1={xScale(frequency, xDomain)}
          x2={xScale(frequency, xDomain)}
          y1={MARGIN.top}
          y2={MARGIN.top + PLOT_H}
          stroke={GRID_COLOR}
          strokeWidth="1"
        />
      ))}

      {series.map((entry) => (
        <path
          key={entry.id}
          d={curvePath(entry.data || [], xDomain, yDomain)}
          fill="none"
          stroke={entry.color || "#213428"}
          strokeWidth={entry.strokeWidth || 2}
          strokeDasharray={entry.strokeDasharray || undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {markerLines.map((marker) => (
        <g key={marker.label}>
          <line
            x1={xScale(marker.frequency, xDomain)}
            x2={xScale(marker.frequency, xDomain)}
            y1={MARGIN.top}
            y2={MARGIN.top + PLOT_H}
            stroke={marker.color}
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          <text x={xScale(marker.frequency, xDomain) + 5} y={MARGIN.top + 16} fill={marker.color} fontSize="15" fontWeight="600">
            {marker.label}
          </text>
        </g>
      ))}

      <line x1={MARGIN.left} x2={MARGIN.left} y1={MARGIN.top} y2={MARGIN.top + PLOT_H} stroke={AXIS_COLOR} strokeWidth="1.5" />
      <line x1={MARGIN.left} x2={MARGIN.left + PLOT_W} y1={MARGIN.top + PLOT_H} y2={MARGIN.top + PLOT_H} stroke={AXIS_COLOR} strokeWidth="1.5" />

      {yTicks.map((db) => (
        <text key={`yl-${db}`} x={MARGIN.left - 14} y={yScale(db, yDomain) + 5} textAnchor="end" fill={MUTED} fontSize="16">
          {db}
        </text>
      ))}
      <text
        x={26}
        y={MARGIN.top + PLOT_H / 2}
        fill={TEXT}
        fontSize="17"
        fontWeight="600"
        textAnchor="middle"
        transform={`rotate(-90 26 ${MARGIN.top + PLOT_H / 2})`}
      >
        SPL (dB)
      </text>

      {xTicks.map((frequency) => (
        <text key={`xl-${frequency}`} x={xScale(frequency, xDomain)} y={MARGIN.top + PLOT_H + 28} textAnchor="middle" fill={MUTED} fontSize="16">
          {frequency}
        </text>
      ))}
      <text x={MARGIN.left + PLOT_W / 2} y={VIEW_H - 28} fill={TEXT} fontSize="17" fontWeight="600" textAnchor="middle">
        Frequency (Hz)
      </text>
    </svg>
  );
}