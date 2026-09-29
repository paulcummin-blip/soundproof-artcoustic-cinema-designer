import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { transform } from 'esbuild';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const require = createRequire(import.meta.url);
async function loadComponent(path) {
  let source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  source = source.replace(/from ["']react["']/g, 'from ' + JSON.stringify(pathToFileURL(require.resolve('react')).href));
  source = source.replace(/import RvSeatRowLabels[^;]+;/, 'const RvSeatRowLabels = () => null;');
  const { code } = await transform(source, { loader: 'jsx', format: 'esm', jsx: 'transform' });
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const Marker = await loadComponent('src/components/room/rv/render/RvMlpMarker.jsx');
const SeatLayer = await loadComponent('src/components/room/rv/render/RvSeatLayer.jsx');

function pointer(x, y, zoom = 1) {
  return {
    clientX: 40 + x * zoom, clientY: 80 + y * zoom,
    preventDefault() {}, stopPropagation() {},
    currentTarget: { ownerSVGElement: {
      getScreenCTM: () => ({ inverse: () => ({ zoom }) }),
      createSVGPoint: () => ({ x: 0, y: 0, matrixTransform({ zoom }) {
        return { x: (this.x - 40) / zoom, y: (this.y - 80) / zoom };
      } }),
    } },
  };
}
function renderLayer(seats, scale, selected) {
  let renderer;
  act(() => { renderer = TestRenderer.create(React.createElement(SeatLayer, {
    seatingPositions: seats, scale, toPx: (x, y) => [x * scale, y * scale],
    handleMouseDown() {}, handleSeatClick: seat => selected.push(seat.id),
    MLPMarker: React.createElement(Marker, { toPx: (x, y) => [x * scale, y * scale],
      mlpDotX_m: 2.25, mlpDotY_m: 5.5, grabbed: false }),
  })); });
  return renderer;
}

test('RSP double-click selects the exact underlying seat at normal and resized/zoomed scales', () => {
  const seats = [{ id: 'r2s1', x: 1.65, y: 5.5 }, { id: 'r2s2', x: 2.25, y: 5.5 }];
  for (const [scale, zoom] of [[77, 1], [36, 0.7], [140, 2]]) {
    const selected = [];
    const renderer = renderLayer(seats, scale, selected);
    const circle = renderer.root.findAllByType('circle')[0];
    act(() => circle.props.onDoubleClick(pointer(2.25 * scale, 5.5 * scale, zoom)));
    assert.deepEqual(selected, ['r2s2']);
    act(() => renderer.unmount());
  }
});

test('partial overlap uses the same ellipse boundary; outside and between rows select nothing', () => {
  const selected = [];
  const renderer = renderLayer([{ id: 'r2s2', position: { x: 2.25, y: 5.5 } }], 100, selected);
  const click = renderer.root.findAllByType('circle')[0].props.onDoubleClick;
  act(() => click(pointer(225 + 19, 550)));
  act(() => click(pointer(225 + 21, 550)));
  act(() => click(pointer(225 + 19, 550 + 24)));
  act(() => click(pointer(225, 640)));
  assert.deepEqual(selected, ['r2s2']);
  act(() => renderer.unmount());
});

test('overlapping seats follow SVG stacking; ordinary seat gesture keeps the same callback', () => {
  const selected = [];
  const renderer = renderLayer([{ id: 'first', x: 2.25, y: 5.5 }, { id: 'last', x: 2.25, y: 5.5 }], 100, selected);
  act(() => renderer.root.findAllByType('circle')[0].props.onDoubleClick(pointer(225, 550)));
  act(() => renderer.root.findAllByType('ellipse')[0].props.onDoubleClick(pointer(225, 550)));
  assert.deepEqual(selected, ['last', 'first']);
  act(() => renderer.unmount());
});

test('short click never moves RSP; hold remains 3000ms; release/place never also opens seat HUD', () => {
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  const timers = new Map();
  let timerId = 0;
  globalThis.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  let renderer;
  try {
    const activations = [], placements = [], selections = [];
    const props = { toPx: (x, y) => [x, y], mlpDotX_m: 2.25, mlpDotY_m: 5.5, grabbed: false,
      onLongPressActivate: (...xy) => activations.push(xy),
      onPlaceClick: e => placements.push(e), onSeatDoubleClick: e => selections.push(e) };
    act(() => { renderer = TestRenderer.create(React.createElement(Marker, props)); });
    const hit = () => renderer.root.findAllByType('circle')[0].props;
    const e = pointer(2.25, 5.5);
    act(() => hit().onPointerDown(e));
    assert.equal([...timers.values()][0].delay, 3000);
    act(() => hit().onPointerUp(e));
    assert.equal(timers.size, 0);
    assert.equal(activations.length, 0);
    assert.equal(placements.length, 0);
    act(() => hit().onDoubleClick(e));
    assert.equal(selections.length, 1);

    act(() => hit().onPointerDown(e));
    const hold = [...timers.values()][0];
    timers.clear();
    act(() => hold.fn());
    assert.deepEqual(activations, [[2.25, 5.5]]);
    act(() => renderer.update(React.createElement(Marker, { ...props, grabbed: true })));
    act(() => hit().onPointerUp(e));
    assert.equal(placements.length, 0);
    act(() => hit().onDoubleClick(e));
    assert.equal(selections.length, 1);
    act(() => hit().onPointerDown(e));
    assert.equal(placements.length, 1);
    act(() => renderer.update(React.createElement(Marker, props)));
    act(() => hit().onPointerUp(e));
    act(() => hit().onDoubleClick(e));
    assert.equal(selections.length, 1);

    act(() => hit().onPointerDown(e));
    act(() => hit().onPointerCancel(e));
    assert.equal(timers.size, 0);
    act(() => hit().onPointerDown(e));
    act(() => hit().onPointerLeave(e));
    assert.equal(timers.size, 0);
  } finally {
    if (renderer) act(() => renderer.unmount());
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
  }
});
