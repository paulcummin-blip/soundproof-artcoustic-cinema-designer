import React, { useEffect, useMemo, useState } from 'react';
import { useAppState } from '@/components/AppStateProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RP22GradingPill from '@/components/ui/RP22GradingPill';
import ParameterCard from '@/components/report/ParameterCard';
import SeatComplianceSummary from '@/components/report/SeatComplianceSummary';
import { useRP22AnalysisEngine } from '@/components/hooks/useRP22AnalysisEngine';
import { formatSeatLabel } from '@/components/utils/seatLabel';
import { useCompletedBassAuthority } from '@/components/room/bass/completedBassResultStore';
import { buildComplianceBassPresentation } from '@/components/room/bass/bassCompliancePresentation';
import { RP22_PRESENTATION_PARAMETERS, RP22_SEAT_PARAMETERS } from '@/components/utils/rp22ParameterPresentation';
import { formatAuthoritativeP20Result, p20LevelText } from '@/components/room/bass/p20SeatPresentation';
import { attachAuthoritativeP19ToSeatSnapshot } from '@/components/room/seatHudPresentation';

export default function ComplianceReportPrint() {
  const app = useAppState();
  const [isReady, setIsReady] = useState(false);
  const reportScopeId = new URLSearchParams(window.location.search).get('projectId') || new URLSearchParams(window.location.search).get('id') || 'free';
  const completedBassAuthority = useCompletedBassAuthority(reportScopeId);
  const completedBassContract = completedBassAuthority.contract;
  const bassPresentation = useMemo(() => buildComplianceBassPresentation(completedBassContract), [completedBassContract]);

  // Extract data
  const roomDims = app?.roomDims || {};
  const widthM = Number(roomDims.widthM || roomDims.width) || 0;
  const lengthM = Number(roomDims.lengthM || roomDims.length) || 0;
  const heightM = Number(roomDims.heightM || roomDims.height) || 0;

  const speakers = app?.speakerSystem?.placedSpeakers || [];
  const seats = app?.seatingPositions || [];
  const dolbyLayout = app?.dolbyLayout || app?.dolbyConfig || '5.1';
  const mlp = app?.mlp;

  // Run non-bass RP22 analysis; P14/P18/P19/P20 display comes only from the completed bass contract.
  const analysis = useRP22AnalysisEngine({
    roomDims: { widthM, lengthM, heightM },
    speakers,
    seats,
    dolbyLayout,
    mlp,
    seatMetricsById: app?.seatMetricsById || {},
    includeBassAnalysis: false,
  });

  const roomParams = React.useMemo(
    () => RP22_PRESENTATION_PARAMETERS.filter((parameter) => parameter.scope === 'Room'),
    []
  );

  const seatParams = analysis?.perSeatAnalysis || {};

  // Count levels
  const roomCounts = { L1: 0, L2: 0, L3: 0, L4: 0 };
  roomParams.forEach(p => {
    const lvl = p?.level;
    if (lvl && roomCounts[lvl] !== undefined) roomCounts[lvl]++;
  });

  const seatCounts = { L1: 0, L2: 0, L3: 0, L4: 0 };
  Object.values(seatParams).forEach(seat => {
    Object.values(seat || {}).forEach(param => {
      const lvl = param?.level;
      if (lvl && seatCounts[lvl] !== undefined) seatCounts[lvl]++;
    });
  });

  // Compute RSP seat
  const rspSeatId = React.useMemo(() => {
    const greenDot = mlp;
    if (!greenDot || !Number.isFinite(greenDot.x) || !Number.isFinite(greenDot.y)) return null;
    
    let closestSeat = null;
    let minDist = Infinity;
    
    seats.forEach(s => {
      if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y)) return;
      const d = Math.hypot(s.x - greenDot.x, s.y - greenDot.y);
      if (d < minDist) {
        minDist = d;
        closestSeat = s.id;
      }
    });
    
    return (minDist <= 0.05) ? closestSeat : null;
  }, [seats, mlp]);

  // Auto-print once ready
  useEffect(() => {
    if (completedBassAuthority.exportable && (roomParams.length > 0 || Object.keys(seatParams).length > 0)) {
      setIsReady(true);
      // Delay print to ensure render completes
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [roomParams, seatParams, completedBassAuthority.exportable]);

  if (!completedBassAuthority.exportable || !isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
        <p className="text-lg">{completedBassAuthority.exportable ? 'Preparing report...' : 'Bass analysis updating'}</p>
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

          {/* Summary Counts */}
          <div className="space-y-6">
            <div>
              <h2 
                className="text-lg font-semibold text-[#1B1A1A] mb-3"
                style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}
              >
                Room Parameters
              </h2>
              <div className="flex gap-3">
                <RP22GradingPill level="L1" count={roomCounts.L1} />
                <RP22GradingPill level="L2" count={roomCounts.L2} />
                <RP22GradingPill level="L3" count={roomCounts.L3} />
                <RP22GradingPill level="L4" count={roomCounts.L4} />
              </div>
            </div>

            <div>
              <h2 
                className="text-lg font-semibold text-[#1B1A1A] mb-3"
                style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}
              >
                Seat Parameters
              </h2>
              <div className="flex gap-3">
                <RP22GradingPill level="L1" count={seatCounts.L1} />
                <RP22GradingPill level="L2" count={seatCounts.L2} />
                <RP22GradingPill level="L3" count={seatCounts.L3} />
                <RP22GradingPill level="L4" count={seatCounts.L4} />
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
                const authority = [14, 18, 19].includes(param.id) ? bassPresentation.parameters[`p${param.id}`] : null;
                const roomResult = authority
                  ? { status: authority.status, formatted: authority.valueText, level: authority.level }
                  : analysis?.gradedParameters?.primary?.[param.id] || null;
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
              {seats.map(seat => {
                const seatId = seat?.id || '—';
                const tooltipData = app?.seatMetricsById?.[seatId];
                const rp22Raw = tooltipData?.rp22 || {};
                const isPrimary = tooltipData?.isPrimary || false;

                if (!tooltipData) return null;

                const isRsp = seatId === rspSeatId;
                const suffix = isRsp ? '(RSP)' : (isPrimary ? '(Primary)' : '(Secondary)');
                const suffixColor = isRsp ? '#213428' : (isPrimary ? '#625143' : '#3E4349');

                // Extract seat-specific parameters
                const seatParamsList = RP22_SEAT_PARAMETERS.map(({ number }) => {
                  if (number === 19) {
                    const withP19 = attachAuthoritativeP19ToSeatSnapshot(
                      { rp22: rp22Raw }, seatId, isRsp,
                      completedBassContract?.productAnalysis?.parameters?.p19,
                      completedBassContract?.selectedCandidate?.perSeatP19Results,
                    );
                    const metric = withP19.rp22.p19;
                    return { num: 'P19', valueFormatted: metric.formatted, level: metric.level };
                  }
                  if (number === 20) {
                    const result = bassPresentation.perSeatP20Results.find((item) => String(item?.seatId) === String(seatId));
                    return result && Number.isFinite(Number(result.variationDbRaw))
                      ? { num: 'P20', valueFormatted: formatAuthoritativeP20Result(result), level: p20LevelText(result.level) }
                      : { num: 'P20', valueFormatted: '—', level: '—' };
                  }
                  const metric = rp22Raw[`p${number}`] || rp22Raw[`P${number}`] || {};
                  return { num: `P${number}`, valueFormatted: metric.formatted || metric.hudLabel || '—', level: metric.level || '—' };
                });

                return (
                  <div key={seatId} className="print-avoid-break">
                    <Card className="border-[#E6E4DD]">
                      <CardHeader className="pb-2">
                        <CardTitle 
                          className="text-sm font-semibold text-[#1B1A1A]"
                          style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}
                        >
                          {formatSeatLabel(seatId)}{' '}
                          <span className="text-xs font-semibold" style={{ color: suffixColor }}>
                            {suffix}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {seatParamsList.map(param => (
                          <div key={param.num} className="flex items-center justify-between text-xs">
                            <span className="font-medium text-[#1B1A1A]">{param.num}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[#3E4349]">{param.valueFormatted ?? '—'}</span>
                              <RP22GradingPill level={param.level} compact />
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
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