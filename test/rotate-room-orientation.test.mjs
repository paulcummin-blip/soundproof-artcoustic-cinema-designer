// Unit tests for the two-state Rotate Room orientation authority.
// Verifies: effective/physical dim derivation, transform round-trip
// (elements return to their original physical wall + position after a
// double rotation), and legacy-default behaviour.

import {
  ORIENTATION_LENGTH_FRONT,
  ORIENTATION_WIDTH_FRONT,
  DEFAULT_ROOM_ORIENTATION,
  normaliseOrientation,
  toggleOrientation,
  resolveEffectiveRoomDims,
  resolvePhysicalRoomDims,
  transformRoomElementsForRotation,
} from "../src/components/utils/roomOrientationAuthority.js";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error("FAIL:", msg); }
}
function eq(a, b) { return Math.abs(a - b) < 1e-9; }

// 1. Default + normalise
assert(normaliseOrientation(undefined) === DEFAULT_ROOM_ORIENTATION, "default orientation");
assert(normaliseOrientation("width_front") === ORIENTATION_WIDTH_FRONT, "normalise width_front");
assert(normaliseOrientation("garbage") === ORIENTATION_LENGTH_FRONT, "normalise garbage -> length_front");

// 2. Toggle
assert(toggleOrientation(ORIENTATION_LENGTH_FRONT) === ORIENTATION_WIDTH_FRONT, "toggle length->width");
assert(toggleOrientation(ORIENTATION_WIDTH_FRONT) === ORIENTATION_LENGTH_FRONT, "toggle width->length");

// 3. Effective / physical round-trip (length_front: identity)
const phys = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
const effLF = resolveEffectiveRoomDims(phys, ORIENTATION_LENGTH_FRONT);
assert(eq(effLF.widthM, 4.5) && eq(effLF.lengthM, 6.0) && eq(effLF.heightM, 2.4), "length_front effective = physical");
const backLF = resolvePhysicalRoomDims(effLF, ORIENTATION_LENGTH_FRONT);
assert(eq(backLF.widthM, 4.5) && eq(backLF.lengthM, 6.0), "length_front physical round-trip");

// 4. Effective / physical round-trip (width_front: W/L swapped)
const effWF = resolveEffectiveRoomDims(phys, ORIENTATION_WIDTH_FRONT);
assert(eq(effWF.widthM, 6.0) && eq(effWF.lengthM, 4.5) && eq(effWF.heightM, 2.4), "width_front effective swaps W/L");
const backWF = resolvePhysicalRoomDims(effWF, ORIENTATION_WIDTH_FRONT);
assert(eq(backWF.widthM, 4.5) && eq(backWF.lengthM, 6.0), "width_front physical round-trip restores original");

// 5. Architectural element transform: single rotation keeps element on its
//    physical wall (a door on the front wall stays on the front wall's
//    physical counterpart).
const elements = [
  { type: "door", wall: "front", pos_m: 1.0, length_m: 0.9, height_m: 2.0, elevation_m: 0 },
  { type: "window", wall: "left", pos_m: 1.5, length_m: 1.2, height_m: 1.0, elevation_m: 1.0 },
  { type: "projector", wall: "rear", pos_m: 2.0, x_m: 2.0, y_m: 0 },
];
const effDimsLF = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
const rotatedOnce = transformRoomElementsForRotation(elements, ORIENTATION_LENGTH_FRONT, ORIENTATION_WIDTH_FRONT, effDimsLF);
// Projector removed
assert(rotatedOnce.length === 2, "projector removed on rotation");
const doorAfter = rotatedOnce.find((e) => e.type === "door");
assert(doorAfter.wall === "right", "door front(N)->right under width_front (N short wall becomes right)");

// 6. Double rotation restores original wall + position exactly
const effDimsWF = { widthM: 6.0, lengthM: 4.5, heightM: 2.4 };
const rotatedBack = transformRoomElementsForRotation(rotatedOnce, ORIENTATION_WIDTH_FRONT, ORIENTATION_LENGTH_FRONT, effDimsWF);
const doorBack = rotatedBack.find((e) => e.type === "door");
assert(doorBack.wall === "front", "door returns to front after double rotation");
assert(eq(doorBack.pos_m, 1.0), "door pos_m restored exactly after double rotation");
const winBack = rotatedBack.find((e) => e.type === "window");
assert(winBack.wall === "left", "window returns to left after double rotation");
assert(eq(winBack.pos_m, 1.5), "window pos_m restored exactly after double rotation");

// 7. Repeated rotation does not drift (transform 4 times -> identity)
let cur = elements;
const seq = [ORIENTATION_WIDTH_FRONT, ORIENTATION_LENGTH_FRONT, ORIENTATION_WIDTH_FRONT, ORIENTATION_LENGTH_FRONT];
let dims = effDimsLF;
for (const o of seq) {
  cur = transformRoomElementsForRotation(cur, o === ORIENTATION_WIDTH_FRONT ? ORIENTATION_LENGTH_FRONT : ORIENTATION_WIDTH_FRONT, o, dims);
  dims = resolveEffectiveRoomDims(phys, o);
}
const doorFinal = cur.find((e) => e.type === "door");
assert(doorFinal && doorFinal.wall === "front" && eq(doorFinal.pos_m, 1.0), "no coordinate drift over 4 rotations");

console.log(`\nrotate-room-orientation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);