import React from "react";

export default function ExtraSurroundDebugPanel({ extraSurroundCount, globalSurroundModel, placedSpeakers = [], visiblePlanSpeakers = [] }) {
  const placedRoles = placedSpeakers.map((speaker) => String(speaker?.role || "")).filter(Boolean);
  const visibleRoles = visiblePlanSpeakers.map((speaker) => String(speaker?.role || "")).filter(Boolean);

  return (
    <div className="mx-6 mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
      <div className="font-semibold">Debug Extras</div>
      <div>count: {Number(extraSurroundCount) || 0}</div>
      <div>model: {globalSurroundModel || "-"}</div>
      <div>placed: {placedRoles.length ? placedRoles.join(", ") : "-"}</div>
      <div>visible: {visibleRoles.length ? visibleRoles.join(", ") : "-"}</div>
    </div>
  );
}