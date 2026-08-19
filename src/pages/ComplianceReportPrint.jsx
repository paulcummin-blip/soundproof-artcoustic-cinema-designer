import React, { useEffect, useMemo, useState } from 'react';
import { useAppState } from '@/components/AppStateProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RP22GradingPill from '@/components/ui/RP22GradingPill';
import ParameterCard from '@/components/report/ParameterCard';
import SeatScopedParameterCard from '@/components/report/SeatScopedParameterCard';
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
  const bassErrorMessage = completedBassAuthority.errorMessage || null;
  const bassPresentation = useMemo(() => buildComplianceBassPresentation({ completedBassAuthority }, bassErrorMessage), [completedBassAuthority, bassErrorMessage]);
  const bassReportPending = completedBassAuthority.status === 'loading';

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
    diagnosticOwner: "compliance-report-print",
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

  // Count ROOM parameter levels only (seat-scoped levels are NOT included in room compliance)
  const roomCounts = { L1: 0, L2: 0, L3: 0, L4: 0, FAIL: 0 };
  roomParams.forEach(p => {
    const authority = [14, 18].includes(p.id) ? bassPresentation.parameters[`p${p.id}`] : null;
    const roomResult = authority
      ? { level: authority.level }
      : analysis?.gradedParameters?.primary?.[p.id] || null;
    const lvl = roomResult?.level;
    if (lvl) {
      const key = String(lvl).toUpperCase();
      if (roomCounts[key] !== undefined) roomCounts[key]++;
    }
  });

  // Seat results: count calculated parameters and seats evaluated (no L-level aggregation)
  const seatCalculatedParamCount = React.useMemo(() => {
    return RP22_SEAT_PARAMETERS.filter((param) => {
      const perSeat = app?.seatMetricsById || {};
      return Object.values(perSeat).some((seatData) => {
        const rp22 = seatData?.rp22 || {};
        const metric = rp22[`p${param.number}`] || rp22[`P${param.number}`] || {};
        return metric?.level && metric.level !== '—' && metric.level !== 'N/A';
      });
    }).length;
  }, [app?.seatMetricsById]);

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

  // Build per-parameter seat results for seat-scoped parameters (P1, P4, P5, P6, P9, P10, P16, P17, P19, P20)
  const seatScopedParamData = React.useMemo(() => {
    return RP22_SEAT_PARAMETERS.map(param => {
      const perSeatResults = seats.map(seat => {
        const seatId = seat?.id || '—';
        const tooltipData = app?.seatMetricsById?.[seatId];
        const rp22Raw = tooltipData?.rp22 || {};
        const isRsp = seatId === rspSeatId;
        const isPrimary = tooltipData?.isPrimary || false;

        let valueFormatted = '—';
        let level = '—';

        if (param.number === 19) {
          const withP19 = attachAuthoritativeP19ToSeatSnapshot(
            { rp22: rp22Raw }, seatId, isRsp,
            completedBassContract?.productAnalysis?.parameters?.p19,
            completedBassContract?.selectedCandidate?.perSeatP19Results,
          );
          const metric = withP19.rp22.p19;
          valueFormatted = metric.formatted || '—';
          level = metric.level || '—';
        } else if (param.number === 20) {
          const result = bassPresentation.perSeatP20Results.find(
            (item) => String(item?.seatId) === String(seatId)
          );
          if (result && Number.isFinite(Number(result.variationDbRaw))) {
            valueFormatted = formatAuthoritativeP20Result(result);
            level = p20LevelText(result.level);
          }
        } else {
          const metric = rp22Raw[`p${param.number}`] || rp22Raw[`P${param.number}`] || {};
          valueFormatted = metric.formatted || metric.hudLabel || '—';
          level = metric.level || '—';
        }

        const suffix = isRsp ? '(RSP)' : (isPrimary ? '(Primary)' : '');
        return {
          seatId,
          seatLabel: formatSeatLabel(seatId),
          suffix,
          valueFormatted,
          level,
          isRsp,
          isPrimary,
        };
      });
      return { param, perSeatResults };
    });
  }, [seats, app?.seatMetricsById, rspSeatId, completedBassContract, bassPresentation]);

  // Auto-print once ready
  useEffect(() => {
    if (!bassReportPending && (roomParams.length > 0 || Object.keys(seatParams).length > 0)) {
      setIsReady(true);
      // Delay print to ensure render completes
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [roomParams, seatParams, bassReportPending]);

  if (bassReportPending || !isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
        <p className="text-lg">{bassReportPending ? 'Bass analysis updating' : 'Preparing report...'}</p>
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

          {bassErrorMessage && <p className="text-sm text-[#625143] mb-4">Bass analysis unavailable</p>}

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
                <RP22GradingPill level="FAIL" count={roomCounts.FAIL} />
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
                const authority = [14, 18, 19].includes(param.id) ? bassPresentation.parameters[`p${param.id}`] : null;
                const roomResult = authority
                  ? { status: authority.status, formatted: authority.valueText, level: authority.level, detail: authority.detail }
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