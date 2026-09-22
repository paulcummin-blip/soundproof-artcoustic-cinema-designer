import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildAiSummaryPayload } from "../src/components/aiSummary/buildAiSummaryPayload.js";
import { buildSingleSummaryPrompt } from "../base44/shared/aiSummaryPromptBuilder.js";

const engineeringSummary = {
  primary: { designPerformanceIndex: 80, categories: [] },
  secondary: { designPerformanceIndex: 80, categories: [] },
  project: { designPerformanceIndex: 80, reportCounts: {} },
  parameterAuthority: {
    p15: { scope: "room", state: "scored", level: "L2" },
    p21: { scope: "room", state: "scored", level: "L2" },
  },
  parameterSummaries: {
    primary: { p15: { level: "L2" }, p21: { level: "L2" } },
    secondary: { p15: { level: "L2" }, p21: { level: "L2" } },
    project: { p15: { level: "L2" }, p21: { level: "L2" } },
  },
  roomResultsByParameter: {
    15: { status: "assumed", assumed: true, level: "L2", formatted: "NCB 22" },
    21: { status: "assumed", assumed: true, level: "L2", formatted: "Assumed" },
  },
};

test("AI payload and prompt publish both permanent assumptions as L2", () => {
  const payload = buildAiSummaryPayload({
    publishedSnapshot: { projectId: "p", versionId: "v", engineeringSummary },
    projectDetails: { name: "Test" },
    projectId: "p",
    versionId: "v",
  });
  assert.equal(payload.parameters.all.p15.level, "L2");
  assert.equal(payload.parameters.all.p21.level, "L2");
  assert.deepEqual(payload.assumptions.p15, {
    level: "L2",
    status: "Assumed",
    value: "NCB 22",
    note: "Design target: NCB 22",
  });
  assert.equal(payload.assumptions.p21.level, "L2");
  assert.equal(payload.assumptions.p21.status, "Assumed");

  const prompt = buildSingleSummaryPrompt(payload);
  assert.match(prompt, /P15 Background noise floor: Assumed L2, NCB 22/);
  assert.match(prompt, /P21 Early reflections: Assumed L2/);
  assert.doesNotMatch(prompt, /P15 Background noise floor: Not Calculated/);
  assert.doesNotMatch(prompt, /P21 Early reflections: Not Calculated/);
});

test("report presentation contains fixed assumption copy and no selectable assumption controls", async () => {
  const source = await readFile(new URL("../src/components/report/P15P21AssumptionControl.jsx", import.meta.url), "utf8");
  assert.match(source, /Design target: NCB 22/);
  assert.match(source, /Early reflections have not been measured/);
  assert.match(source, /DEFAULT_ASSUMED_LEVEL/);
  assert.doesNotMatch(source, /options\.map/);
  assert.doesNotMatch(source, /Not Calculated/);
  assert.doesNotMatch(source, />N\/A</);
});
