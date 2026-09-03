import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const actions = await import("../src/components/room/bass/bassHeavyActionStore.js");
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const roomDesigner = read("../src/pages/RoomDesigner.jsx");
const stage1 = read("../src/components/room/bass/stage1/useStage1PlacementOptimiser.js");
const stage2 = read("../src/components/room/bass/stage2/useStage2PlacementOptimiser.js");
const owner = read("../src/components/room/bass/BassBackgroundAnalysisOwner.jsx");
const panel = read("../src/components/room/bass/BassPostCalculationActions.jsx");
const adapter = read("../src/components/room/bass/best-layout/stage2RecommendationAdapter.js");

test("heavy placement action requires an explicit request and source fingerprint", () => {
  assert.equal(actions.requestBassHeavyAction("test-project", "optimise", null), null);
  const requested = actions.requestBassHeavyAction("test-project", "optimise", "design:a");
  assert.equal(requested.action, "optimise");
  assert.equal(requested.status, "requested");
  assert.equal(requested.sourceFingerprint, "design:a");
});

test("stale heavy requests can be cancelled without accepting old completion", () => {
  const requested = actions.requestBassHeavyAction("cancel-project", "optimise", "design:a");
  actions.cancelBassHeavyAction("cancel-project", "design-changed");
  actions.markBassHeavyActionComplete("cancel-project", "wrong-request");
  const state = actions.getBassHeavyAction("cancel-project");
  assert.equal(state.requestId, requested.requestId);
  assert.equal(state.status, "cancelled");
});

test("Stage 1 and Stage 2 bind work to one explicit request fingerprint", () => {
  for (const source of [stage1, stage2]) {
    assert.match(source, /requestId = null/);
    assert.match(source, /explicit-action-required/);
    assert.match(source, /request-fingerprint-stale/);
  }
  assert.match(roomDesigner, /requestId: recommendationsActive \? bassHeavyAction\.requestId : null/);
  assert.doesNotMatch(roomDesigner, /const recommendationsActive = false/);
});

test("geometry changes cancel an optimisation request", () => {
  assert.match(owner, /heavyAction\.sourceFingerprint[\s\S]*!== cacheKey/);
  assert.match(owner, /cancelBassHeavyAction/);
});

test("post-calculation optimiser is explicit and explains the current constraint", () => {
  assert.match(panel, /"Optimise Bass Layout"/);
  assert.match(panel, /if \(!shared\.hasCurrentResult\) return null/);
  assert.match(panel, /Placement and\/or subwoofer quantity is the present constraint/);
  assert.match(panel, /Capability or extension is the present constraint/);
  assert.doesNotMatch(panel, /completedJobs|totalJobsPlanned| of /);
});

test("authoritative recommendation adapter applies the practical side-wall threshold", () => {
  assert.match(adapter, /variationThreshold = quantity === 4 \? 2\.5 : 2/);
  assert.match(adapter, /gradeBandGain >= 1/);
  assert.match(adapter, /priorityProblemRemoved/);
  assert.match(adapter, /practical-preferred/);
});
