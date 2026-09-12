// ImproveBassV2StageRow.jsx
// A single stage row in the new one-result-per-stage Improve Bass UI.
//
// Shows:
//   - Stage name (PHASE / DELAY / GAIN / SUBWOOFER POSITIONS / SEATING POSITIONS)
//   - Verdict (Improvement found / No improvement / Not available / Not tested)
//   - If improvement found: compact before/after evidence + Apply button
//   - If APPLIED: green checkmark with "APPLIED" label

import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Minus, AlertCircle, Lock } from "lucide-react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { formatAcousticPath } from "./acousticDistance";

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function fmtDb(raw) {
  if (!Number.isFinite(Number(raw))) return "—";
  return Math.abs(Number(raw)).toFixed(2);
}

function primarySeatMetric(perSeatArray) {
  if (!Array.isArray(perSeatArray) || !perSeatArray.length) return null;
  return perSeatArray.find((s) => s?.isPrimary === true) || perSeatArray[0];
}

function MetricBeforeAfter({ label, before, after }) {
  const beforeLevel = numericLevel(before?.level);
  const afterLevel = numericLevel(after?.level);
  const beforeRaw = fmtDb(before?.variationDbRaw);
  const afterRaw = fmtDb(after?.variationDbRaw);
  const changed = beforeLevel !== afterLevel || Math.abs(parseFloat(beforeRaw) - parseFloat(afterRaw)) > 0.05;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold text-[#625143] w-8">{label}</span>
      <RP22GradingPill level={beforeLevel} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
        {beforeRaw}
      </RP22GradingPill>
      <span className="text-[10px] text-[#8A7B6A]">→</span>
      <RP22GradingPill level={afterLevel} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
        {afterRaw}
      </RP22GradingPill>
    </div>
  );
}

function StageVerdictBadge({ verdict }) {
  if (verdict === "improvement") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#E7F0EC] border border-[#213428]/20 px-2 py-0.5">
        <CheckCircle2 className="h-3 w-3 text-[#213428]" />
        <span className="text-[10px] font-semibold text-[#213428]">Improvement found</span>
      </span>
    );
  }
  if (verdict === "no_improvement") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#F5F4F1] border border-[#D9D5CE] px-2 py-0.5">
        <Minus className="h-3 w-3 text-[#8A7B6A]" />
        <span className="text-[10px] font-medium text-[#625143]">No improvement</span>
      </span>
    );
  }
  if (verdict === "not_available") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#F5F4F1] border border-[#D9D5CE] px-2 py-0.5">
        <Lock className="h-3 w-3 text-[#8A7B6A]" />
        <span className="text-[10px] font-medium text-[#625143]">Not available yet</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[#F5F4F1] border border-[#D9D5CE] px-2 py-0.5">
      <Minus className="h-3 w-3 text-[#B0A89B]" />
      <span className="text-[10px] text-[#B0A89B]">Not tested</span>
    </span>
  );
}

function DelayDetail({ result, currentResult }) {
  const tuning = result?.appliedTuning || result?.tuning || [];
  if (!tuning.length) return null;

  // Find the group with the largest delay change
  const beforeP19 = primarySeatMetric(currentResult?.perSeatP19);
  const afterP19 = primarySeatMetric(result.perSeatP19);
  const beforeP20 = primarySeatMetric(currentResult?.perSeatP20);
  const afterP20 = primarySeatMetric(result.perSeatP20);

  // Summarise the delay adjustment
  const maxDelay = Math.max(...tuning.map((t) => Number(t.delayMs) || 0));
  const minDelay = Math.min(...tuning.map((t) => Number(t.delayMs) || 0));
  const range = maxDelay - minDelay;

  return (
    <div className="mt-1.5 space-y-1">
      {range > 0.1 && (
        <div className="text-[10px] text-[#625143]">
          Grouped delay: {range.toFixed(1)} ms relative adjustment
          <span className="ml-1.5 text-[#8A7B6A]">{formatAcousticPath(range)}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <MetricBeforeAfter label="P19" before={beforeP19} after={afterP19} />
        <MetricBeforeAfter label="P20" before={beforeP20} after={afterP20} />
      </div>
    </div>
  );
}

function GainDetail({ result, currentResult }) {
  const tuning = result?.appliedTuning || result?.tuning || [];
  if (!tuning.length) return null;

  const beforeP19 = primarySeatMetric(currentResult?.perSeatP19);
  const afterP19 = primarySeatMetric(result.perSeatP19);
  const beforeP20 = primarySeatMetric(currentResult?.perSeatP20);
  const afterP20 = primarySeatMetric(result.perSeatP20);

  // Summarise the gain adjustment
  const gains = tuning.map((t) => Number(t.gainDb) || 0);
  const maxGain = Math.max(...gains);
  const minGain = Math.min(...gains);
  const range = maxGain - minGain;

  return (
    <div className="mt-1.5 space-y-1">
      {range > 0.1 && (
        <div className="text-[10px] text-[#625143]">
          Grouped trim: {range.toFixed(1)} dB relative adjustment
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <MetricBeforeAfter label="P19" before={beforeP19} after={afterP19} />
        <MetricBeforeAfter label="P20" before={beforeP20} after={afterP20} />
      </div>
    </div>
  );
}

function PositionDetail({ result, currentResult, currentInstances }) {
  const coords = result?.positionCoordinates || result?.coordinates || [];
  if (!coords.length || !currentInstances?.length) return null;

  const beforeP19 = primarySeatMetric(currentResult?.perSeatP19);
  const afterP19 = primarySeatMetric(result.perSeatP19);
  const beforeP20 = primarySeatMetric(currentResult?.perSeatP20);
  const afterP20 = primarySeatMetric(result.perSeatP20);

  // Calculate movement distances
  const activeInstances = (currentInstances || []).filter((s) => s.enabled !== false);
  let maxMovement = 0;
  for (let i = 0; i < coords.length && i < activeInstances.length; i++) {
    const dx = Math.abs(Number(coords[i].x) - Number(activeInstances[i].position?.x || 0));
    const dy = Math.abs(Number(coords[i].y) - Number(activeInstances[i].position?.y || 0));
    const dist = Math.hypot(dx, dy);
    if (dist > maxMovement) maxMovement = dist;
  }

  return (
    <div className="mt-1.5 space-y-1">
      {maxMovement > 0.01 && (
        <div className="text-[10px] text-[#625143]">
          Max movement: {(maxMovement * 1000).toFixed(0)} mm
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <MetricBeforeAfter label="P19" before={beforeP19} after={afterP19} />
        <MetricBeforeAfter label="P20" before={beforeP20} after={afterP20} />
      </div>
    </div>
  );
}

function SeatingDetail({ result, currentResult }) {
  const offsetMm = result?.seatingOffsetMm || 0;
  const beforeP19 = primarySeatMetric(currentResult?.perSeatP19);
  const afterP19 = primarySeatMetric(result.perSeatP19);
  const beforeP20 = primarySeatMetric(currentResult?.perSeatP20);
  const afterP20 = primarySeatMetric(result.perSeatP20);

  const direction = offsetMm < 0 ? "toward screen" : offsetMm > 0 ? "away from screen" : "current";

  return (
    <div className="mt-1.5 space-y-1">
      <div className="text-[10px] text-[#625143]">
        Move seating {Math.abs(offsetMm)} mm {direction}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <MetricBeforeAfter label="P19" before={beforeP19} after={afterP19} />
        <MetricBeforeAfter label="P20" before={beforeP20} after={afterP20} />
      </div>
    </div>
  );
}

export default function ImproveBassV2StageRow({
  stageKey,
  label,
  stage,
  currentResult,
  currentInstances,
  isApplied,
  onApply,
  stale,
}) {
  const { verdict, result, reason } = stage;

  return (
    <div
      data-stage-key={stageKey}
      data-stage-verdict={verdict}
      className={`rounded-md border p-2.5 ${
        verdict === "improvement"
          ? "border-[#213428]/30 bg-[#F8F7F4]"
          : "border-[#E7E4DF] bg-[#F8F7F4]"
      }`}
    >
      {/* Stage header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-[#1B1A1A] tracking-wide">{label}</span>
        <div className="flex items-center gap-1.5">
          {isApplied && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#213428] px-1.5 py-0.5">
              <CheckCircle2 className="h-3 w-3 text-white" />
              <span className="text-[9px] font-semibold text-white">APPLIED</span>
            </span>
          )}
          <StageVerdictBadge verdict={verdict} />
        </div>
      </div>

      {/* Reason for not-available / no-improvement */}
      {verdict === "not_available" && reason && (
        <p className="mt-1 text-[10px] leading-relaxed text-[#8A7B6A]">{reason}</p>
      )}
      {verdict === "no_improvement" && reason && (
        <p className="mt-1 text-[10px] leading-relaxed text-[#8A7B6A]">{reason}</p>
      )}

      {/* Improvement detail */}
      {verdict === "improvement" && result && (
        <>
          {stageKey === "delay" && <DelayDetail result={result} currentResult={currentResult} />}
          {stageKey === "gain" && <GainDetail result={result} currentResult={currentResult} />}
          {stageKey === "subPositions" && (
            <PositionDetail result={result} currentResult={currentResult} currentInstances={currentInstances} />
          )}
          {stageKey === "seating" && <SeatingDetail result={result} currentResult={currentResult} />}

          {/* Apply button */}
          {!isApplied && !stale && onApply && (
            <div className="mt-2">
              <Button
                type="button"
                size="sm"
                className="w-full bg-[#213428] text-white hover:bg-[#3E4349] text-[11px] font-semibold"
                data-apply-stage={stageKey}
                data-apply-candidate-id={result.candidateId}
                onClick={() => onApply(stageKey, result)}
              >
                Apply {label}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}