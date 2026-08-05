/**
 * ClientReportPage
 * ----------------
 * Page wrapper for the Client Visual Report.
 *
 * On screen: transparent container — preserves the existing card appearance
 * with no visible page headers or footers.
 *
 * In print: one A4 portrait page with optional header (first page) and
 * footer (last page). The visual is scaled as a single unit and centred.
 */

import React from "react";

export default function ClientReportPage({ children, isFirst, isLast, projectDetails, logoUrl, pageId }) {
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
    <div className="client-report-page print-avoid-break" data-page-id={pageId}>
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

      {/* Visual area — screen + print */}
      <div className="client-report-page__visual">
        <div className="client-report-page__visual-stage">
          <div className="client-report-page__visual-inner">{children}</div>
        </div>
      </div>

    </div>
  );
}