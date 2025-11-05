import React, { useMemo } from 'react';
import { computeMLPAndPrimary } from '@/components/utils/computeMLPAndPrimary';

const AnglesOverlay = ({ seatingPositions, placedSpeakers }) => {
  const { mlp, seatsWithFlags } = useMemo(
    () => computeMLPAndPrimary(seatingPositions),
    [seatingPositions]
  );

  const primarySeat = seatsWithFlags.find(s => s.isPrimary);

  if (!primarySeat) return null;

  return (
    <g>
      {placedSpeakers.map((speaker) => {
        if (!speaker.position || !primarySeat) return null;

        const angleRad = Math.atan2(
          speaker.position.y - primarySeat.y,
          speaker.position.x - primarySeat.x
        );
        const angleDeg = (angleRad * 180) / Math.PI;

        const midX = (speaker.position.x + primarySeat.x) / 2;
        const midY = (speaker.position.y + primarySeat.y) / 2;

        return (
          <g key={`angle-${speaker.id}`}>
            <line
              x1={primarySeat.x}
              y1={primarySeat.y}
              x2={speaker.position.x}
              y2={speaker.position.y}
              stroke="rgba(200, 10, 10, 0.5)"
              strokeWidth="0.01"
              strokeDasharray="0.05,0.05"
            />
            <text
              x={midX}
              y={midY}
              fontSize="0.1"
              fill="rgba(200, 10, 10, 1)"
              textAnchor="middle"
            >
              {angleDeg.toFixed(1)}°
            </text>
          </g>
        );
      })}
    </g>
  );
};

export default AnglesOverlay;