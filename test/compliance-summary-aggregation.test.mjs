// Regression tests for the single published engineering summary.
//
// Run: node --import ./test/_alias-register.mjs test/compliance-summary-aggregation.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { buildArtcousticDesignRatingAuthority } from "@/components/report/technical/artcousticSystemDesignRating";
import { summariseEngineeringResults } from "@/components/engineering/engineeringSummaryAuthority";

const seats = [{ id: "seat-1", isPrimary: true, priority: "primary", row: 1, indexInRow: 1 }];

function makeSummary(p19Level = "FAIL") {
  const p19Raw = p19Level === "FAIL" ? 7 : 2;
  const authority = buildArtcousticDesignRatingAuthority({
    seats,
    p19: {
      "seat-1": {
        rawValue: p19Raw,
        verified: true,
        authoritativeLevel: p19Level,
      },
    },
    p20: {
      "seat-1": {
        rawValue: 12,
        verified: true,
      },
    },
  });

  return summariseEngineeringResults({
    designRatingAuthority: authority,
    seats,
    roomResultsByParameter: {},
    seatHudById: {
      "seat-1": {
        rp22: {
          p19: { value: p19Raw, formatted: `±${p19Raw} dB`, level: p19Level, status: "ok" },
          p20: { value: 12, formatted: "±12 dB", level: "L1", status: "ok" },
        },
      },
    },
    p19SeatAuthority: {
      bySeatId: {
        "seat-1": { calculated: true, rawValue: p19Raw, displayedValue: `±${p19Raw} dB`, grade: p19Level },
      },
    },
  });
}

test("P20 has no FAIL: every finite result is at least L1", () => {
  const summary = makeSummary();
  assert.equal(summary.parameterAuthority.p20.seats["seat-1"].level, "L1");
  assert.equal(summary.designRating.seatLevels.p20["seat-1"], "L1");
  assert.equal(summary.project.reportCounts.seatResultsByParameter.p20[0].level, "L1");
});

test("P19 FAIL is published identically to every consumer view", () => {
  const summary = makeSummary("FAIL");
  assert.equal(summary.parameterAuthority.p19.seats["seat-1"].level, "FAIL");
  assert.equal(summary.designRating.seatLevels.p19["seat-1"], "FAIL");
  assert.equal(summary.project.reportCounts.seatResultsByParameter.p19[0].level, "FAIL");
  assert.equal(summary.seatHudById["seat-1"].rp22.p19.level, "FAIL");
  assert.equal(summary.project.compliance.byParameter.p19.level, "FAIL");
  assert.equal(summary.project.compliance.counts.fail, 1);
});

test("one authoritative seat-result change fans out through the one summary", () => {
  const before = makeSummary("FAIL");
  const after = makeSummary("L4");

  assert.equal(before.project.compliance.byParameter.p19.level, "FAIL");
  assert.equal(after.project.compliance.byParameter.p19.level, "L4");
  assert.equal(after.designRating.seatLevels.p19["seat-1"], "L4");
  assert.equal(after.project.reportCounts.seatResultsByParameter.p19[0].level, "L4");
  assert.equal(after.seatHudById["seat-1"].rp22.p19.level, "L4");
  assert.equal(after.project.compliance.counts.fail, 0);
});

test("canonical room result overwrites a stale legacy project-scoped grade", () => {
  const base = buildArtcousticDesignRatingAuthority({ seats });
  const authority = {
    ...base,
    parameters: {
      ...base.parameters,
      p12: {
        key: "p12",
        scope: "project",
        state: "scored",
        level: "L3",
        rawValue: 106,
      },
    },
  };
  const summary = summariseEngineeringResults({
    designRatingAuthority: authority,
    seats,
    roomResultsByParameter: {
      12: { level: "L2", value: 106, formatted: "106 dBC" },
    },
  });

  assert.equal(summary.parameterSummaries.project.p12.level, "L3");
  assert.equal(summary.roomResultsByParameter[12].level, "L3");
  assert.equal(summary.roomResultsByParameter[12].value, 106);
});

test("published summary is isolated from later engine-object mutation", () => {
  const summary = makeSummary("L4");
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(Object.isFrozen(summary.project), true);
  assert.equal(Object.isFrozen(summary.seatHudById["seat-1"].rp22.p19), true);
});
