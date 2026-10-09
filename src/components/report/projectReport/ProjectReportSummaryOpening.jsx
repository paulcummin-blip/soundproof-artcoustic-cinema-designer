/**
 * ProjectReportSummaryOpening.jsx
 * -------------------------------
 * The Project Report's Design Summary opening paragraph, as written by the
 * report's own summary authority (projectReportSummaryOpening).
 *
 * One statement of THIS cinema — architecture, screen, seating, system and the
 * supported strengths — set as the page's Design Intent block: left aligned with
 * the rest of the page under its own label and rule, on screen and on paper. It
 * renders nothing when the report has no project-specific opening to state, so a
 * page can never show an empty line.
 *
 * Presentation only: the sentence is supplied, never composed here.
 */

import React from 'react';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

const LABEL = '#625143';
const RULE = '#DCDBD6';

export default function ProjectReportSummaryOpening({
  sentence = null,
  print = false,
  heading = 'Design Intent',
}) {
  if (!sentence) return null;

  return (
    <div style={{ textAlign: 'left', maxWidth: print ? '165mm' : 720 }}>
      {heading && (
        <>
          <div style={{
            fontFamily: FONT_HEADING,
            fontSize: print ? 7.5 : 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: LABEL,
          }}>
            {heading}
          </div>
          <div style={{
            height: 1,
            background: RULE,
            margin: print ? '2mm 0 3mm 0' : '5px 0 10px 0',
          }} />
        </>
      )}
      <p style={{
        margin: 0,
        fontSize: print ? 11 : 13,
        lineHeight: 1.6,
        color: '#3E4349',
        fontFamily: FONT_BODY,
      }}>
        {sentence}
      </p>
    </div>
  );
}