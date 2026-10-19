// ---------------------------------------------------------------------------
// TEST   Elevation drawing and control panel — one connected interface
// WHAT   Selecting a speaker in the drawing names that speaker alone, highlights
//        its control and brings it into view; selecting a control highlights the
//        whole group it governs; SL, SL1, SR and SR1 stay individually
//        identifiable; the selection is UI state that writes nothing, survives a
//        change of view, and is read from the canonical role and position data.
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
} from '@/components/state/speakerSelectionStore';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

const store = read('src/components/state/speakerSelectionStore.js');
const drawing = read('src/components/room/SideElevation.jsx');
const panel = read('src/components/room/UnifiedSurroundsConfig.jsx');
const field = read('src/components/room/surrounds/AcousticCentreHeightField.jsx');
const card = read('src/components/room/surrounds/SelectedSpeakerCard.jsx');
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

test('TEST 4  The drawing highlights the selection from canonical roles', () => {
  assert.ok(drawing.includes('useSpeakerSelection()'), 'the drawing reads the shared selection');
  assert.ok(drawing.includes('selectionStateFor'), 'one authority decides the highlight');
  assert.ok(drawing.includes("return 'selected'"), 'the picked speaker is marked as selected');
  assert.ok(drawing.includes("? 'group' : null"), 'a governed group is marked as a group');
  assert.ok(drawing.includes("stroke={selState === 'selected'"), 'the mark is drawn on the cabinet');
  assert.ok(
    drawing.includes('setSpeakerSelection({ roles, primary, source: \'drawing\' })'),
    'the drawing is the source of its own selection',
  );
  // It highlights exactly the roles it was given: it never re-derives a group,
  // so an individual selection cannot pull in another speaker.
  assert.ok(!drawing.includes('groupForSurroundRole'), 'the drawing derives no grouping of its own');
});

test('TEST 5  Selecting begins the same gesture as dragging', () => {
  assert.ok(drawing.includes('beginWallInteraction'), 'one interaction helper');
  assert.ok(
    drawing.includes('if (dragStart) handleSpeakerMouseDown(event, primary, dragStart)'),
    'the highlight is in place before the drag starts',
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

test('TEST 7  A control names the speakers it governs and takes the selection', () => {
  assert.ok(field.includes('onEngage'), 'a control can be engaged');
  assert.ok(field.includes('onPointerDown={engage}'), 'touching it selects its speakers');
  assert.ok(field.includes('highlight'), 'it can be highlighted');
  assert.ok(field.includes("id={group ? `acoustic-centre-${group}`"), 'it is addressable by group');

  ['side', 'rear', 'wide'].forEach((group) => {
    assert.ok(panel.includes(`group="${group}"`), `${group} control names its group`);
    assert.ok(
      panel.includes(`highlight={selectedGroup === '${group}'}`),
      `${group} control highlights when its speakers are selected`,
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
  assert.ok(panel.includes('SelectedSpeakerCard'), 'what is selected is always named');
});

test('TEST 9  The selected speaker reads back its identity, height and position', () => {
  assert.ok(card.includes('Acoustic centre'), 'the acoustic centre is shown');
  assert.ok(card.includes('from front wall'), 'the along-wall position is shown');
  assert.ok(card.includes('acousticCentreM'), 'the height is the stored value');
  assert.ok(card.includes('groupRoles'), 'a group selection names its speakers');

  assert.ok(
    panel.includes('Number(selectedSpeaker.position.z)'),
    'the height is read from the speaker itself',
  );
  assert.ok(
    panel.includes("list.find(") && panel.includes('=== selection.primary'),
    'the speaker is matched by its exact role',
  );
});

test('TEST 10  A speaker picked in the drawing opens the panel that adjusts it', () => {
  assert.ok(placement.includes('useSpeakerSelection()'), 'the panel holder reads the selection');
  assert.ok(
    placement.includes("if (selection.source === 'drawing' && selection.primary) setSurroundsPanelOpen(true);"),
    'a drawing selection opens the surround controls',
  );
  assert.ok(placement.includes('isOpen={surroundsPanelOpen}'), 'the panel is opened, not just scrolled');
});