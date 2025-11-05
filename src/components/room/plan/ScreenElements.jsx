import React from 'react';

// This component now ONLY renders the dashed cavity box and the plane line.
// The screen bar itself is rendered in the parent (RoomVisualisation).
export default function ScreenElements({
  screenConfig,
  roomTopY,
  crossoverX,
  scale,
}) {
  const {
    mode,
    viewableWidthM,
    planeDepthM,
    showScreenPlane,
    showCavity
  } = screenConfig;

  const isFloating = mode === 'floating';
  const viewableWidthPx = (viewableWidthM || 0) * scale;
  const cavityHeight = (planeDepthM || 0) * scale;
  const cavityX = crossoverX - viewableWidthPx / 2;

  // Baffle cavity sits OUTSIDE the room (negative Y). Floating sits INSIDE.
  const cavityY = isFloating ? roomTopY : (roomTopY - cavityHeight);
  
  // The visual plane line corresponds to the front wall for baffle, and the cavity bottom for floating.
  const planeLineY = isFloating ? roomTopY + cavityHeight : roomTopY;

  return (
    <>
      {showCavity && (
        <rect
          x={cavityX}
          y={cavityY}
          width={viewableWidthPx}
          height={cavityHeight}
          fill="none"
          stroke="#999"
          strokeWidth={1}
          strokeDasharray="4,4"
          opacity={0.7}
        />
      )}
      {showScreenPlane && (
         <line
           x1={cavityX}
           x2={cavityX + viewableWidthPx}
           y1={planeLineY}
           y2={planeLineY}
           stroke="#B6AEA5"
           strokeWidth={1}
           strokeDasharray="2,3"
         />
      )}
    </>
  );
}