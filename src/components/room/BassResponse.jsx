import React, { useMemo } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useAppState } from "../AppStateProvider";
import BassGraph from "@/components/room/bass/BassGraph";
import { simulateBassAtSeats } from "@/components/bass/bassSimulationEngine";

const brand = {
  ink:   "#1B1A1A",
  text:  "#3E4349",
  edge:  "#DCDBD6",
  bg:    "#F8F8F7",
  chip:  "#F9F9F6",
  accent:"#213428",
  sand:  "#C1B6AD",
};

export default function BassResponse() {
  const { subwoofers, seatingPositions, roomDims, frontSubsCfg, rearSubsCfg } = useAppState();
  const seatResponses = useSeatResponses();

  const hasEngineError = useMemo(
    () => seatResponses.some(r => r?.error === "bass-sim-error"),
    [seatResponses]
  );

  const hasNoSeats = !Array.isArray(seatingPositions) || seatingPositions.length === 0;
  const hasNoSubs  = !Array.isArray(subwoofers) || subwoofers.length === 0;

  const dimsTxt = `${(roomDims?.widthM ?? 0).toFixed(1)}×${(roomDims?.lengthM ?? 0).toFixed(1)}×${(roomDims?.heightM ?? 0).toFixed(1)} m`;

  // Determine active model key for bass chart
  const activeModelKey = useMemo(() => {
    const rearCount = rearSubsCfg?.count ?? 0;
    const frontCount = frontSubsCfg?.count ?? 0;
    
    if (rearCount > 0 && rearSubsCfg?.model) {
      return rearSubsCfg.model;
    }
    if (frontCount > 0 && frontSubsCfg?.model) {
      return frontSubsCfg.model;
    }
    return null;
  }, [rearSubsCfg?.count, rearSubsCfg?.model, frontSubsCfg?.count, frontSubsCfg?.model]);

  // Get raw subwoofer curve
  const rawSubCurve = useMemo(() => {
    if (!activeModelKey) return null;
    const curve = getSubwooferCurve(activeModelKey);
    
    // Temporary debug logging
    if (curve) {
      console.log('[BassResponse] Loaded curve for model:', {
        rawKey: activeModelKey,
        pointCount: curve.length,
        firstPoint: curve[0],
        lastPoint: curve[curve.length - 1]
      });
    }
    
    return curve;
  }, [activeModelKey]);

  // Prefer MLP for the graph, otherwise first seat
  const selectedSeat = React.useMemo(() => {
    return seatResponses.find(r => r?.isPrimary) || seatResponses[0] || null;
  }, [seatResponses]);

  // Use raw curve if available, otherwise fall back to engine response
  const responseData = React.useMemo(() => {
    if (rawSubCurve && rawSubCurve.length > 0) {
      // Convert {hz, db} to {frequency, spl} format for chart
      return rawSubCurve.map(point => ({
        frequency: point.hz,
        spl: point.db
      }));
    }
    return Array.isArray(selectedSeat?.responseData) ? selectedSeat.responseData : [];
  }, [rawSubCurve, selectedSeat]);

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

      {!hasNoSubs && activeModelKey && !rawSubCurve && (
        <Alert className="border border-[#C1B6AD] bg-[#F8F8F7] text-[#3E4349]">
          <AlertDescription className="text-sm">
            No frequency response curve available for this subwoofer model.
          </AlertDescription>
        </Alert>
      )}

      {hasEngineError && (
        <Alert className="border border-[#C1B6AD] bg-[#C1B6AD]/10 text-[#1B1A1A]">
          <AlertDescription className="text-sm">
            Bass engine ran in <strong>safe mode</strong>. Results below may be empty. This usually means a sub/seat had
            invalid coordinates. I've prevented a crash and you can keep working.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">
          Room: {dimsTxt}
        </Badge>
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">
          Subs: {subwoofers?.length ?? 0}
        </Badge>
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">
          Seats: {seatingPositions?.length ?? 0}
        </Badge>
      </div>

      {/* Bass Response Graph */}
      {responseData.length > 0 ? (
        <div style={{ border: "1px solid #DCDBD6", borderRadius: 16, background: "#FFFFFF", padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1B1A1A" }}>Bass Response</div>
            <div style={{ fontSize: 12, color: "#3E4349" }}>
              Showing: {selectedSeat?.isPrimary ? "MLP" : `Seat ${selectedSeat?.seatId ?? ""}`}
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

      {/* Simple per‑seat status list; keeps UI responsive even without charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {seatResponses.map((r, idx) => {
          const pts = Array.isArray(r.responseData) ? r.responseData.length : 0;
          return (
            <div
              key={r.seatId ?? idx}
              className="rounded-lg border border-[#DCDBD6] bg-white p-3"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-[#1B1A1A]">
                  Seat {r.seatId ?? idx + 1}
                </div>
                {r.isPrimary && (
                  <Badge className="bg-[#213428] text-white border-[#213428]">MLP</Badge>
                )}
              </div>
              <div className="mt-1 text-xs text-[#3E4349]">
                Samples: {pts}
                {r.error === "bass-sim-error" && (
                  <span className="ml-2 text-[#4A230F]">
                    (safe mode)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional: a note when we have nothing to show yet */}
      {seatResponses.length === 0 && !hasNoSeats && !hasNoSubs && !hasEngineError && (
        <div className="text-sm text-[#3E4349]">
          No response data yet. Try moving a sub or adding a second sub to compare.
        </div>
      )}
    </div>
  );
}