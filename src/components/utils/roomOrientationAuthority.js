// roomOrientationAuthority.js
//
// Two-state room orientation authority for Sound Proof.
//
// The physical room dimensions live on the shared Project entity. The effective
// orientation (which physical wall pair is the screen wall) belongs to each
// ProjectVersion. This module is the single source of truth for deriving the
// effective Width/Length from the physical room + orientation, and for the
// reversible 90-degree coordinate transform that keeps architectural elements
// attached to their original physical walls when the orientation toggles.
//
// Two states only:
//   "length_front" — screen on a physical SHORT wall (default). Effective
//                     width = physical width, effective length = physical length.
//   "width_front"  — screen on a physical LONG wall. Effective width and
//                     length are swapped.
//
// The screen wall is always drawn at the top of Plan View in both states.

export const ORIENTATION_LENGTH_FRONT = "length_front";
export const ORIENTATION_WIDTH_FRONT = "width_front";

export const DEFAULT_ROOM_ORIENTATION = ORIENTATION_LENGTH_FRONT;

export function normaliseOrientation(value) {
  return value === ORIENTATION_WIDTH_FRONT ? ORIENTATION_WIDTH_FRONT : ORIENTATION_LENGTH_FRONT;
}

export function isWidthFront(orientation) {
  return normaliseOrientation(orientation) === ORIENTATION_WIDTH_FRONT;
}

export function toggleOrientation(orientation) {
  return isWidthFront(orientation) ? ORIENTATION_LENGTH_FRONT : ORIENTATION_WIDTH_FRONT;
}

/**
 * Derive the effective (view) room dimensions from the physical room + orientation.
 * Effective width is the span of the screen wall; effective length is the other axis.
 */
export function resolveEffectiveRoomDims(physicalDims, orientation) {
  const physW = Number(physicalDims?.widthM ?? physicalDims?.width) || 0;
  const physL = Number(physicalDims?.lengthM ?? physicalDims?.length) || 0;
  const physH = Number(physicalDims?.heightM ?? physicalDims?.height) || 0;
  if (isWidthFront(orientation)) {
    return { widthM: physL, lengthM: physW, heightM: physH };
  }
  return { widthM: physW, lengthM: physL, heightM: physH };
}

/**
 * Derive the physical room dimensions from the effective (view) dimensions +
 * orientation. Inverse of resolveEffectiveRoomDims.
 */
export function resolvePhysicalRoomDims(effectiveDims, orientation) {
  const effW = Number(effectiveDims?.widthM ?? effectiveDims?.width) || 0;
  const effL = Number(effectiveDims?.lengthM ?? effectiveDims?.length) || 0;
  const effH = Number(effectiveDims?.heightM ?? effectiveDims?.height) || 0;
  if (isWidthFront(orientation)) {
    return { widthM: effL, lengthM: effW, heightM: effH };
  }
  return { widthM: effW, lengthM: effL, heightM: effH };
}

// ── Architectural element coordinate transform ────────────────────────────
//
// Physical walls are labelled by fixed compass identity (N/S = short walls,
// E/W = long walls) so an element's physical wall never changes with the view
// orientation. Each element is converted to its canonical physical identity
// (physWall + physPos) and then re-projected into the target orientation, so a
// toggle back restores the original wall and position exactly — no repeated
// rounding of already-transformed coordinates.

const WALL_TO_PHYS_LENGTH_FRONT = {
  front: "N", rear: "S", left: "W", right: "E",
};
const WALL_TO_PHYS_WIDTH_FRONT = {
  front: "W", rear: "E", left: "S", right: "N",
};
const PHYS_TO_WALL_LENGTH_FRONT = {
  N: "front", S: "rear", W: "left", E: "right",
};
const PHYS_TO_WALL_WIDTH_FRONT = {
  W: "front", E: "rear", S: "left", N: "right",
};

function normaliseWallValue(w) {
  const v = String(w || "").toLowerCase();
  if (v === "back") return "rear";
  if (v === "front" || v === "rear" || v === "left" || v === "right") return v;
  return "rear";
}

function readPosM(element, wall) {
  if (Number.isFinite(Number(element?.pos_m))) return Number(element.pos_m);
  if (wall === "front" || wall === "rear") {
    if (Number.isFinite(Number(element?.x_m))) return Number(element.x_m);
  } else {
    if (Number.isFinite(Number(element?.y_m))) return Number(element.y_m);
  }
  return 0;
}

// Convert a view element to its canonical physical identity.
function toCanonical(element, orientation, physL) {
  const wall = normaliseWallValue(element?.wall);
  const posM = readPosM(element, wall);
  const lengthM = Number(element?.length_m) || 0;
  const map = isWidthFront(orientation) ? WALL_TO_PHYS_WIDTH_FRONT : WALL_TO_PHYS_LENGTH_FRONT;
  const physWall = map[wall];
  let physPos;
  if (isWidthFront(orientation)) {
    // In width_front, front/rear walls are the LONG walls (W/E). Their pos_m is
    // measured from the left corner (S), so the physical position measured from
    // the N reference corner is physL - posM - lengthM.
    if (wall === "front" || wall === "rear") {
      physPos = physL - posM - lengthM;
    } else {
      physPos = posM;
    }
  } else {
    physPos = posM;
  }
  return { physWall, physPos, lengthM };
}

// Project a canonical physical identity back into a view orientation.
function fromCanonical(canonical, orientation, physL) {
  const { physWall, physPos, lengthM } = canonical;
  const map = isWidthFront(orientation) ? PHYS_TO_WALL_WIDTH_FRONT : PHYS_TO_WALL_LENGTH_FRONT;
  const wall = map[physWall];
  let posM;
  if (isWidthFront(orientation)) {
    if (wall === "front" || wall === "rear") {
      posM = physL - physPos - lengthM;
    } else {
      posM = physPos;
    }
  } else {
    posM = physPos;
  }
  return { wall, posM };
}

/**
 * Transform an array of room elements from one orientation to another.
 * Projectors are removed (they are design-specific and cleared on rotation);
 * all other architectural elements (doors, windows, openings, etc.) keep their
 * physical wall and position. Vertical properties (height, elevation, depth)
 * and length_m are preserved unchanged.
 *
 * @param {Array} elements       Current view elements (current orientation).
 * @param {string} fromOrientation  Current orientation.
 * @param {string} toOrientation    Target orientation.
 * @param {object} effectiveDims     Effective room dims in the CURRENT orientation.
 * @returns {Array} Transformed elements for the target orientation.
 */
export function transformRoomElementsForRotation(elements, fromOrientation, toOrientation, effectiveDims) {
  if (!Array.isArray(elements)) return [];
  const physDims = resolvePhysicalRoomDims(effectiveDims, fromOrientation);
  const physL = Number(physDims.lengthM) || 0;

  return elements
    .filter((el) => el && el.type !== "projector")
    .map((el) => {
      const canonical = toCanonical(el, fromOrientation, physL);
      const projected = fromCanonical(canonical, toOrientation, physL);
      const next = { ...el, wall: projected.wall, pos_m: projected.posM };
      // Keep legacy x_m / y_m fallback fields consistent with the new wall.
      const w = projected.wall;
      if (w === "front" || w === "rear") {
        next.x_m = projected.posM;
      } else {
        next.y_m = projected.posM;
      }
      return next;
    });
}