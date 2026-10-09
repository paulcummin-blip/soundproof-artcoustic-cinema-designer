/**
 * TechnicalReportDocument.jsx
 * ---------------------------
 * The Technical Report's own pages, mounted inside the consolidated Project
 * Report.
 *
 * This module adds NOTHING to the Technical Report. It mounts the same document
 * the Technical Report's own route mounts (`TechnicalReportEmbedded`, the print
 * layout that carries the whole Technical PDF) in its embedded form, so every
 * Technical page appears in the Project Report exactly as the Technical Report
 * prints it: the level definitions, the project and system overview, the
 * performance summary, the ASDR scorecard, the room plan, dimensions and speaker
 * position plan, the complete P1–P21 parameter-card sequence, the elevations, the
 * sightlines, the screen-wall detail, the primary-seat bass curves and the
 * closing About page.
 *
 * The only thing this wrapper does is composition: the embedded report's
 * screen-only review chrome is hidden (the Project Report is a document, not the
 * Technical review workspace), and its print layout is made visible on screen so
 * the reader sees the Technical pages in the page itself, in the same form the
 * PDF carries.
 */

import React from 'react';
import { TechnicalReportEmbedded } from '@/pages/RP22Report';

export default function TechnicalReportDocument() {
  return (
    <div className="project-report-technical-document">
      <style>{`
        /* The Technical Report's own review chrome belongs to its route, not to
           the consolidated document. */
        .project-report-technical-document .technical-report-embedded > *:not(.print-only) {
          display: none !important;
        }
        /* On screen the embedded document shows its own print layout — the same
           page blocks the exported PDF carries, exactly as the Technical Report's
           print window shows them. */
        @media screen {
          .project-report-technical-document .technical-report-embedded .print-only.print-keep-layout {
            display: block !important;
          }
        }
      `}</style>
      <TechnicalReportEmbedded />
    </div>
  );
}