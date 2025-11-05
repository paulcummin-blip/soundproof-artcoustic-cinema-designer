// components/room/ZoomGroup.jsx
import React from "react";

export default function ZoomGroup({ idsClip, svgW, roomRectY, zoom, children }) {
  const transform = 
    `translate(${svgW / 2}, ${roomRectY}) ` +
    `scale(${zoom}) ` +
    `translate(${-svgW / 2}, ${-roomRectY})`;

  return (
    <g clipPath={`url(#${idsClip})`} transform={transform}>
      {children}
    </g>
  );
}