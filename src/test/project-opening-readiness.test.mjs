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
//   TEST 4   The timeout never opens the project — a stalled row becomes Failed, with Retry
//   TEST 5   A bass row still restoring holds the panel; an uncalculated bass does not
//   TEST 6   Commercial hydration must resolve; a failure is warned, not fatal
//   TEST 7   Retry re-arms every stage and keeps the panel open
//   TEST 8   "Not generated yet" is not a warning; a failure is
//   TEST 9   A report route makes that surface's report source a required row
//   TEST 10  A project already opened in this session never shows the panel again
//   TEST 11  A newly selected project holds before its opening has even begun
//   TEST 12  The panel publishes the requested progress lines, in order
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
  RESTORE_STATUS_LABEL,
  _resetProjectOpeningForTest,
  beginProjectOpening,
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

test('TEST 4 — the timeout never opens the project: a stalled row becomes Failed, with Retry', () => {
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
  assert.ok(readiness.holdLabels.length > 0, 'the panel can name what is holding it');
  assert.equal(readiness.release, false, 'a failed required row does not release the project');
  assert.ok(!('canContinueWithWarning' in readiness), 'and there is no continue path at all');

  // Nothing was resolved on the project's behalf, and nothing is left waiting
  // silently: every stalled row is recorded as FAILED — terminal, named,
  // retryable — while a required row that failed still holds the release.
  PROJECT_OPENING_CHECKPOINT_KEYS
    .filter((key) => key !== 'metadata')
    .forEach((key) => {
      const stage = snapshot.checkpoints[key];
      assert.equal(stage?.state, OPENING_CHECKPOINT_STATE.UNAVAILABLE, `${key} is no longer waited on silently`);
      assert.equal(stage?.outcome, OPENING_CHECKPOINT_OUTCOME.FAILED, `${key} records a failure instead`);
      assert.equal(stage?.timedOut, true, `${key} is marked as the stalled row`);
      assert.ok(stage?.detail, `${key} carries the reason the panel shows`);
    });

  // Retry is the way out of a failure: the rows are re-armed and the project still
  // waits — it is never opened from the failed state.
  retryProjectOpening();
  assert.equal(getProjectOpening().timedOut, false, 'Retry clears the failure notice');
  assert.equal(openState().holding, true, 'and the project still waits for the re-read');
  assert.equal(openState().phase, OPENING_PHASE.RESTORING, 'the rows are restoring again, not failed');
});

test('TEST 5 — a bass row still restoring holds the panel; an uncalculated bass does not', () => {
  // This version HAS saved bass: the row is blocking, so the project cannot open
  // underneath a bass authority that is still restoring.
  start();
  resolveAllExcept('bass', {
    ...entry(OPENING_CHECKPOINT_STATE.READY, OPENING_CHECKPOINT_OUTCOME.READY),
    blocking: true,
  });

  const held = openState();
  assert.equal(held.holding, true, 'the panel holds while the saved bass authority is still restoring');
  assert.equal(getProjectOpening().closed, false, 'the project is not released');
  assert.ok(held.pendingCritical.includes('bass'), 'bass is a blocking row for this version');
  assert.ok(held.holdLabels.includes('Bass performance'), 'the panel names what it is waiting for');

  const heldLine = openingProgressLines(getProjectOpening(), PROJECT).find((line) => line.key === 'bass');
  assert.equal(heldLine.terminal, false, 'the row is honestly not finished');
  assert.equal(heldLine.blocking, true, 'and it is marked as holding the project');
  assert.equal(RESTORE_STATUS_LABEL[heldLine.status], 'Restoring', 'the row says Restoring because it IS restoring');

  resolveProjectOpeningCheckpoints({
    bass: { ...entry(OPENING_CHECKPOINT_STATE.READY, OPENING_CHECKPOINT_OUTCOME.READY), blocking: true },
  });
  assert.equal(openState().holding, false, 'the restored bass authority releases the panel');

  // A version that has never been calculated resolves as "not calculated yet" —
  // terminal, so an unfinished project still opens for continued work.
  _resetProjectOpeningForTest();
  beginProjectOpening(PROJECT, { versionId: VERSION, minVisibleMs: 0, timeoutMs: 0 });
  resolveAllExcept('bass', entry(OPENING_CHECKPOINT_STATE.READY, OPENING_CHECKPOINT_OUTCOME.READY));
  resolveProjectOpeningCheckpoints({
    bass: {
      state: OPENING_CHECKPOINT_STATE.UNAVAILABLE,
      outcome: OPENING_CHECKPOINT_OUTCOME.NOT_CALCULATED,
      blocking: false,
      detail: 'Bass has not been calculated for this version yet.',
    },
    bassTargetBank: {
      state: OPENING_CHECKPOINT_STATE.UNAVAILABLE,
      outcome: OPENING_CHECKPOINT_OUTCOME.NOT_CALCULATED,
      blocking: false,
      detail: 'No saved target bank for this design.',
    },
  });

  const opened = openState();
  assert.equal(opened.holding, false, 'an uncalculated bass is terminal and opens the project');
  assert.equal(getProjectOpening().closed, true, 'Room Designer is available to calculate it');
  const bassLine = openingProgressLines(getProjectOpening(), PROJECT).find((line) => line.key === 'bass');
  assert.equal(bassLine.terminal, true, 'the row has finished');
  assert.equal(bassLine.status, 'not-calculated', 'it says HOW it finished');
  assert.equal(RESTORE_STATUS_LABEL[bassLine.status], 'Not calculated yet');
  assert.equal(bassLine.label, 'Bass performance', 'the output retains its named background state');
});

test('TEST 6 — commercial hydration must reach a terminal state; a failure is warned, not fatal', () => {
  const ready = entry(OPENING_CHECKPOINT_STATE.READY, OPENING_CHECKPOINT_OUTCOME.READY);

  // While pricing is still restoring, the panel holds: no row may be left
  // Restoring while the project opens.
  start();
  resolveAllExcept('pricing', ready);
  assert.equal(openState().holding, true, 'a row still restoring keeps the panel open');
  assert.equal(getProjectOpening().closed, false, 'the project is not released on an unfinished row');

  // A failed restore is terminal and non-blocking: the designer is told, and the
  // write path (guardCommercialSave) independently refuses to save against an
  // unproven commercial baseline, so nothing can be overwritten while it stands.
  resolveProjectOpeningCheckpoints({
    pricing: {
      state: OPENING_CHECKPOINT_STATE.UNAVAILABLE,
      outcome: OPENING_CHECKPOINT_OUTCOME.FAILED,
      detail: 'Priced selections were not confirmed for this version.',
    },
    autosaveBaseline: {
      state: OPENING_CHECKPOINT_STATE.UNAVAILABLE,
      outcome: OPENING_CHECKPOINT_OUTCOME.FAILED,
      detail: 'Editing baseline not confirmed — saving stays paused until it is.',
    },
  });

  const opened = openState();
  assert.equal(opened.holding, false, 'the failed row is terminal, so it no longer holds the project');
  assert.equal(getProjectOpening().closed, true);
  assert.ok(!opened.blockingKeys.includes('pricing'), 'pricing is not a blocking row');
  assert.deepEqual(
    openingCheckpointWarnings(getProjectOpening(), PROJECT).map((warning) => warning.key),
    ['pricing'],
    'the failure is warned about, never silent',
  );

  // A structural row that never confirms is recorded as FAILED — terminal, named,
  // retryable — and still holds the project. There is no path that opens without
  // the saved geometry.
  _resetProjectOpeningForTest();
  beginProjectOpening(PROJECT, { versionId: VERSION, minVisibleMs: 0, timeoutMs: 0 });
  resolveAllExcept('roomSeating', ready);
  markProjectOpeningTimedOut();

  const stalled = openState();
  assert.equal(getProjectOpening().closed, false, 'the project stays closed without its saved geometry');
  assert.equal(stalled.holding, true, 'the saved geometry holds the project');
  assert.ok(stalled.holdLabels.includes('Room and seating'), 'the panel names the row it is waiting for');
  const stalledRow = stalled.checklist.find((row) => row.key === 'roomSeating');
  assert.equal(stalledRow.status, 'failed', 'the stalled row says Failed');
  assert.equal(stalledRow.terminal, true, 'so it is never left Restoring forever');
  assert.equal(stalledRow.blocking, true, 'and a failed required row still holds the release');
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

test('TEST 9 — a report route makes that surface\'s report source a required row', () => {
  assert.equal(openingEntrySurfaceForPath('/RP22Report'), OPENING_ENTRY_SURFACE.TECHNICAL_REPORT);
  assert.equal(openingEntrySurfaceForPath('/RP22ClientReport'), OPENING_ENTRY_SURFACE.VISUAL_REPORT);
  assert.equal(openingEntrySurfaceForPath('/ProposalCentre'), OPENING_ENTRY_SURFACE.PROPOSAL);
  assert.equal(openingEntrySurfaceForPath('/RoomDesigner'), null);

  const technicalKeys = criticalOpeningCheckpointKeys(OPENING_ENTRY_SURFACE.TECHNICAL_REPORT);
  assert.ok(technicalKeys.includes('technicalReport'), 'the Technical Report source is required on this route');
  assert.ok(technicalKeys.includes('rp22') && technicalKeys.includes('reportAuthority'), 'the saved authority and report metadata are required');
  assert.equal(openingCheckpointStage('bass'), 'critical', 'the saved-bass rows are blocking unless the version has none');
  assert.equal(openingCheckpointStage('pricing'), 'supporting', 'pricing never blocks the release');
  assert.equal(openingCheckpointStage('visualReport'), 'supporting', 'another surface\'s report source does not block this route');
  assert.equal(openingCheckpointStage('visualReport', OPENING_ENTRY_SURFACE.VISUAL_REPORT), 'critical');

  // Arriving at the Technical Report holds the panel until its source is terminal.
  // The page then renders its own explicit not-ready state — never blank cards
  // built from a half-restored authority.
  start({ entrySurface: OPENING_ENTRY_SURFACE.TECHNICAL_REPORT });
  resolveAllExcept('technicalReport', entry(OPENING_CHECKPOINT_STATE.READY, OPENING_CHECKPOINT_OUTCOME.READY));
  assert.equal(openState().holding, true, 'the report source is required for this route');
  assert.equal(getProjectOpening().closed, false, 'the report is not rendered on a half-restored source');

  resolveProjectOpeningCheckpoints({
    technicalReport: {
      state: OPENING_CHECKPOINT_STATE.UNAVAILABLE,
      outcome: OPENING_CHECKPOINT_OUTCOME.NOT_GENERATED,
      detail: 'Technical Report has not been generated for this version.',
    },
  });

  assert.equal(openState().holding, false, 'a terminal "not generated yet" opens the route, which then names what is missing');
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
  assert.equal(reopened.lines.length, PROJECT_OPENING_LINES.length, 'the panel can still describe the project');
});

test('TEST 11 — a newly selected project holds before its opening has even begun', () => {
  start();
  const switched = deriveOpeningReadiness(getProjectOpening(), 'project-2');
  assert.equal(switched.holding, true, 'no frame of the previous project can appear');
  assert.equal(switched.begun, false);
  assert.equal(switched.pending.length, PROJECT_OPENING_CHECKPOINT_KEYS.length);
  assert.equal(deriveOpeningReadiness(getProjectOpening(), null).holding, false, 'no project means no panel');
});

test('TEST 12 — the panel publishes the requested progress lines, in order', () => {
  start();
  const labels = PROJECT_OPENING_LINES.map((line) => line.label);
  assert.deepEqual(labels, [
    'Room and seating',
    'Speaker layout',
    'RP22 / RP23 results',
    'Bass performance',
    'Bass target bank',
    'Report authority',
    'Visual Report',
    'Technical Report',
    'Proposal source data',
    'Pricing',
  ]);

  const lines = openingProgressLines(getProjectOpening(), PROJECT);
  assert.equal(lines.length, PROJECT_OPENING_LINES.length);
  lines.forEach((line) => {
    assert.equal(line.terminal, false, `${line.key} starts unfinished`);
    assert.equal(line.state, OPENING_CHECKPOINT_STATE.PENDING, `${line.key} starts restoring`);
    assert.equal(line.status, 'restoring', `${line.key} says exactly that it is restoring`);
    assert.equal(line.outcome, null, `${line.key} has no outcome yet`);
  });
  // The rows that are not drawn still gate the release.
  assert.ok(PROJECT_OPENING_CHECKPOINT_KEYS.includes('autosaveBaseline'), 'the autosave baseline also gates opening');
  assert.ok(PROJECT_OPENING_CHECKPOINT_KEYS.includes('metadata'), 'the project record also gates opening');
  assert.equal(
    PROJECT_OPENING_CHECKPOINT_KEYS.length,
    PROJECT_OPENING_LINES.length + 4,
    'the four internal rows gate the release without being drawn',
  );
});

test('TEST 13 — the gate, panel, resolver and warnings are wired to this authority', () => {
  const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');
  const gate = read('src/components/state/ProjectGate.jsx');
  const shell = read('src/components/state/ProjectLoadingShell.jsx');
  const resolver = read('src/components/state/ProjectOpeningResolver.jsx');
  const warnings = read('src/components/state/ProjectOpeningWarnings.jsx');
  const hydrator = read('src/components/state/ProjectDesignHydrator.jsx');
  const commercial = read('src/components/state/commercialHydrationAuthority.js');
  const saver = read('src/components/hooks/useProjectLoader.jsx');
  const checklist = read('src/components/state/projectRestoreChecklist.js');
  const authority = read('src/components/state/projectOpeningAuthority.js');
  const stages = read('src/components/state/projectOpeningStages.js');
  const technicalReport = read('src/pages/DesignReviewPage.jsx');
  const layout = read('src/Layout.jsx');

  // The gate is the panel's only switch, and it is driven by the checklist.
  assert.ok(gate.includes('useProjectOpening') && gate.includes('opening.holding'), 'the gate holds on the opening authority');
  assert.ok(gate.includes('ProjectOpeningResolver'), 'the gate mounts the resolver');
  assert.ok(gate.includes('entrySurface='), 'the gate tells the opening which route it was entered through');
  assert.ok(gate.includes('ProjectOpeningWarnings'), 'the gate shows the warning the project opened with');
  assert.ok(gate.includes('retryProjectOpening'), 'the panel can re-ask');
  assert.ok(!gate.includes('ContinueWithWarning'), 'the panel offers no continue-anyway path');
  assert.ok(gate.includes('heldByLabels'), 'the panel is told which rows are holding the project');
  assert.ok(gate.includes('opening.holdLabels'), 'and it takes them from the release decision');

  // The panel says HOW each row finished, in the checklist's own words.
  assert.ok(shell.includes('Loading Project'), 'the panel states Loading Project');
  assert.ok(
    shell.includes('Restoring saved design, performance results, reports and pricing.'),
    'the panel carries the requested sentence',
  );
  assert.ok(shell.includes('lines.map'), 'the panel renders the progress lines');
  assert.ok(shell.includes('RESTORE_STATUS_LABEL'), 'the status words come from the restore vocabulary');
  assert.ok(shell.includes('line.terminal') && shell.includes('line.blocking'), 'the panel shows terminality and blocking');
  assert.ok(shell.includes('StillRestoringNotice'), 'the panel has the still-restoring notice');
  assert.ok(!shell.includes('Continue with warning'), 'and offers no continue-anyway button');
  assert.ok(shell.includes('Retry runs the restore again'), 'Retry is the only action on a stalled restore');
  assert.ok(warnings.includes('warning.detail'), 'the warning strip names what did not resolve');

  // The release rule itself: every row terminal, and allowed for the blocking rows.
  assert.ok(checklist.includes('RESTORE_NON_TERMINAL_STATUSES'), 'the non-terminal vocabulary lives in the checklist');
  assert.ok(checklist.includes('RESTORE_ALLOWED_BLOCKING_TERMINAL_STATUSES'), 'and so does what a blocking row may finish on');
  assert.ok(checklist.includes('nonTerminalRows.length === 0'), 'the release requires every row to be terminal');
  assert.ok(!checklist.includes('setTimeout'), 'no timer takes part in the release decision');
  assert.ok(!checklist.includes('minVisibleMs'), 'and neither does the minimum visible time');
  assert.ok(authority.includes('buildRestoreChecklist') && authority.includes('deriveRestoreRelease'), 'the authority closes only on the checklist');
  assert.ok(stages.includes('nonBypassableOpeningCheckpointKeys'), 'the structural rows are still named non-bypassable');
  assert.ok(authority.includes('OPENING_CHECKPOINT_OUTCOME.FAILED'), 'a stalled row is recorded as failed, with a reason');
  assert.ok(!authority.includes('safeToContinue'), 'no row can be marked safe to continue past');
  assert.ok(!authority.includes('continueProjectOpeningWithWarning'), 'and the continue path is gone entirely');

  assert.ok(resolver.includes('fetchDurablePublication'), 'bass/RP22 authority is read from the durable publication');
  assert.ok(resolver.includes('resolveProposalSource'), 'report and proposal source states use the canonical resolver');
  assert.ok(resolver.includes('hydrateTargetCache'), 'the P14 target bank is restored (not recalculated)');
  assert.ok(resolver.includes('statesBassAuthority'), 'a partial live handoff is never reported as a restored authority');
  assert.ok(resolver.includes('readBassPendingIndicator'), 'bass that is still calculating holds its stage');
  assert.ok(resolver.includes('hydrating(') && resolver.includes('calculating('), 'and says precisely which it is doing');
  assert.ok(resolver.includes('reportAuthority'), 'the report authority metadata is a tracked row');
  assert.ok(resolver.includes('blocking: bassBlocks'), 'the saved-bass rows state whether they block this version');
  assert.ok(resolver.includes('attempt'), 'the resolver re-reads on Retry');
  assert.ok(!resolver.includes('setTargetCacheEntry'), 'the resolver never writes target results');
  assert.ok(!resolver.includes('publishBassPendingIndicator'), 'the resolver never publishes a pending bass state');
  assert.ok(!resolver.includes('publishDesignReviewHandoff'), 'the resolver never publishes authoritative results');

  assert.ok(technicalReport.includes('asdrAuthority.reportComplete'), 'Technical Report blocks until the restored authority is complete');
  assert.ok(technicalReport.includes('Technical Report not ready'), 'an incomplete report route shows an explicit not-ready page');
  assert.ok(technicalReport.includes('Missing results:'), 'the not-ready page names the missing assessment results');
  assert.ok(technicalReport.includes('Back to Room Designer'), 'the not-ready page always offers a route back to design work');
  // The build diagnostic is an opt-in developer aid. It is off on every normal
  // load — dealer, client, partner and admin alike — and appears only behind an
  // explicit flag, with a close control that hides it for the rest of the session.
  const buildDiagnostic = read('src/components/dev/BuildDiagnosticPanel.jsx');
  assert.ok(layout.includes('<BuildDiagnosticPanel />'), 'the layout mounts the build diagnostic');
  assert.ok(!layout.includes('BuildCheckpointDiagnostic'), 'the diagnostic is no longer defined inline in the layout');
  assert.ok(!/<BuildDiagnosticPanel[^>]*isAdmin/.test(layout), 'and the admin role never switches it on');
  assert.ok(buildDiagnostic.includes('debugBuild'), 'the URL query flag turns it on');
  assert.ok(buildDiagnostic.includes('soundproof:debug:buildDiagnostic'), 'the localStorage flag turns it on');
  assert.ok(buildDiagnostic.includes('import.meta.env.DEV'), 'the local development server turns it on');
  assert.ok(!buildDiagnostic.includes('isAdmin'), 'the admin role does not');
  assert.ok(buildDiagnostic.includes('if (!requested || dismissed) return null;'), 'it renders nothing unless asked for');
  assert.ok(buildDiagnostic.includes('onClick={close}'), 'it carries a visible close control');
  assert.ok(buildDiagnostic.includes('sessionStorage.setItem(DISMISSED_KEY, "1")'), 'closing it persists for the session');
  assert.ok(buildDiagnostic.includes('data-build-checkpoint-diagnostic'), 'the panel keeps its diagnostic identity while shown');
  assert.ok(buildDiagnostic.includes('restoreChecklistRowCount'), 'the diagnostic exposes the visible restore row count');
  assert.ok(buildDiagnostic.includes('REPORT_GATE_VERSION'), 'the diagnostic exposes the report gate version');

  assert.ok(commercial.includes('getActiveCommercialAuthority'), 'pricing readiness reads the commercial authority');
  assert.ok(commercial.includes('guardCommercialSave'), 'and the save path is guarded independently of the panel');
  assert.ok(saver.includes('guardCommercialSave('), 'the writer refuses a save against an unproven baseline');
  assert.ok(hydrator.includes('markCommercialHydrated'), 'the hydrator marks the priced selections as loaded');
  assert.ok(
    hydrator.includes('isCommercialHydrationComplete') && hydrator.includes('commercialReady'),
    'the design fast path cannot bypass a missing commercial baseline',
  );
});