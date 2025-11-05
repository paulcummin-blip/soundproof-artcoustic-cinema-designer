
import React, { useMemo } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useAppState } from "../AppStateProvider";
import { useSeatResponses } from "./hooks/useSeatResponses";

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
  const { subwoofers, seatingPositions, dimensions } = useAppState();
  const seatResponses = useSeatResponses();

  const hasEngineError = useMemo(
    () => seatResponses.some(r => r?.error === "bass-sim-error"),
    [seatResponses]
  );

  const hasNoSeats = !Array.isArray(seatingPositions) || seatingPositions.length === 0;
  const hasNoSubs  = !Array.isArray(subwoofers) || subwoofers.length === 0;

  const dimsTxt = `${dimensions?.width?.toFixed?.(1) ?? "-"}×${dimensions?.length?.toFixed?.(1) ?? "-"}×${dimensions?.height?.toFixed?.(1) ?? "-"} m`;

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
