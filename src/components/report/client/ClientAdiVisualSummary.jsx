/**
 * ClientAdiVisualSummary
 * ----------------------
 * The Visual Report's ADI Design Summary block.
 *
 * Four short statements — the primary limitation, the current result, the
 * design interpretation and the next step — plus one optimiser status line
 * when an evaluated optimiser result exists. It is deliberately short and
 * deliberately free of engineering recommendations: the Visual Report
 * presents the selected design, and every design action lives in the design
 * workflow (Bass Optimiser) and the Technical Report.
 *
 * Presentation only. Every value comes from buildAdiVisualReportSummary(),
 * which reads the canonical ADI guidance; nothing is recalculated here.
 */

import React, { useMemo } from "react";
import { buildAdiDesignGuidance } from "@/components/adi/designGuidance/adiDesignGuidanceEngine";
import { buildAdiVisualReportSummary } from "@/components/adi/designGuidance/adiVisualReportCopy";
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

const ROWS = [
  ["primaryLimitation", "Primary limitation"],
  ["currentResult", "Current result"],
  ["worstAffected", "Worst affected"],
  ["interpretation", "Design interpretation"],
  ["nextStep", "Next step"],
];

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
    const guidance = buildAdiDesignGuidance(engineeringSummary, { seats, geometry, system });
    return buildAdiVisualReportSummary({ guidance, optimiserRecord });
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
          gap: 10,
        }}
      >
        {ROWS.map(([field, label]) => {
          const value = summary[field];
          if (!value) return null;
          return (
            <div key={field}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: COLORS.label,
                  marginBottom: 3,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: compact ? 11.5 : 12.5,
                  lineHeight: 1.55,
                  color: field === "primaryLimitation" ? COLORS.primary : COLORS.body,
                  fontWeight: field === "primaryLimitation" ? 600 : 400,
                }}
              >
                {value}
              </div>
            </div>
          );
        })}
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
    </section>
  );
}