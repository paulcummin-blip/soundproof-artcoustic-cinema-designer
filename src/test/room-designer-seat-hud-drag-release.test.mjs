//
// Room Designer seat HUD — a seat drag's release is not a click-away.
//
// The defect: clicking a seat pinned its HUD, but dragging that selected seat and
// releasing it closed the HUD and cleared the active seat. The browser dispatches
// a compatibility click after every release, and the plan's background click
// handler — the one thing that dismisses the HUD and clears the active seat —
// read that click as a click-away on empty plan.
//
// The authority under test is the shared drag lifecycle (rvDragGesture): a
// completed seat drag arms a one-shot suppression token, and the plan's
// background click consumes it before it dismisses anything. The seat gesture
// keeps no drag flag of its own, so exactly one authority answers "was that a
// drag?" — and that answer is given by the same object the release was completed
// with, not by a second flag that could disagree by the time the click arrives.
//
// Driven for real here: the browser's event order (a capture-phase end listener
// before the bubble-phase gesture listener), the seat gesture hook, the seat
// click → pin → hover writers, the drag-completion authority, the seating commit
// (the save / recalculation tick), the plan's pan gesture and the Seat HUD's own
// visibility rule. The three lines that wire the authority into RoomVisualisation
// are asserted against its source, as this repo's plan-level contracts are.
//
// Covered:
//   1. selecting a seat pins the HUD and keeps the seat active;
//   2. a drag's post-pointerup click is consumed — HUD and selection survive;
//   3. the token is consumed exactly once, so a later click still closes the HUD;
//   4. a plain seat click arms nothing;
//   5. a vertical move survives the save/recalculation tick: same seat, same HUD,
//      refreshed values;
//   6. a suppression left by a release that produced no click never swallows the
//      next genuine click on empty plan;
//   7. exactly one drag authority, and the plan consumes it before dismissing.
import { register } from 'node:module';
register('../../test/_alias-loader.mjs', import.meta.url);
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const { useSeatGesture, SEAT_DRAG_THRESHOLD_PX } = await import('../components/room/rv/hooks/useSeatGesture.jsx');
const { useRvPlanPan } = await import('../components/room/rv/hooks/useRvPlanPan.jsx');
const {
  beginPointerDrag, finishPointerDrag, markSeatDragCompleted, consumeCompletedSeatDragClick,
} = await import('../components/room/rv/utils/rvDragGesture.js');
const { default: SeatHud } = await import('../components/room/SeatHud.jsx');

const RV_SRC = fs.readFileSync('src/components/room/RoomVisualisation.jsx', 'utf8');
const GESTURE_SRC = fs.readFileSync('src/components/room/rv/hooks/useSeatGesture.jsx', 'utf8');
const PAN_SRC = fs.readFileSync('src/components/room/rv/hooks/useRvPlanPan.jsx', 'utf8');

const SELECTED_SEAT = 'seat-r1-c3';
const PX_PER_M = 100;

// ── Window stub that reproduces the browser's real order ──────────────────────
// A capture-phase listener at window runs before a bubble-phase one registered at
// the same target. The shared end path listens in the capture phase and the seat
// gesture in the bubble phase, so the completion — and the suppression it arms —
// is settled before the gesture's own release handling runs.
const listeners = { capture: new Map(), bubble: new Map() };
globalThis.window = {
  addEventListener(type, fn, options) {
    const registry = options === true || options?.capture === true ? listeners.capture : listeners.bubble;
    if (!registry.has(type)) registry.set(type, []);
    registry.get(type).push(fn);
  },
  removeEventListener(type, fn, options) {
    const registry = options === true || options?.capture === true ? listeners.capture : listeners.bubble;
    const list = registry.get(type) || [];
    const index = list.indexOf(fn);
    if (index >= 0) list.splice(index, 1);
  },
};

const fire = (type, event) => {
  [...(listeners.capture.get(type) || [])].forEach((fn) => fn(event));
  [...(listeners.bubble.get(type) || [])].forEach((fn) => fn(event));
};

const pointer = (overrides = {}) => ({
  isPrimary: true, button: 0, buttons: 1, pointerId: 7, pointerType: 'mouse',
  clientX: 100, clientY: 100, preventDefault() {}, stopPropagation() {},
  currentTarget: {}, target: {}, ...overrides,
});

// The plan's pan surface, as the canvas renders it: the only element that may
// start a pan is the surface itself.
const PLAN_SURFACE = {
  setPointerCapture() {},
  releasePointerCapture() {},
};

function mountPlan() {
  let api = null;

  function Plan() {
    // RoomVisualisation's own HUD state, written by the seat click and cleared by
    // the plan's background click.
    const [hudPinnedSeatId, setHudPinnedSeatId] = React.useState(null);
    const [hoveredSeat, setHoveredSeat] = React.useState(null);
    const [seats, setSeats] = React.useState(() => ([
      { id: SELECTED_SEAT, rowNumber: 1, seatNumber: 3, x: 1.4, y: 2.6 },
      { id: 'seat-r1-c2', rowNumber: 1, seatNumber: 2, x: 1.0, y: 2.6 },
    ]));

    const activeDragRef = React.useRef(null);
    const isDraggingSeatRef = React.useRef(false);
    const draftSeatsRef = React.useRef(null);
    const seatDragStartRef = React.useRef(null);

    // useMouseDownHandler's seat branch: a stable baseline frozen at the press,
    // then ownership of the gesture handed to the shared pointer path.
    const handleMouseDown = React.useCallback((event, seatId, type) => {
      if (type !== 'seat') return;
      seatDragStartRef.current = {
        seatId,
        startCursorY: Number(event?.clientY) / PX_PER_M,
        baselineYById: Object.fromEntries(seats.map((seat) => [seat.id, Number(seat.y)])),
      };
      draftSeatsRef.current = seats.map((seat) => ({ ...seat }));
      isDraggingSeatRef.current = true;
      beginPointerDrag(activeDragRef, event, { id: seatId, type, captureTarget: null });
    }, [seats]);

    // useSeatDragHandler: the whole block moves together, in Y only.
    const handleMouseMove = React.useCallback((event) => {
      const baseline = seatDragStartRef.current;
      if (!baseline || !draftSeatsRef.current) return;
      const cursorY = Number(event?.clientY) / PX_PER_M;
      if (!Number.isFinite(cursorY)) return;
      const delta = cursorY - baseline.startCursorY;
      if (Math.abs(delta) < 0.0001) return;
      draftSeatsRef.current = draftSeatsRef.current.map((seat) => ({
        ...seat,
        y: baseline.baselineYById[seat.id] + delta,
      }));
    }, []);

    // RoomVisualisation's one synchronous end path — the drag's completion — and
    // then useMouseUpHandler's seat commit, which writes the moved seating array:
    // the save / recalculation tick.
    const handleMouseUp = React.useCallback((event) => {
      const gesture = finishPointerDrag(activeDragRef, event);
      if (!gesture) return;
      markSeatDragCompleted(gesture);
      if (isDraggingSeatRef.current) {
        if (draftSeatsRef.current) setSeats(draftSeatsRef.current);
        draftSeatsRef.current = null;
        isDraggingSeatRef.current = false;
      }
    }, []);

    React.useEffect(() => {
      window.addEventListener('pointerup', handleMouseUp, true);
      window.addEventListener('pointercancel', handleMouseUp, true);
      return () => {
        window.removeEventListener('pointerup', handleMouseUp, true);
        window.removeEventListener('pointercancel', handleMouseUp, true);
      };
    }, [handleMouseUp]);

    const { selectedSeatId, clearSeatSelection, seatGesture } = useSeatGesture({
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleSeatClick: (seat) => {
        setHudPinnedSeatId(seat.id);
        setHoveredSeat(seat);
      },
      mode: 'hud',
    });

    const { onPanPointerDown, consumePanClick } = useRvPlanPan({
      viewOffsetPx: { x: 0, y: 0 },
      setViewOffsetPx: () => {},
      isDraggingSpeakerRef: { current: false },
      dragging: false,
    });

    // useSeatHoverLogic: the pinned seat is resolved by ID from the current
    // seating array, never from a stored object reference.
    const effectiveHoveredSeat = React.useMemo(() => {
      const pinned = hudPinnedSeatId
        ? seats.find((seat) => String(seat?.id) === String(hudPinnedSeatId)) || null
        : null;
      return pinned || hoveredSeat || null;
    }, [hudPinnedSeatId, hoveredSeat, seats]);

    // The plan's background click, in the order RoomVisualisation uses it.
    const onPlanClick = React.useCallback(() => {
      if (consumePanClick()) return;
      if (consumeCompletedSeatDragClick()) return;
      setHudPinnedSeatId(null);
      setHoveredSeat(null);
      clearSeatSelection();
    }, [consumePanClick, clearSeatSelection]);

    api = {
      hudPinnedSeatId,
      selectedSeatId,
      effectiveHoveredSeat,
      seats,
      seatGesture,
      onPlanClick,
      pressPlanBackground: () => onPanPointerDown({
        currentTarget: PLAN_SURFACE,
        target: PLAN_SURFACE,
        defaultPrevented: false,
        button: 0,
        buttons: 1,
        pointerId: 7,
        clientX: 500,
        clientY: 500,
      }),
    };

    const tooltipData = effectiveHoveredSeat
      ? {
        seatId: effectiveHoveredSeat.id,
        rp23: null,
        rp22: {},
        splAtSeat: { lcr: {}, surrounds: {}, overheads: {} },
        position: `x ${Number(effectiveHoveredSeat.x).toFixed(2)} m / y ${Number(effectiveHoveredSeat.y).toFixed(2)} m`,
        distanceToScreen: '4.00 m',
        distanceToMLP: '0.00 m',
      }
      : null;

    return React.createElement(SeatHud, {
      tooltipData,
      effectiveHoveredSeat,
      hudPosition: effectiveHoveredSeat ? { x: 40, y: 40 } : null,
      isHudPinned: !!hudPinnedSeatId,
      hudElRef: { current: null },
    });
  }

  let renderer;
  act(() => { renderer = TestRenderer.create(React.createElement(Plan)); });

  return {
    api: () => api,
    // The HUD's own visibility rule, read off its rendered output.
    hudMounted: () => renderer.root
      .findAll((node) => node.props?.className === 'seat-hud').length > 0,
    dragSeat: ({ fromY = 100, toY = 100 + SEAT_DRAG_THRESHOLD_PX + 20 } = {}) => {
      act(() => api.seatGesture.onSeatPointerDown(pointer({ clientY: fromY }), { id: SELECTED_SEAT }));
      act(() => fire('pointermove', pointer({ clientY: toY })));
      act(() => fire('pointerup', pointer({ buttons: 0, clientY: toY })));
    },
    // The live repro: the gesture travels to the right, so the seating block's
    // own Y is unchanged — but the gesture still became a seat drag, and its
    // release must not be read as a click-away.
    dragSeatRight: ({ clientY = 100 } = {}) => {
      const draggedX = 100 + SEAT_DRAG_THRESHOLD_PX + 40;
      act(() => api.seatGesture.onSeatPointerDown(pointer({ clientY }), { id: SELECTED_SEAT }));
      act(() => fire('pointermove', pointer({ clientX: draggedX, clientY })));
      act(() => fire('pointerup', pointer({ buttons: 0, clientX: draggedX, clientY })));
    },
    clickSeat: () => {
      act(() => api.seatGesture.onSeatPointerDown(pointer(), { id: SELECTED_SEAT }));
      act(() => fire('pointerup', pointer({ buttons: 0 })));
    },
    cancelSeatDrag: ({ fromY = 100, toY = 100 + SEAT_DRAG_THRESHOLD_PX + 20 } = {}) => {
      act(() => api.seatGesture.onSeatPointerDown(pointer({ clientY: fromY }), { id: SELECTED_SEAT }));
      act(() => fire('pointermove', pointer({ clientY: toY })));
      act(() => fire('pointercancel', pointer({ buttons: 0, clientY: toY })));
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

afterEach(() => {
  listeners.capture.clear();
  listeners.bubble.clear();
});

test('TEST 1 — selecting a seat pins its HUD and keeps that seat active', () => {
  const plan = mountPlan();
  plan.clickSeat();

  assert.equal(String(plan.api().selectedSeatId), SELECTED_SEAT, 'the seat stays the active seat');
  assert.equal(String(plan.api().hudPinnedSeatId), SELECTED_SEAT, 'and its HUD is pinned');
  assert.equal(plan.hudMounted(), true, 'the HUD is on screen');
  plan.unmount();
});

test('TEST 2 — a seat drag\'s post-pointerup click is consumed: HUD and selection survive', () => {
  const plan = mountPlan();
  plan.clickSeat();
  plan.dragSeat();

  const moved = plan.api().seats.find((seat) => seat.id === SELECTED_SEAT);
  assert.ok(moved.y > 2.6, 'the drag really moved the seat');

  // The browser's compatibility click reaches the plan wrapper after the release.
  act(() => plan.api().onPlanClick());

  assert.equal(String(plan.api().selectedSeatId), SELECTED_SEAT, 'the seat is still the active seat');
  assert.equal(String(plan.api().hudPinnedSeatId), SELECTED_SEAT, 'the HUD is still pinned to it');
  assert.equal(plan.hudMounted(), true, 'and the HUD is still rendered');
  plan.unmount();
});

test('TEST 8 — a rightward seat gesture does not close the HUD', () => {
  const plan = mountPlan();
  plan.clickSeat();
  plan.dragSeatRight();

  act(() => plan.api().onPlanClick());

  assert.equal(String(plan.api().selectedSeatId), SELECTED_SEAT, 'the active seat is unchanged');
  assert.equal(String(plan.api().hudPinnedSeatId), SELECTED_SEAT, 'the HUD is still pinned');
  assert.equal(plan.hudMounted(), true, 'and still rendered after a rightward drag');
  plan.unmount();
});

test('TEST 3 — the suppression is consumed exactly once, so a later click still closes the HUD', () => {
  const plan = mountPlan();
  plan.clickSeat();
  plan.dragSeat();

  act(() => plan.api().onPlanClick());
  assert.equal(plan.hudMounted(), true, 'the drag\'s own click did not close the HUD');

  // A genuine click on empty plan: no token left, so it dismisses as it always did.
  act(() => plan.api().onPlanClick());

  assert.equal(plan.api().selectedSeatId, null, 'the active seat is cleared');
  assert.equal(plan.api().hudPinnedSeatId, null, 'the HUD is unpinned');
  assert.equal(plan.hudMounted(), false, 'and it is gone from the plan');
  plan.unmount();
});

test('TEST 4 — a plain seat click arms nothing, so it never suppresses a later click', () => {
  const plan = mountPlan();
  plan.clickSeat();

  assert.equal(plan.hudMounted(), true, 'the click opened the HUD');

  act(() => plan.api().onPlanClick());

  assert.equal(plan.api().selectedSeatId, null, 'a click is not a drag: nothing is suppressed');
  assert.equal(plan.hudMounted(), false, 'so the background click closes the HUD');
  plan.unmount();
});

test('TEST 5 — a vertical move survives the save/recalculation tick: same seat, same HUD, refreshed values', () => {
  const plan = mountPlan();
  plan.clickSeat();

  const preDragSeats = plan.api().seats;
  plan.dragSeat({ fromY: 100, toY: 160 });

  const committed = plan.api().seats;
  assert.notEqual(committed, preDragSeats, 'the commit wrote a new seating array');
  assert.deepEqual(
    committed.map((seat) => seat.id),
    preDragSeats.map((seat) => seat.id),
    'every seat keeps its identity through the save'
  );

  act(() => plan.api().onPlanClick());

  assert.equal(String(plan.api().selectedSeatId), SELECTED_SEAT, 'the same seat remains active after the save');
  assert.equal(String(plan.api().hudPinnedSeatId), SELECTED_SEAT, 'the HUD is still pinned to the same seat ID');
  assert.equal(plan.hudMounted(), true, 'the HUD is still rendered after the recalculation tick');
  assert.equal(
    Number(plan.api().effectiveHoveredSeat.y),
    Number(committed.find((seat) => seat.id === SELECTED_SEAT).y),
    'and the HUD reads the newly committed seat, not a stale object reference'
  );
  plan.unmount();
});

test('TEST 6 — a suppression left by a release with no click never swallows the next genuine click', () => {
  const plan = mountPlan();
  plan.clickSeat();
  // A drag ended by a cancel: the token is armed and the browser dispatches no click.
  plan.cancelSeatDrag();

  assert.equal(plan.hudMounted(), true, 'the HUD survived the cancelled drag');

  // The next press on empty plan is a new gesture and clears the stale token.
  act(() => plan.api().pressPlanBackground());
  act(() => plan.api().onPlanClick());

  assert.equal(plan.api().selectedSeatId, null, 'the genuine click still closes the HUD');
  assert.equal(plan.api().hudPinnedSeatId, null);
  assert.equal(plan.hudMounted(), false);
  plan.unmount();
});

test('TEST 7 — exactly one drag authority, and the plan consumes it before it dismisses anything', () => {
  assert.doesNotMatch(
    GESTURE_SRC,
    /consumeDragClick|seatDragMovedRef/,
    'the seat gesture keeps no drag flag of its own: one lifecycle owns the answer'
  );
  assert.match(
    GESTURE_SRC,
    /const seatGesture = useMemo\(\(\) => \(\{\s*onSeatPointerDown: handleSeatPointerDown,/,
    'the gesture surface carries the pointer entry point and nothing else'
  );
  assert.match(
    GESTURE_SRC,
    /handlersRef\.current\.handleMouseUp\?\.\(event\)/,
    'a completed drag is handed to the shared end path, which is where completion is decided'
  );

  assert.match(
    RV_SRC,
    /finishPointerDrag\(activeDragRef, e\);[\s\S]{0,400}?markSeatDragCompleted\(gesture\);/,
    'the shared end path arms the suppression from the gesture it just completed'
  );

  const handlerStart = RV_SRC.indexOf('const handlePlanClickWithSelection = useCallback');
  assert.ok(handlerStart >= 0, 'the plan click handler must exist');
  const body = RV_SRC.slice(handlerStart, RV_SRC.indexOf('}, [consumePanClick', handlerStart));
  const consumeIndex = body.indexOf('if (consumeCompletedSeatDragClick()) return;');
  const dismissIndex = body.indexOf('dismissSeatHud();');
  const clearIndex = body.indexOf('clearSeatSelection();');

  assert.ok(consumeIndex >= 0, 'the plan consumes a completed seat drag');
  assert.ok(dismissIndex > consumeIndex, 'the suppression is consumed before the HUD is dismissed');
  assert.ok(clearIndex > consumeIndex, 'and before the active seat is cleared');

  assert.match(
    PAN_SRC,
    /clearCompletedSeatDrag\(\);/,
    'a new press on the plan clears any suppression left by a release that produced no click'
  );
});