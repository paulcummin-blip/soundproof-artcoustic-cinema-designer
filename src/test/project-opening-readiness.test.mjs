// project-opening-readiness.test.mjs
// ---------------------------------------------------------------------------
// Opening a saved project must hold the loading panel until EVERY restore stage
// has reached a definite outcome. "Still restoring" is not an outcome: the panel
// may not close on it, and the wait running long may not open the project
// silently.
//
//   TEST 1   A fresh opening holds while any stage is still restoring
//   TEST 2   The panel does not close before the minimum visible duration
//   TEST 3   It closes once every stage is definite and the minimum elapsed
//   TEST 4   The timeout never opens the project — it says it is still restoring
//   TEST 5   Bass still restoring keeps the panel open (the reported bug)
//   TEST 6   Only supporting stages may be continued past, and with a warning
//   TEST 7   Retry re-arms every stage and keeps the panel open
//   TEST 8   "Not generated yet" is not a warning; a failure is
//   TEST 9   Route entry makes that surface's report source a required stage
//   TEST 10  A project already opened in this session never shows the panel again
//   TEST 11  A newly selected project holds before its opening has even begun
//   TEST 12  The panel publishes the nine requested progress lines, in order
//   TEST 13  The gate, panel, resolver and warnings are wired to this authority
// ---------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  OPENING_CHECKPOINT_OUTCOME,
  OPENING_CHECKPOINT_STATE,
  OPENING_ENTRY_SURFACE,
  OPENING_PHASE,
  PROJECT_OPENING_CHECKPOINT_KEYS,
  PROJECT_OPENING_LINES,
  PROJECT_OPENING_MIN_VISIBLE_MS,
  PROJECT_OPENING_TIMEOUT_MS,
  _resetProjectOpeningForTest,
  beginProjectOpening,
  continueProjectOpeningWithWarning,
  criticalOpeningCheckpointKeys,
  deriveOpeningReadiness,
  dismissProjectOpeningWarnings,
  getProjectOpening,
  isProjectOpeningSatisfied,
  markOpeningMinVisibleElapsed,
  markProjectOpeningTimedOut,
  openingCheckpointStage,
  openingCheckpointWarnings,
  openingEntrySurfaceForPath,
  openingProgressLines,
  resetProjectOpening,
  resolveProjectOpeningCheckpoints,
  retryProjectOpening,
} from '../components/state/projectOpeningAuthority.js';

const PROJECT = 'project-1';
const VERSION = 'version-1';

const entry = (state, outcome = null, detail = `${state} stage`) => ({ state, outcome, detail });

const resolveAll = (value = entry(OPENING_CHECKPOINT_STATE.READY, OPENING_CHECKPOINT_OUTCOME.READY)) => {
  resolveProjectOpeningCheckpoints(Object.fromEntries(
    PROJECT_OPENING_CHECKPOINT_KEYS.map((key) => [key, { ...value, detail: `${key} ${value.state}` }]),
  ));
};

const resolveAllExcept = (skipKey, value) => {
  resolveProjectOpeningCheckpoints(Object.fromEntries(
    PROJECT_OPENING_CHECKPOINT_KEYS
      .filter((key) => key !== skipKey)
      .map((key) => [key, { ...value, detail: `${key} ${value.state}` }]),
  ));
};

const start = (options = {}) => {
  _resetProjectOpeningForTest();
  beginProjectOpening(PROJECT, { versionId: VERSION, minVisibleMs: 0, timeoutMs: 0, ...options });
};

const openState = () => deriveOpeningReadiness(getProjectOpening(), PROJECT);

test('TEST 1 — a fresh opening holds while any stage is still restoring', () => {
  start();
  assert.equal(openState().holding, true, 'holds while restoring');
  assert.equal(openState().phase, OPENING_PHASE.RESTORING);

  resolveProjectOpeningCheckpoints({ metadata: { state: OPENING_CHECKPOINT_STATE.READY } });
  assert.equal(openState().holding, true, 'one resolved stage is not enough');

  resolveAll();
  assert.equal(openState().holding, false, 'all resolved, no minimum, opens');
  assert.equal(getProjectOpening().closed, true);
});

test('TEST 2 — the panel does not close before the minimum visible duration', () => {
  start({ minVisibleMs: PROJECT_OPENING_MIN_VISIBLE_MS });
  resolveAll();

  const held = openState();
  assert.equal(held.holding, true, 'min-visible holds the panel even when everything is ready');
  assert.equal(getProjectOpening().closed, false, 'the project is not open yet');
  assert.equal(isProjectOpeningSatisfied(PROJECT), false);
});

test('TEST 3 — it closes once every stage is definite and the minimum has elapsed', () => {
  start({ minVisibleMs: PROJECT_OPENING_MIN_VISIBLE_MS });
  resolveAll(entry(OPENING_CHECKPOINT_STATE.UNAVAILABLE, OPENING_CHECKPOINT_OUTCOME.NOT_GENERATED));
  markOpeningMinVisibleElapsed();

  const opened = openState();
  assert.equal(opened.holding, false, 'a stage that is not generated yet still opens the project');
  assert.equal(opened.closed, true);
  assert.equal(isProjectOpeningSatisfied(PROJECT), true);
  assert.ok(PROJECT_OPENING_TIMEOUT_MS > PROJECT_OPENING_MIN_VISIBLE_MS, 'the timeout is the longer bound');
});

test('TEST 4 — the timeout never opens the project: it reports that it is still restoring', () => {
  start();
  resolveProjectOpeningCheckpoints({ metadata: { state: OPENING_CHECKPOINT_STATE.READY } });
  markProjectOpeningTimedOut();

  const snapshot = getProjectOpening();
  const readiness = openState();

  assert.equal(snapshot.timedOut, true, 'the long wait is recorded');
  assert.equal(snapshot.closed, false, 'the panel did NOT close on the timeout');
  assert.equal(isProjectOpeningSatisfied(PROJECT), false, 'the project is not marked opened');
  assert.equal(readiness.holding, true, 'the project stays behind the panel');
  assert.equal(readiness.phase, OPENING_PHASE.STILL_RESTORING);
  assert.ok(readiness.pendingLabels.length > 0, 'the panel can name what is still restoring');

  // Nothing was resolved on the project's behalf: a still-restoring stage is
  // still restoring, not silently "not confirmed but fine".
  PROJECT_OPENING_CHECKPOINT_KEYS
    .filter((key) => key !== 'metadata')
    .forEach((key) => {
      const stageState = snapshot.checkpoints[key]?.state ?? OPENING_CHECKPOINT_STATE.PENDING;
      assert.equal(stageState, OPENING_CHECKPOINT_STATE.PENDING, `${key} is still restoring`);
      assert.equal(snapshot.checkpoints[key]?.outcome ?? null, null, `${key} has no outcome yet`);
    });
});

test('TEST 5 — unfinished bass never prevents the editable project opening', () => {
  start();
  resolveAllExcept('bass', entry(OPENING_CHECKPOINT_STATE.READY, OPENING_CHECKPOINT_OUTCOME.READY));

  const opened = openState();
  assert.equal(opened.holding, false, 'the project opens while bass remains unfinished');
  assert.equal(getProjectOpening().closed, true, 'Room Designer is available to finish bass');
  assert.deepEqual(opened.pendingCritical, [], 'bass is not an opening-critical stage');
  const bassLine = openingProgressLines(getProjectOpening(), PROJECT).find((line) => line.key === 'bass');
  assert.equal(bassLine.state, OPENING_CHECKPOINT_STATE.PENDING, 'bass remains honestly unfinished');
  assert.equal(bassLine.label, 'Bass performance', 'the output retains its named background state');
});

test('TEST 6 — edit-safe commercial hydration still blocks, output hydration does not', () => {
  // Pricing/autosave are critical because opening before them can write defaults.
  start();
  resolveAllExcept('pricing', entry(OPENING_CHECKPOINT_STATE.READY, OPENING_CHECKPOINT_OUTCOME.READY));
  markProjectOpeningTimedOut();

  assert.equal(openState().canContinueWithWarning, false, 'there is no escape hatch past pricing hydration');
  assert.equal(continueProjectOpeningWithWarning(), false, 'the continue is refused');
  assert.equal(getProjectOpening().closed, false, 'the project stays closed until editing is safe');

  // A calculation/output stage is not an opening precondition.
  _resetProjectOpeningForTest();
  beginProjectOpening(PROJECT, { versionId: VERSION, minVisibleMs: 0, timeoutMs: 0 });
  resolveAllExcept('bass', entry(OPENING_CHECKPOINT_STATE.READY, OPENING_CHECKPOINT_OUTCOME.READY));

  const opened = openState();
  assert.equal(opened.holding, false, 'unfinished bass does not block the project');
  assert.equal(
    openingProgressLines(getProjectOpening(), PROJECT).find((line) => line.key === 'bass').state,
    OPENING_CHECKPOINT_STATE.PENDING,
  );
  assert.equal(isProjectOpeningSatisfied(PROJECT), true);
});

test('TEST 7 — Retry re-arms every stage, clears the notice and keeps the panel open', () => {
  start();
  resolveProjectOpeningCheckpoints({ metadata: { state: OPENING_CHECKPOINT_STATE.READY } });
  markProjectOpeningTimedOut();
  assert.equal(getProjectOpening().timedOut, true);

  retryProjectOpening();

  const retried = getProjectOpening();
  assert.equal(retried.timedOut, false, 'the still-restoring notice is cleared');
  assert.equal(retried.closed, false, 'the panel is still open');
  assert.equal(retried.attempt, 1, 'the reads are re-run, not re-used');
  assert.deepEqual(
    PROJECT_OPENING_CHECKPOINT_KEYS.filter((key) => retried.checkpoints[key]),
    [],
    'every stage is re-armed as restoring',
  );
  assert.equal(openState().holding, true, 'the project waits for the re-read');

  resolveAll();
  assert.equal(openState().holding, false, 'a retry that resolves closes the panel promptly');
});

test('TEST 8 — "not generated yet" is not a warning; a failure is', () => {
  start();
  resolveAll(entry(OPENING_CHECKPOINT_STATE.UNAVAILABLE, OPENING_CHECKPOINT_OUTCOME.NOT_GENERATED));
  assert.deepEqual(openingCheckpointWarnings(getProjectOpening(), PROJECT), [], 'an empty project is not a warning');

  resolveProjectOpeningCheckpoints({
    technicalReport: entry(OPENING_CHECKPOINT_STATE.UNAVAILABLE, OPENING_CHECKPOINT_OUTCOME.STALE, 'Generated from an earlier design.'),
    pricing: entry(OPENING_CHECKPOINT_STATE.UNAVAILABLE, OPENING_CHECKPOINT_OUTCOME.FAILED, 'Priced selections were not confirmed.'),
  });

  const warnings = openingCheckpointWarnings(getProjectOpening(), PROJECT);
  assert.deepEqual(warnings.map((warning) => warning.key), ['technicalReport', 'pricing'], 'out of date and failed are warned');

  dismissProjectOpeningWarnings(PROJECT);
  assert.deepEqual(openingCheckpointWarnings(getProjectOpening(), PROJECT), [], 'dismissing hides the strip');
  assert.equal(getProjectOpening().checkpoints.pricing.outcome, OPENING_CHECKPOINT_OUTCOME.FAILED, 'the fact is not erased');
});

test('TEST 9 — report routes open, then their own completeness gates decide availability', () => {
  assert.equal(openingEntrySurfaceForPath('/RP22Report'), OPENING_ENTRY_SURFACE.TECHNICAL_REPORT);
  assert.equal(openingEntrySurfaceForPath('/RP22ClientReport'), OPENING_ENTRY_SURFACE.VISUAL_REPORT);
  assert.equal(openingEntrySurfaceForPath('/ProposalCentre'), OPENING_ENTRY_SURFACE.PROPOSAL);
  assert.equal(openingEntrySurfaceForPath('/RoomDesigner'), null);

  const technicalKeys = criticalOpeningCheckpointKeys(OPENING_ENTRY_SURFACE.TECHNICAL_REPORT);
  assert.ok(!technicalKeys.includes('technicalReport'), 'the report source is not a global opening precondition');
  assert.ok(!technicalKeys.includes('bass'), 'unfinished bass does not block access to the project');
  assert.ok(technicalKeys.includes('pricing'), 'commercial hydration remains opening-critical');
  assert.equal(openingCheckpointStage('pricing'), 'critical');
  assert.equal(openingCheckpointStage('bass'), 'supporting');

  start({ entrySurface: OPENING_ENTRY_SURFACE.TECHNICAL_REPORT });
  resolveAllExcept('technicalReport', entry(OPENING_CHECKPOINT_STATE.READY, OPENING_CHECKPOINT_OUTCOME.READY));
  assert.equal(openState().holding, false, 'the page opens so it can show its explicit not-ready state');
  assert.equal(isProjectOpeningSatisfied(PROJECT), true);
});

test('TEST 10 — a project already opened in this session never shows the panel again', () => {
  start();
  resolveAll();
  assert.equal(isProjectOpeningSatisfied(PROJECT), true);

  // The open panel state is gone (it is not kept for an open project), but the
  // session knowledge that this project opened must survive it.
  resetProjectOpening();
  assert.equal(beginProjectOpening(PROJECT, { versionId: VERSION }), undefined, 'no new opening is started');
  assert.equal(getProjectOpening().projectId, null, 'no panel state is created again');

  const reopened = deriveOpeningReadiness(getProjectOpening(), PROJECT);
  assert.equal(reopened.holding, false, 'SPA navigation inside an open project does not re-gate');
  assert.equal(reopened.lines.length, 9, 'the panel can still describe the project');
});

test('TEST 11 — a newly selected project holds before its opening has even begun', () => {
  start();
  const switched = deriveOpeningReadiness(getProjectOpening(), 'project-2');
  assert.equal(switched.holding, true, 'no frame of the previous project can appear');
  assert.equal(switched.begun, false);
  assert.equal(switched.pending.length, PROJECT_OPENING_CHECKPOINT_KEYS.length);
  assert.equal(deriveOpeningReadiness(getProjectOpening(), null).holding, false, 'no project means no panel');
});

test('TEST 12 — the panel publishes the nine requested progress lines, in order', () => {
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
  lines.forEach((line) => assert.equal(line.state, OPENING_CHECKPOINT_STATE.PENDING, `${line.key} starts restoring`));
  assert.ok(PROJECT_OPENING_CHECKPOINT_KEYS.includes('autosaveBaseline'), 'the autosave baseline also gates opening');
});

test('TEST 13 — the gate, panel, resolver and warnings are wired to this authority', () => {
  const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');
  const gate = read('src/components/state/ProjectGate.jsx');
  const shell = read('src/components/state/ProjectLoadingShell.jsx');
  const resolver = read('src/components/state/ProjectOpeningResolver.jsx');
  const warnings = read('src/components/state/ProjectOpeningWarnings.jsx');
  const hydrator = read('src/components/state/ProjectDesignHydrator.jsx');
  const commercial = read('src/components/state/commercialHydrationAuthority.js');

  assert.ok(gate.includes('useProjectOpening') && gate.includes('opening.holding'), 'the gate holds on the opening authority');
  assert.ok(gate.includes('ProjectOpeningResolver'), 'the gate mounts the resolver');
  assert.ok(gate.includes('entrySurface='), 'the gate tells the opening which route it was entered through');
  assert.ok(gate.includes('ProjectOpeningWarnings'), 'the gate shows the warning the project opened with');
  assert.ok(gate.includes('retryProjectOpening'), 'the panel can re-ask');
  assert.ok(gate.includes('canContinueWithWarning'), 'the panel only offers the warned continue when the authority allows it');

  assert.ok(shell.includes('Loading Project'), 'the panel states Loading Project');
  assert.ok(
    shell.includes('Restoring saved design, performance results, reports and pricing.'),
    'the panel carries the requested sentence',
  );
  assert.ok(shell.includes('lines.map'), 'the panel renders the progress lines');
  assert.ok(shell.includes('Not generated yet') && shell.includes('Out of date'), 'a stage says HOW it finished');
  assert.ok(shell.includes('StillRestoringNotice'), 'the panel has the still-restoring notice');
  assert.ok(shell.includes('onContinueWithWarning'), 'the notice offers the warned continue');
  assert.ok(warnings.includes('warning.detail'), 'the warning strip names what did not resolve');

  assert.ok(resolver.includes('fetchDurablePublication'), 'bass/RP22 authority is read from the durable publication');
  assert.ok(resolver.includes('resolveProposalSource'), 'report and proposal source states use the canonical resolver');
  assert.ok(resolver.includes('hydrateTargetCache'), 'the P14 target bank is restored (not recalculated)');
  assert.ok(resolver.includes('statesBassAuthority'), 'a partial live handoff is never reported as a restored authority');
  assert.ok(resolver.includes('readBassPendingIndicator'), 'bass that is still calculating holds its stage');
  assert.ok(resolver.includes('restoring('), 'and holds it as restoring, never as finished');
  assert.ok(resolver.includes('attempt'), 'the resolver re-reads on Retry');
  assert.ok(!resolver.includes('setTargetCacheEntry'), 'the resolver never writes target results');
  assert.ok(!resolver.includes('publishBassPendingIndicator'), 'the resolver never publishes a pending bass state');
  assert.ok(!resolver.includes('publishDesignReviewHandoff'), 'the resolver never publishes authoritative results');

  assert.ok(commercial.includes('getActiveCommercialAuthority'), 'pricing readiness reads the commercial authority');
  assert.ok(hydrator.includes('markCommercialHydrated'), 'the hydrator marks the priced selections as loaded');
});