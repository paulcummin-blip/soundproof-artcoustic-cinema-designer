/**
 * P7PlacementGuidance
 * -------------------
 * The placement half of the P7 Visual Report page: where the front wides are
 * now, where the ideal median position is, how far they deviate from it, and
 * why that gives the level it does.
 *
 * Every value is published authority — the ideal and actual angles come from the
 * published per-side P7 result, the maximum deviation and the level from the
 * published P7 parameter. Nothing here grades, measures or recomputes.
 *
 * Props:
 *   level        — published RP22 P7 level ("L2" / 2 / …)
 *   maxDeviation — published maximum deviation from the median, in degrees
 *   ideal        — { LW: { targetAngle, actualAngle, deviation }, RW: { … } }
 *                  published per-side angles, in the engine's azimuth frame
 *   print        — print (PDF) context
 */

import React from "react";
import { parameterResultHeading } from "./parameterResultCopy";
import { toCentreLineDegrees, formatAngle } from "./p7IdealAngles";
import {
  REPORT_FONT_HEADING as HEADING_FONT,
  REPORT_FONT_BODY as BODY_FONT,
} from "@/components/report/typography/reportTypography";

const COLORS = {
  heading: "#213428",
  body: "#3E4349",
  row: "#625143",
  note: "#8A7B6A",
};

const SIDES = [
  { key: "LW", label: "left" },
  { key: "RW", label: "right" },
];

/** "left 45.0°, right 44.3°" — only the sides that published a value. */
function sideValues(ideal, read) {
  return SIDES
    .map((side) => {
      const value = read(ideal?.[side.key]);
      return value == null ? null : `${side.label} ${value}`;
    })
    .filter(Boolean)
    .join(", ");
}

export default function P7PlacementGuidance({ level, maxDeviation, ideal, print }) {
  const heading = parameterResultHeading(level);

  const idealAngles = sideValues(ideal, (side) => formatAngle(toCentreLineDegrees(side?.targetAngle)));
  const actualAngles = sideValues(ideal, (side) => formatAngle(toCentreLineDegrees(side?.actualAngle)));
  const deviations = sideValues(ideal, (side) => formatAngle(side?.deviation));
  const hasAngles = Boolean(idealAngles || actualAngles || deviations);

  // The published maximum deviation is what sets the level, so the sentence
  // reads it straight from the same authority the result card uses.
  const publishedMax = Number(maxDeviation);
  const outcome = Number.isFinite(publishedMax)
    ? `In this design, the front wide speakers sit ${publishedMax.toFixed(1)}° from the ideal `
      + "median position"
      + (heading && heading.startsWith("Level ") ? `, giving a ${heading} result.` : ".")
    : null;

  const rowStyle = {
    fontSize: print ? 9 : 12.5,
    color: COLORS.row,
    lineHeight: 1.5,
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: print ? "12px 16px" : "16px 20px",
      background: "#F1F0EE",
      borderRadius: 12,
      border: "1px solid #DCDBD6",
      width: "100%",
      maxWidth: print ? "100%" : 600,
      fontFamily: BODY_FONT,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: print ? 12 : 16,
          fontWeight: 600,
          color: COLORS.heading,
          marginBottom: 4,
          fontFamily: HEADING_FONT,
        }}>
          Front Wide Placement
        </div>
        <div style={{ fontSize: print ? 9 : 13, color: COLORS.body, lineHeight: 1.5 }}>
          The ideal front wide position is the median angle between the screen speaker and the
          adjacent surround speaker.
        </div>

        {hasAngles && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: print ? 1 : 2,
            marginTop: print ? 5 : 8,
          }}>
            {idealAngles && <div style={rowStyle}>Ideal front wide angle — {idealAngles}</div>}
            {actualAngles && <div style={rowStyle}>Actual front wide angle — {actualAngles}</div>}
            {deviations && <div style={rowStyle}>Deviation from median — {deviations}</div>}
            <div style={{ fontSize: print ? 8 : 11, color: COLORS.note, marginTop: print ? 1 : 2 }}>
              Angles are measured at the reference seating position, from the centre line.
            </div>
          </div>
        )}

        {outcome && (
          <div style={{
            fontSize: print ? 9 : 13,
            color: COLORS.body,
            lineHeight: 1.5,
            marginTop: print ? 5 : 8,
          }}>
            {outcome}
          </div>
        )}
      </div>
    </div>
  );
}