import React from 'react';

// Premium report cover branding block — logo, divider, and brand positioning lines.
// Visual only: does not touch report data, calculations, or layout logic elsewhere.
export default function ReportBrandCover() {
    return (
        <div className="flex flex-col items-center text-center mb-8 pb-6" style={{ borderBottom: '1px solid #DCDBD6' }}>
            <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg"
                alt="Sound Proof"
                style={{ width: 220, objectFit: 'contain', marginBottom: 14 }}
            />
            <div style={{ width: 64, height: 1, backgroundColor: '#C1B6AD', marginBottom: 14 }} />
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
        </div>
    );
}