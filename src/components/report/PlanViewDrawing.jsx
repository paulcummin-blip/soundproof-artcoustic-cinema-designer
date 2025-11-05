import React from 'react';

export default function PlanViewDrawing({
  roomDimensions,
  seatingPositions = [],
  placedSpeakers = [],
  screenSize,
  screenWall,
  roomOrientation
}) {
  const { length = 6, width = 4 } = roomDimensions || {};
  const scale = 60;
  const margin = 40;
  const drawingWidth = length * scale + margin * 2;
  const drawingHeight = width * scale + margin * 2;

  let screenWidthMeters = 0;
  if (screenSize) {
    screenWidthMeters = (screenSize * 2.54) / 100;
  }

  return (
    <div className="border border-gray-300 p-4 rounded-lg">
      <svg viewBox={`0 0 ${drawingWidth} ${drawingHeight}`} className="w-full h-auto">
        {/* Room Outline */}
        <rect x={margin} y={margin} width={length * scale} height={width * scale} fill="#f7fafc" stroke="#333" strokeWidth="1" />
        {/* Dimensions */}
        <text x={drawingWidth / 2} y={margin - 10} textAnchor="middle" fontSize="10">{length}m</text>
        <text x={margin - 10} y={drawingHeight / 2} textAnchor="middle" fontSize="10" transform={`rotate(-90, ${margin - 10}, ${drawingHeight / 2})`}>{width}m</text>
        
        {/* Screen */}
        {screenSize && (() => {
          let sx, sy, sw, sh;
          if (roomOrientation === 'length_front') {
            sx = margin + (length - screenWidthMeters) * scale / 2;
            sy = screenWall === 'front' ? margin : margin + width * scale - 4;
            sw = screenWidthMeters * scale;
            sh = 4;
          } else {
            sx = screenWall === 'front' ? margin : margin + length * scale - 4;
            sy = margin + (width - screenWidthMeters) * scale / 2;
            sw = 4;
            sh = screenWidthMeters * scale;
          }
          return <rect x={sx} y={sy} width={sw} height={sh} fill="#4a5568" />;
        })()}

        {/* Seating */}
        {(seatingPositions || []).map((seat, index) => {
          const cx = margin + (seat.x ?? 0) * scale;
          const cy = margin + (seat.y ?? 0) * scale;
          return <rect key={`seat-${index}`} x={cx - 8} y={cy - 8} width="16" height="16" fill="#4299e1" />;
        })}

        {/* Speakers */}
        {(placedSpeakers || []).map((speaker, index) => {
          const cx = margin + (speaker.x ?? 0) * scale;
          const cy = margin + (speaker.y ?? 0) * scale;
          return <circle key={`spk-${index}`} cx={cx} cy={cy} r="6" fill="#c53030" />;
        })}
      </svg>
    </div>
  );
}