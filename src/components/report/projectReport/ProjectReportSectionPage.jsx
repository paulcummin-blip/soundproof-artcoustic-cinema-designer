/**
 * ProjectReportSectionPage.jsx
 * ----------------------------
 * One Project Report section's body: the section's own heading, followed by the
 * section's content.
 *
 * The heading is the composition authority's heading for the page — its RP22
 * category (from technicalParameterMeta) or its document section — so the first
 * page of a section states the heading and every page that continues it states
 * the same heading with "— Continued" appended by the report's own stylesheet
 * (`.client-report-page[data-section-continued="true"]`).
 *
 * The same component renders on screen and in the exported PDF, so the two can
 * never state a different heading. It computes nothing and grades nothing.
 */

import React from 'react';
import { REPORT_FONT_HEADING } from '@/components/report/typography/reportTypography';

export default function ProjectReportSectionPage({ heading = null, print = false, children }) {
  return (
    <div>
      {heading ? (
        <div className="client-report-print-heading">
          <h1
            className="client-report-print-heading__title"
            style={{
              margin: print ? 0 : '0 0 12px 0',
              fontFamily: REPORT_FONT_HEADING,
              fontSize: print ? undefined : 22,
              fontWeight: 300,
              letterSpacing: '0.01em',
              color: '#213428',
            }}
          >
            {heading}
          </h1>
        </div>
      ) : null}
      {children}
    </div>
  );
}