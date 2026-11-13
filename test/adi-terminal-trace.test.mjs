import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  serializeOptimiserPlan, hydrateOptimiserPlan,
} from "../src/components/room/bass/optimiserPlan/optimiserPlanPersistence.js";
import {
  beginOptimiserRun, resolvePresentationPlan,
} from "../src/components/room/bass/optimiserPlan/optimiserRunAuthority.js";

for (const terminalOutcome of [
  "actionable_plan", "no_useful_improvement", "evaluation_incomplete",
  "failed", "stale", "cancelled",
]) {
  test(`trace round trip preserves ${terminalOutcome}`, () => {
    const run = { runId: `trace-${terminalOutcome}` };
    const terminalTrace = {
      runId: run.runId, terminalOutcome, planSave: "requested",
      firstIssue: terminalOutcome === "failed"
        ? { stage: "plan-construction", kind: "exception", message: "TypeError: Unexpected exception." }
        : null,
    };
    const saved = serializeOptimiserPlan({ run, designFingerprint: "design", terminalTrace });
    assert.deepEqual(saved.terminalTrace, terminalTrace);
    const reopened = hydrateOptimiserPlan("trace-project", terminalOutcome, JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(reopened.terminalTrace, { ...terminalTrace, planSave: "acknowledged" });
  });
}

test("superseding a run suppresses its earlier trace", () => {
  const run = beginOptimiserRun("trace-project", "supersession");
  const previous = { run, terminalTrace: { runId: run.runId }, savedAt: run.startedAt };
  const current = beginOptimiserRun("trace-project", "supersession");
  assert.equal(resolvePresentationPlan({ plan: previous, run: current }).plan, null);
});

test("version save reports rejection and acknowledges only after the awaited write", () => {
  const source = readFileSync(new URL("../src/components/hooks/useProjectLoader.jsx", import.meta.url), "utf8");
  for (const state of ["designState", "designStateMS"]) {
    const start = source.indexOf(`const terminalTrace = ${state}.optimiser_plan?.terminalTrace`);
    assert.ok(start >= 0);
    const path = source.slice(start, start + 850);
    assert.match(path, /await base44\.entities\.ProjectVersion\.update/);
    assert.match(path, /catch \(error\)[\s\S]*planSave: "failed"[\s\S]*throw error;[\s\S]*acknowledgeOptimiserPlanSave/);
  }
});
