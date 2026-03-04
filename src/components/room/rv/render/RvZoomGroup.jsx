"use client";

import React from "react";

export default function RvZoomGroup(props) {
  const {
    idsClip,
    panX,
    panY,
    viewOffsetPx,
    zoom,
    roomRect,
    isPanning,
    onPanPointerDown,
    onPanPointerMove,
    onPanPointerUp,
    children,
  } = props;

  return (
    <g
      clipPath={`url(#${idsClip})`}
      transform={`translate(${panX + viewOffsetPx.x}, ${panY + viewOffsetPx.y}) scale(${zoom})`}
    >
      {/* Background hit area for pan (must be FIRST child, behind everything) */}
      {Number.isFinite(roomRect?.x) && Number.isFinite(roomRect?.y) && (
        <rect
          x={(roomRect?.x ?? 0) - 1000}
          y={(roomRect?.y ?? 0) - 1000}
          width={(roomRect?.width ?? 0) + 2000}
          height={(roomRect?.height ?? 0) + 2000}
          fill="transparent"
          pointerEvents={zoom > 1 ? "auto" : "none"}
          style={{
            cursor: zoom > 1 ? (isPanning ? "grabbing" : "grab") : "default"
          }}
          onPointerDown={onPanPointerDown}
          onPointerMove={onPanPointerMove}
          onPointerUp={onPanPointerUp}
          onPointerCancel={onPanPointerUp}
        />
      )}
      {children}
    </g>
  );
}