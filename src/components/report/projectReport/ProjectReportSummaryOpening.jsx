/**
 * ProjectReportSummaryOpening.jsx
 * -------------------------------
 * The Project Report's Design Summary opening paragraph, as written by the
 * report's own summary authority (projectReportSummaryOpening).
 *
 * One statement of THIS cinema — architecture, screen, seating, system and the
 * supported strengths — centred where the report's published summary statement
 * sits, on screen and on paper. It renders nothing when the report has no
 * project-specific opening to state, so a page can never show an empty line.
 *
 * Presentation only: the sentence is supplied, never composed here.
 */

import React from 'react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

export default function ProjectReportSummaryOpening({ sentence = null, print = false }) {
  if (!sentence) return null;

  return (
    <p
      style={{
        margin: print ? 0 : '22px 0 0 0',
        maxWidth: 660,
        marginLeft: 'auto',
        marginRight: 'auto',
        textAlign: 'center',
        fontSize: print ? 11 : 13,
        lineHeight: 1.6,
        color: '#3E4349',
        fontFamily: REPORT_FONT_BODY,
      }}
    >
      {sentence}
    </p>
  );
}