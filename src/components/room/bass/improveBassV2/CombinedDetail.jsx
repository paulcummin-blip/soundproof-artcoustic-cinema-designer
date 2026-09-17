// CombinedDetail.jsx
// Detail component for the "Best Combined Improvement" stage row.
// Shows what the combined change includes (position movement, seating offset,
// retuned calibration) and before/after P19/P20 metrics for the primary seat.

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";

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

export default function CombinedDetail({ result, currentResult, currentInstances }) {
  if (!result) return null;

  const coords = result?.positionCoordinates || result?.coordinates || [];
  const hasPositions = coords.length > 0;
  const hasSeating = !!result?.seatingPositions && (result?.seatingOffsetMm || 0) !== 0;
  const hasCalibration = !!(result?.appliedTuning || result?.tuning || []).length;

  const beforeP19 = primarySeatMetric(currentResult?.perSeatP19);
  const afterP19 = primarySeatMetric(result.perSeatP19);
  const beforeP20 = primarySeatMetric(currentResult?.perSeatP20);
  const afterP20 = primarySeatMetric(result.perSeatP20);

  // Calculate max sub movement if positions are included
  let maxMovement = 0;
  if (hasPositions && currentInstances?.length) {
    const activeInstances = currentInstances.filter((s) => s.enabled !== false);
    for (let i = 0; i < coords.length && i < activeInstances.length; i++) {
      const dx = Math.abs(Number(coords[i].x) - Number(activeInstances[i].position?.x || 0));
      const dy = Math.abs(Number(coords[i].y) - Number(activeInstances[i].position?.y || 0));
      const dist = Math.hypot(dx, dy);
      if (dist > maxMovement) maxMovement = dist;
    }
  }

  // Build change description
  const changes = [];
  if (hasPositions && maxMovement > 0.01) {
    changes.push(`Sub positions (${(maxMovement * 1000).toFixed(0)} mm max)`);
  }
  if (hasSeating) {
    const offset = result?.seatingOffsetMm || 0;
    const dir = offset < 0 ? "toward screen" : "away from screen";
    changes.push(`Seating (${Math.abs(offset)} mm ${dir})`);
  }
  if (hasCalibration) {
    changes.push("Retuned calibration");
  }

  return (
    <div className="mt-1.5 space-y-1">
      {changes.length > 0 && (
        <div className="text-[10px] text-[#625143]">
          <span className="font-semibold">Combined: </span>
          {changes.join(" + ")}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <MetricBeforeAfter label="P19" before={beforeP19} after={afterP19} />
        <MetricBeforeAfter label="P20" before={beforeP20} after={afterP20} />
      </div>
    </div>
  );
}