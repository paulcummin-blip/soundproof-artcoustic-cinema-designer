import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const policy = await import("../src/components/room/bass/best-layout/fastBassPlacementPolicy.js");
const candidateSource = fs.readFileSync(
  new URL("../src/components/room/bass/best-layout/bestSubLayoutCandidates.js", import.meta.url),
  "utf8",
);
const guideSource = fs.readFileSync(
  new URL("../src/components/room/bass/best-layout/BestSubLayoutGuide.jsx", import.meta.url),
  "utf8",
);
const ownerSource = fs.readFileSync(
  new URL("../src/pages/RoomDesigner.jsx", import.meta.url),
  "utf8",
);

function layout(id, quantity, side, metrics) {
  return {
    id,
    practicalTier: side ? 3 : 1,
    sources: Array.from({ length: quantity }, (_, index) => ({
      x: index + 1,
      y: 1,
      placement: side && index === 0 ? "left" : index % 2 ? "rear" : "front",
    })),
    metrics: {
      sourceCount: quantity,
      priorityNullCount30To60: 0,
      worstPriorityNullDepthDb: 0,
      worstSeatVariationDb: 5,
      meanSeatVariationDb: 3,
      houseCurveCompatibilityDb: 3,
      destructiveBroadNullCount: 0,
      ...metrics,
    },
  };
}

test("candidate library contains the required canonical 1/2/4 layouts", () => {
  [
    "front-centre-1",
    "front-quarter-left-1",
    "front-quarter-right-1",
    "rear-midpoint-1",
    "left-quarter-front-1",
    "front-rear-midpoint-2",
    "front-quarter-2",
    "front-thirds-2",
    "rear-quarter-2",
    "side-midpoints-2",
    "front-rear-pairs-4",
    "front-rear-pairs-third-4",
    "four-corners-4",
    "four-midpoints-4",
  ].forEach((id) => assert.match(candidateSource, new RegExp(`"${id}"`)));
});

test("tiny side-wall gain cannot displace a practical four-sub layout", () => {
  const practical = layout("practical", 4, false, { worstSeatVariationDb: 5 });
  const side = layout("side", 4, true, { worstSeatVariationDb: 4.8 });
  const selected = policy.selectPracticalRecommendation([side, practical], 4);
  assert.equal(selected.id, "practical");
  assert.equal(selected.recommendationKind, "practical-preferred");
});

test("material side-wall gain is surfaced and clearly classified", () => {
  const practical = layout("practical", 4, false, { worstSeatVariationDb: 7 });
  const side = layout("side", 4, true, { worstSeatVariationDb: 4.4 });
  const selected = policy.selectPracticalRecommendation([side, practical], 4);
  assert.equal(selected.id, "side");
  assert.equal(selected.recommendationKind, "side-wall-alternative");
});

test("removing a serious 30–60 Hz null is a material improvement", () => {
  const practical = layout("practical", 2, false, {
    priorityNullCount30To60: 1,
    worstPriorityNullDepthDb: 11,
  });
  const side = layout("side", 2, true, {
    priorityNullCount30To60: 0,
    worstPriorityNullDepthDb: 0,
    worstSeatVariationDb: 5.5,
  });
  assert.equal(policy.selectPracticalRecommendation([side, practical], 2).id, "side");
});

test("advisor UI is lightweight, visual and contains no authoritative grades or worker counts", () => {
  assert.match(guideSource, /useFastBassPlacementAdvisor/);
  assert.match(guideSource, /LayoutThumbnail/);
  assert.match(guideSource, /Apply Layout/);
  assert.match(guideSource, /not P14\/P18\/P19\/P20 results/);
  assert.doesNotMatch(guideSource, /useStage2PlacementOptimiser|completedJobs|totalJobsPlanned|of .*finalists/);
  assert.match(ownerSource, /const recommendationsActive = false/);
});
