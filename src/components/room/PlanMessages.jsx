// components/room/PlanMessages.jsx
import React from "react";

export default function PlanMessages({
  dragWarning,
  tooltip,
  hoveredSpeaker,
  svgW,
}) {
  const width = Number(svgW) || 0;
  const hsX = Number(hoveredSpeaker?.x);
  const hsY = Number(hoveredSpeaker?.y);
  const hasHS = Number.isFinite(hsX) && Number.isFinite(hsY);

  return (
    <>
      {/* Drag warning */}
      {dragWarning?.show && (
        <foreignObject x="10" y="10" width="220" height="30">
          <div
            style={{
              backgroundColor: "#4A230F",
              color: "#FFFFFF",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "Didact Gothic, Century Gothic, sans-serif",
              pointerEvents: "none",
            }}
          >
            {dragWarning.message}
          </div>
        </foreignObject>
      )}

      {/* Tooltip */}
      {tooltip?.show && (
        <foreignObject x="10" y="45" width="220" height="30">
          <div
            style={{
              backgroundColor: "#3E4349",
              color: "#FFFFFF",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "Didact Gothic, Century Gothic, sans-serif",
              pointerEvents: "none",
            }}
          >
            {tooltip.text}
          </div>
        </foreignObject>
      )}

      {/* Hovered speaker */}
      {hasHS && (
        <foreignObject
          x={Math.min(Math.max(0, width - 150), hsX + 20)}
          y={Math.max(10, hsY - 30)}
          width="140"
          height="25"
        >
          <div
            style={{
              backgroundColor: "#1B1A1A",
              color: "#FFFFFF",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "Didact Gothic, Century Gothic, sans-serif",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {(hoveredSpeaker?.role ?? "—")} — {(hoveredSpeaker?.model ?? "—")}
            {Number.isFinite(hoveredSpeaker?.angle)
              ? ` (${Math.round(hoveredSpeaker.angle)}°)`
              : ""}
          </div>
        </foreignObject>
      )}
    </>
  );
}