/**
 * designRecommendationProfile.fixtures
 * -------------------------------------
 * Regression tests for the RP22 level-profile recommendation classification.
 *
 * Verifies that recommendation eligibility and ranking are driven by achieved
 * RP22 level/profile changes, NOT by ASDR percentage movement.
 *
 * Run via exec_tool:
 *   require('./src/components/recommendations/designRecommendationProfile.fixtures').runProfileAssertions()
 */
import {
  computeImprovementProfile,
  computeDegradationProfile,
  getAffectedParameters,
  getParameterLevelChanges,
  getPriorityLabel,
  compareSeatDistributions,
  parseSeatDistribution,
} from "./designRecommendationProfile.js";

// ── Mock rating helpers ──

function roomRating(pct, contributions) {
  return {
    displayPercentage: pct,
    actualPoints: pct * 10,
    contributions,
  };
}

function roomParam(key, level, weight = 8) {
  const multiplier = { L4: 12, L3: 8, L2: 4, L1: 2, FAIL: -5 }[level] || 0;
  return {
    key,
    scope: "room",
    resultLevel: level,
    earnedPoints: multiplier * weight,
    maximumPoints: 12 * weight,
  };
}

function seatParam(key, distribution, weight = 6) {
  const counts = parseSeatDistribution(distribution) || {};
  const total = (counts.l4Count || 0) + (counts.l3Count || 0) + (counts.l2Count || 0) +
    (counts.l1Count || 0) + (counts.failCount || 0);
  const sum = (counts.l4Count || 0) * 12 + (counts.l3Count || 0) * 8 +
    (counts.l2Count || 0) * 4 + (counts.l1Count || 0) * 2 +
    (counts.failCount || 0) * (-5);
  const avg = total > 0 ? sum / total : 0;
  return {
    key,
    scope: "seat",
    resultLevel: distribution,
    earnedPoints: avg * weight,
    maximumPoints: 12 * weight,
  };
}

export function runProfileAssertions() {
  const tests = [];
  const check = (name, expected, actual) => {
    const pass = JSON.stringify(expected) === JSON.stringify(actual);
    tests.push({ test: name, expected, actual, pass });
  };

  // ═══════════════════════════════════════════════════════════════
  // A. Screen L4 → L4, ASDR +1pp → NOT an improvement
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(72, [seatParam("screen", "L4", 7)]);
    const candidate = roomRating(73, [seatParam("screen", "L4", 7)]);
    const profile = computeImprovementProfile(baseline, candidate);
    check("A1. Screen L4→L4 isImprovement = false", false, profile.isImprovement);
    check("A2. Screen L4→L4 affectedParams = []", [], getAffectedParameters(baseline, candidate));
    check("A3. Screen L4→L4 priorityClass = 0", 0, profile.priorityClass);
  }

  // ═══════════════════════════════════════════════════════════════
  // B. P12 L2 → L3, ASDR +1pp → IMPROVEMENT
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(72, [roomParam("p12", "L2")]);
    const candidate = roomRating(73, [roomParam("p12", "L3")]);
    const profile = computeImprovementProfile(baseline, candidate);
    check("B1. P12 L2→L3 isImprovement = true", true, profile.isImprovement);
    check("B2. P12 L2→L3 l2Removed = 1", 1, profile.l2Removed);
    check("B3. P12 L2→L3 affectedParams = ['P12']", ["P12"], getAffectedParameters(baseline, candidate));
    check("B4. P12 L2→L3 priorityClass = 2", 2, profile.priorityClass);
    check("B5. P12 L2→L3 hasDegradation = false", false, profile.hasDegradation);
  }

  // ═══════════════════════════════════════════════════════════════
  // C. Seat distribution 2×L3 + 2×L1 → 2×L3 + 2×L2 → IMPROVEMENT
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(72, [seatParam("p5", "2×L3 · 2×L1")]);
    const candidate = roomRating(73, [seatParam("p5", "2×L3 · 2×L2")]);
    const profile = computeImprovementProfile(baseline, candidate);
    check("C1. Seat 2×L1→2×L2 isImprovement = true", true, profile.isImprovement);
    check("C2. Seat 2×L1→2×L2 l1Removed = 2", 2, profile.l1Removed);
    check("C3. Seat 2×L1→2×L2 affectedParams = ['P5']", ["P5"], getAffectedParameters(baseline, candidate));
    check("C4. Seat 2×L1→2×L2 priorityClass = 3", 3, profile.priorityClass);
  }

  // ═══════════════════════════════════════════════════════════════
  // D. Seat distribution unchanged, raw values change → NOT an improvement
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(72, [seatParam("p5", "L4")]);
    const candidate = roomRating(73, [seatParam("p5", "L4")]);
    const profile = computeImprovementProfile(baseline, candidate);
    check("D1. Unchanged distribution isImprovement = false", false, profile.isImprovement);
    check("D2. Unchanged distribution affectedParams = []", [], getAffectedParameters(baseline, candidate));
  }

  // ═══════════════════════════════════════════════════════════════
  // E. Cost saving P12 L3 → L3, saving £1,000 → STRONG saving (profile preserved)
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(72, [roomParam("p12", "L3")]);
    const candidate = roomRating(72, [roomParam("p12", "L3")]);
    const profile = computeDegradationProfile(baseline, candidate);
    check("E1. P12 L3→L3 hasDegradation = false", false, profile.hasDegradation);
    check("E2. P12 L3→L3 degradationScore = 0", 0, profile.degradationScore);
    check("E3. P12 L3→L3 hasNewFail = false", false, profile.hasNewFail);
    check("E4. P12 L3→L3 hasNewL1 = false", false, profile.hasNewL1);
  }

  // ═══════════════════════════════════════════════════════════════
  // F. Cost saving P12 L3 → L2, saving £1,000 → weaker than E (degraded)
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(72, [roomParam("p12", "L3")]);
    const candidate = roomRating(70, [roomParam("p12", "L2")]);
    const profile = computeDegradationProfile(baseline, candidate);
    const eProfile = computeDegradationProfile(
      roomRating(72, [roomParam("p12", "L3")]),
      roomRating(72, [roomParam("p12", "L3")])
    );
    check("F1. P12 L3→L2 hasDegradation = true", true, profile.hasDegradation);
    check("F2. P12 L3→L2 degradationScore > 0", true, profile.degradationScore > 0);
    check("F3. P12 L3→L2 degradationScore > E degradationScore", true,
      profile.degradationScore > eProfile.degradationScore);
    check("F4. P12 L3→L2 hasNewFail = false", false, profile.hasNewFail);
    check("F5. P12 L3→L2 hasNewL1 = false", false, profile.hasNewL1);
  }

  // ═══════════════════════════════════════════════════════════════
  // G. Cost saving creates new FAIL → EXCLUDED
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(72, [roomParam("p12", "L3")]);
    const candidate = roomRating(60, [roomParam("p12", "FAIL")]);
    const profile = computeDegradationProfile(baseline, candidate);
    check("G1. P12 L3→FAIL hasNewFail = true", true, profile.hasNewFail);
    check("G2. P12 L3→FAIL hasDegradation = true", true, profile.hasDegradation);
    check("G3. P12 L3→FAIL newFail = 1", 1, profile.newFail);
  }

  // ═══════════════════════════════════════════════════════════════
  // H. FAIL → L1 is an improvement (FAIL removed)
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(60, [roomParam("p5", "FAIL")]);
    const candidate = roomRating(65, [roomParam("p5", "L1")]);
    const profile = computeImprovementProfile(baseline, candidate);
    check("H1. FAIL→L1 isImprovement = true", true, profile.isImprovement);
    check("H2. FAIL→L1 failRemoved = 1", 1, profile.failRemoved);
    check("H3. FAIL→L1 priorityClass = 4", 4, profile.priorityClass);
  }

  // ═══════════════════════════════════════════════════════════════
  // I. FAIL → L4 is a strong improvement (FAIL removed)
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(60, [roomParam("p5", "FAIL")]);
    const candidate = roomRating(75, [roomParam("p5", "L4")]);
    const profile = computeImprovementProfile(baseline, candidate);
    check("I1. FAIL→L4 isImprovement = true", true, profile.isImprovement);
    check("I2. FAIL→L4 failRemoved = 1", 1, profile.failRemoved);
    check("I3. FAIL→L4 priorityClass = 4", 4, profile.priorityClass);
  }

  // ═══════════════════════════════════════════════════════════════
  // J. Multi-parameter improvement (P1, P5, P9 improve, Screen stays L4)
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(65, [
      seatParam("p1", "L1"),
      seatParam("p5", "2×L1"),
      seatParam("p9", "L2"),
      seatParam("screen", "L4"),
    ]);
    const candidate = roomRating(72, [
      seatParam("p1", "L2"),
      seatParam("p5", "2×L2"),
      seatParam("p9", "L3"),
      seatParam("screen", "L4"),
    ]);
    const profile = computeImprovementProfile(baseline, candidate);
    check("J1. Multi-param isImprovement = true", true, profile.isImprovement);
    check("J2. Multi-param l1Removed = 3", 3, profile.l1Removed);
    check("J3. Multi-param l2Removed = 1", 1, profile.l2Removed);
    check("J4. Multi-param hasDegradation = false", false, profile.hasDegradation);
    check("J5. Multi-param affectedParams has 3 entries", 3, profile.affectedParams.length);
    check("J6. Multi-param Screen NOT in affectedParams", true,
      !profile.affectedParams.includes("screen"));
  }

  // ═══════════════════════════════════════════════════════════════
  // K. L4 → L4 with ASDR change is NOT an improvement (no level change)
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(72, [roomParam("p12", "L4")]);
    const candidate = roomRating(76, [roomParam("p12", "L4")]);
    const profile = computeImprovementProfile(baseline, candidate);
    check("K1. L4→L4 +4pp isImprovement = false", false, profile.isImprovement);
    check("K2. L4→L4 +4pp affectedParams = []", [], getAffectedParameters(baseline, candidate));
  }

  // ═══════════════════════════════════════════════════════════════
  // L. Degradation hierarchy: L4→L3 preferred over L3→L2 for savings
  // ═══════════════════════════════════════════════════════════════
  {
    const baseRating = roomRating(72, [seatParam("p5", "2×L4 · 2×L3")]);

    const l4ToL3 = computeDegradationProfile(
      baseRating,
      roomRating(71, [seatParam("p5", "1×L4 · 3×L3")])
    );
    const l3ToL2 = computeDegradationProfile(
      baseRating,
      roomRating(70, [seatParam("p5", "2×L4 · 1×L3 · 1×L2")])
    );

    check("L1. L4→L3 degradationScore = 1", 1, l4ToL3.degradationScore);
    check("L2. L3→L2 degradationScore = 10", 10, l3ToL2.degradationScore);
    check("L3. L4→L3 preferred over L3→L2 (lower score)", true,
      l4ToL3.degradationScore < l3ToL2.degradationScore);
  }

  // ═══════════════════════════════════════════════════════════════
  // M. Seat distribution comparison: 2×L3+2×L1 worse than 2×L3+2×L2
  // ═══════════════════════════════════════════════════════════════
  {
    const before = parseSeatDistribution("2×L3 · 2×L1");
    const after = parseSeatDistribution("2×L3 · 2×L2");
    check("M1. 2×L1→2×L2 comparison > 0 (improvement)", true,
      compareSeatDistributions(before, after) > 0);
  }

  // ═══════════════════════════════════════════════════════════════
  // N. 2×L4 + 2×L3 unchanged is NOT an improvement
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(72, [seatParam("p5", "2×L4 · 2×L3")]);
    const candidate = roomRating(73, [seatParam("p5", "2×L4 · 2×L3")]);
    const profile = computeImprovementProfile(baseline, candidate);
    check("N1. 2×L4+2×L3 unchanged isImprovement = false", false, profile.isImprovement);
  }

  // ═══════════════════════════════════════════════════════════════
  // O. Parameter level changes display
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(72, [
      roomParam("p12", "L2"),
      seatParam("screen", "L4"),
    ]);
    const candidate = roomRating(75, [
      roomParam("p12", "L3"),
      seatParam("screen", "L4"),
    ]);
    const changes = getParameterLevelChanges(baseline, candidate);
    check("O1. Level changes has 1 entry (P12 only)", 1, changes.length);
    check("O2. P12 change display = 'P12'", "P12", changes[0]?.display);
    check("O3. P12 beforeLevel = 'L2'", "L2", changes[0]?.beforeLevel);
    check("O4. P12 afterLevel = 'L3'", "L3", changes[0]?.afterLevel);
    check("O5. P12 isImproved = true", true, changes[0]?.isImproved);
  }

  // ═══════════════════════════════════════════════════════════════
  // P. Improvement with degradation is NOT an improvement (trade-off)
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(70, [
      roomParam("p12", "L2"),
      seatParam("p5", "L3"),
    ]);
    const candidate = roomRating(71, [
      roomParam("p12", "L3"),
      seatParam("p5", "L2"),
    ]);
    const profile = computeImprovementProfile(baseline, candidate);
    check("P1. Mixed improve+degrade isImprovement = false", false, profile.isImprovement);
    check("P2. Mixed hasDegradation = true", true, profile.hasDegradation);
  }

  // ═══════════════════════════════════════════════════════════════
  // Q. Priority label for FAIL-dominant improvement
  // ═══════════════════════════════════════════════════════════════
  {
    const baseline = roomRating(60, [roomParam("p5", "FAIL")]);
    const candidate = roomRating(65, [roomParam("p5", "L1")]);
    const profile = computeImprovementProfile(baseline, candidate);
    const label = getPriorityLabel(profile);
    check("Q1. Priority label = 'PRIORITY: Resolve P5 failure'",
      "PRIORITY: Resolve P5 failure", label);
  }

  return tests;
}