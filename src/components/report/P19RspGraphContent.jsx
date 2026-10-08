/**
 * P19RspGraphContent
 * ------------------
 * The P19 bass response evidence: the corrected (post-EQ) response at the
 * Reference Seating Position plotted against the target curve, across the P19
 * assessment band.
 *
 * Shared by the Visual Report's P19 page and the Technical Report's P19 page, so
 * the two reports can never present a different P19 picture. Every curve, domain
 * and marker arrives from buildP19RspGraph (bassResponseGraphAuthority), which
 * reads the saved completed bass contract through the same builders the
 * Subwoofer Design graph uses. Nothing here recalculates the bass simulation.
 *
 * When the saved post-EQ RSP curve and target are not available, the component
 * states that plainly. It never substitutes another curve (the room/layout
 * response is a different quantity) and never renders an empty graph box.
 */

import React from "react";
import BassResponsePlot from "@/components/report/technical/BassResponsePlot";
import TechnicalLevelBadge from "@/components/report/technical/TechnicalLevelBadge";
import {
  REPORT_FONT_BODY,
  REPORT_FONT_HEADING,
} from "@/components/report/typography/reportTypography";

/** Stated in place of the graph whenever the post-EQ RSP evidence is missing. */
export const P19_GRAPH_EVIDENCE_WARNING =
  "The saved corrected (post-EQ) response at the reference seating position and its target curve are not available for this version, so the P19 response graph cannot be drawn. The P19 result below is the published assessment at the reference seating position.";

const MUTED = "#625143";

function Legend({ series }) {
  if (!series.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 22px" }}>
      {series.map((entry) => (
        <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="30" height="10" aria-hidden="true">
            <line
              x1="0"
              y1="5"
              x2="30"
              y2="5"
              stroke={entry.color || "#213428"}
              strokeWidth={entry.strokeWidth || 2}
              strokeDasharray={entry.strokeDasharray || undefined}
            />
          </svg>
          <span style={{ fontFamily: REPORT_FONT_BODY, fontSize: "9pt", color: "#3E4349" }}>
            {entry.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The published P19 result and its performance pill, stated with the graph.
 *
 * @param {object} result - { level, valueText, worstFrequencyHz }
 */
function P19ResultRow({ result }) {
  if (!result?.level) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <TechnicalLevelBadge level={result.level} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: REPORT_FONT_HEADING,
            fontSize: "11pt",
            fontWeight: 600,
            color: "#213428",
            letterSpacing: "0.02em",
          }}
        >
          P19 — Bass response at the reference seating position
        </div>
        <div style={{ fontFamily: REPORT_FONT_BODY, fontSize: "9pt", color: "#3E4349", lineHeight: 1.5 }}>
          {result.valueText
            ? `${result.valueText} deviation from the target response.`
            : "Assessed against the target response."}
        </div>
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.graph - buildP19RspGraph output
 * @param {object|null} [props.result] - the published P19 result, when this
 *   surface does not already state it beside the graph
 * @param {string} [props.warningText]
 * @param {string} [props.chartId]
 */
export default function P19RspGraphContent({
  graph,
  result = null,
  warningText = P19_GRAPH_EVIDENCE_WARNING,
  chartId = "p19-rsp-graph",
}) {
  const series = Array.isArray(graph?.series) ? graph.series : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
      <P19ResultRow result={result} />

      {series.length > 0 ? (
        <>
          <Legend series={series} />
          <BassResponsePlot
            chartId={chartId}
            series={series}
            xDomain={graph.xDomain}
            yDomain={graph.yDomain}
            markers={graph.markers}
          />
        </>
      ) : (
        <div
          style={{
            fontFamily: REPORT_FONT_BODY,
            fontSize: "9pt",
            color: MUTED,
            background: "#F5F4F1",
            border: "1px solid #D9D5CE",
            borderRadius: 6,
            padding: "4mm 5mm",
            lineHeight: 1.5,
          }}
        >
          {warningText}
        </div>
      )}
    </div>
  );
}