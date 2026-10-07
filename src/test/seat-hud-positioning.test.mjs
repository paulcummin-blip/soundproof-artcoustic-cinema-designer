// seat-hud-positioning.test.mjs
// ---------------------------------------------------------------------------
// The seat HUD must appear in its final position on its first visible frame.
//
//   TEST 1  One authoritative calculation reproduces the previous placement exactly
//   TEST 2  The first frame renders at the resolved seat-relative position
//   TEST 3  No placeholder coordinate is ever rendered
//   TEST 4  The position is computed during render — the correction effect is gone
//   TEST 5  A boundary seat is clamped inside the canvas on the first frame
//   TEST 6  Manual dragging starts from the position actually shown
//   TEST 7  The pinned offset is already applied on the pinned frame
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import SeatHud from '../components/room/SeatHud.jsx';
import { useHudComputation } from '../components/room/rv/hooks/useHudComputation.jsx';
import {
  computeAutomaticHudPosition,
  HUD_PINNED_INITIAL_OFFSET_PX,
} from '../components/room/hud/hudPositionAuthority.js';

const RV_SRC = fs.readFileSync('src/components/room/RoomVisualisation.jsx', 'utf8');
const HUD_SRC = fs.readFileSync('src/components/room/SeatHud.jsx', 'utf8');

// The placement the app used before this fix, kept as the reference the one
// authoritative calculation has to reproduce exactly.
function legacyAutomaticPosition({ seatX_px, seatY_px, canvasW, canvasH }) {
  const HUD_EST_W = 320;
  const HUD_EST_H = 520;
  const pad = 8;
  const w = canvasW || 1200;
  const h = canvasH || 800;

  let preferredX = seatX_px + 16;
  const preferredY = seatY_px - HUD_EST_H / 2;

  if (preferredX + HUD_EST_W + pad > w) preferredX = seatX_px - HUD_EST_W - 16;

  return {
    x: Math.min(w - HUD_EST_W - pad, Math.max(pad, preferredX)),
    y: Math.min(h - HUD_EST_H - pad, Math.max(pad, preferredY)),
  };
}

const HUD_TOOLTIP_DATA = {
  seatId: 'R1S1',
  rp23: { formatted: '—', level: '—' },
  rp22: {},
  splAtSeat: { lcr: {}, surrounds: {}, overheads: {} },
  position: '—',
  distanceToScreen: '—',
  distanceToMLP: '—',
};

// renderToStaticMarkup runs no effects at all, so whatever this returns IS the
// first visible frame.
const hudFirstFrame = (hudPosition) => renderToStaticMarkup(React.createElement(SeatHud, {
  tooltipData: HUD_TOOLTIP_DATA,
  effectiveHoveredSeat: { id: 'R1S1', x: 2.4, y: 3.1 },
  hudPosition,
  isHudPinned: true,
  hudDynamicStyle: {},
  onHudHeaderMouseDown: () => {},
  hudElRef: { current: null },
  setHudHiddenWhenPinned: () => {},
  hudHiddenWhenPinned: false,
}));

test('TEST 1 — one authoritative calculation reproduces the previous placement exactly', () => {
  const cases = [
    { seatX_px: 600, seatY_px: 400, canvasW: 1200, canvasH: 800 },
    { seatX_px: 40, seatY_px: 300, canvasW: 1200, canvasH: 800 },
    { seatX_px: 1150, seatY_px: 380, canvasW: 1200, canvasH: 800 },
    { seatX_px: 300, seatY_px: 10, canvasW: 1200, canvasH: 800 },
    { seatX_px: 300, seatY_px: 790, canvasW: 1200, canvasH: 800 },
    { seatX_px: 500, seatY_px: 300, canvasW: null, canvasH: null },
  ];

  for (const c of cases) {
    assert.deepEqual(
      computeAutomaticHudPosition(c),
      legacyAutomaticPosition(c),
      `placement changed for seat (${c.seatX_px}, ${c.seatY_px}) on a ${c.canvasW}x${c.canvasH} canvas`
    );
  }
});

test('TEST 2 — the first frame renders at the resolved seat-relative position', () => {
  const position = computeAutomaticHudPosition({
    seatX_px: 600, seatY_px: 400, canvasW: 1200, canvasH: 800,
  });

  const markup = hudFirstFrame(position);
  assert.match(markup, new RegExp(`left:${position.x}px`), 'the card is drawn at the computed position');
  assert.match(markup, new RegExp(`top:${position.y}px`));
});

test('TEST 3 — no placeholder coordinate is ever rendered', () => {
  assert.doesNotMatch(HUD_SRC, /\|\| 20/, 'the {20, 20} fallback is gone');
  assert.match(HUD_SRC, /!hasHudPosition/, 'the card needs a real resolved position');
  assert.doesNotMatch(hudFirstFrame(null), /seat-hud/, 'with no resolved position nothing is drawn');
});

test('TEST 4 — the position is computed during render, before the first frame', () => {
  assert.match(RV_SRC, /const automaticHudPosPx = useMemo\(/, 'the seat-relative position is a render-time calculation');
  assert.match(RV_SRC, /const hudPositionPx = hudBasePosPx \|\| automaticHudPosPx;/, 'one resolved position feeds the HUD');
  assert.match(RV_SRC, /hudPosition=\{hudPositionPx\}/, 'the canvas renders the resolved position');
  assert.match(RV_SRC, /computeAutomaticHudPosition\(/, 'the placement comes from the shared authority');
  assert.doesNotMatch(
    RV_SRC,
    /Auto-position HUD near the currently hovered\/pinned seat/,
    'the post-render correction effect is gone'
  );
  assert.doesNotMatch(
    RV_SRC,
    /already manually placed, don't move it/,
    'nothing locks the position after the first frame'
  );
});

test('TEST 5 — a boundary seat is clamped inside the canvas on the first frame', () => {
  const position = computeAutomaticHudPosition({
    seatX_px: 1150, seatY_px: 380, canvasW: 1200, canvasH: 800,
  });

  assert.ok(position.x + 320 <= 1200, 'the card stays inside the canvas width');

  const markup = hudFirstFrame(position);
  assert.match(markup, new RegExp(`left:${position.x}px`));
  assert.match(markup, new RegExp(`top:${position.y}px`));
});

test('TEST 6 — manual dragging starts from the position actually shown', () => {
  assert.match(RV_SRC, /const startBase = hudBasePosPx \|\| automaticHudPosPx;/);
  assert.match(RV_SRC, /setHudBasePosPx\(clampHudOffset\(startBase\.x \+ dx, startBase\.y \+ dy\)\)/);
});

test('TEST 7 — the pinned offset is already applied on the pinned frame', () => {
  let style = null;

  function Harness() {
    const { hudDynamicStyle } = useHudComputation({
      isHudPinned: true,
      hudPinnedOffsetPx: HUD_PINNED_INITIAL_OFFSET_PX,
      hudHiddenWhenPinned: false,
    });
    style = hudDynamicStyle;
    return null;
  }

  renderToStaticMarkup(React.createElement(Harness));

  assert.equal(
    style.transform,
    `translate3d(${HUD_PINNED_INITIAL_OFFSET_PX.x}px, ${HUD_PINNED_INITIAL_OFFSET_PX.y}px, 0)`,
    'the pinned frame carries the offset immediately'
  );
  assert.match(
    RV_SRC,
    /hudPinnedOffsetPx: hudPinnedOffsetPx \|\| HUD_PINNED_INITIAL_OFFSET_PX/,
    'the pinned frame is not waiting for the pin state'
  );
});