// project-restore-checklist.test.mjs
// ---------------------------------------------------------------------------
// The Project Loading panel is a restore gate, not a splash screen. These tests
// hold it to that: if a row still says Restoring, the project is not loaded, and
// the panel may not close.
//
//   A   Every non-terminal row holds the panel — for every row, every non-terminal state
//   A2  A blocking row that failed holds the panel until it is explicitly accepted
//   B   A completed project waits for RP22, bass, the target bank and report metadata
//   C   An unfinished project resolves every row honestly, then opens for continued work
//   D   Entering the Visual Report waits for the Visual Report source
//   E   Entering the Technical Report never renders on a half-restored bass authority
//   F   Entering the Proposal Centre waits for the proposal source data
//   G   A failed pricing restore is terminal, non-blocking and warned
//   H   A saved bass authority still pending keeps the panel closed
//   I   The shipped authority cannot release the project while any row is unfinished
// ---------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RESTORE_NON_TERMINAL_STATUSES,
  RESTORE_ROWS,
  RESTORE_STATUS_LABEL,
  buildRestoreChecklist,
  deriveRestoreRelease,
  isRestoreStatusTerminal,
} from '../components/state/projectRestoreChecklist.js';
import {
  openingProgressLines,
} from '../components/state/projectOpeningReadiness.js';
import {
  OPENING_CHECKPOINT_OUTCOME,
  OPENING_CHECKPOINT_STATE,
  OPENING_ENTRY_SURFACE,
  _resetProjectOpeningForTest,
  beginProjectOpening,
  deriveOpeningReadiness,
  getProjectOpening,
  resolveProjectOpeningCheckpoints,
} from '../components/state/projectOpeningAuthority.js';

const PROJECT = 'project-1';
const VERSION = 'version-1';

const READY = OPENING_CHECKPOINT_STATE.READY;
const UNAVAILABLE = OPENING_CHECKPOINT_STATE.UNAVAILABLE;
const PENDING = OPENING_CHECKPOINT_STATE.PENDING;

/** How each restore status is carried by an opening checkpoint. */
const TERMINAL_ENTRY = {
  ready: { state: READY, outcome: OPENING_CHECKPOINT_OUTCOME.READY },
  stale: { state: UNAVAILABLE, outcome: OPENING_CHECKPOINT_OUTCOME.STALE },
  'not-generated': { state: UNAVAILABLE, outcome: OPENING_CHECKPOINT_OUTCOME.NOT_GENERATED },
  'not-calculated': { state: UNAVAILABLE, outcome: OPENING_CHECKPOINT_OUTCOME.NOT_CALCULATED },
  'not-applicable': { state: UNAVAILABLE, outcome: OPENING_CHECKPOINT_OUTCOME.NOT_APPLICABLE },
  failed: { state: UNAVAILABLE, outcome: OPENING_CHECKPOINT_OUTCOME.FAILED },
};

/** Every non-terminal state is carried as a still-resolving checkpoint. */
const nonTerminalEntry = (status) => ({ state: PENDING, status, detail: `${status} row` });

const entryFor = (status, extra = {}) => (
  TERMINAL_ENTRY[status]
    ? { ...TERMINAL_ENTRY[status], detail: `${status} row`, ...extra }
    : { ...nonTerminalEntry(status), ...extra }
);

/** A snapshot with every row ready unless overridden. */
const snapshotWith = (overrides = {}, options = {}) => ({
  projectId: PROJECT,
  versionId: VERSION,
  entrySurface: options.entrySurface || null,
  attempt: Number(options.attempt) || 0,
  minVisibleElapsed: true,
  timedOut: false,
  closed: false,
  checkpoints: Object.fromEntries(RESTORE_ROWS.map((row) => [
    row.key,
    overrides[row.key] || { state: READY, outcome: OPENING_CHECKPOINT_OUTCOME.READY, detail: `${row.key} ready` },
  ])),
});

const releaseFor = (overrides, options) => deriveRestoreRelease(
  buildRestoreChecklist({ snapshot: snapshotWith(overrides, options), projectId: PROJECT }).rows,
);

test('A — every non-terminal row holds the panel, whichever row it is', () => {
  assert.equal(releaseFor({}).release, true, 'a fully restored project releases the panel');

  // 7 non-terminal states × every row: none of them may release the project.
  RESTORE_NON_TERMINAL_STATUSES.forEach((status) => {
    RESTORE_ROWS.forEach((row) => {
      const snapshot = snapshotWith({ [row.key]: entryFor(status) });
      const release = deriveRestoreRelease(buildRestoreChecklist({ snapshot, projectId: PROJECT }).rows);

      assert.equal(release.release, false, `${row.key} at "${status}" must hold the panel`);
      assert.deepEqual(release.nonTerminalRows.map((held) => held.key), [row.key], 'the held row is named');
      assert.ok(release.holdLabels.includes(row.label), 'and labelled for the panel');

      const line = openingProgressLines(snapshot, PROJECT).find((entry) => entry.key === row.key);
      if (line) {
        assert.equal(line.terminal, false, 'the drawn row is not finished');
        assert.equal(isRestoreStatusTerminal(line.status), false);
        assert.notEqual(
          RESTORE_STATUS_LABEL[line.status],
          'Ready',
          'the panel can never show a finished status for a row that is still working',
        );
      }
    });
  });
});

test('A2 — a blocking row that failed holds the panel until it is explicitly accepted', () => {
  const held = releaseFor({ rp22: entryFor('failed', { blocking: true }) });
  assert.equal(held.release, false, 'a required row that did not confirm holds the project');
  assert.ok(held.holdLabels.includes('RP22 / RP23 results'));
  assert.equal(held.blockingFailures.length, 1);

  const accepted = releaseFor({ rp22: entryFor('failed', { blocking: true, safeToContinue: true }) });
  assert.equal(accepted.release, true, 'an explicit, warned decision releases it');

  // A NON-blocking failure never holds the panel, but it is still terminal.
  const nonBlocking = releaseFor({ pricing: entryFor('failed', { blocking: false }) });
  assert.equal(nonBlocking.release, true, 'a warning-level failure may close the panel');
  assert.equal(nonBlocking.blockingFailures.length, 0);
});

test('B — a completed project waits for RP22, bass, the target bank and report metadata', () => {
  const held = releaseFor({
    bass: entryFor('hydrating', { blocking: true }),
    bassTargetBank: entryFor('restoring', { blocking: true }),
  });
  assert.equal(held.release, false);
  assert.deepEqual(held.holdLabels, ['Bass performance', 'Bass target bank']);

  const released = releaseFor({
    bass: entryFor('ready', { blocking: true }),
    bassTargetBank: entryFor('ready', { blocking: true }),
    reportAuthority: entryFor('ready'),
  });
  assert.equal(released.release, true, 'restored bass, target bank and report metadata release the project');

  assert.deepEqual(
    released.blockingRows.filter((row) => row.displayed).map((row) => row.label),
    [
      'Room and seating',
      'Speaker layout',
      'RP22 / RP23 results',
      'Bass performance',
      'Bass target bank',
      'Report authority',
    ],
    'the required rows of a plain project open, in panel order',
  );
});

test('C — an unfinished project resolves every row honestly, then opens for continued work', () => {
  const snapshot = snapshotWith({
    rp22: entryFor('not-generated'),
    bass: entryFor('not-calculated', { blocking: false }),
    bassTargetBank: entryFor('not-calculated', { blocking: false }),
    reportAuthority: entryFor('not-generated'),
    visualReport: entryFor('not-generated'),
    technicalReport: entryFor('not-generated'),
    proposalSource: entryFor('not-generated'),
  });
  const rows = buildRestoreChecklist({ snapshot, projectId: PROJECT }).rows;
  const release = deriveRestoreRelease(rows);

  assert.equal(release.release, true, 'nothing saved yet is a terminal state, not a failure');
  assert.deepEqual(release.nonTerminalRows, [], 'no row is left Restoring when the panel closes');
  rows.forEach((row) => assert.equal(isRestoreStatusTerminal(row.status), true, `${row.key} finished`));

  const bassLine = openingProgressLines(snapshot, PROJECT).find((line) => line.key === 'bass');
  assert.equal(RESTORE_STATUS_LABEL[bassLine.status], 'Not calculated yet', 'the bass row says exactly that');
});

test('D — entering the Visual Report waits for the Visual Report source', () => {
  const snapshot = snapshotWith({ visualReport: entryFor('restoring') }, { entrySurface: OPENING_ENTRY_SURFACE.VISUAL_REPORT });
  const release = deriveRestoreRelease(buildRestoreChecklist({ snapshot, projectId: PROJECT }).rows);

  assert.equal(release.release, false, 'the report route waits for its source');
  assert.deepEqual(release.holdLabels, ['Visual Report']);
  assert.equal(
    release.blockingRows.find((row) => row.key === 'visualReport').blocking,
    true,
    'the source is a required row on its own route',
  );

  // Off that route the same row is not REQUIRED — but it is still genuinely still
  // restoring, so the panel holds for it rather than closing on a live "Restoring".
  const elsewhere = releaseFor({ visualReport: entryFor('restoring') });
  assert.equal(elsewhere.release, false, 'a row that is still working always holds the panel');
  const elsewhereRow = buildRestoreChecklist({
    snapshot: snapshotWith({ visualReport: entryFor('restoring') }),
    projectId: PROJECT,
  }).rows.find((row) => row.key === 'visualReport');
  assert.equal(elsewhereRow.blocking, false, 'but it only blocks the release on its own route');
});

test('E — entering the Technical Report never renders on a half-restored bass authority', () => {
  const snapshot = snapshotWith({
    technicalReport: entryFor('not-generated'),
    bass: entryFor('calculating', { blocking: true }),
  }, { entrySurface: OPENING_ENTRY_SURFACE.TECHNICAL_REPORT });

  const release = deriveRestoreRelease(buildRestoreChecklist({ snapshot, projectId: PROJECT }).rows);
  assert.equal(release.release, false, 'bass still calculating keeps the report page behind the panel');
  assert.deepEqual(release.holdLabels, ['Bass performance']);

  const bassLine = openingProgressLines(snapshot, PROJECT).find((line) => line.key === 'bass');
  assert.equal(RESTORE_STATUS_LABEL[bassLine.status], 'Calculating', 'the row says what it is really doing');
  assert.equal(bassLine.blocking, true);
  assert.equal(bassLine.terminal, false);
});

test('F — entering the Proposal Centre waits for the proposal source data', () => {
  const snapshot = snapshotWith({ proposalSource: entryFor('restoring') }, { entrySurface: OPENING_ENTRY_SURFACE.PROPOSAL });
  const release = deriveRestoreRelease(buildRestoreChecklist({ snapshot, projectId: PROJECT }).rows);

  assert.equal(release.release, false, 'proposal generation is not reachable on a half-restored source');
  assert.deepEqual(release.holdLabels, ['Proposal source data']);
  assert.equal(
    buildRestoreChecklist({ snapshot, projectId: PROJECT }).rows.find((row) => row.key === 'proposalSource').blocking,
    true,
  );
});

test('G — a failed pricing restore is terminal, non-blocking and warned', () => {
  const snapshot = snapshotWith({
    pricing: entryFor('failed'),
    autosaveBaseline: entryFor('failed'),
  });
  const rows = buildRestoreChecklist({ snapshot, projectId: PROJECT }).rows;
  const release = deriveRestoreRelease(rows);

  assert.equal(release.release, true, 'the panel may close');
  const pricing = rows.find((row) => row.key === 'pricing');
  assert.equal(pricing.status, 'failed');
  assert.equal(pricing.terminal, true, 'a failure is terminal, so it cannot leave a row Restoring');
  assert.equal(pricing.blocking, false, 'and it does not hold the project');
  assert.equal(pricing.message, 'failed row', 'the row carries its warning message');

  // The remaining required rows are still satisfied, so reports are unaffected.
  assert.deepEqual(release.blockingFailures, []);
  assert.equal(rows.find((row) => row.key === 'pricing').blocking, false, 'pricing is never a required row');
});

test('H — a saved bass authority still pending keeps the panel closed', () => {
  const snapshot = snapshotWith({
    bass: entryFor('hydrating', { blocking: true }),
    bassTargetBank: entryFor('restoring', { blocking: true }),
  });
  const release = deriveRestoreRelease(buildRestoreChecklist({ snapshot, projectId: PROJECT }).rows);

  assert.equal(release.release, false, 'the project is not opened on a pending bass restore');
  assert.deepEqual(release.holdLabels, ['Bass performance', 'Bass target bank']);
  ['bass', 'bassTargetBank'].forEach((key) => {
    const row = release.blockingRows.find((candidate) => candidate.key === key);
    assert.equal(row.blocking, true, `${key} is a required row while saved bass exists`);
  });
  openingProgressLines(snapshot, PROJECT)
    .filter((line) => line.key === 'bass' || line.key === 'bassTargetBank')
    .forEach((line) => {
      assert.equal(line.terminal, false);
      assert.equal(line.blocking, true);
      assert.notEqual(RESTORE_STATUS_LABEL[line.status], 'Ready');
    });
});

test('I — the shipped authority cannot release the project while any row is unfinished', () => {
  RESTORE_ROWS.forEach((skip) => {
    _resetProjectOpeningForTest();
    beginProjectOpening(PROJECT, { versionId: VERSION, minVisibleMs: 0, timeoutMs: 0 });

    resolveProjectOpeningCheckpoints(Object.fromEntries(
      RESTORE_ROWS
        .filter((row) => row.key !== skip.key)
        .map((row) => [row.key, {
          state: READY,
          outcome: OPENING_CHECKPOINT_OUTCOME.READY,
          detail: `${row.key} ready`,
        }]),
    ));

    const readiness = deriveOpeningReadiness(getProjectOpening(), PROJECT);
    assert.equal(readiness.holding, true, `${skip.key} unfinished must hold the panel`);
    assert.equal(readiness.release, false, `${skip.key} unfinished must not release the checklist`);
    assert.equal(getProjectOpening().closed, false, `${skip.key} unfinished must not open the project`);
    assert.ok(readiness.holdLabels.includes(skip.label), 'the panel names the row it is waiting for');

    const line = readiness.lines.find((entry) => entry.key === skip.key);
    if (line) {
      assert.equal(line.terminal, false, 'the drawn row is honest about being unfinished');
    }
  });

  // And once that final row finishes, the panel releases.
  _resetProjectOpeningForTest();
  beginProjectOpening(PROJECT, { versionId: VERSION, minVisibleMs: 0, timeoutMs: 0 });
  resolveProjectOpeningCheckpoints(Object.fromEntries(
    RESTORE_ROWS.map((row) => [row.key, {
      state: READY,
      outcome: OPENING_CHECKPOINT_OUTCOME.READY,
      detail: `${row.key} ready`,
    }]),
  ));

  const released = deriveOpeningReadiness(getProjectOpening(), PROJECT);
  assert.equal(released.holding, false, 'every row terminal releases the panel');
  assert.equal(released.release, true);
  assert.equal(getProjectOpening().closed, true);
  assert.deepEqual(released.holdLabels, [], 'nothing is left holding the project');
});