import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const panel = read("../src/components/room/SubwooferPanel.jsx");
const response = read("../src/components/room/BassResponse.jsx");
const target = read("../src/components/room/bass/BassTargetLevelControl.jsx");

test("Subwoofer panel follows advise/place/configure/calculate/result hierarchy", () => {
  const advisor = panel.indexOf("<BestSubLayoutGuide");
  const model = panel.indexOf("Front Subwoofers");
  const calculate = panel.indexOf("sharedBassResults?.onCalculate");
  const results = panel.indexOf("<BassResultsSummary");
  assert.ok(advisor >= 0 && advisor < model);
  assert.ok(model < calculate);
  assert.ok(calculate < results);
});

test("current P14/P18/P19/P20 summary is gated by current authority", () => {
  assert.match(panel, /sharedBassResults\?\.hasCurrentResult &&/);
  assert.match(response, /hasCurrentBassResult \?/);
  assert.match(response, /Previous values are excluded from the current RP22 score and report/);
  assert.match(response, /authoritative response graph appears after the current design has been calculated/);
});

test("primary limitation remains after a current calculation", () => {
  assert.match(response, /hasCurrentBassResult[\s\S]*<BassResultCards \/>[\s\S]*<BassDesignRecommendation/);
});

test("normal target UI exposes no multi-target count or spinner", () => {
  assert.doesNotMatch(target, /presentP14AnalysisProgress|useP14AnalysisProgress|Loader2|animate-spin/);
  assert.doesNotMatch(target, /Calculating .* of /);
});
