"use client";

import React from "react";
import { rvZoomTransform } from "@/components/room/rv/utils/rvPointerToRoom";

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
      data-rv-zoom-group="true"
      transform={rvZoomTransform({ panX, panY, viewOffsetPx, zoom })}
    >
      {/* Background hit area for pan (must be FIRST child, behind everything).
          Dragging it repositions the whole drawing. It is the pan surface at
          every zoom level — the fitted view pans too — and because it stays
          behind every interactive object, grabbing a seat, speaker, subwoofer or
          room element moves that object instead. */}
      {Number.isFinite(roomRect?.x) && Number.isFinite(roomRect?.y) && (
        <rect
          x={(roomRect?.x ?? 0) - 1000}
          y={(roomRect?.y ?? 0) - 1000}
          width={(roomRect?.width ?? 0) + 2000}
          height={(roomRect?.height ?? 0) + 2000}
          fill="transparent"
          pointerEvents="auto"
          style={{ cursor: isPanning ? "grabbing" : "grab" }}
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