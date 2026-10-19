import React from "react";

/**
 * FrontScreenLayer — the screen as it is drawn in the front elevation.
 *
 * Extracted from FrontElevation so the drawing file stays a manageable size.
 * It is a pure renderer: every value it needs arrives as a prop, and it holds no
 * state of its own. It draws in two layers:
 *
 *   SURFACE — the viewable area, drawn after the loudspeaker and subwoofer
 *             layers, so it sits in front of the cabinets without hiding them.
 *             An acoustically transparent screen is a barely-there translucent
 *             wash, so the LCR speakers and subwoofers behind it stay clearly
 *             visible; a TV keeps an opaque picture surface, so nothing is drawn
 *             through it. Pointer events pass through the wash, so a cabinet
 *             behind the screen is still hoverable and draggable.
 *   FRAME   — the border, drawn last as an opaque band, so the frame sits in
 *             front of every cabinet and no graphic breaks through the screen
 *             perimeter. It is also the screen's own drag surface.
 *
 * This is the screen as a DRAWING. The screen's dimensions, position, and every
 * acoustic property remain the stored project's own.
 */
export default function FrontScreenLayer({
  overallW,
  overallH,
  screenData,
  borderM,
  screenCenterX,
  screenFloorM,
  roomW,
  roomH,
  drawW,
  drawH,
  offsetX,
  offsetY,
  rx,
  ry,
  isTV,
  surfaceFill,
  frameColor,
  dragging,
  dragEnabled,
  onMouseDown,
}) {
  // Overall frame rect (viewable + border on all sides)
  const oW = (overallW / roomW) * drawW;
  const oH = (overallH / roomH) * drawH;
  const ox = rx(screenCenterX) - oW / 2;
  const oy = ry(screenFloorM + screenData.h + borderM);

  // Viewable rect
  const sw = (screenData.w / roomW) * drawW;
  const sh = (screenData.h / roomH) * drawH;
  const sx = rx(screenCenterX) - sw / 2;
  const syTop = ry(screenFloorM + screenData.h);

  return (
    <g
      onMouseDown={dragEnabled ? onMouseDown : undefined}
      style={dragEnabled
        ? { cursor: dragging ? 'grabbing' : 'ns-resize', userSelect: 'none' }
        : undefined}
    >
      {/* Drag affordance: the frame is outlined while the screen is being
          dragged, so the control is visible while it is used. */}
      {dragging && (
        <rect x={ox - 3} y={oy - 3} width={oW + 6} height={oH + 6}
          fill="none" stroke="#213428" strokeWidth={1.6} strokeDasharray="5 3" rx={3} />
      )}
      {/* Viewable surface — middle layer. Translucent for an acoustically
          transparent screen, so the LCR and subwoofers behind it read
          through; pointer events pass through to the cabinets, so a
          speaker behind the screen can still be hovered or dragged. */}
      <rect
        x={sx}
        y={syTop}
        width={sw}
        height={sh}
        fill={isTV ? "#fff" : surfaceFill}
        stroke="#555"
        strokeWidth={0.5}
        style={isTV ? undefined : { pointerEvents: 'none' }}
      />
      {/* Frame / border — front layer. An opaque band (the overall rect
          with the viewable area knocked out, even-odd fill) drawn last,
          so it is the last thing on the front wall and covers any
          cabinet graphic beneath it. It is also the screen drag surface. */}
      <path
        d={`M ${ox} ${oy} H ${ox + oW} V ${oy + oH} H ${ox} Z M ${sx} ${syTop} H ${sx + sw} V ${syTop + sh} H ${sx} Z`}
        fill={frameColor}
        fillRule="evenodd"
        stroke={frameColor}
        strokeWidth={dragging ? 1.6 : 1}
      />
      {/* The screen's own size is stated in the Screen Size panel's live
          metrics, so the drawing carries no overall or viewable
          dimension text. The outline, frame and drag surface above are
          unchanged. */}
      {/* Live height during the drag — the same value the numeric input
          shows, in centimetres, kept inside the room rectangle. */}
      {dragging && (() => {
        const badgeY = Math.min(Math.max(oy - 20, offsetY + 3), offsetY + drawH - 20);
        return (
          <g key="screen-drag-value" style={{ pointerEvents: 'none' }}>
            <rect x={rx(screenCenterX) - 49} y={badgeY} width={98} height={15} fill="#213428" rx={2} />
            <text x={rx(screenCenterX)} y={badgeY + 11} textAnchor="middle" fontSize={8} fill="white" fontWeight={700} letterSpacing="0.04em">
              {`Screen height ${Math.round(screenFloorM * 100)} cm`}
            </text>
          </g>
        );
      })()}
    </g>
  );
}