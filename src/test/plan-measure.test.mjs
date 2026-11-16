import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
register('../../test/_alias-loader.mjs', import.meta.url);
const { default: Measure } = await import('../components/room/rv/render/RvMeasureLayer.jsx');

function harness({ zoom = 1, panX = 0, panY = 0, cssScale = 1 } = {}) {
  const roomRect = { x: 50, y: 80 }, scale = 100, viewOffsetPx = { x: 27, y: -13 };
  const screen = p => ({
    clientX: ((roomRect.x + p.x * scale) * zoom + panX + viewOffsetPx.x) * cssScale + 120,
    clientY: ((roomRect.y + p.y * scale) * zoom + panY + viewOffsetPx.y) * cssScale + 75,
  });
  const svg = {
    querySelector: () => ({ getScreenCTM: () => ({ inverse: () => ({ apply: p => ({
      x: ((p.x - 120) / cssScale - panX - viewOffsetPx.x) / zoom,
      y: ((p.y - 75) / cssScale - panY - viewOffsetPx.y) / zoom,
    }) }) }) }),
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform(m) { return m.apply(this); } }),
  };
  const props = { svgRef: { current: svg }, roomRect, scale, viewOffsetPx, zoom, panX, panY, svgW: 1200, svgH: 900 };
  let renderer;
  act(() => { renderer = TestRenderer.create(React.createElement(Measure, props)); });
  const surface = () => renderer.root.findByProps({ 'data-measure-surface': 'true' });
  const event = (point, overrides = {}) => ({
    ...screen(point), button: 0, buttons: 0, preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; }, ...overrides,
  });
  const fire = (handler, point, overrides) => {
    const e = event(point, overrides);
    act(() => { surface().props[handler](e); });
    return e;
  };
  return {
    fire, props, renderer,
    state: () => renderer.root.findByProps({ 'data-layer': 'plan-measure' }).props['data-measure-state'],
    distance: () => renderer.root.find(n => n.props['data-measure-distance'] !== undefined).props['data-measure-distance'],
    reset: () => { act(() => renderer.update(null)); act(() => renderer.update(React.createElement(Measure, props))); },
    close: () => act(() => renderer.unmount()),
  };
}

for (const view of [
  { zoom: 0.5, panX: -100, panY: 90, cssScale: 0.8 },
  { zoom: 1, panX: 0, panY: 0, cssScale: 1 },
  { zoom: 2.5, panX: 230, panY: -130, cssScale: 1.3 },
]) {
  test('horizontal, vertical and diagonal metres with zoom/pan/CSS scale ' + JSON.stringify(view), () => {
    const h = harness(view);
    for (const [end, distance] of [[{x:4,y:1},3],[{x:1,y:5},4],[{x:4,y:5},5]]) {
      h.fire('onClick', {x:1,y:1});
      h.fire('onPointerMove', end);
      assert.equal(h.state(), 'live', 'movement without a held button remains live');
      assert.ok(Math.abs(h.distance() - distance) < 1e-10);
      h.fire('onClick', end);
      assert.equal(h.state(), 'fixed');
      h.fire('onPointerMove', {x:9,y:9});
      h.fire('onClick', {x:7,y:8});
      assert.ok(Math.abs(h.distance() - distance) < 1e-10, 'third click and movement cannot change B');
      h.reset();
      assert.equal(h.state(), 'ready', 'off/on drops both endpoints');
    }
    h.close();
  });
}
test('measure surface consumes pointer, mouse, click and double-click before geometry handlers', () => {
  const h = harness();
  for (const handler of ['onPointerDown','onPointerUp','onPointerCancel','onMouseDown','onMouseUp','onClick','onDoubleClick','onContextMenu']) {
    const e = h.fire(handler, {x:2,y:3});
    assert.equal(e.stopped, true, handler);
    assert.equal(e.prevented, true, handler);
  }
  assert.equal(h.fire('onPointerMove', {x:4,y:5}).stopped, true);
  h.close();
});
test('right click and unavailable SVG conversion do not start a measurement', () => {
  const h = harness();
  h.fire('onClick', {x:2,y:3}, {button:2});
  assert.equal(h.state(), 'ready');
  h.props.svgRef.current = null;
  h.fire('onClick', {x:2,y:3});
  assert.equal(h.state(), 'ready');
  h.close();
});
test('zero-length second click is a valid fixed 0.00 m measurement', () => {
  const h = harness();
  h.fire('onClick', {x:2,y:3});
  h.fire('onClick', {x:2,y:3});
  assert.equal(h.state(), 'fixed');
  assert.equal(h.distance(), 0);
  h.close();
});
