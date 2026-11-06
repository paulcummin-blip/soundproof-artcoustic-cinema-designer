/**
 * ReportLoadingOverlay
 * ---------------------
 * The single, continuous loading overlay for the Project Report.
 *
 * One overlay replaces both the detailed preparation checklist and the separate
 * late ADI banner. The report itself stays hidden until the complete report AND
 * the accepted ADI narrative are both ready, so no unfinished section is ever
 * revealed and no second loading banner is shown.
 *
 *   stage="building" — project state, engineering evidence, report sections and
 *                       document data are being assembled.
 *   stage="writing"   — ADI is generating the project summary.
 *
 * The stage is driven by the report's actual lifecycle states (report readiness
 * and the ADI auto-intent status). There are no artificial timers and no
 * simulated progress.
 *
 * Screen only (never part of the printed PDF).
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

const PRIMARY = '#213428';
const SECONDARY = '#625143';

export default function ReportLoadingOverlay({ stage = 'building' }) {
  // stage="loading" is a neutral loader with no heading: used only while a saved,
  // complete report is being read back, so an existing report opens without
  // displaying either generation stage.
  const heading = stage === 'writing'
    ? 'Writing Report'
    : stage === 'building'
      ? 'Building Report'
      : null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="client-report-screen-only"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 20,
        fontFamily: FONT_BODY,
        color: SECONDARY,
      }}
    >
      <Loader2 className="animate-spin" style={{ color: PRIMARY, width: 28, height: 28 }} />
      {heading && (
        <h2
          style={{
            margin: 0,
            fontFamily: FONT_HEADING,
            fontSize: 22,
            fontWeight: 400,
            color: PRIMARY,
            letterSpacing: '0.01em',
          }}
        >
          {heading}
        </h2>
      )}
    </div>
  );
}