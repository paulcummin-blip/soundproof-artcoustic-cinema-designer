import React from 'react';
import { REPORT_PRINT_HEADER, REPORT_STRAPLINE, reportHeaderMetadata } from '@/components/report/reportPrintHeader';
import {
  REPORT_FONT_HEADING,
  REPORT_FONT_BODY,
  REPORT_PROFILES,
  REPORT_TRACKING_HEADING,
  REPORT_LEADING_HEADING,
} from '@/components/report/typography/reportTypography';

/**
 * The shared first-page report masthead — identical for the Technical Report
 * and the Visual Report, on screen and in the exported PDF:
 *
 *   1. Sound Proof logo      62mm, centred
 *   2. Brand strapline       two uppercase positioning lines
 *   3. Small rule            short divider between the strapline and the title
 *   4. Report title          the document's main headline (header role)
 *   5. Project metadata      one smaller, calm line beneath the title
 *   6. Divider line          the header's own rule, closing the masthead
 *
 * The title is the only headline here: everything after it is section content.
 */
export default function ReportPrintHeader({ title, project, meta, className = '' }) {
  const header = REPORT_PRINT_HEADER;
  // The project's own metadata line, unless the report supplies its own.
  const metaLine = meta || reportHeaderMetadata(project);

  return (
    <div className={`sound-proof-print-header ${className}`}>
      <style>{`
        .sound-proof-print-header {
          text-align: center; break-inside: avoid;
          padding-bottom: ${header.dividerGapMm}mm;
          border-bottom: 1px solid #DCDBD6; margin-bottom: ${header.bottomGapMm}mm;
        }
        .sound-proof-print-header > img {
          width: ${header.logoWidthMm}mm !important;
          height: ${header.logoWidthMm / header.logoAspectRatio}mm !important;
          max-width: none !important; object-fit: contain; display: block;
          margin: 0 auto ${header.logoGapMm}mm !important;
        }
        .sound-proof-print-header > .sound-proof-print-header__strapline {
          font-family: ${REPORT_FONT_HEADING} !important;
          font-size: ${REPORT_PROFILES.a4.body} !important; font-weight: 600 !important;
          letter-spacing: 0.12em !important; line-height: 1.3 !important;
          text-transform: uppercase !important; color: #1B1A1A !important; margin: 0 !important;
        }
        .sound-proof-print-header > .sound-proof-print-header__strapline--sub {
          font-size: ${REPORT_PROFILES.a4.meta} !important; font-weight: 500 !important;
          letter-spacing: 0.08em !important; color: #625143 !important;
          margin: 0.8mm 0 0 0 !important;
        }
        .sound-proof-print-header > .sound-proof-print-header__rule {
          width: 17mm; height: 1px; background: #C1B6AD; margin: 3mm auto;
        }
        .sound-proof-print-header > .sound-proof-print-header__title {
          font-family: ${REPORT_FONT_HEADING} !important;
          font-size: ${REPORT_PROFILES.a4.header} !important;
          font-weight: 300 !important; line-height: ${REPORT_LEADING_HEADING} !important;
          letter-spacing: ${REPORT_TRACKING_HEADING} !important;
          text-transform: uppercase !important; color: var(--brand-green, #213428) !important;
          margin: 0 0 ${header.titleGapMm}mm !important;
        }
        .sound-proof-print-header > .sound-proof-print-header__meta {
          font-family: ${REPORT_FONT_BODY} !important; font-size: ${REPORT_PROFILES.a4.meta} !important;
          letter-spacing: 0.05em !important; line-height: 1.4 !important;
          color: #625143; margin: 0; text-align: center;
        }
      `}</style>
      <img src={header.logoUrl} alt="Sound Proof" />
      <div className="sound-proof-print-header__strapline">{REPORT_STRAPLINE.title}</div>
      <div className="sound-proof-print-header__strapline sound-proof-print-header__strapline--sub">{REPORT_STRAPLINE.sub}</div>
      <div className="sound-proof-print-header__rule" />
      <div className="sound-proof-print-header__title">{title}</div>
      {metaLine ? <div className="sound-proof-print-header__meta">{metaLine}</div> : null}
    </div>
  );
}