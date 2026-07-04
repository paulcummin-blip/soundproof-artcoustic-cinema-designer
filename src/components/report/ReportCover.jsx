import React from 'react';

const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg';

// Single source of truth for the report cover branding — logo, positioning lines,
// divider, and title. Used by both the in-app screen header and the exported PDF
// cover page so the two stay visually identical.
export default function ReportCover({ variant = 'screen' }) {
    if (variant === 'print') {
        return (
            <div style={{ maxWidth: '185mm', margin: '0 auto 0 auto', textAlign: 'center' }}>
                <img
                    src={LOGO_URL}
                    alt="Sound Proof"
                    style={{ width: '100%', height: 'auto', marginBottom: '14mm' }}
                />
                <div
                    style={{
                        fontSize: '12pt',
                        fontWeight: 600,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: '#1B1A1A',
                        fontFamily: 'Futura PT Light, Century Gothic, sans-serif',
                        marginBottom: '3mm',
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
                        fontFamily: 'Futura PT Light, Century Gothic, sans-serif',
                        marginBottom: '10mm',
                    }}
                >
                    Powered by Artcoustic Design Intelligence (ADI)
                </div>
                <div style={{ width: '30mm', height: 1, backgroundColor: '#C1B6AD', margin: '0 auto 10mm' }} />
                <div style={{ fontSize: '30pt', fontWeight: 700, color: '#1B1A1A', lineHeight: 1.15, marginBottom: '12mm' }}>
                    RP22 Compliance Report
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center text-center mb-8 pb-6" style={{ borderBottom: '1px solid #DCDBD6' }}>
            <img src={LOGO_URL} alt="Sound Proof" style={{ width: 220, objectFit: 'contain', marginBottom: 14 }} />
            <div
                style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#1B1A1A',
                    fontFamily: 'Futura PT Light, Century Gothic, sans-serif',
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
                    fontFamily: 'Futura PT Light, Century Gothic, sans-serif',
                }}
            >
                Powered by Artcoustic Design Intelligence (ADI)
            </div>
            <div style={{ width: 64, height: 1, backgroundColor: '#C1B6AD', marginTop: 14, marginBottom: 14 }} />
            <h1 className="text-3xl font-bold text-[#1B1A1A] font-header">RP22 Compliance Report</h1>
        </div>
    );
}