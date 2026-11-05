// ---------------------------------------------------------------------------
// C41CabinetArtwork.jsx
// ---------------------------------------------------------------------------
// The shared VECTOR cabinet renderer for every confirmed C4-1 cabinet variant
// (1222, 1449, 1672, 1904 mm, plus any legacy length a saved project carries).
//
// The cabinet is drawn as exact vector geometry at the cabinet's TRUE physical
// width × 120 mm height — a rectangle with the approved driver group centred at
// a CONSTANT physical size, so the drivers never scale with the cabinet width.
// There is no raster image and no white page: the drawing is transparent line
// art, so it has no white background, no overhang, no stretching, no distortion
// and no clipping. A vertically mounted cabinet is this same drawing rotated a
// quarter turn by the caller.
//
// The catalogue's dimensions remain the authority: the cabinet width comes from
// the ONE variant resolver (resolveSoundbarCabinetLengthMm) and the 120 mm
// height from the registry; nothing here derives a physical size from the
// artwork, and nothing here touches SPL, RP22 or impedance.
// ---------------------------------------------------------------------------
import React from "react";

const STROKE = "#111111";

// Driver group — one central tweeter flanked by two woofers each side, drawn at
// a FIXED physical size (mm) so the drivers stay the same in every cabinet
// width. The cabinet body extends beyond the drivers on either side.
const DRIVER_CY = 60;        // mm — vertical centre of the driver line
const WOOFER_R1 = 28;        // mm — surround
const WOOFER_R2 = 18;        // mm — cone
const WOOFER_R3 = 6;         // mm — dust cap
const TWEETER_R1 = 16;       // mm — flange
const TWEETER_R2 = 10;       // mm — dome
const WOOFER_PITCH = 70;     // mm between adjacent woofer centres

function Woofer({ cx, cy }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={WOOFER_R1} fill="none" stroke={STROKE} strokeWidth={1.4} />
      <circle cx={cx} cy={cy} r={WOOFER_R2} fill="none" stroke={STROKE} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={WOOFER_R3} fill="none" stroke={STROKE} strokeWidth={0.9} />
    </g>
  );
}

function Tweeter({ cx, cy }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={TWEETER_R1} fill="none" stroke={STROKE} strokeWidth={1.4} />
      <circle cx={cx} cy={cy} r={TWEETER_R2} fill="none" stroke={STROKE} strokeWidth={1} />
    </g>
  );
}

/**
 * Draw the C4-1 cabinet at the caller's footprint (x/y/width/height in svg user
 * units), with its physical width in millimetres so the viewBox maps mm 1:1.
 *
 * @param {number} x            svg x position of the cabinet box
 * @param {number} y            svg y position of the cabinet box
 * @param {number} width        svg width of the cabinet box (the drawn footprint)
 * @param {number} height       svg height of the cabinet box (the drawn footprint)
 * @param {number} cabinetLengthMm  the cabinet's resolved physical length (mm)
 */
export function C41CabinetArtwork({ x, y, width, height, cabinetLengthMm }) {
  const wMm = Number.isFinite(Number(cabinetLengthMm)) && Number(cabinetLengthMm) > 0
    ? Number(cabinetLengthMm)
    : 1222;
  const cx = wMm / 2;

  // The driver group is centred and drawn at a constant physical size; the
  // cabinet body extends beyond it on either side.
  const drivers = (
    <g>
      <Woofer cx={cx - WOOFER_PITCH * 1.5} cy={DRIVER_CY} />
      <Woofer cx={cx - WOOFER_PITCH * 0.5} cy={DRIVER_CY} />
      <Tweeter cx={cx} cy={DRIVER_CY} />
      <Woofer cx={cx + WOOFER_PITCH * 0.5} cy={DRIVER_CY} />
      <Woofer cx={cx + WOOFER_PITCH * 1.5} cy={DRIVER_CY} />
    </g>
  );

  // Mounting points sit near each cabinet end, so they move with the cabinet
  // width (they are part of the cabinet, not the constant-size driver group).
  const endInset = Math.min(14, wMm * 0.04);
  const mounts = (
    <g>
      <circle cx={endInset} cy={DRIVER_CY} r={3} fill="none" stroke={STROKE} strokeWidth={0.8} />
      <circle cx={wMm - endInset} cy={DRIVER_CY} r={3} fill="none" stroke={STROKE} strokeWidth={0.8} />
    </g>
  );

  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={`0 0 ${wMm} 120`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      data-c41-vector="true"
      data-c41-cabinet-length={wMm}
    >
      {/* Cabinet outline — exact physical width × 120 mm, transparent fill. */}
      <rect
        x="1.2"
        y="1.2"
        width={wMm - 2.4}
        height={117.6}
        rx="2"
        fill="none"
        stroke={STROKE}
        strokeWidth="1.4"
      />
      {drivers}
      {mounts}
    </svg>
  );
}

export default C41CabinetArtwork;