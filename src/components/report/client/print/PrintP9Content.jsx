/**
 * PrintP9Content
 * -------------
 * Print-only P9 page content: heading, the "how P9 is measured" side section, the
 * per-seat P9 result map, and the project limiting seat result.
 *
 * It renders exactly the same evidence as the screen page (ClientP9Overhead) from
 * the same published P9 snapshot and the same published per-seat results, so the
 * printed page and the on-screen page can never disagree. The drawing region is
 * the primary scaling authority: it scales via CSS, not via a JS transform on the
 * whole card.
 *
 * Screen behaviour: this component is only rendered inside a print-only container
 * (client-report-print-only) and is never visible on screen.
 */

import React from "react";
import P9SideSectionDrawing from "@/components/report/client/P9SideSectionDrawing";
import P9SeatResultsMap from "@/components/report/client/P9SeatResultsMap";
import P9ProjectResultPanel from "@/components/report/client/P9ProjectResultPanel";
import { buildP9SeatScope } from "@/components/report/client/p9SeatScopeAuthority";
import { buildP9SeatScopeSection } from "@/components/report/client/p9SideSectionGeometry";

const FONT_BODY = "Didact Gothic, Century Gothic, sans-serif";

function PrintSectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: "7.5pt",
        fontWeight: 600,
        color: "#625143",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

export default function PrintP9Content({ p9Snapshot, roomDims, seats, summary }) {
  const seatScope = buildP9SeatScope({ seats });

  // Built only from published evidence: the P9 snapshot's own overhead geometry
  // and the published per-seat results' own listening points.
  const sideSection = buildP9SeatScopeSection({ p9Snapshot, seatScope, roomDims });

  if (!p9Snapshot) return null;

  return (
    <>
      {/* ── Heading ── */}
      <div className="client-report-print-heading">
        <h1 className="client-report-print-heading__title">Spatial Resolution</h1>
        <p className="client-report-print-heading__subtitle">RP22 Parameter 9 — Overhead speaker spacing</p>
      </div>

      {/* ── How P9 is measured ── */}
      <div style={{ flexShrink: 0, width: "100%", paddingBottom: "2mm" }}>
        <PrintSectionLabel>How P9 is measured</PrintSectionLabel>
        <div style={{ fontSize: "8pt", color: "#625143", lineHeight: 1.45, marginTop: "1mm" }}>
          Each seat's result is the largest vertical angle between adjacent overhead speaker rows, seen
          from that seat. The section shows the installed overhead rows at their real positions, with
          both gaps drawn from a real front-row seat and a real rear-row seat.
        </div>
      </div>

      <div className="client-report-print-drawing">
        {sideSection && (
          <P9SideSectionDrawing
            geometry={sideSection}
            className="client-report-print-svg"
          />
        )}
      </div>

      {/* ── P9 results by seat: the per-seat authority ── */}
      <div className="client-report-print-support">
        <PrintSectionLabel>P9 results by seat</PrintSectionLabel>
        {summary && (
          <div style={{ fontSize: "8pt", color: "#625143", lineHeight: 1.45, marginTop: "1mm", marginBottom: "2mm" }}>
            {summary}
          </div>
        )}
        <P9SeatResultsMap rows={seatScope.rows} print />
      </div>

      {/* ── Project limiting seat result ── */}
      <P9ProjectResultPanel result={seatScope.projectResult} print />
    </>
  );
}