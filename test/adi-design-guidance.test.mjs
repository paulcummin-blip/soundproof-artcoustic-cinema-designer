// test/adi-design-guidance.test.mjs
//
// ACCEPTANCE TEST — ADI Design Guidance closing the loop from evidence to
// design action.
//
// Five layouts with obvious limitations must each produce one ADI Design
// Guidance block answering the same six questions, in order, with the RIGHT
// limiting factor:
//
//   1. Three rows in a shallow room          → listening-area depth / rear-row geometry
//   2. Seats against the rear wall           → listening area and room boundaries
//   3. One subwoofer, multiple seats         → seat-to-seat bass consistency
//   4. Four subs, poor seat placement        → seat-to-seat bass consistency (array)
//   5. Strong SPL, poor surround/upper geometry → spatial geometry (heights)
//
// Plus the two behaviours the system must never regress into:
//
//   6. NO OVERRANKING — strong SPL capability (and a weak P12) must not
//      outrank a failing P20. The weakest credible parameter leads.
//   7. NO DEAD END — an incomplete evaluation must state what is missing and
//      what to do next, never stop at "evaluation incomplete".
//
// These are pure-module tests: no React, no stores, no bass maths, no new RP22
// threshold. Every grade in the fixtures is supplied as canonical evidence —
// the engine reads grades, it never invents them.
//
// Run: node --import ./test/_alias-register.mjs test/adi-design-guidance.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAdiDesignGuidance } from "@/components/adi/designGuidance/adiDesignGuidanceEngine";
import { ADI_FACTOR_KIND } from "@/components/adi/designGuidance/adiLimitingFactorRules";

const GUIDANCE_FIELDS = [
  "whatIsWrong",
  "whyItIsHappening",
  "changeFirst",
  "expectedImprovement",
  "remainingLimitation",
  "lowerValueChanges",
];

/**
 * Build a canonical engineering-summary-shaped fixture.
 *
 * seatParams: { p5: { rows: [ [ ["L4", 45], ["L4", 46] ], ... ] }, ... }
 *             → row index (1-based) × seat, each seat [level, value]
 * roomParams: { p12: ["L4", 108], p14: ["L3", 105] } → [level, value]
 * provisionalSeatParams: same shape as seatParams but explicitly unsettled
 */
function makeSummary({ seatParams = {}, roomParams = {}, provisionalSeatParams = {} } = {}) {
  const parameterAuthority = {};
  const seatResultsByParameter = {};
  const seatParameterDistributions = {};
  const seatResultRowsByParameter = {};
  const roomResultsByParameter = {};

  const buildSeatEntry = (key, rows, { provisional = false } = {}) => {
    const seats = {};
    const results = [];
    const rowsOut = [];
    rows.forEach((rowSeats, rowIndex) => {
      const row = rowIndex + 1;
      const rowResults = [];
      rowSeats.forEach(([level, value], colIndex) => {
        const seatId = `seat-r${row}-c${colIndex + 1}`;
        seats[seatId] = provisional
          ? { state: "provisional", level: null, rawValue: value }
          : { state: "scored", level, rawValue: value };
        const result = {
          seatId,
          row,
          column: colIndex + 1,
          isPrimary: row === 1,
          priority: row === 1 ? "primary" : "secondary",
          level: provisional ? "—" : level,
          value,
          status: provisional ? "provisional" : "scored",
        };
        results.push(result);
        rowResults.push(result);
      });
      rowsOut.push({ row, seats: rowResults });
    });

    parameterAuthority[key] = {
      key,
      scope: "seat",
      state: provisional ? "provisional" : "scored",
      level: null,
      seats,
    };
    seatResultsByParameter[key] = results;
    seatResultRowsByParameter[key] = rowsOut;

    const levelCounts = { L4: 0, L3: 0, L2: 0, L1: 0, FAIL: 0, unassessed: 0 };
    if (provisional) {
      levelCounts.unassessed = results.length;
    } else {
      for (const result of results) levelCounts[result.level] += 1;
    }
    seatParameterDistributions[key] = {
      levelCounts,
      assessedCount: provisional ? 0 : results.length,
      seatCount: results.length,
      uniformLevel: null,
    };
  };

  for (const [key, rows] of Object.entries(seatParams)) buildSeatEntry(key, rows);
  for (const [key, rows] of Object.entries(provisionalSeatParams)) buildSeatEntry(key, rows, { provisional: true });

  for (const [key, [level, value]] of Object.entries(roomParams)) {
    const number = Number(key.replace("p", ""));
    parameterAuthority[key] = { key, scope: "room", state: "scored", level, rawValue: value };
    roomResultsByParameter[number] = { state: "scored", status: "scored", level, value };
  }

  // A healthy baseline so each fixture isolates its one limitation.
  return {
    parameterAuthority,
    roomResultsByParameter,
    project: {
      categories: [],
      reportCounts: {
        seatResultsByParameter,
        seatResultRowsByParameter,
        seatParameterDistributions,
      },
    },
  };
}

const healthySeatParams = (override = {}) => ({
  p1: { rows: [[["L3", 1.4], ["L3", 1.35]], [["L3", 1.3], ["L3", 1.28]]] },
  p4: { rows: [[["L2", 4.4], ["L2", 4.6]], [["L2", 4.8], ["L2", 5.0]]] },
  p5: { rows: [[["L2", 62], ["L2", 64]], [["L2", 66], ["L2", 68]]] },
  p6: { rows: [[["L2", 5.2], ["L2", 5.4]], [["L2", 5.6], ["L2", 5.8]]] },
  p9: { rows: [[["L2", 64], ["L2", 66]], [["L2", 68], ["L2", 70]]] },
  p10: { rows: [[["L2", 5.1], ["L2", 5.3]], [["L2", 5.5], ["L2", 5.7]]] },
  p16: { rows: [[["L2", 4.2], ["L2", 4.4]], [["L2", 4.6], ["L2", 4.8]]] },
  p17: { rows: [[["L2", 4.3], ["L2", 4.5]], [["L2", 4.7], ["L2", 4.9]]] },
  p19: { rows: [[["L2", 3.1], ["L2", 3.4]], [["L2", 3.6], ["L2", 3.8]]] },
  p20: { rows: [[["L2", 3.2], ["L2", 3.5]], [["L2", 3.7], ["L2", 3.9]]] },
  ...override,
});

const healthyRoomParams = (override = {}) => ({
  p2: ["L3", 13],
  p12: ["L3", 108],
  p13: ["L3", 105],
  p14: ["L2", 106],
  p18: ["L2", 28],
  ...override,
});

const assertGuidance = (guidance, expectedKind, label) => {
  assert.ok(guidance, `${label}: guidance must be produced`);
  assert.equal(guidance.kind, expectedKind, `${label}: expected factor kind ${expectedKind}`);
  for (const field of GUIDANCE_FIELDS) {
    assert.equal(typeof guidance[field], "string", `${label}: ${field} must be a string`);
    assert.ok(guidance[field].trim().length > 40, `${label}: ${field} must be substantive`);
  }
  assert.ok(guidance.headline && guidance.headline.trim().length > 0, `${label}: headline required`);
  assert.ok(guidance.evidenceLines.length > 0, `${label}: measured evidence must be shown`);
  assert.equal(guidance.severity, "HIGH", `${label}: a failing parameter is HIGH priority`);
};

// ── 1. Three rows in a shallow room ──────────────────────────────────────
test("case 1 — shallow three-row room identifies listening-area depth as the cause", () => {
  const summary = makeSummary({
    seatParams: healthySeatParams({
      // Angles close up badly from the front row to the third row.
      p5: {
        rows: [
          [["L4", 45], ["L4", 46], ["L4", 47]],
          [["L1", 85], ["L1", 87], ["L1", 89]],
          [["L1", 110], ["L1", 112], ["L1", 115]],
        ],
      },
      // Rear row SPL spread fails on top of the angle collapse.
      p4: {
        rows: [
          [["L4", 2.1], ["L4", 2.2], ["L4", 2.3]],
          [["L1", 5.8], ["L1", 5.9], ["L1", 6.0]],
          [["FAIL", 7.4], ["FAIL", 7.6], ["FAIL", 7.8]],
        ],
      },
    }),
    roomParams: healthyRoomParams(),
  });

  const guidance = buildAdiDesignGuidance(summary, {
    geometry: { roomDims: { widthM: 4.2, lengthM: 5.1, heightM: 2.4 }, rearWallDistanceM: 0.9 },
    system: { subwooferCount: 2 },
  });

  assertGuidance(guidance, ADI_FACTOR_KIND.ROW_COLLAPSE, "case 1");
  assert.match(guidance.headline, /Listening-area depth/i);
  assert.match(guidance.whatIsWrong, /row/i);
  assert.match(guidance.whyItIsHappening, /rear|back row|listening area/i);
  assert.match(guidance.changeFirst, /forward|two rows|second pair/i);
  assert.match(guidance.lowerValueChanges, /model|angle|positions/i);
});

// ── 2. Seats against the rear wall ───────────────────────────────────────
test("case 2 — seats against the rear wall identify boundary proximity", () => {
  const summary = makeSummary({
    seatParams: healthySeatParams({
      p1: {
        rows: [
          [["L3", 1.45], ["L3", 1.4], ["L3", 1.38]],
          [["FAIL", 0.42], ["FAIL", 0.45], ["FAIL", 0.48]],
        ],
      },
    }),
    roomParams: healthyRoomParams(),
  });

  const guidance = buildAdiDesignGuidance(summary, {
    geometry: { roomDims: { widthM: 4.0, lengthM: 4.6, heightM: 2.4 }, rearWallDistanceM: 0.42 },
    system: { subwooferCount: 2 },
  });

  assertGuidance(guidance, ADI_FACTOR_KIND.WEAKEST, "case 2");
  assert.equal(guidance.parameterKey, "p1");
  assert.match(guidance.whatIsWrong, /0\.42/);
  assert.match(guidance.whyItIsHappening, /boundary|wall/i);
  assert.match(guidance.changeFirst, /Move the seating|forward/i);
  assert.match(guidance.lowerValueChanges, /do not move the listener|geometry/i);
});

// ── 3. One subwoofer with multiple seats ─────────────────────────────────
test("case 3 — a single subwoofer across five seats leads with bass consistency", () => {
  const summary = makeSummary({
    seatParams: healthySeatParams({
      p20: {
        rows: [
          [["L2", 3.1], ["L1", 6.4], ["L1", 5.8]],
          [["L3", 2.4], ["L1", 5.1], ["L2", 3.6]],
        ],
      },
      p19: { rows: [[["L2", 3.2], ["L2", 3.6], ["L2", 3.9]], [["L2", 4.1], ["L2", 4.4], ["L2", 4.6]]] },
    }),
    roomParams: healthyRoomParams(),
  });

  const guidance = buildAdiDesignGuidance(summary, {
    geometry: { rearWallDistanceM: 1.1 },
    system: { subwooferCount: 1 },
  });

  assertGuidance(guidance, ADI_FACTOR_KIND.BASS_CONSISTENCY, "case 3");
  assert.match(guidance.headline, /Seat-to-seat bass consistency/i);
  assert.match(guidance.whatIsWrong, /6\.4 dB/);
  assert.match(guidance.whyItIsHappening, /single subwoofer|one listening position/i);
  assert.match(guidance.changeFirst, /second subwoofer|opposing/i);
  assert.match(guidance.lowerValueChanges, /loudspeakers|speaker/i);
  assert.match(guidance.expectedImprovement, /all seats|every seat/i);
});

// ── 4. Four subs but poor seat placement ─────────────────────────────────
test("case 4 — four subwoofers with poor placement identify the array geometry", () => {
  const summary = makeSummary({
    seatParams: healthySeatParams({
      p20: {
        rows: [
          [["L2", 3.4], ["L1", 7.2], ["L1", 6.8]],
          [["L1", 5.9], ["L1", 6.2], ["L2", 3.9]],
        ],
      },
      p19: { rows: [[["L2", 3.5], ["L1", 5.6], ["L1", 5.2]], [["L2", 4.2], ["L2", 4.6], ["L2", 4.9]]] },
    }),
    roomParams: healthyRoomParams(),
  });

  const guidance = buildAdiDesignGuidance(summary, {
    geometry: { rearWallDistanceM: 1.3 },
    system: { subwooferCount: 4, hasMultipleSubs: true },
  });

  assertGuidance(guidance, ADI_FACTOR_KIND.BASS_CONSISTENCY, "case 4");
  assert.match(guidance.whyItIsHappening, /4 subwoofers|cabinets sit/i);
  assert.match(guidance.changeFirst, /symmetric|opposing|mid-points/i);
  assert.match(guidance.remainingLimitation, /decay|boundary|reference limitation/i);
});

// ── 5. Strong SPL capability, poor surround/upper geometry ───────────────
test("case 5 — strong SPL does not hide a height-geometry limitation", () => {
  const summary = makeSummary({
    seatParams: healthySeatParams({
      // Uniform failure in every row: a placement problem, not a depth problem.
      p9: {
        rows: [
          [["FAIL", 96], ["FAIL", 94]],
          [["FAIL", 97], ["FAIL", 95]],
        ],
      },
      p5: {
        rows: [
          [["L2", 66], ["L1", 88]],
          [["L2", 68], ["L1", 90]],
        ],
      },
    }),
    roomParams: healthyRoomParams({ p12: ["L4", 112], p13: ["L4", 109], p14: ["L3", 108] }),
  });

  const guidance = buildAdiDesignGuidance(summary, {
    geometry: { rearWallDistanceM: 1.2 },
    system: { subwooferCount: 2 },
  });

  assertGuidance(guidance, ADI_FACTOR_KIND.WEAKEST, "case 5");
  assert.equal(guidance.parameterKey, "p9");
  assert.match(guidance.headline, /geometry/i);
  assert.match(guidance.changeFirst, /gap|re-position|second pair|add a speaker/i);
  assert.match(guidance.lowerValueChanges, /angle/i);
  assert.ok(!/capability/i.test(guidance.headline), "case 5: SPL capability must not lead");
});

// ── 6. No generic recommendation outranks the weakest credible parameter ─
test("case 6 — a weaker P12 cannot outrank a failing P20 (no overranking)", () => {
  const summary = makeSummary({
    seatParams: healthySeatParams({
      p20: { rows: [[["L1", 6.1], ["L1", 5.7]], [["L1", 5.5], ["L1", 5.9]]] },
      p19: { rows: [[["L1", 5.2], ["L1", 5.4]], [["L2", 4.8], ["L2", 4.9]]] },
    }),
    // Screen capability is genuinely weak too — it must still come second.
    roomParams: healthyRoomParams({ p12: ["L1", 101], p13: ["L2", 104] }),
  });

  const guidance = buildAdiDesignGuidance(summary, { system: { subwooferCount: 2 } });

  assertGuidance(guidance, ADI_FACTOR_KIND.BASS_CONSISTENCY, "case 6");
  const ranked = guidance.rankedResults.map((entry) => entry.key);
  assert.equal(ranked[0], "p20", "case 6: P20 must be ranked first");
  assert.ok(ranked.includes("p12"), "case 6: the weak P12 must still be visible in the ranked order");
  assert.ok(
    ranked.indexOf("p20") < ranked.indexOf("p12"),
    "case 6: bass consistency must outrank screen output capability",
  );
  assert.match(guidance.lowerValueChanges, /speaker|power|aiming/i);
});

// ── 7. Incomplete evaluation is never a dead end ─────────────────────────
test("case 7 — an incomplete evaluation states what is missing and what to do next", () => {
  const summary = makeSummary({
    seatParams: healthySeatParams({}),
    // Bass results have not published: no settled level for P19/P20.
    provisionalSeatParams: {
      p19: { rows: [[], []] },
      p20: { rows: [[], []] },
    },
    roomParams: { p2: ["L3", 13], p12: ["L2", 106], p13: ["L2", 104] },
  });
  // Provisional bass still carries measured deviation values (unsettled raw data).
  for (const key of ["p19", "p20"]) {
    const rows = [
      [["L2", 3.0], ["L2", 3.2]],
      [["L2", 3.4], ["L2", 4.1]],
    ];
    let row = 0;
    for (const rowSeats of rows) {
      row += 1;
      rowSeats.forEach(([, value], index) => {
        const seatId = `seat-r${row}-c${index + 1}`;
        summary.parameterAuthority[key].seats[seatId] = { state: "provisional", level: null, rawValue: value };
        summary.project.reportCounts.seatResultsByParameter[key].push({
          seatId,
          row,
          column: index + 1,
          isPrimary: row === 1,
          level: "—",
          value,
          status: "provisional",
        });
      });
    }
  }

  const guidance = buildAdiDesignGuidance(summary, { system: { subwooferCount: 2 } });

  assert.ok(guidance, "case 7: guidance must still be produced");
  assert.equal(guidance.kind, ADI_FACTOR_KIND.INCOMPLETE);
  assert.equal(guidance.incomplete, true);
  assert.match(guidance.headline, /incomplete/i);
  assert.ok(guidance.missingParameters.includes("p19"), "case 7: missing P19 must be listed");
  assert.ok(guidance.missingParameters.includes("p20"), "case 7: missing P20 must be listed");
  assert.match(guidance.changeFirst, /bass|Room Designer|publish/i);
  for (const field of GUIDANCE_FIELDS) {
    assert.ok(guidance[field] && guidance[field].trim().length > 40, `case 7: ${field} must still guide`);
  }
});