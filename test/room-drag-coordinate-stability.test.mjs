// room-drag-coordinate-stability.test.mjs
// ---------------------------------------------------------------------------
// Regression suite for the room-plan drag coordinate pipeline.
//
// Confirmed audit findings reproduced here:
//   1. projector: ~1 px drag produced ~21.5 px of object movement
//   2. sub:       ~1 px drag produced ~32.7 px of object movement
//      Both are the pointer-to-object offset being applied twice.
//   3. screen -> room conversion used the ROOT svg CTM, so pan/view-offset/zoom
//      were left un-undone and positions drifted away from the hitbox.
//
// Geometry fixtures match the reproduction project: a 4.5 m x 6 m room at
// 100 px per metre, so 1 px == 0.01 m and the audit's 21.5 px / 32.7 px jumps
// are exactly 0.215 m and 0.327 m of grab offset.
// ---------------------------------------------------------------------------

import { describe, test, expect } from "vitest";
import fs from "node:fs";

import {
  RV_ZOOM_GROUP_SELECTOR,
  rvZoomTransform,
  clientToRoom,
  localPointToRoom,
  canvasPointToRoom,
  captureDragOffsetRoom,
  computeDragTargetRoom,
} from "../src/components/room/rv/utils/rvPointerToRoom.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

const SCALE = 100;                                  // px per metre
const ROOM_RECT = { x: 100, y: 50, width: 4.5 * SCALE, height: 6 * SCALE };
const VIEW_OFFSET = { x: 0, y: 0 };

const AUDIT_PROJECTOR_OFFSET_M = 0.215;             // 21.5 px at 100 px/m
const AUDIT_SUB_OFFSET_M = 0.327;                   // 32.7 px at 100 px/m

/** The exact inverse of the RvZoomGroup transform, as a fake DOMMatrix. */
function zoomGroupCtmInverse({ panX = 0, panY = 0, viewOffsetPx = VIEW_OFFSET, zoom = 1 }) {
  return {
    _apply: ({ x, y }) => ({
      x: (x - (panX + viewOffsetPx.x)) / zoom,
      y: (y - (panY + viewOffsetPx.y)) / zoom,
    }),
  };
}

/** Root svg CTM: identity, so it leaves the zoom transform un-undone (the bug). */
const ROOT_CTM_INVERSE = { _apply: ({ x, y }) => ({ x, y }) };

function makeSvg({ zoomGroup = null } = {}) {
  return {
    createSVGPoint: () => ({
      x: 0,
      y: 0,
      matrixTransform(matrix) { return matrix._apply({ x: this.x, y: this.y }); },
    }),
    getScreenCTM: () => ({ inverse: () => ROOT_CTM_INVERSE }),
    querySelector: (selector) => (selector === RV_ZOOM_GROUP_SELECTOR ? zoomGroup : null),
  };
}

function makeSvgWithZoomGroup(view = {}) {
  const zoomGroup = { getScreenCTM: () => ({ inverse: () => zoomGroupCtmInverse(view) }) };
  return makeSvg({ zoomGroup });
}

/** The render path: room metres -> local px (as toPx does) -> screen px. */
function roomToScreen({ x_m, y_m, panX = 0, panY = 0, viewOffsetPx = VIEW_OFFSET, zoom = 1 }) {
  const localX = ROOM_RECT.x + x_m * SCALE;
  const localY = ROOM_RECT.y + y_m * SCALE;
  return {
    clientX: panX + viewOffsetPx.x + localX * zoom,
    clientY: panY + viewOffsetPx.y + localY * zoom,
  };
}

function toRoom({ clientX, clientY, view }) {
  return clientToRoom({
    svgElement: makeSvgWithZoomGroup(view),
    clientX,
    clientY,
    roomRect: ROOM_RECT,
    scale: SCALE,
    viewOffsetPx: VIEW_OFFSET,
  });
}

const VIEWS = [
  { label: "default", panX: 0, panY: 0, zoom: 1 },
  { label: "100% panned", panX: -140, panY: 60, zoom: 1 },
  { label: "125%", panX: 35, panY: -25, zoom: 1.25 },
  { label: "150% pan/offset", panX: -80, panY: 110, zoom: 1.5 },
];

// ── 1, 3, 4: the pointer conversion ─────────────────────────────────────────

describe("canonical pointer conversion", () => {
  test("1 visual centre and hitbox centre share one room point through zoom and pan", () => {
    for (const view of VIEWS) {
      const pointRoom = { x_m: 2.0, y_m: 3.0 };
      const screen = roomToScreen({ ...pointRoom, ...view });
      const back = toRoom({ ...screen, view });
      expect(back.x).toBeCloseTo(pointRoom.x_m, 9);
      expect(back.y).toBeCloseTo(pointRoom.y_m, 9);
    }
  });

  test("4 one pixel converts to the correct room-metre delta at 100%, 125% and 150%", () => {
    for (const view of VIEWS) {
      const start = roomToScreen({ x_m: 2.0, y_m: 3.0, ...view });
      const onePixelRight = { clientX: start.clientX + 1, clientY: start.clientY + 1 };
      const from = toRoom({ ...start, view });
      const to = toRoom({ ...onePixelRight, view });
      expect(to.x - from.x).toBeCloseTo(1 / view.zoom / SCALE, 9);
      expect(to.y - from.y).toBeCloseTo(1 / view.zoom / SCALE, 9);
    }
  });

  test("the root-svg basis is what caused the zoom drift (audit finding 3)", () => {
    const view = { panX: -140, panY: 60, zoom: 1.25 };
    const screen = roomToScreen({ x_m: 2.0, y_m: 3.0, ...view });
    const local = zoomGroupCtmInverse(view)._apply({ x: screen.clientX, y: screen.clientY });
    const canonical = localPointToRoom({ point: local, roomRect: ROOM_RECT, scale: SCALE });
    const legacyRootBasis = canvasPointToRoom({
      point: { x: screen.clientX, y: screen.clientY },
      roomRect: ROOM_RECT,
      scale: SCALE,
      viewOffsetPx: VIEW_OFFSET,
    });
    expect(canonical.x).toBeCloseTo(2.0, 9);
    // The legacy basis reports a different room point once pan/zoom are applied
    // (0.65 m of drift here), which is why the hitbox and the visual separated.
    expect(Math.abs(legacyRootBasis.x - canonical.x)).toBeCloseTo(0.65, 6);
    // At the default view the two agree, which is why the fault only showed on interaction.
    const atRest = roomToScreen({ x_m: 2.0, y_m: 3.0 });
    expect(canvasPointToRoom({
      point: { x: atRest.clientX, y: atRest.clientY },
      roomRect: ROOM_RECT,
      scale: SCALE,
      viewOffsetPx: VIEW_OFFSET,
    }).x).toBeCloseTo(2.0, 9);
  });

  test("the converter fails closed without geometry rather than inventing a point", () => {
    const svg = makeSvg();
    expect(clientToRoom({ svgElement: svg, clientX: 10, clientY: 10, roomRect: null, scale: SCALE, viewOffsetPx: VIEW_OFFSET })).toBeNull();
    expect(clientToRoom({ svgElement: svg, clientX: 10, clientY: 10, roomRect: ROOM_RECT, scale: 0, viewOffsetPx: VIEW_OFFSET })).toBeNull();
    expect(clientToRoom({ svgElement: null, clientX: 10, clientY: 10, roomRect: ROOM_RECT, scale: SCALE, viewOffsetPx: VIEW_OFFSET })).toBeNull();
  });

  test("the zoom transform is expressed once and shared with the guide groups", () => {
    expect(rvZoomTransform({ panX: 10, panY: -4, viewOffsetPx: { x: 2, y: 3 }, zoom: 1.25 }))
      .toBe("translate(12, -1) scale(1.25)");
    const zoomGroupSource = fs.readFileSync(new URL("../src/components/room/rv/render/RvZoomGroup.jsx", import.meta.url), "utf8");
    const canvasSource = fs.readFileSync(new URL("../src/components/room/rv/render/RvPlanCanvas.jsx", import.meta.url), "utf8");
    expect(zoomGroupSource).toMatch(/data-rv-zoom-group/);
    expect(zoomGroupSource).toMatch(/rvZoomTransform\(/);
    // 11: the drag guides are wrapped in the same transform, so they stay attached.
    expect(canvasSource).toMatch(/rvGuideTransform|rvZoomTransform\(/);
  });
});

// ── 2, 3: the offset is captured once and applied once ──────────────────────

describe("pointer-to-object offset", () => {
  const grabbedObject = { x: 2.4, y: 4.1 };
  const startPointer = { x: 2.4 - AUDIT_PROJECTOR_OFFSET_M, y: 4.1 - AUDIT_PROJECTOR_OFFSET_M };
  const offset = captureDragOffsetRoom({ pointerRoom: startPointer, objectRoom: grabbedObject });

  test("2 pointer down with zero movement changes nothing", () => {
    const target = computeDragTargetRoom({ pointerRoom: startPointer, dragOffsetRoom: offset });
    expect(target.x).toBeCloseTo(grabbedObject.x, 12);
    expect(target.y).toBeCloseTo(grabbedObject.y, 12);
  });

  test("3 an off-centre grab plus a 1 px move does not jump to the object centre", () => {
    const onePixel = { x: startPointer.x + AUDIT_PROJECTOR_OFFSET_M, y: startPointer.y };
    const target = computeDragTargetRoom({ pointerRoom: onePixel, dragOffsetRoom: offset });
    // The object moved by the pointer delta only - it did not snap to the centre.
    expect(target.x - grabbedObject.x).toBeCloseTo(AUDIT_PROJECTOR_OFFSET_M, 12);
    expect(target.x).not.toBeCloseTo(grabbedObject.x, 12);

    // The double application produced the audited 21.5 px (projector) jump.
    const doubleApplied = computeDragTargetRoom({
      pointerRoom: onePixel,
      dragOffsetRoom: { x: offset.x * 2, y: offset.y * 2 },
    });
    const jumpPx = Math.abs(doubleApplied.x - target.x) * SCALE;
    expect(jumpPx).toBeCloseTo(21.5, 6);          // audit finding 1
    expect(AUDIT_PROJECTOR_OFFSET_M * SCALE).toBeCloseTo(21.5, 6);
  });

  test("the sub offset reproduces the audited 32.7 px jump", () => {
    const sub = { x: 1.1, y: 0.32 };
    const pointer = { x: sub.x - AUDIT_SUB_OFFSET_M, y: sub.y };
    const offset = captureDragOffsetRoom({ pointerRoom: pointer, objectRoom: sub });
    const once = computeDragTargetRoom({ pointerRoom: pointer, dragOffsetRoom: offset });
    const twice = computeDragTargetRoom({ pointerRoom: pointer, dragOffsetRoom: { x: offset.x * 2, y: offset.y * 2 } });
    expect(once.x).toBeCloseTo(sub.x, 12);
    expect(Math.abs(twice.x - once.x) * SCALE).toBeCloseTo(32.7, 6);   // audit finding 2
  });

  test("5 the object handlers no longer convert back or re-apply the offset", () => {
    const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
    const moveHandler = read("src/components/room/rv/hooks/useRoomCanvasMouseMove.jsx");
    const subHandler = read("src/components/room/rv/hooks/useSubDragHandler.jsx");
    const visualisation = read("src/components/room/RoomVisualisation.jsx");
    const mouseDown = read("src/components/room/rv/hooks/useMouseDownHandler.jsx");

    // One conversion, one offset application, room coordinates passed through.
    expect(moveHandler).toMatch(/clientToRoom\(/);
    expect(moveHandler).toMatch(/computeDragTargetRoom\(/);
    expect(moveHandler).toMatch(/handleSubDrag\(draggedItemId, targetRoomPos\)/);
    expect(moveHandler).toMatch(/handleProjectorDrag\?\.\(draggedItemId, targetRoomPos\)/);
    expect(moveHandler).toMatch(/handleRoomElementDrag\?\.\(draggedItemId, targetRoomPos\)/);

    // The duplicate applications are gone.
    expect(subHandler).not.toMatch(/canvasToRoom\(newCanvasPos\)/);
    expect(subHandler).not.toMatch(/dragOffsetRoomRef\.current/);
    const projectorBody = visualisation.slice(
      visualisation.indexOf("const handleProjectorDrag = useCallback"),
      visualisation.indexOf("const visiblePlanSpeakers"),
    );
    expect(projectorBody).not.toMatch(/canvasToRoom\(canvasPos\)/);
    expect(projectorBody).not.toMatch(/dragOffsetRoomRef\.current/);
    const openingBody = visualisation.slice(
      visualisation.indexOf("const handleRoomElementDrag = useCallback"),
      visualisation.indexOf("const handleProjectorDrag = useCallback"),
    );
    expect(openingBody).not.toMatch(/canvasToRoom\(canvasPos\)/);
    expect(openingBody).not.toMatch(/dragOffsetRoomRef\.current/);

    // Drag start uses the same canonical converter.
    expect(mouseDown).toMatch(/clientToRoom\(/);
    expect(mouseDown).not.toMatch(/svgElement\.getScreenCTM\(\)/);
  });

  test("6 the drag guides derive from the same canonical room point", () => {
    const visualisation = fs.readFileSync(new URL("../src/components/room/RoomVisualisation.jsx", import.meta.url), "utf8");
    const projectorBody = visualisation.slice(
      visualisation.indexOf("const handleProjectorDrag = useCallback"),
      visualisation.indexOf("const visiblePlanSpeakers"),
    );
    // Guides are built from the clamped canonical Y, not from a canvas offset.
    expect(projectorBody).toMatch(/const rawY = roomPos\.y/);
    expect(projectorBody).toMatch(/setProjectorDragInfo\(\{/);
    const openingBody = visualisation.slice(
      visualisation.indexOf("const handleRoomElementDrag = useCallback"),
      visualisation.indexOf("const handleProjectorDrag = useCallback"),
    );
    expect(openingBody).toMatch(/roomPos\.x/);
    expect(openingBody).toMatch(/roomPos\.y/);
  });
});

// ── 5, 7, 8, 9, 11, 12: behaviour that must be preserved ────────────────────

describe("preserved behaviour", () => {
  const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

  test("5 projector drag keeps capture and gains cancel handling", () => {
    const mouseDown = read("src/components/room/rv/hooks/useMouseDownHandler.jsx");
    const projectorBranch = mouseDown.slice(
      mouseDown.indexOf("if (type === 'projector')"),
      mouseDown.indexOf("// Room element drag"),
    );
    expect(projectorBranch).toMatch(/setPointerCapture/);
    const visualisation = read("src/components/room/RoomVisualisation.jsx");
    expect(visualisation).toMatch(/addEventListener\('pointercancel'/);
  });

  test("7, 8 a sub drag commit only writes the dragged instances", () => {
    const visualisation = read("src/components/room/RoomVisualisation.jsx");
    const commit = visualisation.slice(
      visualisation.indexOf("const commitDraftSubPositions = useCallback"),
      visualisation.indexOf("const { handleSubDrag } = useSubDragHandler"),
    );
    // Untouched and disabled instances are returned byte-equivalent by reference.
    expect(commit).toMatch(/if \(!inst \|\| inst\.enabled === false\) return inst;/);
    expect(commit).toMatch(/if \(!draft\) return inst;/);
    // Only position/rotation/provenance may change, and only for the draft ids.
    expect(commit).toMatch(/position: \{ x: newX, y: newY \}/);
    expect(commit).toMatch(/rotationDeg: newRot/);
    expect(commit).not.toMatch(/gainDb|delayMs|polarity|model:/);
    expect(commit).toMatch(/draftById\.get\(inst\.id\)/);
  });

  test("7 the dragged sub resolves by stable id, never by group index", () => {
    const subHandler = read("src/components/room/rv/hooks/useSubDragHandler.jsx");
    expect(subHandler).toMatch(/find\(s => s\?\.id === subId\)/);
    expect(subHandler).toMatch(/subInDraft\.position\.x = finalX/);
    // Wall, cabinet, magnetic snap and symmetry snap stay in room metres.
    expect(subHandler).toMatch(/deriveSubWallOrientation\(/);
    expect(subHandler).toMatch(/findCoordinateSnap\(/);
    expect(subHandler).toMatch(/findSymmetrySnap\(/);
  });

  test("9 the conversion is an exact round trip, so stored coordinates are the dropped coordinates", () => {
    const view = { panX: 42, panY: -17, zoom: 1.5 };
    for (const room of [{ x: 0.5, y: 0.5 }, { x: 4.0, y: 5.5 }, { x: 2.25, y: 7.03 }]) {
      const screen = roomToScreen({ x_m: room.x, y_m: room.y, ...view });
      const back = toRoom({ ...screen, view });
      expect(back.x).toBeCloseTo(room.x, 9);
      expect(back.y).toBeCloseTo(room.y, 9);
    }
  });

  test("12 the drag pipeline touches no commercial or pricing state", () => {
    const files = [
      "src/components/room/rv/utils/rvPointerToRoom.js",
      "src/components/room/rv/hooks/useRoomCanvasMouseMove.jsx",
      "src/components/room/rv/hooks/useMouseDownHandler.jsx",
      "src/components/room/rv/hooks/useSubDragHandler.jsx",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/base44\.entities|priceList|commercial|discountMultiplier|capacityAuthority|selected_abfuser_qty/);
    }
  });

  test("10 room-size coordinate basis: not implemented yet (tracked, fails closed)", () => {
    // Deliberately asserted as absent so this turns red the moment the guard is
    // added, instead of silently passing as if it were verified.
    const visualisation = read("src/components/room/RoomVisualisation.jsx");
    const hasCoordinateBasisGuard = /coordinateBasis|coordinate_basis/.test(visualisation)
      || /coordinateBasis/.test(read("src/components/utils/hydrateProjectIntoAppState.jsx"));
    expect(hasCoordinateBasisGuard).toBe(false);
  });
});