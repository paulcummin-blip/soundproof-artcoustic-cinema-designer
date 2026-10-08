// BassResponseGraphSection.jsx
// ---------------------------------------------------------------------------
// The Technical Report's bass response graph pages:
//
//   Page A — P19 Bass Response at the RSP
//            (the corrected post-EQ RSP response against the target)
//   Page B — Primary Seats Bass Response
//
// Every curve comes from bassResponseGraphAuthority, which reads the saved
// completed bass contract through the same builders the Subwoofer Design graph
// uses. The section renders NOTHING unless a current, graph-bearing bass
// authority exists — stale or absent bass is never drawn as current, and the
// Technical Report's own not-ready state continues to state that. When the
// authority is current but the post-EQ RSP curve is missing, the P19 page states
// that plainly instead of substituting another curve.
//
// It is included in the Technical Report only: the client-facing Visual Report
// and System Design Summary never import it.
// ---------------------------------------------------------------------------

import React, { useMemo } from "react";
import {
  buildReportBassGraphs,
  P19_RSP_EXPLANATION,
} from "./bassResponseGraphAuthority";
import BassResponsePlot from "./BassResponsePlot";
import P19RspGraphContent from "@/components/report/P19RspGraphContent";
import {
  REPORT_FONT_BODY,
  reportSectionHeadingStyle,
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

function GraphPage({ id, blockName, title, explanation, graph = null, note = null, content = null, first = false }) {
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
        <div style={reportSectionHeadingStyle("15pt", { color: "#1B1A1A" })}>
          {title}
        </div>
      </header>

      <p style={{ fontFamily: REPORT_FONT_BODY, fontSize: "10pt", lineHeight: 1.6, color: "#3E4349", margin: "0 0 4mm" }}>
        {explanation}
      </p>

      {content || (
        <>
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
        </>
      )}
    </section>
  );
}

export default function BassResponseGraphSection({
  contract = null,
  authoritative = false,
  seats = [],
  roomDims = null,
  p19Result = null,
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

  // The P19 page is the corrected (post-EQ) RSP response against the target. It
  // is drawn whenever the report has a current graph authority: when the saved
  // post-EQ RSP curve is unavailable the page states that plainly, rather than
  // showing another curve or nothing at all. The Primary Seats page is
  // unaffected either way.
  const pages = (
    <>
      <GraphPage
        id="pdf-bass-response-p19-rsp"
        blockName="bass-response-p19-rsp"
        title="P19 BASS RESPONSE AT THE RSP"
        explanation={P19_RSP_EXPLANATION}
        content={<P19RspGraphContent graph={graphs.p19} result={p19Result} chartId="bass-response-p19-rsp" />}
        first={variant !== "print"}
      />
      <GraphPage
        id="pdf-bass-response-primary-seats"
        blockName="bass-response-primary-seats"
        title="PRIMARY SEATS BASS RESPONSE"
        explanation="This graph shows how the main listening seats are predicted to compare against the target and against each other. Each trace is one seat's predicted response. Seat-to-seat consistency is a separate parameter — the published P20 result states the measured difference from the reference response at every seat."
        graph={{ ...graphs.primary, markers: shared }}
        note={graphs.primary.note}
        first={false}
      />
    </>
  );

  if (variant !== "print") {
    return (
      <div style={{ background: "#FFFFFF", border: "1px solid #DCDBD6", borderRadius: 8, padding: "20px 24px" }}>
        <div style={reportSectionHeadingStyle("16pt", { color: "#213428", marginBottom: "4mm" })}>
          BASS RESPONSE GRAPHS
        </div>
        {pages}
      </div>
    );
  }

  return pages;
}