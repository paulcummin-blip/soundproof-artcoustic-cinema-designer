// ---------------------------------------------------------------------------
// TEST   Live height feedback — the number follows the speaker
// WHAT   Dragging a surround or front-wide speaker in the Side Elevation
//        publishes the position it is being moved to, continuously, so the
//        control that owns it shows the moving height at two decimals, and the
//        active value turns bold Artcoustic dark green behind the field's own
//        thin green border. The live number is withdrawn on release, after the
//        single commit that saves the position; the highlight's five second hold
//        then returns the field to normal on its own.
// WHY    Move the speaker, watch the number move with it, release, and the
//        interface quietly returns to normal — with nothing written per mouse
//        movement and no second store of the design.
//
// The live position stream is exercised directly; the wiring between the gesture
// and the control is pinned as a source contract, because it is the connection
// itself under test.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  publishLiveSpeakerPosition,
  clearLiveSpeakerPosition,
  getLiveSpeakerPosition,
  releaseSpeakerHighlight,
} from '@/components/state/speakerSelectionStore';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

const store = read('src/components/state/speakerSelectionStore.js');
const drag = read('src/components/room/sideview/useSideSpeakerDrag.js');
const field = read('src/components/room/surrounds/AcousticCentreHeightField.jsx');
const readout = read('src/components/room/SpeakerPositionsReadout.jsx');

// ── 1. The live position itself ───────────────────────────────────────────

test('TEST 1  A gesture publishes the position it is moving to, live', () => {
  clearLiveSpeakerPosition();
  assert.equal(getLiveSpeakerPosition().role, null, 'nothing is live before a drag');

  publishLiveSpeakerPosition({ role: 'lw', z: 1.21, y: 3.2 });
  assert.equal(getLiveSpeakerPosition().role, 'LW', 'the role is canonical');
  assert.equal(getLiveSpeakerPosition().z, 1.21, 'the height follows the mouse');

  // Continuous movement: every new position is published, to the millimetre.
  publishLiveSpeakerPosition({ role: 'LW', z: 1.22, y: 3.2 });
  const moved = getLiveSpeakerPosition().token;
  assert.equal(getLiveSpeakerPosition().z, 1.22, '1.21 → 1.22 while the mouse is still down');
  publishLiveSpeakerPosition({ role: 'LW', z: 1.23, y: 3.2 });
  assert.ok(getLiveSpeakerPosition().token > moved, 'each movement is a new position');

  // The horizontal position travels with it.
  publishLiveSpeakerPosition({ role: 'LW', z: 1.23, y: 3.31 });
  assert.equal(getLiveSpeakerPosition().y, 3.31, 'the along-wall position moves too');

  // A still mouse wakes nothing.
  const steady = getLiveSpeakerPosition().token;
  publishLiveSpeakerPosition({ role: 'LW', z: 1.23, y: 3.31 });
  assert.equal(getLiveSpeakerPosition().token, steady, 'an unchanged position raises no work');

  clearLiveSpeakerPosition();
  assert.equal(getLiveSpeakerPosition().role, null, 'and it is withdrawn when the drag ends');

  // Display state only: it holds no project data and reaches no service.
  const liveSection = store.slice(store.indexOf('The LIVE POSITION'));
  assert.ok(!/base44|entities\.|localStorage|sessionStorage/.test(liveSection));
});

// ── 2. The drawing end ────────────────────────────────────────────────────

test('TEST 2  The gesture publishes it, and still writes once — on release', () => {
  assert.ok(
    drag.includes('publishLiveSpeakerPosition({ role, z: startZ, y: startY })'),
    'the gesture publishes where it starts, so the control never jumps',
  );
  assert.ok(
    drag.includes('publishLiveSpeakerPosition({ role, z: drag.startZ, y })'),
    'a horizontal move publishes live',
  );
  assert.ok(
    drag.includes('publishLiveSpeakerPosition({ role, z: drag.live.z, y: drag.startY })'),
    'a vertical move publishes live',
  );

  // Nothing is written while the mouse moves: one commit, on release.
  assert.equal((drag.match(/commitRef\.current\(commit\)/g) || []).length, 1, 'one write per drag');
  const commitIndex = drag.indexOf('commitRef.current(commit)');
  const clearIndex = drag.indexOf('clearLiveSpeakerPosition();', commitIndex);
  assert.ok(clearIndex > commitIndex, 'the live number is withdrawn after the commit, never before');
  assert.ok(drag.includes('clearLiveSpeakerPosition()'), 'and the gesture cleans up after itself');
  assert.ok(!drag.includes('base44'), 'no database write is reached from a drag');
});

// ── 3. The control end ────────────────────────────────────────────────────

test('TEST 3  The control shows the live height, at two decimals, for its own speakers', () => {
  assert.ok(
    field.includes('useLiveSpeakerPositionForRoles(lightRoles)'),
    'the control reads the live position of the speakers it governs',
  );
  assert.ok(
    field.includes('value={editing ? text : asText(liveZ ?? valueM)}'),
    'the live height is shown while the speaker moves, the stored value otherwise',
  );
  assert.ok(field.includes('toFixed(2)'), 'shown to two decimals');

  // Only the control that owns the moving speaker. The matching is by role, and
  // it lives in the one shared authority rather than being re-derived here.
  assert.ok(
    store.includes('normaliseRoles(roles).includes(live.role)'),
    'the live position is matched to the exact roles',
  );
  assert.ok(!field.includes('livePosition.role ==='), 'with no second, looser rule of its own');
});

test('TEST 4  The active value is bold, dark green, behind its own thin green border', () => {
  assert.ok(
    field.includes('color: lit ? HIGHLIGHT_GREEN : "#1B1A1A"'),
    'the value turns Artcoustic dark green',
  );
  assert.ok(field.includes('fontWeight: lit ? 700 : 400'), 'and bold while it moves');
  assert.ok(
    field.includes('borderColor: lit ? HIGHLIGHT_GREEN : undefined'),
    'the existing border turns green',
  );
  assert.ok(!field.includes('ring-2'), 'no outline is added');
  assert.ok(!field.includes('border-2'), 'the border stays thin');
  assert.ok(!field.includes('shadow'), 'and nothing is boxed or panel-like');
  assert.ok(
    field.includes('transition-colors duration-500 ease-out'),
    'it returns to normal smoothly',
  );

  // The same behaviour typing in the field: one light, one timer, one authority.
  assert.ok(field.includes('beginSpeakerHighlight(lightRoles)'), 'editing lights the same speakers');
  assert.ok(field.includes('settleSpeakerHighlight()'), 'and starts the same five second hold');
});

test('TEST 5  Release saves once, then the field returns to normal on its own', () => {
  assert.ok(store.includes('HIGHLIGHT_HOLD_MS = 5000'), 'the hold is five seconds');
  assert.ok(drag.includes('onRelease'), 'the drawing settles the light when the hands come off');
  assert.ok(
    !drag.includes('settleSpeakerHighlight('),
    'the hold is never restarted from the gesture itself — movement restarts it',
  );

  releaseSpeakerHighlight();
  clearLiveSpeakerPosition();
  assert.equal(getLiveSpeakerPosition().role, null, 'nothing is left live and nothing left marked');
});

// ── 4. Everywhere else the position is shown ──────────────────────────────

test('TEST 6  The installer table shows the moving position too', () => {
  assert.ok(readout.includes('useLiveSpeakerPosition()'), 'the table reads the live position');
  assert.ok(
    readout.includes("String(speaker?.role || '').toUpperCase() !== draggingRole"),
    'only the moving speaker is substituted',
  );
  assert.ok(readout.includes('livePosition.y ?? speaker?.position?.y'), 'its along-wall position is live');
  assert.ok(
    readout.includes('recommendedBedHeightM, livePosition]);'),
    'and the table follows it',
  );
  assert.ok(!readout.includes('base44'), 'nothing is saved from a drag');
});