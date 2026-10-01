/**
 * P7PlacementGuidance
 * -------------------
 * The placement caption for the P7 Visual Report page: what the two markers on
 * the front wide wall mean.
 *
 * Short by design. The drawing carries the installed and ideal positions and the
 * published deviation, and the result card carries the level and the published
 * figure. Angle tables and measurement explanation belong to the Technical
 * Report, not to the Visual Report.
 *
 * Props:
 *   print — print (PDF) context
 */

import React from "react";
import {
  REPORT_FONT_HEADING as HEADING_FONT,
  REPORT_FONT_BODY as BODY_FONT,
} from "@/components/report/typography/reportTypography";

const COLORS = {
  heading: "#213428",
  body: "#3E4349",
};

export default function P7PlacementGuidance({ print }) {
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
          The solid markers show the installed front wide positions. The outlined markers show the
          ideal median positions.
        </div>
      </div>
    </div>
  );
}