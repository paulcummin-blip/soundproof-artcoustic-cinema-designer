import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  OPENING_CHECKPOINT_OUTCOME,
  OPENING_CHECKPOINT_STATE,
  PROJECT_OPENING_CHECKPOINT_KEYS,
  PROJECT_OPENING_LINES,
  _resetProjectOpeningForTest,
  beginProjectOpening,
  deriveOpeningReadiness,
  getProjectOpening,
  isProjectOpeningSatisfied,
  markOpeningMinVisibleElapsed,
  markProjectOpeningRetryAvailable,
  markProjectOpeningSlow,
  markProjectOpeningStalled,
  resolveProjectOpeningCheckpoints,
  retryProjectOpening,
} from "../components/state/projectOpeningAuthority.js";

const PROJECT = "project-opening";
const VERSION = "version-opening";
const read = (path) => fs.readFileSync(path, "utf8");
const readyEntries = () => Object.fromEntries(PROJECT_OPENING_CHECKPOINT_KEYS.map((key) => [
  key,
  {
    state: OPENING_CHECKPOINT_STATE.READY,
    outcome: OPENING_CHECKPOINT_OUTCOME.READY,
    detail: `${key} ready`,
  },
]));

function begin(options = {}) {
  _resetProjectOpeningForTest();
  beginProjectOpening(PROJECT, {
    versionId: VERSION,
    minVisibleMs: 0,
    timeoutMs: 0,
    ...options,
  });
}

test("TEST 1 — a fresh core opening holds", () => {
  begin();
  const readiness = deriveOpeningReadiness(getProjectOpening(), PROJECT);
  assert.equal(readiness.holding, true);
  assert.deepEqual(
    PROJECT_OPENING_CHECKPOINT_KEYS,
    ["metadata", "activeVersion", "roomSeating", "speakerLayout", "seatPriorities"],
  );
});

test("TEST 2 — minimum visibility may hold but can never release unfinished work", () => {
  begin({ minVisibleMs: 999999 });
  resolveProjectOpeningCheckpoints(readyEntries());
  assert.equal(deriveOpeningReadiness(getProjectOpening(), PROJECT).release, false);
  markOpeningMinVisibleElapsed();
  assert.equal(deriveOpeningReadiness(getProjectOpening(), PROJECT).release, true);
});

test("TEST 3 — every terminal core row releases and marks the project satisfied", () => {
  begin();
  resolveProjectOpeningCheckpoints(readyEntries());
  const readiness = deriveOpeningReadiness(getProjectOpening(), PROJECT);
  assert.equal(readiness.release, true);
  assert.equal(isProjectOpeningSatisfied(PROJECT), true);
});

test("TEST 4 — slow and retry markers report but do not release", () => {
  begin();
  markProjectOpeningSlow();
  assert.equal(getProjectOpening().slow, true);
  assert.equal(deriveOpeningReadiness(getProjectOpening(), PROJECT).release, false);
  markProjectOpeningRetryAvailable();
  assert.equal(getProjectOpening().retryAvailable, true);
  assert.equal(deriveOpeningReadiness(getProjectOpening(), PROJECT).release, false);
});

test("TEST 5 — a stalled required core row becomes an explicit failure and remains blocked", () => {
  begin();
  resolveProjectOpeningCheckpoints({
    metadata: readyEntries().metadata,
    activeVersion: readyEntries().activeVersion,
    speakerLayout: readyEntries().speakerLayout,
    seatPriorities: readyEntries().seatPriorities,
  });
  markProjectOpeningStalled();
  const readiness = deriveOpeningReadiness(getProjectOpening(), PROJECT);
  assert.equal(readiness.release, false);
  assert.equal(readiness.retryAvailable, true);
  assert.ok(readiness.blockingFailures.some((row) => row.key === "roomSeating"));
});

test("TEST 6 — Retry re-arms only the core design checklist", () => {
  begin();
  markProjectOpeningStalled();
  retryProjectOpening({ minVisibleMs: 0, timeoutMs: 0 });
  const snapshot = getProjectOpening();
  assert.equal(snapshot.attempt, 1);
  assert.deepEqual(Object.keys(snapshot.checkpoints).sort(), PROJECT_OPENING_CHECKPOINT_KEYS.slice().sort());
  assert.ok(Object.values(snapshot.checkpoints).every((entry) => entry.state === OPENING_CHECKPOINT_STATE.PENDING));
});

test("TEST 7 — route names do not alter opening checkpoints", () => {
  begin({ entrySurface: "technical-report" });
  const technical = deriveOpeningReadiness(getProjectOpening(), PROJECT).checklist.map((row) => row.key);
  _resetProjectOpeningForTest();
  beginProjectOpening("another-project", {
    versionId: VERSION,
    entrySurface: "proposal",
    minVisibleMs: 0,
    timeoutMs: 0,
  });
  const proposal = deriveOpeningReadiness(getProjectOpening(), "another-project").checklist.map((row) => row.key);
  assert.deepEqual(technical, proposal);
});

test("TEST 8 — the panel shows only the two useful core progress lines", () => {
  assert.deepEqual(
    PROJECT_OPENING_LINES.map((line) => line.label),
    ["Room and seating", "Speaker layout"],
  );
});

test("TEST 9 — gate, panel and resolver share the core authority", () => {
  const gate = read("src/components/state/ProjectGate.jsx");
  const panel = read("src/components/state/ProjectLoadingShell.jsx");
  const resolver = read("src/components/state/ProjectOpeningResolver.jsx");
  assert.match(gate, /useProjectOpening\(/);
  assert.match(gate, /ProjectOpeningResolver/);
  assert.match(panel, /lines/);
  assert.match(resolver, /resolveProjectOpeningCheckpoints/);
  assert.equal(gate.includes("entrySurface="), false);
  assert.equal(resolver.includes("BassAuthorityRestore"), false);
});

test("TEST 10 — report gates are route-owned and never blank-render incomplete data", () => {
  const technical = read("src/pages/RP22Report.jsx");
  const designReview = read("src/pages/DesignReviewPage.jsx");
  const visual = read("src/pages/RP22ClientReport.jsx");
  assert.match(technical, /Technical Report not ready/);
  assert.match(technical, /Saved engineering authority could not be read/);
  assert.match(designReview, /Technical Report not ready/);
  assert.match(designReview, /Saved engineering authority could not be read/);
  assert.match(visual, /ReportStatePanel/);
  assert.match(visual, /authorityReadFailed/);
});

test("TEST 11 — late core resolution opens after a stall is retried", () => {
  begin();
  markProjectOpeningStalled();
  retryProjectOpening({ minVisibleMs: 0, timeoutMs: 0 });
  resolveProjectOpeningCheckpoints(readyEntries());
  assert.equal(deriveOpeningReadiness(getProjectOpening(), PROJECT).release, true);
});
