import React from 'react';
import { REPORT_FONT_HEADING, reportRoleStyle } from '@/components/report/typography/reportTypography';

export const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg';

// Single source of truth for the report cover branding — logo, positioning lines,
// divider, and title. Used by both the in-app screen header and the exported PDF
// cover page so the two stay visually identical.
export default function ReportCover({ variant = 'screen' }) {
    if (variant === 'print') {
        return (
            <div style={{ maxWidth: '185mm', margin: '0 auto 0 auto', textAlign: 'center' }}>
                {/* Document mark — masthead scale, not poster scale. */}
                <img
                    src={LOGO_URL}
                    alt="Sound Proof"
                    style={{ width: '62mm', height: 'auto', display: 'block', margin: '0 auto 6mm' }}
                />
                <div
                    style={{
                        fontSize: '12pt',
                        fontWeight: 600,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: '#1B1A1A',
                        fontFamily: REPORT_FONT_HEADING,
                        marginBottom: '2mm',
                    }}
                >
                    Professional Home Cinema Engineering
                </div>
                <div
                    style={{
                        fontSize: '10pt',
                        fontWeight: 500,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: '#625143',
                        fontFamily: REPORT_FONT_HEADING,
                        marginBottom: '6mm',
                    }}
                >
                    Powered by Artcoustic Design Intelligence (ADI)
                </div>
                <div style={{ width: '30mm', height: 1, backgroundColor: '#C1B6AD', margin: '0 auto 6mm' }} />
                {/* Document title — the shared typography header role
                    (22pt, uppercase, tracking +100, Futura PT Light with a
                    Century Gothic fallback). The title role (60pt) is
                    presentation scale and is deliberately not used here: this
                    is a technical document, not a poster. */}
                <div
                    className="report-header"
                    style={{ ...reportRoleStyle('header'), color: '#1B1A1A', marginBottom: '7mm' }}
                >
                    RP22 Compliance Report
                </div>
            </div>
        );
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