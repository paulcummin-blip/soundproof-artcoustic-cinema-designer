/**
 * SeatingBoundaryExplanation
 * --------------------------
 * The P1 page's explanation of the design decision behind the seating position:
 * what seating clearance does for the listener, read from the ACTUAL seating and
 * room geometry this project records.
 *
 * THE PRINCIPLE IS SHARED, NOT REWRITTEN. The distances, the room's own balance
 * and the wording all come from the one shared authority
 * (base44/shared/seatingBoundaryPrinciple.js, re-exported for the frontend), so
 * the page and the narrative that explains the same decision can never describe
 * it two different ways.
 *
 * IT MEASURES NOTHING AND GRADES NOTHING. The P1 distance and level stay with
 * their own authorities; this block reads coordinates and room dimensions and
 * says what the clearance means. It states no RP22 level, promises no measured
 * acoustic result, and never invents the designer's reason for the position.
 *
 * Presentation only: the paragraph is supplied by the shared authority.
 *
 * Props:
 *   seats    — the seating the report plots (x/y read from either seat shape)
 *   roomDims — { widthM, lengthM }
 *   print    — print (PDF) context
 */

import React, { useMemo } from "react";
import {
  readSeatBoundaryGeometry,
  buildSeatingBoundaryExplanation,
} from "@/shared/seatingBoundaryPrinciple";
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from "@/components/report/typography/reportTypography";

const LABEL = "#625143";
const BODY = "#3E4349";

export default function SeatingBoundaryExplanation({ seats, roomDims, print }) {
  const explanation = useMemo(() => {
    const geometry = readSeatBoundaryGeometry({ seats, roomDims });
    return buildSeatingBoundaryExplanation(geometry);
  }, [seats, roomDims]);

  if (!explanation.available || !explanation.paragraph) return null;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: print ? "165mm" : 640,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: print ? 4 : 6,
      }}
    >
      <div style={{
        fontFamily: FONT_HEADING,
        fontSize: print ? 8.5 : 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: LABEL,
      }}>
        Why the seating sits where it does
      </div>
      <p style={{
        margin: 0,
        fontSize: print ? 9.5 : 13,
        lineHeight: 1.6,
        color: BODY,
        fontFamily: FONT_BODY,
      }}>
        {explanation.paragraph}
      </p>
    </div>
  );
}