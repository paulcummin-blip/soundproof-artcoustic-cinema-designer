// project-restore-checklist.test.mjs
// The Project Open Gate owns core design only. Report, bass, proposal and
// pricing authorities are route/action owned and must not delay Room Designer.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  RESTORE_NON_TERMINAL_STATUSES,
  RESTORE_ROWS,
  buildRestoreChecklist,
  deriveRestoreRelease,
  isRestoreStatusTerminal,
} from "../components/state/projectRestoreChecklist.js";
import {
  OPENING_CHECKPOINT_OUTCOME,
  OPENING_CHECKPOINT_STATE,
  _resetProjectOpeningForTest,
  beginProjectOpening,
  deriveOpeningReadiness,
  getProjectOpening,
  resolveProjectOpeningCheckpoints,
} from "../components/state/projectOpeningAuthority.js";

const PROJECT = "project-1";
const VERSION = "version-1";
const READY = OPENING_CHECKPOINT_STATE.READY;
const PENDING = OPENING_CHECKPOINT_STATE.PENDING;
const UNAVAILABLE = OPENING_CHECKPOINT_STATE.UNAVAILABLE;

const read = (path) => fs.readFileSync(path, "utf8");

const snapshotWith = (overrides = {}, options = {}) => ({
  projectId: PROJECT,
  versionId: VERSION,
  entrySurface: options.entrySurface || null,
  attempt: 0,
  minVisibleElapsed: true,
  timedOut: false,
  closed: false,
  checkpoints: Object.fromEntries(RESTORE_ROWS.map((row) => [
    row.key,
    overrides[row.key] || {
      state: READY,
      outcome: OPENING_CHECKPOINT_OUTCOME.READY,
      detail: `${row.key} ready`,
    },
  ])),
});

const checklistFor = (overrides = {}, options = {}) =>
  buildRestoreChecklist({ snapshot: snapshotWith(overrides, options), projectId: PROJECT });

test("A — the open checklist contains core design only", () => {
  assert.deepEqual(
    RESTORE_ROWS.map((row) => row.key),
    ["metadata", "activeVersion", "roomSeating", "speakerLayout", "seatPriorities"],
  );
  const forbidden = [
    "rp22", "bass", "bassTargetBank", "reportAuthority",
    "visualReport", "technicalReport", "proposalSource", "pricing",
  ];
  forbidden.forEach((key) => {
    assert.equal(RESTORE_ROWS.some((row) => row.key === key), false, `${key} is route/action owned`);
  });
});

test("B — every non-terminal core row holds the panel", () => {
  RESTORE_NON_TERMINAL_STATUSES.forEach((status) => {
    RESTORE_ROWS.forEach((row) => {
      const checklist = checklistFor({
        [row.key]: { state: PENDING, status, detail: `${status} row` },
      });
      const release = deriveRestoreRelease(checklist);
      assert.equal(release.release, false, `${row.key} at ${status} must hold`);
      assert.deepEqual(release.nonTerminalRows.map((item) => item.key), [row.key]);
    });
  });
});

test("C — a failed required core read holds and exposes Retry state", () => {
  const checklist = checklistFor({
    metadata: {
      state: UNAVAILABLE,
      outcome: OPENING_CHECKPOINT_OUTCOME.FAILED,
      detail: "Project read failed",
    },
  });
  const release = deriveRestoreRelease(checklist);
  assert.equal(release.release, false);
  assert.deepEqual(release.blockingFailures.map((row) => row.key), ["metadata"]);
});

test("D — an unfinished design opens once core rows are terminal", () => {
  const checklist = checklistFor({
    roomSeating: {
      state: UNAVAILABLE,
      outcome: OPENING_CHECKPOINT_OUTCOME.NOT_GENERATED,
      detail: "Continue in Room Designer",
    },
  });
  const release = deriveRestoreRelease(checklist);
  assert.equal(release.release, true);
  checklist.rows.forEach((row) => assert.equal(isRestoreStatusTerminal(row.status), true));
});

test("E — route identity never expands the project-open gate", () => {
  const surfaces = [null, "visual-report", "technical-report", "proposal"];
  const rowSets = surfaces.map((entrySurface) =>
    checklistFor({}, { entrySurface }).rows.map((row) => row.key));
  rowSets.forEach((rows) => assert.deepEqual(rows, rowSets[0]));
});

test("F — the resolver performs no report, bass, target, proposal or pricing restore", () => {
  const resolver = read("src/components/state/ProjectOpeningResolver.jsx");
  [
    "fetchDurablePublication",
    "BassAuthorityRestore",
    "hydrateTargetCache",
    "resolveProposalSource",
    "commercialHydrationAuthority",
    "readPublishedEngineering",
    "setInterval",
  ].forEach((token) => assert.equal(resolver.includes(token), false, `resolver must not contain ${token}`));
  assert.match(resolver, /return null;/);
});

test("G — the global shell owns no durable engineering or bass restore", () => {
  const layout = read("src/Layout.jsx");
  assert.equal(layout.includes("useVersionedEngineeringAuthority"), false);
  assert.equal(layout.includes("BassAuthorityRestore"), false);
});

test("H — Proposal Centre is passive until the wizard owns readiness", () => {
  const centre = read("src/pages/ProposalCentre.jsx");
  const wizard = read("src/components/proposal/CreateProposalWizard.jsx");
  assert.equal(centre.includes("useVersionedEngineeringSnapshot"), false);
  assert.equal(centre.includes("useProposalReadiness"), false);
  assert.match(wizard, /useVersionedEngineeringSnapshot\(/);
  // The wizard owns readiness through the ONE shared per-version authority, and
  // consults no second, legacy report-ready gate.
  assert.match(wizard, /useProposalReadiness\(/);
  assert.equal(wizard.includes("useProposalSourceStatus"), false);
});

test("I — open-time target work is disarmed and sweep writes are batched", () => {
  const owner = read("src/components/room/bass/BassBackgroundAnalysisOwner.jsx");
  const scheduler = read("src/components/room/bass/p14TargetBackgroundScheduler.js");
  assert.match(owner, /const \[targetSweepArmed, setTargetSweepArmed\] = useState\(false\)/);
  assert.match(owner, /if \(!targetSweepArmed\) \{/);
  assert.match(owner, /if \(!targetSweepArmed\) return;/);
  assert.equal(
    (scheduler.match(/deferPersistence: true/g) || []).length,
    2,
    "authoritative and limited targets stay memory-first during a sweep",
  );
  assert.match(scheduler, /flushTargetCachePersistence\(this\.projectId, this\.versionId\)/);
});

test("J — shared reads are single-flight and read failures stay explicit", () => {
  const cache = read("src/components/state/projectReadCache.js");
  const authority = read("src/components/engineering/versionedEngineeringAuthority.js");
  const technical = read("src/pages/RP22Report.jsx");
  const visual = read("src/pages/RP22ClientReport.jsx");
  assert.match(cache, /function singleFlight\(/);
  assert.match(cache, /const existing = map\.get\(key\)/);
  assert.match(authority, /READ_FAILED/);
  assert.match(authority, /durablePublicationReads/);
  assert.match(technical, /Saved engineering authority could not be read/);
  assert.match(technical, /onClick=\{reportAuthority\.retry\}/);
  assert.match(visual, /authorityReadFailed/);
  assert.match(visual, /authority\.retry/);
});

test("K — the shipped authority cannot release with any core row unfinished", () => {
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
    assert.equal(readiness.release, false, `${skip.key} unfinished must hold`);
  });

  _resetProjectOpeningForTest();
  beginProjectOpening(PROJECT, { versionId: VERSION, minVisibleMs: 0, timeoutMs: 0 });
  resolveProjectOpeningCheckpoints(Object.fromEntries(
    RESTORE_ROWS.map((row) => [row.key, {
      state: READY,
      outcome: OPENING_CHECKPOINT_OUTCOME.READY,
      detail: `${row.key} ready`,
    }]),
  ));
  assert.equal(deriveOpeningReadiness(getProjectOpening(), PROJECT).release, true);
});