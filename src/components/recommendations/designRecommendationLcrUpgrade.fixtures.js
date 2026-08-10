/**
 * LCR upgrade search + 5pp materiality regression fixtures.
 *
 * Candidate generation is registry-driven. Ratings below are canonical-shaped
 * fixture outputs used only to verify recommendation eligibility and ordering;
 * production candidates are evaluated by the live SPL → RP22 → ASDR chain.
 */

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import {
  buildDesignRecommendationCandidates,
  rankDesignRecommendations,
} from "./designRecommendationCandidates.js";

function roomParam(key, level) {
  return { key, scope: "room", resultLevel: level };
}

function rating(displayPercentage, contributions) {
  return {
    displayPercentage,
    actualPoints: displayPercentage * 10,
    contributions,
  };
}

function lcrCandidate(id, costDeltaExVat) {
  return {
    id,
    kind: "lcr",
    recommendationDirection: "upgrade",
    title: id,
    costDeltaExVat,
    disruption: "Low",
    confidence: "High",
  };
}

function evaluated(candidate, candidateRating) {
  return { candidate, rating: candidateRating };
}

const baseLcr = [
  { id: "FL-1", role: "FL", model: "EVOLVE 3-1", position: { x: 0.5, y: 0.1, z: 1.2 } },
  { id: "FC-1", role: "FC", model: "EVOLVE 3-1", position: { x: 1.5, y: 0.1, z: 1.2 } },
  { id: "FR-1", role: "FR", model: "EVOLVE 3-1", position: { x: 2.5, y: 0.1, z: 1.2 } },
];

export function runLcrUpgradeAssertions() {
  const tests = [];
  const check = (name, expected, actual) => {
    const pass = JSON.stringify(expected) === JSON.stringify(actual);
    tests.push({ test: name, expected, actual, pass });
  };

  const generated = buildDesignRecommendationCandidates({
    placedSpeakers: baseLcr,
    allowUkPricing: false,
    lcrPowerW: 100,
  });
  const upgrades = generated.filter(
    (candidate) => candidate.kind === "lcr" && candidate.recommendationDirection === "upgrade"
  );
  const upgradeModels = upgrades.map(
    (candidate) => candidate.placedSpeakers.find((speaker) => speaker.role === "FL")?.model
  );
  const uniqueUpgradeModels = [...new Set(upgradeModels)];

  check(
    "All stronger compatible EVOLVE 3-1 upgrades are generated",
    ["evolve-4-2", "q4-3", "q6-3", "evolve-6-3", "evolve-8-4", "q4-5", "q8-5"],
    uniqueUpgradeModels
  );
  check("Q8-5 is evaluated", true, uniqueUpgradeModels.includes("q8-5"));
  check(
    "Only discrete LCR registry models are included",
    true,
    uniqueUpgradeModels.every((model) => {
      const meta = getSpeakerModelMeta(model);
      return meta?.category === "LCR" && !meta?.frontStageType;
    })
  );
  check(
    "Model-only candidates stay at current power; useful registry-max variants are added",
    [100, 100, 100, 100, 100, 100, 400, 100, 800],
    upgrades.map((candidate) => candidate.lcrPowerAfterW)
  );
  const poweredUpgrades = upgrades.filter((candidate) => candidate.amplifierUpgradeRequired);
  check(
    "Only current-power-limited models receive an amplifier variant",
    ["q4-5", "q8-5"],
    poweredUpgrades.map(
      (candidate) => candidate.placedSpeakers.find((speaker) => speaker.role === "FL")?.model
    )
  );
  check(
    "Amplifier variants expose an unpriced-hardware caveat",
    true,
    poweredUpgrades.every(
      (candidate) =>
        candidate.amplifierCostIncluded === false &&
        candidate.caveat?.includes("Amplifier hardware cost is not included")
    )
  );

  const strongestLcr = baseLcr.map((speaker) => ({ ...speaker, model: "q8-5" }));
  const noStronger = buildDesignRecommendationCandidates({
    placedSpeakers: strongestLcr,
    allowUkPricing: false,
    lcrPowerW: 800,
  }).filter((candidate) => candidate.recommendationDirection === "upgrade");
  check("Current LCR with no stronger model has no upgrade candidate", [], noStronger.map((item) => item.id));

  const baseline = rating(52, [roomParam("p12", "L2"), roomParam("p5", "L4")]);
  const adjacent = lcrCandidate("adjacent-plus-2", 1500);
  const higher = lcrCandidate("higher-plus-7", 2800);
  const materialResult = rankDesignRecommendations({
    baselineRating: baseline,
    evaluatedCandidates: [
      evaluated(adjacent, rating(54, [roomParam("p12", "L3"), roomParam("p5", "L4")])),
      evaluated(higher, rating(59, [roomParam("p12", "L4"), roomParam("p5", "L4")])),
    ],
  });
  check(
    "Adjacent +2pp is hidden while higher +7pp is shown",
    ["higher-plus-7"],
    materialResult.improvements.map((item) => item.id)
  );

  const exactFive = lcrCandidate("exact-plus-5", 2400);
  const belowFive = lcrCandidate("below-plus-5", 1800);
  const thresholdResult = rankDesignRecommendations({
    baselineRating: baseline,
    evaluatedCandidates: [
      evaluated(exactFive, rating(57, [roomParam("p12", "L4"), roomParam("p5", "L4")])),
      evaluated(belowFive, rating(56.999, [roomParam("p12", "L4"), roomParam("p5", "L4")])),
    ],
  });
  check(
    "Canonical unrounded +5.0pp boundary is unchanged",
    ["exact-plus-5"],
    thresholdResult.improvements.map((item) => item.id)
  );

  const lowerCost = lcrCandidate("same-profile-lower-cost", 2000);
  const higherCost = lcrCandidate("same-profile-higher-cost", 6000);
  const solvedProfileResult = rankDesignRecommendations({
    baselineRating: baseline,
    evaluatedCandidates: [
      evaluated(higherCost, rating(59, [roomParam("p12", "L4"), roomParam("p5", "L4")])),
      evaluated(lowerCost, rating(59, [roomParam("p12", "L4"), roomParam("p5", "L4")])),
    ],
  });
  check(
    "Same solved RP22 profile prefers lower cost",
    ["same-profile-lower-cost", "same-profile-higher-cost"],
    solvedProfileResult.improvements.map((item) => item.id)
  );
  check(
    "Best value material upgrade metadata is exposed",
    "BEST VALUE MATERIAL UPGRADE",
    solvedProfileResult.improvements[0]?.materialUpgradeLabel
  );

  const degrading = lcrCandidate("plus-6-with-degradation", 2200);
  const degradationResult = rankDesignRecommendations({
    baselineRating: rating(52, [roomParam("p12", "L2"), roomParam("p5", "L3")]),
    evaluatedCandidates: [
      evaluated(degrading, rating(58, [roomParam("p12", "L4"), roomParam("p5", "L2")])),
    ],
  });
  check(
    "A +6pp LCR candidate with another RP22 degradation is not eligible",
    [],
    degradationResult.improvements.map((item) => item.id)
  );

  const alreadyL4Baseline = rating(70, [roomParam("p12", "L4"), roomParam("p5", "L4")]);
  const unusedHeadroom = lcrCandidate("unused-headroom", 6000);
  const alreadySolvedResult = rankDesignRecommendations({
    baselineRating: alreadyL4Baseline,
    evaluatedCandidates: [
      evaluated(unusedHeadroom, rating(76, [roomParam("p12", "L4"), roomParam("p5", "L4")])),
    ],
  });
  check(
    "P12 already L4 does not recommend unused raw headroom",
    [],
    alreadySolvedResult.improvements.map((item) => item.id)
  );

  return {
    tests,
    passed: tests.filter((test) => test.pass).length,
    total: tests.length,
    allPassed: tests.every((test) => test.pass),
    generatedUpgradeModels: uniqueUpgradeModels,
    generatedUpgradePowersW: upgrades.map((candidate) => candidate.lcrPowerAfterW),
    materialOrdering: materialResult.improvements.map((item) => item.id),
    solvedProfileOrdering: solvedProfileResult.improvements.map((item) => item.id),
  };
}
