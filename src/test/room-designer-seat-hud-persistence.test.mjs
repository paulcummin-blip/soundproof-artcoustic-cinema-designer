//
// Room Designer seat HUD — ONE persistent selection authority.
//
// Product rule: once a seat is clicked that seat is PINNED, and its Seat HUD
// stays open until the user explicitly starts an interaction that belongs to
// neither the pinned seat nor the HUD. Dismissal is therefore decided on
// POINTERDOWN, from the element the press lands on:
//
//   press on a seat ......................... keep the selection (switch or drag)
//   press inside the Seat HUD ............... keep the selection (HUD interaction)
//   press anywhere else ..................... the one genuine click-away
//
// Nothing else dismisses it. pointerup, a drag ending, a seat save, a
// recalculation, hover loss and the click the browser dispatches after a release
// all change nothing, which is why where the pointer is RELEASED never matters —
// and why no click-based suppression exists anywhere in the plan any more.
//
// Covered:
//   1. a press on a seat is never a click-away;
//   2. a press inside the HUD is never one, however deep inside the card it lands;
//   3. only a press that belongs to neither is the one genuine click-away;
//   4. the HUD really carries its identity, and its close control really closes;
//   5. the seat really carries its identity in the plan;
//   6. one dismissal sink, and only deliberate callers of it;
//   7. the release path dismisses nothing — no click token survives anywhere;
//   8. the close control is wired from the canvas all the way to the HUD.
import { register } from 'node:module';
register('../../test/_alias-loader.mjs', import.meta.url);
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const {
  SEAT_HUD_INTERACTION_ATTRIBUTE,
  SEAT_INTERACTION_ATTRIBUTE,
  SEAT_INTERACTION,
  HUD_INTERACTION,
  OUTSIDE_INTERACTION,
  resolvePlanInteractionOwner,
  isSeatHudDismissalPointerDown,
} = await import('../components/room/rv/utils/seatHudSelectionAuthority.js');
const SeatHud = (await import('../components/room/SeatHud.jsx')).default;
const RvSeatLayer = (await import('../components/room/rv/render/RvSeatLayer.jsx')).default;

const RV_SRC = fs.readFileSync('src/components/room/RoomVisualisation.jsx', 'utf8');
const CANVAS_SRC = fs.readFileSync('src/components/room/rv/render/RvPlanCanvas.jsx', 'utf8');
const HUD_SRC = fs.readFileSync('src/components/room/SeatHud.jsx', 'utf8');
const HUD_LAYER_SRC = fs.readFileSync('src/components/room/rv/render/RvSeatHudLayer.jsx', 'utf8');
const HOVER_SRC = fs.readFileSync('src/components/room/rv/hooks/useSeatHoverLogic.jsx', 'utf8');
const SEAT_LAYER_SRC = fs.readFileSync('src/components/room/rv/render/RvSeatLayer.jsx', 'utf8');
const PAN_SRC = fs.readFileSync('src/components/room/rv/hooks/useRvPlanPan.jsx', 'utf8');
const GESTURE_SRC = fs.readFileSync('src/components/room/rv/hooks/useSeatGesture.jsx', 'utf8');
const DRAG_SRC = fs.readFileSync('src/components/room/rv/utils/rvDragGesture.js', 'utf8');

// A DOM target that walks up to its ancestors exactly as Element.closest does.
const element = (marks = [], parent = null) => {
  const node = { parent, marks };
  node.closest = (selector) => {
    const wanted = String(selector).replace(/[[\]]/g, '');
    for (let current = node; current; current = current.parent) {
      if (current.marks.includes(wanted)) return current;
    }
    return null;
  };
  return node;
};

const SEAT = 'seat-r1-c3';
const seatElement = () => element([SEAT_INTERACTION_ATTRIBUTE]);
const hudCard = () => element([SEAT_HUD_INTERACTION_ATTRIBUTE]);
// A metric row, a tooltip and the header all live inside the card.
const insideHud = (depth = 3) => {
  let node = hudCard();
  for (let level = 0; level < depth; level += 1) node = element([], node);
  return node;
};
const emptyPlan = () => element([], element([], null));

afterEach(() => {
  delete globalThis.window;
});

test('TEST 1 — a press that belongs to a seat keeps the selection', () => {
  assert.equal(resolvePlanInteractionOwner(seatElement()), SEAT_INTERACTION);
  assert.equal(isSeatHudDismissalPointerDown(seatElement()), false, 'a seat press is never a click-away');
  assert.equal(isSeatHudDismissalPointerDown(insideHud(0)), false, 'including the pinned seat itself');
});

test('TEST 2 — a press inside the HUD keeps the selection, however deep it lands', () => {
  for (const depth of [0, 1, 3, 6]) {
    assert.equal(resolvePlanInteractionOwner(insideHud(depth)), HUD_INTERACTION, `depth ${depth}`);
    assert.equal(isSeatHudDismissalPointerDown(insideHud(depth)), false, `depth ${depth} is a HUD interaction`);
  }
});

test('TEST 3 — only a press that belongs to neither is the one genuine click-away', () => {
  assert.equal(resolvePlanInteractionOwner(emptyPlan()), OUTSIDE_INTERACTION);
  assert.equal(isSeatHudDismissalPointerDown(emptyPlan()), true, 'empty plan space dismisses');
  assert.equal(isSeatHudDismissalPointerDown(null), true, 'a target inside neither dismisses');
});

test('TEST 4 — the HUD carries its identity and its close control really closes', () => {
  let closed = 0;
  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(SeatHud, {
      tooltipData: {
        seatId: SEAT,
        rp23: null,
        rp22: {},
        splAtSeat: { lcr: {}, surrounds: {}, overheads: {} },
        position: 'x 1.40 m / y 2.60 m',
        distanceToScreen: '4.00 m',
        distanceToMLP: '0.00 m',
      },
      effectiveHoveredSeat: { id: SEAT, x: 1.4, y: 2.6 },
      hudPosition: { x: 40, y: 40 },
      isHudPinned: true,
      hudDynamicStyle: {},
      onHudHeaderMouseDown: () => {},
      hudElRef: { current: null },
      setHudHiddenWhenPinned: () => {},
      hudHiddenWhenPinned: false,
      onHudClose: () => { closed += 1; },
    }));
  });

  const cards = renderer.root.findAll((node) => node.props?.[SEAT_HUD_INTERACTION_ATTRIBUTE] != null);
  assert.equal(cards.length, 1, 'the HUD card is marked with the shared attribute');
  assert.equal(cards[0].props[SEAT_HUD_INTERACTION_ATTRIBUTE], 'true');
  assert.equal(resolvePlanInteractionOwner(element([SEAT_HUD_INTERACTION_ATTRIBUTE])), HUD_INTERACTION);

  const close = renderer.root.findByProps({ 'aria-label': 'Close seat HUD' });
  act(() => close.props.onClick({ stopPropagation() {} }));
  assert.equal(closed, 1, 'the close control closes the HUD, and it is the only thing inside it that does');
  act(() => renderer.unmount());
});

test('TEST 5 — the seat carries its identity in the plan', () => {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(RvSeatLayer, {
      seatingPositions: [{ id: SEAT, rowNumber: 1, seatNumber: 3, x: 1.4, y: 2.6 }],
      scale: 100,
      toPx: (x, y) => [x * 100, y * 100],
      handleMouseDown() {},
      handleSeatClick() {},
      seatGesture: { onSeatPointerDown() {} },
      MLPMarker: null,
    }));
  });

  const seats = renderer.root.findAll((node) => node.props?.[SEAT_INTERACTION_ATTRIBUTE] != null);
  assert.equal(seats.length, 1, 'one marked seat');
  assert.equal(seats[0].props[SEAT_INTERACTION_ATTRIBUTE], SEAT, 'marked with its own seat id');
  act(() => renderer.unmount());

  assert.ok(SEAT_LAYER_SRC.includes(SEAT_INTERACTION_ATTRIBUTE), 'the plan uses the shared seat attribute');
});

test('TEST 6 — one dismissal sink, and only deliberate callers of it', () => {
  const pinClears = HOVER_SRC.match(/setHudPinnedSeatId\(null\)/g) || [];
  assert.equal(pinClears.length, 1, 'the pin is cleared in exactly one place');

  const sink = HOVER_SRC.slice(HOVER_SRC.indexOf('const dismissSeatHud'), HOVER_SRC.indexOf('const handleSeatMouseEnter'));
  assert.match(sink, /setHudPinnedSeatId\(null\)/, 'that place is dismissSeatHud');
  assert.match(sink, /setHoveredSeat\(null\)/, 'the HUD goes with the pin: they share one sink');

  const callers = RV_SRC.match(/dismissSeatHud\(\)/g) || [];
  assert.equal(callers.length, 3, 'three deliberate callers only: the click-away authority, the Dimensions switch and the close control');
  assert.match(RV_SRC, /const handlePlanPointerDown = useCallback[\s\S]{0,400}?dismissSeatHud\(\);/, 'the click-away authority is one of them');
  assert.match(RV_SRC, /const handleHudClose = useCallback[\s\S]{0,200}?dismissSeatHud\(\);/, 'the close control is another');
  assert.match(RV_SRC, /seatInfoMode === 'dimensions'\) dismissSeatHud\(\);/, 'and the Dimensions switch is the third');

  // Hover can never dismiss a pinned seat: hover only ever runs unpinned.
  assert.match(HOVER_SRC, /if \(!hudPinnedSeatId\) setHoveredSeat\(null\)/, 'hover loss is ignored while pinned');
});

test('TEST 7 — the release path dismisses nothing', () => {
  // No click-based suppression survives anywhere.
  assert.doesNotMatch(RV_SRC, /consumeCompletedSeatDragClick|markSeatDragCompleted|consumePanClick/);
  assert.doesNotMatch(RV_SRC, /handlePlanClickWithSelection/);
  assert.doesNotMatch(DRAG_SRC, /CompletedSeatDrag|completedSeatDrag/, 'the drag lifecycle owns no click token');
  assert.doesNotMatch(PAN_SRC, /consumePanClick|panMovedRef/, 'and neither does the pan');

  // The seat gesture cannot dismiss anything: it only ever activates a seat.
  assert.doesNotMatch(GESTURE_SRC, /dismissSeatHud|setHudPinnedSeatId/, 'the seat gesture holds no dismissal');

  // The shared end path — every release, cancel and capture loss ends here.
  const endStart = RV_SRC.indexOf('const handleMouseUp = useCallback');
  const endBlock = RV_SRC.slice(endStart, RV_SRC.indexOf('_handleMouseUpRaw(e, gesture)'));
  assert.ok(endStart > 0 && endBlock.length > 0, 'the one end path must exist');
  assert.doesNotMatch(endBlock, /dismissSeatHud|setHudPinnedSeatId|clearSeatSelection/, 'a release dismisses and clears nothing');

  // Dismissal is decided on pointerdown, and never on a click.
  assert.match(CANVAS_SRC, /onPointerDown=\{handlePlanPointerDown\}/, 'the plan listens on pointerdown');
  assert.doesNotMatch(CANVAS_SRC, /onClick=\{handlePlanClick/, 'no click is bound to a dismissal handler');
  assert.match(RV_SRC, /if \(!isSeatHudDismissalPointerDown\(e\?\.target\)\) return;/, 'the one click-away authority');
});

test('TEST 8 — the HUD close control is wired from the canvas to the HUD', () => {
  assert.match(HUD_SRC, /onHudClose\?\.\(\)/, 'the HUD calls the close handler it is given');
  assert.match(HUD_SRC, /isHudPinned && \(\s*<div style=\{\{ display: 'flex'/, 'only a pinned HUD can be closed');
  assert.match(CANVAS_SRC, /onHudClose=\{onHudClose\}/, 'the canvas passes it to the HUD layer');
  assert.match(HUD_LAYER_SRC, /onHudClose=\{onHudClose\}/, 'the HUD layer passes it to the card');
  assert.match(RV_SRC, /onHudClose=\{handleHudClose\}/, 'and RoomDesigner owns it');
});