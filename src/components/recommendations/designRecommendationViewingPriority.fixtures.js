/**
 * Stage D deterministic recommendation-ranking fixtures.
 *
 * These fixtures exercise the production ranker with canonical Stage C
 * viewing summaries. No RP23 thresholds or comparator logic are copied here.
 */
import { rankDesignRecommendations } from "./designRecommendationCandidates.js";
import { buildViewingPrioritySummary } from "@/components/utils/viewingPriorityAuthority";

function rating(displayPercentage, contributions) {
  return {
    displayPercentage,
    actualPoints: displayPercentage * 10,
    maximumAvailablePoints: 1000,
    contributions,
  };
}

function roomParam(key, level) {
  const earned = { L4: 12, L3: 8, L2: 4, L1: 2, FAIL: -5 }[level] ?? 0;
  return {
    key,
    scope: "room",
    resultLevel: level,
    earnedPoints: earned,
    maximumPoints: 12,
  };
}

function candidate(id, title, kind = "seating", extras = {}) {
  return {
    id,
    title,
    kind,
    costDeltaExVat: 0,
    disruption: "Low",
    confidence: "High",
    ...extras,
  };
}

function viewingSummary(mode, rows) {
  return buildViewingPrioritySummary(
    rows.map((row) => ({
      rowNumber: row.rowNumber,
      viewingAngleDeg: row.angle,
      viewingDistanceM: row.distance ?? 2.5,
      rp23Level: row.level,
    })),
    mode
  );
}

function viewingContext(mode, beforeRows, afterByCandidateRows) {
  return {
    priorityMode: mode,
    before: viewingSummary(mode, beforeRows),
    afterByCandidateId: Object.fromEntries(
      Object.entries(afterByCandidateRows).map(([id, rows]) => [
        id,
        viewingSummary(mode, rows),
      ])
    ),
  };
}

function evaluated(candidateItem, candidateRating) {
  return { candidate: candidateItem, rating: candidateRating };
}

function orderedIds(result) {
  return result.improvements.map((item) => item.id);
}

export function runViewingPriorityRecommendationAssertions() {
  const tests = [];
  const check = (name, expected, actual) => {
    tests.push({
      test: name,
      expected,
      actual,
      pass: JSON.stringify(expected) === JSON.stringify(actual),
    });
  };

  const beforeTwoRows = [
    { rowNumber: 1, angle: 76.5, level: "L2" },
    { rowNumber: 2, angle: 42.0, level: "L2" },
  ];
  const frontRowFirst = [
    { rowNumber: 1, angle: 57.5, level: "L4" },
    { rowNumber: 2, angle: 42.0, level: "L2" },
  ];
  const balancedRows = [
    { rowNumber: 1, angle: 65.0, level: "L4" },
    { rowNumber: 2, angle: 50.0, level: "L4" },
  ];

  const sameRp22Baseline = rating(70, [roomParam("p12", "L3")]);
  const sameRp22Candidate = rating(72, [roomParam("p12", "L4")]);
  const frontCandidate = candidate("front-row-first", "Front-row-first geometry");
  const balancedCandidate = candidate("balanced-rows", "Balanced two-row geometry");
  const sameProfileEvaluated = [
    evaluated(frontCandidate, sameRp22Candidate),
    evaluated(balancedCandidate, sameRp22Candidate),
  ];

  const balancedResult = rankDesignRecommendations({
    baselineRating: sameRp22Baseline,
    evaluatedCandidates: sameProfileEvaluated,
    viewingContext: viewingContext("balanced", beforeTwoRows, {
      "front-row-first": frontRowFirst,
      "balanced-rows": balancedRows,
    }),
  });
  const row1Result = rankDesignRecommendations({
    baselineRating: sameRp22Baseline,
    evaluatedCandidates: sameProfileEvaluated,
    viewingContext: viewingContext("row_1", beforeTwoRows, {
      "front-row-first": frontRowFirst,
      "balanced-rows": balancedRows,
    }),
  });
  const row2Result = rankDesignRecommendations({
    baselineRating: sameRp22Baseline,
    evaluatedCandidates: sameProfileEvaluated,
    viewingContext: viewingContext("row_2", beforeTwoRows, {
      "front-row-first": frontRowFirst,
      "balanced-rows": balancedRows,
    }),
  });

  check("Two-row Balanced prefers equal L4 rows", "balanced-rows", orderedIds(balancedResult)[0]);
  check("Prioritise Row 1 prefers its exact 57.5-degree row", "front-row-first", orderedIds(row1Result)[0]);
  check("Prioritise Row 2 protects Row 2", "balanced-rows", orderedIds(row2Result)[0]);

  const oneRowBefore = [{ rowNumber: 1, angle: 57.5, level: "L4" }];
  const oneRowA = candidate("one-row-low-disruption", "One-row lower disruption");
  const oneRowB = candidate("one-row-higher-disruption", "One-row higher disruption", "screen", {
    disruption: "Medium",
  });
  const oneRowEvaluated = [
    evaluated(oneRowA, sameRp22Candidate),
    evaluated(oneRowB, sameRp22Candidate),
  ];
  const oneRowWithoutViewing = rankDesignRecommendations({
    baselineRating: sameRp22Baseline,
    evaluatedCandidates: oneRowEvaluated,
  });
  const oneRowWithViewing = rankDesignRecommendations({
    baselineRating: sameRp22Baseline,
    evaluatedCandidates: oneRowEvaluated,
    viewingContext: viewingContext("row_1", oneRowBefore, {
      "one-row-low-disruption": [{ rowNumber: 1, angle: 55, level: "L4" }],
      "one-row-higher-disruption": [{ rowNumber: 1, angle: 58, level: "L4" }],
    }),
  });
  check(
    "One-row ordering is unchanged",
    orderedIds(oneRowWithoutViewing),
    orderedIds(oneRowWithViewing)
  );

  const failBaseline = rating(60, [roomParam("p5", "FAIL")]);
  const failRemovedRating = rating(65, [roomParam("p5", "L1")]);
  const viewingOnlyRating = rating(60, [roomParam("p5", "FAIL")]);
  const failCandidate = candidate("remove-rp22-fail", "Remove RP22 FAIL");
  const viewingOnlyCandidate = candidate("viewing-balance-only", "Improve viewing balance", "screen");
  const failVsViewing = rankDesignRecommendations({
    baselineRating: failBaseline,
    evaluatedCandidates: [
      evaluated(failCandidate, failRemovedRating),
      evaluated(viewingOnlyCandidate, viewingOnlyRating),
    ],
    viewingContext: viewingContext("balanced", beforeTwoRows, {
      "remove-rp22-fail": frontRowFirst,
      "viewing-balance-only": balancedRows,
    }),
  });
  check("FAIL removal beats viewing-only improvement", "remove-rp22-fail", orderedIds(failVsViewing)[0]);

  const hierarchyBaseline = rating(65, [
    roomParam("p5", "L1"),
    roomParam("p12", "L3"),
  ]);
  const l1Removed = rating(68, [
    roomParam("p5", "L2"),
    roomParam("p12", "L3"),
  ]);
  const l3ToL4 = rating(68, [
    roomParam("p5", "L1"),
    roomParam("p12", "L4"),
  ]);
  const l1Candidate = candidate("remove-l1", "Remove L1");
  const l3Candidate = candidate("l3-to-l4", "Improve L3 to L4", "screen");
  const l1VsL3 = rankDesignRecommendations({
    baselineRating: hierarchyBaseline,
    evaluatedCandidates: [
      evaluated(l3Candidate, l3ToL4),
      evaluated(l1Candidate, l1Removed),
    ],
    viewingContext: viewingContext("balanced", beforeTwoRows, {
      "remove-l1": frontRowFirst,
      "l3-to-l4": balancedRows,
    }),
  });
  check("L1 removal beats L3-to-L4 viewing improvement", "remove-l1", orderedIds(l1VsL3)[0]);

  const unchangedL4Rows = [
    { rowNumber: 1, angle: 57.0, level: "L4" },
    { rowNumber: 2, angle: 58.0, level: "L4" },
  ];
  const shiftedSameBalance = [
    { rowNumber: 1, angle: 58.0, level: "L4" },
    { rowNumber: 2, angle: 59.0, level: "L4" },
  ];
  const unchangedScreen = candidate("screen-l4-unchanged", "L4 screen with unchanged balance", "screen");
  const unchangedScreenResult = rankDesignRecommendations({
    baselineRating: rating(80, [roomParam("screen", "L4")]),
    evaluatedCandidates: [
      evaluated(unchangedScreen, rating(80, [roomParam("screen", "L4")])),
    ],
    viewingContext: viewingContext("balanced", unchangedL4Rows, {
      "screen-l4-unchanged": shiftedSameBalance,
    }),
  });
  check("Screen L4-to-L4 unchanged balance is hidden", [], orderedIds(unchangedScreenResult));

  const tradeoffBefore = [
    { rowNumber: 1, angle: 55, level: "L4" },
    { rowNumber: 2, angle: 60, level: "L4" },
  ];
  const tradeoffAfter = [
    { rowNumber: 1, angle: 70, level: "L3" },
    { rowNumber: 2, angle: 42, level: "L2" },
  ];
  const tradeoffCandidate = candidate("rp22-viewing-tradeoff", "RP22 benefit with viewing trade-off");
  const tradeoffResult = rankDesignRecommendations({
    baselineRating: rating(65, [roomParam("p5", "L1")]),
    evaluatedCandidates: [
      evaluated(tradeoffCandidate, rating(68, [roomParam("p5", "L2")])),
    ],
    viewingContext: viewingContext("balanced", tradeoffBefore, {
      "rp22-viewing-tradeoff": tradeoffAfter,
    }),
  });
  check("RP22 benefit remains eligible when viewing worsens", "rp22-viewing-tradeoff", orderedIds(tradeoffResult)[0]);
  check("Viewing trade-off metadata is exposed", true, tradeoffResult.improvements[0]?.viewingTradeoff === true);

  const result = {
    tests,
    passed: tests.filter((test) => test.pass).length,
    total: tests.length,
    allPassed: tests.every((test) => test.pass),
    orderings: {
      oneRow: orderedIds(oneRowWithViewing),
      twoRowBalanced: orderedIds(balancedResult),
      prioritiseRow1: orderedIds(row1Result),
      prioritiseRow2: orderedIds(row2Result),
      failVsViewing: orderedIds(failVsViewing),
      l1VsL3ToL4: orderedIds(l1VsL3),
      sameRp22DifferentBalance: orderedIds(balancedResult),
      screenL4UnchangedBalance: orderedIds(unchangedScreenResult),
      viewingTradeoff: orderedIds(tradeoffResult),
    },
  };

  return result;
}
