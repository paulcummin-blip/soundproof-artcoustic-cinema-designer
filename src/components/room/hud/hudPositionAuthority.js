/**
 * hudPositionAuthority — the ONE authoritative calculation for where the seat
 * HUD sits inside the plan canvas.
 *
 * The result is in plan-canvas pixels: the same space the HUD card's absolute
 * left/top use. The automatic seat-relative placement, the manual drag, the
 * unpin reset, a seat switch and a canvas resize all resolve through this one
 * function, so they can never disagree.
 *
 * The caller evaluates it during render, so the HUD's first visible frame is
 * already its final position — there is no placeholder coordinate and no
 * post-render correction.
 */

// Card size used for side selection and boundary clamping. The HUD is absolutely
// positioned, so this estimate only decides which side of the seat the card
// takes and keeps it inside the canvas.
export const HUD_EST_W_PX = 320;
export const HUD_EST_H_PX = 520;
export const HUD_EDGE_PAD_PX = 8;
export const HUD_SEAT_GAP_PX = 16;

// The pinned card's offset from its own position. Applied on the frame the HUD
// is pinned, so the pin state landing later cannot shift the card again.
export const HUD_PINNED_INITIAL_OFFSET_PX = { x: 24, y: 24 };

/**
 * Seat-relative HUD placement in canvas pixels.
 * Prefers the seat's right, takes its left when the card would not fit, and
 * clamps the result inside the canvas.
 */
export function computeAutomaticHudPosition({ seatX_px, seatY_px, canvasW, canvasH }) {
  const seatX = Number(seatX_px);
  const seatY = Number(seatY_px);
  if (!Number.isFinite(seatX) || !Number.isFinite(seatY)) return null;

  const w = Number(canvasW) > 0 ? Number(canvasW) : 1200;
  const h = Number(canvasH) > 0 ? Number(canvasH) : 800;

  let preferredX = seatX + HUD_SEAT_GAP_PX;
  const preferredY = seatY - HUD_EST_H_PX / 2;

  if (preferredX + HUD_EST_W_PX + HUD_EDGE_PAD_PX > w) {
    preferredX = seatX - HUD_EST_W_PX - HUD_SEAT_GAP_PX;
  }

  return {
    x: Math.min(w - HUD_EST_W_PX - HUD_EDGE_PAD_PX, Math.max(HUD_EDGE_PAD_PX, preferredX)),
    y: Math.min(h - HUD_EST_H_PX - HUD_EDGE_PAD_PX, Math.max(HUD_EDGE_PAD_PX, preferredY)),
  };
}