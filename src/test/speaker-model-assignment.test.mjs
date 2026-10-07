// speaker-model-assignment.test.mjs
// ---------------------------------------------------------------------------
// Speaker model assignment defaults. A speaker role exists because the FORMAT
// requires it; it is INSTALLED only when the user selects a model for it.
//
//   TEST 1  New project roles               → all Not Selected
//   TEST 2  Selecting a model               → the speakers appear
//   TEST 3  Clearing a model                → the speakers are removed
//   TEST 4  Explicitly assigned models      → preserved
//   TEST 5  Format change                   → assigns no model automatically
//   TEST 6  Save and reopen                 → assignments survive, nothing invented
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  seedSpeakersFromPreset,
  ensureAtmosOverheads,
  getTargetOverheadIds,
} from '../components/room/utils/dolbyHelpers.jsx';
import {
  assignModelsForRoles,
  clearModelsForRoles,
  refreshAssignedModels,
  resolveOverheadModelForRole,
  isAssignedModel,
} from '../components/room/utils/speakerAssignmentAuthority.js';

const RECON_SRC = fs.readFileSync('src/components/hooks/useSpeakerReconciliation.jsx', 'utf8');
const SAFETY_SRC = fs.readFileSync('src/components/room/hooks/useFinalSafetyPass.jsx', 'utf8');
const PROJECT_ENTITY_SRC = fs.readFileSync('base44/entities/Project.jsonc', 'utf8');
const OVERHEAD_PANEL_SRC = fs.readFileSync('src/components/room/OverheadChannelsPanel.jsx', 'utf8');

const DIMS = { width: 4.5, length: 6.0, height: 2.8 };

const unassignedRoles = (speakers) => (Array.isArray(speakers) ? speakers : [])
  .filter((s) => !isAssignedModel(s?.model))
  .map((s) => String(s?.role));

// TEST 1 — A new project establishes the format's roles with no model on any of
// them. A model is equipment, and the designer has not chosen one yet.
test('new project: every seeded role is Not Selected', () => {
  for (const preset of ['5.1.4', '7.1.4', '9.1.4', '9.1.6']) {
    const seeded = seedSpeakersFromPreset({ preset, roomDimensions: DIMS });
    assert.ok(seeded.length > 0, `expected roles for ${preset}`);
    assert.equal(
      unassignedRoles(seeded).length,
      seeded.length,
      `${preset} must seed every role Not Selected`,
    );

    // The overhead pass only adds roles and locations — never a model.
    const withOverheads = ensureAtmosOverheads({
      placedSpeakers: seeded,
      dolbyPreset: preset,
      roomDimensions: DIMS,
      overheadGlobalModel: 'architect-2-1',
      overheadFrontOverride: null,
      overheadMidOverride: null,
      overheadRearOverride: null,
      useFrontGlobal: true,
      useMidGlobal: true,
      useRearGlobal: true,
    });
    assert.equal(
      unassignedRoles(withOverheads).length,
      withOverheads.length,
      `${preset} must keep every role Not Selected after the overhead pass`,
    );
  }
});

// TEST 1b — A new project starts with no overhead model selected at all.
test('new project: no built-in default overhead model', () => {
  const overheadField = PROJECT_ENTITY_SRC
    .split('"overhead_global_model"')[1]
    .split('}')[0];
  assert.ok(
    !overheadField.includes('"default"'),
    'the Project entity must not default overhead_global_model',
  );
  assert.ok(
    !PROJECT_ENTITY_SRC.includes('"default": "architect-2-1"'),
    'the architect-2-1 default must be gone',
  );
});

// TEST 2 — Selecting a model is the user action that installs the equipment.
// Every overhead role the current format requires receives the model.
test('selecting an overhead model displays the required overheads', () => {
  const roles = getTargetOverheadIds('5.1.4');
  assert.deepEqual(roles, ['TFL', 'TFR', 'TRL', 'TRR']);

  const seeded = seedSpeakersFromPreset({ preset: '5.1.4', roomDimensions: DIMS });
  const selection = {
    globalModel: 'architect-2-1',
    frontOverride: null,
    midOverride: null,
    rearOverride: null,
    useFrontGlobal: true,
    useMidGlobal: true,
    useRearGlobal: true,
  };

  const assigned = assignModelsForRoles(
    seeded,
    roles,
    (role) => resolveOverheadModelForRole(role, selection),
  );

  const installed = assigned.filter((s) => roles.includes(String(s.role)) && isAssignedModel(s.model));
  assert.equal(installed.length, roles.length, 'every required overhead must be installed');
  for (const role of roles) {
    const speaker = assigned.find((s) => String(s.role) === role);
    assert.equal(speaker.model, 'architect-2-1');
  }
  // Bed roles are untouched by the overhead selection.
  assert.ok(!isAssignedModel(assigned.find((s) => s.role === 'SL')?.model));
});

// TEST 3 — Clearing the model removes the speakers again; positions and roles
// are left exactly as they were so re-selecting restores them.
test('clearing an overhead model removes the overheads', () => {
  const roles = getTargetOverheadIds('5.1.4');
  const position = { x: 1.2, y: 2.4, z: 2.6 };
  const seeded = seedSpeakersFromPreset({ preset: '5.1.4', roomDimensions: DIMS })
    .map((s) => (roles.includes(String(s.role)) ? { ...s, model: 'architect-2-1', position } : s));

  const cleared = clearModelsForRoles(seeded, roles);

  for (const role of roles) {
    const speaker = cleared.find((s) => String(s.role) === role);
    assert.ok(!isAssignedModel(speaker.model), `${role} must be Not Selected`);
    assert.deepEqual(speaker.position, position, `${role} must keep its position`);
  }
});

// TEST 4 — A model the designer has explicitly assigned is never removed or
// overwritten by the automatic passes.
test('explicitly assigned models are preserved', () => {
  const speakers = [
    { id: 'FL', role: 'FL', model: 'evolve-2-1' },
    { id: 'SL', role: 'SL', model: 'evolve-2-1' },
    { id: 'SR', role: 'SR', model: 'evolve-2-1' },
    { id: 'TFL', role: 'TFL', model: 'architect-2-1' },
    { id: 'TRR', role: 'TRR', model: undefined },
  ];

  // The automatic refresh pass only touches roles that are already assigned.
  const refreshed = refreshAssignedModels(
    speakers,
    (spk) => String(spk?.role || '').startsWith('T'),
    () => 'architect-4-2-mk2',
  );
  assert.equal(refreshed.find((s) => s.role === 'TFL').model, 'architect-4-2-mk2');
  assert.ok(!isAssignedModel(refreshed.find((s) => s.role === 'TRR').model), 'unassigned stays unassigned');
  assert.equal(refreshed.find((s) => s.role === 'SL').model, 'evolve-2-1');
  assert.equal(refreshed.find((s) => s.role === 'FL').model, 'evolve-2-1');
});

// TEST 5 — Format changes add roles and locations. They never add a model, so
// the automatic passes hold no source of an inherited model.
test('format changes introduce no automatically assigned models', () => {
  for (const forbidden of [
    'pickSurroundModel',
    'globalSurroundModelEarly',
    'anySurroundModelEarly',
    'modelFromOverrides',
    'globalSurroundModelFinal',
    '__SURROUND_MODEL_HINT_',
  ]) {
    assert.ok(
      !RECON_SRC.includes(forbidden),
      `reconciliation must not carry an automatic model source: ${forbidden}`,
    );
  }

  // Roles newly introduced by the pass are created without a model.
  assert.ok(
    /const pushIfMissing = \(role\) => \{[\s\S]*?model: undefined/.test(RECON_SRC),
    'a newly pushed role must be created Not Selected',
  );
  assert.ok(
    /const ensureFinal = \(role\) => \{[\s\S]*?model: undefined/.test(RECON_SRC),
    'a finally ensured role must be created Not Selected',
  );
  assert.ok(
    /nextOverheads\.push\(\{ \.\.\.seeded, model: undefined, draggable: true \}\)/.test(RECON_SRC),
    'a newly introduced overhead role must be created Not Selected',
  );

  // The rear-speaker safety pass no longer installs the selected surround model.
  assert.ok(
    !SAFETY_SRC.includes('masterModelValid ? masterModel : null'),
    'the safety pass must not assign a model to a newly introduced rear role',
  );
});

// TEST 6 — Save and reopen restores the assigned models exactly, and an
// unassigned role stays unassigned.
test('save and reopen keeps assignments and invents nothing', () => {
  // The saved design state is what the designer's own selections produced.
  const saved = [
    { id: 'FL', role: 'FL', model: 'evolve-2-1', position: { x: 1, y: 0.1, z: 1.2 } },
    { id: 'SL', role: 'SL', model: 'evolve-2-1', position: { x: 0.01, y: 3.6, z: 1.1 } },
    { id: 'TFL', role: 'TFL', model: 'architect-2-1', position: { x: 1.2, y: 2.1, z: 2.6 } },
    { id: 'TRR', role: 'TRR', model: undefined, position: null },
  ];

  // A reload runs the refresh pass only. Nothing may appear or disappear.
  const reopened = refreshAssignedModels(
    saved,
    (spk) => String(spk?.role || '').startsWith('T'),
    (spk) => resolveOverheadModelForRole(spk.role, {
      globalModel: 'architect-2-1',
      useFrontGlobal: true, useMidGlobal: true, useRearGlobal: true,
    }),
  );

  assert.deepEqual(reopened, saved, 'a reload must not change a single assignment');

  // The overhead control's assignment path is wired for the user action only.
  assert.ok(
    OVERHEAD_PANEL_SRC.includes('assignModelsForRoles'),
    'the overhead control must assign models through the shared authority',
  );
  assert.ok(
    OVERHEAD_PANEL_SRC.includes('getTargetOverheadIds(effectivePreset)'),
    'the overhead control must scope assignment to the format’s overhead roles',
  );
});