// TechnicalReportNotice.jsx
// -------------------------
// The notice shown above the Technical Report — an unassessed design, or a saved
// report that could not be read. Presentation only: the caller decides what the
// notice says, so a report never invents a reason for itself.

import React from "react";
import { REPORT_FONT_BODY } from "@/components/report/typography/reportTypography";

const NOTICE = {
    background: "#F7F1E6",
    border: "1px solid #E2D7BE",
    borderRadius: 8,
    padding: "12px 16px",
    color: "#7A6640",
    fontSize: 13,
    lineHeight: 1.55,
    fontFamily: REPORT_FONT_BODY,
};

export default function TechnicalReportNotice({ title, children }) {
    return (
        <div className="max-w-7xl mx-auto mb-4" style={NOTICE}>
            <strong style={{ color: "#213428" }}>{title}</strong>{" "}
            {children}
        </div>
    );
}