/**
 * ClientP9Overhead
 * ----------------
 * Screen page for the RP22 Parameter 9 (overhead speaker spacing) Visual Report
 * page.
 *
 * P9 is SEAT-scoped: each seat's result is its own largest vertical angle
 * between ADJACENT overhead speaker rows. The page is therefore two parts:
 *
 *   TOP    "How P9 is measured" — a true side elevation built from the saved
 *          design geometry: the real overhead rows at their installed acoustic
 *          centres, with the adjacent-row gaps drawn from a real front-row
 *          listening point and a real rear-row listening point. It explains why
 *          the row results differ. It is not a result and it is not an RSP fan.
 *   BOTTOM "P9 results by seat" — every seat with its own published limiting
 *          angle and canonical level, in its physical row.
 *
 * One result panel closes the page: the project limiting SEAT result.
 *
 * Every displayed value and level comes from the published per-seat authority
 * (selectClientP9Overhead → buildP9SeatScope). Nothing here grades, measures or
 * recalculates, and the reference seating position is never presented as the P9
 * authority.
 *
 * P9 thresholds (unchanged): L4 ≤ 50°, L3 ≤ 60°, L2 ≤ 80°, above = L1.
 */

import React, { useMemo } from "react";
import P9SideSectionDrawing from "./P9SideSectionDrawing";
import P9SeatResultsMap from "./P9SeatResultsMap";
import P9ProjectResultPanel from "./P9ProjectResultPanel";
import { buildP9SeatScope } from "./p9SeatScopeAuthority";
import { buildP9SeatScopeSection } from "./p9SideSectionGeometry";

const FONT_BODY = "Didact Gothic, Century Gothic, sans-serif";
const FONT_HEADING = "Futura PT Light, Century Gothic, sans-serif";

function SectionHeading({ children, caption }) {
  return (
    <div style={{ width: "100%", textAlign: "center" }}>
      <h2
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 600,
          color: "#213428",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontFamily: FONT_HEADING,
        }}
      >
        {children}
      </h2>
      {caption && (
        <p
          style={{
            margin: "6px auto 0",
            maxWidth: 620,
            fontSize: 11.5,
            color: "#3E4349",
            lineHeight: 1.5,
            fontFamily: FONT_BODY,
          }}
        >
          {caption}
        </p>
      )}
    </div>
  );
}

export default function ClientP9Overhead({ roomDims, seats, summary, p9Snapshot }) {
  const seatScope = useMemo(() => buildP9SeatScope({ seats }), [seats]);

  // The side section is built only from the published P9 snapshot's own geometry
  // and the published seat scope's own listening points.
  const sideSection = useMemo(
    () => buildP9SeatScopeSection({ p9Snapshot, seatScope, roomDims }),
    [p9Snapshot, seatScope, roomDims],
  );

  if (!seats || seats.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: 32,
        background: "#FFFFFF",
        borderRadius: 16,
        border: "1px solid #DCDBD6",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
        fontFamily: FONT_BODY,
      }}
    >
      {/* ── Heading hierarchy: Category → Parameter reference ── */}
      <div style={{ width: "100%", marginBottom: 8 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 34,
            fontWeight: 300,
            color: "#213428",
            letterSpacing: "0.01em",
            fontFamily: FONT_HEADING,
            textAlign: "center",
          }}
        >
          Spatial Resolution
        </h1>
        <p
          style={{
            margin: "6px 0 0 0",
            fontSize: 12,
            color: "#625143",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textAlign: "center",
            fontFamily: FONT_BODY,
          }}
        >
          RP22 Parameter 9 — Overhead speaker spacing
        </p>
      </div>

      {/* ── TOP: how P9 is measured — the real section, drawn from real seats ── */}
      <div
        style={{
          width: "100%",
          maxWidth: 820,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <SectionHeading caption="Each seat's result is the largest vertical angle between adjacent overhead speaker rows, seen from that seat. The section shows the installed overhead rows at their real positions, with both gaps drawn from a real front-row seat and a real rear-row seat.">
          How P9 is measured
        </SectionHeading>

        {sideSection ? (
          <P9SideSectionDrawing
            geometry={sideSection}
            style={{ width: "100%", maxWidth: 760, height: "auto" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              maxWidth: 760,
              padding: "24px 20px",
              textAlign: "center",
              fontSize: 12,
              color: "#3E4349",
              background: "#F8F8F7",
              borderRadius: 12,
              border: "1px solid #DCDBD6",
            }}
          >
            Side elevation unavailable — overhead row geometry is not present in this report.
          </div>
        )}
      </div>

      {/* ── BOTTOM: the seat-scoped result, seat by seat ── */}
      <div
        style={{
          width: "100%",
          maxWidth: 820,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <SectionHeading caption={summary || null}>P9 results by seat</SectionHeading>
        <P9SeatResultsMap rows={seatScope.rows} />
      </div>

      {/* ── The one project result: the limiting seat ── */}
      <P9ProjectResultPanel result={seatScope.projectResult} />
    </div>
  );
}