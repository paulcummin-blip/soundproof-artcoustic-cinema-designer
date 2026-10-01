/**
 * ClientAdiVisualSummary
 * ----------------------
 * The Visual Report's ADI Design Summary block.
 *
 * The Visual Report presents a COMPLETED design and explains why it works for
 * this room, so this block is strength-led: the framing line, how the layout
 * suits the room and its seating, the design's genuine engineering strengths,
 * the balance-with-constraints statement, one Bass Optimiser review line when a
 * result exists, and the pointer to the Technical Report.
 *
 * It never reopens the design process: no limiting factor, no parameter level,
 * no worst-affected seat, no "next step", no speculative change and no
 * instruction to optimise. Poorer results belong to the Technical Report, the
 * RP22 parameter table and the Bass Optimiser panel.
 *
 * Presentation only. Every sentence comes from buildAdiVisualReportSummary(),
 * which reads the published strengths, the published room geometry and seating,
 * and the persisted optimiser record. Nothing is recalculated here.
 */

import React, { useMemo } from "react";
import { selectClientAdiStrengths } from "./selectClientAdiStrengths";
import {
  buildAdiVisualReportSummary,
  ADI_VISUAL_PARAGRAPH_LIMIT,
} from "@/components/adi/designGuidance/adiVisualReportCopy";
import { useOptimiserPlanAuthority } from "@/components/room/bass/optimiserPlan/optimiserPlanStore";
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from "@/components/report/typography/reportTypography";

const COLORS = {
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  divider: "#F0EFEA",
  label: "#9B8E82",
};

/** Strongest-first pool the paragraph draws its sentences from. */
const STRENGTH_POOL_LIMIT = 6;

function AdiMark() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        borderRadius: 6,
        background: COLORS.primary,
        color: "#FFFFFF",
        fontFamily: FONT_HEADING,
        fontSize: 14,
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}
    >
      ADI
    </span>
  );
}

export default function ClientAdiVisualSummary({
  engineeringSummary,
  seats,
  geometry,
  system,
  projectId = null,
  versionId = null,
  compact = false,
}) {
  const optimiserRecord = useOptimiserPlanAuthority(projectId, versionId);

  const summary = useMemo(() => {
    const strengths = selectClientAdiStrengths(engineeringSummary, { limit: STRENGTH_POOL_LIMIT });
    return buildAdiVisualReportSummary({
      strengths,
      context: {
        roomDims: geometry?.roomDims || null,
        seatCount: Array.isArray(seats) ? seats.length : 0,
        subwooferCount: Number(system?.subwooferCount) || 0,
      },
      optimiserRecord,
      paragraphLimit: ADI_VISUAL_PARAGRAPH_LIMIT,
    });
  }, [engineeringSummary, seats, geometry, system, optimiserRecord]);

  if (!summary) return null;

  return (
    <section
      className="adi-visual-summary print-avoid-break"
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `4px solid ${COLORS.primary}`,
        borderRadius: 8,
        padding: compact ? "14px 16px" : "18px 20px",
        fontFamily: FONT_BODY,
        color: COLORS.body,
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <AdiMark />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: FONT_HEADING,
              fontSize: compact ? 15 : 17,
              fontWeight: 400,
              color: COLORS.primary,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              lineHeight: 1.2,
            }}
          >
            {summary.heading}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: compact ? 11 : 12,
              color: COLORS.secondary,
              lineHeight: 1.45,
            }}
          >
            Artcoustic Design Intelligence
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${COLORS.divider}`,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: FONT_HEADING,
            fontSize: compact ? 13 : 14.5,
            lineHeight: 1.5,
            color: COLORS.primary,
          }}
        >
          {summary.lead}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: compact ? 11.5 : 12.5,
            lineHeight: 1.6,
            color: COLORS.body,
          }}
        >
          {summary.body.join(" ")}
        </p>
      </div>

      {summary.optimiserStatus && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: `1px solid ${COLORS.divider}`,
            fontSize: 11.5,
            lineHeight: 1.55,
            color: COLORS.secondary,
          }}
        >
          {summary.optimiserStatus}
        </div>
      )}

      {summary.closing && (
        <div
          style={{
            marginTop: 10,
            fontSize: 10.5,
            lineHeight: 1.55,
            color: COLORS.label,
          }}
        >
          {summary.closing}
        </div>
      )}
    </section>
  );
}