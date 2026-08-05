/**
 * ClientReportPage
 * ----------------
 * Page wrapper for the Client Visual Report.
 *
 * On screen: transparent container — preserves the existing card appearance
 * with no visible page headers or footers.
 *
 * In print: one A4 portrait page with three explicit document regions —
 * header (first page), drawing (SVG), and result summary. The SVG is
 * the primary scaling authority, scaled via CSS to fill the drawing region.
 */

import React from "react";
import PrintP5Content from "@/components/report/client/print/PrintP5Content";
import PrintP9Content from "@/components/report/client/print/PrintP9Content";

export default function ClientReportPage({ children, isFirst, projectDetails, logoUrl, pageId, printData }) {
  const projectName = projectDetails?.name || "Untitled";
  const clientName = projectDetails?.client_name || "";
  const projectId = projectDetails?.id || "";
  const createdDate = projectDetails?.created_date;

  // Short project reference from ID (first 8 chars of UUID)
  const projectRef = projectId ? String(projectId).substring(0, 8).toUpperCase() : "";

  // Format created date only when valid
  let createdDateStr = "";
  if (createdDate) {
    const d = new Date(createdDate);
    if (!isNaN(d.getTime())) {
      createdDateStr = d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    }
  }

  return (
    <div className={`client-report-page print-avoid-break${isFirst ? " client-report-page--first" : ""}`} data-page-id={pageId}>
      {/* Print-only header (first page) */}
      {isFirst && (
        <div className="client-report-page__header client-report-print-only">
          <img src={logoUrl} alt="Sound Proof" />
          <div className="client-report-page__header-title">Client Visual Report</div>
          <div className="client-report-page__header-meta">
            <span>{projectName}</span>
            {clientName && <span>{clientName}</span>}
            {projectRef && <span>Ref: {projectRef}</span>}
            {createdDateStr && <span>{createdDateStr}</span>}
          </div>
        </div>
      )}

      {/* Screen visual — hidden in print */}
      <div className="client-report-page__screen-visual client-report-screen-only">
        {children}
      </div>

      {/* Print content — three document regions: heading, drawing, result */}
      <div className="client-report-page__print-content client-report-print-only">
        {printData?.type === "p5" && (
          <PrintP5Content
            p5Snapshot={printData.p5Snapshot}
            roomDims={printData.roomDims}
            screen={printData.screen}
            screenFrontPlaneM={printData.screenFrontPlaneM}
          />
        )}
        {printData?.type === "p9" && (
          <PrintP9Content
            p9Snapshot={printData.p9Snapshot}
            roomDims={printData.roomDims}
          />
        )}
      </div>

    </div>
  );
}