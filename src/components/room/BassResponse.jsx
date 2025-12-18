import React, { useMemo } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useAppState } from "../AppStateProvider";
import BassGraph from "@/components/room/bass/BassGraph";
import { simulateBassAtSeats } from "@/components/bass/bassSimulationEngine";
import SubTuningControls from "@/components/room/bass/SubTuningControls";

const brand = {
  ink:   "#1B1A1A",
  text:  "#3E4349",
  edge:  "#DCDBD6",
  bg:    "#F8F8F7",
  chip:  "#F9F9F6",
  accent:"#213428",
  sand:  "#C1B6AD",
};

export default function BassResponse({ frontSubsCfg, rearSubsCfg, subWarnings }) {
  const { seatingPositions, roomDims, splConfig, setFrontSubsCfg, setRearSubsCfg } = useAppState();
  const hasNoSeats = !Array.isArray(seatingPositions) || seatingPositions.length === 0;
  const totalSubCount = (frontSubsCfg?.count || 0) + (rearSubsCfg?.count || 0);
  const hasNoSubs = totalSubCount === 0;

  const dimsTxt = `${(roomDims?.widthM ?? 0).toFixed(1)}×${(roomDims?.lengthM ?? 0).toFixed(1)}×${(roomDims?.heightM ?? 0).toFixed(1)} m`;

  // Build subs array from frontSubsCfg + rearSubsCfg for engine
  const subsForSimulation = useMemo(() => {
    const subs = [];
    
    // Front subs
    const frontModel = frontSubsCfg?.model;
    const frontCount = frontSubsCfg?.count || 0;
    const frontPositions = frontSubsCfg?.positions || [];
    const frontTuning = frontSubsCfg?.tuning || [];
    
    if (frontModel && frontCount > 0) {
      // Default positions if not saved
      const roomWidth = roomDims?.widthM || 4.5;
      const defaultFrontPositions = [
        { x: roomWidth * 0.33, y: 0.15 },
        { x: roomWidth * 0.67, y: 0.15 }
      ];
      
      for (let i = 0; i < frontCount; i++) {
        const pos = frontPositions[i] || defaultFrontPositions[i] || { x: roomWidth / 2, y: 0.15 };
        const tuning = frontTuning[i] || { gainDb: 0, delayMs: 0, polarity: 0 };
        subs.push({
          id: `front-sub-${i}`,
          modelKey: frontModel,
          x: pos.x,
          y: pos.y,
          z: 0.35,
          tuning
        });
      }
    }
    
    // Rear subs
    const rearModel = rearSubsCfg?.model;
    const rearCount = rearSubsCfg?.count || 0;
    const rearPositions = rearSubsCfg?.positions || [];
    const rearTuning = rearSubsCfg?.tuning || [];
    
    if (rearModel && rearCount > 0) {
      const roomWidth = roomDims?.widthM || 4.5;
      const roomLength = roomDims?.lengthM || 6.0;
      const defaultRearPositions = [
        { x: roomWidth * 0.33, y: roomLength - 0.15 },
        { x: roomWidth * 0.67, y: roomLength - 0.15 }
      ];
      
      for (let i = 0; i < rearCount; i++) {
        const pos = rearPositions[i] || defaultRearPositions[i] || { x: roomWidth / 2, y: roomLength - 0.15 };
        const tuning = rearTuning[i] || { gainDb: 0, delayMs: 0, polarity: 0 };
        subs.push({
          id: `rear-sub-${i}`,
          modelKey: rearModel,
          x: pos.x,
          y: pos.y,
          z: 0.35,
          tuning
        });
      }
    }
    
    return subs;
  }, [frontSubsCfg, rearSubsCfg, roomDims?.widthM, roomDims?.lengthM]);

  // Run bass simulation engine
  const simulationResults = useMemo(() => {
    if (hasNoSeats || hasNoSubs || !roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
      return { seatResponses: {}, metrics: null };
    }
    
    return simulateBassAtSeats({
      roomDims: {
        widthM: roomDims.widthM,
        lengthM: roomDims.lengthM,
        heightM: roomDims.heightM
      },
      seats: seatingPositions,
      subs: subsForSimulation,
      splConfig: splConfig || { globalPowerW: 100, globalEqHeadroomDb: 0, radiationMode: 'half-space' }
    });
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM, seatingPositions, subsForSimulation, splConfig, hasNoSeats, hasNoSubs]);

  // Find MLP seat for display
  const selectedSeat = useMemo(() => {
    const mlpSeat = seatingPositions?.find(s => s.isPrimary);
    const mlpId = mlpSeat ? (mlpSeat.id || `${mlpSeat.x}-${mlpSeat.y}`) : null;
    
    if (mlpId && simulationResults.seatResponses[mlpId]) {
      return {
        id: mlpId,
        isPrimary: true,
        ...simulationResults.seatResponses[mlpId]
      };
    }
    
    // Fallback to first seat
    const firstId = Object.keys(simulationResults.seatResponses)[0];
    if (firstId) {
      return {
        id: firstId,
        isPrimary: false,
        ...simulationResults.seatResponses[firstId]
      };
    }
    
    return null;
  }, [seatingPositions, simulationResults.seatResponses]);

  // Convert to chart format
  const responseData = useMemo(() => {
    if (!selectedSeat || !selectedSeat.freqsHz || !selectedSeat.splDb) {
      return [];
    }
    
    return selectedSeat.freqsHz.map((frequency, i) => ({
      frequency,
      spl: selectedSeat.splDb[i]
    }));
  }, [selectedSeat]);

  // Schroeder frequency (display only)
  const schroederFrequency = React.useMemo(() => {
    const w = roomDims?.widthM ?? 0;
    const l = roomDims?.lengthM ?? 0;
    const h = roomDims?.heightM ?? 0;
    if (!(w > 0 && l > 0 && h > 0)) return 0;
    const volume = w * l * h;
    const rt60 = 0.4; // default for v1
    return 2000 * Math.sqrt(rt60 / volume);
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);

  const rp22Levels = React.useMemo(() => ([
    { level: "L1", spl: 114, color: "#C1B6AD" },
    { level: "L2", spl: 117, color: "#8B7F76" },
    { level: "L3", spl: 120, color: "#625143" },
    { level: "L4", spl: 123, color: "#213428" },
  ]), []);

  const toggles = React.useMemo(() => ({ smoothing: false }), []);

  return (
    <div className="space-y-4" style={{ fontFamily: 'Didact Gothic, Century Gothic, sans-serif' }}>

      {(hasNoSeats || hasNoSubs) && (
        <Alert className="border border-[#DCDBD6] bg-[#F8F8F7] text-[#3E4349]">
          <AlertDescription className="text-sm">
            {hasNoSeats && <>No seating found. Go to <strong>Layout → Seating</strong> and generate at least one row.</>}
            {hasNoSeats && hasNoSubs && <><br/></>}
            {hasNoSubs && <>No subwoofers found. Add one in <strong>Speakers</strong> (front corner is fine to start).</>}
          </AlertDescription>
        </Alert>
      )}

      {/* Fairness Summary */}
      {simulationResults.metrics?.fairness && (
        <div className="rounded-lg border border-[#213428] bg-[#213428]/5 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-[#213428]">Designer Metrics</div>
            <div className="text-2xl font-bold text-[#213428]">
              {simulationResults.metrics.fairness.score}/100
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[#3E4349]">Best↔Worst:</span>
              <span className="ml-1 font-medium text-[#1B1A1A]">
                {simulationResults.metrics.fairness.spreadBestWorstDb.toFixed(1)} dB
              </span>
            </div>
            <div>
              <span className="text-[#3E4349]">Worst Null:</span>
              <span className="ml-1 font-medium text-[#1B1A1A]">
                {simulationResults.metrics.fairness.nulls.worstNullDb.toFixed(1)} dB
              </span>
            </div>
          </div>
          {simulationResults.metrics.fairness.nulls.worstSeatId && (
            <div className="text-xs text-[#3E4349] mt-2">
              @ Seat {simulationResults.metrics.fairness.nulls.worstSeatId}
            </div>
          )}
        </div>
      )}

      {/* RP22 Bass Metrics */}
      {simulationResults.metrics && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
            <div className="text-xs text-[#3E4349] mb-1">P14 Uniformity</div>
            <div className="text-lg font-bold text-[#1B1A1A]">
              ±{simulationResults.metrics.p14.avgStdDevDb.toFixed(1)} dB
            </div>
          </div>
          <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
            <div className="text-xs text-[#3E4349] mb-1">P18 Extension</div>
            <div className="text-lg font-bold text-[#1B1A1A]">
              {simulationResults.metrics.p18.f3Hz.toFixed(0)} Hz
            </div>
          </div>
          <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
            <div className="text-xs text-[#3E4349] mb-1">P19 Peak SPL</div>
            <div className="text-lg font-bold text-[#1B1A1A]">
              {simulationResults.metrics.p19.bandPeakDb.toFixed(1)} dB
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">
          Room: {dimsTxt}
        </Badge>
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">
          Subs: {totalSubCount}
        </Badge>
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">
          Seats: {seatingPositions?.length ?? 0}
        </Badge>
      </div>
      
      {/* Subwoofer Warnings */}
      {(subWarnings?.front?.length > 0 || subWarnings?.rear?.length > 0) && (
        <Alert className="border border-[#C1B6AD] bg-[#F8F8F7] text-[#3E4349]">
          <AlertDescription className="text-sm">
            {subWarnings.front.map((w, i) => <div key={`f-${i}`}>{w}</div>)}
            {subWarnings.rear.map((w, i) => <div key={`r-${i}`}>{w}</div>)}
          </AlertDescription>
        </Alert>
      )}

      {/* Bass Response Graph */}
      {responseData.length > 0 ? (
        <div style={{ border: "1px solid #DCDBD6", borderRadius: 16, background: "#FFFFFF", padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1B1A1A" }}>Bass Response</div>
            <div style={{ fontSize: 12, color: "#3E4349" }}>
              Showing: {selectedSeat?.isPrimary ? "MLP" : `Seat ${selectedSeat?.id ?? ""}`}
            </div>
          </div>
          <BassGraph
            responseData={responseData}
            schroederFrequency={schroederFrequency}
            rp22Levels={rp22Levels}
            toggles={toggles}
            crossoverFrequency={80}
          />
        </div>
      ) : (
        <div style={{ border: "1px solid #DCDBD6", borderRadius: 16, background: "#F8F8F7", padding: 12, color: "#3E4349", fontSize: 13 }}>
          No bass response data yet. Add at least one sub and one seat, then check this panel again.
        </div>
      )}

      {/* Per-seat detail cards */}
      {Object.keys(simulationResults.seatResponses).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Object.entries(simulationResults.seatResponses).map(([seatId, response]) => {
            const seat = seatingPositions.find(s => (s.id || `${s.x}-${s.y}`) === seatId);
            const isPrimary = seat?.isPrimary || false;
            const nullInfo = response.nulls || { count: 0, worstDb: 0 };
            
            return (
              <div
                key={seatId}
                className="rounded-lg border border-[#DCDBD6] bg-white p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-[#1B1A1A]">
                    Seat {seatId}
                  </div>
                  {isPrimary && (
                    <Badge className="bg-[#213428] text-white border-[#213428]">MLP</Badge>
                  )}
                </div>
                <div className="space-y-1 text-xs">
                  {nullInfo.count > 0 && (
                    <>
                      <div className="text-[#3E4349]">
                        <span className="font-medium">Nulls:</span> {nullInfo.count}
                      </div>
                      <div className="text-[#3E4349]">
                        <span className="font-medium">Worst:</span> {nullInfo.worstDb.toFixed(1)} dB
                      </div>
                    </>
                  )}
                  {nullInfo.count === 0 && (
                    <div className="text-[#3E4349]">No significant nulls</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}