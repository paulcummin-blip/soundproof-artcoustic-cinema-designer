/**
 * ProjectReportOpeningBlock.jsx
 * -----------------------------
 * The Project Report's opening statement, as composed by the report's own
 * opening authority (projectReportOpening): the project-specific headline, and
 * the one supporting line of facts beneath it.
 *
 * Left aligned with the rest of the page — it is the page's opening statement,
 * not a floating centred paragraph. It renders nothing when there is no headline
 * to state, so a page can never show an empty opening.
 *
 * Presentation only: the headline and the line are supplied, never composed here.
 */

import React from 'react';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

const INK = '#213428';
const MUTED = '#625143';

export default function ProjectReportOpeningBlock({
  headline = null,
  supportingLine = null,
  print = false,
}) {
  if (!headline && !supportingLine) return null;

  return (
    <div style={{ textAlign: 'left', maxWidth: print ? '165mm' : 720 }}>
      {headline && (
        <h2
          style={{
            margin: print ? '0 0 2mm 0' : '0 0 6px 0',
            fontFamily: FONT_HEADING,
            fontSize: print ? 15 : 24,
            fontWeight: 300,
            lineHeight: 1.2,
            letterSpacing: '0.01em',
            color: INK,
          }}
        >
          {headline}
        </h2>
      )}

      {supportingLine && (
        <div style={{
          margin: print ? '0 0 6mm 0' : '0 0 18px 0',
          fontFamily: FONT_BODY,
          fontSize: print ? 9 : 12.5,
          lineHeight: 1.5,
          color: MUTED,
        }}>
          {supportingLine}
        </div>
      )}
    </div>
  );
}