// surround-drag-live-feedback.test.mjs
// ---------------------------------------------------------------------------
// Regression: live drag feedback for surround speakers in the Room Designer.
//
// The regression was that the speaker visual moved with the transient drag
// position while the angle lines, angle labels and pinned seat HUD kept reading
// committed state, so they stayed stale until pointer release.
//
//   TEST 1  ONE effective position source: draft when dragging, committed otherwise
//   TEST 2  No merge work (and no identity change) when nothing is being dragged
//   TEST 3  Room Designer feeds the HUD and the canvas the same effective list
//   TEST 4  Angle lines, labels, speaker visual and position overlay read live
//   TEST 5  Nothing is committed during the drag (draft ref only)
//   TEST 6  HUD cache writes are suspended during the drag and resume on release
//   TEST 7  The all-seat metrics cache keeps reading committed speakers
// ---------------------------------------------------------------------------
import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  buildLiveSpeakerPositionMap,
  applyLiveSpeakerPositions,
} from '../components/room/rv/utils/liveSpeakerPositions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const COMMITTED = [
  { id: 'SL', role: 'SL', position: { x: 0.10, y: 3.00 } },
  { id: 'SR', role: 'SR', position: { x: 4.40, y: 3.00 } },
  { id: 'SBL', role: 'SBL', position: { x: 1.20, y: 5.60 } },
];

describe('TEST 1: one effective position source', () => {
  test('uses the drag preview position for the dragged speaker only', () => {
    const draft = [
      { id: 'SR', role: 'SR', position: { x: 4.40, y: 3.80 } },
    ];
    const liveById = buildLiveSpeakerPositionMap(draft, true);
    const effective = applyLiveSpeakerPositions(COMMITTED, liveById);

    const sr = effective.find((s) => s.id === 'SR');
    const sl = effective.find((s) => s.id === 'SL');

    assert.equal(sr.position.y, 3.80, 'dragged speaker uses the live preview');
    assert.equal(sl.position.y, 3.00, 'other speakers keep committed positions');
  });

  test('ignores draft entries with a non-finite position', () => {
    const liveById = buildLiveSpeakerPositionMap([
      { id: 'SR', role: 'SR', position: { x: NaN, y: 3.8 } },
    ], true);
    assert.equal(liveById, null);
    assert.equal(applyLiveSpeakerPositions(COMMITTED, liveById), COMMITTED);
  });
});

describe('TEST 2: no work and no identity change when idle', () => {
  test('returns null when no speaker drag is active', () => {
    assert.equal(buildLiveSpeakerPositionMap(COMMITTED, false), null);
    assert.equal(buildLiveSpeakerPositionMap(null, true), null);
  });

  test('committed list identity is preserved, so nothing re-renders needlessly', () => {
    const same = applyLiveSpeakerPositions(COMMITTED, null);
    assert.equal(same, COMMITTED);
  });
});

describe('TEST 3: one source shared by the HUD and the canvas', () => {
  const room = read('components/room/RoomVisualisation.jsx');

  test('Room Designer builds the single live lookup from the speaker draft', () => {
    assert.match(room, /buildLiveSpeakerPositionMap\(draftSpeakersRef\.current, dragType === 'speaker'\)/);
    assert.match(room, /const effectivePlacedSpeakers = useMemo\(\s*\(\) => applyLiveSpeakerPositions\(placedSpeakers, liveSpeakerPositions\)/);
  });

  test('the HUD hook is fed the effective positions, not committed state', () => {
    const hudCall = room.slice(
      room.indexOf('} = useSeatHoverLogic({'),
      room.indexOf('// AUTOMATIC SEAT METRICS CACHE')
    );
    assert.match(hudCall, /placedSpeakers: effectivePlacedSpeakers/);
    assert.doesNotMatch(hudCall, /^\s*placedSpeakers,$/m);
  });

  test('the canvas receives the same live lookup', () => {
    assert.match(room, /liveSpeakerPositions=\{liveSpeakerPositions\}/);
  });
});

describe('TEST 4: live overlays read the effective positions', () => {
  const canvas = read('components/room/rv/render/RvPlanCanvas.jsx');

  test('angle lines and labels are fed the live speaker list', () => {
    assert.match(canvas, /<RvRp22AnglesOverlay[^>]*visiblePlanSpeakers=\{speakersLive\}/);
  });

  test('the speaker visual, position overlay and draft merge share that list', () => {
    assert.match(canvas, /speakers=\{speakersLive\}/);
    assert.match(canvas, /speakers=\{placedLive\}/);
    assert.match(canvas, /applyLiveSpeakerPositions\(visiblePlanSpeakers, liveById\)/);
    assert.match(canvas, /applyLiveSpeakerPositions\(placedSpeakers, liveById\)/);
  });

  test('no overlay still reads committed visiblePlanSpeakers for angles', () => {
    assert.doesNotMatch(canvas, /visiblePlanSpeakers=\{visiblePlanSpeakers\}/);
    assert.doesNotMatch(canvas, /<SpeakerPositionsOverlay[\s\S]{0,120}?speakers=\{placedSpeakers\}/);
  });

  test('the angle label maths is simple geometry — no engine call in the overlay', () => {
    const overlay = read('components/room/rv/render/RvRp22AnglesOverlay.jsx');
    assert.match(overlay, /Math\.atan2/);
    assert.doesNotMatch(overlay, /analysisResult|runRP22|bassSimulation|invoke\(/);
  });
});

describe('TEST 5: nothing is committed during the drag', () => {
  test('the drag update writes only to the draft ref', () => {
    const drag = read('components/room/rv/hooks/useSpeakerDragUpdate.jsx');
    assert.doesNotMatch(drag, /onSetSpeakers\(/, 'no state commit during a pointer move');
    assert.match(drag, /if \(!onSetSpeakers\) return;/);
    assert.match(drag, /draftSpeakersRef\.current = draftSpeakersRef\.current\.map/);
  });
});

describe('TEST 6: HUD cache writes suspended during the drag', () => {
  test('the write effect returns early while a speaker drag is active', () => {
    const hover = read('components/room/rv/hooks/useSeatHoverLogic.jsx');
    const effect = hover.slice(hover.indexOf('// HUD cache writes'));
    assert.match(effect, /if \(suspendCacheWrites\) return;/);
    assert.match(effect, /suspendCacheWrites,/);
  });

  test('the flag is driven by the live drag lookup and clears on release', () => {
    const room = read('components/room/RoomVisualisation.jsx');
    assert.match(room, /suspendCacheWrites: !!liveSpeakerPositions/);
  });
});

describe('TEST 7: the all-seat metrics cache stays on committed speakers', () => {
  test('no per-move rebuild of every seat snapshot', () => {
    const room = read('components/room/RoomVisualisation.jsx');
    const cacheCall = room.slice(
      room.indexOf('useSeatMetricsCacheEffect({'),
      room.indexOf('// 1) Auto-position HUD')
    );
    assert.ok(cacheCall.length > 0);
    assert.match(cacheCall, /placedSpeakers, widthM, lengthM, heightM,/);
    assert.doesNotMatch(cacheCall, /effectivePlacedSpeakers/);
  });
});