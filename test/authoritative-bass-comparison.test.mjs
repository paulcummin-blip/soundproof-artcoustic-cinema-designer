import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const actions = await import("../src/components/room/bass/bassHeavyActionStore.js");
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const panel = read("../src/components/room/bass/BassPostCalculationActions.jsx");
const stage2 = read("../src/components/room/bass/stage2/stage2CanonicalEvaluation.js");
const stage2Constants = read("../src/components/room/bass/stage2/stage2Constants.js");
const adapter = read("../src/components/room/bass/best-layout/stage2RecommendationAdapter.js");
const roomDesigner = read("../src/pages/RoomDesigner.jsx");

test("Compare Bass Options is an explicit fingerprint-bound heavy action", () => {
  assert.equal(actions.requestBassHeavyAction("compare-project", "compare", null), null);
  const requested = actions.requestBassHeavyAction("compare-project", "compare", "design:current");
  assert.equal(requested.action, "compare");
  assert.equal(requested.status, "requested");
  assert.equal(requested.sourceFingerprint, "design:current");
  assert.match(panel, /requestBassHeavyAction\(projectId, "compare", shared\.cacheKey\)/);
  assert.match(roomDesigner, /\["optimise", "compare"\]\.includes\(bassHeavyAction\.action\)/);
});

test("comparison publishes only after the explicit canonical search completes", () => {
  assert.match(panel, /const comparisonReady = action\?\.action === "compare"[\s\S]*action\.status === "complete"[\s\S]*stage2\.status === "complete"/);
  assert.match(panel, /\{comparisonReady && \([\s\S]*<ComparisonTable/);
  assert.match(stage2, /simulateAuthoritativeBassResponse/);
  assert.match(stage2, /generateCanonicalCandidatePool/);
  assert.match(stage2, /evaluateCanonicalBassAuthority/);
  assert.match(panel, /full canonical P14\/P18\/P19\/P20 evaluation/);
});

test("comparison presents current, two-sub and four-sub authoritative outcomes", () => {
  assert.match(panel, /title: "Current"/);
  assert.match(panel, /title: "Recommended 2 Subs"/);
  assert.match(panel, /title: "Recommended 4 Subs"/);
  for (const parameter of ["P14", "P18", "P19", "P20"]) {
    assert.match(panel, new RegExp(`label: "${parameter}"`));
  }
  assert.match(panel, /stage2\.two_sub_result/);
  assert.match(panel, /stage2\.four_sub_result/);
});

test("comparison carries existing P14 and P18 authority without recomputing grades", () => {
  assert.match(stage2, /p14AchievedLevel: authority\.achievedP14Level \?\? canonicalResult\.achievedP14Level \?\? null/);
  assert.match(stage2, /p18AchievedLevel: authority\.achievedP18Level \?\? canonicalResult\.achievedP18Level \?\? null/);
  assert.match(adapter, /p14AchievedLevel: canonicalResult\?\.p14AchievedLevel \?\? null/);
  assert.match(stage2Constants, /STAGE2_CANONICAL_VERSION = "stage2-canonical-v5"/);
  assert.doesNotMatch(panel, /gradeP14|gradeP18|gradeP19|gradeP20/);
});

test("commercial guidance does not automatically recommend more subwoofers", () => {
  assert.match(panel, /improve subwoofer capability or size before adding boxes/);
  assert.match(panel, /Four subs provide only marginal useful improvement/);
  assert.match(panel, /Four subs materially improve the weakest placement result/);
  assert.match(panel, /A second sub improves the weakest seat-coverage result/);
  assert.match(panel, /more subwoofers are not recommended unless the authoritative result improves materially/);
});

test("missing authority is displayed as unavailable, never converted to failure", () => {
  assert.match(panel, /value === null \|\| value === undefined \|\| value === ""/);
  assert.match(panel, /if \(!Number\.isFinite\(value\)\) return "—"/);
});
