//
// Room Designer seat gesture — initialisation-order regression.
//
// The crash: "Cannot access 'clearSeatDimensionMode' before initialization".
// RoomVisualisation consumed the gesture hook's clearSeatDimensionMode in a
// useCallback dependency array declared ~570 lines ABOVE the useSeatGesture call
// that produces it. A dependency array is evaluated while the component renders,
// so the binding was still in its temporal dead zone and the whole Room Designer
// failed to mount.
//
// Two guards, in the order they protect the app:
//   A. the source order itself — every gesture output is first referenced on the
//      line that declares it, so nothing can consume it above the hook;
//   B. the pattern at runtime — the same composition (hook → dependent callback
//      holding the result in its dependency array) is rendered for real, and the
//      inverted order is rendered as a negative control to prove the guard has
//      teeth, not just shape.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSeatGesture } from '../components/room/rv/hooks/useSeatGesture.jsx';

const ROOM_VISUALISATION = new URL('../components/room/RoomVisualisation.jsx', import.meta.url);
const source = readFileSync(ROOM_VISUALISATION, 'utf8');
const lines = source.split('\n');

const GESTURE_OUTPUTS = [
  'selectedSeatId',
  'dimensionSeatId',
  'clearSeatDimensionMode',
  'seatGesture',
];

const hookLineIndex = lines.findIndex(line => /const \{ selectedSeatId, dimensionSeatId, clearSeatDimensionMode, seatGesture \} = useSeatGesture\(\{/.test(line));

const firstLineWith = (name) => lines.findIndex(line => new RegExp(`\\b${name}\\b`).test(line));

test('the gesture hook is called exactly once, at component top level', () => {
  const callLines = lines.filter(line => /\buseSeatGesture\(\{/.test(line));
  assert.equal(callLines.length, 1, 'useSeatGesture must be called exactly once');
  assert.ok(hookLineIndex >= 0, 'the seat gesture hook result must be destructured in one place');

  const declaration = lines[hookLineIndex];
  assert.equal(
    declaration.slice(0, declaration.length - declaration.trimStart().length),
    '  ',
    'the gesture hook must be called unconditionally in the component body'
  );
});

test('no gesture output is referenced above the hook that declares it', () => {
  for (const name of GESTURE_OUTPUTS) {
    assert.equal(
      firstLineWith(name),
      hookLineIndex,
      `${name} is referenced above the useSeatGesture call — that consumer sits in the binding's temporal dead zone`
    );
  }
});

test('a consumer may hold the gesture callback in a dependency array below the hook', () => {
  let captured = null;

  function Harness() {
    const { clearSeatDimensionMode } = useSeatGesture({});
    const onPlanClick = React.useCallback(() => { clearSeatDimensionMode(); }, [clearSeatDimensionMode]);
    captured = onPlanClick;
    return null;
  }

  assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(Harness)));
  assert.equal(typeof captured, 'function');
});

test('the inverted order is what the guard protects against', () => {
  function InvertedOrder() {
    // Consuming the hook result above the hook: the dependency array is
    // evaluated during render, before the const exists.
    const onPlanClick = React.useCallback(() => { clearSeatDimensionMode(); }, [clearSeatDimensionMode]);
    const { clearSeatDimensionMode } = useSeatGesture({});
    return onPlanClick && null;
  }

  assert.throws(
    () => renderToStaticMarkup(React.createElement(InvertedOrder)),
    /Cannot access 'clearSeatDimensionMode' before initialization/,
    'the inverted order must still fail, so the source-order guard is meaningful'
  );
});