// project-opening-readiness.test.mjs
// ---------------------------------------------------------------------------
// Opening a saved project must hold the loading panel until the design has been
// restored AND the main project authorities are ready — or are known to be
// unavailable, with a reason. The panel must never mean "the project record has
// loaded", must never flash, and must never hang.
//
//   TEST 1  A fresh opening holds the panel while any checkpoint is pending
//   TEST 2  The panel does not close before the minimum visible duration
//   TEST 3  It closes once every checkpoint is definite and the minimum elapsed
//   TEST 4  A dependency that never confirms becomes a definite "not confirmed"
//   TEST 5  A project already opened in this session never shows the panel again
//   TEST 6  A newly selected project holds before its opening has even begun
//   TEST 7  The panel publishes the nine requested progress lines, in order
//   TEST 8  The gate, panel copy and resolver are wired to this one authority
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  OPENING_CHECKPOINT_STATE,
  PROJECT_OPENING_CHECKPOINT_KEYS,
  PROJECT_OPENING_LINES,
  PROJECT_OPENING_MIN_VISIBLE_MS,
  PROJECT_OPENING_TIMEOUT_MS,
  _resetProjectOpeningForTest,
  beginProjectOpening,
  deriveOpeningReadiness,
  expirePendingOpeningCheckpoints,
  getProjectOpening,
  isProjectOpeningSatisfied,
  markOpeningMinVisibleElapsed,
  openingProgressLines,
  resolveProjectOpeningCheckpoints,
} from '../components/state/projectOpeningAuthority.js';

const PROJECT = 'project-1';
const VERSION = 'version-1';

const resolveAll = (state = OPENING_CHECKPOINT_STATE.READY) => {
  resolveProjectOpeningCheckpoints(Object.fromEntries(
    PROJECT_OPENING_CHECKPOINT_KEYS.map((key) => [key, { state, detail: `${key} resolved` }]),
  ));
};

const start = (options = {}) => {
  _resetProjectOpeningForTest();
  beginProjectOpening(PROJECT, { versionId: VERSION, minVisibleMs: 0, timeoutMs: 0, ...options });
};

test('TEST 1 — a fresh opening holds while any checkpoint is still pending', () => {
  start();
  assert.equal(deriveOpeningReadiness(getProjectOpening(), PROJECT).holding, true, 'holds while pending');

  resolveProjectOpeningCheckpoints({ metadata: { state: OPENING_CHECKPOINT_STATE.READY } });
  assert.equal(deriveOpeningReadiness(getProjectOpening(), PROJECT).holding, true, 'one resolved checkpoint is not enough');

  resolveAll();
  assert.equal(deriveOpeningReadiness(getProjectOpening(), PROJECT).holding, false, 'all resolved, no minimum, opens');
  assert.equal(getProjectOpening().closed, true);
});

test('TEST 2 — the panel does not close before the minimum visible duration', () => {
  start({ minVisibleMs: PROJECT_OPENING_MIN_VISIBLE_MS });
  resolveAll();

  const held = deriveOpeningReadiness(getProjectOpening(), PROJECT);
  assert.equal(held.holding, true, 'min-visible holds the panel even when everything is ready');
  assert.equal(getProjectOpening().closed, false, 'the project is not open yet');
  assert.equal(isProjectOpeningSatisfied(PROJECT), false);
});

test('TEST 3 — it closes once every checkpoint is definite and the minimum has elapsed', () => {
  start({ minVisibleMs: PROJECT_OPENING_MIN_VISIBLE_MS });
  resolveAll({ state: OPENING_CHECKPOINT_STATE.UNAVAILABLE });
  markOpeningMinVisibleElapsed();

  const opened = deriveOpeningReadiness(getProjectOpening(), PROJECT);
  assert.equal(opened.holding, false, 'unavailable-with-a-reason still opens the project');
  assert.equal(opened.closed, true);
  assert.equal(isProjectOpeningSatisfied(PROJECT), true);
  assert.ok(PROJECT_OPENING_TIMEOUT_MS > PROJECT_OPENING_MIN_VISIBLE_MS, 'the timeout is the longer bound');
});

test('TEST 4 — a dependency that never confirms becomes a definite "not confirmed"', () => {
  start();
  resolveProjectOpeningCheckpoints({ metadata: { state: OPENING_CHECKPOINT_STATE.READY } });
  expirePendingOpeningCheckpoints();

  const snapshot = getProjectOpening();
  assert.equal(snapshot.closed, true, 'the panel cannot hang');
  assert.equal(snapshot.timedOut, true);
  assert.equal(deriveOpeningReadiness(snapshot, PROJECT).holding, false);

  PROJECT_OPENING_CHECKPOINT_KEYS
    .filter((key) => key !== 'metadata')
    .forEach((key) => {
      assert.equal(snapshot.checkpoints[key].state, OPENING_CHECKPOINT_STATE.UNAVAILABLE, `${key} is definite`);
      assert.ok(snapshot.checkpoints[key].detail, `${key} carries a reason`);
    });
  assert.equal(snapshot.checkpoints.metadata.state, OPENING_CHECKPOINT_STATE.READY, 'a resolved checkpoint is not overwritten');
});

test('TEST 5 — a project already opened in this session never shows the panel again', () => {
  start();
  resolveAll();
  assert.equal(isProjectOpeningSatisfied(PROJECT), true);

  _resetProjectOpeningForTest();
  beginProjectOpening(PROJECT, { versionId: VERSION });
  const reopened = deriveOpeningReadiness(getProjectOpening(), PROJECT);
  assert.equal(reopened.holding, false, 'SPA navigation inside an open project does not re-gate');
});

test('TEST 6 — a newly selected project holds before its opening has even begun', () => {
  start();
  const switched = deriveOpeningReadiness(getProjectOpening(), 'project-2');
  assert.equal(switched.holding, true, 'no frame of the previous project can appear');
  assert.equal(switched.begun, false);
  assert.equal(switched.pending.length, PROJECT_OPENING_CHECKPOINT_KEYS.length);
  assert.equal(deriveOpeningReadiness(getProjectOpening(), null).holding, false, 'no project means no panel');
});

test('TEST 7 — the panel publishes the nine requested progress lines, in order', () => {
  start();
  const labels = PROJECT_OPENING_LINES.map((line) => line.label);
  assert.deepEqual(labels, [
    'Room and seating',
    'Speaker layout',
    'RP22 / RP23 results',
    'Bass performance',
    'Bass target bank',
    'Visual Report',
    'Technical Report',
    'Proposal source data',
    'Pricing',
  ]);

  const lines = openingProgressLines(getProjectOpening(), PROJECT);
  assert.equal(lines.length, 9);
  lines.forEach((line) => assert.equal(line.state, OPENING_CHECKPOINT_STATE.PENDING, `${line.key} starts pending`));
  assert.ok(PROJECT_OPENING_CHECKPOINT_KEYS.includes('autosaveBaseline'), 'the autosave baseline also gates opening');
});

test('TEST 8 — the gate, panel copy and resolver are wired to this one authority', () => {
  const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');
  const gate = read('src/components/state/ProjectGate.jsx');
  const shell = read('src/components/state/ProjectLoadingShell.jsx');
  const resolver = read('src/components/state/ProjectOpeningResolver.jsx');
  const hydrator = read('src/components/state/ProjectDesignHydrator.jsx');
  const commercial = read('src/components/state/commercialHydrationAuthority.js');

  assert.ok(gate.includes('useProjectOpening') && gate.includes('opening.holding'), 'the gate holds on the opening authority');
  assert.ok(gate.includes('ProjectOpeningResolver'), 'the gate mounts the resolver');
  assert.ok(shell.includes('Loading Project'), 'the panel states Loading Project');
  assert.ok(
    shell.includes('Restoring saved design, performance results, reports and pricing.'),
    'the panel carries the requested sentence',
  );
  assert.ok(shell.includes('lines.map'), 'the panel renders the progress lines');

  assert.ok(resolver.includes('fetchDurablePublication'), 'bass/RP22 authority is read from the durable publication');
  assert.ok(resolver.includes('resolveProposalSource'), 'report and proposal source states use the canonical resolver');
  assert.ok(resolver.includes('hydrateTargetCache'), 'the P14 target bank is restored (not recalculated)');
  assert.ok(!resolver.includes('setTargetCacheEntry'), 'the resolver never writes target results');
  assert.ok(!resolver.includes('publishBassPendingIndicator'), 'the resolver never publishes a pending bass state');
  assert.ok(!resolver.includes('publishDesignReviewHandoff'), 'the resolver never publishes authoritative results');

  assert.ok(commercial.includes('getActiveCommercialAuthority'), 'pricing readiness reads the commercial authority');
  assert.ok(hydrator.includes('markCommercialHydrated'), 'the hydrator marks the priced selections as loaded');
});