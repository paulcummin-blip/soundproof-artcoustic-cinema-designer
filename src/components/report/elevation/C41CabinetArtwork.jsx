// ---------------------------------------------------------------------------
// C41CabinetArtwork.jsx
// ---------------------------------------------------------------------------
// The shared VECTOR cabinet renderer for every confirmed C4-1 cabinet variant
// (1222, 1441, 1672, 1904 mm, plus any legacy length a saved project carries).
//
// The cabinet is drawn as exact vector geometry at the cabinet's TRUE physical
// width × 120 mm height — a white-faced rectangle with the approved driver group
// centred at a CONSTANT physical size, so the drivers never scale with the
// cabinet width. The style matches the Evolve 3-1 technical drawing: black
// line art on a white cabinet face, with a clearly defined outer boundary. The
// white fill is the cabinet's OWN rectangle only, so there is no overhang, no
// page padding, no stretching, no distortion and no clipping. A vertically
// mounted cabinet is this same drawing rotated a quarter turn by the caller.
//
// The catalogue's dimensions remain the authority: the cabinet width comes from
// the ONE variant resolver (resolveSoundbarCabinetLengthMm) and the 120 mm
// height from the registry; nothing here derives a physical size from the
// artwork, and nothing here touches SPL, RP22 or impedance.
// ---------------------------------------------------------------------------
import React from "react";

// Technical line-art palette — black ink on a white cabinet face, matching the
// Evolve 3-1 drawing style. The cabinet face is filled white so the dark line
// art reads with the same contrast as the Evolve artwork; the white fill is the
// cabinet's OWN rectangle only (no overhang, no page padding).
const INK = "#1a1a1a";
const FACE = "#ffffff";

// Driver group — one central tweeter flanked by two woofers each side, drawn at
// a FIXED physical size (mm) so the drivers stay the same in every cabinet
// width. The cabinet body extends beyond the drivers on either side. These
// dimensions are NOT changed by the styling work.
const DRIVER_CY = 60;        // mm — vertical centre of the driver line
const WOOFER_R1 = 28;        // mm — surround
const WOOFER_R2 = 18;        // mm — cone
const WOOFER_R3 = 6;         // mm — dust cap
const TWEETER_R1 = 16;       // mm — flange
const TWEETER_R2 = 10;       // mm — dome
const WOOFER_PITCH = 70;     // mm between adjacent woofer centres

function Woofer({ cx, cy }) {
  // Concentric rings on a white face — the same line-art treatment as the Evolve
  // drivers. Each ring is white-filled so it reads as a clear circle against the
  // white cabinet, with a dark outline at a consistent weight.
  const screwR = 2.4;
  const screwOffset = WOOFER_R1 - 5;
  return (
    <g>
      {/* Surround ring */}
      <circle cx={cx} cy={cy} r={WOOFER_R1} fill={FACE} stroke={INK} strokeWidth={1.4} />
      {/* Cone ring */}
      <circle cx={cx} cy={cy} r={WOOFER_R2} fill={FACE} stroke={INK} strokeWidth={1} />
      {/* Dust cap */}
      <circle cx={cx} cy={cy} r={WOOFER_R3} fill={FACE} stroke={INK} strokeWidth={0.9} />
      {/* Four fixing screws at the surround corners — a genuine cabinet detail */}
      <circle cx={cx - screwOffset} cy={cy - screwOffset} r={screwR} fill={FACE} stroke={INK} strokeWidth={0.7} />
      <circle cx={cx + screwOffset} cy={cy - screwOffset} r={screwR} fill={FACE} stroke={INK} strokeWidth={0.7} />
      <circle cx={cx - screwOffset} cy={cy + screwOffset} r={screwR} fill={FACE} stroke={INK} strokeWidth={0.7} />
      <circle cx={cx + screwOffset} cy={cy + screwOffset} r={screwR} fill={FACE} stroke={INK} strokeWidth={0.7} />
    </g>
  );
}

function Tweeter({ cx, cy }) {
  return (
    <g>
      {/* Flange */}
      <circle cx={cx} cy={cy} r={TWEETER_R1} fill={FACE} stroke={INK} strokeWidth={1.4} />
      {/* Dome */}
      <circle cx={cx} cy={cy} r={TWEETER_R2} fill={FACE} stroke={INK} strokeWidth={1} />
      {/* Centre point */}
      <circle cx={cx} cy={cy} r={1.6} fill={INK} stroke="none" />
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
      <circle cx={endInset} cy={DRIVER_CY} r={3} fill={FACE} stroke={INK} strokeWidth={0.9} />
      <circle cx={wMm - endInset} cy={DRIVER_CY} r={3} fill={FACE} stroke={INK} strokeWidth={0.9} />
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
      {/* Cabinet face — white, exact physical width × 120 mm. The white fill is
          the cabinet's OWN rectangle, so there is no overhang or page padding. */}
      <rect
        x="1.2"
        y="1.2"
        width={wMm - 2.4}
        height={117.6}
        rx="3"
        fill={FACE}
        stroke={INK}
        strokeWidth="1.6"
      />
      {/* Inner grill frame — a second inset outline, the same technical-drawing
          detail the Evolve cabinets carry. */}
      <rect
        x="6"
        y="6"
        width={wMm - 12}
        height={108}
        rx="2"
        fill="none"
        stroke={INK}
        strokeWidth="0.8"
      />
      {drivers}
      {mounts}
    </svg>
  );
}

export default C41CabinetArtwork;