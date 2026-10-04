import React from 'react';
import { REPORT_PRINT_HEADER, reportHeaderMetadata } from '@/components/report/reportPrintHeader';
import { REPORT_FONT_HEADING, REPORT_FONT_BODY, REPORT_PROFILES, REPORT_TRACKING_HEADING, REPORT_LEADING_HEADING } from '@/components/report/typography/reportTypography';

export default function ReportPrintHeader({ title, project, className = '' }) {
  const header = REPORT_PRINT_HEADER;
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
        .sound-proof-print-header > .sound-proof-print-header__title {
          font-family: ${REPORT_FONT_HEADING} !important;
          font-size: ${REPORT_PROFILES.a4.header} !important;
          font-weight: 300 !important; line-height: ${REPORT_LEADING_HEADING} !important;
          letter-spacing: ${REPORT_TRACKING_HEADING} !important;
          text-transform: uppercase !important; color: var(--brand-green, #213428) !important;
          margin: 0 0 ${header.titleGapMm}mm !important;
        }
        .sound-proof-print-header > .sound-proof-print-header__meta {
          font-family: ${REPORT_FONT_BODY} !important; font-size: ${REPORT_PROFILES.a4.body} !important;
          line-height: 1.4 !important; color: #625143; margin: 0;
        }
      `}</style>
      <img src={header.logoUrl} alt="Sound Proof" />
      <div className="sound-proof-print-header__title">{title}</div>
      <div className="sound-proof-print-header__meta">{reportHeaderMetadata(project)}</div>
    </div>
  );
}