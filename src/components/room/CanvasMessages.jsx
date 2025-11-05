// components/room/CanvasMessages.jsx
import React from "react";

export default function CanvasMessages({ 
  dragWarning, 
  tooltip, 
  hoveredSpeaker, 
  svgW 
}) {
  return (
    <>
      {/* Drag warning */}
      {dragWarning && dragWarning.show && (
        <foreignObject x="10" y="10" width="220" height="30">
          <div style={{
            backgroundColor: '#4A230F',
            color: '#FFFFFF',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'Didact Gothic, Century Gothic, sans-serif',
            pointerEvents: 'none'
          }}>
            {dragWarning.message}
          </div>
        </foreignObject>
      )}

      {/* Tooltip */}
      {tooltip && tooltip.show && (
        <foreignObject x="10" y="45" width="220" height="30">
          <div style={{
            backgroundColor: '#3E4349',
            color: '#FFFFFF',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'Didact Gothic, Century Gothic, sans-serif',
            pointerEvents: 'none'
          }}>
            {tooltip.text}
          </div>
        </foreignObject>
      )}

      {/* Hovered speaker */}
      {hoveredSpeaker && (
        <foreignObject 
          x={Math.min(svgW - 150, hoveredSpeaker.x + 20)} 
          y={Math.max(10, hoveredSpeaker.y - 30)} 
          width="140" 
          height="25"
        >
          <div style={{
            backgroundColor: '#1B1A1A',
            color: '#FFFFFF',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontFamily: 'Didact Gothic, Century Gothic, sans-serif',
            whiteSpace: 'nowrap',
            pointerEvents: 'none'
          }}>
            {hoveredSpeaker.role} — {hoveredSpeaker.model}{hoveredSpeaker.angle !== undefined ? ` (${Math.round(hoveredSpeaker.angle)}°)` : ''}
          </div>
        </foreignObject>
      )}
    </>
  );
}