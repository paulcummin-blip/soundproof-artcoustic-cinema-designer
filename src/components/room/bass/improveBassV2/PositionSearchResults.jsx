// PositionSearchResults.jsx
// Stage 11B: Position search results display.
// Shows the optimised position recommendation with raw dB + displayed levels,
// movement description, tuning changes, and Apply button.

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Wrench, Settings, MapPin } from "lucide-react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import SharedP19P20SeatResults from "@/components/room/bass/SharedP19P20SeatResults";
import { isOptimisedApplied, buildCalibrationSummary } from "./improveBassV2Apply";

function levelText(level) {
  if (!Number.isFinite(level)) return "—";
  return level > 0 ? `L${level}` : "FAIL";
}

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : null;
}

function BeforeAfterDb({ label, beforeLevel, afterLevel, beforeDb, afterDb }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-[#213428]">{label}</span>
      <div className="flex items-center gap-1.5 w-full">
        <RP22GradingPill level={beforeLevel} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
          {beforeDb != null ? `${beforeDb.toFixed(1)} dB` : levelText(beforeLevel)}
        </RP22GradingPill>
        <span className="text-[10px] text-[#8A7B6A]">→</span>
        <RP22GradingPill level={afterLevel} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
          {afterDb != null ? `${afterDb.toFixed(1)} dB` : levelText(afterLevel)}
        </RP22GradingPill>
      </div>
    </div>
  );
}

export default function PositionSearchResults({
  positionWinner,
  currentResult,
  snapshot,
  currentInstances,
  roomDims,
  onApply,
  isApplied,
}) {
  const [showDetails, setShowDetails] = useState(false);

  if (!positionWinner?.winner) return null;

  const winner = positionWinner.winner;
  const movement = positionWinner.movement || winner.movementDescription || "Position optimised";
  const phase = positionWinner.phase || "symmetric";

  const beforeP19 = numericLevel(currentResult?.achievedP19Level);
  const afterP19 = numericLevel(winner.achievedP19Level);
  const beforeP19Db = currentResult?.achievedP19VariationDb;
  const afterP19Db = winner.achievedP19VariationDb;

  const beforeP20 = numericLevel(currentResult?.achievedP20Level);
  const afterP20 = numericLevel(winner.achievedP20Level);
  const beforeP20Db = currentResult?.achievedP20VariationDb;
  const afterP20Db = winner.achievedP20VariationDb;

  const beforeP14 = numericLevel(currentResult?.p14AchievedLevel);
  const afterP14 = numericLevel(winner.p14AchievedLevel);

  const calSummary = buildCalibrationSummary(winner);
  const applied = isApplied || isOptimisedApplied(currentInstances, winner, roomDims);

  return (
    <div className="mt-3 rounded-md border border-[#213428] bg-[#F8F7F4] p-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-[#213428]" />
        <span className="text-[12px] font-semibold text-[#213428]">
          Optimised Subwoofer Position
        </span>
        {phase === "asymmetric-pair" && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
            Asymmetric
          </span>
        )}
        {phase === "individual" && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
            Individual
          </span>
        )}
      </div>

      {/* Movement description */}
      <div className="mt-2 text-[11px] text-[#625143] font-medium">{movement}</div>

      {/* Before → After with raw dB */}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <BeforeAfterDb
          label="P19"
          beforeLevel={beforeP19}
          afterLevel={afterP19}
          beforeDb={beforeP19Db}
          afterDb={afterP19Db}
        />
        <BeforeAfterDb
          label="P20"
          beforeLevel={beforeP20}
          afterLevel={afterP20}
          beforeDb={beforeP20Db}
          afterDb={afterP20Db}
        />
        <BeforeAfterDb
          label="P14"
          beforeLevel={beforeP14}
          afterLevel={afterP14}
          beforeDb={null}
          afterDb={null}
        />
      </div>

      {/* P19/P20 per-seat results */}
      <div className="mt-3">
        <div className="text-[10px] font-semibold text-[#625143] mb-1.5">P19 / P20 seat results (optimised)</div>
        <SharedP19P20SeatResults
          p19Rows={winner.perSeatP19 || []}
          p20Rows={winner.perSeatP20 || []}
          publicationVerified
          authorityStatus="COMPLETE"
          p14TargetUnselected={false}
          compact
        />
      </div>

      {/* Calibration settings */}
      {calSummary && (calSummary.delays.some((d) => parseFloat(d) > 0.1) ||
        calSummary.polarities.some((p) => p === "Inverted")) && (
        <div className="mt-3 rounded-md border border-[#E0DDD7] bg-white p-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#213428]">
            <Settings className="h-3 w-3" />
            Calibration
          </div>
          <div className="mt-1 space-y-0.5">
            {calSummary.delays.some((d) => parseFloat(d) > 0.1) && (
              <div className="text-[10px] text-[#625143]">
                Delay: {calSummary.delays.join(" / ")} ms
              </div>
            )}
            {calSummary.polarities.some((p) => p === "Inverted") && (
              <div className="text-[10px] text-[#625143]">
                Polarity: {calSummary.polarities.join(" / ")}
              </div>
            )}
            {calSummary.trims.some((t) => parseFloat(t) > 0.1) && (
              <div className="text-[10px] text-[#625143]">
                Trim: {calSummary.trims.join(" / ")} dB
              </div>
            )}
          </div>
        </div>
      )}

      {/* Apply button */}
      <div className="mt-3">
        <Button
          type="button"
          className="w-full bg-[#213428] text-white hover:bg-[#3E4349]"
          onClick={onApply}
          disabled={applied}
        >
          {applied ? "Applied" : "Apply Optimised Setup"}
        </Button>
      </div>

      {/* Exhaustion notice */}
      {positionWinner.subOptimisationExhausted && !positionWinner.materialSubImprovementFound && (
        <div className="mt-2 text-[10px] text-[#8A7B6A] italic">
          All practical subwoofer search tiers exhausted. No material position improvement found —
          current design retained. Consider seating adjustments or additional subwoofers.
        </div>
      )}
    </div>
  );
}