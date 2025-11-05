// components/ui/ZoomButtons.jsx
import React from "react";

export default function ZoomButtons({ 
  onZoomIn, 
  onZoomOut, 
  style, 
  containerProps 
}) {
  const defaultStyle = {
    position: 'absolute',
    top: 24,
    left: 24,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  };

  const buttonStyle = {
    width: 32,
    height: 32,
    background: '#fff',
    border: '1px solid #DCDBD6',
    borderRadius: 6,
    color: '#1B1A1A',
    cursor: 'pointer'
  };

  return (
    <div
      style={{ ...defaultStyle, ...style }}
      {...containerProps}
    >
      <button
        onClick={onZoomIn}
        style={buttonStyle}
        aria-label="Zoom in"
      >
        +
      </button>

      <button
        onClick={onZoomOut}
        style={buttonStyle}
        aria-label="Zoom out"
      >
        −
      </button>
    </div>
  );
}