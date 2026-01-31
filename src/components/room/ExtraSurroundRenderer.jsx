import React from 'react';
import { getExtraSurroundLabel } from './ExtraSurroundDragHandler';

/**
 * Renders extra surround speakers on plan view
 * Shows wall-clamped position with dynamic label and subtle visual distinction
 */
export default function ExtraSurroundRenderer({
  extraSurrounds = [],
  toPx,
  onDragStart,
  onDrag,
  onDragEnd,
  selectedId = null,
}) {
  if (!Array.isArray(extraSurrounds) || extraSurrounds.length === 0) return null;
  
  return (
    <g data-layer="extra-surrounds">
      {extraSurrounds.map((extra, idx) => {
        if (!extra?.position) return null;
        
        const [px, py] = toPx(extra.position.x, extra.position.y);
        const label = getExtraSurroundLabel(extra, extraSurrounds);
        const isSelected = extra.id === selectedId;
        
        return (
          <g
            key={extra.id}
            data-extra-surround-id={extra.id}
            style={{ cursor: extra.draggable ? 'move' : 'default' }}
            onMouseDown={(e) => {
              if (extra.draggable && onDragStart) {
                e.stopPropagation();
                onDragStart(extra.id, 'extraSurround');
              }
            }}
          >
            {/* Speaker circle (subtle outline for distinction) */}
            <circle
              cx={px}
              cy={py}
              r={12}
              fill="#FFFFFF"
              stroke={isSelected ? '#213428' : '#625143'}
              strokeWidth={isSelected ? 2.5 : 1.5}
              strokeDasharray="3 2"
            />
            
            {/* "+" badge to indicate extra surround */}
            <text
              x={px}
              y={py}
              fontSize={14}
              fontWeight="700"
              fill="#625143"
              textAnchor="middle"
              dominantBaseline="middle"
              pointerEvents="none"
              style={{ userSelect: 'none' }}
            >
              +
            </text>
            
            {/* Label below */}
            <text
              x={px}
              y={py + 24}
              fontSize={11}
              fill="#3E4349"
              textAnchor="middle"
              pointerEvents="none"
              style={{ userSelect: 'none', fontStyle: 'italic' }}
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}