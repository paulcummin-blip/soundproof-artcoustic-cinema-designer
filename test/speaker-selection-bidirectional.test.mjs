// ---------------------------------------------------------------------------
// TEST   Elevation drawing and control panel — one connected interface
// WHAT   Selecting a speaker in the drawing names that speaker alone, brings its
//        control into view and opens the panel; selecting a control names the
//        whole group it governs; SL, SL1, SR and SR1 stay individually
//        identifiable; the selection is UI state that writes nothing, survives a
//        change of view, and is read from the canonical role and position data.
// WHAT   The highlight is a MOVEMENT cue, not a state: the speaker's
//        identification text in the drawing and its control's label and value
//        turn Artcoustic dark green while it moves, hold for five seconds after
//        it stops, then return to normal. Nothing is ever left outlined.
// WHY    A designer must never have to work out which control belongs to which
//        loudspeaker. The drawing is an interactive representation of the design,
//        not a separate illustration.
//
// The selection store is exercised directly; the wiring between the two ends is
// pinned as a source contract, because it is the connection itself under test.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  setSpeakerSelection,
  getSpeakerSelection,
  clearSpeakerSelection,
  beginSpeakerHighlight,
  settleSpeakerHighlight,
  releaseSpeakerHighlight,
  getSpeakerHighlight,
  HIGHLIGHT_HOLD_MS,
} from '@/components/state/speakerSelectionStore';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

const store = read('src/components/state/speakerSelectionStore.js');
const drawing = read('src/components/room/SideElevation.jsx');
const panel = read('src/components/room/UnifiedSurroundsConfig.jsx');
const field = read('src/components/room/surrounds/AcousticCentreHeightField.jsx');
const placement = read('src/components/room/SpeakerPlacement.jsx');

const reset = () => clearSpeakerSelection();

// ── 1. The selection itself ───────────────────────────────────────────────

test('TEST 1  A speaker picked in the drawing is selected on its own', () => {
  reset();
  setSpeakerSelection({ primary: 'SL1', roles: ['SL1'], source: 'drawing' });

  const selection = getSpeakerSelection();
  assert.equal(selection.primary, 'SL1');
  assert.deepEqual(selection.roles, ['SL1']);
  assert.equal(selection.source, 'drawing');
  assert.equal(selection.group, null, 'one speaker is never a group selection');
});

test('TEST 1b SL, SL1, SR and SR1 are each identifiable — never co-selected', () => {
  reset();
  ['SL', 'SL1', 'SR', 'SR1'].forEach((role) => {
    setSpeakerSelection({ primary: role, roles: [role], source: 'drawing' });
    const selection = getSpeakerSelection();
    assert.equal(selection.primary, role);
    assert.deepEqual(selection.roles, [role], `${role} selects nothing else`);
  });
});

test('TEST 2  A control selects the whole group it governs', () => {
  reset();
  setSpeakerSelection({ group: 'side', roles: ['sl', 'sr'], source: 'panel' });

  const selection = getSpeakerSelection();
  assert.equal(selection.group, 'side');
  assert.deepEqual(selection.roles, ['SL', 'SR'], 'roles are canonical and upper case');
  assert.equal(selection.primary, null, 'a group selection names no single speaker');
});

test('TEST 3  A repeated selection is not a new selection', () => {
  reset();
  setSpeakerSelection({ primary: 'SL', roles: ['SL'], source: 'drawing' });
  const first = getSpeakerSelection().token;

  setSpeakerSelection({ primary: 'SL', roles: ['SL'], source: 'drawing' });
  assert.equal(getSpeakerSelection().token, first, 'the same choice raises no new work');

  setSpeakerSelection({ primary: 'SR', roles: ['SR'], source: 'drawing' });
  assert.ok(getSpeakerSelection().token > first, 'a different speaker is a new selection');

  clearSpeakerSelection();
  assert.deepEqual(getSpeakerSelection().roles, []);
  assert.equal(getSpeakerSelection().primary, null);
});

// ── 2. The drawing end ────────────────────────────────────────────────────

test('TEST 4  The drawing turns the identification text green — never leaves an outline', () => {
  assert.ok(drawing.includes('useSpeakerHighlight()'), 'the drawing reads the shared light');
  assert.ok(drawing.includes('const isLit = (role) =>'), 'one authority decides the highlight');
  assert.ok(
    drawing.includes('? HIGHLIGHT_GREEN : LABEL_COLOR'),
    'the speaker identification text turns Artcoustic dark green',
  );
  assert.equal(
    (drawing.match(/transition: 'fill 400ms ease-out'/g) || []).length,
    2,
    'and returns to its normal colour smoothly',
  );
  assert.ok(!drawing.includes('Selection outline'), 'no selection outline is drawn');
  assert.ok(!drawing.includes('selState'), 'and nothing is left marked on a selected speaker');
  assert.ok(
    drawing.includes('setSpeakerSelection({ roles, primary, source: \'drawing\' })'),
    'the drawing is the source of its own selection',
  );
  // It lights exactly the roles it was given: it never re-derives a group, so an
  // individual speaker cannot pull in another.
  assert.ok(!drawing.includes('groupForSurroundRole'), 'the drawing derives no grouping of its own');
});

test('TEST 5  Selecting begins the same gesture as dragging, and lights it', () => {
  assert.ok(drawing.includes('beginWallInteraction'), 'one interaction helper');
  assert.ok(
    drawing.includes('if (dragStart) handleSpeakerMouseDown(event, primary, dragStart)'),
    'the highlight is in place before the drag starts',
  );
  assert.ok(
    drawing.includes('beginSpeakerHighlight(roles)'),
    'movement begins the green, here and in the panel',
  );
  assert.ok(
    drawing.includes('onRelease: settleSpeakerHighlight'),
    'and release starts the five second hold',
  );
  // Every wall-speaker gesture goes through it — the marker, its hit area and the
  // rear-wall group — so no speaker can be dragged without being identified.
  assert.equal((drawing.match(/beginWallInteraction\(e,/g) || []).length, 3);
});

test('TEST 6  Selection is UI state — it writes nothing and no view owns it', () => {
  assert.ok(store.includes('let selection = EMPTY'), 'one module-level selection, owned by no view');
  assert.ok(!/base44|entities\.|localStorage|sessionStorage/.test(store), 'it stores nothing and saves nothing');

  // The store is not cleared when a view unmounts, so moving between the plan,
  // front and side views keeps the designer on the same speaker.
  assert.ok(!drawing.includes('clearSpeakerSelection()'), 'a view never discards the selection');
});

// ── 3. The control end ────────────────────────────────────────────────────

test('TEST 7  A control names the speakers it governs and lights only those', () => {
  assert.ok(field.includes('onEngage'), 'a control can be engaged');
  assert.ok(field.includes('onPointerDown={engage}'), 'touching it selects its speakers');
  assert.ok(field.includes('lightRoles'), 'it knows which speakers it governs');
  assert.ok(field.includes("id={group ? `acoustic-centre-${group}`"), 'it is addressable by group');

  // Text colour only: the control keeps its clean border and is never outlined,
  // and red stays reserved for invalid placement warnings.
  assert.ok(!field.includes('ring-2'), 'the control is never outlined');
  assert.ok(!/4A230F|red-|#B91C1C/.test(field), 'no red is used for the light');
  assert.ok(field.includes('beginSpeakerHighlight(lightRoles)'), 'editing lights the speakers it moves');
  assert.ok(field.includes('settleSpeakerHighlight()'), 'the hold starts when editing finishes');
  assert.ok(field.includes('HIGHLIGHT_GREEN'), 'the label and the value turn dark green');
  assert.ok(
    field.includes('transition-colors duration-500 ease-out'),
    'the text returns to normal smoothly',
  );

  ['side', 'rear', 'wide'].forEach((group) => {
    assert.ok(panel.includes(`group="${group}"`), `${group} control names its group`);
    assert.ok(
      panel.includes(`lightRoles={rolesForGroup('${group}')}`),
      `${group} control lights exactly the speakers it governs`,
    );
    assert.ok(
      panel.includes(`onEngage={() => engageGroup('${group}')}`),
      `${group} control selects its whole group`,
    );
  });
});

test('TEST 8  The panel names the selection and brings its control into view', () => {
  assert.ok(panel.includes("document.getElementById(`acoustic-centre-${selectedGroup}`)"));
  assert.ok(panel.includes('scrollIntoView'), 'the matching control is scrolled to');
  assert.ok(
    panel.includes("if (selection.source !== 'drawing' || !selectedGroup) return undefined;"),
    'only a selection made in the drawing moves the panel',
  );
  assert.ok(
    panel.includes("setSpeakerSelection({ group, roles: rolesForGroup(group), source: 'panel' })"),
    'a group control selects exactly the speakers installed in that group',
  );
  assert.ok(!panel.includes('SelectedSpeakerCard'), 'and it shows no selection box');
});

test('TEST 9  The panel keeps its controls and drops every explanation', () => {
  ['Side Surround Height', 'Rear Surround Height', 'Front Wide Height'].forEach((label) => {
    assert.ok(panel.includes(`label="${label}"`), `${label} is a concise label`);
  });

  assert.ok(!panel.includes('SelectedSpeakerCard'), 'the selection box is gone');
  assert.ok(!panel.includes('Acoustic Centre Height is the vertical centre'), 'the paragraph is gone');
  assert.ok(!panel.includes('highlighted control below'), 'no sentence explains the highlight');
  assert.ok(!panel.includes('defaultHint'), 'no helper line sits under the fields');
  assert.ok(!field.includes('hint'), 'and the field carries no helper text of its own');
  assert.ok(
    panel.includes('title="Measured from the finished floor'),
    'the one definition that is not self-evident lives in a discreet tooltip',
  );

  // The controls themselves are untouched.
  assert.ok(panel.includes('SurroundsSelector'), 'surround model selection is untouched');
  assert.ok(panel.includes('engageGroup'), 'and the controls still drive the drawing');
});

test('TEST 10  A speaker picked in the drawing opens the panel that adjusts it', () => {
  assert.ok(placement.includes('useSpeakerSelection()'), 'the panel holder reads the selection');
  assert.ok(
    placement.includes("if (selection.source === 'drawing' && selection.primary) setSurroundsPanelOpen(true);"),
    'a drawing selection opens the surround controls',
  );
  assert.ok(placement.includes('isOpen={surroundsPanelOpen}'), 'the panel is opened, not just scrolled');
});

// ── 4. The light itself ───────────────────────────────────────────────────

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One timeline, deliberately: the hold is about the passage of time, so the
// whole sequence is asserted in the order a designer would live it.
test('TEST 11  Green holds after release, restarts on movement, then returns', async () => {
  assert.equal(HIGHLIGHT_HOLD_MS, 5000, 'the designer asked for five seconds');
  releaseSpeakerHighlight(); // a clean start, whatever ran before

  // Movement begins: lit at once, for the speaker involved alone.
  beginSpeakerHighlight(['RW']);
  assert.equal(getSpeakerHighlight().lit, true, 'green while the speaker moves');
  assert.deepEqual(getSpeakerHighlight().roles, ['RW'], 'and only the speaker that is moving');

  // Release: still green, and it returns on its own. (The same hold, run short
  // so the test stays quick.)
  settleSpeakerHighlight({ hold: 60 });
  await wait(25);
  assert.equal(getSpeakerHighlight().lit, true, 'still green during the hold');
  await wait(70);
  assert.equal(getSpeakerHighlight().lit, false, 'back to normal when the hold ends');
  assert.deepEqual(getSpeakerHighlight().roles, [], 'nothing is left marked');

  // Movement resumes before a hold expires: it stays lit while it keeps moving.
  beginSpeakerHighlight(['RW']);
  settleSpeakerHighlight({ hold: 60 });
  await wait(25);
  beginSpeakerHighlight(['RW']);
  await wait(90);
  assert.equal(getSpeakerHighlight().lit, true, 'still green while the speaker keeps moving');

  settleSpeakerHighlight({ hold: 20 });
  await wait(45);
  assert.equal(getSpeakerHighlight().lit, false, 'and returns once it has stopped');

  // A group control lights exactly the speakers it governs, never the rest.
  beginSpeakerHighlight(['sl', 'sr']);
  assert.deepEqual(getSpeakerHighlight().roles, ['SL', 'SR'], 'canonical roles, only those moved');
  releaseSpeakerHighlight();
  assert.equal(getSpeakerHighlight().lit, false, 'the light is never left on');
});