/**
 * TechnicalHowToReadSection
 * ------------------------
 * The report's reference page, printed in the back matter immediately before
 * the closing About Sound Proof page.
 *
 * It carries the material the Technical Report used to open with — the CEDIA
 * RP22 performance levels word for word, the note that levels apply to both
 * seating positions and the room, and the RP23 image statement — together with
 * the plain explanation of how a result is read: which parameters are assessed
 * for the room and which at each seat, why the Primary and Secondary seating
 * positions may carry different results, and that the parameters are engineering
 * evidence rather than the objective of the design.
 *
 * Composition only: the page's copy lives in HowToReadThisReportPage, and the
 * page is a MANDATORY part of the report — it always renders, so the export can
 * never carry a blank reference page.
 */

import React from 'react';
import HowToReadThisReportPage from '@/components/report/HowToReadThisReportPage';

export default function TechnicalHowToReadSection() {
  return (
    <section
      id="pdf-how-to-read"
      className="report-page-block report-page-block--summary"
      data-report-block="how-to-read"
      data-report-page-start="true"
      style={{ background: '#FFFFFF', padding: '8mm 10mm', boxSizing: 'border-box' }}
    >
      <HowToReadThisReportPage />
    </section>
  );
}