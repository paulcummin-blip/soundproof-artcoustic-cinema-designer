import React from 'react';

export default function ElevationDrawing({ 
  wall, 
  roomDimensions, 
  placedSpeakers = [], 
  screenSize, 
  screenWall, 
  roomOrientation,
  screenHeight = 0.5,
  aspectRatio = "16:9"
}) {
  const { length = 6, width = 4, height = 2.8 } = roomDimensions || {};
  
  const getWallConfig = () => {
    switch (wall) {
      case 'front': return { name: 'Front Wall', wallWidth: roomOrientation === 'length_front' ? width : length, wallHeight: height };
      case 'back': return { name: 'Back Wall', wallWidth: roomOrientation === 'length_front' ? width : length, wallHeight: height };
      case 'left': return { name: 'Left Wall', wallWidth: roomOrientation === 'length_front' ? length : width, wallHeight: height };
      case 'right': return { name: 'Right Wall', wallWidth: roomOrientation === 'length_front' ? length : width, wallHeight: height };
      default: return { name: 'Unknown Wall', wallWidth: width, wallHeight: height };
    }
  };

  const config = getWallConfig();
  const scale = 50; // pixels per meter
  const margin = 60;
  const drawingWidth = config.wallWidth * scale + margin * 2;
  const drawingHeight = config.wallHeight * scale + margin * 2;

  let screenWidthMeters = 0, screenHeightMeters = 0;
  if (screenSize) {
    screenWidthMeters = (screenSize * 2.54) / 100;
    screenHeightMeters = aspectRatio === '16:9' ? screenWidthMeters * (9/16) : screenWidthMeters / 2.35;
  }

  const isScreenOnThisWall = () => {
    if (roomOrientation === 'width_front') {
      return (screenWall === 'front' && wall === 'left') || (screenWall === 'back' && wall === 'right');
    }
    return (screenWall === 'front' && wall === 'front') || (screenWall === 'back' && wall === 'back');
  };

  const getWallSpeakers = () => {
    const tolerance = 0.3;
    return (placedSpeakers || []).filter(speaker => {
      const spkX = speaker.x ?? 0;
      const spkY = speaker.y ?? 0;
      switch (wall) {
        case 'front': return roomOrientation === 'length_front' ? spkY <= tolerance : spkX <= tolerance;
        case 'back': return roomOrientation === 'length_front' ? spkY >= width - tolerance : spkX >= length - tolerance;
        case 'left': return roomOrientation === 'length_front' ? spkX <= tolerance : spkY <= tolerance;
        case 'right': return roomOrientation === 'length_front' ? spkX >= length - tolerance : spkY >= width - tolerance;
        default: return false;
      }
    });
  };

  const wallSpeakers = getWallSpeakers();

  const convertTo2D = (speaker) => {
    const spkX = speaker.x ?? 0;
    const spkY = speaker.y ?? 0;
    const spkZ = speaker.z ?? 0;
    let wallX = 0;
    switch (wall) {
      case 'front': wallX = roomOrientation === 'length_front' ? spkX : spkY; break;
      case 'back': wallX = roomOrientation === 'length_front' ? length - spkX : width - spkY; break;
      case 'left': wallX = roomOrientation === 'length_front' ? spkY : spkX; break;
      case 'right': wallX = roomOrientation === 'length_front' ? width - spkY : length - spkX; break;
    }
    return { x: wallX, z: spkZ };
  };

  return (
    <div className="border border-gray-300 p-4 rounded-lg">
      <h3 className="text-lg font-bold mb-4 text-center">{config.name}</h3>
      <svg viewBox={`0 0 ${drawingWidth} ${drawingHeight}`} className="w-full h-auto">
        <rect x={margin} y={margin} width={config.wallWidth * scale} height={config.wallHeight * scale} fill="#f8f9fa" stroke="#333" strokeWidth="1" />
        <line x1={margin} y1={margin + config.wallHeight * scale} x2={margin + config.wallWidth * scale} y2={margin + config.wallHeight * scale} stroke="#333" strokeWidth="2" />
        <text x={drawingWidth / 2} y={drawingHeight - margin + 25} textAnchor="middle" fontSize="10" fill="#666">{config.wallWidth.toFixed(1)}m</text>
        <text x={margin - 25} y={drawingHeight / 2} textAnchor="middle" fontSize="10" fill="#666" transform={`rotate(-90, ${margin - 25}, ${drawingHeight/2})`}>{config.wallHeight.toFixed(1)}m</text>
        
        {isScreenOnThisWall() && screenSize && (
          <g>
            <rect x={margin + (config.wallWidth - screenWidthMeters) * scale / 2} y={margin + (height - screenHeight - screenHeightMeters) * scale} width={screenWidthMeters * scale} height={screenHeightMeters * scale} fill="#4a5568" />
            <text x={drawingWidth/2} y={margin + (height - screenHeight) * scale - 5} textAnchor="middle" fontSize="8" fill="#000">{screenSize}" Screen</text>
          </g>
        )}

        {wallSpeakers.map((speaker, index) => {
          const { x: wallX, z: wallZ } = convertTo2D(speaker);
          const cx = margin + wallX * scale;
          const cy = margin + (height - wallZ) * scale;
          return (
            <g key={index}>
              <circle cx={cx} cy={cy} r="6" fill="#c53030" />
              <text x={cx} y={cy - 10} textAnchor="middle" fontSize="8">{String(speaker.role ?? 'Spk').replace(/_/g, ' ')}</text>
            </g>
          )
        })}
      </svg>
    </div>
  );
}