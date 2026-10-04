// BassResponseGraphSection.jsx
// ---------------------------------------------------------------------------
// The Technical Report's bass response graph pages:
//
//   Page A — RSP Room Response       (one trace: the RSP room response)
//   Page B — Primary Seats Bass Response
//
// Every curve comes from bassResponseGraphAuthority, which reads the saved
// completed bass contract through the same builders the Subwoofer Design graph
// uses. The section renders NOTHING unless a current, graph-bearing bass
// authority exists — stale or absent bass is never drawn as current, and the
// Technical Report's own not-ready state continues to state that.
//
// It is included in the Technical Report only: the client-facing Visual Report
// and System Design Summary never import it.
// ---------------------------------------------------------------------------

import React, { useMemo } from "react";
import {
  buildReportBassGraphs,
  RSP_ROOM_RESPONSE_EXPLANATION,
} from "./bassResponseGraphAuthority";
import BassResponsePlot from "./BassResponsePlot";
import {
  REPORT_FONT_BODY,
  REPORT_FONT_HEADING,
} from "@/components/report/typography/reportTypography";

const LEGEND_ROW = { display: "flex", flexWrap: "wrap", gap: "10px 22px", paddingTop: "3mm" };

function Legend({ series }) {
  if (!series.length) return null;
  return (
    <div style={LEGEND_ROW}>
      {series.map((entry) => (
        <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
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
          <span style={{ fontFamily: REPORT_FONT_BODY, fontSize: "9pt", color: "#3E4349" }}>{entry.label}</span>
        </div>
      ))}
    </div>
  );
}

function GraphPage({ id, blockName, title, explanation, graph, note, first = false }) {
  return (
    <section
      id={id}
      className="report-page-block rp22-bass-graph-page"
      data-report-block={blockName}
      data-report-page-start="true"
      style={{
        background: "#FFFFFF",
        color: "#1B1A1A",
        fontFamily: REPORT_FONT_BODY,
        boxSizing: "border-box",
        breakInside: "avoid",
        pageBreakInside: "avoid",
        marginBottom: "8mm",
        ...(first ? {} : { breakBefore: "page", pageBreakBefore: "always" }),
      }}
    >
      {/* Marked: one section-heading rule gives this title the same gap above
          and below the divider line, and keeps the header rendering in the
          printed PDF instead of being treated as app chrome. */}
      <header
        data-report-section-heading="true"
        style={{ borderBottom: "1px solid #DCDBD6", paddingBottom: "3mm", marginBottom: "4mm" }}
      >
        <div style={{ fontFamily: REPORT_FONT_HEADING, fontSize: "15pt", fontWeight: 700, color: "#1B1A1A", letterSpacing: "0.06em" }}>
          {title}
        </div>
      </header>

      <p style={{ fontFamily: REPORT_FONT_BODY, fontSize: "10pt", lineHeight: 1.6, color: "#3E4349", margin: "0 0 4mm" }}>
        {explanation}
      </p>

      <Legend series={graph.series} />

      <div style={{ marginTop: "4mm" }}>
        <BassResponsePlot
          chartId={blockName}
          series={graph.series}
          xDomain={graph.xDomain}
          yDomain={graph.yDomain}
          markers={graph.markers}
        />
      </div>

      {note && (
        <div style={{ fontFamily: REPORT_FONT_BODY, fontSize: "9pt", color: "#625143", marginTop: "3mm", lineHeight: 1.5 }}>
          {note}
        </div>
      )}
    </section>
  );
}

export default function BassResponseGraphSection({
  contract = null,
  authoritative = false,
  seats = [],
  roomDims = null,
  variant = "print",
}) {
  // The report passes a fresh dimensions object on every render, so the memo is
  // keyed on the dimension VALUES — the graphs rebuild only when the room changes.
  const dimsKey = roomDims
    ? `${roomDims.widthM}|${roomDims.lengthM}|${roomDims.heightM}`
    : "";
  const graphs = useMemo(
    () => buildReportBassGraphs({ contract, authoritative, seats, roomDims }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contract, authoritative, seats, dimsKey],
  );

  if (!graphs.ready) return null;

  const shared = {
    transitionHz: graphs.transitionHz,
    assessmentBand: graphs.assessmentBand,
  };

  // The RSP page carries a single trace. It is drawn only when that trace
  // exists; the Primary Seats page is unaffected either way.
  const hasRspCurve = Array.isArray(graphs.rsp?.series) && graphs.rsp.series.length > 0;

  const pages = (
    <>
      {hasRspCurve && (
        <GraphPage
          id="pdf-bass-response-rsp"
          blockName="bass-response-rsp"
          title="RSP ROOM RESPONSE"
          explanation={RSP_ROOM_RESPONSE_EXPLANATION}
          graph={{ ...graphs.rsp, markers: { ...shared, limitingFrequencyHz: graphs.limitingFrequencyHz } }}
          note={graphs.rsp.note}
          first={variant !== "print"}
        />
      )}
      <GraphPage
        id="pdf-bass-response-primary-seats"
        blockName="bass-response-primary-seats"
        title="PRIMARY SEATS BASS RESPONSE"
        explanation="This graph shows how the main listening seats are predicted to compare against the target and against each other. The aim is not only output, but consistency: the layout has been designed to reduce large differences between seats, so low-frequency impact remains powerful and controlled across the primary listening area."
        graph={{ ...graphs.primary, markers: shared }}
        note={graphs.primary.note}
        first={!hasRspCurve && variant !== "print"}
      />
    </>
  );

  if (variant !== "print") {
    return (
      <div style={{ background: "#FFFFFF", border: "1px solid #DCDBD6", borderRadius: 8, padding: "20px 24px" }}>
        <div style={{ fontFamily: REPORT_FONT_HEADING, fontSize: "16pt", color: "#213428", marginBottom: "4mm" }}>
          BASS RESPONSE GRAPHS
        </div>
        {pages}
      </div>
    );
  }

  return pages;
}