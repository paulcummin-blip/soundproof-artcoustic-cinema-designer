import React, { useEffect, useMemo, useState } from 'react';
import RP22GradingPill from '@/components/ui/RP22GradingPill';
import ParameterCard from '@/components/report/ParameterCard';
import SeatScopedParameterCard from '@/components/report/SeatScopedParameterCard';
import SeatComplianceSummary from '@/components/report/SeatComplianceSummary';
import { formatSeatLabel } from '@/components/utils/seatLabel';
import { RP22_PRESENTATION_PARAMETERS, RP22_SEAT_PARAMETERS } from '@/components/utils/rp22ParameterPresentation';
import { readDesignReviewHandoff } from '@/components/state/designReviewHandoff';

export default function ComplianceReportPrint() {
  const [isReady, setIsReady] = useState(false);
  const reportScopeId = new URLSearchParams(window.location.search).get('projectId') || new URLSearchParams(window.location.search).get('id') || 'free';
  const publishedEngineering = useMemo(() => readDesignReviewHandoff(reportScopeId), [reportScopeId]);
  const engineeringSummary = publishedEngineering?.engineeringSummary
    ?? publishedEngineering?.rating?.engineeringSummary
    ?? null;

  // Passive report inputs: every engineering value, grade and aggregate is a
  // direct read from the Room Designer publication.
  const seats = publishedEngineering?.seatingPositions || [];
  const dolbyLayout = publishedEngineering?.dolbyLayout || '5.1';
  const roomResultsByParameter = engineeringSummary?.roomResultsByParameter || {};
  const reportCounts = engineeringSummary?.project?.reportCounts || {};
  const roomCounts = reportCounts.roomLevelCounts || {};
  const seatCalculatedParamCount = engineeringSummary?.project?.compliance?.calculatedSeatParams || 0;

  const roomParams = React.useMemo(
    () => RP22_PRESENTATION_PARAMETERS.filter((parameter) => parameter.scope === 'Room'),
    []
  );

  const seatScopedParamData = React.useMemo(() => (
    RP22_SEAT_PARAMETERS.map((param) => {
      const publishedRows = reportCounts.seatResultsByParameter?.[`p${param.number}`] || [];
      const perSeatResults = publishedRows.map((row) => ({
        ...row,
        seatLabel: formatSeatLabel(row.seatId),
        suffix: row.isPrimary ? '(Primary)' : '',
        isRsp: false,
      }));
      return { param, perSeatResults };
    })
  ), [reportCounts]);

  // Print only after one complete published engineering summary is available.
  useEffect(() => {
    if (!engineeringSummary) return undefined;
    setIsReady(true);
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
  }, [engineeringSummary]);

  if (!engineeringSummary || !isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
        <p className="text-lg">Preparing authoritative report…</p>
      </div>
    );
  }

  const currentDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <>
      <style>{`
        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print-page-break-after {
            break-after: page;
            page-break-after: always;
          }

          .print-page-break-before {
            break-before: page;
            page-break-before: always;
          }

          .print-avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .print-no-break {
            display: block;
          }

          @page {
            @bottom-center {
              content: "SoundProof • RP22 Compliance Report";
              font-size: 9pt;
              color: #3E4349;
            }
          }
        }

        .print-container {
          max-width: 190mm;
          margin: 0 auto;
          font-family: 'Didact Gothic', 'Century Gothic', sans-serif;
        }

        @media print {
          .print-container {
            max-width: 100%;
          }
        }
      `}</style>

      <div className="print-container">
        {/* PAGE 1: SUMMARY */}
        <div className="print-page-break-after">
          {/* Logo and Title */}
          <div className="mb-8">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg"
              alt="SoundProof"
              className="h-12 mb-4"
            />
            <h1 
              className="text-3xl font-bold text-[#1B1A1A] mb-2"
              style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}
            >
              RP22 Compliance Report
            </h1>
            <p className="text-sm text-[#3E4349]">{currentDate}</p>
            <p className="text-xs text-[#625143] mt-1">{dolbyLayout} Configuration</p>
          </div>

          {/* Summary Counts — ROOM and SEAT separated */}
          <div className="space-y-6">
            <div>
              <h2 
                className="text-lg font-semibold text-[#1B1A1A] mb-3"
                style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}
              >
                Room Results
              </h2>
              <div className="flex gap-3 flex-wrap">
                <RP22GradingPill level="L4" count={roomCounts.L4} />
                <RP22GradingPill level="L3" count={roomCounts.L3} />
                <RP22GradingPill level="L2" count={roomCounts.L2} />
                <RP22GradingPill level="L1" count={roomCounts.L1} />
                <RP22GradingPill level="FAIL" count={roomCounts.fail || 0} />
              </div>
            </div>

            <div>
              <h2 
                className="text-lg font-semibold text-[#1B1A1A] mb-3"
                style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}
              >
                Seat Results
              </h2>
              <div className="text-sm text-[#3E4349] space-y-1" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
                <div>Calculated parameters: {seatCalculatedParamCount}</div>
                <div>Seats evaluated: {seats.length}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ROOM PARAMETERS */}
        {roomParams.length > 0 && (
          <div className="print-page-break-before">
            <h2 
              className="text-2xl font-semibold text-[#1B1A1A] mb-6"
              style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}
            >
              RP22 Parameters (Room)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roomParams.map(param => {
                const roomResult = roomResultsByParameter[param.id] || null;
                return (
                  <div key={param.id} className="print-avoid-break">
                    <ParameterCard parameter={param} roomResult={roomResult} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SEAT PARAMETERS */}
        {seats.length > 0 && (
          <div className="print-page-break-before">
            <h2 
              className="text-2xl font-semibold text-[#1B1A1A] mb-6"
              style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}
            >
              RP22 Parameters (Seat)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {seatScopedParamData.map(({ param, perSeatResults }) => (
                <div key={param.id} className="print-avoid-break">
                  <SeatScopedParameterCard
                    param={param}
                    perSeatResults={perSeatResults}
                    seatCount={seats.length}
                  />
                </div>
              ))}
            </div>

            {/* Explanatory Footer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print-avoid-break">
              <SeatComplianceSummary position='left' />
              <SeatComplianceSummary position='middle' />
              <SeatComplianceSummary position='right' />
            </div>
          </div>
        )}

        {/* Footer on every page */}
        <div className="fixed bottom-0 left-0 right-0 text-center text-xs text-[#3E4349] py-2" style={{ display: 'none' }}>
          <div>SoundProof • RP22 Compliance Report</div>
        </div>
      </div>
    </>
  );
}