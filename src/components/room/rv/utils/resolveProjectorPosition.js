// resolveProjectorPosition.js
// Canonical projector position resolver — single source of truth for
// projector body geometry across Plan View, Side Elevation, and PDF Export.
//
// Returns a normalized object describing the projector body in room coordinates.
// The body is centred on the lens in all axes (X, Y, Z), matching the plan view's
// existing __lensY centring logic. Both plan view (X/Y) and side elevation (Y/Z)
// consume this same output so they can never diverge.

const DEFAULT_BODY_WIDTH_M = 0.46;
const DEFAULT_BODY_DEPTH_M = 0.517;
const DEFAULT_BODY_HEIGHT_M = 0.12;
const DEFAULT_LENS_Z_OFFSET_FROM_CEILING = 0.3;

/**
 * Resolve the canonical projector geometry from the room elements array.
 *
 * @param {Array} roomElements - Array of room element objects (doors, windows, projector, etc.)
 * @param {Object} roomDims - Room dimensions { heightM } (only heightM is needed for lensZ fallback)
 * @returns {Object|null} Resolved projector position or null if no projector element exists.
 *   - element:     The raw projector room element
 *   - lensX:       Lens X position in room metres (width axis)
 *   - lensY:       Lens Y position in room metres (depth axis) — null if not set
 *   - lensZ:       Lens Z position in room metres (height axis)
 *   - bodyWidthM:  Body width  (along X)
 *   - bodyDepthM:  Body depth  (along Y)
 *   - bodyHeightM: Body height (along Z)
 *   - bodyLeftX:   Body left edge X  (lensX - bodyWidthM/2)
 *   - bodyRightX:  Body right edge X (lensX + bodyWidthM/2)
 *   - bodyFrontY:  Body front edge Y (lensY - bodyDepthM/2) — null if lensY is null
 *   - bodyRearY:   Body rear edge Y  (lensY + bodyDepthM/2) — null if lensY is null
 *   - bodyBottomZ: Body bottom edge Z (lensZ - bodyHeightM/2)
 *   - bodyTopZ:    Body top edge Z    (lensZ + bodyHeightM/2)
 */
export function resolveProjectorPosition(roomElements, roomDims) {
  if (!Array.isArray(roomElements)) return null;
  const projectorEl = roomElements.find((el) => el?.type === "projector");
  if (!projectorEl) return null;

  const roomH = Number(roomDims?.heightM) || 2.8;

  const bodyWidthM =
    Number(projectorEl.body_width_m) ||
    Number(projectorEl.length_m) ||
    DEFAULT_BODY_WIDTH_M;
  const bodyDepthM =
    Number(projectorEl.body_depth_m) ||
    Number(projectorEl.thickness_m) ||
    DEFAULT_BODY_DEPTH_M;
  const bodyHeightM =
    Number(projectorEl.body_height_m) || DEFAULT_BODY_HEIGHT_M;

  const lensX = Number.isFinite(Number(projectorEl.x_lens_m))
    ? Number(projectorEl.x_lens_m)
    : (Number(projectorEl.pos_m) || 0) + bodyWidthM / 2;

  const lensY = Number.isFinite(Number(projectorEl.y_lens_m))
    ? Number(projectorEl.y_lens_m)
    : null;

  const lensZ = Number.isFinite(Number(projectorEl.z_lens_m))
    ? Number(projectorEl.z_lens_m)
    : roomH - DEFAULT_LENS_Z_OFFSET_FROM_CEILING;

  return {
    element: projectorEl,
    lensX,
    lensY,
    lensZ,
    bodyWidthM,
    bodyDepthM,
    bodyHeightM,
    bodyLeftX: lensX - bodyWidthM / 2,
    bodyRightX: lensX + bodyWidthM / 2,
    bodyFrontY: lensY !== null ? lensY - bodyDepthM / 2 : null,
    bodyRearY: lensY !== null ? lensY + bodyDepthM / 2 : null,
    bodyBottomZ: lensZ - bodyHeightM / 2,
    bodyTopZ: lensZ + bodyHeightM / 2,
  };
}