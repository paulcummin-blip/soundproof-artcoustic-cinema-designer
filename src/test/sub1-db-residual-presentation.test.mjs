// Sub-1 dB residual presentation and persisted correction trace.
//
// Covers the product rule (a residual under 1 dB is not meaningful and is never
// shown as a decimal deviation), the whole-number user-facing dB formatting, the
// three distinguished adjustments, the trace flags/limits, and safe handling of
// results that predate the trace.
//
// Presentation-only: no bass maths, EQ, smoothing, alignment, grading or target
// curve is exercised or asserted here.

import { describe, expect, it } from "vitest";
import {
  MEANINGFUL_RESIDUAL_DB,
  buildExpertTraceRows,
  formatExactSignedDb,
  formatResidualStatement,
  formatWholeDb,
  formatWholeSpl,
} from "@/components/room/bass/bassResidualPresentation";
import {
  CORRECTION_TRACE_UNAVAILABLE_COPY,
  OFFICIAL_P19_SMOOTHING_BASIS,
  buildCorrectionTrace,
  cloneCorrectionTrace,
  isCorrectionTraceUnavailable,
  readCorrectionTraceAtFrequency,
} from "@/components/room/bass/correctionTraceAuthority";
import { MAX_BOOST_DB, MAX_CUT_DB } from "@/components/utils/realisticPostCalibrationPrediction";

const curve = (pairs) => pairs.map(([frequency, spl]) => ({ frequency, spl }));

// Marquee-like 23.8 Hz case: target 109.9, final post-EQ 109.1 (residual -0.8).
// The grid is dense (as the real calculation grid is) so a hover anywhere in
// the band finds its own trace record.
const GRID = [20, 22, 23.8, 25, 27, 30, 32, 35, 38, 40, 45, 50, 60, 70, 80];
const onGrid = (byFrequency) =>
  GRID.map((frequency) => ({ frequency, spl: byFrequency[frequency] }));

const POST_EQ = onGrid({ 20: 108.4, 22: 108.8, 23.8: 109.1, 25: 109.2, 27: 109.3, 30: 109.4, 32: 109.6, 35: 109.3, 38: 109.6, 40: 110.2, 45: 110.8, 50: 111.2, 60: 111.6, 70: 111.9, 80: 112.0 });
const RAW = onGrid({ 20: 109.0, 22: 109.5, 23.8: 109.9, 25: 110.0, 27: 110.2, 30: 110.4, 32: 110.8, 35: 110.4, 38: 110.9, 40: 111.8, 45: 112.6, 50: 113.1, 60: 113.4, 70: 113.5, 80: 113.6 });
const TARGET = onGrid({ 20: 109.5, 22: 109.7, 23.8: 109.9, 25: 109.9, 27: 110.0, 30: 110.1, 32: 110.2, 35: 110.3, 38: 110.3, 40: 110.4, 45: 110.6, 50: 110.7, 60: 110.8, 70: 110.9, 80: 110.9 });
const CORRECTION = onGrid({ 20: 0.5, 22: 0.2, 23.8: 0, 25: 0, 27: -0.1, 30: -0.3, 32: -0.6, 35: 0, 38: -0.5, 40: -1.4, 45: -1.9, 50: -2.3, 60: -2.6, 70: -2.7, 80: -2.7 });

const marqueeTrace = buildCorrectionTrace({
  postEqRspCurve: POST_EQ,
  rawRspCurve: RAW,
  targetCurve: TARGET,
  correctionCurve: CORRECTION,
  capabilityLimitedRegions: [],
  protectedNullRegions: [{ startHz: 32, endHz: 38, centreFrequencyHz: 35 }],
  initialOperatingAdjustmentDb: 0.1,
  finalGlobalAlignmentTrimDb: -27.2,
});

describe("sub-1 dB residual is not presented as a fault", () => {
  it("states a sub-1 dB residual as no meaningful deviation", () => {
    expect(formatResidualStatement(-0.8)).toBe("No meaningful deviation");
    expect(formatResidualStatement(0.6)).toBe("No meaningful deviation");
    expect(formatResidualStatement(-0.99)).toBe("No meaningful deviation");
    expect(formatResidualStatement(0.99)).toBe("No meaningful deviation");
    expect(formatResidualStatement(0)).toBe("No meaningful deviation");
  });

  it("uses whole-number dB at and above 1 dB", () => {
    expect(formatResidualStatement(-1)).toBe("Below target 1 dB");
    expect(formatResidualStatement(-2.4)).toBe("Below target 2 dB");
    expect(formatResidualStatement(1.2)).toBe("Above target 1 dB");
    expect(formatResidualStatement(3.6)).toBe("Above target 4 dB");
  });

  it("never emits a decimal dB in the residual statement", () => {
    const cases = [-6.24, -1.04, 0.42, 1.96, 4.5, -0.8];
    for (const value of cases) {
      const statement = formatResidualStatement(value);
      expect(statement).not.toMatch(/\d\.\d/);
      expect(statement).not.toContain("dB.");
    }
    expect(formatResidualStatement(-0.8)).not.toContain("-0.8");
  });

  it("states the thresholds the rule is built on", () => {
    expect(MEANINGFUL_RESIDUAL_DB).toBe(1);
  });

  it("keeps user-facing dB whole-number and exact values to Expert detail", () => {
    expect(formatWholeSpl(109.1)).toBe("109 dBC");
    expect(formatWholeSpl(109.9)).toBe("110 dBC");
    expect(formatWholeDb(-27.0)).toBe("-27 dB");
    expect(formatWholeDb(0.1)).toBe("0 dB");
    expect(formatWholeDb(-15)).toBe("-15 dB");
    expect(formatExactSignedDb(-27.2)).toBe("-27.2 dB");
    expect(formatExactSignedDb(0.1)).toBe("+0.1 dB");
  });
});

describe("persisted correction trace", () => {
  it("explains the Marquee shortfall from existing curves only", () => {
    expect(marqueeTrace).not.toBeNull();
    const record = readCorrectionTraceAtFrequency(marqueeTrace, 23.8);
    expect(record).not.toBeNull();
    expect(record.frequency).toBe(23.8);
    expect(record.finalPostEqDb).toBe(109.1);
    expect(record.targetDb).toBe(109.9);
    expect(record.residualDb).toBeCloseTo(-0.8, 5);
    expect(record.requestedCorrectionDb).toBeCloseTo(0, 5);
    expect(record.correctionAfterSmoothingDb).toBe(0);
    expect(record.appliedCorrectionDb).toBeCloseTo(-0.8, 5);
  });

  it("carries the three distinguished adjustments and the envelope limits", () => {
    expect(marqueeTrace.initialOperatingAdjustmentDb).toBe(0.1);
    expect(marqueeTrace.finalGlobalAlignmentTrimDb).toBe(-27.2);
    expect(marqueeTrace.finalEffectiveAdjustmentDb).toBeCloseTo(-27.1, 5);
    expect(marqueeTrace.boostLimitDb).toBe(MAX_BOOST_DB);
    expect(marqueeTrace.cutLimitDb).toBe(-Math.abs(MAX_CUT_DB));
    expect(marqueeTrace.officialP19SmoothingBasis).toBe(OFFICIAL_P19_SMOOTHING_BASIS);
  });

  it("flags protected nulls and capability limits from the calc region authority", () => {
    const protectedRecord = readCorrectionTraceAtFrequency(marqueeTrace, 35);
    expect(protectedRecord.protectedNull).toBe(true);
    const outside = readCorrectionTraceAtFrequency(marqueeTrace, 22);
    expect(outside.protectedNull).toBe(false);

    const limited = buildCorrectionTrace({
      postEqRspCurve: POST_EQ,
      rawRspCurve: RAW,
      targetCurve: TARGET,
      correctionCurve: CORRECTION,
      capabilityLimitedRegions: [{ startHz: 22, endHz: 26, worstFrequencyHz: 23.8, shortfallDb: 1.2 }],
      protectedNullRegions: [],
      initialOperatingAdjustmentDb: 0,
      finalGlobalAlignmentTrimDb: 0,
    });
    expect(readCorrectionTraceAtFrequency(limited, 23.8).capabilityLimited).toBe(true);
    expect(readCorrectionTraceAtFrequency(limited, 40).capabilityLimited).toBe(false);
  });

  it("bounds the trace and never extrapolates outside the final curve domain", () => {
    const long = Array.from({ length: 600 }, (_, index) => [15 + index * 0.5, 109 + Math.sin(index / 9)]);
    const trace = buildCorrectionTrace({
      postEqRspCurve: curve(long),
      rawRspCurve: curve(long),
      targetCurve: curve(long),
      correctionCurve: curve(long),
    });
    expect(trace.records.length).toBeLessThanOrEqual(120);
    expect(trace.bandStartHz).toBe(15);
    expect(trace.records.every((record) => record.frequency >= 15)).toBe(true);
    expect(readCorrectionTraceAtFrequency(trace, 500)).toBeNull();
  });

  it("leaves unavailable values null rather than inventing them", () => {
    const bare = buildCorrectionTrace({ postEqRspCurve: POST_EQ });
    expect(bare.records.length).toBeGreaterThan(0);
    expect(bare.records.every((record) => record.rawRspDb === null)).toBe(true);
    expect(bare.records.every((record) => record.targetDb === null)).toBe(true);
    expect(bare.records.every((record) => record.requestedCorrectionDb === null)).toBe(true);
    expect(bare.records.every((record) => record.appliedCorrectionDb === null)).toBe(true);
    expect(bare.records.every((record) => record.residualDb === null)).toBe(true);
    expect(bare.initialOperatingAdjustmentDb).toBeNull();
    expect(bare.finalGlobalAlignmentTrimDb).toBeNull();
    expect(bare.finalEffectiveAdjustmentDb).toBeNull();
    // Levels that ARE present are still reported.
    expect(bare.records[0].finalPostEqDb).toBe(108.4);
  });
});

describe("results that predate the trace are handled safely", () => {
  it("reports unavailability without throwing", () => {
    expect(buildCorrectionTrace()).toBeNull();
    expect(buildCorrectionTrace({ postEqRspCurve: [] })).toBeNull();
    expect(readCorrectionTraceAtFrequency(null, 23.8)).toBeNull();
    expect(readCorrectionTraceAtFrequency({}, 23.8)).toBeNull();
    expect(isCorrectionTraceUnavailable(null)).toBe(true);
    expect(isCorrectionTraceUnavailable({ records: [] })).toBe(true);
    expect(isCorrectionTraceUnavailable(marqueeTrace)).toBe(false);
    expect(cloneCorrectionTrace(null)).toBeNull();
    expect(CORRECTION_TRACE_UNAVAILABLE_COPY).toBe("Detailed correction trace is available after recalculation.");
  });

  it("keeps the clone independent of live state", () => {
    const clone = cloneCorrectionTrace(marqueeTrace);
    clone.records[0].finalPostEqDb = -999;
    expect(marqueeTrace.records[0].finalPostEqDb).toBe(108.4);
  });

  it("shows no trace values when the trace is missing", () => {
    const rows = buildExpertTraceRows({ trace: null, record: null });
    const labels = rows.map(([label]) => label);
    expect(labels).not.toContain("Raw RSP");
    expect(labels).not.toContain("Operating adjustment (initial)");
    expect(labels).not.toContain("Global alignment trim (final)");
    expect(labels).not.toContain("Boost limit");
  });
});

describe("expert rows label every adjustment and flag", () => {
  const record = readCorrectionTraceAtFrequency(marqueeTrace, 23.8);
  const rows = buildExpertTraceRows({
    trace: marqueeTrace,
    record,
    displaySmoothingLabel: "None",
    officialBasisLabel: "1/3 octave",
  });
  const byLabel = Object.fromEntries(rows);

  it("distinguishes initial, final trim and final effective adjustment", () => {
    expect(byLabel["Operating adjustment (initial)"]).toBe("+0.1 dB");
    expect(byLabel["Global alignment trim (final)"]).toBe("-27.2 dB");
    expect(byLabel["Final effective adjustment"]).toBe("-27.1 dB");
  });

  it("labels smoothing, capability, protected-null and the smoothing bases", () => {
    expect(byLabel["Correction smoothing"]).toBe("Applied to the correction envelope");
    expect(byLabel["Capability limited"]).toBe("No");
    expect(byLabel["Protected null"]).toBe("No");
    expect(byLabel["Graph smoothing"]).toBe("None");
    expect(byLabel["Official P19 basis"]).toBe("1/3 octave");
  });

  it("carries the per-frequency trace and the envelope limits", () => {
    expect(byLabel["Raw RSP"]).toBe("109.9 dBC");
    expect(byLabel["Target"]).toBe("109.9 dBC");
    expect(byLabel["After smoothing"]).toBe("0.0 dB");
    expect(byLabel["Final post-EQ"]).toBe("109.1 dBC");
    expect(byLabel["Residual"]).toBe("-0.8 dB");
    expect(byLabel["Boost limit"]).toBe("+6.0 dB");
    expect(byLabel["Cut limit"]).toBe("-15.0 dB");
  });
});