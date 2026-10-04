import React from 'react';
import { REPORT_FONT_HEADING, reportRoleStyle } from '@/components/report/typography/reportTypography';
import ReportPrintHeader from '@/components/report/ReportPrintHeader';
import { REPORT_PRINT_HEADER } from '@/components/report/reportPrintHeader';

export const LOGO_URL = REPORT_PRINT_HEADER.logoUrl;

// Single source of truth for the report cover branding — logo, positioning lines,
// divider, and title. Used by both the in-app screen header and the exported PDF
// cover page so the two stay visually identical.
export default function ReportCover({ variant = 'screen', project }) {
    if (variant === 'print') {
        return <ReportPrintHeader title="RP22 Compliance Report" project={project} />;
    }

    return (
        <div className="flex flex-col items-center text-center mb-8 pb-6" style={{ borderBottom: '1px solid #DCDBD6' }}>
            <img src={LOGO_URL} alt="Sound Proof" style={{ width: 148, objectFit: 'contain', marginBottom: 12 }} />
            <div
                style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#1B1A1A',
                    fontFamily: REPORT_FONT_HEADING,
                }}
            >
                Professional Home Cinema Engineering
            </div>
            <div
                style={{
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#625143',
                    marginTop: 4,
                    fontFamily: REPORT_FONT_HEADING,
                }}
            >
                Powered by Artcoustic Design Intelligence (ADI)
            </div>
            <div style={{ width: 64, height: 1, backgroundColor: '#C1B6AD', marginTop: 14, marginBottom: 14 }} />
            {/* Same header role as the printed cover, so the on-screen header
                and the exported cover page stay visually identical. */}
            <h1
                className="font-report-heading"
                style={{ ...reportRoleStyle('header'), color: '#1B1A1A', margin: 0 }}
            >
                RP22 Compliance Report
            </h1>
        </div>
    );
}